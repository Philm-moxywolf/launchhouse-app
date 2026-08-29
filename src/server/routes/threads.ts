/**
 * src/server/routes/threads.ts
 *
 * WHAT THIS IS. The list of a founder's conversations, one conversation's
 * messages, and starting a new one on a named engine.
 *
 * WHY IT EXISTS. Rule 1 lives here as a server side guard.
 *
 *   Every founder is B2B or B2C. They choose once, in the Founder Brain, and
 *   every step after that reads the track. A sidebar that only shows the rows
 *   for a founder's own track is presentation, and presentation is bypassed by
 *   typing a URL. So starting a thread checks the route against the founder's
 *   track here, on the server, and refuses. A B2C founder cannot start the
 *   outreach engine by guessing its id.
 *
 *   THE TRACK COLUMN IS A CACHE AND IS TREATED AS ONE. The authority is the
 *   Track line in founder-brain.md, refreshed on every harvest. What this route
 *   uses it for is deciding which rows may be started, and the failure mode of a
 *   stale cache here is a founder being told to run the Founder Brain first,
 *   which is recoverable and visible. Reading the file on every request would
 *   mean materialising a folder to answer a list request.
 *
 *   AND BEFORE THE BRAIN EXISTS THERE IS NO TRACK. A founder with no track may
 *   start only the rows that belong to both tracks. That is not a special case
 *   bolted on: it is what "the fork happens once, in the Founder Brain" means
 *   for the request that comes before it.
 *
 * THERE IS NO `GET /api/threads` AND NO `GET /api/routes` ANY MORE. The first
 * listed a founder's conversations and the second listed the rows they may see,
 * and nothing called either one. The screens open a conversation by row id and
 * read what they need from `/api/home`, which already carries the thread per
 * row. Surface nobody calls is surface nobody exercises, and it still has to be
 * answered for when somebody asks what a closed cohort's data is reachable
 * through. `contract.test.ts` is what found them, and it is what stops the next
 * one being added quietly.
 *
 * On the one that went first: It listed the rows a founder may see
 * and nothing called it: the browser paints the rail from the same routing
 * table, imported directly, filtered by the track it already has from
 * `/api/me`. A route nobody calls is surface nobody tests and surface somebody
 * has to reason about when they ask what this app exposes, so it is gone.
 * `mayStart` below is the enforcement and it is still on the path that matters,
 * which is starting a row, not listing one.
 *
 * WHAT CALLS IT. ./index.ts registers it. The thread screen calls it.
 * WHAT IT READS. `threads` and `messages`, founder scoped, and the routing table.
 * WHAT IT WRITES. `threads`.
 */

import type { FastifyInstance } from 'fastify';

import { ROUTES, routeById, type Track } from '../../../app/content/routes.ts';
import { ERRORS, errorBody } from './errors.ts';
import type { RouteDeps } from './deps.ts';

/** How many messages one thread request returns. Enough to paint a conversation. */
const MESSAGE_PAGE = 200;

export function isTrack(value: string | null): value is Track {
  return value === 'b2b' || value === 'b2c';
}

/**
 * May this founder start this row?
 *
 * Written as a function of the track and the id alone so a test can run every
 * row against both tracks and against no track at all, which is the whole of
 * rule 1 at this layer in one loop.
 */
export function mayStart(routeId: string, track: string | null): 'ok' | 'unknown' | 'wrong_track' {
  const row = routeById(routeId);
  if (row === undefined || row.hidden) return 'unknown';
  if (!isTrack(track)) {
    // No Brain yet, so no track yet. Only rows that belong to both tracks can
    // be started, which in practice is the Founder Brain and the help rows.
    return row.tracks.length === 2 ? 'ok' : 'wrong_track';
  }
  return row.tracks.includes(track) ? 'ok' : 'wrong_track';
}

/** The rows this founder may see, with the sidebar's own build order kept. */
export function visibleRoutes(track: string | null): ReadonlyArray<{
  id: string;
  label: string;
  subtitle: string;
  session: string | number;
  gate: string | null;
  requires: readonly string[];
  produces: readonly string[];
}> {
  return ROUTES.filter((r) => !r.hidden && mayStart(r.id, track) === 'ok').map((r) => ({
    id: r.id,
    label: r.label,
    subtitle: r.subtitle,
    session: r.session,
    gate: r.gate,
    requires: r.requires,
    produces: r.produces,
  }));
}

export async function registerThreadRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  /**
   * Open the engine for one row. Starts a conversation, or reopens the one that
   * is already going.
   *
   * REOPENING IS THE WHOLE POINT AND IT USED TO BE MISSING. The thread screen
   * calls this every time it mounts, so a founder who reloaded the page mid
   * interview got a brand new thread and their conversation disappeared. Their
   * words were still in the database and there was no screen that could reach
   * them, which is the worst shape a data loss bug takes: it is not lost, and
   * they cannot tell.
   *
   * An open thread is one with no `closedAt`. A closed one is finished on
   * purpose, so a new one is started beside it rather than reopened.
   */
  app.post('/api/threads', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const body = request.body as { routeId?: unknown; title?: unknown } | undefined;

    if (typeof body?.routeId !== 'string') {
      return reply.code(ERRORS.unknownRoute.status).send(errorBody(ERRORS.unknownRoute));
    }
    switch (mayStart(body.routeId, founder.track)) {
      case 'unknown':
        return reply.code(ERRORS.unknownRoute.status).send(errorBody(ERRORS.unknownRoute));
      case 'wrong_track':
        deps.log.warn({ founderId: founder.id, routeId: body.routeId }, 'a start was refused on track');
        return reply.code(ERRORS.wrongTrack.status).send(errorBody(ERRORS.wrongTrack));
      case 'ok':
        break;
    }

    const routeId = body.routeId;
    const open = (await deps.store.listThreads(founder.id))
      .filter((t) => t.routeId === routeId && t.closedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (open !== undefined) return reply.code(200).send({ threadId: open.id, thread: open });

    const thread = await deps.store.createThread({
      id: deps.ids.thread(),
      founderId: founder.id,
      routeId,
      title: typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim().slice(0, 200) : null,
      at: deps.clock.now(),
    });
    return reply.code(201).send({ threadId: thread.id, thread });
  });

  /**
   * One conversation, in the shape the screen renders.
   *
   * `lastEventId` and `activeTurnId` are the two fields that make a reload
   * lossless. Together they say: you already have everything up to here, and
   * this one is still being written. The browser opens the stream from
   * `lastEventId` and the turn in flight carries on in front of them, rather
   * than the founder watching a finished answer print itself a second time or
   * a half written one never arrive at all.
   *
   * `role` is translated from the database's word to the screen's. `assistant`
   * is what an SDK calls it and `engine` is what the founder is looking at.
   */
  app.get('/api/threads/:id', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const { id } = request.params as { id: string };

    const thread = await deps.store.findThread(founder.id, id);
    if (thread === null) return reply.code(ERRORS.noSuchThread.status).send(errorBody(ERRORS.noSuchThread));

    const messages = await deps.store.listMessages(founder.id, id, MESSAGE_PAGE);
    const active = await deps.store.findActiveTurn(founder.id, id);
    const lastEventId = await deps.store.lastEventIdFor(founder.id, id, active?.id ?? null);

    return reply.send({
      id: thread.id,
      routeId: thread.routeId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role === 'assistant' ? 'engine' : 'founder',
        text: m.text,
        at: m.createdAt.toISOString(),
      })),
      lastEventId,
      activeTurnId: active?.id ?? null,
    });
  });
}
