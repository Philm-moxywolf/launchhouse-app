/**
 * prose.test.ts: the house style rules, run against the two worked examples and
 *   against the shapes a model actually produces.
 *
 * WHY IT EXISTS: the two example brains in the content repo were written under
 *   this house style by hand. If the runtime gate flags either of them, the
 *   gate is wrong, not the example. That is the strongest false positive test
 *   available, because those two files are the standard 130 founders are told
 *   to calibrate against.
 *
 * CALLED BY: node --test.
 * READS:     the two example brains from the content repo.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkProse } from './prose.ts';
import { exampleBrain } from './test-fixtures.ts';
import type { Artifact } from './types.ts';

/** Built rather than typed, so no editor can normalise them away. */
const EM = String.fromCodePoint(0x2014);
const EN = String.fromCodePoint(0x2013);

function post(text: string): Artifact {
  return { path: 'content-30.md', text, authored: 'model' };
}

test('both worked example brains pass the house style gate', () => {
  for (const track of ['b2b', 'b2c'] as const) {
    const brain = exampleBrain(track);
    const result = checkProse({ path: 'founder-brain.md', text: brain, authored: 'model' });
    assert.deepEqual(
      result.violations.map((v) => `${v.code} line ${v.where.line}: ${v.found}`),
      [],
      `the ${track} example brain should pass`,
    );
    assert.equal(result.ok, true);
  }
});

test('an em dash is refused and the founder is told where', () => {
  const result = checkProse(post(`Two named cases ${EM} enough to write from.`));
  assert.equal(result.ok, false);
  const v = result.violations[0];
  assert.equal(v?.code, 'prose.dash');
  assert.equal(v?.where.line, 1);
  assert.match(v?.message ?? '', /em dash/);
  assert.ok((v?.recovery.label.length ?? 0) > 0, 'every refusal ends on a way out');
});

test('an en dash is refused and named as an en dash', () => {
  const result = checkProse(post(`Sessions run Monday ${EN} Tuesday.`));
  assert.match(result.violations[0]?.message ?? '', /en dash/);
});

test('a banned marketing word is refused, with the word named', () => {
  const result = checkProse(post('This will supercharge your pipeline.'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'prose.banned-word');
  assert.equal(result.violations[0]?.found.toLowerCase(), 'supercharge');
});

test('two banned words on one line are both reported', () => {
  const result = checkProse(post('A seamless unlock for your business.'));
  const found = result.violations.map((v) => v.found.toLowerCase());
  assert.deepEqual(found, ['seamless', 'unlock']);
});

test('a word that merely contains a banned word is left alone', () => {
  const result = checkProse(post('The door was padlocked and the gate was unlockable-ish.'));
  assert.deepEqual(result.violations, []);
});

test('a banned phrase is refused', () => {
  const result = checkProse(post('A real game changer for site managers.'));
  assert.equal(result.violations[0]?.code, 'prose.banned-phrase');
});

test('a range written with a dash is refused and the fix is spelled out', () => {
  const result = checkProse(post('Firms turning over 1M-5M.'));
  const v = result.violations.find((x) => x.code === 'prose.range-dash');
  assert.ok(v, 'expected a range violation');
  assert.equal(v?.found, '1M-5M');
  assert.match(v?.message ?? '', /"1M to 5M"/);
});

test('THE WHOLE RANGE IS QUOTED BACK, both sides of the dash', () => {
  // The pattern used to stop at the first digit on the right, so a founder who
  // wrote "11-13" was told to write "11 to 1". Wrong advice, in their own words,
  // on the one house style rule the project documents spell out with this exact
  // example.
  const v = checkProse(post('Do 11-13 of them a week.')).violations.find(
    (x) => x.code === 'prose.range-dash',
  );
  assert.ok(v, 'expected a range violation');
  assert.equal(v?.found, '11-13');
  assert.match(v?.message ?? '', /"11 to 13"/);
});

test('the range does not swallow the short word after it', () => {
  // Matching a unit after a space on the right would report "11-13 of", and the
  // suggested fix is built by replacing the dash, so the founder would be told to
  // write "11 to 13 of".
  const v = checkProse(post('Do 11-13 of them a week.')).violations.find(
    (x) => x.code === 'prose.range-dash',
  );
  assert.doesNotMatch(v?.found ?? '', /\s/);
});

test('the range does not swallow the full stop at the end of the sentence', () => {
  const v = checkProse(post('Aim for 8-40.')).violations.find((x) => x.code === 'prose.range-dash');
  assert.equal(v?.found, '8-40');
});

test('a range with thousands separators is read whole', () => {
  const v = checkProse(post('Firms turning over 1,500-2,000 a month.')).violations.find(
    (x) => x.code === 'prose.range-dash',
  );
  assert.equal(v?.found, '1,500-2,000');
  assert.match(v?.message ?? '', /"1,500 to 2,000"/);
});

test('the same range written the house way passes', () => {
  const result = checkProse(post('Firms turning over 1M to 5M, 8 to 40 staff.'));
  assert.deepEqual(result.violations, []);
});

test('a date is not a range', () => {
  const result = checkProse(post('- **Locked:** 2026-08-19\n\nWritten on 2026-09-25.'));
  assert.deepEqual(result.violations, []);
});

test('a file name with a number in it is not a range', () => {
  const result = checkProse(post('Your pieces are in content-30.md and the plan in 90-day-plan.md.'));
  assert.deepEqual(result.violations, []);
});

test('a hyphen inside a link or a code span is not a range', () => {
  const result = checkProse(
    post('See https://example.com/a1-2b and run `ge person touch 1-2` when ready.'),
  );
  assert.deepEqual(result.violations, []);
});

test('promising a reply is refused, which is rule 3', () => {
  const result = checkProse(post('Send these and we guarantee a reply within a week.'));
  const v = result.violations.find((x) => x.code === 'prose.promise-reply');
  assert.ok(v, 'expected a reply promise violation');
  assert.match(v?.why ?? '', /list, your offer and your timing/);
});

test('saying replies are never promised is not itself a promise', () => {
  const result = checkProse(
    post('Nobody can promise a reply. Twenty five good messages is the work.'),
  );
  assert.deepEqual(result.violations, []);
});

test('the founder\'s own writing is left alone by default', () => {
  const theirs: Artifact = {
    path: 'memory.md',
    text: `I want this to be seamless ${EM} that is the whole point.`,
    authored: 'founder',
  };
  const result = checkProse(theirs);
  assert.equal(result.ok, true);
  assert.match(result.notes.join(' '), /written by the founder/);
});

test('the founder\'s own writing can be checked on request, and the way out is their editor', () => {
  const theirs: Artifact = {
    path: 'memory.md',
    text: 'I want this to be seamless.',
    authored: 'founder',
  };
  const result = checkProse(theirs, { includeFounderWriting: true });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.recovery.action.kind, 'edit');
});

test('a result always records what it checked, so a silent pass is impossible', () => {
  const result = checkProse(post('Nothing wrong here.'));
  assert.deepEqual(result.checked, ['content-30.md']);
});

test('line and column point at the problem, not at the start of the file', () => {
  const result = checkProse(post(`line one\nline two\nand a ${EM} here`));
  assert.equal(result.violations[0]?.where.line, 3);
  assert.equal(result.violations[0]?.where.column, 7);
});
