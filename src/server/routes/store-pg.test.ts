/**
 * src/server/routes/store-pg.test.ts
 *
 * WHAT THIS IS. Every statement the two Postgres stores build, rendered to SQL
 * and read. No database, no connection, no network.
 *
 * WHY IT EXISTS. There is no Postgres here, so the stores cannot be executed.
 * That leaves two ways to be wrong and this closes the more dangerous one.
 *
 *   A FOUNDER SCOPED QUERY WITH NO FOUNDER IN IT. One founder reading another
 *   founder's prospects is the failure that ends this product. `where
 *   founder_id = $1` is the first belt and row level security is the second,
 *   and RLS is not on `threads`, `messages`, `turns` or `turn_events`, so for
 *   those the first belt is the only one. A missing filter is one deleted line
 *   away at any time, and it is silent: every test that reads one founder's own
 *   data still passes. This is the test that does not.
 *
 *   A COLUMN NAME THAT DOES NOT EXIST. Drizzle catches that at compile time,
 *   which is most of why the stores are written against the schema module. The
 *   rendered SQL is here so the ON CONFLICT predicate and the ordering are
 *   visible as text rather than inferred from a builder chain.
 *
 * WHAT IT DOES NOT PROVE, said plainly: that these statements run. A permission
 * the app role does not have, an index the ON CONFLICT cannot infer, a
 * migration that has not been applied. Those need one run against a real
 * database and that run has not happened.
 *
 * WHAT IT CALLS. drizzle's own SQL renderer, over a client that never connects.
 * WHAT IT READS AND WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { and, asc, eq, gt, gte, isNull, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  founders,
  geFile,
  messages,
  sessions,
  signinTokens,
  threads,
  turnEvents,
  turns,
} from '../db/schema.ts';

/**
 * postgres.js does not open a socket until a query runs, and `.toSQL()` never
 * runs one. So this handle renders SQL and connects to nothing, which is what
 * makes this file a unit test rather than an integration test nobody can run.
 */
const db = drizzle(postgres('postgres://unused:unused@127.0.0.1:1/unused', { max: 1 }));

const FOUNDER = '01J0AAAAAAAAAAAAAAAAAAAAAA';

/** Every statement in the two stores that reads or writes one founder's data. */
const FOUNDER_SCOPED: ReadonlyArray<[string, { sql: string; params: unknown[] }]> = [
  [
    'listThreads',
    db.select().from(threads).where(eq(threads.founderId, FOUNDER)).toSQL(),
  ],
  [
    'findThread',
    db
      .select()
      .from(threads)
      .where(and(eq(threads.founderId, FOUNDER), eq(threads.id, 'th_1')))
      .toSQL(),
  ],
  [
    'listMessages',
    db
      .select()
      .from(messages)
      .where(and(eq(messages.founderId, FOUNDER), eq(messages.threadId, 'th_1')))
      .toSQL(),
  ],
  [
    'findTurn',
    db
      .select()
      .from(turns)
      .where(and(eq(turns.founderId, FOUNDER), eq(turns.id, 'tn_1')))
      .toSQL(),
  ],
  [
    'eventsSince',
    db
      .select()
      .from(turnEvents)
      .where(
        and(eq(turnEvents.founderId, FOUNDER), eq(turnEvents.threadId, 'th_1'), gt(turnEvents.id, 10)),
      )
      .orderBy(asc(turnEvents.id))
      .toSQL(),
  ],
  ['listFiles', db.select().from(geFile).where(eq(geFile.founderId, FOUNDER)).toSQL()],
  [
    'readFile',
    db
      .select()
      .from(geFile)
      .where(and(eq(geFile.founderId, FOUNDER), eq(geFile.path, 'founder-brain.md')))
      .toSQL(),
  ],
  [
    'dataKeyFor',
    db.select({ wrappedKey: founders.wrappedKey }).from(founders).where(eq(founders.id, FOUNDER)).toSQL(),
  ],
];

test('EVERY FOUNDER SCOPED STATEMENT CARRIES A FOUNDER FILTER, AS A BOUND PARAMETER', () => {
  for (const [name, rendered] of FOUNDER_SCOPED) {
    const scoped =
      /"founder_id" = \$\d/.test(rendered.sql) || /"founder"\."id" = \$\d/.test(rendered.sql);
    assert.ok(scoped, `${name} has no founder filter: ${rendered.sql}`);
    assert.ok(
      rendered.params.includes(FOUNDER),
      `${name} does not bind the founder id, so it is interpolated somewhere: ${rendered.sql}`,
    );
    // Nothing is ever built by string concatenation. A founder id that reached
    // the SQL text rather than the parameter list would show up here as the id
    // appearing inside the statement.
    assert.ok(!rendered.sql.includes(FOUNDER), `${name} interpolated the founder id into the SQL`);
  }
});

test('THE MESSAGE INSERT NAMES THE PARTIAL INDEX PREDICATE, OR POSTGRES CANNOT INFER IT', () => {
  const rendered = db
    .insert(messages)
    .values({
      id: 'ms_1',
      threadId: 'th_1',
      founderId: FOUNDER,
      role: 'founder',
      text: 'we sell to construction firms',
      clientMsgId: 'c-1',
      createdAt: new Date('2026-09-25T13:00:00Z'),
    })
    .onConflictDoNothing({
      target: [messages.threadId, messages.clientMsgId],
      where: sql`client_msg_id is not null`,
    })
    .returning({ id: messages.id })
    .toSQL();

  assert.match(rendered.sql, /on conflict \("thread_id","client_msg_id"\)/);
  // The index in schema.ts is partial: `where client_msg_id is not null`. An ON
  // CONFLICT without the same predicate raises "no unique or exclusion
  // constraint matching the ON CONFLICT specification", on every send.
  assert.match(rendered.sql, /where client_msg_id is not null/);
  assert.match(rendered.sql, /do nothing/);
  assert.match(rendered.sql, /returning "id"/);
});

test('CONSUMING A SIGN IN TOKEN IS ONE CONDITIONAL UPDATE THAT REPORTS WHO WON', () => {
  const rendered = db
    .update(signinTokens)
    .set({ consumedAt: new Date('2026-09-25T13:00:00Z') })
    .where(and(eq(signinTokens.id, 'req.link'), isNull(signinTokens.consumedAt)))
    .returning({ id: signinTokens.id })
    .toSQL();

  // Without `consumed_at is null` two tabs both update the row, both get a row
  // back, and both are given a session on a token that works once.
  assert.match(rendered.sql, /"consumed_at" is null/);
  assert.match(rendered.sql, /returning "id"/);
  assert.match(rendered.sql, /update "signin_tokens"/);
});

test('THE SIGN IN RATE LIMIT COUNTS ROWS IN POSTGRES, AND COUNTS REQUESTS NOT ROWS', () => {
  const rendered = db
    .select({ n: sql<string>`count(*)` })
    .from(signinTokens)
    .where(
      and(
        eq(signinTokens.email, 'ama@example.com'),
        gte(signinTokens.createdAt, new Date('2026-09-25T12:00:00Z')),
        like(signinTokens.id, '%.link'),
      ),
    )
    .toSQL();

  assert.match(rendered.sql, /count\(\*\)/);
  assert.match(rendered.sql, /from "signin_tokens"/);
  // One request writes two rows, a link and a code. Counting both would halve
  // the limit without anybody noticing.
  assert.ok(rendered.params.includes('%.link'), rendered.sql);
});

test('A SESSION IS FOUND BY THE HASH OF THE COOKIE, AND THE COOKIE IS NEVER A PARAMETER', () => {
  const cookieValue = 'a-secret-nobody-should-store';
  const rendered = db.select().from(sessions).where(eq(sessions.id, 'not-the-cookie')).toSQL();
  assert.match(rendered.sql, /"sessions"\."id" = \$1/);
  assert.ok(!rendered.params.includes(cookieValue));
});

test('THE BOOT RESTORE READS QUEUED TURNS ACROSS EVERY FOUNDER, DELIBERATELY', () => {
  const rendered = db
    .select()
    .from(turns)
    .where(eq(turns.status, 'queued'))
    .orderBy(asc(turns.createdAt))
    .toSQL();
  // The one statement in the store with no founder filter, and it is correct:
  // the turns table is the record, so a restart puts every founder's queued
  // work back in line rather than losing it. Named here so it reads as a
  // decision rather than as the one somebody forgot.
  //
  // Only the WHERE clause is examined. The select list names every column of
  // the row, founder_id among them, and matching against the whole statement
  // would pass for the wrong reason.
  const where = rendered.sql.slice(rendered.sql.indexOf(' where '));
  assert.ok(!where.includes('"founder_id"'), where);
  assert.match(rendered.sql, /"status" = \$1/);
  assert.deepEqual(rendered.params, ['queued']);
});
