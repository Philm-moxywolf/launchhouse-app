/**
 * no-invented-proof.test.ts: rule 5, tested in both directions against the
 *   product's own material.
 *
 * WHY IT EXISTS: this rule is wrong in two directions and only one of them is
 *   visible. A missed invention shows up months later, in front of a buyer. A
 *   false refusal shows up on the first content plan of the first session, and
 *   costs the founder the whole turn, because a blocking violation throws
 *   `RulesRefused` and `storage/turn.ts` rolls everything back.
 *
 *   The first version of the rule read every number next to a unit of time as a
 *   claimed result. That refused "Send 25 DMs a week", which is the sentence the
 *   whole B2C track is built on. So this file is built as a corpus test in both
 *   directions:
 *
 *     MUST PASS. The two worked example Brains, every line with a digit in the
 *       nine skills, and the cadence sentences a content plan is made of. None
 *       of these may produce a blocking violation.
 *     MUST BE CAUGHT. Invented counts, rates, money and outcomes, written the
 *       way a model actually writes them. Every one must still be refused.
 *
 *   Both halves have a negative control, because a corpus test that cannot fail
 *   is a corpus test that proves nothing.
 *
 * CALLED BY: node --test.
 * READS:     the two example brains and the nine skills, from the vendored
 *   content repo, through content-root.ts.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { contentRoot } from './content-root.ts';
import {
  checkNoInventedProof,
  readingsFor,
  readNumbers,
  type NumberKind,
} from './no-invented-proof.ts';
import { checkProseText } from './prose.ts';
import { exampleBrain } from './test-fixtures.ts';
import type { Artifact, FounderContext, Track, Violation } from './types.ts';

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

/** Everything that would stop the turn. The only thing the corpus tests count. */
function blocks(text: string, track: Track): Violation[] {
  return checkNoInventedProof(post(text), ctxFor(track)).violations.filter(
    (v) => v.severity === 'block',
  );
}

/** The one reading for a line that holds exactly one number. */
function readingOf(text: string): { kind: NumberKind; because: string } {
  const all = readingsFor(text);
  assert.equal(all.length, 1, `expected one number in "${text}", found ${all.length}`);
  const only = all[0];
  assert.ok(only !== undefined);
  return { kind: only.kind, because: only.because };
}

/* -------------------------------------------------------------------------- */
/* Reading a number                                                            */
/* -------------------------------------------------------------------------- */

test('numbers are read the way they are written', () => {
  const tokens = readNumbers('340 customers, 31%, 4.7 stars, 8k a month, 1,800 GBP, 1M turnover');
  assert.deepEqual(
    tokens.map((t) => t.value),
    [340, 31, 4.7, 8000, 1800, 1000000],
  );
});

test('a number knows where it ends, including its currency mark and its percent sign', () => {
  // The noun after the number is what decides whether it is a claim, and finding
  // that noun means knowing where the number stopped. "index plus raw.length" is
  // wrong by the width of the pound sign, because index points at the digits.
  const [pounds] = readNumbers('£40k customers');
  assert.ok(pounds !== undefined);
  assert.equal('£40k customers'.slice(pounds.end), ' customers');

  const [rate] = readNumbers('31% reordered');
  assert.ok(rate !== undefined);
  assert.equal('31% reordered'.slice(rate.end), ' reordered');
});

/* -------------------------------------------------------------------------- */
/* THE SENTENCES THAT BROKE IT. These are the reason this file was rewritten.  */
/* -------------------------------------------------------------------------- */

/**
 * A realistic B2C content plan, as the content engine writes one, with the
 * Founder Brain as grounding. Every one of these lines was refused by the first
 * version of the rule.
 */
const THE_FIRST_CONTENT_PLAN = [
  '# Your 30 day content plan',
  '',
  'Post 3 to 5 times a week.',
  'Send 25 DMs a week, by hand, from your own account.',
  'Reply within 24 hours.',
  'Block 45 minutes on Tuesday to write the week.',
  'Post 11 to 13 times a week.',
  'Post eleven to thirteen times a week.',
].join('\n');

test('THE FIRST CONTENT PLAN IN THE ROOM IS NOT REFUSED', () => {
  const result = checkNoInventedProof(post(THE_FIRST_CONTENT_PLAN), ctxFor('b2c'));
  assert.deepEqual(
    result.violations.map((v) => `${v.severity} ${v.found} on line ${String(v.where.line)}`),
    [],
  );
  assert.equal(result.ok, true);
});

test('the house style range form is read the same as the same range in words', () => {
  // "Post 11 to 13 times a week" was refused on the 13 while "eleven to
  // thirteen" passed, which meant the rule refused the project's own house
  // style. Both endpoints of a range take the noun at the end of the range.
  assert.deepEqual(codes('Post 11 to 13 times a week.', 'b2c'), []);
  assert.deepEqual(codes('Post eleven to thirteen times a week.', 'b2c'), []);
  assert.equal(readingOf('Post 11 to 13 times a week.').kind, 'work');
});

test('the shapes of a quantity of work are read as work, and for the right reason', () => {
  // The `because` is pinned, not only the answer. A change that gets the right
  // kind through the wrong branch is a change that will get the next sentence
  // wrong, and this is the only place that is visible.
  const cases: Array<[string, string]> = [
    // "Post 3" is masked before the scan even runs, as a position in a run,
    // the same shape as "Piece 4". So the only number left on this line is the
    // 5, and it is read from the cadence at the end of the range.
    ['Post 3 to 5 times a week.', 'a quantity of time or work'],
    ['Send 25 DMs a week, by hand, from your own account.', 'an instruction to the founder'],
    ['Reply within 24 hours.', 'an instruction to the founder'],
    ['Block 45 minutes on Tuesday to write the week.', 'an instruction to the founder'],
    ['# Your 30 day content plan', 'a length of time used as a name'],
    ['A plan that runs over 90 days.', 'a quantity of time or work'],
  ];
  for (const [line, because] of cases) {
    const reading = readingOf(line);
    assert.equal(reading.kind, 'work', `${line} was read as ${reading.kind}`);
    assert.equal(reading.because, because, line);
  }
});

test('a length of time used as a name is not a measurement', () => {
  // The singular unit is what marks it. English compounds go "90 day plan"; a
  // measured quantity goes "90 days". The toolkit's own growth-plan skill says
  // "build my 90 day plan", "growth plan", and "growth" three words from a 90
  // with "my" in the sentence was read as growth of 90.
  assert.equal(readingOf('Build my 90 day plan and the growth plan together.').kind, 'work');
  assert.equal(readingOf('A 14 day window, then stop.').kind, 'work');
  assert.equal(readingOf('The 30-day refill runs on the same pillars.').kind, 'work');
  // The plural still reads as a quantity, which is what keeps a real outcome
  // checkable: "we cut it to 24 hours" must not become a compound.
  assert.equal(blocks('We cut their invoicing to 26 hours.', 'b2b').length, 1);
});

test('a result word in the NEXT sentence is not about this number', () => {
  // "Days 61 to 90. Double down or cut, based on the data." A window measured in
  // characters walks across the full stop and reads "cut" as an outcome, which
  // refused the growth plan's own headings.
  assert.deepEqual(blocks('**Days 61 to 90.** Double down or cut, based on the data.', 'b2b'), []);
  assert.deepEqual(blocks('- Under 120 words per touch. Shorter converts.', 'b2b'), []);
});

test('an outcome verb needs somebody it happened to', () => {
  // The same verb twice. One is a checklist line about a spreadsheet and one is
  // a claim about a client, and the only thing separating them is the subject.
  assert.deepEqual(blocks('Build to 35, then cut to 25.', 'b2b'), []);
  assert.equal(blocks('We cut their invoicing to 26 hours.', 'b2b').length, 1);
});

/* -------------------------------------------------------------------------- */
/* MUST BE CAUGHT: what THIS cohort invents, which is not what a textbook does  */
/* -------------------------------------------------------------------------- */

/**
 * A Founder Brain for a local service business, holding real numbers, none of
 * which are the ones claimed below.
 *
 * WHY NOT ONE OF THE WORKED EXAMPLES. Priya's Brain says 340 customers, 180
 * TikTok followers and "women 28 to 45". Check "You have groomed 340 dogs"
 * against it and the number is grounded, so the line passes for a reason that
 * has nothing to do with the shape being tested, and the test proves nothing.
 * Fictional, like the two worked examples, and for the same reason.
 */
const A_GROOMER: FounderContext = {
  track: 'b2c',
  brain: [
    '# Founder Brain',
    '- **Track:** b2c',
    '## Proof',
    '- Two regulars who have been coming for 6 years.',
    '- Roughly 3k GBP a month.',
  ].join('\n'),
};

/**
 * The nouns a room of 130 local founders actually writes.
 *
 * Every textbook probe was already refused: 340 customers, 82 per cent, a
 * testimonial, a revenue figure. Then the same lie about dogs and boilers went
 * through, six of them as a note that saved the file and two in silence, because
 * the rule was reading a list of nouns and the nouns belonged to somebody else's
 * business. Not one of these words is in a list, and not one of them will be.
 */
const THE_COHORT_INVENTS = [
  'You have groomed 340 dogs.',
  'We have photographed 180 weddings.',
  'We have taught 900 learners.',
  'We have fitted 45 kitchens.',
  'We have serviced 1,200 boilers.',
  'We have treated 5,000 animals.',
  'You have served 2,400 meals this year.',
  'You have run 400 sessions with clients.',
  // The same claim in the other shapes it gets written in.
  'We groomed 340 dogs last year.',
  'She has walked 900 dogs since 2019.',
  'You have delivered 400 cakes to couples in Atlanta.',
  'I have cleaned 1,200 gutters across the city.',
];

test('THE NOUNS THIS COHORT COUNTS ARE CAUGHT, AND NONE OF THEM IS IN A LIST', () => {
  const missed: string[] = [];
  for (const line of THE_COHORT_INVENTS) {
    const violations = checkNoInventedProof(post(line), A_GROOMER).violations;
    if (!violations.some((v) => v.severity === 'block')) {
      missed.push(`${line}  read as ${JSON.stringify(readingsFor(line))}`);
    }
  }
  assert.deepEqual(missed, []);
});

test('a completed count is refused for the frame, not for the noun', () => {
  // The `because` is pinned. If one of these ever passes through "a count of
  // proof" instead, somebody has put a noun in the proof list, and the next
  // groomer's content plan is going to be refused for saying "dog".
  for (const line of THE_COHORT_INVENTS) {
    const [only] = readingsFor(line);
    assert.ok(only !== undefined, line);
    assert.equal(only.kind, 'result', line);
    assert.equal(only.because, 'a count of something already done', line);
  }
});

test('THE COHORT LIST ABOVE CAN FAIL, so its passing means something', () => {
  // The negative control, in both directions. The same harness must still say
  // nothing about the same noun in a sentence that has not happened yet.
  assert.ok(THE_COHORT_INVENTS.length >= 10);
  const homework = checkNoInventedProof(post('Groom 4 dogs a day, then write one post.'), A_GROOMER);
  assert.deepEqual(homework.violations, [], 'a cadence about the same noun must stay silent');
});

test('THE SAME NOUN IN NEXT WEEK\'S WORK IS STILL SILENT', () => {
  // This is the half that has to hold. Adding "dogs" to the proof noun list
  // would catch the claims above and refuse every one of these, on the first
  // content plan a groomer generates.
  const homework = [
    'Post 3 dog photos a week.',
    'Book 4 dog walks a week.',
    'Groom 4 dogs a day and write one post about it.',
    'Serve 40 meals a week and the rest follows.',
    'Fit 2 kitchens a month and film both.',
    'You have 12 pieces to approve.',
    'You have already spent 45 minutes on this.',
    'Once you have groomed 4 dogs, write the post.',
    'After you have sent 25 messages, stop and read what came back.',
  ].join('\n');
  const result = checkNoInventedProof(post(homework), A_GROOMER);
  assert.deepEqual(
    result.violations.filter((v) => v.severity === 'block').map((v) => v.where.excerpt),
    [],
  );
});

test('a stretch of time is not a count of things done', () => {
  // "You have already spent 40 minutes on this" is a completed action counting a
  // duration, which is a report of how long something took, not a claim about a
  // business. The unit is what separates them.
  assert.equal(readingOf('You have already spent 40 minutes on this.').kind, 'work');
  assert.equal(readingOf('We have been at this for 15 years.').kind, 'work');
});

test('nobody did it, so it is not a completed action', () => {
  // "There have been 3 posts this week" is the app reading a founder's own
  // folder back to them. It carries a perfect and it counts nothing anybody did,
  // so refusing it would take their work for showing them their progress.
  assert.equal(readingOf('There have been 3 posts this week.').kind, 'work');
  // The pair. Once the thing counted is pipeline, it is a claim again, by the
  // route that was already there.
  assert.equal(readingOf('There have been 12 enquiries this month.').kind, 'result');
});

test('a trailing period is not the thing being counted', () => {
  // "2,400 meals this year" counts meals. The year is when. Two words of slack
  // walked past "meals", past "this", landed on "year", and filed the whole
  // sentence as a cadence, which is how it reached a founder in silence.
  assert.equal(readingOf('Send 3 times a week.').kind, 'work');
  assert.equal(readingOf('Block 45 minutes on Tuesday.').kind, 'work');
  assert.equal(readingOf('Write 12 pieces this month.').kind, 'work');
  assert.notEqual(readingOf('2,400 meals this year.').kind, 'work');
});

/* -------------------------------------------------------------------------- */
/* MUST PASS: the two worked example founders                                  */
/* -------------------------------------------------------------------------- */

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

test('NEITHER WORKED EXAMPLE BRAIN IS REFUSED WHEN IT IS CHECKED PROPERLY', () => {
  // The Brain is skipped when there is nothing older to check it against. Hand
  // the founder's own answers over and it is checked for real, so this is the
  // one path where the two example founders' own prose meets the classifier.
  for (const track of ['b2b', 'b2c'] as const) {
    const brain = exampleBrain(track);
    const theirAnswers: Artifact = { path: 'turn.md', text: brain, authored: 'founder' };
    const result = checkNoInventedProof(
      { path: 'founder-brain.md', text: brain, authored: 'model' },
      { track, brain: null, grounding: [theirAnswers] },
    );
    assert.deepEqual(
      result.violations.map((v) => `${v.severity} ${v.found}: ${v.where.excerpt}`),
      [],
      track,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* MUST PASS: every line with a digit in the toolkit's own skill prose         */
/* -------------------------------------------------------------------------- */

/** Every markdown file under the nine skills, from the vendored content. */
function skillLines(): string[] {
  const root = join(contentRoot(), 'plugins', 'growth-engine', 'skills');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.md')) files.push(full);
    }
  };
  walk(root);

  const lines = new Set<string>();
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && /\d/.test(trimmed)) lines.add(trimmed);
    }
  }
  return [...lines];
}

test('THE TOOLKIT CANNOT REFUSE ITS OWN COPY', () => {
  const lines = skillLines();
  assert.ok(lines.length > 100, `only ${lines.length} lines with a digit were read`);

  const refused: string[] = [];
  for (const line of lines) {
    // Both tracks, because a founder on either one can be handed either
    // sentence, and the grounded set differs between the two Brains.
    for (const track of ['b2b', 'b2c'] as const) {
      for (const violation of blocks(line, track)) {
        refused.push(`[${track}] ${violation.found} :: ${line}`);
      }
    }
  }
  assert.deepEqual(refused, []);
});

test('the corpus test above can fail, so its passing means something', () => {
  // The negative control. If the harness stopped reading files, or `blocks`
  // stopped returning anything, the test above would pass on an empty list and
  // nobody would know. This proves the same harness still refuses a claim.
  assert.ok(skillLines().length > 100);
  assert.equal(blocks('We have 63 clients and 68% of them stay.', 'b2b').length, 2);
});

/* -------------------------------------------------------------------------- */
/* MUST BE CAUGHT: what a model actually gets wrong                            */
/* -------------------------------------------------------------------------- */

/**
 * Invented proof, written the way a model writes it when the Brain is thin.
 *
 * None of these numbers is in the Brain of the track it is paired with. Each is
 * one of the four claim shapes: a count of people or businesses, a rate, an
 * amount of money, or an outcome.
 */
const MUST_BE_CAUGHT: ReadonlyArray<readonly [Track, string]> = [
  // a count nobody gave
  ['b2b', 'We have helped 63 firms cut their admin by 60%.'],
  ['b2c', 'Join the 12,000 people already reading this.'],
  ['b2c', 'I have 7 customers so far.'],
  ['b2c', 'Over 200 women with reactive skin have switched to the bundle.'],
  ['b2b', 'Trusted by 48 construction firms across the Midlands.'],
  ['b2b', 'We work with 12 firms right now.'],
  ['b2c', 'She got 400 new followers in a week after one post.'],
  ['b2c', 'It worked for all 88 of the people who tried it.'],
  // a percentage
  ['b2c', 'Our reorder rate is 62 per cent.'],
  ['b2b', 'Roughly 68% of them will say yes.'],
  ['b2c', '97 per cent of buyers reorder within 60 days.'],
  // a testimonial
  ['b2c', 'One customer told me she saved 9 hours a week on her routine.'],
  ['b2c', '"I got 3,000 followers in a month," one of my customers said.'],
  ['b2b', 'Our average client saves 11 hours a week.'],
  // a revenue figure
  ['b2b', 'Last month we brought in 12,400 GBP from two new retainers.'],
  ['b2b', 'The retainer is 2,500 GBP a month and it pays for itself.'],
  // an outcome
  ['b2b', 'Northfield has cut invoice-to-payment from 90 days to 21 for every client.'],
  ['b2c', 'The serum is rated 4.9 out of 5 by our customers.'],
];

test('EVERY INVENTED CLAIM IS STILL REFUSED', () => {
  const missed: string[] = [];
  for (const [track, line] of MUST_BE_CAUGHT) {
    if (blocks(line, track).length === 0) {
      missed.push(`${line}  read as ${JSON.stringify(readingsFor(line))}`);
    }
  }
  assert.deepEqual(missed, []);
});

test('a refusal names the number and calls it a fact about the business', () => {
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

test('a percentage is always treated as a result', () => {
  const result = checkNoInventedProof(post('Roughly 68% of them will say yes.'), ctxFor('b2b'));
  assert.equal(result.violations[0]?.code, 'proof.invented-result');
  assert.equal(result.ok, false);
});

test('a promise to a reader is a note, even when it wears an instruction', () => {
  // These four are the shapes the rule is least sure about, so none of them
  // costs the founder the turn and none of them is silent either. Each is a
  // number that could be a claim, sitting in a sentence addressed to somebody.
  const cases: Array<[Track, string, string]> = [
    ['b2b', 'Save 6 hours a week.', 'an outcome word with nobody it happened to'],
    ['b2b', 'Cut your admin by 6 hours a week.', 'an outcome word inside an instruction'],
    ['b2b', 'Charge 2,500 GBP a month for the retainer.', 'money inside an instruction'],
    ['b2b', 'Book 44 calls a month and the rest follows.', 'a pipeline count inside an instruction'],
  ];
  for (const [track, line, because] of cases) {
    assert.equal(readingOf(line).because, because, line);
    const result = checkNoInventedProof(post(line), ctxFor(track));
    assert.equal(result.ok, true, `${line} cost the founder the turn`);
    assert.equal(result.violations[0]?.severity, 'warn', line);
  }
});

test('the same sentence with a subject is a refusal', () => {
  // The pair for the test above. Once somebody it happened to is named, the
  // number is a claim about a business rather than a line of homework.
  assert.equal(blocks('We charge 2,500 GBP a month.', 'b2b').length, 1);
  assert.equal(blocks('We booked 44 calls last month.', 'b2b').length, 1);
});

test('a rate inside a projection is a note rather than a refusal', () => {
  // The growth-plan skill asks for projections off the founder's real list size.
  // A conversion rate nobody supplied is still a number nobody supplied, so it
  // is said out loud. It is not worth the founder's whole plan.
  const result = checkNoInventedProof(
    post('If 7% of the list replies, that is a handful of conversations.'),
    ctxFor('b2c'),
  );
  assert.equal(result.ok, true);
  assert.equal(result.violations[0]?.severity, 'warn');
});

/* -------------------------------------------------------------------------- */
/* The numbers that are never claims                                           */
/* -------------------------------------------------------------------------- */

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
    'Touch 4 is the break up.',
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

test('a product name that carries a digit is not a claim', () => {
  // "Microsoft 365" is the answer to a question the setup skill asks every B2B
  // founder. It is a name, not a count of anything.
  assert.deepEqual(codes('Your work email is on Microsoft 365, so use the mail app.', 'b2b'), []);
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

/* -------------------------------------------------------------------------- */
/* What each answer costs the founder                                          */
/* -------------------------------------------------------------------------- */

test('A QUANTITY OF WORK IS SILENT, NOT A WARNING', () => {
  // This is the blast radius argument in one assertion. A generated plan is
  // mostly cadences. A note against every one of them is forty notes saying the
  // number the founder was just told to use is not in their Brain, and a founder
  // who reads that forty times stops reading notes.
  const result = checkNoInventedProof(post('Try 7 different openers.'), ctxFor('b2c'));
  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);
  // It is still counted, so the audit trail knows the rule looked at it.
  assert.match(result.notes.join(' '), /1 numbers were read as a quantity of work/);
});

test('a number the rule cannot read is a note, not a refusal', () => {
  // No noun, no verb, nobody it happened to. The rule says so rather than
  // guessing, and the founder keeps their work.
  const result = checkNoInventedProof(post('The split came out at 9.'), ctxFor('b2c'));
  assert.equal(result.ok, true, 'a note must not stop the founder getting their work');
  assert.equal(result.violations[0]?.severity, 'warn');
  assert.equal(result.violations[0]?.code, 'proof.ungrounded-number');
});

test('strict mode promotes a number the rule could not read', () => {
  const result = checkNoInventedProof(post('The split came out at 9.'), ctxFor('b2c'), {
    strict: true,
  });
  assert.equal(result.ok, false);
});

test('STRICT MODE DOES NOT PROMOTE A QUANTITY OF WORK', () => {
  // Strict used to mean "no digit reaches the founder that is not in the Brain",
  // which sounds right and refuses "Post 3 to 5 times a week". A cadence is not
  // proof, so refusing one proves nothing about invented proof.
  const result = checkNoInventedProof(post(THE_FIRST_CONTENT_PLAN), ctxFor('b2c'), {
    strict: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result.violations, null, 1));
});

/* -------------------------------------------------------------------------- */
/* Grounding, and the two places the rule declines to answer                   */
/* -------------------------------------------------------------------------- */

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
  const result = checkNoInventedProof(post('We have 41 clients.'), ctxFor('b2b'));
  assert.ok(result.violations.length > 0, 'nothing was raised, so nothing was checked');
  for (const v of result.violations) {
    assert.deepEqual(v.recovery.action, { kind: 'edit', path: 'founder-brain.md' });
    assert.ok(v.recovery.label.length > 0);
  }
});

/* -------------------------------------------------------------------------- */
/* This rule held to the house style it enforces                               */
/* -------------------------------------------------------------------------- */

test('every sentence this rule shows a founder passes the house style', () => {
  // index.test.ts runs this over the whole gate, but it can only reach the
  // messages its own fixtures produce, and a quantity of work now produces no
  // message at all. Every message this file can write is checked here instead.
  const produced: Violation[] = [
    ...checkNoInventedProof(post('We have 63 clients and 68% stay.'), ctxFor('b2b')).violations,
    ...checkNoInventedProof(post('The split came out at 9.'), ctxFor('b2c')).violations,
    ...checkNoInventedProof(post('Anything.'), { track: 'b2b', brain: null }).violations,
  ];
  assert.ok(produced.length >= 3);

  const failures: string[] = [];
  for (const v of produced) {
    for (const [field, text] of [
      ['message', v.message],
      ['why', v.why],
      ['recovery label', v.recovery.label],
    ] as const) {
      // The founder's own number, quoted back, is evidence rather than the
      // gate's own prose. Everything else is held to the style.
      const own = v.found.length > 0 ? text.split(v.found).join(' ') : text;
      for (const bad of checkProseText(`${v.code} ${field}`, own).violations) {
        failures.push(`${v.code} ${field}: ${bad.code} on "${bad.found}"`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
