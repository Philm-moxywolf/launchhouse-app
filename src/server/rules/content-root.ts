/**
 * content-root.ts: finds the vendored content repo on disk.
 *
 * WHY IT EXISTS: three rules in this folder refuse to hold their own copy of a
 *   list. prose.ts reads its banned words out of `scripts/validate.sh`, and
 *   gate.ts reads its gate items out of `schemas/gates.md`. Both of those files
 *   live in the other repo. If the path to that repo were written out in each
 *   rule, one of them would eventually be updated and the others would not, and
 *   the rules gate would go quietly half blind. One resolver, called by all of
 *   them, means there is one thing to fix when the layout moves.
 *
 *   It also fails closed. A missing content repo is not "no rules to apply", it
 *   is a broken deployment, and it throws at the first call rather than letting
 *   a founder's artifact through unchecked.
 *
 * CALLED BY: validate-source.ts, gates-source.ts, and the tests in this folder.
 * READS:     GE_CONTENT_ROOT, through src/server/env.ts and never through process.env,
 *            and the filesystem, looking for a directory that holds both
 *            `scripts/validate.sh` and
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
 * The submodule path comes second rather than first so a spike or a local
 * experiment can point at a working tree without editing code. The sibling
 * checkout comes last, and only helps on a developer machine where both repos
 * are cloned next to each other.
 */
function candidates(): string[] {
  const list: string[] = [];
  const override = lateSettings().contentRoot;
  if (override) list.push(override);

  // src/server/rules -> src/server -> src -> repo root
  const appRoot = resolve(HERE, '..', '..', '..');
  list.push(join(appRoot, 'vendor', 'growth-engine'));

  // A sibling checkout, which is how the two repos sit on a developer machine.
  list.push(resolve(appRoot, '..', 'Atlanta'));

  return list;
}

function looksLikeContentRepo(dir: string): boolean {
  return PROOF_FILES.every((rel) => existsSync(join(dir, rel)));
}

let cached: string | null = null;

/**
 * The content repo root, or a thrown error naming every place that was tried.
 *
 * Cached because it is called once per rule per turn and the answer cannot
 * change while the process is alive: the submodule SHA is baked into the
 * deployment.
 */
export function contentRoot(): string {
  if (cached !== null) return cached;

  const tried = candidates();
  for (const dir of tried) {
    if (looksLikeContentRepo(dir)) {
      cached = dir;
      return cached;
    }
  }

  throw new Error(
    [
      'The rules gate cannot find the content repo, so it cannot load the banned word list or the gate items.',
      'It refuses to run rather than pass an artifact it has not checked.',
      'Looked for a directory holding both of these:',
      ...PROOF_FILES.map((f) => `  ${f}`),
      'Tried, in order:',
      ...tried.map((d) => `  ${d}`),
      'Fix: run `git submodule update --init` in the app repo, or set GE_CONTENT_ROOT to a checkout of Philm-moxywolf/Atlanta.',
    ].join('\n'),
  );
}

/** Read a file from the content repo. Throws with the full path when absent. */
export function readContentFile(relativePath: string): string {
  const full = join(contentRoot(), relativePath);
  if (!existsSync(full)) {
    throw new Error(
      `The rules gate expected ${relativePath} in the content repo and it is not there.\nLooked at: ${full}\nFix: check the submodule pin, then run the content repo's own test suite.`,
    );
  }
  return readFileSync(full, 'utf8');
}

/** Only for tests that need to prove the resolver caches. */
export function resetContentRootCacheForTests(): void {
  cached = null;
}
