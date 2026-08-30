/**
 * src/web/lib/stream.ts
 *
 * WHAT IT IS
 * The seven kinds of frame the server streams, as types, plus the one function that turns a
 * raw event into one of them and the thin wrapper that opens the connection.
 *
 * WHY IT EXISTS
 * Parsing is separated from connecting because only one of the two can be tested. A browser
 * EventSource cannot be exercised in node:test, but the decision "this frame is a delta for
 * turn tn_88 carrying this text, and this other one is nonsense" is the part that can go
 * wrong quietly, and it is pure.
 *
 * The failure it prevents is a screen that dies on one bad frame. A founder mid interview
 * whose page throws on a malformed payload loses the rest of the answer they are watching
 * being written. `parseFrame` never throws: anything it does not understand is null, and a
 * null frame is dropped and the stream carries on.
 *
 * The second failure is a lost reconnect. Every frame carries the primary key of a
 * `turn_events` row as its id, which is what makes reconnect lossless. This file keeps that
 * id on the frame so the reducer can ignore anything it has already shown, which is what
 * happens when a browser reconnects and the server replays.
 *
 * WHAT CALLS IT
 * The Thread screen opens the stream. The reducer in thread-state.ts consumes the frames.
 *
 * WHAT IT READS AND WRITES
 * Reads the SSE endpoint named in api.ts. Writes nothing.
 */

/** The frame kinds, exactly as section 4 of the build document names them. */
export type StreamFrame =
  | { readonly kind: "status"; readonly id: number | null; readonly turnId: string; readonly text: string }
  | { readonly kind: "delta"; readonly id: number | null; readonly turnId: string; readonly text: string }
  | { readonly kind: "tool"; readonly id: number | null; readonly turnId: string; readonly text: string }
  | {
      readonly kind: "file";
      readonly id: number | null;
      readonly turnId: string | null;
      readonly name: string;
      readonly sizeBytes: number | null;
    }
  | { readonly kind: "queued"; readonly id: number | null; readonly turnId: string; readonly position: number }
  | {
      readonly kind: "turn_end";
      readonly id: number | null;
      readonly turnId: string;
      readonly reason: TurnEndReason;
    }
  | { readonly kind: "error"; readonly id: number | null; readonly turnId: string | null; readonly text: string };

/**
 * Why a turn ended.
 *
 * `max_turns` is not an error and is never shown as one. Section 4: it is presented as
 * "this one got long, want to carry on?".
 */
export type TurnEndReason = "done" | "stopped" | "max_turns" | "budget" | "unknown";

const TURN_END_REASONS: readonly string[] = ["done", "stopped", "max_turns", "budget"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(record: Record<string, unknown>, key: string): string | null {
  const v = record[key];
  return typeof v === "string" ? v : null;
}

function num(record: Record<string, unknown>, key: string): number | null {
  const v = record[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The turn status the executor writes, in this file's vocabulary. See the turn_end case. */
function statusAsReason(status: string | null): string | null {
  if (status === "interrupted") return "stopped";
  if (status === "done") return "done";
  // Anything else is a status this file has never seen, and guessing at one would put the
  // wrong sentence under a founder's answer. `unknown` is the honest reading.
  return null;
}

/**
 * One raw event into one frame, or null.
 *
 * Null covers every way this can go wrong: an event name we do not handle, a body that is
 * not JSON, a body that is JSON but the wrong shape, a delta with no turn id. All of them
 * are dropped rather than guessed at, because a guessed frame writes the wrong text into a
 * founder's transcript and a dropped one is invisible.
 */
export function parseFrame(event: string, data: string, rawId: string | null): StreamFrame | null {
  let body: unknown;
  try {
    body = JSON.parse(data);
  } catch {
    return null;
  }
  const record = asRecord(body);
  if (record === null) return null;

  const id = rawId === null || rawId.trim() === "" ? null : Number.parseInt(rawId, 10);
  const frameId = id !== null && Number.isFinite(id) ? id : null;
  const turnId = str(record, "turnId");

  switch (event) {
    case "status":
    case "delta":
    case "tool": {
      const text = str(record, "text");
      if (turnId === null || text === null) return null;
      return { kind: event, id: frameId, turnId, text };
    }
    case "file": {
      const name = str(record, "name");
      if (name === null || name === "") return null;
      return { kind: "file", id: frameId, turnId, name, sizeBytes: num(record, "sizeBytes") };
    }
    case "queued": {
      const position = num(record, "position");
      if (turnId === null || position === null || position < 1) return null;
      return { kind: "queued", id: frameId, turnId, position: Math.floor(position) };
    }
    case "turn_end": {
      if (turnId === null) return null;
      /*
        TWO FIELD NAMES FOR ONE FACT, AND BOTH ARE READ. THE MISMATCH IS THE BUG.

        This file was written against `reason`. `QueueTurnExecutor` in
        src/server/routes/turn-executor.ts writes the authoritative turn_end and puts the
        answer in `status`, with the values `done` and `interrupted`. So every turn_end that
        actually reaches a browser parses as `unknown`: a founder who pressed Stop watched
        their half answer settle with no "Stopped here" on it and no sentence under it,
        because the reducer only writes both for reason `stopped`.

        Reading `reason` first and `status` second is the safe way round. If the server is
        corrected to send `reason`, this keeps working and the fallback simply stops being
        reached. If it is not, a founder still gets the sentence today. `interrupted` is
        translated because `stopped` is the founder's word for it and is what the notice
        table is keyed on.
      */
      const named = str(record, "reason") ?? statusAsReason(str(record, "status"));
      const known = named !== null && TURN_END_REASONS.includes(named) ? (named as TurnEndReason) : "unknown";
      return { kind: "turn_end", id: frameId, turnId, reason: known };
    }
    case "error": {
      const text = str(record, "text");
      if (text === null || text === "") return null;
      return { kind: "error", id: frameId, turnId, text };
    }
    default:
      return null;
  }
}

/** Everything a caller needs to close a stream and to know whether it is up. */
export interface StreamHandle {
  close(): void;
}

/**
 * The event names we subscribe to.
 *
 * Listed rather than taken from a generic handler because EventSource delivers named events
 * only to a listener for that name, and a name we forget to list is a frame that silently
 * never arrives.
 */
export const STREAM_EVENTS = ["status", "delta", "tool", "file", "queued", "turn_end", "error"] as const;

/**
 * Open the stream for one thread.
 *
 * `lastEventId` goes on the URL rather than in a header because a browser EventSource
 * cannot set headers on its first request. On its own reconnects the browser sends the
 * `Last-Event-ID` header by itself, so the server has to accept both, and that is written
 * into the contract in api.ts.
 *
 * `factory` exists so a test can hand in a fake. Nothing else passes it.
 */
export function openStream(
  url: string,
  lastEventId: number | null,
  onFrame: (frame: StreamFrame) => void,
  onConnectionChange?: (up: boolean) => void,
  factory: (u: string) => EventSource = (u) => new EventSource(u),
): StreamHandle {
  const full = lastEventId === null ? url : `${url}?lastEventId=${String(lastEventId)}`;
  const source = factory(full);
  for (const name of STREAM_EVENTS) {
    source.addEventListener(name, (event: Event) => {
      const message = event as MessageEvent<string>;
      const frame = parseFrame(name, message.data, message.lastEventId === "" ? null : message.lastEventId);
      if (frame !== null) onFrame(frame);
    });
  }
  source.addEventListener("open", () => onConnectionChange?.(true));
  // EventSource reconnects by itself. The founder is told the connection dropped, and is
  // not asked to do anything about it, because there is nothing for them to do.
  source.addEventListener("error", () => onConnectionChange?.(false));
  return {
    close(): void {
      source.close();
    },
  };
}
