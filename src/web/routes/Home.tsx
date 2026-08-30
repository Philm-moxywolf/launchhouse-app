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

/**
 * Whether this founder's Anthropic key is in, as far as this screen has been told.
 *
 * "unknown" IS A REAL STATE AND IS NOT THE SAME AS "set". The setup read can fail on its
 * own, and a screen that treated a failed read as a working key would show seven Start
 * buttons and say nothing, which is the fault this type exists to stop. It is the default
 * for the same reason: a caller that has not asked has not been told, and this screen says
 * so rather than assuming the answer it would prefer.
 */
export type KeyStatus = "set" | "missing" | "unknown";

/**
 * What is missing, said before the buttons rather than after them.
 *
 * THE FAULT. This screen showed seven cards, each with a Start button on it, and said
 * nothing at all about the one thing every single one of them needs. A founder pressed
 * Start, watched a thread open, and met a red box telling them about a key. Seven buttons
 * that all lead to the same wall is a screen that has wasted somebody's evening.
 *
 * IT IS ABOVE THE CARDS ON PURPOSE. Below them it is a footnote somebody reads after
 * pressing the thing it is about.
 *
 * THE CARDS ARE LEFT ALONE. Nothing here disables a Start button. A founder who wants to
 * read what an engine asks before they set anything up should be able to, and a button that
 * has gone grey teaches somebody they are locked out rather than that they have one thing
 * left to do.
 */
function KeyBanner({ status }: { readonly status: KeyStatus }): ReactElement | null {
  if (status === "set") return null;
  if (status === "missing") {
    return (
      <Notice
        tone="problem"
        title="One thing is missing, and everything below needs it"
        lines={[
          "Every word this app writes is written by Claude, and Claude needs an API key that belongs to you. An API key is a long password that lets this app use your own Anthropic account. There is not one in here yet.",
          // Accurate, and it was worth checking: the readiness gate refuses POST /api/threads
          // while the key is missing, so Start does not open a conversation that then dies.
          // It takes them to a screen that says the same thing this one is saying.
          "So pressing Start on any of these takes you to a screen saying exactly this. Do the key first. You only do it once.",
        ]}
      >
        <p className="notice-line">
          <a className="button" href={hrefFor({ kind: "setup" })}>
            Open Setup
          </a>
        </p>
      </Notice>
    );
  }
  return (
    <Notice
      tone="plain"
      title="We could not check your Anthropic key"
      lines={[
        "The list below is right. The one thing we could not read just now is whether your key is in, and nothing below runs without it.",
        "Open Setup and look at Your Anthropic key. If it says Done, carry on down the list.",
      ]}
    >
      <p className="notice-line">
        <a className="button button-quiet" href={hrefFor({ kind: "setup" })}>
          Open Setup
        </a>
      </p>
    </Notice>
  );
}

export function Home({
  founder,
  home,
  keyStatus = "unknown",
}: {
  readonly founder: Founder;
  readonly home: HomeState;
  readonly keyStatus?: KeyStatus;
}): ReactElement {
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

      <KeyBanner status={keyStatus} />

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
