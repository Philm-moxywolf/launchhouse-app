/**
 * src/server/rules/harvest-gate.ts
 *
 * WHAT THIS IS
 *   The rules gate in the one place it has to stand: between the model writing a
 *   file into the founder's folder and storage committing that file to `ge_file`.
 *   One call, over everything a turn produced, with a single answer.
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
 *   IT FAILS CLOSED, and that decision is the whole design. A blocking violation
 *   throws `RulesRefused`, `storage/turn.ts` rolls the transaction back and removes
 *   the folder, and the founder is told what was wrong and given one way out. The
 *   alternative, saving the file and attaching a warning, is the thing the build
 *   document rules out in one line: a write that cannot be proved must not be
 *   reported as done. A file with a banned word in it that is saved anyway is a
 *   file a founder will send to somebody.
 *
 *   THE REFUSAL IS THE WHOLE TURN, not the one file. `runRulesOverAll` already
 *   settled that policy and this follows it: a turn writes several files and they
 *   are saved in one transaction, so letting four through and refusing the fifth
 *   leaves a folder that half describes a business. That is harder to explain to a
 *   founder than a clean refusal they can act on.
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
 *   mid turn means the day the two disagree, a founder loses a turn to a refusal
 *   about a file they never wrote and cannot fix. `ge` refuses rather than guesses
 *   at its own writes, and the app does not second guess it.
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
 *
 * READS   the bytes the harvest plan already read from the folder, and, through the
 *         `readPrevious` callback it is handed, the stored version of a changed
 *         file. It opens no file and no database connection itself, which is what
 *         keeps the whole policy testable without Postgres.
 * WRITES  nothing. It answers, or it throws.
 */

import {
  explainRefusal,
  runRules,
  type Artifact,
  type FounderContext,
  type GateAnswer,
  type GateOptions,
  type RuleResult,
  type Track,
  type Violation,
} from './index.ts';

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
/* The refusal                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A turn refused because something the model wrote failed a rule.
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
    super(explainRefusal(answer));
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
   * The combined answer, or null when this turn produced nothing to check.
   *
   * Null is not a pass. It is the honest answer to "what did the rules say about a
   * turn that only touched ge's own files", which is: nothing, and here is the list.
   */
  answer: GateAnswer | null;
  /** Warnings. They do not stop the turn and the founder should still see them. */
  notes: Violation[];
}

/**
 * Run every rule over everything the model wrote this turn.
 *
 * Throws `RulesRefused` on the first turn that carries a blocking violation. It
 * throws rather than returning a flag because the caller is a transaction, and a
 * flag is something a caller can forget to read. A throw cannot be forgotten.
 */
export async function gateHarvest(input: HarvestGateInput): Promise<HarvestGateReport> {
  const notGated: Array<{ path: string; why: string }> = [];
  const toCheck: Array<{ artifact: Artifact; kind: HarvestedFile['kind'] }> = [];

  for (const change of input.changes) {
    if (change.kind === 'deleted') {
      notGated.push({ path: change.path, why: 'deleted this turn, so there is nothing to read.' });
      continue;
    }
    const why = notGatedReason(change.path);
    if (why !== null) {
      notGated.push({ path: change.path, why });
      continue;
    }
    if (change.bytes === undefined) {
      // FAIL CLOSED. The plan said this file was written and handed over no bytes
      // for it. Checking nothing and reporting a pass is exactly the failure
      // `assertChecked` exists to stop, so the turn is refused instead.
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
    return { checked: [], notGated, answer: null, notes: [] };
  }

  const ctx: FounderContext = {
    track: input.track,
    brain: input.brain,
    grounding: input.grounding ?? [],
  };

  // One call per artifact rather than runRulesOverAll, because rule 4 needs the
  // PREVIOUS version of this particular file to tell whether the founder's own
  // section was rewritten, and a single options object cannot carry a different
  // previous for each one.
  const results: RuleResult[] = [];
  const blocked: Violation[] = [];
  const notes: Violation[] = [];
  const checked: string[] = [];

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
    notes.push(...answer.notes);
  }

  const answer: GateAnswer = { ok: blocked.length === 0, results, blocked, notes };
  if (!answer.ok) throw new RulesRefused(answer, checked);

  return { checked, notGated, answer, notes };
}
