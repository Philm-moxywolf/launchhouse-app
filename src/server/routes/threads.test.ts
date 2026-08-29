/**
 * src/server/routes/threads.test.ts
 *
 * WHAT THIS IS. Rule 1 checked mechanically, over every row of the routing
 * table against both tracks and against no track at all. And the boot restore,
 * which is what stops a redeploy stranding whoever was waiting.
 *
 * WHY IT EXISTS. The route test proves one B2C founder cannot start one B2B
 * engine. That is the case somebody thought of. This is the loop, so a row
 * added to the routing table next week is covered without anybody remembering
 * to add a case: if a new row belongs to one track, a founder on the other
 * track cannot start it, and it is not on their rail.
 *
 * WHAT IT CALLS. ./threads.ts and ./test-fixtures.ts, plus the real routing
 * table in app/content/routes.ts.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES } from '../../../app/content/routes.ts';
import { mayStart, visibleRoutes } from './threads.ts';
import { MemoryAppStore } from './test-fixtures.ts';

const FOUNDER = '01J0AAAAAAAAAAAAAAAAAAAAAA';

test('EVERY ROW OF THE ROUTING TABLE, AGAINST BOTH TRACKS, WITH NO CASE LEFT OUT', () => {
  for (const row of ROUTES) {
    for (const track of ['b2b', 'b2c'] as const) {
      const expected = row.hidden ? 'unknown' : row.tracks.includes(track) ? 'ok' : 'wrong_track';
      assert.equal(mayStart(row.id, track), expected, `${row.id} on ${track}`);
    }
    // Before the Founder Brain there is no track, so only what both tracks
    // share may be started. That is not a special case bolted on: it is what
    // "the fork happens once, in the Founder Brain" means for the request that
    // comes before it.
    const expectedWithoutTrack = row.hidden ? 'unknown' : row.tracks.length === 2 ? 'ok' : 'wrong_track';
    assert.equal(mayStart(row.id, null), expectedWithoutTrack, `${row.id} with no track`);
  }
});

test('NO RAIL EVER CARRIES A ROW FROM THE OTHER TRACK', () => {
  const b2b = visibleRoutes('b2b').map((r) => r.id);
  const b2c = visibleRoutes('b2c').map((r) => r.id);

  for (const row of ROUTES) {
    if (row.hidden) {
      assert.ok(!b2b.includes(row.id) && !b2c.includes(row.id), `${row.id} is hidden and must not be offered`);
      continue;
    }
    assert.equal(b2b.includes(row.id), row.tracks.includes('b2b'), `${row.id} on the B2B rail`);
    assert.equal(b2c.includes(row.id), row.tracks.includes('b2c'), `${row.id} on the B2C rail`);
  }
  assert.ok(b2b.length > 0 && b2c.length > 0);
});

test('THE RAIL KEEPS BUILD ORDER, BECAUSE IT IS ALSO THE ANSWER TO WHAT DO I DO NEXT', () => {
  const order = ROUTES.filter((r) => !r.hidden && r.tracks.includes('b2b')).map((r) => r.id);
  assert.deepEqual(
    visibleRoutes('b2b').map((r) => r.id),
    order,
    'build order, not alphabetical, and the same order .state/index.md is built in',
  );
});

test('AN UNKNOWN ID IS UNKNOWN ON EVERY TRACK, WITH NO GUESSING', () => {
  for (const track of ['b2b', 'b2c', null] as const) {
    assert.equal(mayStart('does-not-exist', track), 'unknown');
    assert.equal(mayStart('', track), 'unknown');
    assert.equal(mayStart('../founder-brain', track), 'unknown');
  }
});

test('A TURN LEFT QUEUED BY A RESTART CAN BE PUT BACK IN LINE WITH WHAT IT NEEDS', async () => {
  const store = new MemoryAppStore();
  const at = new Date('2026-09-25T13:00:00Z');
  await store.createThread({ id: 'th_1', founderId: FOUNDER, routeId: 'content-engine', title: null, at });
  await store.acceptMessage({
    founderId: FOUNDER,
    threadId: 'th_1',
    text: 'we sell to construction firms',
    clientMsgId: 'c-1',
    messageId: 'ms_1',
    turnId: 'tn_1',
    at,
  });

  const jobs = await store.queuedTurns(100);
  assert.equal(jobs.length, 1);
  // Everything a resubmit needs, so the boot path is one query rather than
  // three in a loop across every founder.
  assert.deepEqual(jobs[0], {
    turnId: 'tn_1',
    threadId: 'th_1',
    founderId: FOUNDER,
    routeId: 'content-engine',
    priority: 'normal',
    text: 'we sell to construction firms',
  });

  // A turn that already finished is not put back. Answering a founder twice is
  // worse than not answering a restart.
  await store.setTurnStatus('tn_1', 'done', at);
  assert.deepEqual(await store.queuedTurns(100), []);
});
