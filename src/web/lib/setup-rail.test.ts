/// <reference types="node" />
/**
 * src/web/lib/setup-rail.test.ts
 *
 * WHAT IT IS. The tests for the setup checklist and the GoHighLevel failure copy.
 *
 * WHY IT EXISTS. Two things have to hold for three weeks of September. A founder who has
 * done everything currently possible must be told they are done, not shown a bar that says
 * 40 percent. And a B2C founder must have no Apollo row, no Apollo skip, and no Apollo
 * anywhere.
 *
 * The failure copy is asserted against the content file character for character. The
 * instruction on this build is that the strings live in `app/content/ghl-walk.ts` and are
 * used, not rewritten in the components, and a test is the only thing that keeps that true
 * after somebody edits a screen in a hurry.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GHL_WALK_FAILURES, scopeRefusalCopy } from "../../../app/content/ghl-walk.ts";
import { GHL_SCOPES, SCOPE_FOR_VERIFY_CALL } from "../../../app/content/scopes.ts";
import { ghlFailureCopy, ghlRowState, railRows, setupSummary } from "./setup-rail.ts";
import type { SetupState } from "./api.ts";

const BLANK: SetupState = {
  profile: { name: null, timezone: null },
  steps: {},
  ghl: { connected: false, locationId: null, locationName: null, accounts: [], contacts: "not_checked", tokenMadeAt: null },
};

function withSteps(steps: SetupState["steps"], extra: Partial<SetupState> = {}): SetupState {
  return { ...BLANK, steps, ...extra };
}

test("a B2C founder has no Apollo row, and no row mentions the word", () => {
  const rows = railRows({ ...BLANK, apollo: { connected: false } }, "b2c");
  assert.ok(!rows.some((r) => r.id === "apollo"));
  const everything = JSON.stringify(rows).toLowerCase();
  assert.ok(!everything.includes("apollo"), "the word must not appear anywhere in a B2C rail");
});

test("a B2B founder gets the Apollo row once the server sends its state", () => {
  const rows = railRows({ ...BLANK, apollo: { connected: false } }, "b2b");
  assert.ok(rows.some((r) => r.id === "apollo"));
});

test("before the track is known there is no Apollo row either", () => {
  const rows = railRows({ ...BLANK, apollo: { connected: false } }, null);
  assert.ok(!rows.some((r) => r.id === "apollo"));
});

test("name and timezone are the only thing between a founder and starting", () => {
  const before = setupSummary(railRows(BLANK, null));
  assert.equal(before.readyToStart, false);
  const after = setupSummary(railRows({ ...BLANK, profile: { name: "Priya", timezone: "America/New_York" } }, null));
  assert.equal(after.readyToStart, true);
});

test("a founder who has done everything possible today is told they are done for now", () => {
  const setup = withSteps({ "have-it": { state: "skipped", evidence: "not bought yet" } }, {
    profile: { name: "Priya", timezone: "America/New_York" },
  });
  const summary = setupSummary(railRows(setup, null));
  assert.equal(summary.doneForNow, true);
  assert.equal(summary.readyToPublish, false, "not ready to publish, and that is not the same thing");
});

test("a plan that cannot make a token is blocking, and a skip is not", () => {
  const failed = withSteps({ plan: { state: "failed", evidence: "no Private Integrations entry in Settings" } });
  assert.equal(ghlRowState(failed), "failed");
  assert.equal(setupSummary(railRows(failed, null)).blocking.length, 1);

  const skipped = withSteps({ "have-it": { state: "skipped", evidence: "not bought yet" } });
  assert.equal(ghlRowState(skipped), "skipped");
  assert.equal(setupSummary(railRows(skipped, null)).blocking.length, 0);
});

test("a failure beats a skip, because the mentor board sorts most stuck first", () => {
  const both = withSteps({
    "have-it": { state: "skipped", evidence: "not bought yet" },
    plan: { state: "failed", evidence: "no Private Integrations entry in Settings" },
  });
  assert.equal(ghlRowState(both), "failed");
});

test("a connected account finishes the GoHighLevel row whatever the substeps say", () => {
  const connected = withSteps({}, {
    ghl: { connected: true, locationId: "abc", locationName: "Lumen Skin", accounts: [], contacts: "readable", tokenMadeAt: null },
  });
  assert.equal(ghlRowState(connected), "done");
});

test("every failure reads the words from the content file, not words written in a screen", () => {
  const rows = GHL_WALK_FAILURES;
  assert.equal(ghlFailureCopy("auth_rejected", "location").text, rows[0]?.founderReads);
  assert.equal(ghlFailureCopy("location_mismatch", "location").text, rows[1]?.founderReads);
  assert.equal(ghlFailureCopy("no_accounts", "accounts").text, rows[3]?.founderReads);
  assert.equal(ghlFailureCopy("rate_limited", "accounts").text, rows[4]?.founderReads);
  assert.equal(ghlFailureCopy("vendor_unavailable", "accounts").text, rows[5]?.founderReads);
});

test("a scope refusal names the scope the failing call needed, from the one scope file", () => {
  for (const call of ["location", "accounts", "contacts"] as const) {
    const copy = ghlFailureCopy("scope_probably_missing", call);
    const scope = SCOPE_FOR_VERIFY_CALL[call];
    assert.equal(copy.text, scopeRefusalCopy(scope));
    assert.ok(copy.text.includes(scope));
    assert.ok(GHL_SCOPES.includes(scope));
    assert.equal(copy.isAGuess, true, "we do not know which status code means a refused scope");
  }
});

test("a failure that has an upstream fix sends the founder back to the step that fixes it", () => {
  assert.equal(ghlFailureCopy("auth_rejected", "location").backTo, "make-token");
  assert.equal(ghlFailureCopy("location_mismatch", "location").backTo, "location-id");
  assert.equal(ghlFailureCopy("no_accounts", "accounts").backTo, null);
});
