/**
 * budget.ts
 *
 * WHAT: The four spend caps, and the arithmetic that turns the SDK's cumulative
 *       cost figure into one row per turn.
 *
 * WHY IT EXISTS: On a laptop each founder's own paid plan funded their own
 *       spend. In the app one API key funds 130 founders across three sessions
 *       and a weekend. A runaway loop has to die inside the loop, not after a
 *       poll, so there are four layers and the first one is inside the SDK.
 *
 * CALLED BY: runner.ts (the meter, and the cap it passes to query()), queue.ts
 *       (admission), and the ops routes (the cohort breaker's state).
 * READS:  the spend ledger (SpendLedger port). WRITES: one spend row per turn,
 *       through that port.
 *
 * THE ONE RULE THAT MUST BE A CODE COMMENT, because getting it wrong double
 * counts by an order of magnitude:
 *
 *   SDKResultMessage.total_cost_usd is CUMULATIVE ACROSS TURNS in a streaming
 *   input session. Every result carries the running total for that query()
 *   call, not that turn's cost. So this turn's cost is
 *       total_cost_usd - the previous reading from the same run
 *   and the baseline resets to zero whenever a run is spawned, including a
 *   spawn with `resume`, because the SDK's own type declaration says a resumed
 *   session starts its counter fresh.
 *
 *   Summing total_cost_usd across results would bill a five turn conversation
 *   fifteen times over. That is the bug this comment exists to prevent.
 *
 * THE SECOND RULE, and it is the one that took the app down rather than the
 * money:
 *
 *   EVERY METHOD HERE NEEDS A DATABASE CONNECTION, AND spawnCapUsd IS CALLED
 *   FROM INSIDE A RUN. AgentRun.spawn awaits it before it calls query(). The
 *   turn used to hold an open transaction, and therefore a pooled connection,
 *   around that whole run. So one turn needed two connections: its own, and one
 *   more for this. At PGPOOL_MAX, its default of 10, ten concurrent turns held
 *   every connection and every one of them waited here for an eleventh that
 *   only frees when a turn ends. Measured against a real Postgres: 9 turns
 *   finished, 10 finished none in 25 seconds, 24 finished none.
 *
 *   storage/turn.ts is the fix. The turn is two short transactions with the run
 *   between them, and nothing is held while the model is talking, so this read
 *   borrows a connection and gives it straight back. Nothing in this file needs
 *   to change for that, and this note is here so nobody moves the read back
 *   inside a transaction believing it is free. The ledger implementation
 *   refuses that rather than hanging: see routes/spend-ledger.ts.
 */

import type { Logger, SpendLedger } from './ports.js';
import type { RouteId } from './types.js';

export interface BudgetConfig {
  /** Layer 1. The cap handed to one query() call at spawn. */
  readonly turnCapUsd: number;
  /** Layer 3. What one founder may spend in total before admission refuses. */
  readonly founderCapUsd: number;
  /** Layer 4. What the whole cohort may spend in one day. */
  readonly cohortDailyCapUsd: number;
}

/**
 * Layer 2, per run. One meter per query() object, and it is thrown away when
 * the run is. Constructed at every spawn, which is what makes the reset on
 * resume automatic rather than remembered.
 */
export class CostMeter {
  /** The last cumulative figure this run reported. Starts at zero on purpose. */
  private lastReading = 0;

  /**
   * Give it the cumulative figure off a result message. Get back what this
   * turn cost.
   *
   * A cumulative figure that went down means the run reset its own counter
   * under us, which the SDK documents happening on a mid session clear. Taking
   * the new figure whole is the safe reading: it can over count by at most one
   * turn, where treating it as a delta would produce a negative cost and a
   * credit in the ledger.
   */
  turnCost(cumulativeUsd: number): number {
    if (!Number.isFinite(cumulativeUsd) || cumulativeUsd < 0) return 0;
    const delta = cumulativeUsd - this.lastReading;
    this.lastReading = cumulativeUsd;
    return delta >= 0 ? delta : cumulativeUsd;
  }

  /** What this run has cost so far, by its own reckoning. For the run header. */
  runTotal(): number {
    return this.lastReading;
  }
}

export type Admission =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly code: AdmissionCode };

export type AdmissionCode = 'founder_cap' | 'cohort_cap';

export class Budget {
  constructor(
    private readonly cfg: BudgetConfig,
    private readonly ledger: SpendLedger,
    private readonly log: Logger,
  ) {}

  /**
   * Layer 1. What goes into options.maxBudgetUsd at spawn.
   *
   * Note what this cap actually governs. maxBudgetUsd is per query() call and
   * the cost it watches is cumulative, so on a long lived streaming session it
   * is a cap on the RUN, not on each turn inside it. That is not a reason to
   * loosen it. When it fires, the SDK ends the turn with subtype
   * error_max_budget_usd, session-pool retires the run, and the founder's next
   * message respawns with `resume` and a fresh window. The founder sees one
   * sentence and carries on. A runaway sees a wall inside the loop, which is
   * the whole point of layer 1.
   */
  async spawnCapUsd(founderId: string): Promise<number> {
    const spent = await this.ledger.spendToDate(founderId);
    const remaining = Math.max(0, this.cfg.founderCapUsd - spent);
    return Math.min(this.cfg.turnCapUsd, remaining);
  }

  /**
   * Layers 3 and 4. Called by the queue before a turn is admitted. A refusal
   * writes a turn_events row rather than returning a bare 429, so the reason
   * reaches the founder on the stream instead of leaving the UI to guess.
   */
  async admit(founderId: string): Promise<Admission> {
    const cohort = await this.ledger.cohortSpendToday();
    if (cohort >= this.cfg.cohortDailyCapUsd) {
      // The one that stops a bug billing 130 people at 3 am. It fires an alert
      // through the logger, because nobody is watching a dashboard at 3 am.
      this.log.error(
        { cohort, cap: this.cfg.cohortDailyCapUsd },
        'COHORT SPEND BREAKER TRIPPED, new turns refused',
      );
      return {
        ok: false,
        code: 'cohort_cap',
        reason:
          'The app has paused new work for everyone while we check something. Nothing you have made is affected. Message a mentor and we will tell you when it is back.',
      };
    }

    const spent = await this.ledger.spendToDate(founderId);
    if (spent >= this.cfg.founderCapUsd) {
      this.log.warn({ founderId, spent, cap: this.cfg.founderCapUsd }, 'founder cap reached');
      return {
        ok: false,
        code: 'founder_cap',
        reason:
          'You have used this much of the build allowance for your account. Everything you have made is safe and downloadable. Message a mentor and they will lift it.',
      };
    }

    return { ok: true };
  }

  /** Layer 2's write. One row per turn, with this turn's own cost. */
  async record(row: {
    readonly founderId: string;
    readonly turnId: string;
    readonly routeId: RouteId;
    readonly costUsd: number;
    readonly cacheReadTokens: number;
    /** Which turn of this run it was. Turn one never reads cache, later ones must. */
    readonly turnIndex: number;
  }): Promise<void> {
    await this.ledger.add({
      founderId: row.founderId,
      turnId: row.turnId,
      routeId: row.routeId,
      costUsd: row.costUsd,
      cacheReadTokens: row.cacheReadTokens,
    });

    // Assumption C2, asserted in production and not only in a runbook. The
    // system prompt plus the loaded skill is byte identical for ~65 founders on
    // a route, so from the second turn of any thread the cache must be reading.
    // Zero means something volatile is sitting in the cacheable prefix and the
    // cost model is wrong by roughly three times.
    if (row.turnIndex >= 2 && row.cacheReadTokens === 0) {
      this.log.error(
        { founderId: row.founderId, routeId: row.routeId, turnIndex: row.turnIndex },
        'PROMPT CACHE MISS on a later turn, check assemble.ts for a volatile prefix',
      );
    }
  }
}

/** Sums cacheReadInputTokens across every model a turn touched. See C2. */
export function cacheReadTokensOf(
  modelUsage: Readonly<Record<string, { cacheReadInputTokens?: number }>> | undefined,
): number {
  if (!modelUsage) return 0;
  let total = 0;
  for (const usage of Object.values(modelUsage)) {
    total += usage.cacheReadInputTokens ?? 0;
  }
  return total;
}
