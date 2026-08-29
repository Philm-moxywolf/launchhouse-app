/**
 * src/server/routes/spend-ledger.ts
 *
 * WHAT THIS IS. The two reads the spend gate needs, over the `spend` table:
 * what one founder has spent in total, and what the cohort has spent today.
 *
 * WHY IT EXISTS. Admission refuses a turn when a cap is reached, and it cannot
 * refuse what it cannot count. Today each founder's own paid plan funds their
 * own work. In the app one API key funds 130 founders across three sessions and
 * a weekend, which is why the caps are in the harness from day one rather than
 * added after the first surprising invoice.
 *
 *   THE COHORT BREAKER IS THE ONE THAT MATTERS AT 3AM. A per founder cap stops
 *   one founder. A global daily ceiling is the only layer that stops a bug
 *   billing 130 people while everybody is asleep.
 *
 *   `costUsd` IS ALREADY A DIFFERENCE. The figure on an SDK result message is
 *   cumulative across the turns of a streaming session. The writer differences
 *   it before storing it, so summing this column is correct and summing
 *   `runReadingUsd` would over count by roughly the number of turns in a
 *   session. That is written here because this is where somebody would reach
 *   for the wrong column.
 *
 *   NUMERIC COMES BACK AS A STRING. Postgres numeric is returned as text by the
 *   driver, on purpose, because it does not fit a float. Number() at the edge
 *   is fine for a cap in dollars and would not be fine for a ledger anybody
 *   invoices from.
 *
 *   EVERY QUERY IN HERE IS ON THE POOL, AND THAT USED TO TAKE THE APP DOWN.
 *   `spendToDate` is called by Budget.spawnCapUsd, which is called by
 *   AgentRun.spawn, which used to run inside the turn's open transaction. So
 *   one turn held one connection and then waited here for a second one. With
 *   PGPOOL_MAX at its default of 10, ten concurrent turns each held one and
 *   each waited for the eleventh, and the eleventh only frees when a turn ends.
 *   Measured against a real Postgres: 9 turns finished, 10 finished none in 25
 *   seconds, and PGPOOL_MAX=1 hung a single turn for ever.
 *
 *   storage/turn.ts is the fix: the turn no longer holds a transaction across
 *   the model run, so these reads borrow a connection and give it straight
 *   back. `refuseIfHoldingAConnection` below is the guard that keeps it fixed.
 *   If somebody wraps a model run in a transaction again, this throws a
 *   sentence naming the problem on the first turn rather than hanging the
 *   process on the sixty fifth.
 *
 * WHAT CALLS IT. src/server/index.ts, which hands it to the agent's Budget.
 * WHAT IT READS. `spend`. WHAT IT WRITES. One `spend` row per turn, through
 * `add`. The turn writer is the only caller of `add`, because it is the only
 * thing holding the cumulative reading this row is differenced from.
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { getDb, refuseIfHoldingAConnection, type Db } from '../db/client.ts';
import { spend } from '../db/schema.ts';

/**
 * Matches the SpendLedger port in src/server/agent/ports.ts.
 *
 * `add` is here so one object satisfies the whole port. The caller of `add` is
 * the turn writer, not this folder: it has the cumulative reading and it is the
 * only thing that can difference it correctly.
 */
export interface SpendReader {
  spendToDate(founderId: string): Promise<number>;
  cohortSpendToday(): Promise<number>;
  add(row: {
    readonly founderId: string;
    readonly turnId: string;
    readonly routeId: string;
    readonly costUsd: number;
    readonly cacheReadTokens: number;
  }): Promise<void>;
}

export class PgSpendReader implements SpendReader {
  constructor(private readonly db: Db = getDb()) {}

  async spendToDate(founderId: string): Promise<number> {
    // See the header. This is the read that deadlocked the app, and this line is
    // what stops it deadlocking again quietly.
    refuseIfHoldingAConnection('the spend ledger, reading one founder\'s total');
    const rows = await this.db
      .select({ total: sql<string>`coalesce(sum(${spend.costUsd}), 0)` })
      .from(spend)
      .where(eq(spend.founderId, founderId));
    return Number(rows[0]?.total ?? 0);
  }

  async cohortSpendToday(): Promise<number> {
    refuseIfHoldingAConnection('the spend ledger, reading the cohort total');
    // Midnight UTC, because the process runs TZ=UTC and a breaker that rolls at
    // a founder's local midnight would roll 130 times a day in four zones.
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const rows = await this.db
      .select({ total: sql<string>`coalesce(sum(${spend.costUsd}), 0)` })
      .from(spend)
      .where(and(gte(spend.at, since)));
    return Number(rows[0]?.total ?? 0);
  }

  async add(row: {
    readonly founderId: string;
    readonly turnId: string;
    readonly routeId: string;
    readonly costUsd: number;
    readonly cacheReadTokens: number;
  }): Promise<void> {
    // The runner fires this without awaiting it, so it could never deadlock. It
    // could and did something quieter: with every connection held, the insert
    // never ran, and the spend row for a turn that cost real money was simply
    // never written. The cohort breaker cannot stop what it never counted.
    refuseIfHoldingAConnection('the spend ledger, writing a turn\'s cost');
    // costUsd is THE DIFFERENCE for this turn, never the cumulative reading.
    // Storing the reading here is the mistake that over counts by an order of
    // magnitude, and the column that holds the reading is runReadingUsd.
    await this.db.insert(spend).values({
      founderId: row.founderId,
      turnId: row.turnId,
      costUsd: row.costUsd.toFixed(6),
      cacheReadTokens: row.cacheReadTokens,
      at: new Date(),
    });
  }
}

/**
 * The reader used before any turn has ever run.
 *
 * Reports zero and says so once. FAIL CLOSED WOULD BE WRONG HERE and it is
 * worth saying why: refusing every turn because nothing has been spent yet is
 * refusing the entire cohort on the first morning. The cap that actually stops
 * a runaway is inside the SDK, per turn, and it does not depend on this.
 */
export class EmptySpendReader implements SpendReader {
  spendToDate(): Promise<number> {
    return Promise.resolve(0);
  }
  cohortSpendToday(): Promise<number> {
    return Promise.resolve(0);
  }
  add(): Promise<void> {
    return Promise.resolve();
  }
}
