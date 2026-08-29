/**
 * src/server/routes/events.ts
 *
 * WHAT THIS IS. The one way a turn says anything to a founder: write a
 * `turn_events` row, then hand the same row to whoever is listening on that
 * thread.
 *
 * WHY IT EXISTS. Durable first, then the socket, and in that order.
 *
 *   A frame that reached a browser but is not in `turn_events` cannot be
 *   replayed. The browser drops at second 40 of a 90 second turn, reconnects
 *   with Last-Event-ID, and the answer it already half received is gone. So
 *   nothing is published until the database has given it an id, and that id is
 *   the SSE `id:` field.
 *
 *   And a refusal has to arrive on the stream. The spend gate, the token bucket
 *   and the cohort breaker all refuse turns, and a bare 429 on some other
 *   connection is a status code the interface has to guess a sentence for. A
 *   refusal written here arrives in the same place the answer would have, with
 *   the reason in it, which is why the founder reads a sentence instead of
 *   watching nothing happen.
 *
 * WHAT CALLS IT. ./messages.ts on admission, the turn executor throughout a
 * run, and ./stream.ts subscribes.
 *
 * WHAT IT READS. Nothing. WHAT IT WRITES. `turn_events`, through the AppStore.
 */

import type { AppStore, Clock, EventKind, TurnEventRow } from './ports.ts';

export type Listener = (row: TurnEventRow) => void;

/**
 * In process fan out, per thread.
 *
 * In process is the right size for 130 founders on one VM. Section 4 says what
 * two VMs would need, and it is a sticky route by founder id plus the queue in
 * Postgres. That is written down so nobody paints themselves in, not so it gets
 * built now.
 */
export class TurnEventBus {
  private readonly byThread = new Map<string, Set<Listener>>();

  subscribe(threadId: string, listener: Listener): () => void {
    const set = this.byThread.get(threadId) ?? new Set<Listener>();
    set.add(listener);
    this.byThread.set(threadId, set);
    return () => {
      set.delete(listener);
      // An empty Set left behind for every thread a founder ever opened is a
      // slow leak on a process meant to stay up across a three day event.
      if (set.size === 0) this.byThread.delete(threadId);
    };
  }

  publish(row: TurnEventRow): void {
    const set = this.byThread.get(row.threadId);
    if (set === undefined) return;
    // Copied before iterating: a listener that unsubscribes itself on the frame
    // it just received would otherwise mutate the set mid loop.
    for (const listener of [...set]) listener(row);
  }

  listenerCount(threadId: string): number {
    return this.byThread.get(threadId)?.size ?? 0;
  }
}

export class TurnEvents {
  constructor(
    private readonly store: AppStore,
    private readonly bus: TurnEventBus,
    private readonly clock: Clock,
  ) {}

  async emit(args: {
    founderId: string;
    threadId: string;
    turnId: string;
    kind: EventKind;
    data: Record<string, unknown>;
  }): Promise<TurnEventRow> {
    const row = await this.store.appendTurnEvent({
      turnId: args.turnId,
      threadId: args.threadId,
      founderId: args.founderId,
      kind: args.kind,
      data: args.data,
      at: this.clock.now(),
    });
    this.bus.publish(row);
    return row;
  }

  /**
   * A queued founder sees a number, immediately. Never a spinner with no
   * number: 130 people in a room, and "mine is stuck" is the support message
   * that eats a session.
   *
   * The text is written by the queue, which is the only thing that knows how
   * long recent turns actually took. Nothing here invents a time.
   */
  queued(args: { founderId: string; threadId: string; turnId: string; position: number; text: string }): Promise<TurnEventRow> {
    return this.emit({
      founderId: args.founderId,
      threadId: args.threadId,
      turnId: args.turnId,
      kind: 'queued',
      data: { turnId: args.turnId, position: args.position, text: args.text },
    });
  }

  /** A refusal, in the founder's own words, on the stream where the answer would have been. */
  refused(args: {
    founderId: string;
    threadId: string;
    turnId: string;
    code: string;
    reason: string;
  }): Promise<TurnEventRow> {
    return this.emit({
      founderId: args.founderId,
      threadId: args.threadId,
      turnId: args.turnId,
      kind: 'error',
      data: { turnId: args.turnId, code: args.code, message: args.reason },
    });
  }
}
