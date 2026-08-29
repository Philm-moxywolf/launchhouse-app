/**
 * src/server/routes/messages.ts
 *
 * WHAT THIS IS. `POST /api/threads/:id/messages`. One founder message, accepted
 * and handed on. Also the stop button.
 *
 * WHY IT EXISTS. This route has one job and three rules, and every one of them
 * is a failure somebody would otherwise find in a live session.
 *
 *   IT RETURNS 202 AND STREAMS NOTHING. Input and output are separate
 *   connections on purpose. A founder message accepted on a connection that
 *   then carries 90 seconds of streamed answer is a message lost when that
 *   connection drops. Here the message and its queued turn are written, the
 *   turn id comes back, and the answer arrives on the stream the browser
 *   already has open. This POST is done in a few milliseconds. Nothing in this
 *   handler waits on a model, a subprocess, or a queue slot.
 *
 *   THE FOUNDER ID COMES FROM THE COOKIE, NEVER FROM THE BODY. There is no
 *   founderId field parsed anywhere in this file. `findThread` is founder
 *   scoped, so a thread id belonging to somebody else resolves to nothing and
 *   the founder reads "we cannot find that conversation", which is true.
 *
 *   A RETRY IS NOT A SECOND MESSAGE. The browser sends a clientMsgId. A unique
 *   index on (thread_id, client_msg_id) makes a retry after a dropped
 *   connection impossible to double send: the second insert writes nothing and
 *   this route hands back the turn id it gave the first time. Without it, a
 *   founder on a venue network taps send once and pays for two turns, and reads
 *   the same question answered twice.
 *
 *   ADMISSION HAPPENS AFTER THE 202, NOT BEFORE IT. The spend gate, the token
 *   bucket and the queue all refuse turns, and a refusal is written as a
 *   `turn_events` row so the reason arrives on the stream. A bare 429 here
 *   would be a status code the interface has to guess a sentence for.
 *
 * WHAT CALLS IT. ./index.ts registers it. The browser calls it on every send.
 * WHAT IT READS. `threads`, through the AppStore, scoped to the cookie's founder.
 * WHAT IT WRITES. `messages` and `turns`, and then hands the turn to the executor.
 */

import type { FastifyInstance } from 'fastify';

import { ERRORS, errorBody } from './errors.ts';
import type { RouteDeps } from './deps.ts';

/** Roughly 50 KB, matching the composer's paste cap. */
export const MAX_MESSAGE_BYTES = 50_000;

/** A client message id is an opaque token from the browser. Bound so it cannot be a payload. */
const CLIENT_MSG_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export interface SendBody {
  readonly text: string;
  readonly clientMsgId: string | null;
}

export type BodyCheck = { ok: true; body: SendBody } | { ok: false; error: (typeof ERRORS)[keyof typeof ERRORS] };

/**
 * Read the body, or say which rule it broke.
 *
 * Separated from the handler because it is the part with the interesting
 * failures in it, and a test that has to stand up an HTTP server to check that
 * an empty message is refused is a test nobody adds a case to.
 */
export function checkSendBody(raw: unknown, maxBytes = MAX_MESSAGE_BYTES): BodyCheck {
  if (raw === null || typeof raw !== 'object') return { ok: false, error: ERRORS.emptyMessage };
  const body = raw as { text?: unknown; clientMsgId?: unknown };

  if (typeof body.text !== 'string' || body.text.trim().length === 0) {
    return { ok: false, error: ERRORS.emptyMessage };
  }
  // Bytes, not characters. A founder pasting a plan full of accented text is
  // measured the way the database and the model measure it.
  if (Buffer.byteLength(body.text, 'utf8') > maxBytes) {
    return { ok: false, error: ERRORS.messageTooLong };
  }

  let clientMsgId: string | null = null;
  if (body.clientMsgId !== undefined && body.clientMsgId !== null) {
    if (typeof body.clientMsgId !== 'string' || !CLIENT_MSG_ID_RE.test(body.clientMsgId)) {
      return { ok: false, error: ERRORS.badClientMsgId };
    }
    clientMsgId = body.clientMsgId;
  }

  return { ok: true, body: { text: body.text, clientMsgId } };
}

export async function registerMessageRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  app.post('/api/threads/:id/messages', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const { id: threadId } = request.params as { id: string };

    const checked = checkSendBody(request.body, deps.maxMessageBytes);
    if (!checked.ok) return reply.code(checked.error.status).send(errorBody(checked.error));

    const thread = await deps.store.findThread(founder.id, threadId);
    if (thread === null) return reply.code(ERRORS.noSuchThread.status).send(errorBody(ERRORS.noSuchThread));
    if (thread.closedAt !== null) return reply.code(ERRORS.threadClosed.status).send(errorBody(ERRORS.threadClosed));

    const accepted = await deps.store.acceptMessage({
      founderId: founder.id,
      threadId,
      text: checked.body.text,
      clientMsgId: checked.body.clientMsgId,
      messageId: deps.ids.message(),
      turnId: deps.ids.turn(),
      at: deps.clock.now(),
    });

    reply.code(202).send({
      turnId: accepted.turnId,
      messageId: accepted.messageId,
      duplicate: accepted.duplicate,
    });

    // After the response, never before it. Admission can wait on the database
    // and the queue can be full, and neither of those may hold up an accept
    // that is already durable.
    //
    // A duplicate is not submitted again. That is the whole point of the unique
    // index: the first send is already queued or already answered.
    if (!accepted.duplicate) {
      setImmediate(() => {
        deps.executor.submit({
          turnId: accepted.turnId,
          threadId,
          founderId: founder.id,
          routeId: thread.routeId,
          priority: accepted.priority,
          text: checked.body.text,
        });
      });
    }
    return reply;
  });

  /**
   * Stop.
   *
   * The partial text that already streamed is persisted, because it is already
   * in `turn_events`, so the founder can read what they stopped rather than
   * watching it vanish. That is a property of writing durably before writing to
   * the socket, and it is why this route does not have to do anything about it.
   */
  app.post('/api/threads/:id/interrupt', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const { id: threadId } = request.params as { id: string };
    const body = request.body as { turnId?: unknown } | undefined;

    const thread = await deps.store.findThread(founder.id, threadId);
    if (thread === null) return reply.code(ERRORS.noSuchThread.status).send(errorBody(ERRORS.noSuchThread));

    // Founder scoped before anything is interrupted. Without this, a turn id
    // from another founder's workspace would stop their run.
    //
    // THE ID IS OPTIONAL, AND THAT IS WHAT MAKES THE BUTTON WORK. Stop is one
    // button on a screen, and the founder does not know a turn id. The browser
    // sends the thread and the server finds what is running on it. An explicit
    // id is still honoured, because a caller that knows exactly which turn it
    // means is more precise than a lookup, and it is the stronger assertion to
    // test against.
    const turn =
      typeof body?.turnId === 'string'
        ? await deps.store.findTurn(founder.id, body.turnId)
        : await deps.store.findActiveTurn(founder.id, threadId);

    if (turn === null || turn.threadId !== threadId) {
      // Nothing is running, so there is nothing to stop. Not a failure: a
      // founder who presses stop as the last word arrives has got what they
      // asked for, and an error here would tell them otherwise.
      if (typeof body?.turnId !== 'string') return reply.code(200).send({ stopped: false });
      return reply.code(ERRORS.noSuchThread.status).send(errorBody(ERRORS.noSuchThread));
    }

    const stopped = await deps.executor.interrupt(turn.id);
    return reply.code(200).send({ stopped });
  });
}
