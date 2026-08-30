/**
 * no-invented-proof.ts: rule 5. Never invent proof.
 *
 * WHY IT EXISTS: a model asked to write a convincing post about a business with
 *   thin proof will reach for a number, because a number is what makes a claim
 *   land. "We helped 40 firms cut admin time by 60 per cent" is a better post
 *   than anything true about Sam Okoye, who has two named cases. If that
 *   sentence goes out under a founder's name it is a lie they did not tell and
 *   cannot take back, and their buyers are in a small industry where somebody
 *   will ask.
 *
 *   The Brain is the record of what is true. So the rule is: a number that
 *   CLAIMS something has to be traceable to something the founder said.
 *
 * THE FAILURE THIS FILE WAS REWRITTEN TO PREVENT
 *
 *   The first version treated any number sitting next to a unit of time as a
 *   claimed result. Every one of these was refused, from the product's own copy:
 *
 *     Post 3 to 5 times a week.
 *     Send 25 DMs a week, by hand, from your own account.
 *     Reply within 24 hours.
 *     Block 45 minutes on Tuesday to write the week.
 *
 *   The second of those is the sentence the whole B2C track is built on. A
 *   refusal is the whole turn, so a founder who generated their first content
 *   plan lost all of it and was told they had invented proof. In a staffed room,
 *   on the first thing they make. That is a worse outcome than anything rule 5
 *   was protecting them from, and it would have happened 65 times in one morning.
 *
 * WHAT A CLAIMED RESULT ACTUALLY IS. READ THIS BEFORE CHANGING A LIST BELOW.
 *
 *   A claimed result is a number that says something IS TRUE about the founder's
 *   business, that a stranger could ask them to back up. Five shapes:
 *
 *     1. A count of people, businesses or transactions. "340 customers",
 *        "63 firms", "12,000 people already reading this". Somebody either
 *        bought or did not.
 *     2. A rate. Any percentage, any "per cent". A rate is always a measurement
 *        of something that happened.
 *     3. An amount of money. "1,800 GBP a month", "40k in revenue". Money is the
 *        most checkable claim there is.
 *     4. A change. "from 71 days to 38", "cut it by 6 hours a week". An outcome
 *        verb saying a quantity moved.
 *     5. A count of something already done. "You have groomed 340 dogs."
 *        "We have fitted 45 kitchens." Shape 1 reads the noun, and the nouns in
 *        this cohort's Brains are dogs, weddings, kitchens and boilers, not
 *        customers and firms. This one reads the frame instead: somebody did it,
 *        it is finished, and it counts things rather than time. The argument for
 *        why that is the only version of shape 1 that can work is at the head of
 *        the completed action section below.
 *
 *   A quantity of work is NOT any of those, and this is the distinction the
 *   first version did not draw. A quantity of work tells the founder what to do
 *   and how much of it. It is addressed to them, it is in the future, and nobody
 *   can be misled by it because nothing has happened yet:
 *
 *     - a cadence: how often. "Post 3 to 5 times a week."
 *     - a volume: how many. "Send 25 DMs." "Build a list of 25 accounts."
 *     - a duration: how long. "Block 45 minutes on Tuesday."
 *     - a deadline: by when. "Reply within 24 hours."
 *     - a horizon: over what period. "Days 61 to 90." "Your 30 day plan."
 *     - a position: which one. "Piece 4." "Touch 5." "Week 2."
 *
 *   The load-bearing test between the two is the NOUN the number attaches to,
 *   the MOOD of the sentence it sits in, and whether the thing being counted has
 *   already happened. A result attaches to a person, a pound or a rate, or to
 *   something somebody has finished doing. A quantity of work attaches to a unit
 *   of time or a unit of effort, and is written as an instruction to the founder.
 *   A regex cannot read tense directly, so what it reads instead is the noun
 *   after the number, the words before it, whether an auxiliary and a past
 *   participle sit in front of it, and whether the sentence opens with an
 *   imperative verb the founder is meant to act on.
 *
 *   Two corollaries worth writing down, because both were bugs:
 *
 *     A RANGE IS ONE NUMBER FOR THIS PURPOSE. The house style writes ranges as
 *     "11 to 13", so the noun sits after the second endpoint. Classify the first
 *     endpoint on its own and "Post 11 to 13 times a week" refuses the 13 while
 *     passing "Post eleven to thirteen times a week". Both endpoints take the
 *     noun at the end of the range.
 *
 *     THE WINDOW IS THE SENTENCE. "Days 61 to 90. Double down or cut, based on
 *     the data." The word "cut" is about the next sentence. A window measured in
 *     characters walks across the full stop and refuses the plan's own headings.
 *
 * WHAT IS DONE WITH EACH ANSWER, AND WHY THE BLAST RADIUS IS GRADED
 *
 *   result   block. A refusal is the whole turn, and for this shape that is
 *            right: an invented customer count that is saved with a warning
 *            beside it is an invented customer count that gets sent to somebody.
 *   unclear  warn. The artifact reaches the founder with a note against the
 *            line. This is where the rule admits it is guessing, and a guess
 *            must not cost a founder their work.
 *   work     nothing at all. Not a warning either. 74 of the 89 numbers in the
 *            toolkit's own skill prose are quantities of work, and a founder who
 *            reads 74 notes saying "the number 25 is not in your Founder Brain"
 *            about instructions they were just given stops reading notes. The
 *            count is kept in `notes` for the audit trail instead.
 *
 *   That grading IS the blast radius decision, and it was made here rather than
 *   in the gate on purpose. Refusing the whole turn is right for a rule that is
 *   exact: a banned word either is in the text or is not, and rule 2 either
 *   automated a DM or did not. Rule 5 is a judgement about a sentence, so the
 *   only honest lever is which shapes are confident enough to spend a founder's
 *   whole turn on. The answer is: the five claim shapes above, and nothing else.
 *
 *   WHAT A BLOCK COSTS THE FOUNDER IS NOT DECIDED HERE, and the next person
 *   should not go looking for it in this file. This file decides which shapes
 *   are sure enough to refuse. `harvest-gate.ts` and `storage/turn.ts` decide
 *   what a refusal takes with it: the one file that failed, or every file the
 *   turn wrote. Read that file's header before changing either, because the two
 *   decisions multiply. A shape that is only mostly right is survivable when it
 *   holds one file back. It is not survivable when it takes a plan, a sequence
 *   and a CSV with it, on the Sunday, in a staffed room.
 *
 * THE OTHER NUMBERS THAT ARE NEVER CLAIMS are taken out before the scan runs:
 *   dates, times of day, positions in a list, `b2b` and `b2c`, the toolkit's own
 *   file names, product names carrying a digit, and anything inside a link, a
 *   code span or one of ge's markers.
 *
 *   The grounding side is deliberately generous, because being generous there
 *   only ever removes false alarms. "fifteen years" in the Brain grounds "15
 *   years" in a post. "8k" grounds "8,000". "31 per cent" grounds "31%".
 *
 * CALLED BY: index.ts, before an artifact is saved. index.ts is called by
 *   harvest-gate.ts, which storage/turn.ts runs on every turn.
 * READS:     nothing on disk. The Brain arrives as text on the context.
 * WRITES:    nothing.
 */

import {
  locate,
  maskNonProse,
  resultFrom,
  type Artifact,
  type FounderContext,
  type RuleResult,
  type Violation,
} from './types.ts';

const RULE = 'no-invented-proof' as const;

/* -------------------------------------------------------------------------- */
/* Reading numbers                                                            */
/* -------------------------------------------------------------------------- */

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  bn: 1_000_000_000,
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

/**
 * A number as it is actually written: an optional currency mark, digits with
 * separators, an optional decimal, and an optional multiplier or percent sign.
 */
const NUMBER = /(?:[£$€]\s?)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|m|bn|hundred|thousand|million|billion)?\b\s?(%|per cent|percent)?/gi;

export interface NumberToken {
  /** What was written, for example "31%". */
  raw: string;
  /** What it means, for example 31. */
  value: number;
  /** Offset of the digits in the text it came from. */
  index: number;
  /**
   * Offset just past the whole match, including a currency mark, a multiplier
   * and a percent sign.
   *
   * Carried rather than computed from `index + raw.length`, which is wrong by
   * the width of the currency mark: `index` points at the digits and `raw`
   * starts at the pound sign. That one character is enough to make the noun
   * after "£40k customers" read as "ustomers" and the claim disappear.
   */
  end: number;
}

function canonicalise(digits: string, multiplier: string | undefined): number {
  const base = Number(digits.replace(/,/g, ''));
  if (multiplier === undefined) return base;
  return base * (MULTIPLIERS[multiplier.toLowerCase()] ?? 1);
}

/** Every number in a piece of text, canonicalised. */
export function readNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER)) {
    if (match.index === undefined) continue;
    const digits = match[1];
    if (digits === undefined) continue;
    // The offset of the digits, not of the currency mark in front of them.
    const digitsAt = match.index + match[0].indexOf(digits);
    out.push({
      raw: match[0].trim(),
      value: canonicalise(digits, match[2]),
      index: digitsAt,
      // Trailing space trimmed off. The two optional `\s?` groups above swallow
      // the space after a number that has no multiplier and no percent sign, and
      // an `end` inside that space puts the first character of the noun behind
      // the cursor: "£40k customers" gives a tail of "ustomers".
      end: match.index + match[0].replace(/\s+$/, '').length,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Numbers written as words, on the grounding side only                       */
/* -------------------------------------------------------------------------- */

const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
  once: 1, twice: 2, single: 1, dozen: 12,
};

const WORD_RUN = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|once|twice|single|dozen)(?:[ -](one|two|three|four|five|six|seven|eight|nine))?\b/gi;

/**
 * Numbers a founder wrote as words.
 *
 * Grounding only. Sam Okoye's Brain says "fifteen years as a site manager", and
 * a post that says "15 years" is quoting him, not inventing anything. Without
 * this, the most grounded sentence in the whole product gets flagged.
 */
function readWordNumbers(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(WORD_RUN)) {
    const first = WORD_VALUES[(match[1] ?? '').toLowerCase()];
    if (first === undefined) continue;
    const second = match[2] ? WORD_VALUES[match[2].toLowerCase()] : undefined;
    // "twenty five" is 25. "five" on its own is 5.
    out.push(second !== undefined && first >= 20 ? first + second : first);
    if (second !== undefined) out.push(first, second);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Masking the numbers that are never claims                                  */
/* -------------------------------------------------------------------------- */

const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

const NEVER_A_CLAIM: readonly RegExp[] = [
  /\b\d{4}-\d{2}(-\d{2})?\b/g, // an ISO date
  new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+${MONTHS}\\b`, 'gi'),
  new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(st|nd|rd|th)?\\b`, 'gi'),
  new RegExp(`\\b${MONTHS}\\s+(19|20)\\d{2}\\b`, 'gi'),
  /\b(?:in|since|by|until|from|during|after|before)\s+(19|20)\d{2}\b/gi,
  /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\bb2[bc]\b/gi, // a track, not the number two
  /\b[\w-]*\d[\w-]*\.(md|csv|json|txt|pdf)\b/gi, // the toolkit's own file names
  /\b(piece|week|day|step|post|part|slot|item|row|question|group|option|touch|batch|round|session|phase)\s+\d+\b/gi,
  /^\s*\d+[.)]\s/gm, // an ordered list marker
  /^\s*\|\s*\d+\s*\|/gm, // the first cell of a table row
  /^\s*#{1,6}\s*\d+[.)]?\s/gm, // a numbered heading
  // A product name that happens to carry a digit. These two are named in the
  // toolkit's own setup skill, where the founder is asked which mail provider
  // they are on. "Microsoft 365" is not a claim about anybody's business, and
  // the setup and ops skills say it often enough to matter. Add a name here
  // only when it appears in the vendored content, never on a guess.
  /\b(?:Microsoft|Office)\s+365\b/gi,
];

/**
 * The row number at the front of a CSV line.
 *
 * Only ever applied to a `.csv` artifact. In prose a line that opens "2,100
 * followers" is a founder's real follower count, and an earlier draft applied
 * this everywhere and masked the "2," out of it, leaving a phantom 100 that got
 * reported as invented proof.
 */
const CSV_ROW_NUMBER = /^\s*"?\d+"?,/gm;

/** Whole numbers, so a mask can be widened to cover all of one. */
const NUMERIC_RUN = /\d[\d,.]*/g;

function maskNeverAClaim(text: string, isCsv: boolean): string {
  const chars = text.split('');
  const masked = new Set<number>();

  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      if (chars[i] === '\n') continue;
      chars[i] = ' ';
      masked.add(i);
    }
  };

  const patterns = isCsv ? [...NEVER_A_CLAIM, CSV_ROW_NUMBER] : NEVER_A_CLAIM;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      blank(match.index, match.index + match[0].length);
    }
  }

  // No mask may leave half a number behind. A pattern that covers "2," out of
  // "2,100" would otherwise turn a real follower count into a made up hundred.
  // So any number a mask touched at all is masked whole.
  for (const match of text.matchAll(NUMERIC_RUN)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    let touched = false;
    for (let i = from; i < to; i += 1) {
      if (masked.has(i)) {
        touched = true;
        break;
      }
    }
    if (touched) blank(from, to);
  }

  return chars.join('');
}

/* -------------------------------------------------------------------------- */
/* The four vocabularies                                                      */
/* -------------------------------------------------------------------------- */

/**
 * PROOF. People, businesses and transactions. Counting one of these is a claim
 * wherever it sits, including inside an instruction, because "tell them you have
 * 340 customers" is still 340 customers.
 *
 * `them` is not here either, for the same reason: "cold DMs are sent by hand, 25
 * of them" is the toolkit's own sentence for rule 2, and it reads as a count of
 * people the moment a pronoun counts as a noun.
 *
 * `founder` is deliberately NOT here, and it is the one word that cannot be. In
 * this toolkit the founder is the reader, so "the founder" appears in almost
 * every line of every skill. It made "Work in batches of 5 to 10 so the founder
 * can check quality" a refusal.
 *
 * THIS LIST IS NOT WHERE THE COHORT'S NOUNS GO. READ THIS BEFORE ADDING ONE.
 * These 130 founders count dogs, weddings, kitchens, boilers, meals, learners
 * and animals. Not one of those words is here and not one of them is going to
 * be, for two reasons.
 *
 *   The list cannot be finished. The next room counts lawns, MOTs, wigs and
 *   piano lessons. A vocabulary that has to hold every noun a small business
 *   sells is a vocabulary that is wrong for whoever is not in the room.
 *
 *   Adding one does damage on the way past. A word in THIS list is a claim
 *   wherever it sits, and nothing demotes it, not even an instruction. Put
 *   `dogs?` here and "Post 3 dog photos a week" is a refusal, and so is "Book 4
 *   dog walks", on the first content plan a groomer generates.
 *
 * What catches those sentences instead is the completed action frame below. It
 * reads the shape of the claim rather than the noun in it, which is the only
 * thing that works for a noun nobody has thought of yet.
 */
const PROOF_NOUNS =
  'customers?|clients?|users?|subscribers?|followers?|fans?|members?|readers?|viewers?|listeners?|people|persons?|women|men|woman|man|mums?|dads?|parents?|families|households|professionals?|freelancers?|creators?|shops?|salons?|studios?|practices|clinics?|agencies|contractors?|builders?|firms?|companies|company|businesses|business|brands?|owners?|testimonials?|reviews?|ratings?|stars?|referrals?|signups?|sign-ups?|subscriptions?|downloads?|attendees?|students?|patients?|sales?|orders?|purchases?|deals?|contracts?|retainers?|staff|employees?|hires?';

/**
 * PIPELINE. Things that are a result when they have happened and a target when
 * the founder is being told to go and get them.
 *
 * "We booked 12 calls last month" is proof. "Aim for 3 calls a week" is work.
 * The only thing separating them is the mood of the sentence, so these are
 * checked AFTER the instruction test rather than with the proof nouns above.
 */
const PIPELINE_NOUNS =
  'leads?|bookings?|appointments?|enquir\\w+|inquir\\w+|calls?|meetings?|conversations?|replies|responses?|conversions?|projects?|jobs?';

/**
 * TIME. A number attached to one of these is a cadence, a duration, a deadline
 * or a horizon. None of those is a claim on its own.
 */
const TIME_UNITS =
  'seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weekdays?|weekends?|weeks?|fortnights?|months?|quarters?|years?|mornings?|afternoons?|evenings?|nights?|times?';

/**
 * WORK. Things the founder is being told to make or do. A number attached to one
 * of these counts their own future effort.
 */
const WORK_UNITS =
  'posts?|pieces?|captions?|scripts?|videos?|reels?|stories|story|slides?|pages?|words?|characters?|lines?|sentences?|paragraphs?|drafts?|variants?|versions?|openers?|hooks?|messages?|dms?|emails?|touches|touch|steps?|batches|batch|rounds?|slots?|items?|rows?|columns?|questions?|options?|pillars?|sessions?|accounts?|contacts?|prospects?|handles?|lists?|samples?|uploads?|files?|folders?|notes?|tasks?|actions?|ideas?|topics?|angles?|tests?|experiments?|checks?|criteria|headers?|fields?|tags?|categories|category';

/**
 * Words that start a new clause. A noun on the far side of one of these is not
 * the noun this number is counting.
 *
 * Without this the two describing words allowed below reach across a clause
 * boundary: " to 10 so the founder can check quality" put "founder" two words
 * after the number and refused an instruction about batch sizes.
 */
const CLAUSE_BREAK_WORDS =
  '(?:so|and|but|or|nor|if|when|while|because|since|that|which|who|whom|whose|then|than|for|to|with|by|as|is|are|was|were|be|being|been|can|will|would|should|do|does|did|has|have|had|from|into|onto|about|before|after|until|unless)';

/**
 * The noun a number attaches to, allowing two describing words in between, so
 * "20 short posts" and "25 target accounts" both find their noun.
 */
function nounAfter(list: string): RegExp {
  return new RegExp(
    `^[\\s,:;'"()\\[\\]-]*(?:(?!${CLAUSE_BREAK_WORDS}\\b)[\\w'-]+\\s+){0,2}(?:${list})\\b`,
    'i',
  );
}

/**
 * Determiners that turn a unit of time into an adverbial: WHEN something
 * happened, rather than HOW MUCH of it there was.
 *
 * "2,400 meals this year" counts meals. The year is the period they were served
 * in. Without this the two words of slack above walk past "meals", past "this",
 * and land on "year", and the sentence is filed as a cadence and says nothing at
 * all. That is how "You have served 2,400 meals this year" reached a founder in
 * silence.
 *
 * It only applies to a word BETWEEN the number and the unit. "45 minutes" and
 * "3 times a week" are untouched, because nothing sits in between.
 */
const TIME_ADVERBIAL_DETERMINER =
  '(?:this|that|these|those|last|next|past|previous|coming|following|recent)';

/** A unit of time being measured, rather than a period being named. */
const TIME_AFTER = new RegExp(
  `^[\\s,:;'"()\\[\\]-]*(?:(?!${CLAUSE_BREAK_WORDS}\\b)(?!${TIME_ADVERBIAL_DETERMINER}\\b)[\\w'-]+\\s+){0,2}(?:${TIME_UNITS})\\b`,
  'i',
);

const PROOF_AFTER = nounAfter(PROOF_NOUNS);
const PIPELINE_AFTER = nounAfter(PIPELINE_NOUNS);
const WORK_AFTER = nounAfter(WORK_UNITS);

/** A cadence, a duration, a deadline, a horizon or a count of the work itself. */
function unitAfter(tail: string): boolean {
  return WORK_AFTER.test(tail) || TIME_AFTER.test(tail);
}

/**
 * A unit of time sitting where the counted noun would be: "40 minutes",
 * "15 long years". At most one describing word, because two is what let a
 * trailing "this year" be read as the thing being counted.
 */
const TIME_IS_THE_NOUN = new RegExp(
  `^[\\s,:;'"()\\[\\]-]*(?:[\\w'-]+\\s+){0,1}(?:${TIME_UNITS})\\b`,
  'i',
);

/* -------------------------------------------------------------------------- */
/* A COMPLETED ACTION, which is a claim whatever noun it counts                */
/* -------------------------------------------------------------------------- */

/**
 * THE FAILURE THIS SECTION WAS ADDED TO PREVENT
 *
 *   You have served 2,400 meals this year.     said nothing at all
 *   You have run 400 sessions with clients.    said nothing at all
 *   You have groomed 340 dogs.                 a note, so it was saved
 *   We have fitted 45 kitchens.                a note, so it was saved
 *   We have serviced 1,200 boilers.            a note, so it was saved
 *
 * Every textbook fabrication was refused. 340 customers, 82 per cent, a
 * testimonial, a revenue figure: all four shapes held. Then a room of local
 * service founders wrote the same lie about dogs and boilers and it walked
 * through, because the four shapes were reading NOUNS and the nouns belonged to
 * somebody else's business.
 *
 * WHAT MAKES ONE OF THOSE A CLAIM. Not the noun. Three things, none of which
 * care what is being counted:
 *
 *   somebody did it       "we", "you", "they", a named business
 *   it is finished        "have served", "groomed", "has fitted"
 *   it is a real count    a number, and a thing rather than a stretch of time
 *
 * That is a sentence a stranger can ask the founder to back up, which is the
 * definition this file already uses. "Serve 40 meals a week" is homework and
 * stays homework: no subject, no completed verb, nothing has happened yet.
 *
 * WHY THIS ONE CAN BE A LIST WHEN THE NOUNS CANNOT. The auxiliary is `have`,
 * `has` or `had`, and there is no fourth one. The past tense of an English verb
 * is regular, or it is one of a couple of hundred irregulars that have not
 * changed in a lifetime. A closed class can be written out. The things a small
 * business sells cannot.
 */

/** An adverb that can sit between the auxiliary and the verb. */
const PERFECT_ADVERB = '(?:already|just|recently|now|since|only|ever|so far|to date|all)';

/**
 * A past participle. Regular first, then the irregulars common enough to turn
 * up in a sentence about a business.
 *
 * `got`, `gotten` and `had` are deliberately absent. "We have got 5 pieces
 * ready" is possession wearing a perfect's clothes, and reading it as a
 * completed action would refuse a line about the founder's own drafts.
 */
const PARTICIPLE =
  "(?:[\\w'-]+(?:ed|en)|been|run|sold|made|built|sent|taught|met|won|grown|held|kept|brought|spent|lost|found|paid|begun|dealt|left|felt|said|told|put|read|cut|set|let|hit|split|shut|come|gone|done)";

/**
 * The unambiguous simple pasts. Forms that are also the present or the
 * imperative are left out on purpose: "run", "put", "cut" and "read" all start
 * instructions, and "You run 4 sessions a week" is a plan line, not a boast.
 */
const SIMPLE_PAST =
  "(?:[\\w'-]+ed|ran|sold|made|built|sent|taught|met|won|grew|held|kept|brought|spent|lost|found|paid|began|gave|took|wrote|spoke|saw|did|drove|flew|ate|sat|stood|chose|drew|knew|threw|understood|dealt|felt|left|told|said)";

/**
 * "we have already served", "it has run", "Northfield has fitted".
 *
 * `there have been` is excluded, and it is the one exclusion this needs.
 * "There have been 3 posts this week" is an existential: nothing is being
 * counted as somebody's doing, so it is a status line about the folder rather
 * than a claim about a business, and refusing one would cost a founder their
 * work for reading their own progress back to them.
 */
const PERFECT_BEFORE = new RegExp(
  `(?<!\\bthere\\s)\\b(?:have|has|had)\\s+(?!not\\b|never\\b)(?:${PERFECT_ADVERB}\\s+)?${PARTICIPLE}\\s+(?:[\\w'-]+\\s+){0,2}$`,
  'i',
);

/** "we groomed", "you served last year", "they ran". */
const PAST_BEFORE = new RegExp(
  `\\b(?:we|i|you|they|he|she|it)\\s+(?:${PERFECT_ADVERB}\\s+)?${SIMPLE_PAST}\\s+(?:[\\w'-]+\\s+){0,2}$`,
  'i',
);

/**
 * The clause is about something that has not happened yet, so the count is a
 * condition rather than a claim.
 *
 * "Once you have sent 25 messages, stop." is an instruction with a perfect in
 * it. Without this it reads as a boast about 25 messages already sent, and it
 * is the shape the outreach skill writes most.
 */
const SUBORDINATED =
  /\b(?:once|after|when|whenever|if|until|unless|before|while|whether|as soon as|should)\b/i;

/**
 * Somebody finished doing something, this many times.
 *
 * `head` is the text of the sentence before the number, with any range it
 * closes already skipped back over.
 */
function completedAction(head: string): boolean {
  if (SUBORDINATED.test(head)) return false;
  return PERFECT_BEFORE.test(head) || PAST_BEFORE.test(head);
}

/**
 * "90 day plan", "90-day plan", "six week change", "30 day content plan".
 *
 * A time unit written in the SINGULAR after a number above one is attributive:
 * the number is naming the thing rather than measuring anything. English only
 * does this in compounds. A measured quantity takes the plural, which is why
 * "24 hours" and "71 days" read the other way and stay checkable.
 *
 * It has to sit above the outcome test. The toolkit's own growth-plan skill says
 * "build my 90 day plan", "growth plan", and "growth" three words from a 90 with
 * "my" in the sentence was read as growth of 90.
 */
const ATTRIBUTIVE_TIME = /^[\s-](?:second|minute|hour|day|week|month|quarter|year)\b(?!s)/i;

/** A unit sitting IN FRONT of the number, as in "Days 61 to 90" or "Touch 5". */
const UNIT_BEFORE = new RegExp(`\\b(?:${TIME_UNITS}|${WORK_UNITS})\\b[\\s,:;'"()\\[\\]-]*$`, 'i');

/**
 * A back reference to a quantity that was already stated, as in "read all 30" or
 * "vary the opening across the 30". The number is pointing at something, not
 * asserting it.
 */
const BACK_REFERENCE = /\b(?:the|all|those|these|both|first|last|remaining|other|whole)\s+$/i;

/** Money written as a currency word rather than a mark. */
const CURRENCY_WORD = /^[\s,]*(?:gbp|usd|eur|pounds?|dollars?|euros?|quid|sterling)\b/i;

/**
 * Words that say a quantity MOVED. These are what turn a duration into a result:
 * "24 hours" is a deadline, "cut it to 24 hours" is an outcome.
 *
 * Kept tight on purpose. Every common word added here is a false refusal in a
 * content plan, and "cut" alone already appears twice in the toolkit's own copy.
 */
const OUTCOME_WORDS =
  /\b(revenue|turnover|margins?|profits?|roi|growth|grew|growing|increase[sd]?|increasing|decrease[sd]?|reduc\w+|cut|cuts|cutting|save|saved|saves|saving|freed|gained|gains|doubled|tripled|halved|converted|converting|retention|retained|churn\w*|reorder\w*|rating|rated|rates|averag\w*|open rate|click\w*|engagement|uplift|billed|invoiced|earn\w*|brought in)\b/gi;

/**
 * The founder is being told to do something.
 *
 * Only a leading imperative counts. An address in the second person does not,
 * because a post written to a buyer is full of "you" and that is exactly where
 * invented proof lives. "Save 6 hours a week" is a promise and stays a claim;
 * "Block 45 minutes on Tuesday" is homework. The difference is the verb, so the
 * list holds work verbs only. `save`, `grow`, `double` and `get` are deliberately
 * absent: at the front of a sentence those are promises to a reader.
 */
const WORK_IMPERATIVES =
  'post|send|write|draft|block|reply|respond|build|create|generate|produce|schedule|plan|spend|set|pick|choose|select|book|run|keep|add|leave|give|ask|do|use|check|start|stop|try|take|aim|target|batch|list|note|read|edit|review|record|log|prepare|publish|share|comment|message|email|call|follow|repeat|rotate|split|allow|budget|reserve|hold|work|put|name|mark|tick|confirm|collect|gather|find|open|close|update|upload|download|export|import|paste|copy|move|tell|show|explain|describe|include|exclude|cut|trim|cover|vary|limit|cap|order|group|sort|label|title|link|attach|charge|price|offer|pitch|invite|remind|nudge|space|stagger|spread|pause|resume|finish|complete|deliver|hand|bring|carry|apply|assign|allocate|track|measure|count|test|treat|watch|answer|approve|swap|replace|delete|remove|skip|wait';

const INSTRUCTION_START = new RegExp(
  // markdown decoration, a bullet or a bold marker, then an optional connector
  `^[\\s>#*_-]*(?:\\d+[.)]\\s*)?(?:(?:${'then|and|but|so|next|first|second|third|finally|also|now|always|never|only|just|please|do not'})\\s+){0,2}` +
    `(?:${WORK_IMPERATIVES})\\b`,
  'i',
);

/**
 * A boundary that ends a threshold, not a figure. "under 10k a month" states a
 * band the founder is being asked to fall inside, and a band asserts nothing.
 *
 * Hedges like "roughly" and "about" are NOT here. "Roughly 9k GBP a month" is
 * still a revenue claim, just a vague one.
 */
const THRESHOLD_BEFORE =
  /\b(?:under|over|above|below|up to|at least|no more than|fewer than|more than|less than|between|maximum|minimum|max|min)\s+$/i;

/**
 * The sentence is doing arithmetic about the future rather than reporting the
 * past. The growth-plan skill asks for exactly this: "base projections on their
 * actual list size, audience size and conversion assumptions".
 *
 * A projection still gets a note, because a conversion rate nobody supplied is
 * still a number nobody supplied. It just does not cost the founder the turn.
 */
const HYPOTHETICAL =
  /\b(?:if|assume|assuming|suppose|even at|estimate[sd]?|projection|projected|forecast|scenario|worst case|best case|hypothetical)\b/i;

/**
 * Somebody is the subject of this sentence: the founder, the business, or a
 * customer. An outcome verb only reports a result when there is somebody it
 * happened to.
 *
 * "We cut it to 24 hours" is a claim. "List built to 35 and cut to 25" is a
 * checklist line about a spreadsheet, and it carries the same verb. The pronoun
 * is what separates them, and it is the only signal available that does not
 * require reading tense.
 */
const CLAIM_FRAME =
  /\b(?:we|i|me|our|my|us|they|them|their|he|him|his|she|her|hers)\b|\b(?:already|so far|to date|last (?:month|year|quarter|week))\b/i;

/* -------------------------------------------------------------------------- */
/* Deciding what one number is                                                */
/* -------------------------------------------------------------------------- */

export type NumberKind = 'result' | 'work' | 'unclear';

export interface Reading {
  kind: NumberKind;
  /** The shape that decided it. Kept so a disagreement can be argued about. */
  because: string;
}

/**
 * The sentence a number sits in.
 *
 * Sentences, not a character window. A full stop, a semicolon, a colon or a
 * table cell wall ends the sentence, and a result word on the far side of one is
 * about something else. A full stop only counts when whitespace or the end of
 * the line follows it, so "4.7" and "content-30.md" stay whole.
 */
const SENTENCE_BREAK = /[.!?;:](?=\s|$)|\|/g;

function sentenceAround(line: string, at: number): { text: string; start: number } {
  let start = 0;
  let end = line.length;
  for (const match of line.matchAll(SENTENCE_BREAK)) {
    if (match.index === undefined) continue;
    if (match.index < at) start = match.index + match[0].length;
    else {
      end = match.index;
      break;
    }
  }
  return { text: line.slice(start, end), start };
}

/** One link of a range, as the house style writes them: "11 to 13", "8 to 40". */
const RANGE_FORWARD =
  /^[\s,]*(?:to|and|or|through)\s+(?:[£$€]\s?)?\d[\d,.]*\s?(?:k|m|bn|hundred|thousand|million|billion)?\s?(?:%|per cent|percent)?/i;
const RANGE_BACKWARD =
  /(?:^|[\s(])(?:[£$€]\s?)?\d[\d,.]*\s?(?:k|m|bn|hundred|thousand|million|billion)?\s+(?:to|and|or|through)\s*$/i;

/**
 * The text after a number, with any range it opens skipped over.
 *
 * "Post 11 to 13 times a week" gives " times a week" for BOTH endpoints. Without
 * this the 11 is read as a bare number and the 13 as a cadence, which is how the
 * house style's own range form ended up half refused.
 */
function tailAfter(sentence: string, from: number): string {
  let tail = sentence.slice(from);
  for (let guard = 0; guard < 4; guard += 1) {
    const link = RANGE_FORWARD.exec(tail);
    if (link === null) break;
    tail = tail.slice(link[0].length);
  }
  return tail;
}

/** The text before a number, with any range it closes skipped back over. */
function headBefore(sentence: string, to: number): string {
  let head = sentence.slice(0, to);
  for (let guard = 0; guard < 4; guard += 1) {
    const link = RANGE_BACKWARD.exec(head);
    if (link === null || link.index === undefined) break;
    head = head.slice(0, link.index);
  }
  return head;
}

/**
 * A whole number, written out, for the far end of a change.
 *
 * It has to be whole. Stopping at the first digit makes the match end inside
 * "21", and then the 21 in "from 90 days to 21" falls outside the frame and is
 * reported on its own as a number nobody can read.
 */
const ENDPOINT = '(?:[£$€]\\s?)?\\d[\\d,.]*\\s?(?:k|m|bn)?';

/**
 * "from 71 days to 38". A quantity that moved.
 *
 * The unit or the multiplier in the middle is required, so "open from 9 to 5" is
 * a pair of clock times rather than an outcome.
 */
const CHANGE_FRAME = new RegExp(
  `\\bfrom\\s+(?:[£$€]\\s?)?\\d[\\d,.]*\\s?(?:k|m|bn)?\\s*(?:${TIME_UNITS}|${WORK_UNITS}|${PROOF_NOUNS}|${PIPELINE_NOUNS}|%|per cent)\\s+to\\s+${ENDPOINT}` +
    `|\\bfrom\\s+(?:[£$€]\\s?)?\\d[\\d,.]*\\s?(?:k|m|bn)\\s+to\\s+${ENDPOINT}`,
  'gi',
);

function insideChangeFrame(sentence: string, at: number, end: number): boolean {
  for (const match of sentence.matchAll(CHANGE_FRAME)) {
    if (match.index === undefined) continue;
    if (at >= match.index && end <= match.index + match[0].length) return true;
  }
  return false;
}

/** An outcome word close enough to this number to be talking about it. */
const OUTCOME_GAP_WORDS = 3;

function outcomeLinked(sentence: string, at: number, end: number): boolean {
  for (const match of sentence.matchAll(OUTCOME_WORDS)) {
    if (match.index === undefined) continue;
    const from = match.index;
    const to = from + match[0].length;
    if (to > at && from < end) return true; // the word overlaps the number
    const gap = to <= at ? sentence.slice(to, at) : sentence.slice(end, from);
    const words = gap.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= OUTCOME_GAP_WORDS) return true;
  }
  return false;
}

/**
 * What one number in one sentence is.
 *
 * The order of these tests is the argument. Proof and rates come first because
 * nothing demotes them. The instruction test comes next because everything below
 * it is a quantity the founder is being handed. Money and pipeline nouns sit
 * under it, so an instruction turns them into a note rather than a refusal.
 */
export function readClaim(sentence: string, token: NumberToken): Reading {
  const { raw, index: at, end } = token;
  const tail = tailAfter(sentence, end);
  const head = headBefore(sentence, at);
  const claimFrame = CLAIM_FRAME.test(sentence);
  const hypothetical = HYPOTHETICAL.test(sentence);
  const outcome = outcomeLinked(sentence, at, end);

  // 1. A rate. Always a measurement of something that happened.
  if (/%|per cent|percent/i.test(raw)) {
    if (hypothetical) return { kind: 'unclear', because: 'a rate inside a projection' };
    return { kind: 'result', because: 'a rate' };
  }

  // 2. A count of people, businesses or transactions. Nothing below demotes
  //    this, because "tell them you have 340 customers" is still a claim.
  if (PROOF_AFTER.test(tail)) return { kind: 'result', because: 'a count of proof' };

  // 3. A quantity that moved: "from 71 days to 38".
  if (insideChangeFrame(sentence, at, end)) return { kind: 'result', because: 'a change' };

  // 3a. Somebody finished doing something, this many times. "You have groomed
  //     340 dogs." The noun is not in any list here and never will be, so what
  //     is read is the frame: a subject, a completed verb, and a count of things
  //     rather than a stretch of time. It sits above the instruction test
  //     because a completed action is not an instruction, and above the unit
  //     test because "You have run 400 sessions" is a claim that happens to
  //     count a word from the work list.
  if (completedAction(head) && !TIME_IS_THE_NOUN.test(tail)) {
    if (hypothetical) {
      return { kind: 'unclear', because: 'a completed count inside a projection' };
    }
    return { kind: 'result', because: 'a count of something already done' };
  }

  // 3b. A time compound: "90 day plan", "30 day content plan". The singular unit
  //     is what marks it, and it only reads that way above one, because "1 day"
  //     is singular for the ordinary reason.
  if (token.value > 1 && ATTRIBUTIVE_TIME.test(tail)) {
    return { kind: 'work', because: 'a length of time used as a name' };
  }

  // 4. The founder is being told to do something, so the number is their work.
  //    Three things survive an instruction as a note rather than as silence,
  //    because each is a shape that could still be a claim in disguise:
  //    "Charge 2,500 GBP", "Book 40 calls a month", "Cut your admin by 6 hours".
  if (INSTRUCTION_START.test(sentence)) {
    if (isMoney(raw, tail)) return { kind: 'unclear', because: 'money inside an instruction' };
    if (PIPELINE_AFTER.test(tail)) {
      return { kind: 'unclear', because: 'a pipeline count inside an instruction' };
    }
    // An outcome word only counts here when there is a quantity for it to have
    // moved. "Cut your admin by 6 hours a week" is a promise wearing an
    // instruction's clothes. "Build to 35, then cut to 25" is a list being
    // trimmed, and the same verb means nothing without a unit behind it.
    if (outcome && (unitAfter(tail) || UNIT_BEFORE.test(head))) {
      return { kind: 'unclear', because: 'an outcome word inside an instruction' };
    }
    return { kind: 'work', because: 'an instruction to the founder' };
  }

  // 5. Money. The most checkable claim there is, unless it is a stated band or
  //    part of a projection.
  if (isMoney(raw, tail)) {
    if (claimFrame) return { kind: 'result', because: 'money' };
    if (THRESHOLD_BEFORE.test(head)) return { kind: 'unclear', because: 'a money threshold' };
    if (hypothetical) return { kind: 'unclear', because: 'money inside a projection' };
    return { kind: 'result', because: 'money' };
  }

  // 6. Something the founder has been given rather than told to go and get.
  if (PIPELINE_AFTER.test(tail)) return { kind: 'result', because: 'a count of pipeline' };

  // 7. An outcome verb needs somebody it happened to. "We cut it to 24 hours" is
  //    a result. "List built to 35 and cut to 25" carries the same verb and is a
  //    line on a checklist, so this is checked before the unit test below and
  //    only fires when there is a subject.
  if (outcome && claimFrame) {
    if (hypothetical) return { kind: 'unclear', because: 'an outcome inside a projection' };
    return { kind: 'result', because: 'an outcome' };
  }

  // 8. An outcome word with nobody it happened to. It sits ABOVE the unit test
  //    below on purpose: "Save 6 hours a week" is a promise to a reader with a
  //    number in it, and reading the "hours" first would file it as homework and
  //    say nothing. A note, not a refusal, because the same shape covers
  //    "list built to 35 and cut to 25", which is a checklist line.
  if (outcome) return { kind: 'unclear', because: 'an outcome word with nobody it happened to' };

  // 9. A cadence, a duration, a deadline, a horizon or a position.
  if (unitAfter(tail)) return { kind: 'work', because: 'a quantity of time or work' };
  if (UNIT_BEFORE.test(head)) return { kind: 'work', because: 'a position in a run' };
  if (BACK_REFERENCE.test(head) && tail.trim().length === 0) {
    return { kind: 'work', because: 'a back reference to a quantity already stated' };
  }
  if (sentence.trim() === raw) return { kind: 'work', because: 'a number on its own in a cell' };

  return { kind: 'unclear', because: 'a number with nothing around it to read' };
}

/** Money: a currency mark on the number, or a currency word straight after it. */
function isMoney(raw: string, tail: string): boolean {
  return /^[£$€]/.test(raw) || CURRENCY_WORD.test(tail);
}

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProofOptions {
  /**
   * Promote every number the rule could not read to a refusal.
   *
   * It does NOT promote a quantity of work, and that limit is the point. Strict
   * mode used to mean "no digit reaches the founder that is not in the Brain",
   * which sounds right and refuses "Post 3 to 5 times a week". A cadence is not
   * proof, so refusing one proves nothing. What strict still buys is the case
   * the rule genuinely cannot read: a bare number in a sentence with no noun
   * around it.
   */
  strict?: boolean;
}

/** Every value the founder has actually given, from the Brain and elsewhere. */
export function groundedValues(ctx: FounderContext): Set<number> {
  const values = new Set<number>();
  const sources: string[] = [];
  if (ctx.brain !== null) sources.push(ctx.brain);
  for (const extra of ctx.grounding ?? []) sources.push(extra.text);

  for (const text of sources) {
    // The same reader both sides use, so a number is canonicalised the same way
    // whether it is being grounded or being checked. An earlier draft also
    // added every bare digit run, and that was a real hole: the "4.7" in Priya
    // Raman's review score grounded a bare "7" anywhere in any later post.
    for (const token of readNumbers(text)) values.add(token.value);
    for (const value of readWordNumbers(text)) values.add(value);
  }
  return values;
}

/**
 * Every number in a piece of text, with what this rule reads it as.
 *
 * Exported for the tests, which run it over the two worked example Brains and
 * over the toolkit's own skill prose. A corpus test that could only see pass or
 * fail would tell you a line was refused without telling you which shape did it.
 */
export function readingsFor(text: string, isCsv = false): Array<Reading & { raw: string }> {
  const masked = maskNeverAClaim(maskNonProse(text), isCsv);
  const out: Array<Reading & { raw: string }> = [];
  for (const line of masked.split('\n')) {
    for (const token of readNumbers(line)) {
      const { text: sentence, start } = sentenceAround(line, token.index);
      const local: NumberToken = { ...token, index: token.index - start, end: token.end - start };
      out.push({ raw: token.raw, ...readClaim(sentence, local) });
    }
  }
  return out;
}

/** Run rule 5 over one artifact. */
export function checkNoInventedProof(
  artifact: Artifact,
  ctx: FounderContext,
  options: ProofOptions = {},
): RuleResult {
  const notes: string[] = [];

  if (artifact.authored === 'founder') {
    notes.push(`${artifact.path} was written by the founder, so its numbers are theirs.`);
    return resultFrom(RULE, [artifact.path], [], notes);
  }

  const isBrain = artifact.path.split('/').pop() === 'founder-brain.md';
  const hasExtraGrounding = (ctx.grounding ?? []).length > 0;

  if (isBrain && !hasExtraGrounding) {
    // The Brain is where numbers first enter, out of the interview. There is
    // nothing older to check it against, and checking it against itself would
    // pass everything. Hand this function the founder's own turn messages as
    // grounding and it will check the Brain properly.
    notes.push(
      'The Founder Brain was not checked for invented numbers, because it is where the numbers come from. Pass the founder\'s own answers as grounding to check it.',
    );
    return resultFrom(RULE, [artifact.path], [], notes);
  }

  if (ctx.brain === null && !hasExtraGrounding) {
    return resultFrom(
      RULE,
      [artifact.path],
      [
        {
          rule: RULE,
          code: 'proof.nothing-to-check-against',
          severity: 'block',
          where: { path: artifact.path, line: 1, column: 1, excerpt: artifact.path },
          found: '',
          message: 'This was written before your Founder Brain exists, so there is no way to tell which numbers in it are real.',
          why: 'Everything after the Brain is written from it. Without it, a number in a post is something nobody can check, including you.',
          recovery: { label: 'Build your Founder Brain first', action: { kind: 'route', skill: 'founder-brain' } },
        },
      ],
      notes,
    );
  }

  const grounded = groundedValues(ctx);
  const isCsv = artifact.path.toLowerCase().endsWith('.csv');
  const masked = maskNeverAClaim(maskNonProse(artifact.text), isCsv);
  const violations: Violation[] = [];
  const lines = masked.split('\n');
  let offset = 0;
  let workQuantities = 0;

  for (const line of lines) {
    for (const token of readNumbers(line)) {
      if (grounded.has(token.value)) continue;

      const { text: sentence, start } = sentenceAround(line, token.index);
      const local: NumberToken = { ...token, index: token.index - start, end: token.end - start };
      const reading = readClaim(sentence, local);

      // A quantity of work is not a claim, so rule 5 has nothing to say about
      // it. Silence rather than a warning: the plan a founder generates first is
      // mostly cadences, and a note against every one of them is how a founder
      // learns to scroll past every note.
      if (reading.kind === 'work') {
        workQuantities += 1;
        continue;
      }

      const claim = reading.kind === 'result';
      const severity = claim || options.strict === true ? 'block' : 'warn';
      const at = offset + token.index;
      violations.push({
        rule: RULE,
        code: claim ? 'proof.invented-result' : 'proof.ungrounded-number',
        severity,
        where: locate(artifact.path, artifact.text, at),
        found: token.raw,
        message: claim
          ? `The number ${token.raw} is not in your Founder Brain, and this line states it as a fact about your business.`
          : `The number ${token.raw} is not in your Founder Brain, and this line does not make clear where it came from.`,
        why: 'Nothing here invents a number about your business. If a buyer asks where a figure came from, the answer has to be something you said, not something that was written for you.',
        recovery: {
          label: 'If that number is real, add it to your Founder Brain',
          action: { kind: 'edit', path: 'founder-brain.md' },
        },
      });
    }
    offset += line.length + 1;
  }

  notes.push(`${grounded.size} numbers were read from what the founder has already said.`);
  if (workQuantities > 0) {
    notes.push(
      `${workQuantities} numbers were read as a quantity of work, a cadence, a duration or a deadline, which rule 5 does not check.`,
    );
  }
  return resultFrom(RULE, [artifact.path], violations, notes);
}
