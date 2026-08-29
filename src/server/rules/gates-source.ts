/**
 * gates-source.ts: reads `schemas/gates.md` out of the content repo and turns
 *   it into data.
 *
 * WHY IT EXISTS: gates.md says of itself that it is one source, "so the label a
 *   founder sees in their index and the list a mentor checks against cannot say
 *   two different things". `ge index` already reads it. If the app held its own
 *   copy of which files count towards which gate, and of which track sees which
 *   file, there would be three answers to the same question and a mentor would
 *   be marking against one of them at nine in the morning on the Saturday.
 *
 *   Two rules in this folder need it. track.ts needs the track column, because
 *   that column is rule 1 written down. gate.ts needs the item lists.
 *
 *   It fails closed everywhere. An unknown gate label, an unknown track value
 *   or a missing table throws and names the row, because a gate that silently
 *   drops a row reads to a founder as "you have not done that", and gates.md
 *   says in as many words that a dropped row is not true.
 *
 * CALLED BY: track.ts, gate.ts, and their tests.
 * READS:     `plugins/growth-engine/schemas/gates.md` from the content repo.
 * WRITES:    nothing.
 */

import { readContentFile } from './content-root.ts';

export const GATES_MD_PATH = 'plugins/growth-engine/schemas/gates.md';

/** The labels gates.md allows in the gate column. `-` means no gate counts it. */
export type GateLabel = 'gate A' | 'gate B' | 'gate C' | 'gate B or C' | '-';

const GATE_LABELS: readonly GateLabel[] = ['gate A', 'gate B', 'gate C', 'gate B or C', '-'];

/** Which track sees a row. `both` means every founder. */
export type GateTrack = 'both' | 'b2b' | 'b2c';

const GATE_TRACKS: readonly GateTrack[] = ['both', 'b2b', 'b2c'];

export interface GateFileRow {
  /** The file name as it sits inside `growth-engine/`. */
  file: string;
  gate: GateLabel;
  track: GateTrack;
  /** Free text. `1`, `2`, `3`, `any`, `the weekend` and so on. */
  session: string;
}

/**
 * How an item is proved.
 *
 * `file-backed` and `self-reported` are the two gates.md names. The third is
 * the B2C send row, which gates.md marks "see below" and then describes: the
 * file can prove it, and when it does not the founder is asked and the answer
 * is recorded as an answer.
 */
export type ProvedBy = 'file-backed' | 'self-reported' | 'file-backed-or-asked';

export interface GateItem {
  gate: 'A' | 'B' | 'C';
  /** `both` for gates A and B. Gate C has one list per track. */
  track: GateTrack;
  /** The item as gates.md words it. Shown to the founder unchanged. */
  item: string;
  provedBy: ProvedBy;
  /** The file or folder that proves it, as gates.md words it. */
  whichFile: string;
}

export interface GatesSource {
  files: GateFileRow[];
  items: GateItem[];
}

interface Table {
  headers: string[];
  rows: string[][];
  /** 1 based line of the header row. */
  line: number;
}

function fail(message: string): never {
  throw new Error(
    `${GATES_MD_PATH}: ${message}\nThe rules gate refuses to run rather than mark a founder against a list it guessed at.\nFix: correct the table in the content repo, then run the content repo's own test suite.`,
  );
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined);
  return inner.split('|').map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|?\s*$/.test(line.trim()) && line.includes('-');
}

/** Every markdown table in the document, in order. */
function tables(markdown: string): Table[] {
  const lines = markdown.split('\n');
  const found: Table[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim().startsWith('|')) continue;
    const next = lines[i + 1] ?? '';
    if (!isSeparator(next)) continue;

    const headers = splitRow(line);
    const rows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && (lines[j] ?? '').trim().startsWith('|')) {
      rows.push(splitRow(lines[j] ?? ''));
      j += 1;
    }
    found.push({ headers, rows, line: i + 1 });
    i = j - 1;
  }
  return found;
}

function headersAre(table: Table, expected: string[]): boolean {
  if (table.headers.length !== expected.length) return false;
  return table.headers.every((h, i) => h.toLowerCase() === expected[i]);
}

function parseFileTable(all: Table[]): GateFileRow[] {
  const table = all.find((t) => headersAre(t, ['file', 'gate', 'track', 'session']));
  if (!table) fail('the file, gate, track, session table is missing');

  const rows: GateFileRow[] = [];
  const seen = new Set<string>();
  for (const cells of table.rows) {
    const [file, gate, track, session] = cells;
    if (file === undefined || gate === undefined || track === undefined) {
      fail(`a row in the file table has fewer than four cells: ${cells.join(' | ')}`);
    }
    if (!GATE_LABELS.includes(gate as GateLabel)) {
      fail(`row "${file}" has gate label "${gate}", which is not one of ${GATE_LABELS.join(', ')}`);
    }
    if (!GATE_TRACKS.includes(track as GateTrack)) {
      fail(`row "${file}" has track "${track}", which is not one of ${GATE_TRACKS.join(', ')}`);
    }
    // First match wins, exactly as ge index reads it.
    if (seen.has(file)) continue;
    seen.add(file);
    rows.push({
      file,
      gate: gate as GateLabel,
      track: track as GateTrack,
      session: session ?? '',
    });
  }
  if (rows.length === 0) fail('the file table has no rows');

  // gates.md states the hazard itself: the lookup takes the first row whose
  // first cell matches the file name, so a table earlier in the document that
  // opens a row with a file name would be found first and would answer with the
  // wrong label. Check for it here rather than trusting the instruction.
  const names = new Set(rows.map((r) => r.file));
  for (const earlier of all) {
    if (earlier === table) break;
    for (const cells of earlier.rows) {
      const first = cells[0];
      if (first !== undefined && names.has(first)) {
        fail(
          `the table at line ${earlier.line} opens a row with "${first}", which is also a file name in the gate table below it. The lookup takes the first match, so that row would decide the label a founder sees`,
        );
      }
    }
  }

  return rows;
}

const ITEM_TABLE_HEADERS = ['item', 'proved by', 'which file'];

/** Headings that introduce a gate's item list, and what they mean. */
const ITEM_SECTIONS: ReadonlyArray<{ heading: RegExp; gate: 'A' | 'B' | 'C'; track: GateTrack }> = [
  { heading: /^##\s+Gate A\b/i, gate: 'A', track: 'both' },
  { heading: /^##\s+Gate B\b/i, gate: 'B', track: 'both' },
  { heading: /^##\s+Gate C\b.*\bB2B\b/i, gate: 'C', track: 'b2b' },
  { heading: /^##\s+Gate C\b.*\bB2C\b/i, gate: 'C', track: 'b2c' },
];

function parseProvedBy(raw: string, item: string): ProvedBy {
  const value = raw.toLowerCase().trim();
  if (value === 'file-backed') return 'file-backed';
  if (value === 'self-reported') return 'self-reported';
  if (value === 'see below') return 'file-backed-or-asked';
  return fail(
    `item "${item}" is proved by "${raw}". gates.md allows file-backed, self-reported, or see below, and says there is no third category`,
  );
}

function parseItems(markdown: string, all: Table[]): GateItem[] {
  const lines = markdown.split('\n');
  const items: GateItem[] = [];

  for (const section of ITEM_SECTIONS) {
    const headingIndex = lines.findIndex((l) => section.heading.test(l));
    if (headingIndex === -1) {
      fail(`the heading for gate ${section.gate} on track ${section.track} is missing`);
    }
    const headingLine = headingIndex + 1;
    const table = all.find(
      (t) => t.line > headingLine && headersAre(t, ITEM_TABLE_HEADERS),
    );
    if (!table) {
      fail(`gate ${section.gate} on track ${section.track} has no item, proved by, which file table`);
    }
    for (const cells of table.rows) {
      const [item, provedBy, whichFile] = cells;
      if (item === undefined || provedBy === undefined) {
        fail(`a row under gate ${section.gate} has fewer than three cells: ${cells.join(' | ')}`);
      }
      items.push({
        gate: section.gate,
        track: section.track,
        item,
        provedBy: parseProvedBy(provedBy, item),
        whichFile: whichFile ?? '',
      });
    }
  }

  if (items.length === 0) fail('no gate items were found');
  return items;
}

let cached: GatesSource | null = null;

/** The whole of gates.md as data, parsed once per process. */
export function gatesSource(): GatesSource {
  if (cached !== null) return cached;
  const markdown = readContentFile(GATES_MD_PATH);
  const all = tables(markdown);
  cached = { files: parseFileTable(all), items: parseItems(markdown, all) };
  return cached;
}

/**
 * Which track may see a file, according to gates.md.
 *
 * Returns null for a file gates.md does not list, and the caller decides. This
 * is deliberate: gates.md is the list of gate-counting files, not the list of
 * every file that may exist, and treating an unlisted file as forbidden here
 * would refuse `memory.md` on a technicality.
 */
export function trackForFile(file: string): GateTrack | null {
  return gatesSource().files.find((r) => r.file === file)?.track ?? null;
}

/** The gate label `ge index` prints for a file, or null when it lists none. */
export function gateLabelForFile(file: string): GateLabel | null {
  return gatesSource().files.find((r) => r.file === file)?.gate ?? null;
}

/** Only for tests. */
export function resetGatesCacheForTests(): void {
  cached = null;
}
