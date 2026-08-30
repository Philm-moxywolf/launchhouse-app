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
 *   - rule 3, that nothing promises a reply. The phrase is lifted; deciding
 *     whether a line is making that promise or refusing to make it is done
 *     here, and the argument for how is at the head of that section
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

/* -------------------------------------------------------------------------- */
/* Rule 3: nothing promises a reply                                            */
/* -------------------------------------------------------------------------- */

/**
 * THE FAILURE THIS SECTION WAS REWRITTEN TO PREVENT. Every one of these was
 * refused, and each of them is a sentence written to HONOUR rule 3:
 *
 *   Nothing here promises a reply.
 *   Nothing in this plan guarantees a reply.
 *   It would be wrong to promise a reply.
 *   No part of this guarantees a response.
 *
 * The old check lifted `validate.sh`'s negation filter, six words long, and ran
 * it over the whole line: `never|not |cannot|no one|nobody|none of`. It holds
 * "nobody" and not "nothing", so the plainest disclaimer in English was refused,
 * and the founder was told their output promised something it explicitly did
 * not. What that costs them, one file or the whole turn, is `harvest-gate.ts`'s
 * to decide. Either way it is work they did not get, taken for a sentence that
 * was right.
 *
 * THE FIX IS NOT "ADD NOTHING TO THE LIST". Six words chosen for a shell one
 * liner will always be missing the seventh. What makes this fixable, and what
 * makes it different from the vocabularies in the other rules, is that NEGATION
 * IN ENGLISH IS A CLOSED CLASS. There are a few dozen ways to cancel a verb and
 * no thirteenth one gets invented next Tuesday. So the class below is written
 * out properly, once, and then it is asked a question about position rather
 * than about presence.
 *
 * POSITION IS THE OTHER HALF. The old filter matched anywhere on the line, so a
 * negation about something else excused a real promise four clauses later:
 * "We do not automate anything and we guarantee a reply" passed. Negation in
 * English works leftwards over its own clause. So a canceller in the head of the
 * clause the promise sits in cancels it; one anywhere else in the sentence means
 * somebody was disclaiming something, but not provably this, and that is a
 * different answer.
 *
 * THREE ANSWERS, AND WHAT EACH COSTS THE FOUNDER
 *
 *   disclaimed  silence. The line is honouring rule 3 and there is nothing to
 *               say about it.
 *   promised    block. The phrase is asserted with nothing anywhere near it
 *               taking it back. This is the shape rule 3 forbids.
 *   unclear     warn. The artifact reaches the founder with a note against the
 *               line. This is where the rule admits it is guessing, and a guess
 *               must not cost a founder work they cannot get back.
 *
 * THE DETECTOR STAYS NARROW ON PURPOSE. What counts as a promise is still the
 * two verbs `validate.sh` holds, lifted rather than retyped so the two cannot
 * drift. That is a vocabulary list and it does have the usual hole: "you will
 * hear back from five of them" is a promise and is not caught. Widening it here
 * would put the runtime ahead of the pre commit check and would refuse founder
 * work on shapes nobody has tested. It is narrow BECAUSE it blocks: a rule that
 * costs a founder their turn should only fire on something exact.
 */

/** A sentence ends the reach of a canceller. A clause ends its grip. */
const SENTENCE_END = /[.!?;:](?=\s|$)|\|/g;
const CLAUSE_END = /[;:]|,\s*(?:and|but|or|so|yet|then)\b|\b(?:and|but|or|so|yet|then|because|although|though|while|whereas)\b/gi;

/** The span of `line` that `at` sits in, given the marks that end a span. */
function spanAround(line: string, at: number, ends: RegExp): { text: string; start: number } {
  let start = 0;
  let end = line.length;
  for (const match of line.matchAll(new RegExp(ends.source, ends.flags))) {
    if (match.index === undefined) continue;
    if (match.index + match[0].length <= at) start = match.index + match[0].length;
    else if (match.index >= at) {
      end = match.index;
      break;
    }
  }
  return { text: line.slice(start, end), start };
}

/**
 * Everything English uses to cancel a verb, and nothing else.
 *
 * Three groups, and the grouping is the argument for believing the list is
 * complete. Grammatical negation is closed and finite. The contrast frames are
 * the handful of ways to say "this instead of that". The third group is verbs
 * and adjectives that carry the refusal inside their own meaning, which is the
 * only open end here, and an open end that only ever makes the rule quieter.
 *
 * A word from this list does NOT mean the line is fine. It means the line is
 * doing something to the promise, and where it sits decides what.
 */
const CANCELLER = new RegExp(
  [
    // grammatical negation
    "\\bno\\b", "\\bnot\\b", "n['’]t\\b", "\\bnever\\b", "\\bnone\\b", "\\bnobody\\b",
    "\\bno one\\b", "\\bnothing\\b", "\\bneither\\b", "\\bnor\\b", "\\bnowhere\\b",
    "\\bcannot\\b", "\\bwithout\\b", "\\bhardly\\b", "\\bscarcely\\b", "\\bbarely\\b",
    // a contrast, which replaces the promise with something else
    "\\brather than\\b", "\\binstead of\\b", "\\bshort of\\b", "\\bother than\\b",
    "\\bfar from\\b",
    // words that carry the refusal in their own meaning
    "\\bavoid\\w*", "\\brefus\\w+", "\\bresist\\w*", "\\bdeclin\\w+", "\\bprevent\\w*",
    "\\bforbid\\w*", "\\bforbidden\\b", "\\bban(?:s|ned|ning)?\\b", "\\bprohibit\\w*",
    "\\bstop\\w*", "\\bskip\\w*", "\\bomit\\w*", "\\bden(?:y|ies|ied)\\b",
    "\\bwrong\\b", "\\bdishonest\\b", "\\bunfair\\b", "\\bmisleading\\b", "\\bfalse\\b",
    "\\buntrue\\b", "\\boverclaim\\w*", "\\boverpromis\\w*",
  ].join('|'),
  'i',
);

/**
 * The line is describing the kind of sentence that would break rule 3, rather
 * than writing one: "a sequence that promises a reply is a sequence to rewrite".
 *
 * An indefinite noun with a relative pronoun on it is talking about a class of
 * sentence. It is a note rather than silence, because "this is a sequence that
 * guarantees a reply" wears the same clothes and is a promise.
 */
const MENTION_FRAME = /\b(?:a|an|any|anything|anyone|every|each|some|whatever|whichever)\b[^,;:.]{0,40}\b(?:that|which|who)\s+$/i;

type PromiseReading = 'disclaimed' | 'promised' | 'unclear';

/**
 * What one occurrence of the promise phrase is doing in its sentence.
 *
 * Exported for the tests, which run it over every disclaimer shape anybody could
 * think of. An answer of pass or fail would say a line was refused without
 * saying which shape decided it, and the shape is the whole argument here.
 */
export function readReplyPromise(line: string, at: number): PromiseReading {
  const sentence = spanAround(line, at, SENTENCE_END);
  const inSentence = at - sentence.start;
  const clause = spanAround(sentence.text, inSentence, CLAUSE_END);
  const head = clause.text.slice(0, inSentence - clause.start);

  // A canceller in the head of this clause governs this promise. That is where
  // "nothing here", "never", "rather than" and "it would be wrong to" all sit.
  if (CANCELLER.test(head)) return 'disclaimed';

  // Everything below is the rule saying it cannot tell.
  if (MENTION_FRAME.test(head)) return 'unclear';
  // A canceller after the verb usually belongs to something else, which is why
  // it is not silence: "we guarantee a reply without fail" is a promise with the
  // word "without" in it. It is still worth saying the rule saw one.
  if (CANCELLER.test(clause.text)) return 'unclear';
  // Anywhere else in the sentence. Somebody was disclaiming something and the
  // clause split may have put the wrong half of it on the wrong side.
  if (CANCELLER.test(sentence.text)) return 'unclear';
  // The filter `validate.sh` runs, kept as a floor so the pre commit check can
  // never be the more forgiving of the two. If the shell script grows a word
  // this class does not have, a line that passes on the way into the repo still
  // does not cost a founder their turn on the way out of the model.
  if (houseStyleSource().promiseNegation.regex.test(sentence.text)) return 'unclear';

  return 'promised';
}

/**
 * Rule 3, half of it. Replies depend on list quality, offer and timing, and
 * nothing in this product can promise one.
 *
 * NOT MASKED FIRST, unlike the range check. A code fence is where a draft email
 * lives, and a draft email is the one place in the folder where a promise of a
 * reply would actually be sent to somebody.
 */
function checkReplyPromises(artifact: Artifact, out: Violation[]): void {
  const { promise } = houseStyleSource();
  const lines = artifact.text.split('\n');
  let offset = 0;
  for (const line of lines) {
    const re = new RegExp(promise.regex.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const reading = readReplyPromise(line, match.index);
      if (reading !== 'disclaimed') {
        const asserted = reading === 'promised';
        out.push({
          rule: RULE,
          code: asserted ? 'prose.promise-reply' : 'prose.promise-reply-unclear',
          severity: asserted ? 'block' : 'warn',
          where: locate(artifact.path, artifact.text, offset + match.index),
          found: match[0],
          // NOT "this line promises a reply". That sentence contains the exact phrase
          // this rule looks for, so the gate's own refusal tripped the gate. The self
          // test in this folder is what found it, and the fix is the wording rather
          // than an exception, because a rule with an exception for its own copy is a
          // rule somebody will quote at you.
          message: asserted
            ? 'This line tells the reader a reply is coming. Nothing here can say that.'
            : 'This line puts a reply and a guarantee in one sentence, and it does not read clearly as a refusal to make one. It was kept, so read it and decide.',
          why: 'Whether anyone replies depends on your list, your offer and your timing, and none of the three is ours to promise. Twenty five good messages is the work. A reply rate is not something anybody can hand you.',
          recovery: ASK_AGAIN,
        });
      }
      // An empty match would loop forever, and a zero width promise is not a
      // thing, so this only ever steps past a real one.
      if (match.index === re.lastIndex) re.lastIndex += 1;
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
