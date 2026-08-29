/**
 * queue.test.ts
 *
 * WHAT: Tests admission and scheduling under the burst this app was built for:
 *       one cohort told "now run the Founder Brain" in the same minute.
 *
 * WHY IT EXISTS: The priority rule is the one that decides whether a live
 *       session goes well or badly. If a stampede of new starts can get in
 *       front of somebody who is 20 minutes into an interview, 30 people are
 *       stranded in front of a room. This proves it cannot.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/queue.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, type BudgetConfig } from './budget.js';
import { ordinal, TurnQueue, type QueueConfig, type QueueItem } from './queue.js';
import type { SpendLedger } from './ports.js';
import { collectingLogger, fakeClock } from './test-fixtures.js';

const BUDGET: BudgetConfig = { turnCapUsd: 0.5, founderCapUsd: 10, cohortDailyCapUsd: 400 };
const OPEN_LEDGER: SpendLedger = {
  spendToDate: async () => 0,
  cohortSpendToday: async () => 0,
  add: async () => {},
};

function make(cfg: Partial<QueueConfig> = {}, ledger: SpendLedger = OPEN_LEDGER) {
  const clock = fakeClock();
  const log = collectingLogger();
  const queue = new TurnQueue(
    { maxConcurrentRuns: 2, turnsPerHour: 30, turnsPerDay: 200, longQueueThreshold: 8, ...cfg },
    new Budget(BUDGET, ledger, log),
    clock,
    log,
  );
  return { queue, clock, log };
}

/** A turn that finishes when you tell it to. */
function deferred(turnId: string, founderId: string, priority: 'high' | 'normal' = 'normal') {
  let release!: () => void;
  const finished = new Promise<void>((r) => {
    release = r;
  });
  const notices: number[] = [];
  let started = false;
  const item: QueueItem = {
    turnId,
    founderId,
    threadId: `th-${turnId}`,
    priority,
    run: async () => {
      started = true;
      await finished;
    },
    onQueued: (n) => notices.push(n.position),
  };
  return {
    item,
    release,
    notices,
    get started() {
      return started;
    },
  };
}

test('a free slot runs immediately and nobody is told they are waiting', () => {
  const { queue } = make();
  const a = deferred('t1', 'f1');
  queue.enqueue(a.item);
  assert.equal(a.started, true);
  assert.deepEqual(a.notices, []);
});

test('past the concurrency ceiling a founder gets a number straight away', () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  const a = deferred('t1', 'f1');
  const b = deferred('t2', 'f2');
  queue.enqueue(a.item);
  queue.enqueue(b.item);
  assert.equal(b.started, false);
  assert.deepEqual(b.notices, [1]);
});

test('someone mid interview beats a stampede of new starts', () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  const running = deferred('t0', 'f0');
  queue.enqueue(running.item);
  const newStart = deferred('t1', 'f1', 'normal');
  const midInterview = deferred('t2', 'f2', 'high');
  queue.enqueue(newStart.item);
  queue.enqueue(midInterview.item);
  // The high priority turn is now first in line even though it arrived second.
  assert.equal(midInterview.notices.at(-1), 1);
  assert.equal(newStart.notices.at(-1), 2);
});

test('high priority is still first come first served among itself', () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  queue.enqueue(deferred('t0', 'f0').item);
  const first = deferred('t1', 'f1', 'high');
  const second = deferred('t2', 'f2', 'high');
  queue.enqueue(first.item);
  queue.enqueue(second.item);
  assert.equal(first.notices.at(-1), 1);
  assert.equal(second.notices.at(-1), 2);
});

test('one founder runs one turn at a time, and does not block the queue', async () => {
  const { queue } = make({ maxConcurrentRuns: 4 });
  const first = deferred('t1', 'busy');
  const second = deferred('t2', 'busy');
  const other = deferred('t3', 'someone-else');
  queue.enqueue(first.item);
  queue.enqueue(second.item);
  queue.enqueue(other.item);

  assert.equal(first.started, true);
  assert.equal(second.started, false, 'a founder ran two turns at once');
  assert.equal(other.started, true, 'a busy founder blocked everybody behind them');

  first.release();
  await new Promise((r) => setImmediate(r));
  assert.equal(second.started, true);
});

test('a finished turn frees its slot for whoever is next', async () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  const a = deferred('t1', 'f1');
  const b = deferred('t2', 'f2');
  queue.enqueue(a.item);
  queue.enqueue(b.item);
  a.release();
  await new Promise((r) => setImmediate(r));
  assert.equal(b.started, true);
});

test('positions are re emitted as the line moves', async () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  const running = deferred('t0', 'f0');
  const a = deferred('t1', 'f1');
  const b = deferred('t2', 'f2');
  queue.enqueue(running.item);
  queue.enqueue(a.item);
  queue.enqueue(b.item);
  assert.deepEqual(b.notices, [2]);
  running.release();
  await new Promise((r) => setImmediate(r));
  assert.equal(b.notices.at(-1), 1);
});

test('the waiting message names a place and promises no time we cannot meet', () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  queue.enqueue(deferred('t0', 'f0').item);
  const waiting: string[] = [];
  queue.enqueue({
    ...deferred('t1', 'f1').item,
    onQueued: (n) => waiting.push(n.text),
  });
  const text = waiting.at(-1) ?? '';
  assert.ok(text.includes('1st in line'));
  assert.ok(text.includes('Your place is held'));
  assert.ok(!text.includes('minute'), 'quoted a time with no measurements behind it');
  assert.ok(!/[–—]/.test(text));
});

test('a long queue tells them to go and do something else', () => {
  const { queue } = make({ maxConcurrentRuns: 1, longQueueThreshold: 2 });
  queue.enqueue(deferred('t0', 'f0').item);
  const seen: string[] = [];
  queue.enqueue(deferred('t1', 'f1').item);
  queue.enqueue({ ...deferred('t2', 'f2').item, onQueued: (n) => seen.push(n.text) });
  assert.ok((seen.at(-1) ?? '').includes('do something else'));
});

test('a cancelled turn leaves the line and everybody behind moves up', () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  queue.enqueue(deferred('t0', 'f0').item);
  const a = deferred('t1', 'f1');
  const b = deferred('t2', 'f2');
  queue.enqueue(a.item);
  queue.enqueue(b.item);
  assert.equal(queue.cancel('t1'), true);
  assert.equal(b.notices.at(-1), 1);
  assert.equal(queue.cancel('nope'), false);
});

test('the token bucket catches a looping client by the hour', async () => {
  const { queue } = make({ turnsPerHour: 3 });
  for (let i = 0; i < 3; i += 1) assert.equal((await queue.admit('f1')).ok, true);
  const refused = await queue.admit('f1');
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.code, 'rate_hour');
    assert.ok(refused.reason.includes('few minutes'));
  }
});

test('the hourly bucket refills as the hour passes', async () => {
  const { queue, clock } = make({ turnsPerHour: 2 });
  await queue.admit('f1');
  await queue.admit('f1');
  assert.equal((await queue.admit('f1')).ok, false);
  clock.advance(3_600_001);
  assert.equal((await queue.admit('f1')).ok, true);
});

test('one founder hitting a limit does not affect another', async () => {
  const { queue } = make({ turnsPerHour: 1 });
  await queue.admit('f1');
  assert.equal((await queue.admit('f1')).ok, false);
  assert.equal((await queue.admit('f2')).ok, true);
});

test('the spend gate refuses before the bucket is even touched', async () => {
  const { queue } = make(
    {},
    { spendToDate: async () => 999, cohortSpendToday: async () => 0, add: async () => {} },
  );
  const refused = await queue.admit('f1');
  assert.equal(refused.ok === false && refused.code, 'founder_cap');
});

test('a restart puts queued work back in line rather than losing it', () => {
  const { queue, log } = make({ maxConcurrentRuns: 1 });
  const a = deferred('t1', 'f1');
  const b = deferred('t2', 'f2');
  queue.restore([a.item, b.item]);
  assert.equal(a.started, true);
  assert.equal(b.started, false);
  assert.ok(log.lines.some((l) => l.msg.includes('queue restored')));
});

test('a turn that throws does not wedge the queue', async () => {
  const { queue, log } = make({ maxConcurrentRuns: 1 });
  queue.enqueue({
    turnId: 'bad',
    founderId: 'f1',
    threadId: 'th',
    priority: 'normal',
    run: async () => {
      throw new Error('runner exploded');
    },
    onQueued: () => {},
  });
  const next = deferred('t2', 'f2');
  queue.enqueue(next.item);
  await new Promise((r) => setImmediate(r));
  assert.equal(next.started, true);
  assert.ok(log.lines.some((l) => l.level === 'error'));
});

test('stats say what the ops screen needs', () => {
  const { queue } = make({ maxConcurrentRuns: 1 });
  queue.enqueue(deferred('t1', 'f1').item);
  queue.enqueue(deferred('t2', 'f2').item);
  assert.deepEqual(queue.stats(), { running: 1, waiting: 1 });
});

test('ordinals read like English', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 7, 11, 12, 13, 21, 22, 23, 101].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '7th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st'],
  );
});
