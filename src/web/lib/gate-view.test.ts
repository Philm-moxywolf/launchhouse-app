/// <reference types="node" />
/**
 * src/web/lib/gate-view.test.ts
 *
 * WHAT IT IS. The tests for turning gate items into what is done and what is next.
 *
 * WHY IT EXISTS. The first test is the important one. Every file backed gate item names its
 * file in prose, and this screen finds the file inside that prose. The day somebody renames
 * a file in `schemas/gates.md`, that test fails, which is exactly when we want to hear
 * about it: the alternative is a gate screen that quietly reports an item as not started
 * for 130 people.
 *
 * The second is rule 5 on our own screens. An item nothing can prove is the founder's own
 * answer, and is never shown as a tick we invented.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GATES } from "../../../app/content/gates.ts";
import { fileNamedIn, gateItems, gateView } from "./gate-view.ts";
import type { FileStatus } from "./api.ts";

test("every file backed gate item names a file we know about", () => {
  for (const gate of GATES) {
    for (const item of gate.items) {
      if (item.provedBy !== "file-backed") continue;
      assert.notEqual(
        fileNamedIn(item.which),
        null,
        `gate ${gate.id} (${gate.track}) item "${item.item}" names no known file in "${item.which}"`,
      );
    }
  }
});

test("the longer name wins, so a CSV is not read as the markdown beside it", () => {
  assert.equal(fileNamedIn("content-30.csv"), "content-30.csv");
  assert.equal(fileNamedIn("content-30.md"), "content-30.md");
  assert.equal(fileNamedIn("people/, prospects"), "people/");
  assert.equal(fileNamedIn("nothing can measure this"), null);
});

test("an item nothing can prove is the founder's own call, never a tick we invented", () => {
  const gateB = GATES.find((g) => g.id === "B");
  assert.ok(gateB !== undefined);
  const items = gateItems(gateB, {});
  const selfReported = items.filter((i) => i.state === "you_say");
  assert.ok(selfReported.length > 0);
  for (const item of selfReported) assert.equal(item.file, null);
});

test("a file that exists but is nearly empty is started, not passed and not failed", () => {
  const gateA = GATES.find((g) => g.id === "A");
  assert.ok(gateA !== undefined);
  const status: Record<string, FileStatus> = { "founder-brain.md": "empty" };
  const view = gateView(gateA, status, null);
  assert.ok(view.items.every((i) => i.state !== "done" || i.file === null));
  assert.equal(view.doneCount, 0);
  assert.equal(view.next?.state, "started");
});

test("a written file counts, and the count only ever covers what we can check", () => {
  const gateA = GATES.find((g) => g.id === "A");
  assert.ok(gateA !== undefined);
  const view = gateView(gateA, { "founder-brain.md": "ok" }, "2026-09-12T00:00:00Z");
  assert.equal(view.doneCount, view.checkableCount);
  assert.equal(view.next, null);
  assert.equal(view.submitted, "2026-09-12T00:00:00Z");
  assert.ok(view.checkableCount < gateA.items.length, "the self reported items are not counted");
});
