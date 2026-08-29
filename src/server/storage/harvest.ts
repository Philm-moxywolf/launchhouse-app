/**
 * src/server/storage/harvest.ts
 *
 * WHAT THIS IS
 *   Walking the founder's folder after the work of a turn, hashing every file, and
 *   writing back into Postgres what actually changed.
 *
 * WHY IT EXISTS
 *   THE RULE, stated as a rule: anything written to the container filesystem that
 *   has not been harvested into Postgres is already lost. This file is the only
 *   thing standing between a founder finishing a turn and that sentence being about
 *   them.
 *
 * WHAT CALLS IT
 *   storage/turn.ts, at step 12, inside the same transaction that took the advisory
 *   lock. Nothing else, ever: a harvest outside the lock is two writers.
 *
 * READS  <founderRoot>/growth-engine/**, ge_file
 * WRITES ge_blob, ge_file, ge_file_version
 *
 * WHY HASH INSTEAD OF TRACKING WRITES. One verb can touch four files. ge person
 * touch writes the person file and a snapshot. ge ledger approve writes ledger.md
 * and .state/approved-at. Guessing which files moved is a bug generator. Walking
 * about 60 small files and hashing them takes under a millisecond and cannot be
 * wrong.
 *
 * WHY AN UNEXPLAINED ABSENCE REFUSES THE TURN. A ge_file row with no file on disk
 * has two possible causes. If the path WAS in the materialised set, ge deleted the
 * file, which is normal. If it was NOT, materialise never wrote it, which is data
 * loss in progress. The two need opposite responses and they look identical, so the
 * materialised set is what tells them apart. Comparing against it turns a
 * materialise bug into a refused turn and a page saying try again, instead of a
 * silent DELETE of a founder's work.
 *
 * A SYMLINK REFUSES TOO. The model has Read, Write, Edit, Glob and Grep and no
 * Bash, so it cannot make one. ge does not make one. A symlink in the folder is
 * therefore an anomaly, and following it would let the harvest store bytes from
 * outside the founder's tree under a path inside it.
 */

import { readdir, readFile, lstat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Queryable } from '../db/client.ts';
import { geFile, geFileVersion } from '../db/schema.ts';
import { putBlob } from './blobs.ts';
import { sha256Hex, type DataKey } from './crypto.ts';
import type { MaterialisedSet } from './materialise.ts';
import {
  geHome,
  isExcludedPath,
  LIMIT_FILE_BYTES,
  LIMIT_FILE_COUNT,
  LIMIT_TOTAL_BYTES,
  relFromGeHome,
} from './paths.ts';

/** How deep the walk goes. growth-engine/ is two levels; ten is a runaway guard. */
const MAX_DEPTH = 10;

/**
 * A refusal a founder is allowed to see, once the sentence has been rewritten for
 * them. `code` is what the route switches on; `message` is for the log.
 */
export class HarvestRefused extends Error {
  readonly code:
    | 'unexplained_absence'
    | 'too_many_files'
    | 'file_too_large'
    | 'folder_too_large'
    | 'symlink'
    | 'not_a_file'
    /**
     * A file whose NAME storage/paths.ts will not accept. The model has Write and
     * Edit, so it can name a file anything, and an apostrophe or a bracket in a
     * title is the ordinary way this happens rather than an attack.
     *
     * It was a bare PathRefused before, thrown out of the walk. The turn was refused
     * either way, which is correct, but the class the route switches on has no
     * branch for PathRefused, so the founder met a generic failure and lost the
     * turn with nothing to read. Same refusal, in the shape the surface can render.
     */
    | 'bad_path';
  readonly subject: string;
  constructor(
    code: HarvestRefused['code'],
    subject: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'HarvestRefused';
    this.code = code;
    this.subject = subject;
  }
}

export interface HarvestChange {
  path: string;
  kind: 'new' | 'changed' | 'deleted';
  sha: string | null;
  sizeBytes: number;
  mtime: Date | null;
}

export interface HarvestPlan {
  founderId: string;
  /** The version every row written by this harvest will carry. */
  version: number;
  changes: HarvestChange[];
  /** Files on disk whose bytes are identical to what is already stored. */
  unchangedCount: number;
  fileCount: number;
  totalBytes: number;
  /** Bytes for the new and changed files, keyed by path. Not kept after apply. */
  bytesByPath: Map<string, Buffer>;
  /**
   * Files whose bytes did not change but whose modification time on disk drifted
   * from what is stored. storage/turn.ts puts these back after COMMIT.
   *
   * ge writes several files whole even when the words come out the same, ge index
   * being the obvious one. Without this a warm folder and a rebuilt folder differ in
   * stat, ge index prints a modified column built from that stat, and the founder
   * sees files marked as changed today that nobody changed.
   */
  mtimeResets: Array<{ path: string; mtime: Date }>;
}

interface DiskFile {
  rel: string;
  bytes: Buffer;
  sha: string;
  size: number;
  mtime: Date;
}

/**
 * Walk the folder and read every file that is not excluded.
 *
 * Reads bytes rather than stat-then-read-later, so the hash and the stored content
 * are provably the same bytes. A file that changed between the two would otherwise
 * get a sha that does not match what was stored, and that mismatch only surfaces on
 * a read, weeks later.
 */
async function walk(founderId: string): Promise<DiskFile[]> {
  const home = geHome(founderId);
  const found: DiskFile[] = [];

  async function descend(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // An absent folder is a folder with no files, which is the correct answer for
      // a founder whose first turn has not written anything yet.
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      // lstat, not stat: stat follows a symlink and would report the target's type,
      // which is exactly the thing being checked for.
      const info = await lstat(abs);
      if (info.isSymbolicLink()) {
        const rel = abs.startsWith(home) ? abs.slice(home.length + 1) : abs;
        throw new HarvestRefused('symlink', rel, `${rel} is a shortcut. Nothing here makes one, so the folder is not in a state that can be saved.`);
      }
      if (info.isDirectory()) {
        await descend(abs, depth + 1);
        continue;
      }
      if (!info.isFile()) {
        const rel = abs.startsWith(home) ? abs.slice(home.length + 1) : abs;
        throw new HarvestRefused('not_a_file', rel, `${rel} is neither a file nor a folder.`);
      }
      // paths.ts refuses rather than sanitises, and that refusal is kept: a file
      // whose name it will not accept is not stored under a name close to it. What
      // changes here is only the class, so the surface has something to render and
      // the founder is told which file to rename.
      let rel: string;
      try {
        rel = relFromGeHome(founderId, abs);
      } catch (cause) {
        const shown = abs.startsWith(home) ? abs.slice(home.length + 1) : abs;
        throw new HarvestRefused(
          'bad_path',
          shown,
          `${shown} has a character in its name that cannot be saved. Rename it and ask again.`,
          { cause },
        );
      }
      if (isExcludedPath(rel)) continue;
      if (info.size > LIMIT_FILE_BYTES) {
        throw new HarvestRefused(
          'file_too_large',
          rel,
          `${rel} is ${info.size} bytes and the limit is ${LIMIT_FILE_BYTES}.`,
        );
      }
      const bytes = await readFile(abs);
      found.push({ rel, bytes, sha: sha256Hex(bytes), size: bytes.length, mtime: info.mtime });
    }
  }

  await descend(home, 0);
  return found;
}

/** What one ge_file row looks like to the diff. Kept small so a test can build one. */
export interface StoredFile {
  sha: string;
  mtime: Date;
}

/**
 * The decision, with no database and no filesystem in it.
 *
 * SEPARATED FROM planHarvest ON PURPOSE. This function holds the rule that decides
 * whether a founder keeps a file or loses it, and a rule that can only be exercised
 * through a live Postgres and a real ge spawn is a rule that gets tested once. Here it
 * is a pure function over three arguments, so every branch, including the refusal, has
 * a test that runs on a laptop in milliseconds.
 */
export function diffFiles(args: {
  onDisk: ReadonlyArray<Pick<DiskFile, 'rel' | 'sha' | 'size' | 'mtime'>>;
  stored: ReadonlyMap<string, StoredFile>;
  materialisedPaths: ReadonlySet<string>;
}): {
  changes: HarvestChange[];
  unchangedCount: number;
  mtimeResets: Array<{ path: string; mtime: Date }>;
} {
  const { onDisk, stored, materialisedPaths } = args;
  const changes: HarvestChange[] = [];
  const mtimeResets: Array<{ path: string; mtime: Date }> = [];
  let unchangedCount = 0;

  for (const file of onDisk) {
    const row = stored.get(file.rel);
    if (row === undefined) {
      changes.push({ path: file.rel, kind: 'new', sha: file.sha, sizeBytes: file.size, mtime: file.mtime });
    } else if (row.sha !== file.sha) {
      changes.push({ path: file.rel, kind: 'changed', sha: file.sha, sizeBytes: file.size, mtime: file.mtime });
    } else {
      // Identical bytes. The row is left completely alone, mtime included, so "last
      // changed" in the files view means the content changed and not that something
      // rewrote the file with the same words. ge index rewrites .state/index.md on
      // every run, and a founder should not see that as a change.
      unchangedCount++;
      if (row.mtime.getTime() !== file.mtime.getTime()) {
        mtimeResets.push({ path: file.rel, mtime: row.mtime });
      }
    }
  }

  const seenOnDisk = new Set(onDisk.map((f) => f.rel));
  for (const [path] of stored) {
    if (seenOnDisk.has(path)) continue;
    if (isExcludedPath(path)) {
      // A row for a path the harvest no longer walks. Its absence proves nothing
      // either way, so it is left where it is rather than deleted.
      continue;
    }
    if (!materialisedPaths.has(path)) {
      // THE REFUSAL. The database says this file exists, and materialise never put it
      // on disk, so its absence proves nothing about what ge did. Deleting the row
      // here is how a founder loses a file to a cache bug.
      throw new HarvestRefused(
        'unexplained_absence',
        path,
        `${path} is in the database, was not written to the folder by materialise, and is not on disk. Rolling back rather than deleting it.`,
      );
    }
    changes.push({ path, kind: 'deleted', sha: null, sizeBytes: 0, mtime: null });
  }

  return { changes, unchangedCount, mtimeResets };
}

/**
 * Work out what changed. Reads, refuses, and writes nothing.
 *
 * Split from applying so a test can assert on the plan, and so every refusal happens
 * before the first INSERT. A limit checked after a partial write is a limit that
 * leaves half a turn in the database.
 */
export async function planHarvest(
  tx: Queryable,
  args: { founderId: string; materialised: MaterialisedSet; version: number },
): Promise<HarvestPlan> {
  const { founderId, materialised, version } = args;

  const onDisk = await walk(founderId);

  if (onDisk.length > LIMIT_FILE_COUNT) {
    throw new HarvestRefused(
      'too_many_files',
      String(onDisk.length),
      `the folder holds ${onDisk.length} files and the limit is ${LIMIT_FILE_COUNT}.`,
    );
  }
  const totalBytes = onDisk.reduce((n, f) => n + f.size, 0);
  if (totalBytes > LIMIT_TOTAL_BYTES) {
    throw new HarvestRefused(
      'folder_too_large',
      String(totalBytes),
      `the folder holds ${totalBytes} bytes and the limit is ${LIMIT_TOTAL_BYTES}.`,
    );
  }

  const rows = await tx
    .select({ path: geFile.path, blobSha: geFile.blobSha, mtime: geFile.mtime })
    .from(geFile)
    .where(eq(geFile.founderId, founderId));
  const stored = new Map<string, StoredFile>(
    rows.map((r) => [r.path, { sha: r.blobSha, mtime: r.mtime }]),
  );

  const { changes, unchangedCount, mtimeResets } = diffFiles({
    onDisk,
    stored,
    materialisedPaths: materialised.paths,
  });

  const bytesByPath = new Map<string, Buffer>();
  const byRel = new Map(onDisk.map((f) => [f.rel, f.bytes]));
  for (const change of changes) {
    if (change.kind === 'deleted') continue;
    const bytes = byRel.get(change.path);
    if (bytes) bytesByPath.set(change.path, bytes);
  }

  return {
    founderId,
    version,
    changes,
    unchangedCount,
    fileCount: onDisk.length,
    totalBytes,
    bytesByPath,
    mtimeResets,
  };
}

/**
 * Write the plan into Postgres. Runs inside the turn's transaction, so either all of
 * it lands or none of it does.
 *
 * Every change, deletions included, gets a ge_file_version row. A deletion with no
 * version row is an absence in the history panel, and an absence cannot be restored
 * because nothing says when it went.
 */
export async function applyHarvest(
  tx: Queryable,
  dataKey: DataKey,
  plan: HarvestPlan,
  verb: string | null,
): Promise<void> {
  const { founderId, version } = plan;

  for (const change of plan.changes) {
    if (change.kind === 'deleted') {
      await tx.delete(geFile).where(and(eq(geFile.founderId, founderId), eq(geFile.path, change.path)));
      await tx
        .insert(geFileVersion)
        .values({
          founderId,
          path: change.path,
          version,
          blobSha: ''.padEnd(64, '0'),
          sizeBytes: 0,
          verb,
          deleted: true,
        })
        .onConflictDoNothing();
      continue;
    }

    const bytes = plan.bytesByPath.get(change.path);
    if (!bytes) throw new Error(`harvest plan is missing bytes for ${change.path}`);
    const put = await putBlob(tx, founderId, dataKey, bytes);
    if (put.sha !== change.sha) {
      // The bytes changed between planning and applying, which inside one transaction
      // and one advisory lock should be impossible. Refuse rather than store a row
      // whose sha does not describe what the founder has.
      throw new Error(`bytes for ${change.path} changed during the harvest. Refusing to continue.`);
    }
    const mtime = change.mtime ?? new Date();

    await tx
      .insert(geFile)
      .values({
        founderId,
        path: change.path,
        blobSha: put.sha,
        sizeBytes: put.sizeBytes,
        mtime,
        version,
      })
      .onConflictDoUpdate({
        target: [geFile.founderId, geFile.path],
        set: { blobSha: put.sha, sizeBytes: put.sizeBytes, mtime, version },
      });

    await tx
      .insert(geFileVersion)
      .values({
        founderId,
        path: change.path,
        version,
        blobSha: put.sha,
        sizeBytes: put.sizeBytes,
        verb,
        deleted: false,
      })
      .onConflictDoNothing();
  }
}

/** Plan then apply, which is what a turn wants. Exposed separately for tests. */
export async function harvest(
  tx: Queryable,
  args: {
    founderId: string;
    dataKey: DataKey;
    materialised: MaterialisedSet;
    version: number;
    verb?: string | null;
  },
): Promise<HarvestPlan> {
  const plan = await planHarvest(tx, args);
  await applyHarvest(tx, args.dataKey, plan, args.verb ?? null);
  return plan;
}
