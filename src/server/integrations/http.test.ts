/**
 * src/server/integrations/http.test.ts
 *
 * WHAT THIS IS. Tests for the one function in this repository that calls a host we do not
 * own.
 *
 * WHY IT EXISTS. Every guard in that file exists because of a specific way a founder's
 * first two minutes can go wrong, and every one of them is invisible in a code review:
 * a call with no deadline looks like a call, a header with a newline in it looks like a
 * string, and a body read without a cap looks like reading a body. So each guard is driven
 * into its failing state here rather than trusted.
 *
 * WHAT IT READS AND WRITES. Nothing. No socket is opened: every test hands in its own
 * fetch.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { VendorRequestRefused, isSafeHeaderValue, vendorFetch, type VendorRequest } from './http.ts';

const BASE: VendorRequest = {
  vendor: 'a-vendor',
  operation: 'ask it something',
  url: 'https://example.invalid/v1/thing',
  method: 'GET',
  headers: { 'x-api-key': 'not-a-real-key' },
};

const answersWith = (status: number, body: unknown): typeof globalThis.fetch =>
  (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    )) as typeof globalThis.fetch;

describe('what it refuses to send at all', () => {
  test('A CREDENTIAL NEVER TRAVELS IN THE CLEAR', async () => {
    await assert.rejects(
      () => vendorFetch({ ...BASE, url: 'http://example.invalid/v1/thing' }, answersWith(200, {})),
      VendorRequestRefused,
    );
  });

  test('and it does send over https, so the test above is about the scheme', async () => {
    const answer = await vendorFetch(BASE, answersWith(200, { ok: true }));
    assert.equal(answer.kind, 'answered');
  });

  test('a URL with credentials in it is refused, because they belong in a header', async () => {
    await assert.rejects(
      () => vendorFetch({ ...BASE, url: 'https://user:pass@example.invalid/v1' }, answersWith(200, {})),
      VendorRequestRefused,
    );
  });

  test('something that is not a URL is a mistake in our code and says so', async () => {
    await assert.rejects(() => vendorFetch({ ...BASE, url: 'not a url' }, answersWith(200, {})), VendorRequestRefused);
  });

  test('A HEADER VALUE WITH A NEWLINE IN IT IS CAUGHT HERE, not inside fetch', async () => {
    // The shape of a key pasted out of a wrapped email. Left alone, the platform throws a
    // TypeError, the founder gets a 500, and it reads as the app being broken.
    await assert.rejects(
      () => vendorFetch({ ...BASE, headers: { 'x-api-key': 'abc\ndef' } }, answersWith(200, {})),
      VendorRequestRefused,
    );
  });

  test('and the refusal names the header rather than its value', async () => {
    await vendorFetch({ ...BASE, headers: { 'x-secret-thing': 'abc\ndef' } }, answersWith(200, {})).then(
      () => assert.fail('it should have refused'),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        assert.match(message, /x-secret-thing/);
        assert.equal(message.includes('abc'), false, 'the value reached the message');
      },
    );
  });

  test('the header check itself, on its own', () => {
    assert.equal(isSafeHeaderValue('sk-ant-looks-fine-0123'), true);
    assert.equal(isSafeHeaderValue('has a space'), true);
    assert.equal(isSafeHeaderValue('has\na newline'), false);
    assert.equal(isSafeHeaderValue('has\ta tab'), false);
    assert.equal(isSafeHeaderValue('has a smart quote ‘'), false);
  });
});

describe('what comes back', () => {
  test('a refusal is an answer, and the body comes with it', async () => {
    const answer = await vendorFetch(BASE, answersWith(401, { error: { type: 'authentication_error' } }));
    assert.equal(answer.kind, 'answered');
    if (answer.kind === 'answered') {
      assert.equal(answer.status, 401);
      assert.deepEqual(answer.body, { error: { type: 'authentication_error' } });
    }
  });

  test('a body that is not JSON is still a status', async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('<html>a proxy error page</html>', { status: 502 }))) as typeof globalThis.fetch;
    const answer = await vendorFetch(BASE, fetchImpl);
    assert.equal(answer.kind, 'answered');
    if (answer.kind === 'answered') {
      assert.equal(answer.status, 502);
      assert.equal(answer.body, null);
    }
  });

  test('a reply with no body at all does not throw', async () => {
    const fetchImpl = (() => Promise.resolve(new Response(null, { status: 204 }))) as typeof globalThis.fetch;
    const answer = await vendorFetch(BASE, fetchImpl);
    assert.equal(answer.kind, 'answered');
  });

  test('A MEGABYTE OF HTML IS NOT READ INTO A CONTAINER SIZED FOR ONE FOUNDER', async () => {
    const huge = 'x'.repeat(1024 * 1024);
    const fetchImpl = (() =>
      Promise.resolve(new Response(huge, { status: 500 }))) as typeof globalThis.fetch;
    const answer = await vendorFetch(BASE, fetchImpl);
    assert.equal(answer.kind, 'answered');
    // It read the status and stopped. The body was not JSON, so there is nothing to keep.
    if (answer.kind === 'answered') assert.equal(answer.body, null);
  });

  test('a host that is not there is told apart from one that goes quiet', async () => {
    const unreachable = (() => Promise.reject(new TypeError('fetch failed'))) as typeof globalThis.fetch;
    const answer = await vendorFetch(BASE, unreachable);
    assert.equal(answer.kind, 'no_answer');
    if (answer.kind === 'no_answer') assert.equal(answer.reason, 'unreachable');
  });

  test('A DEADLINE IS ACTUALLY SET, and a vendor that never answers becomes a sentence', async () => {
    /*
      The keep alive is not decoration. AbortSignal.timeout uses a timer that does not hold
      the event loop open, which is right in a server that always has a live request in
      flight and wrong in a test whose only pending work is the timer itself. Without this
      the loop drains, the timeout never fires and the test hangs, which is how it was
      first written and what running it turned up.
    */
    const keepAlive = setTimeout(() => undefined, 5_000);
    // Without the signal this promise never settles and the founder watches a spinner for
    // ever. The stub proves the signal is there by waiting on it.
    const quiet = ((_input: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        // Null as well as undefined: the platform type allows both, and a null signal is
        // exactly the bug this test exists to catch.
        assert.ok(init?.signal !== undefined && init.signal !== null, 'no deadline was set on the request');
        init.signal.addEventListener('abort', () => {
          const err = new Error('the deadline passed');
          err.name = 'TimeoutError';
          reject(err);
        });
      })) as typeof globalThis.fetch;
    const answer = await vendorFetch({ ...BASE, timeoutMs: 20 }, quiet);
    clearTimeout(keepAlive);
    assert.equal(answer.kind, 'no_answer');
    if (answer.kind === 'no_answer') assert.equal(answer.reason, 'timeout');
  });

  test('a POST sends its body as JSON and says so', async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = ((_input: string | URL, init?: RequestInit) => {
      seen = init;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof globalThis.fetch;
    await vendorFetch({ ...BASE, method: 'POST', body: { a: 1 } }, fetchImpl);
    assert.equal(seen?.method, 'POST');
    assert.equal(seen?.body, '{"a":1}');
    assert.equal((seen?.headers as Record<string, string>)['content-type'], 'application/json');
  });
});
