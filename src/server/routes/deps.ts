/**
 * src/server/routes/deps.ts
 *
 * WHAT THIS IS. The one bag of dependencies every route file in this folder
 * takes, and the queue shape the turn executor needs.
 *
 * WHY IT EXISTS. So there is exactly one list of what the HTTP layer depends
 * on. A route that reaches for a module directly is a route that cannot be run
 * in a test, and the four properties this build has to prove are properties of
 * these routes: one founder never sees another's workspace, an address that is
 * not on the roster is refused, a double sent message is stored once, and a
 * queued founder is given a number. None of those can be proved against code
 * that imports Postgres at the top of the file.
 *
 * WHAT CALLS IT. Every file in src/server/routes/. Filled in by
 * src/server/index.ts.
 *
 * WHAT IT READS AND WRITES. Nothing. Types only.
 */

import type { AuthContext } from '../auth/plugin.ts';
import type { TurnEvents, TurnEventBus } from './events.ts';
import type { AppStore, Clock, IdSource, Logger, TurnExecutor, TurnPriority } from './ports.ts';

export interface RouteDeps {
  readonly store: AppStore;
  readonly auth: AuthContext;
  readonly events: TurnEvents;
  readonly bus: TurnEventBus;
  readonly executor: TurnExecutor;
  readonly clock: Clock;
  readonly log: Logger;
  readonly ids: IdSource;
  /**
   * SSE_HEARTBEAT_MS. FIFTEEN SECONDS IS A GUESS until the Step 0 probe
   * measures the Replit proxy's real idle timeout. It must sit comfortably
   * under the measured value, and the measurement has not been taken.
   */
  readonly heartbeatMs: number;
  readonly maxMessageBytes: number;
}

/**
 * The part of the agent's TurnQueue the executor uses.
 *
 * Structural rather than an import of the class, so a test can drive the
 * executor with a queue three lines long, and so this folder does not build a
 * Budget and a session pool to prove that a refusal reaches the stream.
 * src/server/index.ts assigns the real TurnQueue to this, which is where the
 * two are checked against each other.
 */
export interface QueueLike {
  admit(founderId: string): Promise<{ ok: true } | { ok: false; code: string; reason: string }>;
  enqueue(item: {
    turnId: string;
    founderId: string;
    threadId: string;
    priority: TurnPriority;
    run: () => Promise<void>;
    onQueued: (notice: { position: number; text: string }) => void;
  }): void;
  cancel(turnId: string): boolean;
  stats(): { running: number; waiting: number };
}
