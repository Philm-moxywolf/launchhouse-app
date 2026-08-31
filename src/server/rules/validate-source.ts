/**
 * validate-source.ts: lifts the house style patterns out of the content repo's
 *   `scripts/validate.sh` and compiles them into JavaScript regular
 *   expressions.
 *
 * WHY IT EXISTS: `validate.sh` checks files a human wrote, before a commit.
 *   This folder checks files a model wrote, before a founder reads them. They
 *   are the same rules and they must be the same list. Typing the banned words
 *   out a second time here would work for about a week: somebody adds a word to
 *   the shell script because a rehearsal turned up a bad post, nobody thinks to
 *   add it here, and from then on the pre commit check is stricter than the
 *   thing 130 founders actually see. That is the wrong way round. So the shell
 *   script stays the one list and this file reads it.
 *
 *   It fails closed in three directions. If a pattern cannot be found, the
 *   extractor throws and names the assignment it was looking for, so renaming a
 *   variable in `validate.sh` breaks the build rather than silently switching a
 *   rule off. If a pattern contains regular expression syntax this translator
 *   has not been taught, it throws rather than compiling something that looks
 *   close enough. And if a pattern is present but EMPTY, or matches the empty
 *   string, it throws too.
 *
 *   THE THIRD ONE WAS ADDED AFTER IT BIT. `BANNED=''` is what a bad merge
 *   leaves behind, and it read as a found assignment. The banned word rule then
 *   scanned every founder file against a list of nothing. See the note in
 *   `ereToRegExp` for what that actually did, which was worse than passing.
 *
 * CALLED BY: prose.ts, no-dm-automation.ts, and their tests.
 * READS:     `scripts/validate.sh` from the content repo, through
 *            content-root.ts.
 * WRITES:    nothing.
 */

import { readContentFile } from './content-root.ts';

export const VALIDATE_SH_PATH = 'scripts/validate.sh';

/**
 * One pattern lifted out of the shell script, with the line it came from so a
 * failure can point at the source rather than at this file.
 */
export interface LiftedPattern {
  /** The shell variable it was assigned to, for example `BANNED`. */
  name: string;
  /** The extended regular expression, exactly as the shell script holds it. */
  ere: string;
  /** The compiled form. */
  regex: RegExp;
  /** 1 based line in `validate.sh`. */
  line: number;
}

export interface HouseStyleSource {
  /** The dash characters `validate.sh` refuses, as a character class body. */
  dashChars: string;
  dashes: LiftedPattern;
  /** Single words, alternated. Used with the boundary expressions below. */
  banned: LiftedPattern;
  /** Multi word phrases, which carry their own spacing and hyphens. */
  bannedPhrases: LiftedPattern;
  /** The word boundary `validate.sh` wraps `banned` in, left and right. */
  boundaryLeft: string;
  boundaryRight: string;
  /** Rule 3: nothing promises a reply. */
  promise: LiftedPattern;
  /** The negation filter `validate.sh` applies to promise hits. */
  promiseNegation: LiftedPattern;
  /** Rule 2: any mention of DM automation. */
  dmMention: LiftedPattern;
}

/** POSIX character classes translated to their ASCII ranges. */
const POSIX_CLASSES: ReadonlyArray<readonly [string, string]> = [
  ['[:alnum:]', 'a-zA-Z0-9'],
  ['[:alpha:]', 'a-zA-Z'],
  ['[:digit:]', '0-9'],
  ['[:lower:]', 'a-z'],
  ['[:upper:]', 'A-Z'],
  ['[:space:]', ' \\t\\r\\n\\f\\v'],
  ['[:punct:]', '!-/:-@\\[-`{-~'],
];

/**
 * Everything this translator is willing to see in an extended regular
 * expression after the POSIX classes have been replaced.
 *
 * Printable ASCII, plus anything above ASCII. The dash rule is the reason for
 * the second half: the em dash and the en dash arrive here as literal
 * characters inside a bracket expression, and they are literals in both
 * dialects. Control characters are refused, because a pattern carrying one is
 * almost certainly a paste accident.
 */
function isTranslatableChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return true; // printable ASCII
  if (code >= 0x80) return true; // a literal above ASCII, which is what the two dashes are
  return false; // a control character, which is a paste accident and never a rule
}

/** Constructs that mean different things in ERE and in JavaScript. */
const UNSUPPORTED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\[dDwWsSbB]/, 'a Perl style class such as \\d or \\b, which POSIX ERE does not have'],
  [/\(\?/, 'a group modifier such as (?: or (?=, which POSIX ERE does not have'],
  [/\\[0-9]/, 'a back reference, which POSIX ERE does not have'],
  [/\\[<>]/, 'a GNU word boundary such as \\< or \\>, which JavaScript spells differently'],
];

/**
 * Translate a POSIX extended regular expression into a JavaScript RegExp.
 *
 * Throws rather than approximating. An approximation here is a rule that looks
 * enforced and is not.
 */
export function ereToRegExp(ere: string, flags: string, sourceName: string): RegExp {
  // AN EMPTY PATTERN IS THE SILENT FAILURE THIS WHOLE FILE EXISTS TO PREVENT,
  // and it was the one shape that got through. `liftAssignment` throws when an
  // assignment is MISSING. It said nothing when the assignment was present and
  // empty, which is what a bad merge or a careless edit to validate.sh actually
  // leaves behind: `BANNED=''`.
  //
  // What that did was not even a quiet pass. Measured, on a copy of the content
  // with BANNED emptied, the banned word scan matched a zero length string at
  // every position, collected violations until the heap ran out, and killed the
  // process on the first founder turn. So the failure was a restart loop on the
  // Monday of the event, arrived at through a rule that had stopped checking.
  //
  // Both halves are refused here rather than in each lift, because this is the
  // one function every pattern in this file passes through, including the ones
  // somebody adds next year.
  if (ere.trim() === '') {
    throw new Error(
      `${VALIDATE_SH_PATH} holds an empty pattern for ${sourceName}.\nA rule with an empty list checks nothing, so the rules gate refuses to run rather than report a pass it did not earn.\nFix: restore the pattern in the content repo, then run its own test suite.`,
    );
  }

  let body = ere;

  // Shell double quoting leaves `\$` meaning a literal dollar sign.
  body = body.replace(/\\\$/g, '$');

  for (const [posix, ascii] of POSIX_CLASSES) {
    body = body.split(posix).join(ascii);
  }

  for (const [pattern, description] of UNSUPPORTED) {
    if (pattern.test(body)) {
      throw new Error(
        `${VALIDATE_SH_PATH} now uses ${description} in ${sourceName}. The rules gate will not guess at it.\nPattern: ${ere}\nFix: teach ereToRegExp in src/server/rules/validate-source.ts about it, and add a test that proves both sides agree.`,
      );
    }
  }

  const offenders = [...new Set(body.split('').filter((c) => !isTranslatableChar(c)))];
  if (offenders.length > 0) {
    const codes = offenders.map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`);
    throw new Error(
      `${VALIDATE_SH_PATH} uses characters the rules gate does not translate, in ${sourceName}: ${codes.join(' ')}\nPattern: ${ere}\nFix: teach isTranslatableChar in src/server/rules/validate-source.ts about them, and add a test.`,
    );
  }

  let compiled: RegExp;
  try {
    compiled = new RegExp(body, flags);
  } catch (cause) {
    throw new Error(
      `The pattern lifted from ${sourceName} in ${VALIDATE_SH_PATH} does not compile as a JavaScript regular expression.\nPattern: ${ere}\nFix: check the shell script, then teach ereToRegExp about the difference.`,
      { cause },
    );
  }

  // A PATTERN THAT MATCHES NOTHING AT ALL IS THE SAME BUG WEARING A HAT.
  // `(a|)` and `x*` are not empty strings, so the check above lets them past,
  // and both match at every position of every document. Tested on the compiled
  // form rather than on the text, because that is where the alternation is
  // resolved. A fresh non global copy, so this never disturbs `lastIndex` on the
  // regex the caller is about to scan with.
  if (new RegExp(body, flags.replace('g', '')).test('')) {
    throw new Error(
      `The pattern lifted from ${sourceName} in ${VALIDATE_SH_PATH} matches the empty string, so it matches everywhere and says nothing.\nPattern: ${ere}\nThe rules gate refuses to run rather than scan a founder's file with a rule that cannot fail.\nFix: check the shell script for an empty alternative such as (a|) or a bare *.`,
    );
  }

  return compiled;
}

/** Line number of an index in a string, 1 based. */
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/**
 * Pull a single quoted shell assignment, for example `BANNED='a|b'`.
 */
function liftAssignment(script: string, name: string, flags: string): LiftedPattern {
  const pattern = new RegExp(`^${name}='([^']*)'`, 'm');
  const match = pattern.exec(script);
  if (!match || match.index === undefined) {
    throw new Error(
      `The rules gate could not find ${name}= in ${VALIDATE_SH_PATH}.\nIt refuses to run rather than check founder-facing output against a list it made up.\nFix: either restore the assignment, or update liftAssignment in src/server/rules/validate-source.ts and its test.`,
    );
  }
  const ere = match[1] ?? '';
  return { name, ere, regex: ereToRegExp(ere, flags, name), line: lineOf(script, match.index) };
}

/**
 * Pull a pattern out of a `grep` call, for example the one PROMISE runs.
 * `quote` says which quote character wraps the pattern in the shell source.
 */
function liftGrepPattern(
  script: string,
  name: string,
  quote: "'" | '"',
  flags: string,
): LiftedPattern {
  const q = quote;
  const pattern = new RegExp(`^${name}=\\$\\(\\s*grep [^${q}]*${q}([^${q}]*)${q}`, 'm');
  const match = pattern.exec(script);
  if (!match || match.index === undefined) {
    throw new Error(
      `The rules gate could not find the grep pattern assigned to ${name} in ${VALIDATE_SH_PATH}.\nIt refuses to run rather than check founder-facing output against a list it made up.\nFix: either restore the assignment, or update liftGrepPattern in src/server/rules/validate-source.ts and its test.`,
    );
  }
  const ere = match[1] ?? '';
  return { name, ere, regex: ereToRegExp(ere, flags, name), line: lineOf(script, match.index) };
}

/**
 * The second grep in a pipeline, which is how `validate.sh` writes its negation
 * filter: `PROMISE=$(grep ... | grep -viE 'never|not |...')`.
 */
function liftNegationFilter(script: string, name: string, flags: string): LiftedPattern {
  const pattern = new RegExp(`^${name}=\\$\\([\\s\\S]*?grep -viE '([^']*)'`, 'm');
  const match = pattern.exec(script);
  if (!match || match.index === undefined) {
    throw new Error(
      `The rules gate could not find the negation filter on ${name} in ${VALIDATE_SH_PATH}.\nWithout it the reply promise check would flag every sentence that says replies are never promised, which is most of them.\nFix: restore the \`| grep -viE '...'\` on that assignment, or update liftNegationFilter in src/server/rules/validate-source.ts.`,
    );
  }
  const ere = match[1] ?? '';
  return {
    name: `${name}_NEGATION`,
    ere,
    regex: ereToRegExp(ere, flags, `${name} negation filter`),
    line: lineOf(script, match.index),
  };
}

/** The dash character class, taken from the DASHES grep rather than retyped. */
function liftDashes(script: string): { chars: string; pattern: LiftedPattern } {
  const match = /^DASHES=\$\(grep -rn '\[([^\]]+)\]'/m.exec(script);
  if (!match || match.index === undefined) {
    throw new Error(
      `The rules gate could not find the dash character class in ${VALIDATE_SH_PATH}.\nThe no dash rule is the single most visible house style rule and it will not be guessed at.\nFix: restore the DASHES= line, or update liftDashes in src/server/rules/validate-source.ts.`,
    );
  }
  const chars = match[1] ?? '';
  return {
    chars,
    pattern: {
      name: 'DASHES',
      ere: `[${chars}]`,
      regex: ereToRegExp(`[${chars}]`, 'g', 'DASHES'),
      line: lineOf(script, match.index),
    },
  };
}

/** The `(^|[^-[:alnum:]])` wrappers `validate.sh` puts around BANNED. */
function liftBoundaries(script: string): { left: string; right: string } {
  const match = /grep -rniE "([^"]*)\(\$BANNED\)([^"]*)"/.exec(script);
  if (!match) {
    throw new Error(
      `The rules gate could not find the word boundary expressions around $BANNED in ${VALIDATE_SH_PATH}.\nWithout them "unlock" would match inside "unlocked-door" and inside ordinary words, and the gate would be refusing founder output for no reason.\nFix: restore the BAD_WORDS= grep, or update liftBoundaries in src/server/rules/validate-source.ts.`,
    );
  }
  return { left: match[1] ?? '', right: match[2] ?? '' };
}

let cached: HouseStyleSource | null = null;

/**
 * Everything prose.ts and no-dm-automation.ts need, lifted once per process.
 *
 * Cached because `validate.sh` is pinned by the submodule SHA and cannot change
 * while the process is alive.
 */
export function houseStyleSource(): HouseStyleSource {
  if (cached !== null) return cached;

  const script = readContentFile(VALIDATE_SH_PATH);
  const dashes = liftDashes(script);
  const boundaries = liftBoundaries(script);

  cached = {
    dashChars: dashes.chars,
    dashes: dashes.pattern,
    // `m` on every one of them, because grep works a line at a time, so every
    // `^` and `$` in these patterns is a line anchor and not a string anchor.
    banned: liftAssignment(script, 'BANNED', 'gim'),
    bannedPhrases: liftAssignment(script, 'BANNED_PHRASES', 'gim'),
    boundaryLeft: boundaries.left,
    boundaryRight: boundaries.right,
    promise: liftGrepPattern(script, 'PROMISE', "'", 'gim'),
    promiseNegation: liftNegationFilter(script, 'PROMISE', 'im'),
    dmMention: liftGrepPattern(script, 'DM', "'", 'gim'),
  };
  return cached;
}

/**
 * The banned single words wrapped in the same boundaries `validate.sh` uses.
 *
 * Built here rather than in prose.ts so the boundary expressions have exactly
 * one reader.
 */
export function bannedWordRegex(): RegExp {
  const source = houseStyleSource();
  return ereToRegExp(
    `${source.boundaryLeft}(${source.banned.ere})${source.boundaryRight}`,
    'gim',
    'BAD_WORDS',
  );
}

/** Only for tests. */
export function resetHouseStyleCacheForTests(): void {
  cached = null;
}
