/**
 * types.ts: the shape every rule in this folder answers with, and the small
 *   text helpers more than one of them needs.
 *
 * WHY IT EXISTS: a rule that answers `false` tells a founder nothing. The
 *   people running this have three days, 130 of them, no support desk, and no
 *   appetite for reading a stack trace. Test case 21 in the content repo,
 *   `tests/cases/21-recovery-lines.sh`, holds the whole toolkit to the promise
 *   that every refusal a founder can reach ends with a way out. This file makes
 *   that promise a type: a violation cannot be constructed without a message, a
 *   place, and a recovery. Nothing here can compile into a bare boolean.
 *
 *   The second reason is fail closed. `RuleResult.checked` records what was
 *   actually examined, so a rule that silently examined nothing cannot report
 *   `ok: true` and be believed. `assertChecked` is what turns that into a
 *   refusal.
 *
 * CALLED BY: every rule module in this folder, index.ts, and anything upstream
 *   that renders a refusal to a founder or writes one to `turn_events`.
 * READS:     nothing on disk.
 * WRITES:    nothing.
 */

/** The two tracks. Chosen once in the Brain and never asked again. */
export type Track = 'b2b' | 'b2c';

/** The six rules, as they are named in the project's own documents. */
export type RuleId =
  | 'prose'
  | 'track'
  | 'no-dm-automation'
  | 'no-invented-proof'
  | 'ownership'
  | 'gate';

/**
 * `block` stops the artifact reaching the founder. `warn` reaches the founder
 * with the artifact, as a note beside it.
 *
 * Two levels, not three. A third level is where "we will look at that later"
 * lives, and nothing in this gate is worth raising and then not acting on.
 */
export type Severity = 'block' | 'warn';

/** The nine skill folders in the content repo, used only to name a way back. */
export type SkillName =
  | 'founder-brain'
  | 'content-engine'
  | 'outreach-b2b'
  | 'audience-b2c'
  | 'ghl-workflows'
  | 'growth-plan'
  | 'playbook-export'
  | 'status'
  | 'setup';

/**
 * What the founder can do next.
 *
 * `ge` prints a recovery line reading `-> run: some command`. There is no
 * command line here, so the same idea becomes a button. The skill name is
 * carried rather than a route id, because `app/content/routes.ts` owns route
 * ids and this folder must not hold a second copy of them.
 */
export type RecoveryAction =
  | { kind: 'route'; skill: SkillName }
  | { kind: 'reply' }
  | { kind: 'edit'; path: string };

export interface Recovery {
  /** What the button says. Founder-facing, so house style applies. */
  label: string;
  action: RecoveryAction;
}

/** Where in the artifact the problem is. Lines and columns are 1 based. */
export interface Where {
  /** Path relative to `growth-engine/`, for example `content-30.md`. */
  path: string;
  line: number;
  column: number;
  /** The line the problem sits on, trimmed and bounded. */
  excerpt: string;
}

export interface Violation {
  rule: RuleId;
  /** Stable machine code, for example `prose.em-dash`. Never shown raw. */
  code: string;
  severity: Severity;
  where: Where;
  /** The exact text that tripped the rule. */
  found: string;
  /** What happened, in the founder's language. */
  message: string;
  /** Why the rule exists, in one sentence. Names the doubt, then answers it. */
  why: string;
  recovery: Recovery;
}

export interface RuleResult {
  rule: RuleId;
  /** True when nothing blocking was found. Warnings do not clear this flag. */
  ok: boolean;
  /** Every path this rule actually read. An empty list is a refusal, not a pass. */
  checked: string[];
  violations: Violation[];
  /** Things looked at and deliberately not flagged, kept for the audit trail. */
  notes: string[];
}

/** One file on its way to a founder. */
export interface Artifact {
  /** Path relative to `growth-engine/`. Never absolute, never with `..`. */
  path: string;
  text: string;
  /**
   * Who wrote the words.
   *
   * This matters more than it looks. A founder may write anything they like in
   * their own Brain, including a word this gate would refuse from the model.
   * Flagging the founder's own sentence back at them is the fastest way to make
   * a gate feel like a nag, and rule 4 says the writing is theirs.
   */
  authored: 'model' | 'founder';
}

/**
 * A finding the founder has looked at and said is right.
 *
 * WHY IT EXISTS. The gate is a backstop and it is sometimes wrong, and the
 * person who knows it is wrong is the founder. Someone who really does have
 * 1,200 followers needs a way to say so and be believed, without a terminal,
 * without a mentor, and without being asked again on the next post.
 *
 * MATCHED ON THE RULE AND THE FOUND TEXT, not on a file and a line. The founder
 * is answering a question about their business, not about a file. Confirm a
 * figure once and it is settled for every post after it.
 *
 * WHERE IT IS KEPT, and this is a decision rather than a missing table. A
 * confirmed figure is a true thing about the founder's business, and the file
 * that holds true things about the founder's business already exists: the
 * `## Proof` section of their own `founder-brain.md`. Confirming appends the
 * figure there, in a line they can read, edit and download, and the next turn
 * grounds on it the ordinary way, because rule 5 already reads the whole Brain.
 * Nothing has to be remembered anywhere the founder cannot see, and a founder
 * who later changes their mind deletes a line rather than hunting for a switch.
 *
 * THE LIST ON THE CONTEXT IS THAT SAME ANSWER, HELD FOR THIS TURN. The Brain is
 * read once at the top of a turn, so a founder who confirms a figure and asks
 * for the post again straight away would otherwise be asked twice inside a
 * minute. The caller carries the confirmations until the Brain is next read.
 */
export interface Confirmed {
  /** Which rule raised it. Confirming a figure must not silence a dash. */
  rule: RuleId;
  /** The exact text the founder was shown: a number, a word, a phrase. */
  found: string;
}

/**
 * The line a confirmation adds to the founder's Brain, under `## Proof`.
 *
 * Written the way a person writes a note to themselves, because it goes into
 * their file under their name. A line in their own Brain that reads like a
 * machine wrote it is a line they will delete, and then they get asked again.
 *
 * `today` is passed in rather than read from the clock, so the caller owns the
 * timezone and a test can pin the output.
 */
export function confirmationLine(confirmed: Confirmed, today: string): string {
  return `- ${confirmed.found}, checked by me on ${today}`;
}

/** What a rule needs to know about the founder it is checking for. */
export interface FounderContext {
  /** Null before the Brain is written. Nothing forks until it is set. */
  track: Track | null;
  /** `founder-brain.md` as text. The grounding source for rule 5. */
  brain: string | null;
  /**
   * Anything else the founder said or wrote that may ground a number.
   * `memory.md` and the founder's own messages this turn belong here.
   */
  grounding?: Artifact[];
  /**
   * Findings the founder has already said are right. Never raised again.
   *
   * Optional, and an absent list means nothing has been confirmed rather than
   * everything. A rule reading this must never read empty as permission.
   */
  confirmed?: readonly Confirmed[];
}

/** Empty result for a rule that ran and found nothing. */
export function pass(rule: RuleId, checked: string[], notes: string[] = []): RuleResult {
  return { rule, ok: true, checked, violations: [], notes };
}

/** Build a result from violations, setting `ok` from the blocking ones only. */
export function resultFrom(
  rule: RuleId,
  checked: string[],
  violations: Violation[],
  notes: string[] = [],
): RuleResult {
  return {
    rule,
    ok: !violations.some((v) => v.severity === 'block'),
    checked,
    violations,
    notes,
  };
}

/**
 * Refuse a result that examined nothing.
 *
 * This is the fail closed rule written down. A rule that reads a file it cannot
 * find, or is handed an artifact list that turned out to be empty, must not
 * return `ok: true`, because upstream will read that as proof and save the
 * file. Section 5 of the build document states it as "a write that cannot be
 * proved must not be reported as done".
 */
export function assertChecked(result: RuleResult): RuleResult {
  if (result.checked.length === 0) {
    throw new Error(
      `Rule "${result.rule}" reported a pass without checking anything. That is a fail closed condition: the artifact is refused rather than saved unchecked.`,
    );
  }
  return result;
}

/** Blocking violations across many results, most useful first. */
export function blocking(results: RuleResult[]): Violation[] {
  return results.flatMap((r) => r.violations).filter((v) => v.severity === 'block');
}

const EXCERPT_LIMIT = 160;

/**
 * Turn a character offset into a line, a column and the line it sits on.
 *
 * Offsets are how a regex reports a find and lines are how a person reads one.
 * Every rule here needs the conversion, and getting it subtly wrong in five
 * places is how a founder gets pointed at the wrong sentence.
 */
export function locate(path: string, text: string, index: number): Where {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n') + 1;
  const column = index - lineStart + 1;
  const lineEnd = text.indexOf('\n', lineStart);
  const raw = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const trimmed = raw.trim();
  const excerpt =
    trimmed.length > EXCERPT_LIMIT ? `${trimmed.slice(0, EXCERPT_LIMIT)}...` : trimmed;
  return { path, line, column, excerpt };
}

/**
 * Blank out the regions of a markdown file where a match means nothing.
 *
 * Replaces fenced code blocks, inline code spans, HTML comments and URLs with
 * spaces, leaving every newline in place so offsets and line numbers still line
 * up with the original text.
 *
 * WHY: a hyphen inside `https://example.com/a-b` is not a range written with a
 * dash, and a digit inside a `<!-- GE:TOUCH:START -->` marker is not a claim
 * about a founder's results. Without this, rule 5 would flag the toolkit's own
 * bookkeeping and stop being believed.
 */
export function maskNonProse(text: string): string {
  // split('') and not [...text]: regex indices count UTF-16 code units, and a
  // single emoji in a B2C post would otherwise shift every offset after it.
  const chars = text.split('');
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end && i < chars.length; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  };

  const patterns: RegExp[] = [
    /```[\s\S]*?(?:```|$)/g, // fenced block, unterminated fence masks to the end
    /~~~[\s\S]*?(?:~~~|$)/g,
    /<!--[\s\S]*?(?:-->|$)/g, // GE markers and any other comment
    /`[^`\n]*`/g, // inline code
    /\bhttps?:\/\/\S+/gi,
    /\bwww\.\S+/gi,
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // email addresses, which carry dots and dashes
  ];

  for (const pattern of patterns) {
    // Run against the original text so one pattern cannot hide another's start.
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      blank(match.index, match.index + match[0].length);
    }
  }

  return chars.join('');
}
