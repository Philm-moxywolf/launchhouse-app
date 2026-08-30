/**
 * app/content/content-pin.ts
 *
 * WHAT IT IS
 * The record of which commit of the public content repo the files under
 * `vendor/growth-engine/` were copied from, and the check that they are still
 * that commit byte for byte.
 *
 * WHY IT EXISTS
 * The content used to be a git submodule. A submodule is a pointer, not files,
 * so a founder who forks or remixes this app gets an empty directory unless
 * git fetches a second private repository for them. That fetch is a step that
 * can fail in a room of 65 people, and the repository it needs answers 404 to
 * anyone who is not us. So the content is now ordinary committed files.
 *
 * That fixes the install and breaks a guarantee. A submodule cannot be edited
 * from the consuming repo: the originals the drift test compares against were
 * physically read only. Ordinary files are writeable, so the cheapest way to
 * silence `app/tests/skill-diff.test.ts` is now to edit the original instead of
 * the port. Both sides would agree and nobody would be told. This file closes
 * that: every vendored file is recorded by its git blob hash, and the hashes
 * are the same values git itself stores, so the vendored copy can be checked
 * against github.com/Philm-moxywolf/Atlanta at that commit with nothing but
 * `git ls-tree -r <commit>`.
 *
 * It also answers the support question. When a founder says the app told them
 * something odd, the pin says exactly which version of the prose they are
 * running.
 *
 * WHAT CALLS IT
 * `scripts/bump-engine.ts`, which is the only supported writer, and
 * `app/content/content-pin.test.ts`, which is the guard. Nothing at run time
 * reads this: a founder cannot fix a hash mismatch, so the running server is
 * not the place to fail on one. `src/server/rules/content-root.ts` fails closed
 * on content that is *missing*, which is the failure a founder can hit.
 *
 * WHAT IT READS
 * `vendor/content-pin.json` and every file under `vendor/growth-engine/`.
 *
 * WHAT IT WRITES
 * `vendor/content-pin.json`, and only through `writePin`, and only when
 * `scripts/bump-engine.ts` calls it.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `app/content/` -> `app/` -> the repo root. Same walk as skill-diff.ts. */
export const REPO_ROOT = join(HERE, "..", "..");

/** Where the copied content tree lives. The path the submodule used to be at. */
export const VENDORED_CONTENT_ROOT = join(REPO_ROOT, "vendor", "growth-engine");

/**
 * The pin sits beside the tree and not inside it, so `vendor/growth-engine/`
 * stays an exact mirror of one commit with nothing of ours added to it.
 */
export const PIN_PATH = join(REPO_ROOT, "vendor", "content-pin.json");

/** The repository the content is copied from. Written into the pin, and checked. */
export const CONTENT_REPOSITORY = "https://github.com/Philm-moxywolf/Atlanta.git";

/** The two git file modes this tree uses. A symlink (120000) is refused, see below. */
export type FileMode = "100644" | "100755";

export interface PinnedFile {
  readonly mode: FileMode;
  readonly sha1: string;
}

export interface ContentPin {
  readonly repository: string;
  readonly commit: string;
  readonly ref: string;
  readonly vendoredAt: string;
  readonly vendoredTo: string;
  readonly fileCount: number;
  /** `git rev-parse <commit>^{tree}`. Informational, and checkable by hand. */
  readonly commitTree: string;
  /** sha256 of `manifestText`, so one short string stands for the whole tree. */
  readonly manifestDigest: string;
  /** path -> `"<mode> <sha1>"`. One line per file, so a pin diff reads as a file list. */
  readonly files: Readonly<Record<string, string>>;
}

export type PinViolationKind =
  | "pin-missing"
  | "pin-malformed"
  | "pin-self-inconsistent"
  | "tree-missing"
  | "file-missing"
  | "file-changed"
  | "mode-changed"
  | "file-extra"
  | "symlink"
  | "refused-content";

export interface PinViolation {
  readonly kind: PinViolationKind;
  readonly path: string;
  readonly detail: string;
}

/**
 * What may sit inside the vendored tree without being in the pin.
 *
 * Kept as short as it can be. Everything here is created by running something,
 * never by a person editing content, so it may sit on disk without being a
 * problem. That is a different question from what may be PINNED, which is
 * `NEVER_VENDOR` below: `tests/.work` and `growth-engine` appear on both lists
 * on purpose. Allowed to exist, never allowed into the commit.
 *
 * `dist/` and `planning/` are deliberately not here. Neither is ever created by
 * running anything in this tree, so either one turning up is a mistake worth a
 * red test rather than a shrug.
 */
export const IGNORED_IN_VENDOR: ReadonlyArray<{ path: string; why: string }> = [
  { path: "tests/.work", why: "the golden suite's sandbox. Rebuilt from scratch on every run." },
  { path: "growth-engine", why: "a founder folder, if anyone ran `ge init` while standing in here." },
  { path: "node_modules", why: "installed packages, if anyone ran npm in here." },
];

/** Names ignored wherever they appear, rather than at one fixed path. */
const IGNORED_ANYWHERE: readonly string[] = [".DS_Store"];

/**
 * Content that must never be copied in, whatever commit is named.
 *
 * WHY THIS LIST EXISTS AT ALL. A submodule kept the content out of this
 * repository: a pointer carries nothing. Vendoring reverses that. Whatever is in
 * the commit lands in the app repo, and from there in every fork and every
 * remix a founder makes. Vendoring the commit before the current pin proves the
 * point: it carries 22 files of `planning/`, which is the delivery plan, the
 * rates and the mentor briefs, and the app repository's own .gitignore does not
 * exclude them because it has no reason to expect them.
 *
 * So this is checked against the source commit before anything is copied, and
 * against the pin afterwards. The content repo gitignores most of these itself.
 * That is not enough. An upstream .gitignore is a decision made in another
 * repository by somebody who is not thinking about 130 forks, and one commit
 * where it was not yet true is one commit away.
 */
export const NEVER_VENDOR: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /^planning\//,
    why: "internal. Rates, mentor briefs and the delivery plan. It reaches every founder fork from here.",
  },
  {
    pattern: /^growth-engine\//,
    why: "a founder's own output folder. Real people, with names, companies and email addresses, who did not agree to be in anyone's git history.",
  },
  {
    pattern: /^dist\//,
    why: "a build artifact, including a zip nobody reviews line by line.",
  },
  {
    pattern: /(^|\/)\.env(\.|$)/,
    why: "a secrets file. Fail closed: nothing named like an environment file is copied, .env.example included, because the cost of being wrong once is every key in it.",
  },
  {
    pattern: /\.(pem|key|p12|pfx)$/,
    why: "a private key.",
  },
  {
    pattern: /(^|\/)\.work\//,
    why: "a test sandbox, rebuilt on every run. It is scratch, and it is large.",
  },
];

/** Which of these paths must never be vendored, and why. Empty means all clear. */
export function refusedPaths(paths: Iterable<string>): Array<{ path: string; why: string }> {
  const out: Array<{ path: string; why: string }> = [];
  for (const path of paths) {
    const rule = NEVER_VENDOR.find((r) => r.pattern.test(path));
    if (rule !== undefined) out.push({ path, why: rule.why });
  }
  return out;
}

/**
 * The hash git stores for a file's contents: sha1 over `blob <bytes>\0<data>`.
 *
 * Reimplemented here in eleven lines rather than shelling out to git, because
 * the point of the check is that it works in a founder's fork, in CI, and on a
 * machine where the content repo is not reachable at all. Same numbers git
 * prints, so `git ls-tree -r` upstream is a second opinion anyone can get.
 */
export function gitBlobSha1(bytes: Buffer): string {
  return createHash("sha1")
    .update(`blob ${String(bytes.byteLength)}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

/** The canonical text the digest is taken over: sorted, one file per line. */
export function manifestText(files: Readonly<Record<string, string>>): string {
  const lines = Object.keys(files)
    .sort()
    .map((path) => `${files[path] ?? ""} ${path}`);
  return `${lines.join("\n")}\n`;
}

/** One short string standing for the whole tree, for a human to compare. */
export function manifestDigest(files: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(manifestText(files), "utf8").digest("hex");
}

function isMode(value: string): value is FileMode {
  return value === "100644" || value === "100755";
}

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Parse the pin, refusing anything it cannot fully understand.
 *
 * Hand written rather than zod, to match the rest of `app/content/`: nothing in
 * this folder imports the server, so a prose check can run without a database
 * URL and a master key. The messages are the same shape zod's would be, and
 * they name the fix.
 */
export function parsePin(text: string, source: string): ContentPin {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${source} is not valid JSON.\nFix: regenerate it with npm run engine:bump -- --to <ref>`, {
      cause,
    });
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${source} is not a JSON object.`);
  }
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  const str = (key: string, pattern?: RegExp): string => {
    const value = obj[key];
    if (typeof value !== "string" || value === "") {
      throw new Error(`${source}: "${key}" is missing or not a non-empty string.`);
    }
    if (pattern && !pattern.test(value)) {
      throw new Error(`${source}: "${key}" is not the expected shape: ${value}`);
    }
    return value;
  };

  const fileCount = obj["fileCount"];
  if (typeof fileCount !== "number" || !Number.isInteger(fileCount) || fileCount <= 0) {
    throw new Error(`${source}: "fileCount" is missing or not a positive whole number.`);
  }

  const filesRaw = obj["files"];
  if (typeof filesRaw !== "object" || filesRaw === null || Array.isArray(filesRaw)) {
    throw new Error(`${source}: "files" is missing or not an object.`);
  }
  const files: Record<string, string> = {};
  for (const [path, value] of Object.entries(filesRaw as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(`${source}: files["${path}"] is not a string.`);
    }
    const parsed = parsePinnedFile(value);
    if (parsed === null) {
      throw new Error(
        `${source}: files["${path}"] is not "<mode> <sha1>": ${value}\n` +
          `Modes are 100644 or 100755. A symlink (120000) is refused on purpose.`,
      );
    }
    files[path] = value;
  }

  return {
    repository: str("repository"),
    commit: str("commit", SHA1),
    ref: str("ref"),
    vendoredAt: str("vendoredAt"),
    vendoredTo: str("vendoredTo"),
    fileCount,
    commitTree: str("commitTree", SHA1),
    manifestDigest: str("manifestDigest", SHA256),
    files,
  };
}

/** `"100644 <sha1>"` split, or null when it is not that. */
export function parsePinnedFile(value: string): PinnedFile | null {
  const parts = value.split(" ");
  const mode = parts[0];
  const sha1 = parts[1];
  if (parts.length !== 2 || mode === undefined || sha1 === undefined) return null;
  if (!isMode(mode) || !SHA1.test(sha1)) return null;
  return { mode, sha1 };
}

export function readPin(path: string = PIN_PATH): ContentPin {
  if (!existsSync(path)) {
    throw new Error(
      [
        `There is no content pin at ${path}, so there is no way to tell which version of the prose this app carries.`,
        "The pin is written by the one supported way to change the content:",
        "  npm run engine:bump -- --to <ref>",
      ].join("\n"),
    );
  }
  return parsePin(readFileSync(path, "utf8"), path);
}

/**
 * Every file under the vendored tree, hashed the way git would.
 *
 * A symlink is reported rather than followed. That is not tidiness: a symlink
 * from `vendor/growth-engine/plugins/growth-engine/skills/` to somebody's own
 * checkout would make the drift test compare the port against whatever that
 * person is editing, and pass. The submodule made that impossible. Refusing
 * symlinks is what puts it back.
 */
export function scanVendoredTree(root: string = VENDORED_CONTENT_ROOT): {
  files: Map<string, PinnedFile>;
  symlinks: string[];
} {
  const files = new Map<string, PinnedFile>();
  const symlinks: string[] = [];

  const ignoredPaths = new Set(IGNORED_IN_VENDOR.map((i) => i.path));

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_ANYWHERE.includes(entry.name)) continue;
      const full = join(dir, entry.name);
      const rel = toPosix(relative(root, full));
      if (ignoredPaths.has(rel)) continue;

      if (entry.isSymbolicLink()) {
        symlinks.push(rel);
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;

      const bytes = readFileSync(full);
      // The execute bit is the whole of git's file mode. Reading it back from
      // the filesystem is what catches a copy that lost it: `bin/ge` without
      // it is a founder's engine that will not start.
      const executable = (lstatSync(full).mode & 0o111) !== 0;
      files.set(rel, { mode: executable ? "100755" : "100644", sha1: gitBlobSha1(bytes) });
    }
  };

  walk(root);
  return { files, symlinks };
}

/** Windows would give backslashes. The pin is written with forward slashes. */
function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/**
 * Compare the pin against the tree on disk. Empty array means the vendored copy
 * is the commit the pin names, byte for byte, execute bits included.
 */
export function verifyVendoredTree(
  pinPath: string = PIN_PATH,
  root: string = VENDORED_CONTENT_ROOT,
): PinViolation[] {
  if (!existsSync(pinPath)) {
    return [{ kind: "pin-missing", path: pinPath, detail: "there is no content pin to check against." }];
  }
  let pin: ContentPin;
  try {
    pin = parsePin(readFileSync(pinPath, "utf8"), pinPath);
  } catch (err) {
    return [{ kind: "pin-malformed", path: pinPath, detail: (err as Error).message }];
  }

  const out: PinViolation[] = [];

  // The pin against itself first. A hand edited entry with the digest left
  // alone is the easiest way to fake a clean tree, so it is the first thing
  // checked and it is checked without touching the disk.
  const recomputed = manifestDigest(pin.files);
  if (recomputed !== pin.manifestDigest) {
    out.push({
      kind: "pin-self-inconsistent",
      path: pinPath,
      detail:
        `the file list in the pin does not add up to the digest the pin records.\n` +
        `  recorded:   ${pin.manifestDigest}\n` +
        `  recomputed: ${recomputed}\n` +
        `Somebody edited the pin by hand. Regenerate it: npm run engine:bump -- --to ${pin.commit}`,
    });
  }
  // Nothing internal, however it got in. Checked against the pin rather than the
  // disk, because the pin is what a reviewer reads and what a fork carries.
  for (const { path, why } of refusedPaths(Object.keys(pin.files))) {
    out.push({
      kind: "refused-content",
      path,
      detail:
        `${why}\nThis is pinned, so it is in this repository and in every founder fork of it. ` +
        "Re-vendor from a commit that does not carry it.",
    });
  }

  const declared = Object.keys(pin.files).length;
  if (declared !== pin.fileCount) {
    out.push({
      kind: "pin-self-inconsistent",
      path: pinPath,
      detail: `"fileCount" says ${String(pin.fileCount)} and the file list holds ${String(declared)}.`,
    });
  }

  if (!existsSync(root)) {
    out.push({
      kind: "tree-missing",
      path: root,
      detail:
        "the vendored content tree is not there at all. This app is supposed to carry its own content, " +
        "so an empty vendor directory means the checkout is incomplete rather than that a submodule was not initialised.",
    });
    return out;
  }

  const { files, symlinks } = scanVendoredTree(root);
  for (const link of symlinks) {
    out.push({
      kind: "symlink",
      path: link,
      detail:
        "the vendored tree holds a symlink. It is refused because a link pointing at somebody's own checkout " +
        "would make the drift test compare the port against a file that is not the reviewed original.",
    });
  }

  for (const [path, value] of Object.entries(pin.files)) {
    const expected = parsePinnedFile(value);
    if (expected === null) continue; // parsePin already refused this shape.
    const actual = files.get(path);
    if (actual === undefined) {
      out.push({ kind: "file-missing", path, detail: `the pin lists it and it is not on disk.` });
      continue;
    }
    if (actual.sha1 !== expected.sha1) {
      out.push({
        kind: "file-changed",
        path,
        detail:
          `the contents differ from the pinned commit.\n` +
          `  pinned: ${expected.sha1}\n` +
          `  ondisk: ${actual.sha1}\n` +
          `Vendored files are a copy of the public repo and are never edited here. Edit it there, then: npm run engine:bump -- --to <ref>`,
      });
    }
    if (actual.mode !== expected.mode) {
      out.push({
        kind: "mode-changed",
        path,
        detail: `the file mode is ${actual.mode} and the pin says ${expected.mode}. An engine script that lost its execute bit will not run.`,
      });
    }
  }

  for (const path of files.keys()) {
    if (!(path in pin.files)) {
      out.push({
        kind: "file-extra",
        path,
        detail:
          "on disk under vendor/growth-engine and not in the pinned commit. The vendored tree is a mirror, so nothing of ours belongs in it.",
      });
    }
  }

  return out;
}

/** A violation list rendered for a person to read. */
export function renderViolations(violations: readonly PinViolation[]): string {
  return violations.map((v) => `[${v.kind}] ${v.path}\n  ${v.detail.split("\n").join("\n  ")}`).join("\n\n");
}

export interface WritePinInput {
  readonly commit: string;
  readonly ref: string;
  readonly commitTree: string;
  readonly vendoredAt: string;
  readonly files: Readonly<Record<string, string>>;
}

/**
 * Write the pin. Only `scripts/bump-engine.ts` calls this, and only after it has
 * materialised the tree and checked every hash against the source commit.
 */
export function writePin(input: WritePinInput, path: string = PIN_PATH): ContentPin {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(input.files).sort()) {
    const value = input.files[key];
    if (value !== undefined) sorted[key] = value;
  }
  const pin: ContentPin = {
    repository: CONTENT_REPOSITORY,
    commit: input.commit,
    ref: input.ref,
    vendoredAt: input.vendoredAt,
    vendoredTo: "vendor/growth-engine",
    fileCount: Object.keys(sorted).length,
    commitTree: input.commitTree,
    manifestDigest: manifestDigest(sorted),
    files: sorted,
  };
  writeFileSync(path, `${JSON.stringify(pin, null, 2)}\n`, "utf8");
  return pin;
}
