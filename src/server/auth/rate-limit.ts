/**
 * src/server/auth/rate-limit.ts
 *
 * WHAT THIS IS. What stops somebody guessing the passphrase. Two limits with
 * two different jobs, kept apart because they have two different failure modes.
 *
 * WHY IT EXISTS. This app is one founder's business on a public web address.
 * Replit publishes a deployment at a guessable name and the founder will paste
 * that link into Slack. The sign in form is the whole of the defence, so the
 * form has to cost something to get wrong.
 *
 * THE FIRST LIMIT IS PER CLIENT AND IT REFUSES. Ten wrong tries from one
 * address inside fifteen minutes and that address is refused for the rest of
 * the window. Held in memory, because there is no column anywhere for a client
 * address and adding one would put a personal identifier in a table that
 * currently holds none.
 *
 * IT IS THE WEAKER HALF AND IT IS WORTH SAYING WHY, TWICE. It resets on a
 * restart, so waiting for a redeploy steps around it. And the client key is
 * `request.ip`, which on this deployment comes from X-Forwarded-For because
 * Replit terminates TLS in front of the process and Fastify is started with
 * `trustProxy: true`. That header is written by whoever is calling, so anybody
 * determined enough rotates it and never meets this limit at all. It is worth
 * having: it costs nothing and it stops the ordinary case, which is a script
 * that does not bother. It is not worth trusting on its own, and the second
 * limit is the one that holds when it is stepped around.
 *
 * THE SECOND LIMIT IS DEPLOYMENT WIDE AND IT SLOWS DOWN. It counts every wrong
 * answer whatever address it claims to come from, so a rotated header does not
 * escape it. It never refuses, and that is the important design decision in
 * this file.
 *
 *   A deployment wide lockout would be a stranger's denial of service. Anybody
 *   who found the URL could hammer it for a minute and lock the founder out of
 *   their own app during a live session, in a room, with a mentor. That trade
 *   is the wrong way round: this app has exactly one user and their being able
 *   to get in matters more than an attacker being stopped one minute sooner.
 *
 *   So past the threshold every wrong answer is made to wait before it is
 *   answered, and the wait is bounded. A guesser goes from thousands of
 *   attempts a minute to a handful. The founder, who is not the one generating
 *   the failures and is usually not even on the same address, either sees
 *   nothing or waits two seconds once.
 *
 * IT IS COUNTED IN POSTGRES, from the audit lines that already exist. The
 * process restarts, so a counter held in memory resets with it, and the
 * cheapest way past an in memory limit is to wait for a redeploy. Redeploys
 * happen. The count is one indexed query and it needs no new table.
 *
 * WHAT CALLS IT. ./owner.ts, on every sign in attempt.
 * WHAT IT READS. `ge_event`, through the AuthStore, in ./owner.ts.
 * WHAT IT WRITES. Nothing durable. The in memory map only.
 */

import type { Clock } from './types.ts';

export interface AttemptLimitConfig {
  /** Wrong tries one client address may make inside the window before it is refused. */
  readonly perClient: number;
  readonly windowMs: number;
  /** Wrong tries across the whole deployment inside the window before answers slow down. */
  readonly slowAfter: number;
  /** How long a slowed answer waits. Bounded, and never applied to a correct passphrase. */
  readonly slowByMs: number;
}

/**
 * Ten wrong tries in fifteen minutes is generous for somebody typing a
 * passphrase from memory on a phone, and useless to a script.
 *
 * A founder who genuinely cannot remember it does not need an eleventh try.
 * They need the sentence on the screen telling them to open Replit Secrets and
 * read it, and that sentence is on every one of these screens.
 */
export const DEFAULT_ATTEMPT_LIMIT: AttemptLimitConfig = {
  perClient: 10,
  windowMs: 900_000,
  slowAfter: 20,
  slowByMs: 2_000,
};

export type AttemptVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterMs: number };

export class SigninAttempts {
  /** clientKey to the timestamps of its recent WRONG answers. Trimmed on read. */
  private readonly wrong = new Map<string, number[]>();

  constructor(
    private readonly cfg: AttemptLimitConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * May this client try at all.
   *
   * Reads and does not record. Only a wrong answer is counted, so a founder who
   * signs in, signs out and signs in again is never anywhere near the limit,
   * and every attempt an attacker makes is counted because every one of them is
   * wrong.
   *
   * `retryAfterMs` is returned rather than a bare no, because the screen has to
   * end on an action and "try again" with no time on it is not one.
   */
  check(clientKey: string): AttemptVerdict {
    const now = this.clock.now().getTime();
    const stamps = this.recent(clientKey, now);
    if (stamps.length < this.cfg.perClient) return { allowed: true };
    const oldest = stamps[0] ?? now;
    // When the oldest wrong answer falls out of the window there is room again.
    return { allowed: false, retryAfterMs: Math.max(0, oldest + this.cfg.windowMs - now) };
  }

  recordWrong(clientKey: string): void {
    const now = this.clock.now().getTime();
    this.recent(clientKey, now).push(now);
  }

  /** A correct passphrase clears the count, so one bad morning does not follow the founder around. */
  forget(clientKey: string): void {
    this.wrong.delete(clientKey);
  }

  /** For a test, and for the ops screen, so the window can be proved to roll. */
  wrongCount(clientKey: string): number {
    return this.recent(clientKey, this.clock.now().getTime()).length;
  }

  /**
   * How long to wait before answering, given how many wrong answers this whole
   * deployment has had inside the window.
   *
   * Deliberately not a multiplier. A wait that grows with the count is a wait
   * that eventually locks the founder out by accident, which is the thing this
   * file exists not to do.
   */
  slowdownMs(deploymentWideFailures: number): number {
    return deploymentWideFailures >= this.cfg.slowAfter ? this.cfg.slowByMs : 0;
  }

  /** The start of the window, for the durable count. */
  windowStart(): Date {
    return new Date(this.clock.now().getTime() - this.cfg.windowMs);
  }

  private recent(clientKey: string, now: number): number[] {
    const before = now - this.cfg.windowMs;
    const stamps = this.wrong.get(clientKey) ?? [];
    while (stamps.length > 0 && (stamps[0] ?? 0) < before) stamps.shift();
    // The map is only ever written here, so an empty array is stored rather
    // than deleted: a founder retrying every ten minutes would otherwise
    // allocate a new array on every attempt for no gain.
    this.wrong.set(clientKey, stamps);
    return stamps;
  }
}
