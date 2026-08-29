/**
 * app/content/routes.ts
 *
 * WHAT IT IS
 * The routing table. Every skill, how a founder reaches it, what it needs
 * first, and which track it belongs to. Also the one place `Track` and `Model`
 * are turned into a route name.
 *
 * WHY IT EXISTS
 * Rule 1 says the fork happens once, in the Founder Brain, and every later step
 * reads it. In the plugin that was a sentence the model was trusted to obey:
 * `commands/engine2.md` said "check the track field" and hoped. Here it is a
 * server side filter on this table, so a B2C founder has no row that could
 * start the B2B engine. The other track's rows are absent, not greyed out.
 *
 * It also settles F3 in `planning/REPLIT-BUILD.md` section 9. Two vocabularies
 * describe one fork: `schemas/brain.md` stores `Track` of b2b or b2c and
 * `Model` of service or ecommerce, while `planning/delivery/00-scope.md:62`
 * names three routes, b2b, b2c-service and b2c-ecom. `routeFor()` below is the
 * only code that maps between them. Nothing else computes it.
 *
 * WHAT CALLS IT
 * The sidebar, the intent router, the gates screen, the run assembler that
 * builds the run context header, and the snapshot chooser.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is data plus two pure functions.
 *
 * SOURCES
 * Subtitles are the `description:` lines of `plugins/growth-engine/commands/`,
 * lifted unchanged except where noted. Phrases are the trigger phrases already
 * written into the nine skill descriptions, lifted unchanged. File names come
 * from `app/content/gates.md`, and a test asserts the two agree.
 */

/** What the founder answered in the Brain. `Track` is asked of everyone. */
export type Track = "b2b" | "b2c";

/** `Model` is asked of B2C founders only. Asking a B2B founder would be showing them the other track. */
export type Model = "service" | "ecommerce";

/** The three routes of `00-scope.md:62`. Derived, never stored as the truth. */
export type RouteName = "b2b" | "b2c-service" | "b2c-ecom";

/** Which gate a row's output counts towards. */
export type GateId = "A" | "B" | "C";

/** When the row is done. Sessions are numbered; the rest are named. */
export type Session = 1 | 2 | 3 | "weekend" | "before the print deadline" | "any";

export interface RouteRow {
  /** Stable id. Used in URLs, in the intent classifier's enum, and in logs. */
  readonly id: string;
  /** What the sidebar calls it. Short, plain, a noun. */
  readonly label: string;
  /** One line under the label. */
  readonly subtitle: string;
  /** The directory under `app/content/skills/` whose body this row runs. */
  readonly skill: string;
  /** Which tracks see this row. A founder never sees a row for the other track. */
  readonly tracks: readonly Track[];
  readonly session: Session;
  /** The gate this row's output counts towards, or null when no gate counts it. */
  readonly gate: GateId | null;
  /** Files that must exist before this row can run. */
  readonly requires: readonly string[];
  /** Files this row writes. */
  readonly produces: readonly string[];
  /** True when the row is ported but not offered. */
  readonly hidden: boolean;
  /** Why it is hidden. Required whenever `hidden` is true. */
  readonly hiddenBecause?: string;
  /** Plain language a founder might type. Matched before any model call. */
  readonly phrases: readonly string[];
}

/**
 * The rows, in build order.
 *
 * Build order, not alphabetical, because the sidebar is also the answer to
 * "what do I do next". `.state/index.md` is already built in this order and
 * rendering a different one would be a second answer to the same question.
 */
export const ROUTES: readonly RouteRow[] = [
  {
    id: "founder-brain",
    label: "Founder Brain",
    subtitle: "Build or update your Founder Brain, the foundation for everything else",
    skill: "founder-brain",
    tracks: ["b2b", "b2c"],
    session: 1,
    gate: "A",
    requires: [],
    produces: ["founder-brain.md"],
    hidden: false,
    phrases: [
      "build my founder brain",
      "set up my brain",
      "start launchhouse",
      "update my brain",
      "change my track",
    ],
  },
  {
    id: "content-engine",
    label: "Content Engine",
    subtitle: "Define your content pillars and generate your 30 posts or scripts",
    skill: "content-engine",
    tracks: ["b2b", "b2c"],
    session: 2,
    gate: "B",
    requires: ["founder-brain.md"],
    produces: ["content-30.md", "content-30.csv", "rss-feeds.md"],
    hidden: false,
    phrases: [
      "build my content engine",
      "generate my posts",
      "write my content",
      "content pillars",
      "my 30 posts",
    ],
  },
  {
    // The one founder-facing string section 3 group F says has to be split.
    // `commands/engine2.md:2` reads "Build your outreach engine (B2B) or
    // audience engine (B2C)", which names both tracks in one string. Half of
    // it goes here and half goes to the row below, so neither founder ever
    // reads the other track's name.
    id: "outreach-engine",
    label: "Outreach Engine",
    subtitle: "Build your outreach engine",
    skill: "outreach-b2b",
    tracks: ["b2b"],
    session: 3,
    gate: "C",
    requires: ["founder-brain.md"],
    produces: ["outreach-sequence.md", "outreach-firstlines.csv"],
    hidden: false,
    phrases: [
      "build my outreach",
      "write my sequence",
      "apollo filters",
      "cold email",
      "first lines",
    ],
  },
  {
    id: "audience-engine",
    label: "Audience Engine",
    subtitle: "Build your audience engine",
    skill: "audience-b2c",
    tracks: ["b2c"],
    session: 3,
    gate: "C",
    requires: ["founder-brain.md"],
    produces: ["dm-openers.md", "hook-bank.md", "inbound-scripts.md"],
    hidden: false,
    phrases: [
      "build my audience engine",
      "instagram outreach",
      "dm scripts",
      "my hooks",
      "comment to dm",
    ],
  },
  {
    id: "ops-engine",
    label: "Operations Engine",
    subtitle: "Find your bottleneck, choose a GoHighLevel snapshot, and write the copy",
    skill: "ghl-workflows",
    tracks: ["b2b", "b2c"],
    session: 3,
    gate: "C",
    requires: ["founder-brain.md"],
    produces: ["ops-workflow.md"],
    hidden: false,
    phrases: [
      "build my ops engine",
      "which workflow should i automate",
      "my bottleneck",
      "pick a snapshot",
      "operations engine",
    ],
  },
  {
    id: "growth-plan",
    label: "90 Day Plan",
    subtitle: "Build your 90-day growth plan (Sunday in Atlanta)",
    skill: "growth-plan",
    tracks: ["b2b", "b2c"],
    session: "weekend",
    gate: null,
    requires: ["founder-brain.md"],
    produces: ["90-day-plan.md"],
    hidden: false,
    phrases: ["build my 90 day plan", "growth plan", "what do i do monday"],
  },
  {
    id: "status",
    label: "Progress",
    subtitle: "Check where you are up to and what is outstanding",
    skill: "status",
    tracks: ["b2b", "b2c"],
    session: "any",
    gate: null,
    requires: [],
    produces: [],
    hidden: false,
    phrases: [
      "where am i up to",
      "what have i done",
      "launchhouse status",
      "am i ready",
      "what's left",
      "check my progress",
    ],
  },
  {
    id: "help",
    label: "Help",
    // Not the `commands/setup.md` subtitle. That one said "find your working
    // folder", which is the app's job now, and section 3 group D deletes every
    // mention of a folder from this skill.
    subtitle: "Ask a question, or tell us something is broken",
    skill: "help",
    tracks: ["b2b", "b2c"],
    session: "any",
    gate: null,
    requires: [],
    produces: [],
    hidden: false,
    phrases: [
      "check my setup",
      "am i set up right",
      "something is broken",
      "help",
      "is this working",
      "doctor",
    ],
  },
  {
    id: "playbook-export",
    label: "Playbook Insert",
    subtitle: "Generate your personalised playbook insert",
    skill: "playbook-export",
    tracks: ["b2b", "b2c"],
    session: "before the print deadline",
    gate: null,
    requires: ["founder-brain.md"],
    produces: ["playbook-insert.md"],
    hidden: true,
    hiddenBecause:
      "planning/delivery/00-scope.md:54. Not built in v1.0: it compiles an insert from files " +
      "that are all still changing shape. The body is ported so it is ready, and the row is " +
      "not offered.",
    phrases: ["generate my playbook", "playbook insert", "print my playbook"],
  },
];

/**
 * Screens a plain language phrase can legitimately mean, which are not engine
 * runs.
 *
 * `commands/gate.md` became the Gates screen and `commands/doctor.md` became
 * the second way into Help, so the two commands that were not skills still
 * need somewhere for a typed phrase to land. Without this the router would
 * either start an engine the founder did not ask for or say it did not
 * understand, and both are worse than opening the right screen.
 */
export const SCREEN_DESTINATIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly phrases: readonly string[];
}[] = [
  {
    id: "gates",
    label: "Gates",
    subtitle: "Produce your gate submission summary to paste into the gate form",
    phrases: ["gate submission", "my gate", "gate form", "submit my gate"],
  },
  {
    id: "files",
    label: "Files",
    subtitle: "Everything you have made, to read or download",
    phrases: ["my files", "download my files", "where are my files", "show me my files"],
  },
];

/** The rows a founder on this track can see. */
export function routesForTrack(track: Track): RouteRow[] {
  return ROUTES.filter((r) => !r.hidden && r.tracks.includes(track));
}

export function routeById(id: string): RouteRow | undefined {
  return ROUTES.find((r) => r.id === id);
}

/**
 * True when this row may be started by this founder.
 *
 * The guard, not a hint. It is checked server side on every start, because the
 * sidebar not showing a row is presentation and presentation can be bypassed
 * by typing a URL.
 */
export function routeIsVisibleTo(id: string, track: Track): boolean {
  const row = routeById(id);
  return row !== undefined && !row.hidden && row.tracks.includes(track);
}

/**
 * Match what a founder typed against the phrases of the rows they can see.
 *
 * Track first, always. A B2C founder who types "cold email" gets no match,
 * which is correct: there is no cold email on their track, and starting the
 * outreach engine would hand them the other track's material. No match here
 * falls through to the classifier, which is constrained to the same filtered
 * set of ids.
 *
 * Matching is on a lowercased, punctuation-stripped form, so "What's left?" and
 * "whats left" are the same phrase.
 */
export function matchPhrase(typed: string, track: Track): RouteRow | undefined {
  const needle = normalisePhrase(typed);
  if (needle === "") return undefined;
  return routesForTrack(track).find((r) => r.phrases.some((p) => normalisePhrase(p) === needle));
}

export function normalisePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `Track` and `Model` to a route name. F3.
 *
 * Returns null rather than guessing when a B2C founder has no `Model` line.
 * Guessing would pick a snapshot, and the two B2C snapshots are different
 * files with different dependencies. A Brain written before the Model question
 * existed is the normal way to arrive here, so the caller asks the founder
 * rather than treating it as an error.
 *
 * `Model` is ignored on the B2B track because it is never asked of a B2B
 * founder. `schemas/brain.md:81` says so, and asking would be showing them the
 * other track's material.
 */
export function routeFor(track: Track, model: Model | null | undefined): RouteName | null {
  if (track === "b2b") return "b2b";
  if (model === "service") return "b2c-service";
  if (model === "ecommerce") return "b2c-ecom";
  return null;
}

/** How a route is written on a founder's screen and in the run context header. */
export const ROUTE_LABELS: Readonly<Record<RouteName, string>> = {
  b2b: "b2b",
  "b2c-service": "b2c-service",
  "b2c-ecom": "b2c-ecom",
};

/**
 * The GoHighLevel snapshot each route imports at the clinic.
 *
 * From `planning/delivery/05-routes-and-platforms.md:85`. The keys are ours,
 * not GoHighLevel's: nothing here names a GoHighLevel field, an id or an
 * endpoint, because no spike has run.
 */
export const SNAPSHOT_FOR_ROUTE: Readonly<Record<RouteName, string>> = {
  b2b: "b2b-core",
  "b2c-service": "b2c-service-core",
  "b2c-ecom": "b2c-ecom-core",
};

/**
 * The one time-critical item per track, which the setup rail shows as a
 * conditional card until the Brain locks the track.
 *
 * From `05-routes-and-platforms.md:87`. Both are self-reported at gate A and
 * both are the things that quietly break the weekend.
 */
export const TIME_CRITICAL_ITEM: Readonly<Record<Track, string>> = {
  b2b: "A sending domain with SPF, DKIM and DMARC configured.",
  b2c: "Instagram converted to Business or Creator, and linked to a Facebook Page.",
};
