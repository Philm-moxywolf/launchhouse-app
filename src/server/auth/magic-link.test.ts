/**
 * src/server/auth/magic-link.test.ts
 *
 * WHAT THIS IS. The sign in flow, exercised without a database, a mail server
 * or a browser.
 *
 * WHY IT EXISTS. Every one of 130 founders does this first, on a morning when a
 * mentor cannot be pulled out of a session to help. The tests here are the ones
 * whose failure would be visible in the room: a scanner eating a link, an
 * address that is not on the list getting a blank screen, a token that works
 * twice, a code that can be guessed at for ever.
 *
 * WHAT IT CALLS. ./magic-link.ts against ./test-fixtures.ts.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MagicLink, codeSha, type MagicLinkConfig } from './magic-link.ts';
import { DEFAULT_RATE_LIMIT, SigninRateLimiter } from './rate-limit.ts';
import { CollectingMailer } from './mailer.ts';
import { readSession } from './session.ts';
import { sha256Hex } from './tokens.ts';
import {
  FOUNDER_A,
  FOUNDER_B,
  MemoryAuthStore,
  TestClock,
  TestLogger,
  readSignInEmail,
  seededStore,
  tokenFromUrl,
} from './test-fixtures.ts';

const CONFIG: MagicLinkConfig = {
  appBaseUrl: 'https://launchhouse.example',
  tokenTtlMinutes: 30,
  mentorCodeTtlMinutes: 10,
  session: { cookieName: 'lh_session', ttlDays: 90, secure: true },
};

interface Harness {
  store: MemoryAuthStore;
  mailer: CollectingMailer;
  clock: TestClock;
  log: TestLogger;
  link: MagicLink;
}

function harness(store: MemoryAuthStore = seededStore()): Harness {
  const clock = new TestClock();
  const log = new TestLogger();
  const mailer = new CollectingMailer();
  const limiter = new SigninRateLimiter(DEFAULT_RATE_LIMIT, store, clock);
  return { store, mailer, clock, log, link: new MagicLink(CONFIG, store, mailer, limiter, clock, log) };
}

async function signIn(h: Harness, email: string): Promise<string> {
  const outcome = await h.link.request(email, '10.0.0.1');
  assert.equal(outcome.kind, 'sent');
  const body = h.mailer.last()?.text ?? '';
  const verified = await h.link.verifyLink(tokenFromUrl(readSignInEmail(body).url));
  assert.equal(verified.kind, 'signed_in');
  if (verified.kind !== 'signed_in') throw new Error('unreachable');
  return verified.minted.cookieValue;
}

test('A LINK ARRIVES, AND ONE PRESS SIGNS THE FOUNDER IN', async () => {
  const h = harness();
  const outcome = await h.link.request('Ama@Example.com', '10.0.0.1');
  assert.deepEqual(outcome, { kind: 'sent', email: 'ama@example.com' });

  const mail = h.mailer.last();
  assert.ok(mail, 'an email was sent');
  assert.equal(mail.to, 'ama@example.com');
  const { url, code } = readSignInEmail(mail.text);
  assert.ok(url.startsWith('https://launchhouse.example/auth/verify?t='), url);
  assert.match(code, /^\d{6}$/);

  const verified = await h.link.verifyLink(tokenFromUrl(url));
  assert.equal(verified.kind, 'signed_in');
  if (verified.kind !== 'signed_in') return;
  assert.equal(verified.founder.id, FOUNDER_A);
  assert.equal(verified.minted.cookieOptions.httpOnly, true);
  assert.equal(verified.minted.cookieOptions.sameSite, 'lax');
});

test('THE EMAIL SAYS THERE IS NO PASSWORD AND CARRIES NO DASHES', () => {
  const h = harness();
  return h.link.request('ama@example.com', '10.0.0.1').then(() => {
    const text = h.mailer.last()?.text ?? '';
    assert.ok(text.includes('There is no password.'), text);
    // The founder facing writing rules. A dash in an email is the same mistake
    // as a dash in a skill body, and this is the only automated check on it.
    assert.ok(!text.includes('—'), 'no em dashes');
    assert.ok(!text.includes('–'), 'no en dashes');
  });
});

test('A GET ON THE VERIFY PAGE CONSUMES NOTHING, WHICH IS THE SAFE LINKS DEFENCE', async () => {
  const h = harness();
  await h.link.request('ama@example.com', '10.0.0.1');
  const token = tokenFromUrl(readSignInEmail(h.mailer.last()?.text ?? '').url);

  // A corporate mail scanner fetches the URL. Several times, because they retry.
  for (let i = 0; i < 3; i += 1) {
    const state = await h.link.describeLink(token);
    assert.equal(state.kind, 'valid');
  }
  const row = await h.store.findSigninTokenBySha(sha256Hex(token));
  assert.equal(row?.consumedAt, null, 'the scanner did not spend the token');

  // The founder, some minutes later, presses the button.
  const verified = await h.link.verifyLink(token);
  assert.equal(verified.kind, 'signed_in');
});

test('A TOKEN WORKS ONCE. THE SECOND TAB IS REFUSED, NOT SERVED', async () => {
  const h = harness();
  await h.link.request('ama@example.com', '10.0.0.1');
  const token = tokenFromUrl(readSignInEmail(h.mailer.last()?.text ?? '').url);

  const [first, second] = await Promise.all([h.link.verifyLink(token), h.link.verifyLink(token)]);
  const outcomes = [first.kind, second.kind].sort();
  assert.deepEqual(outcomes, ['refused', 'signed_in'], 'exactly one of two simultaneous presses wins');
  assert.equal(h.store.sessions.size, 1);
});

test('USING THE LINK BURNS THE SIX DIGIT CODE FROM THE SAME EMAIL', async () => {
  const h = harness();
  await h.link.request('ama@example.com', '10.0.0.1');
  const { url, code } = readSignInEmail(h.mailer.last()?.text ?? '');
  assert.equal((await h.link.verifyLink(tokenFromUrl(url))).kind, 'signed_in');

  const after = await h.link.verifyCode('ama@example.com', code);
  assert.equal(after.kind, 'refused');
  if (after.kind === 'refused') assert.equal(after.reason, 'wrong_code');
});

test('AN EXPIRED LINK IS REFUSED AND SAYS SO, THIRTY MINUTES NOT FIFTEEN', async () => {
  const h = harness();
  await h.link.request('ama@example.com', '10.0.0.1');
  const token = tokenFromUrl(readSignInEmail(h.mailer.last()?.text ?? '').url);

  // Twenty nine minutes. A founder who read the email on a phone and walked to
  // a laptop is still inside the window, which is why it is 30 and not 15.
  h.clock.advance(29 * 60_000);
  assert.equal((await h.link.describeLink(token)).kind, 'valid');

  h.clock.advance(2 * 60_000);
  assert.equal((await h.link.describeLink(token)).kind, 'expired');
  const verified = await h.link.verifyLink(token);
  assert.equal(verified.kind, 'refused');
  if (verified.kind === 'refused') assert.equal(verified.reason, 'expired');
});

test('AN ADDRESS THAT IS NOT ON THE ROSTER IS TOLD SO, AND NO EMAIL IS SENT', async () => {
  const h = harness();
  const outcome = await h.link.request('nobody@example.com', '10.0.0.1');
  assert.equal(outcome.kind, 'miss');
  if (outcome.kind !== 'miss') return;
  assert.equal(outcome.miss.kind, 'not_on_roster');
  assert.equal(h.mailer.sent.length, 0, 'nothing was sent to an address we do not know');
  assert.equal(h.store.tokens.size, 0, 'and nothing was written');
});

test('A DISABLED FOUNDER AND A DELETED FOUNDER ARE BOTH REFUSED', async () => {
  const store = seededStore();
  store.addFounder({ id: FOUNDER_A, email: 'ama@example.com', disabledAt: new Date('2026-09-01T00:00:00Z') });
  const h = harness(store);
  const outcome = await h.link.request('ama@example.com', '10.0.0.1');
  assert.equal(outcome.kind, 'miss');
  if (outcome.kind === 'miss') assert.equal(outcome.miss.kind, 'disabled');

  store.addFounder({ id: FOUNDER_B, email: 'ben@example.com', deletedAt: new Date('2026-09-01T00:00:00Z') });
  const gone = await h.link.request('ben@example.com', '10.0.0.1');
  assert.equal(gone.kind, 'miss');
  // A deleted founder reads as absent. Saying "that account is deleted" tells
  // whoever typed the address something true about somebody else.
  if (gone.kind === 'miss') assert.equal(gone.miss.kind, 'not_on_roster');
});

test('THE SIX DIGIT CODE SIGNS A FOUNDER IN, AND ONLY WITH ITS OWN ADDRESS', async () => {
  const h = harness();
  await h.link.request('ama@example.com', '10.0.0.1');
  const { code } = readSignInEmail(h.mailer.last()?.text ?? '');

  const wrongPerson = await h.link.verifyCode('ben@example.com', code);
  assert.equal(wrongPerson.kind, 'refused', 'a code read out loud is useless without its address');

  const right = await h.link.verifyCode('ama@example.com', ` ${code.slice(0, 3)}-${code.slice(3)} `);
  assert.equal(right.kind, 'signed_in', 'spaces and a dash are forgiven, because people retype what they hear');
  if (right.kind === 'signed_in') assert.equal(right.founder.id, FOUNDER_A);
});

test('FIVE WRONG CODES BURN EVERY LIVE TOKEN FOR THAT ADDRESS', async () => {
  const h = harness();
  await h.link.request('ama@example.com', '10.0.0.1');
  const { url, code } = readSignInEmail(h.mailer.last()?.text ?? '');

  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i += 1) {
    const out = await h.link.verifyCode('ama@example.com', wrong);
    assert.equal(out.kind, 'refused');
    if (out.kind === 'refused') assert.equal(out.reason, 'wrong_code');
  }
  const fifth = await h.link.verifyCode('ama@example.com', wrong);
  assert.equal(fifth.kind, 'refused');
  if (fifth.kind === 'refused') assert.equal(fifth.reason, 'no_attempts_left');

  // The durable half. The right code and the link are both dead now, so the
  // guessing does not resume after a restart drops the in memory counter.
  assert.equal((await h.link.verifyCode('ama@example.com', code)).kind, 'refused');
  assert.equal((await h.link.verifyLink(tokenFromUrl(url))).kind, 'refused');
});

test('THE CODE HASH IS SALTED WITH THE ADDRESS, SO TWO FOUNDERS MAY HOLD THE SAME SIX DIGITS', async () => {
  const h = harness();
  // token_sha is unique. Without the address in the hash, two founders drawing
  // the same six digits would collide and the second insert would throw.
  assert.notEqual(codeSha('ama@example.com', '123456'), codeSha('ben@example.com', '123456'));

  await h.store.insertSigninTokens([
    {
      id: 'r1.code',
      email: 'ama@example.com',
      tokenSha: codeSha('ama@example.com', '123456'),
      founderId: FOUNDER_A,
      createdAt: h.clock.now(),
      expiresAt: new Date(h.clock.now().getTime() + 600_000),
      consumedAt: null,
    },
    {
      id: 'r2.code',
      email: 'ben@example.com',
      tokenSha: codeSha('ben@example.com', '123456'),
      founderId: FOUNDER_B,
      createdAt: h.clock.now(),
      expiresAt: new Date(h.clock.now().getTime() + 600_000),
      consumedAt: null,
    },
  ]);
  assert.equal((await h.link.verifyCode('ben@example.com', '123456')).kind, 'signed_in');
});

test('SIX REQUESTS AN HOUR FROM ONE ADDRESS: THE SIXTH SENDS NOTHING AND LOOKS IDENTICAL', async () => {
  const h = harness();
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await h.link.request('ama@example.com', '10.0.0.1')).kind, 'sent');
  }
  assert.equal(h.mailer.sent.length, 5);

  const sixth = await h.link.request('ama@example.com', '10.0.0.2');
  // Same answer as a real one. A distinct error would let somebody work out
  // which addresses are on the roster by watching which ones start refusing.
  assert.deepEqual(sixth, { kind: 'sent', email: 'ama@example.com' });
  assert.equal(h.mailer.sent.length, 5, 'nothing more was sent');

  // The limit is in the token rows, so it survives a restart. Winding the clock
  // past the window is the only thing that clears it.
  h.clock.advance(61 * 60_000);
  assert.equal((await h.link.request('ama@example.com', '10.0.0.1')).kind, 'sent');
  assert.equal(h.mailer.sent.length, 6);
});

test('TWO FOUNDERS SIGN IN AND EACH COOKIE RESOLVES TO ITS OWN FOUNDER, NEVER THE OTHER', async () => {
  const h = harness();
  const cookieA = await signIn(h, 'ama@example.com');
  const cookieB = await signIn(h, 'ben@example.com');
  assert.notEqual(cookieA, cookieB);

  const a = await readSession(h.store, cookieA, h.clock);
  const b = await readSession(h.store, cookieB, h.clock);
  assert.equal(a.ok && a.founder.id, FOUNDER_A);
  assert.equal(b.ok && b.founder.id, FOUNDER_B);

  // The cookie is never stored. What is stored is its sha256, which is why a
  // leaked row cannot be turned back into a session.
  for (const row of h.store.sessions.values()) {
    assert.notEqual(row.id, cookieA);
    assert.notEqual(row.id, cookieB);
  }
});

test('SIGNING IN ON A SECOND DEVICE LEAVES THE FIRST DEVICE SIGNED IN', async () => {
  const h = harness();
  const laptop = await signIn(h, 'ama@example.com');
  const phone = await signIn(h, 'ama@example.com');

  assert.equal((await readSession(h.store, laptop, h.clock)).ok, true, 'the laptop is still in');
  assert.equal((await readSession(h.store, phone, h.clock)).ok, true, 'and so is the phone');
  assert.equal(h.store.sessions.size, 2);
});

test('A MENTOR ISSUED CODE LASTS TEN MINUTES AND IS LOGGED AGAINST THE MENTOR', async () => {
  const h = harness();
  const issued = await h.link.issueMentorCode('ama@example.com', 'mentor_7');
  assert.ok(issued);
  assert.deepEqual(
    h.store.events.map((e) => [e.actor, e.verb, e.subject]),
    [['mentor:mentor_7', 'signin-code-issued', null]],
    'the audit line carries the mentor id and no name or address',
  );

  h.clock.advance(9 * 60_000);
  assert.equal((await h.link.verifyCode('ama@example.com', issued.code)).kind, 'signed_in');

  const later = await h.link.issueMentorCode('ama@example.com', 'mentor_7');
  assert.ok(later);
  h.clock.advance(11 * 60_000);
  assert.equal((await h.link.verifyCode('ama@example.com', later.code)).kind, 'refused');
});

test('A SIGN IN WRITES AN AUDIT LINE WITH NO ADDRESS IN IT', async () => {
  const h = harness();
  await signIn(h, 'ama@example.com');
  const signins = h.store.events.filter((e) => e.verb === 'signin');
  assert.equal(signins.length, 1);
  assert.equal(signins[0]?.actor, 'founder');
  assert.equal(signins[0]?.subject, null);
});
