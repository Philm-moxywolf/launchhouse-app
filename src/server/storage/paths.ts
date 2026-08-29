/**
 * src/server/storage/paths.ts
 *
 * WHAT THIS IS
 *   Every path decision in the app, in one file: where a founder's folder lives,
 *   which relative paths are allowed inside it, which files the harvest ignores,
 *   and how a person's key becomes a filename.
 *
 * WHY IT EXISTS
 *   It is the tenancy boundary. A founder id reaches this file from a session cookie
 *   and comes out as a directory name; a path reaches it from a model Write, from a
 *   download URL, or from ge's own output, and comes out as somewhere under exactly
 *   one founder's folder or as a thrown error. If a '..' or an absolute path ever
 *   gets through here, founder A reads founder B's prospects, which is the failure
 *   that ends this product. Nothing else in the app is allowed to join a path.
 *
 * WHAT CALLS IT
 *   storage/materialise.ts, storage/harvest.ts, storage/turn.ts, ge/run.ts, and the
 *   file download routes.
 *
 * READS  WORKSPACE_ROOT, through src/server/env.ts and never through process.env. It is
 *        the first segment of every founder path, so a value that is empty or relative
 *        puts every founder's folder somewhere nobody chose. Checked at boot.
 * WRITES nothing. It computes and refuses; it never touches the disk.
 *
 * IT REFUSES RATHER THAN SANITISES. There is no "strip the dots and carry on" branch
 * in this file. A sanitiser turns a hostile path into a plausible one and writes it
 * somewhere; a refusal turns it into a stack trace with the offending string in it.
 * The second is the one that gets fixed.
 */

import { posix as posixPath, resolve, sep } from 'node:path';
import { lateSettings } from '../env.ts';

/** ULID. 26 characters of Crockford base32: no I, L, O or U, so no digit lookalikes. */
export const FOUNDER_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The folder inside a founder's root that holds their work. Byte for byte what a
 * founder had on a laptop, which is what makes the downloaded ZIP the same thing.
 */
export const GE_FOLDER = 'growth-engine';

/**
 * The epoch marker. It sits OUTSIDE growth-engine/ so it is never harvested, never
 * appears in the founder's files view, and never lands in their download.
 *
 * Its meaning is an invariant and the whole materialise/harvest design rests on it:
 *   .ge-epoch present holding V  =>  the folder on disk is byte exact for
 *                                    founder.version = V and holds no unharvested
 *                                    writes.
 *   .ge-epoch absent             =>  the folder tells you nothing. Rebuild it.
 * A turn deletes it before running anything and writes it again only after COMMIT,
 * so a container that dies mid turn leaves the second case, which is the safe one.
 */
export const EPOCH_FILE = '.ge-epoch';

/** Section 5, size limits and failure. Refused politely, before the write. */
export const LIMIT_TOTAL_BYTES = 50 * 1024 * 1024;
export const LIMIT_FILE_BYTES = 2 * 1024 * 1024;
export const LIMIT_FILE_COUNT = 400;

/** A single path segment. Space is allowed; nothing else outside this set is. */
const SEGMENT_RE = /^[A-Za-z0-9._][A-Za-z0-9._ -]*$/;

/** Total length of a relative path. Well under any filesystem limit, and a cap. */
const MAX_REL_PATH_LENGTH = 400;
const MAX_SEGMENT_LENGTH = 200;

export class PathRefused extends Error {
  readonly offending: string;
  constructor(reason: string, offending: string) {
    super(`${reason}: ${JSON.stringify(offending)}`);
    this.name = 'PathRefused';
    this.offending = offending;
  }
}

/**
 * The founder id becomes a directory name, so it is checked before anything is
 * joined to it. A ULID has no dot, no slash and no dash, so a valid one cannot
 * escape a directory even if every other check in this file were removed.
 */
export function assertFounderId(founderId: string): string {
  if (!FOUNDER_ID_RE.test(founderId)) {
    throw new PathRefused('not a founder id', founderId);
  }
  return founderId;
}

/**
 * Where all founder folders live. /tmp/ge in the deployment, a temporary directory
 * under test. Assumption B9 says /tmp has at least 1 GB free and is writable, and
 * that has not been confirmed, so the override exists to move it without a redeploy.
 */
export function workspaceRoot(): string {
  return lateSettings().workspaceRoot;
}

/** /tmp/ge/<founderId>. This is HOME and cwd for every ge spawn. */
export function founderRoot(founderId: string): string {
  return resolve(workspaceRoot(), assertFounderId(founderId));
}

/** /tmp/ge/<founderId>/growth-engine. This is GE_HOME for every ge spawn. */
export function geHome(founderId: string): string {
  return resolve(founderRoot(founderId), GE_FOLDER);
}

/** /tmp/ge/<founderId>/.ge-epoch */
export function epochPath(founderId: string): string {
  return resolve(founderRoot(founderId), EPOCH_FILE);
}

/**
 * Check one relative path and return it normalised to forward slashes.
 *
 * The list of refusals is long on purpose. Each line is a way somebody has escaped a
 * directory in some other codebase, and they are cheap to hold all at once.
 */
export function assertSafeRelPath(rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0) {
    throw new PathRefused('empty path', String(rel));
  }
  if (rel.length > MAX_REL_PATH_LENGTH) {
    throw new PathRefused('path too long', rel);
  }
  // A NUL truncates the string at the syscall boundary, so 'ok.md\0../../etc' opens
  // 'ok.md' in a check and something else in the open. Refuse before anything sees it.
  if (rel.includes('\0')) {
    throw new PathRefused('path contains a null byte', rel);
  }
  // eslint-disable-next-line no-control-regex -- control characters in a filename are the point of this check
  if (/[\u0000-\u001f\u007f]/.test(rel)) {
    throw new PathRefused('path contains a control character', rel);
  }
  if (rel.includes('\\')) {
    throw new PathRefused('path contains a backslash', rel);
  }
  if (rel.startsWith('/')) {
    throw new PathRefused('path is absolute', rel);
  }
  if (/^[A-Za-z]:/.test(rel)) {
    throw new PathRefused('path names a drive', rel);
  }
  if (rel.endsWith('/')) {
    throw new PathRefused('path names a folder, not a file', rel);
  }

  const segments = rel.split('/');
  for (const segment of segments) {
    if (segment.length === 0) {
      throw new PathRefused('path has an empty segment', rel);
    }
    if (segment === '.' || segment === '..') {
      throw new PathRefused('path walks the folder tree', rel);
    }
    if (segment.length > MAX_SEGMENT_LENGTH) {
      throw new PathRefused('path segment too long', rel);
    }
    if (!SEGMENT_RE.test(segment)) {
      // Also catches a leading dash, which ge would read as a flag rather than a
      // filename, and a leading space, which a founder cannot see in a file list.
      throw new PathRefused('path segment has a character that is not allowed', rel);
    }
    if (segment.endsWith(' ') || segment.endsWith('.')) {
      throw new PathRefused('path segment ends in a space or a dot', rel);
    }
  }

  // posix.normalize collapses any remaining oddity. If it changes the string, the
  // string was not what it looked like, and a path that is not what it looks like
  // does not get written.
  const normalised = posixPath.normalize(rel);
  if (normalised !== rel) {
    throw new PathRefused('path is not in its plain form', rel);
  }
  return normalised;
}

/**
 * Turn a relative path into an absolute one inside this founder's growth-engine
 * folder, and prove it landed there.
 *
 * The containment check is belt to assertSafeRelPath's braces. It is here because
 * the two fail differently: assertSafeRelPath refuses a shape, this refuses a
 * result, and a bug that gets past the first is caught by the second.
 */
export function resolveInGeHome(founderId: string, rel: string): string {
  const home = geHome(founderId);
  const safe = assertSafeRelPath(rel);
  const abs = resolve(home, safe);
  if (abs !== home && !abs.startsWith(home + sep)) {
    throw new PathRefused('path resolved outside the founder folder', rel);
  }
  return abs;
}

/**
 * Turn an absolute path under a founder's growth-engine folder back into the
 * relative path that goes in ge_file. Used by the harvest walk.
 */
export function relFromGeHome(founderId: string, abs: string): string {
  const home = geHome(founderId);
  if (!abs.startsWith(home + sep)) {
    throw new PathRefused('path is not inside the founder folder', abs);
  }
  return assertSafeRelPath(abs.slice(home.length + 1).split(sep).join('/'));
}

/**
 * Files the harvest walks past.
 *
 * THE LIST IS SHORT ON PURPOSE. Every path not on it is harvested, including
 * .state/snapshots/, because content addressing makes a snapshot cost one small row
 * and no new blob, and including .state/undone, because that file is what makes
 * pressing undo twice safe and a cold container without it hands the damage back.
 * Adding an entry here means deciding a founder can lose that file. Two entries have
 * earned it:
 *
 *   .state/memory.lock   held by ge remember for the length of one write. Harvested,
 *                        it would be materialised on every later turn and ge remember
 *                        would refuse for ever.
 *   *.ge-tmp.<pid>       ge builds a file whole under a temporary name and moves it
 *                        into place in one step. A turn that died between the two
 *                        leaves one behind. It is half a file by definition.
 */
export function isExcludedPath(rel: string): boolean {
  if (rel === '.state/memory.lock') return true;
  if (rel === EPOCH_FILE) return true;
  const segments = rel.split('/');
  for (const segment of segments) {
    if (/\.ge-tmp\./.test(segment)) return true;
    if (segment === '.DS_Store') return true;
  }
  return false;
}

/**
 * The person filename derive rule, from schemas/person.md.
 *
 *   lower case, every character that is not a letter or a digit becomes a dash,
 *   runs of dashes collapse to one, leading and trailing dashes go, cut to 60.
 *
 * sam@example.com -> sam-example-com,  ig:lumen.skin -> ig-lumen-skin.
 *
 * WHY IT IS HERE and not only in ge: the download route checks a requested slug
 * against this rule, and the deletion flow needs to name the file a purge will
 * destroy. Both would otherwise have to spawn a shell to ask.
 *
 * ge is the authority. If this ever disagrees with scripts/cmd/person.sh, ge wins
 * and this is the bug, exactly as the schema files say.
 */
export function personSlug(key: string): string {
  const dashed = key.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const trimmed = dashed.replace(/^-+/, '').replace(/-+$/, '');
  return trimmed.slice(0, 60).replace(/-+$/, '');
}

/** people/<slug>.md, the only shape a person file path may have. */
export function personFilePath(key: string): string {
  const slug = personSlug(key);
  if (slug.length === 0) throw new PathRefused('key derives an empty slug', key);
  return `people/${slug}.md`;
}

/** Is this relative path a person file? Used by the mentor reduction and the purge. */
export function isPersonFile(rel: string): boolean {
  return /^people\/[a-z0-9][a-z0-9-]{0,59}\.md$/.test(rel);
}
