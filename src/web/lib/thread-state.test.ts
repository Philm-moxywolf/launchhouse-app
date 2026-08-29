/// <reference types="node" />
/**
 * src/web/lib/thread-state.test.ts
 *
 * WHAT IT IS. The tests for the conversation reducer.
 *
 * WHY IT EXISTS. Four behaviours here are the difference between a founder trusting this
 * screen and not, and none of them is visible until it goes wrong with somebody mid
 * interview. Replayed frames after a reconnect must not duplicate text. A stop must keep
 * what was already written. Two turns must not merge into one bubble. And a founder must
 * never be looking at a turn with nothing said about it.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_THREAD, FIRST_STATUS, TURN_END_NOTICE, threadReducer } from "./thread-state.ts";
import type { ThreadView } from "./thread-state.ts";
import type { StreamFrame } from "./stream.ts";

function delta(turnId: string, text: string, id: number | null): StreamFrame {
  return { kind: "delta", id, turnId, text };
}

function apply(view: ThreadView, ...frames: readonly StreamFrame[]): ThreadView {
  return frames.reduce((acc, frame) => threadReducer(acc, { type: "frame", frame }), view);
}

const OPENED: ThreadView = threadReducer(EMPTY_THREAD, {
  type: "loaded",
  thread: { id: "t_1", routeId: "founder-brain", messages: [], lastEventId: null, activeTurnId: null },
});

test("deltas for one turn build one answer", () => {
  const view = apply(OPENED, delta("tn_1", "Right. ", 1), delta("tn_1", "So you sell to builders.", 2));
  assert.equal(view.turn?.text, "Right. So you sell to builders.");
  assert.equal(view.lastEventId, 2);
});

test("a replayed frame after a reconnect is ignored, so nothing is written twice", () => {
  const first = apply(OPENED, delta("tn_1", "Hello", 10), delta("tn_1", " there", 11));
  const replayed = apply(first, delta("tn_1", "Hello", 10), delta("tn_1", " there", 11), delta("tn_1", " again", 12));
  assert.equal(replayed.turn?.text, "Hello there again");
});

test("a frame with no id is always applied, because a dropped delta leaves a hole", () => {
  const view = apply(OPENED, delta("tn_1", "a", 5), delta("tn_1", "b", null));
  assert.equal(view.turn?.text, "ab");
  assert.equal(view.lastEventId, 5);
});

test("a turn always has something said about it, from the first frame", () => {
  const view = apply(OPENED, { kind: "queued", id: 1, turnId: "tn_1", position: 7 });
  assert.equal(view.turn?.status, FIRST_STATUS);
  assert.equal(view.turn?.queuePosition, 7);
});

test("the queue notice clears the moment real text starts arriving", () => {
  const view = apply(OPENED, { kind: "queued", id: 1, turnId: "tn_1", position: 7 }, delta("tn_1", "Right", 2));
  assert.equal(view.turn?.queuePosition, null);
});

test("a status line replaces the last one rather than piling up", () => {
  const view = apply(
    OPENED,
    { kind: "status", id: 1, turnId: "tn_1", text: "Reading your Founder Brain" },
    { kind: "tool", id: 2, turnId: "tn_1", text: "Writing your 30 pieces" },
  );
  assert.equal(view.turn?.status, "Writing your 30 pieces");
});

test("stopping keeps what was already written, and says where it stopped", () => {
  const streamed = apply(OPENED, delta("tn_1", "Half an answ", 1));
  const stopped = apply(streamed, { kind: "turn_end", id: 2, turnId: "tn_1", reason: "stopped" });
  assert.equal(stopped.turn, null);
  assert.equal(stopped.messages.length, 1);
  assert.equal(stopped.messages[0]?.text, "Half an answ");
  assert.equal(stopped.messages[0]?.state, "stopped");
  assert.equal(stopped.notice, TURN_END_NOTICE["stopped"]);
});

test("an error keeps the partial answer too, and the founder reads why", () => {
  const streamed = apply(OPENED, delta("tn_1", "Part of it", 1));
  const broken = apply(streamed, { kind: "error", id: 2, turnId: "tn_1", text: "We lost the connection to the engine." });
  assert.equal(broken.messages[0]?.text, "Part of it");
  assert.equal(broken.notice, "We lost the connection to the engine.");
  assert.equal(broken.stopping, false);
});

test("hitting the turn limit is offered as a carry on, never as an error", () => {
  const view = apply(OPENED, delta("tn_1", "A long answer", 1), {
    kind: "turn_end",
    id: 2,
    turnId: "tn_1",
    reason: "max_turns",
  });
  const notice = view.notice ?? "";
  assert.ok(notice.includes("carry on"));
  assert.ok(!notice.toLowerCase().includes("error"));
});

test("a second turn does not merge into the first bubble", () => {
  const view = apply(
    OPENED,
    delta("tn_1", "First answer", 1),
    { kind: "turn_end", id: 2, turnId: "tn_1", reason: "done" },
    delta("tn_2", "Second answer", 3),
  );
  assert.equal(view.messages.length, 1);
  assert.equal(view.turn?.text, "Second answer");
});

test("a delta for a new turn closes the old one even if its end was never seen", () => {
  const view = apply(OPENED, delta("tn_1", "First", 1), delta("tn_2", "Second", 2));
  assert.equal(view.messages.length, 1);
  assert.equal(view.messages[0]?.text, "First");
  assert.equal(view.turn?.text, "Second");
});

test("a founder's message shows as sending, then as sent when the answer starts", () => {
  const sending = threadReducer(OPENED, { type: "sending", clientMsgId: "c1", text: "we sell to builders" });
  assert.equal(sending.messages[0]?.state, "sending");
  const answered = apply(sending, delta("tn_1", "Right", 1));
  assert.equal(answered.messages[0]?.state, "complete");
});

test("a send that fails is marked, and the text is not lost from the screen", () => {
  const sending = threadReducer(OPENED, { type: "sending", clientMsgId: "c1", text: "we sell to builders" });
  const failed = threadReducer(sending, { type: "send-failed", clientMsgId: "c1", text: "That did not send." });
  assert.equal(failed.messages[0]?.state, "failed");
  assert.equal(failed.messages[0]?.text, "we sell to builders");
  assert.equal(failed.notice, "That did not send.");
});

test("files written during a turn are listed once each, most recent last", () => {
  const view = apply(
    OPENED,
    { kind: "file", id: 1, turnId: "tn_1", name: "founder-brain.md", sizeBytes: 100 },
    { kind: "file", id: 2, turnId: "tn_1", name: "founder-brain.md", sizeBytes: 4184 },
    { kind: "file", id: 3, turnId: "tn_1", name: "content-30.md", sizeBytes: 90 },
  );
  assert.deepEqual(view.filesWritten.map((f) => f.name), ["founder-brain.md", "content-30.md"]);
  assert.equal(view.filesWritten[0]?.sizeBytes, 4184);
});

test("loading a thread restores the transcript and where the stream should resume", () => {
  const view = threadReducer(EMPTY_THREAD, {
    type: "loaded",
    thread: {
      id: "t_2",
      routeId: "content-engine",
      lastEventId: 40,
      activeTurnId: "tn_9",
      messages: [{ id: "m1", role: "founder", text: "hello", at: "2026-09-19T10:00:00Z" }],
    },
  });
  assert.equal(view.lastEventId, 40);
  assert.equal(view.turn?.turnId, "tn_9");
  assert.equal(view.messages[0]?.state, "complete");
});
