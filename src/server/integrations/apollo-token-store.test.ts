/**
 * The envelope, and only the envelope.
 *
 * `saveApolloKey` and `readApolloKey` need a database and are covered where the other
 * connection stores are. What is worth proving without one is the part that would be
 * silent if it were wrong: that a key comes back exactly as it went in, and that one
 * founder's ciphertext cannot be opened under another founder's id.
 *
 * The second is not theoretical. Every founder in this table is a separate person, the
 * rows sit side by side, and an envelope whose AAD was not bound to the founder id would
 * hand back somebody else's live API key while looking like it worked.
 */
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { openApolloKey, sealApolloKey } from './apollo-token-store.ts';

const A = 'fndr_aaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'fndr_bbbbbbbbbbbbbbbbbbbbbbbbbb';

/** Not a key. Long enough to cross the envelope boundaries, and not a real credential. */
const KEY = `not-a-real-apollo-key-${'q'.repeat(40)}`;

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

describe('sealing an Apollo key for the connections table', () => {
  test('what goes in comes out, byte for byte', () => {
    const sealed = sealApolloKey(A, KEY);
    assert.equal(openApolloKey(A, sealed.ciphertext, sealed.nonce), KEY);
  });

  test('the same key sealed twice does not produce the same bytes', () => {
    // A salt and a fresh data key each time. Two identical ciphertexts would mean two
    // founders who pasted the same key were visibly the same row.
    const one = sealApolloKey(A, KEY);
    const two = sealApolloKey(A, KEY);
    assert.notEqual(one.ciphertext.toString('hex'), two.ciphertext.toString('hex'));
  });

  test('one founder cannot open another founder\'s key', () => {
    const sealed = sealApolloKey(A, KEY);
    assert.throws(() => openApolloKey(B, sealed.ciphertext, sealed.nonce));
  });

  test('a row too short to hold an envelope throws rather than reading as absent', () => {
    // Reading a half written row as "no key" would send the founder back to the paste
    // screen while a live credential sat in the database being counted as missing.
    assert.throws(
      () => openApolloKey(A, Buffer.alloc(20), Buffer.alloc(12)),
      /too short to hold an envelope/,
    );
  });
});
