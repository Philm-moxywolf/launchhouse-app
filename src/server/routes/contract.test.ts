/**
 * src/server/routes/contract.test.ts
 *
 * WHAT THIS IS. The two halves of the app, checked against each other. Every
 * address `src/web/lib/api.ts` calls, walked against every route this server
 * registers, and it fails in both directions.
 *
 * WHY IT EXISTS, and it is the most expensive lesson in this build.
 *
 * The browser and the server were written at the same time against the same
 * design document, by different people, and nothing compared them. Both halves
 * were green. 795 tests passed. `tsc` was clean on both projects. The golden
 * suite was 36 for 36. And a founder who pressed "Send me a link" read "There is
 * nothing at that address. Open your list and pick from there.", because
 * `POST /api/auth/request-link` had never been registered. FIFTEEN of the
 * browser's calls answered 404, including every one on the way in. A founder who
 * WAS on the roster was told their address was wrong.
 *
 * THAT ADDRESS NO LONGER EXISTS ON EITHER SIDE, and the way it went is this test
 * working. Signing in is a form post to `/auth/signin` now, so the browser
 * stopped calling `/api/auth/request-link` and the route behind it was deleted
 * in the same change. Had only one side moved, the run below would have named
 * it in one of the two directions.
 *
 * Not one of those 795 tests could have caught it, because every one of them
 * tested a half. The server tests drove routes that exist. The browser tests
 * stubbed fetch. The gap between them was the product, and nothing was looking
 * at it.
 *
 * SO THIS TEST LOOKS AT THE GAP, AND ONLY AT THE GAP.
 *
 *   Direction one: a path the browser calls with no route behind it. That is
 *   the failure above, and it is the one that shuts the front door.
 *
 *   Direction two: a route with nothing calling it. That is quieter and it is
 *   not cosmetic. Surface nobody calls is surface nobody exercises, and it is
 *   still surface somebody has to account for when the question is what a closed
 *   cohort's data is reachable through. Two routes were found this way the day
 *   this test was written, and both are gone.
 *
 * IT IS PROVED TO FAIL, HERE, PERMANENTLY. The last two tests in this file run
 * the comparison over a made up api.ts with a path nobody registered, and over a
 * made up route table with a route nobody calls, and assert that each is
 * reported. A test that has only ever been seen passing is a test nobody has
 * checked, and this one is load bearing enough that "it passed" is not evidence.
 *
 * AND IT ROUTES THE PATHS FOR REAL, because a name comparison is not the same
 * question as a router's answer. `/api/files/download.zip` and `/api/files/*`
 * are two routes whose paths overlap, and which one answers is a precedence rule
 * inside find-my-way rather than anything in this file. So every path is also
 * injected at the real app, with no cookie, and must come back refused rather
 * than not found.
 *
 * WHAT IT CALLS. The real Fastify instance from ./test-fixtures.ts, and the
 * text of src/web/lib/api.ts.
 * WHAT IT READS. One source file. WHAT IT WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildHarness } from './test-fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_TS = join(HERE, '../../web/lib/api.ts');

/** One address, and how it is reached. HEAD and OPTIONS are the router's, not ours. */
export interface Call {
  readonly method: string;
  readonly path: string;
  /** Where it came from, so a failure names a line rather than a mystery. */
  readonly from: string;
}

/**
 * Every path `api.ts` names, read out of the file itself.
 *
 * READ FROM THE SOURCE RATHER THAN FROM AN EXPORTED LIST, and that is the whole
 * design of this scan. A list the file exports is a list somebody can forget to
 * add to, and the forgetting looks exactly like the bug this test exists to
 * catch. The strings the code actually passes to fetch cannot be forgotten,
 * because they are the thing that goes on the wire.
 *
 * Two shapes are recognised, because those are the two the file uses. A call
 * through one of the helpers, where the helper name gives the method. And
 * a URL builder that returns an address for the browser to follow, which is
 * always a GET: a link the browser saves a file from, and the stream.
 */
export function callsIn(source: string): readonly Call[] {
  // Every `${...}` becomes one character first, so the regexes below do not have
  // to reason about a quote inside a template hole. `downloadAllUrl` has one:
  // its query string is written as a ternary with two quoted branches in it, and
  // a pattern that stopped at the first quote read the address as
  // `/api/files/download.zip${includeSnapshots ` and reported it missing.
  const flat = source.replace(/\$\{[^{}]*\}/g, HOLE);
  const found: Call[] = [];

  // get<T>("/api/x"), getText("/api/x"), post<T>(`/api/x/${y}`), postVoid("/api/x").
  // getText comes first in the alternation, because `get` would otherwise match
  // the front of it and then fail on the bracket, and a helper that silently
  // matches nothing is a call this test cannot see.
  const viaHelper = /\b(getText|get|post|postVoid)\s*(?:<[^()]*?>)?\(\s*([`"'])([^`"']+)\2/g;
  for (const m of flat.matchAll(viaHelper)) {
    const helper = m[1] ?? '';
    const raw = m[3] ?? '';
    if (!raw.startsWith('/')) continue;
    found.push({
      method: helper === 'get' || helper === 'getText' ? 'GET' : 'POST',
      path: normalise(raw),
      from: `${helper}(${show(raw)})`,
    });
  }

  // return `/api/x/${y}/stream`. A builder hands the browser an address to
  // follow, which is a link or an EventSource, and both are GETs.
  const viaReturn = /return\s+([`"'])(\/[^`"']+)\1/g;
  for (const m of flat.matchAll(viaReturn)) {
    const raw = m[2] ?? '';
    found.push({ method: 'GET', path: normalise(raw), from: `return ${show(raw)}` });
  }

  // Deduplicated on method and path. One address reached two ways is one
  // address, and the `from` kept is the first that named it.
  const seen = new Set<string>();
  return found.filter((c) => {
    const key = `${c.method} ${c.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The stand in for a template hole. One character, so it cannot occur in a path. */
const HOLE = '\u0001';

/** The hole put back into something readable, for a failure message. */
function show(raw: string): string {
  return raw.split(HOLE).join('${...}');
}

/**
 * One shape for a path, whichever side of the wire wrote it.
 *
 * A template hole, a Fastify parameter and a hand written `:id` are the same
 * thing: one segment the caller fills in, so all three become `:p`.
 *
 * A hole that is NOT a whole segment is something the code appends to an
 * address rather than part of it, which today is one optional query string. The
 * address stops there. A written out query string goes for the same reason: a
 * route is registered per path, never per query.
 */
export function normalise(path: string): string {
  const noQuery = path.split('?')[0] ?? '';
  // Cut at the first hole that is glued to the end of a segment rather than
  // filling one. Found by hand rather than with a pattern, because a control
  // character inside a regular expression is the shape of a mistake and the
  // linter is right to refuse it.
  let stem = noQuery;
  for (let i = 0; i < noQuery.length; i += 1) {
    if (noQuery[i] === HOLE && noQuery[i - 1] !== '/') {
      stem = noQuery.slice(0, i);
      break;
    }
  }
  const filled = stem
    .split('/')
    .map((seg) => (seg === HOLE || /^:[A-Za-z_][A-Za-z0-9_]*$/.test(seg) ? ':p' : seg))
    .join('/');
  return filled.length > 1 && filled.endsWith('/') ? filled.slice(0, -1) : filled;
}

/**
 * Every route the app has, read back out of `app.printRoutes()`.
 *
 * The printout is a tree with the common prefix folded out of it, so a child
 * line carries only its own fragment and the depth says whose child it is.
 * Rebuilt here into whole paths with a stack, because whole paths are what the
 * browser asks for.
 *
 * THE TREE SPLITS ON CHARACTERS, NOT ON SLASHES. `/api/files/*` comes back as a
 * `*` hanging under `/api/files`, which joins to `/api/files*` with no slash in
 * the middle. That is the router's own shape and it is left alone, because the
 * matcher below reads a `*` as "and everything after this" wherever it appears.
 *
 * HEAD is dropped. Fastify adds one for every GET without being asked, so
 * requiring a caller for it would fail every route in the app.
 */
export function routesInPrintout(tree: string): readonly Call[] {
  const out: Call[] = [];
  const stack: string[] = [];

  for (const line of tree.split('\n')) {
    if (line.trim() === '') continue;
    // The prefix is drawn from four character units: "├── ", "│   ", "└── ",
    // "    ". Counting them is what gives the depth.
    const drawn = /^[\s│├└─]*/.exec(line)?.[0] ?? '';
    const depth = Math.floor([...drawn].length / 4);
    const rest = line.slice(drawn.length);
    const at = rest.lastIndexOf(' (');
    const fragment = at === -1 ? rest : rest.slice(0, at);
    const methods = at === -1 ? '' : rest.slice(at + 2).replace(/\)\s*$/, '');

    stack.length = depth;
    stack[depth] = fragment;
    if (methods === '') continue;

    const path = normalise(stack.slice(0, depth + 1).join(''));
    for (const method of methods.split(',').map((m) => m.trim())) {
      if (method === 'HEAD' || method === 'OPTIONS' || method === '') continue;
      out.push({ method, path, from: `${method} ${path}` });
    }
  }
  return out;
}

/**
 * Does this route answer this call?
 *
 * The route becomes a pattern: `:p` is one segment, `*` is everything left. That
 * is the router's own reading of both, and doing it as a pattern rather than
 * segment by segment is what makes `/api/files*` answer `/api/files/anything`
 * even though the printout glued the star to the word before it.
 */
export function routeAnswers(route: string, call: string): boolean {
  const pattern = route
    .split(/(:p|\*)/)
    .map((part) => (part === ':p' ? '[^/]+' : part === '*' ? '.*' : escapeRegExp(part)))
    .join('');
  return new RegExp(`^${pattern}$`).test(call);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * How closely a route describes an address. Higher wins.
 *
 * IT MATTERS BECAUSE OF THE SECOND DIRECTION. Two routes can both answer the
 * same shape, and the router gives the request to the more specific one. A
 * catch all that matched everything would otherwise look like the caller of
 * every route in the file, and then a route nobody calls would never be found.
 * So each call is given to the best route that answers it, and a route nobody
 * was given is a route nobody calls.
 */
function specificity(path: string): number {
  const literal = path.replace(/:p|\*/g, '').length;
  return (path.includes('*') ? 0 : 100_000) + literal;
}

/**
 * The comparison itself, over two lists rather than over the real app.
 *
 * Separated so the last tests in this file can hand it a made up pair and watch
 * it report a miss. A guard that has only been seen passing is a guard nobody
 * has checked.
 */
export function compare(
  calls: readonly Call[],
  routes: readonly Call[],
): { readonly unrouted: readonly Call[]; readonly uncalled: readonly Call[] } {
  const unrouted: Call[] = [];
  const used = new Set<Call>();

  for (const call of calls) {
    const answering = routes
      .filter((r) => r.method === call.method && routeAnswers(r.path, call.path))
      .sort((a, b) => specificity(b.path) - specificity(a.path));
    const best = answering[0];
    if (best === undefined) unrouted.push(call);
    else used.add(best);
  }

  return { unrouted, uncalled: routes.filter((r) => !used.has(r)) };
}

/** Only the app's own API. `/auth/` is server rendered pages a browser navigates to. */
function apiOnly(list: readonly Call[]): readonly Call[] {
  return list.filter((c) => c.path.startsWith('/api/'));
}

async function bothSides(): Promise<{
  calls: readonly Call[];
  routes: readonly Call[];
  close: () => Promise<void>;
}> {
  const h = await buildHarness();
  const calls = apiOnly(callsIn(readFileSync(API_TS, 'utf8')));
  const routes = apiOnly(routesInPrintout(h.app.printRoutes({ commonPrefix: false })));
  return {
    calls,
    routes,
    close: async () => {
      await h.app.close();
    },
  };
}

// ---------------------------------------------------------------------------
// The scan has to actually find things
// ---------------------------------------------------------------------------

test('THE SCAN READS BOTH SIDES, SO A PASS IS NOT AN EMPTY COMPARISON', async () => {
  const { calls, routes, close } = await bothSides();
  // Floors, not exact counts. An exact count is a test that fails every time
  // somebody adds a screen, which teaches people to edit the number. A floor
  // fails only when the scan itself has stopped working, which is the thing
  // that would make everything below vacuously true.
  assert.ok(calls.length >= 15, `only ${String(calls.length)} calls were found in api.ts, so the scan is broken`);
  assert.ok(routes.length >= 15, `only ${String(routes.length)} routes were found, so the printout parse is broken`);

  // Two specific addresses, one per side, so a regex that matches the wrong
  // half of the file is caught rather than counted.
  // One POST and one GET, on opposite sides of the file, so a pattern that
  // matches only half of it is caught rather than counted.
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/api/setup/profile'));
  assert.ok(calls.some((c) => c.method === 'GET' && c.path === '/api/threads/:p/stream'));
  assert.ok(routes.some((r) => r.method === 'GET' && r.path === '/api/me'));
  await close();
});

// ---------------------------------------------------------------------------
// Direction one: the front door
// ---------------------------------------------------------------------------

test('EVERY ADDRESS THE BROWSER CALLS HAS A ROUTE BEHIND IT', async () => {
  const { calls, routes, close } = await bothSides();
  const { unrouted } = compare(calls, routes);
  assert.deepEqual(
    unrouted.map((c) => `${c.method} ${c.path}`),
    [],
    'the browser calls these and nothing answers them. A founder reads "There is nothing at that address."',
  );
  await close();
});

/**
 * The same question asked of the router rather than of two lists.
 *
 * A name comparison cannot see precedence. `/api/files/download.zip` and
 * `/api/files/*` overlap, and which one answers is decided inside find-my-way.
 * With no cookie every route in this app refuses, so the answer to "is anybody
 * home" is a 401 and the answer to "nobody registered this" is a 404. Two of
 * them are reachable signed out and answer 400 to an empty body, which is still
 * somebody being home.
 */
test('AND THE ROUTER ACTUALLY ANSWERS THEM, WHICH IS A DIFFERENT QUESTION', async () => {
  const h = await buildHarness();
  const calls = apiOnly(callsIn(readFileSync(API_TS, 'utf8')));

  for (const call of calls) {
    // A concrete value for every hole. The value never resolves to anything,
    // which does not matter: the request is refused before it is looked up.
    const url = call.path.replace(/:p/g, 'x');
    const res = await h.app.inject({
      method: call.method as 'GET',
      url,
      ...(call.method === 'POST' ? { headers: { 'content-type': 'application/json' }, payload: {} } : {}),
    });
    assert.notEqual(res.statusCode, 404, `${call.method} ${url} is not routed: ${res.body}`);
  }
  await h.app.close();
});

// ---------------------------------------------------------------------------
// Direction two: surface nobody calls
// ---------------------------------------------------------------------------

test('EVERY API ROUTE HAS SOMETHING THAT CALLS IT', async () => {
  const { calls, routes, close } = await bothSides();
  const { uncalled } = compare(calls, routes);
  assert.deepEqual(
    uncalled.map((r) => `${r.method} ${r.path}`),
    [],
    'these routes exist and nothing in api.ts asks for them. Delete the route, or call it.',
  );
  await close();
});

// ---------------------------------------------------------------------------
// The proof that it fails, kept rather than performed once
// ---------------------------------------------------------------------------

test('IT GOES RED ON A PATH WITH NO ROUTE', () => {
  // Made up on both sides on purpose. A proof of the mechanism must not depend
  // on the app being correct today, or the day the app is wrong this test
  // reports the app's fault as its own and nobody can tell which is which.
  const calls = callsIn('export function f() { return get<T>("/api/nothing-registered-here"); }');
  const routes: Call[] = [{ method: 'GET', path: '/api/something-else', from: 'made up' }];
  const { unrouted } = compare(apiOnly(calls), routes);
  assert.deepEqual(unrouted.map((c) => `${c.method} ${c.path}`), ['GET /api/nothing-registered-here']);
});

test('IT GOES RED ON A ROUTE WITH NO CALLER', () => {
  const calls: Call[] = [{ method: 'GET', path: '/api/asked-for', from: 'made up' }];
  const routes: Call[] = [
    { method: 'GET', path: '/api/asked-for', from: 'made up' },
    { method: 'GET', path: '/api/nobody-asks-for-this', from: 'made up' },
  ];
  const { unrouted, uncalled } = compare(calls, routes);
  assert.deepEqual(unrouted, []);
  assert.deepEqual(uncalled.map((r) => `${r.method} ${r.path}`), ['GET /api/nobody-asks-for-this']);
});

/**
 * A catch all does not count as the caller of everything under it.
 *
 * This is the case that would quietly turn the second direction off. Without
 * the specificity rule, `/api/files*` answers every address beginning with
 * `/api/files`, so every route in that family would look called and an orphan
 * among them would never be reported.
 */
test('A CATCH ALL DOES NOT HIDE AN ORPHAN UNDERNEATH IT', () => {
  const calls: Call[] = [{ method: 'GET', path: '/api/files/:p', from: 'made up' }];
  const routes: Call[] = [
    { method: 'GET', path: '/api/files*', from: 'made up' },
    { method: 'GET', path: '/api/files/:p/download', from: 'made up' },
  ];
  const { uncalled } = compare(calls, routes);
  assert.deepEqual(uncalled.map((r) => `${r.method} ${r.path}`), ['GET /api/files/:p/download']);
});

test('IT GOES RED WHEN THE ADDRESS MATCHES AND THE METHOD DOES NOT', () => {
  const calls: Call[] = [{ method: 'POST', path: '/api/thing', from: 'test' }];
  const routes: Call[] = [{ method: 'GET', path: '/api/thing', from: 'test' }];
  const { unrouted, uncalled } = compare(calls, routes);
  assert.deepEqual(unrouted.map((c) => `${c.method} ${c.path}`), ['POST /api/thing']);
  assert.deepEqual(uncalled.map((r) => `${r.method} ${r.path}`), ['GET /api/thing']);
});

/** The parser, on the shape the printout actually takes, including the nesting. */
test('THE PRINTOUT PARSE REBUILDS WHOLE PATHS FROM THE TREE', () => {
  const tree = [
    '├── /api/setup (GET, HEAD)',
    '│   ├── /profile (POST)',
    '│   └── /ghl/token (POST)',
    '└── /api/files (GET, HEAD)',
    '    ├── /download.zip (GET, HEAD)',
    '    └── * (GET, HEAD)',
  ].join('\n');
  assert.deepEqual(
    routesInPrintout(tree).map((r) => `${r.method} ${r.path}`),
    [
      'GET /api/setup',
      'POST /api/setup/profile',
      'POST /api/setup/ghl/token',
      'GET /api/files',
      'GET /api/files/download.zip',
      // Glued, because the tree splits on characters and not on slashes.
      'GET /api/files*',
    ],
  );
});
