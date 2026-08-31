/**
 * ghl-connect.test.ts: the WIRING, not the pieces.
 *
 * WHY THIS FILE EXISTS, and it is the useful part. Two bugs reached a founder's screen
 * on 31 August, and the suite was green through both of them:
 *
 *   Check the connection always answered "that did not arrive as a token we can read"
 *   about a token that was fine, because /verify and /token were pointed at one handler
 *   that read the token out of the request body and /verify sends no body on purpose.
 *
 *   A connected founder was told "posting to: nothing yet" on every page load, because
 *   the accounts came back in one response and were never written down. The ids
 *   createPost needs did not exist anywhere.
 *
 * Both were tested at the unit level and both passed. `readStoredAccounts` was correct.
 * `fetchSocialAccounts` was correct. What nobody asserted was that the routes used
 * them. So these tests drive the real addresses through the real app and assert what a
 * founder would see, and each one is proved by putting the original bug back.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FOUNDER_A } from '../auth/test-fixtures.ts';
import { buildHarness, type Harness } from './test-fixtures.ts';

const GHL = 'ghl';
const LOCATION = '9HIMUTQAvSnoG5fxrK3t';

async function signedIn(h: Harness): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/signin',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ passphrase: h.passphrase }).toString(),
  });
  assert.equal(res.statusCode, 303, 'the passphrase did not sign anybody in');
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

test('CHECK THE CONNECTION DOES NOT ASK FOR A TOKEN IN THE BODY', async (t) => {
  const h = await buildHarness();
  t.after(async () => { await h.app.close(); });
  const cookie = await signedIn(h);

  // Exactly what the browser sends when somebody presses Check the connection: a POST
  // with no body at all.
  const res = await h.app.inject({ method: 'POST', url: '/api/setup/ghl/verify', headers: { cookie } });

  // `errorBody` names the field `error`, not `code`. Reading the wrong one made the
  // first version of this test pass against undefined, which is the same class of
  // mistake it exists to catch.
  const body = res.json<{ error?: string; message?: string }>();
  assert.notEqual(
    body.error,
    'bad_token',
    'Check the connection answered "that did not arrive as a token we can read" against a button that sends no token',
  );
  // Nothing is stored in this harness, so the honest answer names the first thing
  // missing: the Location ID, which the call cannot be made without.
  assert.equal(body.error, 'no_location_yet');
  assert.match(body.message ?? '', /Location ID/);
});

test('PASTING A TOKEN STILL READS IT FROM THE BODY, so the two ways in stay different', async (t) => {
  const h = await buildHarness();
  t.after(async () => { await h.app.close(); });
  const cookie = await signedIn(h);

  // With a location saved, a paste with no token in it is the founder's own slip and
  // has to say so, rather than falling through to the same answer as the verify button.
  await h.store.saveLocationId(FOUNDER_A, GHL, LOCATION, new Date());
  const res = await h.app.inject({ method: 'POST', url: '/api/setup/ghl/token', headers: { cookie } });
  assert.equal(res.json<{ error?: string }>().error, 'bad_token', 'a paste with no token has to say so');

  // And the verify button, with a location but nothing stored, names the token.
  const verify = await h.app.inject({ method: 'POST', url: '/api/setup/ghl/verify', headers: { cookie } });
  assert.equal(verify.json<{ error?: string }>().error, 'no_token_yet');
});

test('THE SETUP STATE READS BACK THE ACCOUNTS THE LAST CHECK SAW', async (t) => {
  const h = await buildHarness();
  t.after(async () => { await h.app.close(); });
  const cookie = await signedIn(h);

  // A founder who connected earlier: a row with accounts on it, as a real check leaves.
  await h.store.saveLocationId(FOUNDER_A, GHL, LOCATION, new Date());
  h.store.setConnectionAccounts(
    FOUNDER_A,
    GHL,
    JSON.stringify([
      { id: `a_${LOCATION}_1_page`, name: 'Elevate AI Consulting LTD', platform: 'linkedin', type: 'page' },
      { id: `a_${LOCATION}_2_profile`, name: 'Philip Mudhir', platform: 'linkedin', type: 'profile' },
    ]),
  );

  const res = await h.app.inject({ method: 'GET', url: '/api/setup', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const state = res.json<{ ghl: { accounts: { name: string }[] } }>();
  assert.deepEqual(
    state.ghl.accounts.map((a) => a.name),
    ['Elevate AI Consulting LTD', 'Philip Mudhir'],
    'the connected screen would say "posting to: nothing yet" with their accounts sitting in GoHighLevel',
  );
});

test('A PENDING MIGRATION MUST NOT TAKE DOWN THE SETUP SCREEN', async (t) => {
  // THE BUG, and it reached a live deployment. The accounts column arrived in migration
  // 0002 and `findConnection` was changed to select it. Any process running the new code
  // against a database that had not run the migration answered every setup request with
  // a 500. The founder saw "We could not open your setup" and an incident id, and their
  // Anthropic key and GoHighLevel connection looked lost. Nothing was lost: nothing
  // could be read at all.
  //
  // A COLUMN ADDED FOR A NEW FEATURE MUST NOT BE ABLE TO BREAK AN OLD SCREEN. The
  // accounts read is asked separately and is not allowed to throw, so the worst case is
  // a founder seeing no accounts until the migration lands.
  const h = await buildHarness();
  t.after(async () => { await h.app.close(); });
  const cookie = await signedIn(h);

  // A store whose accounts column does not exist yet, which is what a pending migration
  // looks like from the route's side.
  const realAccounts = h.store.connectionAccountsFor.bind(h.store);
  h.store.connectionAccountsFor = () =>
    Promise.reject(new Error('column "accounts" does not exist'));
  t.after(() => {
    h.store.connectionAccountsFor = realAccounts;
  });

  await h.store.saveLocationId(FOUNDER_A, GHL, LOCATION, new Date());

  const res = await h.app.inject({ method: 'GET', url: '/api/setup', headers: { cookie } });
  assert.equal(res.statusCode, 200, 'the setup screen must open even while a migration is pending');
  const state = res.json<{ ghl: { locationId: string | null; accounts: unknown[] } }>();
  assert.equal(state.ghl.locationId, LOCATION, 'everything that does not need the new column still reads');
  assert.deepEqual(state.ghl.accounts, [], 'no accounts is the honest answer, and it is not a 500');
});
