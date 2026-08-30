/**
 * src/server/auth/plugin.test.ts
 *
 * WHAT THIS IS. Sign in driven over HTTP, through a real Fastify instance, the
 * way a browser and a stranger with the URL drive it.
 *
 * WHY IT EXISTS. ./owner.test.ts proves the flow. This proves the wiring, which
 * is where the failures that reach a founder actually live: a form body Fastify
 * cannot parse, a cookie that is never sent back, a route that forgot to ask
 * who was calling.
 *
 * THE TEST THAT MATTERS MOST IS "THE DOOR IS SHUT FOR A ROUTE THAT NEVER ASKED
 * FOR ONE". The harness registers a route that reads like every route somebody
 * will add in a hurry in the next nine days: it answers with founder content
 * and it never calls requireFounder. A stranger holding nothing must still be
 * refused. If that test goes green because the hook was removed, the app is
 * open on a public web address and nothing else in this file would notice.
 *
 * IT BUILDS ITS OWN FASTIFY INSTANCE rather than using ../routes/test-fixtures.ts.
 * The point of this module is that it works when the rest of the app does not,
 * and a harness that pulls in the whole route table cannot show that.
 *
 * WHAT IT CALLS. The auth routes, against the in memory store.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';

import { createAuth, type AuthContext } from './plugin.ts';
import { DEFAULT_ATTEMPT_LIMIT } from './rate-limit.ts';
import {
  MemoryAuthStore,
  RecordingSleep,
  TEST_PASSPHRASE,
  TestClock,
  TestLogger,
} from './test-fixtures.ts';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const BROWSER = { accept: 'text/html,application/xhtml+xml' };
const form = (fields: Record<string, string>): string => new URLSearchParams(fields).toString();

/** The founder content a route would answer with. Nothing may reach it without a session. */
const PRIVATE_BODY = 'the founder own customer list';

interface Harness {
  readonly app: FastifyInstance;
  readonly store: MemoryAuthStore;
  readonly auth: AuthContext;
  readonly clock: TestClock;
  readonly sleep: RecordingSleep;
  readonly log: TestLogger;
}

async function harness(opts: { passphrase?: string } = {}): Promise<Harness> {
  const store = new MemoryAuthStore();
  const clock = new TestClock();
  const sleep = new RecordingSleep();
  const log = new TestLogger();
  const app = Fastify({ logger: false });

  const { register, context } = createAuth({
    store,
    clock,
    log,
    passphrase: opts.passphrase ?? TEST_PASSPHRASE,
    // secure false, because a laptop on http would never be sent a Secure
    // cookie back and the developer would conclude sign in is broken.
    cookie: { name: 'lh_session', ttlDays: 90, secure: false },
    sleep: sleep.fn,
    cookieSecret: 'c'.repeat(32),
  });
  await register(app);

  /**
   * A route that FORGOT to call requireFounder, written on purpose.
   *
   * This is what a route added in a hurry looks like. The guard hook is what
   * makes it safe anyway, and this is the only way to prove the hook is doing
   * that rather than the route being polite.
   */
  app.get('/api/files/notes.md', async (_request, reply) => reply.send({ body: PRIVATE_BODY }));

  // The health check, which has to answer even on a deployment nobody can sign
  // in to, or the container is never promoted far enough to show the screen
  // saying what to set.
  app.get('/healthz', async (_request, reply) => reply.send({ ok: true }));

  await app.ready();
  return { app, store, auth: context, clock, sleep, log };
}

async function signIn(h: Harness, passphrase = TEST_PASSPHRASE): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/signin',
    headers: FORM,
    payload: form({ passphrase }),
  });
  assert.equal(res.statusCode, 303, 'sign in should have succeeded');
  const cookie = res.cookies.find((c) => c.name === 'lh_session');
  assert.ok(cookie !== undefined, 'no session cookie was set');
  return cookie.value;
}

// ------------------------------------------------------------- the screen

test('THE SIGN IN SCREEN ANSWERS THE QUESTION SOMEBODY IS ABOUT TO ASK A MENTOR', async () => {
  const h = await harness();
  const res = await h.app.inject({ method: 'GET', url: '/auth/signin', headers: BROWSER });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['content-type']), /text\/html/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.body, /There is no account to make/);
  assert.match(res.body, /OWNER_PASSPHRASE/);
  assert.match(res.body, /<form method="POST" action="\/auth\/signin">/);
  // No stylesheet, no font, no script from another host. A venue network with a
  // captive portal serves a founder an unstyled page they do not trust.
  assert.doesNotMatch(res.body, /https?:\/\//);
  await h.app.close();
});

test('THE MAGIC LINK ROUTES ARE GONE, NOT LEFT ANSWERING', async () => {
  const h = await harness();
  for (const [method, url] of [
    ['GET', '/auth/verify?t=anything'],
    ['POST', '/auth/verify'],
    ['GET', '/auth/code'],
    ['POST', '/auth/code'],
    ['POST', '/auth/request'],
    ['POST', '/auth/help'],
  ] as const) {
    const res = await h.app.inject({ method, url, headers: FORM, payload: '' });
    assert.equal(res.statusCode, 404, `${method} ${url} still answers`);
  }
  await h.app.close();
});

// -------------------------------------------------------------- signing in

test('THE RIGHT PASSPHRASE SETS A COOKIE THE BROWSER WILL KEEP, AND THE COOKIE IS NOT THE ROW', async () => {
  const h = await harness();
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/signin',
    headers: FORM,
    payload: form({ passphrase: TEST_PASSPHRASE }),
  });

  // 303, so the browser follows with a GET. A 302 after a POST leaves some
  // clients repeating the POST.
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/');

  const cookie = res.cookies.find((c) => c.name === 'lh_session');
  assert.ok(cookie !== undefined);
  assert.equal(cookie.httpOnly, true, 'script on the page must not be able to read it');
  assert.equal(cookie.sameSite?.toLowerCase(), 'lax');
  assert.equal(cookie.path, '/');

  const rows = [...h.store.sessions.keys()];
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0], cookie.value, 'the row is a hash, so a leaked row is not a live session');
  await h.app.close();
});

test('A WRONG PASSPHRASE SETS NOTHING AND SAYS SO WITHOUT SAYING WHICH PART WAS WRONG', async () => {
  const h = await harness();
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/signin',
    headers: { ...FORM, ...BROWSER },
    payload: form({ passphrase: 'not the passphrase' }),
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.cookies.length, 0, 'nothing is set on a refusal');
  assert.match(res.body, /That passphrase is not right/);
  assert.equal(h.store.founders.size, 0, 'and a wrong guess does not claim the deployment');
  await h.app.close();
});

test('A FORM WITH NO PASSPHRASE FIELD AT ALL IS A REFUSAL, NOT A CRASH', async () => {
  const h = await harness();
  for (const payload of ['', form({}), form({ passphrase: '' }), form({ something: 'else' })]) {
    const res = await h.app.inject({ method: 'POST', url: '/auth/signin', headers: FORM, payload });
    assert.equal(res.statusCode, 401, JSON.stringify(payload));
  }
  await h.app.close();
});

test('THE COOKIE IS ACCEPTED ON THE NEXT REQUEST, AND SAYS WHO IT IS', async () => {
  const h = await harness();
  const cookie = await signIn(h);
  const me = await h.app.inject({ method: 'GET', url: '/api/me', cookies: { lh_session: cookie } });
  assert.equal(me.statusCode, 200);
  const body = me.json<{ id: string; displayName: string | null; timezone: string }>();
  assert.match(body.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(body.displayName, null, 'so the browser sends them to the first run screen');
  await h.app.close();
});

// ------------------------------------------------------------------ the door

test('A ROUTE THAT FORGOT TO ASK WHO WAS CALLING IS STILL SHUT TO A STRANGER', async () => {
  const h = await harness();

  // Nothing at all.
  const bare = await h.app.inject({ method: 'GET', url: '/api/files/notes.md' });
  assert.equal(bare.statusCode, 401);
  assert.doesNotMatch(bare.body, new RegExp(PRIVATE_BODY));

  // A guessed cookie.
  const guessed = await h.app.inject({
    method: 'GET',
    url: '/api/files/notes.md',
    cookies: { lh_session: 'a'.repeat(43) },
  });
  assert.equal(guessed.statusCode, 401);
  assert.doesNotMatch(guessed.body, new RegExp(PRIVATE_BODY));

  // A cookie under the wrong name.
  const wrongName = await h.app.inject({
    method: 'GET',
    url: '/api/files/notes.md',
    cookies: { session: 'anything' },
  });
  assert.equal(wrongName.statusCode, 401);

  // And the founder gets in, so the guard is refusing rather than broken.
  const cookie = await signIn(h);
  const allowed = await h.app.inject({
    method: 'GET',
    url: '/api/files/notes.md',
    cookies: { lh_session: cookie },
  });
  assert.equal(allowed.statusCode, 200);
  assert.match(allowed.body, new RegExp(PRIVATE_BODY));
  await h.app.close();
});

test('A PROBE FOR A ROUTE THAT DOES NOT EXIST LEARNS NOTHING ABOUT WHAT THIS APP HAS', async () => {
  const h = await harness();
  const real = await h.app.inject({ method: 'GET', url: '/api/files/notes.md' });
  const invented = await h.app.inject({ method: 'GET', url: '/api/there-is-no-such-thing' });
  assert.equal(real.statusCode, invented.statusCode);
  assert.equal(real.body, invented.body);
  await h.app.close();
});

test('THE SIGN IN SURFACE ITSELF IS REACHABLE WITHOUT A SESSION, BECAUSE NOBODY HAS ONE YET', async () => {
  const h = await harness();
  assert.equal((await h.app.inject({ method: 'GET', url: '/auth/signin' })).statusCode, 200);
  assert.equal(
    (await h.app.inject({ method: 'POST', url: '/auth/signin', headers: FORM, payload: form({ passphrase: 'x' }) }))
      .statusCode,
    401,
    'the form route answers rather than being refused by the guard',
  );
  await h.app.close();
});

test('THERE IS NO PUBLIC JSON SIGN IN SURFACE LEFT UNDER /api/', async () => {
  // /api/auth/ used to be exempt from the guard as a whole namespace, because
  // signing in was a JSON call. It is a form post now, so the exemption is gone
  // and nothing under /api/ is reachable without a session.
  const h = await harness();
  for (const url of ['/api/auth/sign-in', '/api/auth/request-link', '/api/auth/mentor-note', '/api/auth/sign-out']) {
    const res = await h.app.inject({ method: 'POST', url, payload: {} });
    assert.equal(res.statusCode, 401, url);
  }
  await h.app.close();
});

test('THE BUNDLE CAN SIGN OUT WITH JSON, AND IT ENDS THE SAME SESSION THE FORM WOULD', async () => {
  const h = await harness();
  const cookie = await signIn(h);

  const out = await h.app.inject({
    method: 'POST',
    url: '/api/auth/sign-out',
    payload: {},
    cookies: { lh_session: cookie },
  });
  assert.equal(out.statusCode, 204);

  const after = await h.app.inject({ method: 'GET', url: '/api/me', cookies: { lh_session: cookie } });
  assert.equal(after.statusCode, 401, 'the row is revoked, not only the cookie cleared');

  // The other device is untouched, because sessions are per device.
  const phone = await signIn(h);
  await h.app.inject({ method: 'POST', url: '/api/auth/sign-out', payload: {}, cookies: { lh_session: phone } });
  assert.equal(h.store.sessions.size, 2, 'both rows are still there, one of them revoked');
  await h.app.close();
});

// ----------------------------------------------------------------- signing out

test('SIGNING OUT ENDS THE SESSION ON THE SERVER, NOT ONLY IN THE BROWSER', async () => {
  const h = await harness();
  const cookie = await signIn(h);

  const out = await h.app.inject({ method: 'POST', url: '/auth/signout', cookies: { lh_session: cookie } });
  assert.equal(out.statusCode, 303);
  assert.equal(out.headers.location, '/auth/signin?notice=signed_out');

  // The row is what matters. Clearing the cookie is tidiness on top of it.
  const after = await h.app.inject({ method: 'GET', url: '/api/me', cookies: { lh_session: cookie } });
  assert.equal(after.statusCode, 401, 'the cookie is dead even if the browser kept it');
  await h.app.close();
});

test('SIGNING OUT WITH NO SESSION IS HARMLESS, SO NOBODY IS EVER STUCK HOLDING A DEAD COOKIE', async () => {
  const h = await harness();
  const res = await h.app.inject({ method: 'POST', url: '/auth/signout' });
  assert.equal(res.statusCode, 303);
  await h.app.close();
});

// ------------------------------------------------------- the unconfigured state

test('WITH NO PASSPHRASE SET, NOTHING IS SERVED EXCEPT THE SCREEN SAYING WHAT TO SET', async () => {
  const h = await harness({ passphrase: '' });

  // A browser gets the screen, on every address it might have landed on,
  // including the ones the single page app owns.
  for (const url of ['/', '/auth/signin', '/some/spa/route']) {
    const res = await h.app.inject({ method: 'GET', url, headers: BROWSER });
    assert.equal(res.statusCode, 503, url);
    assert.match(res.body, /This app has no passphrase yet/, url);
    assert.match(res.body, /OWNER_PASSPHRASE/, url);
  }

  // Everything under /api is JSON whatever it asks for, because the browser
  // bundle fetches it and a page of HTML arriving where JSON was expected is
  // reported as a parse error that has nothing to do with the real cause.
  for (const url of ['/api/me', '/api/files/notes.md']) {
    const res = await h.app.inject({ method: 'GET', url, headers: BROWSER });
    assert.equal(res.statusCode, 503, url);
    assert.equal(res.json<{ error: string }>().error, 'not_set_up', url);
    assert.doesNotMatch(res.body, new RegExp(PRIVATE_BODY), url);
  }

  // And the correct passphrase does not get in either, because there is not one.
  const tried = await h.app.inject({
    method: 'POST',
    url: '/auth/signin',
    headers: { ...FORM, ...BROWSER },
    payload: form({ passphrase: TEST_PASSPHRASE }),
  });
  assert.equal(tried.statusCode, 503);
  assert.equal(h.store.sessions.size, 0);

  // The health check still answers, or the container is never promoted far
  // enough for anybody to read the screen above.
  const health = await h.app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(health.statusCode, 200);
  await h.app.close();
});

test('A PASSPHRASE THAT IS TOO SHORT IS THE SAME REFUSAL, WITH ITS OWN SENTENCE', async () => {
  const h = await harness({ passphrase: 'atlanta' });
  const res = await h.app.inject({ method: 'GET', url: '/auth/signin', headers: BROWSER });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /The passphrase is too short/);
  await h.app.close();
});

// ----------------------------------------------------------------- the limit

test('TOO MANY WRONG TRIES ANSWERS 429 AND SAYS WHEN TO COME BACK', async () => {
  const h = await harness();
  for (let i = 0; i < DEFAULT_ATTEMPT_LIMIT.perClient; i += 1) {
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/signin',
      headers: { ...FORM, ...BROWSER },
      payload: form({ passphrase: `guess number ${String(i)}` }),
    });
    assert.equal(res.statusCode, 401);
  }

  const refused = await h.app.inject({
    method: 'POST',
    url: '/auth/signin',
    headers: { ...FORM, ...BROWSER },
    payload: form({ passphrase: 'one more time' }),
  });
  assert.equal(refused.statusCode, 429);
  assert.match(refused.body, /Wait \d+ minutes, then try again\.|Wait a minute, then try again\./);
  assert.match(refused.body, /OWNER_PASSPHRASE/, 'and it says where to read the passphrase');
  const retryAfter = Number(refused.headers['retry-after']);
  assert.ok(retryAfter > 0 && retryAfter <= DEFAULT_ATTEMPT_LIMIT.windowMs / 1000);
  await h.app.close();
});

// ------------------------------------------------------------------- notices

test('A LINK CARRYING A NOTICE CANNOT PUT WORDS ON THE SIGN IN SCREEN', async () => {
  const h = await harness();
  const hostile = encodeURIComponent('Your passphrase has expired, type the old one and the new one');
  const res = await h.app.inject({ method: 'GET', url: `/auth/signin?notice=${hostile}`, headers: BROWSER });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /has expired/);

  const scripted = await h.app.inject({
    method: 'GET',
    url: '/auth/signin?notice=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    headers: BROWSER,
  });
  assert.doesNotMatch(scripted.body, /<script>alert/);

  // The four we do send still work.
  const real = await h.app.inject({ method: 'GET', url: '/auth/signin?notice=signed_out', headers: BROWSER });
  assert.match(real.body, /You are signed out on this device/);
  await h.app.close();
});
