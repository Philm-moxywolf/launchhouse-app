/**
 * app/content/gates-parse.ts
 *
 * WHAT IT IS
 * The parser that turns `app/content/gates.md` into data.
 *
 * WHY IT EXISTS
 * `gates.md` is a byte-for-byte copy of `plugins/growth-engine/schemas/gates.md`,
 * which is the one source for which gate each file counts towards and what each
 * gate asks for. `ge index` reads the markdown. The app needs the same answers
 * as typed data. Retyping them would create a second source, and the whole
 * point of that schema is that "the label a founder sees in their index and the
 * list a mentor checks against cannot say two different things". So the app
 * parses the same file, and `gates.ts` is generated from this parser rather
 * than written.
 *
 * WHAT CALLS IT
 * `app/content/gen-gates.ts` at build time, and `app/tests/gates.test.ts`,
 * which re-parses and compares against the generated file. Nothing at runtime:
 * the runtime imports `gates.ts`.
 *
 * WHAT IT READS
 * `app/content/gates.md`, and nothing else.
 *
 * WHAT IT WRITES
 * Nothing.
 *
 * THE TWO RULES THE SCHEMA ITSELF STATES, ENCODED HERE
 * The lookup takes the first row whose first cell matches the file name, so the
 * file table must be read first and no later table may be read as a file row.
 * This parser therefore reads the file table only from the section that
 * declares it, and reads gate items only from the four gate sections, by
 * heading. It never scans the whole document for pipes.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const GATES_MD_PATH = join(dirname(fileURLToPath(import.meta.url)), "gates.md");

export type GateId = "A" | "B" | "C";
export type GateTrack = "b2b" | "b2c" | "both";

/** One row of the table `ge index` reads. */
export interface GateFileRow {
  /** The file name exactly as it is written in the table's first cell. */
  readonly file: string;
  /** The gate label, word for word, because `ge index` prints this cell verbatim. */
  readonly gateLabel: string;
  /** The gates the label names. Empty when the label is a dash: real work, no gate counts it. */
  readonly gates: readonly GateId[];
  readonly track: GateTrack;
  /** The session cell, verbatim. Free text, so it stays a string. */
  readonly session: string;
}

/**
 * How an item is proved.
 *
 * The schema says there are two ways and no third category. There are three in
 * the table: the B2C send row reads `see below`, and the prose under it
 * explains that recording a send with `ge person touch` is what turns it into
 * evidence, and that when nothing is at `status: sent` the gate asks and
 * records the answer. That is a real inconsistency in the source. This parser
 * does not smooth it over, because smoothing it over would mean the app
 * deciding for itself what counts as proof at a gate that 130 people pass
 * through.
 */
export type ProvedBy = "file-backed" | "self-reported" | "see below";

export interface GateItem {
  readonly item: string;
  readonly provedBy: ProvedBy;
  /** The evidence cell, verbatim. A file name, a folder, or a phrase. */
  readonly which: string;
}

export interface Gate {
  readonly id: GateId;
  /** Which track this list is for. Gate C has one list per track. */
  readonly track: GateTrack;
  /** The heading, verbatim, so a screen can print what the schema calls it. */
  readonly heading: string;
  readonly items: readonly GateItem[];
}

export interface ParsedGates {
  readonly files: readonly GateFileRow[];
  readonly gates: readonly Gate[];
}

/** The four gate sections, by their exact headings in gates.md. */
const GATE_SECTIONS: readonly { heading: string; id: GateId; track: GateTrack }[] = [
  { heading: "## Gate A, after session 1", id: "A", track: "both" },
  { heading: "## Gate B, after session 2", id: "B", track: "both" },
  { heading: "## Gate C, after session 3, B2B", id: "C", track: "b2b" },
  { heading: "## Gate C, after session 3, B2C", id: "C", track: "b2c" },
];

const FILE_TABLE_SECTION = "## The table `ge index` reads";

/**
 * Read one cell, or refuse.
 *
 * A row with a missing cell is a malformed table, and guessing at it would put
 * `undefined` into a gate label 130 people are checked against. The row count
 * is validated separately; this is the guard that makes the compiler agree.
 */
function cell(row: readonly string[], i: number, where: string): string {
  const value = row[i];
  if (value === undefined) {
    throw new Error(`gates.md: ${where} is missing cell ${i + 1}: ${row.join(" | ")}`);
  }
  return value;
}

function cells(line: string): string[] {
  // A markdown row is `| a | b | c |`. Splitting on the pipe leaves an empty
  // cell at each end, which is dropped rather than trimmed away silently.
  const parts = line.split("|");
  if (parts.length < 3) return [];
  return parts.slice(1, -1).map((c) => c.trim());
}

/**
 * A markdown separator row, `|---|---|`.
 *
 * Every cell has to be three or more dashes. Two or fewer would also match the
 * lone `-` in the gate column of the file table, which means "real work, no
 * gate counts it", and swallowing that row would silently drop four files off
 * the index.
 */
function isSeparator(line: string): boolean {
  const c = cells(line);
  return c.length > 0 && c.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * Read the one table that follows a heading.
 *
 * Stops at the next heading, so a table in a later section can never be read
 * as part of an earlier one. That is the schema's own rule about the lookup
 * taking the first matching row, enforced structurally instead of by ordering
 * luck.
 */
function tableAfter(lines: readonly string[], heading: string): string[][] {
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`gates.md has no section headed ${heading}`);

  const rows: string[][] = [];
  let seenHeader = false;

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (!line.trim().startsWith("|")) {
      // A blank line or prose between the heading and the table is fine. A
      // blank line after the table has started means the table has ended.
      if (rows.length > 0 || seenHeader) {
        if (line.trim() === "") continue;
      }
      continue;
    }
    if (isSeparator(line)) continue;
    const row = cells(line);
    if (row.length === 0) continue;
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0) throw new Error(`no table rows under ${heading}`);
  return rows;
}

/**
 * `gate A` -> ["A"]. `gate B or C` -> ["B","C"]. `-` -> [].
 *
 * The letters are collected across the whole label rather than by matching
 * `gate <letter>`, because the `people/` row reads "gate B or C" and the C has
 * no `gate` in front of it. Reading only the first letter would drop the
 * people folder off gate C, which is the row that proves 25 B2C openers and 25
 * B2B prospects exist.
 */
function gatesFromLabel(label: string): GateId[] {
  if (label.trim() === "-") return [];
  if (!/\bgate\b/i.test(label)) {
    throw new Error(`gates.md: cannot read the gate label ${JSON.stringify(label)}`);
  }
  const found = [...label.matchAll(/\b([ABC])\b/g)]
    .map((m) => m[1])
    .filter((letter): letter is GateId => letter !== undefined);
  if (found.length === 0) {
    throw new Error(`gates.md: gate label ${JSON.stringify(label)} names no gate`);
  }
  return found;
}

function trackFromCell(cell: string): GateTrack {
  const t = cell.trim().toLowerCase();
  if (t === "b2b" || t === "b2c" || t === "both") return t;
  throw new Error(`gates.md: unknown track cell ${JSON.stringify(cell)}`);
}

function provedByFromCell(cell: string): ProvedBy {
  const raw = cell.trim().toLowerCase();
  if (raw === "file-backed" || raw === "self-reported" || raw === "see below") return raw;
  throw new Error(
    `gates.md: unknown "proved by" value ${JSON.stringify(cell)}. The schema allows ` +
      `file-backed and self-reported, and the B2C send row reads "see below". A fourth ` +
      `value means the app would be deciding for itself what counts as proof, so this refuses.`,
  );
}

export function parseGatesMarkdown(markdown: string): ParsedGates {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const files: GateFileRow[] = tableAfter(lines, FILE_TABLE_SECTION).map((row) => {
    if (row.length !== 4) {
      throw new Error(`gates.md file table row has ${row.length} cells, expected 4: ${row.join(" | ")}`);
    }
    const gateLabel = cell(row, 1, "a file table row");
    return {
      file: cell(row, 0, "a file table row"),
      gateLabel,
      gates: gatesFromLabel(gateLabel),
      track: trackFromCell(cell(row, 2, "a file table row")),
      session: cell(row, 3, "a file table row"),
    };
  });

  const seen = new Set<string>();
  for (const row of files) {
    if (seen.has(row.file)) {
      // The lookup takes the first matching row, so a duplicate silently
      // shadows. Refuse instead: this is exactly the failure the schema's
      // "keep the first table first" rule is written to prevent.
      throw new Error(`gates.md lists ${row.file} twice in the file table`);
    }
    seen.add(row.file);
  }

  const gates: Gate[] = GATE_SECTIONS.map((section) => ({
    id: section.id,
    track: section.track,
    heading: section.heading.replace(/^##\s+/, ""),
    items: tableAfter(lines, section.heading).map((row) => {
      if (row.length !== 3) {
        throw new Error(`gates.md gate row has ${row.length} cells, expected 3: ${row.join(" | ")}`);
      }
      return {
        item: cell(row, 0, `a ${section.heading} row`),
        provedBy: provedByFromCell(cell(row, 1, `a ${section.heading} row`)),
        which: cell(row, 2, `a ${section.heading} row`),
      };
    }),
  }));

  return { files, gates };
}

export function parseGatesFile(path: string = GATES_MD_PATH): ParsedGates {
  return parseGatesMarkdown(readFileSync(path, "utf8"));
}
