/**
 * src/server/auth/plugin.test.ts
 *
 * WHAT THIS IS. Sign in driven over HTTP, through a real Fastify instance, the
 * way a browser and a mail scanner drive it.
 *
 * WHY IT EXISTS. ./magic-link.test.ts proves the flow. This proves the wiring,
 * which is where the failures that reach a founder actually live: a form body
 * Fastify cannot parse, a cookie that is never sent back, a GET that consumes,
 * a redirect that repeats a POST.
 *
 * WHAT IT CALLS. The auth routes, against the in memory store.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildHarness } from '../routes/test-fixtures.ts';
import { readSignInEmail } from './test-fixtures.ts';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const form = (fields: Record<string, string>): string => new URLSearchParams(fields).toString();

test('THE SIGN IN SCREEN SAYS THERE IS NO PASSWORD, BEFORE ANYBODY GOES LOOKING FOR ONE', async () => {
  const h = await buildHarness();
  const res = await h.app.inject({ method: 'GET', url: '/auth/signin' });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['content-type']), /text\/html/);
  assert.match(res.body, /No password\. We send you a link\./);
  assert.match(res.body, /<form method="POST" action="\/auth\/request">/);
  // No stylesheet, no font, no script from another host. A venue network with a
  // captive portal serves a founder an unstyled page they do not trust.
  assert.doesNotMatch(res.body, /https?:\/\/(?!localhost)/);
  await h.app.close();
});

test('A MAIL SCANNER FETCHING THE LINK CONSUMES NOTHING, AND THE FOUNDER STILL GETS IN', async () => {
  const h = await buildHarness();
  await h.app.inject({ method: 'POST', url: '/auth/request', headers: FORM, payload: form({ email: 'ama@example.com' }) });
  const { url } = readSignInEmail(h.mailer.last()?.text ?? '');
  const path = new URL(url).pathname + new URL(url).search;

  // Microsoft 365 Safe Links, three times, because scanners retry.
  for (let i = 0; i < 3; i += 1) {
    const scanned = await h.app.inject({ method: 'GET', url: path });
    assert.equal(scanned.statusCode, 200);
    assert.match(scanned.body, /One press and you are in/);
    assert.match(scanned.body, /<form method="POST" action="\/auth\/verify">/);
    assert.equal(scanned.cookies.length, 0, 'a GET sets no cookie');
  }
  for (const row of h.auth.tokens.values()) assert.equal(row.consumedAt, null);

  // Then the founder presses the button.
  const token = new URL(url).searchParams.get('t') ?? '';
  const verified = await h.app.inject({ method: 'POST', url: '/auth/verify', headers: FORM, payload: form({ t: token }) });
  // 303, so the browser follows with a GET. A 302 after a POST leaves some
  // clients repeating a POST that consumes a single use token.
  assert.equal(verified.statusCode, 303);
  assert.equal(verified.headers.location, '/');

  const cookie = verified.cookies.find((c) => c.name === 'lh_session');
  assert.ok(cookie, 'a session cookie was set');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax');
  assert.equal(cookie.path, '/');
  assert.equal(cookie.maxAge, 90 * 86_400, 'ninety days, long on purpose');
  await h.app.close();
});

test('PRESSING THE BUTTON TWICE DOES NOT SIGN ANYBODY IN TWICE', async () => {
  const h = await buildHarness();
  await h.app.inject({ method: 'POST', url: '/auth/request', headers: FORM, payload: form({ email: 'ama@example.com' }) });
  const token = new URL(readSignInEmail(h.mailer.last()?.text ?? '').url).searchParams.get('t') ?? '';

  const first = await h.app.inject({ method: 'POST', url: '/auth/verify', headers: FORM, payload: form({ t: token }) });
  assert.equal(first.statusCode, 303);
  const second = await h.app.inject({ method: 'POST', url: '/auth/verify', headers: FORM, payload: form({ t: token }) });
  assert.equal(second.statusCode, 200);
  assert.match(second.body, /That link has already been used/);
  assert.match(second.body, /Send me a new link/, 'and it ends on an action');
  assert.equal(h.auth.sessions.size, 1);
  await h.app.close();
});

test('THE SIX DIGIT CODE SCREEN SIGNS A FOUNDER IN, AND A WRONG ONE SAYS SO WITHOUT SAYING WHICH HALF', async () => {
  const h = await buildHarness();
  await h.app.inject({ method: 'POST', url: '/auth/request', headers: FORM, payload: form({ email: 'ama@example.com' }) });
  const { code } = readSignInEmail(h.mailer.last()?.text ?? '');

  const wrong = await h.app.inject({
    method: 'POST',
    url: '/auth/code',
    headers: FORM,
    payload: form({ email: 'ama@example.com', code: code === '000000' ? '111111' : '000000' }),
  });
  assert.equal(wrong.statusCode, 200);
  assert.match(wrong.body, /That address and code do not go together/);
  // Never which half was wrong, and never how many tries are left.
  assert.doesNotMatch(wrong.body, /tries left|attempts remaining/i);

  const right = await h.app.inject({
    method: 'POST',
    url: '/auth/code',
    headers: FORM,
    payload: form({ email: 'ama@example.com', code }),
  });
  assert.equal(right.statusCode, 303);
  assert.ok(right.cookies.some((c) => c.name === 'lh_session'));
  await h.app.close();
});

test('A SESSION COOKIE FROM ONE FOUNDER IS THAT FOUNDER, AND SIGN OUT ENDS ONLY THIS DEVICE', async () => {
  const h = await buildHarness();
  const laptop = await h.signIn('ama@example.com');
  const phone = await h.signIn('ama@example.com');

  const me = await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: laptop } });
  assert.equal(me.statusCode, 200);
  const body = JSON.parse(me.body) as { id: string; displayName: string; timezone: string };
  assert.equal(body.displayName, 'Ama Boateng');
  assert.equal(body.timezone, 'America/New_York');
  // The email is not on this response. It is not needed to paint a screen, and
  // an address in a payload is an address in a browser cache.
  assert.ok(!('email' in JSON.parse(me.body)));

  const out = await h.app.inject({ method: 'POST', url: '/auth/signout', headers: { cookie: laptop } });
  assert.equal(out.statusCode, 303);
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: laptop } })).statusCode, 401);
  assert.equal(
    (await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: phone } })).statusCode,
    200,
    'the phone is still signed in, because sessions are per device',
  );
  await h.app.close();
});

test('A FORGED COOKIE IS NOT A SESSION, AND IT IS TOLD THE SAME THING AS AN EXPIRED ONE', async () => {
  const h = await buildHarness();
  const real = await h.signIn('ama@example.com');
  const forged = 'lh_session=' + 'a'.repeat(43);

  const a = await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: forged } });
  const b = await h.app.inject({ method: 'GET', url: '/api/me' });
  assert.equal(a.statusCode, 401);
  assert.equal(a.body, b.body, 'unknown and absent read the same, so neither confirms a guess');
  assert.equal((await h.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: real } })).statusCode, 200);
  await h.app.close();
});

test('A VERIFY URL WITH NO TOKEN, AND ONE WITH RUBBISH IN IT, BOTH END ON AN ACTION', async () => {
  const h = await buildHarness();
  for (const url of ['/auth/verify', '/auth/verify?t=', '/auth/verify?t=not-a-real-token']) {
    const res = await h.app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, url);
    assert.match(res.body, /That link will not work/, url);
    assert.match(res.body, /Send me a new link/, url);
  }
  await h.app.close();
});
