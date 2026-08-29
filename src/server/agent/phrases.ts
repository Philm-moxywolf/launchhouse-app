/**
 * phrases.ts
 *
 * WHAT: Stage one of plain language routing. Matches what a founder typed
 *       against the trigger phrases already written into the nine skill
 *       descriptions, lifted unchanged.
 *
 * WHY IT EXISTS: A founder who types "write my content" should not pay for a
 *       model call to find out they meant the content engine, and should not
 *       wait for one either. The phrases were written by the people who wrote
 *       the skills, so they are the best list that will ever exist. This is the
 *       free half of routing; intent.ts is the paid half and only runs when
 *       this returns nothing.
 *
 * CALLED BY: router.ts.
 * READS:  the routing table, injected. WRITES: nothing. Pure functions.
 *
 * The match is filtered by track before it is scored. A B2C founder typing
 * "cold email" gets no match rather than the B2B outreach engine, which is
 * rule 1 held here as well as in the sidebar.
 */

import type { RouteId, RouteTable, Track } from './types.js';

/**
 * The trigger phrases, verbatim from the `description:` line of each
 * plugins/growth-engine/skills/<name>/SKILL.md. Forty four of them.
 *
 * They live here rather than being retyped into app/content/routes.ts so there
 * is one copy. routes.ts should spread these into its rows. If a skill
 * description gains a phrase, add it here in the same words the description
 * uses, because the description is the source and this is the copy.
 *
 * The "Session 2 homework" and "Session 3 homework" clauses in those
 * descriptions are deliberately absent. They tell a model when to offer a
 * skill. They are not phrases a founder types.
 */
export const SKILL_DESCRIPTION_PHRASES: Readonly<Record<string, readonly string[]>> = {
  'founder-brain': [
    'build my founder brain',
    'set up my brain',
    'start launchhouse',
    'update my brain',
    'change my track',
  ],
  'content-engine': [
    'build my content engine',
    'generate my posts',
    'write my content',
    'content pillars',
    'my 30 posts',
  ],
  'outreach-b2b': [
    'build my outreach',
    'write my sequence',
    'apollo filters',
    'cold email',
    'first lines',
  ],
  'audience-b2c': [
    'build my audience engine',
    'instagram outreach',
    'dm scripts',
    'my hooks',
    'comment to dm',
  ],
  'ghl-workflows': [
    'build my ops engine',
    'which workflow should i automate',
    'my bottleneck',
    'pick a snapshot',
    'operations engine',
  ],
  'growth-plan': ['build my 90 day plan', 'growth plan', 'what do i do monday'],
  'playbook-export': ['generate my playbook', 'playbook insert', 'print my playbook'],
  setup: [
    'check my setup',
    'am i set up right',
    'something is broken',
    'update the plugin',
    'which folder should i use',
    'cowork or claude code',
    '/doctor',
  ],
  status: [
    'where am i up to',
    'what have i done',
    'launchhouse status',
    'am i ready',
    "what's left",
    'check my progress',
  ],
};

export type PhraseMatch = {
  readonly routeId: RouteId;
  readonly confidence: 'exact' | 'near';
  /** The phrase that matched, so the confirm chip can quote it back. */
  readonly phrase: string;
};

/**
 * Lowercase, drop anything that is not a letter, a digit, a slash or a space,
 * collapse runs of space. Apostrophes go, so "what's left" and "whats left"
 * are one phrase. The slash survives so "/doctor" still matches.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Stage one. Returns the most specific match, or null.
 *
 * Exact beats near, and among near matches the longest phrase wins, because
 * "build my content engine" and "write my content" can both sit inside one
 * sentence and the longer one is the one the founder meant.
 */
export function matchPhrase(
  text: string,
  routes: RouteTable,
  track: Track,
): PhraseMatch | null {
  const typed = normalise(text);
  if (typed.length === 0) return null;

  let best: PhraseMatch | null = null;
  let bestLength = -1;

  for (const row of routes) {
    // Rule 1. The other track's rows are not candidates, so they cannot win.
    if (!row.tracks.includes(track)) continue;
    for (const raw of row.phrases) {
      const phrase = normalise(raw);
      if (phrase.length === 0) continue;
      if (typed === phrase) {
        // An exact match ends it. Nothing can be more specific than this.
        return { routeId: row.id, confidence: 'exact', phrase: raw };
      }
      if (containsWhole(typed, phrase) && phrase.length > bestLength) {
        best = { routeId: row.id, confidence: 'near', phrase: raw };
        bestLength = phrase.length;
      }
    }
  }
  return best;
}

/**
 * Whole word containment. "my hooks" must not match "my hooksmith", and
 * "cold email" must not match inside a longer word. Both strings are already
 * normalised, so a space either side is the whole test.
 */
function containsWhole(haystack: string, needle: string): boolean {
  const padded = ` ${haystack} `;
  return padded.includes(` ${needle} `);
}
