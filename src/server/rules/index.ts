/**
 * index.ts: the rules gate. One call, all six rules, one answer.
 *
 * WHY IT EXISTS: five of the six rules run on every artifact, and if each
 *   caller wired them up itself then one caller would eventually wire up four.
 *   The one that got left out would be whichever rule had been added most
 *   recently, and nobody would notice until a founder read something. So there
 *   is one entry point and the callers do not get to choose.
 *
 *   It is also where fail closed lives. `assertChecked` refuses a result that
 *   examined nothing, and a rule that throws is a refusal rather than a pass:
 *   an artifact that could not be checked is not an artifact that is fine.
 *
 * WHERE IT SITS: between the model writing a file and storage saving it.
 *   `storage/turn.ts` plans the harvest, calls `harvest-gate.ts` on what the
 *   model wrote, and only then applies it, so nothing reaches `ge_file` until
 *   this has answered. `harvest-gate.ts` is the seat and it is one file away on
 *   purpose: it holds the policy about which paths are the model's, and this
 *   file holds the rules. The gate itself, rule 6's three session gates, is a
 *   separate call because it reads the whole folder rather than one file.
 *
 *   That sentence was a claim before the wiring existed and it is worth saying
 *   why it is checked now rather than trusted. `storage/turn.rules.test.ts`
 *   runs a real turn whose only write is an artifact carrying a banned word,
 *   against a database handle that throws on any INSERT, and asserts the turn
 *   is refused before that handle is ever reached.
 *
 * RULE 6, voice from the founder, is not a module here. It cannot be measured
 *   from an artifact: whether a post sounds like the founder rather than like a
 *   competitor is a judgement, and a gate that guessed at it would be refusing
 *   good work on a hunch. It is held where it can be held, in the skills and in
 *   `voice-samples/`, which ownership.ts keeps visible and downloadable.
 *
 * RULE 1 IS ALSO CHECKED ON THE WAY OUT, by `fileFilterFor` at the foot of this
 *   file. Every other rule in this folder runs before a write. Rule 1 has to run
 *   before a read as well, because a founder can be handed the other track's
 *   material by a file that was already on disk, and `routes/files.ts` is the
 *   one place a file leaves the database. So the gate answers both questions:
 *   may this be written, and may this founder be shown it.
 *
 * CALLED BY: harvest-gate.ts, which storage/turn.ts calls on every turn, for
 *   `runRulesOverAll`. routes/files.ts, for `fileFilterFor`, on the list, on one
 *   file and on the ZIP. And the tests in this folder.
 * READS:     `schemas/gates.md`, through gates-source.ts, for the track column.
 *   Nothing else directly. The rules it calls read the content repo themselves.
 * WRITES:    nothing.
 *
 * IT DOES NOT IMPORT harvest-gate.ts. The dependency runs one way, so that this
 *   file stays the thing a rule module can import without a cycle.
 */

import { gatesSource, type GateFileRow } from './gates-source.ts';
import { checkNoDmAutomation } from './no-dm-automation.ts';
import { checkNoInventedProof, type ProofOptions } from './no-invented-proof.ts';
import { checkOwnership, visiblePaths, type OwnershipOptions } from './ownership.ts';
import { checkProse, type ProseOptions } from './prose.ts';
import { checkTrack, type TrackOptions } from './track.ts';
import {
  assertChecked,
  blocking,
  type Artifact,
  type FounderContext,
  type RuleResult,
  type Track,
  type Violation,
} from './types.ts';

export interface GateOptions {
  prose?: ProseOptions;
  track?: TrackOptions;
  proof?: ProofOptions;
  ownership?: OwnershipOptions;
}

export interface GateAnswer {
  /** True when nothing blocking was found. The artifact may be saved. */
  ok: boolean;
  /** One result per rule, in the order they ran. */
  results: RuleResult[];
  /** Everything that stops the artifact, most serious rule first. */
  blocked: Violation[];
  /** Everything worth saying that does not stop the artifact. */
  notes: Violation[];
}

/**
 * The order the rules run in, which is the order a founder reads the answer.
 *
 * Rule 1 first, because being handed the wrong track's material makes every
 * other complaint beside the point. Then rule 2, then rule 5, then the house
 * style, then rule 4. The house style comes late because a dash is the smallest
 * of these problems and should not be the first thing anybody reads.
 */
export function runRules(
  artifact: Artifact,
  ctx: FounderContext,
  options: GateOptions = {},
): GateAnswer {
  const results: RuleResult[] = [
    checkTrack(artifact, ctx, options.track),
    checkNoDmAutomation(artifact),
    checkNoInventedProof(artifact, ctx, options.proof),
    checkProse(artifact, options.prose),
    checkOwnership(artifact, options.ownership),
  ].map(assertChecked);

  const blocked = blocking(results);
  const notes = results.flatMap((r) => r.violations).filter((v) => v.severity === 'warn');
  return { ok: blocked.length === 0, results, blocked, notes };
}

/**
 * Run the gate over a set of artifacts, and refuse the lot if any one of them
 * fails.
 *
 * A turn writes several files and they are saved in one transaction. Letting
 * four through and refusing the fifth leaves a folder that half describes a
 * business, which is harder to explain to a founder than a clean refusal.
 */
export function runRulesOverAll(
  artifacts: readonly Artifact[],
  ctx: FounderContext,
  options: GateOptions = {},
): GateAnswer {
  if (artifacts.length === 0) {
    throw new Error(
      'The rules gate was handed no artifacts. That is a fail closed condition: an empty check is not a pass, and the turn is refused rather than saved unchecked.',
    );
  }
  const answers = artifacts.map((a) => runRules(a, ctx, options));
  return {
    ok: answers.every((a) => a.ok),
    results: answers.flatMap((a) => a.results),
    blocked: answers.flatMap((a) => a.blocked),
    notes: answers.flatMap((a) => a.notes),
  };
}

/**
 * One founder-facing paragraph explaining a refusal.
 *
 * Built here rather than in the screen so that every surface says the same
 * thing, and so the wording can be run through the house style rules by the
 * test in this folder.
 */
export function explainRefusal(answer: GateAnswer): string {
  if (answer.ok) return 'Nothing was held back.';
  const first = answer.blocked[0];
  if (first === undefined) return 'Nothing was held back.';
  const others = answer.blocked.length - 1;
  const tail =
    others === 0 ? '' : others === 1 ? ' There is one more like it.' : ` There are ${others} more like it.`;
  return `${first.message} ${first.why}${tail}`;
}

/* -------------------------------------------------------------------------- */
/* Rule 1 on the way out                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Where `ge snapshot` puts a copy of a file before it is overwritten, and how it
 * names one.
 *
 * `schemas/state.md` fixes the shape: the path inside `growth-engine/` with each
 * `/` written as two underscores, then a dot, then the time in UTC, then `-002`
 * on the end when two copies land in the same second. So
 * `.state/snapshots/people__sam-example-com.md.20260915T085501Z` is a copy of
 * `people/sam-example-com.md`.
 *
 * Reading the original name back out is the whole reason this is here. Without
 * it a b2c founder's snapshots folder is a way for `outreach-sequence.md` to
 * walk past the filter with a timestamp on the end.
 */
const SNAPSHOT_FOLDER = '.state/snapshots/';
const SNAPSHOT_STAMP = /\.\d{8}T\d{6}Z(?:-\d{3})?$/;

function fileBehind(path: string): string {
  if (!path.startsWith(SNAPSHOT_FOLDER)) return path;
  return path.slice(SNAPSHOT_FOLDER.length).replace(SNAPSHOT_STAMP, '').replace(/__/g, '/');
}

/**
 * The gates.md row that decides who may see a path, or undefined when no row
 * covers it.
 *
 * Two kinds of row match. `founder-brain.md` names one file. `people/` names a
 * folder, and every file under it takes that row, which is how one line in the
 * table covers 25 to 35 prospect files.
 */
function rowFor(rows: readonly GateFileRow[], path: string): GateFileRow | undefined {
  const name = fileBehind(path);
  return (
    rows.find((r) => r.file === name) ??
    rows.find((r) => r.file.endsWith('/') && name.startsWith(r.file))
  );
}

/**
 * Rule 1 on the way out: a test of whether this founder may be shown this file.
 *
 * WHY IT EXISTS. `ge index` forks on the Track line, so in the ordinary case a
 * founder's folder does not hold the other track's files at all. That makes this
 * the second line of defence rather than the first, and it is the one that holds
 * when the first is wrong. A b2b founder whose folder somehow carries
 * `dm-openers.md` gets a missing row, not the other track's material on their
 * screen on the Saturday of the event.
 *
 * WHAT IT REFUSES, and only this: a file gates.md marks as belonging to the
 * track this founder is not on. Everything else passes, `voice-samples/`,
 * `.state/`, and anything gates.md does not list. That is deliberate and it is
 * rule 4 winning the tie: hiding a founder's own file because no table happens
 * to name it is a worse failure than showing it, and the thing rule 1 guards
 * against is the other track's material, not an unlisted file.
 *
 * NOT KNOWN YET IS NOT A DEFAULT. The track does not exist until the Brain locks
 * it, and a founder can open their files before that happens. Until it is known,
 * only files belonging to both tracks are shown, because guessing a track to
 * have something to show would fork half the cohort the wrong way.
 *
 * `visiblePaths` is the authority on which rows this track may see, so the rule
 * and the screen cannot disagree about what rule 1 covers. The set is built once
 * and handed back as a test, because the caller runs it over every row of a list
 * and over every file of a download.
 *
 * CALLED BY: routes/files.ts.
 * READS:     `schemas/gates.md`, through gates-source.ts and ownership.ts.
 */
export function fileFilterFor(track: Track | null): (path: string) => boolean {
  const allowed = new Set(visiblePaths(track));
  const rows = gatesSource().files;
  return (path: string): boolean => {
    const row = rowFor(rows, path);
    return row === undefined || allowed.has(row.file);
  };
}

export * from './types.ts';
export { checkProse, checkProseText } from './prose.ts';
export { checkTrack, TRACK_TERMS } from './track.ts';
export {
  checkNoDmAutomation,
  DENIED_SOURCE_TOKENS,
  repositoryRoot,
  RULE_2,
  scannedFiles,
  scanSourceTree,
  sourceScanFailure,
} from './no-dm-automation.ts';
export { checkNoInventedProof, groundedValues, readNumbers } from './no-invented-proof.ts';
export { checkOwnership, visiblePaths } from './ownership.ts';
export {
  checkAllGates,
  checkGate,
  checkGateAsRule,
  type FolderState,
  type GateName,
  type GateReport,
} from './gate.ts';
export { gatesSource, trackForFile, gateLabelForFile } from './gates-source.ts';
