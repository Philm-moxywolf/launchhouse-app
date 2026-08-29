/// <reference types="node" />
/**
 * src/web/lib/markdown.test.ts
 *
 * WHAT IT IS. The tests for the markdown reader.
 *
 * WHY IT EXISTS. This reader is fed founder files, which are written by a model, which
 * means it is fed whatever a model writes when a founder pastes something odd into an
 * interview. The property that has to hold is that nothing it produces is markup: every
 * value is text, and the components turn text into elements. The link case is the one place
 * a scheme could sneak in, so it is checked directly.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseSpans } from "./markdown.ts";

test("headings, paragraphs and lists come out as blocks", () => {
  const blocks = parseMarkdown("# Your Brain\n\nA line.\n\n- one\n- two\n\n1. first\n2. second\n");
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "paragraph", "bullets", "numbers"]);
  const bullets = blocks[2];
  assert.equal(bullets?.kind === "bullets" ? bullets.items.length : 0, 2);
});

test("a fenced block keeps its lines exactly, because that is usually a scope or an id", () => {
  const blocks = parseMarkdown("Before\n\n```\nsocialplanner/post.write\ncontacts.readonly\n```\n\nAfter");
  const code = blocks.find((b) => b.kind === "code");
  assert.equal(code?.kind === "code" ? code.text : "", "socialplanner/post.write\ncontacts.readonly");
});

test("a pipe table becomes a table rather than a wall of pipes", () => {
  const blocks = parseMarkdown("| File | Gate |\n| --- | --- |\n| founder-brain.md | A |\n");
  const table = blocks[0];
  assert.equal(table?.kind, "table");
  if (table?.kind === "table") {
    assert.deepEqual(table.head, ["File", "Gate"]);
    assert.deepEqual(table.rows, [["founder-brain.md", "A"]]);
  }
});

test("a quote is a quote, and consecutive quoted lines are one block", () => {
  const blocks = parseMarkdown("> You are 7th in line.\n> Your place is held.\n");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "quote");
});

test("bold, italic and inline code survive as spans and never as markup", () => {
  const spans = parseSpans("This is **bold**, this is *soft*, this is `code`.");
  assert.deepEqual(spans.map((s) => s.kind), ["text", "strong", "text", "em", "text", "code", "text"]);
});

test("only http and https become links, and anything else stays as visible text", () => {
  const good = parseSpans("[my feed](https://example.com/feed.xml)");
  assert.equal(good[0]?.kind, "link");
  for (const bad of ["[x](javascript:alert(1))", "[x](data:text/html,hi)", "[x](/local/path)"]) {
    const spans = parseSpans(bad);
    assert.equal(spans[0]?.kind, "text", `${bad} must not become a link`);
  }
});

test("windows line endings and a trailing newline do not change the blocks", () => {
  const unix = parseMarkdown("# One\n\nTwo\n");
  const windows = parseMarkdown("# One\r\n\r\nTwo\r\n");
  assert.deepEqual(unix, windows);
});

test("an empty file is no blocks, not one empty paragraph", () => {
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseMarkdown("\n\n   \n"), []);
});
