/**
 * src/server/auth/session.test.ts
 *
 * WHAT THIS IS. The session cookie's arithmetic: what a cookie resolves to,
 * when it stops resolving, when the expiry slides, and what a changed
 * passphrase does to every device at once.
 *
 * WHY IT EXISTS. Every one of these is a failure that reads to the founder as
 * "the app forgot me", on a morning when nobody can stop to help. The expiry is
 * 90 days on purpose, so the test that matters most is the one that proves a
 * founder who signed in on 4 September is still signed in on the 25th.
 *
 * AND ONE OF THEM IS A SECURITY PROPERTY RATHER THAN A CONVENIENCE. Changing
 * OWNER_PASSPHRASE has to end every live session, or a founder who thinks
 * somebody got in changes it, is told the app is safe, and the stranger's
 * cookie still works. That is the last test in this file and it is the reason
 * `sessionIdFor` exists.
 *
 * WHAT IT CALLS. ./session.ts against the in memory store.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cookieOptionsFor,
  endSession,
  mintSession,
  readSession,
  sessionIdFor,
  slideSession,
  type SessionConfig,
} from './session.ts';
import { sha256Hex } from './tokens.ts';
import { FOUNDER_A, TEST_PASSPHRASE, TestClock, seededStore } from './test-fixtures.ts';

const CFG: SessionConfig = {
  cookieName: 'lh_session',
  ttlDays: 90,
  secure: true,
  bindingSecret: TEST_PASSPHRASE,
};
const DAY = 86_400_000;

test('THE SESSION ROW IS A HASH, SO A LEAKED ROW IS NOT A LIVE SESSION', () => {
  const clock = new TestClock();
  const minted = mintSession(FOUNDER_A, CFG, clock);
  assert.notEqual(minted.row.id, minted.cookieValue);
  assert.equal(minted.row.id, sessionIdFor(minted.cookieValue, TEST_PASSPHRASE));
  assert.equal(minted.cookieValue.length, 43, '32 bytes, base64url');
  assert.match(minted.cookieValue, /^[A-Za-z0-9_-]+$/, 'no padding, so nothing needs escaping in a header');

  // AND IT IS NOT THE PLAIN HASH EITHER. Anybody holding a database dump and a
  // guessed cookie cannot check the guess without the passphrase as well.
  assert.notEqual(minted.row.id, sha256Hex(minted.cookieValue));
});

test('THE COOKIE IS HTTP ONLY, LAX AND SCOPED TO THE WHOLE APP', () => {
  const opts = cookieOptionsFor(CFG);
  assert.equal(opts.httpOnly, true, 'script on the page must not be able to read it');
  assert.equal(opts.secure, true);
  // Lax is the CSRF defence: the cookie is not sent on a cross site POST, so
  // another page cannot post to /auth/signout or to an API route as the founder.
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, 90 * 86_400);

  // Over http, Secure would mean a cookie the browser never sends back, and a
  // developer who concludes sign in is broken.
  assert.equal(cookieOptionsFor({ ...CFG, secure: false }).secure, false);
});

test('A FOUNDER WHO SIGNED IN ON 4 SEPTEMBER IS STILL SIGNED IN ON THE 25TH', async () => {
  const store = seededStore();
  const clock = new TestClock(new Date('2026-09-04T09:00:00Z'));
  const minted = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(minted.row);

  clock.set(new Date('2026-09-25T08:30:00Z'));
  const lookup = await readSession(store, minted.cookieValue, CFG, clock);
  assert.equal(lookup.ok, true, 'nobody stands in the venue on the Friday unable to get in');

  // And past 90 days it stops, which is the other half of the same promise.
  clock.set(new Date('2026-12-20T09:00:00Z'));
  const later = await readSession(store, minted.cookieValue, CFG, clock);
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
  const soon = await readSession(store, minted.cookieValue, CFG, clock);
  assert.equal(soon.ok, true);
  if (soon.ok) assert.equal(await slideSession(store, soon.session, CFG, clock), null);

  clock.advance(2 * 3_600_000);
  const later = await readSession(store, minted.cookieValue, CFG, clock);
  assert.equal(later.ok, true);
  if (later.ok) {
    const moved = await slideSession(store, later.session, CFG, clock);
    assert.ok(moved !== null);
    assert.equal(moved.getTime(), clock.now().getTime() + 90 * DAY);
  }
});

test('AN ABSENT, UNKNOWN OR GUESSED COOKIE ALL END AT THE SAME ANSWER', async () => {
  const store = seededStore();
  const clock = new TestClock();
  assert.equal((await readSession(store, undefined, CFG, clock)).ok, false);
  assert.equal((await readSession(store, '', CFG, clock)).ok, false);
  const guessed = await readSession(store, 'a'.repeat(43), CFG, clock);
  assert.equal(guessed.ok, false);
  if (!guessed.ok) assert.equal(guessed.reason, 'unknown');
});

test('REVOKING, DISABLING AND DELETING ALL END A LIVE SESSION', async () => {
  const store = seededStore();
  const clock = new TestClock();
  const minted = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(minted.row);
  assert.equal((await readSession(store, minted.cookieValue, CFG, clock)).ok, true);

  await endSession(store, minted.cookieValue, CFG, clock);
  const revoked = await readSession(store, minted.cookieValue, CFG, clock);
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.equal(revoked.reason, 'revoked');

  // A founder row switched off after signing in is out at once, without
  // anybody having to hunt down every live session first. Currently
  // unnecessary, kept anyway: it costs one comparison per request.
  const second = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(second.row);
  const owner = store.founders.get(FOUNDER_A);
  assert.ok(owner !== undefined);
  store.addFounder({ ...owner, disabledAt: clock.now() });
  const disabled = await readSession(store, second.cookieValue, CFG, clock);
  assert.equal(disabled.ok, false);
  if (!disabled.ok) assert.equal(disabled.reason, 'no_founder');

  // And a deleted row, which is the same refusal for a different reason. The
  // row survives deletion because the audit line references it, so "deleted"
  // has to be checked rather than assumed to mean absent.
  const third = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(third.row);
  store.addFounder({ ...owner, disabledAt: null, deletedAt: clock.now() });
  const deleted = await readSession(store, third.cookieValue, CFG, clock);
  assert.equal(deleted.ok, false);
  if (!deleted.ok) assert.equal(deleted.reason, 'no_founder');
});

test('SIGNING OUT ON ONE DEVICE LEAVES THE OTHER ONE SIGNED IN', async () => {
  const store = seededStore();
  const clock = new TestClock();
  const laptop = mintSession(FOUNDER_A, CFG, clock);
  const phone = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(laptop.row);
  await store.insertSession(phone.row);

  await endSession(store, phone.cookieValue, CFG, clock);
  assert.equal((await readSession(store, phone.cookieValue, CFG, clock)).ok, false);
  assert.equal((await readSession(store, laptop.cookieValue, CFG, clock)).ok, true);
});

test('CHANGING THE PASSPHRASE SIGNS EVERY DEVICE OUT, INCLUDING A STRANGER WHO ALREADY GOT IN', async () => {
  const store = seededStore();
  const clock = new TestClock();

  const founderLaptop = mintSession(FOUNDER_A, CFG, clock);
  const strangerPhone = mintSession(FOUNDER_A, CFG, clock);
  await store.insertSession(founderLaptop.row);
  await store.insertSession(strangerPhone.row);
  assert.equal((await readSession(store, strangerPhone.cookieValue, CFG, clock)).ok, true);

  // The founder edits one Replit Secret and redeploys. Nothing else happens: no
  // sweep, no migration, nobody remembering to call a revoke.
  const after: SessionConfig = { ...CFG, bindingSecret: 'a different sentence entirely' };

  assert.equal((await readSession(store, strangerPhone.cookieValue, after, clock)).ok, false);
  assert.equal(
    (await readSession(store, founderLaptop.cookieValue, after, clock)).ok,
    false,
    'their own devices go too, which is the honest price and is what they expect',
  );

  // And a session minted under the new passphrase works straight away.
  const fresh = mintSession(FOUNDER_A, after, clock);
  await store.insertSession(fresh.row);
  assert.equal((await readSession(store, fresh.cookieValue, after, clock)).ok, true);
  assert.equal((await readSession(store, fresh.cookieValue, CFG, clock)).ok, false, 'and not under the old one');
});
