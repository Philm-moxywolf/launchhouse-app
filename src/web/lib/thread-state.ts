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
  /**
   * Which failure the notice above is, or null when it is ordinary news.
   *
   * WHY IT IS A FIELD AND NOT A GUESS FROM THE WORDS. One slot carries both "Saved. It is in
   * your files" and "That one did not finish", and the screen drew both the same way: a
   * quiet grey box with a Got it button under it. A founder three minutes into a turn that
   * has just died reads a grey box as an ordinary message, presses Got it, and is left
   * looking at a screen with no answer on it and nothing that says why.
   *
   * WHY THREE VALUES AND NOT A BOOLEAN. The three failures need three different sentences
   * and are not interchangeable. A message that never left the browser has lost nothing and
   * needs sending again. A Stop that did not land means the answer is STILL COMING, which is
   * the opposite of the other two. A turn that died is the one that needs the full three
   * lines. One boolean would have put "that answer did not finish" over a message that never
   * left, which is worse than saying nothing.
   *
   * Sniffing the text for words like "failed" would work until somebody rewrote a sentence.
   * The reducer knows which action it just handled, so it says so.
   */
  readonly noticeFailure: NoticeFailure | null;
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
  noticeFailure: null,
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
 * What a founder reads while a turn is running and nothing has come back yet.
 *
 * WHY IT IS HERE AT ALL. The status line changes as the engine works, and between two of
 * those changes it can sit still for a long time while a file is read or a long answer is
 * composed. Nothing on the screen said how long any of this was meant to take, so the
 * honest reading of a still screen was that the app had stopped. This says the number.
 *
 * IT GOES AWAY THE MOMENT WORDS APPEAR. See the Thread screen for the three conditions. A
 * founder watching text arrive can see it is working, and a block still telling them to be
 * patient at that point is something to scroll past.
 *
 * THE NUMBER IS THE ONE FROM THE MACHINE NOTES AND IS NOT INVENTED. `.replit` records that a
 * turn which reads three files and writes one runs 30 to 180 seconds, which is where the
 * three minutes comes from. If that measurement changes, this sentence changes with it.
 *
 * THE SECOND LINE IS THE QUESTION THEY ASK NEXT, and it is true because of how the stream
 * is built: every frame is a `turn_events` row before it is sent, the turn runs on the
 * server whether or not anybody is watching, and reopening the thread replays from the last
 * id the browser saw. So closing the tab really does cost nothing.
 */
export const WHILE_IT_RUNS: readonly string[] = [
  "A long answer takes up to three minutes. It reads your files before it writes anything, so the first minute often looks like nothing is happening.",
  "You can leave this page open, or close the tab and come back. The work carries on either way and it is here when you return.",
];

/** The three ways something a founder was waiting on can fail on this screen. */
export type NoticeFailure = "send" | "stop" | "turn";

/**
 * What a founder reads when one of the three fails.
 *
 * WHY THERE IS ANYTHING HERE AT ALL. Every other screen in this app was written twice over.
 * This path had one server sentence and a grey box, and the founder reading it had three
 * questions with only one of them answered. Have I lost my work. What do I do now. What if
 * it happens again. The server sentence still goes first, because it is the only one that
 * knows what actually happened. These answer what it leaves.
 *
 * THE FIRST LINE OF EACH IS THE WORK, BECAUSE THAT IS THE FIRST THOUGHT, and for the turn
 * it is true rather than soothing: run-turn.ts writes files inside the transaction that ends
 * the turn, so a turn that did not finish wrote nothing at all.
 *
 * THE LAST LINE OF THE TURN FAILURE NAMES THE COMMONEST CAUSE AND THE BUTTON THAT PROVES IT.
 * An Anthropic account with no credit left fails every answer and looks exactly like the app
 * being broken. "Check it again" is the real label on the real button on the Setup screen,
 * so a founder can follow the sentence without translating it first.
 */
export const FAILURE_COPY: Readonly<
  Record<NoticeFailure, { readonly title: string; readonly lines: readonly string[] }>
> = {
  /** The POST never got an answer. Nothing has happened anywhere, and that is the good news. */
  send: {
    title: "That message did not send",
    lines: [
      "Nothing has changed. It never left this page, so there is nothing half done at the other end.",
      "Your message is above, marked as not sent. Send it again. If it will not go a second time, that is the wifi rather than anything you did.",
    ],
  },
  /**
   * The odd one out, and the reason a boolean was not enough.
   *
   * A Stop that did not land means the answer is STILL COMING. Telling this founder their
   * work is safe and to try again would be telling them the opposite of what is true.
   */
  stop: {
    title: "That did not stop",
    lines: [
      "The answer is still being written. Nothing is broken and nothing is lost.",
      "Press Stop again. If it will not stop, leave it running: a long answer ends on its own and everything written up to that point is kept.",
    ],
  },
  /** The one this whole block exists for. See the three questions above. */
  turn: {
    title: "That answer did not finish",
    lines: [
      "Nothing you have made has changed. Your files are written only when an answer finishes, so they are exactly as they were.",
      "Send your message again. Anything the engine had already written is on the screen above, and it is on this screen only, so copy what you want to keep before you reload.",
      "If it stops twice in a row, check your key before you try a third time. Open Setup, find Your Anthropic key, and press Check it again. An Anthropic account with no credit left fails every answer and looks exactly like the app being broken.",
    ],
  },
};

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
        noticeFailure: null,
        messages: [
          ...view.messages,
          { id: action.clientMsgId, role: "founder", text: action.text, state: "sending" },
        ],
      };

    case "send-failed":
      return {
        ...view,
        notice: action.text,
        noticeFailure: "send",
        messages: view.messages.map((m) =>
          m.id === action.clientMsgId ? { ...m, state: "failed" as const } : m,
        ),
      };

    case "stop-requested":
      return { ...view, stopping: true };

    case "stop-failed":
      return { ...view, stopping: false, notice: action.text, noticeFailure: "stop" };

    // Everything that reaches here is a founder's own action reporting back: a sample
    // saved, a sample that could not be saved. The screen that dispatched it knows which,
    // and none of them is a turn dying under somebody who was waiting for an answer.
    case "notice":
      return { ...view, notice: action.text, noticeFailure: null };

    case "connection":
      return { ...view, connection: action.up ? "up" : "down" };

    case "dismiss-notice":
      return { ...view, notice: null, noticeFailure: null };

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
            // A turn that ended for a reason with a sentence is not a failure. Stopping was
            // the founder's own doing, and a long turn pausing is an offer to carry on.
            noticeFailure: notice === null ? committed.noticeFailure : null,
            messages: committed.messages.map((m) =>
              m.state === "sending" ? { ...m, state: "complete" as const } : m,
            ),
          };
        }
        case "error": {
          // The partial text is kept. It is the founder's answer up to the point it broke,
          // and watching it vanish is worse than reading half of it.
          const committed = commitTurn(base, "stopped");
          return { ...committed, stopping: false, notice: frame.text, noticeFailure: "turn" };
        }
      }
    }
  }
}
