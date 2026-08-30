/**
 * scripts/bump-engine.ts
 *
 * WHAT THIS IS. The one supported way to move this app onto a newer version of
 * the public content repo.
 *
 *   npm run engine:bump                          report, change nothing
 *   npm run engine:bump -- --verify              exit 1 if the vendored copy has been touched
 *   npm run engine:bump -- --to <ref>            re-vendor from a source checkout, print the diff
 *   npm run engine:bump -- --to <ref> --from <p> say where that checkout is
 *
 * WHY IT EXISTS. The content is copied into this repository, and a copy needs a
 * door. Without one door there are as many doors as there are people, and the
 * one thing nobody does by hand is print what changed before accepting it.
 *
 *   THE CONTENT USED TO BE A SUBMODULE. It is ordinary committed files now,
 *   because a founder who forks or remixes this app cannot fetch a private
 *   second repository, and a fetch that can fail is a fetch that will fail in a
 *   room of 65 people on a Monday morning. Files already in the tree cannot fail
 *   to arrive.
 *
 *   THAT TRADE HAS A COST AND THIS SCRIPT IS HALF THE PAYMENT. A submodule
 *   could not be edited from here. Ordinary files can. So every vendored file is
 *   recorded in `vendor/content-pin.json` by the same hash git itself stores,
 *   this script is the only thing that writes that pin, and it writes it only
 *   after checking every copied file against the source commit. The other half
 *   is `app/content/content-pin.test.ts`, which fails the build when the copy and
 *   the pin disagree.
 *
 *   AND THE NINE SKILL BODIES ARE COPIES OF COPIES. `app/content/skills/` holds
 *   adapted versions of nine of the vendored originals, and
 *   `app/content/skill-diff.ts` checks every difference against an allowlist.
 *   Moving the content without reading what moved is how 130 people end up
 *   reading a sentence nobody signed off.
 *
 *   AND THE MOVE INVALIDATES THE GENERATED MAP.
 *   `app/content/skill-bodies.generated.ts` is the cacheable half of every
 *   prompt this app sends. Content that moved without a regeneration is an app
 *   serving yesterday's prose from a map that claims to be today's.
 *
 * IT REPORTS BEFORE IT MOVES, AND IT REFUSES ON A DIRTY SOURCE TREE. A content
 * checkout with uncommitted edits in it is somebody's work in progress. Copying
 * from under that either loses it or produces a diff that describes neither
 * version.
 *
 * IT REPLACES THE TREE IN ONE STEP, OR NOT AT ALL. The new copy is built beside
 * the old one and every file in it is checked before anything is moved. A half
 * written `vendor/growth-engine` is an app whose rules gate cannot find its own
 * gate list, which fails closed and takes the deployment with it.
 *
 * WHAT IT WILL NOT DO. It will not commit, it will not push, and it will not
 * touch `app/content/skills/`. Porting a change into an adapted copy is a
 * reading job with an allowlist beside it, and a script that did it
 * automatically would be a script that edited founder facing prose unattended.
 *
 * WHAT CALLS IT. `npm run engine:bump`. Nothing imports it.
 *
 * WHAT IT READS. `vendor/growth-engine/`, `vendor/content-pin.json`, the nine
 * ported bodies, and, only with `--to`, a checkout of the content repo.
 * WHAT IT WRITES. Nothing at all without `--to`. With it,
 * `vendor/growth-engine/` and `vendor/content-pin.json`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  PIN_PATH,
  REPO_ROOT,
  VENDORED_CONTENT_ROOT,
  parsePinnedFile,
  readPin,
  refusedPaths,
  renderViolations,
  scanVendoredTree,
  verifyVendoredTree,
  writePin,
  type ContentPin,
} from '../app/content/content-pin.ts';
import {
  contentRepoRoot,
  diffHunks,
  originalSkillPath,
  portedSkillPath,
  renderHunk,
  toLines,
} from '../app/content/skill-diff.ts';
import { PORTED_SKILLS } from '../app/content/skill-allowlist.ts';

/** How many changed hunks are printed per skill before the rest are counted. */
const MAX_HUNKS = 6;

/** How many problems are printed before the rest are counted. */
const MAX_PROBLEMS = 20;

/** Where a source checkout is looked for when `--from` is not given. */
const DEFAULT_SOURCE = resolve(REPO_ROOT, '..', 'Atlanta');

/** Built beside the real tree, then moved into place in one step. */
const INCOMING = join(REPO_ROOT, 'vendor', '.growth-engine.incoming');
const OUTGOING = join(REPO_ROOT, 'vendor', '.growth-engine.previous');

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const err = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/**
 * git, with no shell and a fixed argv.
 *
 * `execFileSync` rather than `execSync`: there is no shell, so a ref with a
 * space or a semicolon in it is one argument rather than a second command.
 */
function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function tryGit(cwd: string, ...args: readonly string[]): string | null {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading the source checkout
// ---------------------------------------------------------------------------

/**
 * `git ls-tree -r` at a commit, as the same `"<mode> <sha1>"` map the pin holds.
 *
 * `-z` because a path with a space in it is a path git will quote, and a quoted
 * path parsed as if it were plain is a file silently left out of the copy.
 */
function treeAt(sourceRoot: string, commit: string): Record<string, string> {
  const raw = git(sourceRoot, 'ls-tree', '-r', '-z', commit);
  const files: Record<string, string> = {};
  for (const record of raw.split('\0')) {
    if (record === '') continue;
    // "<mode> <type> <sha1>\t<path>"
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error(`git ls-tree gave a record with no path in it: ${record}`);
    const meta = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    const mode = meta[0];
    const type = meta[1];
    const sha1 = meta[2];
    if (mode === undefined || type === undefined || sha1 === undefined) {
      throw new Error(`git ls-tree gave a record this script cannot read: ${record}`);
    }
    if (type !== 'blob') {
      throw new Error(
        `${path} in the content repo is a ${type}, not a file.\n` +
          'This script copies files. A nested submodule or a symlink would have to be handled on purpose,\n' +
          'because a link is exactly how the vendored originals stop being the reviewed originals.',
      );
    }
    if (parsePinnedFile(`${mode} ${sha1}`) === null) {
      throw new Error(
        `${path} in the content repo has mode ${mode}, which this script refuses to copy.\n` +
          'Only regular files (100644) and executables (100755) are vendored.',
      );
    }
    files[path] = `${mode} ${sha1}`;
  }
  return files;
}

/**
 * Materialise a commit into an empty directory.
 *
 * `git archive` piped into `tar` rather than a checkout, because a checkout
 * needs an index and a work tree of its own and this has to leave the source
 * repository exactly as it found it. Every file is hashed afterwards against the
 * tree listing, so nothing here is taken on trust.
 */
function materialise(sourceRoot: string, commit: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const tar = execFileSync('git', ['archive', '--format=tar', commit], {
    cwd: sourceRoot,
    maxBuffer: 512 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-f', '-', '-C', dest], { input: tar, maxBuffer: 512 * 1024 * 1024 });
}

/**
 * Every copied file, hashed, against the tree listing from the source commit.
 *
 * This is the check that makes the pin worth anything. `git archive` can apply
 * end of line conversion, and a `bin/ge` that arrived with carriage returns is a
 * founder's engine failing with "bad interpreter". Comparing git's own blob
 * hashes catches that, and catches a lost execute bit with it.
 */
function checkMaterialised(dest: string, want: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const { files: got, symlinks } = scanVendoredTree(dest);

  for (const link of symlinks) {
    problems.push(`${link}: came out of the archive as a symlink, which is not vendored.`);
  }

  for (const [path, value] of Object.entries(want)) {
    const expected = parsePinnedFile(value);
    if (expected === null) {
      problems.push(`${path}: the source tree listing is not "<mode> <sha1>": ${value}`);
      continue;
    }
    const actual = got.get(path);
    if (actual === undefined) {
      problems.push(`${path}: in the commit and not in the copy.`);
      continue;
    }
    if (actual.sha1 !== expected.sha1) {
      problems.push(
        `${path}: the copy differs from the commit. commit ${expected.sha1}, copy ${actual.sha1}. ` +
          'Check core.autocrlf here and .gitattributes in the content repo.',
      );
    }
    if (actual.mode !== expected.mode) {
      problems.push(`${path}: mode ${actual.mode} in the copy, ${expected.mode} in the commit.`);
    }
  }

  for (const path of got.keys()) {
    if (!(path in want)) problems.push(`${path}: in the copy and not in the commit.`);
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function describePin(pin: ContentPin | null): string[] {
  if (pin === null) {
    return [
      'content pin:  MISSING. Nothing records which version of the prose this app carries.',
      '              Fix: npm run engine:bump -- --to <ref>',
    ];
  }
  return [
    `content pin:  ${pin.commit} (${pin.ref})`,
    `vendored:     ${String(pin.fileCount)} files into ${pin.vendoredTo}, on ${pin.vendoredAt}`,
    `from:         ${pin.repository}`,
    `tree digest:  ${pin.manifestDigest}`,
    `git tree:     ${pin.commitTree}   (git rev-parse ${pin.commit.slice(0, 12)}^{tree} upstream says the same)`,
  ];
}

/** The nine bodies, vendored original against ported copy, as a readable report. */
function proseDiff(root: string): { changed: number; report: string[] } {
  const report: string[] = [];
  let changed = 0;

  for (const skill of PORTED_SKILLS) {
    // `skill.origin`, not `skill.name`. `help` is a rewrite of the upstream
    // `setup` skill, and diffing it against a file named `help` upstream would
    // report "no original" for the one body that most needs reading.
    const originalPath = originalSkillPath(root, skill.origin);
    const portedPath = portedSkillPath(skill.name);
    if (!existsSync(originalPath)) {
      report.push(`${skill.name}: no original at ${originalPath}. The vendored copy does not carry it.`);
      changed += 1;
      continue;
    }
    const hunks = diffHunks(
      toLines(readFileSync(originalPath, 'utf8')),
      toLines(readFileSync(portedPath, 'utf8')),
    );
    if (hunks.length === 0) {
      report.push(`${skill.name}: identical.`);
      continue;
    }
    changed += 1;
    report.push(`${skill.name}: ${String(hunks.length)} differences from the original.`);
    for (const hunk of hunks.slice(0, MAX_HUNKS)) {
      for (const line of renderHunk(hunk).split('\n')) report.push(`    ${line}`);
    }
    if (hunks.length > MAX_HUNKS) {
      report.push(`    and ${String(hunks.length - MAX_HUNKS)} more. Run the skill diff test to see all of them.`);
    }
  }
  return { changed, report };
}

/** What actually changed in the content between two commits, named file by file. */
function contentDiff(sourceRoot: string, from: string, to: string): string[] {
  if (from === to) return ['the target is the commit already pinned. Nothing in the content moves.'];
  const stat = tryGit(sourceRoot, 'diff', '--stat', '--no-color', from, to);
  if (stat === null) {
    return [`could not diff ${from}..${to} in the source checkout. It may not hold both commits.`];
  }
  if (stat === '') return ['no files changed between the current pin and the target.'];
  return stat.split('\n');
}

// ---------------------------------------------------------------------------
// Argument handling
// ---------------------------------------------------------------------------

interface Args {
  readonly to: string | undefined;
  readonly from: string | undefined;
  readonly verify: boolean;
}

const USAGE =
  'Usage: npm run engine:bump -- [--verify] [--to <ref>] [--from <path to a content checkout>]';

function parseArgs(argv: readonly string[]): Args | string {
  let to: string | undefined;
  let from: string | undefined;
  let verify = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--verify') {
      verify = true;
      continue;
    }
    if (arg === '--to' || arg === '--from') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value after it.\n${USAGE}`;
      if (arg === '--to') to = value;
      else from = value;
      i += 1;
      continue;
    }
    return `unknown argument: ${String(arg)}\n${USAGE}`;
  }
  if (from !== undefined && to === undefined) {
    return `--from only means anything with --to. On its own there is nothing to copy.\n${USAGE}`;
  }
  return { to, from, verify };
}

/** A checkout of the content repo to copy from, or the lines saying why not. */
function findSource(from: string | undefined): string | string[] {
  const candidate = from === undefined ? DEFAULT_SOURCE : resolve(from);
  if (!existsSync(candidate) || !statSync(candidate).isDirectory()) {
    return [
      `there is no directory at ${candidate}.`,
      'Moving the content needs a checkout of the public repo to copy from. The app carries its own copy,',
      'so this is the only operation that needs one.',
      '  git clone https://github.com/Philm-moxywolf/Atlanta.git',
      '  npm run engine:bump -- --to <ref> --from <where you cloned it>',
    ];
  }
  if (tryGit(candidate, 'rev-parse', '--git-dir') === null) {
    return [`${candidate} is not a git checkout, so there is no commit to copy and nothing to pin to.`];
  }
  if (!existsSync(join(candidate, 'plugins', 'growth-engine', 'skills'))) {
    return [
      `${candidate} is a git checkout, but it does not look like the content repo.`,
      'Expected to find plugins/growth-engine/skills inside it.',
    ];
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// The move
// ---------------------------------------------------------------------------

function reVendor(sourceRoot: string, ref: string, currentPin: ContentPin | null): number {
  const dirty = tryGit(sourceRoot, 'status', '--porcelain');
  if (dirty === null) {
    err('could not read the state of the source checkout.');
    return 1;
  }
  if (dirty !== '') {
    err(
      "the source checkout has uncommitted changes in it. Copying from under somebody's work in progress either " +
        'loses it or produces a diff that describes neither version. Commit or stash there first.',
    );
    return 1;
  }

  if (tryGit(sourceRoot, 'fetch', '--all', '--tags') === null) {
    out('could not fetch, so only refs already in that checkout can be reached.');
  }

  const commit = tryGit(sourceRoot, 'rev-parse', `${ref}^{commit}`);
  if (commit === null) {
    err(`${ref} is not a commit that checkout can reach.`);
    return 1;
  }
  const commitTree = tryGit(sourceRoot, 'rev-parse', `${commit}^{tree}`);
  if (commitTree === null) {
    err(`could not read the tree of ${commit}.`);
    return 1;
  }

  const fromLabel = currentPin === null ? 'no current pin' : currentPin.commit.slice(0, 12);
  out('');
  out(`WHAT MOVES IN THE CONTENT (${fromLabel} to ${commit.slice(0, 12)})`);
  if (currentPin === null) {
    out('  there is no current pin, so there is nothing to compare against.');
  } else {
    for (const line of contentDiff(sourceRoot, currentPin.commit, commit)) out(`  ${line}`);
  }
  out('');

  const want = treeAt(sourceRoot, commit);

  // Before anything is copied. Whatever is in the commit lands in this
  // repository and from there in every founder fork of it, so a commit that
  // still carries `planning/` or a founder's own `growth-engine/` folder is
  // refused rather than copied and cleaned up afterwards. The commit before the
  // current pin is exactly such a commit.
  const refused = refusedPaths(Object.keys(want));
  if (refused.length > 0) {
    err('');
    err(`${ref} carries ${String(refused.length)} file(s) that must never be vendored, so nothing was copied.`);
    err('Vendored files reach every founder fork of this app.');
    for (const { path, why } of refused.slice(0, MAX_PROBLEMS)) err(`  ${path}\n    ${why}`);
    if (refused.length > MAX_PROBLEMS) err(`  and ${String(refused.length - MAX_PROBLEMS)} more.`);
    err('Fix: vendor a commit that does not carry them, or remove them upstream first.');
    return 1;
  }

  out(`copying ${String(Object.keys(want).length)} files from ${commit.slice(0, 12)}`);

  materialise(sourceRoot, commit, INCOMING);
  const problems = checkMaterialised(INCOMING, want);
  if (problems.length > 0) {
    rmSync(INCOMING, { recursive: true, force: true });
    err('');
    err('the copy does not match the commit, so nothing was replaced. The vendored content is untouched.');
    for (const p of problems.slice(0, MAX_PROBLEMS)) err(`  ${p}`);
    if (problems.length > MAX_PROBLEMS) err(`  and ${String(problems.length - MAX_PROBLEMS)} more.`);
    return 1;
  }
  out('every copied file matches the commit, contents and file mode.');

  // One step, and reversible until the last line of it.
  rmSync(OUTGOING, { recursive: true, force: true });
  const hadOld = existsSync(VENDORED_CONTENT_ROOT);
  if (hadOld) renameSync(VENDORED_CONTENT_ROOT, OUTGOING);
  try {
    renameSync(INCOMING, VENDORED_CONTENT_ROOT);
  } catch (cause) {
    if (hadOld) renameSync(OUTGOING, VENDORED_CONTENT_ROOT);
    rmSync(INCOMING, { recursive: true, force: true });
    err(`could not put the new copy in place, so the old one was left alone: ${String(cause)}`);
    return 1;
  }
  rmSync(OUTGOING, { recursive: true, force: true });

  const branch = tryGit(sourceRoot, 'rev-parse', '--abbrev-ref', 'HEAD');
  const pin = writePin({
    commit,
    // A ref given as a full sha says nothing a reader can use, so fall back to
    // the branch the source checkout is on.
    ref: ref === commit ? (branch ?? ref) : ref,
    commitTree,
    // Date only. A timestamp would put a change in the diff on every re-vendor
    // of the same commit, and the pin is reviewed by reading its diff.
    vendoredAt: new Date().toISOString().slice(0, 10),
    files: want,
  });
  out(`wrote ${PIN_PATH}`);
  out('');
  for (const line of describePin(pin)) out(line);
  return 0;
}

// ---------------------------------------------------------------------------

/**
 * The pin, or null when there is not one yet.
 *
 * Swallowed rather than thrown, because "there is no pin" is the state this
 * script exists to get out of. Every other command reports the absence and says
 * how to fix it; only `--verify` treats it as a failure.
 */
function currentPin(): ContentPin | null {
  try {
    return readPin();
  } catch {
    return null;
  }
}

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if (typeof parsed === 'string') {
    err(parsed);
    return 2;
  }

  const pin = currentPin();

  out(`content root: ${VENDORED_CONTENT_ROOT}`);
  out('carried as:   ordinary committed files, not a submodule, so a fork needs no second repository');
  for (const line of describePin(pin)) out(line);
  out('');

  if (parsed.to !== undefined) {
    const source = findSource(parsed.from);
    if (Array.isArray(source)) {
      for (const line of source) err(line);
      return 1;
    }
    out(`source:       ${source}`);
    const code = reVendor(source, parsed.to, pin);
    if (code !== 0) return code;
    out('');
  }

  // Always, whether or not anything moved: is the copy on disk the copy the pin
  // describes? Without `--to`, this is the half of the report that matters.
  const violations = verifyVendoredTree();
  if (violations.length === 0) {
    out('vendored copy: matches the pin, file for file.');
  } else {
    out(`vendored copy: ${String(violations.length)} problem(s). It is not the commit the pin names.`);
    out('');
    out(renderViolations(violations.slice(0, MAX_PROBLEMS)));
    if (violations.length > MAX_PROBLEMS) {
      out(`\nand ${String(violations.length - MAX_PROBLEMS)} more.`);
    }
  }
  out('');

  if (parsed.verify) {
    if (violations.length > 0) {
      err('--verify: the vendored content does not match its pin.');
      return 1;
    }
    out('--verify: clean.');
    return 0;
  }

  let root: string;
  try {
    root = contentRepoRoot();
  } catch (cause) {
    err(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }

  const { changed, report } = proseDiff(root);
  out('THE NINE PORTED BODIES, AGAINST THE VENDORED ORIGINALS');
  out(report.join('\n'));
  out('');

  out(
    [
      changed === 0
        ? 'Every ported body matches its original.'
        : `${String(changed)} of the nine ported bodies differ from the original.`,
      '',
      'Differences are not automatically wrong. app/content/skill-allowlist.ts is the list of the',
      'ones that were decided on purpose, and the skill diff test is what checks this report',
      'against it. What is never automatic is porting a change into an adapted copy: that is a',
      'reading job, and this script does not do it.',
      '',
      'After any move:',
      '  npm run skills:gen        rebuild the prompt map, or every founder gets the old prose',
      '  npm test                  the skill diff test and the pin test are both in it',
      '  npm run typecheck',
      '  git add vendor app/content, then commit. Nothing here commits for you.',
      '',
    ].join('\n'),
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
