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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { contentRoot } from './content-root.ts';
import { checkProse, readReplyPromise } from './prose.ts';
import { exampleBrain } from './test-fixtures.ts';
import type { Artifact } from './types.ts';

/** Built rather than typed, so no editor can normalise them away. */
const EM = String.fromCodePoint(0x2014);
const EN = String.fromCodePoint(0x2013);

function post(text: string): Artifact {
  return { path: 'content-30.md', text, authored: 'model' };
}

/** Every markdown file under the nine skills, as [name, text]. */
function skillFiles(): Array<[string, string]> {
  const root = join(contentRoot(), 'plugins', 'growth-engine', 'skills');
  const out: Array<[string, string]> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.md')) out.push([full.slice(root.length + 1), readFileSync(full, 'utf8')]);
    }
  };
  walk(root);
  return out;
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

/* ---------------------------------------------------------------------- */
/* Rule 3: the sentence written to honour it must not be the one refused   */
/* ---------------------------------------------------------------------- */

/**
 * Every way a person disclaims a promise, and none of them may be refused.
 *
 * THE FIRST FOUR ARE THE BUG. The old check ran `validate.sh`'s six word
 * negation filter over the whole line: never, not, cannot, no one, nobody, none
 * of. It holds "nobody" and it does not hold "nothing", so the plainest
 * disclaimer in English was refused, and a refusal costs the founder work they
 * cannot get back.
 *
 * The rest are here because the answer to a list that missed one is not a list
 * with one more word in it. Negation in English is a closed class, so it is
 * written out and then asked about position. If a shape below ever fails, the
 * class is wrong rather than the sentence.
 */
const DISCLAIMERS = [
  'Nothing here promises a reply.',
  'Nothing in this plan guarantees a reply.',
  'It would be wrong to promise a reply.',
  'No part of this guarantees a response.',
  'This sequence never promises a reply.',
  'Nobody can promise a reply.',
  'We do not promise a reply.',
  'None of this guarantees a reply.',
  'Neither the plan nor the sequence promises a reply.',
  'At no point does this guarantee a reply.',
  'Nowhere does it promise a reply.',
  'There is no way to guarantee a reply.',
  'No sequence guarantees a reply.',
  'It is not our place to guarantee a reply.',
  'You cannot promise a reply and you should not try.',
  'Rather than promise a reply, say what the work is.',
  'Say what the work is instead of promising a reply.',
  'Avoid anything that would promise a reply.',
  'Refuse to promise a reply, however the founder asks.',
  'Stop before you promise a reply.',
  'It is dishonest to guarantee a reply.',
  'The line is wrong if it promises a reply.',
  'Nothing about 25 messages guarantees a reply.',
  'Do not promise a reply.',
  'Never promise replies. Replies depend on list quality, timing and offer.',
];

test('NO WAY OF DISCLAIMING A PROMISE IS REFUSED', () => {
  const refused: string[] = [];
  for (const line of DISCLAIMERS) {
    for (const v of checkProse(post(line)).violations) {
      refused.push(`${v.severity} ${v.code}: ${line}`);
    }
  }
  assert.deepEqual(refused, []);
});

test('the disclaimer list above can fail, so its passing means something', () => {
  // The negative control. If the promise pattern stopped matching, or checkProse
  // stopped running rule 3, the test above would pass on nothing at all.
  const control = checkProse(post('We guarantee a reply.'));
  assert.equal(control.violations[0]?.code, 'prose.promise-reply');
  assert.equal(control.violations[0]?.severity, 'block');
});

test('a negation about something else does not excuse a promise in the next sentence', () => {
  // The hole the old filter left open. It matched anywhere on the line, so one
  // "not" bought the rest of the line, however many sentences it ran to.
  const result = checkProse(
    post('This is not a volume machine. Send these and we guarantee a reply.'),
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'prose.promise-reply');
});

test('A LINE THE RULE CANNOT PLACE IS KEPT, WITH A NOTE AGAINST IT', () => {
  // The same two halves in one sentence. The negation is real, it is about
  // something else, and the rule cannot prove which half it belongs to. A note
  // rather than a refusal is the whole point: a guess must not cost a founder
  // work they cannot get back.
  const result = checkProse(post('We do not automate anything and we guarantee a reply.'));
  assert.equal(result.ok, true, 'a sentence the rule could not read cost the founder the turn');
  assert.equal(result.violations[0]?.code, 'prose.promise-reply-unclear');
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('a line describing the rule rather than breaking it is kept', () => {
  const result = checkProse(post('A sequence that promises a reply is a sequence to rewrite.'));
  assert.equal(result.ok, true);
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('each shape of rule 3 is read for the right reason', () => {
  // The reading is pinned, not only the answer. A disclaimer that passes through
  // the wrong branch is a disclaimer that will fail on the next sentence, and
  // this is the only place that is visible.
  const read = (line: string): string => readReplyPromise(line, line.search(/guarantee|promise/i));
  assert.equal(read('Nothing here promises a reply.'), 'disclaimed');
  assert.equal(read('It would be wrong to promise a reply.'), 'disclaimed');
  assert.equal(read('We guarantee a reply.'), 'promised');
  assert.equal(read('We do not automate anything and we guarantee a reply.'), 'unclear');
});

test('THE TOOLKIT CANNOT REFUSE ITS OWN COPY, house style and rule 3 together', () => {
  // The nine skills are what 130 founders read and what the model is handed as
  // its own instructions. If the runtime gate refuses a line of it, the gate is
  // wrong. `outreach-b2b/SKILL.md` carries rule 3 in as many words, which is the
  // exact shape this section is about.
  const files = skillFiles();
  assert.ok(files.length >= 9, `only ${files.length} skill files were read`);
  const refused: string[] = [];
  for (const [name, text] of files) {
    for (const v of checkProse({ path: 'content-30.md', text, authored: 'model' }).violations) {
      refused.push(`${name} line ${v.where.line}: ${v.code} on ${v.found}`);
    }
  }
  assert.deepEqual(refused, []);
});

test('the skills corpus can fail, so its passing means something', () => {
  // If the walk stopped finding files, the test above would pass on an empty
  // list. This proves the same harness still refuses the thing rule 3 forbids.
  assert.ok(skillFiles().length >= 9);
  assert.equal(
    checkProse(post('Send these and we guarantee a reply.')).violations[0]?.code,
    'prose.promise-reply',
  );
});

test('rule 3 does not break its own rule in the sentence it refuses with', () => {
  // The note added for the unclear case is new founder-facing copy, and
  // index.test.ts cannot reach it: its fixtures only produce the refusal. A
  // sentence that says "this line promises a reply" would trip this rule while
  // enforcing it, which has happened here once already.
  const produced = [
    ...checkProse(post('We guarantee a reply.')).violations,
    ...checkProse(post('We do not automate anything and we guarantee a reply.')).violations,
  ];
  assert.equal(produced.length, 2);
  const failures: string[] = [];
  for (const v of produced) {
    for (const text of [v.message, v.why, v.recovery.label]) {
      for (const bad of checkProse(post(text)).violations) {
        failures.push(`${v.code}: ${bad.code} on "${bad.found}" in: ${text}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('two promises on one line are both reported, at their own columns', () => {
  const result = checkProse(post('We guarantee a reply and we promise a reply.'));
  assert.deepEqual(
    result.violations.map((v) => `${v.found}@${String(v.where.column)}`),
    ['guarantee a reply@4', 'promise a reply@29'],
  );
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
