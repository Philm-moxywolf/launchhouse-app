/// <reference types="node" />
/**
 * src/web/lib/ghl-walk-view.test.ts
 *
 * WHAT IT IS. The tests for the small decisions the token walk makes.
 *
 * WHY IT EXISTS. The token shape check is a guess, inferred from our own shell and never
 * compared against a real GoHighLevel token. A guess that blocks a founder at 10pm is worse
 * than no check at all, so the test that matters is that it is only ever a warning, and
 * that the walk still moves on. The rest holds the walk in one order.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GHL_WALK_STEPS, GHL_WALK_TOTAL_STEPS } from "../../../app/content/ghl-walk.ts";
import { capitaliseFirst, nextStep, notSureLine, stepBySlug, tokenLooksRight } from "./ghl-walk-view.ts";

test("the walk is six steps, numbered one to six, in order", () => {
  assert.equal(GHL_WALK_STEPS.length, GHL_WALK_TOTAL_STEPS);
  assert.deepEqual(GHL_WALK_STEPS.map((s) => s.number), [1, 2, 3, 4, 5, 6]);
});

test("every step is reachable from the one before it, and the last one ends the walk", () => {
  let slug = GHL_WALK_STEPS[0]?.slug ?? "";
  const walked: string[] = [slug];
  for (let i = 0; i < GHL_WALK_TOTAL_STEPS; i += 1) {
    const next = nextStep(slug);
    if (next === undefined) break;
    slug = next.slug;
    walked.push(slug);
  }
  assert.deepEqual(walked, GHL_WALK_STEPS.map((s) => s.slug));
  assert.equal(nextStep(walked[walked.length - 1] ?? ""), undefined);
});

test("a slug we do not have is undefined rather than the first step", () => {
  assert.equal(stepBySlug("step-4"), undefined);
  assert.equal(stepBySlug("make-token")?.number, 4);
});

test("the token shape check is case insensitive and forgives a stray space", () => {
  assert.equal(tokenLooksRight("pit-abc123"), true);
  assert.equal(tokenLooksRight("  PIT-abc123  "), true);
  assert.equal(tokenLooksRight("abc123"), false);
  assert.equal(tokenLooksRight(""), false);
});

test("the line for a founder who is not sure comes out of the content file", () => {
  const line = notSureLine();
  assert.ok(line.startsWith("Look in your inbox"), line);
  assert.ok(line.includes("that is fine"), "the reassurance is the point of the line");
});

test("a sentence written mid line in the content file is shown as a sentence", () => {
  assert.equal(capitaliseFirst("look in your inbox"), "Look in your inbox");
  assert.equal(capitaliseFirst(""), "");
});
