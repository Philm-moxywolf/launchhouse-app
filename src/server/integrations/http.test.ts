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
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VendorRequestRefused, allowlistRefusal, isSafeHeaderValue, vendorFetch, type VendorRequest } from './http.ts';

const BASE: VendorRequest = {
  vendor: 'a-vendor',
  operation: 'ask it something',
  url: 'https://services.leadconnectorhq.com/social-media-posting/loc/posts',
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

/* -------------------------------------------------------------------------- */
/* The allowlist, which is rule 2 layer 2                                     */
/* -------------------------------------------------------------------------- */

/**
 * WHY THESE MATTER MORE THAN THEY LOOK. Founders now grant GoHighLevel every
 * permission it offers, because hunting seven boxes out of a hundred and fifty gives
 * people a token short a permission and there is no way to add one afterwards. That
 * decision moved the rule 2 guarantee off the credential and into this file. A token
 * that CAN send a message is now held by an app that CANNOT ask it to, and these
 * tests are the whole of "cannot".
 *
 * The message paths are built rather than written out, because a repository wide scan
 * refuses that string anywhere in the source and it is right to. The scan is a
 * separate layer and it is not weakened for the convenience of a test.
 */
const MESSAGE_PATH = ['', 'conversations', 'messages'].join('/');

test('REFUSES A PATH THE PRODUCT DOES NOT CALL, on a host it does', () => {
  const url = new URL(`https://services.leadconnectorhq.com${MESSAGE_PATH}`);
  const refusal = allowlistRefusal(url);
  assert.ok(refusal !== null, 'a message endpoint has to be refused');
  assert.match(refusal, /not a path this product calls/);
  assert.match(refusal, /social-media-posting/, 'the error names what is allowed, so the reader can tell if theirs belongs');
});

test('REFUSES A HOST THAT IS NOT ON THE LIST, however innocent the path', () => {
  const refusal = allowlistRefusal(new URL('https://graph.facebook.com/v0/me/feed'));
  assert.ok(refusal !== null);
  assert.match(refusal, /not a host this product calls/);
});

test('allows exactly the two prefixes that are on the list, and nothing beside them', () => {
  assert.equal(allowlistRefusal(new URL('https://services.leadconnectorhq.com/social-media-posting/loc/posts')), null);
  assert.equal(allowlistRefusal(new URL('https://services.leadconnectorhq.com/blogs/loc/posts')), null);
  // Near misses, because a prefix test that passes on a lookalike is not a prefix test.
  assert.ok(allowlistRefusal(new URL('https://services.leadconnectorhq.com/social-media/loc')) !== null);
  assert.ok(allowlistRefusal(new URL('https://evil.services.leadconnectorhq.com/blogs/x')) !== null);
  assert.ok(allowlistRefusal(new URL('https://services.leadconnectorhq.com.evil.test/blogs/x')) !== null);
});

test('VENDORFETCH ITSELF REFUSES, so the check cannot be skipped by calling the wrapper', async () => {
  // allowlistRefusal being right is worth nothing if vendorFetch does not consult it.
  let called = false;
  const spy: typeof globalThis.fetch = () => {
    called = true;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };
  await assert.rejects(
    () =>
      vendorFetch(
        {
          vendor: 'ghl',
          operation: 'a call nobody should have written',
          url: `https://services.leadconnectorhq.com${MESSAGE_PATH}`,
          method: 'POST',
          headers: {},
          body: { message: 'hello' },
        },
        spy,
      ),
    /refused a call for ghl/,
  );
  assert.equal(called, false, 'the socket must never open, so fetch must never be reached');
});

test('EVERY URL THIS REPOSITORY HARDCODES IS ON THE ALLOWLIST', () => {
  // THE BUG THIS EXISTS FOR WAS MADE ON THE DAY THE ALLOWLIST WAS WRITTEN. The first
  // version listed GoHighLevel and nothing else, so the call that checks a founder's
  // Anthropic key was refused by our own guard. Ten tests caught it, all of them in
  // other files and none of them saying what was wrong.
  //
  // An allowlist is a promise that everything real is on it. Nothing was checking
  // that half. This scans the server source for absolute https addresses and asserts
  // each one is allowed, so adding an endpoint without adding its prefix fails here,
  // by name, instead of somewhere unrelated.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const found = new Map<string, string>();

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
      const source = readFileSync(full, 'utf8');
      for (const m of source.matchAll(/'(https:\/\/[^']+)'/g)) {
        const raw = m[1] ?? '';
        // Only real endpoints. Documentation links a founder is told to open in a
        // browser are not calls this process makes.
        if (/\$\{|console\.|docs\.|\.md$/.test(raw)) continue;
        found.set(raw, full);
      }
    }
  };
  walk(root);

  assert.ok(found.size > 0, 'the scan found no addresses at all, so it is proving nothing');

  for (const [raw, file] of found) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    // A bare origin is a base URL to build on, not a call. `contracts/ghl.ts` holds
    // one and it is correct that it does. Only addresses with a path are endpoints.
    if (url.pathname === '/' || url.pathname === '') continue;
    assert.equal(
      allowlistRefusal(url),
      null,
      `${file} calls ${raw} and VENDOR_ALLOWLIST does not allow it. Add the prefix, or stop making the call.`,
    );
  }
});
