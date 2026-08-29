/**
 * src/server/auth/rate-limit.ts
 *
 * WHAT THIS IS. Two limits on the sign in request endpoint. One per address,
 * counted in Postgres. One per client address, counted in memory.
 *
 * WHY IT EXISTS. `POST /auth/request` sends an email to anybody who names a
 * roster address. Without a limit, one script turns our mail domain into a
 * spam source aimed at 130 real people, and the founders it targets arrive on
 * event day with a mailbox full of sign in links and no idea which is live.
 *
 * WHY THE PER ADDRESS LIMIT IS IN POSTGRES. The process restarts. A limiter
 * held in memory resets with it, so the cheapest way past an in memory limit is
 * to wait for a deploy, and deploys happen during the fix window on the 24th.
 * The token rows are already the durable record that a request happened, so
 * counting them costs one indexed query and no new table.
 *
 * WHY THE PER CLIENT LIMIT IS NOT. There is no column anywhere for a client
 * address and adding one would put a personal identifier in a table that
 * currently holds none. This one is the weaker belt, and it is written down as
 * the weaker belt rather than presented as equal to the other.
 *
 * A LIMIT MUST NOT BE A PROBE. Exceeding either limit shows the same "check
 * your email" screen a real request shows. A distinct error would let somebody
 * work out which addresses are on the roster by watching which ones start
 * refusing.
 *
 * WHAT CALLS IT. ./magic-link.ts, before anything is sent.
 * WHAT IT READS. `signin_tokens`, through the AuthStore.
 * WHAT IT WRITES. Nothing durable. The in memory map only.
 */

import type { AuthStore, Clock } from './types.ts';

export interface RateLimitConfig {
  /** Requests one address may make inside the window. */
  readonly perEmail: number;
  /** Requests one client address may make inside the window. */
  readonly perClient: number;
  readonly windowMs: number;
}

/**
 * Five an hour per address is generous for a human and useless to a script.
 * A founder who does not receive the first email tries twice, walks to their
 * laptop, and tries once more. That is three.
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  perEmail: 5,
  perClient: 20,
  windowMs: 3_600_000,
};

export type RateVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly limit: 'email' | 'client' };

export class SigninRateLimiter {
  /** clientKey to the timestamps of its recent requests. Trimmed on read. */
  private readonly seen = new Map<string, number[]>();

  constructor(
    private readonly cfg: RateLimitConfig,
    private readonly store: AuthStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Ask before sending. Records the client address hit as a side effect of
   * being allowed, because a caller that has to remember to record separately
   * is a caller that will forget on one path.
   *
   * The durable per address count is not recorded here: inserting the token
   * rows is what records it, and that happens next in ./magic-link.ts. One
   * writer, so the count cannot drift from the thing it counts.
   */
  async check(email: string, clientKey: string): Promise<RateVerdict> {
    const now = this.clock.now().getTime();
    const since = new Date(now - this.cfg.windowMs);

    const already = await this.store.countSigninRequests(email, since);
    if (already >= this.cfg.perEmail) return { allowed: false, limit: 'email' };

    const stamps = this.recent(clientKey, now);
    if (stamps.length >= this.cfg.perClient) return { allowed: false, limit: 'client' };

    stamps.push(now);
    return { allowed: true };
  }

  /** For the ops screen, and so a test can prove the window actually rolls. */
  clientCount(clientKey: string): number {
    return this.recent(clientKey, this.clock.now().getTime()).length;
  }

  private recent(clientKey: string, now: number): number[] {
    const before = now - this.cfg.windowMs;
    const stamps = this.seen.get(clientKey) ?? [];
    while (stamps.length > 0 && (stamps[0] ?? 0) < before) stamps.shift();
    // The map is only ever written here, so an empty array is stored rather
    // than deleted: a founder retrying every ten minutes would otherwise
    // allocate a new array on every attempt for no gain.
    this.seen.set(clientKey, stamps);
    return stamps;
  }
}

/**
 * A wrong six digit code, counted per request.
 *
 * Not durable, and it does not need to be: the durable half of this defence is
 * that ./magic-link.ts burns the code row in Postgres once this returns false,
 * and a burned row cannot be guessed at after a restart either.
 */
export class CodeAttemptCounter {
  private readonly attempts = new Map<string, number>();

  constructor(private readonly max = 5) {}

  /** True while there are attempts left. False the moment there are not. */
  record(requestId: string): boolean {
    const next = (this.attempts.get(requestId) ?? 0) + 1;
    this.attempts.set(requestId, next);
    return next < this.max;
  }

  forget(requestId: string): void {
    this.attempts.delete(requestId);
  }
}
