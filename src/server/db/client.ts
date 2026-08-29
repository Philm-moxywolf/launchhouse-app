/**
 * src/server/db/client.ts
 *
 * WHAT THIS IS
 *   The one Postgres connection pool and the one Drizzle handle for the process, plus
 *   the two statements that must run at the top of every founder scoped transaction.
 *
 * WHY IT EXISTS
 *   Two failures. A module that opens its own pool exhausts the connection limit
 *   nobody has measured yet (assumption B7), and a transaction that forgets
 *   SET LOCAL app.founder_id sees zero rows under row level security and looks like a
 *   data loss bug. Putting both in one place means there is one thing to get right.
 *
 * WHAT CALLS IT
 *   src/server/storage/turn.ts is the main caller. Routes and the agent loop read
 *   through getDb(). Tests call closeDb() so the process can exit.
 *
 * READS  DATABASE_URL, PGPOOL_MAX and PG_STATEMENT_TIMEOUT_MS, through src/server/env.ts
 *        and never through process.env, so a pool size of "ten" is a deploy that refuses
 *        to start rather than a pool of NaN connections.
 * WRITES nothing of its own.
 *
 * ONLY THE TRANSACTION SCOPED ADVISORY LOCK IS SAFE HERE.
 *   Assumption B7: a transaction pooler may sit in front of this database. A session
 *   scoped lock taken through a transaction pooler is taken on a connection that will
 *   be handed to somebody else, so it protects nothing and never unlocks.
 *   pg_advisory_xact_lock is released by COMMIT or ROLLBACK, which is the only
 *   behaviour that survives a pooler. There is no session lock helper in this file on
 *   purpose: an absent function cannot be called by mistake.
 *
 * ONE TURN MAY HOLD ONE CONNECTION, AND THE RULE IS ENFORCED, NOT WRITTEN DOWN.
 *   The pool is a fixed number of connections. A piece of code that is already
 *   holding one and then waits for a second is waiting for a connection that only
 *   frees when something finishes, and with PGPOOL_MAX of them doing it at once
 *   nothing ever finishes. That is not slow. It is permanent, it takes the process
 *   with it, and it is exactly what happened here: the turn held its transaction
 *   across the model run, the spend gate read the ledger on the pool inside that
 *   window, and ten concurrent turns wedged the app for ever at the shipped
 *   defaults. Measured: 9 turns finished, 10 finished none in 25 seconds.
 *
 *   whileHoldingAConnection and refuseIfHoldingAConnection below are that rule made
 *   into code. Every transaction body marks itself, and anything that reaches for
 *   the pool refuses rather than waits. A refusal is a bug report at the first turn
 *   in development. A wait is 65 founders in a room looking at a frozen screen.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { lateSettings } from '../env.ts';
import * as schema from './schema.ts';

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Any Drizzle handle that can run a query: the pool level handle or a transaction.
 * storage/* functions take this so the same code runs inside and outside a turn,
 * which is what makes them testable without a fake.
 */
export type Queryable = Pick<Db, 'execute' | 'select' | 'insert' | 'update' | 'delete'>;

/**
 * What this process calls itself to Postgres.
 *
 * Read back in pg_stat_activity.application_name. Used by the concurrency test to
 * ask Postgres which connections are THIS process's, which is the only way to
 * assert "no connection is held across a model run" and mean it.
 */
export const APPLICATION_NAME = `launchhouse-${String(process.pid)}`;

let client: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

export function getClient(): ReturnType<typeof postgres> {
  if (client) return client;
  const settings = lateSettings();
  const url = settings.databaseUrl;
  if (!url) {
    // Fail at boot, not at 3am. env.ts does the same check with zod for every other
    // variable; it is repeated here because storage tests import this file directly
    // without going through env.ts.
    throw new Error('DATABASE_URL is not set. The database is the record, so there is nothing to run without it.');
  }
  client = postgres(url, {
    // Deliberately small. Assumption B7 has not been run, so the connection limit and
    // whether a pooler sits in front are both unknown. A small pool that queues is a
    // slow app; a large pool past the limit is an app that refuses to connect.
    max: settings.pgPoolMax,
    idle_timeout: 30,
    connect_timeout: 10,
    // A turn holds its transaction for two short bursts and never across a model
    // run, so a long statement here means something is wedged rather than working.
    // A wedged statement holds the founder's advisory lock, which is what makes this
    // a cap rather than a nicety. storage/turn.ts is what makes the first sentence
    // true; it used to be an aspiration and the app deadlocked because of it.
    connection: {
      statement_timeout: settings.pgStatementTimeoutMs,
      // Names this process in pg_stat_activity. An operator looking at a busy
      // database can then see which connections belong to the app and what they
      // are doing, which is the difference between "something is holding a
      // transaction open" and "we do not know". The pid is in it because a
      // restart is the thing you most often want to tell apart.
      application_name: APPLICATION_NAME,
    },
    // Founder content never reaches a log line. postgres.js prints the failing query
    // on an error by default and a query carries bound values.
    onnotice: () => undefined,
  });
  return client;
}

export function getDb(): Db {
  if (!db) db = drizzle(getClient(), { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}

/**
 * Name the founder for the rest of this transaction.
 *
 * set_config with is_local true is SET LOCAL with a bind parameter. SET LOCAL itself
 * takes no parameters, so the alternative is string interpolation into SQL, which is
 * exactly the thing this codebase does not do. The founder id has already been
 * validated by storage/paths.ts before it gets here; this is the second reason it
 * cannot matter.
 */
export async function setFounderScope(tx: Queryable, founderId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.founder_id', ${founderId}, true)`);
}

/**
 * One writer per founder, across containers.
 *
 * hashtext is Postgres' own hash of the id, which is what turns a 26 character ULID
 * into the bigint the lock takes. Collisions are possible and harmless: two founders
 * who collide serialise against each other and both still get correct turns.
 *
 * Transaction scoped. Released by COMMIT or ROLLBACK, including the ROLLBACK a dead
 * connection causes, which is why a container dying mid turn does not wedge a founder
 * out of their own workspace.
 */
export async function takeFounderLock(tx: Queryable, founderId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${founderId}))`);
}

/**
 * Try to take the lock without waiting.
 *
 * NOTHING CALLS THIS TODAY, and the comment that used to be here said the queue did.
 * It does not: agent/queue.ts enforces per founder single flight from its own
 * in memory `runningByFounder` set, and storage/turn.ts holds a per founder gate in
 * this process for the length of a turn. Both are the right shape for one Reserved
 * VM, which is what the build document chose.
 *
 * It is kept because it is the only safe way to ask "is another CONTAINER writing
 * for this founder" without waiting, which is the question assumption B6 will decide
 * whether anyone needs to ask. Correcting the comment rather than deleting the
 * function, because a helper that lies about who calls it is worse than either.
 */
export async function tryFounderLock(tx: Queryable, founderId: string): Promise<boolean> {
  const rows = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${founderId})) as locked`);
  const first = (rows as unknown as Array<{ locked: boolean }>)[0];
  return first?.locked === true;
}

/* -------------------------------------------------------------------------- */
/* The connection rule                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What the code running right now is already holding, if anything.
 *
 * AsyncLocalStorage and not a module level flag, because the whole point is to
 * tell "this call stack is inside a transaction" apart from "some other turn on
 * this process is". A flag would refuse every read in the app the moment one
 * turn opened a transaction.
 */
const heldConnection = new AsyncLocalStorage<{ readonly what: string }>();

/**
 * Mark everything inside as running on a connection this code already holds.
 *
 * Wrapped around a transaction body, so anything the body calls, however deep,
 * can find out that reaching for the pool would be reaching for a second one.
 */
export function whileHoldingAConnection<T>(what: string, fn: () => Promise<T>): Promise<T> {
  return heldConnection.run({ what }, fn);
}

/** What this call stack is already holding, or null. For tests and for the guard. */
export function connectionHeldHere(): string | null {
  return heldConnection.getStore()?.what ?? null;
}

/**
 * Refuse to take a pool connection from inside a transaction that already has one.
 *
 * THIS IS THE GUARD THAT TURNS THE WORST BUG IN THE APP INTO A STACK TRACE.
 * It is called by anything that queries the pool directly rather than being handed
 * a transaction: the spend ledger is the one that did it, and the next one will be
 * something nobody has written yet. The message names both halves so whoever hits
 * it does not have to work out what "second connection" means at 2 am.
 *
 * It throws rather than logging. A read that quietly deadlocks looks to a founder
 * exactly like the app being broken, and looks to an operator like nothing at all.
 */
export function refuseIfHoldingAConnection(what: string): void {
  const held = connectionHeldHere();
  if (held === null) return;
  throw new Error(
    `${what} tried to take a second Postgres connection from inside ${held}. ` +
      'One turn may hold one connection. With PGPOOL_MAX of these at once, every ' +
      'connection is held by something waiting for a connection, and the process ' +
      'never recovers. Take the transaction handle as an argument, or do this read ' +
      'before the transaction opens.',
  );
}

/**
 * One short founder scoped transaction, and the connection goes straight back.
 *
 * For a read that has to see rows under row level security but is NOT part of the
 * turn's own transaction. Borrowing for the length of one statement is safe at any
 * concurrency: the connection is queued for, used, and returned, so a founder who
 * waits waits milliseconds rather than for somebody else's model run.
 */
export async function inFounderScope<T>(
  db: Db,
  founderId: string,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  refuseIfHoldingAConnection('a founder scoped read');
  return db.transaction(async (tx) => {
    await setFounderScope(tx, founderId);
    return whileHoldingAConnection('a founder scoped read', () => fn(tx));
  });
}

/**
 * Which founder this transaction is scoped to, according to Postgres itself.
 *
 * Used by tests and by the audit check, never as a source. Reading the scope back and
 * acting on it is how a request ends up serving whoever the last transaction was for;
 * the founder id always comes from the session, and this only ever confirms it.
 */
export async function readFounderScope(tx: Queryable): Promise<string | null> {
  const rows = await tx.execute(sql`select current_setting('app.founder_id', true) as founder_id`);
  const first = (rows as unknown as Array<{ founder_id: string | null }>)[0];
  return first?.founder_id ?? null;
}

export { schema };
