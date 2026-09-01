/**
 * app/tests/gates.test.ts
 *
 * WHAT IT IS
 * The test that holds `app/content/gates.ts` to `app/content/gates.md`, and
 * both of them to the schema in the public content repo.
 *
 * WHY IT EXISTS
 * Three copies of the gate lists now exist: the schema `ge index` reads, the
 * markdown the app ships, and the TypeScript the gates screen renders. The
 * schema's own reason for existing is that "the label a founder sees in their
 * index and the list a mentor checks against cannot say two different things".
 * Three copies is three chances to break that. This test makes the second and
 * third copies derived rather than written: edit the markdown without
 * regenerating and it fails, edit the TypeScript by hand and it fails, let the
 * app's markdown drift from the schema and it fails.
 *
 * WHAT IT READS
 * `app/content/gates.md`, `app/content/gates.ts`, `app/content/routes.ts`, and
 * the vendored `plugins/growth-engine/schemas/gates.md`.
 *
 * WHAT IT WRITES
 * Nothing.
 *
 * HOW TO RUN
 *   node --import tsx --test app/tests/gates.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GATES_MD_PATH, parseGatesFile, parseGatesMarkdown } from "../content/gates-parse.ts";
import {
  GATES,
  GATE_FILES,
  GATES_MD_SHA256,
  EMPTINESS_FLOOR_PENDING,
  gateFilesForTrack,
  gatesForFile,
  gatesForTrack,
} from "../content/gates.ts";
import { ROUTES } from "../content/routes.ts";
import { contentRepoRoot } from "../content/skill-diff.ts";

test("gates.ts is what gates.md parses to", () => {
  const parsed = parseGatesFile();
  // Structural equality, both directions, on both tables. If these ever
  // disagree the generator was not run, or the generated file was hand edited.
  assert.deepEqual(
    JSON.parse(JSON.stringify(GATE_FILES)),
    JSON.parse(JSON.stringify(parsed.files)),
    "GATE_FILES has drifted from gates.md. Run: npx tsx app/content/gen-gates.ts",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(GATES)),
    JSON.parse(JSON.stringify(parsed.gates)),
    "GATES has drifted from gates.md. Run: npx tsx app/content/gen-gates.ts",
  );
});

test("the recorded hash is the hash of the gates.md on disk", () => {
  const sha = createHash("sha256").update(readFileSync(GATES_MD_PATH, "utf8"), "utf8").digest("hex");
  assert.equal(
    sha,
    GATES_MD_SHA256,
    "gates.md changed since gates.ts was generated. Run: npx tsx app/content/gen-gates.ts",
  );
});

test("app/content/gates.md is byte for byte the schema in the content repo", () => {
  // REPLIT-BUILD.md section 8 calls this a verbatim port. Verbatim is testable,
  // so it is tested. The app parses this file; `ge index` parses the other one.
  // A difference between them is two answers to what a founder has done.
  const mine = readFileSync(GATES_MD_PATH);
  const theirs = readFileSync(
    join(contentRepoRoot(), "plugins", "growth-engine", "schemas", "gates.md"),
  );
  assert.ok(
    mine.equals(theirs),
    "app/content/gates.md is not identical to plugins/growth-engine/schemas/gates.md",
  );
});

test("the file table has the shape ge index depends on", () => {
  // schemas/gates.md's own two rules: keep the first table first, and never let
  // a later table be read as a file row. Both are structural, so both are
  // asserted rather than trusted.
  assert.equal(GATE_FILES.length, 16);
  const first = GATE_FILES[0];
  assert.ok(first, "the file table is empty");
  assert.equal(first.file, "founder-brain.md");
  assert.deepEqual(first.gates, ["A"]);

  const names = GATE_FILES.map((f) => f.file);
  assert.equal(new Set(names).size, names.length, "a file is listed twice, so the lookup shadows");

  // "gate B or C" is the people folder, and it must resolve to both.
  assert.deepEqual(gatesForFile("people/"), ["B", "C"]);
  // A dash means real work that no gate counts.
  assert.deepEqual(gatesForFile("90-day-plan.md"), []);
  // An unknown file counts towards nothing rather than throwing.
  assert.deepEqual(gatesForFile("not-a-file.md"), []);
});

test("no founder is ever shown the other track's rows", () => {
  // The guarantee gates.md states in its own words, checked rather than assumed.
  for (const track of ["b2b", "b2c"] as const) {
    const other = track === "b2b" ? "b2c" : "b2b";
    for (const row of gateFilesForTrack(track)) {
      assert.notEqual(row.track, other, `${row.file} is a ${other} row and reached a ${track} founder`);
    }
    for (const gate of gatesForTrack(track)) {
      assert.notEqual(gate.track, other);
    }
  }

  // Each track sees three gate lists: A, B, and its own C.
  assert.deepEqual(gatesForTrack("b2b").map((g) => g.id), ["A", "B", "C"]);
  assert.deepEqual(gatesForTrack("b2c").map((g) => g.id), ["A", "B", "C"]);
  assert.equal(gatesForTrack("b2b").filter((g) => g.track === "b2c").length, 0);
});

test("every gate item is marked, and the one that is not is the known one", () => {
  const kinds = new Map<string, string[]>();
  for (const gate of GATES) {
    for (const item of gate.items) {
      kinds.set(item.provedBy, [...(kinds.get(item.provedBy) ?? []), `${gate.id}/${gate.track}: ${item.item}`]);
    }
  }
  assert.deepEqual([...kinds.keys()].sort(), ["file-backed", "see below", "self-reported"]);

  // gates.md:59 says there are two ways and "no third category". There are
  // three. The one exception is the B2C send row, and the prose under it
  // explains why: automating the sends would get accounts restricted, so there
  // is no send log to read, and recording a send with `ge person touch` is what
  // turns it into evidence. Pinning it here means a second "see below" is a
  // test failure and gets a decision rather than a shrug.
  assert.deepEqual(kinds.get("see below"), ["C/b2c: the messages have been sent"]);
});

test("the emptiness floor is still marked pending, not guessed", () => {
  // REPLIT-BUILD.md section 9, open item E5. A guessed byte count would either
  // pass an empty founder-brain.md at gate A or fail an honest short one.
  assert.equal(EMPTINESS_FLOOR_PENDING, true);
});

test("routes.ts and gates.md name the same files and the same gates", () => {
  const known = new Set(GATE_FILES.map((f) => f.file));

  for (const route of ROUTES) {
    for (const file of [...route.produces, ...route.requires]) {
      assert.ok(known.has(file), `routes.ts names ${file}, which gates.md does not list`);
    }

    for (const file of route.produces) {
      const gates = gatesForFile(file);
      if (route.gate === null) {
        assert.deepEqual(
          gates,
          [],
          `route ${route.id} counts towards no gate, but ${file} counts towards ${gates.join(" and ")}`,
        );
      } else {
        assert.ok(
          gates.includes(route.gate),
          `route ${route.id} claims gate ${route.gate}, but gates.md puts ${file} at ${gates.join(" and ") || "no gate"}`,
        );
      }
    }
  }
});

test("routes.ts and gates.md agree on which track sees a file", () => {
  for (const route of ROUTES) {
    for (const file of route.produces) {
      const row = GATE_FILES.find((f) => f.file === file);
      assert.ok(row);
      if (row.track === "both") continue;
      assert.deepEqual(
        [...route.tracks],
        [row.track],
        `gates.md puts ${file} on ${row.track} only, but route ${route.id} is offered to ${route.tracks.join(" and ")}`,
      );
    }
  }
});

test("the parser refuses rather than guessing", () => {
  // A fourth "proved by" value would mean the app deciding for itself what
  // counts as proof at a gate 130 people pass through.
  const src = readFileSync(GATES_MD_PATH, "utf8");
  assert.throws(
    () => parseGatesMarkdown(src.replace("| the thesis is written | file-backed |", "| the thesis is written | probably |")),
    /unknown "proved by" value/,
  );
  // A duplicated file row silently shadows, because the lookup takes the first
  // match. gates.md warns about it in prose; here it is a failure.
  assert.throws(
    () =>
      parseGatesMarkdown(
        src.replace(
          "| content-30.md | gate B | both | 1 |",
          "| content-30.md | gate B | both | 1 |\n| content-30.md | gate C | both | 2 |",
        ),
      ),
    /twice in the file table/,
  );
  assert.throws(() => parseGatesMarkdown("# nothing here"), /no section headed/);
});
