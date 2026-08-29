/**
 * src/web/lib/setup-rail.ts
 *
 * WHAT IT IS
 * The setup checklist as data: which rows exist for this founder, what state each is in,
 * which of the two finish lines each belongs to, and what the screen should say. Also the
 * one function that turns a GoHighLevel failure into the words the founder reads.
 *
 * WHY IT EXISTS
 * Three failures.
 *
 * One, the half finished progress bar. Onboarding goes out on 4 September and the cohort
 * buys GoHighLevel together at the clinic on 23 September, so for nearly three weeks the
 * honest state of most founders is "everything you can do is done". Setup has two finish
 * lines, ready to start and ready to publish, and this file knows which row belongs to
 * which. Showing 40 percent to somebody who has done everything currently possible is how
 * you teach 130 people to ignore the progress bar.
 *
 * Two, the other track's material. The Apollo row does not exist for a B2C founder. Not
 * greyed out, not skipped, not mentioned. `apolloRowExists` in track.ts is the only test,
 * and it is applied here, once, where the rows are built, so no screen can add it back.
 *
 * Three, a failure with no next click. Every GoHighLevel failure maps to a row of the table
 * in `app/content/ghl-walk.ts`, which carries the cause in plain words and one action. The
 * mapping is here so a screen cannot invent its own wording for a state the copy already
 * covers.
 *
 * WHAT CALLS IT
 * The Setup screen and the token walk screens.
 *
 * WHAT IT READS AND WRITES
 * Nothing. Pure functions over the setup response and the founder.
 */

import { GHL_WALK_FAILURES, GHL_WALK_STEPS, scopeRefusalCopy } from "../../../app/content/ghl-walk.ts";
import type { StepState, WalkFailure } from "../../../app/content/ghl-walk.ts";
import { SCOPE_FOR_VERIFY_CALL } from "../../../app/content/scopes.ts";
import type { Track } from "../../../app/content/routes.ts";
import { apolloRowExists } from "./track.ts";
import type { GhlFailureKind, GhlVerifyCall, SetupState } from "./api.ts";
import { hrefFor } from "./nav.ts";

/**
 * The two finish lines, named the way the screen names them.
 *
 * Section 6: tier one is sign in, name and timezone, due before session 1, and it blocks
 * everything. Tier two is GoHighLevel, the accounts to post to and Apollo where it applies,
 * due at the clinic, and it blocks publishing and sending only.
 */
export type Tier = "start" | "publish";

export interface RailRow {
  readonly id: string;
  readonly title: string;
  /** One line under the title. Says what it is for, not what it is called. */
  readonly blurb: string;
  readonly tier: Tier;
  readonly state: StepState;
  readonly href: string;
  /** The words on the button. Absent when there is nothing to press. */
  readonly action: string | null;
}

/**
 * The state of the GoHighLevel row, from the six substeps and the connection.
 *
 * A fail beats a skip and a skip beats not started, because the mentor board sorts most
 * stuck first and the row a mentor has to see is the one that failed. Not having bought
 * GoHighLevel on 6 September is a skip and is fine. A plan with no Private Integrations
 * entry is a fail and needs a human today.
 */
export function ghlRowState(setup: SetupState): StepState {
  if (setup.ghl.connected) return "done";
  const states = GHL_WALK_STEPS.map((s) => setup.steps[s.slug]?.state ?? "not_started");
  if (states.includes("failed")) return "failed";
  if (states.includes("skipped")) return "skipped";
  if (states.includes("in_progress") || states.includes("done")) return "in_progress";
  return "not_started";
}

/**
 * The rows this founder has.
 *
 * Sign in is not a row. They are reading this screen, so they signed in, and a ticked box
 * for something they cannot un-do is noise.
 */
export function railRows(setup: SetupState, track: Track | null): readonly RailRow[] {
  const rows: RailRow[] = [];

  const profileDone = setup.profile.name !== null && setup.profile.timezone !== null;
  rows.push({
    id: "profile",
    title: "Your name and where you are",
    blurb: "So we can write to you properly, and so a time in your plan means the time on your clock.",
    tier: "start",
    state: profileDone ? "done" : "not_started",
    href: hrefFor({ kind: "first-run" }),
    action: profileDone ? "Change" : "Answer two questions",
  });

  const ghlState = ghlRowState(setup);
  rows.push({
    id: "ghl",
    title: "Connect GoHighLevel",
    blurb: "This is what publishes your posts and holds your contacts. You do not need it until session 3.",
    tier: "publish",
    state: ghlState,
    href: hrefFor({ kind: "setup-ghl-intro" }),
    action: ghlState === "done" ? "Check the connection" : ghlState === "in_progress" ? "Carry on" : "Start",
  });

  rows.push({
    id: "accounts",
    title: "An account to post to",
    blurb: "A Facebook Page or an Instagram account, connected inside GoHighLevel's Social Planner.",
    tier: "publish",
    state: setup.ghl.accounts.length > 0 ? "done" : setup.ghl.connected ? "in_progress" : "not_started",
    href: hrefFor({ kind: "setup-ghl-step", slug: "verify" }),
    action: setup.ghl.accounts.length > 0 ? null : "Check again",
  });

  // Rule 1, structurally. A B2C founder has no Apollo row, so no screen can render one.
  if (apolloRowExists(track) && setup.apollo !== undefined) {
    rows.push({
      id: "apollo",
      title: "Apollo",
      blurb: "Two ways to do this, and both end in the same place. Nothing sends until you press send.",
      tier: "publish",
      state: setup.apollo.connected ? "done" : "not_started",
      href: hrefFor({ kind: "setup-apollo" }),
      action: setup.apollo.connected ? "Change" : "Choose how",
    });
  }

  return rows;
}

export interface SetupSummary {
  readonly readyToStart: boolean;
  readonly readyToPublish: boolean;
  /**
   * True when everything possible today is done.
   *
   * The screen says exactly that, in those words, because the alternative is a founder who
   * has done everything reading a bar that says they have not.
   */
  readonly doneForNow: boolean;
  readonly next: RailRow | null;
  /** Rows that failed. These are the ones a mentor has to see today. */
  readonly blocking: readonly RailRow[];
}

export function setupSummary(rows: readonly RailRow[]): SetupSummary {
  const inTier = (tier: Tier): readonly RailRow[] => rows.filter((r) => r.tier === tier);
  const isDone = (r: RailRow): boolean => r.state === "done";
  const readyToStart = inTier("start").every(isDone);
  const readyToPublish = inTier("publish").every(isDone);
  const blocking = rows.filter((r) => r.state === "failed");
  const waiting = rows.filter((r) => !isDone(r) && r.state !== "failed" && r.state !== "skipped");
  return {
    readyToStart,
    readyToPublish,
    doneForNow: readyToStart && blocking.length === 0 && waiting.every((r) => r.tier === "publish" && isSkippable(r)),
    next: rows.find((r) => !isDone(r) && r.state !== "skipped") ?? null,
    blocking,
  };
}

/**
 * A publish row that is legitimately not doable yet.
 *
 * Only the GoHighLevel rows qualify, and only because the cohort buys it together at the
 * clinic. Nothing else in setup is allowed to be quietly excused.
 */
function isSkippable(row: RailRow): boolean {
  return row.id === "ghl" || row.id === "accounts";
}

/** Which row of the failure table each verifier answer maps to. */
const FAILURE_INDEX: Readonly<Record<GhlFailureKind, number>> = {
  auth_rejected: 0,
  location_mismatch: 1,
  scope_probably_missing: 2,
  no_accounts: 3,
  rate_limited: 4,
  vendor_unavailable: 5,
};

export interface FailureCopy {
  readonly text: string;
  readonly action: string;
  readonly backTo: string | null;
  /**
   * True when the cause is our best guess rather than something GoHighLevel told us.
   *
   * Which status code means a scope refusal is not known. Until the spike runs, any non
   * success on a call whose auth already succeeded is treated as a probable scope problem,
   * and the screen says it is a guess rather than stating it as fact.
   */
  readonly isAGuess: boolean;
}

/**
 * The words for one failure.
 *
 * The scope named in the sentence comes from the map in scopes.ts, keyed by which of the
 * three reads failed, so the seven strings still live in exactly one file.
 */
export function ghlFailureCopy(kind: GhlFailureKind, call: GhlVerifyCall): FailureCopy {
  const row: WalkFailure | undefined = GHL_WALK_FAILURES[FAILURE_INDEX[kind]];
  if (row === undefined) {
    return {
      text: "Something went wrong that we do not have words for yet. Tell a mentor and we will sort it.",
      action: "Try again",
      backTo: null,
      isAGuess: false,
    };
  }
  const text = kind === "scope_probably_missing" ? scopeRefusalCopy(SCOPE_FOR_VERIFY_CALL[call]) : row.founderReads;
  return {
    text,
    action: row.action,
    backTo: row.backTo ?? null,
    isAGuess: kind === "scope_probably_missing",
  };
}
