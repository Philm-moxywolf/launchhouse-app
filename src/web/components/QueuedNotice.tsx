/** @jsxRuntime automatic */
/**
 * src/web/components/QueuedNotice.tsx
 *
 * WHAT IT IS
 * What a founder sees while their turn is waiting behind other people's.
 *
 * WHY IT EXISTS
 * 130 people in a room and one cohort told "now run the Founder Brain" at the same minute.
 * The queue is the normal case at that moment, not an error, and the difference between a
 * calm room and an hour of support is whether the screen shows a number. Section 4 is
 * explicit: never a spinner with no number, and never a wait we cannot meet.
 *
 * The words come from lib/format.ts, so the wording of the wait is decided in one place and
 * hedged in every version of it.
 *
 * WHAT CALLS IT
 * StreamedMessage, when the turn in flight is queued.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement } from "react";

import { queuedNotice } from "../lib/format.ts";

export function QueuedNotice({ position }: { readonly position: number }): ReactElement {
  const lines = queuedNotice(position);
  return (
    <div className="queued" role="status" aria-live="polite">
      {lines.map((line, index) => (
        <p key={`${String(index)}-${line}`} className={index === 0 ? "queued-place" : "queued-line"}>
          {line}
        </p>
      ))}
    </div>
  );
}
