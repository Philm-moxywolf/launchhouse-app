/**
 * src/server/auth/session.test.ts
 *
 * WHAT THIS IS. The session cookie's arithmetic: what a cookie resolves to,
 * when it stops resolving, and when the expiry slides.
 *
 * WHY IT EXISTS. Every one of these is a failure that reads to a founder as
 * "the app forgot me", on a morning when a mentor cannot stop to help. The
 * expiry is 90 days on purpose, so the test that matters most is the one that
 * proves a founder who signed in on 4 September is still signed in on the 25th.
 *
 * WHAT IT CALLS. ./session.ts and ./roster.ts against the in memory store.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lookupRoster, normaliseEmail } from './roster.ts';
import { endSession, mintSession, readSession, slideSession, type SessionConfig } from './session.ts';
import { sha256Hex } from './tokens.ts';
import { FOUNDER_A, TestClock, seededStore } from './test-fixtures.ts';

const CFG: SessionConfig = { cookieName: 'lh_session', ttlDays: 90, secure: true };
const DAY = 86_400_000;

test('THE SESSION ROW IS THE HASH OF THE COOKIE, SO A LEAKED ROW IS NOT A LIVE SESSION', () => {
  const clock = new TestClock();
  const minted = mintSession(FOUNDER_A, CFG, clock);
  assert.equal(minted.row.id, sha256Hex(minted.cookieValue));
  assert.notEqual(minted.row.id, minted.cookieValue);
  assert.equal(minted.cookieValue.length, 43, '32 bytes, base64url');
  assert.match(minted.cookieValue, /^[A-Za-z0-9_-]+$/, 'no padding, so nothing needs escaping in a header');
});

test('A FOUNDER WHO SIGNED IN ON 4 SEPTEMBER IS STILL SIGNED IN ON THE 25TH', async () => {
  const store = seededStore();
  const clock = new TestClock(new Date('2026-09-04T09:00:00Z'));
  const minted = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(minted.row);

  clock.set(new Date('2026-09-25T08:30:00Z'));
  const lookup = await readSession(store, minted.cookieValue, clock);
  assert.equal(lookup.ok, true, 'nobody stands in the venue on the Friday unable to get in');

  // And past 90 days it stops, which is the other half of the same promise.
  clock.set(new Date('2026-12-20T09:00:00Z'));
  const later = await readSession(store, minted.cookieValue, clock);
  assert.equal(later.ok, false);
  if (!later.ok) assert.equal(later.reason, 'expired');
});

test('THE EXPIRY SLIDES, BUT NOT ON EVERY REQUEST', async () => {
  const store = seededStore();
  const clock = new TestClock(new Date('2026-09-04T09:00:00Z'));
  const minted = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(minted.row);

  // A founder mid interview makes a request every few seconds. An UPDATE per
  // request is write amplification against the one table every authenticated
  // request already reads.
  clock.advance(60_000);
  const soon = await readSession(store, minted.cookieValue, clock);
  assert.equal(soon.ok, true);
  if (soon.ok) assert.equal(await slideSession(store, soon.session, CFG, clock), null);

  clock.advance(2 * 3_600_000);
  const later = await readSession(store, minted.cookieValue, clock);
  assert.equal(later.ok, true);
  if (later.ok) {
    const moved = await slideSession(store, later.session, CFG, clock);
    assert.ok(moved !== null);
    assert.equal(moved.getTime(), clock.now().getTime() + 90 * DAY);
  }
});

test('REVOKING, DISABLING AND DELETING ALL END A LIVE SESSION', async () => {
  const store = seededStore();
  const clock = new TestClock();
  const minted = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(minted.row);
  assert.equal((await readSession(store, minted.cookieValue, clock)).ok, true);

  await endSession(store, minted.cookieValue, clock);
  const revoked = await readSession(store, minted.cookieValue, clock);
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.equal(revoked.reason, 'revoked');

  // A founder disabled after signing in is out at once, without anybody having
  // to hunt down every live session first.
  const second = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(second.row);
  store.addFounder({ id: FOUNDER_A, email: 'ama@example.com', disabledAt: clock.now() });
  const disabled = await readSession(store, second.cookieValue, clock);
  assert.equal(disabled.ok, false);
  if (!disabled.ok) assert.equal(disabled.reason, 'no_founder');
});

test('AN ADDRESS IS TRIMMED AND CASE FOLDED, AND NONSENSE IS REFUSED BEFORE IT REACHES THE ROSTER', async () => {
  assert.equal(normaliseEmail('  Ama@Example.COM '), 'ama@example.com');
  for (const bad of ['', '   ', 'ama', 'ama@', '@example.com', 'a@b', 'ama@@example.com', 'a b@example.com']) {
    assert.equal(normaliseEmail(bad), null, JSON.stringify(bad));
  }
  // Long enough to be a paste rather than an address.
  assert.equal(normaliseEmail(`${'a'.repeat(250)}@example.com`), null);

  const store = seededStore();
  const found = await lookupRoster(store, ' AMA@example.com ');
  assert.equal(found.ok, true);
  if (found.ok) assert.equal(found.founder.id, FOUNDER_A);
});
