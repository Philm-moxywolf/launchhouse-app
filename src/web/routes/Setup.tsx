/** @jsxRuntime automatic */
/**
 * src/web/routes/Setup.tsx
 *
 * WHAT IT IS
 * The setup checklist. Two finish lines, a row for each thing, and one sentence saying
 * where the founder stands.
 *
 * WHY IT EXISTS
 * The dates make this screen, and getting it wrong wastes three weeks of goodwill.
 * Onboarding goes out on 4 September. The GoHighLevel clinic is on 23 September, and the
 * cohort buys together on purpose so that nobody's trial expires during the weekend. So for
 * most of September the true state of most founders is "everything you can do is done", and
 * a single progress bar would tell 130 people they are 40 percent behind when they are not.
 * After that happens once, nobody reads the bar again.
 *
 * So there are two finish lines and the screen names both. Ready to start is sign in, name
 * and timezone, and it blocks everything. Ready to publish is GoHighLevel, an account to
 * post to, and Apollo where it applies, and it blocks publishing and sending only.
 *
 * RULE 1. The rows come from `railRows`, which asks `apolloRowExists` before it builds the
 * Apollo row. A B2C founder has no Apollo row, no Apollo skip line, and no occurrence of
 * the word anywhere on this screen.
 *
 * WHAT CALLS IT
 * app.tsx, on `#/setup`.
 *
 * WHAT IT READS AND WRITES
 * Reads the setup state. Writes nothing itself: every row links to the screen that does.
 */

import type { ReactElement } from "react";
import type { StepState } from "../../../app/content/ghl-walk.ts";
import type { Founder, SetupState } from "../lib/api.ts";
import { railRows, setupSummary } from "../lib/setup-rail.ts";
import type { RailRow } from "../lib/setup-rail.ts";
import { Notice } from "../components/Notice.tsx";

/** The five states, in the words a founder reads. A skip is not a failure and never red. */
export const STATE_WORDS: Readonly<Record<StepState, string>> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  skipped: "Not needed yet",
  failed: "Needs a hand",
};

export function Setup({ founder, setup }: { readonly founder: Founder; readonly setup: SetupState }): ReactElement {
  const rows = railRows(setup, founder.track);
  const summary = setupSummary(rows);

  return (
    <div className="page">
      <h1>Setup</h1>
      <p className="lede">There are two finish lines. You only need the first one to start.</p>

      {summary.doneForNow ? (
        <Notice
          tone="good"
          title="You are done for now"
          lines={[
            "Everything you can do today is done. The rest needs GoHighLevel, and the whole cohort buys that together at the clinic on 23 September.",
            "We will bring you back here then. Nothing is late.",
          ]}
        />
      ) : null}

      {summary.blocking.length === 0 ? null : (
        <Notice
          tone="problem"
          title="One thing needs a person"
          lines={[
            "This one does not sort itself out by waiting. Post in the Slack channel and somebody will pick it up today.",
            ...summary.blocking.map((row) => row.title),
          ]}
        />
      )}

      <Tier
        title="Ready to start"
        due="Before session 1"
        blocks="Everything"
        rows={rows.filter((r) => r.tier === "start")}
        complete={summary.readyToStart}
      />

      <Tier
        title="Ready to publish"
        due="The clinic, 23 September"
        blocks="Publishing and sending, and nothing else"
        rows={rows.filter((r) => r.tier === "publish")}
        complete={summary.readyToPublish}
      />
    </div>
  );
}

function Tier({
  title,
  due,
  blocks,
  rows,
  complete,
}: {
  readonly title: string;
  readonly due: string;
  readonly blocks: string;
  readonly rows: readonly RailRow[];
  readonly complete: boolean;
}): ReactElement {
  return (
    <section className={complete ? "tier tier-complete" : "tier"}>
      <div className="tier-head">
        <h2>{title}</h2>
        {complete ? <span className="chip chip-done">Done</span> : null}
      </div>
      <p className="tier-meta">
        Due: {due}. Holds up: {blocks}.
      </p>
      <ul className="rail">
        {rows.map((row) => (
          <li key={row.id} className={`rail-row rail-row-${row.state}`}>
            <div className="rail-row-main">
              <h3 className="rail-row-title">{row.title}</h3>
              <p className="rail-row-blurb">{row.blurb}</p>
            </div>
            <span className={`chip chip-${row.state}`}>{STATE_WORDS[row.state]}</span>
            {row.action === null ? null : (
              <a className="button button-small" href={row.href}>
                {row.action}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
