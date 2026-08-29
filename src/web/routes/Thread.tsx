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
import type { Founder } from "../lib/api.ts";
import { openStream } from "../lib/stream.ts";
import type { StreamHandle } from "../lib/stream.ts";
import { EMPTY_THREAD, threadReducer } from "../lib/thread-state.ts";
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
  const [openProblem, setOpenProblem] = useState<string | null>(null);
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
        setOpenProblem(opened.problem.text);
        return;
      }
      const loaded = await fetchThread(opened.value.threadId);
      if (!live) return;
      setOpening(false);
      if (!loaded.ok) {
        setOpenProblem(loaded.problem.text);
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

      {openProblem === null ? null : <Notice tone="problem" lines={[openProblem]} />}

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

      {view.notice === null ? null : (
        <Notice
          tone="plain"
          lines={[view.notice]}
          actionLabel="Got it"
          onAction={() => dispatch({ type: "dismiss-notice" })}
        />
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
