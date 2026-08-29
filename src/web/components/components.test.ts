/// <reference types="node" />
/**
 * src/web/components/components.test.ts
 *
 * WHAT IT IS
 * The tests for the small pieces every screen is built out of.
 *
 * WHY IT EXISTS
 * Three properties in here are promises this app makes to a non-technical founder, and each
 * one is a single component away from being broken by accident.
 *
 * Nothing waits without saying what it is waiting for. `Working` takes the sentence as a
 * required prop, so a spinner with no explanation will not compile, and this test only has
 * to prove the sentence reaches the screen.
 *
 * Stopping keeps what was written, and the button says so before it is pressed. The reason
 * founders do not press stop is that they expect to lose the answer.
 *
 * A founder's own file cannot become markup. The markdown reader produces data, never HTML,
 * and this is the test that proves the whole path from a file to the screen escapes.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { markup, screenText } from "../test-fixtures.ts";
import type { FileRow } from "../lib/api.ts";
import { parseMarkdown } from "../lib/markdown.ts";
import { Working } from "./Working.tsx";
import { QueuedNotice } from "./QueuedNotice.tsx";
import { StopButton } from "./StopButton.tsx";
import { FileList, STATUS_WORDS } from "./FileList.tsx";
import { MarkdownView } from "./MarkdownView.tsx";
import { StepProgress } from "./StepProgress.tsx";
import { Composer } from "./Composer.tsx";

const noop = (): void => undefined;

test("waiting always says what it is waiting for", () => {
  const text = screenText(createElement(Working, { what: "Reading your Founder Brain." }));
  assert.ok(text.includes("Reading your Founder Brain."));
  // Screen readers are told as well, because the dots say nothing to them at all.
  assert.ok(markup(createElement(Working, { what: "x" })).includes('role="status"'));
});

test("a queued founder is given a place and told their place is held", () => {
  const text = screenText(createElement(QueuedNotice, { position: 7 }));
  assert.ok(text.includes("7th in line"));
  assert.ok(text.includes("place is held"));
});

test("the stop button says what stopping does before it is pressed", () => {
  const text = screenText(createElement(StopButton, { stopping: false, onStop: noop }));
  assert.ok(text.includes("Stop"));
  assert.ok(text.includes("What is already written stays."));
});

test("a stop in flight says so rather than vanishing", () => {
  const html = markup(createElement(StopButton, { stopping: true, onStop: noop }));
  assert.ok(html.includes("Stopping"));
  assert.ok(html.includes("disabled"));
});

const ROWS: readonly FileRow[] = [
  {
    name: "founder-brain.md",
    gateLabel: "gate A",
    status: "ok",
    sizeBytes: 4184,
    changedAt: "2026-09-12T09:00:00Z",
    kind: "markdown",
    track: "both",
  },
  {
    name: "content-30.md",
    gateLabel: "gate B",
    status: "missing",
    sizeBytes: 0,
    changedAt: null,
    kind: "markdown",
    track: "both",
  },
];

test("a file a founder has made can be downloaded from its own row", () => {
  const html = markup(createElement(FileList, { rows: ROWS, timezone: "America/New_York", emptyMessage: "none" }));
  assert.ok(html.includes('href="/api/files/founder-brain.md/download"'));
});

test("a file that does not exist yet offers nothing to download, and says so", () => {
  const text = screenText(createElement(FileList, { rows: ROWS, timezone: "America/New_York", emptyMessage: "none" }));
  assert.ok(text.includes("Nothing to download yet"));
  assert.ok(!markup(createElement(FileList, { rows: [ROWS[1] as FileRow], timezone: null, emptyMessage: "none" })).includes("/download"));
});

test("a file is named as the thing they made, with the file name still shown underneath", () => {
  const text = screenText(createElement(FileList, { rows: ROWS, timezone: "America/New_York", emptyMessage: "none" }));
  assert.ok(text.includes("Your Founder Brain"));
  assert.ok(text.includes("founder-brain.md"));
});

test("the status of a file is a phrase, never a word out of a schema", () => {
  const text = screenText(createElement(FileList, { rows: ROWS, timezone: "America/New_York", emptyMessage: "none" }));
  assert.ok(text.includes(STATUS_WORDS.ok));
  assert.ok(text.includes(STATUS_WORDS.missing));
  assert.ok(!text.includes(" missing "), "the schema word itself must not reach the screen");
});

test("an empty list explains itself rather than showing nothing", () => {
  const text = screenText(
    createElement(FileList, { rows: [], timezone: null, emptyMessage: "You have not made anything yet." }),
  );
  assert.ok(text.includes("You have not made anything yet."));
});

test("markup inside a founder's own file is shown as text and never rendered", () => {
  const nasty = '<script>alert("x")</script>\n\n<img src=x onerror="alert(1)">';
  const html = markup(createElement(MarkdownView, { blocks: parseMarkdown(nasty) }));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"), "it is still visible to the founder, as text");
});

test("a link with a scheme we do not trust stays as text", () => {
  const html = markup(createElement(MarkdownView, { blocks: parseMarkdown("[click](javascript:alert(1))") }));
  assert.ok(!html.includes("<a "));
  const good = markup(createElement(MarkdownView, { blocks: parseMarkdown("[feed](https://example.com/f.xml)") }));
  assert.ok(good.includes('href="https://example.com/f.xml"'));
  assert.ok(good.includes('rel="noreferrer noopener"'));
});

test("the step counter is announced to a screen reader as well as drawn", () => {
  const html = markup(createElement(StepProgress, { step: 3 }));
  assert.ok(html.includes('role="progressbar"'));
  assert.ok(html.includes('aria-valuenow="3"'));
  assert.ok(html.includes('aria-valuemax="6"'));
  assert.ok(screenText(createElement(StepProgress, { step: 3 })).includes("Step 3 of 6"));
});

test("the composer says which key sends, because that is the one keyboard rule here", () => {
  const text = screenText(
    createElement(Composer, { disabled: false, placeholder: "Type your answer", onSend: noop, onSaveAsFile: noop }),
  );
  assert.ok(text.includes("Enter sends. Shift and Enter starts a new line."));
});

test("the composer is shut while an answer is arriving, so nobody sends twice", () => {
  const html = markup(
    createElement(Composer, { disabled: true, placeholder: "Waiting", onSend: noop, onSaveAsFile: noop }),
  );
  assert.ok(html.includes("disabled"));
});
