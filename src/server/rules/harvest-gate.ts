/**
 * src/server/rules/harvest-gate.ts
 *
 * WHAT THIS IS
 *   The rules gate in the one place it has to stand: between the model writing a
 *   file into the founder's folder and storage committing that file to `ge_file`.
 *   One call, over everything a turn produced, with an answer for each file and
 *   one answer for the turn.
 *
 * WHY IT EXISTS
 *   `index.ts` has always claimed this seat. Its header says the gate sits between
 *   the model writing a file and storage saving it, and that nothing reaches
 *   `ge_file` until it has answered. That claim was false: `runRules` had no caller
 *   outside its own folder, so rules 1 to 5 were enforced in prose, in the skills
 *   and in unit tests, and nowhere a founder could reach. A gate with no caller is
 *   a comment with a test suite. This file is the caller, and it makes the sentence
 *   in `index.ts` true.
 *
 *   IT FAILS CLOSED ON THE FILE. A file that fails a rule is not written to
 *   `ge_file`, ever, and no flag anywhere lets a caller save it anyway. The
 *   alternative, storing the file and attaching a warning, is the thing the build
 *   document rules out in one line: a write that cannot be proved must not be
 *   reported as done. A file with a banned word in it that is saved anyway is a
 *   file a founder will send to somebody.
 *
 * ------------------------------------------------------------------------------
 * THREE OUTCOMES, NOT TWO. READ THIS BEFORE MOVING ANYTHING.
 *
 * This file used to have two: the turn passed, or `RulesRefused` was thrown and
 * `storage/turn.ts` rolled the whole turn back and removed the folder. One
 * sentence in one file cost every file that turn wrote. On the Sunday turn that is
 * a growth plan, an outreach sequence and a prospect CSV, gone, and the founder
 * told they invented proof.
 *
 * THE COUNTER ARGUMENT IS REAL AND IT USED TO BE WRITTEN HERE, so it is answered
 * rather than deleted. It ran: a turn writes several files and they are saved in
 * one transaction, so letting four through and refusing the fifth leaves a folder
 * that half describes a business, which is harder to explain to a founder than a
 * clean refusal they can act on.
 *
 * Two things are wrong with it.
 *
 *   The refusal is only clean if the founder is told nothing. A folder missing one
 *   named file, with a sentence saying which file, which line and what to do, is
 *   not a folder that half describes a business by accident. It is a folder minus
 *   one file, on purpose, and the founder knows which one.
 *
 *   It assumes the rule is right. These rules are vocabulary lists. `track.ts`
 *   speaks on the word "ICP" and on "cold email". `prose.ts` speaks on a list of
 *   words lifted from a shell script. `no-invented-proof.ts` speaks on a number it
 *   could not tie to the Brain. Every one of those can be wrong about an ordinary
 *   sentence, and one reviewer found fourteen ways past the DM list in a sitting.
 *   So the trade is not "confusing folder against clean refusal". It is "confusing
 *   folder against a founder losing an hour on the Monday of a three day event
 *   because a list did not have a word in it".
 *
 *   THAT ARGUMENT WAS TAKEN FURTHER SINCE, AND `confidence.ts` IS WHERE IT WENT.
 *   Holding a file instead of a turn made a wrong rule survivable. It did not make
 *   it quiet. Measured against twenty sentences an ordinary founder would type,
 *   fourteen still lost the founder a file. So every finding this folder can make
 *   was asked, one at a time, whether it is confident and whether the harm is real,
 *   and only the ones that answer yes to both can hold anything now. The count is
 *   one of twenty. Read that file before deciding a rule here is too quiet: the
 *   volume decision lives there, and this file only decides what a hold costs.
 *
 * SO A BLOCKING VIOLATION NOW HAS TWO SHAPES, and `outcomeFor` below is the whole
 * decision:
 *
 *   REFUSE THE TURN   `RulesRefused` is thrown, storage rolls back, the folder is
 *                     removed, nothing is saved. Reserved for the short list in
 *                     `WORTH_THE_WHOLE_TURN`.
 *   HOLD THE FILE     that one file is not written to `ge_file`. Every other file
 *                     the turn wrote is committed. The founder is told which file,
 *                     which line, and what to do. This is the default, including
 *                     for a code this file has never heard of.
 *
 * WHERE THE LINE SITS, because the next person will move it. A violation is worth
 * the whole turn only when BOTH of these hold:
 *
 *   1  The rule has been MEASURED against ordinary founder writing and does not
 *      fire on it. Not argued to be precise: run, over sentences a founder would
 *      really write, with the count written down. Two independent signals having
 *      to agree is what makes that possible, and it is still not the evidence.
 *   2  It is evidence about the RUN, not about the file. A model that offered to
 *      automate cold DMs was in a state where it was willing to do that. Every
 *      other file in the same turn came out of that same state, and this gate only
 *      catches the phrasings it happens to have words for. Refusing the turn is
 *      refusing to trust the rest of a run that has already been caught once.
 *
 * An em dash fails test 2, and it now fails an earlier one as well: it does not
 * hold a file at all, because a punctuation preference the founder never agreed to
 * is not harm. A number the rule could not classify fails test 1. The other
 * track's vocabulary fails test 2 and passes test 1, so it holds its file, which is
 * the whole of rule 1's job here: a file that is never stored is a file the founder
 * is never shown.
 *
 * TEST 1 IS WRITTEN THE WAY IT IS BECAUSE IT ALREADY CAUGHT SOMETHING. Rule 5's
 * strong reading, an ungrounded number stated as a fact about the business, was on
 * the list on the argument alone. Measured, it fired on seven of fourteen ordinary
 * sentences, five of them observations of the kind CLAUDE.md tells a founder to
 * write when proof is thin. The note under the table has the numbers. An argument
 * for precision is not precision.
 *
 * THAT SAME MEASUREMENT HAS SINCE BEEN RUN OVER TWENTY SENTENCES AND OVER EVERY
 * RULE, not just rule 5, and it is kept runnable in `confidence.test.ts`. Rule 5
 * was split in two by it: the shapes that fired on ordinary writing became notes,
 * and the three that did not stayed able to hold a file. The entry below is
 * unaffected, because rule 2 was already measured and already passed.
 *
 * MONEY, SENDING AND CREDENTIALS ARE STILL FAIL CLOSED, and holding is what makes
 * them so rather than what threatens them. Nothing downstream reads the folder: a
 * publish batch is built from `ge_file`, and `db/schema.ts` says in one line that
 * there is no sequence of model outputs that posts, enrolls, sends or spends. A
 * held file is never written to `ge_file`, so it can reach no vendor, no payload
 * and no preview. The turn level rollback was never the thing protecting them.
 *
 * ADDING A SECOND ENTRY TO `WORTH_THE_WHOLE_TURN` costs a founder a turn's work
 * every time the rule behind it is wrong. Run the measurement, put the count in the
 * table beside the argument, or leave it out and let the file be held. The test
 * named "ordinary founder sentences never cost a turn" is where the measurement
 * lives and it will fail for you if the answer is no.
 * ------------------------------------------------------------------------------
 *
 * WHAT IT DOES NOT LOOK AT, AND WHY THAT IS NOT A HOLE
 *   The gate reads what the MODEL wrote. `schemas/writers.md` splits the folder in
 *   two: the engines write the founder's content files, and `ge` writes `ledger.md`,
 *   `memory.md`, `ops-log.md`, `people/`, `snapshots/` and everything under
 *   `.state/`. Those are excluded here, by name, in a list a test pins.
 *
 *   The reason is a real failure and not tidiness. The rules in this folder hold a
 *   second implementation of `ge`'s own file formats: the person kind lines, the
 *   marker pairs, the ledger columns. Running that second parser over `ge`'s output
 *   mid turn means the day the two disagree, a founder loses a file they never
 *   wrote and cannot fix. `ge` refuses rather than guesses at its own writes, and
 *   the app does not second guess it.
 *
 *   `voice-samples/` is excluded for rule 6 and rule 4 together. Those are the
 *   founder's own words, put there so the model can read them. Holding a founder's
 *   own writing to the house style is the app correcting a person's prose without
 *   being asked.
 *
 *   `dm-openers.md` IS gated, even though `ge person export openers` owns the
 *   `GE:TARGETS` block inside it, because the audience engine owns the rest of it
 *   and the rest of it is what a founder sends to a stranger.
 *
 * WHAT CALLS IT
 *   `storage/turn.ts`, once per turn, after `planHarvest` and before
 *   `applyHarvest`. Nothing else should: a gate called after the write is a report.
 *   The caller has a job on the way out as well: every path in `report.held` has to
 *   come out of the plan before `applyHarvest` sees it. `storage/turn.ts` does that
 *   in one function and the test beside it proves the held file never reaches
 *   `ge_file`.
 *
 * READS   the bytes the harvest plan already read from the folder, and, through the
 *         `readPrevious` callback it is handed, the stored version of a changed
 *         file. It opens no file and no database connection itself, which is what
 *         keeps the whole policy testable without Postgres.
 * WRITES  nothing. It answers, or it throws.
 */

import {
  explainRefusal,
  isOverridable,
  runRules,
  type Artifact,
  type Confirmed,
  type FounderContext,
  type GateAnswer,
  type GateOptions,
  type Recovery,
  type RuleResult,
  type Track,
  type Violation,
} from './index.ts';
import { assertRulesSourcesReady } from './sources-ready.ts';

/* -------------------------------------------------------------------------- */
/* Who wrote it                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The three files `ge` owns outright, from `schemas/writers.md`.
 *
 * `memory.md` and `ops-log.md` also carry the founder's own recorded words, which
 * is a second reason not to hold them to the house style.
 */
export const GE_OWNED_FILES: readonly string[] = ['ledger.md', 'memory.md', 'ops-log.md'];

/**
 * Folders the gate does not read, each with the reason it does not.
 *
 * Every line here is a hole by construction, so each one is named, reasoned, and
 * pinned by a test. Adding a fifth is a visible act in a diff and it needs an
 * argument, not a commit message.
 */
export const NOT_GATED_FOLDERS: ReadonlyArray<{ prefix: string; why: string }> = [
  {
    prefix: '.state/',
    why: 'ge bookkeeping. Not prose, and ge rebuilds it whole on every run.',
  },
  {
    prefix: 'snapshots/',
    why: 'byte copies ge took of files that already answered this gate.',
  },
  {
    prefix: 'people/',
    why: 'ge is the writer, and these are real people\'s details rather than generated prose.',
  },
  {
    prefix: 'voice-samples/',
    why: 'the founder\'s own writing. Rule 6 says the voice comes from them.',
  },
];

/**
 * Why this path is not gated, or null when it is.
 *
 * Exported because the report carries the answer and the test pins it. A path that
 * falls through every branch is model written, which is the default on purpose: a
 * file nobody planned for gets checked rather than waved through.
 */
export function notGatedReason(path: string): string | null {
  if (GE_OWNED_FILES.includes(path)) {
    return 'ge writes this file, and ge refuses rather than guesses at its own writes.';
  }
  for (const folder of NOT_GATED_FOLDERS) {
    if (path.startsWith(folder.prefix)) return folder.why;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* What a blocking violation costs                                            */
/* -------------------------------------------------------------------------- */

/** What a blocking violation does to the turn it was found in. */
export type GateOutcome = 'refuse-the-turn' | 'hold-the-file';

/**
 * The only violations worth throwing away a whole turn's work for.
 *
 * Both entries pass the two tests in the header: the rule needed two signals to
 * agree before it spoke, and what it found says something about the run rather
 * than about one file. Nothing else in this folder passes both, and a code this
 * table has never heard of holds its file, because a code nobody has argued for is
 * by definition a code nobody has argued is worth a founder's afternoon.
 *
 * KEYED ON THE CODE STRING, so renaming a code in a rule module would quietly turn
 * its refusal into a hold. That direction is the safe one, the file is still never
 * saved, and it is not left to luck either way: `harvest-gate.test.ts` and
 * `storage/turn.rules.test.ts` both assert the refusal by behaviour, from a
 * sentence a model could write, so a rename breaks a test rather than the event.
 */
export const WORTH_THE_WHOLE_TURN: ReadonlyArray<{ code: string; why: string }> = [
  {
    code: 'dm.offered',
    why:
      'Rule 2, and the one rule where the offer itself is the harm. It fires only when a channel and a hand off verb sit in the same sentence, the sentence is not refusing, and the contact is cold, so it is not one word off a list. Measured against twelve sentences about DMs, it fired on the three that were genuine offers and on none of the nine that were not, including "send each of the 25 DMs yourself" and "the email sequence is automated, the DMs are not". A run that offered to automate cold DMs once wrote every other file of that turn in the same state, and this gate only catches the phrasings somebody thought of. A restricted Instagram account is not recoverable by asking again.',
  },
];

/*
 * WHY `proof.invented-result` IS NOT ON THAT LIST, and the next person will try to
 * put it back, so here is the measurement that says not to.
 *
 * READ THE NUMBERS BELOW AS HISTORY. They were taken when one code covered every
 * reading rule 5 could make. That code has since been split: the wide shapes are
 * `proof.unbacked-figure` and they are notes, and `proof.invented-result` is now
 * only the three shapes that did not fire on ordinary writing. The conclusion is
 * unchanged and the reasoning is why, so it is kept rather than rewritten.
 *
 * It is the obvious candidate. It reads as the strong half of rule 5: the number is
 * in nothing the founder ever said, AND the sentence states it as a fact about
 * their business. An invented customer count is the thing rule 5 exists for, and
 * refusing a run that produced one is a defensible instinct.
 *
 * Then it was run. Fourteen sentences an ordinary founder could write, against a
 * clean Brain and no other grounding. Seven came back as `proof.invented-result`:
 *
 *     We have 214 customers on the platform today.        a real invention
 *     Last week I spoke to 6 operations leads.            an observation
 *     I read 12 job posts this morning.                   an observation
 *     There are 25 people on my list.                     the toolkit's own number
 *     I have written 30 posts this quarter.               the toolkit's own number
 *     The average reply rate people quote is 3 percent.   not about their business
 *     We saved a client 11 hours a week.                  a real invention
 *
 * Two of the seven are the thing the rule is for. The rest are ordinary writing,
 * and three of them are what CLAUDE.md tells a founder to do when proof is thin:
 * write from point of view and observation. The classifier reads "result" for most
 * sentences with a number in them. That fails the first test above, so it holds its
 * file like everything else.
 *
 * NOTHING IS LOST BY HOLDING IT. The invented count still never reaches `ge_file`,
 * the founder is still told which line and why, and rule 5's actual harm, a founder
 * sending a stranger a figure they cannot stand behind, is prevented by the file not
 * existing. What holding gives back is the growth plan written beside it.
 *
 * WHAT WOULD PUT IT BACK. A `proof.invented-result` that fires on the two inventions
 * above and on neither of the five observations. The test named "ordinary founder
 * sentences never cost a turn" in harvest-gate.test.ts is the measurement, kept
 * runnable, so the day the rule gets sharper the evidence for changing this is one
 * command away.
 */

const REFUSING_CODES: ReadonlySet<string> = new Set(WORTH_THE_WHOLE_TURN.map((e) => e.code));

/**
 * What this blocking violation costs: the file, or the turn.
 *
 * Exported so the decision can be tested on its own, and so a reader finds the
 * whole policy in one function rather than in a branch halfway down a loop.
 */
export function outcomeFor(violation: Violation): GateOutcome {
  return REFUSING_CODES.has(violation.code) ? 'refuse-the-turn' : 'hold-the-file';
}

/* -------------------------------------------------------------------------- */
/* What the founder reads                                                     */
/* -------------------------------------------------------------------------- */

/** One file that was checked, failed, and was left out of the commit. */
export interface HeldFile {
  path: string;
  /** The blocking violations that held it, exactly as the rules reported them. */
  violations: Violation[];
  /** The paragraph the founder reads. Built by `explainHold`. */
  message: string;
}

/** At most this many other file names get listed before a count takes over. */
const NAMES_SHOWN = 3;

/**
 * The last line, which is the only line a founder has to act on.
 *
 * READ OFF THE RECOVERY ACTION AND NOT THE LABEL, because the three kinds mean
 * three different things and appending one sentence to all of them writes nonsense.
 * Both of these came out of reading the real output rather than the types:
 *
 *   reply   the label already says "Ask for that one again", so appending "then
 *           ask for content-30.md again" says the same thing twice. Name the file
 *           instead, which is the only part the label was missing.
 *   route   the way out is somewhere else. A b2b founder whose hook-bank.md was
 *           held must not be told to ask for hook-bank.md again: that file belongs
 *           to the other track and asking again is how they get it a second time.
 *   edit    they change something, then ask again. Both halves are real, so both
 *           halves are said.
 *
 * `subject` is the file for a hold and nothing for a refusal, where every file is
 * gone and there is no one thing to ask for.
 */
function wayOut(recovery: Recovery, subject: string | null): string {
  const again = subject === null ? 'ask again' : `ask for ${subject} again`;
  switch (recovery.action.kind) {
    case 'reply':
      return `${again.charAt(0).toUpperCase()}${again.slice(1)}.`;
    case 'route':
      return `${recovery.label}.`;
    case 'edit':
      return `${recovery.label}. Then ${again}.`;
  }
}

/** "a.md", or "a.md and b.md", or "a.md, b.md and c.md". */
function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * Paths that were saved and are not worth saying out loud.
 *
 * `ge index` rewrites `.state/index.md` on almost every run, and `ge` takes a
 * snapshot before it overwrites anything. Both are true saves and neither is a
 * thing a founder is waiting for. Reading the real output is what put this here:
 * the first draft opened with ".state/index.md and snapshots/content-30.md", which
 * pushed the founder's own plan into "and 1 more".
 *
 * `people/` and `voice-samples/` are NOT on this list. Those are the founder's
 * prospects and the founder's own writing, and a founder who has just lost a file
 * wants to know those are still there.
 */
const NOT_WORTH_NAMING: readonly string[] = ['.state/', 'snapshots/'];

/**
 * What the founder still has, said first, because it is the thing they are
 * worried about the moment a file is missing.
 */
function keptSentence(savedPaths: readonly string[]): string {
  const worth = savedPaths.filter((p) => !NOT_WORTH_NAMING.some((prefix) => p.startsWith(prefix)));
  if (worth.length === 0) {
    return 'Nothing else from that request is waiting for you.';
  }
  if (worth.length <= NAMES_SHOWN) {
    return `Everything else from that request is saved: ${list(worth)}.`;
  }
  const shown = list(worth.slice(0, NAMES_SHOWN));
  const rest = worth.length - NAMES_SHOWN;
  return `Everything else from that request is saved: ${shown}, and ${rest} more.`;
}

/**
 * The paragraph a founder reads when one file was held back.
 *
 * WHY IT IS BUILT HERE. A founder did not ask for a gate. They asked for a content
 * plan and something came back short. Four things have to be in the answer or they
 * will ask a mentor instead: what they got, what was held, exactly which sentence
 * held it, and what to do now. It is built in this file so that every surface says
 * the same thing, and so the wording can be run through the house style rules by
 * the test beside it.
 *
 * WHAT IS DELIBERATELY NOT IN IT. No rule code, no rule number, no pattern, and no
 * accusation. The rule's own `message` and `why` are quoted rather than rewritten,
 * because the rules own the specifics and a second copy of them here would drift.
 * When the rule is guessing, its own sentence is already the careful one: it says a
 * figure is not on record, not that the founder made it up.
 *
 * IT DOES NOT SAY "HELD BACK" ANY MORE, and that is not a euphemism. "One file was
 * held back and not saved" is the app describing its own machinery, in the passive,
 * to somebody who asked for a content plan. What they need is the state of their
 * folder, which is: this one is not there yet, and here is the line. The word for
 * what happened is only worth spending if the founder can do something with it.
 *
 * WHEN THE FOUNDER CAN OVERRULE IT, the paragraph says so. `isOverridable` is the
 * authority, and it is false for exactly the things the founder is not the judge of:
 * rule 2, where Instagram decides, and the structural checks, where the file simply
 * would not work. Everywhere else the founder knows their own business, and a gate
 * with no way past it is a gate somebody works around by writing in a text editor.
 *
 * The founder's own line is quoted back verbatim, dashes and all. That quote is
 * evidence, not house style, and the alternative is telling somebody a line is a
 * problem without showing them which line.
 */
export function explainHold(
  path: string,
  cause: Violation,
  savedPaths: readonly string[],
  heldPaths: readonly string[] = [path],
): string {
  // Counted rather than assumed. One turn can hold several files, a b2c founder
  // whose engine reached for b2b vocabulary twice being the ordinary way, and
  // telling them one file was held when three were is the kind of small lie that
  // sends somebody to a mentor.
  const alsoHeld = heldPaths.length > 1;
  const parts: string[] = [
    keptSentence(savedPaths),
    alsoHeld
      ? `${heldPaths.length} files are not there yet, and this is one of them: ${path}.`
      : `One file is not there yet: ${path}.`,
  ];

  // `found` is empty when the rule is speaking about the file as a whole rather
  // than about a line in it, and the excerpt is then the path itself. Quoting a
  // file name back as though it were a sentence reads like a bug.
  if (cause.found.trim() !== '' && cause.where.excerpt !== path) {
    parts.push(`It stopped on line ${cause.where.line}: "${cause.where.excerpt}"`);
  }

  parts.push(`${cause.message} ${cause.why}`);
  parts.push(wayOut(cause.recovery, path));

  // THE WAY PAST IT, LAST, and only where the founder is the one who knows.
  // A founder who really does have that figure needs a sentence that tells them
  // so, in the same paragraph, or they will go and ask a mentor whether they are
  // allowed to be right.
  if (isOverridable(cause.code)) {
    parts.push('If that line is right as it stands, say so and it will be kept, here and from now on.');
  }
  return parts.join(' ');
}

/**
 * The paragraph a founder reads when the whole turn was refused.
 *
 * It leads with the thing they cannot see for themselves. A refusal takes back
 * every file the turn wrote, so the first sentence says so plainly rather than
 * leaving them to work it out from a file list that did not change.
 * `explainRefusal` in `index.ts` still writes the middle of it, so the reason a
 * founder reads here is the same one every other surface shows.
 */
function refusalMessage(answer: GateAnswer): string {
  const first = answer.blocked[0];
  const ending = first === undefined ? '' : ` ${wayOut(first.recovery, null)}`;
  return (
    'Nothing from that request was saved. Your folder is exactly as it was before you asked. ' +
    `${explainRefusal(answer)}${ending}`
  );
}

/* -------------------------------------------------------------------------- */
/* The refusal                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A turn refused because something the model wrote failed a rule badly enough to
 * cost the whole run. `WORTH_THE_WHOLE_TURN` is the list of what qualifies.
 *
 * Carries the whole answer rather than only a sentence, because three surfaces
 * need different parts of it: the founder reads `message`, the screen renders
 * `answer.blocked` with the line numbers and the recovery button, and the event
 * row records `paths`. Rebuilding any of those from a formatted string is how the
 * three end up disagreeing.
 *
 * It deliberately does not extend `TurnRefused`. That class lives in
 * `storage/turn.ts`, which imports this file, and a rule module importing storage
 * back would be a cycle in the one direction this codebase keeps straight: storage
 * depends on rules, never the other way.
 */
export class RulesRefused extends Error {
  /** What a route switches on. Matches the shape of `TurnRefused.code`. */
  readonly code = 'rules_refused';
  readonly answer: GateAnswer;
  /** The paths that were checked, so the event row can name them. */
  readonly paths: readonly string[];

  constructor(answer: GateAnswer, paths: readonly string[]) {
    super(refusalMessage(answer));
    this.name = 'RulesRefused';
    this.answer = answer;
    this.paths = paths;
  }
}

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

/** One entry from a harvest plan, reduced to what the gate needs. */
export interface HarvestedFile {
  path: string;
  kind: 'new' | 'changed' | 'deleted';
  /** The bytes the plan read. Absent for a deletion, and only for a deletion. */
  bytes?: Buffer | undefined;
}

export interface HarvestGateInput {
  /** Never reaches a rule. It is here so a refusal can be logged against a turn. */
  founderId: string;
  changes: readonly HarvestedFile[];
  /**
   * The track this session is running on, from `founders.track`.
   *
   * Not read out of the artifact being checked. If it were, `track.brain-disagrees`
   * would be comparing the file against itself and could never fire, and that
   * check is rule 1: the fork happens once and the two halves have to agree.
   */
  track: Track | null;
  /** `founder-brain.md` as it stands AFTER the work of this turn. */
  brain: string | null;
  /**
   * Anything else that grounds a number, above all what the founder said this
   * turn. Without it rule 5 cannot check the Brain itself, and says so in a note
   * rather than passing quietly.
   */
  grounding?: Artifact[] | undefined;
  /**
   * Figures and lines the founder has already looked at and said are right.
   *
   * The gate never raises one of these again. See `Confirmed` in types.ts for
   * where the app keeps them, which is the founder's own Brain rather than a
   * hidden flag, so a founder can see and change every answer they have given.
   */
  confirmed?: readonly Confirmed[] | undefined;
  /**
   * The stored text of a file that is changing, for rule 4.
   *
   * A callback rather than a map, because reading it costs a decrypt per file and
   * only changed files have one. A callback rather than the blob store itself,
   * because this folder must not learn about Postgres.
   */
  readPrevious?: ((path: string) => Promise<string | undefined>) | undefined;
  options?: GateOptions | undefined;
}

export interface HarvestGateReport {
  /** Paths the rules actually read, in the order they were read. */
  checked: string[];
  /** Paths the gate did not read, each with the reason. */
  notGated: Array<{ path: string; why: string }>;
  /**
   * The files that failed a rule and must NOT be written.
   *
   * THE CALLER HAS A JOB HERE, and it is not the optional kind. `gateHarvest`
   * returning normally means the TURN may commit. It does not mean every file may
   * be saved. Every path in this list has to come out of the plan before
   * `applyHarvest` sees it. Empty on almost every turn.
   */
  held: HeldFile[];
  /**
   * The paths this turn may write: everything checked that passed, plus everything
   * the gate does not read. Deletions are not in it, because a deletion leaves the
   * founder nothing. Here so the founder facing copy can say what they still have.
   */
  saved: string[];
  /**
   * The combined answer, or null when this turn produced nothing to check.
   *
   * Null is not a pass. It is the honest answer to "what did the rules say about a
   * turn that only touched ge's own files", which is: nothing, and here is the list.
   *
   * `ok` is about the ARTIFACTS, not about the turn. A turn that held one file and
   * committed four others comes back with `ok: false` and a committed transaction,
   * and both of those are true at the same time.
   */
  answer: GateAnswer | null;
  /**
   * What the founder should see beside the work. Held files first, then warnings.
   *
   * A held file's entry is a new violation rather than the one the rule wrote. Its
   * severity is `warn` because that is what this entry is: a note that reaches the
   * founder alongside the files that did save. The blocking violation underneath it
   * is kept whole in `held`, where its severity still reads `block`, because that
   * is what it did to the file.
   *
   * HELD ENTRIES COME FIRST because the surface that renders this shows the first
   * few and drops the rest, and a founder who is missing a file needs to hear that
   * before they hear about a warning on a file they have.
   */
  notes: Violation[];
}

/**
 * Run every rule over everything the model wrote this turn.
 *
 * Returns a report the caller must act on: `held` names the files that failed and
 * must not be written. Throws `RulesRefused` only for the short list in
 * `WORTH_THE_WHOLE_TURN`, which rolls the whole turn back. It throws for those
 * rather than returning a flag because the caller is a transaction, and a flag is
 * something a caller can forget to read. A throw cannot be forgotten.
 */
export async function gateHarvest(input: HarvestGateInput): Promise<HarvestGateReport> {
  // BEFORE ANYTHING ELSE, AND BEFORE THE EMPTY TURN SHORTCUT BELOW. Every rule
  // in this folder reads its list off disk, and a list that will not load is a
  // rule that cannot answer. Asking it anyway gets a pass it did not earn.
  //
  // It sits here rather than at the top of `runRules` because this is the seat:
  // this function is what `storage/turn.ts` calls, and a throw from here is a
  // refused turn with the folder removed. The founder loses the turn and can ask
  // again. That is the right cost for a deployment that cannot check anything,
  // and it is a great deal cheaper than the alternative, which is 130 founders
  // carrying files nothing looked at.
  //
  // It runs on an empty turn too. A deployment whose rules cannot load has no
  // business running founder turns at all, and finding out on the first read
  // only turn rather than the first write turn is one restart earlier.
  assertRulesSourcesReady();

  const notGated: Array<{ path: string; why: string }> = [];
  const toCheck: Array<{ artifact: Artifact; kind: HarvestedFile['kind'] }> = [];
  // Kept apart from `notGated`, because a deleted path is not a file the founder
  // still has, and the copy below tells them what they still have.
  const notGatedAndKept: string[] = [];

  for (const change of input.changes) {
    if (change.kind === 'deleted') {
      notGated.push({ path: change.path, why: 'deleted this turn, so there is nothing to read.' });
      continue;
    }
    const why = notGatedReason(change.path);
    if (why !== null) {
      notGated.push({ path: change.path, why });
      notGatedAndKept.push(change.path);
      continue;
    }
    if (change.bytes === undefined) {
      // FAIL CLOSED, AND THIS ONE STILL COSTS THE TURN. It is not a rule, and no
      // heuristic fires it: the harvest plan said this file was written and then
      // handed over no bytes for it, which is the plan contradicting itself. That
      // is a bug in storage rather than a sentence in a founder's file, and
      // committing the rest of a plan that has been caught lying is not something
      // this file is willing to do.
      throw new Error(
        `The rules gate was handed ${change.path} with no content. A file that cannot be read cannot be checked, so the turn is refused rather than saved unchecked.`,
      );
    }
    toCheck.push({
      artifact: {
        path: change.path,
        // Everything the gate reads is model written, because the paths ge and the
        // founder own are the paths it does not read. That is why this is a
        // constant and not a guess.
        authored: 'model',
        text: change.bytes.toString('utf8'),
      },
      kind: change.kind,
    });
  }

  if (toCheck.length === 0) {
    return { checked: [], notGated, held: [], saved: notGatedAndKept, answer: null, notes: [] };
  }

  const ctx: FounderContext = {
    track: input.track,
    brain: input.brain,
    grounding: input.grounding ?? [],
    confirmed: input.confirmed ?? [],
  };

  // One call per artifact rather than runRulesOverAll, because rule 4 needs the
  // PREVIOUS version of this particular file to tell whether the founder's own
  // section was rewritten, and a single options object cannot carry a different
  // previous for each one. It is also what makes a per file answer possible at
  // all: runRulesOverAll flattens five files into one verdict.
  const results: RuleResult[] = [];
  const blocked: Violation[] = [];
  const warnings: Violation[] = [];
  const checked: string[] = [];
  const blockedByPath = new Map<string, Violation[]>();

  for (const entry of toCheck) {
    const previous =
      entry.kind === 'changed' && input.readPrevious
        ? await input.readPrevious(entry.artifact.path)
        : undefined;

    const answer = runRules(entry.artifact, ctx, {
      ...input.options,
      ownership: { ...input.options?.ownership, previous },
    });

    checked.push(entry.artifact.path);
    results.push(...answer.results);
    blocked.push(...answer.blocked);
    warnings.push(...answer.notes);
    if (answer.blocked.length > 0) blockedByPath.set(entry.artifact.path, answer.blocked);
  }

  // The turn is decided first, because a turn that is being refused has nothing to
  // say about which files were held: none of them are being saved either way.
  const refusing = blocked.filter((v) => outcomeFor(v) === 'refuse-the-turn');
  if (refusing.length > 0) {
    // Ordered so a refusing violation is the one `explainRefusal` reads. Without
    // this, a turn refused for an offer to automate DMs could open by telling the
    // founder about an em dash in a different file.
    const ordered = [...refusing, ...blocked.filter((v) => outcomeFor(v) !== 'refuse-the-turn')];
    throw new RulesRefused({ ok: false, results, blocked: ordered, notes: warnings }, checked);
  }

  const saved = [...checked.filter((path) => !blockedByPath.has(path)), ...notGatedAndKept];
  // Both lists are settled before a single sentence is written, so the copy can
  // say how many files were held without any of them having to guess.
  const heldPaths = [...blockedByPath.keys()];

  const held: HeldFile[] = [];
  for (const [path, violations] of blockedByPath) {
    // The first violation is the one the founder is asked to fix. runRules returns
    // them in rule order, which puts the track fork ahead of the house style, so
    // the first one is already the one that matters most.
    const cause = violations[0];
    if (cause === undefined) continue;
    held.push({ path, violations, message: explainHold(path, cause, saved, heldPaths) });
  }

  const heldNotes: Violation[] = held.flatMap((file) => {
    const cause = file.violations[0];
    if (cause === undefined) return [];
    return [
      {
        rule: cause.rule,
        // Prefixed so a log line still says which rule held the file, and so
        // nothing reading this mistakes it for the violation the rule wrote.
        code: `held.${cause.code}`,
        severity: 'warn' as const,
        where: cause.where,
        found: cause.found,
        message: file.message,
        why: cause.why,
        recovery: cause.recovery,
      },
    ];
  });

  const answer: GateAnswer = { ok: blocked.length === 0, results, blocked, notes: warnings };
  return { checked, notGated, held, saved, answer, notes: [...heldNotes, ...warnings] };
}
