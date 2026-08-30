/**
 * src/server/agent/anthropic-check.test.ts
 *
 * WHAT THIS IS. The key check, driven with a stubbed Anthropic on the other end of it, and
 * every sentence it can put on a founder's screen put through the project's own prose rule.
 *
 * WHY IT EXISTS. This is the first thing 130 people do, and there is no way to rehearse it
 * against a real refusal: nobody here has a broken key, an account with no credit or a
 * rate limited org to point at. So the stub answers the documented shapes, and what is
 * proved is the part that is ours: that each shape reaches the right sentence, that a key
 * that fails is never treated as one that worked, and that no path anywhere returns a key.
 *
 * THE STUB IS AN ANSWERING MACHINE, NOT A MODEL OF ANTHROPIC. It answers per address, so a
 * test can make the first call succeed and the second fail, which is the case that matters
 * most: a key that is real and an account that cannot write with it. That founder is the
 * one who would otherwise reach session 1 believing they were ready.
 *
 * WHAT IT READS AND WRITES. `scripts/validate.sh` from the content repo, through the prose
 * rule, exactly as routes/copy.test.ts does. Nothing on a socket.
 */

import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { checkProseText } from '../rules/prose.ts';
import { forgetEverythingForTests, rememberAnthropicKey } from './anthropic-key.ts';
import {
  ANSWER_RULES,
  KEY_PROBLEMS,
  MAX_KEY_CHARACTERS,
  checkAnthropicKey,
  codeFor,
  errorMessageIn,
  errorTypeIn,
  modelIdsIn,
  readPastedKey,
  scrubbed,
  type KeyProblemCode,
} from './anthropic-check.ts';

const KEY = 'not-a-real-key-0123456789abcdefghijklmnopqrstuv';

const MODELS_URL = 'https://api.anthropic.com/v1/models';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** A body a real listing would have, with the model our preference list wants in it. */
const A_GOOD_LIST = { data: [{ id: 'claude-opus-5' }, { id: 'claude-haiku-4-5' }] };

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/**
 * A fetch that answers per address and records what it was asked.
 *
 * The recording is what lets the tests below assert that a key never went anywhere it
 * should not have, and that the second call did not happen when the first one failed.
 */
function answering(answers: Readonly<Record<string, Answer>>): {
  fetchImpl: typeof globalThis.fetch;
  calls: { url: string; headers: Record<string, string> }[];
} {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = ((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k] = v;
    calls.push({ url, headers });
    const answer = answers[url];
    if (answer === undefined) return Promise.reject(new Error(`the stub has no answer for ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

const refusal = (type: string, message: string): unknown => ({ type: 'error', error: { type, message } });

afterEach(() => {
  forgetEverythingForTests();
});

// ---------------------------------------------------------------------------------------
// What the founder typed
// ---------------------------------------------------------------------------------------

describe('reading what was pasted', () => {
  test('a key with a newline on the end is trimmed rather than refused', () => {
    // The commonest paste of all. Left alone it throws inside fetch, and the founder reads
    // a 500 rather than a sentence.
    const read = readPastedKey(`  ${KEY}\n`);
    assert.equal(read.ok, true);
    if (read.ok) assert.equal(read.key, KEY);
  });

  test('an empty box is named as an empty box', () => {
    for (const value of ['', '   ', undefined, null, 42]) {
      const read = readPastedKey(value);
      assert.equal(read.ok, false);
      if (!read.ok) assert.equal(read.problem.code, 'empty');
    }
  });

  test('a whole page pasted in is refused before anything is sent', () => {
    const read = readPastedKey('x'.repeat(MAX_KEY_CHARACTERS + 1));
    assert.equal(read.ok, false);
    if (!read.ok) assert.equal(read.problem.code, 'too_long');
  });

  test('CHARACTERS THAT CANNOT GO IN A HEADER ARE CAUGHT HERE, not inside fetch', () => {
    // A smart quote out of a document, and a newline in the middle of a wrapped paste.
    for (const value of [`abc‘def`, `abc\ndef`, 'abc def']) {
      const read = readPastedKey(value);
      assert.equal(read.ok, false, `${JSON.stringify(value)} should not have been accepted`);
      if (!read.ok) assert.equal(read.problem.code, 'not_plain_text');
    }
  });
});

// ---------------------------------------------------------------------------------------
// The mapping table
// ---------------------------------------------------------------------------------------

describe('turning an answer into a sentence', () => {
  test('the documented statuses reach the sentences written for them', () => {
    assert.equal(codeFor('authenticate', 401, 'authentication_error'), 'key_not_accepted');
    assert.equal(codeFor('authenticate', 403, 'permission_error'), 'key_not_allowed');
    assert.equal(codeFor('authenticate', 429, 'rate_limit_error'), 'busy');
    assert.equal(codeFor('authenticate', 500, 'api_error'), 'vendor_down');
    assert.equal(codeFor('authenticate', 529, 'overloaded_error'), 'vendor_down');
    assert.equal(codeFor('generate', 400, 'invalid_request_error'), 'refused_the_test');
    assert.equal(codeFor('generate', 404, 'not_found_error'), 'model_missing');
  });

  test('the stage matters, because the same status means different things', () => {
    // A 400 while listing models is not a founder's billing problem. It is ours, and it
    // must not be reported as theirs.
    assert.equal(codeFor('authenticate', 400, 'invalid_request_error'), 'unknown');
    assert.equal(codeFor('generate', 400, 'invalid_request_error'), 'refused_the_test');
  });

  test('the type is read when the status is one nobody wrote a row for', () => {
    assert.equal(codeFor('authenticate', 418, 'authentication_error'), 'key_not_accepted');
    assert.equal(codeFor('authenticate', 418, 'overloaded_error'), 'vendor_down');
  });

  test('ANYTHING UNRECOGNISED LANDS ON A SENTENCE THAT DOES NOT CLAIM TO KNOW WHY', () => {
    assert.equal(codeFor('authenticate', 418, null), 'unknown');
    assert.equal(codeFor('generate', 451, 'something_nobody_has_seen'), 'unknown');
    assert.match(KEY_PROBLEMS.unknown.title, /do not have words for/);
  });

  test('the last rule is the catch all, so the table can never fall through', () => {
    const last = ANSWER_RULES[ANSWER_RULES.length - 1];
    assert.deepEqual(last, { code: 'unknown' });
  });
});

describe('reading a body', () => {
  test('model ids, and nothing that is not one', () => {
    assert.deepEqual(modelIdsIn(A_GOOD_LIST), ['claude-opus-5', 'claude-haiku-4-5']);
    assert.deepEqual(modelIdsIn({ data: [{ id: 7 }, {}, null, { id: '' }] }), []);
    for (const junk of [null, undefined, 'a string', { data: 'not a list' }, []]) {
      assert.deepEqual(modelIdsIn(junk), []);
    }
  });

  test('the error type and the error message, or null', () => {
    assert.equal(errorTypeIn(refusal('authentication_error', 'invalid x-api-key')), 'authentication_error');
    assert.equal(errorMessageIn(refusal('authentication_error', 'invalid x-api-key')), 'invalid x-api-key');
    for (const junk of [null, {}, { error: 'a string' }, { error: {} }]) {
      assert.equal(errorTypeIn(junk), null);
      assert.equal(errorMessageIn(junk), null);
    }
  });

  test("anthropic's own sentence is capped, because it goes on a founder's screen", () => {
    assert.equal(errorMessageIn(refusal('x', 'y'.repeat(1000)))?.length, 300);
  });
});

// ---------------------------------------------------------------------------------------
// The check itself
// ---------------------------------------------------------------------------------------

describe('checking a key', () => {
  test('a working key passes, and it is proved with a model the account actually listed', async () => {
    const { fetchImpl, calls } = answering({
      [MODELS_URL]: { status: 200, body: A_GOOD_LIST },
      [MESSAGES_URL]: { status: 200, body: { type: 'message', stop_reason: 'max_tokens' } },
    });
    const result = await checkAnthropicKey(KEY, { fetchImpl });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.provedWith, 'claude-haiku-4-5');
    // Two calls, in order, and the key travelled in the documented header both times.
    assert.deepEqual(calls.map((c) => c.url), [MODELS_URL, MESSAGES_URL]);
    for (const call of calls) {
      assert.equal(call.headers['x-api-key'], KEY);
      assert.equal(call.headers['anthropic-version'], '2023-06-01');
    }
  });

  test('THE SECOND CALL IS THE ONE THAT EARNS ITS PLACE: a real key on an account that cannot write', async () => {
    // This founder would otherwise have reached session 1 believing they were set up.
    const { fetchImpl, calls } = answering({
      [MODELS_URL]: { status: 200, body: A_GOOD_LIST },
      [MESSAGES_URL]: {
        status: 400,
        body: refusal('invalid_request_error', 'Your credit balance is too low to access the API'),
      },
    });
    const result = await checkAnthropicKey(KEY, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.problem.code, 'refused_the_test');
      // Their words, carried, because they are better than anything written in advance.
      assert.match(result.problem.vendorSaid ?? '', /credit balance/);
      assert.match(result.problem.whatToDo, /console\.anthropic\.com/);
    }
    assert.equal(calls.length, 2);
  });

  test('a key Anthropic refuses stops at the first call', async () => {
    const { fetchImpl, calls } = answering({
      [MODELS_URL]: { status: 401, body: refusal('authentication_error', 'invalid x-api-key') },
    });
    const result = await checkAnthropicKey(KEY, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem.code, 'key_not_accepted');
    // No second call. A key that is not accepted must not be spent against.
    assert.deepEqual(calls.map((c) => c.url), [MODELS_URL]);
  });

  test('an account that lists no models at all is named rather than probed', async () => {
    const { fetchImpl, calls } = answering({ [MODELS_URL]: { status: 200, body: { data: [] } } });
    const result = await checkAnthropicKey(KEY, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem.code, 'no_models');
    assert.equal(calls.length, 1);
  });

  test('a model this deployment needs and the account does not have is caught before a turn is', async () => {
    const { fetchImpl } = answering({ [MODELS_URL]: { status: 200, body: { data: [{ id: 'claude-haiku-4-5' }] } } });
    const result = await checkAnthropicKey(KEY, { fetchImpl, mustHaveModels: ['claude-opus-5'] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem.code, 'model_missing');
  });

  test('a model nobody here has heard of is still used, because the account listed it', async () => {
    // The preference list is a preference. A founder whose account has none of them is
    // checked against something they really do have rather than refused for our list.
    const { fetchImpl } = answering({
      [MODELS_URL]: { status: 200, body: { data: [{ id: 'claude-something-nobody-here-knows' }] } },
      [MESSAGES_URL]: { status: 200, body: { type: 'message' } },
    });
    const result = await checkAnthropicKey(KEY, { fetchImpl });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.provedWith, 'claude-something-nobody-here-knows');
  });

  test('nothing answering at all is told apart from Anthropic saying no', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('fetch failed'))) as typeof globalThis.fetch;
    const result = await checkAnthropicKey(KEY, { fetchImpl });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem.code, 'cannot_reach');
  });

  test('a vendor that accepts the connection and goes quiet becomes a sentence, not a spinner', async () => {
    /*
      The keep alive is not decoration. AbortSignal.timeout uses a timer that does not hold
      the event loop open, which is right in a server that always has a live socket and
      wrong in a test whose only pending work is the timer. Without it the loop drains and
      this test hangs rather than failing, which is how it was first written.
    */
    const keepAlive = setTimeout(() => undefined, 5_000);
    const fetchImpl = ((_input: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('the deadline passed');
          err.name = 'TimeoutError';
          reject(err);
        });
      })) as typeof globalThis.fetch;
    const result = await checkAnthropicKey(KEY, { fetchImpl, timeoutMs: 10 });
    clearTimeout(keepAlive);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.problem.code, 'no_answer_yet');
  });

  test('NO PATH ANYWHERE HANDS THE KEY BACK', async () => {
    // Every failure shape, serialised whole, checked against the key and against a piece
    // of it. A partial key on a screen is still a key on a screen.
    const shapes: Answer[] = [
      { status: 401, body: refusal('authentication_error', `invalid x-api-key: ${KEY}`) },
      { status: 403, body: refusal('permission_error', KEY) },
      { status: 500, body: refusal('api_error', 'we broke') },
      { status: 200, body: { data: [] } },
    ];
    for (const shape of shapes) {
      const { fetchImpl } = answering({ [MODELS_URL]: shape });
      const result = await checkAnthropicKey(KEY, { fetchImpl });
      const whole = JSON.stringify(result);
      assert.equal(whole.includes(KEY), false, `a key reached the answer for status ${String(shape.status)}`);
      assert.equal(whole.includes(KEY.slice(0, 16)), false, 'part of a key reached the answer');
    }
  });

  test('a key already held is taken out of a vendor sentence as well as the one being checked', () => {
    rememberAnthropicKey('f_1', 'a-key-that-is-already-held', new Date());
    const line = `it said a-key-that-is-already-held and ${KEY}`;
    const out = scrubbed(line, KEY);
    assert.equal(out.includes(KEY), false);
    assert.equal(out.includes('a-key-that-is-already-held'), false);
  });
});

// ---------------------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------------------

describe('every sentence on the key screen', () => {
  test('obeys the house style, the same rule the rest of the product is held to', () => {
    let checked = 0;
    for (const [code, problem] of Object.entries(KEY_PROBLEMS)) {
      for (const [field, text] of Object.entries({ title: problem.title, whatToDo: problem.whatToDo })) {
        const result = checkProseText(`KEY_PROBLEMS.${code}.${field}`, text);
        assert.equal(
          result.violations.length,
          0,
          `${code}.${field}: ${result.violations.map((v) => v.message).join(' ')}`,
        );
        checked += 1;
      }
    }
    // A floor, so an empty table cannot pass this by having nothing to check.
    assert.ok(checked >= 24, `only ${String(checked)} sentences were checked`);
  });

  test('never reads a status code back to the founder', () => {
    for (const [code, problem] of Object.entries(KEY_PROBLEMS)) {
      assert.doesNotMatch(`${problem.title} ${problem.whatToDo}`, /\b[45]\d\d\b/, `${code} quotes a status code`);
    }
  });

  test('always ends on something to do', () => {
    for (const [code, problem] of Object.entries(KEY_PROBLEMS)) {
      assert.ok(problem.whatToDo.trim().length > 0, `${code} has no action`);
      // An instruction, not a feeling. Every one of these starts with or contains a verb
      // the founder can act on, and the cheap test for that is that it names a place to
      // go, a button to press, or a person to tell.
      assert.match(
        problem.whatToDo,
        /console\.anthropic\.com|press|paste|wait|tell|show/i,
        `${code} does not tell the founder what to do: ${problem.whatToDo}`,
      );
    }
  });

  test('says the founder"s work is safe wherever a key was not saved', () => {
    const mustReassure: KeyProblemCode[] = ['key_not_accepted', 'model_missing', 'no_answer_yet', 'unknown', 'not_saved'];
    for (const code of mustReassure) {
      assert.match(
        KEY_PROBLEMS[code].whatToDo,
        /nothing you have made is affected|nothing you have already made is affected/i,
        `${code} does not answer the first question a founder has`,
      );
    }
  });
});
