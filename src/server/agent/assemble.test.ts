/**
 * assemble.test.ts
 *
 * WHAT: Tests the track strip, the run header, and the one property the whole
 *       cost model rests on: two founders on one route and one track produce a
 *       byte identical cacheable prefix.
 *
 * WHY IT EXISTS: Assumption C2 says to assert cache reads above zero after turn
 *       two, which needs an API key and a deployed container. This is the half
 *       of C2 that can be proved on a laptop, and it is the half that catches
 *       the actual mistake: somebody moving a founder's name into the system
 *       prompt because it reads better there.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/assemble.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assemble,
  buildRunHeader,
  buildSystemPromptAppend,
  formatSize,
  reAnchor,
  resumeSeed,
  stripOtherTrack,
  TrackMarkerError,
} from './assemble.js';
import type { FactsSource, RunFacts, SkillBodies } from './ports.js';
import { founder, routeById } from './test-fixtures.js';

const BODY = [
  '# Founder Brain',
  '',
  'Ask these in small groups.',
  '',
  '<!-- TRACK:b2b -->',
  '**If track is B2B**, capture the ICP:',
  'Company size, industry, the job title you sell to.',
  '<!-- /TRACK -->',
  '',
  '<!-- TRACK:b2c -->',
  '**If track is B2C**, capture the audience:',
  'Who they are, where they already spend time.',
  '<!-- /TRACK -->',
  '',
  'Then write the file.',
].join('\n');

const bodies: SkillBodies = {
  get: () => BODY,
  keys: () => ['founder-brain'],
};

function factsSource(over: Partial<RunFacts> = {}): FactsSource {
  return {
    factsFor: async (): Promise<RunFacts> => ({
      track: 'b2c',
      files: [
        { path: 'founder-brain.md', sizeBytes: 4198, changed: '12 Sep' },
        { path: 'content-30.md', sizeBytes: 18432, changed: '19 Sep' },
      ],
      absent: ['dm-openers.md', 'hook-bank.md'],
      gates: [
        { letter: 'A', state: 'passed', on: '12 Sep' },
        { letter: 'B', state: 'not submitted' },
      ],
      today: '2026-09-19',
      ...over,
    }),
  };
}

test('a b2c founder never sees the b2b block', () => {
  const stripped = stripOtherTrack(BODY, 'b2c');
  assert.ok(!stripped.includes('ICP'), 'B2B prose leaked into a B2C body');
  assert.ok(stripped.includes('capture the audience'));
  assert.ok(!stripped.includes('TRACK:'), 'marker lines reached the model');
});

test('a b2b founder never sees the b2c block', () => {
  const stripped = stripOtherTrack(BODY, 'b2b');
  assert.ok(!stripped.includes('where they already spend time'));
  assert.ok(stripped.includes('capture the ICP'));
});

test('prose outside the markers survives both strips', () => {
  for (const track of ['b2b', 'b2c'] as const) {
    const stripped = stripOtherTrack(BODY, track);
    assert.ok(stripped.includes('Ask these in small groups.'));
    assert.ok(stripped.includes('Then write the file.'));
  }
});

test('carriage returns do not turn a marker into ordinary prose', () => {
  const withCrlf = BODY.split('\n').join('\r\n');
  const stripped = stripOtherTrack(withCrlf, 'b2c');
  assert.ok(!stripped.includes('ICP'));
});

test('a marker that is never closed refuses rather than truncating', () => {
  const broken = '# Skill\n<!-- TRACK:b2b -->\nsomething\n';
  assert.throws(() => stripOtherTrack(broken, 'b2c'), TrackMarkerError);
});

test('a closing marker with no opener refuses', () => {
  assert.throws(() => stripOtherTrack('a\n<!-- /TRACK -->\nb', 'b2b'), TrackMarkerError);
});

test('a nested marker refuses', () => {
  const nested = '<!-- TRACK:b2b -->\n<!-- TRACK:b2c -->\nx\n<!-- /TRACK -->\n<!-- /TRACK -->';
  assert.throws(() => stripOtherTrack(nested, 'b2b'), TrackMarkerError);
});

test('the system prompt append names the track and forbids the other one', () => {
  const append = buildSystemPromptAppend(bodies, routeById('founder-brain'), 'b2c');
  assert.ok(append.includes("This founder's track: b2c"));
  assert.ok(append.includes('Never write, offer, or mention material belonging to the other track'));
});

test('TWO FOUNDERS ON ONE ROUTE AND TRACK SHARE A BYTE IDENTICAL PREFIX', async () => {
  const route = routeById('founder-brain');
  const deps = { bodies, facts: factsSource() };
  const a = await assemble(deps, founder('b2c', { displayName: 'Priya', businessName: 'Lumen' }), route);
  const b = await assemble(
    deps,
    founder('b2c', {
      founderId: '01ZZZZZZZZZZZZZZZZZZZZZZZZ',
      displayName: 'Marcus',
      businessName: 'Northfield',
      workdir: '/tmp/ge/other',
    }),
    route,
  );
  assert.equal(a.prefixHash, b.prefixHash, 'the cacheable prefix differs between founders');
  assert.equal(a.systemPromptAppend, b.systemPromptAppend);
  assert.notEqual(a.runHeader, b.runHeader, 'the volatile half should differ');
});

test('the two tracks do NOT share a prefix, which is the point of the strip', async () => {
  const route = routeById('founder-brain');
  const b2c = await assemble({ bodies, facts: factsSource() }, founder('b2c'), route);
  const b2b = await assemble(
    { bodies, facts: factsSource({ track: 'b2b' }) },
    founder('b2b'),
    route,
  );
  assert.notEqual(b2c.prefixHash, b2b.prefixHash);
});

test('nothing volatile leaks into the cacheable prefix', async () => {
  const route = routeById('founder-brain');
  const ctx = founder('b2c');
  const { systemPromptAppend } = await assemble({ bodies, facts: factsSource() }, ctx, route);
  for (const volatile of [ctx.displayName, ctx.businessName, ctx.founderId, ctx.workdir, '2026-09-19', 'Gate A']) {
    assert.ok(
      !systemPromptAppend.includes(volatile),
      `"${volatile}" is in the cacheable prefix and would cost roughly three times more`,
    );
  }
});

test('the file wins over the cached track column', async () => {
  // The founder row says b2b. The Brain says b2c. The Brain is the authority,
  // so the b2c body must be the one assembled.
  const { systemPromptAppend } = await assemble(
    { bodies, facts: factsSource({ track: 'b2c' }) },
    founder('b2b'),
    routeById('founder-brain'),
  );
  assert.ok(systemPromptAppend.includes('capture the audience'));
  assert.ok(!systemPromptAppend.includes('capture the ICP'));
});

test('the run header carries both meanings of route, labelled', () => {
  const ctx = founder('b2c');
  const header = buildRunHeader(ctx, routeById('audience-b2c'), {
    track: 'b2c',
    files: [{ path: 'founder-brain.md', sizeBytes: 4198, changed: '12 Sep' }],
    absent: ['dm-openers.md'],
    gates: [{ letter: 'A', state: 'passed', on: '12 Sep' }],
    today: '2026-09-19',
  });
  assert.ok(header.includes('Track: b2c'));
  assert.ok(header.includes('Model: ecommerce'));
  assert.ok(header.includes('Route: b2c-ecom'));
  assert.ok(header.includes('Engine: audience-b2c'));
  assert.ok(header.includes('Founder: Priya Raman'));
  assert.ok(header.includes('Today: 2026-09-19'));
  assert.ok(header.includes('Absent: dm-openers.md'));
  assert.ok(header.includes('Gate A: passed 12 Sep.'));
});

test('file sizes read the way the build document writes them', () => {
  assert.equal(formatSize(4198), '4.1 KB');
  assert.equal(formatSize(18432), '18 KB');
  assert.equal(formatSize(6144), '6 KB');
  assert.equal(formatSize(410), '0.4 KB');
});

test('the re anchor line names the track, the engine and the step', () => {
  const line = reAnchor(founder('b2b'), routeById('founder-brain'), 'group 4 of 6');
  assert.ok(line.includes('Track: b2b'));
  assert.ok(line.includes('founder-brain'));
  assert.ok(line.includes('group 4 of 6'));
  assert.ok(line.includes('do not re ask'));
});

test('the cold resume seed points at the files, not at the lost transcript', () => {
  const seed = resumeSeed(routeById('founder-brain'), {
    summary: 'Captured the business, the offer and two proof points.',
    lastMessages: ['we sell to construction firms'],
  });
  assert.ok(seed.includes('Read their files first'));
  assert.ok(seed.includes('we sell to construction firms'));
  assert.ok(seed.includes('Do not start'));
});

test('no em dash or en dash reaches a founder facing string', () => {
  const ctx = founder('b2c');
  const header = buildRunHeader(ctx, routeById('audience-b2c'), {
    track: 'b2c',
    files: [],
    absent: [],
    gates: [],
    today: '2026-09-19',
  });
  const append = buildSystemPromptAppend(bodies, routeById('founder-brain'), 'b2c');
  for (const text of [header, append, reAnchor(ctx, routeById('founder-brain'), null)]) {
    assert.ok(!/[–—]/.test(text), 'a dash the house style bans reached the prompt');
  }
});
