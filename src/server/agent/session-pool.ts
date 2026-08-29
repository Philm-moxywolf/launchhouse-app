/**
 * session-pool.ts
 *
 * WHAT: Holds the live AgentRun objects, one per thread, and decides when a
 *       founder's next message costs a spawn and when it costs nothing.
 *
 * WHY IT EXISTS: Closing a tab kills the SSE connection, not the run. A founder
 *       who shuts their laptop mid Founder Brain, walks to lunch and comes back
 *       must land back in the same conversation. That is three different
 *       situations wearing one coat, and they need three different answers:
 *
 *         Tab closed, run still live.   Nothing to resume. Reconnect the stream
 *                                       and replay from turn_events.
 *         Run evicted, same machine.    Spawn again with resume: <session id>.
 *                                       Costs about a second.
 *         Cold container.               The transcript went with the container.
 *                                       The session store may have it. If not,
 *                                       seed from the thread digest, which is
 *                                       built from the founder's own files.
 *
 *       The other reason is memory. Every live session is a spawned CLI
 *       subprocess held between turns. Sixty of them idle is a number to be
 *       measured, not assumed, and until it is measured the ceiling is what
 *       stops one busy afternoon taking the VM down with 130 people in a room.
 *
 * CALLED BY: the route layer, through queue.ts.
 * READS:  threads.sdk_session_id, handed in by the caller. WRITES: nothing.
 *       Everything durable is written by the runner's caller.
 */

import { AgentRun, type RunnerDeps, type StartOptions } from './runner.js';
import type { Clock, Logger } from './ports.js';
import type { FounderContext, RouteRow } from './types.js';

export interface PoolConfig {
  /** Subprocesses held idle. Above this, the oldest idle one is retired. */
  readonly maxLiveSessions: number;
  /** Ten minutes with no turn and the subprocess is torn down. */
  readonly sessionIdleMs: number;
  /** How often the idle sweep runs. */
  readonly sweepEveryMs: number;
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxLiveSessions: 60,
  sessionIdleMs: 600_000,
  sweepEveryMs: 30_000,
};

interface Live {
  readonly run: AgentRun;
  readonly threadId: string;
}

export class SessionPool {
  private readonly live = new Map<string, Live>();
  private sweeper: { cancel(): void } | null = null;

  constructor(
    private readonly cfg: PoolConfig,
    private readonly deps: RunnerDeps,
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {}

  /** Starts the idle sweep. Call once at boot. */
  start(): void {
    if (this.sweeper) return;
    const tick = (): void => {
      void this.sweepIdle();
      this.sweeper = this.clock.setTimeout(tick, this.cfg.sweepEveryMs);
    };
    this.sweeper = this.clock.setTimeout(tick, this.cfg.sweepEveryMs);
  }

  async stop(): Promise<void> {
    this.sweeper?.cancel();
    this.sweeper = null;
    const all = [...this.live.values()];
    this.live.clear();
    await Promise.all(all.map((l) => l.run.close()));
  }

  /**
   * The run for one thread. Returns the live one when there is a live one, and
   * spawns otherwise. The caller does not need to know which happened, which is
   * the point: the three resume cases are handled here and only here.
   */
  async acquire(
    threadId: string,
    ctx: FounderContext,
    route: RouteRow,
    opts: Omit<StartOptions, 'ctx' | 'route'>,
  ): Promise<{ readonly run: AgentRun; readonly startOptions: StartOptions }> {
    const existing = this.live.get(threadId);
    if (existing && !existing.run.isClosed) {
      // Case one. The common case, and it costs nothing.
      return {
        run: existing.run,
        startOptions: { ctx, route, ...opts },
      };
    }
    if (existing) this.live.delete(threadId);

    await this.makeRoom();

    const run = new AgentRun(this.deps, ctx, route);
    this.live.set(threadId, { run, threadId });
    this.log.info(
      {
        founderId: ctx.founderId,
        threadId,
        routeId: route.id,
        // Which of the three cases this was, as a logged fact rather than an
        // inference from timing.
        resume: opts.resumeSessionId ? 'session-id' : opts.seed ? 'digest' : 'fresh',
        live: this.live.size,
      },
      'session acquired',
    );
    return { run, startOptions: { ctx, route, ...opts } };
  }

  /** The stop button. Finds the run for a thread and interrupts it. */
  async interrupt(threadId: string): Promise<boolean> {
    const live = this.live.get(threadId);
    if (!live || live.run.isClosed) return false;
    await live.run.interrupt();
    return true;
  }

  /** The session id to hand back to `resume` next time. Persist it per turn. */
  sessionIdOf(threadId: string): string | null {
    return this.live.get(threadId)?.run.sdkSessionId ?? null;
  }

  stats(): { readonly live: number; readonly busy: number } {
    let busy = 0;
    for (const l of this.live.values()) if (l.run.isBusy) busy += 1;
    return { live: this.live.size, busy };
  }

  /**
   * Evict the oldest idle run when the pool is full. The session id survives
   * in Postgres, so the founder's next message resumes rather than restarts.
   * A busy run is never evicted, however old, because evicting one throws away
   * a turn a founder is watching.
   */
  private async makeRoom(): Promise<void> {
    while (this.live.size >= this.cfg.maxLiveSessions) {
      const victim = this.oldestIdle();
      if (!victim) {
        // Every live session is busy. Refusing here rather than spawning past
        // the ceiling: the queue's concurrency limit should have prevented it,
        // so this is a loud signal that the two numbers disagree.
        this.log.error(
          { live: this.live.size, cap: this.cfg.maxLiveSessions },
          'session pool full and every run is busy',
        );
        throw new Error('session pool full');
      }
      this.live.delete(victim.threadId);
      this.log.info({ threadId: victim.threadId }, 'session evicted to make room');
      await victim.run.close();
    }
  }

  private oldestIdle(): Live | null {
    let oldest: Live | null = null;
    for (const l of this.live.values()) {
      if (l.run.isBusy) continue;
      if (!oldest || l.run.lastActivityAt < oldest.run.lastActivityAt) oldest = l;
    }
    return oldest;
  }

  /** Ten minutes with no turn and the subprocess is not worth holding. */
  private async sweepIdle(): Promise<void> {
    const cutoff = this.clock.now() - this.cfg.sessionIdleMs;
    const stale: Live[] = [];
    for (const l of this.live.values()) {
      if (l.run.isClosed) {
        stale.push(l);
        continue;
      }
      if (!l.run.isBusy && l.run.lastActivityAt < cutoff) stale.push(l);
    }
    for (const l of stale) {
      this.live.delete(l.threadId);
      await l.run.close().catch(() => undefined);
    }
    if (stale.length > 0) {
      this.log.info({ retired: stale.length, live: this.live.size }, 'idle sessions retired');
    }
  }
}
