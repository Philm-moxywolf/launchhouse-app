/**
 * src/server/auth/plugin.ts
 *
 * WHAT THIS IS. The HTTP surface of sign in, and the door every other route in
 * this app sits behind.
 *
 * WHY IT EXISTS. It is the one place a request becomes the founder. The session
 * cookie is read here and nowhere else, and no handler anywhere reads a founder
 * id from a body, a query string or a path.
 *
 * THE DOOR IS SHUT BY DEFAULT, AND THAT IS THE CHANGE THAT MATTERS MOST IN THIS
 * FILE. There used to be one `requireFounder` that each route had to remember to
 * call. That is a design where a new route is open until somebody notices, and
 * the thing on the other side of it is one founder's customer list, their
 * credentials and their files, on a public web address. So there is an
 * onRequest hook now: every path under `/api/` is refused unless a session
 * resolves, whatever the route does or does not call. `requireFounder` still
 * exists and still works, and it now reuses what the hook already looked up
 * rather than reading the session twice.
 *
 * The other failures it prevents:
 *
 *   AN UNCONFIGURED DEPLOYMENT SERVING THE APP. With no usable
 *   OWNER_PASSPHRASE, every request is answered with the screen that says which
 *   Replit Secret to set. Not the app, not an empty sign in box that can never
 *   succeed. It refuses whether or not anybody called the boot guard in
 *   ./owner.ts, because a guard that depends on a caller remembering is one
 *   refactor from being decorative.
 *
 *   A FORM POST FASTIFY CANNOT PARSE. Fastify parses JSON out of the box and
 *   nothing else. The sign in screen is a plain HTML form on purpose, so it
 *   works with JavaScript switched off and before dist/web exists, and a form
 *   posts urlencoded. Without the parser registered here the founder would
 *   press a button that did nothing.
 *
 *   THE BINDING SECRET BEING PASSED IN BY HAND. `SessionConfig.bindingSecret`
 *   is what makes changing the passphrase sign every device out. It is built
 *   HERE, from the passphrase, rather than accepted from the caller, so there
 *   is no way for src/server/index.ts to wire a value that is merely plausible
 *   and quietly lose the property.
 *
 * WHAT CALLS IT. src/server/index.ts registers it once, before the API routes.
 * WHAT IT READS. The cookie on the request, and the AuthStore.
 * WHAT IT WRITES. The owner row on first claim, `sessions` and `ge_event`
 * through the store, and one Set-Cookie header.
 */

import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { MIN_PASSPHRASE_LENGTH, OwnerAuth, type OwnerAuthConfig } from './owner.ts';
import { asSignInNotice, notSetUpPage, signInPage, tooManyTriesPage } from './pages.ts';
import { DEFAULT_ATTEMPT_LIMIT, SigninAttempts, type AttemptLimitConfig } from './rate-limit.ts';
import {
  cookieOptionsFor,
  endSession,
  readSession,
  slideSession,
  type SessionConfig,
} from './session.ts';
import { realSleep, type AuthStore, type Clock, type FounderRow, type Logger, type SessionRow, type Sleep } from './types.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by the guard hook below, and by requireFounder. By nothing else.
     * Present only on a request that presented a live session cookie belonging
     * to a founder row that is not disabled or deleted.
     */
    founder?: FounderRow;
    lhSession?: SessionRow;
  }
}

export interface AuthPluginOptions {
  readonly store: AuthStore;
  readonly clock: Clock;
  readonly log: Logger;
  /** OWNER_PASSPHRASE, read through src/server/env.ts. Never process.env. */
  readonly passphrase: string;
  /** The cookie's own settings. The binding secret is NOT here: see below. */
  readonly cookie: {
    readonly name: string;
    readonly ttlDays: number;
    /** True when APP_BASE_URL is https. A Secure cookie over http is never sent back. */
    readonly secure: boolean;
  };
  readonly limits?: AttemptLimitConfig;
  /** Injected so a test can prove the slow down happened without waiting for it. */
  readonly sleep?: Sleep;
  /**
   * Signs cookies. Not the session secret: the session id is derived from 32
   * random bytes and the passphrase already. It is here because
   * @fastify/cookie requires one before any cookie can be signed.
   */
  readonly cookieSecret: string;
}

/**
 * Everything the app needs from auth, handed to the routes so they do not reach
 * into this module's internals.
 */
export interface AuthContext {
  readonly owner: OwnerAuth;
  /** The name the session cookie is written under, for any route that has to clear it. */
  readonly cookieName: string;
  /** Throws nothing. Replies 401 and returns false when there is no founder. */
  requireFounder(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
  /** The founder on a request that has already passed requireFounder. */
  founderOf(request: FastifyRequest): FounderRow;
  /**
   * End the session this request arrived on, and clear its cookie.
   *
   * WHY THE ROUTES LAYER CANNOT DO THIS ITSELF ANY MORE, and it is a good
   * change. It used to find the cookie by hashing every cookie on the request
   * and comparing against the session id. The session id is derived from the
   * cookie AND the passphrase now, so that comparison cannot be made outside
   * this module without handing the passphrase to the routes layer. One method
   * here instead, and the passphrase stays in one folder.
   */
  endSessionOn(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

export class NotSignedIn extends Error {
  constructor() {
    super('This request has no founder on it. requireFounder did not run, or it refused.');
    this.name = 'NotSignedIn';
  }
}

/** The sentence a browser or the bundle is given when there is no session. */
const NOT_SIGNED_IN = {
  error: 'not_signed_in',
  message: 'Sign in again to carry on. Nothing you have made is affected.',
} as const;

/**
 * Is this a browser looking at a page, or code reading JSON.
 *
 * ../routes/errors.ts has the same rule and this is four lines rather than an
 * import of it. This module has to work when the rest of the app is broken:
 * index.ts registers auth before the API routes exist, and a sign in screen
 * that cannot render because a module in the routes layer failed to load is the
 * one screen that must never have that dependency.
 */
function wantsHtml(request: FastifyRequest): boolean {
  if (request.url.startsWith('/api/')) return false;
  const accept = request.headers.accept;
  return typeof accept === 'string' && accept.includes('text/html');
}

/** The path with any query string removed, for prefix tests. */
function pathOf(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Addresses under /api/ that anybody on the internet may reach.
 *
 * IT IS EMPTY, AND KEEPING IT EMPTY IS THE POINT.
 *
 * There used to be a blanket exemption for everything under `/api/auth/`,
 * because signing in was a JSON call and the person making it has no session
 * yet. Signing in is a plain form POST to `/auth/signin` now, which is not
 * under `/api/` at all, so nothing needs the exemption and a prefix that
 * exempts a whole namespace is a door somebody walks through later by naming a
 * route well.
 *
 * ADDING A LINE HERE OPENS THAT ADDRESS TO EVERYONE. Not to a founder, not to a
 * mentor: to whoever finds the URL. That is sometimes right, and it should
 * always be a decision somebody made on purpose in this file rather than a side
 * effect of where a route was filed.
 */
const PUBLIC_API_PATHS: readonly string[] = [];

/**
 * Build the sign in surface and the door that goes with it.
 *
 * `register` takes the root Fastify instance and adds to it directly, rather
 * than being handed to `app.register`. That is deliberate. `app.register`
 * encapsulates: the cookie decorator, the form body parser and the guard hook
 * would exist inside the plugin's own scope and NOT on the API routes, so every
 * authenticated route would read `request.cookies` as undefined, the guard
 * would never run, and every founder would be signed out of an app that was
 * also wide open. Adding to the root instance is the version of this that
 * works, and it needs no plugin wrapper to do it.
 */
export function createAuth(opts: AuthPluginOptions): {
  register: (app: FastifyInstance) => Promise<void>;
  context: AuthContext;
} {
  /**
   * The session config, built here so the binding secret cannot be wired wrong.
   *
   * `bindingSecret` is the passphrase. That is what makes every device sign out
   * when the passphrase changes, and it is the recovery story: a founder who
   * thinks somebody got in edits one Replit Secret and every cookie in the
   * world stops resolving, including their own.
   */
  const session: SessionConfig = {
    cookieName: opts.cookie.name,
    ttlDays: opts.cookie.ttlDays,
    secure: opts.cookie.secure,
    bindingSecret: opts.passphrase,
  };

  const attempts = new SigninAttempts(opts.limits ?? DEFAULT_ATTEMPT_LIMIT, opts.clock);
  const ownerCfg: OwnerAuthConfig = { passphrase: opts.passphrase, session };
  const owner = new OwnerAuth(ownerCfg, opts.store, attempts, opts.clock, opts.sleep ?? realSleep, opts.log);

  /**
   * Resolve the session on a request, attach it, and slide the expiry.
   *
   * Returns false when there is nobody. Idempotent: a request the guard hook
   * already resolved is not read a second time, which is what keeps the hook
   * and `requireFounder` from costing two queries each.
   */
  async function resolve(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (request.founder !== undefined) return true;

    const raw = request.cookies[session.cookieName];
    const lookup = await readSession(opts.store, raw, session, opts.clock);
    if (!lookup.ok) return false;

    request.founder = lookup.founder;
    request.lhSession = lookup.session;

    const moved = await slideSession(opts.store, lookup.session, session, opts.clock);
    if (moved !== null) {
      // The row and the cookie have to move together. A row saying 90 days
      // behind a cookie the browser dropped after 30 is a founder who is signed
      // in according to us and signed out according to their laptop.
      reply.setCookie(session.cookieName, raw ?? '', cookieOptionsFor(session));
    }
    return true;
  }

  async function requireFounder(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (await resolve(request, reply)) return true;
    // Every reason ends at the same answer. Telling a caller that a session id
    // was unknown rather than expired tells them whether they guessed one.
    reply.code(401);
    await reply.send(NOT_SIGNED_IN);
    return false;
  }

  const context: AuthContext = {
    owner,
    cookieName: session.cookieName,
    requireFounder,
    founderOf(request: FastifyRequest): FounderRow {
      const founder = request.founder;
      if (founder === undefined) throw new NotSignedIn();
      return founder;
    },
    async endSessionOn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      await endSession(opts.store, request.cookies[session.cookieName], session, opts.clock);
      reply.clearCookie(session.cookieName, { path: '/' });
    },
  };

  const register = async (app: FastifyInstance): Promise<void> => {
    await app.register(cookie, { secret: opts.cookieSecret });

    /**
     * Fastify parses JSON and nothing else. The sign in screen is a plain HTML
     * form so that it works with JavaScript off and before dist/web exists, and
     * a form posts urlencoded.
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
      reply
        .code(code)
        .header('content-type', 'text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .send(body);

    /**
     * THE DOOR. Registered after the cookie plugin, so `request.cookies` is
     * parsed by the time it runs, and before any route, so it runs for all of
     * them including the ones that do not exist yet.
     *
     * The rules, in order, and each one is a decision:
     *
     *   /healthz always passes. A deployment with no passphrase set must still
     *   report its state to whatever is watching, and a deployment that fails
     *   its health check may never be promoted far enough for the founder to
     *   read the screen telling them what to set.
     *
     *   Nothing works while the passphrase is unusable. Not the app shell, not
     *   the API, not an empty sign in box. One screen, saying which Replit
     *   Secret to set.
     *
     *   /auth/ is the sign in surface itself and cannot require a session,
     *   because the person using it has not got one. It is the only prefix that
     *   is exempt, and PUBLIC_API_PATHS above is the only other way in.
     *
     *   Everything else under /api/ requires a session. This is the line that
     *   makes a route that forgot to call requireFounder safe anyway. It also
     *   means a stranger probing for /api/files gets the same 401 as a stranger
     *   probing for a route that does not exist, which tells them nothing about
     *   what this app has.
     *
     *   Everything else passes: the built browser bundle and its assets. They
     *   are our code, not the founder's work, and the bundle asks /api/me on
     *   load and paints the sign in screen when that answers 401.
     */
    app.addHook('onRequest', async (request, reply) => {
      const path = pathOf(request.url);
      if (path === '/healthz') return;

      const state = owner.readiness();
      if (!state.ready) {
        if (wantsHtml(request)) {
          return html(reply, 503, notSetUpPage(state.reason, MIN_PASSPHRASE_LENGTH));
        }
        reply.code(503);
        return await reply.send({
          error: 'not_set_up',
          message: 'This deployment has no usable OWNER_PASSPHRASE. Set it in Replit Secrets, then redeploy.',
        });
      }

      if (path.startsWith('/auth/')) return;
      if (!path.startsWith('/api/')) return;
      if (PUBLIC_API_PATHS.includes(path)) return;

      if (await resolve(request, reply)) return;

      // Always JSON. Everything that reaches this line is under /api/, which is
      // fetched by the browser bundle, and the bundle reads a 401 here as "not
      // signed in" and paints the sign in screen itself. A page of HTML arriving
      // where JSON was expected is reported as a parse error that has nothing to
      // do with the real cause.
      reply.code(401);
      return await reply.send(NOT_SIGNED_IN);
    });

    /**
     * The sign in screen.
     *
     * IT TOUCHES THE DATABASE ON NO PATH, and that is deliberate rather than
     * incidental. This is the one page that has to render when everything else
     * is broken. Resolving the session here to redirect somebody who is already
     * signed in would be a small courtesy that turns a deployment with an
     * unreachable database into a 500 on the only screen anybody can reach.
     */
    app.get('/auth/signin', async (request, reply) => {
      const q = request.query as { notice?: unknown };
      const notice = asSignInNotice(q.notice);
      return html(reply, 200, notice === null ? signInPage() : signInPage({ notice }));
    });

    /**
     * The one button.
     *
     * `request.ip` is the client key for the per client limit, and it is used
     * and never stored: there is no column for a client address anywhere in the
     * schema. On this deployment it comes from X-Forwarded-For, which whoever
     * is calling gets to write, so ./rate-limit.ts treats it as the weaker half
     * of the defence and says so.
     */
    app.post('/auth/signin', async (request, reply) => {
      const body = request.body as { passphrase?: unknown } | undefined;
      const typed = typeof body?.passphrase === 'string' ? body.passphrase : '';
      const outcome = await owner.signIn(typed, request.ip);

      if (outcome.kind === 'refused') {
        switch (outcome.reason) {
          case 'too_many_tries':
            reply.header('retry-after', String(Math.ceil(outcome.retryAfterMs / 1000)));
            return html(reply, 429, tooManyTriesPage(outcome.retryAfterMs));
          case 'account_closed':
            return html(reply, 403, signInPage({ notice: 'account_closed' }));
          case 'not_set_up': {
            // The hook answers this first in practice. Handled anyway, because
            // "cannot happen" is how a blank screen gets shipped.
            const state = owner.readiness();
            const reason = state.ready ? 'missing' : state.reason;
            return html(reply, 503, notSetUpPage(reason, MIN_PASSPHRASE_LENGTH));
          }
          case 'wrong_passphrase':
            return html(reply, 401, signInPage({ notice: 'wrong_passphrase' }));
        }
      }

      reply.setCookie(session.cookieName, outcome.minted.cookieValue, outcome.minted.cookieOptions);
      // 303 so the browser follows with a GET. A 302 after a POST leaves some
      // clients repeating the POST.
      return reply.code(303).header('location', '/').send();
    });

    /**
     * Sign out, on this device only.
     *
     * Not guarded, on purpose: signing out without a session is harmless and
     * idempotent, and a 401 here would leave somebody holding a cookie we no
     * longer recognise with no way to throw it away. A cross site POST cannot
     * reach it in any case, because the cookie is SameSite=Lax and is not sent.
     */
    app.post('/auth/signout', async (request, reply) => {
      await context.endSessionOn(request, reply);
      return reply.code(303).header('location', '/auth/signin?notice=signed_out').send();
    });

    /**
     * Sign out, for the browser bundle, which cannot follow a 303 into a page.
     *
     * WHY IT LIVES HERE AND NOT IN ../routes/auth-api.ts. That file existed
     * because the bundle posted JSON at three addresses the form routes did not
     * have, and the two halves drifted until one of them answered 404 on a
     * founder's screen. Two of the three are gone with the magic link. Keeping
     * the last one next to the form route it mirrors, in the module that owns
     * the cookie, is what stops that happening again: they are eight lines
     * apart and they call the same method.
     *
     * IT COULD NOT LIVE THERE ANY MORE IN ANY CASE. The old version found the
     * cookie by hashing every cookie on the request and comparing it against
     * the session id. The session id is derived from the cookie AND the
     * passphrase now, so that comparison cannot be made outside this folder
     * without handing the passphrase to the routes layer.
     */
    app.post('/api/auth/sign-out', async (request, reply) => {
      if (!(await requireFounder(request, reply))) return reply;
      // The row is what matters. Revoking it is what makes the next request
      // 401, whatever the browser still holds. Clearing the cookie is tidiness
      // on top of that, and endSessionOn does them in that order.
      await context.endSessionOn(request, reply);
      return reply.code(204).send();
    });

    /** Who am I. The browser calls this on load to decide which screen to paint. */
    app.get('/api/me', async (request, reply) => {
      if (!(await requireFounder(request, reply))) return reply;
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
