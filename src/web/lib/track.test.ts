/// <reference types="node" />
/**
 * src/web/lib/track.test.ts
 *
 * WHAT IT IS. The tests for rule 1 in the browser.
 *
 * WHY IT EXISTS. Rule 1 is the one a screenshot proves broken in front of 130 people: a B2C
 * founder reading about cold email, or a B2B founder being told to convert an Instagram
 * account. The strongest assertions here are negative, because the boundary is what the
 * rule states and negatives are stable across every later change to the copy.
 *
 * The case that is easiest to get wrong is the third one: a founder who has not built their
 * Brain yet has no track, and "no track" must not fall through to a default. Half the
 * cohort would get the wrong programme.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ROUTES } from "../../../app/content/routes.ts";
import { apolloRowExists, mayOpenRoute, visibleFileRows, visibleGateFiles, visibleGates, visibleRoutes } from "./track.ts";
import type { FileRow } from "./api.ts";

test("a B2C founder has no outreach row at all, not a disabled one", () => {
  const ids = visibleRoutes("b2c").map((r) => r.id);
  assert.ok(!ids.includes("outreach-engine"));
  assert.ok(ids.includes("audience-engine"));
});

test("a B2B founder has no audience row at all", () => {
  const ids = visibleRoutes("b2b").map((r) => r.id);
  assert.ok(!ids.includes("audience-engine"));
  assert.ok(ids.includes("outreach-engine"));
});

test("before the Brain locks a track, no single track row can appear", () => {
  for (const row of visibleRoutes(null)) {
    assert.deepEqual([...row.tracks].sort(), ["b2b", "b2c"], `${row.id} belongs to one track and must not show yet`);
  }
});

test("a hidden row is never offered on any track", () => {
  const hidden = ROUTES.filter((r) => r.hidden).map((r) => r.id);
  assert.ok(hidden.length > 0, "the table has at least one ported but unoffered row");
  for (const track of ["b2b", "b2c", null] as const) {
    for (const id of hidden) {
      assert.equal(mayOpenRoute(id, track), false, `${id} is hidden and must not open`);
    }
  }
});

test("typing the other track's address does not open it", () => {
  assert.equal(mayOpenRoute("outreach-engine", "b2c"), false);
  assert.equal(mayOpenRoute("audience-engine", "b2b"), false);
  assert.equal(mayOpenRoute("outreach-engine", null), false);
});

test("a file row belonging to the other track is dropped even when the server sends it", () => {
  const rows: FileRow[] = [
    { name: "founder-brain.md", gateLabel: "gate A", status: "ok", sizeBytes: 10, changedAt: null, kind: "markdown", track: "both" },
    { name: "hook-bank.md", gateLabel: "gate C", status: "ok", sizeBytes: 10, changedAt: null, kind: "markdown", track: "b2c" },
    { name: "outreach-sequence.md", gateLabel: "gate C", status: "ok", sizeBytes: 10, changedAt: null, kind: "markdown", track: "b2b" },
  ];
  assert.deepEqual(visibleFileRows(rows, "b2b").map((r) => r.name), ["founder-brain.md", "outreach-sequence.md"]);
  assert.deepEqual(visibleFileRows(rows, "b2c").map((r) => r.name), ["founder-brain.md", "hook-bank.md"]);
  assert.deepEqual(visibleFileRows(rows, null).map((r) => r.name), ["founder-brain.md"]);
});

test("gate C is one list per track, and neither founder sees the other", () => {
  const b2b = visibleGates("b2b");
  const b2c = visibleGates("b2c");
  assert.ok(b2b.some((g) => g.id === "C" && g.track === "b2b"));
  assert.ok(!b2b.some((g) => g.track === "b2c"));
  assert.ok(b2c.some((g) => g.id === "C" && g.track === "b2c"));
  assert.ok(!b2c.some((g) => g.track === "b2b"));
});

test("with no track, only the gates that apply to everybody are shown", () => {
  const ids = visibleGates(null).map((g) => g.id);
  assert.deepEqual(ids, ["A", "B"]);
});

test("the gate file table forks too, and drops to the shared rows with no track", () => {
  assert.ok(visibleGateFiles("b2c").some((f) => f.file === "hook-bank.md"));
  assert.ok(!visibleGateFiles("b2b").some((f) => f.file === "hook-bank.md"));
  assert.ok(!visibleGateFiles(null).some((f) => f.track !== "both"));
});

test("the Apollo row exists for B2B only, and not as a skip for anybody else", () => {
  assert.equal(apolloRowExists("b2b"), true);
  assert.equal(apolloRowExists("b2c"), false);
  assert.equal(apolloRowExists(null), false);
});
