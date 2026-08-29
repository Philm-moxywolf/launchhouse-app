/** @jsxRuntime automatic */
/**
 * src/web/components/ToolStatusLine.tsx
 *
 * WHAT IT IS
 * One line saying what the engine is doing right now.
 *
 * WHY IT EXISTS
 * Tool activity reaches the browser as plain English, translated on the server: "reading
 * your Founder Brain", never `Read growth-engine/founder-brain.md`. This component is the
 * end of that path, and it exists so there is one place that could ever render a status
 * line and it is a plain paragraph. Nothing here can print a path, a tool name or a piece
 * of JSON, because it is handed a sentence and nothing else.
 *
 * WHAT CALLS IT
 * StreamedMessage.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement } from "react";

export function ToolStatusLine({ text }: { readonly text: string }): ReactElement {
  return (
    <p className="tool-status" role="status" aria-live="polite">
      {text}
    </p>
  );
}
