/**
 * ports.ts
 *
 * WHAT: The seams between the agent module and everything it does not own:
 *       the database, the ge spawn wrapper, the storage turn, the generated
 *       skill bodies, the routing table and the clock.
 *
 * WHY IT EXISTS: Two reasons, and the second is the one that matters.
 *       First, src/server/agent/ is built alongside src/server/db/,
 *       src/server/ge/ and src/server/storage/ rather than after them, so it
 *       cannot import their concrete modules yet.
 *       Second, and permanently: a loop that reaches straight into Postgres and
 *       spawns processes cannot be tested without Postgres and processes, and a
 *       loop nobody can run a test against is a loop nobody proves. Every unit
 *       in this folder takes its dependencies as arguments, so every unit has a
 *       test that runs on a laptop with no database and no API key.
 *
 * CALLED BY: every file in src/server/agent/. Wired for real in ./index.ts.
 * READS:  nothing. WRITES: nothing. Interfaces only.
 */

import type {
  FileFact,
  FounderContext,
  GateFact,
  RouteId,
  RouteTable,
  Track,
} from './types.js';

/**
 * The generated skill bodies. scripts/gen-skill-prompts.ts reads
 * app/content/skills/<name>/SKILL.md at build time, strips the frontmatter and
 * emits a typed map. Read at build time and not at run time on purpose: a
 * founder's turn must never be able to fail because a file read failed.
 */
export interface SkillBodies {
  /** Returns the raw body, track blocks still in place. Throws if unknown. */
  get(skill: string): string;
  /** Every key, so the router can refuse a route whose skill is missing. */
  keys(): readonly string[];
}

/** The routing table from app/content/routes.ts, injected rather than imported. */
export interface RouteCatalogue {
  all(): RouteTable;
}

/**
 * The ge spawn wrapper, src/server/ge/run.ts. The agent module never spawns a
 * process itself. It hands an argv array to this and reads the exit code back.
 *
 * The exit contract is ge's own and is load bearing: 0 did it, 1 refused and
 * said why in founder prose, 2 no such person. Section 5 turns 2 into an offer
 * to add them, which is only possible because ge distinguishes it from 1.
 */
export interface GeRunner {
  run(
    founderId: string,
    argv: readonly string[],
    opts?: { readonly timeoutMs?: number },
  ): Promise<GeResult>;
}

export interface GeResult {
  readonly exitCode: 0 | 1 | 2 | number;
  readonly stdout: string;
  /** ge writes its refusals here, already in founder prose with a recovery line. */
  readonly stderr: string;
  /** True when the wrapper had to kill it. Section 5: 10 seconds, then SIGTERM. */
  readonly timedOut: boolean;
}

/**
 * What the run header needs to be true. Built from the same index the Files
 * screen renders, so the screen and the model cannot disagree about what a
 * founder has.
 */
export interface RunFacts {
  /**
   * Track read fresh from founder-brain.md. The file wins over the column.
   *
   * NULL MEANS NOT CHOSEN YET, AND IT HAD TO BECOME EXPRESSIBLE. Rule 1 says the
   * fork happens once, in the Founder Brain, and the build document's first run
   * screen says out loud that setup does not ask for it. So every founder's very
   * first run is a run with no track, and this type used to have no way to say
   * so. What it said instead was `b2b`, because that was the only value to hand,
   * and the run header then told the model "Track: b2b. Never write or mention
   * material belonging to a track other than the one above" to a founder who had
   * not answered the question. Roughly half the cohort would have been
   * interviewed as the wrong kind of business on the one run that decides it.
   *
   * With null, assemble.ts keeps both branches of the intake and says plainly
   * that the answer is still open. See src/server/routes/agent-content.ts, which
   * predicted this exact change and can now have its `#unforked` twin deleted.
   */
  readonly track: Track | null;
  readonly files: readonly FileFact[];
  /** Files this route is expected to produce that do not exist yet. */
  readonly absent: readonly string[];
  readonly gates: readonly GateFact[];
  /** Today in the founder's own timezone, already formatted. */
  readonly today: string;
}

export interface FactsSource {
  factsFor(ctx: FounderContext, routeId: RouteId): Promise<RunFacts>;
}

/**
 * Transcript mirroring, backing Options.sessionStore. The table is
 * transcript_entries(session_id, seq, uuid, entry) and belongs to src/server/db.
 * `uuid` is the idempotency key, so a retried batch cannot duplicate a row.
 */
export interface TranscriptStore {
  append(
    projectKey: string,
    sessionId: string,
    subpath: string | undefined,
    entries: readonly Record<string, unknown>[],
  ): Promise<void>;
  load(
    projectKey: string,
    sessionId: string,
    subpath: string | undefined,
  ): Promise<Record<string, unknown>[] | null>;
  /** Subagent transcripts. There are none today, because Task is disallowed. */
  listSubkeys(projectKey: string, sessionId: string): Promise<string[]>;
}

/**
 * The spend ledger, src/server/db. `add` is called once per turn with that
 * turn's own cost, already differenced. Never with a cumulative figure.
 */
export interface SpendLedger {
  /** Total spend for one founder, in USD, across every turn they have run. */
  spendToDate(founderId: string): Promise<number>;
  /** Total spend across the cohort today. Feeds the cohort breaker. */
  cohortSpendToday(): Promise<number>;
  add(row: {
    readonly founderId: string;
    readonly turnId: string;
    readonly routeId: RouteId;
    readonly costUsd: number;
    readonly cacheReadTokens: number;
  }): Promise<void>;
}

/** Structured logging. pino in production, a collector in tests. */
export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Injected so tests do not sleep and so the clock can be wound forward. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): { cancel(): void };
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    // The VM must be able to shut down with idle timers pending.
    if (typeof t.unref === 'function') t.unref();
    return { cancel: () => clearTimeout(t) };
  },
};
