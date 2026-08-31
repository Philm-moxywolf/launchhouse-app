/**
 * ghl-accounts.test.ts: read against the real body, not a body we invented.
 *
 * THE FIXTURE IS A RESPONSE GoHighLevel ACTUALLY SENT, on 31 August 2026, to a Private
 * Integration token made in a sub account on the 97 dollar Starter plan. The names are
 * the real ones because they are the founder's own and this is his own account; nothing
 * about a stranger is in here, and a fixture somebody edited to look plausible would
 * defeat the point of having one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchSocialAccounts,
  locationIdFromAccountId,
  outcomeForStatus,
  readAccountsBody,
} from './ghl-accounts.ts';

const LOCATION = '9HIMUTQAvSnoG5fxrK3t';

/** Verbatim, as it came back. */
const REAL_BODY = JSON.parse(
  '{"success":true,"statusCode":200,"message":"Fetched Accounts","results":{"accounts":[' +
    '{"id":"6a95999316a7ed2f9a6d998f_9HIMUTQAvSnoG5fxrK3t_140683954_page","oauthId":"6a95999316a7ed2f9a6d998f",' +
    '"profileId":"6a95999ac07e64e121674830","name":"Elevate AI Consulting LTD","avatar":"https://example.test/a.jpg",' +
    '"platform":"linkedin","type":"page","expire":"2026-10-30T15:06:14.155Z","isExpired":false,' +
    '"originId":"140683954","meta":{"urn":"urn:li:organization:140683954"},"deleted":false,' +
    '"updatedAt":"2026-08-31T15:11:25.277Z","hasStatisticsPermissions":true,"buildingStatistics":false,' +
    '"syncPosts":false,"hideNativePosts":false},' +
    '{"id":"6a95999316a7ed2f9a6d998f_9HIMUTQAvSnoG5fxrK3t_AJAFOTZzWM_profile","oauthId":"6a95999316a7ed2f9a6d998f",' +
    '"profileId":"6a95999dc3b0f4643dca4e5d","name":"Philip Mudhir","avatar":"https://example.test/b.jpg",' +
    '"platform":"linkedin","type":"profile","expire":"2026-10-30T15:06:14.155Z","isExpired":false,' +
    '"originId":"AJAFOTZzWM","meta":{"urn":"urn:li:person:AJAFOTZzWM"},"deleted":false,' +
    '"updatedAt":"2026-08-31T15:11:27.852Z","hasStatisticsPermissions":true,"buildingStatistics":false,' +
    '"syncPosts":false,"hideNativePosts":false}],"groups":[]},"traceId":"c89f43bf-9866-436f-9a6e-eceee4bd34c1"}',
) as unknown;

test('READS THE REAL RESPONSE, and gets both accounts with the names a founder recognises', () => {
  const out = readAccountsBody(REAL_BODY);
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.deepEqual(
    out.accounts.map((a) => `${a.name} (${a.platform}, ${a.type})`),
    ['Elevate AI Consulting LTD (linkedin, page)', 'Philip Mudhir (linkedin, profile)'],
  );
  assert.deepEqual(out.expired, []);
});

test('THE LOCATION ID FALLS OUT OF THE ACCOUNT ID, which is the mismatch check for free', () => {
  const out = readAccountsBody(REAL_BODY);
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.deepEqual(out.locationIds, [LOCATION], 'both rows belong to the location the token came from');
  assert.equal(locationIdFromAccountId('6a959_9HIMUTQAvSnoG5fxrK3t_140683954_page'), '9HIMUTQAvSnoG5fxrK3t');
  assert.equal(locationIdFromAccountId('nothing-like-an-id'), null, 'a shape we do not recognise reads as unknown, not as a mismatch');
});

test('A DELETED ACCOUNT IS NEVER SHOWN BACK AS PROOF OF A WORKING CONNECTION', () => {
  const body = structuredClone(REAL_BODY) as { results: { accounts: Record<string, unknown>[] } };
  body.results.accounts[0]!['deleted'] = true;
  const out = readAccountsBody(body);
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.deepEqual(out.accounts.map((a) => a.name), ['Philip Mudhir']);
  assert.deepEqual(out.expired, [], 'deleted is not expired, and the two must not be merged');
});

test('AN EXPIRED ACCOUNT IS SURFACED, NOT COUNTED AND NOT HIDDEN', () => {
  // GoHighLevel accepts a post to an expired account and never sends it. A founder
  // who is told they have two working accounts finds out on the Sunday.
  const body = structuredClone(REAL_BODY) as { results: { accounts: Record<string, unknown>[] } };
  body.results.accounts[1]!['isExpired'] = true;
  const out = readAccountsBody(body);
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.deepEqual(out.accounts.map((a) => a.name), ['Elevate AI Consulting LTD']);
  assert.deepEqual(out.expired.map((a) => a.name), ['Philip Mudhir']);
});

test('A MISSING isExpired READS AS EXPIRED, because absent must mean the safe answer', () => {
  const body = structuredClone(REAL_BODY) as { results: { accounts: Record<string, unknown>[] } };
  delete body.results.accounts[0]!['isExpired'];
  const out = readAccountsBody(body);
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.deepEqual(out.accounts.map((a) => a.name), ['Philip Mudhir'], 'the field went missing, so it is not promised as live');
});

test('a body it cannot read says so, rather than reporting no accounts', () => {
  // "You have no accounts" and "we could not read the answer" are different sentences
  // for a founder, and only one of them is their problem to fix.
  for (const [why, body] of [
    ['not an object', 'hello'],
    ['no results', { success: true }],
    ['accounts is not a list', { results: { accounts: 'nope' } }],
  ] as const) {
    const out = readAccountsBody(body);
    assert.equal(out.kind, 'unreadable', `${why} should be unreadable`);
  }
  const empty = readAccountsBody({ results: { accounts: [] } });
  assert.equal(empty.kind, 'ok', 'an empty list is a real answer and means no accounts connected');
});

test('statuses map onto the failures the walk knows how to talk about', () => {
  assert.equal(outcomeForStatus(401)?.kind, 'auth_rejected');
  assert.equal(outcomeForStatus(403)?.kind, 'scope_probably_missing');
  assert.equal(outcomeForStatus(429)?.kind, 'rate_limited');
  assert.equal(outcomeForStatus(503)?.kind, 'vendor_unavailable');
  assert.equal(outcomeForStatus(200), null, '200 is not a failure and must fall through to the body');
});

test('THE CALL IS BUILT THE WAY THE REAL ONE WAS, headers and path included', async () => {
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const spy: typeof globalThis.fetch = (input, init) => {
    seen = { url: String(input), headers: (init?.headers ?? {}) as Record<string, string> };
    return Promise.resolve(new Response(JSON.stringify(REAL_BODY), { status: 200 }));
  };
  const out = await fetchSocialAccounts('pit-example-token', LOCATION, spy);
  assert.equal(out.kind, 'ok');
  assert.ok(seen !== null);
  const call = seen as unknown as { url: string; headers: Record<string, string> };
  assert.equal(call.url, `https://services.leadconnectorhq.com/social-media-posting/${LOCATION}/accounts`);
  assert.equal(call.headers['Authorization'], 'Bearer pit-example-token');
  assert.equal(call.headers['Version'], '2021-07-28');
});

test('THE TOKEN NEVER COMES BACK OUT, in a value or in an error', async () => {
  const TOKEN = 'pit-a-secret-nobody-should-see';
  const failing: typeof globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 401 }));
  const out = await fetchSocialAccounts(TOKEN, LOCATION, failing);
  assert.equal(JSON.stringify(out).includes(TOKEN), false, 'the token reached a return value');

  const refused: typeof globalThis.fetch = () => Promise.reject(new Error('nope'));
  const out2 = await fetchSocialAccounts(TOKEN, 'somewhere', refused);
  assert.equal(JSON.stringify(out2).includes(TOKEN), false, 'the token reached an error');
});
