/**
 * src/server/auth/plugin.ts
 *
 * WHAT THIS IS. The HTTP surface of sign in, and the guard every other route
 * in the app sits behind.
 *
 * WHY IT EXISTS. It is the one place a request becomes a founder. `requireFounder`
 * reads the cookie, resolves the session, and attaches the founder to the
 * request. No handler anywhere else reads a founder id from a body, a query
 * string or a path, and the way that is kept true is that there is one function
 * that produces one and it takes a cookie.
 *
 * The other failures it prevents:
 *
 *   A form POST that Fastify cannot parse. Fastify parses JSON out of the box
 *   and nothing else. The sign in screens are plain HTML forms, on purpose, so
 *   they work with JavaScript switched off and before the browser bundle
 *   exists. Without the parser registered here they would arrive as an empty
 *   body and a founder would press a button that did nothing.
 *
 *   A session cookie that survives a sign out on one device and not another.
 *   Sessions are per device with no limit, because founders sign in again on a
 *   phone on event day.
 *
 * WHAT CALLS IT. src/server/index.ts registers it once, before the API routes.
 * WHAT IT READS. The cookie on the request, and the AuthStore.
 * WHAT IT WRITES. `signin_tokens`, `sessions` and `ge_event` through the store,
 * one Set-Cookie header, and the pages in ./pages.ts.
 */

import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { MagicLink, type MagicLinkConfig } from './magic-link.ts';
import {
  checkYourEmailPage,
  codePage,
  codeRefusedNotice,
  mentorAskedPage,
  notOnRosterPage,
  signInPage,
  verifyPage,
} from './pages.ts';
import { normaliseEmail } from './roster.ts';
import { cookieOptionsFor, endSession, readSession, slideSession, type SessionConfig } from './session.ts';
import { SigninRateLimiter, type RateLimitConfig } from './rate-limit.ts';
import type { AuthStore, Clock, FounderRow, Logger, Mailer, SessionRow } from './types.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by requireFounder, and by nothing else. Present only on a request
     * that presented a live session cookie belonging to a founder who is not
     * disabled or deleted.
     */
    founder?: FounderRow;
    lhSession?: SessionRow;
  }
}

export interface AuthPluginOptions {
  readonly store: AuthStore;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly log: Logger;
  readonly session: SessionConfig;
  readonly magicLink: MagicLinkConfig;
  readonly rateLimit: RateLimitConfig;
  /**
   * Signs cookies. Not the session secret: the session id in the cookie is 32
   * random bytes already, and signing adds nothing to it. It is here because
   * @fastify/cookie requires one before any cookie can be signed, and a future
   * cookie may need it.
   */
  readonly cookieSecret: string;
}

/**
 * Everything the app needs from auth, handed to the routes so they do not
 * reach into this module's internals.
 */
export interface AuthContext {
  readonly magicLink: MagicLink;
  /** Throws nothing. Replies 401 and returns false when there is no founder. */
  requireFounder(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
  /** The founder on a request that has already passed requireFounder. */
  founderOf(request: FastifyRequest): FounderRow;
}

export class NotSignedIn extends Error {
  constructor() {
    super('This request has no founder on it. requireFounder did not run, or it refused.');
    this.name = 'NotSignedIn';
  }
}

/**
 * Build the sign in surface and the guard that goes with it.
 *
 * `register` takes the root Fastify instance and adds to it directly, rather
 * than being handed to `app.register`. That is deliberate. `app.register`
 * encapsulates: the cookie decorator and the form body parser would exist
 * inside the plugin's own scope and NOT on the API routes, so every
 * authenticated route would read `request.cookies` as undefined and every
 * founder would be signed out. Adding to the root instance is the version of
 * this that works, and it needs no plugin wrapper to do it.
 */
export function createAuth(opts: AuthPluginOptions): {
  register: (app: FastifyInstance) => Promise<void>;
  context: AuthContext;
} {
  const limiter = new SigninRateLimiter(opts.rateLimit, opts.store, opts.clock);
  const magicLink = new MagicLink(opts.magicLink, opts.store, opts.mailer, limiter, opts.clock, opts.log);
  const ttlMinutes = opts.magicLink.tokenTtlMinutes;

  async function attach(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const raw = request.cookies[opts.session.cookieName];
    const lookup = await readSession(opts.store, raw, opts.clock);
    if (!lookup.ok) {
      // Every reason ends at the same answer. Telling a caller that a session
      // id was unknown rather than expired tells them whether they guessed one.
      reply.code(401);
      await reply.send({ error: 'not_signed_in', message: 'Sign in again to carry on. Nothing you have made is affected.' });
      return false;
    }
    request.founder = lookup.founder;
    request.lhSession = lookup.session;

    const moved = await slideSession(opts.store, lookup.session, opts.session, opts.clock);
    if (moved !== null) {
      // The row and the cookie have to move together. A row saying 90 days
      // behind a cookie the browser dropped after 30 is a founder who is signed
      // in according to us and signed out according to their laptop.
      reply.setCookie(opts.session.cookieName, raw ?? '', cookieOptionsFor(opts.session));
    }
    return true;
  }

  const context: AuthContext = {
    magicLink,
    requireFounder: attach,
    founderOf(request: FastifyRequest): FounderRow {
      const founder = request.founder;
      if (founder === undefined) throw new NotSignedIn();
      return founder;
    },
  };

  const register = async (app: FastifyInstance): Promise<void> => {
    await app.register(cookie, { secret: opts.cookieSecret });

    /**
     * Fastify parses JSON and nothing else. The sign in screens are plain HTML
     * forms so that they work with JavaScript off and before dist/web exists,
     * and a form posts urlencoded. Registered here rather than globally so the
     * API routes keep JSON only bodies.
     */
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => {
        try {
          done(null, Object.fromEntries(new URLSearchParams(body as string)));
        } catch (err) {
          done(err instanceof Error ? err : new Error('form body could not be read'), undefined);
        }
      },
    );

    const html = (reply: FastifyReply, code: number, body: string): FastifyReply =>
      reply.code(code).header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store').send(body);

    app.get('/auth/signin', async (request, reply) => {
      const q = request.query as { email?: string; notice?: string };
      return html(reply, 200, signInPage({ prefill: q.email, notice: q.notice }));
    });

    app.post('/auth/request', async (request, reply) => {
      const body = request.body as { email?: string } | undefined;
      const typed = typeof body?.email === 'string' ? body.email : '';
      const outcome = await magicLink.request(typed, request.ip);
      if (outcome.kind === 'miss') return html(reply, 200, notOnRosterPage(outcome.miss));
      return html(reply, 200, checkYourEmailPage(outcome.email, ttlMinutes));
    });

    /**
     * GET CONSUMES NOTHING. This is the whole prefetch defence and it is one
     * line: describeLink reads, it does not spend. A mail scanner that fetches
     * this URL gets a page with a button on it and changes no state at all.
     */
    app.get('/auth/verify', async (request, reply) => {
      const q = request.query as { t?: string };
      const token = typeof q.t === 'string' ? q.t : '';
      const state = token === '' ? ({ kind: 'unknown' } as const) : await magicLink.describeLink(token);
      return html(reply, 200, verifyPage(state, token, ttlMinutes));
    });

    app.post('/auth/verify', async (request, reply) => {
      const body = request.body as { t?: string } | undefined;
      const token = typeof body?.t === 'string' ? body.t : '';
      const outcome = await magicLink.verifyLink(token);
      if (outcome.kind === 'refused') {
        return html(reply, 200, verifyPage({ kind: outcome.reason === 'used' ? 'used' : 'unknown' }, token, ttlMinutes));
      }
      reply.setCookie(opts.session.cookieName, outcome.minted.cookieValue, outcome.minted.cookieOptions);
      // 303 so the browser follows with a GET. A 302 after a POST leaves some
      // clients repeating the POST, and this POST consumes a single use token.
      return reply.code(303).header('location', '/').send();
    });

    app.get('/auth/code', async (request, reply) => {
      const q = request.query as { email?: string };
      return html(reply, 200, codePage({ prefill: q.email }));
    });

    app.post('/auth/code', async (request, reply) => {
      const body = request.body as { email?: string; code?: string } | undefined;
      const typedEmail = typeof body?.email === 'string' ? body.email : '';
      const typedCode = typeof body?.code === 'string' ? body.code : '';
      const outcome = await magicLink.verifyCode(typedEmail, typedCode);
      if (outcome.kind === 'refused') {
        return html(reply, 200, codePage({ prefill: typedEmail, notice: codeRefusedNotice(outcome.reason) }));
      }
      reply.setCookie(opts.session.cookieName, outcome.minted.cookieValue, outcome.minted.cookieOptions);
      return reply.code(303).header('location', '/').send();
    });

    /** The second button on the roster miss screen. No dead ends. */
    app.post('/auth/help', async (request, reply) => {
      const body = request.body as { email?: string } | undefined;
      const typed = typeof body?.email === 'string' ? body.email : '';
      const email = normaliseEmail(typed) ?? typed.trim().slice(0, 254);
      await opts.store.recordMentorRequest(email, 'could not sign in, address not on the roster', opts.clock.now());
      opts.log.warn({}, 'a sign in attempt was passed to the mentor queue');
      return html(reply, 200, mentorAskedPage(email));
    });

    app.post('/auth/signout', async (request, reply) => {
      await endSession(opts.store, request.cookies[opts.session.cookieName], opts.clock);
      reply.clearCookie(opts.session.cookieName, { path: '/' });
      return reply.code(303).header('location', '/auth/signin').send();
    });

    /** Who am I. The browser calls this on load to decide which screen to paint. */
    app.get('/api/me', async (request, reply) => {
      if (!(await attach(request, reply))) return reply;
      const founder = context.founderOf(request);
      return reply.send({
        id: founder.id,
        displayName: founder.displayName,
        timezone: founder.timezone,
        track: founder.track,
      });
    });
  };

  return { register, context };
}
