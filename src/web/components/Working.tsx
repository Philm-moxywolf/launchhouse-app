/** @jsxRuntime automatic */
/**
 * src/web/components/Working.tsx
 *
 * WHAT IT IS
 * The only progress indicator in this app. It takes a sentence and it will not render
 * without one.
 *
 * WHY IT EXISTS
 * A spinner with no explanation is the single most common way this app could fail a
 * non-technical founder. Somebody watching a turning circle for 40 seconds while the model
 * reads three files concludes the app is broken, closes the tab, and posts in Slack during
 * a live session. `what` is a required prop, so there is nowhere in this codebase to put a
 * spinner without saying what is happening. That is the rule made structural rather than
 * remembered.
 *
 * The dots are not the message. The sentence is the message.
 *
 * WHAT CALLS IT
 * Every screen, whenever it is waiting on the server.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement } from "react";

export function Working({ what }: { readonly what: string }): ReactElement {
  return (
    <p className="working" role="status" aria-live="polite">
      <span className="working-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="working-text">{what}</span>
    </p>
  );
}
