/**
 * pushable.test.ts
 *
 * WHAT: Tests the async iterable that carries founder messages into a live run.
 * WHY IT EXISTS: This is where a founder's sentence would be dropped if the
 *       buffer were wrong, and a dropped sentence mid interview looks to the
 *       founder like the app ignored them.
 * RUN:  node_modules/.bin/tsx --test src/server/agent/pushable.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pushable } from './pushable.js';

test('buffers values pushed before anything is reading', async () => {
  const p = new Pushable<number>();
  p.push(1);
  p.push(2);
  p.end();
  const seen: number[] = [];
  for await (const v of p) seen.push(v);
  assert.deepEqual(seen, [1, 2]);
});

test('delivers a value pushed while the consumer is waiting', async () => {
  const p = new Pushable<string>();
  const it = p[Symbol.asyncIterator]();
  const pending = it.next();
  p.push('hello');
  assert.deepEqual(await pending, { value: 'hello', done: false });
});

test('end while waiting closes the iterator rather than hanging', async () => {
  const p = new Pushable<string>();
  const it = p[Symbol.asyncIterator]();
  const pending = it.next();
  p.end();
  assert.deepEqual(await pending, { value: undefined, done: true });
});

test('push after end is refused rather than silently dropped', () => {
  const p = new Pushable<string>();
  p.end();
  assert.throws(() => p.push('late'), /push after end/);
});

test('keeps order when pushes and reads interleave', async () => {
  const p = new Pushable<number>();
  const it = p[Symbol.asyncIterator]();
  p.push(1);
  const first = await it.next();
  const waiting = it.next();
  p.push(2);
  p.push(3);
  const second = await waiting;
  const third = await it.next();
  assert.deepEqual([first.value, second.value, third.value], [1, 2, 3]);
});
