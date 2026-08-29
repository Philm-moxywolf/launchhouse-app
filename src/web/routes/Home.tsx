/** @jsxRuntime automatic */
/**
 * src/web/routes/Home.tsx
 *
 * WHAT IT IS
 * Where a founder starts, and what they do next. One card per engine they can run, in build
 * order, with the next one first.
 *
 * WHY IT EXISTS
 * The cards are the answer to "what am I supposed to be doing". They come from
 * `app/content/routes.ts`, which is the only routing table, so the sidebar, the gates
 * screen and the intent router cannot disagree about what exists.
 *
 * RULE 1 IS STRUCTURAL HERE. The cards are `visibleRoutes(track)` and nothing else. A B2C
 * founder has no Outreach Engine card, not a greyed out one, and no idea one exists. Before
 * the Founder Brain locks a track, only the rows that belong to both tracks appear, because
 * guessing a track to have something to show would be wrong for half the cohort. The other
 * track's rows are absent, and absent is the point.
 *
 * The two time critical items are the exception that proves it, and section 6 sets it out.
 * Until the Brain locks, both are shown, each labelled with its condition, in the same "if
 * you sell to businesses, if you sell to consumers" shape the pre work email already uses.
 * A conditional reminder is not forked output. The moment the Brain locks, the screen drops
 * to the one card that applies and the other disappears for good.
 *
 * WHAT CALLS IT
 * app.tsx.
 *
 * WHAT IT READS AND WRITES
 * Reads the home state. Writes nothing: starting an engine happens on the Thread screen.
 */

import type { ReactElement } from "react";
import { TIME_CRITICAL_ITEM } from "../../../app/content/routes.ts";
import type { RouteRow, Session, Track } from "../../../app/content/routes.ts";
import type { Founder, HomeState, RouteProgress } from "../lib/api.ts";
import { visibleRoutes } from "../lib/track.ts";
import { hrefFor } from "../lib/nav.ts";
import { plainFileName } from "../lib/format.ts";
import { Notice } from "../components/Notice.tsx";

/** When a row is done, in words. The table stores numbers and names; founders read both. */
export function sessionWords(session: Session): string {
  if (session === "any") return "Any time";
  if (session === "weekend") return "In Atlanta, over the weekend";
  if (session === "before the print deadline") return "Before the print deadline";
  return `Session ${String(session)}`;
}

const PROGRESS_WORDS: Readonly<Record<RouteProgress, string>> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/**
 * What is missing before this row can run.
 *
 * Named as the thing the founder made, not as a file name, because "Your Founder Brain
 * comes first" is an instruction and `founder-brain.md is required` is an error message.
 */
function blockedBy(row: RouteRow, presentFiles: readonly string[]): string | null {
  const missing = row.requires.filter((f) => !presentFiles.includes(f));
  const first = missing[0];
  if (first === undefined) return null;
  return `${plainFileName(first)} comes first.`;
}

export function Home({ founder, home }: { readonly founder: Founder; readonly home: HomeState }): ReactElement {
  const rows = visibleRoutes(founder.track);
  const nextId = home.nextRouteId;
  const name = founder.displayName ?? founder.firstName;

  return (
    <div className="page">
      <h1>Hello, {name}.</h1>
      <p className="lede">
        {nextId === null
          ? "Everything you can do right now is done. Come back when the next session opens."
          : "Here is everything you build. Start at the top."}
      </p>

      <ul className="cards">
        {rows.map((row) => {
          const state = home.routes[row.id];
          const progress: RouteProgress = state?.progress ?? "not_started";
          const blocked = blockedBy(row, home.presentFiles);
          const isNext = row.id === nextId;
          return (
            <li key={row.id} className={isNext ? "card card-next" : "card"}>
              <div className="card-head">
                <h2 className="card-title">{row.label}</h2>
                <span className={`chip chip-${progress}`}>{PROGRESS_WORDS[progress]}</span>
              </div>
              <p className="card-sub">{row.subtitle}</p>
              <p className="card-when">{sessionWords(row.session)}</p>
              {blocked === null ? (
                <div className="button-row">
                  <a
                    className={isNext ? "button" : "button button-quiet"}
                    href={hrefFor({ kind: "thread", routeId: row.id })}
                  >
                    {progress === "not_started" ? "Start" : progress === "done" ? "Open it again" : "Carry on"}
                  </a>
                </div>
              ) : (
                <p className="card-blocked">{blocked}</p>
              )}
            </li>
          );
        })}
      </ul>

      <TimeCritical track={founder.track} locked={founder.trackLocked} />
    </div>
  );
}

/**
 * The one thing per track that quietly breaks the weekend if it is left.
 *
 * Both are shown until the Brain locks the track, each with its condition in front of it.
 * After that, one, and the other is gone for good.
 */
function TimeCritical({ track, locked }: { readonly track: Track | null; readonly locked: boolean }): ReactElement {
  if (track !== null && locked) {
    return (
      <Notice
        title="One thing to sort out early"
        lines={[TIME_CRITICAL_ITEM[track], "It takes a few days to settle, so do it before the weekend, not during it."]}
      />
    );
  }
  return (
    <Notice
      title="One of these two will apply to you"
      lines={[
        "You choose which in session 1, when you build your Founder Brain. Until then, here are both, because whichever it turns out to be takes a few days to settle.",
        `If you sell to businesses: ${TIME_CRITICAL_ITEM.b2b}`,
        `If you sell to people: ${TIME_CRITICAL_ITEM.b2c}`,
      ]}
    />
  );
}
