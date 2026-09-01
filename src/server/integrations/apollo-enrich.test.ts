/**
 * Enrichment, which is the one call that spends a founder's money.
 *
 * So what is tested here is mostly about restraint: the cap holds before any call goes
 * out, the two revealing parameters are never on, a refusal stops the loop instead of
 * burning the rest of the batch, and a person with no email comes back marked rather
 * than dropped or invented.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ENRICH_CAP, enrichWithKey } from './apollo-enrich.ts';

describe('the cap', () => {
  test('is a batch size, not the programme number', () => {
    // IT WAS 25 AND THAT WAS A MISREADING. Twenty five is what a founder is promised
    // they will have done by the Saturday, a floor under the programme rather than a
    // ceiling on a person, and the Apollo account is theirs. This is one batch, matching
    // Apollo's own per-page maximum, and it exists only to catch a model that has
    // misread a conversation and asked for ten thousand.
    assert.equal(ENRICH_CAP, 100);
    assert.ok(ENRICH_CAP > 25, 'a founder who wants more than the promise is not misusing this');
  });
});

describe('what a founder is charged for', () => {
  /** A fetch that records every URL it was given and answers however the test says. */
  function recording(answers: readonly { status: number; body: unknown }[]) {
    const urls: string[] = [];
    let i = 0;
    const impl = (async (input: unknown) => {
      urls.push(String(input));
      const a = answers[Math.min(i, answers.length - 1)];
      i += 1;
      return new Response(JSON.stringify(a?.body ?? {}), {
        status: a?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof globalThis.fetch;
    return { impl, urls };
  }

  const KEY = 'not-a-real-apollo-key-zzzzzzzzzzzzzzzz';
  const one = (email: unknown) => ({
    status: 200,
    body: { person: { id: 'p1', first_name: 'Ada', last_name: 'Lovelace', title: 'Head', organization_name: 'Acme', email, email_status: 'verified' } },
  });

  test('asking for more than the cap spends nothing at all', async () => {
    const { impl, urls } = recording([one('a@b.com')]);
    const tooMany = Array.from({ length: ENRICH_CAP + 1 }, (_, n) => `id-${String(n)}`);
    const out = await enrichWithKey(KEY, tooMany, impl);
    assert.equal(out.kind, 'too_many');
    assert.equal(urls.length, 0, 'the cap must hold before any call goes out, not after');
  });

  test('neither revealing parameter is ever switched on', async () => {
    // Personal addresses and mobile numbers are a different act with a different
    // consent question, and they cost more. They are not tool arguments and they are
    // not defaults, so the only way they could turn on is a typo here.
    const { impl, urls } = recording([one('a@b.com')]);
    await enrichWithKey(KEY, ['p1'], impl);
    assert.equal(urls.length, 1);
    assert.match(urls[0] ?? '', /reveal_personal_emails=false/);
    assert.match(urls[0] ?? '', /reveal_phone_number=false/);
  });

  test('a refusal stops the loop instead of burning the rest of the batch', async () => {
    // An account out of credit answers the same way for everybody after the first, so
    // carrying on would turn one refusal into twenty five charges-worth of attempts and
    // tell the founder nothing they did not know after the first.
    const { impl, urls } = recording([{ status: 403, body: { error: 'forbidden' } }]);
    const out = await enrichWithKey(KEY, ['a', 'b', 'c', 'd'], impl);
    assert.equal(out.kind, 'forbidden');
    assert.equal(urls.length, 1, 'it must stop on the first refusal');
  });

  test('somebody with no email comes back marked, not dropped and not invented', async () => {
    // Apollo does not have an address for everybody. A founder choosing 25 needs to know
    // which of their choices cannot be written to, so the row survives with email null.
    const { impl } = recording([one('email_not_unlocked@domain.com'), one(null)]);
    const out = await enrichWithKey(KEY, ['p1'], impl);
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    assert.equal(out.people.length, 1, 'the person is kept');
    assert.equal(out.people[0]?.name, 'Ada Lovelace');
  });

  test('a null email is read as no email rather than as the string null', async () => {
    const { impl } = recording([one(null)]);
    const out = await enrichWithKey(KEY, ['p1'], impl);
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    assert.equal(out.people[0]?.email, null);
  });

  test('what was actually charged for is reported, not what was asked for', async () => {
    const { impl } = recording([one('a@b.com')]);
    const out = await enrichWithKey(KEY, ['p1', 'p2', 'p3'], impl);
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    assert.equal(out.spentOn, 3, 'three calls answered, so three is what it cost');
  });
});
