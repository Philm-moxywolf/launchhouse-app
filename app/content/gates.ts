/**
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
 * to say the same thing. `schemas/gates.md` is the one source and `ge index`
 * reads it directly. This is that same file, parsed, so the app reads the same
 * answers rather than a second copy somebody typed. `app/tests/gates.test.ts`
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
export const GATES_MD_SHA256 = "2e6619cc19084742416d4d1b051914dc76887783506e62efe41d6096c64bc64e";

/** The table `ge index` reads, in its own order. */
export const GATE_FILES: readonly GateFileRow[] = [
  { file: "founder-brain.md", gateLabel: "gate A", gates: ["A"], track: "both", session: "1" },
  { file: "content-30.md", gateLabel: "gate B", gates: ["B"], track: "both", session: "2" },
  { file: "content-30.csv", gateLabel: "gate B", gates: ["B"], track: "both", session: "2" },
  { file: "rss-feeds.md", gateLabel: "gate B", gates: ["B"], track: "both", session: "2" },
  { file: "outreach-sequence.md", gateLabel: "gate C", gates: ["C"], track: "b2b", session: "3" },
  { file: "outreach-firstlines.csv", gateLabel: "gate C", gates: ["C"], track: "b2b", session: "3" },
  { file: "dm-openers.md", gateLabel: "gate C", gates: ["C"], track: "b2c", session: "3" },
  { file: "hook-bank.md", gateLabel: "gate C", gates: ["C"], track: "b2c", session: "3" },
  { file: "inbound-scripts.md", gateLabel: "gate C", gates: ["C"], track: "b2c", session: "3" },
  { file: "ops-workflow.md", gateLabel: "gate C", gates: ["C"], track: "both", session: "3" },
  { file: "90-day-plan.md", gateLabel: "-", gates: [], track: "both", session: "the weekend" },
  { file: "playbook-insert.md", gateLabel: "-", gates: [], track: "both", session: "before the print deadline" },
  { file: "ledger.md", gateLabel: "-", gates: [], track: "both", session: "any" },
  { file: "memory.md", gateLabel: "-", gates: [], track: "both", session: "any" },
  { file: "ops-log.md", gateLabel: "-", gates: [], track: "both", session: "any" },
  { file: "people/", gateLabel: "gate B or C", gates: ["B","C"], track: "both", session: "2 and 3" },
];

/** The three gates. Gate C has one list per track. */
export const GATES: readonly Gate[] = [
  {
    id: "A",
    track: "both",
    heading: "Gate A, after session 1",
    items: [
      { item: "the Brain exists and is locked", provedBy: "file-backed", which: "founder-brain.md, its Locked line" },
      { item: "a track is chosen", provedBy: "file-backed", which: "founder-brain.md, its Track line" },
      { item: "the thesis is written", provedBy: "file-backed", which: "founder-brain.md, its Thesis section" },
      { item: "the voice is captured", provedBy: "file-backed", which: "founder-brain.md, its Voice section" },
      { item: "the flags are answered honestly", provedBy: "self-reported", which: "the Flags section is read, not counted" },
    ],
  },
  {
    id: "B",
    track: "both",
    heading: "Gate B, after session 2",
    items: [
      { item: "thirty pieces are written", provedBy: "file-backed", which: "content-30.md" },
      { item: "the upload sheet is exported", provedBy: "file-backed", which: "content-30.csv" },
      { item: "a source list for the refill exists", provedBy: "file-backed", which: "rss-feeds.md" },
      { item: "the pieces have been read and approved", provedBy: "file-backed", which: "ledger.md, rows at approved" },
      { item: "the pieces sound like the founder", provedBy: "self-reported", which: "nothing can measure this" },
    ],
  },
  {
    id: "C",
    track: "b2b",
    heading: "Gate C, after session 3, B2B",
    items: [
      { item: "the sequence is approved", provedBy: "file-backed", which: "outreach-sequence.md" },
      { item: "the list criteria are written down", provedBy: "file-backed", which: "outreach-sequence.md" },
      { item: "the list is built", provedBy: "file-backed", which: "people/, prospects" },
      { item: "first lines exist for the first 25", provedBy: "file-backed", which: "outreach-firstlines.csv" },
      { item: "the workflow is built", provedBy: "file-backed", which: "ops-workflow.md" },
      { item: "domain setup is done and sending has started", provedBy: "self-reported", which: "nothing in the folder sees a mailbox" },
    ],
  },
  {
    id: "C",
    track: "b2c",
    heading: "Gate C, after session 3, B2C",
    items: [
      { item: "twenty five openers are written", provedBy: "file-backed", which: "people/, targets with an opener" },
      { item: "the openers sheet is exported", provedBy: "file-backed", which: "dm-openers.md" },
      { item: "a hook bank with offer tests exists", provedBy: "file-backed", which: "hook-bank.md" },
      { item: "inbound scripts exist", provedBy: "file-backed", which: "inbound-scripts.md" },
      { item: "the workflow is built", provedBy: "file-backed", which: "ops-workflow.md" },
      { item: "the account is a Business or Creator account, linked to a Page", provedBy: "self-reported", which: "nothing in the folder sees the account" },
      { item: "the messages have been sent", provedBy: "see below", which: "people/, targets at sent" },
    ],
  },
];

/**
 * What "real content" means for a file-backed item is NOT DECIDED.
 *
 * `gates.md:68` requires that a file which exists but is nearly empty is
 * called out, and sets no threshold. `REPLIT-BUILD.md` section 9 records this
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
