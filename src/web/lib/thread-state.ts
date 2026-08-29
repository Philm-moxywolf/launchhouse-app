/**
 * src/web/lib/thread-state.ts
 *
 * WHAT IT IS
 * The state of one conversation, and the one function that changes it. A reducer over the
 * frames from stream.ts and the three things the founder does: send, stop, reconnect.
 *
 * WHY IT EXISTS
 * Four failures, all of which are invisible until they happen to somebody mid interview.
 *
 * One. Duplicated text after a reconnect. The browser reconnects with the id of the last
 * frame it saw and the server replays from there, so frames the screen has already shown
 * arrive a second time. Every frame carries the primary key of its `turn_events` row, and
 * this reducer ignores any id it has already passed. Without that, a founder watching their
 * Brain being written sees the last paragraph twice and concludes it is broken.
 *
 * Two. Losing what was already written. The stop button is not a cancel: section 4 says the
 * partial text that already streamed is persisted, so the founder can read what they
 * stopped. The reducer commits partial text into the transcript on stop and on error, and
 * never discards it.
 *
 * Three. A silent wait. A founder watching nothing happen for 40 seconds concludes it is
 * broken. The reducer always holds a sentence saying what is happening, and the screen has
 * nowhere to render a spinner without one.
 *
 * Four. Running two turns into one bubble. A delta whose turn id is not the turn in flight
 * closes the old one first, so two answers cannot merge into a single block of text.
 *
 * WHAT CALLS IT
 * The Thread screen, and nothing else.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is a pure function. The screen owns the effects.
 */

import type { StreamFrame } from "./stream.ts";
import type { ThreadState } from "./api.ts";

export type MessageState = "sending" | "failed" | "complete" | "stopped";

export interface TranscriptMessage {
  readonly id: string;
  readonly role: "founder" | "engine";
  readonly text: string;
  readonly state: MessageState;
}

/** A file the engine wrote during this conversation. The panel updates as they arrive. */
export interface WrittenFile {
  readonly name: string;
  readonly sizeBytes: number | null;
}

/** The turn being streamed right now. Null between turns. */
export interface StreamedTurn {
  readonly turnId: string;
  readonly text: string;
  /** What the app is doing, in words. Never null while a turn is open. */
  readonly status: string;
  readonly queuePosition: number | null;
}

export interface ThreadView {
  readonly threadId: string | null;
  readonly routeId: string | null;
  readonly messages: readonly TranscriptMessage[];
  readonly turn: StreamedTurn | null;
  readonly lastEventId: number | null;
  readonly filesWritten: readonly WrittenFile[];
  /** Something the founder needs to read once. Not an error code, ever. */
  readonly notice: string | null;
  readonly stopping: boolean;
  readonly connection: "unknown" | "up" | "down";
}

export const EMPTY_THREAD: ThreadView = {
  threadId: null,
  routeId: null,
  messages: [],
  turn: null,
  lastEventId: null,
  filesWritten: [],
  notice: null,
  stopping: false,
  connection: "unknown",
};

export type ThreadAction =
  | { readonly type: "loaded"; readonly thread: ThreadState }
  | { readonly type: "sending"; readonly clientMsgId: string; readonly text: string }
  | { readonly type: "send-failed"; readonly clientMsgId: string; readonly text: string }
  | { readonly type: "frame"; readonly frame: StreamFrame }
  | { readonly type: "stop-requested" }
  | { readonly type: "stop-failed"; readonly text: string }
  | { readonly type: "notice"; readonly text: string }
  | { readonly type: "connection"; readonly up: boolean }
  | { readonly type: "dismiss-notice" };

/** The first thing shown when a turn opens, before the engine has said anything. */
export const FIRST_STATUS = "Thinking about what you said.";

/**
 * What the founder reads when a turn ends for a reason that is not simply "done".
 *
 * `max_turns` is not an error and is not written as one. It is a long piece of work that hit
 * its own guard rail, and the honest answer is to offer to carry on.
 */
export const TURN_END_NOTICE: Readonly<Record<string, string>> = {
  max_turns: "This one got long, so we paused it. Say carry on and it will pick up where it stopped.",
  budget: "This one reached the limit we set per answer. Say carry on and it will pick up where it stopped.",
  stopped: "Stopped. What you can see above is kept.",
};

function commitTurn(view: ThreadView, state: MessageState): ThreadView {
  const turn = view.turn;
  if (turn === null) return view;
  if (turn.text.trim() === "") return { ...view, turn: null };
  const message: TranscriptMessage = { id: turn.turnId, role: "engine", text: turn.text, state };
  return { ...view, messages: [...view.messages, message], turn: null };
}

function openTurn(view: ThreadView, turnId: string): StreamedTurn {
  const current = view.turn;
  if (current !== null && current.turnId === turnId) return current;
  return { turnId, text: "", status: FIRST_STATUS, queuePosition: null };
}

/**
 * True when this frame has already been shown.
 *
 * A frame with no id cannot be deduplicated, so it is always applied. That is the right way
 * round: showing a heartbeat twice is nothing, and dropping a real delta is a hole in the
 * middle of a founder's answer.
 */
function alreadySeen(view: ThreadView, frame: StreamFrame): boolean {
  return frame.id !== null && view.lastEventId !== null && frame.id <= view.lastEventId;
}

function withId(view: ThreadView, frame: StreamFrame): ThreadView {
  if (frame.id === null) return view;
  const next = view.lastEventId === null ? frame.id : Math.max(view.lastEventId, frame.id);
  return { ...view, lastEventId: next };
}

export function threadReducer(view: ThreadView, action: ThreadAction): ThreadView {
  switch (action.type) {
    case "loaded": {
      const t = action.thread;
      return {
        ...EMPTY_THREAD,
        threadId: t.id,
        routeId: t.routeId,
        lastEventId: t.lastEventId,
        messages: t.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, state: "complete" as const })),
        turn:
          t.activeTurnId === null
            ? null
            : { turnId: t.activeTurnId, text: "", status: FIRST_STATUS, queuePosition: null },
      };
    }

    case "sending":
      return {
        ...view,
        notice: null,
        messages: [
          ...view.messages,
          { id: action.clientMsgId, role: "founder", text: action.text, state: "sending" },
        ],
      };

    case "send-failed":
      return {
        ...view,
        notice: action.text,
        messages: view.messages.map((m) =>
          m.id === action.clientMsgId ? { ...m, state: "failed" as const } : m,
        ),
      };

    case "stop-requested":
      return { ...view, stopping: true };

    case "stop-failed":
      return { ...view, stopping: false, notice: action.text };

    case "notice":
      return { ...view, notice: action.text };

    case "connection":
      return { ...view, connection: action.up ? "up" : "down" };

    case "dismiss-notice":
      return { ...view, notice: null };

    case "frame": {
      const frame = action.frame;
      if (alreadySeen(view, frame)) return view;
      const base = withId(view, frame);
      switch (frame.kind) {
        case "delta": {
          const turn = openTurn(base, frame.turnId);
          const closed = turn === base.turn ? base : commitTurn(base, "complete");
          return {
            ...closed,
            // A founder message is accepted the moment text arrives for its turn.
            messages: closed.messages.map((m) => (m.state === "sending" ? { ...m, state: "complete" as const } : m)),
            turn: { ...turn, text: turn.text + frame.text, queuePosition: null },
          };
        }
        case "status":
        case "tool": {
          const turn = openTurn(base, frame.turnId);
          const closed = turn === base.turn ? base : commitTurn(base, "complete");
          return { ...closed, turn: { ...turn, status: frame.text } };
        }
        case "queued": {
          const turn = openTurn(base, frame.turnId);
          const closed = turn === base.turn ? base : commitTurn(base, "complete");
          return { ...closed, turn: { ...turn, queuePosition: frame.position } };
        }
        case "file": {
          const others = base.filesWritten.filter((f) => f.name !== frame.name);
          return { ...base, filesWritten: [...others, { name: frame.name, sizeBytes: frame.sizeBytes }] };
        }
        case "turn_end": {
          if (base.turn !== null && base.turn.turnId !== frame.turnId) return base;
          const state: MessageState = frame.reason === "stopped" ? "stopped" : "complete";
          const committed = commitTurn(base, state);
          const notice = TURN_END_NOTICE[frame.reason] ?? null;
          return {
            ...committed,
            stopping: false,
            notice: notice ?? committed.notice,
            messages: committed.messages.map((m) =>
              m.state === "sending" ? { ...m, state: "complete" as const } : m,
            ),
          };
        }
        case "error": {
          // The partial text is kept. It is the founder's answer up to the point it broke,
          // and watching it vanish is worse than reading half of it.
          const committed = commitTurn(base, "stopped");
          return { ...committed, stopping: false, notice: frame.text };
        }
      }
    }
  }
}
