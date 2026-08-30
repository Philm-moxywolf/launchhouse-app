/**
 * src/server/boot/readiness.test.ts
 *
 * WHAT THIS IS. Tests for src/server/boot/readiness.ts, driven through a real Fastify
 * instance rather than by calling the hook directly.
 *
 * WHY IT EXISTS. This file replaced four `process.exit(1)` calls. An exit is crude and it
 * is unambiguous: nothing runs afterwards. What replaced it is a hook, and a hook can be
 * registered in the wrong place, match the wrong paths, or quietly not fire at all, and all
 * three of those look identical to a working gate in a code review. So the gates are driven
 * with real requests through `app.inject`, and the two that matter most are asserted from
 * both sides: the route that must be refused IS refused, and the route that must keep
 * working DOES keep working.
 *
 * THE ONE THAT WOULD BE EASY TO GET WRONG. Refusing every POST while the Anthropic key is
 * missing would lock a founder out of the setup screen, which is the only screen that can
 * fix the missing key. There is a test below whose entire job is to notice that.
 *
 * WHAT IT READS. Nothing outside itself. WHAT IT WRITES. Nothing.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  ReadinessState,
  blockersFrom,
  installReadinessGates,
  startHerePage,
  startsATurn,
  type ReadinessFacts,
} from './readiness.ts';

/** Everything present. Each test varies one fact from this. */
const allGood = (): ReadinessFacts => ({
  databaseUrlSet: true,
  databaseAnswered: true,
  schemaRefusal: undefined,
  engineReady: true,
  platformCliRefusal: undefined,
  masterKeyRefusal: undefined,
  anthropicKeySet: true,
  passphraseSet: true,
});

/** Everything missing. Used where the order or the full list is what is being checked. */
const allBad = (): ReadinessFacts => ({
  databaseUrlSet: false,
  databaseAnswered: false,
  schemaRefusal: 'the tables were not built',
  engineReady: false,
  platformCliRefusal: 'the CLI did not install',
  masterKeyRefusal: 'something went wrong with the key',
  anthropicKeySet: false,
  passphraseSet: false,
});

const idsFor = (facts: ReadinessFacts): string[] => blockersFrom(facts).map((b) => b.id);

/** A server with the gates on and one route of each shape behind them. */
async function serverWith(facts: ReadinessFacts): Promise<FastifyInstance> {
  const app = Fastify();
  installReadinessGates(app, new ReadinessState(facts));
  app.get('/api/home', async () => ({ ok: true }));
  app.get('/api/setup', async () => ({ ok: true }));
  app.post('/api/setup/profile', async () => ({ ok: true }));
  app.post('/api/threads', async () => ({ ok: true }));
  app.post('/api/threads/th_1/messages', async () => ({ ok: true }));
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/', async () => 'the real home page');
  await app.ready();
  return app;
}

// =========================================================================================
// The list
// =========================================================================================

describe('what is missing', () => {
  test('nothing is missing when nothing is missing', () => {
    assert.deepEqual(idsFor(allGood()), []);
  });

  test('each fact produces its own blocker and no others', () => {
    assert.deepEqual(idsFor({ ...allGood(), databaseUrlSet: false }), ['database']);
    assert.deepEqual(idsFor({ ...allGood(), databaseAnswered: false }), ['database']);
    assert.deepEqual(idsFor({ ...allGood(), schemaRefusal: 'no tables' }), ['schema']);
    assert.deepEqual(idsFor({ ...allGood(), engineReady: false }), ['engine']);
    assert.deepEqual(idsFor({ ...allGood(), platformCliRefusal: 'no cli' }), ['platformCli']);
    assert.deepEqual(idsFor({ ...allGood(), anthropicKeySet: false }), ['anthropicKey']);
    assert.deepEqual(idsFor({ ...allGood(), passphraseSet: false }), ['passphrase']);
    assert.deepEqual(idsFor({ ...allGood(), masterKeyRefusal: 'a sentence' }), ['masterKey']);
  });

  test('an unset database and an unreachable one are told apart, because the action differs', () => {
    const unset = blockersFrom({ ...allGood(), databaseUrlSet: false })[0];
    const silent = blockersFrom({ ...allGood(), databaseAnswered: false })[0];
    assert.match(unset?.doThis ?? '', /create a Postgres database/);
    assert.match(silent?.doThis ?? '', /check the database is running/);
  });

  test('the database comes first, because the key is stored in it', () => {
    const ids = idsFor(allBad());
    assert.equal(ids[0], 'database');
    assert.equal(ids.length, 7);
  });

  test('the schema comes second, because it is the database that is wrong and not a separate thing', () => {
    assert.equal(idsFor(allBad())[1], 'schema');
  });

  test('a master key refusal is carried through word for word', () => {
    const sentence = 'The GE_MASTER_KEY set here is not the one your files were saved with.';
    assert.equal(blockersFrom({ ...allGood(), masterKeyRefusal: sentence })[0]?.what, sentence);
  });

  test('every blocker says what happened, names the doubt, and ends on an action', () => {
    const all = blockersFrom(allBad());
    for (const b of all) {
      assert.ok(b.heading.length > 0, `${b.id} has no heading`);
      assert.ok(b.what.length > 0, `${b.id} does not say what happened`);
      assert.ok(b.doThis.length > 0, `${b.id} does not say what to do`);
      // The house rule the whole product is written under. A dash here would ship to 130
      // people on the first screen they ever see.
      for (const text of [b.heading, b.what, b.doThis]) {
        assert.ok(!text.includes('—') && !text.includes('–'), `${b.id} contains a dash: ${text}`);
      }
    }
  });
});

// =========================================================================================
// The screen
// =========================================================================================

describe('the start page', () => {
  test('lists every blocker, with its action', () => {
    const html = startHerePage(blockersFrom({ ...allGood(), databaseUrlSet: false, anthropicKeySet: false }));
    assert.match(html, /Start here/);
    assert.match(html, /There is no database yet/);
    assert.match(html, /Your Anthropic key is not set/);
    assert.match(html, /console\.anthropic\.com/);
    assert.match(html, /reload this page/);
  });

  test('counts correctly, because "1 things are missing" is the kind of thing people notice', () => {
    assert.match(startHerePage(blockersFrom({ ...allGood(), engineReady: false })), /One thing is missing/);
    assert.match(startHerePage(blockersFrom({ ...allGood(), engineReady: false, anthropicKeySet: false })), /2 things are missing/);
  });

  test('escapes what it is handed, because a master key refusal is a string from elsewhere', () => {
    const html = startHerePage(blockersFrom({ ...allGood(), masterKeyRefusal: '<script>alert(1)</script>' }));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /&lt;script&gt;/);
  });

  /**
   * THE FAULT THIS PAIR EXISTS FOR. The page shipped with no anchors at all, so a founder
   * who landed on it could not get anywhere. The first test would have failed then. The
   * second is the reason the link is conditional, and it is the one that would be easy to
   * lose: a link to sign in while the database is unreachable leads to the 500 this whole
   * change exists to remove, and the founder blames themselves for clicking it.
   */
  test('offers a way off the page when signing in would work', () => {
    // The engine, not the key: the key never reaches this page on its own any more. A
    // missing engine refuses turns and leaves sign in working, so the link is live.
    const html = startHerePage(blockersFrom({ ...allGood(), engineReady: false }));
    assert.match(html, /<a href="\/auth\/signin">Sign in<\/a>/);
  });

  test('offers no link at all when signing in would fail, because a dead link is worse than none', () => {
    for (const facts of [
      { ...allGood(), databaseUrlSet: false },
      { ...allGood(), schemaRefusal: 'the tables were not built' },
    ]) {
      const html = startHerePage(blockersFrom(facts));
      assert.ok(!html.includes('<a href'), 'a page that blocks everything must not link to sign in');
      assert.match(html, /will not work until the list is empty/);
    }
  });

  test('says nothing is broken before it says what is missing, because that is the founder first thought', () => {
    const html = startHerePage(blockersFrom({ ...allGood(), engineReady: false }));
    assert.ok(
      html.indexOf('you have not done anything wrong') < html.indexOf('One thing is missing'),
      'the reassurance has to come before the list, not after it',
    );
  });
});

// =========================================================================================
// The gates, driven with real requests
// =========================================================================================

describe('the gates', () => {
  test('with nothing missing, every route behaves as if this file were not here', async () => {
    const app = await serverWith(allGood());
    for (const [method, url] of [
      ['GET', '/'],
      ['GET', '/api/home'],
      ['POST', '/api/setup/profile'],
      ['POST', '/api/threads'],
      ['POST', '/api/threads/th_1/messages'],
    ] as const) {
      const res = await app.inject({ method, url });
      assert.equal(res.statusCode, 200, `${method} ${url} should have been left alone`);
    }
    assert.equal((await app.inject({ method: 'GET', url: '/' })).body, 'the real home page');
    await app.close();
  });

  /**
   * IT USED TO USE THE ANTHROPIC KEY AND CANNOT ANY MORE. That blocker is handledElsewhere
   * now, because the screen that fixes it lives inside the browser app, which is served at
   * GET /, which is the request this page takes over. So the key is the one blocker that
   * must NOT produce this page on its own. The engine is used instead: nobody else owns
   * that screen, so the start page is the only thing a founder would see.
   */
  test('answers GET / with the start page when something is missing', async () => {
    const app = await serverWith({ ...allGood(), engineReady: false });
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] ?? '', /text\/html/);
    assert.match(res.body, /The writing engine is missing/);
    // A founder who has just fixed one of these reloads at once. A cached page would tell
    // them it is still broken.
    assert.equal(res.headers['cache-control'], 'no-store');
    await app.close();
  });

  /**
   * The other half, and it is the trap that was found by walking the path rather than
   * reading it. A founder whose only missing thing was the key landed on Start here, which
   * told them to sign in and paste a key. They signed in, were redirected to /, and read
   * the same page again. The browser app was behind that page the whole time.
   */
  test('stands back from GET / when the only thing missing is fixed inside the app', async () => {
    const app = await serverWith({ ...allGood(), anthropicKeySet: false });
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.body, 'the real home page', 'the browser app must be reachable, or the key can never be pasted');
    await app.close();
  });

  test('refuses every API route while the database is unreachable, and says why', async () => {
    const app = await serverWith({ ...allGood(), databaseAnswered: false });
    for (const [method, url] of [
      ['GET', '/api/home'],
      ['POST', '/api/setup/profile'],
      ['POST', '/api/threads'],
    ] as const) {
      const res = await app.inject({ method, url });
      assert.equal(res.statusCode, 503, `${method} ${url} must be refused with no database`);
      const body = res.json() as { error: string; message: string };
      assert.equal(body.error, 'not_ready');
      assert.match(body.message, /database/i);
    }
    await app.close();
  });

  /**
   * The 500 that started this work, turned into a sentence. A database that answers with no
   * tables in it used to reach every route and fail inside each one with an incident id.
   */
  test('refuses every API route while the tables are not built, and says so in words', async () => {
    const app = await serverWith({ ...allGood(), schemaRefusal: 'the tables were not built' });
    for (const [method, url] of [
      ['GET', '/api/home'],
      ['POST', '/api/setup/profile'],
      ['POST', '/api/threads'],
    ] as const) {
      const res = await app.inject({ method, url });
      assert.equal(res.statusCode, 503, `${method} ${url} must be refused with no tables`);
      assert.match((res.json() as { message: string }).message, /not set up/i);
    }
    await app.close();
  });

  /**
   * The CLI missing must refuse turns and NOTHING ELSE. Getting this wrong in the strict
   * direction would lock a founder out of the setup screen over a package they cannot
   * install; getting it wrong in the loose direction is what shipped, and it let the failure
   * land on their first message instead.
   */
  test('refuses turns when the platform CLI is missing, and leaves every other route alone', async () => {
    const app = await serverWith({ ...allGood(), platformCliRefusal: 'part of Claude is missing' });
    for (const url of ['/api/threads', '/api/threads/th_1/messages']) {
      assert.equal((await app.inject({ method: 'POST', url })).statusCode, 503, `POST ${url} must be refused`);
    }
    assert.equal((await app.inject({ method: 'GET', url: '/api/home' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/setup' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/setup/profile' })).statusCode, 200);
    await app.close();
  });

  test('refuses the two routes that start a turn when the engine is missing', async () => {
    const app = await serverWith({ ...allGood(), engineReady: false });
    for (const url of ['/api/threads', '/api/threads/th_1/messages']) {
      const res = await app.inject({ method: 'POST', url });
      assert.equal(res.statusCode, 503, `POST ${url} must be refused with no engine`);
      assert.match((res.json() as { message: string }).message, /engine/i);
    }
    await app.close();
  });

  test('LEAVES THE SETUP SCREEN WORKING when the Anthropic key is the thing that is missing', async () => {
    // The test that earns its place. Refusing every POST would lock a founder out of the
    // one screen that can fix the missing key, and the app would be unrecoverable from
    // inside itself while looking perfectly reasonable in a code review.
    const app = await serverWith({ ...allGood(), anthropicKeySet: false });

    assert.equal((await app.inject({ method: 'GET', url: '/api/setup' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/setup/profile' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/home' })).statusCode, 200);

    // And the turn routes are still refused, so this is a gate and not an absence of one.
    assert.equal((await app.inject({ method: 'POST', url: '/api/threads' })).statusCode, 503);
    await app.close();
  });

  test('leaves /healthz alone, because a health check has to answer when things are wrong', async () => {
    const app = await serverWith({ ...allGood(), databaseAnswered: false, engineReady: false });
    assert.equal((await app.inject({ method: 'GET', url: '/healthz' })).statusCode, 200);
    await app.close();
  });

  test('does not take over the screen when the passphrase is the only thing missing', async () => {
    // auth/plugin.ts owns that screen and says it better. This file lists the passphrase so
    // a founder missing three things reads three, and stands back when it is the only one.
    const app = await serverWith({ ...allGood(), passphraseSet: false });
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.body, 'the real home page');
    await app.close();
  });

  test('does list the passphrase when something else is missing too', async () => {
    const app = await serverWith({ ...allGood(), passphraseSet: false, databaseUrlSet: false });
    const body = (await app.inject({ method: 'GET', url: '/' })).body;
    assert.match(body, /There is no database yet/);
    assert.match(body, /OWNER_PASSPHRASE/);
    await app.close();
  });
});

describe('which requests start a turn', () => {
  test('the two that do', () => {
    assert.ok(startsATurn('POST', '/api/threads'));
    assert.ok(startsATurn('POST', '/api/threads/th_01ABC/messages'));
    assert.ok(startsATurn('post', '/api/threads?x=1'));
  });

  test('and the ones that do not, which is everything else', () => {
    for (const [method, url] of [
      ['GET', '/api/threads'],
      ['GET', '/api/threads/th_1'],
      ['POST', '/api/setup/profile'],
      ['POST', '/api/setup/ghl/location'],
      ['POST', '/api/threads/th_1/interrupt'],
      ['POST', '/api/auth/sign-out'],
      ['POST', '/api/files/voice-samples'],
    ] as const) {
      assert.ok(!startsATurn(method, url), `${method} ${url} does not start a turn`);
    }
  });
});

describe('the state can change without a restart', () => {
  test('a key pasted at runtime clears its blocker and opens the turn routes', async () => {
    // The founder pastes their key into the app. Whoever stores it calls set(). Without
    // that, the gate would keep refusing turns until somebody restarted the container.
    const state = new ReadinessState({ ...allGood(), anthropicKeySet: false });
    const app = Fastify();
    installReadinessGates(app, state);
    app.post('/api/threads', async () => ({ ok: true }));
    await app.ready();

    assert.equal((await app.inject({ method: 'POST', url: '/api/threads' })).statusCode, 503);
    state.set(allGood());
    assert.equal((await app.inject({ method: 'POST', url: '/api/threads' })).statusCode, 200);
    assert.equal(state.ready(), true);
    await app.close();
  });

  test('describe() carries headings and actions and never a value of anything', () => {
    const described = new ReadinessState({ ...allGood(), anthropicKeySet: false }).describe();
    assert.equal(described.ready, false);
    assert.equal(described.blockers[0]?.id, 'anthropicKey');
    assert.ok(described.blockers[0]?.doThis.length ?? 0 > 0);
    assert.equal(JSON.stringify(described).includes('sk-'), false);
  });
});
