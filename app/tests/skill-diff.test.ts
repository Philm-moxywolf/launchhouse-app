/**
 * app/tests/skill-diff.test.ts
 *
 * WHAT IT IS
 * The test that holds the ported skill bodies to the public content repo.
 *
 * WHY IT EXISTS
 * The prose is the product. It is reviewed in the public repo and copied into
 * this private one because it has to change for the app. Two copies drift.
 * Without this test, a sentence edited here would reach 130 founders having
 * been reviewed by nobody, and the public repo would stop describing what they
 * were sent. It also fails when the submodule pin moves and an upstream edit
 * silently does not reach the app.
 *
 * WHAT IT READS
 * `app/content/skills/*` and the vendored originals under
 * `vendor/growth-engine/plugins/growth-engine/skills/*`.
 *
 * WHAT IT WRITES
 * Nothing.
 *
 * HOW TO RUN
 *   node --import tsx --test app/tests/skill-diff.test.ts
 * Before the submodule is checked out, point it at a local content repo:
 *   GE_CONTENT_ROOT=../Atlanta node --import tsx --test app/tests/skill-diff.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  checkAllSkills,
  checkPortedSkill,
  checkTrackBlocks,
  contentRepoRoot,
  diffHunks,
  originalSkillPath,
  parseTrackBlocks,
  portedSkillPath,
  PORTED_SKILLS_DIR,
  toLines,
} from "../content/skill-diff.ts";
import {
  PORTED_SKILLS,
  PORT_ALLOWLIST,
  PORT_REWRITES,
  TRACK_BLOCKS,
} from "../content/skill-allowlist.ts";

test("every ported skill differs from its original only where the allowlist says", () => {
  const violations = checkAllSkills();
  const report = violations.map((v) => `[${v.kind}] ${v.skill}: ${v.detail}`).join("\n\n");
  assert.equal(violations.length, 0, `\n\n${report}\n`);
});

test("the nine skills on disk are exactly the nine that are declared", () => {
  const onDisk = readdirSync(PORTED_SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const declared = PORTED_SKILLS.map((s) => s.name).sort();
  assert.deepEqual(onDisk, declared);
  assert.equal(declared.length, 9);
});

test("every original named by the allowlist still exists upstream", () => {
  // A skill deleted or renamed in the content repo has to be noticed here and
  // not on the Saturday, so this fails loudly rather than skipping.
  const root = contentRepoRoot();
  for (const skill of PORTED_SKILLS) {
    assert.ok(
      existsSync(originalSkillPath(root, skill.origin)),
      `${skill.origin} is gone from the content repo, so ${skill.name} has nothing to diff against`,
    );
  }
});

test("no ported skill mentions a plugin, a surface or a namespaced command", () => {
  // Group A, B and D in one negative assertion, applied to all nine rather than
  // only the ones the table names. A founder never installs anything, never
  // picks a surface and never types a slash command, so none of those words can
  // reach the model and be repeated back.
  const banned: { pattern: RegExp; why: string }[] = [
    { pattern: /\/growth-engine:/, why: "namespaced slash command" },
    { pattern: /\/plugin\b/, why: "plugin command" },
    { pattern: /\bCowork\b/, why: "surface name" },
    { pattern: /\bmarketplace\b/i, why: "install route" },
    { pattern: /check the parent folder/i, why: "the prerequisite folder hunt" },
    { pattern: /home directory/i, why: "the prerequisite folder hunt" },
  ];

  for (const skill of PORTED_SKILLS) {
    const body = readFileSync(portedSkillPath(skill.name), "utf8");
    for (const { pattern, why } of banned) {
      assert.ok(
        !pattern.test(body),
        `${skill.name}/SKILL.md still carries a ${why}, matching ${pattern}`,
      );
    }
  }
});

test("no ported skill carries an em dash or an en dash", () => {
  // The house style rule, applied at the same moment as the diff, so a change
  // that is otherwise allowed cannot smuggle one in.
  for (const skill of PORTED_SKILLS) {
    const body = readFileSync(portedSkillPath(skill.name), "utf8");
    const bad = toLines(body).filter((l) => /[—–]/.test(l));
    assert.deepEqual(bad, [], `${skill.name}/SKILL.md has an em dash or en dash`);
  }
});

test("track markers wrap exactly the declared branches", () => {
  for (const skill of PORTED_SKILLS) {
    const body = readFileSync(portedSkillPath(skill.name), "utf8");
    const violations = checkTrackBlocks(skill.name, body);
    assert.deepEqual(violations, [], violations.map((v) => v.detail).join("\n"));
  }
  // Both files that carry both tracks' prose are covered, and nothing else is.
  assert.deepEqual(
    [...new Set(TRACK_BLOCKS.map((b) => b.skill))].sort(),
    ["content-engine", "founder-brain"],
  );
});

test("the allowlist stays small enough to read", () => {
  // Section 3 says roughly 40 changed lines across nine files. This is not a
  // style preference. The moment the allowlist is long enough that nobody reads
  // it, it stops being a review gate and becomes a rubber stamp.
  const changedLines = PORT_ALLOWLIST.reduce(
    (n, r) => n + (r.removed.length + r.added.length) * r.times,
    0,
  );
  assert.ok(changedLines <= 80, `allowlist authorises ${changedLines} changed lines, expected 80 or fewer`);
});

test("help keeps the lines group D keeps, and drops the subjects group D drops", () => {
  const body = readFileSync(portedSkillPath("help"), "utf8");
  const rewrite = PORT_REWRITES.find((r) => r.skill === "help");
  assert.ok(rewrite);
  for (const line of rewrite.mustSurviveVerbatim) {
    assert.ok(body.includes(line), `help/SKILL.md lost a verbatim line:\n  ${line}`);
  }
  for (const gone of rewrite.mustNotMention) {
    assert.ok(!gone.pattern.test(body), `${gone.why}, but help/SKILL.md matches ${gone.pattern}`);
  }
});

test("every line help keeps verbatim is still in the upstream setup skill", () => {
  // The other half of the rewrite check. Without it, a line could be
  // paraphrased upstream and the app would keep quoting the old wording under
  // the claim that it is verbatim.
  const upstream = readFileSync(originalSkillPath(contentRepoRoot(), "setup"), "utf8");
  const doctor = readFileSync(
    join(contentRepoRoot(), "plugins", "growth-engine", "commands", "doctor.md"),
    "utf8",
  );
  const rewrite = PORT_REWRITES.find((r) => r.skill === "help");
  assert.ok(rewrite);
  for (const line of rewrite.mustSurviveVerbatim) {
    assert.ok(
      upstream.includes(line) || doctor.includes(line),
      `help claims this line is verbatim, but neither setup/SKILL.md nor commands/doctor.md has it:\n  ${line}`,
    );
  }
});

test("the diff itself works: an unallowed edit fails, and the allowlist is exact", () => {
  // A test that only ever runs against clean inputs proves nothing. Feed it a
  // changed line that is not in the table and confirm it refuses.
  const root = contentRepoRoot();
  const original = readFileSync(originalSkillPath(root, "outreach-b2b"), "utf8");
  const ported = readFileSync(portedSkillPath("outreach-b2b"), "utf8");

  assert.deepEqual(checkPortedSkill("outreach-b2b", original, ported), []);

  const tampered = ported.replace(
    "Under 120 words per touch. Shorter converts.",
    "Under 200 words per touch. Longer converts.",
  );
  assert.notEqual(tampered, ported, "the tamper target moved, so this test is no longer testing");

  const found = checkPortedSkill("outreach-b2b", original, tampered);
  assert.ok(
    found.some((v) => v.kind === "unallowed-change"),
    "an edit outside the allowlist was not caught",
  );
});

test("a stale allowlist row fails rather than quietly widening the gate", () => {
  const a = ["one", "two", "three"];
  const b = ["one", "two", "three"];
  assert.deepEqual(diffHunks(a, b), []);
  // status has exactly one row. Diffing the port against itself uses none of
  // them, which must be reported.
  const ported = readFileSync(portedSkillPath("status"), "utf8");
  const found = checkPortedSkill("status", ported, ported);
  assert.ok(found.some((v) => v.kind === "rule-unused"));
});

test("an unbalanced track marker throws instead of guessing", () => {
  assert.throws(() => parseTrackBlocks("<!-- TRACK:b2b -->\nhello\n"), /never closed/);
  assert.throws(() => parseTrackBlocks("hello\n<!-- /TRACK -->\n"), /without being opened/);
  assert.throws(
    () => parseTrackBlocks("<!-- TRACK:b2b -->\n<!-- TRACK:b2c -->\nx\n<!-- /TRACK -->\n"),
    /nested/,
  );
  assert.deepEqual(parseTrackBlocks("<!-- TRACK:b2c -->\n\nx\n\n<!-- /TRACK -->\n"), [
    { track: "b2c", firstLine: "x", lastLine: "x" },
  ]);
});
