/**
 * budget.test.ts
 *
 * WHAT: Tests the cost arithmetic and the three caps this app can enforce
 *       without an API key.
 *
 * WHY IT EXISTS: The cumulative cost rule is the one mistake in this build that
 *       is silent, plausible and expensive. Summing total_cost_usd across five
 *       results bills a five turn conversation fifteen times, the numbers still
 *       look like money, and nobody notices until the invoice. Assumption C4
 *       asks for this to be proved across a resumed run; this proves the
 *       arithmetic, and C4's own test proves the SDK behaves as documented.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/budget.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, CostMeter, cacheReadTokensOf, type BudgetConfig } from './budget.js';
import type { SpendLedger } from './ports.js';
import { collectingLogger } from './test-fixtures.js';

const CFG: BudgetConfig = { turnCapUsd: 0.5, founderCapUsd: 10, cohortDailyCapUsd: 400 };

function ledger(state: { founder?: number; cohort?: number } = {}) {
  const rows: Parameters<SpendLedger['add']>[0][] = [];
  const impl: SpendLedger = {
    spendToDate: async () => state.founder ?? 0,
    cohortSpendToday: async () => state.cohort ?? 0,
    add: async (row) => {
      rows.push(row);
    },
  };
  return { impl, rows };
}

test('a turn costs the difference, never the running total', () => {
  const meter = new CostMeter();
  // The SDK reports a running total on every result. Rounded here because
  // these are binary floats and the point of the test is the difference, not
  // the last bit of a fraction of a cent.
  const cents = (n: number): number => Math.round(n * 1000) / 1000;
  assert.equal(cents(meter.turnCost(0.02)), 0.02);
  assert.equal(cents(meter.turnCost(0.05)), 0.03);
  assert.equal(cents(meter.turnCost(0.11)), 0.06);
  // Summing the readings would have billed 0.18 for 0.11 of work.
  assert.equal(meter.runTotal(), 0.11);
});

test('a fresh meter is what resets the baseline on a resumed run', () => {
  const first = new CostMeter();
  first.turnCost(0.4);
  // A resumed run starts its own counter from zero, per the SDK's own type
  // declaration, so the app starts a new meter with it.
  const resumed = new CostMeter();
  assert.equal(resumed.turnCost(0.03), 0.03);
});

test('a counter that goes backwards is taken whole rather than as a credit', () => {
  const meter = new CostMeter();
  meter.turnCost(0.5);
  assert.equal(meter.turnCost(0.1), 0.1);
});

test('a nonsense reading costs nothing rather than poisoning the ledger', () => {
  const meter = new CostMeter();
  assert.equal(meter.turnCost(Number.NaN), 0);
  assert.equal(meter.turnCost(-3), 0);
});

test('the spawn cap is the smaller of the turn cap and what is left', async () => {
  const log = collectingLogger();
  const spent = new Budget(CFG, ledger({ founder: 9.8 }).impl, log);
  assert.equal(Math.round((await spent.spawnCapUsd('f')) * 100) / 100, 0.2);

  const fresh = new Budget(CFG, ledger({ founder: 0 }).impl, log);
  assert.equal(await fresh.spawnCapUsd('f'), 0.5);
});

test('the spawn cap never goes negative', async () => {
  const b = new Budget(CFG, ledger({ founder: 99 }).impl, collectingLogger());
  assert.equal(await b.spawnCapUsd('f'), 0);
});

test('a founder over their cap is refused with a plain sentence and a person', async () => {
  const b = new Budget(CFG, ledger({ founder: 10 }).impl, collectingLogger());
  const decision = await b.admit('f');
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.code, 'founder_cap');
    assert.ok(decision.reason.includes('mentor'));
    assert.ok(decision.reason.includes('safe'));
    assert.ok(!/[–—]/.test(decision.reason));
  }
});

test('the cohort breaker stops everybody and shouts', async () => {
  const log = collectingLogger();
  const b = new Budget(CFG, ledger({ cohort: 400 }).impl, log);
  const decision = await b.admit('f');
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'cohort_cap');
  assert.ok(log.lines.some((l) => l.level === 'error' && l.msg.includes('BREAKER')));
});

test('the cohort breaker is checked before the founder cap', async () => {
  // Both are over. The founder should be told the app paused for everyone,
  // because that is the true reason and it is the one with a different answer.
  const b = new Budget(CFG, ledger({ founder: 50, cohort: 500 }).impl, collectingLogger());
  const decision = await b.admit('f');
  assert.equal(decision.ok === false && decision.code, 'cohort_cap');
});

test('a normal founder is admitted', async () => {
  const b = new Budget(CFG, ledger({ founder: 1.2, cohort: 30 }).impl, collectingLogger());
  assert.equal((await b.admit('f')).ok, true);
});

test('one spend row per turn, carrying that turn own cost', async () => {
  const l = ledger();
  const b = new Budget(CFG, l.impl, collectingLogger());
  await b.record({
    founderId: 'f',
    turnId: 't1',
    routeId: 'founder-brain',
    costUsd: 0.031,
    cacheReadTokens: 12000,
    turnIndex: 2,
  });
  assert.equal(l.rows.length, 1);
  assert.equal(l.rows[0]?.costUsd, 0.031);
});

test('a cache miss on a later turn is an error in the log, not a silent cost', async () => {
  const log = collectingLogger();
  const b = new Budget(CFG, ledger().impl, log);
  await b.record({
    founderId: 'f',
    turnId: 't2',
    routeId: 'founder-brain',
    costUsd: 0.2,
    cacheReadTokens: 0,
    turnIndex: 2,
  });
  assert.ok(log.lines.some((l) => l.level === 'error' && l.msg.includes('PROMPT CACHE MISS')));
});

test('turn one reading no cache is normal and says nothing', async () => {
  const log = collectingLogger();
  const b = new Budget(CFG, ledger().impl, log);
  await b.record({
    founderId: 'f',
    turnId: 't1',
    routeId: 'founder-brain',
    costUsd: 0.2,
    cacheReadTokens: 0,
    turnIndex: 1,
  });
  assert.ok(!log.lines.some((l) => l.msg.includes('PROMPT CACHE MISS')));
});

test('cache read tokens are summed across every model a turn touched', () => {
  assert.equal(
    cacheReadTokensOf({
      'claude-primary': { cacheReadInputTokens: 9000 },
      'claude-utility': { cacheReadInputTokens: 400 },
    }),
    9400,
  );
  assert.equal(cacheReadTokensOf(undefined), 0);
  assert.equal(cacheReadTokensOf({ m: {} }), 0);
});
