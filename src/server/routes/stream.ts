/**
 * src/server/routes/stream.ts
 *
 * WHAT THIS IS. `GET /api/threads/:id/stream`. The server sent events
 * connection a founder holds open while they work, and the register of open
 * ones that graceful shutdown drains.
 *
 * WHY IT EXISTS. Output is one way, so it is a stream and not a socket. SSE
 * reconnects natively with Last-Event-ID, it survives proxies, and it is about
 * forty lines of server code. Founder input goes over an ordinary POST that
 * returns 202 immediately, on a separate connection, so a dropped output stream
 * cannot lose an accepted message.
 *
 * The failures this file is written against:
 *
 *   A STREAM FOR SOMEBODY ELSE'S THREAD. The thread is resolved with the
 *   founder id from the cookie before a single header is written. A thread that
 *   is not theirs is not found, which is both true and all they are told.
 *
 *   A HIJACKED REPLY THAT LEAKS. Fastify is told to stop managing this response
 *   so the stream can outlive the handler. From that moment nothing else will
 *   close it, so every open stream is registered and every exit path closes it.
 *   130 founders reloading a page must not leave 130 subscriptions behind.
 *
 *   A SHUTDOWN THAT LOOKS LIKE A CRASH. On SIGTERM the streams are told what is
 *   happening as a comment before the socket goes, so a browser reconnecting
 *   with its Last-Event-ID picks up where it left off rather than a founder
 *   watching a page die mid sentence.
 *
 * WHAT CALLS IT. ./index.ts registers it. src/server/index.ts calls
 * `closeAll` during shutdown.
 *
 * WHAT IT READS. `threads` and `turn_events`, through the AppStore, founder scoped.
 * WHAT IT WRITES. One socket per founder. Nothing durable.
 */

import type { FastifyInstance } from 'fastify';

import { ERRORS, errorBody } from './errors.ts';
import { SSE_HEADERS, SseStream, parseLastEventId, type SseSink } from './sse.ts';
import type { RouteDeps } from './deps.ts';

/**
 * Every stream this process has open.
 *
 * Exists so shutdown has something to drain and so the ops screen can answer
 * "how many people are connected" without counting sockets by hand.
 */
export class OpenStreams {
  private readonly open = new Set<SseStream>();

  add(stream: SseStream): () => void {
    this.open.add(stream);
    return () => this.open.delete(stream);
  }

  get size(): number {
    return this.open.size;
  }

  /** Say why, then close. The comment is what turns a shutdown into a reconnect. */
  closeAll(reason: string): void {
    for (const stream of [...this.open]) {
      stream.say(reason);
      stream.close();
    }
    this.open.clear();
  }
}

export async function registerStreamRoute(
  app: FastifyInstance,
  deps: RouteDeps,
  streams: OpenStreams,
): Promise<void> {
  app.get('/api/threads/:id/stream', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const { id: threadId } = request.params as { id: string };

    // Founder scoped, before a byte of the stream is written. Once the headers
    // are out there is no way to send an error a browser will show.
    const thread = await deps.store.findThread(founder.id, threadId);
    if (thread === null) return reply.code(ERRORS.noSuchThread.status).send(errorBody(ERRORS.noSuchThread));

    const q = request.query as { lastEventId?: string };
    const lastEventId = parseLastEventId(request.headers['last-event-id'] as string | undefined, q.lastEventId);

    // From here Fastify stops managing this response. Nothing else will close
    // it, which is why every path below ends at stream.close().
    reply.hijack();
    reply.raw.writeHead(200, { ...SSE_HEADERS });
    // Ask the kernel not to hold small writes back. Without this, Nagle can sit
    // on a one line frame until more bytes arrive, and a founder waits for a
    // word that was written a quarter of a second ago.
    //
    // Checked for rather than called, because `socket` is only a real TCP
    // socket on a real server. Behind a test harness it is a plain writable
    // with no such method, and calling it threw AFTER the headers had gone out,
    // which is the worst place to throw: the founder holds a connection that is
    // never going to carry anything and no error can be sent down it.
    const socket = reply.raw.socket;
    if (socket !== null && typeof socket.setNoDelay === 'function') socket.setNoDelay(true);

    const sink: SseSink = {
      write: (chunk) => {
        // A write to a socket the browser has already dropped throws, and it
        // throws inside a heartbeat timer where there is nobody to catch it.
        if (!reply.raw.writableEnded) reply.raw.write(chunk);
      },
      end: () => {
        if (!reply.raw.writableEnded) reply.raw.end();
      },
    };

    const stream = new SseStream(sink, deps.store, deps.bus, deps.clock, {
      founderId: founder.id,
      threadId,
      lastEventId,
      heartbeatMs: deps.heartbeatMs,
    });

    const forget = streams.add(stream);
    const shut = (why: string) => (): void => {
      // Logged because a stream that closes when nobody expected it to is
      // otherwise invisible: the founder sees nothing arrive and the server
      // sees no error. One line here turns that into a question with an answer.
      deps.log.info({ threadId, why, open: streams.size - 1 }, 'stream closed');
      forget();
      stream.close();
    };
    // THE RESPONSE'S close, NOT THE REQUEST'S. Node emits close on the request
    // when the request itself is complete, and a GET is complete the moment its
    // headers arrive, so listening there tears the stream down immediately.
    // Close on the response means the response finished or the connection went,
    // which is the event that actually says the founder's browser has gone.
    reply.raw.on('close', shut('connection closed'));
    reply.raw.on('error', shut('connection error'));

    try {
      await stream.open();
    } catch (err) {
      deps.log.error({ threadId, err: String(err) }, 'the stream could not be opened');
      shut('open failed')();
    }
    return reply;
  });
}
