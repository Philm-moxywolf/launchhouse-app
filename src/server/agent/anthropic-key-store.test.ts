/**
 * src/server/agent/anthropic-key-store.test.ts
 *
 * WHAT THIS IS. The envelope a stored Anthropic key is kept in, sealed and opened for real,
 * with a real master key. No database: the two columns are made and read back in memory,
 * which is the whole of the part that could silently be wrong.
 *
 * WHY IT EXISTS. The key goes into one `bytea` column as three pieces glued together, and
 * every way that can go wrong is quiet. Off by one in the slicing gives a key with a byte
 * missing, which Anthropic then refuses with a founder who swears they pasted it right.
 * The salt that stops the stored hash being a hash of the key itself is sixteen bytes that
 * nothing would ever complain about if they were dropped. And the founder id in the
 * authenticated data is the last wall between a bug in a WHERE clause and one founder using
 * another founder's account, so it is driven into failing here rather than assumed.
 *
 * WHAT IT READS AND WRITES. GE_MASTER_KEY, set and put back by this file, exactly the way
 * storage/crypto.test.ts does it. Nothing on a socket and nothing in a database.
 */

import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { CryptoRefused } from '../storage/crypto.ts';
import { openAnthropicKey, sealAnthropicKey } from './anthropic-key-store.ts';

/** ULID shaped, because storage/paths.ts refuses anything else for a founder. */
const A = '01J8ZQTMK4NRC7XVYB3D9GHF2W';
const B = '01J8ZQTMK4NRC7XVYB3D9GHF2X';

/** Not a key. The shape is right and the value is not one. */
const KEY = `sk-ant-not-a-real-key-${'z'.repeat(80)}`;

const MASTER = randomBytes(32).toString('base64');
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.GE_MASTER_KEY;
  process.env.GE_MASTER_KEY = MASTER;
});

afterEach(() => {
  if (saved === undefined) delete process.env.GE_MASTER_KEY;
  else process.env.GE_MASTER_KEY = saved;
});

describe('sealing a key for the connections table', () => {
  test('what goes in comes out, byte for byte', () => {
    const sealed = sealAnthropicKey(A, KEY);
    assert.equal(openAnthropicKey(A, sealed.ciphertext, sealed.nonce), KEY);
  });

  test('THE COLUMNS HOLD NOTHING THAT LOOKS LIKE THE KEY', () => {
    const sealed = sealAnthropicKey(A, KEY);
    const asText = sealed.ciphertext.toString('utf8') + sealed.nonce.toString('utf8');
    assert.equal(asText.includes(KEY), false);
    assert.equal(asText.includes('sk-ant'), false);
    assert.equal(sealed.ciphertext.toString('hex').includes(Buffer.from(KEY).toString('hex')), false);
  });

  test('THE SALT MEANS TWO ROWS FOR THE SAME KEY SHARE NOTHING, not even their hash', () => {
    // Without the sixteen random bytes in front of the plaintext, the sha stored inside the
    // envelope would be the sha of the key, which is a way to check a guess against a
    // database dump. Two seals of one key must have nothing in common.
    const first = sealAnthropicKey(A, KEY);
    const second = sealAnthropicKey(A, KEY);
    assert.notEqual(first.ciphertext.toString('hex'), second.ciphertext.toString('hex'));
    assert.notEqual(first.nonce.toString('hex'), second.nonce.toString('hex'));
    // The sha sits at a known place in the envelope. It must differ too.
    assert.notEqual(first.ciphertext.subarray(61, 93).toString('hex'), second.ciphertext.subarray(61, 93).toString('hex'));
  });

  test('the key version is recorded, so a rotation can find the rows it has to rewrite', () => {
    assert.equal(sealAnthropicKey(A, KEY).keyVersion, 1);
  });

  test('a key of any length survives, including a short one and a long one', () => {
    for (const value of ['x', 'sk-ant-' + 'y'.repeat(400)]) {
      const sealed = sealAnthropicKey(A, value);
      assert.equal(openAnthropicKey(A, sealed.ciphertext, sealed.nonce), value);
    }
  });
});

describe('the walls, driven into failing', () => {
  test('ONE FOUNDER"S ROW DOES NOT OPEN UNDER ANOTHER FOUNDER"S ID', () => {
    // The last wall between a bug in a WHERE clause and one founder spending another
    // founder's money. It has to throw, not return something.
    const sealed = sealAnthropicKey(A, KEY);
    assert.throws(() => openAnthropicKey(B, sealed.ciphertext, sealed.nonce), CryptoRefused);
  });

  test('a row whose bytes were changed does not open', () => {
    const sealed = sealAnthropicKey(A, KEY);
    const tampered = Buffer.from(sealed.ciphertext);
    // The last byte, which is inside the sealed part rather than the wrapper.
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    assert.throws(() => openAnthropicKey(A, tampered, sealed.nonce), CryptoRefused);
  });

  test('a row with the wrong nonce does not open', () => {
    const sealed = sealAnthropicKey(A, KEY);
    assert.throws(() => openAnthropicKey(A, sealed.ciphertext, randomBytes(12)), CryptoRefused);
  });

  test('a row too short to hold an envelope is refused rather than read as no key', () => {
    // The failure this prevents: a half written row read as "they never pasted one",
    // sending the founder back to the paste screen with a live credential still stored.
    assert.throws(() => openAnthropicKey(A, Buffer.alloc(40), Buffer.alloc(12)), /too short/);
  });

  test('with a different master key the row does not open, and it says so rather than guessing', () => {
    const sealed = sealAnthropicKey(A, KEY);
    process.env.GE_MASTER_KEY = randomBytes(32).toString('base64');
    assert.throws(() => openAnthropicKey(A, sealed.ciphertext, sealed.nonce), CryptoRefused);
  });
});
