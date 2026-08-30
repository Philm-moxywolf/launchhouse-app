/**
 * tests/db/setup.test.ts
 *
 * WHAT THIS IS. The proof that tests/db/setup.ts really does keep two database suites
 * apart, rather than appearing to.
 *
 * WHY IT EXISTS. The fix for the race is a lock, and a lock nobody has watched refuse
 * is a comment. Every assertion below makes the thing go wrong first: a second claim on
 * the key this suite is holding must be refused, and a claim that runs out of patience
 * must say so in words a person can act on. The control is here too, because "the second
 * claim failed" proves nothing unless a claim on a free key succeeds in the same breath
 * on the same connection.
 *
 * WHAT IT DOES NOT DO. It never asserts that a suite passes. Passing was never in
 * question; two suites migrating one database at the same moment was.
 *
 * IT IS ITSELF A DATABASE SUITE, and it takes the same lock as the others, so it queues
 * with them and is listed by tests/unit/db-suites-visible.test.ts like the rest.
 *
 * WHAT IT CALLS. tests/db/setup.ts and a Postgres connection of its own.
 * WHAT IT READS. DATABASE_URL. WHAT IT WRITES. Nothing beyond the migrations the claim
 * itself runs.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';

import {
  claimTheDatabase,
  dbTest,
  LOCK_APPLICATION_NAME,
  LOCK_CLASS,
  LOCK_OBJECT,
  NO_DATABASE,
  type DatabaseClaim,
} from './setup.ts';

let claim: DatabaseClaim | undefined;

before(async () => {
  if (NO_DATABASE) return;
  claim = await claimTheDatabase('tests/db/setup.test.ts');
});

after(async () => {
  if (NO_DATABASE) return;
  await claim?.release();
});

/** A connection of its own, so looking does not need the thing being looked at. */
function onlooker(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? '', {
    max: 1,
    connect_timeout: 10,
    onnotice: () => undefined,
    connection: { application_name: `launchhouse-test-onlooker-${String(process.pid)}` },
  });
}

describe('the claim that keeps two database suites apart', () => {
  it('IS EXCLUSIVE: while this suite holds the database, nothing else can take it', dbTest, async () => {
    const other = onlooker();
    try {
      const taken = await other`
        select pg_try_advisory_lock(${LOCK_CLASS}::int4, ${LOCK_OBJECT}::int4) as got
      `;
      assert.equal(
        taken[0]?.['got'],
        false,
        'a second connection took the database lock while this suite was holding it, so the two suites were never serialised',
      );

      // THE CONTROL. Without this, the refusal above could just as well be a lock
      // function that never returns true, and the whole file would be measuring
      // nothing. Same connection, same call, one number different.
      const free = await other`
        select pg_try_advisory_lock(${LOCK_CLASS}::int4, ${LOCK_OBJECT + 1}::int4) as got
      `;
      assert.equal(free[0]?.['got'], true, 'a free key was refused too, so the refusal above proves nothing');
      await other`select pg_advisory_unlock(${LOCK_CLASS}::int4, ${LOCK_OBJECT + 1}::int4)`;
    } finally {
      await other.end({ timeout: 5 });
    }
  });

  it('REFUSES IN WORDS when its turn never comes, instead of being killed by the runner', dbTest, async () => {
    // This suite is holding the lock, so a second claim cannot have it. The wait is cut
    // to a fraction of a second because the sentence is what is being tested, not the
    // twenty seconds. Without a bounded wait this is the failure a person meets:
    // "test timed out after 30000ms", which names the runner and not the cause.
    await assert.rejects(
      () => claimTheDatabase('a second suite that will not get its turn', { waitMs: 300 }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /waited 300 ms for the one test database/);
        assert.match(err.message, /pg_locks/, 'the refusal should say how to find who is holding it');
        return true;
      },
    );
  });

  it('GIVES IT BACK: releasing a claim takes this suite\'s hold off the key', dbTest, async () => {
    // A release that quietly did not release would show up as the NEXT suite waiting
    // twenty seconds for its turn and failing a whole file away from the cause. So it is
    // checked here, where the cause is.
    //
    // IT ASKS ABOUT THIS SUITE'S OWN HOLD AND NOT ABOUT THE KEY. The first version of
    // this test released, then tried to take the key from another connection, and
    // expected to get it. That passed on its own and failed inside `npm test`, because
    // the other database suites are queueing for that exact key and one of them takes it
    // in the microsecond between the release and the question. "Somebody else got there
    // first" and "the release did nothing" looked identical, which makes the assertion
    // worthless in the only run that matters. The question below cannot be answered by
    // another suite: the lock connection carries this process id in its application name,
    // so the row it looks for is this suite's or it is nobody's.
    const holdsIt = async (sql: postgres.Sql): Promise<number> => {
      const rows = await sql`
        select count(*)::int as n
          from pg_locks l
          join pg_stat_activity a on a.pid = l.pid
         where l.locktype = 'advisory'
           and l.classid = ${LOCK_CLASS}::oid
           and l.objid = ${LOCK_OBJECT}::oid
           and l.objsubid = 2
           and l.granted
           and a.application_name = ${LOCK_APPLICATION_NAME}
      `;
      return Number(rows[0]?.['n'] ?? -1);
    };

    const held = claim;
    assert.ok(held !== undefined, 'the before hook did not claim the database');

    const other = onlooker();
    try {
      // Both sides of the same question, one release apart. The first is the control:
      // without it, a zero afterwards could mean the row was never there.
      assert.equal(await holdsIt(other), 1, 'this suite is not holding the lock it claimed');
      await held.release();
      assert.equal(await holdsIt(other), 0, 'the claim was released and this suite is still holding the key');
      // Zero here means this suite no longer holds the key, by either route: the unlock
      // or the connection closing behind it. That the UNLOCK itself reported success is
      // asserted inside release, which throws when Postgres says it was not holding it.
    } finally {
      await other.end({ timeout: 5 });
    }

    // Taken again, so the after hook has something to give back, and so no suite still
    // waiting outside is let in halfway through this one. This may wait for a suite that
    // got in during the moment above, which is the mechanism working rather than failing.
    claim = await claimTheDatabase('tests/db/setup.test.ts, after proving the release');
  });
});
