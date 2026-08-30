/**
 * src/server/boot/master-key.test.ts
 *
 * WHAT THIS IS. Tests for src/server/boot/master-key.ts.
 *
 * WHY IT EXISTS. This is the one file in the boot path where being wrong is not
 * recoverable. Everything else that fails costs a restart. A master key that is silently
 * replaced costs a founder every file they own, and nothing anywhere can get them back,
 * because the plaintext was never stored. So the refusals are the subject of this file, and
 * each one is proved by making it happen rather than by reading the code and agreeing with
 * it.
 *
 * THE FOUR THAT MATTER, and each has a test below that watches it fail:
 *   a key different from the one the files were written with is refused;
 *   a key that vanished from the Secrets pane is refused rather than regenerated;
 *   a row edited by hand so the key and the fingerprint disagree is refused;
 *   two processes booting at once end up on ONE key, not two.
 *
 * THE FAKE. A twenty line stand in for Postgres that answers the four statements this file
 * runs. It is not a database and it is not trying to be. What it has to be able to do is
 * hold a row, refuse a second insert the way `on conflict do nothing` does, and hand back
 * what is actually stored, because the third of those is what makes the concurrency test
 * mean anything.
 *
 * WHAT IT READS. Nothing outside itself. WHAT IT WRITES. Nothing.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { SQL } from 'drizzle-orm';
import {
  ensureMasterKey,
  fingerprint,
  generateMasterKey,
  sameFingerprint,
  type KeyStore,
  type MasterKeyOutcome,
} from './master-key.ts';

interface Row {
  key_version: number;
  key_b64: string | null;
  fingerprint: string;
  source: string;
}

/**
 * A Postgres stand in for exactly the four statements this file runs.
 *
 * It reads the statement text rather than parsing SQL, which is enough because there are
 * four of them and they are in one file. The insert honours `on conflict do nothing`,
 * because a test that let the second insert win would prove the opposite of what the
 * concurrency test is for.
 */
class FakeStore implements KeyStore {
  row: Row | undefined;
  statements: string[] = [];

  execute(query: SQL): Promise<unknown> {
    // drizzle's SQL object carries its pieces; the text is enough to tell four statements
    // apart and this fake never has to build one.
    const text = JSON.stringify(query.queryChunks ?? query);
    this.statements.push(text);

    if (text.includes('create table if not exists')) return Promise.resolve([]);

    if (text.includes('select key_b64')) {
      return Promise.resolve(this.row === undefined ? [] : [{ ...this.row }]);
    }

    if (text.includes('insert into app_master_key')) {
      // drizzle interleaves its own string chunks with the bound values. A string chunk is
      // an object carrying an ARRAY of strings; everything else in the list is a parameter,
      // including a bound null, which is why this asks about the array rather than about
      // the key being present. The parameters arrive in statement order:
      // id, key_version, key_b64, fingerprint, source.
      const params = (query.queryChunks ?? []).filter(
        (c: unknown) => !(typeof c === 'object' && c !== null && Array.isArray((c as { value?: unknown }).value)),
      );
      if (this.row === undefined) {
        this.row = {
          key_version: Number(params[1]),
          key_b64: params[2] === null ? null : String(params[2]),
          fingerprint: String(params[3]),
          source: String(params[4]),
        };
      }
      // on conflict do nothing: an existing row is left exactly as it was.
      return Promise.resolve([]);
    }

    throw new Error(`the fake was handed a statement it does not know: ${text.slice(0, 120)}`);
  }
}

const noKeys = new Map<number, string>();

/** Collects what was installed, so a test can assert without touching the real keyring. */
function collector(): { installed: { key: string; version: number }[]; install: (k: string, v: number) => void } {
  const installed: { key: string; version: number }[] = [];
  return { installed, install: (key, version) => installed.push({ key, version }) };
}

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
});

// =========================================================================================
// The pure helpers
// =========================================================================================

describe('the fingerprint', () => {
  test('is stable for one key and different for another', () => {
    const a = generateMasterKey();
    const b = generateMasterKey();
    assert.equal(fingerprint(a), fingerprint(a));
    assert.notEqual(fingerprint(a), fingerprint(b));
  });

  test('does not contain the key it was made from', () => {
    // It is stored in a row that anybody with the database can read. If it carried the key
    // it would be the key.
    const k = generateMasterKey();
    const print = fingerprint(k);
    assert.ok(!print.includes(k));
    assert.ok(!print.includes(Buffer.from(k, 'base64').toString('hex')));
  });

  test('compares equal to itself and not to another, whatever the lengths', () => {
    assert.ok(sameFingerprint('abc', 'abc'));
    assert.ok(!sameFingerprint('abc', 'abd'));
    assert.ok(!sameFingerprint('abc', 'abcd'));
    assert.ok(!sameFingerprint('', 'a'));
  });

  test('a generated key is 32 bytes, which is what crypto.ts will accept', () => {
    assert.equal(Buffer.from(generateMasterKey(), 'base64').length, 32);
  });
});

// =========================================================================================
// First boot, which is every founder's boot, because a remix gets a fresh database
// =========================================================================================

describe('first boot, with nothing set and nothing stored', () => {
  test('generates a key, stores it, and installs it', async () => {
    const made = generateMasterKey();
    const c = collector();
    const out = await ensureMasterKey({ db: store, envKeys: noKeys, generate: () => made, install: c.install });

    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.base64, made);
    assert.equal(out.source, 'generated');
    assert.equal(out.created, true);
    assert.deepEqual(c.installed, [{ key: made, version: 1 }]);
    assert.equal(store.row?.key_b64, made);
    assert.equal(store.row?.fingerprint, fingerprint(made));
  });

  test('the second boot reads the stored key rather than making another one', async () => {
    const made = generateMasterKey();
    await ensureMasterKey({ db: store, envKeys: noKeys, generate: () => made, install: () => undefined });

    const c = collector();
    const out = await ensureMasterKey({
      db: store,
      envKeys: noKeys,
      // If this were reached, the founder's files would be orphaned. It is here so the test
      // fails loudly rather than quietly passing on a coincidence.
      generate: () => generateMasterKey(),
      install: c.install,
    });

    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.base64, made, 'the second boot must use the key the first boot stored');
    assert.equal(out.created, false);
    assert.deepEqual(c.installed, [{ key: made, version: 1 }]);
  });

  test('a hundred boots in a row never change the key, which is the redeploy case', async () => {
    const first = await ensureMasterKey({ db: store, envKeys: noKeys, install: () => undefined });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    for (let i = 0; i < 100; i++) {
      const again = await ensureMasterKey({ db: store, envKeys: noKeys, install: () => undefined });
      assert.equal(again.ok, true);
      if (!again.ok) return;
      assert.equal(again.base64, first.base64);
    }
  });
});

describe('two processes booting at once', () => {
  test('both end up on ONE key, which is the one that was stored first', async () => {
    // A redeploy overlapping the process it replaces. Both generate, both insert, one
    // insert loses. The loser has to adopt the winner's key: if it installed its own, it
    // would write files the winner cannot read and the other way round.
    const a = generateMasterKey();
    const b = generateMasterKey();
    assert.notEqual(a, b);

    const ca = collector();
    const cb = collector();
    const [first, second] = await Promise.all([
      ensureMasterKey({ db: store, envKeys: noKeys, generate: () => a, install: ca.install }),
      ensureMasterKey({ db: store, envKeys: noKeys, generate: () => b, install: cb.install }),
    ]);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.base64, second.base64, 'two processes must not end up holding different keys');
    assert.equal(first.base64, store.row?.key_b64);
  });
});

// =========================================================================================
// The refusals. These are the reason this file exists.
// =========================================================================================

describe('the refusals', () => {
  const refusalOf = (out: MasterKeyOutcome): string => (out.ok ? '' : out.founderMessage);

  test('REFUSES a GE_MASTER_KEY that is not the one the files were written with', async () => {
    // The worst day this code can have. Somebody sets a fresh key over a live one, the app
    // accepts it, and every file already written stops opening. It must refuse instead.
    const original = generateMasterKey();
    await ensureMasterKey({
      db: store,
      envKeys: new Map([[1, original]]),
      install: () => undefined,
    });

    const c = collector();
    const out = await ensureMasterKey({
      db: store,
      envKeys: new Map([[1, generateMasterKey()]]),
      install: c.install,
    });

    assert.equal(out.ok, false);
    assert.match(refusalOf(out), /not the one your files were saved with/);
    assert.deepEqual(c.installed, [], 'nothing may be installed after a mismatch');
  });

  test('REFUSES to generate a replacement when a stored Secret has been cleared', async () => {
    // The other half of the same accident. A founder empties OWNER-facing Secrets, or
    // Replit hands back a blank, and generating a fresh key here would be silent data loss.
    await ensureMasterKey({ db: store, envKeys: new Map([[1, generateMasterKey()]]), install: () => undefined });

    const c = collector();
    const out = await ensureMasterKey({
      db: store,
      envKeys: noKeys,
      generate: () => generateMasterKey(),
      install: c.install,
    });

    assert.equal(out.ok, false);
    assert.match(refusalOf(out), /GE_MASTER_KEY.*not set/s);
    assert.deepEqual(c.installed, []);
    assert.equal(store.row?.key_b64, null, 'a secret sourced row must never gain a stored key');
  });

  test('REFUSES a row whose key and fingerprint disagree, which means it was edited by hand', async () => {
    await ensureMasterKey({ db: store, envKeys: noKeys, install: () => undefined });
    assert.ok(store.row);
    store.row.key_b64 = generateMasterKey();

    const c = collector();
    const out = await ensureMasterKey({ db: store, envKeys: noKeys, install: c.install });
    assert.equal(out.ok, false);
    assert.match(refusalOf(out), /does not match the record of it/);
    assert.deepEqual(c.installed, []);
  });

  test('REFUSES a version pin that names a key nobody set', async () => {
    const out = await ensureMasterKey({
      db: store,
      envKeys: new Map([[1, generateMasterKey()]]),
      versionPin: 3,
      install: () => undefined,
    });
    assert.equal(out.ok, false);
    assert.match(refusalOf(out), /version 3/);
  });

  test('REFUSES a row carrying a version outside the rotation range', async () => {
    await ensureMasterKey({ db: store, envKeys: noKeys, install: () => undefined });
    assert.ok(store.row);
    store.row.key_version = 42;

    const out = await ensureMasterKey({ db: store, envKeys: noKeys, install: () => undefined });
    assert.equal(out.ok, false);
    assert.match(refusalOf(out), /version this app does not understand/);
  });

  test('no refusal message carries key material', async () => {
    const secret = generateMasterKey();
    await ensureMasterKey({ db: store, envKeys: new Map([[1, secret]]), install: () => undefined });
    const out = await ensureMasterKey({ db: store, envKeys: new Map([[1, generateMasterKey()]]), install: () => undefined });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.ok(!out.founderMessage.includes(secret));
    assert.ok(!out.detail.includes(secret));
  });
});

// =========================================================================================
// The path an operator takes when they want the key out of the database
// =========================================================================================

describe('a GE_MASTER_KEY that IS set', () => {
  test('wins, is never overwritten by a generated one, and stores no copy of itself', async () => {
    const secret = generateMasterKey();
    const c = collector();
    const out = await ensureMasterKey({
      db: store,
      envKeys: new Map([[1, secret]]),
      generate: () => generateMasterKey(),
      install: c.install,
    });

    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.base64, secret);
    assert.equal(out.source, 'secret');
    assert.deepEqual(c.installed, [{ key: secret, version: 1 }]);
    // The point of setting it by hand is that the key and the ciphertext live apart. A copy
    // in this row would take that back.
    assert.equal(store.row?.key_b64, null);
    assert.equal(store.row?.fingerprint, fingerprint(secret));
  });

  test('adopting the generated key into a Secret is allowed, and says so', async () => {
    // The supported way to move the key out of the database: read what the app generated,
    // put it in Secrets, redeploy. The fingerprints match, so nothing is orphaned.
    const made = generateMasterKey();
    await ensureMasterKey({ db: store, envKeys: noKeys, generate: () => made, install: () => undefined });

    const out = await ensureMasterKey({ db: store, envKeys: new Map([[1, made]]), install: () => undefined });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.base64, made);
    assert.match(out.warnings.join(' '), /matches the key this app generated/);
  });

  test('reads the pinned version rather than the highest one', async () => {
    const v1 = generateMasterKey();
    const v2 = generateMasterKey();
    const c = collector();
    const out = await ensureMasterKey({
      db: store,
      envKeys: new Map([
        [1, v1],
        [2, v2],
      ]),
      versionPin: 1,
      install: c.install,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.base64, v1);
    assert.deepEqual(c.installed, [{ key: v1, version: 1 }]);
  });

  test('with no pin, the highest version held is the current one', async () => {
    const v1 = generateMasterKey();
    const v2 = generateMasterKey();
    const out = await ensureMasterKey({
      db: store,
      envKeys: new Map([
        [1, v1],
        [2, v2],
      ]),
      install: () => undefined,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.base64, v2);
    assert.equal(out.version, 2);
  });
});

describe('the table', () => {
  test('is created before it is read, so a founder who never ran the migration still has one', async () => {
    await ensureMasterKey({ db: store, envKeys: noKeys, install: () => undefined });
    const created = store.statements.findIndex((s) => s.includes('create table if not exists'));
    const read = store.statements.findIndex((s) => s.includes('select key_b64'));
    assert.ok(created >= 0, 'the table was never created');
    assert.ok(created < read, 'the table must be created before it is read');
  });
});
