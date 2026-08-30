/**
 * tests/db/setup.ts
 *
 * WHAT THIS IS. The one door a test suite goes through when it needs the real
 * Postgres. It answers two questions and nothing else: is there a database, and may
 * this suite have it to itself while it runs.
 *
 * WHY IT EXISTS. Two suites needed a database, each called runMigrations() from its
 * own before hook, and node:test runs test files in parallel processes. So both ran
 * `create extension if not exists citext` against one database at the same moment and
 * one of them lost:
 *
 *     not ok 543 - the turn, against a real Postgres
 *       failureType: 'hookFailed'
 *       error: 'Failed query: create extension if not exists citext'
 *
 * Each suite alone was green, 6 assertions and 9. Together they were red. So the 15
 * assertions that carry the only proof this project has that a refused turn leaves the
 * founder record untouched had never once run green inside a single `npm test`. There
 * are 19 of them now, across the three files named below, and the summary's own skipped
 * count is where to read that number rather than here.
 *
 * WHY IT SERIALISES THE SUITES RATHER THAN GIVING EACH ONE ITS OWN DATABASE. Both were
 * open. Serialising won on three counts.
 *
 *   1  A database of its own needs CREATE DATABASE on whatever server the person running
 *      the tests pointed at, and the line this project prints tells them to point at
 *      whatever they have. A lock needs no privilege beyond connecting.
 *   2  Two databases on one server are still one server. turn.concurrency.test.ts
 *      MEASURES the connection pool, and another suite working that server at the same
 *      moment is noise in the measurement whichever database it is working in.
 *   3  It holds for the whole suite and not only for the migration, which closes a
 *      window that ordering the migrations does not. rls.sql drops every policy and
 *      creates it again, and under FORCE ROW LEVEL SECURITY a table whose policy is
 *      momentarily gone returns no rows at all. A suite past its own migration and
 *      running its assertions can meet that moment, and no rows reads exactly like a
 *      founder's material having vanished.
 *
 * BE HONEST ABOUT POINT 3: THAT WINDOW WAS NOT OBSERVED. While this was being written,
 * src/server/db/migrate.ts gained a schema lock of its own, so `create extension` and
 * the drizzle bookkeeping table no longer collide even without this file. Holding the
 * claim only across the migration was then tried on purpose, three times against a fresh
 * database, and the two storage suites stayed green. So the whole suite hold is not
 * proved necessary today. It is kept because the window is real, because it costs the
 * length of the shorter suite and that was measured at 0.4 seconds, and because it means
 * these suites do not depend on migrate.ts continuing to lock.
 *
 * WHAT CALLS IT. src/server/storage/turn.db.test.ts,
 * src/server/storage/turn.concurrency.test.ts, tests/db/setup.test.ts, and
 * tests/unit/db-suites-visible.test.ts, which imports the skip reason from here so
 * there is one definition of it rather than a copy in each file that drifts.
 *
 * WHAT IT READS. DATABASE_URL and GE_MASTER_KEY. The migrations it runs read
 * src/server/db/migrations and src/server/db/rls.sql.
 * WHAT IT WRITES. The schema of the database DATABASE_URL names, and one advisory lock
 * held for as long as a suite runs. Nothing on disk.
 */

import postgres from 'postgres';

import { closeDb } from '../../src/server/db/client.ts';
import { runMigrations } from '../../src/server/db/migrate.ts';

/**
 * The two conditions, kept separate on purpose. A machine with a database and no master
 * key fails inside the cipher, and that reads as a storage bug rather than as a secret
 * nobody set.
 */
const DATABASE_URL_IS_SET =
  typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0;
const MASTER_KEY_IS_SET =
  typeof process.env.GE_MASTER_KEY === 'string' && process.env.GE_MASTER_KEY.length > 0;

/**
 * Why a database suite is not running, or false when it is.
 *
 * ONE DEFINITION, IMPORTED. Every suite used to carry its own copy of this pair of
 * checks, and tests/unit/db-suites-visible.test.ts carried a third copy so it could
 * report on them. Three copies of a condition is three chances for one of them to stop
 * matching the others quietly.
 */
export const NO_DATABASE: string | false = !DATABASE_URL_IS_SET
  ? 'DATABASE_URL is not set, so there is no real database to roll back'
  : !MASTER_KEY_IS_SET
    ? 'GE_MASTER_KEY is not set, and every blob is encrypted under it'
    : false;

/**
 * The options every assertion in a database suite is registered with.
 *
 * WHY EVERY ASSERTION AND NOT THE SUITE. node:test counts a skipped TEST under
 * `# skipped`. It counts a skipped SUITE under `# suites` and under nothing else, and
 * prints `ok` beside it. So a suite skipped whole disappears: `# tests` does not include
 * its assertions, `# skipped` stays at zero, and anything reading the TAP stream sees a
 * line beginning `ok`. Skipping each assertion instead puts all 15 of them in the
 * summary's own `# skipped` count, which is the number a person actually reads.
 */
export const dbTest: { readonly skip?: string } = Object.freeze(
  NO_DATABASE ? { skip: NO_DATABASE } : {},
);

/**
 * The lock every database suite takes, as two 32 bit halves rather than one 64 bit key.
 *
 * Two halves because pg_locks stores the two int4 form as classid and objid with
 * objsubid 2, so the row that proves the lock is really held can be matched on exactly
 * these two numbers. The one bigint form hashes into the same columns and the match
 * would be a guess. 0x4C48 is LH and 0x4442 is DB, which is only so that an operator
 * looking at pg_locks on a shared machine can see whose lock it is.
 */
export const LOCK_CLASS = 0x4c48;
export const LOCK_OBJECT = 0x4442;

/**
 * What the lock connection calls itself to Postgres.
 *
 * Deliberately NOT db/client.ts's APPLICATION_NAME: turn.concurrency.test.ts counts the
 * connections whose application_name is exactly that one, and this connection belongs to
 * the harness rather than to the app. The process id is in it so that a suite can ask
 * about its OWN lock and get an answer that another suite holding the same key in
 * another process cannot change.
 */
export const LOCK_APPLICATION_NAME = `launchhouse-test-lock-${String(process.pid)}`;

/**
 * How long a suite waits for its turn before it calls this a wedge rather than a queue.
 *
 * IT HAS TO BE UNDER THE RUNNER'S OWN BUDGET. `npm test` passes --test-timeout=30000,
 * and that budget covers the before hook, not only the assertions: a before hook that
 * waits too long is killed with "test timed out after 30000ms" and nothing about the
 * lock. Twenty seconds leaves the message below ten seconds to reach the reader. The
 * suites it waits for are 0.4 and 0.8 seconds, so this is 25 times the wait it is for.
 */
const DEFAULT_WAIT_MS = 20_000;

export interface DatabaseClaim {
  /** Hand the database to whoever is next. Called from the suite's after hook. */
  release: () => Promise<void>;
}

/**
 * Take the database, migrate it, and hold it until the suite is done with it.
 *
 * WHAT CALLS IT. The before hook of every suite that touches a real Postgres.
 * WHAT IT READS. DATABASE_URL. WHAT IT WRITES. The schema, and the advisory lock.
 *
 * The lock is a SESSION lock on a connection this function opens and owns, which is the
 * one shape that can outlive a transaction, and db/client.ts is right that a session
 * lock through a transaction pooler protects nothing. So it is not assumed: the check
 * below asks Postgres, on the same connection, whether the lock is actually granted to
 * this backend, and refuses if it is not. A pooler in front would fail that check rather
 * than let two suites run at once believing they were serialised.
 */
export async function claimTheDatabase(
  suite: string,
  options: { readonly waitMs?: number } = {},
): Promise<DatabaseClaim> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error(
      `${suite} asked for the database and DATABASE_URL is not set. A suite must not call this when NO_DATABASE says why it cannot run.`,
    );
  }
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;

  const lock = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    // Founder content never reaches a log line, and postgres.js prints the failing
    // query by default. Nothing here binds founder material, and the rule holds anyway.
    onnotice: () => undefined,
    connection: {
      // A lock wait is cancelled by statement_timeout like any other wait. This is what
      // turns "the runner killed the file with no reason" into the sentence below.
      statement_timeout: waitMs,
      application_name: LOCK_APPLICATION_NAME,
    },
  });

  try {
    await lock`select pg_advisory_lock(${LOCK_CLASS}::int4, ${LOCK_OBJECT}::int4)`;
  } catch (err) {
    await lock.end({ timeout: 5 });
    throw new Error(
      `${suite} waited ${String(waitMs)} ms for the one test database and never got it. ` +
        'Another database suite is still holding it, or a run that died left a connection open. ' +
        'List them with: select * from pg_locks where locktype = \'advisory\';',
      { cause: err },
    );
  }

  // Ask Postgres whether the lock is really this backend's, rather than believing the
  // call that appeared to succeed. Through a transaction pooler the question would be
  // asked on a different connection and the answer would be none, which is the refusal.
  const held = await lock`
    select count(*)::int as n
      from pg_locks
     where locktype = 'advisory'
       and classid = ${LOCK_CLASS}::oid
       and objid = ${LOCK_OBJECT}::oid
       and objsubid = 2
       and pid = pg_backend_pid()
       and granted
  `;
  if (Number(held[0]?.['n'] ?? 0) !== 1) {
    await lock.end({ timeout: 5 });
    throw new Error(
      `${suite} took the database lock and Postgres does not show it as held by this connection. ` +
        'A transaction pooler between this process and Postgres does that: the lock lands on a ' +
        'connection somebody else is handed next. Point DATABASE_URL at Postgres directly to run these suites.',
    );
  }

  // Held, so nothing else is migrating. citext, the table DDL and rls.sql all happen
  // inside the lock, and no other suite is reading the tables while the policies are
  // dropped and made again.
  await runMigrations();

  let released = false;
  return {
    release: async (): Promise<void> => {
      if (released) return;
      released = true;
      try {
        const rows = await lock`
          select pg_advisory_unlock(${LOCK_CLASS}::int4, ${LOCK_OBJECT}::int4) as released
        `;
        if (rows[0]?.['released'] !== true) {
          throw new Error(
            `${suite} tried to hand the database back and Postgres says it was not holding the lock. ` +
              'Something else unlocked it, which means two suites may have been running at once.',
          );
        }
      } finally {
        try {
          // THE CLAIM OPENED THE APPLICATION POOL, THROUGH THE MIGRATIONS IT RAN, SO THE
          // CLAIM CLOSES IT. A suite that leaves it open does not fail an assertion. It
          // fails like this, and the message names nothing that is wrong:
          //
          //     not ok 71 - tests/db/setup.test.ts
          //       error: 'test timed out after 30000ms'
          //
          // with every assertion in the file passing 29 seconds earlier. db/client.ts
          // holds an idle connection for 30 seconds, the process cannot exit while it is
          // open, and the runner's 30 second budget runs out first. Closing it here
          // means a suite cannot forget.
          await closeDb();
        } finally {
          // Ending the connection releases the lock too, so a throw above still lets the
          // next suite in rather than wedging the whole run behind a failed one.
          await lock.end({ timeout: 5 });
        }
      }
    },
  };
}
