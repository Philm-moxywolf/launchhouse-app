/**
 * gate.ts: the three gates, one after each of the three sessions.
 *
 * WHY IT EXISTS: gates.md says why the gates exist in one line, and it is the
 *   whole reason this file is careful: "They exist so that nobody arrives in
 *   Atlanta unable to build." A founder who is told they have passed gate B and
 *   then finds on the Friday that their thirty pieces were never approved has
 *   been failed by the thing that was supposed to catch it.
 *
 *   So the two rules gates.md states are structural here, not advisory.
 *
 *   One. "Never mark something done because the founder says it is done, when a
 *   file could have proved it." A file-backed item ignores what anybody says. It
 *   reads the file. A self-reported answer cannot reach a file-backed item, and
 *   the types are what stop it.
 *
 *   Two. "A file it cannot read is reported, never dropped." A dropped row reads
 *   to a founder as "you have not done that", and it is not true. Every item on
 *   the list appears in the report, with a state, including the ones nothing
 *   could be found for.
 *
 *   The item lists are not written here. They are read out of gates.md, so the
 *   label a founder sees in their index, the list a mentor checks against and
 *   this report cannot say three different things.
 *
 * WHAT IT NEVER DOES
 *   It never counts replies. gates.md says so of the B2B list, in as many
 *   words: "This is not a volume machine, and nothing anywhere counts replies."
 *   It never names a person. People reach this file as counts by status, which
 *   is what a mentor needs and all a mentor gets.
 *
 * CALLED BY: the gate screen, the status skill's surface, the mentor board.
 * READS:     `schemas/gates.md`, through gates-source.ts.
 * WRITES:    nothing. Recording a self-reported answer is the caller's job.
 */

import { gatesSource, type GateItem, type ProvedBy } from './gates-source.ts';
import {
  resultFrom,
  type Recovery,
  type RuleResult,
  type Track,
  type Violation,
} from './types.ts';

const RULE = 'gate' as const;

export type GateName = 'A' | 'B' | 'C';

/** What the app knows about one file in the founder's folder. */
export interface FileState {
  exists: boolean;
  /** Size in bytes. */
  bytes: number;
  /**
   * Bytes that are not whitespace.
   *
   * `schemas/index.md` defines `empty` as "the file exists and holds nothing
   * but blank lines, which is what a founder means when they say the file is
   * there but there is nothing in it". Without this, a file holding one newline
   * would pass a gate.
   */
  contentBytes: number;
  /**
   * The file itself, when the caller has it.
   *
   * Four of gate A's five items point at the same file and name a different
   * line or section of it. Without the text, all four would answer "the Brain
   * exists" and a founder with a Brain and no Voice section would be told the
   * voice is captured.
   */
  text?: string;
}

/**
 * What the app knows about the folder, with nothing personal in it.
 *
 * Counts, never names. This shape is what a mentor is allowed to be handed, so
 * making it the only input means a mentor view cannot accidentally be given
 * more.
 */
export interface FolderState {
  track: Track | null;
  /** Keyed on the file name as gates.md writes it. */
  files: Record<string, FileState>;
  /** How many people are at each status. From `ge person list`. */
  peopleByStatus: Record<string, number>;
  /** How many ledger rows are at `approved`. */
  approvedPieces: number;
  /** How many people have an opener written. */
  openersWritten: number;
  /**
   * Answers to self-reported items, keyed on the item text as gates.md words
   * it. Recorded as an answer, never as evidence.
   */
  selfReported?: Record<string, boolean>;
}

/**
 * How an item came out.
 *
 * `nearly-empty` is its own state because gates.md asks for it by name: "If a
 * file exists but is nearly empty, say so." Rolling it into `not-done` would
 * send a founder to write a file they have already started.
 */
export type ItemState =
  | 'done'
  | 'not-done'
  | 'nearly-empty'
  | 'answered-yes'
  | 'answered-no'
  | 'unanswered';

export interface GateItemReport {
  gate: GateName;
  /** The item, worded as gates.md words it. */
  item: string;
  provedBy: ProvedBy;
  /** The file or folder gates.md points at. */
  whichFile: string;
  state: ItemState;
  /** True only when a file proved it. Never true from an answer. */
  fileBacked: boolean;
  /** What was actually found, in plain words. */
  evidence: string;
  recovery: Recovery;
}

export interface GateReport {
  gate: GateName;
  track: Track;
  /** Every item, in the order gates.md lists them. Nothing is ever dropped. */
  items: GateItemReport[];
  /** True when every file-backed item is done. Answers do not decide this. */
  filesComplete: boolean;
  /** Items still waiting on an answer from the founder. */
  awaitingAnswer: string[];
  /**
   * The one line a founder reads first.
   *
   * Written here rather than in the screen so the wording cannot promise
   * something the report does not hold.
   */
  headline: string;
}

/** Bytes below which a file exists but has not really been written. */
const NEARLY_EMPTY = 40;

/** Where a founder goes to finish each gate's work. */
const GATE_ROUTE: Record<GateName, Recovery> = {
  A: { label: 'Finish your Founder Brain', action: { kind: 'route', skill: 'founder-brain' } },
  B: { label: 'Open the content engine', action: { kind: 'route', skill: 'content-engine' } },
  C: { label: 'See what is left', action: { kind: 'route', skill: 'status' } },
};

const ANSWER: Recovery = { label: 'Answer that one here', action: { kind: 'reply' } };

/** The file gates.md points an item at, taken off the front of its cell. */
function fileNamed(whichFile: string): string | null {
  const first = whichFile.split(',')[0]?.trim() ?? '';
  if (first === '' || first.startsWith('nothing') || first.startsWith('the ')) return null;
  return first;
}

function stateOf(file: FileState | undefined): ItemState {
  if (file === undefined || !file.exists) return 'not-done';
  if (file.contentBytes === 0) return 'not-done';
  if (file.contentBytes < NEARLY_EMPTY) return 'nearly-empty';
  return 'done';
}

/**
 * "founder-brain.md, its Locked line" and "founder-brain.md, its Voice
 * section". gates.md names the part of the file that proves the item, and four
 * of gate A's five items rely on it.
 */
const WITHIN_FILE = /,\s*its\s+([A-Za-z][A-Za-z ]*?)\s+(line|section)\s*$/i;

/** A labelled line in the header block, per `schemas/brain.md`. */
function headerValue(text: string, label: string): string | null {
  const header = text.split(/^## /m)[0] ?? '';
  const pattern = new RegExp(`^[-*\\s]*\\**\\s*${label}\\s*\\**\\s*:\\s*(.+)$`, 'im');
  const match = pattern.exec(header);
  const value = match?.[1]?.replace(/\*/g, '').trim();
  return value === undefined || value === '' ? null : value;
}

/**
 * A `## ` section's content. `schemas/brain.md`: "The heading only has to start
 * with that word, so `## Goal, next 90 days` counts as `Goal`."
 */
function sectionBody(text: string, heading: string): string | null {
  // Walked line by line rather than matched with one regular expression. The
  // one line version needed an "end of section or end of document" lookahead,
  // and under the multiline flag that lookahead matched the blank line every
  // one of these sections opens with, so every section came back empty.
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opens = new RegExp(`^##\\s+${escaped}\\b`, 'i');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => opens.test(l));
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i] ?? '')) break;
    body.push(lines[i] ?? '');
  }
  const joined = body.join('\n').trim();
  return joined === '' ? null : joined;
}

function checkPartOfFile(
  file: FileState | undefined,
  part: string,
  kind: string,
  name: string,
): { state: ItemState; evidence: string } {
  if (file === undefined || !file.exists) {
    return { state: 'not-done', evidence: `${name} is not there yet.` };
  }
  if (file.text === undefined) {
    // gates.md: a file it cannot read is reported, never dropped.
    return {
      state: 'unanswered',
      evidence: `${name} is there, but its ${part} ${kind} could not be read from here.`,
    };
  }
  const found =
    kind.toLowerCase() === 'line'
      ? headerValue(file.text, part)
      : sectionBody(file.text, part);

  if (found === null) {
    return { state: 'not-done', evidence: `${name} has no ${part} ${kind} in it yet.` };
  }
  if (found.length < NEARLY_EMPTY && kind.toLowerCase() === 'section') {
    return { state: 'nearly-empty', evidence: `The ${part} section is there but very short.` };
  }
  return { state: 'done', evidence: `${name} has a ${part} ${kind}: ${found.slice(0, 60)}` };
}

/**
 * The items a file cannot answer on its own, and what does answer them.
 *
 * Keyed on the words gates.md uses, so a reworded item stops matching here and
 * falls through to the plain file check rather than silently reading the wrong
 * count. A wrong count is worse than a missing one.
 */
function countBacked(item: GateItem, folder: FolderState): { state: ItemState; evidence: string } | null {
  const text = item.item.toLowerCase();

  if (text.includes('read and approved')) {
    const n = folder.approvedPieces;
    return {
      state: n >= 30 ? 'done' : n > 0 ? 'nearly-empty' : 'not-done',
      evidence: `${n} of 30 pieces approved in your ledger.`,
    };
  }

  if (text.includes('the list is built')) {
    const n = folder.peopleByStatus['candidate'] ?? 0;
    const total = Object.values(folder.peopleByStatus).reduce((a, b) => a + b, 0);
    return {
      state: total >= 25 ? 'done' : total > 0 ? 'nearly-empty' : 'not-done',
      evidence: `${total} people on your list, ${n} of them still to work through.`,
    };
  }

  if (text.includes('openers are written')) {
    const n = folder.openersWritten;
    return {
      state: n >= 25 ? 'done' : n > 0 ? 'nearly-empty' : 'not-done',
      evidence: `${n} of 25 openers written.`,
    };
  }

  if (text.includes('messages have been sent')) {
    const sent = folder.peopleByStatus['sent'] ?? 0;
    if (sent > 0) {
      return { state: sent >= 25 ? 'done' : 'nearly-empty', evidence: `${sent} of 25 recorded as sent.` };
    }
    // gates.md: when nothing is at sent, the gate asks, records the answer,
    // passes on the answer, and prints the one command that would have proved
    // it. There is no command line here, so it becomes a question in the chat.
    return { state: 'unanswered', evidence: 'Nothing is recorded as sent yet.' };
  }

  return null;
}

function reportItem(item: GateItem, folder: FolderState): GateItemReport {
  const base = {
    gate: item.gate,
    item: item.item,
    provedBy: item.provedBy,
    whichFile: item.whichFile,
  };

  if (item.provedBy === 'self-reported') {
    const answer = folder.selfReported?.[item.item];
    return {
      ...base,
      state: answer === undefined ? 'unanswered' : answer ? 'answered-yes' : 'answered-no',
      fileBacked: false,
      evidence:
        answer === undefined
          ? 'Nothing in your folder can show this, so it is a question rather than a check.'
          : `You said ${answer ? 'yes' : 'no'}. Recorded as your answer, not as evidence.`,
      recovery: ANSWER,
    };
  }

  const counted = countBacked(item, folder);
  if (counted !== null) {
    return {
      ...base,
      state: counted.state,
      fileBacked: counted.state === 'done' || counted.state === 'nearly-empty',
      evidence: counted.evidence,
      recovery: counted.state === 'unanswered' ? ANSWER : GATE_ROUTE[item.gate],
    };
  }

  const name = fileNamed(item.whichFile);
  const within = WITHIN_FILE.exec(item.whichFile);
  if (name !== null && within !== null) {
    const part = within[1] ?? '';
    const kind = within[2] ?? 'line';
    const answer = checkPartOfFile(folder.files[name], part, kind, name);
    return {
      ...base,
      state: answer.state,
      fileBacked: answer.state === 'done',
      evidence: answer.evidence,
      recovery: GATE_ROUTE[item.gate],
    };
  }

  if (name === null) {
    // gates.md points at no file this code can read. Reported, never dropped.
    return {
      ...base,
      state: 'unanswered',
      fileBacked: false,
      evidence: `gates.md points this at "${item.whichFile}", which nothing here can read. It is being shown rather than dropped.`,
      recovery: ANSWER,
    };
  }

  const file = folder.files[name];
  const state = stateOf(file);
  return {
    ...base,
    state,
    fileBacked: state === 'done',
    evidence:
      state === 'done'
        ? `${name} is there, ${file?.bytes ?? 0} bytes.`
        : state === 'nearly-empty'
          ? `${name} is there but nearly empty, ${file?.contentBytes ?? 0} bytes of content.`
          : `${name} is not there yet.`,
    recovery: GATE_ROUTE[item.gate],
  };
}

/** Build the report for one gate, on one track. */
export function checkGate(gate: GateName, folder: FolderState): GateReport {
  const track = folder.track;
  if (track === null) {
    throw new Error(
      'A gate cannot be checked before a track is chosen. The Brain is what chooses it, and gate A is what checks the Brain.',
    );
  }

  const items = gatesSource()
    .items.filter((i) => i.gate === gate && (i.track === 'both' || i.track === track))
    .map((i) => reportItem(i, folder));

  const fileItems = items.filter((i) => i.provedBy !== 'self-reported');
  const filesComplete = fileItems.every((i) => i.state === 'done');
  const awaitingAnswer = items.filter((i) => i.state === 'unanswered').map((i) => i.item);
  const doneCount = fileItems.filter((i) => i.state === 'done').length;

  const headline = filesComplete
    ? `Gate ${gate}: everything a file can show is there.`
    : `Gate ${gate}: ${doneCount} of ${fileItems.length} checked against your files. Here is what is left.`;

  return { gate, track, items, filesComplete, awaitingAnswer, headline };
}

/** All three gates at once, for the status screen and the mentor board. */
export function checkAllGates(folder: FolderState): GateReport[] {
  return (['A', 'B', 'C'] as const).map((g) => checkGate(g, folder));
}

/**
 * The gate report as a rule result, so the gate sits in the same gate runner as
 * the other five rules and a founder gets one shape back from all of them.
 *
 * A gate item that is not done is a `warn`, never a `block`. The distinction
 * matters: a founder who has not finished gate B is behind, not wrong, and
 * blocking them would stop the very work that would fix it.
 */
export function checkGateAsRule(gate: GateName, folder: FolderState): RuleResult {
  const report = checkGate(gate, folder);
  const violations: Violation[] = report.items
    .filter((i) => i.state !== 'done' && i.state !== 'answered-yes')
    .map((i) => ({
      rule: RULE,
      code: `gate.${gate}.${i.state}`,
      severity: 'warn' as const,
      where: { path: fileNamed(i.whichFile) ?? '.state/index.md', line: 1, column: 1, excerpt: i.item },
      found: i.item,
      message: `Gate ${gate}: ${i.item}. ${i.evidence}`,
      why: 'The gates exist so nobody arrives in Atlanta unable to build. They check your files rather than take your word, because a file is something you can point at on the day.',
      recovery: i.recovery,
    }));

  return resultFrom(RULE, [`gate ${gate}`], violations, [report.headline]);
}
