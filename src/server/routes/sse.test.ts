/**
 * src/server/routes/sse.test.ts
 *
 * WHAT THIS IS. The stream's own state machine, driven against an array
 * instead of a socket.
 *
 * WHY IT EXISTS. The route test proves a founder gets frames. This proves the
 * three things underneath it that only go wrong on a bad network, which is
 * exactly when nobody can reproduce them: the gap between replaying and going
 * live, a frame arriving twice, and a payload with a newline in it ending the
 * frame early.
 *
 * WHAT IT CALLS. ./sse.ts against ./test-fixtures.ts.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TurnEventBus } from './events.ts';
import { SseStream, comment, formatFrame, parseLastEventId, SSE_HEADERS } from './sse.ts';
import { MemoryAppStore, TestClock } from './test-fixtures.ts';
import type { TurnEventRow } from './ports.ts';

const FOUNDER = '01J0AAAAAAAAAAAAAAAAAAAAAA';
const THREAD = 'th_1';

function row(id: number, data: Record<string, unknown>): TurnEventRow {
  return { id, turnId: 'tn_1', threadId: THREAD, founderId: FOUNDER, kind: 'delta', data, at: new Date() };
}

function sink(): { chunks: string[]; write(c: string): void; end(): void; ended: boolean; text(): string } {
  const state = {
    chunks: [] as string[],
    ended: false,
    write(c: string) {
      state.chunks.push(c);
    },
    end() {
      state.ended = true;
    },
    text: () => state.chunks.join(''),
  };
  return state;
}

test('A FRAME CARRIES AN ID, AN EVENT AND ONE LINE OF JSON', () => {
  const text = formatFrame(row(42, { text: 'Right. So you sell to construction firms' }));
  assert.equal(
    text,
    'id: 42\nevent: delta\ndata: {"text":"Right. So you sell to construction firms"}\n\n',
  );
});

test('A NEWLINE IN A FOUNDER\'S TEXT DOES NOT END THE FRAME EARLY', () => {
  // `data:` is line oriented. One raw newline inside a payload ends the frame
  // and the rest is read as a new field, which is a founder watching half a
  // sentence arrive. JSON encoding has no raw newline in it, and that is the
  // whole defence.
  const text = formatFrame(row(1, { text: 'line one\nline two\n\nline four' }));
  const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
  assert.equal(dataLines.length, 1, text);
  assert.match(text, /\\n/);
});

test('A HEARTBEAT IS A COMMENT, WHICH EVERY EVENTSOURCE IGNORES', () => {
  assert.equal(comment('heartbeat'), ': heartbeat\n\n');
});

test('THE PROXY HEADERS ARE ALL FOUR, INCLUDING THE ONE THAT IS EASY TO FORGET', () => {
  assert.equal(SSE_HEADERS['content-type'], 'text/event-stream; charset=utf-8');
  assert.equal(SSE_HEADERS['cache-control'], 'no-cache, no-transform');
  assert.equal(SSE_HEADERS.connection, 'keep-alive');
  // A buffering proxy holds every frame until the response completes, so a live
  // stream arrives all at once at the end and looks like a slow server.
  assert.equal(SSE_HEADERS['x-accel-buffering'], 'no');
});

test('Last-Event-ID IS READ FROM THE HEADER OR THE QUERY, AND RUBBISH READS AS ABSENT', () => {
  assert.equal(parseLastEventId('42', undefined), 42);
  assert.equal(parseLastEventId(undefined, '42'), 42);
  assert.equal(parseLastEventId(' 7 ', undefined), 7);
  assert.equal(parseLastEventId('abc', '9'), 9, 'a bad header falls through to the query');
  for (const bad of ['', 'abc', '-1', '1.5', '1e5', String(Number.MAX_SAFE_INTEGER) + '0']) {
    assert.equal(parseLastEventId(bad, undefined), 0, bad);
  }
});

test('A FRAME THAT ARRIVES WHILE THE REPLAY IS RUNNING IS NOT LOST, AND NOT SENT TWICE', async () => {
  const store = new MemoryAppStore();
  const bus = new TurnEventBus();
  const clock = new TestClock();
  const out = sink();

  for (const text of ['one', 'two', 'three']) {
    await store.appendTurnEvent({
      turnId: 'tn_1',
      threadId: THREAD,
      founderId: FOUNDER,
      kind: 'delta',
      data: { text },
      at: clock.now(),
    });
  }

  // The gap this exists for: a frame published between subscribing and
  // finishing the replay. Publishing frame 3 again mid replay is the closest a
  // deterministic test gets to that race.
  const stream = new SseStream(out, store, bus, clock, {
    founderId: FOUNDER,
    threadId: THREAD,
    lastEventId: 1,
    heartbeatMs: 15_000,
  });
  const opening = stream.open();
  bus.publish(row(3, { text: 'three' }));
  bus.publish(row(4, { text: 'four' }));
  await opening;

  const text = out.text();
  assert.doesNotMatch(text, /"one"/, 'frame 1 was already read');
  assert.equal((text.match(/"two"/g) ?? []).length, 1);
  assert.equal((text.match(/"three"/g) ?? []).length, 1, 'replayed and buffered, sent once');
  assert.equal((text.match(/"four"/g) ?? []).length, 1, 'and the one that arrived during the replay is not lost');
  assert.equal(stream.position, 4);
  stream.close();
});

test('A REPLAY THAT FAILS DOES NOT TAKE THE LIVE STREAM WITH IT', async () => {
  const store = new MemoryAppStore();
  const bus = new TurnEventBus();
  const clock = new TestClock();
  const out = sink();
  store.eventsSince = () => Promise.reject(new Error('the database is having a moment'));

  const stream = new SseStream(out, store, bus, clock, {
    founderId: FOUNDER,
    threadId: THREAD,
    lastEventId: 0,
    heartbeatMs: 15_000,
  });
  await stream.open();
  bus.publish(row(1, { text: 'still live' }));

  // The founder loses the frames they missed, not the answer being written now.
  assert.match(out.text(), /replay unavailable/);
  assert.match(out.text(), /still live/);
  stream.close();
});

test('CLOSING RELEASES THE SUBSCRIPTION AND THE HEARTBEAT, AND IS SAFE TWICE', async () => {
  const store = new MemoryAppStore();
  const bus = new TurnEventBus();
  const clock = new TestClock();
  const out = sink();

  const stream = new SseStream(out, store, bus, clock, {
    founderId: FOUNDER,
    threadId: THREAD,
    lastEventId: 0,
    heartbeatMs: 15_000,
  });
  await stream.open();
  assert.equal(bus.listenerCount(THREAD), 1);

  clock.tick();
  assert.match(out.text(), /: heartbeat/);

  stream.close();
  stream.close();
  assert.equal(bus.listenerCount(THREAD), 0, '130 founders reloading must not leave 130 subscriptions behind');
  assert.equal(out.ended, true);

  const before = out.text();
  clock.tick();
  bus.publish(row(9, { text: 'too late' }));
  assert.equal(out.text(), before, 'a closed stream writes nothing, including from a timer');
});
