/**
 * src/web/lib/gate-view.ts
 *
 * WHAT IT IS
 * Turns a gate list and the state of a founder's files into what is done, what is next and
 * what is blocking.
 *
 * WHY IT EXISTS
 * `app/content/gates.ts` says what each gate requires and which file proves it, in prose
 * written for a person: "founder-brain.md, its Locked line". Something has to connect that
 * to the file table without a second list that drifts from the first, so the file name is
 * found inside the prose rather than written out again beside it. A test walks every gate
 * item and asserts each file backed one names a file we know, which is what catches the day
 * somebody renames a file in `schemas/gates.md`.
 *
 * The second reason is honesty about what we cannot check. Some items are self reported and
 * always will be: nothing in the folder can see whether the posts sound like the founder,
 * or whether a mailbox is really sending. Those are shown as the founder's own call, never
 * as a tick we invented. Rule 5, never invent proof, applies to our own screens too.
 *
 * A third state exists because the emptiness floor is not decided. `gates.md` requires that
 * a file which exists but is nearly empty is called out, and sets no threshold, and
 * `EMPTINESS_FLOOR_PENDING` records that it is still open. So a file at `empty` is reported
 * as started rather than as passed or failed, and the screen says so in words.
 *
 * WHAT CALLS IT
 * The Gates screen.
 *
 * WHAT IT READS AND WRITES
 * Nothing. Pure functions over the gate table and a response body.
 */

import { GATE_FILES } from "../../../app/content/gates.ts";
import type { Gate } from "../../../app/content/gates.ts";
import type { FileStatus } from "./api.ts";

/** How an item stands. `you_say` is the founder's own answer, and we never guess it. */
export type ItemState = "done" | "started" | "not_yet" | "you_say";

/**
 * The file a gate item points at, or null.
 *
 * Longest name first, so `content-30.csv` is not read as `content-30.md` and `people/`
 * still matches when it is the only thing in the string.
 */
const NAMES_LONGEST_FIRST: readonly string[] = [...GATE_FILES.map((f) => f.file)].sort(
  (a, b) => b.length - a.length,
);

export function fileNamedIn(which: string): string | null {
  return NAMES_LONGEST_FIRST.find((name) => which.includes(name)) ?? null;
}

export interface GateItemView {
  readonly item: string;
  readonly state: ItemState;
  /** The file this rests on, in its own words, or null when nothing on disk can prove it. */
  readonly file: string | null;
}

export function gateItems(gate: Gate, fileStatus: Readonly<Record<string, FileStatus>>): readonly GateItemView[] {
  return gate.items.map((item) => {
    if (item.provedBy !== "file-backed") return { item: item.item, state: "you_say" as const, file: null };
    const file = fileNamedIn(item.which);
    if (file === null) return { item: item.item, state: "you_say" as const, file: null };
    const status = fileStatus[file] ?? "missing";
    const state: ItemState = status === "ok" ? "done" : status === "empty" ? "started" : "not_yet";
    return { item: item.item, state, file };
  });
}

export interface GateView {
  readonly heading: string;
  readonly items: readonly GateItemView[];
  readonly doneCount: number;
  readonly checkableCount: number;
  /** The first thing that is not done. What the founder should do next. */
  readonly next: GateItemView | null;
  readonly submitted: string | null;
}

export function gateView(
  gate: Gate,
  fileStatus: Readonly<Record<string, FileStatus>>,
  submitted: string | null,
): GateView {
  const items = gateItems(gate, fileStatus);
  const checkable = items.filter((i) => i.state !== "you_say");
  return {
    heading: gate.heading,
    items,
    doneCount: checkable.filter((i) => i.state === "done").length,
    checkableCount: checkable.length,
    next: items.find((i) => i.state === "not_yet" || i.state === "started") ?? null,
    submitted,
  };
}
