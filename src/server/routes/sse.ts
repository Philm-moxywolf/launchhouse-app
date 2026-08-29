/**
 * src/server/routes/sse.ts
 *
 * WHAT THIS IS. The wire format of one server sent event, the heartbeat, and
 * the small state machine that gets a browser from "I missed some" back to
 * live without a gap and without a repeat.
 *
 * WHY IT EXISTS. Four failures, and three of them are invisible until an event
 * day.
 *
 *   THE GAP. Between replaying what a browser missed and subscribing to what
 *   comes next there is a window, and a frame that lands inside it is lost for
 *   good. So the subscription is opened FIRST, into a buffer, then the replay
 *   runs, then the buffer is drained skipping anything the replay already sent.
 *   Getting this the obvious way round loses exactly the frames that arrive
 *   while a founder's connection is being re established, which is to say the
 *   frames that arrive when the network is already bad.
 *
 *   THE PROXY. An idle SSE connection is closed by a proxy that sees no bytes.
 *   The heartbeat is a comment line, which every EventSource ignores. FIFTEEN
 *   SECONDS IS A GUESS. The Step 0 deployment probe opens a stream to itself
 *   through the Replit proxy, times the disconnect, and that measurement is
 *   what SSE_HEARTBEAT_MS should be set from. Until it has run, this number is
 *   not evidence of anything.
 *
 *   A NEWLINE IN THE DATA. `data:` is line oriented, so one newline inside a
 *   founder's text ends the frame early and the rest of it is read as a new
 *   field. Every payload is JSON encoded, which has no raw newlines in it, and
 *   the encoder is here rather than at each call site.
 *
 *   RAW TOOL JSON. A founder watching nothing happen for 40 seconds while the
 *   model reads three files concludes it is broken. Tool activity is forwarded
 *   as a plain English status line by the agent layer. This file will not
 *   invent one, but it is where the rule is written down.
 *
 * WHAT CALLS IT. ./stream.ts.
 * WHAT IT READS. `turn_events`, through the AppStore. WHAT IT WRITES. A socket.
 */

import type { AppStore, Clock, TurnEventRow } from './ports.ts';
import { TurnEventBus } from './events.ts';

/** Anything a frame can be written to. A Node response, or an array in a test. */
export interface SseSink {
  write(chunk: string): void;
  end(): void;
}

/**
 * The headers the Replit proxy needs, all four of them.
 *
 * X-Accel-Buffering is the one that is easy to leave out and impossible to
 * diagnose from the client: a buffering proxy holds every frame until the
 * response completes, so a live stream arrives all at once at the end and looks
 * exactly like a slow server.
 */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

/**
 * One frame. `id:` is the primary key of the turn_events row, which is what
 * Last-Event-ID carries back on a reconnect.
 */
export function formatFrame(row: TurnEventRow): string {
  return `id: ${String(row.id)}\nevent: ${row.kind}\ndata: ${JSON.stringify(row.data)}\n\n`;
}

/** A comment. EventSource ignores it, and the proxy sees bytes. */
export function comment(text: string): string {
  return `: ${text}\n\n`;
}

/**
 * The browser's Last-Event-ID, from the header a native EventSource sends or
 * from the query parameter a hand written client can use.
 *
 * Anything that is not a positive whole number is treated as absent rather than
 * as zero. They are the same for replay, but reading "abc" as zero and replaying
 * the whole thread is a surprise, and a surprise on the reconnect path is the
 * hardest kind to reproduce.
 */
export function parseLastEventId(header: string | undefined, query: string | undefined): number {
  for (const candidate of [header, query]) {
    if (candidate === undefined) continue;
    const trimmed = candidate.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    const n = Number.parseInt(trimmed, 10);
    if (Number.isSafeInteger(n) && n >= 0) return n;
  }
  return 0;
}

/** How many frames one reconnect may replay before we stop and say so. */
export const REPLAY_LIMIT = 2000;

export interface StreamOptions {
  readonly founderId: string;
  readonly threadId: string;
  readonly lastEventId: number;
  readonly heartbeatMs: number;
}

/**
 * One founder's open stream.
 *
 * Owns its subscription and its heartbeat, and `close()` releases both. A
 * stream that leaves its subscription behind holds a reference to the response
 * of a browser that has gone, and 130 founders reloading a page would collect
 * 130 of them.
 */
export class SseStream {
  private unsubscribe: (() => void) | null = null;
  private heartbeat: { cancel(): void } | null = null;
  private buffered: TurnEventRow[] | null = [];
  private lastSent: number;
  private closed = false;

  constructor(
    private readonly sink: SseSink,
    private readonly store: AppStore,
    private readonly bus: TurnEventBus,
    private readonly clock: Clock,
    private readonly opts: StreamOptions,
  ) {
    this.lastSent = opts.lastEventId;
  }

  /**
   * Subscribe, replay, drain, then go live. The order is the point of this
   * method and it is the answer to the gap described at the top of this file.
   */
  async open(): Promise<void> {
    this.unsubscribe = this.bus.subscribe(this.opts.threadId, (row) => {
      if (this.buffered !== null) this.buffered.push(row);
      else this.send(row);
    });

    // An immediate comment does two things: it flushes headers through the
    // proxy so the browser fires onopen, and it proves to whoever is watching a
    // network tab that the connection is alive before any turn produces a word.
    this.sink.write(comment('open'));

    try {
      const missed = await this.store.eventsSince(
        this.opts.founderId,
        this.opts.threadId,
        this.opts.lastEventId,
        REPLAY_LIMIT,
      );
      for (const row of missed) this.send(row);
    } catch (err) {
      // A replay that fails must not take the live stream with it. The founder
      // loses the frames they missed, not the answer being written now.
      this.sink.write(comment(`replay unavailable: ${err instanceof Error ? err.name : 'error'}`));
    }

    const buffered = this.buffered ?? [];
    this.buffered = null;
    for (const row of buffered) this.send(row);

    this.heartbeat = this.clock.setInterval(() => {
      if (!this.closed) this.sink.write(comment('heartbeat'));
    }, this.opts.heartbeatMs);
  }

  /** Ids only ever go forward, so a frame replayed and then buffered is sent once. */
  private send(row: TurnEventRow): void {
    if (this.closed) return;
    if (row.id <= this.lastSent) return;
    this.lastSent = row.id;
    this.sink.write(formatFrame(row));
  }

  /** For the graceful shutdown: say why before the socket goes. */
  say(text: string): void {
    if (!this.closed) this.sink.write(comment(text));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.heartbeat?.cancel();
    this.unsubscribe?.();
    this.heartbeat = null;
    this.unsubscribe = null;
    this.sink.end();
  }

  /** For tests and for the ops screen. The id of the last frame this stream wrote. */
  get position(): number {
    return this.lastSent;
  }
}
