/**
 * src/server/routes/routes.test.ts
 *
 * WHAT THIS IS. The HTTP layer, driven the way a browser drives it, with no
 * database, no API key and no network.
 *
 * WHY IT EXISTS. Four properties have to be true before 130 founders touch
 * this, and none of them can be argued from reading code.
 *
 *   Two founders each see only their own workspace.
 *   An address that is not on the roster is refused, honestly.
 *   A message sent twice is stored once.
 *   A founder who is waiting is given a number.
 *
 * The negative assertions are the valuable ones, because they test boundaries
 * the design states explicitly and they do not move when something else does.
 *
 * WHAT IT CALLS. The real Fastify instance from ./test-fixtures.ts.
 * WHAT IT READS AND WRITES. Nothing outside the process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FOUNDER_A, FOUNDER_B } from '../auth/test-fixtures.ts';
import { visibleRoutes } from './threads.ts';
import { buildHarness, TestQueue, type Harness } from './test-fixtures.ts';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function newThread(h: Harness, cookie: string, routeId = 'founder-brain'): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/threads',
    headers: { cookie, ...JSON_HEADERS },
    payload: { routeId },
  });
  assert.equal(res.statusCode, 201, res.body);
  return (JSON.parse(res.body) as { thread: { id: string } }).thread.id;
}

/** Open a stream and collect frames as they arrive, the way an EventSource would. */
async function openStream(
  h: Harness,
  cookie: string,
  threadId: string,
  lastEventId?: number,
): Promise<{ frames: string[]; text: () => string; settle: () => Promise<void> }> {
  const url =
    lastEventId === undefined
      ? `/api/threads/${threadId}/stream`
      : `/api/threads/${threadId}/stream?lastEventId=${String(lastEventId)}`;
  const res = await h.app.inject({ method: 'GET', url, headers: { cookie }, payloadAsStream: true });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers['content-type']), /text\/event-stream/);
  // The four headers the Replit proxy needs. x-accel-buffering is the one that
  // is easy to leave out and impossible to diagnose from the client.
  assert.equal(res.headers['x-accel-buffering'], 'no');
  assert.equal(res.headers['cache-control'], 'no-cache, no-transform');

  const frames: string[] = [];
  res.stream().on('data', (chunk: Buffer) => frames.push(chunk.toString('utf8')));
  const settle = (): Promise<void> => new Promise((r) => setImmediate(() => setImmediate(() => r())));
  await settle();
  return { frames, text: () => frames.join(''), settle };
}

// ---------------------------------------------------------------------------
// The tenancy boundary
// ---------------------------------------------------------------------------

test('TWO FOUNDERS SIGN IN AND EACH SEES ONLY THEIR OWN WORKSPACE', async () => {
  const h = await buildHarness();
  const cookieA = await h.signIn('ama@example.com');
  const cookieB = await h.signIn('ben@example.com');

  const threadA = await newThread(h, cookieA);
  const threadB = await newThread(h, cookieB);
  h.store.putFile(FOUNDER_A, 'founder-brain.md', '# Ama\nTrack: b2b\n');
  h.store.putFile(FOUNDER_B, 'founder-brain.md', '# Ben\nTrack: b2c\n');

  // Each founder's home carries their own thread and nobody else's. This is the
  // only surface that hands a founder a thread id, which is why the boundary is
  // asserted here rather than on a list route: there is no list route, because
  // nothing called one.
  const homeA = JSON.parse((await h.app.inject({ method: 'GET', url: '/api/home', headers: { cookie: cookieA } })).body) as {
    routes: Record<string, { threadId: string | null }>;
  };
  const homeB = JSON.parse((await h.app.inject({ method: 'GET', url: '/api/home', headers: { cookie: cookieB } })).body) as {
    routes: Record<string, { threadId: string | null }>;
  };
  assert.equal(homeA.routes['founder-brain']?.threadId, threadA);
  assert.equal(homeB.routes['founder-brain']?.threadId, threadB);
  assert.ok(
    !Object.values(homeA.routes).some((r) => r.threadId === threadB),
    'not one of A rows carries B thread',
  );

  // B cannot read, write to, or stream A's thread. Every one is a 404 rather
  // than a 403, because "you may not see that" tells B that it exists.
  const reads = await Promise.all([
    h.app.inject({ method: 'GET', url: `/api/threads/${threadA}`, headers: { cookie: cookieB } }),
    h.app.inject({
      method: 'POST',
      url: `/api/threads/${threadA}/messages`,
      headers: { cookie: cookieB, ...JSON_HEADERS },
      payload: { text: 'let me in', clientMsgId: 'b-1' },
    }),
    h.app.inject({ method: 'GET', url: `/api/threads/${threadA}/stream`, headers: { cookie: cookieB } }),
    h.app.inject({
      method: 'POST',
      url: `/api/threads/${threadA}/interrupt`,
      headers: { cookie: cookieB, ...JSON_HEADERS },
      payload: { turnId: 'tn_1' },
    }),
  ]);
  for (const res of reads) {
    assert.equal(res.statusCode, 404, res.body);
    assert.equal((JSON.parse(res.body) as { error: string }).error, 'no_such_thread');
  }
  // And nothing of A's was written by any of those attempts.
  assert.equal(h.store.messages.filter((m) => m.threadId === threadA).length, 0);

  // The files each founder gets back are their own bytes.
  const fileA = await h.app.inject({ method: 'GET', url: '/api/files/founder-brain.md', headers: { cookie: cookieA } });
  const fileB = await h.app.inject({ method: 'GET', url: '/api/files/founder-brain.md', headers: { cookie: cookieB } });
  assert.match(fileA.body, /# Ama/);
  assert.match(fileB.body, /# Ben/);
  assert.doesNotMatch(fileB.body, /Ama/);

  assert.ok(threadB.length > 0);
  await h.app.close();
});

test('NO ROUTE READS A FOUNDER ID FROM THE BODY OR THE QUERY STRING', async () => {
  const h = await buildHarness();
  const cookieA = await h.signIn('ama@example.com');
  const cookieB = await h.signIn('ben@example.com');
  const threadA = await newThread(h, cookieA);

  // B sends A's founder id every way a body and a query string allow.
  const attempts = await Promise.all([
    h.app.inject({
      method: 'POST',
      url: `/api/threads/${threadA}/messages`,
      headers: { cookie: cookieB, ...JSON_HEADERS },
      payload: { text: 'hello', clientMsgId: 'x1', founderId: FOUNDER_A },
    }),
    h.app.inject({ method: 'GET', url: `/api/files?founderId=${FOUNDER_A}`, headers: { cookie: cookieB } }),
    h.app.inject({ method: 'GET', url: `/api/files/download.zip?founderId=${FOUNDER_A}`, headers: { cookie: cookieB } }),
  ]);
  assert.equal(attempts[0]?.statusCode, 404);

  h.store.putFile(FOUNDER_A, 'secret.md', 'A only');
  const listed = JSON.parse(
    (await h.app.inject({ method: 'GET', url: `/api/files?founderId=${FOUNDER_A}`, headers: { cookie: cookieB } })).body,
  ) as { rows: Array<{ name: string; status: string }> };
  // Every row of the gate table is listed whether or not it exists, so what
  // proves the boundary here is that not one of them has been made. A's
  // secret.md is not a gate file, so if B were being handed A's folder it would
  // arrive as a row of its own.
  assert.deepEqual(
    listed.rows.filter((r) => r.status !== 'missing'),
    [],
    'B asked for A by id and got their own empty folder',
  );
  assert.ok(!listed.rows.some((r) => r.name === 'secret.md'), 'and not one row of A\'s');
  await h.app.close();
});

test('EVERY API ROUTE REFUSES A REQUEST WITH NO SESSION', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);

  const urls = [
    ['GET', '/api/me'],
    ['GET', '/api/home'],
    ['GET', '/api/setup'],
    ['GET', '/api/gates'],
    ['GET', `/api/threads/${threadId}`],
    ['POST', '/api/threads'],
    ['GET', `/api/threads/${threadId}/stream`],
    ['GET', '/api/files'],
    ['GET', '/api/files/founder-brain.md'],
    ['GET', '/api/files/founder-brain.md/download'],
    ['GET', '/api/files/download.zip'],
  ] as const;
  for (const [method, url] of urls) {
    const res = await h.app.inject({ method, url });
    assert.equal(res.statusCode, 401, `${method} ${url} was not refused`);
    assert.equal((JSON.parse(res.body) as { error: string }).error, 'not_signed_in');
  }
  await h.app.close();
});

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

test('AN ADDRESS THAT IS NOT ON THE ROSTER GETS AN HONEST SCREEN AND NO EMAIL', async () => {
  const h = await buildHarness();
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/request',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ email: 'nobody@example.com' }).toString(),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /We cannot find that address/);
  assert.match(res.body, /nobody@example\.com/, 'it shows what they typed, so a typo is visible');
  assert.match(res.body, /Try another address/);
  assert.match(res.body, /Tell a mentor/);
  assert.equal(h.mailer.sent.length, 0);

  // The second button is not decoration. It writes into the mentor queue.
  const asked = await h.app.inject({
    method: 'POST',
    url: '/auth/help',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ email: 'nobody@example.com' }).toString(),
  });
  assert.equal(asked.statusCode, 200);
  assert.equal(h.auth.mentorRequests.length, 1);
  assert.equal(h.auth.mentorRequests[0]?.email, 'nobody@example.com');
  await h.app.close();
});

test('THE ADDRESS ON THE ROSTER MISS SCREEN IS ESCAPED, BECAUSE IT IS TYPED BY WHOEVER IS AT THE KEYBOARD', async () => {
  const h = await buildHarness();
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/request',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ email: '<script>alert(1)</script>@x.com' }).toString(),
  });
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /<script>alert/);
  assert.match(res.body, /&lt;script&gt;/);
  await h.app.close();
});

// ---------------------------------------------------------------------------
// One founder message
// ---------------------------------------------------------------------------

test('THE POST RETURNS 202 WITH A TURN ID, STREAMS NOTHING, AND IS FAST', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);

  const started = process.hrtime.bigint();
  const res = await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/messages`,
    headers: { cookie, ...JSON_HEADERS },
    payload: { text: 'we sell to construction firms', clientMsgId: 'c-1' },
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(res.statusCode, 202);
  assert.match(String(res.headers['content-type']), /application\/json/);
  const body = JSON.parse(res.body) as { turnId: string; duplicate: boolean };
  assert.match(body.turnId, /^tn_/);
  assert.equal(body.duplicate, false);
  // The budget is 50 ms against a real database. Against Maps this is a
  // regression guard on the shape: it fails the moment somebody makes this
  // handler wait on a model, a subprocess, or a queue slot.
  assert.ok(ms < 50, `the accept took ${ms.toFixed(1)} ms`);

  // The turn is queued, and the message is stored once.
  assert.equal(h.store.messages.length, 1);
  assert.equal(h.store.turns.size, 1);
  await h.app.close();
});

test('A DOUBLE SENT MESSAGE IS STORED ONCE AND ANSWERED ONCE', async () => {
  let runs = 0;
  const h = await buildHarness({
    run: () => {
      runs += 1;
      return Promise.resolve();
    },
  });
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);

  const send = (): Promise<{ statusCode: number; body: string }> =>
    h.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/messages`,
      headers: { cookie, ...JSON_HEADERS },
      payload: { text: 'we sell to construction firms', clientMsgId: 'retry-me' },
    });

  const first = await send();
  const second = await send();
  await new Promise((r) => setImmediate(r));

  const a = JSON.parse(first.body) as { turnId: string; duplicate: boolean };
  const b = JSON.parse(second.body) as { turnId: string; duplicate: boolean };
  assert.equal(first.statusCode, 202);
  assert.equal(second.statusCode, 202);
  assert.equal(b.turnId, a.turnId, 'the retry is handed the turn it already has');
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);

  assert.equal(h.store.messages.length, 1, 'one message row');
  assert.equal(h.store.turns.size, 1, 'one turn row');
  assert.equal(runs, 1, 'and the model ran once, so the founder is not billed twice');
  await h.app.close();
});

test('WITHOUT A CLIENT MESSAGE ID, TWO SENDS ARE TWO MESSAGES, WHICH IS ALSO CORRECT', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);

  for (let i = 0; i < 2; i += 1) {
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/messages`,
      headers: { cookie, ...JSON_HEADERS },
      payload: { text: 'and another thing' },
    });
    assert.equal(res.statusCode, 202);
  }
  // A founder who genuinely types the same sentence twice has said it twice.
  // Only an id the browser supplies can tell that from a retry.
  assert.equal(h.store.messages.length, 2);
  await h.app.close();
});

test('THE SECOND TURN OF A THREAD IS HIGH PRIORITY, THE FIRST IS NOT', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);

  for (const clientMsgId of ['m1', 'm2']) {
    await h.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/messages`,
      headers: { cookie, ...JSON_HEADERS },
      payload: { text: 'hello', clientMsgId },
    });
  }
  const priorities = [...h.store.turns.values()].map((t) => t.priority);
  // High beats normal, because otherwise a stampede of new starts strands
  // thirty people halfway through an interview.
  assert.deepEqual(priorities, ['normal', 'high']);
  await h.app.close();
});

test('AN EMPTY MESSAGE, AN OVERSIZED PASTE AND A BAD ID ARE EACH REFUSED WITH A SENTENCE', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);
  const url = `/api/threads/${threadId}/messages`;

  const cases: Array<[Record<string, unknown>, number, string]> = [
    [{ text: '   ' }, 400, 'empty_message'],
    [{ text: 'x'.repeat(50_001) }, 413, 'message_too_long'],
    [{ text: 'hello', clientMsgId: 'has a space' }, 400, 'bad_client_msg_id'],
  ];
  for (const [payload, status, code] of cases) {
    const res = await h.app.inject({ method: 'POST', url, headers: { cookie, ...JSON_HEADERS }, payload });
    assert.equal(res.statusCode, status, JSON.stringify(payload).slice(0, 40));
    const body = JSON.parse(res.body) as { error: string; message: string };
    assert.equal(body.error, code);
    assert.ok(body.message.length > 20, 'every refusal carries a sentence, not just a code');
  }
  assert.equal(h.store.messages.length, 0);
  await h.app.close();
});

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

test('THE STREAM CARRIES A QUEUED POSITION, NOT A SPINNER WITH NO NUMBER', async () => {
  // No capacity, so every turn waits. This is the cohort told "now run the
  // Founder Brain" at the same minute, without sixty five subprocesses.
  const h = await buildHarness({ queue: new TestQueue(0) });
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);
  const stream = await openStream(h, cookie, threadId);

  await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/messages`,
    headers: { cookie, ...JSON_HEADERS },
    payload: { text: 'build my founder brain', clientMsgId: 'q-1' },
  });
  await stream.settle();
  await stream.settle();

  const text = stream.text();
  assert.match(text, /event: queued/, text);
  const line = /event: queued\ndata: (.*)\n/.exec(text)?.[1] ?? '{}';
  const data = JSON.parse(line) as { position: number; text: string; turnId: string };
  assert.equal(data.position, 1);
  assert.ok(data.text.length > 0, 'and a sentence with the number in it');
  assert.match(data.turnId, /^tn_/);

  // Every frame carries an id, which is what makes a reconnect lossless.
  assert.match(text, /^id: \d+$/m);
  await h.app.close();
});

test('A REFUSAL ARRIVES ON THE STREAM, NOT AS A BARE 429 THE INTERFACE HAS TO GUESS ABOUT', async () => {
  const queue = new TestQueue();
  queue.refusal = {
    code: 'rate_hour',
    reason: 'That is a lot of messages in one hour. Give it a few minutes and try again. Nothing you have made is affected.',
  };
  const h = await buildHarness({ queue });
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);
  const stream = await openStream(h, cookie, threadId);

  const posted = await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/messages`,
    headers: { cookie, ...JSON_HEADERS },
    payload: { text: 'again', clientMsgId: 'r-1' },
  });
  // The POST still succeeds. The message is durable and the refusal is about
  // the turn, not about whether we heard them.
  assert.equal(posted.statusCode, 202);

  await stream.settle();
  await stream.settle();
  const text = stream.text();
  assert.match(text, /event: error/);
  assert.match(text, /rate_hour/);
  assert.match(text, /Nothing you have made is affected/);

  const turn = [...h.store.turns.values()][0];
  assert.equal(turn?.status, 'refused', 'and the turn is not left at queued looking like it is coming');
  await h.app.close();
});

test('A RECONNECT WITH Last-Event-ID REPLAYS WHAT WAS MISSED AND THEN GOES LIVE', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);

  for (const text of ['one', 'two', 'three']) {
    await h.events.emit({ founderId: FOUNDER_A, threadId, turnId: 'tn_a', kind: 'delta', data: { text } });
  }

  // The browser dropped after frame 1 and comes back saying so.
  const stream = await openStream(h, cookie, threadId, 1);
  const replayed = stream.text();
  assert.doesNotMatch(replayed, /"one"/, 'frame 1 was already read, so it is not sent again');
  assert.match(replayed, /"two"/);
  assert.match(replayed, /"three"/);

  await h.events.emit({ founderId: FOUNDER_A, threadId, turnId: 'tn_a', kind: 'delta', data: { text: 'four' } });
  await stream.settle();
  assert.match(stream.text(), /"four"/, 'and then it is live');

  // No frame twice, which is what the buffer and drain in SseStream is for.
  assert.equal((stream.text().match(/"two"/g) ?? []).length, 1);
  await h.app.close();
});

test('A HEARTBEAT IS A COMMENT, SO AN IDLE PROXY SEES BYTES AND A BROWSER SEES NOTHING', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);
  const stream = await openStream(h, cookie, threadId);

  h.clock.tick();
  await stream.settle();
  assert.match(stream.text(), /^: heartbeat$/m);
  // Fifteen seconds until the Step 0 probe measures the proxy's real idle
  // timeout. The number is a guess and it is registered as one.
  assert.equal(h.clock.intervals[0]?.ms, 15_000);
  await h.app.close();
});

test('SHUTDOWN TELLS OPEN STREAMS WHY BEFORE IT CLOSES THEM', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);
  const stream = await openStream(h, cookie, threadId);
  assert.equal(h.routes.streams.size, 1);

  h.routes.streams.closeAll('the server is restarting, reconnect in a moment');
  await stream.settle();
  assert.match(stream.text(), /the server is restarting/);
  assert.equal(h.routes.streams.size, 0);
  assert.equal(h.bus.listenerCount(threadId), 0, 'and the subscription went with it');
  await h.app.close();
});

// ---------------------------------------------------------------------------
// Rule 1, the track fork
// ---------------------------------------------------------------------------

test('A B2C FOUNDER CANNOT START THE B2B ENGINE, EVEN BY TYPING ITS ID', async () => {
  const h = await buildHarness();
  const cookieB2C = await h.signIn('ben@example.com');
  const refused = await h.app.inject({
    method: 'POST',
    url: '/api/threads',
    headers: { cookie: cookieB2C, ...JSON_HEADERS },
    payload: { routeId: 'outreach-engine' },
  });
  assert.equal(refused.statusCode, 403);
  assert.equal((JSON.parse(refused.body) as { error: string }).error, 'wrong_track');
  assert.equal(h.store.threads.size, 0);

  // And their own home does not offer it. The map is keyed by row id, so the
  // B2B engine is not a key at all rather than a key set to not started.
  const home = JSON.parse((await h.app.inject({ method: 'GET', url: '/api/home', headers: { cookie: cookieB2C } })).body) as {
    routes: Record<string, { progress: string }>;
  };
  const ids = Object.keys(home.routes);
  assert.ok(!ids.includes('outreach-engine'), 'no B2B row on a B2C home');
  assert.ok(ids.includes('audience-engine'));

  // The same rule as a pure function, over every row and both tracks, which is
  // the whole of rule 1 at this layer in one loop.
  assert.ok(!visibleRoutes('b2c').some((r) => r.id === 'outreach-engine'));
  assert.ok(!visibleRoutes('b2b').some((r) => r.id === 'audience-engine'));
  await h.app.close();
});

test('A FOUNDER WITH NO BRAIN YET MAY ONLY START WHAT BOTH TRACKS SHARE', async () => {
  const h = await buildHarness();
  h.auth.addFounder({ id: FOUNDER_A, email: 'ama@example.com', displayName: 'Ama Boateng', track: null });
  const cookie = await h.signIn('ama@example.com');

  const brain = await h.app.inject({
    method: 'POST',
    url: '/api/threads',
    headers: { cookie, ...JSON_HEADERS },
    payload: { routeId: 'founder-brain' },
  });
  assert.equal(brain.statusCode, 201, 'the fork happens once, here, so this one must be reachable');

  for (const routeId of ['outreach-engine', 'audience-engine']) {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: { cookie, ...JSON_HEADERS },
      payload: { routeId },
    });
    assert.equal(res.statusCode, 403, routeId);
  }
  await h.app.close();
});

test('AN UNKNOWN ROUTE ID IS REFUSED WITHOUT SAYING WHETHER IT EXISTS ON THE OTHER TRACK', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/threads',
    headers: { cookie, ...JSON_HEADERS },
    payload: { routeId: 'does-not-exist' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal((JSON.parse(res.body) as { error: string }).error, 'unknown_route');
  await h.app.close();
});

// ---------------------------------------------------------------------------
// Rule 4, the founder's own files
// ---------------------------------------------------------------------------

test('THE FILES LIST AND ONE FILE COME BACK, FROM THE RECORD AND NOT FROM A SCRATCH FOLDER', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  h.store.putFile(FOUNDER_A, 'founder-brain.md', '# Founder Brain\nTrack: b2b\n');
  h.store.putFile(FOUNDER_A, 'content-30.csv', 'date,post\n');
  h.store.putFile(FOUNDER_A, '.state/index.md', '| file | gate |\n');

  const listed = JSON.parse((await h.app.inject({ method: 'GET', url: '/api/files', headers: { cookie } })).body) as {
    rows: Array<{ name: string; status: string; gateLabel: string; kind: string; track: string }>;
    stateRows: Array<{ name: string }>;
  };
  const made = listed.rows.filter((r) => r.status !== 'missing').map((r) => r.name);
  assert.deepEqual(made.sort(), ['content-30.csv', 'founder-brain.md']);
  // The rows a founder has not made yet are listed too, because a list of what
  // they have on day one is a blank screen and a list of what is coming is the
  // programme.
  assert.ok(listed.rows.some((r) => r.name === '90-day-plan.md' && r.status === 'missing'));
  assert.equal(listed.rows.find((r) => r.name === 'founder-brain.md')?.gateLabel, 'gate A');
  // `.state/` is theirs too, behind a disclosure rather than hidden.
  assert.deepEqual(
    listed.stateRows.map((r) => r.name),
    ['.state/index.md'],
  );

  const md = await h.app.inject({ method: 'GET', url: '/api/files/founder-brain.md', headers: { cookie } });
  assert.equal(md.statusCode, 200);
  // Markdown, not HTML. A founder's own file rendered as HTML in their own
  // origin is a stored scripting hole with the founder as author and victim.
  assert.match(String(md.headers['content-type']), /text\/markdown/);
  assert.equal(md.headers['x-content-type-options'], 'nosniff');
  assert.equal(md.headers['cache-control'], 'private, no-store');

  const csv = await h.app.inject({ method: 'GET', url: '/api/files/content-30.csv/download', headers: { cookie } });
  assert.equal(csv.statusCode, 200);
  assert.match(String(csv.headers['content-type']), /text\/csv/);
  assert.match(String(csv.headers['content-disposition']), /attachment; filename="content-30\.csv"/);
  await h.app.close();
});

test('A PATH THAT IS NOT ONE OF THEIR OWN FILES DOES NOT RESOLVE, WHATEVER IT LOOKS LIKE', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  h.store.putFile(FOUNDER_A, 'founder-brain.md', 'mine');
  h.store.putFile(FOUNDER_B, 'people/sam-example-com.md', 'a real person');

  const attempts = [
    ['/api/files/%2e%2e%2f%2e%2e%2fetc%2fpasswd', 400],
    ['/api/files/%2fetc%2fpasswd', 400],
    ['/api/files/people/sam-example-com.md', 404],
    ['/api/files/nothing-here.md', 404],
  ] as const;
  for (const [url, status] of attempts) {
    const res = await h.app.inject({ method: 'GET', url, headers: { cookie } });
    assert.equal(res.statusCode, status, url);
  }
  await h.app.close();
});

test('DOWNLOAD EVERYTHING IS ONE ZIP, AND TWO DOWNLOADS OF ONE VERSION ARE BYTE IDENTICAL', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  h.store.putFile(FOUNDER_A, 'founder-brain.md', '# Founder Brain\n');
  h.store.putFile(FOUNDER_A, 'people/sam-example-com.md', '# Sam\n');
  h.store.putFile(FOUNDER_A, '.state/snapshots/founder-brain.md.1', 'old');

  const one = await h.app.inject({ method: 'GET', url: '/api/files/download.zip', headers: { cookie } });
  const two = await h.app.inject({ method: 'GET', url: '/api/files/download.zip', headers: { cookie } });
  assert.equal(one.statusCode, 200);
  assert.equal(String(one.headers['content-type']), 'application/zip');
  assert.match(String(one.headers['content-disposition']), /growth-engine\.zip/);
  assert.ok(one.rawPayload.equals(two.rawPayload), 'two downloads, one file, so a checksum argument is short');

  const text = one.rawPayload.toString('latin1');
  assert.match(text, /growth-engine\/founder-brain\.md/);
  assert.match(text, /growth-engine\/people\/sam-example-com\.md/);
  assert.match(text, /growth-engine\/README-your-files\.md/, 'the one file the laptop version never had');
  assert.doesNotMatch(text, /snapshots/, 'snapshots are off unless asked for');

  const withSnapshots = await h.app.inject({ method: 'GET', url: '/api/files/download.zip?snapshots=1', headers: { cookie } });
  assert.match(withSnapshots.rawPayload.toString('latin1'), /snapshots/);
  await h.app.close();
});

test('THE ZIP README SAYS THE FOLDER IS THEIRS AND CARRIES NO DASHES', async () => {
  const h = await buildHarness();
  const cookie = await h.signIn('ama@example.com');
  h.store.putFile(FOUNDER_A, 'founder-brain.md', '# Founder Brain\n');
  const zip = await h.app.inject({ method: 'GET', url: '/api/files/download.zip', headers: { cookie } });
  const text = zip.rawPayload.toString('utf8');
  assert.match(text, /This folder is yours/);
  assert.ok(!text.includes('—'), 'no em dashes');
  assert.ok(!text.includes('–'), 'no en dashes');
  await h.app.close();
});

// ---------------------------------------------------------------------------
// Stop
// ---------------------------------------------------------------------------

test('STOP INTERRUPTS A RUNNING TURN, AND ONLY THE FOUNDER WHO OWNS IT MAY PRESS IT', async () => {
  let released = (): void => undefined;
  const holding = new Promise<void>((resolve) => {
    released = resolve;
  });
  const h = await buildHarness({ run: () => holding });
  const cookie = await h.signIn('ama@example.com');
  const cookieB = await h.signIn('ben@example.com');
  const threadId = await newThread(h, cookie);

  const posted = await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/messages`,
    headers: { cookie, ...JSON_HEADERS },
    payload: { text: 'go', clientMsgId: 's-1' },
  });
  const { turnId } = JSON.parse(posted.body) as { turnId: string };
  await new Promise((r) => setImmediate(r));

  const notYours = await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/interrupt`,
    headers: { cookie: cookieB, ...JSON_HEADERS },
    payload: { turnId },
  });
  assert.equal(notYours.statusCode, 404);

  const stopped = await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/interrupt`,
    headers: { cookie, ...JSON_HEADERS },
    payload: { turnId },
  });
  assert.equal(stopped.statusCode, 200);
  assert.equal((JSON.parse(stopped.body) as { stopped: boolean }).stopped, true);

  released();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(h.store.turns.get(turnId)?.status, 'interrupted');
  await h.app.close();
});

test('A TURN THAT THROWS ENDS AT FAILED AND SAYS SO ON THE STREAM', async () => {
  const h = await buildHarness({ run: () => Promise.reject(new Error('ge exited 1')) });
  const cookie = await h.signIn('ama@example.com');
  const threadId = await newThread(h, cookie);
  const stream = await openStream(h, cookie, threadId);

  await h.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/messages`,
    headers: { cookie, ...JSON_HEADERS },
    payload: { text: 'go', clientMsgId: 'f-1' },
  });
  for (let i = 0; i < 6; i += 1) await stream.settle();

  assert.match(stream.text(), /event: error/);
  assert.match(stream.text(), /Nothing you have made is affected/);
  assert.doesNotMatch(stream.text(), /ge exited 1/, 'the detail goes to the log, not to the screen');
  assert.equal([...h.store.turns.values()][0]?.status, 'failed');
  await h.app.close();
});
