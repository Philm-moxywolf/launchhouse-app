/**
 * src/server/routes/errors.test.ts
 *
 * WHAT THIS IS. Every route this app registers, driven against a database that
 * throws, with one unique string planted inside the exception. The test passes
 * only if that string reaches no response body, no header and no page.
 *
 * WHY IT EXISTS. The hole it closes was real and it was open. There was no
 * `setErrorHandler` anywhere in the tree, so Fastify answered a thrown error
 * with that error's own message. Every sign in route reaches Postgres, and the
 * driver writes its message as the failed query with the bound parameters
 * printed after it. The sign in POST against a database that did not answer
 * replied 500 with what the founder had typed, the `founder` table name and its
 * column list, in a browser, in a room with 130 people in it.
 *
 * THE ADDRESS OF THAT ROUTE CHANGED AND THE HOLE DID NOT. It was
 * `POST /auth/request`, which took an email and looked it up on a roster. It is
 * `POST /auth/signin`, which takes a passphrase and reads the owner row. Same
 * store, same driver, same message, and now the thing that would come back is
 * the passphrase rather than an address, which is worse. So the two bug report
 * tests below drive the new address and the walk posts a passphrase field.
 *
 * ONE ROUTE AT A TIME WOULD NOT HAVE CAUGHT IT AND WILL NOT CATCH THE NEXT ONE.
 * A hand written list of routes to check is a list somebody forgets to add to.
 * So this reads the route table off the live Fastify instance through its own
 * `onRoute` hook and drives every entry in it. A route added next week is
 * covered the moment it is registered, and a route added while the handler is
 * missing fails here rather than on a founder's screen.
 *
 * THE SENTINEL IS THE WHOLE ASSERTION. Matching on the shape of a Postgres
 * error would only prove that today's driver is caught. A string that exists
 * nowhere else in the process proves that nothing at all crossed the line,
 * whatever threw it and whatever it was carrying.
 *
 * AND IT IS DRIVEN TWICE, THE SECOND TIME OVER A REAL SOCKET. `inject` builds a
 * request and a response in process and never opens one, so it cannot show a
 * response whose headers have already been flushed, or one the server never
 * finished. Both of those are states a founder meets. So every route is walked
 * again through the kernel, and two of the tests below read the socket by hand
 * because the thing they measure is whether the response was terminated at all,
 * which no client library will tell you.
 *
 * IT FAILS RATHER THAN HANGING, WHICH IT DID NOT ALWAYS DO. Every instance is
 * closed in a `finally`, so a failing assertion reports and the file exits. See
 * the comment above the first walk for what happened when the close sat after
 * the assertions instead.
 *
 * WHAT IT CALLS. installErrorHandler, the real auth plugin and the real API
 * routes, against stores whose every method throws.
 * WHAT IT READS. src/server/index.ts, as text, to prove the handler is wired
 * before the first route.
 * WHAT IT WRITES. Nothing durable. It binds loopback ports the kernel picks,
 * and closes them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance, type FastifyReply, type InjectOptions } from 'fastify';

import { createAuth } from '../auth/plugin.ts';
import { TEST_PASSPHRASE } from '../auth/test-fixtures.ts';
import { checkProseText } from '../rules/prose.ts';
import {
  ERRORS,
  founderErrorPage,
  installErrorHandler,
  newIncidentId,
  serverFaultMessage,
  wantsHtml,
} from './errors.ts';
import { registerApiRoutes } from './index.ts';
import { QueueTurnExecutor } from './turn-executor.ts';
import { TurnEventBus, TurnEvents } from './events.ts';
import { TestClock, TestIds, TestLogger, TestQueue } from './test-fixtures.ts';
import type { RouteDeps } from './deps.ts';
import type { AppStore } from './ports.ts';
import type { AuthStore } from '../auth/types.ts';

/**
 * A string that exists nowhere else in this process.
 *
 * Shaped like the real thing on purpose. The message a founder was actually
 * shown had this form, so a fix that only tidies the wording and still forwards
 * the driver's text would pass a gentler sentinel and fail this one.
 */
const SENTINEL = 'ZZQX-SENTINEL-9f3a1c-DO-NOT-SHIP';
const DRIVER_MESSAGE =
  `Failed query: select "id", "email", "display_name" from "founder" where "founder"."email" = $1 limit $2\n` +
  `params: ${SENTINEL}@example.com,1`;

/**
 * What the founder typed, planted in the request rather than in the exception.
 *
 * IT IS THE PASSPHRASE, and that is the point of putting it here. The old bug
 * came back with a bound parameter in it, which on that route was an email
 * address. On this route the field is OWNER_PASSPHRASE, so a body or a page
 * that echoes what was typed is not an embarrassment, it is the one secret this
 * whole app has, on a screen, over the wire. Nothing may repeat it back.
 */
const TYPED = 'ZZQX-TYPED-BY-THE-FOUNDER-8b2e';

/**
 * Everything that must never appear in something a founder can read.
 *
 * The sentinel proves nothing escaped from the exception. These prove nothing
 * escaped from the framework or the file system either, which is the same rule
 * one layer out: no raw output, no source path, no line number, no temp file
 * name, no library error code.
 */
const NEVER_ON_A_FOUNDER_SCREEN: readonly (readonly [string, RegExp])[] = [
  ['the exception text', new RegExp(SENTINEL)],
  ['what the founder typed into the passphrase box', new RegExp(TYPED)],
  ['a failed query', /Failed query/i],
  ['SQL', /\bselect\s+"|\binsert\s+into\s+"|\bupdate\s+"\w|\bdelete\s+from\s+"/i],
  ['bound parameters', /\bparams:/],
  ['a quoted table name', /"(founder|sessions|signin_tokens|threads|messages|turns|turn_events|files)"/],
  ['a stack frame', /\n\s+at\s+\S/],
  ['a source path', /\/Users\/|\/home\/|node_modules|src\/server\//],
  ['a file and line number', /\.[cm]?tsx?:\d+/],
  ['a connection string', /postgres(ql)?:\/\//],
  ['a socket error', /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/],
  ['a library error code', /FST_ERR_|ERR_[A-Z_]{3,}/],
  ["Fastify's own error shape", /"statusCode"\s*:/],
  ['the phrase Internal Server Error', /Internal Server Error/],
];

function assertNothingInternal(where: string, res: { statusCode: number; headers: unknown; body: string }): void {
  const surface = `${res.body}\n${JSON.stringify(res.headers)}`;
  for (const [what, pattern] of NEVER_ON_A_FOUNDER_SCREEN) {
    assert.equal(
      pattern.test(surface),
      false,
      `${where} answered ${String(res.statusCode)} with ${what} in it:\n${surface.slice(0, 600)}`,
    );
  }
}

// --------------------------------------------------------- a database that throws

/**
 * A store whose every method throws the driver's message.
 *
 * A Proxy rather than a class with forty stubs, because a class with forty
 * stubs is a class somebody has to remember to extend. Any method added to
 * AppStore or AuthStore tomorrow throws here on the day it is added, which is
 * what makes the route walk below stay honest.
 *
 * It throws synchronously. Inside an async route handler that is a rejection
 * either way, and it also covers the paths that call a store method without
 * awaiting it.
 */
function throwingStore<T extends object>(): T {
  const target = {} as Record<string, unknown>;
  return new Proxy(target, {
    get: () => (): never => {
      throw new Error(DRIVER_MESSAGE);
    },
  }) as T;
}

interface ThrowingApp {
  readonly app: FastifyInstance;
  readonly log: TestLogger;
  readonly routes: readonly { method: string; url: string }[];
}

/**
 * The real HTTP surface, wired the way buildServer wires it, on stores that
 * cannot answer.
 *
 * The composition is spelled out rather than borrowed from buildHarness because
 * the one thing under test is the line buildHarness does not have. Fastify
 * compiles the error handler into every route's context at ready time, so it
 * cannot be added to an instance that is already built. That is also why
 * `installErrorHandler` sits above the first registration here, exactly as it
 * does in src/server/index.ts.
 */
async function buildThrowingApp(): Promise<ThrowingApp> {
  const log = new TestLogger();
  const clock = new TestClock();
  const app = Fastify({ logger: false });

  const routes: { method: string; url: string }[] = [];
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routes.push({ method, url: route.url });
  });

  installErrorHandler(app, log);

  const authStore = throwingStore<AuthStore>();
  const store = throwingStore<AppStore>();

  const { register: registerAuth, context } = createAuth({
    store: authStore,
    clock: { now: () => clock.now() },
    log,
    /**
     * A USABLE PASSPHRASE, AND THE WALK BELOW IS MEANINGLESS WITHOUT ONE.
     *
     * With no passphrase set the guard hook answers every request with the
     * screen naming the Replit Secret, before any route runs and before the
     * store is ever touched. Every assertion here would then pass over a
     * deployment that was refusing everything for a different reason.
     */
    passphrase: TEST_PASSPHRASE,
    cookie: { name: 'lh_session', ttlDays: 90, secure: false },
    // The wrong passphrase path waits on purpose. Recording the wait instead of
    // taking it keeps this file fast without turning the guard off.
    sleep: () => Promise.resolve(),
    cookieSecret: 'test-cookie-secret-not-used-for-anything',
  });
  await registerAuth(app);

  const bus = new TurnEventBus();
  const events = new TurnEvents(store, bus, clock);
  const deps: RouteDeps = {
    store,
    auth: context,
    events,
    bus,
    executor: new QueueTurnExecutor(new TestQueue(), events, store, clock, log, () => Promise.resolve()),
    clock,
    log,
    ids: new TestIds(),
    heartbeatMs: 15_000,
    maxMessageBytes: 50_000,
  };
  await registerApiRoutes(app, deps);
  await app.ready();
  return { app, log, routes };
}

/**
 * A session cookie, so `requireFounder` gets past "no cookie" and reaches the
 * store. Without one every authenticated route answers a clean 401 and the test
 * proves nothing at all.
 */
const COOKIE = 'lh_session=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const FORM = 'application/x-www-form-urlencoded';

/**
 * One form body that satisfies every POST in the app, carrying the planted
 * passphrase so the walk also proves nothing echoes it.
 */
const BODY = `passphrase=${TYPED}&name=a+founder&timezone=Europe%2FLondon`;

/** A path with its parameters filled in, so the route reaches its handler. */
function fill(url: string): string {
  return url
    .replace(/:id\b/g, '01J0CCCCCCCCCCCCCCCCCCCCCC')
    .replace(/\/\*$/, '/founder-brain.md')
    .replace(/\*/g, 'founder-brain.md');
}

// -------------------------------------------------------- over a real socket

/**
 * `inject` is not a network, and the difference is where this bug lives.
 *
 * light-my-request builds a fake request and a fake response in process. It
 * never opens a socket, so it cannot show a response whose headers have already
 * been flushed, a connection nothing ever closes, or bytes that arrive in a
 * different order from the one they were written in. Those are three of the
 * states an error handler has to survive, and all three are states the founder
 * meets and inject does not.
 *
 * So everything below is driven twice: once through inject, which is fast and
 * exact, and once through the kernel.
 */
async function listenOn(app: FastifyInstance): Promise<number> {
  // Port 0 asks the kernel for a free one. A fixed port is a test that fails on
  // whichever machine happens to have something on it.
  await app.listen({ host: '127.0.0.1', port: 0 });
  const bound = app.server.address();
  if (bound === null || typeof bound === 'string') throw new Error('the test server did not bind a port');
  return bound.port;
}

/**
 * One HTTP request written onto a TCP socket by hand, read until the server
 * closes it or the deadline runs out, handed back as raw bytes.
 *
 * BY HAND, AND WITH A DEADLINE, for the same reason. A client library waits for
 * a complete response, so a response that never completes hangs the test runner
 * rather than failing it, and the whole point of the two tests below is what
 * happens to a response that cannot complete. Reading the socket directly also
 * puts the status line and the headers in the same string as the body, so the
 * sentinel scan covers all three at once.
 */
function overTheWire(port: number, request: string, ms: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const socket = connect({ host: '127.0.0.1', port }, () => {
      socket.write(request);
    });
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      // latin1, so one byte is one character and the chunk sizes below can be
      // counted against string offsets. readWire puts the body back to utf8.
      resolve(Buffer.concat(chunks).toString('latin1'));
    };
    const timer = setTimeout(finish, ms);
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('end', finish);
    socket.on('close', finish);
    socket.on('error', finish);
  });
}

interface Wire extends WireAnswer {
  readonly statusLine: string;
  /**
   * Whether the server actually finished the response.
   *
   * THE FIELD THAT MATTERS MOST HERE, and the one no client library will show
   * you. fetch and inject both wait for a complete response and hand back a
   * body, so a response the server never terminated looks to them like a hang
   * and to a founder like a page that is still loading. Reading the socket by
   * hand is the only way to tell "answered and closed" from "answered and left
   * open", and those are different bugs.
   */
  readonly complete: boolean;
}

/**
 * Take a raw HTTP response apart: status line, headers, decoded body, and
 * whether it was terminated.
 *
 * Chunked is decoded rather than matched as text, because Node frames a
 * response written after the headers have gone as `8\r\n: open\n\n\r\n`, and a
 * test that string matches on that is a test that reports the framing as a
 * leak. The terminating zero length chunk is what `complete` reads.
 */
function readWire(raw: string): Wire {
  const split = raw.indexOf('\r\n\r\n');
  const head = split === -1 ? raw : raw.slice(0, split);
  const rest = split === -1 ? '' : raw.slice(split + 4);
  const lines = head.split('\r\n');
  const statusLine = lines[0] ?? '';
  const statusCode = Number.parseInt(statusLine.split(' ')[1] ?? '0', 10);

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }

  const utf8 = (latin1: string): string => Buffer.from(latin1, 'latin1').toString('utf8');

  if (!(headers['transfer-encoding'] ?? '').includes('chunked')) {
    const declared = Number.parseInt(headers['content-length'] ?? '', 10);
    const complete = Number.isNaN(declared) ? split !== -1 : rest.length >= declared;
    return { statusLine, statusCode, headers, body: utf8(rest), complete };
  }

  let body = '';
  let cursor = 0;
  let complete = false;
  while (cursor < rest.length) {
    const eol = rest.indexOf('\r\n', cursor);
    if (eol === -1) break;
    const size = Number.parseInt((rest.slice(cursor, eol).split(';')[0] ?? '').trim(), 16);
    if (Number.isNaN(size)) break;
    if (size === 0) {
      complete = true;
      break;
    }
    body += rest.slice(eol + 2, eol + 2 + size);
    cursor = eol + 2 + size + 2;
  }
  return { statusLine, statusCode, headers, body: utf8(body), complete };
}

/**
 * The status line is written by Node from the status code, so its reason phrase
 * is "Internal Server Error" on every 500 ever sent and is not something anyone
 * authored. It is checked for shape instead of scanned, which is what stops the
 * scan below reporting the framing as a leak while still refusing anything a
 * route could have put there.
 */
function assertNothingInternalOnTheWire(where: string, wire: Wire): void {
  assert.match(wire.statusLine, /^HTTP\/1\.1 \d{3} [A-Za-z ]*$/, `${where} wrote something into the status line`);
  assertNothingInternal(where, wire);
}

interface WireAnswer {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** The same request a browser makes, with a deadline so a hang fails rather than waits. */
async function ask(
  base: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | undefined,
  ms: number,
): Promise<WireAnswer | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => {
    stop.abort();
  }, ms);
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body, signal: stop.signal, redirect: 'manual' });
    return { statusCode: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
  } catch {
    // Aborted, refused or reset. All three are "no answer", and the caller says
    // so with the route's name attached.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------- the walk

/**
 * EVERY TEST BELOW THAT BUILDS AN INSTANCE CLOSES IT IN A `finally`, AND THAT IS
 * THE POINT OF THE SHAPE.
 *
 * The close used to sit after the assertions. So a failing assertion threw past
 * it, the instance stayed up, and a Fastify that has bound a port holds the event
 * loop open. The file then printed all of its results and never exited. Measured,
 * not reasoned about: with one assertion in the socket walk forced to fail,
 * `node --import tsx --test src/server/routes/errors.test.ts` printed 15 results
 * and was still running two minutes later.
 *
 * `npm test` passes `--test-timeout=30000`, so CI turns that into a cancelled file
 * rather than a stuck build. Running this one file on its own has no such flag, and
 * running this one file on its own is exactly what you do when you are chasing the
 * failure it just reported.
 *
 * A HANG IS THE WORST WAY FOR A TEST TO FAIL. A red assertion names the route, the
 * header and the string. A hang names nothing, and the first guess is always that
 * the test is slow rather than that it is finished and stuck.
 *
 * WHY `finally` AND NOT A HOOK. `t.after(() => app.close())` is the tidier looking
 * answer and it was tried first. In this file it does not work: the close starts
 * and never completes, and the file hangs on a green run. That is a fact from
 * running it, and the cause is not understood, so the construct with no moving
 * parts is the one that ships six days before a freeze. `finally` puts the close
 * exactly where it already worked and adds nothing else.
 */

test('NOT ONE ROUTE IN THE APP CAN PUT A DATABASE ERROR ON A FOUNDER SCREEN', async () => {
  const { app, routes } = await buildThrowingApp();
  try {
    assert.ok(routes.length >= 14, `the route table looks short at ${String(routes.length)}, so this test is not driving the app`);

    let faults = 0;
    for (const route of routes) {
      if (route.method === 'OPTIONS') continue;
      const url = fill(route.url);
      // Both ways round. A browser asks for HTML and reads a page, the bundle
      // asks for JSON and reads a body, and the leak has to be closed on both.
      for (const accept of ['text/html,application/xhtml+xml', 'application/json']) {
        const res = await app.inject({
          method: route.method as 'GET',
          url,
          headers:
            route.method === 'POST'
              ? { cookie: COOKIE, accept, 'content-type': FORM }
              : { cookie: COOKIE, accept },
          payload: route.method === 'POST' ? BODY : undefined,
        });
        assertNothingInternal(`${route.method} ${url} (accept ${accept})`, res);
        if (res.statusCode >= 500) faults += 1;
      }
    }

    // The stores throw on everything, so most routes must actually have failed.
    // Without this the test would still pass if every route quietly answered 200,
    // which would mean it was proving nothing.
    assert.ok(faults >= 10, `only ${String(faults)} routes reached the error handler, so the walk is not exercising it`);
  } finally {
    await app.close();
  }
});

test('THE SAME WALK OVER A REAL SOCKET, BECAUSE A FOUNDER USES ONE AND inject DOES NOT', async () => {
  const { app, routes } = await buildThrowingApp();
  try {
    const port = await listenOn(app);
    const base = `http://127.0.0.1:${String(port)}`;

    let driven = 0;
    let faults = 0;
    const unanswered: string[] = [];
    for (const route of routes) {
      if (route.method === 'OPTIONS') continue;
      const path = fill(route.url);
      for (const accept of ['text/html,application/xhtml+xml', 'application/json']) {
        const headers: Record<string, string> = { cookie: COOKIE, accept };
        let body: string | undefined;
        if (route.method === 'POST') {
          headers['content-type'] = FORM;
          body = BODY;
        }
        // Five seconds is not a performance budget. It is long enough that a
        // working route never trips it and short enough that a route which hangs
        // is reported as a failure instead of stalling the suite.
        const res = await ask(base, route.method, path, headers, body, 5_000);
        driven += 1;
        if (res === null) {
          unanswered.push(`${route.method} ${path} (accept ${accept})`);
          continue;
        }
        assertNothingInternal(`${route.method} ${path} over a socket (accept ${accept})`, res);
        if (res.statusCode >= 500) faults += 1;
      }
    }

    assert.deepEqual(unanswered, [], 'these never answered over a real socket, so a founder would be watching a spinner');
    assert.ok(driven >= 28, `only ${String(driven)} requests went over the wire, so this is not driving the app`);
    assert.ok(faults >= 10, `only ${String(faults)} of them reached the error handler`);
  } finally {
    await app.close();
  }
});

test('THE ROUTE THAT LEAKED, DRIVEN THE WAY THE BUG REPORT DRIVES IT', async () => {
  const { app, log } = await buildThrowingApp();
  try {
    // The sign in POST is still the route that reaches the database first, and
    // it is still the first thing a founder does. Only the field changed: an
    // address then, their passphrase now.
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signin',
      headers: { 'content-type': FORM, accept: 'text/html' },
      payload: `passphrase=${TYPED}`,
    });

    assert.equal(res.statusCode, 500);
    assertNothingInternal('POST /auth/signin', res);
    // A browser posted a form, so a browser gets a page, not a line of JSON.
    assert.match(String(res.headers['content-type']), /text\/html/);
    assert.match(res.body, /Nothing you have made is affected/);
    assert.equal(res.headers['cache-control'], 'no-store');

    // The bound parameter that used to come back was the founder's own typing.
    assert.doesNotMatch(res.body, new RegExp(TYPED));

    // And the detail is not lost, it has moved. The log has the driver's message
    // and the id the founder was shown, so a mentor can find this one line.
    const logged = log.lines.find((l) => typeof l.obj['incident'] === 'string');
    assert.ok(logged, 'the failure was not logged');
    const incident = String(logged.obj['incident']);
    assert.match(String(logged.obj['detail']), new RegExp(SENTINEL), 'the log kept the detail');
    assert.ok(res.body.includes(incident), 'the founder was given the id that is in the log');
  } finally {
    await app.close();
  }
});

test('THE BUG REPORT curl, RUN AS WRITTEN, AGAINST A LISTENING SOCKET', async () => {
  const { app } = await buildThrowingApp();
  try {
    const port = await listenOn(app);

    // The request in the report, at the address that route now has:
    //   curl -s -X POST http://127.0.0.1:PORT/auth/signin \
    //     -d "passphrase=..." -H "content-type: application/x-www-form-urlencoded"
    // What came back was 500 with the failed query and what the founder had
    // typed as a bound parameter, in the body, in a browser.
    const payload = `passphrase=${TYPED}`;
    const wire = readWire(
      await overTheWire(
        port,
        `POST /auth/signin HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: ${FORM}\r\n` +
          `Content-Length: ${String(payload.length)}\r\nConnection: close\r\n\r\n${payload}`,
        3000,
      ),
    );

    assertNothingInternalOnTheWire('the bug report curl', wire);
    assert.equal(wire.statusCode, 500, `the request did not reach the failure it is supposed to: ${wire.statusLine}`);
    assert.equal(wire.complete, true, 'the response was never finished, so curl would sit there');
    assert.doesNotMatch(wire.body, new RegExp(TYPED), 'what the founder typed came back on the wire');
    assert.match(wire.body, /Nothing you have made is affected/, 'the founder was not told their work is safe');
    assert.match(wire.body, /LH[0-9BCDFGHJKMNPQRSTVWXZ]{6}/, 'the founder was given nothing to quote to a mentor');
  } finally {
    await app.close();
  }
});

/**
 * A QUERY STRING IS SOMEBODY ELSE'S WRITING AND A LOG LINE IS FOREVER.
 *
 * This used to be about `/auth/verify?t=`, which carried a live sign in token.
 * There are no tokens now, and the rule outlived them for a better reason: a
 * query string is written by whoever sent the link, so what lands in it is not
 * ours to predict. A founder who pastes their passphrase into an address bar,
 * or follows a link somebody built for them, must not have it written into a
 * log that outlives the request. errors.ts logs the path without its query and
 * this is the line that keeps it that way.
 */
test('A QUERY STRING NEVER REACHES THE LOG LINE, BECAUSE SOMEBODY ELSE WROTE IT', async () => {
  const { app, log } = await buildThrowingApp();
  try {
    for (const url of [
      `/api/home?passphrase=${TYPED}`,
      `/api/files/founder-brain.md?t=${TYPED}`,
    ]) {
      await app.inject({ method: 'GET', url, headers: { cookie: COOKIE, accept: 'text/html' } });
    }
    assert.ok(log.lines.length > 0, 'nothing was logged, so this proves nothing');
    for (const line of log.lines) {
      assert.doesNotMatch(JSON.stringify(line.obj), new RegExp(TYPED), 'a query string was written to the log');
    }
  } finally {
    await app.close();
  }
});

// --------------------------------------------------- the shapes Fastify makes

test("FASTIFY'S OWN REFUSALS COME BACK IN OUR WORDS, NOT ITS OWN", async () => {
  const app = Fastify({ logger: false, bodyLimit: 200 });
  try {
    installErrorHandler(app, new TestLogger());
    app.post('/api/thing', async () => ({ ok: true }));
    await app.ready();

    // `InjectOptions`, not `Parameters<FastifyInstance['inject']>[0]`. `inject` is
    // overloaded, and Parameters<> resolves to the LAST overload, which is the zero
    // argument one, so that expression is the empty tuple and every case below fails
    // to typecheck against `undefined`. Fastify re exports light-my-request's own
    // option type for exactly this.
    const cases: readonly (readonly [string, number, InjectOptions])[] = [
      [
        'a body that is not the JSON it claims to be',
        ERRORS.badRequest.status,
        { method: 'POST', url: '/api/thing', headers: { 'content-type': 'application/json' }, payload: '{oops' },
      ],
      [
        'a body over the wall',
        ERRORS.messageTooLong.status,
        { method: 'POST', url: '/api/thing', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ a: 'x'.repeat(500) }) },
      ],
      [
        'a content type nothing parses',
        ERRORS.wrongFormat.status,
        { method: 'POST', url: '/api/thing', headers: { 'content-type': 'application/x-tar' }, payload: 'x' },
      ],
    ];

    for (const [what, status, injection] of cases) {
      const res = await app.inject(injection);
      assert.equal(res.statusCode, status, what);
      assertNothingInternal(what, res);
      const body = JSON.parse(res.body) as { error?: unknown; message?: unknown; incident?: unknown };
      assert.equal(typeof body.error, 'string', `${what} kept the two field shape`);
      assert.equal(typeof body.message, 'string', `${what} carries a sentence`);
      // A refusal that is the client's mistake is not an incident. Handing out an
      // id for one would send a founder to a mentor over a reload.
      assert.equal(body.incident, undefined, `${what} is not an incident`);
    }
  } finally {
    await app.close();
  }
});

test('ANYTHING UNRECOGNISED FAILS CLOSED AS A 500, WHATEVER STATUS IT WAS CARRYING', async () => {
  const app = Fastify({ logger: false });
  try {
    installErrorHandler(app, new TestLogger());
    // A 4xx nobody wrote a sentence for. Passing its status through would put
    // advice on a founder's screen that no author chose, and leave no trace.
    app.get('/api/teapot', async () => {
      throw Object.assign(new Error(SENTINEL), { statusCode: 418, code: 'IM_A_TEAPOT' });
    });
    // Not an Error at all. A rejected promise can carry anything.
    app.get('/api/thrown-string', () => Promise.reject(SENTINEL));
    app.get('/api/thrown-object', () => Promise.reject({ message: SENTINEL, statusCode: 200 }));
    await app.ready();

    for (const url of ['/api/teapot', '/api/thrown-string', '/api/thrown-object']) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 500, `${url} failed closed`);
      assertNothingInternal(url, res);
      const body = JSON.parse(res.body) as { incident?: unknown };
      assert.equal(typeof body.incident, 'string', `${url} carries an id to quote`);
    }
  } finally {
    await app.close();
  }
});

test('A DOWNLOAD THAT FAILS IS NOT SAVED TO A FOUNDER DISK AS A BROKEN FILE', async () => {
  const app = Fastify({ logger: false });
  try {
    installErrorHandler(app, new TestLogger());

    /**
     * `/api/files.zip` in miniature. It sets the headers for the archive, then
     * builds the archive, and the build is what throws.
     *
     * A reply is a mutable object, so those headers are still on it when the
     * error handler writes a different body onto it. With the disposition still
     * attached the browser never shows the sentence at all: it saves a file
     * called your-files.zip with an error page inside, and the founder finds out
     * days later when they open it. That is rule 4 broken quietly, which is worse
     * than breaking it loudly.
     */
    const archive = async (_request: unknown, reply: FastifyReply): Promise<never> => {
      reply.header('content-type', 'application/zip');
      reply.header('content-disposition', 'attachment; filename="your-files.zip"');
      reply.header('cache-control', 'private, max-age=600');
      reply.header('etag', 'W/"an-archive-that-was-never-built"');
      reply.header('content-length', '4823991');
      throw new Error(SENTINEL);
    };
    // Both branches. /api/ is answered as JSON, everything else as a page, and
    // the headers have to come off on both.
    app.get('/api/files.zip', archive);
    app.get('/download', archive);
    await app.ready();

    for (const url of ['/api/files.zip', '/download']) {
      const res = await app.inject({ method: 'GET', url, headers: { accept: 'text/html,application/xhtml+xml' } });
      assert.equal(res.statusCode, 500, url);
      assertNothingInternal(`a failed download at ${url}`, res);
      assert.equal(res.headers['content-disposition'], undefined, `${url} offered the failure as a download`);
      assert.equal(res.headers['etag'], undefined, `${url} carried an ETag for a body that was never built`);
      assert.equal(res.headers['cache-control'], 'no-store', `${url} let a failure be cached`);
      assert.doesNotMatch(String(res.headers['content-type']), /zip/, `${url} labelled a sentence as an archive`);
    }
  } finally {
    await app.close();
  }
});

test('A SESSION COOKIE SURVIVES A FAILURE, BECAUSE THE ROW IT MATCHES ALREADY MOVED', async () => {
  const app = Fastify({ logger: false });
  try {
    installErrorHandler(app, new TestLogger());
    // What requireFounder does: it rolls the session forward, writes the row, and
    // sets the cookie to match. If the request then fails, dropping that header
    // leaves the browser and the database disagreeing about when the founder is
    // signed out, and the disagreement only shows up as a surprise sign out days
    // later. So this one header is kept and every other one goes.
    app.get('/api/rolled', async (_request, reply) => {
      reply.header('set-cookie', 'lh_session=rolled; Path=/; HttpOnly; SameSite=Lax');
      reply.header('etag', 'W/"gone"');
      throw new Error(SENTINEL);
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/rolled' });
    assert.equal(res.statusCode, 500);
    assertNothingInternal('a failure after the session rolled', res);
    assert.match(String(res.headers['set-cookie']), /lh_session=rolled/, 'the rolled session cookie was dropped');
    assert.equal(res.headers['etag'], undefined, 'everything else should still come off');
  } finally {
    await app.close();
  }
});

test('A THROW AFTER THE HEADERS HAVE GONE CLOSES THE RESPONSE INSTEAD OF THROWING AGAIN', async () => {
  const log = new TestLogger();
  const app = Fastify({ logger: false });
  try {
    installErrorHandler(app, log);
    // Headers written straight onto the raw response and then a throw. From that
    // moment there is no body left to replace, and calling send would throw
    // inside the error handler, which is the one place a throw has nowhere left
    // to go: the request hangs and the founder watches a spinner.
    app.get('/api/half-written', async (_request, reply) => {
      reply.raw.writeHead(200, { 'content-type': 'text/event-stream' });
      reply.raw.write(': open\n\n');
      throw new Error(SENTINEL);
    });
    await app.ready();
    const port = await listenOn(app);

    const wire = readWire(
      await overTheWire(port, 'GET /api/half-written HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 3000),
    );
    assertNothingInternalOnTheWire('a half written response that threw', wire);
    assert.equal(wire.statusCode, 200, 'the headers that had already gone out stand');
    assert.equal(wire.body, ': open\n\n', 'something was appended to a response that was already out');
    // THE ASSERTION THIS TEST IS FOR. alreadyCommitted() saw the headers were
    // gone and ended the response instead of trying to send a second one. Without
    // that branch the send throws inside the error handler, which is the one
    // place a throw has nowhere left to go, and the founder holds a connection
    // that never finishes.
    assert.equal(wire.complete, true, 'the response was left open, so the founder watches a spinner that never stops');
    // The detail still reached the log. Losing the body is not a reason to lose
    // the record of why.
    assert.ok(
      log.lines.some((l) => String(l.obj['detail']).includes(SENTINEL)),
      'a failure on a half written response was not logged',
    );
  } finally {
    await app.close();
  }
});

test('FASTIFY NEVER HANDS THIS HANDLER A REPLY THAT WAS HIJACKED, SO THE STREAM ROUTE OWNS ITS OWN FAILURES', async () => {
  const log = new TestLogger();
  const app = Fastify({ logger: false });
  try {
    installErrorHandler(app, log);
    // Exactly what src/server/routes/stream.ts does: hijack, write the SSE
    // headers, then fail.
    app.get('/api/threads/x/stream', async (_request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, { 'content-type': 'text/event-stream' });
      reply.raw.write(': open\n\n');
      throw new Error(SENTINEL);
    });
    await app.ready();
    const port = await listenOn(app);

    // A deadline, not a wait for the end, because there is no end. Nothing on
    // the server side ever finishes this response, so the read has to stop itself.
    const wire = readWire(await overTheWire(port, 'GET /api/threads/x/stream HTTP/1.1\r\nHost: x\r\n\r\n', 1000));

    // THE PART THAT MUST NEVER CHANGE. Whatever the framework does with a
    // hijacked reply, the founder's socket carries only what the route wrote.
    assertNothingInternalOnTheWire('a hijacked stream that threw', wire);
    assert.equal(wire.body, ': open\n\n', 'something was appended to a hijacked stream');

    // THE PART THAT RECORDS WHY. reply.hijack() sets reply.sent, and Fastify
    // reads reply.sent on a rejected handler, logs through its own logger and
    // returns without ever calling setErrorHandler. So nothing in errors.ts can
    // close a hijacked response, and stream.ts has to catch its own throws
    // between reply.hijack() and its try block or the founder holds a connection
    // that will never carry anything.
    //
    // IF THIS LINE GOES RED, Fastify has changed and that is now this file's job.
    // Read the reply.sent check in node_modules/fastify/lib/wrap-thenable.js
    // before deciding what to do about it.
    assert.equal(
      log.lines.filter((l) => typeof l.obj['incident'] === 'string').length,
      0,
      'Fastify now routes a hijacked reply to the error handler, so errors.ts can close one and stream.ts no longer has to',
    );

    // MEASURED, AND LEFT AS A NOTE RATHER THAN AN ASSERTION. wire.complete is
    // false here today: the response is never terminated and the browser holds a
    // connection that will never carry anything. That is stream.ts's to fix, by
    // catching its own throws between reply.hijack() and its try block, and
    // asserting it here either way would make this test go red on the day
    // somebody fixes it. What this file is responsible for is the line above and
    // the two before it: nothing internal on the wire, whatever happens next.
  } finally {
    await app.close();
  }
});

// ------------------------------------------------------------- what it reads

test('EVERY SENTENCE IN THIS FILE OBEYS THE HOUSE STYLE, INCIDENT ID INCLUDED', () => {
  for (const [name, e] of Object.entries(ERRORS)) {
    const result = checkProseText(`ERRORS.${name}`, e.message);
    assert.equal(result.violations.length, 0, `ERRORS.${name}: ${result.violations.map((v) => v.message).join(' ')}`);
  }
  // The id is generated, so the rule it could break is generated too. A hyphen
  // between two of its characters would read to the prose rules as a range
  // written with a dash, which is why there is no separator in it. Five hundred
  // rolls, because a rule that only fails one time in a hundred fails on the day.
  for (let i = 0; i < 500; i += 1) {
    const id = newIncidentId();
    assert.match(id, /^LH[0-9BCDFGHJKMNPQRSTVWXZ]{6}$/, `an unreadable incident id: ${id}`);
    const result = checkProseText('the 500 sentence', serverFaultMessage(id));
    assert.equal(result.violations.length, 0, `${id}: ${result.violations.map((v) => v.message).join(' ')}`);
  }
});

test('THE ERROR PAGE ENDS ON SOMEWHERE TO GO, AND ESCAPES WHAT IT PRINTS', () => {
  const page = founderErrorPage(ERRORS.serverFault, serverFaultMessage('LH234567'), 'LH234567');
  assert.match(page, /<a href="\/">/, 'a way forward');
  assert.match(page, /LH234567/, 'the id to quote');
  assert.doesNotMatch(page, /https?:\/\/(?!localhost)/, 'nothing loaded from another host');

  const signedOut = founderErrorPage(ERRORS.notSignedIn, ERRORS.notSignedIn.message);
  assert.match(signedOut, /<a href="\/auth\/signin">/, 'a signed out founder is sent to sign in');

  // Every value is escaped on the way in, with no exception made for one that
  // "cannot" contain markup.
  const nasty = founderErrorPage(ERRORS.serverFault, 'a & b', '<script>x</script>');
  assert.doesNotMatch(nasty, /<script>/);
  assert.match(nasty, /&amp;/);
});

test('THE BUNDLE GETS JSON AND A BROWSER GETS A PAGE', () => {
  const ask = (url: string, accept: string): boolean =>
    wantsHtml({ url, headers: { accept } } as unknown as Parameters<typeof wantsHtml>[0]);

  assert.equal(ask('/auth/signin', 'text/html,application/xhtml+xml'), true, 'a form post reads a page');
  assert.equal(ask('/auth/signin', '*/*'), false, 'fetch reads JSON');
  assert.equal(ask('/api/threads', 'text/html'), false, 'the API is JSON whatever is asked for');
  assert.equal(ask('/auth/signout', 'application/json'), false);
});

// ------------------------------------------------- the wiring, read as source

/**
 * The behavioural tests above build their own instance, so none of them can see
 * whether the real process installs the handler at all. Fastify accepts
 * `setErrorHandler` after `ready()` and then never calls it, so the way this
 * hole reopens is silent. This is the line that makes it loud.
 */
test('src/server/index.ts INSTALLS THE HANDLER, AND DOES IT BEFORE THE FIRST ROUTE', () => {
  const path = fileURLToPath(new URL('../index.ts', import.meta.url));
  const source = readFileSync(path, 'utf8');

  const installed = source.indexOf('installErrorHandler(app');
  assert.notEqual(installed, -1, 'src/server/index.ts does not install the error handler');

  for (const registration of ['registerAuth(app)', 'registerApiRoutes(app', 'app.get(', 'registerBrowserBundle(app']) {
    const at = source.indexOf(registration);
    if (at === -1) continue;
    assert.ok(
      installed < at,
      `installErrorHandler must come before ${registration}. Fastify compiles the handler into each route at ready time.`,
    );
  }

  // One error handler, and it is this one. A second, hand rolled, is how the
  // driver's message finds its way back to a browser.
  assert.equal(
    (/\.setErrorHandler\(/g.exec(source) ?? []).length,
    0,
    'src/server/index.ts sets its own error handler. There is one, in routes/errors.ts.',
  );
});
