/**
 * src/server/routes/index.ts
 *
 * WHAT THIS IS. One function that registers every API route, and the register
 * of open streams that graceful shutdown needs a handle on.
 *
 * WHY IT EXISTS. So there is one list of what this app exposes. A route
 * registered from three different files is a route somebody forgets when they
 * go looking for what is reachable, and "what is reachable" is the first
 * question in any conversation about a closed cohort's data.
 *
 * THE LIST IS ALSO A CONTRACT. `contract.test.ts` walks it against every path
 * src/web/lib/api.ts names and fails in both directions: a path the browser
 * calls with no route here, and a route here nothing calls. 795 green tests
 * once said nothing while fifteen of the browser's calls answered 404, and this
 * is the file that list is read from.
 *
 * WHAT CALLS IT. src/server/index.ts, once, after the auth plugin.
 * WHAT IT READS AND WRITES. Nothing of its own.
 */

import type { FastifyInstance } from 'fastify';

import { registerFileRoutes } from './files.ts';
import { registerGateRoutes } from './gates.ts';
import { registerHomeRoute } from './home.ts';
import { registerSetupRoutes } from './setup.ts';
import { registerMessageRoutes } from './messages.ts';
import { registerStreamRoute, OpenStreams } from './stream.ts';
import { registerThreadRoutes } from './threads.ts';
import type { RouteDeps } from './deps.ts';

export interface RegisteredRoutes {
  readonly streams: OpenStreams;
}

export async function registerApiRoutes(app: FastifyInstance, deps: RouteDeps): Promise<RegisteredRoutes> {
  const streams = new OpenStreams();
  /**
   * SIGN IN IS NOT IN THIS LIST, AND THAT IS THE CHANGE WORTH READING.
   *
   * There used to be a ./auth-api.ts registered first, holding the three JSON
   * calls the browser made on the way in: ask for a link, tell a mentor, sign
   * out. The first two went with the magic link and the roster. The third moved
   * into src/server/auth/plugin.ts, next to the form route it mirrors, because
   * the session id is derived from the cookie AND the passphrase now and that
   * comparison cannot be made outside that folder.
   *
   * So `createAuth(...).register` is the whole of the sign in surface, and
   * src/server/index.ts registers it before this function is called. The list
   * below is everything behind the door, in a founder's own order: see where
   * you are, set up, work, take it away.
   */
  await registerHomeRoute(app, deps);
  await registerSetupRoutes(app, deps);
  await registerGateRoutes(app, deps);
  await registerThreadRoutes(app, deps);
  await registerMessageRoutes(app, deps);
  await registerStreamRoute(app, deps, streams);
  await registerFileRoutes(app, deps);
  return { streams };
}

export { OpenStreams } from './stream.ts';
export { QueueTurnExecutor, notWiredRun, type RunTurn } from './turn-executor.ts';
export { TurnEventBus, TurnEvents } from './events.ts';
export { MAX_MESSAGE_BYTES, checkSendBody } from './messages.ts';
export { mayStart, visibleRoutes } from './threads.ts';
export { nextRouteId, progressOf } from './home.ts';
export { gateFileStatus, presentFiles, trackFilter, trackOf } from './founder-state.ts';
export { isRealTimezone, looksLikeAToken, SETUP_ERRORS } from './setup.ts';
export { FILE_ERRORS, listRowsFor, safeDecode } from './files.ts';
export { buildZip, crc32, ZipTooLarge } from './zip.ts';
export { SSE_HEADERS, SseStream, formatFrame, parseLastEventId } from './sse.ts';
export { ERRORS, errorBody } from './errors.ts';
export type * from './ports.ts';
export type { RouteDeps, QueueLike } from './deps.ts';
