/** @jsxRuntime automatic */
/**
 * src/web/components/Composer.tsx
 *
 * WHAT IT IS
 * The box a founder types into, and the paste cap that sits on it.
 *
 * WHY IT EXISTS
 * Two failures.
 *
 * The first is the context window, and it is not hypothetical. The Founder Brain asks for
 * ten to twenty samples of anything the founder has written. Twenty newsletters pasted into
 * a chat box is a real message of two hundred kilobytes, and it either blows the window or
 * gets compacted away in the middle of the interview. Section 4 calls the fix a product
 * fix: cap the paste, offer to save it as a file, and let the engine read the file with the
 * Read tool. The sample then becomes the founder's own downloadable property under rule 4,
 * and it can be re read later instead of being hoped about.
 *
 * The second is a founder pressing send twice. The box is disabled while a send is in
 * flight and Enter is only a send when the text is not empty, so the double send that
 * produces two turns in a queue cannot start here. The server holds the real guard, a
 * unique index on the client message id.
 *
 * Enter sends and shift with Enter makes a new line, which is what every chat box a founder
 * has used already does. The hint under the box says so, because it is the one keyboard
 * rule this app has.
 *
 * WHAT CALLS IT
 * The Thread screen.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It calls back with text, or with text to save as a file.
 */

import { useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";

/**
 * Roughly fifty kilobytes, counted in characters.
 *
 * A character is not a byte, and the difference does not matter here: this is a threshold
 * for "this is an article, not a sentence", and no founder is within a factor of two of it
 * by accident.
 */
export const PASTE_CAP_CHARS = 50000;

export const PASTE_CAP_TITLE = "That is a lot of writing for a message";
export const PASTE_CAP_LINES: readonly string[] = [
  "Long pieces of writing work better as a file. We save it with your work, the engine reads it from there, and you can download it like everything else.",
  "Short messages are still the fastest way to answer a question.",
];

export function Composer({
  disabled,
  placeholder,
  onSend,
  onSaveAsFile,
}: {
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly onSend: (text: string) => void;
  readonly onSaveAsFile: (text: string) => void;
}): ReactElement {
  const [text, setText] = useState("");
  const tooLong = text.length > PASTE_CAP_CHARS;

  const send = (): void => {
    const trimmed = text.trim();
    if (trimmed === "" || disabled || tooLong) return;
    setText("");
    onSend(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      {tooLong ? (
        <div className="composer-cap">
          <p className="composer-cap-title">{PASTE_CAP_TITLE}</p>
          {PASTE_CAP_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <button
            type="button"
            className="button"
            onClick={() => {
              onSaveAsFile(text);
              setText("");
            }}
          >
            Save it as a file
          </button>
        </div>
      ) : null}
      <label className="composer-label" htmlFor="composer-text">
        Your message
      </label>
      <textarea
        id="composer-text"
        className="composer-text"
        value={text}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-row">
        <span className="composer-hint">Enter sends. Shift and Enter starts a new line.</span>
        <button type="button" className="button" onClick={send} disabled={disabled || text.trim() === "" || tooLong}>
          Send
        </button>
      </div>
    </div>
  );
}
