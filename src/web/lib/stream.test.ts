/// <reference types="node" />
/**
 * src/web/lib/stream.test.ts
 *
 * WHAT IT IS. The tests for turning a raw server sent event into a frame.
 *
 * WHY IT EXISTS. One malformed frame must not take down the screen a founder is watching
 * their Founder Brain being written on. Every case here is a way the wire can be wrong, and
 * in every one of them the answer is null rather than a throw and never a guessed value: a
 * guessed frame writes text into somebody's transcript that nobody sent.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseFrame } from "./stream.ts";

test("a delta carries its text, its turn and the id that makes reconnect lossless", () => {
  const frame = parseFrame("delta", JSON.stringify({ turnId: "tn_88", text: "Right. So you sell" }), "10432");
  assert.deepEqual(frame, { kind: "delta", id: 10432, turnId: "tn_88", text: "Right. So you sell" });
});

test("status and tool frames are plain sentences, and are shaped like a delta", () => {
  const status = parseFrame("status", JSON.stringify({ turnId: "t1", text: "Reading your Founder Brain" }), "1");
  assert.equal(status?.kind, "status");
  const tool = parseFrame("tool", JSON.stringify({ turnId: "t1", text: "Writing your 30 pieces" }), "2");
  assert.equal(tool?.kind, "tool");
});

test("a queued frame carries a position, and a position below one is nonsense", () => {
  assert.deepEqual(parseFrame("queued", JSON.stringify({ turnId: "t1", position: 7 }), "3"), {
    kind: "queued",
    id: 3,
    turnId: "t1",
    position: 7,
  });
  assert.equal(parseFrame("queued", JSON.stringify({ turnId: "t1", position: 0 }), "3"), null);
  assert.equal(parseFrame("queued", JSON.stringify({ turnId: "t1" }), "3"), null);
});

test("a file frame may arrive without a turn, because a write is a fact about the folder", () => {
  assert.deepEqual(parseFrame("file", JSON.stringify({ name: "founder-brain.md", sizeBytes: 4184 }), "9"), {
    kind: "file",
    id: 9,
    turnId: null,
    name: "founder-brain.md",
    sizeBytes: 4184,
  });
  assert.equal(parseFrame("file", JSON.stringify({ name: "" }), "9"), null);
});

test("a turn end reason we do not know becomes unknown rather than being dropped", () => {
  const frame = parseFrame("turn_end", JSON.stringify({ turnId: "t1", reason: "something new" }), "4");
  assert.deepEqual(frame, { kind: "turn_end", id: 4, turnId: "t1", reason: "unknown" });
  const known = parseFrame("turn_end", JSON.stringify({ turnId: "t1", reason: "max_turns" }), "5");
  assert.equal(known?.kind === "turn_end" ? known.reason : "", "max_turns");
});

test("everything malformed is dropped, and nothing throws", () => {
  assert.equal(parseFrame("delta", "not json at all", "1"), null);
  assert.equal(parseFrame("delta", "[1,2,3]", "1"), null);
  assert.equal(parseFrame("delta", '"a string"', "1"), null);
  assert.equal(parseFrame("delta", JSON.stringify({ text: "no turn id" }), "1"), null);
  assert.equal(parseFrame("delta", JSON.stringify({ turnId: "t1", text: 42 }), "1"), null);
  assert.equal(parseFrame("heartbeat", JSON.stringify({ turnId: "t1", text: "x" }), "1"), null);
  assert.equal(parseFrame("error", JSON.stringify({ text: "" }), "1"), null);
});

test("a frame with no usable id is kept, because dropping a real delta leaves a hole", () => {
  const frame = parseFrame("delta", JSON.stringify({ turnId: "t1", text: "x" }), "");
  assert.equal(frame?.id, null);
  const rubbish = parseFrame("delta", JSON.stringify({ turnId: "t1", text: "x" }), "not-a-number");
  assert.equal(rubbish?.id, null);
});
