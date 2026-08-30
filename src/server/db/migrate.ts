/**
 * src/server/db/migrate.ts
 *
 * WHAT THIS IS
 *   The only thing that changes the shape of the database. Four phases, in order:
 *   extensions, generated table migrations, row level security, and a check that
 *   the schema is now the one this code expects.
 *
 * WHY IT EXISTS
 *   drizzle-kit push and drizzle-kit migrate both stop at the table DDL. Two things
 *   this schema needs are outside that: the citext extension, which must exist
 *   before `create table founder` runs, and the policies in rls.sql. Splitting them
 *   across a README step and a migration is how one of them gets skipped on the one
 *   deployment where it mattered.
 *
 *   IT ALSO EXISTS BECAUSE NOTHING WAS CALLING IT. Until this change the only caller
 *   was a person typing `npm run db:migrate`. Neither the Replit run command nor the
 *   documented deployment build command invoked it, so a founder who set a passphrase
 *   and pressed Sign in got a 500 with an incident id and "tell a mentor", and the log
 *   said relation "founder" does not exist. That is the first wall on the path, it was
 *   hit before the founder had done anything wrong, and a founder cannot open a
 *   terminal to type the one line that fixes it. src/server/boot/schema.ts now calls
 *   runMigrations() at boot, before the port binds. See that file for why boot rather
 *   than a readiness message.
 *
 * WHAT CALLS IT
 *   src/server/boot/schema.ts at every boot, `npm run db:migrate`, and tests before
 *   any database test runs.
 *
 * READS  src/server/db/migrations/*.sql, src/server/db/migrations/meta/_journal.json,
 *        src/server/db/rls.sql, and DATABASE_URL through env.ts.
 * WRITES the database schema, and the drizzle migrations bookkeeping table.
 *
 * IT VERIFIES ITSELF AT THE END, TWICE. FORCE ROW LEVEL SECURITY is the load bearing
 * word in rls.sql and an ALTER that silently did not apply looks identical to one that
 * did. And a migration that never ran leaves a database that answers `select 1` and has
 * no tables in it, which is exactly the state that produced the 500 above. The two
 * assertions at the bottom are what turn both of those into a failed boot with a
 * sentence on it, rather than a working health check and a broken sign in.
 *
 * WHAT IS ATOMIC HERE, CHECKED RATHER THAN HOPED
 *   Phase 1 is `if not exists`, so running it twice costs nothing.
 *   Phase 2 is atomic because drizzle puts every pending file inside one transaction.
 *     Read it in node_modules/drizzle-orm/pg-core/dialect.js, in `migrate`. A file that
 *     fails takes the whole batch with it and the bookkeeping row is never written.
 *   Phase 3 is atomic because rls.sql is sent as one multi statement string, and
 *     Postgres wraps a multi statement simple query in an implicit transaction.
 *     Measured, not assumed: sending `create table a; create table b; select 1/0;`
 *     left neither table behind.
 *   So a run that dies halfway leaves the schema at the version it started from. There
 *   is no half applied state to clean up, and the next boot picks up where this one
 *   stopped.
 *
 * ONE STATEMENT MAY NOT RUN LONGER THAN PG_STATEMENT_TIMEOUT_MS, default 30 seconds,
 * because the phases run on the application pool and that pool sets one. Every file
 * under migrations/ is well inside it today. A future migration that rebuilds a large
 * table is the case to watch, and the answer then is to split the file rather than to
 * raise the cap, because the cap is what stops a wedged statement holding a lock.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { lateSettings } from '../env.ts';
import { closeDb, getDb } from './client.ts';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, 'migrations');

/** Tables that rls.sql must leave with row level security enabled AND forced. */
export const RLS_TABLES = [
  'ge_file',
  'ge_file_version',
  'ge_blob',
  'connections',
  'publish_batches',
] as const;

/**
 * How long to wait for another copy of this app to finish migrating before giving up
 * and checking the result instead.
 *
 * IT IS A WAIT WITH AN END, and that is the whole point of the number. Boot happens
 * before the port binds, so a wait with no end is a URL that never answers, which is
 * the one failure this codebase spends most of its effort avoiding. Thirty seconds is
 * longer than this schema takes to build and short enough that a founder staring at a
 * loading tab still gets an answer.
 */
const LOCK_WAIT_MS = 30_000;

/** How often to ask again while waiting. 120 round trips at the very worst, which is nothing. */
const LOCK_POLL_MS = 250;

/**
 * The name the schema lock is taken under.
 *
 * hashtext is Postgres' own hash, which is what db/client.ts already uses to turn a
 * founder id into the bigint an advisory lock takes. Using the same function keeps
 * every advisory lock in this app in one key space. A collision with a founder's lock
 * is possible and harmless: that founder's next turn waits for boot to finish
 * migrating, which is a wait of a second on a boot that had to happen anyway.
 */
const SCHEMA_LOCK_NAME = 'launchhouse:schema';

/**
 * What one run did.
 *
 * `applied` false with no error thrown is the ordinary case when two containers boot
 * together: the other one held the lock, and the schema turned out to be current by the
 * time this one looked.
 */
export interface MigrationRun {
  /**
   * True when this process held the lock and ran the phases itself.
   *
   * NOT THE SAME AS "SOMETHING CHANGED", and the two were conflated in the first version of
   * this file. Every boot after the first also runs the phases: the extension is `if not
   * exists`, the migrator finds nothing pending, and rls.sql drops and remakes the same
   * policies. That is correct and it is a no op. Reporting it as "the database tables were
   * built" on every restart tells a mentor reading the log at ten at night that a migration
   * ran when none did.
   */
  readonly applied: boolean;
  /** How many migrations were genuinely applied. Zero on every boot that had nothing to do. */
  readonly newlyApplied: number;
}

/**
 * Run every phase, once, with nothing else running them at the same time.
 *
 * WHY THERE IS A LOCK AT ALL. Replit replaces a container by starting the new one while
 * the old one is still up, so two processes can reach this line within a second of each
 * other. Without a lock both read an empty bookkeeping table, both decide migration 0000
 * is pending, both run `create table founder`, and the loser gets "relation already
 * exists". Nothing is corrupted, because phase 2 is one transaction. What the founder
 * gets is a screen saying the database is not set up when it is, which costs a mentor a
 * trip across the room.
 *
 * WHY THE LOCK IS TRANSACTION SCOPED AND ON A CONNECTION OF ITS OWN. Assumption B7 says
 * a transaction pooler may sit in front of this database, and db/client.ts spells out
 * what that means: a session scoped lock is taken on a connection that gets handed to
 * somebody else, so it protects nothing and never unlocks. Only pg_advisory_xact_lock
 * survives a pooler, because BEGIN to COMMIT is the one span a transaction pooler keeps
 * on a single server connection.
 *
 * That forces the shape below, which reads oddly until you see why. The lock is held
 * open in a transaction on a CONNECTION OF ITS OWN while the phases run on the
 * application pool. It cannot be one connection: drizzle's migrator opens its own
 * transaction, and that cannot be opened inside the one holding the lock. Checked rather
 * than reasoned about. Passing a transaction handle to drizzle's migrate() fails with
 * "this.client.begin is not a function".
 *
 * It cannot be a second connection out of the application pool either, because
 * PGPOOL_MAX is allowed to be 1. Boot would then hold the only connection and wait for
 * itself for ever. A dedicated client cannot deadlock against a pool it is not in.
 */
export async function runMigrations(): Promise<MigrationRun> {
  const url = lateSettings().databaseUrl;
  if (url === undefined) {
    throw new Error('DATABASE_URL is not set. The database is the record, so there is nothing to migrate.');
  }

  // One connection, used for one transaction, closed in the finally. Not the
  // application pool: see the header above.
  const lockClient = postgres(url, {
    max: 1,
    connect_timeout: 10,
    connection: { application_name: 'launchhouse-schema-lock' },
    // Founder content never reaches a log line, and the same rule applies to a boot
    // that is about to print a connection string in a notice.
    onnotice: () => undefined,
  });

  try {
    let applied = false;
    let newlyApplied = 0;
    await lockClient.begin(async (tx) => {
      /**
       * A WAIT WITH AN END, BUILT FROM A STATEMENT THAT CANNOT FAIL.
       *
       * The obvious way to bound this is `set local lock_timeout` and then
       * pg_advisory_xact_lock. That was written first and it is wrong, which running it
       * proved: the timeout arrives as `canceling statement due to lock timeout`, and an
       * error inside a postgres.js transaction rolls the transaction back and rejects at
       * begin(), so catching it here does not stop it escaping. Boot would have failed with
       * a database error whenever another container happened to hold the lock, which is
       * precisely the rolling deploy this is meant to survive.
       *
       * pg_try_advisory_xact_lock returns false instead of raising. A false costs nothing
       * and leaves the transaction healthy, so the loop can simply ask again.
       */
      const deadline = Date.now() + LOCK_WAIT_MS;
      let held: boolean;
      for (;;) {
        const rows = await tx`select pg_try_advisory_xact_lock(hashtext(${SCHEMA_LOCK_NAME})) as locked`;
        held = (rows as unknown as Array<{ locked: boolean }>)[0]?.locked === true;
        if (held || Date.now() >= deadline) break;
        await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
      }

      if (!held) {
        // Somebody else has held it for longer than the wait. Do not migrate anyway: two
        // writers is the thing the lock exists to prevent. Fall through to the assertions
        // below, which say whether their run finished the job. If it did, this boot is
        // fine. If it did not, this boot refuses and says so.
        return;
      }

      // Counted on the application pool, not on this transaction, and either side of the
      // work. The difference is the only honest answer to "did anything change".
      const before = await countApplied();
      await applyPhases();
      newlyApplied = (await countApplied()) - before;
      applied = true;
    });

    // Outside the lock on purpose. These are reads, they are exactly what a boot that
    // did not get the lock has to run, and holding a lock while proving the work is
    // done buys nothing.
    await assertSchemaCurrent();
    await assertRlsForced();
    return { applied, newlyApplied };
  } finally {
    await lockClient.end({ timeout: 5 });
  }
}

/**
 * How many migrations the database records as applied, or 0 when it records nothing.
 *
 * The catch is the empty database case: `drizzle.__drizzle_migrations` does not exist until
 * the migrator makes it, and "no table" and "no rows" mean the same thing here.
 */
async function countApplied(): Promise<number> {
  try {
    const res = await getDb().execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return (res as unknown as Array<{ n: number }>)[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

/** The three phases that change the database, in the only order that works. */
async function applyPhases(): Promise<void> {
  const db = getDb();

  // Phase 1. Extensions are a precondition, not a migration: `create table founder`
  // in 0000 names citext, so it has to exist before the migrator opens that file.
  // IF NOT EXISTS makes this safe to run on every boot.
  await db.execute(sql`create extension if not exists citext`);

  // Phase 2. The generated table DDL. Regenerate with `npm run db:generate` after
  // any change to schema.ts. Never hand edit a file under migrations/.
  await migrate(db, { migrationsFolder });

  // Phase 3. Policies. Idempotent by construction: every CREATE POLICY is preceded
  // by a DROP POLICY IF EXISTS in the same file.
  const rls = await readFile(join(here, 'rls.sql'), 'utf8');
  await db.execute(sql.raw(rls));
}

/** One line of drizzle's journal file. Only `when` and `tag` are read here. */
interface JournalEntry {
  readonly when: number;
  readonly tag: string;
}

/**
 * Prove the schema is the one this build of the app expects.
 *
 * WHY IT EXISTS. assertRlsForced below proves five tables are locked down. It does not
 * prove `founder` exists, and `founder` is the table the failed sign in named. More to
 * the point, neither of them proves the LAST migration ran. A deployment that applied
 * 0000 and not 0001 answers every health check, serves every page, and fails only on the
 * screens that touch the newer tables. This is the check that turns that into a boot
 * that says so.
 *
 * HOW IT KNOWS. Two lists. `meta/_journal.json` is written by drizzle-kit and committed
 * to this repository, so it is the list of migrations this build ships. The
 * `drizzle.__drizzle_migrations` table holds one row per migration applied, keyed by the
 * journal's own `when` value. Every `when` in the file must have a row. Read the writer
 * in node_modules/drizzle-orm/pg-core/dialect.js: it inserts `created_at` from
 * `migration.folderMillis`, which is the journal's `when`.
 *
 * IT FAILS CLOSED IN BOTH DIRECTIONS. A journal that cannot be read, a bookkeeping table
 * that is not there, and a missing row all raise. Each says which of the three happened,
 * because "the database is empty" and "this check no longer understands drizzle's
 * bookkeeping" need different people to look at them.
 */
export async function assertSchemaCurrent(): Promise<void> {
  let entries: JournalEntry[];
  try {
    const raw = await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8');
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) throw new Error('the journal has no entries array');
    entries = parsed.entries as JournalEntry[];
  } catch (err) {
    throw new Error(
      `The list of migrations that ship with this app could not be read, so there is no way to tell whether the database is up to date. ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (entries.length === 0) {
    throw new Error('This app ships no migrations at all, so the build is wrong rather than the database.');
  }

  const db = getDb();
  let appliedAt: Set<string>;
  try {
    const res = await db.execute(sql`select created_at from drizzle.__drizzle_migrations`);
    const rows = res as unknown as Array<{ created_at: string | number | bigint }>;
    // bigint comes back from postgres.js as a string. Compare as strings, and let
    // String() flatten whichever of the three shapes arrives.
    appliedAt = new Set(rows.map((r) => String(r.created_at)));
  } catch (err) {
    throw new Error(
      `The database has no record of any migration having run. That is what an empty database looks like, and it is why sign in fails with relation "founder" does not exist. ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const missing = entries.filter((e) => !appliedAt.has(String(e.when))).map((e) => e.tag);
  if (missing.length > 0) {
    throw new Error(
      `The database is behind this app. ${String(missing.length)} of ${String(entries.length)} migrations have not been applied: ${missing.join(', ')}.`,
    );
  }
}

/**
 * Prove the policies are actually in force.
 *
 * relrowsecurity says ENABLE ran. relforcerowsecurity says FORCE ran, and that is
 * the one that matters, because ENABLE alone does not apply to the table's owner and
 * a managed Postgres usually hands the application the owner role. Without this
 * check the second belt reads as present in a code review and is absent at runtime.
 */
export async function assertRlsForced(): Promise<void> {
  const db = getDb();
  const res = await db.execute(sql`
    select c.relname,
           c.relrowsecurity      as enabled,
           c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = current_schema()
       and c.relname = any(${sql.raw(`array[${RLS_TABLES.map((t) => `'${t}'`).join(',')}]`)})
  `);
  const rows = res as unknown as Array<{ relname: string; enabled: boolean; forced: boolean }>;
  const seen = new Map(rows.map((r) => [r.relname, r]));
  const bad: string[] = [];
  for (const table of RLS_TABLES) {
    const row = seen.get(table);
    if (!row) bad.push(`${table}: table not found`);
    else if (!row.enabled) bad.push(`${table}: row level security not enabled`);
    else if (!row.forced) bad.push(`${table}: row level security not FORCEd, so it does not apply to the owner`);
  }
  if (bad.length > 0) {
    throw new Error(`Row level security did not apply. Refusing to continue.\n  ${bad.join('\n  ')}`);
  }
}

// Run directly: `npm run db:migrate`. Still supported, and still how a mentor applies a
// migration by hand. It is no longer the only thing that runs one.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async (run) => {
      // eslint-disable-next-line no-console -- this is a CLI entry point, not server code
      console.log(
        !run.applied
          ? 'another process was migrating. Waited, then verified the schema and row level security'
          : run.newlyApplied > 0
            ? `${String(run.newlyApplied)} migration(s) applied, schema verified, row level security verified`
            : 'nothing was pending. Schema verified, row level security verified',
      );
      await closeDb();
    })
    .catch(async (err: unknown) => {
      // eslint-disable-next-line no-console -- this is a CLI entry point, not server code
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
