/**
 * queue.ts
 *
 * WHAT: Admission and scheduling for turns. Two priority classes, a token
 *       bucket per founder, one concurrent turn per founder, and a hard ceiling
 *       on concurrent runs across the VM.
 *
 * WHY IT EXISTS: The worst realistic burst is one cohort of about 65 people
 *       told "now run the Founder Brain" in the same minute. The constraint is
 *       not the API, it is that every live session is a spawned CLI
 *       subprocess. Without a ceiling the VM runs out of memory and everybody's
 *       session dies at once, in a room, during a live session.
 *
 *       The priority split is the other half. High is the next turn of a thread
 *       that already has turns, meaning somebody mid interview. Normal is the
 *       first turn of a new thread. High beats normal, because otherwise a
 *       stampede of new starts strands 30 people halfway through an interview,
 *       which is the worst thing that can happen while 130 people are watching.
 *
 * CALLED BY: the route layer, on POST /api/threads/:id/messages.
 * READS:  the budget (for the spend gate). WRITES: nothing durable itself. The
 *       caller writes the turns row; this schedules against it, and on boot the
 *       caller replays queued rows back in through restore().
 *
 * Every message in here is founder facing, so: short sentences, no jargon, and
 * never a promise about time we cannot keep. That is the same discipline as
 * never promising a reply rate, applied to a queue.
 */

import type { Budget } from './budget.js';
import type { Clock, Logger } from './ports.js';

export interface QueueConfig {
  /** Section 4 starts at 24. Tune from measured resident memory, see B11. */
  readonly maxConcurrentRuns: number;
  /** Token bucket, per founder. Catches a looping client. */
  readonly turnsPerHour: number;
  readonly turnsPerDay: number;
  /**
   * Below this many people ahead, say nothing about time. Above it, say
   * something realistic and suggest coming back.
   */
  readonly longQueueThreshold: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrentRuns: 24,
  turnsPerHour: 30,
  turnsPerDay: 200,
  longQueueThreshold: 8,
};

export type Priority = 'high' | 'normal';

export interface QueueItem {
  readonly turnId: string;
  readonly founderId: string;
  readonly threadId: string;
  /** high: the thread already has turns. normal: it is the first one. */
  readonly priority: Priority;
  /** Does the work. Resolves when the turn is finished, either way. */
  readonly run: () => Promise<void>;
  /** Called with the founder's place in line, and again every time it moves. */
  readonly onQueued: (notice: QueuedNotice) => void;
}

export interface QueuedNotice {
  readonly position: number;
  readonly text: string;
}

export type AdmissionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly reason: string };

/** One founder's token bucket. Two windows, because a loop can be slow. */
interface Bucket {
  readonly hour: number[];
  readonly day: number[];
}

export class TurnQueue {
  private readonly pending: QueueItem[] = [];
  private readonly running = new Set<string>();
  private readonly runningByFounder = new Set<string>();
  private readonly buckets = new Map<string, Bucket>();
  /** Rolling wall clock of recent turns, so any time we quote is measured. */
  private readonly recentDurations: number[] = [];

  constructor(
    private readonly cfg: QueueConfig,
    private readonly budget: Budget,
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {}

  /**
   * Step 4 of a founder message. Spend gate, then token bucket. The per
   * founder single flight is NOT a refusal here: a founder typing a second
   * sentence while the first is still running is normal conversation, and
   * refusing it would be the app calling a founder a stuck client. It is
   * enforced in the scheduler instead, so the second turn waits rather than
   * failing. Genuine double sends are already impossible: the unique index on
   * (thread_id, client_msg_id) catches a retry before it reaches here.
   */
  async admit(founderId: string): Promise<AdmissionResult> {
    const spend = await this.budget.admit(founderId);
    if (!spend.ok) return { ok: false, code: spend.code, reason: spend.reason };

    const now = this.clock.now();
    const bucket = this.bucketFor(founderId, now);
    if (bucket.hour.length >= this.cfg.turnsPerHour) {
      this.log.warn({ founderId }, 'token bucket, hourly');
      return {
        ok: false,
        code: 'rate_hour',
        reason:
          'That is a lot of messages in one hour. Give it a few minutes and try again. Nothing you have made is affected.',
      };
    }
    if (bucket.day.length >= this.cfg.turnsPerDay) {
      this.log.warn({ founderId }, 'token bucket, daily');
      return {
        ok: false,
        code: 'rate_day',
        reason:
          'You have hit the limit for today. Everything you have made is safe and downloadable. Message a mentor if you need more.',
      };
    }

    bucket.hour.push(now);
    bucket.day.push(now);
    return { ok: true };
  }

  /**
   * Step 5. Runs now if a slot is free, otherwise takes a place in line and
   * tells the founder which place, immediately. Never a spinner with no number:
   * 130 people in a room, and "mine is stuck" is the support message that eats
   * a session.
   */
  enqueue(item: QueueItem): void {
    this.insertByPriority(item);
    this.pump();
    // Only tell them they are waiting if they still are after the pump.
    if (this.pending.includes(item)) this.notifyPositions();
  }

  /** Boot path. The turns table is the record; this puts them back in line. */
  restore(items: readonly QueueItem[]): void {
    for (const item of items) this.insertByPriority(item);
    this.log.info({ restored: items.length }, 'queue restored from turns table');
    this.pump();
    this.notifyPositions();
  }

  /** For the ops screen and for the load rehearsal. */
  stats(): { readonly running: number; readonly waiting: number } {
    return { running: this.running.size, waiting: this.pending.length };
  }

  /** A founder closed the tab and their queued turn is no longer wanted. */
  cancel(turnId: string): boolean {
    const at = this.pending.findIndex((i) => i.turnId === turnId);
    if (at === -1) return false;
    this.pending.splice(at, 1);
    this.notifyPositions();
    return true;
  }

  // ------------------------------------------------------------- scheduling

  private insertByPriority(item: QueueItem): void {
    if (item.priority === 'normal') {
      this.pending.push(item);
      return;
    }
    // High goes behind the last high and in front of every normal, so high is
    // still FIFO among itself. Without that, the newest interviewer jumps the
    // one who has been waiting longest, and fairness was the point.
    let at = this.pending.length;
    for (let i = 0; i < this.pending.length; i += 1) {
      if (this.pending[i]?.priority === 'normal') {
        at = i;
        break;
      }
    }
    this.pending.splice(at, 0, item);
  }

  private pump(): void {
    for (let i = 0; i < this.pending.length; ) {
      if (this.running.size >= this.cfg.maxConcurrentRuns) return;
      const item = this.pending[i];
      if (!item) return;
      // Per founder single flight. Skip past them rather than stopping the
      // whole queue, or one busy founder blocks everybody behind them.
      if (this.runningByFounder.has(item.founderId)) {
        i += 1;
        continue;
      }
      this.pending.splice(i, 1);
      this.start(item);
    }
  }

  private start(item: QueueItem): void {
    this.running.add(item.turnId);
    this.runningByFounder.add(item.founderId);
    const startedAt = this.clock.now();

    void item
      .run()
      .catch((err: unknown) => {
        // A throw out of run() has already been turned into a founder facing
        // error frame by the runner. Reaching here means the runner itself
        // failed, which is a server fault and is logged as one.
        this.log.error(
          { turnId: item.turnId, err: String(err) },
          'turn threw out of the runner',
        );
      })
      .finally(() => {
        this.running.delete(item.turnId);
        this.runningByFounder.delete(item.founderId);
        this.recordDuration(this.clock.now() - startedAt);
        this.pump();
        this.notifyPositions();
      });
  }

  // ---------------------------------------------------------------- notices

  private notifyPositions(): void {
    for (let i = 0; i < this.pending.length; i += 1) {
      const item = this.pending[i];
      if (!item) continue;
      const position = i + 1;
      item.onQueued({ position, text: this.noticeText(position) });
    }
  }

  /**
   * The words a waiting founder reads. A time is quoted only when we have
   * measured enough turns to have one, and even then it is stated as a usual
   * case rather than a promise.
   */
  private noticeText(position: number): string {
    const place = `You are ${ordinal(position)} in line.`;
    const held = 'Leave this page open or come back later. Your place is held.';
    const estimate = this.estimateText(position);
    if (position >= this.cfg.longQueueThreshold) {
      const busy = 'It is busy right now.';
      return estimate
        ? `${place} ${busy} ${estimate} There is nothing to do here while you wait, so go and do something else and come back. Your place is held.`
        : `${place} ${busy} There is nothing to do here while you wait, so go and do something else and come back. Your place is held.`;
    }
    return estimate ? `${place} ${estimate} ${held}` : `${place} ${held}`;
  }

  /** Null until there is real data. We do not guess at a wait. */
  private estimateText(position: number): string | null {
    if (this.recentDurations.length < 5) return null;
    const sorted = [...this.recentDurations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const slots = Math.max(1, this.cfg.maxConcurrentRuns);
    const ms = (Math.ceil(position / slots) * median);
    const minutes = Math.max(1, Math.round(ms / 60000));
    return minutes === 1
      ? 'This usually clears in about a minute.'
      : `This usually clears in about ${minutes} minutes.`;
  }

  private recordDuration(ms: number): void {
    this.recentDurations.push(ms);
    if (this.recentDurations.length > 50) this.recentDurations.shift();
  }

  private bucketFor(founderId: string, now: number): Bucket {
    let bucket = this.buckets.get(founderId);
    if (!bucket) {
      bucket = { hour: [], day: [] };
      this.buckets.set(founderId, bucket);
    }
    prune(bucket.hour, now - 3_600_000);
    prune(bucket.day, now - 86_400_000);
    return bucket;
  }
}

function prune(stamps: number[], before: number): void {
  while (stamps.length > 0 && (stamps[0] ?? 0) < before) stamps.shift();
}

/** 1st, 2nd, 3rd, 7th. Plain English, because a founder reads it. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
