/**
 * src/server/storage/crypto.test.ts
 *
 * WHAT THIS IS. Proof that the encryption binds a founder's bytes to that founder.
 *
 * WHY IT EXISTS. The claim crypto.ts makes is not "the bytes are encrypted". It is
 * that handing founder B's ciphertext to a decrypt made under founder A's id throws
 * rather than succeeding. That is the layer that holds when the WHERE clause and the
 * row level security policy both have a bug in them, and a claim like that is worth
 * nothing until something has actually tried it.
 *
 * WHAT IT CALLS. src/server/storage/crypto.ts only. No database, no filesystem.
 */

import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMasterKeyPresent,
  createFounderKey,
  CryptoRefused,
  openBlob,
  sealBlob,
  sha256Hex,
  unwrapDataKey,
  wrapDataKey,
  wrappedKeyVersion,
  type DataKey,
} from './crypto.ts';

const A = '01J8ZQTMK4NRC7XVYB3D9GHF2W';
const B = '01J8ZQTMK4NRC7XVYB3D9GHF2X';

const KEY_ONE = randomBytes(32).toString('base64');
const KEY_TWO = randomBytes(32).toString('base64');

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    GE_MASTER_KEY: process.env.GE_MASTER_KEY,
    GE_MASTER_KEY_V2: process.env.GE_MASTER_KEY_V2,
    GE_MASTER_KEY_VERSION: process.env.GE_MASTER_KEY_VERSION,
  };
  process.env.GE_MASTER_KEY = KEY_ONE;
  delete process.env.GE_MASTER_KEY_V2;
  delete process.env.GE_MASTER_KEY_VERSION;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('the master key', () => {
  it('is version 1 when only GE_MASTER_KEY is set', () => {
    assert.equal(assertMasterKeyPresent(), 1);
  });

  it('refuses to start with no key at all, rather than writing plaintext', () => {
    delete process.env.GE_MASTER_KEY;
    assert.throws(() => assertMasterKeyPresent(), CryptoRefused);
  });

  it('refuses a key of the wrong length, and does not print it', () => {
    // Held in a local as well as in the environment, so the last assertion has a
    // definite string to look for rather than string | undefined.
    const tooShort = Buffer.alloc(16).toString('base64');
    process.env.GE_MASTER_KEY = tooShort;
    try {
      assertMasterKeyPresent();
      throw new Error('should have refused');
    } catch (err) {
      assert.ok(err instanceof CryptoRefused, `expected a CryptoRefused, got ${String(err)}`);
      assert.ok(err.message.includes('32 bytes'), `the refusal does not say what the length must be: ${err.message}`);
      assert.ok(!err.message.includes(tooShort), 'the refusal printed the key it was handed');
    }
  });

  it('refuses an all zero key, which is a placeholder somebody forgot to replace', () => {
    process.env.GE_MASTER_KEY = Buffer.alloc(32).toString('base64');
    assert.throws(() => assertMasterKeyPresent(), { message: /all zero/ });
  });
});

describe('the founder data key', () => {
  it('round trips', () => {
    const { dataKey, wrapped } = createFounderKey(A);
    assert.equal(unwrapDataKey(A, wrapped).equals(dataKey), true);
  });

  it('THE LAYER THAT HOLDS: founder B cannot unwrap founder A key', () => {
    const { wrapped } = createFounderKey(A);
    assert.throws(() => unwrapDataKey(B, wrapped), CryptoRefused);
  });

  it('refuses a wrapped key with a byte flipped', () => {
    const { wrapped } = createFounderKey(A);
    const tampered = Buffer.from(wrapped);
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] as number) ^ 0xff;
    assert.throws(() => unwrapDataKey(A, tampered), CryptoRefused);
  });

  it('refuses a wrapped key of the wrong size rather than reading past it', () => {
    assert.throws(() => unwrapDataKey(A, Buffer.alloc(10)), CryptoRefused);
  });

  it('carries its master key version, and says so when that version is not held', () => {
    process.env.GE_MASTER_KEY_V2 = KEY_TWO;
    process.env.GE_MASTER_KEY_VERSION = '2';
    const { wrapped } = createFounderKey(A);
    assert.equal(wrappedKeyVersion(wrapped), 2);

    // A rotation that removed the old key before every row was rewritten is a data
    // loss, so the refusal names the version rather than trying the keys it has.
    delete process.env.GE_MASTER_KEY_V2;
    process.env.GE_MASTER_KEY_VERSION = '1';
    assert.throws(() => unwrapDataKey(A, wrapped), { message: /version 2/ });
  });

  it('lets version 1 rows keep unwrapping after version 2 becomes the default', () => {
    const { dataKey, wrapped } = createFounderKey(A);
    assert.equal(wrappedKeyVersion(wrapped), 1);
    process.env.GE_MASTER_KEY_V2 = KEY_TWO;
    process.env.GE_MASTER_KEY_VERSION = '2';
    assert.equal(unwrapDataKey(A, wrapped).equals(dataKey), true);
    assert.equal(wrappedKeyVersion(wrapDataKey(A, dataKey)), 2);
  });
});

describe('blobs', () => {
  const plaintext = Buffer.from('- **Track:** b2b\n- **Model:** service\n', 'utf8');

  it('round trips, and the sha is of the plaintext', () => {
    const { dataKey } = createFounderKey(A);
    const sealed = sealBlob(A, dataKey, plaintext);
    assert.equal(sealed.sha, sha256Hex(plaintext));
    assert.equal(sealed.sizeBytes, plaintext.length);
    const opened = openBlob(A, dataKey, sealed.sha, sealed.ciphertext, sealed.nonce);
    assert.equal(opened.equals(plaintext), true);
  });

  it('is content addressed: the same bytes give the same sha every time', () => {
    const { dataKey } = createFounderKey(A);
    const first = sealBlob(A, dataKey, plaintext);
    const second = sealBlob(A, dataKey, plaintext);
    assert.equal(second.sha, first.sha);
    // The ciphertext differs because the nonce is fresh. That is correct and it is
    // why deduplication keys on the sha of the plaintext and not on the ciphertext.
    assert.equal(second.ciphertext.equals(first.ciphertext), false);
  });

  it('refuses when founder B opens founder A blob', () => {
    const { dataKey } = createFounderKey(A);
    const sealed = sealBlob(A, dataKey, plaintext);
    assert.throws(() => openBlob(B, dataKey, sealed.sha, sealed.ciphertext, sealed.nonce), CryptoRefused);
  });

  it('refuses when the row was swapped for another of the same founder rows', () => {
    const { dataKey } = createFounderKey(A);
    const one = sealBlob(A, dataKey, Buffer.from('the founder brain\n'));
    const two = sealBlob(A, dataKey, Buffer.from('the content plan\n'));
    // Asking for one and being handed the other's bytes. Without the sha in the AAD
    // this decrypts cleanly and gives the founder the wrong file under the right name.
    assert.throws(() => openBlob(A, dataKey, one.sha, two.ciphertext, two.nonce), CryptoRefused);
  });

  it('refuses a flipped ciphertext byte', () => {
    const { dataKey } = createFounderKey(A);
    const sealed = sealBlob(A, dataKey, plaintext);
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] = (tampered[0] as number) ^ 0x01;
    assert.throws(() => openBlob(A, dataKey, sealed.sha, tampered, sealed.nonce), CryptoRefused);
  });

  it('refuses a wrong nonce', () => {
    const { dataKey } = createFounderKey(A);
    const sealed = sealBlob(A, dataKey, plaintext);
    assert.throws(() => openBlob(A, dataKey, sealed.sha, sealed.ciphertext, randomBytes(12)), CryptoRefused);
  });

  it('refuses another founder data key', () => {
    const { dataKey } = createFounderKey(A);
    const other = createFounderKey(A).dataKey;
    const sealed = sealBlob(A, dataKey, plaintext);
    assert.throws(() => openBlob(A, other, sealed.sha, sealed.ciphertext, sealed.nonce), CryptoRefused);
  });

  it('handles an empty file, which is a real state ge index reports', () => {
    const { dataKey } = createFounderKey(A);
    const sealed = sealBlob(A, dataKey, Buffer.alloc(0));
    assert.equal(sealed.sizeBytes, 0);
    assert.equal(openBlob(A, dataKey, sealed.sha, sealed.ciphertext, sealed.nonce).length, 0);
  });

  it('handles bytes that are not valid text, because it stores bytes and never parses', () => {
    const { dataKey } = createFounderKey(A);
    const bytes = randomBytes(4096);
    const sealed = sealBlob(A, dataKey, bytes);
    assert.equal(openBlob(A, dataKey, sealed.sha, sealed.ciphertext, sealed.nonce).equals(bytes), true);
  });

  it('refuses a ciphertext too short to hold an authentication tag', () => {
    const { dataKey } = createFounderKey(A);
    assert.throws(() => openBlob(A, dataKey, sha256Hex(Buffer.alloc(0)), Buffer.alloc(4), randomBytes(12)), CryptoRefused);
  });

  it('deduplication is per founder, which is the stated cost of uniform encryption', () => {
    const keyA = createFounderKey(A).dataKey;
    const keyB = createFounderKey(B).dataKey;
    const sealedA = sealBlob(A, keyA, plaintext);
    const sealedB = sealBlob(B, keyB, plaintext);
    // Same content address, and neither can read the other's row.
    assert.equal(sealedB.sha, sealedA.sha);
    assert.throws(() => openBlob(A, keyA, sealedA.sha, sealedB.ciphertext, sealedB.nonce), CryptoRefused);
  });

  it('refuses when the stored bytes hash to something else, even if they authenticate', () => {
    // Construct the fault the sha recheck exists for: a row that authenticates under
    // its own AAD but whose sha column names a different file.
    const { dataKey } = createFounderKey(A);
    const sealed = sealBlob(A, dataKey, plaintext);
    const wrongSha = sha256Hex(Buffer.from('something else'));
    assert.throws(() => openBlob(A, dataKey, wrongSha, sealed.ciphertext, sealed.nonce), CryptoRefused);
  });

  it('does not accept a plain Buffer where a data key belongs, at compile time', () => {
    // The branded type is erased at runtime, so this is a compile time assertion made
    // visible: DataKey is a Buffer with a brand, and a bare Buffer does not satisfy it.
    const notAKey = randomBytes(32);
    // @ts-expect-error a Buffer is not a DataKey
    const bad: DataKey = notAKey;
    assert.equal(bad.length, 32);
  });
});
