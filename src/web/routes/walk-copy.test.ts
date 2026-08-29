/// <reference types="node" />
/**
 * src/web/routes/walk-copy.test.ts
 *
 * WHAT IT IS
 * The tests that hold the GoHighLevel token walk to the copy in `app/content/ghl-walk.ts`.
 *
 * WHY IT EXISTS
 * This is the hardest thing a non-technical founder does in the whole programme, and the
 * instruction for this build is explicit: every string already exists in the content file,
 * use it, do not rewrite it in the components. Copy that lives in a component gets edited
 * by whoever is nearest it at the moment they are thinking about layout, and three weeks
 * later the screen and the docs disagree. That has already happened once to the scope list.
 * These tests render each screen and require the words from the file to be on it.
 *
 * The last test is rule 2 at the outermost layer. Three conversation scopes were cut on 20
 * August 2026 because a token carrying any of them can send a message. They must never
 * appear on a screen that tells a founder which boxes to tick, because a founder who ticks
 * one has a credential that can do the thing the rule forbids, whatever the code does.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import {
  GHL_CONTACTS_READ_PENDING,
  GHL_WALK_CONNECTED,
  GHL_WALK_INTRO,
  GHL_WALK_RESUME_AT_PASTE,
  GHL_WALK_RETRY,
  GHL_WALK_SCOPE_NOTE,
  GHL_WALK_STEPS,
  progressLabel,
} from "../../../app/content/ghl-walk.ts";
import { FORBIDDEN_GHL_SCOPES, GHL_SCOPES } from "../../../app/content/scopes.ts";
import { screenText, setupState } from "../test-fixtures.ts";
import { GhlIntro, GhlWalk } from "./GhlWalk.tsx";

const noop = (): void => undefined;

function walk(slug: string, setup = setupState()): string {
  return screenText(
    createElement(GhlWalk, { slug, setup, onGo: noop, onBackToRail: noop, onSetupChanged: noop }),
  );
}

test("the introduction is the words from the content file, including the reassurance", () => {
  const text = screenText(createElement(GhlIntro, { onGo: noop }));
  assert.ok(text.includes(GHL_WALK_INTRO.title));
  assert.ok(text.includes(GHL_WALK_INTRO.doubt));
  for (const line of GHL_WALK_INTRO.body) assert.ok(text.includes(line), line);
  assert.ok(text.includes(GHL_WALK_INTRO.action));
});

test("every step shows its own title, its doubt and every line of its body", () => {
  for (const step of GHL_WALK_STEPS) {
    const text = walk(step.slug);
    assert.ok(text.includes(step.title), `step ${step.slug} is missing its title`);
    assert.ok(text.includes(step.doubt), `step ${step.slug} is missing the doubt it answers first`);
    for (const line of step.body) {
      assert.ok(text.includes(line), `step ${step.slug} is missing a line of its body: ${line}`);
    }
  }
});

test("every step says which step it is, so nobody walks in the dark", () => {
  for (const step of GHL_WALK_STEPS) {
    assert.ok(walk(step.slug).includes(progressLabel(step.number)), `step ${step.slug} has no progress label`);
  }
});

test("every button on a step is rendered with the label the content file gives it", () => {
  for (const step of GHL_WALK_STEPS) {
    const text = walk(step.slug);
    for (const button of step.buttons) {
      // Step 6's buttons appear only once a connection exists, and that is its own test.
      if (step.slug === "verify") continue;
      assert.ok(text.includes(button.label), `step ${step.slug} is missing the button "${button.label}"`);
    }
  }
});

test("the seven scopes are on step 4, spelled exactly as they are in the one scope file", () => {
  const text = walk("make-token");
  for (const scope of GHL_SCOPES) assert.ok(text.includes(scope), `${scope} is missing from step 4`);
  assert.ok(text.includes(GHL_WALK_SCOPE_NOTE), "the note that says our tick does nothing is missing");
});

test("no cut scope is ever offered to a founder, because a granted scope can send a message", () => {
  const text = walk("make-token").toLowerCase();
  for (const scope of FORBIDDEN_GHL_SCOPES) {
    assert.ok(!text.includes(scope), `${scope} was cut on 20 August 2026 and must never be shown`);
  }
  assert.ok(!text.includes("conversations"), "nothing on this screen may hint at a messaging permission");
});

test("a founder coming back to the paste screen is told why the box is empty", () => {
  const returning = setupState({ steps: { "paste-token": { state: "in_progress", evidence: null } } });
  assert.ok(walk("paste-token", returning).includes(GHL_WALK_RESUME_AT_PASTE));
  // And a founder arriving for the first time is not told about a failure that never happened.
  assert.ok(!walk("paste-token").includes(GHL_WALK_RESUME_AT_PASTE));
});

test("the last screen reads the founder's own page and handle back to them", () => {
  const connected = setupState({
    ghl: {
      connected: true,
      locationId: "loc_1",
      locationName: "Lumen Skin",
      accounts: [
        { platform: "Facebook", name: "Lumen Skin" },
        { platform: "Instagram", name: "lumen.skin" },
      ],
      contacts: "readable",
      tokenMadeAt: "2026-09-23T10:00:00Z",
    },
  });
  const text = walk("verify", connected);
  assert.ok(text.includes(GHL_WALK_CONNECTED.title));
  assert.ok(text.includes("Lumen Skin"), "the page name is the proof a tick cannot give");
  assert.ok(text.includes("lumen.skin"), "the handle they recognise is the other half of it");
  assert.ok(text.includes("23 Sep"));
  assert.ok(text.includes(GHL_WALK_CONNECTED.contactsReadable));
});

test("the contacts check reports itself as not run, rather than reporting a pass", () => {
  const partly = setupState({
    ghl: {
      connected: true,
      locationId: "loc_1",
      locationName: "Lumen Skin",
      accounts: [{ platform: "Facebook", name: "Lumen Skin" }],
      contacts: "not_checked",
      tokenMadeAt: "2026-09-23T10:00:00Z",
    },
  });
  const text = walk("verify", partly);
  assert.ok(text.includes(GHL_CONTACTS_READ_PENDING.founderReadsWhilePending));
  assert.ok(!text.includes("Contacts: readable"));
});

test("retrying never asks for the token a second time", () => {
  const pasted = setupState({ steps: { "paste-token": { state: "done", evidence: null } } });
  assert.ok(walk("verify", pasted).includes(GHL_WALK_RETRY));
});

test("a founder who has not pasted a token is sent back, not shown a button that does nothing", () => {
  const text = walk("verify");
  assert.ok(text.includes("We do not have a token from you yet"));
  assert.ok(!text.includes(GHL_WALK_RETRY), "the retry line would be a lie with no token on file");
});

test("a step slug that does not exist is a plain sentence and a way back, not a blank page", () => {
  const text = walk("step-four");
  assert.ok(text.includes("We do not have that step"));
  assert.ok(text.includes("you will not lose anything"));
});
