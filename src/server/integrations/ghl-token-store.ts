/**
 * src/server/integrations/ghl-token-store.ts
 *
 * WHAT THIS IS
 *   A founder's GoHighLevel token, written down the same way their Anthropic key is,
 *   and read back only to make a call.
 *
 * WHY IT MIRRORS `agent/anthropic-key-store.ts` RATHER THAN INVENTING A SECOND SHAPE
 *   Both are a founder's credential in the `connections` table, one row per vendor, and
 *   the envelope is the part that must not be improvised: wrapped data key, then the
 *   sha, then the sealed body, with the AAD bound to the founder id so handing founder
 *   B's ciphertext to a decrypt made under founder A's id fails authentication rather
 *   than returning somebody else's token. Two layouts would mean two chances to get
 *   that wrong, and only one of them would be under test the day it mattered.
 *
 * WHAT IS DIFFERENT, AND IT IS ONLY THIS: a GoHighLevel row also carries the location
 *   id, which is not a secret and is a plain column, because every call needs it in the
 *   path and reading it should not require opening an envelope.
 *
 * NO PART OF A TOKEN REACHES A ROW, A LOG OR A SCREEN. `token_prefix` takes a word
 *   describing the class of credential, never a slice of the credential. `token_length`
 *   is a number. The plaintext exists only between `openGhlToken` and the call.
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

/** The vendor key on `connections`. One word, and it is not a display name. */
export const GHL_VENDOR = 'ghl';

/** Layout constants for the envelope. Named so the slicing reads as the diagram. */
const WRAPPED_KEY_BYTES = 61;
const SHA_BYTES = 32;
const SALT_BYTES = 16;

/**
 * The only value ever written to `token_prefix` for this vendor.
 *
 * A word, not a slice. `contracts/ghl.ts` records that real tokens are GUESSED to begin
 * `pit-`, and writing the founder's actual first four characters into a column to settle
 * that would be putting a piece of a credential somewhere selectable. The guess gets
 * settled by counting, not by storing.
 */
const PREFIX_CLASSIFICATION = 'ghl';

/** Seal one token for storage. Returns exactly what the two columns take. */
export function sealGhlToken(founderId: string, token: string): {
  ciphertext: Buffer;
  nonce: Buffer;
  keyVersion: number;
} {
  const { dataKey, wrapped } = createFounderKey(founderId);
  const plaintext = Buffer.concat([randomBytes(SALT_BYTES), Buffer.from(token, 'utf8')]);
  const sealed = sealBlob(founderId, dataKey, plaintext);
  return {
    ciphertext: Buffer.concat([wrapped, Buffer.from(sealed.sha, 'hex'), sealed.ciphertext]),
    nonce: sealed.nonce,
    keyVersion: wrappedKeyVersion(wrapped),
  };
}

/**
 * Open one stored token.
 *
 * Throws on anything it does not recognise, rather than returning null. A row of the
 * wrong length is a rotation half done or a hand edit, and reading it as "no token"
 * would send the founder back to the paste screen while a live credential sits in the
 * database being counted as absent.
 */
export function openGhlToken(founderId: string, ciphertext: Uint8Array, nonce: Uint8Array): string {
  const buf = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  if (buf.length <= WRAPPED_KEY_BYTES + SHA_BYTES) {
    throw new Error('a stored GoHighLevel token row is too short to hold an envelope');
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
 * GoHighLevel has already answered 200 to this exact token and location. A token that
 * failed its check is not stored at all: a row that says unverified is a credential
 * nobody is watching, and the founder has the token in front of them to paste again.
 */
export async function saveGhlToken(
  founderId: string,
  token: string,
  locationId: string,
  verifiedAt: Date,
): Promise<void> {
  const sealed = sealGhlToken(founderId, token);
  const db = getDb();
  await db
    .insert(connections)
    .values({
      founderId,
      vendor: GHL_VENDOR,
      keyVersion: sealed.keyVersion,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      locationId,
      status: 'connected',
      tokenPrefix: PREFIX_CLASSIFICATION,
      tokenLength: token.length,
      createdAt: verifiedAt,
      verifiedAt,
    })
    .onConflictDoUpdate({
      target: [connections.founderId, connections.vendor],
      set: {
        keyVersion: sealed.keyVersion,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        locationId,
        status: 'connected',
        tokenPrefix: PREFIX_CLASSIFICATION,
        tokenLength: token.length,
        verifiedAt,
        // Cleared, because this row is connected again. A purgedAt left behind would
        // read as a credential that had been taken away and is somehow still working.
        purgedAt: null,
      },
    });
}

/** The stored token and location, or null when there is no usable row. */
export async function readGhlToken(
  founderId: string,
): Promise<{ token: string; locationId: string } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.founderId, founderId), eq(connections.vendor, GHL_VENDOR)));
  const row = rows[0];
  if (row === undefined) return null;
  if (row.ciphertext === null || row.nonce === null || row.locationId === null) return null;
  if (row.purgedAt !== null) return null;
  return { token: openGhlToken(founderId, row.ciphertext, row.nonce), locationId: row.locationId };
}

/**
 * The location id this founder saved, without opening any envelope.
 *
 * It is a plain column because it is not a secret: it says which business, the way a
 * house number does. Kept here rather than on `AppStore` so that widening an interface
 * every test fixture implements is not the price of reading one string.
 */
export async function readGhlLocationId(founderId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ locationId: connections.locationId })
    .from(connections)
    .where(and(eq(connections.founderId, founderId), eq(connections.vendor, GHL_VENDOR)));
  return rows[0]?.locationId ?? null;
}
