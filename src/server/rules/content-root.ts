/**
 * content-root.ts: finds the vendored content on disk.
 *
 * WHY IT EXISTS: three rules in this folder refuse to hold their own copy of a
 *   list. prose.ts reads its banned words out of `scripts/validate.sh`, and
 *   gate.ts reads its gate items out of `schemas/gates.md`. Both of those files
 *   come from the public content repo. If the path to that content were written
 *   out in each rule, one of them would eventually be updated and the others
 *   would not, and the rules gate would go quietly half blind. One resolver,
 *   called by all of them, means there is one thing to fix when the layout
 *   moves.
 *
 *   It also fails closed. Missing content is not "no rules to apply", it is a
 *   broken deployment, and it throws at the first call rather than letting a
 *   founder's artifact through unchecked.
 *
 * THE CONTENT IS NOT A SUBMODULE ANY MORE, AND THAT CHANGES WHAT THIS SAYS WHEN
 *   IT FAILS. It used to tell whoever hit the error to run
 *   `git submodule update --init`. That instruction was right when the content
 *   was a pointer to a second, private repository, and it is wrong now: the
 *   files are committed to this repository and arrive with any copy of it, so a
 *   fork, a clone or a Replit remix carries them without fetching anything. A
 *   founder in a staffed room following a stale instruction burns ten minutes
 *   and a mentor, so the message below names the real fault instead.
 *
 *   THERE IS NO SIBLING FALLBACK EITHER. This used to try `../Atlanta`, a
 *   checkout sitting next to the app on a developer machine. That meant a
 *   developer could be running the rules gate against prose that is not what
 *   founders get, and never notice. The app runs on the content the app ships.
 *
 *   AND A GE_CONTENT_ROOT THAT DOES NOT RESOLVE IS AN ERROR, not a fall
 *   through. It was one candidate in a list, so setting it to a stale checkout
 *   or a typo used the vendored copy instead and said nothing. Same shape as
 *   the sibling fallback, same answer.
 *
 * CALLED BY: validate-source.ts, gates-source.ts, ownership.ts, and the tests in
 *            this folder.
 * READS:     GE_CONTENT_ROOT, through src/server/env.ts and never through
 *            process.env, and the filesystem, looking for a directory that holds
 *            both `scripts/validate.sh` and
 *            `plugins/growth-engine/schemas/gates.md`.
 * WRITES:    nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lateSettings } from '../env.ts';

/** The two files that prove a candidate directory really is the content repo. */
const PROOF_FILES = [
  'scripts/validate.sh',
  'plugins/growth-engine/schemas/gates.md',
] as const;

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Candidates in priority order.
 *
 * The vendored copy is the answer. `GE_CONTENT_ROOT` comes first only so a
 * spike or a local experiment can point at a working tree without editing code,
 * and it is a deliberate act by whoever sets it: setting it means the rules gate
 * is checking founder artifacts against prose the deployment does not ship.
 */
function candidates(): string[] {
  const list: string[] = [];
  const override = lateSettings().contentRoot;
  if (override) list.push(override);

  // src/server/rules -> src/server -> src -> repo root
  const appRoot = resolve(HERE, '..', '..', '..');
  list.push(join(appRoot, 'vendor', 'growth-engine'));

  return list;
}

/**
 * The path somebody set on purpose, when they set one.
 *
 * SETTING IT AND GETTING SOMETHING ELSE IS THE FAILURE THIS SEPARATES OUT.
 * `GE_CONTENT_ROOT` used to be one candidate in a list, so pointing it at a tree
 * that is not the content repo, a stale checkout, a typo, a half finished clone,
 * quietly fell through to the vendored copy. Everything then worked, and the
 * person who set it was checking founder artifacts against prose they had not
 * chosen, believing they had chosen it.
 *
 * That is the same shape as the sibling fallback this file already removed, and
 * it gets the same answer: a deliberate act that cannot be honoured is an error,
 * never a downgrade.
 */
function overrideRoot(): string | undefined {
  return lateSettings().contentRoot;
}

function looksLikeContentRepo(dir: string): boolean {
  return PROOF_FILES.every((rel) => existsSync(join(dir, rel)));
}

let cached: string | null = null;

/**
 * The content root, or a thrown error naming every place that was tried.
 *
 * Cached because it is called once per rule per turn and the answer cannot
 * change while the process is alive: the content is committed files, fixed at
 * the moment the deployment was built.
 */
export function contentRoot(): string {
  if (cached !== null) return cached;

  const override = overrideRoot();
  if (override !== undefined && !looksLikeContentRepo(override)) {
    throw new Error(
      [
        'GE_CONTENT_ROOT is set and what it points at is not the content repo.',
        'The rules gate refuses rather than quietly use the vendored copy instead, because then the rules would be',
        'checking founder artifacts against prose nobody chose.',
        `Set to: ${override}`,
        'Looked there for both of these:',
        ...PROOF_FILES.map((f) => `  ${f}`),
        'Fix: point it at a checkout of the content repo, or unset it to use the copy this deployment ships.',
      ].join('\n'),
    );
  }

  const tried = candidates();
  for (const dir of tried) {
    if (looksLikeContentRepo(dir)) {
      cached = dir;
      return cached;
    }
  }

  throw new Error(
    [
      'The rules gate cannot find the content, so it cannot load the banned word list or the gate items.',
      'It refuses to run rather than pass an artifact it has not checked.',
      'Looked for a directory holding both of these:',
      ...PROOF_FILES.map((f) => `  ${f}`),
      'Tried, in order:',
      ...tried.map((d) => `  ${d}`),
      'This content is committed to this repository under vendor/growth-engine. It is not a submodule and there is',
      'nothing to fetch or initialise, so a copy without it is an incomplete copy rather than a missing step.',
      'Fix: restore vendor/growth-engine from git, then run `npm run engine:bump -- --verify` to confirm it is intact.',
    ].join('\n'),
  );
}

/** Read a file from the vendored content. Throws with the full path when absent. */
export function readContentFile(relativePath: string): string {
  const full = join(contentRoot(), relativePath);
  if (!existsSync(full)) {
    throw new Error(
      [
        `The rules gate expected ${relativePath} in the content and it is not there.`,
        `Looked at: ${full}`,
        'Fix: run `npm run engine:bump -- --verify`. It names every vendored file that is missing or changed.',
      ].join('\n'),
    );
  }
  return readFileSync(full, 'utf8');
}

/** Only for tests that need to prove the resolver caches. */
export function resetContentRootCacheForTests(): void {
  cached = null;
}
