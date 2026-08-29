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
 *   The Brain is the record of what is true. So the rule is: a number in
 *   generated output has to be traceable to something the founder said.
 *
 * THE FALSE POSITIVE PROBLEM, AND THE CHOICES MADE
 *
 *   A rule that flags every digit flags the date, the price the founder set,
 *   the "3" in "3 of 30", and the year. A founder who is told their content
 *   plan is full of invented proof, thirty times, stops reading the warnings.
 *   So the numbers that are never claims are taken out before the scan runs:
 *
 *   - Dates, times and years in date shaped company. A bare 2019 next to the
 *     word "customers" is still checked, because "2019 customers" is a claim.
 *   - Positions rather than quantities: "piece 4", "week 2", list markers, the
 *     first cell of a table row, the toolkit's own file names.
 *   - `b2b` and `b2c`, which are a track and not the number two.
 *   - Anything inside a link, a code span or one of ge's markers.
 *
 *   What survives is graded, not flagged flat. A number sitting next to a proof
 *   word (customers, followers, reviews, revenue, per cent, and so on) is a
 *   refusal, because that is the shape of an invented result. A number with no
 *   proof word near it is a note, because it is usually a quantity in an
 *   instruction. `strict` promotes every ungrounded number to a refusal, and
 *   that is what the journey test uses: script a founder with no proof and
 *   assert no digit reaches them that is not in their Brain.
 *
 *   The grounding side is deliberately generous, because being generous there
 *   only ever removes false alarms. "fifteen years" in the Brain grounds "15
 *   years" in a post. "8k" grounds "8,000". "31 per cent" grounds "31%".
 *
 * CALLED BY: index.ts, before an artifact is saved.
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
  /\b(piece|week|day|step|post|part|slot|item|row|question|group|option)\s+\d+\b/gi,
  /^\s*\d+[.)]\s/gm, // an ordered list marker
  /^\s*\|\s*\d+\s*\|/gm, // the first cell of a table row
  /^\s*#{1,6}\s*\d+[.)]?\s/gm, // a numbered heading
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
/* Deciding whether a number is a claim                                       */
/* -------------------------------------------------------------------------- */

/**
 * Two lists, because the two work differently.
 *
 * A thing you can count only makes the number a claim when the number is
 * counting it. "63 firms" is a claim. "7 openers this week" is an instruction
 * that happens to have the word week in it, and an earlier draft that looked
 * anywhere on the line refused it.
 *
 * A result word makes the number a claim wherever it sits nearby, because
 * "revenue" and "increase" and "reduced" have no other job in a sentence.
 */
const COUNTED_THINGS =
  /^\s*(?:[\w'-]+\s+){0,2}(customers?|clients?|users?|subscribers?|followers?|reviews?|stars?|people|persons?|readers?|firms?|companies|company|businesses|business|founders?|members?|leads?|bookings?|calls?|orders?|sales?|testimonials?|days?|weeks?|months?|years?|hours?|minutes?|projects?|staff|teams?|signups?|downloads?|attendees?|enquir\w+|inquir\w+)\b/i;

const RESULT_WORDS =
  /\b(revenue|growth|grew|increase[sd]?|decrease[sd]?|reduc\w*|cut|saved|savings?|roi|conversion|convert\w*|retention|churn|reorder\w*|rating|averag\w*|open rate|click\w*|engagement|per cent|percent|repl\w*|margin|turnover)\b/i;

const CLAIM_WINDOW = 45;

function looksLikeAClaim(line: string, at: number, raw: string): boolean {
  if (/%|per cent|percent/i.test(raw)) return true;
  if (COUNTED_THINGS.test(line.slice(at + raw.length))) return true;
  const from = Math.max(0, at - CLAIM_WINDOW);
  const to = Math.min(line.length, at + raw.length + CLAIM_WINDOW);
  return RESULT_WORDS.test(line.slice(from, to));
}

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProofOptions {
  /**
   * Refuse every ungrounded number, not only the ones that read as a result.
   *
   * The build document's negative assertion: script a founder with no proof and
   * assert no digit appears in a generated post that is not in the Brain.
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

  for (const line of lines) {
    for (const token of readNumbers(line)) {
      if (grounded.has(token.value)) continue;
      const claim = looksLikeAClaim(line, token.index, token.raw);
      const severity = options.strict === true || claim ? 'block' : 'warn';
      const at = offset + token.index;
      violations.push({
        rule: RULE,
        code: claim ? 'proof.invented-result' : 'proof.ungrounded-number',
        severity,
        where: locate(artifact.path, artifact.text, at),
        found: token.raw,
        message: claim
          ? `The number ${token.raw} is not in your Founder Brain, and it is written here as a result.`
          : `The number ${token.raw} is not in your Founder Brain.`,
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
  return resultFrom(RULE, [artifact.path], violations, notes);
}
