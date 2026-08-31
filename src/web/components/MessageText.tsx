/** @jsxRuntime automatic */
/**
 * src/web/components/MessageText.tsx
 *
 * WHAT IT IS
 *   The model's words on screen, with bold rendered and the house style enforced.
 *
 * WHY IT EXISTS
 *   A founder read "**Your webinar is Monday 7 September**" with the asterisks
 *   showing. The thread put the model's text straight into a paragraph, so every
 *   emphasis the model wrote arrived as punctuation. It is the most visible thing
 *   in the whole app and it made the writing look unfinished.
 *
 * IT BUILDS ELEMENTS, NEVER HTML. No `dangerouslySetInnerHTML`, anywhere, for any
 *   reason. This text comes from a model reading a founder's own files, and a
 *   founder who pastes something with a script tag in it must not be able to run it
 *   in their own browser by asking the engine to quote it back.
 *
 * IT IS DELIBERATELY SMALL. Bold, and paragraph breaks. Not a markdown engine.
 *   Every additional construct is another shape a founder can see rendered wrongly,
 *   and the engines are told to write plainly rather than to format.
 *
 * THE DASHES ARE REPLACED, NOT REPORTED. The house style bans them and the rules
 *   gate only checks files the app SAVES, so nothing was checking the half a founder
 *   actually reads. Fixing it on the way to the screen is quieter than a warning the
 *   founder cannot act on, and `assemble.ts` tells the model not to write them.
 */

import type { ReactElement, ReactNode } from "react";

/**
 * Em and en dashes, and the spaced hyphen that reads as one.
 *
 * A comma is the safe replacement: it never changes the meaning of a sentence the
 * way a full stop can, and the house style asks for a comma, a colon or brackets.
 */
export function houseStyle(text: string): string {
  return text.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+-\s+/g, ", ");
}

/** Split on **bold**, keeping the marked runs. Nothing else is interpreted. */
export function inlineParts(text: string): { bold: boolean; text: string }[] {
  const out: { bold: boolean; text: string }[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    if (m.index > last) out.push({ bold: false, text: text.slice(last, m.index) });
    out.push({ bold: true, text: m[1] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ bold: false, text: text.slice(last) });
  return out;
}

export function MessageText({ text }: { readonly text: string }): ReactElement {
  const paragraphs = houseStyle(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "");

  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={`${String(i)}-${paragraph.slice(0, 24)}`} className="message-text">
          {inlineParts(paragraph).map((part, j): ReactNode =>
            part.bold ? <strong key={String(j)}>{part.text}</strong> : part.text,
          )}
        </p>
      ))}
    </>
  );
}
