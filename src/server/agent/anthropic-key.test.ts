/**
 * src/server/agent/anthropic-key.test.ts
 *
 * WHAT THIS IS. Tests for the holder that makes a pasted Anthropic key usable without a
 * restart, and for the one property the whole change exists to deliver: a key stored while
 * the process is running reopens the routes that start a turn.
 *
 * WHY IT EXISTS. The holder is four small functions and a Map, and every one of them is a
 * silent failure if it is wrong. A read that ignores the founder id spends one founder's
 * money on another founder's work. A listener that is never called leaves the gate shut
 * while the screen says everything is fine. A scrub that misses leaves a key in a log.
 * None of those three shows up in a code review as anything other than reasonable code.
 *
 * EVERY GUARD IS DRIVEN INTO ITS FAILING STATE FIRST. The gate is asserted shut before it
 * is asserted open, the wrong founder id is asked before the right one, and the scrub is
 * checked against a string it should leave alone as well as one it must change. A guard
 * that has only ever been seen passing is a guard nobody has checked.
 *
 * WHAT IT READS AND WRITES. Nothing. No database, no network, no key.
 */

import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { ReadinessState, installReadinessGates, type ReadinessFacts } from '../boot/readiness.ts';
import {
  anthropicKeyFor,
  anthropicKeyForThisDeployment,
  anthropicKeyIsSet,
  describeAnthropicKey,
  forgetAnthropicKey,
  forgetEverythingForTests,
  onAnthropicKeyChanged,
  rememberAnthropicKey,
  scrubAnthropicKeys,
} from './anthropic-key.ts';

/** Not a key. Long enough and odd enough that a partial match would be visible. */
const KEY_A = 'not-a-real-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'not-a-real-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const AT = new Date('2026-09-07T14:00:00.000Z');

afterEach(() => {
  forgetEverythingForTests();
});

describe('holding a key', () => {
  test('nothing is held until something is stored', () => {
    assert.equal(anthropicKeyIsSet(), false);
    assert.deepEqual(describeAnthropicKey('f_1'), { set: false, checkedAt: null, length: null });
  });

  test('a stored key is handed to the founder it belongs to', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    assert.equal(anthropicKeyFor('f_1', 'from-the-environment'), KEY_A);
    assert.equal(anthropicKeyIsSet(), true);
  });

  test('AND IT IS NOT HANDED TO ANYBODY ELSE, which is the failure that costs money', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    // The whole point. Founder two gets the environment, which on a founder's own
    // deployment is empty, so their turn fails rather than billing founder one.
    assert.equal(anthropicKeyFor('f_2', 'from-the-environment'), 'from-the-environment');
  });

  test('the environment is the fallback and the pasted key wins over it', () => {
    assert.equal(anthropicKeyFor('f_1', 'from-the-environment'), 'from-the-environment');
    rememberAnthropicKey('f_1', KEY_A, AT);
    assert.equal(anthropicKeyFor('f_1', 'from-the-environment'), KEY_A);
  });

  test('forgetting puts it back to nothing held', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    forgetAnthropicKey('f_1');
    assert.equal(anthropicKeyIsSet(), false);
    assert.equal(anthropicKeyFor('f_1', ''), '');
  });

  test('what a screen may know is a boolean, a length and a date, and never a key', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    const described = describeAnthropicKey('f_1');
    assert.deepEqual(described, { set: true, checkedAt: AT.toISOString(), length: KEY_A.length });
    // Belt and braces on the shape: the key must not be reachable through it by any route.
    assert.equal(JSON.stringify(described).includes(KEY_A), false);
    assert.equal(JSON.stringify(described).includes(KEY_A.slice(0, 8)), false);
  });
});

describe('the key for work with no founder in scope', () => {
  test('with one founder it is that founder"s key, because that is the shape of a deployment', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    assert.equal(anthropicKeyForThisDeployment('from-the-environment'), KEY_A);
  });

  test('WITH TWO IT REFUSES, rather than picking one of them', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    rememberAnthropicKey('f_2', KEY_B, AT);
    // A shrug from the routing classifier is the right failure here. Charging one
    // founder's account to read another founder's sentence is not.
    assert.equal(anthropicKeyForThisDeployment('from-the-environment'), 'from-the-environment');
  });

  test('with none it is the environment', () => {
    assert.equal(anthropicKeyForThisDeployment('from-the-environment'), 'from-the-environment');
  });
});

describe('taking a key out of a string before it is written down', () => {
  test('IT LEAVES A STRING ALONE WHEN NOTHING IS HELD, so the next test is not vacuous', () => {
    const line = `something went wrong near ${KEY_A}`;
    assert.equal(scrubAnthropicKeys(line), line);
  });

  test('and replaces it once it is held', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    const scrubbed = scrubAnthropicKeys(`something went wrong near ${KEY_A} at the end`);
    assert.equal(scrubbed.includes(KEY_A), false);
    assert.match(scrubbed, /\[the key\]/);
  });

  test('every occurrence, not the first', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    assert.equal(scrubAnthropicKeys(`${KEY_A} and again ${KEY_A}`).includes(KEY_A), false);
  });

  test('it replaces rather than shortening, because half a key is still a key', () => {
    rememberAnthropicKey('f_1', KEY_A, AT);
    const scrubbed = scrubAnthropicKeys(KEY_A);
    assert.equal(scrubbed, '[the key]');
    assert.equal(scrubbed.includes(KEY_A.slice(0, 12)), false);
  });
});

describe('telling readiness the world changed', () => {
  test('the listener hears a store and a forget', () => {
    const heard: boolean[] = [];
    onAnthropicKeyChanged((set) => heard.push(set));
    rememberAnthropicKey('f_1', KEY_A, AT);
    forgetAnthropicKey('f_1');
    assert.deepEqual(heard, [true, false]);
  });

  test('a listener that throws does not undo the key that was just stored', () => {
    onAnthropicKeyChanged(() => {
      throw new Error('the readiness list fell over');
    });
    rememberAnthropicKey('f_1', KEY_A, AT);
    // The record is the store. The gate is a consequence of it, and a consequence that
    // fails must not take the cause with it.
    assert.equal(anthropicKeyFor('f_1', ''), KEY_A);
  });
});

/**
 * The property this whole change exists for, driven through the real gate.
 *
 * A unit test of the holder proves the Map works. This proves the thing a founder
 * experiences: they paste a key into a running app and the app starts working, with nobody
 * restarting anything. It is asserted shut first, because a gate that was never closed
 * would pass the second half of this test while proving nothing.
 */
describe('a key pasted into the running app, end to end', () => {
  const everythingElseIsFine: ReadinessFacts = {
    databaseUrlSet: true,
    databaseAnswered: true,
    // The tables are built at boot now, and the CLI the agent loop spawns is resolved at
    // boot too. Both are named here so that "everything else is fine" is the whole truth
    // rather than the part that existed when this was written. See boot/schema.ts and
    // boot/platform-cli.ts.
    schemaRefusal: undefined,
    engineReady: true,
    platformCliRefusal: undefined,
    masterKeyRefusal: undefined,
    anthropicKeySet: false,
    passphraseSet: true,
  };

  test('THE TURN ROUTES OPEN WITHOUT A RESTART', async () => {
    const state = new ReadinessState(everythingElseIsFine);
    const app = Fastify({ logger: false });
    installReadinessGates(app, state);
    app.post('/api/threads', async () => ({ ok: true }));
    app.get('/', async () => 'the real home page');
    await app.ready();

    // Shut, and the founder is told why.
    const before = await app.inject({ method: 'POST', url: '/api/threads' });
    assert.equal(before.statusCode, 503);
    assert.match((before.json() as { message: string }).message, /Anthropic key/);

    // The founder pastes. This is the exact call routes/setup.ts makes after the check.
    rememberAnthropicKey('f_1', KEY_A, AT);

    assert.equal((await app.inject({ method: 'POST', url: '/api/threads' })).statusCode, 200);
    assert.equal(state.ready(), true);
    await app.close();
  });

  test('AND THE APP ITSELF IS REACHABLE WHILE THE KEY IS THE ONE THING MISSING', async () => {
    // The dead end this replaced: the start page told the founder to sign in and paste a
    // key, sign in redirects to /, and / was the start page. There was no way through it.
    const app = Fastify({ logger: false });
    installReadinessGates(app, new ReadinessState(everythingElseIsFine));
    app.get('/', async () => 'the real home page');
    await app.ready();

    assert.equal((await app.inject({ method: 'GET', url: '/' })).body, 'the real home page');
    await app.close();
  });

  test('and the start page still lists the key when something else is missing too', async () => {
    const app = Fastify({ logger: false });
    installReadinessGates(app, new ReadinessState({ ...everythingElseIsFine, engineReady: false }));
    app.get('/', async () => 'the real home page');
    await app.ready();

    const body = (await app.inject({ method: 'GET', url: '/' })).body;
    assert.match(body, /writing engine is missing/);
    assert.match(body, /Anthropic key is not set/);
    await app.close();
  });

  test('taking the key away shuts the turn routes again', async () => {
    const state = new ReadinessState(everythingElseIsFine);
    const app = Fastify({ logger: false });
    installReadinessGates(app, state);
    app.post('/api/threads', async () => ({ ok: true }));
    await app.ready();

    rememberAnthropicKey('f_1', KEY_A, AT);
    assert.equal((await app.inject({ method: 'POST', url: '/api/threads' })).statusCode, 200);
    forgetAnthropicKey('f_1');
    assert.equal((await app.inject({ method: 'POST', url: '/api/threads' })).statusCode, 503);
    await app.close();
  });
});
