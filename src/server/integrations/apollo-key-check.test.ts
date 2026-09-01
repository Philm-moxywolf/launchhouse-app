/**
 * The key check, against every answer Apollo can give.
 *
 * No network. `vendorFetch` takes a fetch, so each case is one canned reply, and what
 * is being proved is the mapping: which answer becomes which sentence on a founder's
 * screen, and that the key never leaves this file in a return value.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { checkApolloKey, outcomeForApolloStatus } from './apollo-key-check.ts';

const KEY = 'not-a-real-apollo-key-aaaaaaaaaaaaaaaaaaaa';

/** A fetch that answers once, with whatever this test needs. */
function answering(status: number, body: unknown): typeof globalThis.fetch {
  return (async () =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof globalThis.fetch;
}

describe('what Apollo answered, and what the founder is told', () => {
  test('a working key is ok', async () => {
    const out = await checkApolloKey(KEY, answering(200, { total_entries: 4, people: [{ id: 'x' }] }));
    assert.deepEqual(out, { kind: 'ok' });
  });

  test('401 is the key, and it is not called a plan problem', async () => {
    const out = await checkApolloKey(KEY, answering(401, { error: 'unauthorized' }));
    assert.equal(out.kind, 'auth_rejected');
  });

  test('403 is its own answer, because it has two causes', async () => {
    // The plan may not carry the endpoint, or the key may not be scoped to it. Both are
    // the founder's to fix and they are fixed in different places, so this must not
    // collapse into "your key is wrong".
    const out = await checkApolloKey(KEY, answering(403, { error: 'forbidden' }));
    assert.equal(out.kind, 'forbidden');
  });

  test('429 and 500 are Apollo, not the founder', async () => {
    assert.equal((await checkApolloKey(KEY, answering(429, {}))).kind, 'rate_limited');
    assert.equal((await checkApolloKey(KEY, answering(503, {}))).kind, 'vendor_unavailable');
  });

  test('a 200 that is not a search result is refused rather than stored', async () => {
    // A 200 carrying an error object, or a page from something sitting in front of
    // Apollo, would otherwise be written down as a working connection and fail in
    // session 3 with nothing pointing back here.
    const out = await checkApolloKey(KEY, answering(200, { error: 'something else' }));
    assert.equal(out.kind, 'unreadable');
  });

  test('the key is never in the outcome, whatever happened', async () => {
    for (const status of [200, 401, 403, 429, 500]) {
      const out = await checkApolloKey(KEY, answering(status, { error: KEY }));
      assert.doesNotMatch(JSON.stringify(out), new RegExp(KEY), `the key leaked on ${String(status)}`);
    }
  });

  test('the status mapping is exact, and anything unmapped falls through', () => {
    assert.equal(outcomeForApolloStatus(200), null, '200 is not a refusal');
    assert.equal(outcomeForApolloStatus(404), null, 'an unmapped code must not be guessed at');
    assert.equal(outcomeForApolloStatus(500)?.kind, 'vendor_unavailable');
  });
});
