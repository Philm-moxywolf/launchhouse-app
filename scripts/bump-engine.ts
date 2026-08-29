/**
 * scripts/bump-engine.ts
 *
 * WHAT THIS IS. The safe way to move this app onto a newer version of the public
 * content repo. `npm run engine:bump` reports; `npm run engine:bump -- --to <ref>`
 * moves the pin; both print the prose diff.
 *
 * WHY IT EXISTS. The prose is the product, and it lives in a repo this one does
 * not own.
 *
 *   THE NINE SKILL BODIES ARE COPIES. They are edited in the public content repo
 *   and consumed here, and a submodule cannot be edited from the consuming repo,
 *   so `app/content/skills/` holds adapted copies. `app/content/skill-diff.ts`
 *   checks every difference against an allowlist for exactly that reason. Moving
 *   the content pin without looking at what moved is how 130 people end up
 *   reading a sentence nobody signed off.
 *
 *   AND THE MOVE INVALIDATES THE GENERATED MAP. `app/content/skill-bodies.generated.ts`
 *   is the cacheable half of every prompt this app sends. A pin that moved
 *   without a regeneration is an app serving yesterday's prose from a map that
 *   claims to be today's.
 *
 * IT REPORTS BEFORE IT MOVES, AND IT REFUSES ON A DIRTY TREE. A content checkout
 * with uncommitted edits in it is somebody's work in progress. Moving the pin
 * under that either loses it or produces a diff that describes neither version.
 *
 * WHAT IT WILL NOT DO. It will not commit, it will not push, and it will not
 * touch `app/content/skills/`. Porting a change into an adapted copy is a
 * reading job with an allowlist beside it, and a script that did it
 * automatically would be a script that edited founder facing prose unattended.
 *
 * A NOTE ON THE WORD SUBMODULE. In the deployment the content repo is a
 * submodule at `vendor/growth-engine`. On a laptop it is very often a symlink to
 * a sibling checkout instead, which is why this script asks git what it is
 * looking at rather than assuming, and says so in its first line of output.
 *
 * WHAT CALLS IT. `npm run engine:bump`. Nothing imports it.
 *
 * WHAT IT READS. The content repo checkout, and the nine ported bodies.
 * WHAT IT WRITES. Nothing at all without `--to`. With it, one `git checkout`
 * inside the content checkout.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  REPO_ROOT,
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

/**
 * git, with no shell and a fixed argv.
 *
 * `execFileSync` rather than `execSync`: there is no shell, so a ref with a
 * space or a semicolon in it is one argument rather than a second command.
 */
function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(cwd: string, ...args: readonly string[]): string | null {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
}

/** What `vendor/growth-engine` actually is on this machine. */
function describePin(root: string): string {
  // REPO_ROOT, not APP_ROOT. skill-diff.ts calls the `app/` directory APP_ROOT
  // and the repository REPO_ROOT, and vendor/ sits at the repository.
  const vendored = join(REPO_ROOT, 'vendor', 'growth-engine');
  if (!existsSync(vendored)) return `a checkout at ${root}, not vendored under vendor/growth-engine`;
  const stat = lstatSync(vendored);
  if (stat.isSymbolicLink()) {
    return `a symlink at vendor/growth-engine pointing at ${root}. On a laptop this is normal. In the deployment it is a submodule, and a symlink cannot be pinned.`;
  }
  const modules = join(REPO_ROOT, '.gitmodules');
  const isSubmodule =
    existsSync(modules) && readFileSync(modules, 'utf8').includes('vendor/growth-engine');
  return isSubmodule
    ? 'a git submodule at vendor/growth-engine'
    : 'a plain directory at vendor/growth-engine, which is neither a submodule nor a symlink. Nothing pins it, so nothing can move the pin.';
}

/** The nine bodies, original against ported, as a readable report. */
function proseDiff(root: string): { changed: number; report: string[] } {
  const report: string[] = [];
  let changed = 0;

  for (const skill of PORTED_SKILLS) {
    const originalPath = originalSkillPath(root, skill.name);
    const portedPath = portedSkillPath(skill.name);
    if (!existsSync(originalPath)) {
      report.push(`${skill.name}: no original at ${originalPath}. The content checkout does not carry it.`);
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

function main(argv: readonly string[]): number {
  const root = contentRepoRoot();
  const toIndex = argv.indexOf('--to');
  const target = toIndex >= 0 ? argv[toIndex + 1] : undefined;

  const head = tryGit(root, 'rev-parse', 'HEAD');
  const branch = tryGit(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = tryGit(root, 'status', '--porcelain');

  process.stdout.write(
    [
      `content repo: ${root}`,
      `pinned as:    ${describePin(root)}`,
      `at:           ${head ?? 'not a git checkout'} (${branch ?? 'unknown branch'})`,
      `working tree: ${dirty === null ? 'unknown' : dirty === '' ? 'clean' : `${String(dirty.split('\n').length)} changed files`}`,
      '',
    ].join('\n'),
  );

  if (target !== undefined) {
    if (head === null) {
      process.stderr.write('that content root is not a git checkout, so there is no pin to move.\n');
      return 1;
    }
    if (dirty !== '') {
      process.stderr.write(
        'the content checkout has uncommitted changes in it. Moving the pin under somebody\'s work in progress either loses it or produces a diff that describes neither version. Commit or stash there first.\n',
      );
      return 1;
    }
    const fetched = tryGit(root, 'fetch', '--all', '--tags');
    if (fetched === null) process.stdout.write('could not fetch, so only refs already local can be reached.\n');
    try {
      git(root, 'checkout', target);
    } catch (err) {
      process.stderr.write(`could not check out ${target}: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
    process.stdout.write(`moved to ${tryGit(root, 'rev-parse', 'HEAD') ?? target}\n\n`);
  }

  const { changed, report } = proseDiff(root);
  process.stdout.write(`${report.join('\n')}\n\n`);

  process.stdout.write(
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
      '  npm test                  the skill diff test is in it',
      '  npm run typecheck',
      '',
    ].join('\n'),
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
