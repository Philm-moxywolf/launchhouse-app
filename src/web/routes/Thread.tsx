/** @jsxRuntime automatic */
/**
 * src/web/routes/Thread.tsx
 *
 * WHAT IT IS
 * The conversation. One engine, one thread, streamed answers, a stop button, and the list
 * of files the engine has written while the founder watched.
 *
 * WHY IT EXISTS
 * This is the app. Everything else is the way in and the way back out.
 *
 * Four things it has to get right, all of them named in section 4.
 *
 * Input and output are separate connections on purpose. Sending is an ordinary POST that
 * comes back in under 50 ms with a turn id and streams nothing. Output arrives on an SSE
 * connection that has been open since before the send. A dropped output stream therefore
 * cannot lose an accepted message, and a reconnect replays what was missed from the id the
 * browser last saw.
 *
 * Stop is not a cancel. The partial text that already streamed is kept, and the founder can
 * read what they stopped.
 *
 * The file panel updates as writes happen, because a founder watching their Founder Brain
 * appear is the moment the product feels real. It is free: the frames are already on the
 * stream.
 *
 * RULE 1. A route this founder cannot see cannot be opened here either, whatever address
 * they arrived on. A mentor pasting the wrong link, or a founder editing the address bar,
 * gets a plain sentence and a way back, not the other track's engine.
 *
 * WHAT CALLS IT
 * app.tsx, on `#/thread/<routeId>`.
 *
 * WHAT IT READS AND WRITES
 * Opens the thread, sends messages, interrupts, and holds the SSE connection open. All of
 * it through lib/api.ts and lib/stream.ts.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import type { ReactElement } from "react";
import { routeById } from "../../../app/content/routes.ts";
import {
  fetchThread,
  interruptThread,
  openThread,
  saveVoiceSample,
  sendMessage,
  streamUrl,
} from "../lib/api.ts";
import type { Founder, Problem } from "../lib/api.ts";
import { openStream } from "../lib/stream.ts";
import type { StreamHandle } from "../lib/stream.ts";
import { EMPTY_THREAD, FAILURE_COPY, WHILE_IT_RUNS, threadReducer } from "../lib/thread-state.ts";
import { mayOpenRoute } from "../lib/track.ts";
import { hrefFor } from "../lib/nav.ts";
import { plainFileName } from "../lib/format.ts";
import { Composer } from "../components/Composer.tsx";
import { Notice } from "../components/Notice.tsx";
import { StopButton } from "../components/StopButton.tsx";
import { StreamedMessage } from "../components/StreamedMessage.tsx";
import { Working } from "../components/Working.tsx";

/** A client message id. The server's unique index on it is what stops a double send. */
function newClientMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `c_${String(Date.now())}_${Math.random().toString(16).slice(2)}`;
}

export function Thread({ founder, routeId }: { readonly founder: Founder; readonly routeId: string }): ReactElement {
  const [view, dispatch] = useReducer(threadReducer, EMPTY_THREAD);
  const [opening, setOpening] = useState(true);
  /*
    THE WHOLE PROBLEM IS KEPT, NOT JUST ITS SENTENCE, and that is what puts a link on this
    box. The server's 503 says what is missing and names it by id, and the id is what tells
    this screen whether Setup is the answer or whether Setup would be a wild goose chase.
    See `Problem.needs` in lib/api.ts.
  */
  const [openProblem, setOpenProblem] = useState<Problem | null>(null);
  const streamRef = useRef<StreamHandle | null>(null);
  const row = routeById(routeId);
  const allowed = mayOpenRoute(routeId, founder.track);

  useEffect(() => {
    if (!allowed) {
      setOpening(false);
      return;
    }
    let live = true;
    setOpening(true);
    setOpenProblem(null);
    void openThread(routeId).then(async (opened) => {
      if (!live) return;
      if (!opened.ok) {
        setOpening(false);
        setOpenProblem(opened.problem);
        return;
      }
      const loaded = await fetchThread(opened.value.threadId);
      if (!live) return;
      setOpening(false);
      if (!loaded.ok) {
        setOpenProblem(loaded.problem);
        return;
      }
      dispatch({ type: "loaded", thread: loaded.value });
      streamRef.current = openStream(
        streamUrl(loaded.value.id),
        loaded.value.lastEventId,
        (frame) => dispatch({ type: "frame", frame }),
        (up) => dispatch({ type: "connection", up }),
      );
    });
    return () => {
      live = false;
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [routeId, allowed]);

  if (!allowed) {
    return (
      <div className="page page-narrow">
        <Notice
          tone="problem"
          title="That is not one of yours"
          lines={[
            "This part of the programme is not on your track, so there is nothing here for you.",
            "If somebody sent you this link, they had the wrong one.",
          ]}
        />
        <a className="button" href={hrefFor({ kind: "home" })}>
          Back to the start
        </a>
      </div>
    );
  }

  const send = (text: string): void => {
    const threadId = view.threadId;
    if (threadId === null) return;
    const clientMsgId = newClientMsgId();
    dispatch({ type: "sending", clientMsgId, text });
    void sendMessage(threadId, text, clientMsgId).then((result) => {
      if (!result.ok) dispatch({ type: "send-failed", clientMsgId, text: result.problem.text });
    });
  };

  const saveAsFile = (text: string): void => {
    const stamp = new Date().toISOString().slice(0, 10);
    dispatch({ type: "notice", text: "Saving that as a file." });
    void saveVoiceSample(`sample-${stamp}.md`, text).then((result) => {
      dispatch({
        type: "notice",
        text: result.ok
          ? "Saved. It is in your files, it is yours to download, and the engine can read it from there."
          : result.problem.text,
      });
    });
  };

  const stop = (): void => {
    const threadId = view.threadId;
    if (threadId === null) return;
    dispatch({ type: "stop-requested" });
    void interruptThread(threadId).then((result) => {
      if (!result.ok) dispatch({ type: "stop-failed", text: result.problem.text });
    });
  };

  return (
    <div className="page page-thread">
      <header className="thread-head">
        <h1>{row?.label ?? "Your engine"}</h1>
        <p className="lede">{row?.subtitle ?? ""}</p>
      </header>

      {view.connection === "down" ? (
        <Notice
          tone="plain"
          lines={[
            "The connection dropped, which on venue wifi is normal. We are reconnecting, and nothing is lost.",
          ]}
        />
      ) : null}

      {/*
        THE FIRST WALL A FOUNDER MEETS, AND IT USED TO BE A RED BOX WITH ONE SENTENCE IN IT.

        The sentence came from the server and was written for a page they were not on, and
        the box had nothing on it to press. So a founder who was already signed in, in their
        own workspace, on a thread, was told to sign in, told to look below where there is
        no below, and left to go and find a screen the sentence never named. The server
        sentence is fixed in src/server/boot/readiness.ts. This is the other half: the doubt
        answered before the instruction, and the instruction with the door next to it.
      */}
      {openProblem === null ? null : (
        <Notice
          tone="problem"
          title="We could not open this one"
          lines={["Nothing is broken and nothing you have made is affected.", openProblem.text]}
        >
          {openProblem.needs.includes("anthropicKey") ? (
            <p className="notice-line">
              <a className="button" href={hrefFor({ kind: "setup" })}>
                Open Setup
              </a>
            </p>
          ) : null}
        </Notice>
      )}

      <div className="transcript">
        {view.messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            <p className="message-text">{message.text}</p>
            {message.state === "sending" ? <span className="message-state">Sending</span> : null}
            {message.state === "failed" ? <span className="message-state">Not sent</span> : null}
            {message.state === "stopped" ? <span className="message-state">Stopped here</span> : null}
          </div>
        ))}
        {opening ? <Working what="Opening your conversation." /> : null}
        {view.turn === null ? null : <StreamedMessage turn={view.turn} />}
      </div>

      {/*
        WHAT A FOUNDER READS DURING THE SILENCE, and the three conditions are the silence.

        A turn is open, so something is running. They are not in the queue, because
        QueuedNotice is already saying the better thing then, which is their place in line.
        And NOT ONE WORD HAS ARRIVED YET, which is the whole of it: this is for the minute or
        two where the engine is reading files and the screen has nothing on it but a status
        line that has not changed. The moment text starts appearing, the founder can see for
        themselves that it is working, and this becomes something to scroll past.
      */}
      {view.turn !== null && view.turn.queuePosition === null && view.turn.text === "" ? (
        <Notice tone="plain" lines={[...WHILE_IT_RUNS]} />
      ) : null}

      {/*
        ONE SLOT, TWO KINDS OF NEWS, AND THEY ARE NOT DRAWN THE SAME WAY ANY MORE.

        "Saved. It is in your files" and "That one did not finish" both arrive here. Both
        used to render as the same quiet grey box with a Got it button, which meant the
        second one was a failure a founder could dismiss without being told anything: no
        heading, no word about whether their work survived, and nothing to do next except
        press Got it and look at a screen with no answer on it.

        A failure now says what happened, says the work is safe, and says what to do, and it
        has no dismiss button. Dismissing a failure clears the only thing on the screen that
        explains why there is no answer. It clears itself the moment the next message is
        sent, which is the action it is asking for.
      */}
      {view.notice === null ? null : view.noticeFailure === null ? (
        <Notice
          tone="plain"
          lines={[view.notice]}
          actionLabel="Got it"
          onAction={() => dispatch({ type: "dismiss-notice" })}
        />
      ) : (
        <Notice
          tone="problem"
          title={FAILURE_COPY[view.noticeFailure].title}
          // The server's own sentence first, because it is the only one that knows what
          // actually happened. Ours answer the questions it leaves.
          lines={[view.notice, ...FAILURE_COPY[view.noticeFailure].lines]}
        >
          {/*
            The door, and only on the failure it opens. A message that did not send and a
            Stop that did not land have nothing to do with the key, and a button that goes
            somewhere useless is how a founder loses trust in every other button.
          */}
          {view.noticeFailure === "turn" ? (
            <p className="notice-line">
              <a className="button button-quiet" href={hrefFor({ kind: "setup" })}>
                Open Setup
              </a>
            </p>
          ) : null}
        </Notice>
      )}

      {view.filesWritten.length === 0 ? null : (
        <section className="written">
          <h2 className="written-title">Written while you watched</h2>
          <ul className="written-list">
            {view.filesWritten.map((file) => (
              <li key={file.name}>
                <a href={hrefFor({ kind: "file", name: file.name })}>{plainFileName(file.name)}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="thread-foot">
        {view.turn === null ? null : <StopButton stopping={view.stopping} onStop={stop} />}
        <Composer
          disabled={view.threadId === null || view.turn !== null}
          placeholder={view.turn === null ? "Type your answer" : "Waiting for this answer to finish"}
          onSend={send}
          onSaveAsFile={saveAsFile}
        />
      </div>
    </div>
  );
}
