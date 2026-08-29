/// <reference types="node" />
/**
 * src/web/lib/format.test.ts
 *
 * WHAT IT IS. The tests for everything a founder reads as a number, a date or a name.
 *
 * WHY IT EXISTS. The queue notice is the string most likely to cost a live session, and it
 * has two properties that must hold at every position: it names a place, and it never
 * promises a time we cannot meet. Both are asserted here rather than left to whoever edits
 * the copy next.
 *
 * The clock matters for a different reason. A founder confirms their timezone by reading
 * their own clock, so a wrong clock produces a wrong zone, and a wrong zone produces a
 * schedule that is hours out for the whole 90 days.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  formatClock,
  formatDay,
  formatWhen,
  ordinal,
  plainFileName,
  queuedNotice,
  sameFileName,
} from "./format.ts";

test("sizes are in the units a person uses, and a small file is not rounded to nothing", () => {
  assert.equal(formatBytes(0), "0 bytes");
  assert.equal(formatBytes(4), "4 bytes");
  assert.equal(formatBytes(999), "999 bytes");
  assert.equal(formatBytes(4184), "4.2 KB");
  assert.equal(formatBytes(18000), "18.0 KB");
  assert.equal(formatBytes(2400000), "2.4 MB");
  assert.equal(formatBytes(Number.NaN), "");
});

test("ordinals are right where English is irregular", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(7), "7th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(112), "112th");
  assert.equal(ordinal(0), "");
});

test("a queued founder is always given their place, at every position", () => {
  for (const position of [1, 2, 7, 9, 10, 24, 25, 65, 130]) {
    const lines = queuedNotice(position);
    assert.ok(lines[0]?.includes(ordinal(position)), `position ${String(position)} does not name a place`);
    assert.ok(lines.join(" ").includes("Your place is held") || lines.join(" ").includes("place is held"));
  }
});

test("the queue notice hedges the wait and never states one as a fact", () => {
  const short = queuedNotice(3).join(" ");
  assert.ok(short.includes("usually"), "a short wait is described as usual, not as a promise");
  const long = queuedNotice(80).join(" ");
  assert.ok(!long.includes("will take one minute"));
  assert.ok(long.includes("nothing is lost"));
});

test("a file is named as the thing the founder made, with the file name still available", () => {
  assert.equal(plainFileName("founder-brain.md"), "Your Founder Brain");
  assert.equal(plainFileName("content-30.csv"), "Your 30 pieces, as an upload sheet");
  assert.equal(plainFileName("people/"), "Your people");
  // A name we do not know is still readable, and never rendered as a path.
  assert.equal(plainFileName("voice-samples/sample-2026-09-12.md"), "Sample 2026 09 12");
});

test("a trailing slash does not stop a founder opening their own people folder", () => {
  assert.ok(sameFileName("people/", "people"));
  assert.ok(sameFileName("people", "people/"));
  assert.ok(!sameFileName("people", "peoples"));
});

test("a founder confirms their zone by reading a clock, so the clock is right", () => {
  const at = new Date("2026-09-25T20:12:00Z");
  assert.equal(formatClock(at, "America/New_York"), "4:12 pm");
  assert.equal(formatClock(at, "Europe/London"), "9:12 pm");
  // An unknown zone must not blank the screen or throw.
  assert.equal(formatClock(at, "Nowhere/Nothing"), "");
});

test("dates read as a person would say them", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  assert.equal(formatDay("2026-09-12T09:00:00Z", now), "12 Sep");
  assert.equal(formatDay("2025-12-01T09:00:00Z", now), "1 Dec 2025");
  assert.equal(formatDay("not a date", now), "");
});

test("changed today says today, because today is the thing worth noticing", () => {
  const now = new Date("2026-09-25T20:30:00Z");
  assert.equal(formatWhen("2026-09-25T20:12:00Z", "America/New_York", now), "today at 4:12 pm");
  assert.equal(formatWhen("2026-09-24T20:12:00Z", "America/New_York", now), "yesterday");
  assert.equal(formatWhen("2026-09-12T20:12:00Z", "America/New_York", now), "12 Sep");
  assert.equal(formatWhen(null, "America/New_York", now), "");
});
