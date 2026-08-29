/// <reference types="node" />
/**
 * src/web/lib/csv.test.ts
 *
 * WHAT IT IS. The tests for the CSV reader.
 *
 * WHY IT EXISTS. The first row of the first real content sheet contains a comma, because it
 * is a sentence. Splitting on commas passes a hand written test and fails on a founder's
 * own file, which is the worst way round. Every case here is one a real `content-30.csv`
 * produces.
 *
 * WHAT IT READS AND WRITES. Nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isCsvName, parseCsv } from "./csv.ts";

test("a comma inside a quoted post does not split the cell", () => {
  const rows = parseCsv('date,post\n2026-09-25,"Right, so you sell to builders"\n');
  assert.deepEqual(rows, [
    ["date", "post"],
    ["2026-09-25", "Right, so you sell to builders"],
  ]);
});

test("a quotation mark inside a quoted cell survives", () => {
  const rows = parseCsv('post\n"She said ""no"" twice"\n');
  assert.equal(rows[1]?.[0], 'She said "no" twice');
});

test("a newline inside a quoted cell is part of the cell, not a new row", () => {
  const rows = parseCsv('post\n"Line one\nLine two"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.[0], "Line one\nLine two");
});

test("carriage returns from a spreadsheet export do not produce empty rows", () => {
  const rows = parseCsv("a,b\r\n1,2\r\n");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("a trailing newline does not read as a missing post", () => {
  assert.equal(parseCsv("a\n1\n").length, 2);
  assert.equal(parseCsv("a\n1").length, 2);
});

test("an empty file is no rows", () => {
  assert.deepEqual(parseCsv(""), []);
});

test("a spreadsheet is recognised by its name, whatever case it is written in", () => {
  assert.ok(isCsvName("content-30.csv"));
  assert.ok(isCsvName("CONTENT-30.CSV"));
  assert.ok(!isCsvName("content-30.md"));
});
