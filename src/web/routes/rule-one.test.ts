/// <reference types="node" />
/**
 * src/web/routes/rule-one.test.ts
 *
 * WHAT IT IS
 * Rule 1, asserted against the words that actually reach the screen.
 *
 * WHY IT EXISTS
 * Every other guard in this app is a function that could be called correctly and rendered
 * around. These tests render the real screens and read the text back, so what is asserted
 * is what a founder would see. The assertions are negative on purpose: they name the words
 * from the other track's programme and require that none of them appear. Negative
 * assertions survive rewording, and rewording is what happens to this copy between now and
 * September.
 *
 * The Apollo case is the sharpest one. Section 6 says the word does not appear anywhere in
 * a B2C founder's app, not even as a skip line saying it is not needed on their track,
 * because a skip line is still the other track's material on their screen.
 *
 * WHAT IT READS AND WRITES. Nothing. Nothing here touches the network: these screens take
 * their data as props, and React does not run effects when it renders to a string.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { founder, homeState, screenText, setupState } from "../test-fixtures.ts";
import { Home } from "./Home.tsx";
import { Setup } from "./Setup.tsx";
import { Thread } from "./Thread.tsx";
import { HandingItToClaude } from "./Files.tsx";

/** Words that belong to the B2B programme and must never reach a B2C founder. */
const B2B_WORDS = ["apollo", "outreach", "sequence", "cold email", "first lines", "prospect"];

/** Words that belong to the B2C programme and must never reach a B2B founder. */
const B2C_WORDS = ["hook bank", "dm opener", "audience engine", "inbound script"];

function assertAbsent(text: string, words: readonly string[], where: string): void {
  const lower = text.toLowerCase();
  for (const word of words) {
    assert.ok(!lower.includes(word), `"${word}" reached ${where}`);
  }
}

test("a B2C founder's home screen carries no word from the B2B programme", () => {
  const text = screenText(createElement(Home, { founder: founder("b2c"), home: homeState() }));
  assertAbsent(text, B2B_WORDS, "a B2C home screen");
  assert.ok(text.includes("Audience Engine"), "their own engine is there");
});

test("a B2B founder's home screen carries no word from the B2C programme", () => {
  const text = screenText(createElement(Home, { founder: founder("b2b"), home: homeState() }));
  assertAbsent(text, B2C_WORDS, "a B2B home screen");
  assert.ok(text.includes("Outreach Engine"), "their own engine is there");
});

test("before the Brain locks, neither track's engine is offered", () => {
  const text = screenText(createElement(Home, { founder: founder(null, { trackLocked: false }), home: homeState() }));
  assertAbsent(text, ["outreach engine", "audience engine", "apollo"], "a home screen with no track yet");
  assert.ok(text.includes("Founder Brain"), "the one thing they can do is there");
});

test("both time critical items are shown while the track is unknown, and one after", () => {
  const before = screenText(createElement(Home, { founder: founder(null, { trackLocked: false }), home: homeState() }));
  assert.ok(before.includes("If you sell to businesses"));
  assert.ok(before.includes("If you sell to people"));

  const after = screenText(createElement(Home, { founder: founder("b2c"), home: homeState() }));
  assert.ok(after.includes("Instagram"), "the B2C item is the one that stays");
  assert.ok(!after.includes("If you sell to businesses"), "the other condition is gone for good");
  assert.ok(!after.toLowerCase().includes("dmarc"), "and so is the other track's item");
});

test("a B2C founder's setup screen never says Apollo, even as a skip", () => {
  const text = screenText(
    createElement(Setup, {
      founder: founder("b2c"),
      setup: setupState({ apollo: { connected: false } }),
    }),
  );
  assertAbsent(text, ["apollo"], "a B2C setup screen");
});

test("a B2B founder's setup screen has the Apollo row", () => {
  const text = screenText(
    createElement(Setup, {
      founder: founder("b2b"),
      setup: setupState({ apollo: { connected: false } }),
    }),
  );
  assert.ok(text.includes("Apollo"));
});

test("opening the other track's engine by address shows a refusal, not the engine", () => {
  const text = screenText(createElement(Thread, { founder: founder("b2c"), routeId: "outreach-engine" }));
  assert.ok(text.includes("That is not one of yours"));
  assertAbsent(text, ["outreach engine", "sequence", "apollo"], "a refused thread screen");
});

test("a founder with no track yet cannot open a single track engine by address", () => {
  const text = screenText(createElement(Thread, { founder: founder(null, { trackLocked: false }), routeId: "audience-engine" }));
  assert.ok(text.includes("That is not one of yours"));
});

test("the setup screen never tells a founder they are behind when they cannot act yet", () => {
  const text = screenText(
    createElement(Setup, {
      founder: founder(null, { trackLocked: false }),
      setup: setupState({
        steps: { "have-it": { state: "skipped", evidence: "not bought yet" } },
        // The key is in. Without it "everything you can do is done" is not true, and the
        // test below is the other half of that sentence.
        anthropic: { set: true, checkedAt: "2026-09-07T14:00:00.000Z", length: 108 },
      }),
    }),
  );
  assert.ok(text.includes("You are done for now"));
  assert.ok(text.includes("Nothing is late"));
});

/**
 * The other half, and it is the bigger lie of the two.
 *
 * "Everything you can do today is done" in front of a founder who has not pasted an
 * Anthropic key is wrong in the direction that costs a session: they can do something, it
 * is the only thing that matters, and the screen has just told them to stop looking.
 */
test("and it never says that to a founder who has not pasted their key yet", () => {
  const text = screenText(
    createElement(Setup, {
      founder: founder(null, { trackLocked: false }),
      setup: setupState({ steps: { "have-it": { state: "skipped", evidence: "not bought yet" } } }),
    }),
  );
  assert.ok(!text.includes("You are done for now"), "a founder with no key is not done for now");
  assert.ok(text.includes("Paste your key here"), "the box they need is on the screen instead");
});

test("the handover steps name Apollo for an outreach founder and never for an audience one", () => {
  // The handover sits under the download button on Files and tells a founder which
  // connectors to add to Claude. Apollo is the outreach track's, so the line that
  // names it is conditional. A conditional is exactly the kind of guard that reads
  // correctly and renders wrong, which is why it is asserted rather than trusted.
  const b2b = screenText(createElement(HandingItToClaude, { track: "b2b" as const }));
  assert.match(b2b.toLowerCase(), /apollo/, "an outreach founder needs to be told to connect it");

  const b2c = screenText(createElement(HandingItToClaude, { track: "b2c" as const }));
  assertAbsent(b2c, B2B_WORDS, "the handover steps on an audience founder's Files screen");

  // Both are told about GoHighLevel, which belongs to neither track alone.
  assert.match(b2c.toLowerCase(), /gohighlevel/);
  assert.match(b2b.toLowerCase(), /gohighlevel/);
});

test("a founder with no track yet is not offered either track's connector", () => {
  const none = screenText(createElement(HandingItToClaude, { track: null }));
  assertAbsent(none, B2B_WORDS, "the handover steps before a track is chosen");
});
