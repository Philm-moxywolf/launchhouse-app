/// <reference types="node" />
/**
 * src/web/lib/nav.test.ts
 *
 * WHAT IT IS. The tests for the router.
 *
 * WHY IT EXISTS. Every substep of the token walk has its own address so a mentor can send a
 * founder straight to step 4 in Slack, and a founder who closes the tab comes back where
 * they were. A link that parses to the wrong screen breaks both of those on the one day
 * they matter. The round trip test is the one that holds it: every screen's address parses
 * back to that same screen.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { HOME, hrefFor, parseHash } from "./nav.ts";
import type { View } from "./nav.ts";

const EVERY_VIEW: readonly View[] = [
  { kind: "home" },
  { kind: "first-run" },
  { kind: "setup" },
  { kind: "setup-ghl-intro" },
  { kind: "setup-ghl-step", slug: "paste-token" },
  { kind: "setup-apollo" },
  { kind: "thread", routeId: "founder-brain" },
  { kind: "files" },
  { kind: "file", name: "content-30.csv" },
  { kind: "gates" },
];

test("every screen's address parses back to that screen", () => {
  for (const view of EVERY_VIEW) {
    assert.deepEqual(parseHash(hrefFor(view)), view, `round trip failed for ${view.kind}`);
  }
});

test("the four shapes a browser produces for no hash are all home", () => {
  for (const raw of ["", "#", "#/", "#//"]) {
    assert.deepEqual(parseHash(raw), HOME);
  }
});

test("an address we do not have is unknown, and is not silently home", () => {
  const view = parseHash("#/mentor-board");
  assert.equal(view.kind, "unknown");
  // A mentor who pasted a bad link needs the evidence, so the raw address is kept.
  assert.equal(view.kind === "unknown" ? view.raw : "", "#/mentor-board");
});

test("a thread address with no route is unknown rather than a thread with an empty id", () => {
  assert.equal(parseHash("#/thread").kind, "unknown");
});

test("a file name with a slash survives the address bar", () => {
  const href = hrefFor({ kind: "file", name: "people/ada-lovelace.md" });
  assert.deepEqual(parseHash(href), { kind: "file", name: "people/ada-lovelace.md" });
});

test("a step slug is encoded and decoded rather than concatenated", () => {
  const href = hrefFor({ kind: "setup-ghl-step", slug: "make token" });
  assert.ok(!href.includes(" "), "a space must not reach the address bar raw");
  assert.deepEqual(parseHash(href), { kind: "setup-ghl-step", slug: "make token" });
});
