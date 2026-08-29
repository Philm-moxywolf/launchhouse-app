/**
 * src/server/routes/turn-executor.ts
 *
 * WHAT THIS IS. Steps 4 and 5 of one founder message: admission, then the
 * queue. Everything it decides is reported as a `turn_events` row, so the
 * founder reads it on the stream they already have open.
 *
 * WHY IT EXISTS. Three failures.
 *
 *   A SILENT REFUSAL. The spend gate, the token bucket and the cohort breaker
 *   all refuse turns. Refused on the POST, the founder gets a status code and
 *   the interface invents a sentence for it. Refused here, they get the reason
 *   in the same place the answer would have appeared, and the turn is marked
 *   refused in the database rather than sitting at queued for ever looking like
 *   something that is still coming.
 *
 *   A SPINNER WITH NO NUMBER. A queued founder sees their place in line
 *   immediately, and again every time it moves. 130 people in a room, and "mine
 *   is stuck" is the support message that eats a session.
 *
 *   A TURN THAT THROWS AND SAYS NOTHING. Every path out of `run` ends with the
 *   turn in a terminal status and a frame on the stream. A turn left at
 *   `running` after the process moved on is a founder watching a cursor blink.
 *
 * WHAT CALLS IT. ./messages.ts, through the TurnExecutor port. Constructed by
 * src/server/index.ts with the real TurnQueue.
 *
 * WHAT IT READS. Nothing directly.
 * WHAT IT WRITES. `turns` status and `turn_events`, through the AppStore.
 */

import type { QueueLike } from './deps.ts';
import type { TurnEvents } from './events.ts';
import type { AppStore, Clock, Logger, TurnExecutor, TurnJob } from './ports.ts';

/**
 * The actual run: materialise, the model, harvest, commit. Injected because it
 * belongs to src/server/agent and src/server/storage, and because a route test
 * proving that a refusal reaches the stream must not need an API key.
 */
export type RunTurn = (job: TurnJob, signal: AbortSignal) => Promise<void>;

export class QueueTurnExecutor implements TurnExecutor {
  private readonly live = new Map<string, AbortController>();

  constructor(
    private readonly queue: QueueLike,
    private readonly events: TurnEvents,
    private readonly store: AppStore,
    private readonly clock: Clock,
    private readonly log: Logger,
    private readonly runTurn: RunTurn,
  ) {}

  submit(job: TurnJob): void {
    // Deliberately not awaited by the caller. The POST has already returned 202
    // and this is the work that follows it. Every failure inside is caught and
    // turned into a frame, so a rejected promise here can never be unhandled.
    void this.admitAndQueue(job);
  }

  async interrupt(turnId: string): Promise<boolean> {
    const controller = this.live.get(turnId);
    if (controller !== undefined) {
      controller.abort();
      return true;
    }
    // Not running. It may still be waiting, and a founder who presses stop on a
    // queued turn means stop, not "stop it once it starts".
    const cancelled = this.queue.cancel(turnId);
    if (cancelled) {
      await this.store.setTurnStatus(turnId, 'interrupted', this.clock.now());
    }
    return cancelled;
  }

  inFlight(): number {
    return this.queue.stats().running;
  }

  private async admitAndQueue(job: TurnJob): Promise<void> {
    try {
      const verdict = await this.queue.admit(job.founderId);
      if (!verdict.ok) {
        await this.store.setTurnStatus(job.turnId, 'refused', this.clock.now(), {
          code: verdict.code,
          detail: verdict.reason,
        });
        await this.events.refused({
          founderId: job.founderId,
          threadId: job.threadId,
          turnId: job.turnId,
          code: verdict.code,
          reason: verdict.reason,
        });
        this.log.warn({ turnId: job.turnId, code: verdict.code }, 'turn refused at admission');
        return;
      }

      this.queue.enqueue({
        turnId: job.turnId,
        founderId: job.founderId,
        threadId: job.threadId,
        priority: job.priority,
        run: () => this.execute(job),
        onQueued: (notice) => {
          // Fire and forget on purpose. A founder's place in line is worth
          // saying and not worth blocking the queue's own bookkeeping on.
          void this.events
            .queued({
              founderId: job.founderId,
              threadId: job.threadId,
              turnId: job.turnId,
              position: notice.position,
              text: notice.text,
            })
            .catch((err: unknown) => {
              this.log.error({ turnId: job.turnId, err: String(err) }, 'could not write the queued frame');
            });
        },
      });
    } catch (err) {
      await this.fail(job, 'admission_failed', err);
    }
  }

  private async execute(job: TurnJob): Promise<void> {
    const controller = new AbortController();
    this.live.set(job.turnId, controller);
    try {
      await this.store.setTurnStatus(job.turnId, 'running', this.clock.now());
      await this.runTurn(job, controller.signal);
      const status = controller.signal.aborted ? 'interrupted' : 'done';
      await this.store.setTurnStatus(job.turnId, status, this.clock.now());
      await this.events.emit({
        founderId: job.founderId,
        threadId: job.threadId,
        turnId: job.turnId,
        kind: 'turn_end',
        data: { turnId: job.turnId, status },
      });
    } catch (err) {
      await this.fail(job, 'turn_failed', err);
    } finally {
      this.live.delete(job.turnId);
    }
  }

  /**
   * One exit for every failure. The founder is told their work is safe first,
   * because that is the question being asked, and the detail goes to the log
   * rather than to the screen.
   */
  private async fail(job: TurnJob, code: string, err: unknown): Promise<void> {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    this.log.error({ turnId: job.turnId, founderId: job.founderId, code, detail }, 'turn failed');
    try {
      await this.store.setTurnStatus(job.turnId, 'failed', this.clock.now(), { code, detail });
      await this.events.refused({
        founderId: job.founderId,
        threadId: job.threadId,
        turnId: job.turnId,
        code,
        reason:
          'That one did not finish. Nothing you have made is affected. Send it again, and tell a mentor if it happens twice.',
      });
    } catch (writeErr) {
      // The database is where the record lives, so a failure to write the
      // failure is the end of what this process can do about it. Say so loudly
      // rather than throwing into a promise nobody is holding.
      this.log.error({ turnId: job.turnId, detail: String(writeErr) }, 'could not record a failed turn');
    }
  }
}

/**
 * The executor used when the agent loop is not wired into this deployment.
 *
 * FAIL CLOSED. It accepts the message, which is already durable, and then says
 * plainly that nothing will answer it. The alternative is a turn that sits at
 * queued for ever, which a founder reads as the app thinking about it.
 */
export function notWiredRun(reason: string): RunTurn {
  return () => Promise.reject(new Error(`the agent loop is not wired into this deployment: ${reason}`));
}
