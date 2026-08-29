/**
 * src/server/routes/gates.ts
 *
 * WHAT THIS IS. `GET /api/gates`. The standing answer to "am I ready", built
 * from what is actually in a founder's folder.
 *
 * WHY IT EXISTS. A gate is what a founder passes to keep their place in the
 * programme, and the worst version of that is finding out on the day that
 * something was missing. The screen is the answer, and it needs one thing from
 * the server that it cannot see for itself: which files exist and whether there
 * is anything in them. Everything else, which gate wants which file and how it
 * is worded, comes from `schemas/gates.md` through `app/content/gates.ts`, so
 * the app, the status engine and a mentor's list read one source and cannot
 * disagree.
 *
 * TWO FIELDS COME BACK EMPTY AND THAT IS THE TRUE ANSWER, not a gap somebody
 * forgot to fill.
 *
 *   `submitted` is when each gate form was sent. Gate forms are Google Forms.
 *   Nothing in this app is told when one is submitted: there is no table for
 *   it, no webhook, and no export step in the build. So every value is null,
 *   and the screen simply does not draw the line saying when it was sent.
 *   Writing a date here from anything else would be inventing proof about
 *   whether a founder has kept their place, which is the most expensive thing
 *   in this product to be wrong about.
 *
 *   `formUrl` is the link to each form. The forms do not exist yet, and their
 *   addresses are not in the environment or in any content file. Null, and the
 *   screen says the form opens after the session, which is true.
 *
 * RULE 1. The file map is filtered by track before it is counted, so a B2C
 * founder's answer carries no key named after a B2B file, not even a missing
 * one. Absent, not greyed out.
 *
 * WHAT CALLS IT. ./index.ts registers it. The gates screen calls it on load.
 * WHAT IT READS. `ge_file`, founder scoped, and the gate table.
 * WHAT IT WRITES. Nothing.
 */

import type { FastifyInstance } from 'fastify';

import { gateFileStatus, trackFilter } from './founder-state.ts';
import type { RouteDeps } from './deps.ts';

/**
 * The three gates, by the ids `schemas/gates.md` gives them.
 *
 * Written out rather than derived from GATES, because GATES holds gate C twice,
 * once per track, and the two would collapse to one key anyway. Three keys, and
 * the screen asks for exactly these three.
 */
const GATE_IDS = ['A', 'B', 'C'] as const;

/** Every gate, at null. Built from the list, so the two cannot fall out of step. */
function allNull(): Record<(typeof GATE_IDS)[number], null> {
  return Object.fromEntries(GATE_IDS.map((id) => [id, null])) as Record<(typeof GATE_IDS)[number], null>;
}

export async function registerGateRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  app.get('/api/gates', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const mayShow = trackFilter(deps, founder, reply);
    if (mayShow === null) return reply;

    const files = await deps.store.listFiles(founder.id);

    return reply.send({
      fileStatus: gateFileStatus(files, mayShow),
      // Both empty on purpose. See the header: there is nothing that tells this
      // app when a Google Form was submitted, and the forms do not exist yet.
      submitted: allNull(),
      formUrl: allNull(),
    });
  });
}
