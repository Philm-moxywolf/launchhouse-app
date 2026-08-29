/**
 * test-fixtures.ts
 *
 * WHAT: A routing table, a founder context, a collecting logger, and the real
 *       CLI's system/init message, for tests.
 *
 * WHY IT EXISTS: This folder is built before app/content/routes.ts, and it must
 *       stay testable after that file exists without importing it. Every unit
 *       here takes its routing table as an argument, so this fixture is what
 *       the tests pass. It is shaped from the nine real skills so the tests are
 *       about the real fork and not an invented one.
 *
 *       IT IS NOT THE ROUTING TABLE. app/content/routes.ts is, and it is owned
 *       by the content side of the build. If the two ever disagree about which
 *       tracks a row belongs to, that file wins and this one is the bug.
 *
 * CALLED BY: the *.test.ts files in this folder. Nothing in production.
 */

import { SKILL_DESCRIPTION_PHRASES } from './phrases.js';
import type { Logger } from './ports.js';
import { EXPECTED_CLI_VERSION, REQUIRED_TOOLS } from './runner.js';
import type { FounderContext, RouteRow, RouteTable, Track } from './types.js';

function row(r: Partial<RouteRow> & Pick<RouteRow, 'id' | 'tracks'>): RouteRow {
  return {
    label: r.id,
    subtitle: '',
    skill: r.id,
    session: null,
    gate: null,
    requires: [],
    produces: [],
    hidden: false,
    phrases: SKILL_DESCRIPTION_PHRASES[r.id] ?? [],
    tier: 'primary',
    maxTurns: 40,
    ...r,
  } as RouteRow;
}

export const FIXTURE_ROUTES: RouteTable = [
  row({
    id: 'founder-brain',
    label: 'Founder Brain',
    subtitle: 'Build or update your Founder Brain, the foundation for everything else',
    tracks: ['b2b', 'b2c'],
    session: 1,
    gate: 'A',
    produces: ['founder-brain.md'],
    maxTurns: 80,
  }),
  row({
    id: 'content-engine',
    label: 'Content Engine',
    subtitle: 'Define your content pillars and generate your 30 posts or scripts',
    tracks: ['b2b', 'b2c'],
    session: 2,
    gate: 'B',
    requires: ['founder-brain.md'],
    produces: ['content-30.md', 'content-30.csv', 'rss-feeds.md'],
    maxTurns: 60,
  }),
  row({
    id: 'outreach-b2b',
    label: 'Outreach Engine',
    subtitle: 'Build your outreach engine',
    tracks: ['b2b'],
    session: 3,
    gate: 'C',
    requires: ['founder-brain.md'],
    produces: ['outreach-sequence.md', 'outreach-firstlines.csv'],
  }),
  row({
    id: 'audience-b2c',
    label: 'Audience Engine',
    subtitle: 'Build your audience engine',
    tracks: ['b2c'],
    session: 3,
    gate: 'C',
    requires: ['founder-brain.md'],
    produces: ['dm-openers.md', 'hook-bank.md', 'inbound-scripts.md'],
  }),
  row({
    id: 'ghl-workflows',
    label: 'Operations Engine',
    subtitle: 'Find your bottleneck, choose a snapshot, and write the copy',
    tracks: ['b2b', 'b2c'],
    session: 3,
    gate: 'C',
    requires: ['founder-brain.md'],
    produces: ['ops-workflow.md'],
  }),
  row({
    id: 'growth-plan',
    label: '90 Day Plan',
    subtitle: 'Build your 90 day growth plan',
    tracks: ['b2b', 'b2c'],
    requires: ['founder-brain.md'],
    produces: ['growth-plan.md'],
  }),
  row({
    id: 'playbook-export',
    label: 'Playbook Insert',
    subtitle: 'Generate your personalised playbook insert',
    tracks: ['b2b', 'b2c'],
    hidden: true,
  }),
  row({
    id: 'setup',
    label: 'Setup',
    subtitle: 'Check your setup and fix common problems',
    tracks: ['b2b', 'b2c'],
    tier: 'utility',
  }),
  row({
    id: 'status',
    label: 'Status',
    subtitle: 'Check where you are up to and what is outstanding',
    tracks: ['b2b', 'b2c'],
    tier: 'utility',
  }),
];

export function routeById(id: string): RouteRow {
  const found = FIXTURE_ROUTES.find((r) => r.id === id);
  if (!found) throw new Error(`no fixture route ${id}`);
  return found;
}

export function founder(track: Track, over: Partial<FounderContext> = {}): FounderContext {
  return {
    founderId: '01JABCDEFGHJKMNPQRSTVWXYZ',
    displayName: 'Priya Raman',
    businessName: 'Lumen Studio',
    track,
    model: track === 'b2b' ? 'service' : 'ecommerce',
    cohortRoute: track === 'b2b' ? 'b2b' : 'b2c-ecom',
    timezone: 'America/New_York',
    workdir: '/tmp/ge/01JABCDEFGHJKMNPQRSTVWXYZ',
    ...over,
  };
}

export interface CollectedLog {
  readonly level: 'info' | 'warn' | 'error';
  readonly obj: Record<string, unknown>;
  readonly msg: string;
}

export function collectingLogger(): Logger & { readonly lines: CollectedLog[] } {
  const lines: CollectedLog[] = [];
  return {
    lines,
    info: (obj, msg) => lines.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => lines.push({ level: 'warn', obj, msg }),
    error: (obj, msg) => lines.push({ level: 'error', obj, msg }),
  };
}

/** A clock the tests wind by hand, so nothing sleeps. */
export function fakeClock(start = 1_700_000_000_000) {
  let now = start;
  const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const t = { at: now + ms, fn, cancelled: false };
      timers.push(t);
      return {
        cancel: () => {
          t.cancelled = true;
        },
      };
    },
    advance(ms: number) {
      now += ms;
      for (const t of [...timers]) {
        if (!t.cancelled && t.at <= now) {
          t.cancelled = true;
          t.fn();
        }
      }
    },
  };
}

/* ------------------------------------------------------------------------- *
 * WHAT THE REAL CLI ACTUALLY SAYS, copied off a real spawn.
 *
 * This lives here, and not in one test file, because it went wrong in two of
 * them at once. Every fake system/init in the suite has to be this shape, or a
 * suite stays green over a CLI that does not exist. That is not a hypothetical:
 * a fake with TodoWrite in the tool list and an empty skills list is what let a
 * bug through that refused every turn, for every founder, on every route, while
 * the suite passed.
 *
 * Verified on 2026-08-29 against @anthropic-ai/claude-agent-sdk 0.3.250, whose
 * bundled CLI reports claude_code_version 2.1.250.
 *
 * Re measure with `npm run prove:init`. It spawns the real CLI with runner.ts's
 * own options, reads the first system/init off the wire, and prints it. If it
 * disagrees with what is below, what is below is the bug.
 * ------------------------------------------------------------------------- */

/**
 * The 16 skills the CLI reports as discovered. It reports all 16 whatever the
 * `skills` option says: [], ['x'], 'all' and omitting it all give the same
 * list. init.skills is a discovery list, and it is invariant, so an empty one
 * here would be a fake asserting a thing the option cannot buy. What actually
 * keeps the model out of them is that Skill is in FORBIDDEN_TOOLS.
 */
export const REAL_CLI_SKILLS = [
  'deep-research',
  'design-sync',
  'dataviz',
  'update-config',
  'verify',
  'debug',
  'code-review',
  'simplify',
  'batch',
  'fewer-permission-prompts',
  'doctor',
  'loop',
  'claude-api',
  'workflow-authoring',
  'run',
  'run-skill-generator',
] as const;

/**
 * The built in half of the real tool list. TodoWrite is absent because 2.1.250
 * does not ship it: asked for by name it is silently dropped, and it is not in
 * the 29 tool default surface either. That absence is the whole point of this
 * constant, so do not add it back without a fresh `npm run prove:init`.
 *
 * A real spawn also carries the mcp__ge__* tools, which vary by test. Callers
 * append their own.
 */
export const REAL_CLI_TOOLS = [...REQUIRED_TOOLS] as const;

/** The two ge tools the agent suite's fake MCP server offers. */
export const FIXTURE_GE_TOOLS = ['mcp__ge__remember', 'mcp__ge__person_add'] as const;

/**
 * One system/init message, as the real CLI sends it. Override any field that a
 * given test needs to differ, which for most of them is only `session_id`.
 */
export function realInit(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'sess-1',
    tools: [...REAL_CLI_TOOLS, ...FIXTURE_GE_TOOLS],
    mcp_servers: [{ name: 'ge', status: 'connected' }],
    model: 'test-primary',
    permissionMode: 'bypassPermissions',
    plugins: [],
    skills: [...REAL_CLI_SKILLS],
    claude_code_version: EXPECTED_CLI_VERSION,
    ...over,
  };
}
