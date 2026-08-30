/**
 * src/server/agent/anthropic-key-store.ts
 *
 * WHAT THIS IS. Where a pasted Anthropic key is kept between restarts, and how it gets
 * back into memory when the container comes up again.
 *
 * WHY IT EXISTS. The holder next door is memory, and a Replit deployment is replaced
 * whenever it feels like it. A key that lived only in memory would have to be pasted again
 * after every restart, by somebody who does not know a restart happened and was never told
 * a key could go missing. So the key goes in the database, encrypted, and comes back on
 * the next boot without the founder doing anything.
 *
 * STORED THE WAY THE OTHER FOUNDER SECRETS ARE STORED, which is the `connections` table:
 * one row per founder per vendor, ciphertext and nonce columns, a status, a verified at,
 * and a purged at. The vendor key is `anthropic`, alongside `ghl` and `apollo`. That is
 * not filing convenience. It means the post event purge that nulls credentials finds this
 * one too, and it means a founder pressing disconnect leaves the same evidence for the
 * same reason.
 *
 * THE ENVELOPE IS storage/crypto.ts, NOT A SECOND ONE. A per credential data key is made
 * with `createFounderKey`, wrapped under the master key, and the key itself is sealed under
 * that data key with `sealBlob`. Both halves carry the founder id in their authenticated
 * data, so handing founder B's row to a read made under founder A's id fails to
 * authenticate and throws, rather than quietly handing somebody the wrong credential. That
 * property is the reason to reuse the file rather than write thirty lines of AES here: a
 * second implementation is a second thing to get wrong, and this one is already tested.
 *
 * WHAT THE ciphertext COLUMN HOLDS, byte for byte, because a self describing blob is the
 * only way one column can carry an envelope:
 *
 *     [ wrapped data key, 61 bytes ][ sha256 of the plaintext, 32 bytes ][ sealed bytes ]
 *
 * `sealBlob` computes that sha over the plaintext and `openBlob` insists on it, so it has
 * to be stored. THE PLAINTEXT IS SIXTEEN RANDOM BYTES FOLLOWED BY THE KEY, and the salt is
 * the whole reason those sixteen bytes exist: without it the stored sha would be the sha of
 * the key itself, which is a way to check a guess. With it the sha proves nothing about the
 * key to anybody who does not already hold the row's own salt.
 *
 * WHAT IS DELIBERATELY NOT STORED. No prefix taken from the key. The `token_prefix` column
 * exists to answer "what shape are real tokens" without putting one in a row, and the only
 * value written here is a fixed word chosen from a list, never a slice of what the founder
 * pasted. The length is stored as a number, because "mine says 43 characters" is the one
 * thing a mentor can compare across a room without anybody reading a key out loud.
 *
 * WHAT CALLS IT. src/server/routes/setup.ts on save and on disconnect, and once at boot
 * through `loadStoredAnthropicKeys`.
 * WHAT IT READS AND WRITES. The `connections` table, rows whose vendor is `anthropic`.
 */

import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { getDb } from '../db/client.ts';
import { connections } from '../db/schema.ts';
import {
  createFounderKey,
  openBlob,
  sealBlob,
  unwrapDataKey,
  wrappedKeyVersion,
  type DataKey,
} from '../storage/crypto.ts';
import { rememberAnthropicKey, forgetAnthropicKey } from './anthropic-key.ts';

/** The vendor key on `connections`. One word, and it is not a display name. */
export const ANTHROPIC_VENDOR = 'anthropic';

/** Layout constants for the envelope above. Named so the slicing reads as the diagram. */
const WRAPPED_KEY_BYTES = 61;
const SHA_BYTES = 32;
const SALT_BYTES = 16;

/**
 * The only value ever written to `token_prefix` for this vendor.
 *
 * A word, not a slice. Anything derived from what the founder pasted would be a piece of a
 * credential in a column somebody can select, and the rule for this build is that no part
 * of a key reaches a row, a log or a screen.
 */
const PREFIX_CLASSIFICATION = 'anthropic';

/** Seal one key for storage. Returns exactly what the two columns take. */
export function sealAnthropicKey(founderId: string, key: string): {
  ciphertext: Buffer;
  nonce: Buffer;
  keyVersion: number;
} {
  const { dataKey, wrapped } = createFounderKey(founderId);
  const plaintext = Buffer.concat([randomBytes(SALT_BYTES), Buffer.from(key, 'utf8')]);
  const sealed = sealBlob(founderId, dataKey, plaintext);
  return {
    ciphertext: Buffer.concat([wrapped, Buffer.from(sealed.sha, 'hex'), sealed.ciphertext]),
    nonce: sealed.nonce,
    keyVersion: wrappedKeyVersion(wrapped),
  };
}

/**
 * Open one stored key.
 *
 * Throws rather than returning null on anything it does not recognise. A row that is the
 * wrong length is a row somebody has written by hand or a rotation half done, and reading
 * it as "no key" would silently send the founder back to the paste screen with a live
 * credential still in the database.
 */
export function openAnthropicKey(founderId: string, ciphertext: Uint8Array, nonce: Uint8Array): string {
  const buf = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  if (buf.length <= WRAPPED_KEY_BYTES + SHA_BYTES) {
    throw new Error('a stored Anthropic key row is too short to hold an envelope');
  }
  const wrapped = buf.subarray(0, WRAPPED_KEY_BYTES);
  const sha = buf.subarray(WRAPPED_KEY_BYTES, WRAPPED_KEY_BYTES + SHA_BYTES).toString('hex');
  const body = buf.subarray(WRAPPED_KEY_BYTES + SHA_BYTES);

  const dataKey: DataKey = unwrapDataKey(founderId, wrapped);
  const plaintext = openBlob(founderId, dataKey, sha, body, nonce);
  return plaintext.subarray(SALT_BYTES).toString('utf8');
}

/**
 * Write the key down and hold it in memory, in that order.
 *
 * The database first, because memory does not survive the container and a founder who is
 * told it is saved has to be right. If the write fails, nothing is held and the caller
 * reports a failure, which is the correct end of that story: a key held in memory and not
 * in the database is a key that disappears at the next deploy with nobody watching.
 */
export async function saveAnthropicKey(founderId: string, key: string, checkedAt: Date): Promise<void> {
  const sealed = sealAnthropicKey(founderId, key);
  const db = getDb();
  await db
    .insert(connections)
    .values({
      founderId,
      vendor: ANTHROPIC_VENDOR,
      keyVersion: sealed.keyVersion,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      status: 'connected',
      tokenPrefix: PREFIX_CLASSIFICATION,
      tokenLength: key.length,
      createdAt: checkedAt,
      verifiedAt: checkedAt,
    })
    .onConflictDoUpdate({
      target: [connections.founderId, connections.vendor],
      set: {
        keyVersion: sealed.keyVersion,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        status: 'connected',
        tokenPrefix: PREFIX_CLASSIFICATION,
        tokenLength: key.length,
        verifiedAt: checkedAt,
        // Cleared, because this row is connected again. A purged at left behind would
        // read as a credential that had been taken away and is somehow still working.
        purgedAt: null,
      },
    });
  rememberAnthropicKey(founderId, key, checkedAt);
}

/**
 * Forget it, here and in the database.
 *
 * The ciphertext is nulled rather than the row deleted, matching what
 * `AppStore.forgetConnection` does for GoHighLevel: the row also carries the fact that
 * this founder once had a working key, and a mentor asking "did they ever get this going"
 * needs that.
 *
 * DELETING OUR COPY DOES NOT SWITCH THE KEY OFF AT ANTHROPIC, and the screen says so. A
 * founder told "removed" who believes the key is dead has a live credential they have
 * stopped thinking about.
 */
export async function forgetStoredAnthropicKey(founderId: string, at: Date): Promise<void> {
  /*
    THE DATABASE FIRST, THE SAME WAY ROUND AS SAVING, AND FOR THE SAME REASON. Clearing
    memory first and then failing to write leaves an app with no key and a database that
    still has one: the founder is told it did not work, presses the button again, and the
    next boot puts the key they thought they had removed straight back. Writing first means
    a failure changes nothing at all and the founder can simply try again.
  */
  const db = getDb();
  await db
    .update(connections)
    .set({ ciphertext: null, nonce: null, status: 'purged', verifiedAt: null, purgedAt: at })
    .where(and(eq(connections.founderId, founderId), eq(connections.vendor, ANTHROPIC_VENDOR)));
  forgetAnthropicKey(founderId);
}

export interface LoadReport {
  readonly loaded: number;
  /** Rows that would not open. Named by founder id, never by content. */
  readonly unreadable: readonly string[];
  /** True when the database could not be asked at all. */
  readonly noDatabase: boolean;
}

/**
 * Put every stored key back in memory. Called once, at boot, before the first request.
 *
 * IT READS EVERY FOUNDER'S ROW RATHER THAN ONE FOUNDER'S, which is the one place in this
 * app that is allowed to. The rule that every read takes a founder id from the session
 * cookie is a rule about handling a request; this is not a request, there is no session,
 * and there is nobody to scope to. Each row is still opened under its own founder id, so
 * the authenticated data check still holds and a row that was somehow written under the
 * wrong id fails to open rather than being handed to the wrong person.
 *
 * NEVER FATAL. No database means the founder is already being told about the database,
 * which is the thing to fix first, and this simply reports that it could not ask. A row
 * that will not open is named and skipped: the rest of the cohort should not lose their
 * keys because one row is damaged.
 */
export async function loadStoredAnthropicKeys(): Promise<LoadReport> {
  let rows: { founderId: string; ciphertext: Uint8Array | null; nonce: Uint8Array | null; verifiedAt: Date | null }[];
  try {
    rows = await getDb()
      .select({
        founderId: connections.founderId,
        ciphertext: connections.ciphertext,
        nonce: connections.nonce,
        verifiedAt: connections.verifiedAt,
      })
      .from(connections)
      .where(and(eq(connections.vendor, ANTHROPIC_VENDOR), eq(connections.status, 'connected')));
  } catch {
    // The message is not carried. It is a driver's writing, it can hold a connection
    // string, and the caller has nothing to do with it either way.
    return { loaded: 0, unreadable: [], noDatabase: true };
  }

  let loaded = 0;
  const unreadable: string[] = [];
  for (const row of rows) {
    if (row.ciphertext === null || row.nonce === null) continue;
    try {
      const key = openAnthropicKey(row.founderId, row.ciphertext, row.nonce);
      rememberAnthropicKey(row.founderId, key, row.verifiedAt ?? new Date(0));
      loaded += 1;
    } catch {
      unreadable.push(row.founderId);
    }
  }
  return { loaded, unreadable, noDatabase: false };
}
