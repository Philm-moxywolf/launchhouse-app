/**
 * src/server/boot/master-key.ts
 *
 * WHAT THIS IS. The master key for one founder's deployment: found, or made, once, at boot,
 * and then handed to storage/crypto.ts through env.ts's installMasterKey seam.
 *
 * WHY IT EXISTS. GE_MASTER_KEY wraps every file a founder owns. It used to be a Replit
 * Secret we set by hand and escrowed offline, which was right when there was one deployment
 * and we were the operator. There are now 130 deployments and the operator is a founder in
 * a room. "Generate 32 random bytes, base64 encode them, and paste them into the Secrets
 * pane" is not a step that survives 130 people, and a founder who skips it gets an app that
 * will not start.
 *
 * So the app makes its own. The whole risk of doing that is in one sentence: GET THIS WRONG
 * AND A FOUNDER LOSES EVERYTHING ON A REDEPLOY. A key generated at boot and kept anywhere
 * that a redeploy rebuilds is a key that is different next Tuesday, and every blob written
 * before Tuesday stops opening. There is no recovery from that, here or anywhere, because
 * the plaintext was never stored.
 *
 * WHERE IT IS KEPT, AND WHY IT IS NOT A FILE. Postgres. Not the container filesystem. A
 * Replit deployment's filesystem is built from the repository, so anything written to it at
 * runtime is a guess about redeploy behaviour that nobody has verified, and the cost of
 * guessing wrong is total. Postgres is the one store whose durability is not in question:
 * it is what Replit provisions, it is where the ciphertext already lives, and it is the
 * only thing in this app that is meant to outlive the container. Choosing the store whose
 * durability is certain is worth more than any argument about where a key ought to live.
 *
 * THE HONEST COST, SAID OUT LOUD. storage/crypto.ts says the master key and the database
 * "live apart, so a database leak alone is not a content leak". On the generated path they
 * no longer live apart: anyone holding a dump of this database holds the key that opens it.
 * That is a real reduction and it is not hidden. What it buys is that the founder's work
 * survives a redeploy, and what it costs is a property that was written for a shared
 * database holding 3,000 to 4,500 real people belonging to 130 founders. This database
 * holds one founder's own contacts, inside their own Replit account, behind their own
 * login. GE_MASTER_KEY is still honoured when it is set, and setting it is how anybody who
 * wants the two apart gets them apart. The fingerprint below is what makes that switch safe.
 *
 * THE FINGERPRINT IS THE GUARD, AND IT IS THE REASON THIS FILE IS NOT TWENTY LINES. The row
 * carries a non reversible fingerprint of whichever key wrapped this founder's files. Every
 * later boot checks the key it is about to use against it. A key that does not match is
 * refused, loudly, instead of being installed and quietly orphaning every file already
 * written. The bad day this prevents is somebody clearing a Secret, or pasting a fresh one,
 * and the app carrying on as if nothing happened until the founder opens a file.
 *
 * WHAT CALLS IT. src/server/index.ts, in main(), after the database has answered and before
 * anything binds a port. Its test calls ensureMasterKey and the pure helpers directly.
 *
 * WHAT IT READS. The keyring in src/server/env.ts, and one row of Postgres.
 * WHAT IT WRITES. One row of Postgres, at most once per deployment, and the key into
 * env.ts's late settings through installMasterKey.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { installMasterKey, lateSettings, MAX_MASTER_KEY_VERSION } from '../env.ts';

/**
 * The four statements this file runs, and nothing wider.
 *
 * WHY IT IS NOT `Queryable` FROM db/client.ts. That type carries select, insert, update and
 * delete as well, and a test fake would have to answer all of them to prove one refusal.
 * The refusals in this file are the most important thing in it, so the port is narrowed
 * until the fake that exercises them is twenty lines. `getDb()` satisfies this as it is.
 */
export interface KeyStore {
  execute(query: SQL): Promise<unknown>;
}

/** 32 bytes, which is what AES 256 takes and what storage/crypto.ts refuses anything else for. */
const KEY_BYTES = 32;

/**
 * The one row. A single tenant app has exactly one master key, so the table has exactly one
 * row and the check constraint says so rather than a comment saying so.
 */
const ROW_ID = 1;

/**
 * Domain separation for the fingerprint.
 *
 * The fingerprint is an HMAC KEYED BY THE MASTER KEY over this fixed string, not a hash OF
 * the key. That direction matters: a digest of a secret is a value an attacker can grind
 * against, and while grinding 32 random bytes is not a real attack, storing something that
 * is trivially not reversible costs nothing and removes the question.
 */
const FINGERPRINT_INFO = 'launchhouse master key fingerprint v1';

/**
 * Where the key came from, recorded in the row so a later boot can tell the difference
 * between "the app made this" and "a person set this", and refuse accordingly.
 */
export type MasterKeySource = 'generated' | 'secret';

export interface MasterKeyResolved {
  readonly ok: true;
  /** base64, exactly as storage/crypto.ts expects to decode it. */
  readonly base64: string;
  readonly version: number;
  readonly source: MasterKeySource;
  /** True only on the boot that made it. Worth one log line and nothing else. */
  readonly created: boolean;
  /** Said out loud at boot. Never fatal. */
  readonly warnings: readonly string[];
}

export interface MasterKeyRefused {
  readonly ok: false;
  /** One sentence a founder can act on. It reaches the first screen. */
  readonly founderMessage: string;
  /** The longer version, for the log. Never carries key material. */
  readonly detail: string;
}

export type MasterKeyOutcome = MasterKeyResolved | MasterKeyRefused;

/** One key's fingerprint. Not reversible, safe to store, safe to log. */
export function fingerprint(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  return createHmac('sha256', bytes).update(FINGERPRINT_INFO).digest('hex');
}

/**
 * Constant time compare of two fingerprints.
 *
 * Not because a timing attack on a boot path is plausible, but because the alternative is a
 * === that somebody later copies into a place where it is not fine. One helper, used
 * everywhere, is cheaper than remembering which comparisons matter.
 */
export function sameFingerprint(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** A fresh 32 byte key, base64. The only place in the app that makes one. */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

/**
 * One row, in the column names Postgres actually returns.
 *
 * Snake case, because this is what comes back off the driver rather than a shape drizzle
 * mapped for us. It is asserted rather than validated, which is honest: nothing else writes
 * this table, and installFromRow re-derives the fingerprint from the key it found before
 * trusting either. A row that has been edited by hand fails that check rather than this
 * type.
 */
interface KeyRow {
  readonly key_b64: string | null;
  readonly fingerprint: string;
  readonly source: string;
  readonly key_version: number;
}

/**
 * Create the table if it is not there.
 *
 * WHY THIS IS NOT A DRIZZLE MIGRATION. Migrations run from `npm run db:migrate`, which is a
 * deploy step somebody has to invoke. A founder remixing an app and pressing Run does not
 * invoke it, and this table has to exist before the first turn or there is no key. So it is
 * created here, idempotently, by the only code that reads or writes it.
 *
 * It is deliberately absent from db/schema.ts for the same reason it is deliberately absent
 * from the founder facing surface: nothing but this file may touch it. The one thing to
 * know is that `drizzle-kit push`, which diffs schema.ts against the live database, would
 * want to drop a table it cannot see. `push` is not in package.json and must not be added.
 */
async function ensureTable(db: KeyStore): Promise<void> {
  await db.execute(sql`
    create table if not exists app_master_key (
      id           smallint     primary key,
      key_version  smallint     not null,
      key_b64      text,
      fingerprint  text         not null,
      source       text         not null,
      created_at   timestamptz  not null default now(),
      constraint app_master_key_one_row check (id = 1)
    )
  `);
}

async function readRow(db: KeyStore): Promise<KeyRow | undefined> {
  const rows = await db.execute(sql`
    select key_b64, fingerprint, source, key_version from app_master_key where id = ${ROW_ID}
  `);
  // postgres.js hands back an array like object. One row, or none.
  return (rows as KeyRow[] | undefined)?.[0];
}

/**
 * Write the row if nobody has yet, then read back whatever is actually there.
 *
 * THE READ BACK IS THE POINT. Two processes can boot at once, which on a Reserved VM is a
 * redeploy overlapping the process it is replacing. Both would generate a key, both would
 * insert, and one insert would lose. `on conflict do nothing` plus a read back means the
 * loser adopts the winner's key instead of installing its own and orphaning the files the
 * winner is already writing.
 */
async function claimRow(db: KeyStore, row: Omit<KeyRow, 'key_b64'> & { key_b64: string | null }): Promise<KeyRow> {
  await db.execute(sql`
    insert into app_master_key (id, key_version, key_b64, fingerprint, source)
    values (${ROW_ID}, ${row.key_version}, ${row.key_b64}, ${row.fingerprint}, ${row.source})
    on conflict (id) do nothing
  `);
  const actual = await readRow(db);
  if (actual === undefined) {
    // Cannot happen: the insert either wrote the row or found one. If it does happen the
    // honest answer is to say so rather than to invent a key.
    throw new Error('app_master_key is empty immediately after an insert. The database is not behaving.');
  }
  return actual;
}

export interface EnsureMasterKeyDeps {
  readonly db: KeyStore;
  /** Injected so the test can prove the refusal paths without a real environment. */
  readonly envKeys?: ReadonlyMap<number, string>;
  readonly versionPin?: number | undefined;
  /** Injected so the test can force the generated value. Defaults to real randomness. */
  readonly generate?: () => string;
  /** Injected so the test can assert without touching the process wide keyring. */
  readonly install?: (base64: string, version: number) => void;
}

/**
 * Find this deployment's master key, or make one, and install it.
 *
 * THE FOUR CASES, IN THE ORDER THEY ARE DECIDED:
 *
 *   1. A key is set in the environment. That person means it, so it wins, and this file
 *      never generates one. The row records its fingerprint the first time and verifies it
 *      every time after. A key that does not match the files already written is REFUSED.
 *   2. No key in the environment and no row. First boot of a fresh deployment, which is
 *      what a Replit remix always is, because a remix gets a fresh database. Generate, store,
 *      install, say so once.
 *   3. No key in the environment and a row that holds one. Every boot after the first. Read
 *      it, install it, say nothing.
 *   4. No key in the environment and a row that says the key lives in a Secret. Somebody
 *      cleared the Secret. REFUSED, because generating a new one here is exactly the
 *      accident that loses everything.
 *
 * IT RETURNS A REFUSAL RATHER THAN EXITING. A container that will not start tells a founder
 * nothing. main() turns a refusal into a blocker on the first screen, and every turn stays
 * refused while it stands, so nothing is written under a key that cannot open what is there.
 */
export async function ensureMasterKey(deps: EnsureMasterKeyDeps): Promise<MasterKeyOutcome> {
  const { db } = deps;
  const envKeys = deps.envKeys ?? lateSettings().masterKeys;
  const versionPin = deps.versionPin ?? lateSettings().masterKeyVersionPin;
  const generate = deps.generate ?? generateMasterKey;
  const install = deps.install ?? installMasterKey;
  const warnings: string[] = [];

  await ensureTable(db);
  const existing = await readRow(db);

  // ---- case 1. Somebody set a key by hand -----------------------------------------------
  if (envKeys.size > 0) {
    const version = versionPin ?? Math.max(...envKeys.keys());
    const base64 = envKeys.get(version);
    if (base64 === undefined) {
      return {
        ok: false,
        founderMessage:
          'The app is set to use master key version ' +
          String(version) +
          ', and that key is not set. Set it, or clear GE_MASTER_KEY_VERSION.',
        detail: `GE_MASTER_KEY_VERSION names version ${String(version)}, which is not among the ${String(envKeys.size)} key(s) set in the environment.`,
      };
    }
    const print = fingerprint(base64);

    if (existing === undefined) {
      // Nothing written yet, so whatever this key is, it is the one everything will be
      // wrapped under. Record the fingerprint so the next boot can check it.
      const row = await claimRow(db, { key_version: version, key_b64: null, fingerprint: print, source: 'secret' });
      if (!sameFingerprint(row.fingerprint, print)) {
        return refusalForMismatch(row.source);
      }
      install(base64, version);
      return { ok: true, base64, version, source: 'secret', created: true, warnings };
    }

    if (!sameFingerprint(existing.fingerprint, print)) return refusalForMismatch(existing.source);

    if (existing.source === 'generated') {
      // A key was generated first and a Secret was set afterwards, and the two match. That
      // is somebody adopting the generated key into a Secret, which is fine and is in fact
      // the supported way to move the key out of the database.
      warnings.push('GE_MASTER_KEY matches the key this app generated. The Secret is now the source and the copy in the database is redundant.');
    }
    install(base64, version);
    return { ok: true, base64, version, source: 'secret', created: false, warnings };
  }

  // ---- case 2. Nothing set, nothing stored. First boot -------------------------------------
  if (existing === undefined) {
    const made = generate();
    const row = await claimRow(db, {
      key_version: 1,
      key_b64: made,
      fingerprint: fingerprint(made),
      source: 'generated',
    });
    // The read back may be somebody else's row. Use whatever is actually stored.
    return installFromRow(row, install, warnings, row.key_b64 === made);
  }

  // ---- case 4. Stored row says the key lives in a Secret that is now gone --------------------
  if (existing.source === 'secret' || existing.key_b64 === null) {
    return {
      ok: false,
      founderMessage:
        'Your files are locked with a key called GE_MASTER_KEY, and it is not set on this deployment. Put it back in Secrets. Do not clear it, and do not replace it with a new one: a different key cannot open what is already there.',
      detail: `app_master_key says source=${existing.source} with ${existing.key_b64 === null ? 'no stored key' : 'a stored key'}, and no key is set in the environment. Refusing rather than generating a replacement.`,
    };
  }

  // ---- case 3. Every boot after the first ----------------------------------------------------
  return installFromRow(existing, install, warnings, false);
}

/** Install what the row holds, after checking the row is internally consistent. */
function installFromRow(
  row: KeyRow,
  install: (base64: string, version: number) => void,
  warnings: string[],
  created: boolean,
): MasterKeyOutcome {
  const base64 = row.key_b64;
  if (base64 === null) {
    return {
      ok: false,
      founderMessage: 'The key that opens your files is missing. Nothing has been lost, and this needs somebody from the Launchhouse team to look at it.',
      detail: 'app_master_key says source=generated and holds no key. The row is inconsistent.',
    };
  }
  // The row could have been edited by hand. A key whose fingerprint does not match its own
  // row is a row that has been half changed, and installing it would write new files under
  // a key the old ones were not written with.
  if (!sameFingerprint(row.fingerprint, fingerprint(base64))) {
    return {
      ok: false,
      founderMessage: 'The key that opens your files does not match the record of it. Nothing has been lost, and this needs somebody from the Launchhouse team to look at it.',
      detail: 'app_master_key holds a key whose fingerprint does not match the fingerprint column. Refusing rather than writing new files under it.',
    };
  }
  if (row.key_version < 1 || row.key_version > MAX_MASTER_KEY_VERSION) {
    return {
      ok: false,
      founderMessage: 'The key that opens your files carries a version this app does not understand. This needs somebody from the Launchhouse team to look at it.',
      detail: `app_master_key.key_version is ${String(row.key_version)}, outside 1 to ${String(MAX_MASTER_KEY_VERSION)}.`,
    };
  }
  install(base64, row.key_version);
  return {
    ok: true,
    base64,
    version: row.key_version,
    source: row.source === 'secret' ? 'secret' : 'generated',
    created,
    warnings,
  };
}

/**
 * The refusal that matters most in this file.
 *
 * It fires when the key this boot is about to use is NOT the key the founder's files were
 * written with. Installing it would encrypt tomorrow's work under a key that cannot open
 * yesterday's, and neither half would be readable afterwards. The message names the action
 * that fixes it, which is always "put the old key back", never "carry on".
 */
function refusalForMismatch(source: string): MasterKeyRefused {
  return {
    ok: false,
    founderMessage:
      'The GE_MASTER_KEY set here is not the one your files were saved with, so it cannot open them. Put the original key back. A new key cannot recover files written under the old one.',
    detail: `The key offered at boot does not match the fingerprint recorded when this deployment first stored one (source=${source}). Refusing rather than orphaning every blob already written.`,
  };
}
