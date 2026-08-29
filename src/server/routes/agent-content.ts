/**
 * src/server/routes/agent-content.ts
 *
 * WHAT THIS IS. The two content ports the agent loop takes, filled in from
 * app/content: the routing table, adapted to the shape src/server/agent asks
 * for, and the generated skill bodies.
 *
 * WHY IT EXISTS. Three failures.
 *
 *   TWO ROUTING TABLES. app/content/routes.ts is the routing table and the
 *   agent module describes a slightly different one: it needs a model tier and
 *   a turn ceiling per row, and it needs `session` narrowed to a number or
 *   null. Those two extra facts are the agent's own and do not belong in the
 *   content repo's table, which the sidebar and the gates screen also read. So
 *   the adaptation happens here, once, and every consumer keeps reading the one
 *   table. A second hand written table is how a row ends up visible in the
 *   sidebar and unreachable by the router.
 *
 *   A ROUTE WITH NO CEILING. `maxTurns` is the runaway guard. A row added
 *   without one would default to whatever the SDK defaults to, which is a
 *   number nobody in this project chose. The table below names every row, and
 *   the test beside this file fails when a row in app/content/routes.ts has no
 *   entry here, so adding a route forces the decision rather than inheriting a
 *   default.
 *
 *   A FOUNDER WHO HAS NOT FORKED YET. See `skillKeyFor`. It is the one piece of
 *   real behaviour in this file and the comment on it is the long one.
 *
 * WHAT CALLS IT. src/server/index.ts, which hands both objects to the agent
 * module, and src/server/routes/run-turn.ts, which looks a row up per turn.
 *
 * WHAT IT READS. app/content/routes.ts and app/content/skill-bodies.generated.ts,
 * both compiled in. No file is read at run time.
 * WHAT IT WRITES. Nothing.
 */

import { ROUTES, type RouteRow as ContentRouteRow } from '../../../app/content/routes.ts';
import { SKILL_BODIES, SKILL_BODY_SHA256 } from '../../../app/content/skill-bodies.generated.ts';
import type { RouteCatalogue, SkillBodies } from '../agent/ports.ts';
import type { ModelTier, RouteRow, RouteTable, Track } from '../agent/types.ts';

/** The suffix scripts/gen-skill-prompts.ts puts on an unforked twin. */
export const UNFORKED_SUFFIX = '#unforked';

/**
 * Which model tier each row runs on.
 *
 * The build document says the utility model serves status, gate, doctor and the
 * thread digests. Everything else is a founder's voice on the page and runs on
 * the primary model. Written as a full table rather than a default with two
 * exceptions, because "which model wrote this" is the first question asked when
 * a founder says the output sounds generic.
 */
const TIERS: Readonly<Record<string, ModelTier>> = {
  'founder-brain': 'primary',
  'content-engine': 'primary',
  'outreach-engine': 'primary',
  'audience-engine': 'primary',
  'ops-engine': 'primary',
  'growth-plan': 'primary',
  'playbook-export': 'primary',
  status: 'utility',
  help: 'utility',
};

/**
 * The runaway guard, per row. Section 4: brain 80, content 60, everything else 40.
 *
 * The Brain gets the most because it is a genuine interview: eight groups of
 * questions with a founder typing between each one. Content gets 60 because it
 * writes 30 pieces. The rest are one shot and 40 is generous.
 */
const MAX_TURNS: Readonly<Record<string, number>> = {
  'founder-brain': 80,
  'content-engine': 60,
};

const DEFAULT_MAX_TURNS = 40;

/** Only a numbered session survives. 'weekend' and 'any' are not numbers. */
function sessionNumber(session: ContentRouteRow['session']): 1 | 2 | 3 | null {
  return session === 1 || session === 2 || session === 3 ? session : null;
}

/** One content row, in the shape src/server/agent asks for. */
export function toAgentRow(row: ContentRouteRow): RouteRow {
  return {
    id: row.id,
    label: row.label,
    subtitle: row.subtitle,
    skill: row.skill,
    tracks: row.tracks as readonly Track[],
    session: sessionNumber(row.session),
    gate: row.gate,
    requires: row.requires,
    produces: row.produces,
    hidden: row.hidden,
    phrases: row.phrases,
    tier: TIERS[row.id] ?? 'primary',
    maxTurns: MAX_TURNS[row.id] ?? DEFAULT_MAX_TURNS,
  };
}

/** Every row, adapted once at module load. The table does not change at run time. */
const AGENT_ROUTES: RouteTable = ROUTES.map(toAgentRow);

export class ContentRouteCatalogue implements RouteCatalogue {
  all(): RouteTable {
    return AGENT_ROUTES;
  }

  /** One row by id, or null. Used per turn, so it is a lookup and not a scan. */
  byId(id: string): RouteRow | null {
    return this.index.get(id) ?? null;
  }

  private readonly index = new Map(AGENT_ROUTES.map((r) => [r.id, r]));
}

/**
 * The generated bodies, as the SkillBodies port.
 *
 * `get` throws on an unknown key rather than returning an empty string. A run
 * assembled with an empty skill body is a model with no instructions holding a
 * founder's file tools, and it would look like a working run until somebody
 * read what it wrote.
 */
export class GeneratedSkillBodies implements SkillBodies {
  get(skill: string): string {
    const body = SKILL_BODIES[skill];
    if (body === undefined) {
      throw new Error(`no generated body for skill ${skill}. Run: npm run skills:gen`);
    }
    return body;
  }

  keys(): readonly string[] {
    return Object.keys(SKILL_BODIES);
  }

  /** The fingerprint of one body, for the log line that says what is running. */
  hashOf(skill: string): string | null {
    return SKILL_BODY_SHA256[skill] ?? null;
  }
}

/**
 * Which body key a run should use, given what the founder has actually chosen.
 *
 * THIS IS THE TRACKLESS FOUNDER, AND IT IS THE ONE CASE THE PORTS CANNOT SAY.
 *
 * Two skill bodies carry both tracks' prose behind `<!-- TRACK:b2b -->`
 * markers, and assemble.ts strips the other track's blocks before the body
 * reaches the model. For a founder who has forked that is rule 1 working
 * exactly as designed.
 *
 * A founder starting their first Founder Brain has not forked. The intake asks
 * them the fork question in group 2 and then asks the B2B audience questions or
 * the B2C ones in group 3. Strip either block before they have answered and the
 * model can only ask one branch, so roughly half of the 130 are interviewed as
 * the wrong kind of business and the file they walk away with is wrong.
 *
 * `RunFacts.track` is typed `Track`, which is 'b2b' | 'b2c'. There is no value
 * for "not chosen yet", so a FactsSource cannot report the truth and
 * stripOtherTrack cannot be told to keep both. Until the port can carry null,
 * this function points a trackless run at the `#unforked` twin, which is the
 * same body with the marker lines removed and both branches kept. The strip
 * then removes nothing, because there is nothing left to match.
 *
 * The twin is a stable key like any other, so it caches like any other: every
 * founder taking their first Brain run shares one prefix.
 *
 * WHEN THE PORT LEARNS ABOUT NULL, DELETE THIS. The fix is `track: Track | null`
 * on RunFacts and a stripOtherTrack that returns the body unchanged for null.
 * Then this function and the twin both go.
 */
export function skillKeyFor(row: RouteRow, track: Track | null, bodies: SkillBodies): string {
  if (track !== null) return row.skill;
  const twin = `${row.skill}${UNFORKED_SUFFIX}`;
  // Only the two forked bodies have a twin. Everything else falls back to its
  // own key, which is correct: a body with no markers is already unforked.
  return bodies.keys().includes(twin) ? twin : row.skill;
}
