/** @jsxRuntime automatic */
/**
 * src/web/components/StopButton.tsx
 *
 * WHAT IT IS
 * The stop button, and the sentence under it that says what stopping does.
 *
 * WHY IT EXISTS
 * A founder who cannot stop a long answer is stuck watching it. Stop calls interrupt on the
 * server, and the partial text that already streamed is kept, so what they stopped is still
 * theirs to read. The sentence under the button says so, because the reason people do not
 * press stop is that they expect to lose what is on screen.
 *
 * While the interrupt is in flight the button says so rather than disappearing. A control
 * that vanishes on click reads as a crash.
 *
 * WHAT CALLS IT
 * The Thread screen, whenever a turn is open.
 *
 * WHAT IT READS AND WRITES
 * Nothing. The screen owns the call.
 */

import type { ReactElement } from "react";

export function StopButton({
  stopping,
  onStop,
}: {
  readonly stopping: boolean;
  readonly onStop: () => void;
}): ReactElement {
  return (
    <div className="stop">
      <button type="button" className="button button-quiet" onClick={onStop} disabled={stopping}>
        {stopping ? "Stopping" : "Stop"}
      </button>
      <span className="stop-note">What is already written stays.</span>
    </div>
  );
}
