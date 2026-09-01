/**
 * src/server/integrations/apollo-token-store.ts
 *
 * WHAT THIS IS
 *   A founder's Apollo API key, written down the same way their GoHighLevel token and
 *   their Anthropic key are, and read back only to make a call.
 *
 * WHY IT MIRRORS `ghl-token-store.ts` LINE FOR LINE
 *   That file says it deliberately mirrors `agent/anthropic-key-store.ts` rather than
 *   inventing a second shape, and the reason applies again here: the envelope is the
 *   part that must not be improvised. Wrapped data key, then the sha, then the sealed
 *   body, with the AAD bound to the founder id, so handing founder B's ciphertext to a
 *   decrypt made under founder A's id fails authentication rather than returning
 *   somebody else's key. Three layouts would be three chances to get that wrong and
 *   only one of them would be under test the day it mattered.
 *
 * WHAT IS DIFFERENT, AND IT IS ONLY THIS: there is no location id. GoHighLevel needs one
 *   in the path of every call, so it earns a plain column. Apollo identifies the account
 *   from the key alone, so the column stays null and nothing reads it.
 *
 * WHY EACH FOUNDER HAS THEIR OWN KEY, which is not a detail
 *   Every founder remixes this app into their own Replit account with their own database
 *   and pastes their own credentials, the same way they paste their own Anthropic key.
 *   There is no shared seat and no cohort. That is what makes this ordinary: a person
 *   using their own API key against their own Apollo account, spending their own credits.
 *
 * NO PART OF A KEY REACHES A ROW, A LOG OR A SCREEN. `token_prefix` takes a word
 *   describing the class of credential, never a slice of the credential. `token_length`
 *   is a number. The plaintext exists only between `openApolloKey` and the call.
 *
 * READS   `connections`. WRITES `connections`.
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

/**
 * The vendor key on `connections`. One word, and it is not a display name.
 *
 * The column's own comment in `db/schema.ts` already reads "'ghl' or 'apollo'", so this
 * value was decided when the table was written and no migration is owed for it.
 */
export const APOLLO_VENDOR = 'apollo';

/** Layout constants for the envelope. Named so the slicing reads as the diagram. */
const WRAPPED_KEY_BYTES = 61;
const SHA_BYTES = 32;
const SALT_BYTES = 16;

/**
 * The only value ever written to `token_prefix` for this vendor.
 *
 * A word, not a slice. Apollo keys have no documented prefix to check, and settling that
 * by storing a founder's real first four characters would put a piece of a live
 * credential somewhere selectable, which is a worse trade than never knowing.
 */
const PREFIX_CLASSIFICATION = 'apollo';

/** Seal one key for storage. Returns exactly what the two columns take. */
export function sealApolloKey(
  founderId: string,
  key: string,
): { ciphertext: Buffer; nonce: Buffer; keyVersion: number } {
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
 * Throws on anything it does not recognise, rather than returning null. A row of the
 * wrong length is a rotation half done or a hand edit, and reading it as "no key" would
 * send the founder back to the paste screen while a live credential sits in the database
 * being counted as absent.
 */
export function openApolloKey(founderId: string, ciphertext: Uint8Array, nonce: Uint8Array): string {
  const buf = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  if (buf.length <= WRAPPED_KEY_BYTES + SHA_BYTES) {
    throw new Error('a stored Apollo key row is too short to hold an envelope');
  }
  const wrapped = buf.subarray(0, WRAPPED_KEY_BYTES);
  const sha = buf.subarray(WRAPPED_KEY_BYTES, WRAPPED_KEY_BYTES + SHA_BYTES).toString('hex');
  const body = buf.subarray(WRAPPED_KEY_BYTES + SHA_BYTES);
  const dataKey: DataKey = unwrapDataKey(founderId, wrapped);
  const plaintext = openBlob(founderId, dataKey, sha, body, nonce);
  return plaintext.subarray(SALT_BYTES).toString('utf8');
}

/**
 * Write it down, after it has been checked and not before.
 *
 * `status` is only ever 'connected' from here, because this is called on the path where
 * Apollo has already answered 200 to this exact key. A key that failed its check is not
 * stored at all: a row that says unverified is a credential nobody is watching, and the
 * founder has the key in front of them to paste again.
 */
export async function saveApolloKey(
  founderId: string,
  key: string,
  verifiedAt: Date,
): Promise<void> {
  const sealed = sealApolloKey(founderId, key);
  const db = getDb();
  await db
    .insert(connections)
    .values({
      founderId,
      vendor: APOLLO_VENDOR,
      keyVersion: sealed.keyVersion,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      status: 'connected',
      tokenPrefix: PREFIX_CLASSIFICATION,
      tokenLength: key.length,
      createdAt: verifiedAt,
      verifiedAt,
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
        verifiedAt,
        // Cleared, because this row is connected again. A purgedAt left behind would
        // read as a credential that had been taken away and is somehow still working.
        purgedAt: null,
      },
    });
}

/** The stored key, or null when there is no usable row. */
export async function readApolloKey(founderId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.founderId, founderId), eq(connections.vendor, APOLLO_VENDOR)));
  const row = rows[0];
  if (row === undefined) return null;
  if (row.ciphertext === null || row.nonce === null) return null;
  if (row.purgedAt !== null) return null;
  return openApolloKey(founderId, row.ciphertext, row.nonce);
}
