/** @jsxRuntime automatic */
/**
 * src/web/components/StreamedMessage.tsx
 *
 * WHAT IT IS
 * The answer being written right now: the text so far, what the engine is doing, and the
 * queue position when the turn has not started yet.
 *
 * WHY IT EXISTS
 * This is the component that decides whether the app feels alive or broken. A founder
 * watching their Founder Brain being written is the moment the product feels real, and a
 * founder watching an empty box for 40 seconds is the moment they close the tab. So there
 * are only three states here and every one of them says something: waiting in a queue, with
 * a number; working, with a sentence; or writing, with the words appearing.
 *
 * The text is rendered as text, not as markdown, while it is streaming. Half a heading and
 * an unclosed bold marker re-render on every delta and the result flickers. The finished
 * message is rendered properly once it is finished.
 *
 * WHAT CALLS IT
 * The Thread screen.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement } from "react";
import { QueuedNotice } from "./QueuedNotice.tsx";
import { ToolStatusLine } from "./ToolStatusLine.tsx";
import type { StreamedTurn } from "../lib/thread-state.ts";
import { MessageText } from "./MessageText.tsx";

export function StreamedMessage({ turn }: { readonly turn: StreamedTurn }): ReactElement {
  if (turn.queuePosition !== null) {
    return (
      <div className="message message-engine">
        <QueuedNotice position={turn.queuePosition} />
      </div>
    );
  }
  return (
    <div className="message message-engine">
      {/*
        THE SAME RENDERER AS A FINISHED MESSAGE, so the words do not change shape when
        the turn ends. A half arrived `**` simply does not match and shows as typed
        until its pair lands, which is what it did before this anyway.
      */}
      {turn.text === "" ? null : (
        <div aria-live="polite">
          <MessageText text={turn.text} />
        </div>
      )}
      <ToolStatusLine text={turn.status} />
    </div>
  );
}
