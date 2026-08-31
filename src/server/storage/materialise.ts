/**
 * src/server/storage/materialise.ts
 *
 * WHAT THIS IS
 *   Rebuilding a founder's growth-engine folder on the container filesystem from
 *   what Postgres holds, and deciding when that rebuild can be skipped.
 *
 * WHY IT EXISTS
 *   The container filesystem is a cache and is not durable. A founder's second turn
 *   may land on a container that has never seen them. Without this, ge would run
 *   against an empty folder, ge index would report every file missing, and the
 *   founder would be told their work is gone while it sits safely in the database.
 *
 * WHAT CALLS IT
 *   storage/turn.ts, at step 7 of the founder message flow. Nothing else. The set it
 *   returns is what makes the harvest able to tell "ge deleted this file" apart from
 *   "materialise never wrote it", and those two need opposite responses.
 *
 * READS  ge_file, ge_blob, and <founderRoot>/.ge-epoch
 * WRITES <founderRoot>/growth-engine/**, and nothing in the database
 *
 * IT DOES NOT WRITE THE EPOCH. Only storage/turn.ts does, and only after COMMIT.
 * That is the whole safety property: an epoch present means the folder is byte exact
 * for a committed version and holds no unharvested writes, so a container that dies
 * mid turn leaves the epoch absent and the next turn rebuilds instead of trusting a
 * half written folder.
 *
 * CONTENT ADDRESSING CANNOT REPRESENT AN EMPTY DIRECTORY, so a rebuild recreates
 * people/ and .state/snapshots/ when the founder has files at all. ge snapshot does
 * its own mkdir -p, so this is belt to that; people/ has no such guard, and an empty
 * people folder is the normal first state on all 130 machines.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Queryable } from '../db/client.ts';
import { geFile } from '../db/schema.ts';
import { getBlobs } from './blobs.ts';
import type { DataKey } from './crypto.ts';
import { epochPath, founderRoot, geHome, resolveInGeHome } from './paths.ts';

export interface MaterialisedSet {
  founderId: string;
  /** The founder.version this folder represents. */
  version: number;
  /**
   * Every path the database says exists, and that is now proven present on disk.
   * The harvest compares against this. A ge_file row whose path is NOT in here and
   * whose file is absent means materialise never wrote it, which is data loss in
   * progress rather than a deletion.
   */
  paths: ReadonlySet<string>;
  /** True when the folder was rebuilt from Postgres, false when a warm folder was reused. */
  rebuilt: boolean;
  /** Set when a warm folder was found to be incomplete and a rebuild was forced. */
  warmFolderIncomplete?: string;
}

/** Read the epoch marker. Null means the folder tells you nothing. */
export async function readEpoch(founderId: string): Promise<number | null> {
  try {
    const raw = await readFile(epochPath(founderId), 'utf8');
    const value = Number(raw.trim());
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Stamp the folder as byte exact for this version. Called by turn.ts after COMMIT
 * and by nothing else.
 *
 * A failure here is not a turn failure: the work is committed, and the only cost of
 * an unwritten epoch is that the next turn rebuilds. It still throws, so the caller
 * decides, and the caller logs rather than rolling back.
 */
export async function writeEpoch(founderId: string, version: number): Promise<void> {
  await mkdir(founderRoot(founderId), { recursive: true });
  await writeFile(epochPath(founderId), `${version}\n`, 'utf8');
}

/**
 * Say that the folder can no longer be trusted. Called before the work of a turn
 * runs, so that a crash at any point after it leaves the safe state.
 */
export async function invalidateEpoch(founderId: string): Promise<void> {
  await rm(epochPath(founderId), { force: true });
}

/** Remove a founder's whole scratch folder. Used on rollback and on eviction. */
export async function removeFounderFolder(founderId: string): Promise<void> {
  await rm(founderRoot(founderId), { recursive: true, force: true });
}

async function fileExists(abs: string): Promise<boolean> {
  try {
    const s = await stat(abs);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Put the folder in the state the database says it should be in, and report exactly
 * which paths that covers.
 *
 * The warm path is not a bare epoch comparison. It also proves every row's file is
 * actually on disk, because a container that partially cleaned /tmp would otherwise
 * hand the turn a folder that looks fresh and is missing files. Roughly 60 stat
 * calls, once per turn, against the alternative of a founder losing a file.
 */
export async function materialise(
  tx: Queryable,
  args: { founderId: string; dataKey: DataKey; version: number },
): Promise<MaterialisedSet> {
  const { founderId, dataKey, version } = args;

  const rows = await tx
    .select({ path: geFile.path, blobSha: geFile.blobSha, mtime: geFile.mtime })
    .from(geFile)
    .where(eq(geFile.founderId, founderId));

  const epoch = await readEpoch(founderId);
  if (epoch !== null && epoch === version) {
    let incomplete: string | undefined;
    for (const row of rows) {
      if (!(await fileExists(resolveInGeHome(founderId, row.path)))) {
        incomplete = row.path;
        break;
      }
    }
    if (!incomplete) {
      return {
        founderId,
        version,
        paths: new Set(rows.map((r) => r.path)),
        rebuilt: false,
      };
    }
    // Fall through to a rebuild. A warm folder that is missing a file the database
    // holds is a cache fault, not a data fault, and rebuilding is the cheap answer.
    return { ...(await rebuild(tx, founderId, dataKey, version, rows)), warmFolderIncomplete: incomplete };
  }

  return rebuild(tx, founderId, dataKey, version, rows);
}

async function rebuild(
  tx: Queryable,
  founderId: string,
  dataKey: DataKey,
  version: number,
  rows: Array<{ path: string; blobSha: string; mtime: Date }>,
): Promise<MaterialisedSet> {
  const home = geHome(founderId);

  // Remove the whole folder first rather than writing over it. Writing over leaves
  // any file the database no longer holds sitting on disk, where the harvest would
  // then find it and store it again, and a deleted file would come back for ever.
  await rm(home, { recursive: true, force: true });
  await mkdir(home, { recursive: true });

  const blobs = await getBlobs(tx, founderId, dataKey, rows.map((r) => r.blobSha));

  const paths = new Set<string>();
  for (const row of rows) {
    const abs = resolveInGeHome(founderId, row.path);
    const bytes = blobs.get(row.blobSha);
    if (!bytes) {
      // getBlobs already refuses on a missing blob. This is the type narrowing and
      // a second refusal, because writing a zero byte file here would look to the
      // founder exactly like their work being emptied.
      throw new Error(`blob ${row.blobSha.slice(0, 12)} for ${row.path} was not returned. Refusing to continue.`);
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    // Keep the founder's own modification times. Without this every rebuild stamps
    // every file with now, ge index rewrites .state/index.md on the next run, and the
    // founder sees everything they own marked as changed today.
    await utimes(abs, row.mtime, row.mtime);
    paths.add(row.path);
  }

  if (rows.length > 0) {
    await mkdir(join(home, 'people'), { recursive: true });
    await mkdir(join(home, '.state', 'snapshots'), { recursive: true });
  }

  return { founderId, version, paths, rebuilt: true };
}

/**
 * Does this folder still need `ge init` run over it?
 *
 * THE BUG THIS ANSWERS. On a founder's first turn there are no stored files, so
 * `materialise` above leaves a bare empty directory: no `.state`, no `memory.md`,
 * nothing `ge` recognises as its own. Every `ge remember` in that turn then failed.
 * The founder's Brain still wrote, because that goes through a different path, so
 * the failure was invisible except as five refusals inside one answer.
 *
 * It happened on the FIRST TURN OF EVERY FOUNDER, which is 130 people, and the
 * model, asked to explain a refusal it could not see the cause of, invented one and
 * told the founder to run a shell command they have no way to run.
 *
 * `.state` IS THE TEST, not the folder existing. A folder is created by materialise
 * whatever happens; `.state` is created by `ge init` and by nothing else here.
 */
export async function needsInit(founderId: string): Promise<boolean> {
  return !existsSync(join(geHome(founderId), '.state'));
}

/**
 * Make sure the folder and its root exist without materialising anything.
 * Used before a founder's very first turn, when ge init is what will create the
 * contents and ge needs a cwd and a HOME that are already there.
 */
export async function ensureFolder(founderId: string): Promise<void> {
  await mkdir(geHome(founderId), { recursive: true });
}
