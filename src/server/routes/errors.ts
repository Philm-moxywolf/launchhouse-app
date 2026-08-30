/**
 * src/server/routes/errors.ts
 *
 * WHAT THIS IS. Every sentence a founder reads when a request does not work,
 * the one shape they are all sent in, and the handler that catches everything
 * nobody wrote a sentence for.
 *
 * WHY IT EXISTS. Three failures.
 *
 *   A status code is not a sentence. A browser handed a bare 404 has to invent
 *   wording for it, and the wording it invents will be wrong on the day it
 *   matters. Every refusal here carries the sentence with it, so the interface
 *   renders text somebody wrote on purpose.
 *
 *   And a founder who has just lost a message needs to know their work is safe
 *   before anything else. That is the doubt to name first. Several of these say
 *   it in as many words, because it is true and because it is the question
 *   being asked.
 *
 *   AND AN EXCEPTION IS NOT A SENTENCE EITHER. It is worse than a status code,
 *   because it is somebody else's writing about our insides. With no handler
 *   installed, Fastify answers a thrown error with that error's own message.
 *   The sign in route reaches Postgres, and the Postgres driver writes its
 *   message as the failed query with the bound parameters printed after it. So
 *   `POST /auth/signin` against a database that does not answer replied 500
 *   with what the founder had just typed, the table name and the column list in
 *   the body. That is a screenshot, in a room, on the day. On this build the
 *   bound parameter would be OWNER_PASSPHRASE, which is the only secret the
 *   whole deployment has.
 *
 *   `installErrorHandler` is the wall. Nothing internal crosses it: no query
 *   text, no bound parameter, no stack, no file path, no table name, no library
 *   error code, no exception message of any kind. The founder gets a plain
 *   sentence and somewhere to go. The detail goes to the log with an incident
 *   id, and the founder is handed the same id to quote.
 *
 *   IT FAILS CLOSED. Anything it does not recognise becomes the 500 sentence
 *   with an incident id, whatever status the thrown thing was carrying. A
 *   refusal we forgot to map then shows up in the log as a question to answer,
 *   rather than as confident wrong advice on a founder's screen.
 *
 * WHAT CALLS IT. Every route file in this folder, for ERRORS and errorBody.
 * src/server/index.ts calls installErrorHandler once inside buildServer, before
 * any route is registered.
 *
 * WHAT IT READS. Nothing. WHAT IT WRITES. One log line per caught failure,
 * through the Logger it is handed, and one response.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// The page shell the sign in screens already use. Imported rather than copied,
// because an error screen with its own styling reads as a different app, which
// is the last thing to show somebody who already thinks something is broken.
// It adds no module to the boot graph: src/server/index.ts loads auth/plugin.ts
// which loads this same file, so nothing new evaluates before loadEnv().
import { escapeHtml, layout } from '../auth/pages.ts';
import type { Logger } from './ports.ts';

export interface FounderError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export const ERRORS = {
  notSignedIn: {
    status: 401,
    code: 'not_signed_in',
    message: 'Sign in again to carry on. Nothing you have made is affected.',
  },
  noSuchThread: {
    status: 404,
    code: 'no_such_thread',
    message: 'We cannot find that conversation. Go back to your list and open it from there.',
  },
  threadClosed: {
    status: 409,
    code: 'thread_closed',
    message: 'That conversation is finished. Start a new one to carry on.',
  },
  emptyMessage: {
    status: 400,
    code: 'empty_message',
    message: 'There is nothing in that message. Type something and send it again.',
  },
  messageTooLong: {
    status: 413,
    code: 'message_too_long',
    message:
      'That is too long to send in one message. Save it as a file and attach it, then the toolkit can read it a piece at a time.',
  },
  badClientMsgId: {
    status: 400,
    code: 'bad_client_msg_id',
    message: 'That message was sent with an id we cannot read. Reload the page and send it again.',
  },
  unknownRoute: {
    status: 400,
    code: 'unknown_route',
    message: 'We do not have anything by that name. Open the list and pick from it.',
  },
  // Rule 1. A founder never sees the other track's material, and the guard is
  // server side because a sidebar that hides a row is presentation, and
  // presentation can be bypassed by typing a URL.
  wrongTrack: {
    status: 403,
    code: 'wrong_track',
    message: 'That one is not on your track. Your list has what applies to you.',
  },
  noSuchFile: {
    status: 404,
    code: 'no_such_file',
    message: 'We cannot find that file. Open your files list and pick it from there.',
  },
  badPath: {
    status: 400,
    code: 'bad_path',
    message: 'That is not a file name we recognise. Open your files list and pick it from there.',
  },
  tooLarge: {
    status: 413,
    code: 'too_large',
    message: 'That download is bigger than we can build in one go. Tell a mentor and somebody will get it to you.',
  },
  /**
   * Nothing at that address. Written here rather than inline in the not found
   * handler, so the 404 a founder reads and the 404 the browser code parses are
   * the same two fields as every other refusal.
   */
  noSuchRoute: {
    status: 404,
    code: 'no_such_route',
    message: 'There is nothing at that address. Open your list and pick from there.',
  },
  /**
   * The request itself could not be read: a body that is not the JSON it says
   * it is, or one that failed a schema. The advice is a reload rather than a
   * retry, because a browser sending a malformed body will send it again.
   */
  badRequest: {
    status: 400,
    code: 'bad_request',
    message: 'That did not arrive in a form we can read. Reload the page and try it again.',
  },
  /** A content type the app does not parse. Same cause, same advice. */
  wrongFormat: {
    status: 415,
    code: 'wrong_format',
    message: 'That was sent in a format we do not read. Reload the page and try it again.',
  },
  serverFault: {
    status: 500,
    code: 'server_fault',
    message:
      'Something on our side went wrong. Nothing you have made is affected. Try again, and tell a mentor if it happens twice.',
  },
} as const satisfies Record<string, FounderError>;

export type ErrorName = keyof typeof ERRORS;

/** The one shape. `code` is for the interface, `message` is for the founder. */
export function errorBody(e: FounderError): { error: string; message: string } {
  return { error: e.code, message: e.message };
}

// --------------------------------------------------------------- incident ids

/**
 * Crockford base 32 with the vowels taken out as well.
 *
 * Crockford already drops I, L, O and U, which is what stops an id being
 * misread off a screen. Taking A, E and Y out too means no id can come out
 * spelling a word, which matters because a founder is going to read this aloud
 * to a mentor across a room with 130 people in it.
 */
const INCIDENT_ALPHABET = '0123456789BCDFGHJKMNPQRSTVWXZ';

/**
 * The id a founder quotes and a mentor greps for.
 *
 * NO HYPHEN IN IT, and that is not decoration. The house style bans a range
 * written with a dash, and `LH92-4KP` reads to the prose rules as the range 92
 * to 4. An id that breaks the writing rules on one roll of the dice is an id
 * that fails a test on a Tuesday and confuses whoever reads it.
 *
 * Eight characters, two of them fixed. Twenty nine to the power of six is about
 * 600 million, against a cohort that will produce a handful of these across
 * three days, so a collision is not the risk. Being readable is.
 */
export function newIncidentId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = 'LH';
  for (const byte of bytes) out += INCIDENT_ALPHABET[byte % INCIDENT_ALPHABET.length] ?? '0';
  return out;
}

/**
 * The 500 sentence with the id in it.
 *
 * The id sits inside the action rather than after it, so the sentence still
 * ends on something to do. `ERRORS.serverFault.message` is the same sentence
 * without an id, for any caller that refuses before anything was logged.
 */
export function serverFaultMessage(incident: string): string {
  return `Something on our side went wrong. Nothing you have made is affected. Try again. If it happens twice, tell a mentor and quote ${incident}.`;
}

// ------------------------------------------------------------- what to answer

/**
 * Whether this request is a browser looking at a page, or code reading JSON.
 *
 * Two rules, and the order matters. Everything under `/api/` is fetched by the
 * browser bundle and is JSON whatever it asks for. Everything else is a sign in
 * screen, and a browser navigating or posting a form always sends an Accept
 * header with text/html in it, while fetch sends `*` or asks for JSON. So a
 * founder who submits the sign in form and hits a fault reads a sentence on a
 * page, not a line of JSON.
 */
export function wantsHtml(request: FastifyRequest): boolean {
  if (request.url.startsWith('/api/')) return false;
  const accept = request.headers.accept;
  return typeof accept === 'string' && accept.includes('text/html');
}

/**
 * The server rendered version of a refusal.
 *
 * Every value is escaped on the way in, with no exception made for the incident
 * id on the grounds that it cannot contain markup. That rule is what keeps the
 * next value somebody adds here safe as well.
 */
export function founderErrorPage(e: FounderError, message: string, incident?: string): string {
  const back =
    e.status === ERRORS.notSignedIn.status
      ? '<p><a href="/auth/signin">Go to the sign in screen</a></p>'
      : '<p><a href="/">Go back to the start</a></p>';
  const quote =
    incident === undefined ? '' : `<p class="quiet">Incident <code>${escapeHtml(incident)}</code></p>\n`;
  return layout(
    headingFor(e),
    `<h1>${escapeHtml(headingFor(e))}</h1>
<p>${escapeHtml(message)}</p>
${quote}${back}`,
  );
}

/** A heading is not the message repeated. It says what happened, in four words. */
function headingFor(e: FounderError): string {
  if (e.status === ERRORS.notSignedIn.status) return 'You are signed out';
  if (e.status === ERRORS.noSuchRoute.status) return 'There is nothing here';
  if (e.status < 500) return 'That did not go through';
  return 'Something went wrong on our side';
}

// ------------------------------------------------------------- the error wall

/**
 * The fields worth reading off a thrown thing, with no assumption that it is an
 * Error at all. A rejected promise can carry a string, a number or a plain
 * object, and a handler that reads `.message` off one of those and hands the
 * result to a founder is the bug this file exists to prevent.
 */
interface Thrown {
  readonly name: string;
  readonly code: string;
  readonly status: number | undefined;
  readonly detail: string;
  readonly stack: string | undefined;
  readonly validation: boolean;
}

function look(err: unknown): Thrown {
  const o: Record<string, unknown> = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
  const status = typeof o['statusCode'] === 'number' ? o['statusCode'] : undefined;
  return {
    name: typeof o['name'] === 'string' ? o['name'] : typeof err,
    code: typeof o['code'] === 'string' ? o['code'] : '',
    status,
    detail: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    validation: o['validation'] !== undefined,
  };
}

/**
 * Fastify's own refusals, and the only ones that keep their status.
 *
 * These four are the client's mistake, not ours, and each has a sentence a
 * founder can act on. Everything else, including any status a thrown thing
 * happens to be carrying, becomes a 500 with an incident id. That is the fail
 * closed half: a 4xx we have not thought about would otherwise reach a founder
 * as advice nobody wrote, and it would leave no trace to go and fix.
 */
function mapped(t: Thrown): FounderError | null {
  if (t.validation) return ERRORS.badRequest;
  switch (t.code) {
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
    case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
      return ERRORS.badRequest;
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return ERRORS.messageTooLong;
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return ERRORS.wrongFormat;
    case 'FST_ERR_NOT_FOUND':
      return ERRORS.noSuchRoute;
    default:
      return null;
  }
}

/**
 * Whether the response is already on its way and cannot be replaced.
 *
 * The stream route calls `reply.hijack()` and writes its own headers, so from
 * that moment Fastify cannot send anything. Trying anyway throws inside the
 * error handler, which is the one place a throw has nowhere left to go: the
 * request hangs and the founder watches a spinner. Checked two ways because
 * hijack and a completed send are different states and either one is fatal to a
 * second send.
 */
function alreadyCommitted(reply: FastifyReply): boolean {
  return reply.sent || reply.raw.headersSent;
}

/**
 * The headers a failed response keeps. There is one, and it is not a decision
 * about wording.
 *
 * `set-cookie` stays because the session rotation that put it there has already
 * been written to the sessions row. Dropping it leaves the browser holding a
 * cookie whose expiry no longer matches the record, which is a founder signed
 * out earlier than the database thinks. Everything else goes.
 */
const KEEP_ON_A_FAILURE: ReadonlySet<string> = new Set(['set-cookie']);

/**
 * Take off every header the route had already set before it threw.
 *
 * WHY, AND IT IS NOT TIDINESS. A reply is a mutable object. A route sets its
 * headers, then does the work, then sends. If the work throws, the headers it
 * set are still on the reply when this handler writes a completely different
 * body onto it.
 *
 * `/api/files/download.zip` is the one that bites. It sets `content-type:
 * application/zip` and `content-disposition: attachment;
 * filename="your-files.zip"`, then builds the archive. A throw in the build
 * used to answer 500 with the right sentence in the body AND the download
 * disposition still attached, so the browser never showed the sentence. It
 * saved a file called your-files.zip containing an error page. The founder
 * finds out it is empty when they open it, which is days later, and by then
 * rule 4 is broken quietly: they think they have their work and they do not.
 *
 * `etag` is the same shape one step further out. An ETag from the body that was
 * never sent lets a later conditional request be answered 304 for a failure.
 *
 * WHAT CALLS IT. The error handler below, on every path that still owns the
 * response. WHAT IT READS AND WRITES. The reply's own header bag, nothing else.
 */
function stripStaleHeaders(reply: FastifyReply): void {
  // Keys copied out first. removeHeader mutates the bag that getHeaders
  // returns, and deleting from an object while iterating its own keys skips
  // entries.
  for (const name of Object.keys(reply.getHeaders())) {
    if (KEEP_ON_A_FAILURE.has(name.toLowerCase())) continue;
    reply.removeHeader(name);
  }
}

export interface ErrorHandlerOptions {
  /** Overridden only by the test that asserts the body's id is the log's id. */
  readonly newIncident?: () => string;
}

/**
 * Install the wall.
 *
 * MUST BE CALLED BEFORE THE ROUTES, and before `app.ready()`. Fastify compiles
 * the error handler into each route's context when the instance becomes ready,
 * so a call afterwards is accepted silently and never runs. That silence is
 * exactly how this hole gets reopened, which is why errors.test.ts drives the
 * real route table rather than trusting the call to be there.
 */
export function installErrorHandler(app: FastifyInstance, log: Logger, options: ErrorHandlerOptions = {}): void {
  const newIncident = options.newIncident ?? newIncidentId;

  app.setErrorHandler((err: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const t = look(err);
    const known = mapped(t);
    const incident = known === null ? newIncident() : undefined;
    const answer = known ?? ERRORS.serverFault;
    const message = incident === undefined ? answer.message : serverFaultMessage(incident);

    // THE URL WITHOUT ITS QUERY STRING. A query string is written by whoever
    // built the link, so what lands in one is not ours to predict, and a log
    // line outlives the request by months. The route pattern is what somebody
    // greps by anyway.
    const path = request.url.split('?')[0] ?? '';
    const seen = {
      incident,
      method: request.method,
      path,
      route: request.routeOptions.url,
      status: answer.status,
      kind: t.name,
      libraryCode: t.code,
      // The inside of the building. This is the failed query with its bound
      // parameters, and it is the whole reason the founder gets a sentence
      // instead. pino's redact list covers the named secrets.
      detail: t.detail,
      stack: t.stack,
    };

    // Wrapped, because a logger that throws inside an error handler turns one
    // broken request into a hung one.
    try {
      if (known === null) log.error(seen, 'a request failed and the founder was given an incident id');
      else log.warn(seen, 'a request was refused before it reached a route');
    } catch {
      // Nothing left to do about it here. The response below still goes.
    }

    if (alreadyCommitted(reply)) {
      // The founder is holding a response that has already started, so there is
      // no body left to write. Close it cleanly rather than leaving the socket
      // open: a browser reading a stream reconnects, and a browser reading a
      // page stops waiting.
      try {
        if (!reply.raw.writableEnded) reply.raw.end();
      } catch {
        // The socket is gone. That is the same outcome as ending it.
      }
      return;
    }

    // The route got as far as setting headers for a body it never sent. Those
    // headers describe that body, not this one, so they come off first.
    stripStaleHeaders(reply);

    // no-store on every one of these. An error page or an error body cached by
    // a proxy is a founder stuck on a failure that is already over.
    reply.header('cache-control', 'no-store');

    if (wantsHtml(request)) {
      return reply
        .code(answer.status)
        .header('content-type', 'text/html; charset=utf-8')
        .send(founderErrorPage(answer, message, incident));
    }
    return reply.code(answer.status).send({ error: answer.code, message, ...(incident === undefined ? {} : { incident }) });
  });
}
