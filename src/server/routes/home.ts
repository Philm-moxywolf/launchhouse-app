/**
 * src/server/routes/home.ts
 *
 * WHAT THIS IS. `GET /api/home`. Where a founder is up to, and what they should
 * do next.
 *
 * WHY IT EXISTS. It is the first screen after sign in and it is the answer to
 * "what am I supposed to be doing". Until this route existed the browser asked
 * for it, got a 404, and rendered "This part is not connected yet" under a
 * greeting, which is a founder who has just signed in and cannot see a single
 * thing to press.
 *
 * WHY THE SERVER DECIDES WHAT IS NEXT, and not the screen. The rule is the same
 * table the sidebar is built from, and progress depends on which files exist,
 * which only the server can see. A browser that worked it out would need the
 * file list as well, and then two pieces of code would answer one question.
 *
 * RULE 1 IS STRUCTURAL HERE. The map is built from `visibleRoutes(track)` and
 * nothing else, so a B2C founder's response has no key named after the B2B
 * engine, not even one saying not started. The other track's rows are absent,
 * and absent is the point. Before the Brain locks a track there is no track, so
 * only the rows belonging to both appear: guessing one to have more to show
 * would be wrong for half the cohort.
 *
 * WHAT IT DOES NOT CLAIM. `done` means every file that row produces exists and
 * has something in it. It does not mean the work is good, and nothing here
 * judges content. That is rule 5 at the level of a progress chip.
 *
 * WHAT CALLS IT. ./index.ts registers it. The home screen calls it on load.
 * WHAT IT READS. `threads` and `ge_file`, founder scoped, and the routing table.
 * WHAT IT WRITES. Nothing.
 */

import type { FastifyInstance } from 'fastify';

import { ROUTES, type RouteRow } from '../../../app/content/routes.ts';
import { presentFiles, trackFilter } from './founder-state.ts';
import { mayStart } from './threads.ts';
import type { ThreadRow } from './ports.ts';
import type { RouteDeps } from './deps.ts';

export type RouteProgress = 'not_started' | 'in_progress' | 'done';

export interface RouteProgressRow {
  readonly progress: RouteProgress;
  /** The thread to reopen, or null when this row has never been started. */
  readonly threadId: string | null;
}

/**
 * How far along one row is.
 *
 * A row that produces nothing can never be `done`, and the two rows in that
 * position are Progress and Help, which are conversations rather than work with
 * an output. Marking them done because they produce nothing would put a tick on
 * something the founder has not touched.
 */
export function progressOf(
  row: RouteRow,
  present: readonly string[],
  thread: ThreadRow | undefined,
): RouteProgressRow {
  const produced = row.produces.length > 0 && row.produces.every((f) => present.includes(f));
  const progress: RouteProgress = produced ? 'done' : thread === undefined ? 'not_started' : 'in_progress';
  return { progress, threadId: thread?.id ?? null };
}

/**
 * The row a founder should do next, in build order.
 *
 * Build order rather than most recently touched, because the list is also the
 * answer to "what comes first" and `.state/index.md` is already built in this
 * order. A row whose inputs are missing is skipped rather than offered: sending
 * somebody into the Content Engine with no Brain produces a generic answer and
 * teaches them the tool is generic.
 *
 * Null when there is nothing to do, which is a real state for most of
 * September, and the screen says so rather than showing a half finished bar.
 */
export function nextRouteId(
  rows: readonly RouteRow[],
  present: readonly string[],
  progress: Readonly<Record<string, RouteProgressRow>>,
): string | null {
  for (const row of rows) {
    if (progress[row.id]?.progress === 'done') continue;
    if (!row.requires.every((f) => present.includes(f))) continue;
    return row.id;
  }
  return null;
}

export async function registerHomeRoute(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  app.get('/api/home', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const mayShow = trackFilter(deps, founder, reply);
    if (mayShow === null) return reply;

    const [files, threads] = await Promise.all([
      deps.store.listFiles(founder.id),
      deps.store.listThreads(founder.id),
    ]);
    const present = presentFiles(files, mayShow);

    // Rule 1. Built from the founder's own rows, so the other track's ids are
    // not keys in this object at all.
    const visible = ROUTES.filter((r) => !r.hidden && mayStart(r.id, founder.track) === 'ok');

    /**
     * The newest thread per row, because a founder who started the Brain twice
     * should carry on in the one they were last in rather than the one they
     * abandoned. `createdAt` and not `lastTurnAt`: a thread with no turns yet
     * has no last turn, and that is exactly the thread somebody opened a
     * moment ago.
     */
    const newest = new Map<string, ThreadRow>();
    for (const thread of threads) {
      const held = newest.get(thread.routeId);
      if (held === undefined || thread.createdAt.getTime() > held.createdAt.getTime()) {
        newest.set(thread.routeId, thread);
      }
    }

    const routes: Record<string, RouteProgressRow> = {};
    for (const row of visible) routes[row.id] = progressOf(row, present, newest.get(row.id));

    return reply.send({
      routes,
      nextRouteId: nextRouteId(visible, present, routes),
      presentFiles: present,
    });
  });
}
