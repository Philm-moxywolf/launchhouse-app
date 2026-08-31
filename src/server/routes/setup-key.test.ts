/**
 * src/server/routes/setup-key.test.ts
 *
 * WHAT THIS IS. The three Anthropic key routes, driven through the real HTTP surface with
 * a real session cookie.
 *
 * WHY IT EXISTS. The check itself is tested next door, against a stubbed Anthropic. This
 * asks the different question: is the address there, does it belong to the founder holding
 * the cookie, and does the answer arrive in the shape the browser was written against.
 * Those three are what a founder actually meets, and none of them is visible in a unit
 * test of the checker.
 *
 * THERE IS NO DATABASE HERE AND THAT IS ON PURPOSE. Everything asserted below happens
 * before a row is written: an empty box, a box with a page pasted into it, a check with
 * nothing stored, and a stranger with the URL. The paths that do write are proved against
 * a real database by the golden suite. A route test that needed Postgres would be a route
 * test nobody ran on a laptop, which is the whole reason this folder is built the way it
 * is.
 *
 * AND THAT SENTENCE USED TO BE A WISH RATHER THAN A FACT, WHICH COST THE WHOLE SUITE.
 *
 * "There is no database here" was true only while DATABASE_URL happened to be unset in
 * whoever's shell was running the tests. One route below does reach for the database: a key
 * Anthropic has stopped accepting is thrown away, and `forgetStoredAnthropicKey` calls
 * `getDb()`, which reads DATABASE_URL through `lateSettings()`. With a real Postgres in the
 * environment that call opened a real connection pool. Nothing ever closed it, an idle
 * postgres.js connection holds the event loop open, and the file was killed at the 30 second
 * test timeout. All nine assertions passed, the file failed, and `npm test` exited 1.
 *
 * Worse than the leak: with a database present the test was no longer the test. Its name is
 * "when our own copy CANNOT be removed", and against a real Postgres the removal might well
 * succeed, so the branch it exists to cover never ran.
 *
 * SO THE CONDITION IS MADE RATHER THAN ASSUMED. The two lines below take DATABASE_URL out of
 * the environment for the length of this file, and `lateSettings()` re-reads the environment
 * on every call in a test process, so `getDb()` refuses instead of connecting. `after` puts
 * the variable back and closes any pool that somehow got opened anyway, so a future test in
 * this file cannot bring the hang back quietly.
 *
 * WHAT IT CALLS. The real Fastify instance from ./test-fixtures.ts.
 * WHAT IT READS AND WRITES. Its own process.env entry for DATABASE_URL, removed at import
 * and put back at the end. Nothing over a socket, nothing on disk, and no key exists to leak.
 */

import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { forgetEverythingForTests, rememberAnthropicKey } from '../agent/anthropic-key.ts';
import { closeDb } from '../db/client.ts';
import { buildHarness } from './test-fixtures.ts';

/**
 * Module scope, not a `before` hook, and the difference matters.
 *
 * A hook runs after every import in this file has already run. Nothing here reads the
 * environment at import time today, but the day something does, a hook would be too late and
 * the failure would be the same 30 second hang with no clue attached. This is the first
 * statement that runs, so there is no window at all.
 */
const REAL_DATABASE_URL = process.env['DATABASE_URL'];
delete process.env['DATABASE_URL'];

after(async () => {
  // Belt as well as braces. If a route in this file ever does open a pool, the process still
  // exits instead of being killed at the timeout, and the test that opened it still fails on
  // its own assertion rather than on a hang that names nothing.
  await closeDb();
  if (REAL_DATABASE_URL === undefined) delete process.env['DATABASE_URL'];
  else process.env['DATABASE_URL'] = REAL_DATABASE_URL;
});

const JSON_HEADERS = { 'content-type': 'application/json' };

interface KeyAnswer {
  saved: boolean;
  problem?: { code: string; title: string; whatToDo: string; retryable: boolean; vendorSaid: string | null };
  anthropic?: { set: boolean; checkedAt: string | null; length: number | null };
}

afterEach(() => {
  forgetEverythingForTests();
});

/**
 * The seal itself, asserted rather than trusted.
 *
 * Without this, somebody deleting the two lines above gets a suite that passes on their
 * laptop and hangs on the machine that has a database. The file's own claim about itself is
 * the thing under test here.
 */
test('THIS FILE RUNS WITH NO DATABASE, WHATEVER IS IN THE ENVIRONMENT', () => {
  assert.equal(
    process.env['DATABASE_URL'],
    undefined,
    'a database reached this file, so the route that clears a refused key would open a pool nothing closes',
  );
});

// ---------------------------------------------------------------------------------------
// Who may reach it
// ---------------------------------------------------------------------------------------

test('A STRANGER WITH THE URL REACHES NOTHING, on all three addresses', async () => {
  const h = await buildHarness();
  for (const url of ['/api/setup/key', '/api/setup/key/check', '/api/setup/key/forget']) {
    const res = await h.app.inject({ method: 'POST', url, headers: JSON_HEADERS, payload: { key: 'anything' } });
    assert.equal(res.statusCode, 401, `${url} answered ${String(res.statusCode)} with no cookie`);
    // And the refusal carries no hint about whether a key exists behind it.
    assert.equal(res.body.includes('anything'), false);
  }
  await h.app.close();
});

// ---------------------------------------------------------------------------------------
// What comes back before anything is sent to Anthropic
// ---------------------------------------------------------------------------------------

test('an empty box is answered with a sentence, not a refusal the browser has to invent', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/setup/key',
    headers: { cookie, ...JSON_HEADERS },
    payload: { key: '   ' },
  });
  // 200, because the request did what it was asked. See the route for why.
  assert.equal(res.statusCode, 200, res.body);
  const answer = JSON.parse(res.body) as KeyAnswer;
  assert.equal(answer.saved, false);
  assert.equal(answer.problem?.code, 'empty');
  assert.match(answer.problem?.whatToDo ?? '', /console\.anthropic\.com/);
  // The failure carries the key state too, so the screen never has to work it out. See the
  // check route: some failures throw the stored key away and some leave it alone.
  assert.deepEqual(answer.anthropic, { set: false, checkedAt: null, length: null });
  await h.app.close();
});

test('a whole page pasted in is refused before a single byte goes to Anthropic', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/setup/key',
    headers: { cookie, ...JSON_HEADERS },
    payload: { key: 'x'.repeat(5000) },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal((JSON.parse(res.body) as KeyAnswer).problem?.code, 'too_long');
  await h.app.close();
});

test('a body with no key field at all is an empty box rather than a crash', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();
  for (const payload of [{}, { key: null }, { key: 42 }, { notTheField: 'x' }]) {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/setup/key',
      headers: { cookie, ...JSON_HEADERS },
      payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((JSON.parse(res.body) as KeyAnswer).problem?.code, 'empty');
  }
  await h.app.close();
});

test('checking with nothing stored says so, rather than calling Anthropic with an empty key', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();
  // An empty object, which is exactly what api.ts sends: `post()` stringifies `{}` when it
  // is given no body. A POST declaring JSON and carrying nothing at all is refused by
  // Fastify before any route runs, so sending one here would test the framework.
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/setup/key/check',
    headers: { cookie, ...JSON_HEADERS },
    payload: {},
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal((JSON.parse(res.body) as KeyAnswer).problem?.code, 'empty');
  await h.app.close();
});

// ---------------------------------------------------------------------------------------
// What the setup screen is told
// ---------------------------------------------------------------------------------------

test('the setup state carries the key row, and it carries no key', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();

  const before = await h.app.inject({ method: 'GET', url: '/api/setup', headers: { cookie } });
  assert.equal(before.statusCode, 200, before.body);
  assert.deepEqual((JSON.parse(before.body) as { anthropic: unknown }).anthropic, {
    set: false,
    checkedAt: null,
    length: null,
  });

  // The exact call the route makes once Anthropic has accepted a key.
  const notAKey = 'not-a-real-key-0123456789abcdefghij';
  rememberAnthropicKey((await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json<{ id: string }>().id, notAKey, new Date('2026-09-07T14:00:00.000Z'));

  const after = await h.app.inject({ method: 'GET', url: '/api/setup', headers: { cookie } });
  const body = after.body;
  const state = (JSON.parse(body) as { anthropic: { set: boolean; length: number | null } }).anthropic;
  assert.equal(state.set, true);
  assert.equal(state.length, notAKey.length);
  // The whole answer, not just the key row. Nothing anywhere in it is the key.
  assert.equal(body.includes(notAKey), false, 'a key reached the setup answer');
  assert.equal(body.includes(notAKey.slice(0, 12)), false, 'part of a key reached the setup answer');
  await h.app.close();
});

/**
 * The founder who pasted the wrong clipboard.
 *
 * They are one screen away from a box that wants a GoHighLevel token, and the two boxes
 * look the same. This does not stop them: contracts/ghl.ts says the prefix is a guess and
 * a guess must never refuse a founder who pasted the right thing. It only decides which
 * sentence a key that Anthropic has already refused comes back with, which is why the
 * value below is one Anthropic will certainly not accept.
 */
/**
 * Anthropic answers, without Anthropic.
 *
 * `vendorFetch` reads the platform's fetch as a default argument, so replacing the global
 * for the length of a test puts a chosen answer in Anthropic's place. That is the same
 * trick src/web/routes/house-style.test.ts uses, and it is what makes the two tests below
 * possible at all: neither one can be written with a real network, and both are about what
 * a founder reads when a stored key stops working.
 */
async function withAnthropicAnswering<T>(status: number, body: unknown, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    )) as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

/**
 * The failure that would have put a paste box in front of a working key.
 *
 * A rate limit leaves the stored key exactly where it is. Only the server knows that, so
 * the answer says so, and the screen renders what it is told rather than assuming that a
 * failed check means the key is gone.
 */
test('A FAILED CHECK STILL REPORTS THE KEY IT DID NOT THROW AWAY', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();
  const me = (await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json<{ id: string }>();
  const notAKey = 'not-a-real-key-9876543210zyxwvu';
  rememberAnthropicKey(me.id, notAKey, new Date('2026-09-07T14:00:00.000Z'));

  const res = await withAnthropicAnswering(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, () =>
    h.app.inject({ method: 'POST', url: '/api/setup/key/check', headers: { cookie, ...JSON_HEADERS }, payload: {} }),
  );
  assert.equal(res.statusCode, 200, res.body);
  const answer = JSON.parse(res.body) as KeyAnswer;
  assert.equal(answer.saved, false);
  assert.equal(answer.problem?.code, 'busy');
  assert.equal(answer.anthropic?.set, true, 'a busy minute at Anthropic must not clear a working key');
  assert.equal(res.body.includes(notAKey), false, 'a key reached the answer');
  await h.app.close();
});

/**
 * The news gets through even when tidying up fails.
 *
 * A key Anthropic has stopped accepting is thrown away, and the throwing away needs the
 * database. With no database that used to throw, and "Anthropic will not accept your key"
 * became a 500 that reads as the app being broken. The founder still gets the sentence.
 */
test('AND A REFUSED KEY IS STILL REPORTED WHEN OUR OWN COPY CANNOT BE REMOVED', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn();
  const me = (await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json<{ id: string }>();
  rememberAnthropicKey(me.id, 'not-a-real-key-that-anthropic-has-revoked', new Date());

  // There is no database behind this harness, so the removal below cannot succeed. That is
  // asserted at the bottom rather than assumed, because it is the entire subject of the test.
  const res = await withAnthropicAnswering(
    401,
    { error: { type: 'authentication_error', message: 'API key is invalid.' } },
    () => h.app.inject({ method: 'POST', url: '/api/setup/key/check', headers: { cookie, ...JSON_HEADERS }, payload: {} }),
  );
  assert.equal(res.statusCode, 200, res.body);
  const answer = JSON.parse(res.body) as KeyAnswer;
  assert.equal(answer.problem?.code, 'key_not_accepted');
  assert.match(answer.problem?.whatToDo ?? '', /console\.anthropic\.com/);

  /*
    THE BRANCH REALLY RAN, and this is the line that proves it.

    The route wraps the removal in a try and swallows what it catches, so the founder's
    sentence gets through. That swallow is right, and it is also what let this test pass for
    the wrong reason: against a real database the removal SUCCEEDS, the catch never runs, and
    the test name stops describing the test. The route writes one line when the tidy up
    fails, so the line is the evidence.
  */
  const said = h.log.lines.map((l) => l.msg);
  assert.ok(
    said.includes('a stored Anthropic key stopped working and our copy could not be removed'),
    `the removal did not fail, so this test is not testing what it says. The log said: ${said.join(' | ')}`,
  );
  await h.app.close();
});

test('the guess about the other box changes the sentence and never blocks the paste', async () => {
  const { startsLikeAGhlToken } = await import('./setup.ts');
  assert.equal(startsLikeAGhlToken('pit-0123456789'), true);
  assert.equal(startsLikeAGhlToken('PIT-0123456789'), true);
  // The failure the narrower rule exists to prevent: a real key with those four characters
  // somewhere in the middle of it must not be read as somebody else's token.
  assert.equal(startsLikeAGhlToken('sk-ant-api03-xxpit-xx'), false);
});

test('THE SCREEN AND THE ROUTE CANNOT DISAGREE ABOUT WHETHER A TOKEN CAN BE CHECKED', async () => {
  // The bug this binds shut: step 5 showed a token box, a Connect button and, above
  // them, a notice saying there was no point pasting one in. A founder pasted, pressed
  // Connect, and got that same sentence back as an error.
  //
  // The box is gated on GHL_TOKEN_CHECK_IS_BUILT. The route's "not built" refusal is
  // the other half. Exactly one of them may exist at a time, so flipping the flag
  // without writing the call, or removing the call without hiding the box, fails here.
  const walk = await import('../../../app/content/ghl-walk.ts');
  const setup = await import('./setup.ts');
  const refusalExists = 'ghlCheckNotBuilt' in setup.SETUP_ERRORS;
  assert.equal(
    walk.GHL_TOKEN_CHECK_IS_BUILT,
    !refusalExists,
    walk.GHL_TOKEN_CHECK_IS_BUILT
      ? 'the walk shows a token box and the route still carries a not-built refusal. Remove one of them.'
      : 'the route can check a token but the walk still hides the box. Set GHL_VERIFY_CALL_IS_WRITTEN to true.',
  );
});

test('while the check is not built, the screen says so without blaming the founder', async () => {
  const walk = await import('../../../app/content/ghl-walk.ts');
  const text = walk.GHL_WALK_CANNOT_CHECK_YET.join(' ');
  assert.match(text, /not done anything wrong/i, 'a dead end reads as the founder having broken something');
  assert.match(text, /token you just created is the one you will use/i, 'their work must not look wasted');
  assert.doesNotMatch(text, /[—–]/, 'founder facing, so the house style applies');
});
