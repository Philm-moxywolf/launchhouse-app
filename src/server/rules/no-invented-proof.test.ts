/**
 * no-invented-proof.test.ts: rule 5, grounded in the two worked examples.
 *
 * WHY IT EXISTS: this is the rule most likely to be wrong in the direction
 *   nobody notices, which is too many false alarms. So the tests are weighted
 *   that way: most of them assert that a real number, in a real sentence, from
 *   a real founder, is left alone.
 *
 * CALLED BY: node --test.
 * READS:     the two example brains from the content repo.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkNoInventedProof, readNumbers } from './no-invented-proof.ts';
import { exampleBrain } from './test-fixtures.ts';
import type { Artifact, FounderContext, Track } from './types.ts';

function ctxFor(track: Track): FounderContext {
  return { track, brain: exampleBrain(track) };
}

function post(text: string): Artifact {
  return { path: 'content-30.md', text, authored: 'model' };
}

function codes(text: string, track: Track, strict = false): string[] {
  return checkNoInventedProof(post(text), ctxFor(track), { strict }).violations.map(
    (v) => `${v.code}:${v.found}`,
  );
}

test('numbers are read the way they are written', () => {
  const tokens = readNumbers('340 customers, 31%, 4.7 stars, 8k a month, 1,800 GBP, 1M turnover');
  assert.deepEqual(
    tokens.map((t) => t.value),
    [340, 31, 4.7, 8000, 1800, 1000000],
  );
});

test("Priya's own numbers come back to her untouched", () => {
  // Every one of these is in the B2C Brain, written a different way.
  const written = [
    'We have 340 customers and 31% of them have reordered.',
    'Forty seven reviews, averaging 4.7.',
    'The bundle is 84 GBP. The serum on its own is 41.',
    'The list is 610 people and I have emailed it twice.',
    'Two thousand one hundred followers is not many, and that is the point.',
    '2,100 followers, and revenue of 4k a month.',
  ].join('\n');
  assert.deepEqual(codes(written, 'b2c'), []);
});

test("Sam's own numbers come back to him untouched", () => {
  const written = [
    'Firms turning over 1M to 5M, with 8 to 40 staff.',
    'The retainer is 1,800 to 3,200 GBP a month.',
    'Trentham went from 71 days to 38.',
    'Halewood had 4% margin leakage on two live projects.',
    'Fifteen years on site before any of this.',
    '15 years on site, and it shows in the first ten minutes.',
  ].join('\n');
  assert.deepEqual(codes(written, 'b2b'), []);
});

test('an invented result is refused, and the number is named', () => {
  // 63 and 60 are both absent from the B2B Brain. 40 would not have been: Sam
  // Okoye's Brain says "8 to 40 staff", and grounding is grounding wherever the
  // number happens to sit.
  const result = checkNoInventedProof(
    post('We have helped 63 firms cut their admin by 60%.'),
    ctxFor('b2b'),
  );
  assert.equal(result.ok, false);
  const found = result.violations.map((v) => v.found);
  assert.ok(found.some((f) => f.startsWith('63')), `expected 63, got ${found.join(', ')}`);
  assert.ok(found.some((f) => f.includes('60')));
  assert.ok(result.violations.every((v) => v.code === 'proof.invented-result'));
});

test('an invented follower count is refused', () => {
  const result = checkNoInventedProof(
    post('Join the 12,000 people already reading this.'),
    ctxFor('b2c'),
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.found, '12,000');
});

test('a review score does not ground the digits inside it', () => {
  // The B2C Brain says the reviews average 4.7. An earlier draft added every
  // bare digit run to the grounded set, so that 4.7 quietly made a claim of
  // "7 customers" look like something Priya had said.
  const result = checkNoInventedProof(post('I have 7 customers so far.'), ctxFor('b2c'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.found, '7');
});

test('a date is not a claim', () => {
  assert.deepEqual(
    codes('Locked on 2026-08-21. Posting from 15 September, in 2027 if it works.', 'b2c'),
    [],
  );
});

test('a time of day is not a claim', () => {
  assert.deepEqual(codes('Still doing the admin at 11pm, every night.', 'b2b'), []);
});

test('a position in a list is not a claim', () => {
  const plan = [
    '1. The first piece is about the whiteboard.',
    '2. The second is about retentions.',
    'Piece 17 is the founder story.',
    'Week 6 is where the refill starts.',
  ].join('\n');
  assert.deepEqual(codes(plan, 'b2b'), []);
});

test('the track is not the number two', () => {
  assert.deepEqual(codes('This is written for the b2c track.', 'b2c'), []);
});

test('the toolkit\'s own file names are not claims', () => {
  assert.deepEqual(
    codes('Your pieces are in content-30.md and the plan is in 90-day-plan.md.', 'b2c'),
    [],
  );
});

test('a number with no proof word near it is a note, not a refusal', () => {
  const result = checkNoInventedProof(post('Try 7 different openers.'), ctxFor('b2c'));
  assert.equal(result.ok, true, 'a note must not stop the founder getting their work');
  assert.equal(result.violations[0]?.severity, 'warn');
  assert.equal(result.violations[0]?.code, 'proof.ungrounded-number');
});

test('strict mode refuses every ungrounded number, which is the journey assertion', () => {
  const result = checkNoInventedProof(post('Try 7 different openers.'), ctxFor('b2c'), {
    strict: true,
  });
  assert.equal(result.ok, false);
});

test('a percentage is always treated as a result', () => {
  const result = checkNoInventedProof(post('Roughly 68% of them will say yes.'), ctxFor('b2b'));
  assert.equal(result.violations[0]?.code, 'proof.invented-result');
  assert.equal(result.ok, false);
});

test('the same number written a different way is still grounded', () => {
  // The Brain says "8k". The post says eight thousand pounds.
  assert.deepEqual(codes('The goal is 8,000 GBP a month.', 'b2c'), []);
  assert.deepEqual(codes('The goal is 8k a month.', 'b2c'), []);
});

test('a number inside a link or a code span is not a claim', () => {
  assert.deepEqual(
    codes('See https://example.com/report-9987 and run `ge ledger approve 42`.', 'b2b'),
    [],
  );
});

test('the Founder Brain is not checked against itself', () => {
  const result = checkNoInventedProof(
    { path: 'founder-brain.md', text: exampleBrain('b2b'), authored: 'model' },
    { track: 'b2b', brain: null },
  );
  assert.equal(result.ok, true);
  assert.match(result.notes.join(' '), /where the numbers come from/);
});

test('the Brain can be checked when the founder\'s own answers are handed over', () => {
  const brain = '# Founder Brain\n\n## Proof\n- 900 customers, 55% reordered.\n';
  const theirAnswers: Artifact = {
    path: 'turn.md',
    text: 'I have about 900 customers now.',
    authored: 'founder',
  };
  const result = checkNoInventedProof(
    { path: 'founder-brain.md', text: brain, authored: 'model' },
    { track: 'b2c', brain: null, grounding: [theirAnswers] },
  );
  assert.equal(result.ok, false, '55 per cent was never said');
  assert.ok(result.violations.every((v) => v.found.includes('55')));
});

test('generating anything before the Brain exists is refused', () => {
  const result = checkNoInventedProof(post('Anything at all.'), { track: 'b2b', brain: null });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'proof.nothing-to-check-against');
  assert.deepEqual(result.violations[0]?.recovery.action, {
    kind: 'route',
    skill: 'founder-brain',
  });
});

test('the founder\'s own writing is never called invented', () => {
  const theirs: Artifact = {
    path: 'memory.md',
    text: 'I reckon about 90 people have asked me this.',
    authored: 'founder',
  };
  const result = checkNoInventedProof(theirs, ctxFor('b2c'));
  assert.deepEqual(result.violations, []);
});

test('every refusal points at the Brain as the way out', () => {
  const result = checkNoInventedProof(post('We have 40 clients.'), ctxFor('b2b'));
  for (const v of result.violations) {
    assert.deepEqual(v.recovery.action, { kind: 'edit', path: 'founder-brain.md' });
    assert.ok(v.recovery.label.length > 0);
  }
});
