/**
 * prose.ts: the house style rules, applied at runtime to what a model wrote.
 *
 * WHY IT EXISTS: `scripts/validate.sh` in the content repo checks the files a
 *   human wrote, once, before a commit. It never sees a single line of what 130
 *   founders actually read, because all of that is written by a model at the
 *   moment they ask for it. A founder who gets 30 posts back with em dashes
 *   through them has 30 posts that do not sound like the toolkit they were
 *   handed, and nobody finds out until somebody reads all 130 folders. This is
 *   the same set of rules, on the other side of the line.
 *
 *   The banned words are not typed out here. They are lifted from
 *   `validate.sh`, through validate-source.ts, so the two cannot drift.
 *
 * WHAT IT CHECKS
 *   - em dash and en dash, using the character class `validate.sh` holds
 *   - the banned marketing words and phrases, with the same word boundaries
 *   - a range written with a dash, for example "11-13" where the house style
 *     asks for "11 to 13". `validate.sh` has no check for this one, so there is
 *     nothing to drift from and the rule is written here
 *   - rule 3, that nothing promises a reply
 *
 * WHAT IT DOES NOT CHECK, and why: sentence length, jargon and "name the doubt
 *   first" are real house style rules and none of them can be measured without
 *   guessing. A gate that guesses gets switched off. They stay in the skills,
 *   where a person reads them.
 *
 * CALLED BY: index.ts, and storage/turn.ts through it, before an artifact is
 *   saved. Also its own test, which runs these rules over every founder-facing
 *   string this folder can emit.
 * READS:     `scripts/validate.sh` from the content repo, once per process.
 * WRITES:    nothing. It returns a result and the caller decides.
 */

import {
  bannedWordRegex,
  houseStyleSource,
  type LiftedPattern,
} from './validate-source.ts';
import {
  locate,
  maskNonProse,
  resultFrom,
  type Artifact,
  type Recovery,
  type RuleResult,
  type Violation,
} from './types.ts';

const RULE = 'prose' as const;

const ASK_AGAIN: Recovery = {
  label: 'Ask for that one again',
  action: { kind: 'reply' },
};

function editThis(path: string): Recovery {
  return { label: 'Open the file and change that line', action: { kind: 'edit', path } };
}

/**
 * A range written with a dash.
 *
 * A number, then an optional short unit such as `k`, `M` or `%`, then a hyphen,
 * then another number and its own optional unit. The digit on both sides is
 * what keeps `content-30.md` and `90-day-plan.md` out of it, because neither
 * has a digit on the far side of its hyphen.
 *
 * BOTH SIDES ARE MATCHED WHOLE, and that is not tidiness. The message this rule
 * writes quotes what it found and spells out the replacement, so a pattern that
 * stopped at the first digit on the right told a founder who wrote "11-13" to
 * write "11 to 1". Wrong advice, in the founder's own words, is worse than no
 * advice.
 *
 * The right hand unit allows no space in front of it, because a space there
 * would swallow the next short word: "11-13 of them" would be reported as the
 * range "11-13 of". The left hand side can allow one, because a hyphen has to
 * follow it immediately.
 *
 * Only the plain hyphen. An em dash or an en dash between two numbers is caught
 * by the dash rule above, and reporting it twice would tell a founder there are
 * two problems on a line that has one.
 */
const RANGE_WITH_DASH = /(\d+(?:[.,]\d+)*)\s?([a-zA-Z%]{0,2})-(\d+(?:[.,]\d+)*[a-zA-Z%]{0,2})/g;

/** Dates, which are the one place a dash between numbers is correct. */
const DATE_SHAPES = /\d{4}-\d{2}(-\d{2})?/g;

function blankOut(text: string, pattern: RegExp): string {
  const chars = text.split('');
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

/** Named so a founder reads "an em dash" rather than a code point. */
function dashName(ch: string): string {
  if (ch.codePointAt(0) === 0x2014) return 'an em dash';
  if (ch.codePointAt(0) === 0x2013) return 'an en dash';
  return 'a dash the house style does not use';
}

function checkDashes(artifact: Artifact, out: Violation[]): void {
  const { dashes } = houseStyleSource();
  const re = new RegExp(dashes.regex.source, 'g');
  for (const match of artifact.text.matchAll(re)) {
    if (match.index === undefined) continue;
    const found = match[0];
    out.push({
      rule: RULE,
      code: 'prose.dash',
      severity: 'block',
      where: locate(artifact.path, artifact.text, match.index),
      found,
      message: `This line has ${dashName(found)} in it. The house style does not use either one.`,
      why: 'Every piece a founder publishes should read like the same person wrote it. A dash that appears in some pieces and not others is the fastest way to make it read like two people did.',
      recovery: ASK_AGAIN,
    });
  }
}

function checkBannedWords(artifact: Artifact, out: Violation[]): void {
  const re = bannedWordRegex();
  // An exec loop rather than matchAll, because the boundary groups consume the
  // characters on either side of the word. In "seamless unlock" the space
  // belongs to both matches, and matchAll would report only the first.
  let match: RegExpExecArray | null;
  while ((match = re.exec(artifact.text)) !== null) {
    const word = match[2] ?? match[0];
    const at = match.index + (match[1]?.length ?? 0);
    re.lastIndex = at + word.length;
    out.push({
      rule: RULE,
      code: 'prose.banned-word',
      severity: 'block',
      where: locate(artifact.path, artifact.text, at),
      found: word,
      message: `The word "${word}" is on the list this toolkit does not use.`,
      why: 'Your buyers have read that word on a hundred landing pages and it tells them nothing about you. Saying the specific thing instead is what makes a post sound like a person.',
      recovery: ASK_AGAIN,
    });
  }
}

function checkBannedPhrases(artifact: Artifact, out: Violation[]): void {
  const { bannedPhrases } = houseStyleSource();
  const re = new RegExp(bannedPhrases.regex.source, 'gi');
  for (const match of artifact.text.matchAll(re)) {
    if (match.index === undefined) continue;
    out.push({
      rule: RULE,
      code: 'prose.banned-phrase',
      severity: 'block',
      where: locate(artifact.path, artifact.text, match.index),
      found: match[0],
      message: `The phrase "${match[0]}" is on the list this toolkit does not use.`,
      why: 'Your buyers have read that phrase on a hundred landing pages and it tells them nothing about you. Saying the specific thing instead is what makes a post sound like a person.',
      recovery: ASK_AGAIN,
    });
  }
}

function checkRanges(artifact: Artifact, out: Violation[]): void {
  // Masked twice: once for code, links and markers, once for dates. A hyphen
  // inside 2026-08-19 is a date and a hyphen inside `a-b` is code.
  const masked = blankOut(maskNonProse(artifact.text), DATE_SHAPES);
  for (const match of masked.matchAll(RANGE_WITH_DASH)) {
    if (match.index === undefined) continue;
    const found = artifact.text.slice(match.index, match.index + match[0].length);
    const better = found.replace('-', ' to ');
    out.push({
      rule: RULE,
      code: 'prose.range-dash',
      severity: 'block',
      where: locate(artifact.path, artifact.text, match.index),
      found,
      message: `The range "${found}" is written with a dash. Write it as "${better}".`,
      why: 'A dash between two numbers reads as a minus sign to about a third of people, and it breaks when the text is pasted somewhere the font is different.',
      recovery: ASK_AGAIN,
    });
  }
}

/**
 * Rule 3, half of it. Replies depend on list quality, offer and timing, and
 * nothing in this product can promise one.
 *
 * Line by line, with the same negation filter `validate.sh` uses, so a sentence
 * saying replies are never promised is not itself reported as promising one.
 */
function checkReplyPromises(artifact: Artifact, out: Violation[]): void {
  const { promise, promiseNegation } = houseStyleSource();
  const lines = artifact.text.split('\n');
  let offset = 0;
  for (const line of lines) {
    const re = new RegExp(promise.regex.source, 'gi');
    const match = re.exec(line);
    if (match && !promiseNegation.regex.test(line)) {
      out.push({
        rule: RULE,
        code: 'prose.promise-reply',
        severity: 'block',
        where: locate(artifact.path, artifact.text, offset + match.index),
        found: match[0],
        // NOT "this line promises a reply". That sentence contains the exact phrase
        // this rule looks for, so the gate's own refusal tripped the gate. The self
        // test in this folder is what found it, and the fix is the wording rather
        // than an exception, because a rule with an exception for its own copy is a
        // rule somebody will quote at you.
        message: 'This line tells the reader a reply is coming. Nothing here can say that.',
        why: 'Whether anyone replies depends on your list, your offer and your timing, and none of the three is ours to promise. Twenty five good messages is the work. A reply rate is not something anybody can hand you.',
        recovery: ASK_AGAIN,
      });
    }
    offset += line.length + 1;
  }
}

export interface ProseOptions {
  /**
   * Check the founder's own writing too.
   *
   * Off by default, and that is rule 4 rather than laziness. The founder's own
   * sentences in their own Brain are theirs. Flagging one back at them is the
   * app correcting a person's writing without being asked.
   */
  includeFounderWriting?: boolean;
}

/** Run every house style rule over one artifact. */
export function checkProse(artifact: Artifact, options: ProseOptions = {}): RuleResult {
  const notes: string[] = [];

  if (artifact.authored === 'founder' && options.includeFounderWriting !== true) {
    notes.push(
      `${artifact.path} was written by the founder, so the house style rules were not applied to it.`,
    );
    return resultFrom(RULE, [artifact.path], [], notes);
  }

  const violations: Violation[] = [];
  checkDashes(artifact, violations);
  checkBannedWords(artifact, violations);
  checkBannedPhrases(artifact, violations);
  checkRanges(artifact, violations);
  checkReplyPromises(artifact, violations);

  if (options.includeFounderWriting === true && artifact.authored === 'founder') {
    // Their file, so the way out is their editor and not a regeneration.
    for (const v of violations) v.recovery = editThis(artifact.path);
  }

  const source = houseStyleSource();
  notes.push(
    `Banned words and the dash class were read from scripts/validate.sh, lines ${source.banned.line} and ${source.dashes.line}.`,
  );
  return resultFrom(RULE, [artifact.path], violations, notes);
}

/**
 * The same rules over a bare string, for checking the app's own founder-facing
 * copy. Used by the self test in this folder, and available to anything that
 * renders a sentence to a founder.
 */
export function checkProseText(label: string, text: string): RuleResult {
  return checkProse({ path: label, text, authored: 'model' });
}

export type { LiftedPattern };
