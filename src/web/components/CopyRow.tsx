/** @jsxRuntime automatic */
/**
 * src/web/components/CopyRow.tsx
 *
 * WHAT IT IS
 * One value in a monospace box, with a copy button and a checkbox beside it.
 *
 * WHY IT EXISTS
 * `socialplanner/statistics.readonly` typed by hand at 10pm comes out as
 * `statistic.readonly`, and the founder is then hunting for a box that does not exist. The
 * copy button is worth more than it looks: it is the difference between a fiddly screen and
 * a support thread three weeks later when a call is refused for a scope nobody can find.
 *
 * The checkbox keeps their place while they tick the real boxes in GoHighLevel. It does
 * nothing else, and the line under the list says so, because a founder who believes our
 * checkbox granted a permission stops looking for the real one.
 *
 * Copying can fail: a browser can refuse clipboard access. When it does, the row says so
 * and the value is still there to select by hand. It never silently does nothing.
 *
 * WHAT CALLS IT
 * Step 4 of the token walk.
 *
 * WHAT IT READS AND WRITES
 * Writes to the system clipboard, on a click, and nowhere else.
 */

import { useState } from "react";
import type { ReactElement } from "react";

export function CopyRow({
  value,
  note,
  checked,
  onCheck,
}: {
  readonly value: string;
  readonly note: string;
  readonly checked: boolean;
  readonly onCheck: (next: boolean) => void;
}): ReactElement {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = (): void => {
    void navigator.clipboard
      .writeText(value)
      .then(() => setState("copied"))
      .catch(() => setState("failed"));
  };

  return (
    <li className="copy-row">
      <label className="copy-row-check">
        <input type="checkbox" checked={checked} onChange={(event) => onCheck(event.target.checked)} />
        <code className="copy-row-value">{value}</code>
      </label>
      <div className="copy-row-side">
        <button type="button" className="button button-small" onClick={copy}>
          {state === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="copy-row-note">{note}</p>
      {state === "failed" ? (
        <p className="copy-row-note copy-row-failed">
          Your browser would not let us copy it. Select the text above and copy it yourself.
        </p>
      ) : null}
    </li>
  );
}
