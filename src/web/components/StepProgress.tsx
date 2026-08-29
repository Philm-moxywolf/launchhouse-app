/** @jsxRuntime automatic */
/**
 * src/web/components/StepProgress.tsx
 *
 * WHAT IT IS
 * "Step 3 of 6", with a bar under it.
 *
 * WHY IT EXISTS
 * The GoHighLevel token walk is the hardest thing a non-technical founder does in the whole
 * programme. Section 6 puts a progress bar on it so nobody is walking in the dark: the
 * question a founder asks halfway through a fiddly job is "how much more of this is there",
 * and an unanswered version of that question is what makes somebody stop.
 *
 * The words come from `progressLabel` in the content file, so the count is written in one
 * place and cannot say six here and seven somewhere else.
 *
 * WHAT CALLS IT
 * The token walk screens.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement } from "react";
import { GHL_WALK_TOTAL_STEPS, progressLabel } from "../../../app/content/ghl-walk.ts";

export function StepProgress({ step }: { readonly step: number }): ReactElement {
  const percent = Math.round((step / GHL_WALK_TOTAL_STEPS) * 100);
  return (
    <div className="step-progress">
      <p className="step-progress-label">{progressLabel(step)}</p>
      <div
        className="step-progress-bar"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={GHL_WALK_TOTAL_STEPS}
        aria-label={progressLabel(step)}
      >
        <div className="step-progress-fill" style={{ width: `${String(percent)}%` }} />
      </div>
    </div>
  );
}
