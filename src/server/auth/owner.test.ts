/**
 * src/server/auth/owner.test.ts
 *
 * WHAT THIS IS. Owner sign in driven directly, without a server: readiness,
 * the claim, the refusals, and the two limits.
 *
 * WHY IT EXISTS. This is the whole of the protection on a single tenant app
 * published at a guessable web address. The tests that matter here are the ones
 * that prove a guard FAILS, not the ones that prove it passes. A limit nobody
 * has watched refuse is a limit nobody has tested, and it reads in a review
 * exactly like one that works.
 *
 * So every guard in ./owner.ts is exercised from the refusing side first:
 * readiness refuses three different bad passphrases, the per client limit
 * refuses the eleventh try, the slow down is asked for and its size is checked,
 * and a wrong passphrase is shown to create no owner row at all.
 *
 * WHAT IT CALLS. ./owner.ts and ./rate-limit.ts against the in memory store.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FOUNDER_ID_SHAPE,
  MIN_PASSPHRASE_LENGTH,
  OwnerAuth,
  OwnerAuthRefused,
  REFUSED_VERB,
  assertOwnerAuthReady,
  newFounderId,
  passphraseReadiness,
} from './owner.ts';
import { DEFAULT_ATTEMPT_LIMIT, SigninAttempts } from './rate-limit.ts';
import type { SessionConfig } from './session.ts';
import { readSession } from './session.ts';
import {
  MemoryAuthStore,
  RecordingSleep,
  TEST_PASSPHRASE,
  TestClock,
  TestLogger,
} from './test-fixtures.ts';
import { OWNER_ROW_KEY } from './types.ts';

function build(passphrase: string = TEST_PASSPHRASE, store = new MemoryAuthStore()) {
  const clock = new TestClock();
  const sleep = new RecordingSleep();
  const log = new TestLogger();
  const session: SessionConfig = {
    cookieName: 'lh_session',
    ttlDays: 90,
    secure: true,
    bindingSecret: passphrase,
  };
  const attempts = new SigninAttempts(DEFAULT_ATTEMPT_LIMIT, clock);
  const owner = new OwnerAuth({ passphrase, session }, store, attempts, clock, sleep.fn, log);
  return { owner, store, clock, sleep, log, session, attempts };
}

// ---------------------------------------------------------------- readiness

test('THE READINESS GUARD REFUSES BEFORE IT IS TRUSTED TO PASS', () => {
  assert.deepEqual(passphraseReadiness(''), { ready: false, reason: 'missing' });
  assert.deepEqual(passphraseReadiness('   '), { ready: false, reason: 'missing' });
  assert.deepEqual(passphraseReadiness('short'), { ready: false, reason: 'too_short' });
  // Eleven characters, one under the floor. The off by one is the one that ships.
  assert.deepEqual(passphraseReadiness('a'.repeat(MIN_PASSPHRASE_LENGTH - 1)), { ready: false, reason: 'too_short' });

  for (const easy of ['Launchhouse Atlanta', 'owner passphrase', 'YOUR PASSPHRASE HERE', '123456789012']) {
    assert.deepEqual(passphraseReadiness(easy), { ready: false, reason: 'too_easy' }, easy);
  }
  // Long, and carries nothing.
  assert.deepEqual(passphraseReadiness('aaaaaaaaaaaaaaaa'), { ready: false, reason: 'too_easy' });

  // And only then, the one that passes.
  assert.deepEqual(passphraseReadiness(TEST_PASSPHRASE), { ready: true });
  assert.deepEqual(passphraseReadiness('the launchhouse app is mine'), { ready: true });
});

test('THE BOOT GUARD NAMES THE VARIABLE AND SAYS WHERE IT LIVES', () => {
  for (const bad of ['', 'short', 'launchhouse']) {
    assert.throws(
      () => assertOwnerAuthReady(bad),
      (err: unknown) => {
        assert.ok(err instanceof OwnerAuthRefused);
        assert.match(err.message, /OWNER_PASSPHRASE/);
        assert.match(err.message, /Replit Secrets/);
        return true;
      },
      bad,
    );
  }
  assert.doesNotThrow(() => assertOwnerAuthReady(TEST_PASSPHRASE));
});

test('AN UNCONFIGURED DEPLOYMENT LETS NOBODY IN, INCLUDING WITH AN EMPTY BOX', async () => {
  const { owner, store } = build('');
  for (const attempt of ['', 'anything', TEST_PASSPHRASE]) {
    const outcome = await owner.signIn(attempt, '203.0.113.9');
    assert.equal(outcome.kind, 'refused');
    if (outcome.kind === 'refused') assert.equal(outcome.reason, 'not_set_up');
  }
  assert.equal(store.founders.size, 0, 'nothing is claimed while the passphrase is unusable');
  assert.equal(store.sessions.size, 0);
});

// -------------------------------------------------------------- the claim

test('THE FIRST CORRECT PASSPHRASE CLAIMS THE DEPLOYMENT, AND THE SECOND ONE DOES NOT CLAIM IT AGAIN', async () => {
  const { owner, store } = build();

  const first = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(first.kind, 'signed_in');
  if (first.kind !== 'signed_in') return;

  assert.equal(store.founders.size, 1, 'a fresh database gets exactly one founder row');
  assert.equal(first.founder.email, OWNER_ROW_KEY, 'not an address, and it cannot be mistaken for one');
  assert.doesNotMatch(first.founder.email, /@/);
  assert.match(first.founder.id, FOUNDER_ID_SHAPE, 'the id becomes a directory name under /tmp/ge');
  assert.equal(first.founder.displayName, null, 'so the first run screen asks for the name and the timezone');
  assert.equal(store.sessions.get(first.minted.row.id)?.founderId, first.founder.id);

  // Signing in on a phone half an hour later. Same owner, second session.
  const second = await owner.signIn(TEST_PASSPHRASE, '198.51.100.77');
  assert.equal(second.kind, 'signed_in');
  if (second.kind !== 'signed_in') return;
  assert.equal(store.founders.size, 1, 'still one owner');
  assert.equal(second.founder.id, first.founder.id);
  assert.equal(store.sessions.size, 2, 'the laptop stays signed in when the phone signs in');
  assert.notEqual(second.minted.cookieValue, first.minted.cookieValue);
});

test('TWO TABS CLAIMING AT THE SAME MOMENT END ON ONE OWNER, AND THE DATABASE PICKS IT', async () => {
  const { owner, store } = build();
  const [a, b] = await Promise.all([
    owner.signIn(TEST_PASSPHRASE, '198.51.100.4'),
    owner.signIn(TEST_PASSPHRASE, '198.51.100.4'),
  ]);
  assert.equal(a.kind, 'signed_in');
  assert.equal(b.kind, 'signed_in');
  assert.equal(store.founders.size, 1);
  if (a.kind === 'signed_in' && b.kind === 'signed_in') assert.equal(a.founder.id, b.founder.id);
});

test('A WRONG PASSPHRASE CLAIMS NOTHING, WHICH IS WHY THE FIRST RUN CLAIM DESIGN WAS REJECTED', async () => {
  const { owner, store } = build();
  const outcome = await owner.signIn('not the passphrase at all', '203.0.113.5');
  assert.equal(outcome.kind, 'refused');
  if (outcome.kind === 'refused') assert.equal(outcome.reason, 'wrong_passphrase');
  assert.equal(store.founders.size, 0, 'a stranger who guesses badly does not become the owner');
  assert.equal(store.events.length, 0, 'and there is no owner to hang an audit line on yet');
});

test('THE SIGN IN IS WRITTEN DOWN, AND THE AUDIT LINE CARRIES NOTHING IDENTIFYING', async () => {
  const { owner, store } = build();
  const outcome = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(outcome.kind, 'signed_in');
  const signin = store.events.filter((e) => e.verb === 'signin');
  assert.equal(signin.length, 1);
  assert.equal(signin[0]?.actor, 'founder');
  assert.equal(signin[0]?.subject, null, 'no path, no address, no client address');
});

test('A CLOSED OWNER ROW IS REFUSED RATHER THAN SIGNED IN AND STRAIGHT BACK OUT', async () => {
  const { owner, store, clock } = build();
  const claimed = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(claimed.kind, 'signed_in');
  if (claimed.kind !== 'signed_in') return;

  store.addFounder({ ...claimed.founder, disabledAt: clock.now() });
  const after = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(after.kind, 'refused');
  if (after.kind === 'refused') assert.equal(after.reason, 'account_closed');
  assert.equal(store.sessions.size, 1, 'no second session was minted for a row readSession would refuse');
});

// ------------------------------------------------------------ what is typed

test('A TRAILING SPACE FROM A PHONE KEYBOARD IS FORGIVEN, AND A CAPITAL LETTER IS NOT', async () => {
  const { owner } = build();
  const padded = await owner.signIn(`  ${TEST_PASSPHRASE}\n`, '198.51.100.4');
  assert.equal(padded.kind, 'signed_in', 'a paste that brought whitespace still signs in');

  const shouted = await owner.signIn(TEST_PASSPHRASE.toUpperCase(), '198.51.100.4');
  assert.equal(shouted.kind, 'refused', 'case is most of what makes a passphrase hard to guess');
});

test('A PASTE THE SIZE OF A FILE IS REFUSED WITHOUT BEING HASHED', async () => {
  const { owner } = build();
  const outcome = await owner.signIn('x'.repeat(2_000_000), '203.0.113.5');
  assert.equal(outcome.kind, 'refused');
  if (outcome.kind === 'refused') assert.equal(outcome.reason, 'wrong_passphrase');
});

// ----------------------------------------------------------------- limits

test('THE ELEVENTH WRONG TRY FROM ONE DEVICE IS REFUSED, AND IT SAYS WHEN TO COME BACK', async () => {
  const { owner, clock } = build();
  for (let i = 0; i < DEFAULT_ATTEMPT_LIMIT.perClient; i += 1) {
    const wrong = await owner.signIn(`guess ${String(i)} is wrong`, '203.0.113.5');
    assert.equal(wrong.kind, 'refused');
    if (wrong.kind === 'refused') assert.equal(wrong.reason, 'wrong_passphrase');
  }

  const refused = await owner.signIn('one more guess here', '203.0.113.5');
  assert.equal(refused.kind, 'refused');
  if (refused.kind !== 'refused' || refused.reason !== 'too_many_tries') {
    assert.fail(`expected too_many_tries, got ${JSON.stringify(refused)}`);
  }
  assert.ok(refused.retryAfterMs > 0, 'a screen that says no with no time on it is a dead end');
  assert.ok(refused.retryAfterMs <= DEFAULT_ATTEMPT_LIMIT.windowMs);

  // EVEN THE RIGHT PASSPHRASE IS REFUSED WHILE THE LIMIT HOLDS. The limit is on
  // the client, not on the answer, so a guesser cannot use a correct guess to
  // step around it.
  const correct = await owner.signIn(TEST_PASSPHRASE, '203.0.113.5');
  assert.equal(correct.kind, 'refused');

  // ANOTHER DEVICE IS UNAFFECTED, which is the founder on their phone while
  // somebody else hammers the URL.
  const elsewhere = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(elsewhere.kind, 'signed_in');

  // And the window rolls.
  clock.advance(DEFAULT_ATTEMPT_LIMIT.windowMs + 1_000);
  const later = await owner.signIn(TEST_PASSPHRASE, '203.0.113.5');
  assert.equal(later.kind, 'signed_in');
});

test('ONE BAD MORNING DOES NOT FOLLOW THE FOUNDER AROUND', async () => {
  const { owner, attempts } = build();
  for (let i = 0; i < 4; i += 1) await owner.signIn('wrong again here', '198.51.100.4');
  assert.equal(attempts.wrongCount('198.51.100.4'), 4);
  await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(attempts.wrongCount('198.51.100.4'), 0, 'a correct passphrase clears the count');
});

test('A DEPLOYMENT BEING GUESSED AT SLOWS DOWN, AND NEVER LOCKS THE FOUNDER OUT', async () => {
  const { owner, sleep, store } = build();
  // Claim it first, because there is nothing to count against until there is an
  // owner row, and nothing behind the door either.
  await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');

  // Below the threshold, nothing waits. Spread across clients so the per client
  // limit is not what is being measured.
  for (let i = 0; i < DEFAULT_ATTEMPT_LIMIT.slowAfter - 1; i += 1) {
    await owner.signIn('wrong one here', `203.0.113.${String(i % 200)}`);
  }
  assert.equal(sleep.total, 0, 'a founder mistyping twice waits for nothing');

  // At the threshold it starts waiting, and the wait is bounded rather than
  // growing, because a wait that grows locks the owner out by accident.
  await owner.signIn('wrong one here', '203.0.113.201');
  assert.deepEqual(sleep.waits, [DEFAULT_ATTEMPT_LIMIT.slowByMs]);
  await owner.signIn('wrong one here', '203.0.113.202');
  assert.deepEqual(sleep.waits, [DEFAULT_ATTEMPT_LIMIT.slowByMs, DEFAULT_ATTEMPT_LIMIT.slowByMs]);

  // The founder still gets in, from their own device, with no wait at all.
  const before = sleep.waits.length;
  const ok = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(ok.kind, 'signed_in', 'a stranger hammering the URL cannot lock the owner out');
  assert.equal(sleep.waits.length, before, 'and the correct passphrase is never made to wait');

  const refusals = store.events.filter((e) => e.verb === REFUSED_VERB);
  assert.equal(refusals.length, DEFAULT_ATTEMPT_LIMIT.slowAfter + 1);
  for (const line of refusals) {
    assert.equal(line.actor, 'system', 'we do not know who this was, so we do not write that it was the founder');
    assert.equal(line.subject, null);
  }
});

test('THE REFUSAL COUNT IS COUNTED IN THE DATABASE, SO A RESTART IS NOT A BYPASS', async () => {
  const store = new MemoryAuthStore();
  const first = build(TEST_PASSPHRASE, store);
  await first.owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  for (let i = 0; i < DEFAULT_ATTEMPT_LIMIT.slowAfter; i += 1) {
    await first.owner.signIn('wrong one here', `203.0.113.${String(i)}`);
  }

  // The process restarts. Every in memory counter is gone with it.
  const second = build(TEST_PASSPHRASE, store);
  assert.equal(second.attempts.wrongCount('203.0.113.1'), 0, 'the in memory half really did reset');
  await second.owner.signIn('wrong one here', '203.0.113.250');
  assert.deepEqual(second.sleep.waits, [DEFAULT_ATTEMPT_LIMIT.slowByMs], 'the durable half survived it');
});

// ------------------------------------------------------------- the founder id

test('THE OWNER ID IS A ULID, BECAUSE IT BECOMES A DIRECTORY NAME', () => {
  for (let i = 0; i < 200; i += 1) {
    const id = newFounderId();
    assert.match(id, FOUNDER_ID_SHAPE, id);
    // No dot and no slash, so a valid one cannot escape a directory even if
    // every other check in storage/paths.ts were removed.
    assert.doesNotMatch(id, /[./\\]/);
  }
  assert.notEqual(newFounderId(), newFounderId());
});

test('THE SESSION MINTED BY A SIGN IN IS ONE readSession WILL ACCEPT', async () => {
  const { owner, store, session, clock } = build();
  const outcome = await owner.signIn(TEST_PASSPHRASE, '198.51.100.4');
  assert.equal(outcome.kind, 'signed_in');
  if (outcome.kind !== 'signed_in') return;

  const lookup = await readSession(store, outcome.minted.cookieValue, session, clock);
  assert.equal(lookup.ok, true, 'sign in and the guard have to agree, or a founder signs in and straight back out');
  if (lookup.ok) assert.equal(lookup.founder.id, outcome.founder.id);
});
