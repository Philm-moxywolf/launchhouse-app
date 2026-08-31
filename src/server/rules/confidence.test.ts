/**
 * confidence.test.ts: the measurement, kept runnable.
 *
 * WHY IT EXISTS. The decision this round turned on was not an argument, it was a
 * count. Twenty sentences an ordinary founder would type, run through the gate,
 * with the number of them that lost the founder their work written down.
 * Fourteen. That number is why every rule in this folder was gone through and
 * asked, for each thing it can report, whether it is confident and whether the
 * harm is real.
 *
 * So the count lives here rather than in a commit message, and the test fails if
 * it climbs. Anybody widening a list, adding a noun, or promoting a code will
 * see what it cost before anybody else does.
 *
 * THE THREE THINGS THIS FILE PROVES
 *
 *   1  A founder writing ordinary true sentences about their own business is
 *      almost never interrupted. At most two of twenty may hold a file.
 *   2  The genuinely dangerous shapes are still held. Both halves matter: a
 *      quiet gate that catches nothing is not an improvement on a loud one.
 *   3  The founder can overrule it, once, and is not asked again.
 *
 * THE TWENTY ARE DELIBERATELY MUNDANE. Not adversarial, not clever. A kitchen
 * fitter, a groomer, a consultant, writing about their own week. Six of them
 * carry a figure that is genuinely a claim about the business, because that is
 * what founder writing is like, and a rule that only passes sentences with no
 * numbers in them has not solved anything.
 *
 * CALLED BY: node --test.
 * READS:     nothing on disk. The Brain is a fixture here rather than the
 *   worked examples, because the whole point is a Brain that grounds nothing.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmationFor,
  founderSees,
  isOverridable,
  judgementFor,
  quieten,
  JUDGEMENTS,
} from './confidence.ts';
import { runRules } from './index.ts';
import { checkNoDmAutomation } from './no-dm-automation.ts';
import { checkNoInventedProof } from './no-invented-proof.ts';
import { checkOwnership } from './ownership.ts';
import { checkProse, checkProseText } from './prose.ts';
import { checkTrack } from './track.ts';
import { confirmationLine, type Artifact, type FounderContext, type Violation } from './types.ts';

/**
 * A Brain with a track and nothing else. On purpose.
 *
 * Every figure in the twenty below is therefore ungrounded, which is the worst
 * case and the common one: a founder three days in whose Brain says what they
 * do and not how many of it they have done.
 */
const THIN_BRAIN = [
  '# Founder Brain',
  '',
  '- **Track:** b2c',
  '',
  '## Thesis',
  'I fit kitchens in Leeds and I am tired of quoting against people who cut corners.',
  '',
  '## Proof',
  'Thin. Two jobs I am proud of and no numbers written down yet.',
].join('\n');

const FOUNDER: FounderContext = { track: 'b2c', brain: THIN_BRAIN };

function post(text: string, path = 'content-30.md'): Artifact {
  return { path, text, authored: 'model' };
}

/**
 * Twenty sentences an ordinary founder would type.
 *
 * Written before the rules were touched, and not edited to make anything pass.
 * If one of them looks like it deserves to be caught, that is the point: several
 * of them do carry a real claim, and the question this file answers is whether
 * catching them is worth what catching them costs.
 */
const TWENTY_ORDINARY: readonly string[] = [
  'I started this business in my kitchen 4 years ago.',
  'Last week I spoke to 6 operations leads and every one of them said the same thing.',
  'I read 12 job posts this morning and none of them mentioned the actual problem.',
  'There are 25 people on my list.',
  'I have written 30 posts this quarter and the best one took 20 minutes.',
  'The average reply rate people quote is 3 percent.',
  'We saved a client 11 hours a week on their month end.',
  'My first job was on a site in Leeds and I stayed 9 years.',
  'Most of my work comes from 2 referrals a month.',
  'A typical kitchen takes 5 days to fit.',
  'I charge 2,500 GBP for a full survey.',
  'We groomed 340 dogs last year.',
  'I have 3 children and a van.',
  'The workshop holds 8 people comfortably.',
  'Our busiest month is October, roughly 40 bookings.',
  'It took me 18 months to get the first paying customer.',
  'I have 1,200 followers and most of them are local.',
  'The old software cost 89 GBP a month and did half of this.',
  'I want to get to 10 clients by Christmas.',
  'Two thirds of my enquiries come in on a Sunday night.',
];

/** What the gate does with one sentence: held, noted, or nothing at all. */
function verdict(line: string): { held: Violation[]; noted: Violation[] } {
  const answer = runRules(post(`## Post 1\n\n${line}\n`), FOUNDER);
  return { held: answer.blocked, noted: answer.notes };
}

test('AT MOST TWO OF TWENTY ORDINARY SENTENCES MAY COST A FOUNDER THEIR WORK', () => {
  const held = TWENTY_ORDINARY.filter((line) => verdict(line).held.length > 0);
  assert.ok(
    held.length <= 2,
    `${held.length} of 20 ordinary founder sentences were held back. The bar is two.\n${held.join('\n')}`,
  );
});

test('the one that is held is a result claim, which is what rule 5 is for', () => {
  // Pinned by name rather than by count, so a change that swaps one false
  // positive for another still fails here.
  const held = TWENTY_ORDINARY.filter((line) => verdict(line).held.length > 0);
  assert.deepEqual(held, ['We saved a client 11 hours a week on their month end.']);
});

test('A WHOLE CONTENT PLAN OF ORDINARY WRITING IS ONE LINE ON THE SCREEN', () => {
  // THE NUMBER THAT ACTUALLY MATTERS. A founder does not generate one sentence,
  // they generate thirty posts in one file. Sentence by sentence, thirteen of the
  // twenty carry a figure worth a note, and thirteen notes is a founder learning
  // to scroll. In one file they fold to one, with the count on the end, and the
  // screen shows at most three notes anyway.
  //
  // This is the bar the client set, in their words: a founder should be able to
  // work all afternoon and never see this thing.
  const ordinary = TWENTY_ORDINARY.filter((line) => verdict(line).held.length === 0);
  const plan = ordinary.map((line, i) => `## Post ${i + 1}\n\n${line}\n`).join('\n');
  const answer = runRules(post(plan), FOUNDER);

  assert.deepEqual(answer.blocked, [], 'nineteen ordinary posts must cost nothing');
  assert.equal(answer.notes.length, 1, `a founder read ${answer.notes.length} notes about their own true sentences`);
  assert.match(answer.notes[0]?.message ?? '', /more like it in this file/);
});

test('THE MEASUREMENT CAN FAIL, so its passing means something', () => {
  // The negative control. If `runRules` stopped returning blocked violations,
  // or the twenty stopped being read, the two tests above would pass on an empty
  // list and nobody would know.
  assert.equal(TWENTY_ORDINARY.length, 20);
  const invented = verdict('Our clients see an 82 per cent reduction in month end close.');
  assert.equal(invented.held.length, 1, 'the same harness still holds a real invention');
});

/**
 * The shapes that must still be held.
 *
 * Two per rule that can hold, so a change to one rule cannot quietly empty the
 * gate. Every line is one a model really does write when the Brain is thin.
 */
const MUST_STILL_BE_HELD: ReadonlyArray<readonly [string, string, string]> = [
  ['rule 2, a named channel', 'We can automate your Instagram DMs so you never send one by hand.', 'content-30.md'],
  ['rule 2, a tool doing the sending', 'Set up a bot to send the 25 cold DMs overnight while you sleep.', 'content-30.md'],
  ['rule 5, a change', 'We took one client from 71 days to 38 days.', 'content-30.md'],
  ['rule 5, an outcome', 'Our average client saves 11 hours a week.', 'content-30.md'],
  ['rule 5, a rate about the business', 'We have a 94 per cent retention rate.', 'content-30.md'],
  ['rule 1, the other track\'s file', 'Ten openers for your feed.', 'outreach-sequence.md'],
  ['rule 1, the other track\'s method', 'Build your ICP, then run the Apollo export.', 'content-30.md'],
  ['rule 4, a path outside the folder', 'Anything at all.', '../elsewhere.md'],
];

test('THE DANGEROUS SHAPES ARE STILL HELD, quiet is not the same as absent', () => {
  const missed: string[] = [];
  for (const [what, line, path] of MUST_STILL_BE_HELD) {
    const answer = runRules(post(line, path), FOUNDER);
    if (answer.blocked.length === 0) missed.push(`${what}: ${line}`);
  }
  assert.deepEqual(missed, []);
});

test('rule 2 is the one thing a founder cannot talk their way past', () => {
  // Everywhere else the founder is the authority on their own business. Here the
  // party that decides is Instagram, and an override would be the app helping
  // somebody agree to something it knows will cost them their account.
  const answer = runRules(
    post('We can automate your Instagram DMs so you never send one by hand.'),
    { ...FOUNDER, confirmed: [{ rule: 'no-dm-automation', found: 'automating DMs' }] },
  );
  assert.equal(answer.ok, false, 'a confirmation must not open the one door that stays shut');
  assert.equal(isOverridable('dm.offered'), false);
});

/* -------------------------------------------------------------------------- */
/* The table itself                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Every code the rules can actually emit, driven out of the real rules rather
 * than typed out, so a new code cannot be added without appearing here.
 */
function everyCodeTheRulesEmit(): string[] {
  const b2b: FounderContext = { track: 'b2b', brain: THIN_BRAIN.replace('b2c', 'b2b') };
  const b2c: FounderContext = { track: 'b2c', brain: THIN_BRAIN };
  const EM = String.fromCodePoint(0x2014);
  const out: Violation[] = [];
  const add = (vs: Violation[]): void => {
    out.push(...vs);
  };

  add(checkProse(post(`A seamless ${EM} game changer, 11-13 of them, and we guarantee a reply.`)).violations);
  add(checkProse(post('Nothing here guarantees a reply, whatever anyone says.')).violations);

  add(checkTrack(post('Enrol them in the email sequence with Apollo, ICP and DKIM.'), b2c).violations);
  add(checkTrack(post('Set up your hook bank and a Business account.'), b2b).violations);
  add(checkTrack(post('x', 'outreach-sequence.md'), b2c).violations);
  add(checkTrack(post('x', 'dm-openers.md'), { track: null, brain: null }).violations);
  add(checkTrack(post('# Founder Brain\n\n## Thesis\nx\n', 'founder-brain.md'), b2b).violations);
  add(checkTrack(post('# Founder Brain\n\n- **Track:** both\n', 'founder-brain.md'), b2b).violations);
  add(checkTrack(post('# Founder Brain\n\n- **Track:** b2c\n', 'founder-brain.md'), b2b).violations);
  add(checkTrack(post('key: a@b.co\nname: X\n\n## Yours\n', 'people/a-b-co.md'), b2b).violations);
  add(checkTrack(post('key: a@b.co\nkind: lurker\n\n## Yours\n', 'people/a-b-co.md'), b2b).violations);
  add(checkTrack(post('key: a@b.co\nkind: prospect\n\n## Yours\n', 'people/a-b-co.md'), b2c).violations);
  add(checkTrack(post('key: a@b.co\nkind: prospect\nhandle: x\n\n## Yours\n', 'people/a-b-co.md'), b2b).violations);

  add(checkNoDmAutomation(post('We can automate DMs for you, in bulk, on a schedule.')).violations);
  add(checkNoDmAutomation(post('There is no DM automation here.')).violations);
  add(checkNoDmAutomation(post('The sequence handles the Instagram side too.')).violations);
  add(checkNoDmAutomation(post('Set up an autoresponder for people you have not spoken to yet.')).violations);

  add(checkNoInventedProof(post('We have 63 clients and 68% stay.'), b2b).violations);
  add(checkNoInventedProof(post('I have 3 children and a van.'), b2b).violations);
  add(checkNoInventedProof(post('Anything.'), { track: 'b2b', brain: null }).violations);

  add(checkOwnership(post('x', '../out.md')).violations);
  add(checkOwnership(post('x', '/etc/passwd')).violations);
  add(checkOwnership(post('x', 'people\\bad.md')).violations);
  add(checkOwnership(post('x', ' scratch.md ')).violations);
  add(checkOwnership(post('x', 'scratch.md')).violations);
  add(checkOwnership(post('x', 'people/Bad Name.md')).violations);
  add(
    checkOwnership(
      { path: 'people/a-b-co.md', text: 'k: v\n\n## Yours\nmine, tidied', authored: 'model' },
      { previous: 'k: v\n\n## Yours\nmine, untidied   ' },
    ).violations,
  );

  return [...new Set(out.map((v) => v.code))].sort();
}

test('EVERY CODE A RULE CAN EMIT HAS BEEN ASKED THE TWO QUESTIONS', () => {
  // The default for an unknown code is a note, which is safe. It is not meant to
  // be a place codes live. A code with no row is a code nobody has thought about,
  // and this is where they get found.
  const rated = new Set(JUDGEMENTS.map((j) => j.code));
  const unrated = everyCodeTheRulesEmit().filter((code) => !rated.has(code));
  assert.deepEqual(unrated, [], 'these codes reach a founder with nobody having judged them');
});

test('the table answers both questions in words, not in a flag', () => {
  for (const j of JUDGEMENTS) {
    assert.ok(j.sure.length > 30, `${j.code} has no answer to "am I confident"`);
    assert.ok(j.harm.length > 30, `${j.code} has no answer to "is the harm real"`);
    assert.ok(['held', 'note', 'nothing'].includes(j.sees), j.code);
  }
});

test('no code appears twice, so there is one answer per finding', () => {
  const codes = JUDGEMENTS.map((j) => j.code);
  assert.deepEqual(codes, [...new Set(codes)]);
});

test('AN UNKNOWN CODE IS A NOTE, never a held file', () => {
  // The direction of the default is the safety argument. A finding nobody has
  // argued for is a finding nobody has argued is worth a founder's afternoon.
  assert.equal(founderSees('something.invented-next-month'), 'note');
  assert.equal(founderSees(''), 'note');
  assert.equal(judgementFor('something.invented-next-month'), undefined);
});

test('a held file described in the notes keeps the judgement of the rule behind it', () => {
  // harvest-gate prefixes a held file's note with `held.`. Without reading
  // through the prefix that entry would fall to the unknown default, which is
  // the same answer by luck rather than by decision.
  assert.equal(founderSees('held.dm.offered'), 'held');
  assert.equal(founderSees('held.prose.dash'), 'note');
});

test('QUIETENING ONLY EVER QUIETENS', () => {
  // The one property that makes a wrong row survivable. A mistake in the table
  // costs a missing note, never a lost file, and a rule that chose `warn` for a
  // local reason it understands better keeps it.
  for (const j of JUDGEMENTS) {
    if (j.sees !== 'held') continue;
    const asWarn: Violation = {
      rule: 'prose',
      code: j.code,
      severity: 'warn',
      where: { path: 'content-30.md', line: 1, column: 1, excerpt: 'x' },
      found: 'x',
      message: 'x',
      why: 'x',
      recovery: { label: 'Ask for that one again', action: { kind: 'reply' } },
    };
    const out = quieten({ rule: 'prose', ok: true, checked: ['content-30.md'], violations: [asWarn], notes: [] });
    assert.equal(out.violations[0]?.severity, 'warn', `${j.code} was made louder than the rule asked for`);
  }
});

/* -------------------------------------------------------------------------- */
/* The way past it                                                             */
/* -------------------------------------------------------------------------- */

test('SAYING A FIGURE IS RIGHT SETTLES IT, and it is not asked again', () => {
  const line = 'We saved a client 11 hours a week on their month end.';
  const before = runRules(post(line), FOUNDER);
  assert.equal(before.ok, false, 'this case needs to be held first');

  const confirmed = confirmationFor(before.blocked[0] as Violation);
  assert.deepEqual(confirmed, { rule: 'no-invented-proof', found: '11' });

  const after = runRules(post(line), { ...FOUNDER, confirmed: [confirmed as never] });
  assert.equal(after.ok, true, 'the founder said it was right and it was held anyway');
  assert.deepEqual(after.notes, [], 'settled means settled, not settled with a note');
});

test('a confirmation follows the founder, not the file', () => {
  // They were answering a question about their business. The next post is not a
  // fresh question, and asking again is how a founder learns to click past.
  const confirmed = [{ rule: 'no-invented-proof' as const, found: '11' }];
  const elsewhere = runRules(
    post('The month end takes 11 hours less than it did.', '90-day-plan.md'),
    { ...FOUNDER, confirmed },
  );
  assert.equal(elsewhere.ok, true);
});

test('a confirmation does not switch off the rest of the gate', () => {
  // One click must silence one thing. If this ever passes with nothing reported,
  // the override has become an off switch.
  const confirmed = [{ rule: 'no-invented-proof' as const, found: '11' }];
  const answer = runRules(
    post('We saved a client 11 hours a week. A seamless month end.'),
    { ...FOUNDER, confirmed },
  );
  assert.deepEqual(answer.notes.map((v) => v.code), ['prose.banned-word']);
});

test('the founder cannot confirm the things they are not the judge of', () => {
  for (const j of JUDGEMENTS) {
    if (j.overridable) continue;
    const v: Violation = {
      rule: 'no-dm-automation',
      code: j.code,
      severity: 'block',
      where: { path: 'content-30.md', line: 1, column: 1, excerpt: 'x' },
      found: 'x',
      message: 'x',
      why: 'x',
      recovery: { label: 'Ask for that one again', action: { kind: 'reply' } },
    };
    assert.equal(confirmationFor(v), null, `${j.code} offered a way past it`);
  }
});

test('what a confirmation writes into the founder\'s own Brain', () => {
  // It goes in their file, under Proof, in a line they can read and delete. Not
  // a hidden flag in a table they will never see.
  assert.equal(
    confirmationLine({ rule: 'no-invented-proof', found: '1,200' }, '2026-09-14'),
    '- 1,200, checked by me on 2026-09-14',
  );
});

/* -------------------------------------------------------------------------- */
/* What the founder reads                                                      */
/* -------------------------------------------------------------------------- */

test('NOTHING THE GATE SAYS NAMES A RULE, A CODE OR A PATTERN', () => {
  const jargon = /\brule \d|prose\.|proof\.|track\.|ownership\.|dm\.|violation|severity|regex|pattern\b/i;
  const seen: string[] = [];
  for (const line of [...TWENTY_ORDINARY, ...MUST_STILL_BE_HELD.map(([, l]) => l)]) {
    const answer = runRules(post(line), FOUNDER);
    for (const v of [...answer.blocked, ...answer.notes]) {
      for (const text of [v.message, v.why, v.recovery.label]) {
        if (jargon.test(text)) seen.push(`${v.code}: ${text}`);
      }
    }
  }
  assert.deepEqual(seen, []);
});

test('the folded message a founder reads passes the house style', () => {
  // The count sentence is written in confidence.ts rather than in a rule, so the
  // self test in index.test.ts does not see it. This is where it gets checked.
  const answer = runRules(post('I have 1,200 followers.\nWe have 88 firms.\nThere are 25 people on my list.'), FOUNDER);
  const folded = answer.notes[0]?.message ?? '';
  assert.match(folded, /more like it in this file/);
  assert.deepEqual(checkProseText('the folded note', folded).violations, []);
});
