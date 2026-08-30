/**
 * app/content/content-pin.test.ts
 *
 * WHAT IT IS
 * The guard that holds `vendor/growth-engine/` to the commit
 * `vendor/content-pin.json` names, and the proof that the guard can actually
 * fail.
 *
 * WHY IT EXISTS
 * The content moved from a git submodule to ordinary committed files so that a
 * founder's fork or Replit remix carries it without fetching a private
 * repository. That removed a failure in a room of 65 people and introduced a
 * quieter one: the originals `app/tests/skill-diff.test.ts` compares the ported
 * prose against are now writeable. Editing the original instead of the port
 * makes both sides agree, the drift test go green, and nobody is told. This
 * test closes that. It also catches a vendored file edited for any other
 * reason, a lost execute bit on `bin/ge`, a symlink pointing the originals at
 * somebody's own checkout, and a pin edited by hand to match.
 *
 * A test that only ever passes proves nothing, so half of what is below builds
 * a small tree on purpose, breaks it in each of those ways, and checks the
 * verifier goes red.
 *
 * WHAT CALLS IT
 * `npm test`. It sits beside its module rather than in `app/tests/` because
 * that is where the rest of `app/content/` and `src/server/rules/` keep theirs.
 *
 * WHAT IT READS
 * `vendor/content-pin.json`, `vendor/growth-engine/`, and temporary trees it
 * builds under the system temp directory.
 *
 * WHAT IT WRITES
 * Only those temporary trees, and it removes them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONTENT_REPOSITORY,
  PIN_PATH,
  VENDORED_CONTENT_ROOT,
  gitBlobSha1,
  manifestDigest,
  parsePinnedFile,
  readPin,
  refusedPaths,
  scanVendoredTree,
  verifyVendoredTree,
  renderViolations,
  writePin,
} from "./content-pin.ts";

// ---------------------------------------------------------------------------
// The real tree
// ---------------------------------------------------------------------------

test("the vendored content matches its pin, file for file", () => {
  const violations = verifyVendoredTree();
  assert.equal(
    violations.length,
    0,
    `\n\nvendor/growth-engine is not the commit vendor/content-pin.json names.\n` +
      `Vendored files are a copy of the public repo and are never edited here.\n\n${renderViolations(violations)}\n`,
  );
});

test("the pin names a real commit of the public content repo", () => {
  const pin = readPin();
  assert.equal(pin.repository, CONTENT_REPOSITORY);
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
  assert.match(pin.commitTree, /^[0-9a-f]{40}$/);
  assert.equal(pin.vendoredTo, "vendor/growth-engine");
  assert.match(pin.vendoredAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(pin.fileCount > 100, `only ${String(pin.fileCount)} files are pinned, which is too few to be the content repo`);
});

/**
 * The files the app reads out of the vendored content, and what reads each one.
 *
 * This list was read out of the code, not guessed at, and it is here so that a
 * re-vendor that drops one fails by name rather than by a count nobody checks.
 * Everything named here is loaded at run time by a founder's turn, except where
 * the note says otherwise.
 */
const MUST_BE_VENDORED: ReadonlyArray<{ path: string; readBy: string }> = [
  // Run time. The rules gate, on every artifact a founder is handed.
  { path: "scripts/validate.sh", readBy: "src/server/rules/validate-source.ts, for prose.ts and no-dm-automation.ts" },
  { path: "plugins/growth-engine/schemas/gates.md", readBy: "src/server/rules/gates-source.ts, for gate.ts" },
  { path: "plugins/growth-engine/schemas/index.md", readBy: "src/server/rules/ownership.ts, which reads the whole schemas folder" },
  { path: "plugins/growth-engine/schemas/person.md", readBy: "src/server/rules/ownership.ts" },
  { path: "plugins/growth-engine/schemas/state.md", readBy: "src/server/rules/ownership.ts" },

  // Run time. The engine itself. bin/ge execs scripts/ge.sh, which sources the
  // rest, so any one of them missing is a founder verb that does nothing.
  { path: "plugins/growth-engine/bin/ge", readBy: "src/server/ge/run.ts, through GE_BIN" },
  { path: "plugins/growth-engine/scripts/ge.sh", readBy: "plugins/growth-engine/bin/ge execs it" },
  { path: "plugins/growth-engine/scripts/lib/paths.sh", readBy: "scripts/ge.sh sources it" },
  { path: "plugins/growth-engine/scripts/cmd/init.sh", readBy: "scripts/ge.sh sources it for `ge init`" },

  // Test and build time. The prose port and the two worked examples.
  { path: "plugins/growth-engine/skills/setup/SKILL.md", readBy: "app/content/skill-diff.ts, as the original behind the help skill" },
  { path: "plugins/growth-engine/commands/doctor.md", readBy: "app/tests/skill-diff.test.ts, for the lines help keeps verbatim" },
  { path: "plugins/growth-engine/assets/examples/b2b-northfield/founder-brain.md", readBy: "src/server/rules/test-fixtures.ts" },
  { path: "plugins/growth-engine/assets/examples/b2c-lumen/founder-brain.md", readBy: "src/server/rules/test-fixtures.ts" },

  // The golden suite, which is the only tested thing in the content repo.
  { path: "tests/run.sh", readBy: "the ge golden suite, run by hand from vendor/growth-engine" },
];

test("every file the app reads out of the content is in the pin", () => {
  const pin = readPin();
  for (const { path, readBy } of MUST_BE_VENDORED) {
    assert.ok(
      path in pin.files,
      `${path} is not vendored, and ${readBy} reads it. A founder fork would be missing it.`,
    );
  }
});

test("the nine skill originals and the twelve schemas are all vendored", () => {
  const pin = readPin();
  const paths = Object.keys(pin.files);

  const skills = paths.filter((p) => /^plugins\/growth-engine\/skills\/[^/]+\/SKILL\.md$/.test(p));
  assert.equal(skills.length, 9, `expected nine skill bodies, found ${String(skills.length)}:\n${skills.join("\n")}`);

  const schemas = paths.filter((p) => /^plugins\/growth-engine\/schemas\/[^/]+\.md$/.test(p));
  assert.equal(schemas.length, 12, `expected twelve schemas, found ${String(schemas.length)}:\n${schemas.join("\n")}`);
});

test("the engine keeps its execute bit, or a founder's ge will not start", () => {
  const pin = readPin();
  const executables = Object.entries(pin.files)
    .filter(([, value]) => parsePinnedFile(value)?.mode === "100755")
    .map(([path]) => path);
  assert.ok(
    executables.includes("plugins/growth-engine/bin/ge"),
    `bin/ge is not marked executable in the pin. Executables in the pin: ${executables.join(", ")}`,
  );

  const { files } = scanVendoredTree();
  assert.equal(
    files.get("plugins/growth-engine/bin/ge")?.mode,
    "100755",
    "bin/ge is not executable on disk. The copy lost the mode, and `ge` will not run.",
  );
});

test("nothing internal is pinned, because a fork carries whatever is", () => {
  const pin = readPin();
  const refused = refusedPaths(Object.keys(pin.files));
  assert.deepEqual(
    refused,
    [],
    `these are vendored and must not be:\n${refused.map((r) => `  ${r.path}: ${r.why}`).join("\n")}`,
  );
});

test("the refusal list catches what the commit before the pin actually carried", () => {
  // Not a hypothetical. Vendoring afb0d56, the commit before the current pin,
  // copies 22 files of planning/ into this repository: the delivery plan, the
  // rates and the mentor briefs. Nothing in the app repo's .gitignore stops
  // them, because nothing there expects them.
  const refused = refusedPaths([
    "planning/DELIVERY-PLAN.md",
    "planning/delivery/00-scope.md",
    "growth-engine/people/sam-northfield-io.md",
    "dist/Launchhouse.zip",
    ".env",
    "config/.env.production",
    "certs/server.pem",
    "tests/.work/dash/01-help/help.out",
  ]);
  assert.equal(refused.length, 8, JSON.stringify(refused, null, 2));

  // And it lets the real content through untouched.
  assert.deepEqual(
    refusedPaths([
      "plugins/growth-engine/skills/status/SKILL.md",
      "plugins/growth-engine/schemas/gates.md",
      "plugins/growth-engine/bin/ge",
      "scripts/validate.sh",
      "tests/run.sh",
      "tests/cases/03-init.sh",
      "docs/PRE-WORK.md",
    ]),
    [],
  );
});

test("the vendored tree holds no symlink", () => {
  // A link is how the originals would stop being the reviewed originals: point
  // skills/ at a working copy and the drift test compares the port against
  // whatever that person is editing.
  const { symlinks } = scanVendoredTree();
  assert.deepEqual(symlinks, []);
});

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

test("gitBlobSha1 gives the same numbers git does", () => {
  // Checked against `git hash-object` on these three inputs. If this ever fails,
  // the pin's hashes are not git's and nobody can verify them upstream.
  assert.equal(gitBlobSha1(Buffer.from("")), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  assert.equal(gitBlobSha1(Buffer.from("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  assert.equal(gitBlobSha1(Buffer.from("what is up, doc?")), "bd9dbf5aae1a3862dd1526723246b20206e5fc37");
});

test("the pin's own file list adds up to the digest it records", () => {
  const pin = readPin();
  assert.equal(manifestDigest(pin.files), pin.manifestDigest);
});

// ---------------------------------------------------------------------------
// Proving the guard can fail
// ---------------------------------------------------------------------------

interface Sandbox {
  readonly dir: string;
  readonly tree: string;
  readonly pin: string;
}

/** A three file tree with a pin that matches it. The starting point is green. */
function sandbox(): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "content-pin-"));
  const tree = join(dir, "growth-engine");
  mkdirSync(join(tree, "bin"), { recursive: true });
  writeFileSync(join(tree, "README.md"), "the original\n");
  writeFileSync(join(tree, "bin", "ge"), "#!/bin/sh\n");
  chmodSync(join(tree, "bin", "ge"), 0o755);

  const { files } = scanVendoredTree(tree);
  const map: Record<string, string> = {};
  for (const [path, file] of files) map[path] = `${file.mode} ${file.sha1}`;

  const pin = join(dir, "content-pin.json");
  writePin(
    { commit: "a".repeat(40), ref: "main", commitTree: "b".repeat(40), vendoredAt: "2026-08-30", files: map },
    pin,
  );
  return { dir, tree, pin };
}

function kinds(box: Sandbox): string[] {
  return verifyVendoredTree(box.pin, box.tree).map((v) => v.kind);
}

test("the sandbox starts clean, so the failures below mean something", () => {
  const box = sandbox();
  try {
    assert.deepEqual(verifyVendoredTree(box.pin, box.tree), []);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a changed vendored file fails, which is the whole point of the pin", () => {
  const box = sandbox();
  try {
    writeFileSync(join(box.tree, "README.md"), "quietly edited to match a changed port\n");
    assert.deepEqual(kinds(box), ["file-changed"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a deleted vendored file fails", () => {
  const box = sandbox();
  try {
    rmSync(join(box.tree, "README.md"));
    assert.deepEqual(kinds(box), ["file-missing"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a lost execute bit fails", () => {
  const box = sandbox();
  try {
    chmodSync(join(box.tree, "bin", "ge"), 0o644);
    assert.deepEqual(kinds(box), ["mode-changed"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a file added to the vendored tree fails", () => {
  const box = sandbox();
  try {
    writeFileSync(join(box.tree, "ours.md"), "not in the public repo\n");
    assert.deepEqual(kinds(box), ["file-extra"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a symlink into somebody's own checkout fails", () => {
  const box = sandbox();
  try {
    rmSync(join(box.tree, "README.md"));
    symlinkSync(join(box.dir, "elsewhere.md"), join(box.tree, "README.md"));
    assert.deepEqual(kinds(box).sort(), ["file-missing", "symlink"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("editing the pin to match an edited file fails too", () => {
  const box = sandbox();
  try {
    // The obvious way to silence the check: change the file, then change the
    // hash beside it. The digest over the whole list is what catches it.
    writeFileSync(join(box.tree, "README.md"), "edited\n");
    const edited = gitBlobSha1(Buffer.from("edited\n"));
    const pin = JSON.parse(readFileSync(box.pin, "utf8")) as { files: Record<string, string> };
    pin.files["README.md"] = `100644 ${edited}`;
    writeFileSync(box.pin, JSON.stringify(pin, null, 2), "utf8");

    assert.deepEqual(kinds(box), ["pin-self-inconsistent"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("an internal file that got into the pin fails", () => {
  const box = sandbox();
  try {
    const pin = JSON.parse(readFileSync(box.pin, "utf8")) as {
      files: Record<string, string>;
      fileCount: number;
      manifestDigest: string;
    };
    // Written the honest way, digest and count included, so the only thing
    // wrong with this pin is what is in it.
    pin.files["planning/DELIVERY-PLAN.md"] = `100644 ${gitBlobSha1(Buffer.from("rates\n"))}`;
    pin.fileCount = Object.keys(pin.files).length;
    pin.manifestDigest = manifestDigest(pin.files);
    writeFileSync(box.pin, JSON.stringify(pin, null, 2), "utf8");
    mkdirSync(join(box.tree, "planning"), { recursive: true });
    writeFileSync(join(box.tree, "planning", "DELIVERY-PLAN.md"), "rates\n");

    assert.deepEqual(kinds(box), ["refused-content"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a missing pin fails rather than passing quietly", () => {
  const box = sandbox();
  try {
    rmSync(box.pin);
    assert.deepEqual(kinds(box), ["pin-missing"]);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("a missing tree fails, and says it is not a submodule problem", () => {
  const box = sandbox();
  try {
    rmSync(box.tree, { recursive: true, force: true });
    const violations = verifyVendoredTree(box.pin, box.tree);
    assert.deepEqual(
      violations.map((v) => v.kind),
      ["tree-missing"],
    );
    assert.match(violations[0]?.detail ?? "", /carry its own content/);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("the golden suite's sandbox does not count as an extra file", () => {
  // The suite writes tests/.work/ every time it runs. If that counted, the pin
  // check would be red for anyone who had run it, and a red check people learn
  // to ignore is not a check.
  const box = sandbox();
  try {
    mkdirSync(join(box.tree, "tests", ".work", "dash"), { recursive: true });
    writeFileSync(join(box.tree, "tests", ".work", "dash", "out.txt"), "scratch\n");
    assert.deepEqual(verifyVendoredTree(box.pin, box.tree), []);
  } finally {
    rmSync(box.dir, { recursive: true, force: true });
  }
});

test("the pin file sits beside the tree and not inside it", () => {
  // Anything of ours inside vendor/growth-engine would show up as an extra file
  // in every check, so the pin lives one level up.
  assert.ok(!PIN_PATH.startsWith(`${VENDORED_CONTENT_ROOT}/`), PIN_PATH);
});
