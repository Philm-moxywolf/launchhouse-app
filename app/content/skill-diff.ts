/**
 * app/content/skill-diff.ts
 *
 * WHAT IT IS
 * A line diff between each ported skill body in `app/content/skills/` and the
 * byte-for-byte original in the vendored content repo, plus the check that
 * every difference it finds was authorised in advance.
 *
 * WHY IT EXISTS
 * The prose is the product. It is edited in the public content repo and
 * consumed here, and the app's nine bodies have to differ from it, so they are
 * copied in and adapted. Copies drift. A founder-facing sentence quietly
 * diverging from the reviewed original is the exact failure this prevents: 130
 * people would be reading text nobody signed off, and the public repo would no
 * longer describe what they were sent. The allowlist is the section 3
 * adaptation table of `planning/REPLIT-BUILD.md`, written out so a machine can
 * hold it. A new prose change means adding a row on purpose.
 *
 * THE ORIGINALS ARE NO LONGER READ ONLY, SO SOMETHING ELSE HAS TO HOLD THEM.
 * They used to be a git submodule, which a founder's fork cannot fetch, so they
 * are now ordinary committed files. That makes them writeable, and the cheapest
 * way to silence this check became "edit the original instead of the port".
 * `app/content/content-pin.ts` closes that: every vendored file is recorded by
 * its git blob hash against a named commit of the public repo. Read the two
 * files together, because on their own neither is enough.
 *
 * WHAT CALLS IT
 * `app/tests/skill-diff.test.ts`. Nothing at runtime.
 *
 * WHAT IT READS
 * `app/content/skills/<name>/SKILL.md` and, through `contentRepoRoot()`, the
 * originals at `<content repo>/plugins/growth-engine/skills/<name>/SKILL.md`.
 *
 * WHAT IT WRITES
 * Nothing. It returns violations.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PORT_ALLOWLIST,
  PORT_REWRITES,
  PORTED_SKILLS,
  TRACK_BLOCKS,
} from "./skill-allowlist.ts";
import type { AllowRule } from "./skill-allowlist.ts";

/** One contiguous run of changed lines. `removed` is from the original. */
export interface Hunk {
  readonly removed: readonly string[];
  readonly added: readonly string[];
}

export interface Violation {
  readonly skill: string;
  readonly kind:
    | "unallowed-change"
    | "rule-unused"
    | "rule-count"
    | "missing-port"
    | "missing-original"
    | "lost-verbatim"
    | "should-be-gone"
    | "track-block";
  readonly detail: string;
}

/** One `<!-- TRACK:x -->` block found in a ported body. */
export interface ParsedTrackBlock {
  readonly track: string;
  readonly firstLine: string;
  readonly lastLine: string;
}

const TRACK_OPEN = /^<!-- TRACK:([a-z0-9-]+) -->$/;
const TRACK_CLOSE = "<!-- /TRACK -->";

/**
 * Read the track marker blocks out of a body.
 *
 * Throws on an unbalanced or nested marker rather than doing its best. The
 * assembler strips non-matching blocks before the body reaches the model, so a
 * marker the parser guessed at is a founder reading the other track's prose.
 */
export function parseTrackBlocks(text: string): ParsedTrackBlock[] {
  const blocks: ParsedTrackBlock[] = [];
  let open: string | null = null;
  let body: string[] = [];

  for (const line of toLines(text)) {
    const opened = TRACK_OPEN.exec(line);
    const openedTrack = opened?.[1];
    if (openedTrack !== undefined) {
      if (open) throw new Error(`nested track marker: ${line}`);
      open = openedTrack;
      body = [];
      continue;
    }
    if (line === TRACK_CLOSE) {
      if (!open) throw new Error("a track marker was closed without being opened");
      const real = body.filter((l) => l.trim() !== "");
      const firstLine = real[0];
      const lastLine = real[real.length - 1];
      if (firstLine === undefined || lastLine === undefined) {
        throw new Error(`empty track block: ${open}`);
      }
      blocks.push({ track: open, firstLine, lastLine });
      open = null;
      continue;
    }
    if (open) body.push(line);
  }

  if (open) throw new Error(`track marker ${open} was never closed`);
  return blocks;
}

/**
 * Assert the track blocks in a ported body are exactly the ones declared, in
 * order. Wrapping the wrong branch is what this catches.
 */
export function checkTrackBlocks(name: string, ported: string): Violation[] {
  const want = TRACK_BLOCKS.filter((b) => b.skill === name);
  let got: ParsedTrackBlock[];
  try {
    got = parseTrackBlocks(ported);
  } catch (err) {
    return [{ skill: name, kind: "track-block", detail: (err as Error).message }];
  }

  if (got.length !== want.length) {
    return [
      {
        skill: name,
        kind: "track-block",
        detail: `expected ${want.length} track block(s), found ${got.length}`,
      },
    ];
  }

  const out: Violation[] = [];
  want.forEach((expected, i) => {
    const actual = got[i];
    if (actual === undefined) {
      out.push({ skill: name, kind: "track-block", detail: `track block ${i + 1} is missing` });
      return;
    }
    if (
      actual.track !== expected.track ||
      actual.firstLine !== expected.firstLine ||
      actual.lastLine !== expected.lastLine
    ) {
      out.push({
        skill: name,
        kind: "track-block",
        detail:
          `track block ${i + 1} is not the declared one.\n` +
          `  want ${expected.track}: ${expected.firstLine}\n` +
          `        ...to: ${expected.lastLine}\n` +
          `  got  ${actual.track}: ${actual.firstLine}\n` +
          `        ...to: ${actual.lastLine}`,
      });
    }
  });
  return out;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** `app/content/` -> `app/` -> the repo root. */
export const APP_ROOT = join(HERE, "..");
export const REPO_ROOT = join(APP_ROOT, "..");
export const PORTED_SKILLS_DIR = join(HERE, "skills");

/**
 * Where the untouched originals live: the vendored copy, and nowhere else.
 *
 * THERE IS NO OVERRIDE ANY MORE, AND THAT IS THE POINT. This used to accept
 * `GE_CONTENT_ROOT` so the diff could run before the submodule was checked out.
 * There is no such moment now. The originals are ordinary committed files in
 * this repository, present in every clone, fork and remix, so a variable that
 * aimed the comparison at a different tree could only ever weaken it. A diff
 * test that can be pointed somewhere else by an environment variable is not a
 * diff test, and this one can no longer be pointed anywhere.
 *
 * What stops the vendored copy from simply being edited to match a changed port
 * is `vendor/content-pin.json`: every file under `vendor/growth-engine/` is
 * recorded by its git blob hash, so "the original" means a named commit of the
 * public repo rather than whatever is on this machine. See
 * `app/content/content-pin.ts` and the test beside it.
 */
export function contentRepoRoot(): string {
  const vendored = join(REPO_ROOT, "vendor", "growth-engine");
  if (existsSync(join(vendored, "plugins", "growth-engine", "skills"))) return vendored;

  throw new Error(
    [
      "The vendored content is missing, so there is nothing to diff the ported prose against.",
      "This is not a submodule any more, so there is nothing to initialise. The files are committed to",
      "this repository, and a checkout without them is an incomplete checkout.",
      `Looked for: ${join(vendored, "plugins", "growth-engine", "skills")}`,
      "Fix: restore the working tree, or re-vendor with",
      "  npm run engine:bump -- --to <ref> --from <a checkout of Philm-moxywolf/Atlanta>",
    ].join("\n"),
  );
}

export function originalSkillPath(root: string, name: string): string {
  return join(root, "plugins", "growth-engine", "skills", name, "SKILL.md");
}

export function portedSkillPath(name: string): string {
  return join(PORTED_SKILLS_DIR, name, "SKILL.md");
}

/**
 * Split on newlines without swallowing the trailing blank a well-formed file
 * ends with. Comparing that blank is the point: a port that lost the final
 * newline is a changed file and should say so.
 */
export function toLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Longest common subsequence diff, coalesced into hunks.
 *
 * A word diff would be smaller to read and useless here. The unit a reviewer
 * signs off is a sentence on a line, so the unit the allowlist holds is a line.
 * Files are under 200 lines, so the quadratic table costs nothing.
 */
export function diffHunks(a: readonly string[], b: readonly string[]): Hunk[] {
  const n = a.length;
  const m = b.length;
  const stride = m + 1;

  // The LCS length of a[i..] and b[j..], in one flat array rather than an array
  // of arrays. Flat because every read past the end is genuinely zero, so `?? 0`
  // is the right answer rather than a silenced check, and there is no second
  // level of indexing to be undefined about.
  //
  // Filled backwards so the forward walk below can prefer removals first, which
  // is what makes a replaced line coalesce into one hunk instead of two.
  const dp = new Array<number>(stride * (n + 1)).fill(0);
  const at = (i: number, j: number): number => dp[i * stride + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * stride + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const hunks: Hunk[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = (): void => {
    if (removed.length || added.length) hunks.push({ removed, added });
    removed = [];
    added = [];
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const ai = a[i];
    const bj = b[j];
    // Both are in range by the loop condition. The compiler cannot see that,
    // and a silenced check here would be silencing the one flag that catches a
    // parser reading past the end of a founder's file.
    if (ai === undefined || bj === undefined) break;

    if (ai === bj) {
      flush();
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      removed.push(ai);
      i++;
    } else {
      added.push(bj);
      j++;
    }
  }
  for (; i < n; i++) {
    const line = a[i];
    if (line !== undefined) removed.push(line);
  }
  for (; j < m; j++) {
    const line = b[j];
    if (line !== undefined) added.push(line);
  }
  flush();

  return hunks;
}

function sameLines(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((line, k) => line === y[k]);
}

function matches(hunk: Hunk, rule: AllowRule): boolean {
  return sameLines(hunk.removed, rule.removed) && sameLines(hunk.added, rule.added);
}

/** A hunk printed the way a reviewer needs to read it before allowing it. */
export function renderHunk(hunk: Hunk): string {
  return [...hunk.removed.map((l) => `  - ${l}`), ...hunk.added.map((l) => `  + ${l}`)].join("\n");
}

/**
 * Diff one ported skill against its original and report every difference the
 * allowlist does not authorise. Also reports a rule that matched nothing, which
 * is how a stale allowlist gets found instead of quietly widening.
 */
export function checkPortedSkill(name: string, original: string, ported: string): Violation[] {
  const out: Violation[] = [];
  const rules = PORT_ALLOWLIST.filter((r) => r.skill === name);
  const used = new Map<AllowRule, number>(rules.map((r) => [r, 0]));

  for (const hunk of diffHunks(toLines(original), toLines(ported))) {
    const rule = rules.find((r) => matches(hunk, r));
    if (!rule) {
      out.push({
        skill: name,
        kind: "unallowed-change",
        detail:
          "this change is not in the section 3 adaptation table:\n" +
          renderHunk(hunk) +
          "\nFix the port, or add a row to PORT_ALLOWLIST on purpose with the reason.",
      });
      continue;
    }
    used.set(rule, (used.get(rule) ?? 0) + 1);
  }

  for (const rule of rules) {
    const count = used.get(rule) ?? 0;
    if (count === 0) {
      out.push({
        skill: name,
        kind: "rule-unused",
        detail: `allowlist rule (group ${rule.group}) matched nothing, so it is stale: ${rule.why}`,
      });
    } else if (count !== rule.times) {
      out.push({
        skill: name,
        kind: "rule-count",
        detail: `allowlist rule (group ${rule.group}) expected ${rule.times} match(es), found ${count}: ${rule.why}`,
      });
    }
  }

  return out;
}

/**
 * The one skill that is a rewrite rather than a port, so a line diff would say
 * nothing useful. Section 3 group D names the lines that must survive word for
 * word and the subjects that must be gone. Both halves are checked, because
 * "roughly 30 lines survive verbatim" is only meaningful if the right 30 do.
 */
export function checkRewrittenSkill(name: string, ported: string): Violation[] {
  const out: Violation[] = [];
  const rewrite = PORT_REWRITES.find((r) => r.skill === name);
  if (!rewrite) return out;

  for (const line of rewrite.mustSurviveVerbatim) {
    if (!ported.includes(line)) {
      out.push({
        skill: name,
        kind: "lost-verbatim",
        detail: `a line section 3 group D keeps word for word is missing:\n  ${line}`,
      });
    }
  }

  for (const gone of rewrite.mustNotMention) {
    if (gone.pattern.test(ported)) {
      out.push({
        skill: name,
        kind: "should-be-gone",
        detail: `${gone.why}, but the body still matches ${gone.pattern}`,
      });
    }
  }

  return out;
}

/** Run every check. Returns an empty array when the port is clean. */
export function checkAllSkills(): Violation[] {
  const root = contentRepoRoot();
  const out: Violation[] = [];

  for (const skill of PORTED_SKILLS) {
    const portedPath = portedSkillPath(skill.name);
    if (!existsSync(portedPath)) {
      out.push({ skill: skill.name, kind: "missing-port", detail: `no file at ${portedPath}` });
      continue;
    }
    const ported = readFileSync(portedPath, "utf8");

    const originalPath = originalSkillPath(root, skill.origin);
    if (!existsSync(originalPath)) {
      out.push({
        skill: skill.name,
        kind: "missing-original",
        detail: `no original at ${originalPath}. The pin moved and this skill was removed upstream.`,
      });
      continue;
    }

    if (skill.rewritten) {
      out.push(...checkRewrittenSkill(skill.name, ported));
    } else {
      out.push(...checkPortedSkill(skill.name, readFileSync(originalPath, "utf8"), ported));
    }
    out.push(...checkTrackBlocks(skill.name, ported));
  }

  return out;
}
