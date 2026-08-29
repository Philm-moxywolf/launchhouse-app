/**
 * app/content/gen-gates.ts
 *
 * WHAT IT IS
 * The generator that writes `app/content/gates.ts` from `app/content/gates.md`.
 *
 * WHY IT EXISTS
 * The app needs the gate tables as typed data, and the schema needs to stay the
 * one source. Generating removes the failure where somebody edits the markdown,
 * forgets the TypeScript, and the gates screen shows a list nobody agreed to.
 * `app/tests/gates.test.ts` re-parses the markdown and compares, so the two
 * cannot disagree even if this generator is never run again.
 *
 * WHAT CALLS IT
 * A person, or a build step:
 *   npx tsx app/content/gen-gates.ts
 *
 * WHAT IT READS
 * `app/content/gates.md`.
 *
 * WHAT IT WRITES
 * `app/content/gates.ts`, overwritten whole.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { GATES_MD_PATH, parseGatesMarkdown } from "./gates-parse.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "gates.ts");

const markdown = readFileSync(GATES_MD_PATH, "utf8");
const parsed = parseGatesMarkdown(markdown);
const sha = createHash("sha256").update(markdown, "utf8").digest("hex");

const j = (v: unknown): string => JSON.stringify(v);

const fileRows = parsed.files
  .map(
    (r) =>
      `  { file: ${j(r.file)}, gateLabel: ${j(r.gateLabel)}, gates: ${j(r.gates)}, ` +
      `track: ${j(r.track)}, session: ${j(r.session)} },`,
  )
  .join("\n");

const gateBlocks = parsed.gates
  .map((g) => {
    const items = g.items
      .map((i) => `      { item: ${j(i.item)}, provedBy: ${j(i.provedBy)}, which: ${j(i.which)} },`)
      .join("\n");
    return [
      `  {`,
      `    id: ${j(g.id)},`,
      `    track: ${j(g.track)},`,
      `    heading: ${j(g.heading)},`,
      `    items: [`,
      items,
      `    ],`,
      `  },`,
    ].join("\n");
  })
  .join("\n");

const out = `/**
 * app/content/gates.ts
 *
 * GENERATED FROM app/content/gates.md. DO NOT EDIT BY HAND.
 * Regenerate with: npx tsx app/content/gen-gates.ts
 *
 * WHAT IT IS
 * The three gates and the file table, as typed data.
 *
 * WHY IT EXISTS
 * The gates screen, the status skill's checklist and a mentor's list all have
 * to say the same thing. \`schemas/gates.md\` is the one source and \`ge index\`
 * reads it directly. This is that same file, parsed, so the app reads the same
 * answers rather than a second copy somebody typed. \`app/tests/gates.test.ts\`
 * re-parses the markdown and fails if this file has drifted from it.
 *
 * WHAT CALLS IT
 * The gates screen, the run context header, and anything that needs to know
 * which gate a file counts towards.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is data.
 */

import type { Gate, GateFileRow, GateId, GateTrack, ProvedBy } from "./gates-parse.ts";

export type { Gate, GateFileRow, GateId, GateTrack, ProvedBy };

/** sha256 of the gates.md this was generated from. The test recomputes it. */
export const GATES_MD_SHA256 = ${j(sha)};

/** The table \`ge index\` reads, in its own order. */
export const GATE_FILES: readonly GateFileRow[] = [
${fileRows}
];

/** The three gates. Gate C has one list per track. */
export const GATES: readonly Gate[] = [
${gateBlocks}
];

/**
 * What "real content" means for a file-backed item is NOT DECIDED.
 *
 * \`gates.md:68\` requires that a file which exists but is nearly empty is
 * called out, and sets no threshold. \`REPLIT-BUILD.md\` section 9 records this
 * as open item E5: the floor is to be defined per file from the two example
 * brains, before the first gate runs against 130 people.
 *
 * It is null on purpose. A guessed byte count would either pass an empty
 * founder-brain.md at gate A or fail an honest short one, and both of those
 * are worse than the screen saying the check is not written yet.
 */
export const EMPTINESS_FLOOR_BYTES: Readonly<Record<string, number>> = {};
export const EMPTINESS_FLOOR_PENDING = true;

/** The gate lists that apply to a founder on this track. */
export function gatesForTrack(track: "b2b" | "b2c"): readonly Gate[] {
  return GATES.filter((g) => g.track === "both" || g.track === track);
}

/** The file rows a founder on this track sees. Never the other track's rows. */
export function gateFilesForTrack(track: "b2b" | "b2c"): readonly GateFileRow[] {
  return GATE_FILES.filter((f) => f.track === "both" || f.track === track);
}

/** Which gates a file counts towards. Empty means real work that no gate counts. */
export function gatesForFile(file: string): readonly GateId[] {
  return GATE_FILES.find((f) => f.file === file)?.gates ?? [];
}
`;

writeFileSync(OUT, out, "utf8");
process.stdout.write(`wrote ${OUT}\n  ${parsed.files.length} file rows, ${parsed.gates.length} gate lists\n`);
