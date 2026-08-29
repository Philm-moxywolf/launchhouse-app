/**
 * src/server/storage/crypto.ts
 *
 * WHAT THIS IS
 *   Envelope encryption for founder content. A per founder data key, AES 256 GCM,
 *   wrapped by a master key held in Replit Secrets. Every blob in ge_blob goes
 *   through here on the way in and on the way out.
 *
 * WHY IT EXISTS
 *   The people folder holds 25 to 35 real names, companies, titles, email addresses
 *   and handles per founder. Across the cohort that is roughly 3,000 to 4,500 real
 *   people, none of whom agreed to be in our database. On a laptop that was the
 *   founder's exposure. On a server it is ours, and a database dump on its own must
 *   not be a disclosure.
 *
 *   EVERY BLOB IS ENCRYPTED, NOT JUST THE PEOPLE ONES. Uniform, so there is no "did
 *   we remember to mark this file sensitive" bug to have. The classification bug is
 *   the one that actually happens; the performance cost of encrypting a 4 KB
 *   markdown file is not worth having it.
 *
 * WHAT CALLS IT
 *   storage/blobs.ts for every read and write of founder content, and storage/turn.ts
 *   once per turn to unwrap the founder's data key.
 *
 * READS  GE_MASTER_KEY, GE_MASTER_KEY_V2 to V9 and GE_MASTER_KEY_VERSION, through
 *        src/server/env.ts and never through process.env. env.ts carries the base64
 *        strings and this file is what decodes them, because the refusals below name a
 *        length and a placeholder and they are the sentences an operator needs to read.
 * WRITES nothing.
 *
 * TWO CONSEQUENCES, NAMED RATHER THAN DISCOVERED
 *   1. Deduplication is per founder. Two founders holding byte identical files hold
 *      two rows, because the keys differ. That is why ge_blob's primary key is
 *      (founder_id, sha) and not (sha).
 *   2. Losing the master key loses every founder's work. It is escrowed offline
 *      before the first founder signs in, with a name and a date against it. There
 *      is no recovery path in this file, because there is none anywhere.
 *
 * THERE IS NO KEY CACHE HERE ON PURPOSE. A turn unwraps once and carries the data
 * key in its own context for the length of the turn. A cache would be a second place
 * key material lives, kept alive between founders, for a saving measured against one
 * AES operation.
 *
 * THE HONEST LIMIT. Anyone holding both the master key and a database dump can
 * decrypt all 130. No cryptography removes that in an app that has to use the data
 * unattended. What this gives is that the two live apart, so a database leak alone
 * is not a content leak.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lateSettings } from '../env.ts';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
/** 96 bit IV, the size GCM is defined for. Anything else costs a security proof. */
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Layout of a wrapped data key: version, nonce, tag, ciphertext. 61 bytes. */
const WRAP_VERSION_BYTES = 1;
const WRAPPED_KEY_BYTES = WRAP_VERSION_BYTES + NONCE_BYTES + TAG_BYTES + KEY_BYTES;

export class CryptoRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoRefused';
  }
}

/**
 * A founder's data key. A branded Buffer so it cannot be passed where a plaintext
 * buffer is expected, and so a reviewer can see at a glance which values are key
 * material. The brand is erased at runtime; it costs nothing.
 */
export type DataKey = Buffer & { readonly __dataKey: unique symbol };

function readMasterKey(keys: ReadonlyMap<number, string>, version: number): Buffer | null {
  const name = version === 1 ? 'GE_MASTER_KEY' : `GE_MASTER_KEY_V${version}`;
  const raw = keys.get(version);
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new CryptoRefused(`${name} is not valid base64`);
  }
  if (key.length !== KEY_BYTES) {
    // Length, not content, so the message can be logged. Never print the value.
    throw new CryptoRefused(`${name} must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  if (key.every((b) => b === 0)) {
    throw new CryptoRefused(`${name} is all zero bytes, which is a placeholder rather than a key`);
  }
  return key;
}

/**
 * The keyring. Rotation is additive: add GE_MASTER_KEY_V2, point
 * GE_MASTER_KEY_VERSION at it, and old rows keep unwrapping under version 1 until
 * something rewrites them. Removing an old key before every row is rewritten is how
 * a rotation turns into a data loss, so nothing here deletes one.
 */
function keyring(): { keys: Map<number, Buffer>; current: number } {
  const settings = lateSettings();
  const keys = new Map<number, Buffer>();
  for (let v = 1; v <= 9; v++) {
    const key = readMasterKey(settings.masterKeys, v);
    if (key) keys.set(v, key);
  }
  if (keys.size === 0) {
    throw new CryptoRefused(
      'GE_MASTER_KEY is not set. Every founder file is encrypted under it, so there is nothing this process can read or write without it.',
    );
  }
  const current = settings.masterKeyVersionPin ?? Math.max(...keys.keys());
  if (!keys.has(current)) {
    throw new CryptoRefused(`GE_MASTER_KEY_VERSION names version ${current}, which is not set`);
  }
  return { keys, current };
}

/**
 * Called at boot. Fails the deploy rather than the first founder's first turn.
 * Returns the current version so it can be logged and matched against the escrow
 * record.
 */
export function assertMasterKeyPresent(): number {
  return keyring().current;
}

/** sha256 of the PLAINTEXT bytes, hex. This is the content address. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Additional authenticated data for a wrapped data key.
 *
 * WHY THE FOUNDER ID IS IN IT: if any bug anywhere hands founder B's wrapped key to
 * an unwrap made under founder A's id, GCM authentication fails and this throws. A
 * mix up becomes a crash with a stack trace rather than a decrypt that succeeds and
 * hands somebody the wrong workspace. This is the layer that holds when the WHERE
 * clause and the row level security policy both have a bug in them.
 */
function wrapAad(founderId: string, version: number): Buffer {
  return Buffer.from(`gewrap:${founderId}:v${version}`, 'utf8');
}

/**
 * Additional authenticated data for a blob.
 *
 * The sha is in it as well as the founder id, so a row whose ciphertext was swapped
 * for another of the same founder's rows fails authentication too. Without it, an
 * accidental UPDATE that crossed two rows would decrypt cleanly and give a founder
 * the wrong file back under the right name, which is worse than an error.
 */
function blobAad(founderId: string, sha: string): Buffer {
  return Buffer.from(`geblob:${founderId}:${sha}`, 'utf8');
}

/** A fresh per founder data key, and that key wrapped for storage in founder.wrapped_key. */
export function createFounderKey(founderId: string): { dataKey: DataKey; wrapped: Buffer } {
  const dataKey = randomBytes(KEY_BYTES) as DataKey;
  return { dataKey, wrapped: wrapDataKey(founderId, dataKey) };
}

export function wrapDataKey(founderId: string, dataKey: DataKey): Buffer {
  if (dataKey.length !== KEY_BYTES) throw new CryptoRefused('data key is the wrong length');
  const { keys, current } = keyring();
  const master = keys.get(current);
  if (!master) throw new CryptoRefused(`master key version ${current} is missing`);

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, master, nonce);
  cipher.setAAD(wrapAad(founderId, current));
  const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([current]), nonce, tag, ciphertext]);
}

export function unwrapDataKey(founderId: string, wrapped: Uint8Array): DataKey {
  const buf = Buffer.isBuffer(wrapped) ? wrapped : Buffer.from(wrapped);
  if (buf.length !== WRAPPED_KEY_BYTES) {
    throw new CryptoRefused(`wrapped key is ${buf.length} bytes, expected ${WRAPPED_KEY_BYTES}`);
  }
  const version = buf[0] as number;
  const { keys } = keyring();
  const master = keys.get(version);
  if (!master) {
    throw new CryptoRefused(
      `this row was wrapped under master key version ${version}, which this process does not have. Refusing rather than guessing.`,
    );
  }
  const nonce = buf.subarray(WRAP_VERSION_BYTES, WRAP_VERSION_BYTES + NONCE_BYTES);
  const tag = buf.subarray(WRAP_VERSION_BYTES + NONCE_BYTES, WRAP_VERSION_BYTES + NONCE_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(WRAP_VERSION_BYTES + NONCE_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, master, nonce);
  decipher.setAAD(wrapAad(founderId, version));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]) as DataKey;
  } catch {
    // Do not say what failed beyond this. The two causes are a wrong founder id and
    // a corrupt row, and both are the same instruction: stop.
    throw new CryptoRefused('the wrapped data key did not authenticate for this founder');
  }
}

/** Which master key version wrapped this row, without unwrapping it. For rotation. */
export function wrappedKeyVersion(wrapped: Uint8Array): number {
  const buf = Buffer.isBuffer(wrapped) ? wrapped : Buffer.from(wrapped);
  if (buf.length !== WRAPPED_KEY_BYTES) throw new CryptoRefused('wrapped key is the wrong length');
  return buf[0] as number;
}

export interface SealedBlob {
  /** GCM ciphertext with the 16 byte authentication tag appended. */
  ciphertext: Buffer;
  nonce: Buffer;
  /** sha256 of the plaintext. The content address, and half the AAD. */
  sha: string;
  sizeBytes: number;
}

/**
 * Encrypt one file's bytes for storage.
 *
 * The sha is computed here rather than taken as an argument, so the value that goes
 * into the AAD and the value that goes into ge_file.blob_sha are the same value by
 * construction. A caller that hashed separately could hand in a sha that does not
 * match the bytes, and the mismatch would only appear on the read, weeks later.
 */
export function sealBlob(founderId: string, dataKey: DataKey, plaintext: Uint8Array): SealedBlob {
  const bytes = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  const sha = sha256Hex(bytes);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, nonce);
  cipher.setAAD(blobAad(founderId, sha));
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    ciphertext: Buffer.concat([body, cipher.getAuthTag()]),
    nonce,
    sha,
    sizeBytes: bytes.length,
  };
}

/**
 * Decrypt one blob and prove it is the file that was asked for.
 *
 * The sha is re checked after decryption even though GCM already authenticated the
 * bytes. GCM proves the ciphertext was not tampered with; the sha check proves the
 * row was not the wrong row. They catch different faults, the second costs a hash of
 * a few kilobytes, and the failure they guard against is a founder being handed
 * content that is not theirs.
 */
export function openBlob(
  founderId: string,
  dataKey: DataKey,
  sha: string,
  ciphertextWithTag: Uint8Array,
  nonce: Uint8Array,
): Buffer {
  const buf = Buffer.isBuffer(ciphertextWithTag) ? ciphertextWithTag : Buffer.from(ciphertextWithTag);
  if (buf.length < TAG_BYTES) throw new CryptoRefused('ciphertext is too short to hold an authentication tag');
  const body = buf.subarray(0, buf.length - TAG_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, dataKey, Buffer.isBuffer(nonce) ? nonce : Buffer.from(nonce));
  decipher.setAAD(blobAad(founderId, sha));
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new CryptoRefused(`blob ${sha.slice(0, 12)} did not authenticate for this founder`);
  }

  const actual = Buffer.from(sha256Hex(plaintext), 'hex');
  const expected = Buffer.from(sha, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new CryptoRefused(`blob ${sha.slice(0, 12)} decrypted to bytes with a different hash`);
  }
  return plaintext;
}
