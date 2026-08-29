/**
 * src/server/storage/blobs.ts
 *
 * WHAT THIS IS
 *   Reading and writing content addressed encrypted blobs. The only code that
 *   touches the ge_blob table.
 *
 * WHY IT EXISTS
 *   Content addressing is what makes the snapshot ring nearly free. ge snapshot
 *   copies a file before overwriting it, so a snapshot's bytes are identical to a
 *   version already stored, and storing by hash turns that into one small ge_file
 *   row and no new blob. Version history forever, for 130 founders, is then a cost
 *   nobody has to think about again.
 *
 *   It also means a write is idempotent. Harvesting the same unchanged file twice
 *   inserts nothing the second time, so a retried turn cannot grow the database.
 *
 * WHAT CALLS IT
 *   storage/materialise.ts reads, storage/harvest.ts writes, the download routes read
 *   (from the database, so a download never waits on a warm cache).
 *
 * READS  ge_blob
 * WRITES ge_blob
 *
 * IT NEVER PARSES A FOUNDER FILE. It hashes bytes and stores bytes. That is why
 * spike-findings.md being entirely PENDING costs storage nothing: when the accounts
 * shape finally lands, ge accounts changes and this file does not notice.
 */

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Queryable } from '../db/client.ts';
import { geBlob, geFile, geFileVersion } from '../db/schema.ts';
import { openBlob, sealBlob, type DataKey } from './crypto.ts';

/**
 * Postgres has a bind parameter limit per statement, and a founder with 400 files
 * plus ten snapshots each is well inside it, but a chunk size means the number of
 * files a founder has can never turn into a query that will not run.
 */
const CHUNK = 500;

function chunked<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface PutBlobResult {
  sha: string;
  sizeBytes: number;
  /** False when this founder already held these exact bytes. The snapshot saving. */
  inserted: boolean;
}

/**
 * Store one file's bytes, if this founder does not already hold them.
 *
 * ON CONFLICT DO NOTHING rather than a SELECT then an INSERT: two turns for one
 * founder cannot run at once because of the advisory lock, but a retry inside one
 * turn can, and a check-then-act would raise a duplicate key on the second attempt.
 */
export async function putBlob(
  tx: Queryable,
  founderId: string,
  dataKey: DataKey,
  plaintext: Uint8Array,
): Promise<PutBlobResult> {
  const sealed = sealBlob(founderId, dataKey, plaintext);
  const inserted = await tx
    .insert(geBlob)
    .values({
      founderId,
      sha: sealed.sha,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      sizeBytes: sealed.sizeBytes,
    })
    .onConflictDoNothing({ target: [geBlob.founderId, geBlob.sha] })
    .returning({ sha: geBlob.sha });

  return { sha: sealed.sha, sizeBytes: sealed.sizeBytes, inserted: inserted.length > 0 };
}

/**
 * Read one blob back.
 *
 * Throws rather than returning null on a missing row. A blob named by a ge_file row
 * that is not in ge_blob is a broken database, and the only safe response is to stop
 * before something writes a zero byte file over the founder's work.
 */
export async function getBlob(
  tx: Queryable,
  founderId: string,
  dataKey: DataKey,
  sha: string,
): Promise<Buffer> {
  const rows = await tx
    .select({ ciphertext: geBlob.ciphertext, nonce: geBlob.nonce })
    .from(geBlob)
    .where(and(eq(geBlob.founderId, founderId), eq(geBlob.sha, sha)));
  const row = rows[0];
  if (!row) {
    throw new Error(`blob ${sha.slice(0, 12)} is named by a file row but is not stored. Refusing to continue.`);
  }
  return openBlob(founderId, dataKey, sha, row.ciphertext, row.nonce);
}

/**
 * Read many blobs in as few round trips as the chunk size allows.
 *
 * Materialise rebuilds roughly 60 files, and 60 sequential round trips against a
 * managed Postgres is most of a second on its own, on the path a founder is waiting
 * on. Every returned buffer has been authenticated and hash checked by openBlob.
 */
export async function getBlobs(
  tx: Queryable,
  founderId: string,
  dataKey: DataKey,
  shas: readonly string[],
): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const unique = [...new Set(shas)];
  for (const batch of chunked(unique)) {
    const rows = await tx
      .select({ sha: geBlob.sha, ciphertext: geBlob.ciphertext, nonce: geBlob.nonce })
      .from(geBlob)
      .where(and(eq(geBlob.founderId, founderId), inArray(geBlob.sha, batch)));
    for (const row of rows) {
      out.set(row.sha, openBlob(founderId, dataKey, row.sha, row.ciphertext, row.nonce));
    }
  }
  const missing = unique.filter((sha) => !out.has(sha));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} blob(s) named by file rows are not stored, first is ${missing[0]?.slice(0, 12)}. Refusing to continue.`,
    );
  }
  return out;
}

/** Which of these shas this founder already holds. Lets a harvest skip re encrypting. */
export async function existingShas(
  tx: Queryable,
  founderId: string,
  shas: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const unique = [...new Set(shas)];
  for (const batch of chunked(unique)) {
    if (batch.length === 0) continue;
    const rows = await tx
      .select({ sha: geBlob.sha })
      .from(geBlob)
      .where(and(eq(geBlob.founderId, founderId), inArray(geBlob.sha, batch)));
    for (const row of rows) out.add(row.sha);
  }
  return out;
}

/** Total plaintext bytes this founder holds. Summed without decrypting anything. */
export async function totalStoredBytes(tx: Queryable, founderId: string): Promise<number> {
  const rows = await tx
    .select({ total: sql<string>`coalesce(sum(${geBlob.sizeBytes}), 0)` })
    .from(geBlob)
    .where(eq(geBlob.founderId, founderId));
  return Number(rows[0]?.total ?? 0);
}

/**
 * Delete blobs this founder no longer references from either the live tree or the
 * version history.
 *
 * ONLY THE DELETION FLOW CALLS THIS. Ordinary turns never do: a blob unreferenced by
 * ge_file is still referenced by ge_file_version, which is the layer that answers
 * "it was fine three weeks ago". This exists for the six step removal a prospect
 * asks for, where the point is that the bytes are gone and provably complete beats
 * probably complete.
 *
 * Returns the number of rows removed so the deletion screen can show the founder
 * what went.
 */
export async function deleteUnreferencedBlobs(tx: Queryable, founderId: string): Promise<number> {
  const live = await tx.select({ sha: geFile.blobSha }).from(geFile).where(eq(geFile.founderId, founderId));
  const history = await tx
    .select({ sha: geFileVersion.blobSha })
    .from(geFileVersion)
    .where(eq(geFileVersion.founderId, founderId));
  const referenced = [...new Set([...live.map((r) => r.sha), ...history.map((r) => r.sha)])];

  // An empty NOT IN () is not valid SQL, so the no references case deletes everything
  // this founder has, which is exactly right: nothing points at any of it.
  const rows =
    referenced.length === 0
      ? await tx.delete(geBlob).where(eq(geBlob.founderId, founderId)).returning({ sha: geBlob.sha })
      : await tx
          .delete(geBlob)
          .where(and(eq(geBlob.founderId, founderId), notInArray(geBlob.sha, referenced)))
          .returning({ sha: geBlob.sha });
  return rows.length;
}
