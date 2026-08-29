/**
 * types.ts
 *
 * WHAT: The vocabulary the agent module speaks. Track, model, cohort route, the
 *       routing table row, the founder context a run is pinned to, and the
 *       stream frame kinds the browser renders.
 *
 * WHY IT EXISTS: Design rule 1 says a founder forks once and every later step
 *       reads the track. That only holds if "track" is one type with two values
 *       everywhere, rather than a string each file spells its own way. A typo in
 *       a string literal is how a B2C founder ends up reading Apollo copy. These
 *       types make that a compile error instead of a support ticket.
 *
 * CALLED BY: every file in src/server/agent/, and by the route layer above it.
 * READS:  app/content/routes.ts, for the bridge at the foot of this file.
 *         Nothing else. WRITES: nothing.
 *
 * ALMOST ALL OF IT IS TYPES, and the exception is the bridge. `RouteRow` below
 * describes what this module needs of a routing table row. `app/content/
 * routes.ts` owns the table and is written for the sidebar, so its row carries
 * eleven fields and this one wants thirteen. For a while nothing joined them,
 * which meant the only value satisfying this interface was a test fixture and
 * plain language routing was exercised against invented rows. `CONTENT_ROUTES`
 * at the foot of this file is the join. It is here, next to the interface that
 * demands the two extra fields, because that is where a reader asks where the
 * two extra fields come from.
 *
 * Two words in this document both mean "route" and they are not the same thing,
 * so they get two names here and never share one:
 *   CohortRoute  b2b | b2c-service | b2c-ecom.  Derived from track and model.
 *                Decides which snapshot library row a founder gets.
 *   RouteId      the id of a row in the routing table, for example
 *                'audience-engine'. Decides which skill body runs.
 * REPLIT-BUILD.md section 9 F3 fixes the first vocabulary. Section 4's run
 * header example prints the second under the same word. Both are carried.
 */

import { ROUTES } from '../../../app/content/routes.ts';
import type { RouteRow as ContentRouteRow } from '../../../app/content/routes.ts';
import type { RouteCatalogue } from './ports.js';

/** The fork. One founder is one of these, chosen once in the Founder Brain. */
export type Track = 'b2b' | 'b2c';

/** The second axis of the cohort route. `schemas/brain.md` allows two values. */
export type BusinessModel = 'service' | 'ecommerce';

/**
 * The three cohort routes from planning/delivery/00-scope.md:62. Derived from
 * track and model by one function in app/content/routes.ts and nowhere else.
 */
export type CohortRoute = 'b2b' | 'b2c-service' | 'b2c-ecom';

/** A row id in the routing table, for example 'founder-brain'. */
export type RouteId = string;

/** Which model tier a route runs on. Section 4, cost control. */
export type ModelTier = 'primary' | 'utility';

/**
 * One row of app/content/routes.ts as this module needs it. The app does not
 * own that file, so this is the shape required of it rather than a copy of it.
 *
 * Eleven of these thirteen fields are the content row's own. The two that are
 * not, `tier` and `maxTurns`, are cost control and belong to the run rather than
 * to the sidebar, so they are added by `toAgentRoute` at the foot of this file.
 * A content row that stops satisfying the other eleven fails to compile there,
 * which is one file away from the table that changed.
 */
export interface RouteRow {
  /** Stable id. Logged on every run, so it is a fact rather than a guess. */
  readonly id: RouteId;
  /** Sidebar label. Founder facing, so the prose rules apply. */
  readonly label: string;
  /** Sidebar subtitle, lifted from the command file's description line. */
  readonly subtitle: string;
  /** Key into the generated skill body map. Usually equal to id, not always. */
  readonly skill: string;
  /**
   * Which tracks may see this row. A one entry array is a single track engine,
   * for example outreach-b2b. The sidebar filters on this and the router
   * refuses on it, which is rule 1 held in two places.
   */
  readonly tracks: readonly Track[];
  /** Which of the three sessions introduces it. Display only. */
  readonly session: 1 | 2 | 3 | null;
  /** Gate letter this row's output belongs to, per schemas/gates.md. */
  readonly gate: string | null;
  /** Files that must exist before this row can run. Checked server side. */
  readonly requires: readonly string[];
  /** Files this row is expected to produce. Rendered in the run header. */
  readonly produces: readonly string[];
  /** Built, ported, and deliberately not shown. playbook-export is one. */
  readonly hidden: boolean;
  /** Trigger phrases, lifted unchanged from the nine skill descriptions. */
  readonly phrases: readonly string[];
  /** Which model tier the route runs on. */
  readonly tier: ModelTier;
  /** The runaway guard. Section 4: brain 80, content 60, everything else 40. */
  readonly maxTurns: number;
}

export type RouteTable = readonly RouteRow[];

/**
 * Everything a run is pinned to. Assembled once, before the query is spawned,
 * and closed over by the MCP tools so the model can never name a founder.
 */
export interface FounderContext {
  /** ULID. Opaque. Never the email address. */
  readonly founderId: string;
  /** Display name, for the run header only. */
  readonly displayName: string;
  /** Business name, for the run header only. */
  readonly businessName: string;
  /**
   * The cached track from the founders table. The file wins if they disagree,
   * which is why the run header is built from a fresh read of the Brain.
   */
  readonly track: Track;
  readonly model: BusinessModel;
  readonly cohortRoute: CohortRoute;
  /** IANA zone name. Never an offset. Used for the Today line and for ge. */
  readonly timezone: string;
  /** Absolute path of the per founder scratch folder. cwd for the subprocess. */
  readonly workdir: string;
}

/** One file as the index sees it. Feeds the Present and Absent header lines. */
export interface FileFact {
  readonly path: string;
  readonly sizeBytes: number;
  /** Already formatted for a founder, for example '12 Sep'. */
  readonly changed: string;
}

/** One gate as the gate screen sees it. Feeds the Gate lines of the header. */
export interface GateFact {
  readonly letter: string;
  readonly state: 'passed' | 'submitted' | 'not submitted';
  /** Formatted date, present only when passed. */
  readonly on?: string;
}

/** Frame kinds on the SSE stream. Section 4, streaming. */
export type FrameKind =
  | 'status'
  | 'delta'
  | 'tool'
  | 'file'
  | 'queued'
  | 'turn_end'
  | 'error';

/**
 * One thing that happened during a turn. The runner emits these; the route
 * layer persists each as a turn_events row and writes the row id as the SSE
 * `id:` field, which is what makes reconnect with Last-Event-ID lossless.
 */
export type TurnEvent =
  /** Founder readable line about what the run is doing. Never raw tool JSON. */
  | { readonly kind: 'status'; readonly text: string }
  /** A token or a run of tokens of assistant text. */
  | { readonly kind: 'delta'; readonly text: string }
  /** A tool started or finished, already translated into plain English. */
  | { readonly kind: 'tool'; readonly text: string; readonly done: boolean }
  /** A file was written or edited. The file panel updates on this. */
  | { readonly kind: 'file'; readonly path: string }
  /** Position in the queue. Re emitted on every change. */
  | { readonly kind: 'queued'; readonly position: number; readonly text: string }
  /** The turn finished. Carries what the ledger and the UI both need. */
  | {
      readonly kind: 'turn_end';
      readonly outcome: TurnOutcome;
    }
  /** The turn failed. `text` is founder readable. `detail` is for the log. */
  | { readonly kind: 'error'; readonly text: string; readonly detail?: string };

/** Why a turn stopped, and what it cost. Written to the spend ledger. */
export interface TurnOutcome {
  readonly turnId: string;
  /**
   * `ok` is a completed turn. The rest map one to one onto SDK result
   * subtypes, except `interrupted`, which is a founder pressing stop.
   */
  readonly status:
    | 'ok'
    | 'interrupted'
    | 'max_turns'
    | 'max_budget'
    | 'error';
  /** This turn's own spend. Already differenced against the run's last read. */
  readonly costUsd: number;
  /** Cache read tokens this turn, summed across models. Zero is a bug, see C2. */
  readonly cacheReadTokens: number;
  /** SDK session id, so the thread can resume after the run is evicted. */
  readonly sdkSessionId: string | null;
  /** Final assistant text, when the SDK gave one. */
  readonly text: string;
}

/* -------------------------------------------------------------------------- */
/* The bridge to app/content/routes.ts                                         */
/* -------------------------------------------------------------------------- */

/**
 * Routes that run on the utility model rather than the strongest one.
 *
 * REPLIT-BUILD.md section 4, cost control, splits the work in two. The Brain,
 * content, outreach, audience, ops copy and the 90 day plan are the product:
 * copy in the founder's own voice, so they get the strongest model. Status,
 * gate, doctor and thread digests read files and report, with no voice work in
 * them, so they get the mid tier one.
 *
 * Two of those four are rows here. `gate` became a screen rather than a route,
 * and `doctor` became the second way into Help.
 */
const UTILITY_ROUTES: readonly string[] = ['status', 'help'];

/**
 * The runaway guard, per engine. REPLIT-BUILD.md:437, word for word: brain 80,
 * content 60, everything else 40.
 *
 * The Brain gets the most because it is an interview and a founder answering
 * twenty questions is twenty turns before anything is written.
 */
const MAX_TURNS: Readonly<Record<string, number>> = {
  'founder-brain': 80,
  'content-engine': 60,
};

const MAX_TURNS_DEFAULT = 40;

/**
 * One content row, plus the two fields a run needs and a sidebar does not.
 *
 * `session` is narrowed rather than carried across. The content table answers
 * "when is this done" with `weekend`, `any` and `before the print deadline` as
 * well as with numbers, because a founder reads that column. This module prints
 * a session number in the run header and has nothing to print for the rest, so
 * they become null. Nothing is lost: the content table is still the place that
 * question is answered.
 */
export function toAgentRoute(row: ContentRouteRow): RouteRow {
  return {
    id: row.id,
    label: row.label,
    subtitle: row.subtitle,
    skill: row.skill,
    tracks: row.tracks,
    session: typeof row.session === 'number' ? row.session : null,
    gate: row.gate,
    requires: row.requires,
    produces: row.produces,
    hidden: row.hidden,
    phrases: row.phrases,
    tier: UTILITY_ROUTES.includes(row.id) ? 'utility' : 'primary',
    maxTurns: MAX_TURNS[row.id] ?? MAX_TURNS_DEFAULT,
  };
}

/**
 * The real routing table, in the shape this module speaks.
 *
 * Built once, at load, from data that cannot change while the process is alive.
 */
export const CONTENT_ROUTES: RouteTable = ROUTES.map(toAgentRoute);

/**
 * The production RouteCatalogue.
 *
 * WHY IT EXISTS. The port was declared and never implemented, so the only value
 * that satisfied it was `FIXTURE_ROUTES` in test-fixtures.ts, and that fixture
 * says of itself that it is not the routing table. Plain language routing was
 * therefore proved against invented rows: a phrase that reached `outreach-b2b`
 * in a test would have reached nothing in the app, because the real table calls
 * that row `outreach-engine`. This is what src/server/index.ts passes to the
 * agent so the two are the same table.
 */
export const contentRouteCatalogue: RouteCatalogue = {
  all: () => CONTENT_ROUTES,
};

/**
 * A key in either table above that names no row is a typo, and a typo here is
 * silent: the route quietly runs on the default model and the default turn
 * limit, and the first sign of it is a bill or a run that stops halfway.
 *
 * Checked when this module loads, so the process refuses to start rather than
 * serving 130 founders off a guess. It runs over nine rows and two short lists,
 * so it costs nothing at boot.
 */
function assertTablesNameRealRoutes(): void {
  const ids = new Set(ROUTES.map((r) => r.id));
  const unknown = [...UTILITY_ROUTES, ...Object.keys(MAX_TURNS)].filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    throw new Error(
      [
        `src/server/agent/types.ts names ${unknown.join(', ')} in its model tier or turn limit table.`,
        'app/content/routes.ts has no row with that id, so the setting would be applied to nothing and the route would run on the default.',
        'Fix: correct the id here, or add the row there. The routing table is the one that wins.',
      ].join('\n'),
    );
  }
}

assertTablesNameRealRoutes();
