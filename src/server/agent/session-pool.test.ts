/**
 * session-pool.test.ts
 *
 * WHAT: Tests reuse, eviction and the idle sweep.
 *
 * WHY IT EXISTS: The pool is where memory goes wrong. Sixty idle subprocesses
 *       is a guess until it is measured, so the behaviour when the ceiling is
 *       reached has to be right whatever the number turns out to be: evict the
 *       oldest idle one, never one a founder is watching, and never spawn past
 *       the ceiling quietly.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/session-pool.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, type BudgetConfig } from './budget.js';
import { Pushable } from './pushable.js';
import { SessionPool } from './session-pool.js';
import { EXPECTED_CLI_VERSION, type QueryFn, type RunnerConfig, type RunnerDeps } from './runner.js';
import type { FactsSource, SkillBodies, SpendLedger } from './ports.js';
import {
  collectingLogger,
  fakeClock,
  founder,
  FIXTURE_GE_TOOLS,
  realInit,
  routeById,
} from './test-fixtures.js';

const CONFIG: RunnerConfig = {
  primaryModel: 'test-primary',
  utilityModel: 'test-utility',
  anthropicApiKey: 'sk-test',
  path: '/usr/bin:/bin',
  claudeConfigDir: '/tmp/claude-config',
  sessionLoadTimeoutMs: 10_000,
};
const BUDGET_CFG: BudgetConfig = { turnCapUsd: 0.5, founderCapUsd: 10, cohortDailyCapUsd: 400 };
const LEDGER: SpendLedger = {
  spendToDate: async () => 0,
  cohortSpendToday: async () => 0,
  add: async () => {},
};
const bodies: SkillBodies = { get: () => '# Skill\nbody\n', keys: () => ['founder-brain'] };
const facts: FactsSource = {
  factsFor: async () => ({ track: 'b2b', files: [], absent: [], gates: [], today: '2026-09-19' }),
};

/** Counts spawns, and lets a test hold a turn open. */
function fakeSdk() {
  let spawns = 0;
  const holds: Pushable<Record<string, unknown>>[] = [];
  const queryFn: QueryFn = (params) => {
    spawns += 1;
    const out = new Pushable<Record<string, unknown>>();
    holds.push(out);
    void (async () => {
      // The real CLI's init, from test-fixtures.ts, which is where it lives so
      // that this fake and runner.test.ts's cannot drift apart again. The old
      // one here answered with TodoWrite in the tool list, an empty skills list
      // and no version, and CLI 2.1.250 does none of the three. Only the
      // session id is this suite's own, because the pool counts spawns.
      out.push(realInit({ session_id: `sess-${spawns}` }));
      for await (const _msg of params.prompt as AsyncIterable<unknown>) {
        void _msg;
      }
      out.end();
    })();
    const it = out[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => it.next(),
      async interrupt() {},
    } as unknown as ReturnType<QueryFn>;
  };
  return {
    queryFn,
    get spawns() {
      return spawns;
    },
    finish(index: number, cost = 0.01): void {
      holds[index]?.push({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'done',
        total_cost_usd: cost,
        modelUsage: {},
        session_id: `sess-${index + 1}`,
      });
    },
  };
}

function build(over: Partial<RunnerDeps> = {}) {
  const sdk = fakeSdk();
  const log = collectingLogger();
  const clock = fakeClock();
  const deps: RunnerDeps = {
    queryFn: sdk.queryFn,
    bodies,
    facts,
    budget: new Budget(BUDGET_CFG, LEDGER, log),
    log,
    clock,
    config: CONFIG,
    // The same two the fake init reports, so the surface the pool is given and
    // the surface the CLI answers with are one thing.
    makeGeTools: () => ({ servers: {} as never, toolNames: [...FIXTURE_GE_TOOLS] }),
    ...over,
  };
  return { sdk, log, clock, deps };
}

const CTX = founder('b2b');
const ROUTE = routeById('founder-brain');

/**
 * THE GUARD ON THIS FILE'S FAKE. The pool's job is to hand back a run that can
 * take a turn, and none of the tests below would notice if every one of those
 * turns was refused at init: they assert on spawn counts, eviction and the
 * sweep, all of which happen either side of the refusal. So one test here
 * actually takes a turn, and fails if the init this file's fake sends stops
 * being one the real CLI would send.
 */
test('a run the pool hands back can take a turn on the CLI we actually ship', async () => {
  const { deps, clock, log, sdk } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const held = await pool.acquire('t1', CTX, ROUTE, {});
  const turn = held.run.send('turn', 'go', () => {}, held.startOptions);
  await new Promise((r) => setImmediate(r));
  sdk.finish(0);

  assert.equal((await turn).status, 'ok');
  assert.ok(
    !log.lines.some((l) => l.msg.includes('INIT ASSERTION FAILED')),
    'the pool handed back a run whose every turn is refused at init',
  );
  // No version warning either. An init with no claude_code_version on it logs
  // 'unreported' and warns on every single spawn, which is noise that trains
  // people to skip the one line that would have said the CLI had moved.
  assert.ok(
    !log.lines.some((l) => l.msg.includes('has moved under this assertion')),
    'the fake sent an init the runner does not recognise the version of',
  );
  const started = log.lines.find((l) => l.msg === 'run started');
  assert.equal(started?.obj.cliVersion, EXPECTED_CLI_VERSION);
  await pool.stop();
});

test('a second message on a live thread costs no spawn', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const first = await pool.acquire('t1', CTX, ROUTE, {});
  const second = await pool.acquire('t1', CTX, ROUTE, {});
  assert.equal(first.run, second.run);
});

test('two threads get two runs', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const a = await pool.acquire('t1', CTX, ROUTE, {});
  const b = await pool.acquire('t2', CTX, ROUTE, {});
  assert.notEqual(a.run, b.run);
  assert.equal(pool.stats().live, 2);
});

test('which of the three resume cases happened is a logged fact', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  await pool.acquire('t1', CTX, ROUTE, {});
  await pool.acquire('t2', CTX, ROUTE, { resumeSessionId: 'sess-old' });
  await pool.acquire('t3', CTX, ROUTE, { seed: 'digest' });
  const kinds = log.lines.filter((l) => l.msg === 'session acquired').map((l) => l.obj.resume);
  assert.deepEqual(kinds, ['fresh', 'session-id', 'digest']);
});

test('a full pool evicts the oldest idle run, never a busy one', async () => {
  const { deps, clock, log, sdk } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 2, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const oldest = await pool.acquire('t1', CTX, ROUTE, {});
  clock.advance(1000);
  const busy = await pool.acquire('t2', CTX, ROUTE, {});
  // Hold a turn open on the newer one, so it is busy and must not be evicted.
  void busy.run.send('turn', 'go', () => {}, busy.startOptions);
  await new Promise((r) => setImmediate(r));
  assert.equal(busy.run.isBusy, true);

  await pool.acquire('t3', CTX, ROUTE, {});
  assert.equal(oldest.run.isClosed, true, 'the oldest idle run was not the one evicted');
  assert.equal(busy.run.isClosed, false, 'a run a founder was watching was evicted');
  sdk.finish(1);
});

test('a full pool with every run busy refuses loudly rather than overspawning', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 1, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const busy = await pool.acquire('t1', CTX, ROUTE, {});
  void busy.run.send('turn', 'go', () => {}, busy.startOptions);
  await new Promise((r) => setImmediate(r));

  await assert.rejects(pool.acquire('t2', CTX, ROUTE, {}), /session pool full/);
  assert.ok(log.lines.some((l) => l.level === 'error' && l.msg.includes('every run is busy')));
});

test('ten minutes idle and the subprocess is let go', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const held = await pool.acquire('t1', CTX, ROUTE, {});
  pool.start();
  clock.advance(600_001);
  await new Promise((r) => setImmediate(r));
  assert.equal(held.run.isClosed, true);
  assert.equal(pool.stats().live, 0);
  await pool.stop();
});

test('a run that is still inside the idle window is kept', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const held = await pool.acquire('t1', CTX, ROUTE, {});
  pool.start();
  clock.advance(60_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(held.run.isClosed, false);
  await pool.stop();
});

test('an evicted thread comes back as a new run, not as a dead one', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 1, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const first = await pool.acquire('t1', CTX, ROUTE, {});
  await first.run.close();
  const again = await pool.acquire('t1', CTX, ROUTE, { resumeSessionId: 'sess-1' });
  assert.notEqual(first.run, again.run);
  assert.equal(again.run.isClosed, false);
});

test('stop closes everything it is holding', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  const a = await pool.acquire('t1', CTX, ROUTE, {});
  const b = await pool.acquire('t2', CTX, ROUTE, {});
  await pool.stop();
  assert.equal(a.run.isClosed, true);
  assert.equal(b.run.isClosed, true);
  assert.equal(pool.stats().live, 0);
});

test('interrupt finds the run for a thread, and says so when there is none', async () => {
  const { deps, clock, log } = build();
  const pool = new SessionPool(
    { maxLiveSessions: 10, sessionIdleMs: 600_000, sweepEveryMs: 30_000 },
    deps,
    clock,
    log,
  );
  await pool.acquire('t1', CTX, ROUTE, {});
  assert.equal(await pool.interrupt('t1'), true);
  assert.equal(await pool.interrupt('nope'), false);
});
