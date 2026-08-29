/**
 * src/server/routes/auth-api.ts
 *
 * WHAT THIS IS. The three sign in calls the browser bundle makes with fetch:
 * ask for a link, tell a mentor, sign out.
 *
 * WHY IT EXISTS. There are already sign in screens, and they are server
 * rendered on purpose so a founder can get in before the bundle exists and with
 * JavaScript switched off. Those screens post forms and are answered with HTML.
 *
 * The browser bundle is the other half of the same journey and it cannot read
 * HTML. It posts JSON and reads JSON, and until this file existed it posted
 * JSON at three addresses nobody had registered. Every one answered 404, which
 * the interface renders as "There is nothing at that address", so a founder who
 * IS on the roster pressed "Send me a link" and was told their address was
 * wrong. That is the exact failure this file removes: one journey, two
 * renderings, one set of answers.
 *
 * NOTHING NEW IS DECIDED HERE. `magicLink.request` is the same object the form
 * route calls, so the roster lookup, the rate limit, the token pair and the
 * email are identical whichever half a founder came through. If they ever
 * disagree it will be because somebody changed one of these two files, and the
 * shared object is what makes that hard to do by accident.
 *
 * WHAT CALLS IT. ./index.ts registers it. src/web/lib/api.ts calls it.
 *
 * WHAT IT READS. The roster and `signin_tokens`, through the MagicLink object,
 * and the session cookie on the request.
 * WHAT IT WRITES. `signin_tokens`, `sessions` (the revoke behind sign out), one
 * email, and one log line per mentor request.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { sha256Hex } from '../auth/tokens.ts';
import { ERRORS, errorBody } from './errors.ts';
import type { RouteDeps } from './deps.ts';

/** Longer than any real address, short enough that a body cannot be a payload. */
const MAX_EMAIL_BYTES = 254;

/**
 * What a founder can write to a mentor before it is cut.
 *
 * Generous, because somebody explaining which address they booked with may
 * write a paragraph, and bounded, because this route takes text from anybody on
 * the internet and puts it in our log.
 */
const MAX_NOTE_BYTES = 2_000;

function readString(body: unknown, field: string, maxBytes: number): string | null {
  if (body === null || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || Buffer.byteLength(trimmed, 'utf8') > maxBytes) return null;
  return trimmed;
}

/**
 * The cookie name this session arrived under, found rather than configured.
 *
 * The session row's id IS the sha256 of the cookie value, which is what makes a
 * leaked row useless. So the cookie that produced this session is the one whose
 * hash matches the id, and comparing that way needs no cookie name from
 * anywhere. The alternative was a second copy of SESSION_COOKIE_NAME in the
 * route layer, and a second copy of a name is a name that can differ from the
 * first, at which point sign out silently leaves the cookie in place.
 */
function cookieNameOfSession(request: FastifyRequest, sessionId: string): string | null {
  for (const [name, value] of Object.entries(request.cookies)) {
    if (typeof value === 'string' && sha256Hex(value) === sessionId) return name;
  }
  return null;
}

export async function registerAuthApiRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  /**
   * One email field, one button.
   *
   * A rate limited request answers `{ sent: true }`, exactly as the form route
   * shows the same "check your email" screen. That is not a shortcut: telling
   * the caller a limit was hit turns the limit into a way of asking which
   * addresses are on the roster, and the roster is 130 named people.
   */
  app.post('/api/auth/request-link', async (request, reply) => {
    const email = readString(request.body, 'email', MAX_EMAIL_BYTES);
    if (email === null) {
      return reply.code(ERRORS.badRequest.status).send(errorBody(ERRORS.badRequest));
    }

    const outcome = await deps.auth.magicLink.request(email, request.ip);
    if (outcome.kind === 'sent') return reply.send({ sent: true });

    // The four misses are kept apart rather than flattened to "no". A disabled
    // account is not a wrong address, and a founder told the wrong one of those
    // two goes hunting for an address they do not have.
    switch (outcome.miss.kind) {
      case 'malformed':
        return reply.send({ sent: false, reason: 'not_an_address' });
      case 'disabled':
        return reply.send({ sent: false, reason: 'disabled' });
      case 'not_on_roster':
        return reply.send({ sent: false, reason: 'not_on_roster' });
    }
  });

  /**
   * "Tell a mentor", from the sign in screen. Section 6: no dead ends.
   *
   * THE MENTOR QUEUE IS A LOG LINE TODAY, and this writes the same line the
   * form route writes through `PgAuthStore.recordMentorRequest`. There is no
   * mentor queue table in the schema, so a route that inserted one would be
   * inventing a surface nobody reads. When the queue exists, both callers move
   * together, and until then a mentor greps for this message.
   *
   * NOT AUTHENTICATED, and it cannot be: the person using it is the person who
   * could not sign in. So both fields are bounded before they reach the log.
   */
  app.post('/api/auth/mentor-note', async (request, reply) => {
    const email = readString(request.body, 'email', MAX_EMAIL_BYTES);
    if (email === null) {
      return reply.code(ERRORS.badRequest.status).send(errorBody(ERRORS.badRequest));
    }
    const note = readString(request.body, 'note', MAX_NOTE_BYTES) ?? 'no note written';

    deps.log.warn(
      { email, note, at: deps.clock.now().toISOString() },
      'MENTOR QUEUE: somebody could not sign in',
    );
    return reply.send({ queued: true });
  });

  /**
   * Sign out, on this device only.
   *
   * TWO THINGS HAPPEN AND THE ROW IS THE ONE THAT MATTERS. Revoking the session
   * row is what makes the next request 401, whatever the browser still holds.
   * Clearing the cookie is tidiness on top of that. Written in that order, so a
   * failure to clear a cookie cannot leave a live session behind.
   *
   * Sessions are per device with no limit, because founders sign in again on a
   * phone on event day. So this ends one of them and says nothing about the
   * others.
   */
  app.post('/api/auth/sign-out', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const session = request.lhSession;
    if (session === undefined) {
      // requireFounder said yes, so this cannot happen. Refusing rather than
      // answering 204 keeps "signed out" from ever being a thing we said
      // without doing.
      return reply.code(ERRORS.serverFault.status).send(errorBody(ERRORS.serverFault));
    }

    await deps.store.revokeSession(session.id, deps.clock.now());
    const cookieName = cookieNameOfSession(request, session.id);
    if (cookieName !== null) reply.clearCookie(cookieName, { path: '/' });

    deps.log.info({ founderId: session.founderId }, 'signed out on one device');
    return reply.code(204).send();
  });
}
