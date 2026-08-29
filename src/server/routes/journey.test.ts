/**
 * src/server/routes/journey.test.ts
 *
 * WHAT THIS IS. A founder signing in and reaching their Founder Brain, driven
 * through the browser's own code, against the real server. The functions in
 * `src/web/lib/api.ts` are called here exactly as a screen calls them, and their
 * fetch goes into this app's router instead of onto a network.
 *
 * WHY IT EXISTS. `contract.test.ts` next door proves every address the browser
 * calls has a route behind it. That is the first half of the gap and it is not
 * the whole of it. The other half is shape.
 *
 * `/api/me` was registered the whole time. It answered 200. It was reached on
 * every page load. And the browser read `signedIn` off a body that carries no
 * such field, so a founder with a live session in their browser was shown the
 * sign in screen for ever, and no test on either side could see it: the server
 * test asserted the body it sends, the browser test stubbed a body it expects,
 * and the two bodies were different.
 *
 * The only thing that catches that is running one against the other. So this
 * file holds no assertion about a body at all. It calls the browser's own
 * functions and asserts on what they hand back, which is the thing a screen
 * actually renders. If the two halves disagree about a field name, a Result
 * comes back at `ok: false` or a field comes back undefined, and the test says
 * so in the words of the journey rather than in the words of a payload.
 *
 * WHAT IS PROVED HERE, in order, because it is the order a founder does it:
 * ask for a link, use it, be recognised, answer the two first run questions,
 * see where they are up to, open the Founder Brain, send a message, read their
 * files and their gates, and sign out.
 *
 * WHAT IT CALLS. `src/web/lib/api.ts`, and the real Fastify instance from
 * ./test-fixtures.ts.
 * WHAT IT READS AND WRITES. Nothing outside the process. `fetch` is replaced for
 * the length of a test and put back afterwards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchFiles,
  fetchGates,
  fetchHome,
  fetchSession,
  fetchSetup,
  fetchThread,
  openThread,
  requestSignInLink,
  saveProfile,
  sendMessage,
  signOut,
} from '../../web/lib/api.ts';
import { readSignInEmail, tokenFromUrl } from '../auth/test-fixtures.ts';
import { buildHarness, type Harness } from './test-fixtures.ts';

/**
 * The browser's fetch, wired into this app's router, with a cookie jar.
 *
 * THE JAR IS THE POINT OF DOING IT THIS WAY. The session is an HttpOnly cookie
 * the browser attaches by itself, so a shim that dropped cookies would prove
 * that sign in works and that nothing after it does. This keeps whatever the
 * server sets and sends it back on every later call, which is the one behaviour
 * the whole journey rests on.
 */
function driveBrowserAt(h: Harness): { restore: () => void; jar: Map<string, string> } {
  const real = globalThis.fetch;
  const jar = new Map<string, string>();

  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown; headers?: unknown }) => {
    const url = String(input);
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    const res = await h.app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url,
      headers: {
        ...(cookie === '' ? {} : { cookie }),
        ...((init?.headers ?? {}) as Record<string, string>),
      },
      ...(init?.body === undefined ? {} : { payload: String(init.body) }),
    });
    for (const c of res.cookies) {
      // An expiry in the past is the server taking a cookie away, which is what
      // sign out does. A jar that ignored it would keep the founder signed in.
      if (c.value === '' || (c.expires !== undefined && c.expires.getTime() <= Date.now())) jar.delete(c.name);
      else jar.set(c.name, c.value);
    }
    // A 204 carries no body, and the Response constructor throws if you hand it
    // one, even an empty string. Without this the shim turned every successful
    // write into a rejected fetch, which api.ts reads as the venue wifi, and the
    // test would have reported a working route as offline.
    const empty = res.statusCode === 204 || res.statusCode === 205 || res.statusCode === 304;
    return new Response(empty ? null : res.body, {
      status: res.statusCode,
      headers: Object.fromEntries(
        Object.entries(res.headers).filter(([, v]) => typeof v === 'string') as [string, string][],
      ),
    });
  }) as typeof fetch;

  return {
    restore: () => {
      globalThis.fetch = real;
    },
    jar,
  };
}

/** The link out of the email, pressed the way the verify page presses it. */
async function pressTheLinkInTheEmail(h: Harness, jar: Map<string, string>): Promise<void> {
  const email = h.mailer.last()?.text ?? '';
  const token = tokenFromUrl(readSignInEmail(email).url);
  assert.notEqual(token, '', 'the email carried no link');

  // A POST, because a GET consumes nothing: a mail scanner that fetches the URL
  // must not spend the token. That page is server rendered and is not one of
  // the browser bundle's calls, so it is driven here rather than through api.ts.
  const verified = await h.app.inject({
    method: 'POST',
    url: '/auth/verify',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ t: token }).toString(),
  });
  assert.equal(verified.statusCode, 303, 'the link did not sign anybody in');
  for (const c of verified.cookies) jar.set(c.name, c.value);
}

test('A FOUNDER SIGNS IN THROUGH THE BROWSER AND REACHES THEIR FOUNDER BRAIN', async (t) => {
  const h = await buildHarness();
  const { restore, jar } = driveBrowserAt(h);
  t.after(async () => {
    restore();
    await h.app.close();
  });

  // Nobody is signed in, and that is an answer rather than a failure. Reading it
  // as a failure is what used to leave a signed out founder looking at a spinner.
  const before = await fetchSession();
  assert.equal(before.ok, true);
  if (before.ok) assert.equal(before.value.signedIn, false);

  // The button on the sign in screen.
  const asked = await requestSignInLink('ama@example.com');
  assert.equal(asked.ok, true, 'the button that starts everything did not work');
  if (asked.ok) assert.equal(asked.value.sent, true);
  assert.equal(h.mailer.sent.length, 1);

  await pressTheLinkInTheEmail(h, jar);

  // And now the browser recognises them. This is the assertion the whole file
  // exists for: the shape the screens read, produced by the server as it is.
  const after = await fetchSession();
  assert.equal(after.ok, true);
  if (!after.ok) return;
  assert.equal(after.value.signedIn, true, 'the founder signed in and the browser still thinks they are out');
  if (!after.value.signedIn) return;
  const founder = after.value.founder;
  assert.equal(founder.firstName, 'Ama', 'the welcome would have read "Welcome, ."');
  assert.equal(founder.displayName, 'Ama Boateng');
  assert.equal(founder.track, 'b2b');
  assert.equal(founder.trackLocked, true);
  assert.equal(typeof founder.timezone, 'string');

  // The two first run questions.
  const saved = await saveProfile('Ama B', 'Europe/London');
  assert.equal(saved.ok, true);
  const reread = await fetchSession();
  assert.ok(reread.ok && reread.value.signedIn && reread.value.founder.timezone === 'Europe/London');

  // Where they are up to. Nothing is made yet, so the Brain is what comes next.
  const home = await fetchHome();
  assert.equal(home.ok, true, 'the first screen after sign in did not load');
  if (!home.ok) return;
  assert.equal(home.value.nextRouteId, 'founder-brain');
  assert.equal(home.value.routes['founder-brain']?.progress, 'not_started');
  assert.deepEqual(home.value.presentFiles, []);
  // Rule 1. This founder is b2b, so the B2C engine is not a key at all.
  assert.equal(home.value.routes['audience-engine'], undefined);

  // Open the Brain, and send the first message.
  const opened = await openThread('founder-brain');
  assert.equal(opened.ok, true, 'the Founder Brain would not open');
  if (!opened.ok) return;
  const threadId = opened.value.threadId;
  assert.equal(typeof threadId, 'string');

  // Opening it again is the same conversation. A founder who reloads the page
  // mid interview must not be handed a blank one with their answers stranded.
  const again = await openThread('founder-brain');
  assert.ok(again.ok && again.value.threadId === threadId, 'a reload started a second conversation');

  const sent = await sendMessage(threadId, 'we sell to construction firms', 'c-1');
  assert.equal(sent.ok, true, 'the founder pressed send and it did not arrive');

  const thread = await fetchThread(threadId);
  assert.equal(thread.ok, true);
  if (!thread.ok) return;
  assert.equal(thread.value.routeId, 'founder-brain');
  assert.deepEqual(
    thread.value.messages.map((m) => `${m.role}: ${m.text}`),
    ['founder: we sell to construction firms'],
  );

  // Their files and their gates, which are the two standing answers to "what do
  // I have" and "am I ready".
  const files = await fetchFiles();
  assert.equal(files.ok, true);
  if (files.ok) {
    assert.ok(files.value.rows.some((r) => r.name === 'founder-brain.md' && r.status === 'missing'));
    // Rule 1 again, on the other track's file.
    assert.ok(!files.value.rows.some((r) => r.name === 'dm-openers.md'));
  }

  const gates = await fetchGates();
  assert.equal(gates.ok, true);
  if (gates.ok) assert.equal(gates.value.fileStatus['founder-brain.md'], 'missing');

  const setup = await fetchSetup();
  assert.equal(setup.ok, true);
  if (setup.ok) {
    assert.equal(setup.value.profile.name, 'Ama B');
    assert.equal(setup.value.ghl.connected, false);
    // Never checked, never claimed. The read that would settle it has never run.
    assert.equal(setup.value.ghl.contacts, 'not_checked');
    // A b2b founder has the Apollo row. See the B2C test below for the other half.
    assert.notEqual(setup.value.apollo, undefined);
  }

  // And out again, on this device.
  const out = await signOut();
  assert.equal(out.ok, true);
  const done = await fetchSession();
  assert.ok(done.ok && done.value.signedIn === false, 'sign out left the session alive');
});

test('A B2C FOUNDER NEVER MEETS THE OTHER TRACK, THROUGH THE SAME CODE THE SCREENS USE', async (t) => {
  const h = await buildHarness();
  const { restore, jar } = driveBrowserAt(h);
  t.after(async () => {
    restore();
    await h.app.close();
  });

  await requestSignInLink('ben@example.com');
  await pressTheLinkInTheEmail(h, jar);

  const setup = await fetchSetup();
  assert.equal(setup.ok, true);
  // The key is absent, not false and not skipped. A skip line saying "not needed
  // on your track" is still the other track's material on their screen.
  if (setup.ok) assert.equal(setup.value.apollo, undefined);

  const home = await fetchHome();
  assert.ok(home.ok && home.value.routes['outreach-engine'] === undefined);
  assert.ok(home.ok && home.value.routes['audience-engine'] !== undefined);

  const files = await fetchFiles();
  assert.ok(files.ok && !files.value.rows.some((r) => r.name === 'outreach-sequence.md'));
  assert.ok(files.ok && files.value.rows.some((r) => r.name === 'dm-openers.md'));
});

test('THE PARTS THAT ARE NOT BUILT SAY SO, AND SAY IT IN WORDS A FOUNDER CAN ACT ON', async (t) => {
  const h = await buildHarness();
  const { restore, jar } = driveBrowserAt(h);
  t.after(async () => {
    restore();
    await h.app.close();
  });

  await requestSignInLink('ama@example.com');
  await pressTheLinkInTheEmail(h, jar);

  const { connectGhl, saveVoiceSample } = await import('../../web/lib/api.ts');

  const connected = await connectGhl('pit-not-a-real-token');
  assert.equal(connected.ok, false, 'a token was accepted against a check that has never run');
  if (!connected.ok) {
    // `not_built_yet` and not `server`. The founder is being told this part is
    // not connected, which is true, rather than that something went wrong.
    assert.equal(connected.problem.kind, 'not_built_yet');
    assert.match(connected.problem.text, /23 September/, 'it does not say when they can do it instead');
    assert.doesNotMatch(connected.problem.text, /[–—]/, 'house style: no dashes');
  }

  const sample = await saveVoiceSample('sample.md', 'a long paste');
  assert.equal(sample.ok, false);
  if (!sample.ok) {
    assert.equal(sample.problem.kind, 'not_built_yet');
    assert.match(sample.problem.text, /Nothing you have made is affected/);
  }
});
