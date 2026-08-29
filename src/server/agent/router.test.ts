/**
 * router.test.ts
 *
 * WHAT: Tests that the app owns routing and that the track fork cannot go
 *       wrong, including through a crafted HTTP request.
 *
 * WHY IT EXISTS: These are the strongest assertions in the folder, because they
 *       are negative. Rule 1 is not "the model usually picks the right engine".
 *       It is "a B2C founder cannot reach the B2B engine by any path", and the
 *       only way to know that is to try every path.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/router.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineTwoFor, missingRequirements, Router, type IntentClassifier } from './router.js';
import { collectingLogger, FIXTURE_ROUTES, routeById } from './test-fixtures.js';
import type { RouteId, RouteRow } from './types.js';

function router(classifier?: IntentClassifier) {
  const log = collectingLogger();
  return {
    log,
    router: new Router({ catalogue: { all: () => FIXTURE_ROUTES }, log, classifier }),
  };
}

test('the engine 2 fork is a switch on a column', () => {
  assert.equal(engineTwoFor('b2b'), 'outreach-b2b');
  assert.equal(engineTwoFor('b2c'), 'audience-b2c');
});

test('a b2c founder has no idea an outreach engine exists', () => {
  const { router: r } = router();
  const ids = r.visibleRoutes('b2c').map((x) => x.id);
  assert.ok(!ids.includes('outreach-b2b'));
  assert.ok(ids.includes('audience-b2c'));
});

test('a b2b founder never sees the audience engine', () => {
  const { router: r } = router();
  const ids = r.visibleRoutes('b2b').map((x) => x.id);
  assert.ok(!ids.includes('audience-b2c'));
  assert.ok(ids.includes('outreach-b2b'));
});

test('hidden rows are ported and not shown', () => {
  const { router: r } = router();
  assert.ok(!r.visibleRoutes('b2b').some((x) => x.id === 'playbook-export'));
});

test('a crafted request for the other track is refused, not run', () => {
  const { router: r } = router();
  const decision = r.fromSidebar('b2c', 'outreach-b2b');
  assert.equal(decision.kind, 'refused');
  if (decision.kind === 'refused') {
    assert.ok(!decision.reason.toLowerCase().includes('outreach'));
    assert.ok(!decision.reason.toLowerCase().includes('b2b'));
  }
});

test('an unknown route id is refused rather than defaulting to anything', () => {
  const { router: r } = router();
  assert.equal(r.fromSidebar('b2b', 'no-such-engine').kind, 'refused');
});

test('a sidebar click runs without a confirm chip', () => {
  const { router: r } = router();
  const decision = r.fromSidebar('b2b', 'content-engine');
  assert.equal(decision.kind, 'run');
});

test('which skill ran is a logged fact', () => {
  const { router: r, log } = router();
  r.fromSidebar('b2b', 'content-engine');
  const line = log.lines.find((l) => l.msg === 'route chosen');
  assert.ok(line, 'no route chosen line was logged');
  assert.equal(line?.obj.routeId, 'content-engine');
  assert.equal(line?.obj.via, 'sidebar');
});

test('plain language always confirms before it starts', async () => {
  const { router: r } = router();
  const decision = await r.fromText('b2c', 'build my content engine');
  assert.equal(decision.kind, 'confirm');
  if (decision.kind === 'confirm') assert.equal(decision.route.id, 'content-engine');
});

test('a b2c founder typing a b2b phrase gets no match, not the b2b engine', async () => {
  const { router: r } = router();
  const decision = await r.fromText('b2c', 'apollo filters');
  assert.equal(decision.kind, 'none');
});

test('the engine 2 entry point sends each track to its own engine', () => {
  const { router: r } = router();
  const b2b = r.engineTwo('b2b');
  const b2c = r.engineTwo('b2c');
  assert.equal(b2b.kind === 'run' && b2b.route.id, 'outreach-b2b');
  assert.equal(b2c.kind === 'run' && b2c.route.id, 'audience-b2c');
});

test('the classifier only runs when the phrase list found nothing', async () => {
  let calls = 0;
  const classifier: IntentClassifier = {
    classify: async () => {
      calls += 1;
      return null;
    },
  };
  const { router: r } = router(classifier);
  await r.fromText('b2b', 'build my content engine');
  assert.equal(calls, 0, 'paid for a classifier call the phrase list had already answered');
  await r.fromText('b2b', 'I need to talk to people about my thing');
  assert.equal(calls, 1);
});

test('a classifier naming an unavailable route is ignored and logged', async () => {
  const classifier: IntentClassifier = {
    classify: async (_t: string, _c: readonly RouteRow[]): Promise<RouteId | null> => 'outreach-b2b',
  };
  const { router: r, log } = router(classifier);
  const decision = await r.fromText('b2c', 'something ambiguous entirely');
  assert.equal(decision.kind, 'none');
  assert.ok(log.lines.some((l) => l.level === 'warn' && l.msg.includes('unavailable route')));
});

test('a classifier answer still goes through the confirm chip', async () => {
  const classifier: IntentClassifier = { classify: async () => 'content-engine' };
  const { router: r } = router(classifier);
  const decision = await r.fromText('b2b', 'I want to write things for linkedin');
  assert.equal(decision.kind, 'confirm');
});

test('missing requirements come back in the order the table names them', () => {
  const route = routeById('content-engine');
  assert.deepEqual(missingRequirements(route, []), ['founder-brain.md']);
  assert.deepEqual(missingRequirements(route, ['founder-brain.md']), []);
});

test('no refusal message contains a dash the house style bans', () => {
  const { router: r } = router();
  const refusals = [r.fromSidebar('b2c', 'outreach-b2b'), r.fromSidebar('b2b', 'nope')];
  for (const d of refusals) {
    if (d.kind === 'refused') assert.ok(!/[–—]/.test(d.reason));
  }
});
