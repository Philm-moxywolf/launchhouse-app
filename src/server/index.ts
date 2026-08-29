/**
 * src/server/index.ts
 *
 * WHAT THIS IS. The process. It reads the environment, builds one Fastify
 * instance, wires sign in and the API to Postgres, serves the built browser
 * bundle, binds a port, and shuts down without dropping a founder mid sentence.
 *
 * WHY IT EXISTS, and the order in it is the file.
 *
 *   loadEnv() IS THE FIRST STATEMENT. Before Fastify, before the database,
 *   before anything is imported for its side effects. A missing
 *   ANTHROPIC_API_KEY found when a founder presses send is a support
 *   conversation during a live session with 65 people in a room. The same
 *   variable found at boot is a deploy that refuses to start and one line of
 *   output naming it. Those are the same bug and they cost different amounts.
 *
 *   THE BOOT ASSERTIONS ARE CALLED HERE, WHICH IS NEW. Two of them said in
 *   their own headers that this file called them and it did not:
 *   `assertContractsReady`, the check that refuses to start when a switched on
 *   feature rests on a vendor detail no spike has verified, and
 *   `assertGeInterface`, the one spawn that proves ge honours the GE_HOME pin.
 *   Both are in `main()` now, before anything binds a port. A guard with no
 *   caller reads in a review exactly like a guard that runs, which is the worst
 *   property a guard can have.
 *
 *   IT BINDS 0.0.0.0. Binding localhost on a container means a health check
 *   that never passes and a deployment that looks like a hang.
 *
 *   SHUTDOWN DRAINS RATHER THAN DROPS. A turn is durable the moment it commits,
 *   so a container dying mid turn costs a founder the answer they were reading,
 *   not their work. Draining costs a few seconds and it is the difference
 *   between a founder retrying and a founder watching a sentence stop halfway.
 *   Open streams are told what is happening before the socket goes, so the
 *   browser reconnects with its Last-Event-ID and picks up where it left off.
 *
 *   NOTHING INTERNAL REACHES A BROWSER. installErrorHandler goes on before the
 *   first route, and the not found handler is registered whether or not the
 *   browser bundle was built. Between them, every answer this process can give
 *   is a sentence somebody wrote. Left to itself, Fastify answers a thrown
 *   error with that error's own message, and every sign in route reaches
 *   Postgres, whose driver writes its message as the failed query with the
 *   bound parameters printed after it. A database that does not answer turned
 *   POST /auth/request into a 500 carrying a founder's own email address.
 *
 *   THE SPA IS SERVED FROM dist/web AND SIGN IN IS NOT. Every sign in screen is
 *   rendered by the server, so a founder can sign in before the bundle exists
 *   and with JavaScript switched off. That is why this file starts and serves
 *   something useful even when `npm run build` has never been run.
 *
 * WHAT CALLS IT. `npm start` and `npm run dev`. Nothing imports it.
 *
 * WHAT IT READS. The environment through ./env.ts, and Postgres.
 * WHAT IT WRITES. A listening socket, the log, and whatever the routes write.
 */

// THE FIRST STATEMENT IN THIS MODULE, and it stays first.
//
// Said precisely, because the obvious reading of it is wrong: ESM hoists every
// import and evaluates those modules before any statement here runs. So what
// this actually depends on is that NOTHING IMPORTED BELOW DOES WORK AT MODULE
// SCOPE. db/client.ts opens its pool lazily, storage/crypto.ts reads the master
// key inside a function, storage/paths.ts reads the workspace root inside a
// function, and the agent modules are class definitions. A module added below
// that reads a secret or opens a socket while it loads would run before this
// line and would break the promise the whole file is built on.
//
// THE AGENT SDK IS NOW ONE OF THEM, through ./agent/sdk.ts, and it is the
// largest thing this file imports. That was checked rather than assumed:
// loading agent/sdk.ts, ge/run.ts, routes/run-turn.ts and
// routes/transcripts-pg.ts with an entirely empty environment completes and
// reads nothing. If a future SDK version starts reading a key at import time,
// this is the line the failure comes from, and the fix is a dynamic import
// inside buildServer() rather than moving loadEnv().
//
// integrations/contracts/index.ts JOINED THAT LIST, for the boot check in main().
// It builds the pending() Proxies while it loads, which is object construction and
// nothing else: no environment, no database, no node builtin. vendor-facts.test.ts
// holds that whole directory to importing nothing outside itself, because the same
// files are read by screens and reach the browser bundle. Checked rather than
// assumed: importing it behind a Proxy over process.env records no read of any
// variable of ours.
import { loadEnv } from './env.ts';
const env = loadEnv();

import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import pino from 'pino';

import { Budget } from './agent/budget.ts';
import { createGeTools, GE_TOOL_NAMES } from './agent/mcp/ge-tools.ts';
import type { GeResult, GeRunner } from './agent/ports.ts';
import { systemClock as agentClock } from './agent/ports.ts';
import { TurnQueue } from './agent/queue.ts';
import { query } from './agent/sdk.ts';
import { SessionPool } from './agent/session-pool.ts';
import { createSessionStore } from './agent/session-store.ts';
import type { QueryFn, RunnerConfig, RunnerDeps } from './agent/runner.ts';
import type { FounderContext } from './agent/types.ts';
import { closeDb, getDb } from './db/client.ts';
import { assertGeInstalled, assertGeInterface, runGe } from './ge/run.ts';
import { assertContractsReady, FEATURES_ON } from './integrations/contracts/index.ts';
import { createAuth } from './auth/plugin.ts';
import { createMailer } from './auth/mailer.ts';
import { DEFAULT_RATE_LIMIT } from './auth/rate-limit.ts';
import { PgAuthStore } from './auth/store-pg.ts';
import { ContentRouteCatalogue, GeneratedSkillBodies } from './routes/agent-content.ts';
import { TurnEventBus, TurnEvents } from './routes/events.ts';
import { ERRORS, errorBody, installErrorHandler, wantsHtml, founderErrorPage } from './routes/errors.ts';
import { FolderFactsSource } from './routes/facts-source.ts';
import { registerApiRoutes, type RegisteredRoutes } from './routes/index.ts';
import { createRunTurn } from './routes/run-turn.ts';
import { PgSpendReader } from './routes/spend-ledger.ts';
import { PgAppStore } from './routes/store-pg.ts';
import { PgTranscriptStore } from './routes/transcripts-pg.ts';
import { QueueTurnExecutor } from './routes/turn-executor.ts';
import { MAX_MESSAGE_BYTES } from './routes/messages.ts';
import { systemClock, type IdSource, type Logger } from './routes/ports.ts';
import { assertFounderId } from './storage/paths.ts';
import { dirname } from 'node:path';

/**
 * Typed as FastifyBaseLogger rather than as pino's own Logger.
 *
 * pino's type is generic over its levels, and Fastify's route types put the
 * logger in a contravariant position, so handing it the concrete pino type
 * makes every route registration fail to typecheck with an error about log
 * levels. One annotation here, and the instance is the same object.
 */
const log: FastifyBaseLogger = pino({
  level: env.LOG_LEVEL,
  // The API key funding 130 founders, the master key wrapping every founder's
  // work, and the connection string. Named so pino removes them wherever they
  // appear, rather than trusted not to be logged.
  redact: {
    paths: ['ANTHROPIC_API_KEY', 'GE_MASTER_KEY', 'DATABASE_URL', 'SMTP_URL', '*.password', '*.token'],
    censor: '[redacted]',
  },
});

/** pino satisfies the Logger port, and this is where the two are checked. */
const logger: Logger = {
  info: (obj, msg) => {
    log.info(obj, msg);
  },
  warn: (obj, msg) => {
    log.warn(obj, msg);
  },
  error: (obj, msg) => {
    log.error(obj, msg);
  },
};

/**
 * ULIDs, so an id sorts by the time it was made and carries no personal data.
 *
 * Crockford base 32 with I, L, O and U left out, which is what makes a
 * founder id readable down a telephone in a venue. `assertFounderId` in
 * storage/paths.ts refuses anything else, and a thread id built the same way
 * cannot become a surprise when it reaches a path.
 */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastUlidMs = 0;
let ulidCounter = 0;

function ulid(): string {
  const now = Date.now();
  // Two ids inside one millisecond must not collide. A counter appended to the
  // random half keeps them ordered as well as distinct, which matters because
  // these ids order a conversation.
  if (now === lastUlidMs) ulidCounter += 1;
  else {
    lastUlidMs = now;
    ulidCounter = 0;
  }
  let time = '';
  let n = now;
  for (let i = 0; i < 10; i += 1) {
    time = (ULID_ALPHABET[n % 32] ?? '0') + time;
    n = Math.floor(n / 32);
  }
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  random[15] = ulidCounter % 256;
  let tail = '';
  for (const byte of random) tail += ULID_ALPHABET[byte % 32] ?? '0';
  return time + tail;
}

const ids: IdSource = {
  thread: () => `th_${ulid()}`,
  message: () => `ms_${ulid()}`,
  turn: () => `tn_${ulid()}`,
};

/**
 * Ask the database whether it is there, once, at boot.
 *
 * FATAL OUTSIDE dev, AND THE REASON IS THE RULE ABOUT WRITES. Postgres is the
 * record. A process that accepts founder messages while it cannot reach the
 * record either loses them or reports work as done that was never stored, and
 * both of those are worse than not starting. In dev the answer is different on
 * purpose: a laptop with no database must still be able to boot the process and
 * serve the sign in screens, and every write path there fails loudly with
 * nobody's work at stake.
 */
async function checkDatabase(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    log.info({ appEnv: env.APP_ENV }, 'the database answered');
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (env.APP_ENV === 'dev') {
      log.warn(
        { detail },
        'DATABASE_URL does not answer. Sign in screens will render and every founder write will fail. This is fatal outside dev.',
      );
      return false;
    }
    log.fatal({ detail }, 'DATABASE_URL does not answer. Postgres is the record, so there is nothing to serve without it.');
    return false;
  }
}

export interface BuiltServer {
  readonly app: FastifyInstance;
  readonly routes: RegisteredRoutes;
  readonly queue: TurnQueue;
  readonly executor: QueueTurnExecutor;
  readonly store: PgAppStore;
  /** Held so shutdown can retire the CLI subprocesses rather than orphan them. */
  readonly pool: SessionPool;
  /** Held so shutdown can write the last transcript batches out of memory. */
  readonly transcripts: PgTranscriptStore;
}

export async function buildServer(): Promise<BuiltServer> {
  const app: FastifyInstance = Fastify({
    // `loggerInstance`, not `logger`. Fastify 5 reads `logger` as a config
    // object to build its own pino from, and hands back
    // FST_ERR_LOG_INVALID_LOGGER_CONFIG for an instance. One process, one
    // logger, and the redaction list is on this one.
    loggerInstance: log,
    // Replit terminates TLS in front of this process, so the scheme and the
    // client address arrive in headers. Without this, request.ip is the
    // proxy for every founder and the per client sign in limit becomes one
    // bucket shared by 130 people.
    trustProxy: true,
    // A founder's paste is capped at roughly 50 KB by the composer and refused
    // above it by the route. This is the outer wall, so an oversized body is
    // rejected before it is buffered.
    bodyLimit: 1_000_000,
    // Request logging is left ON. During a live session the question is "did
    // founder 74's send arrive", and one line per request is the answer. The
    // option that turns it off is deprecated in Fastify 5 and prints a warning
    // on every boot, which is worse noise than the requests.
  });

  /**
   * THE ERROR HANDLER GOES ON FIRST, BEFORE A SINGLE ROUTE.
   *
   * Fastify compiles the handler into each route's context when the instance
   * becomes ready. Installing it after a route is registered still works,
   * because ready has not run yet, but installing it after ready is accepted in
   * silence and never fires. Putting it on the line above the first route
   * removes the ordering question entirely.
   *
   * WITHOUT IT, FASTIFY ANSWERS A THROWN ERROR WITH THAT ERROR'S OWN MESSAGE.
   * Every sign in route reaches Postgres, and the driver writes its message as
   * the failed query with the bound parameters after it. A database that does
   * not answer turned POST /auth/request into a 500 carrying the founder's own
   * email address, the table name and the column list. This is the line that
   * makes that impossible, and errors.test.ts drives the whole route table to
   * prove it stays that way.
   */
  installErrorHandler(app, logger);

  const authStore = new PgAuthStore(logger);
  const appStore = new PgAppStore();

  const mailer = createMailer(
    {
      transport: env.MAIL_TRANSPORT,
      from: env.MAIL_FROM,
      appEnv: env.APP_ENV,
      allowlist: env.MAIL_ALLOWLIST,
      smtpUrl: env.SMTP_URL,
    },
    logger,
  );

  // A Secure cookie over http is never sent back, so a laptop on http could
  // never sign in. env.ts already refuses a http base URL in prod, which is
  // where Secure matters.
  const session = {
    cookieName: env.SESSION_COOKIE_NAME,
    ttlDays: env.SESSION_TTL_DAYS,
    secure: env.APP_BASE_URL.startsWith('https://'),
  };

  const { register: registerAuth, context: auth } = createAuth({
    store: authStore,
    mailer,
    clock: { now: () => new Date() },
    log: logger,
    session,
    magicLink: {
      appBaseUrl: env.APP_BASE_URL,
      tokenTtlMinutes: env.SIGNIN_TOKEN_TTL_MINUTES,
      mentorCodeTtlMinutes: 10,
      session,
    },
    rateLimit: DEFAULT_RATE_LIMIT,
    // Not the session secret. The session id in the cookie is already 32 random
    // bytes, and @fastify/cookie wants a key before it will sign anything.
    cookieSecret: env.GE_MASTER_KEY,
  });
  await registerAuth(app);

  const bus = new TurnEventBus();
  const events = new TurnEvents(appStore, bus, systemClock);

  const budget = new Budget(
    {
      turnCapUsd: env.TURN_SPEND_CAP_USD,
      founderCapUsd: env.FOUNDER_SPEND_CAP_USD,
      cohortDailyCapUsd: env.COHORT_DAILY_CAP_USD,
    },
    new PgSpendReader(),
    logger,
  );

  const queue = new TurnQueue(
    {
      maxConcurrentRuns: env.MAX_CONCURRENT_RUNS,
      turnsPerHour: env.RATE_TURNS_PER_HOUR,
      turnsPerDay: env.RATE_TURNS_PER_DAY,
      longQueueThreshold: 8,
    },
    budget,
    // The agent module's own clock, not a second copy of it. One definition of
    // "now" across the queue and the session pool, and one place a test winds it.
    agentClock,
    logger,
  );

  /* ---------------------------------------------------------------------- *
   * THE AGENT LOOP. This block is what makes a founder able to produce a file.
   *
   * Everything under it was built and tested before this existed, and none of it
   * was reachable from the running process: `storage/turn.ts` and
   * `agent/runner.ts` had no non test importer at all. A founder signed in, was
   * walked through setup, started a Founder Brain, got a 202, and read "That one
   * did not finish." These are the objects that join the two halves.
   * ---------------------------------------------------------------------- */

  const catalogue = new ContentRouteCatalogue();
  const bodies = new GeneratedSkillBodies();
  const facts = new FolderFactsSource({ catalogue, log: logger });
  const transcripts = new PgTranscriptStore({ log: logger });

  /**
   * A routing table row naming a skill body that was never generated is a run
   * with no instructions in it, holding a founder's file tools. It would look
   * like a working run until somebody read what it wrote, so the process refuses
   * to start instead. Nine rows and one Map lookup each: it costs nothing.
   */
  const missingBodies = catalogue
    .all()
    .filter((row) => {
      try {
        bodies.get(row.skill);
        return false;
      } catch {
        return true;
      }
    })
    .map((row) => `${row.id} wants ${row.skill}`);
  if (missingBodies.length > 0) {
    log.fatal(
      { missingBodies },
      'app/content/skill-bodies.generated.ts does not carry a body every route needs. Run: npm run skills:gen',
    );
    throw new Error(`skill bodies missing: ${missingBodies.join('; ')}`);
  }

  /**
   * PATH for the CLI subprocess, and it is built rather than inherited.
   *
   * `Options.env` REPLACES the subprocess environment instead of merging with
   * it, which is the point: nothing on the VM leaks into a founder's run. But a
   * PATH with no node on it is a subprocess that cannot start, so the directory
   * holding the node binary currently running this process goes first. That is
   * asking the process where its own interpreter is, not reading configuration
   * out of the environment, which is why it is not a variable in env.ts.
   */
  const subprocessPath = [dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':');

  const runnerConfig: RunnerConfig = {
    primaryModel: env.MODEL_PRIMARY,
    utilityModel: env.MODEL_UTILITY,
    fallbackModel: env.MODEL_FALLBACK,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    path: subprocessPath,
    // Under /tmp on purpose. The CLI's own config and its local transcript copy
    // are a cache; Postgres is the record. See routes/transcripts-pg.ts.
    claudeConfigDir: '/tmp/claude-config',
    // The SDK's default is 60 seconds, which is 60 seconds of a founder watching
    // nothing before a transcript miss falls back to the digest. A miss is cheap.
    sessionLoadTimeoutMs: 10_000,
  };

  /**
   * ge, for one founder, in their own timezone.
   *
   * Built per run rather than once, because the GeRunner port carries a founder
   * id and not a timezone, and ge needs TZ to date a founder's ops log entry in
   * their own day. The timezone comes off the FounderContext the run is pinned
   * to, so there is no lookup and therefore no second database connection taken
   * from inside a turn that is already holding one.
   */
  const geRunnerFor = (ctx: FounderContext): GeRunner => ({
    async run(founderId, argv, opts): Promise<GeResult> {
      // The context is closed over, so a mismatch means a tool was built for one
      // founder and called for another. That cannot happen today and it is worth
      // one comparison to keep it that way.
      if (founderId !== ctx.founderId) {
        throw new Error('a ge tool was called with a founder id that is not the one it was built for');
      }
      const result = await runGe({
        founderId,
        timezone: ctx.timezone,
        argv,
        ...(opts?.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
      });
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
      };
    },
  });

  const runnerDeps: RunnerDeps = {
    // The one runtime reference to the SDK's query() in the whole process.
    queryFn: query as unknown as QueryFn,
    bodies,
    facts,
    budget,
    log: logger,
    clock: agentClock,
    config: runnerConfig,
    makeGeTools: (ctx: FounderContext) => ({
      servers: { ge: createGeTools(ctx, { ge: geRunnerFor(ctx), log: logger }) },
      toolNames: GE_TOOL_NAMES,
    }),
    sessionStore: createSessionStore(transcripts, logger),
    /**
     * A NO OP, AND THE REASON IS THE TURN'S OWN SHAPE.
     *
     * The runner offers a checkpoint after a compaction and at turn end so
     * storage can harvest early. In this app the harvest IS the commit, and
     * there is exactly one commit per turn: the whole run happens inside one
     * transaction holding the founder's advisory lock, so there is no second
     * place to write from. A founder loses nothing by it, because a turn that
     * dies before COMMIT rolls back to the state before the turn rather than to
     * a half harvested folder.
     */
    onCheckpoint: (reason) => {
      log.debug({ reason }, 'checkpoint offered. The harvest is the commit, so there is one per turn.');
      return Promise.resolve();
    },
    /**
     * Also a no op, for the same kind of reason. storage/turn.ts refreshes
     * founder.track from the Brain whenever the harvest includes it, inside the
     * same transaction that stored it. Refreshing from here would read the
     * folder mid turn, before the harvest has decided whether that write is
     * being kept.
     */
    onBrainChanged: () => {},
  };

  const pool = new SessionPool(
    {
      maxLiveSessions: env.MAX_LIVE_SESSIONS,
      sessionIdleMs: env.SESSION_IDLE_MS,
      sweepEveryMs: 30_000,
    },
    runnerDeps,
    agentClock,
    logger,
  );

  const runTurn = createRunTurn({
    store: appStore,
    events,
    pool,
    catalogue,
    bodies,
    facts,
    transcripts,
    ids,
    log: logger,
  });

  const executor = new QueueTurnExecutor(queue, events, appStore, systemClock, logger, runTurn);

  const routes = await registerApiRoutes(app, {
    store: appStore,
    auth,
    events,
    bus,
    executor,
    clock: systemClock,
    log: logger,
    ids,
    heartbeatMs: env.SSE_HEARTBEAT_MS,
    maxMessageBytes: MAX_MESSAGE_BYTES,
  });

  /**
   * The health endpoint, and it is honest about the database.
   *
   * A health check that returns ok while the record is unreachable is a health
   * check that keeps a broken container in the rotation.
   */
  app.get('/healthz', async (_request, reply) => {
    let db: boolean;
    try {
      await getDb().execute(sql`select 1`);
      db = true;
    } catch {
      db = false;
    }
    const stats = queue.stats();
    const sessions = pool.stats();
    return reply.code(db ? 200 : 503).send({
      ok: db,
      appEnv: env.APP_ENV,
      db,
      streams: routes.streams.size,
      running: stats.running,
      waiting: stats.waiting,
      // How many CLI subprocesses are held, and how many are mid turn. The two
      // numbers that say whether MAX_LIVE_SESSIONS is the right guess, which it
      // is until somebody measures the memory a live session actually costs.
      sessions: sessions.live,
      busySessions: sessions.busy,
      pendingTranscripts: transcripts.pendingCount(),
    });
  });

  await registerBrowserBundle(app);
  pool.start();
  return { app, routes, queue, executor, store: appStore, pool, transcripts };
}

/**
 * Put the work that was in the queue when this process last stopped back in
 * line.
 *
 * WHY IT IS HERE AND NOT NOWHERE. A turn is accepted, the row is written, the
 * founder gets a 202, and then the container is replaced. The in memory queue
 * goes with it. Without this, that founder's message sits at `queued` for ever
 * and reads to them as the app thinking about it. The turns table is the
 * record, and this is the line that makes that sentence true.
 *
 * Never fatal. A restore that fails is a founder who resends. A boot that fails
 * is 130 founders who cannot get in.
 */
async function restoreQueuedTurns(built: BuiltServer): Promise<void> {
  try {
    const jobs = await built.store.queuedTurns(1000);
    for (const job of jobs) built.executor.submit(job);
    if (jobs.length > 0) log.info({ restored: jobs.length }, 'queued turns put back in line after a restart');
  } catch (err) {
    log.error(
      { detail: err instanceof Error ? err.message : String(err) },
      'could not restore queued turns. Anybody who was waiting will need to send again.',
    );
  }
}

/**
 * Serve the built SPA, and say plainly when there is not one.
 *
 * The bundle is a build artefact, so its absence is a normal state on a laptop
 * and a broken deploy in prod. Either way the sign in screens are server
 * rendered and keep working, which is what makes "the app is up but the bundle
 * is missing" a diagnosable state rather than a blank page.
 */
async function registerBrowserBundle(app: FastifyInstance): Promise<void> {
  const dist = isAbsolute('dist/web') ? 'dist/web' : resolve(process.cwd(), 'dist/web');
  const indexHtml = join(dist, 'index.html');

  const built = existsSync(indexHtml);

  if (built) {
    await app.register(fastifyStatic, { root: dist, prefix: '/', index: ['index.html'] });
  } else {
    log.warn({ dist }, 'dist/web is not built, so only the server rendered sign in screens are served. Run: npm run build');
    app.get('/', async (_request, reply) =>
      reply.code(200).header('content-type', 'text/html; charset=utf-8').send(
        `<!doctype html><meta charset="utf-8"><title>Launchhouse</title>
<p>The app is running. The browser part has not been built yet.</p>
<p><a href="/auth/signin">Sign in</a></p>`,
      ),
    );
  }

  /**
   * Anything that is not an API route and not a file is the SPA's own routing.
   *
   * `/api` and `/auth` are excluded explicitly. Without that, a typo in an API
   * path would return the HTML shell with a 200, and the browser would try to
   * parse a page as JSON and report something that has nothing to do with the
   * mistake.
   *
   * REGISTERED WHETHER OR NOT THE BUNDLE EXISTS, and that is the half that used
   * to be missing. On a machine where `npm run build` has never run, this
   * function used to return before reaching here, leaving Fastify's own 404 in
   * place. That one answers `Route POST:/auth/reqest not found`, which reads
   * the method and the path back to whoever typed them and puts the framework's
   * wording on a founder's screen. Every 404 is ours now, in both states.
   */
  app.setNotFoundHandler(async (request, reply) => {
    // An address that does not exist yet may exist after the next deploy. A
    // cached 404 is a founder locked out of a page that is now there.
    reply.header('cache-control', 'no-store');
    if (built && !request.url.startsWith('/api/') && !request.url.startsWith('/auth/')) {
      return reply.sendFile('index.html');
    }
    if (wantsHtml(request)) {
      return reply
        .code(ERRORS.noSuchRoute.status)
        .header('content-type', 'text/html; charset=utf-8')
        .send(founderErrorPage(ERRORS.noSuchRoute, ERRORS.noSuchRoute.message));
    }
    return reply.code(ERRORS.noSuchRoute.status).send(errorBody(ERRORS.noSuchRoute));
  });
}

/**
 * Stop taking new work, let what is in flight finish, then go.
 *
 * The order matters. Closing the server first stops new connections while the
 * turns already running keep their database transactions. Telling the streams
 * why, before closing them, is what turns a restart into a reconnect for a
 * founder mid interview.
 */
async function shutdown(built: BuiltServer, signal: string): Promise<void> {
  log.info({ signal }, 'shutting down');

  const deadline = Date.now() + 25_000;
  built.routes.streams.closeAll('the server is restarting. Your work is saved. This page reconnects on its own.');

  while (built.executor.inFlight() > 0 && Date.now() < deadline) {
    log.info({ inFlight: built.executor.inFlight() }, 'waiting for turns to finish');
    await new Promise((r) => setTimeout(r, 250));
  }
  if (built.executor.inFlight() > 0) {
    // Said out loud rather than swallowed. A turn killed here rolls back, so
    // the founder's record is the state before the turn and nothing is half
    // written. They lose the answer, not the work.
    log.warn({ inFlight: built.executor.inFlight() }, 'the drain window ran out, so some turns were cut short');
  }

  // The last transcript batches, out of memory and into Postgres. Buffered
  // rather than written during a turn, for the reason in routes/run-turn.ts,
  // which means this is the last chance they get. Best effort: losing them
  // costs conversational texture on a resume and no answers at all.
  try {
    const mirrored = await built.transcripts.flush();
    if (mirrored > 0) log.info({ mirrored }, 'transcript entries flushed on shutdown');
  } catch (err) {
    log.warn({ err: String(err) }, 'the transcript mirror could not be flushed on shutdown');
  }

  // Retire the CLI subprocesses rather than orphan them. The session ids survive
  // in Postgres, so every founder's next message resumes rather than restarts.
  await built.pool.stop().catch((err: unknown) => {
    log.warn({ err: String(err) }, 'the session pool did not stop cleanly');
  });

  await built.app.close();
  await closeDb();
  log.info({}, 'stopped');
}

/**
 * Is ge actually in this image.
 *
 * IT SHIPS AS A CHECKED OUT SUBMODULE AND AN IMAGE CAN BE BUILT WITHOUT IT. The
 * failure hides: everything boots, founders sign in, and the first time a model
 * calls `remember` the spawn exits 127 with a message that names nothing.
 * Resolving the path at boot turns that into a deploy that refuses to start and
 * one line saying where it looked. Build document, step 0.
 *
 * A laptop is different on purpose. In dev the submodule is often not checked
 * out and everything except the two ge tools still works, so it warns.
 */
async function checkGe(): Promise<boolean> {
  try {
    const bin = await assertGeInstalled();
    log.info({ bin }, 'ge resolved');
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (env.APP_ENV === 'dev') {
      log.warn({ detail }, 'ge is not resolvable. The two ge tools will fail when a model calls them. This is fatal outside dev.');
      return false;
    }
    log.fatal({ detail }, 'ge is not resolvable, so the two verbs a model can call would fail at the first spawn.');
    return false;
  }
}

/**
 * Does this ge honour the pin. One spawn, and it is the tenancy boundary.
 *
 * `assertGeInterface` runs `ge init` with GE_HOME naming folder A while the working
 * directory is folder B, and checks that A was built and B was left alone. Against a
 * ge that walks the working directory to find a folder, B gets it, and on this server
 * B is whatever the last founder's turn left behind.
 *
 * ITS HEADER SAID "CALLED AT BOOT" WHILE ONLY ITS OWN TEST CALLED IT. That is the
 * whole reason this function exists. A probe nobody runs is a probe that reads as a
 * guarantee in a review and is absent in the container, and this one costs 150 ms.
 *
 * FATAL OUTSIDE DEV, WARN IN DEV, matching checkGe directly above. A laptop has one
 * founder and a tree nobody else can reach. A deployment has 130, and a ge that does
 * not honour the pin must not serve them.
 */
async function checkGePin(): Promise<boolean> {
  try {
    const started = Date.now();
    await assertGeInterface();
    log.info({ ms: Date.now() - started }, 'ge honours GE_HOME. The founder folder is pinned.');
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (env.APP_ENV === 'dev') {
      log.warn({ detail }, 'ge did not honour the GE_HOME pin. This is fatal outside dev, because it is how one founder reaches another founder tree.');
      return false;
    }
    log.fatal({ detail }, 'ge did not honour the GE_HOME pin, so one founder could reach another founder tree.');
    return false;
  }
}

async function main(): Promise<void> {
  // The boot order check: an id shaped like a founder id has to pass the same
  // rule storage uses, or every path built from one would be refused later.
  assertFounderId(ulid());

  // NOTHING SHIPS ON A GUESS, AND THIS IS THE LINE THAT MAKES THAT TRUE RATHER
  // THAN INTENDED. It walks the features that are switched on, and throws if any
  // of them rests on a vendor detail no spike has verified. It threw for real the
  // first time it was called, because csvExport was listed as on and depends on a
  // CSV header row nobody has read off a GoHighLevel template. That list is
  // corrected in the contracts file, with the reasoning beside it.
  //
  // IT IS FIRST, AND IT THROWS RATHER THAN EXITING. A wrong feature list is a
  // mistake in this repository, not a condition of the machine, so it should stop
  // the process before the machine is asked anything at all, and the stack should
  // say which file to open.
  assertContractsReady();
  // Said out loud rather than passed over in silence. A guard that prints nothing
  // when it passes is a guard nobody can tell is running, and this line is also
  // the shortest answer to "what is switched on in this deployment".
  log.info({ featuresOn: FEATURES_ON }, 'contracts checked. Nothing switched on rests on an unverified vendor detail.');

  const geUp = await checkGe();
  if (!geUp && env.APP_ENV !== 'dev') process.exit(1);

  // Only worth asking if ge is there at all. In dev without the submodule, checkGe
  // has already said so and this would repeat it in a way that reads like a second
  // fault.
  if (geUp) {
    const pinned = await checkGePin();
    if (!pinned && env.APP_ENV !== 'dev') process.exit(1);
  }

  const dbUp = await checkDatabase();
  if (!dbUp && env.APP_ENV !== 'dev') process.exit(1);

  const built = await buildServer();
  if (dbUp) await restoreQueuedTurns(built);
  // 0.0.0.0, never localhost. A container that binds the loopback answers its
  // own health check and nothing else.
  const address = await built.app.listen({ host: '0.0.0.0', port: env.PORT });
  log.info(
    { address, appEnv: env.APP_ENV, heartbeatMs: env.SSE_HEARTBEAT_MS },
    'listening. SSE_HEARTBEAT_MS is a guess until the deployment probe measures the proxy idle timeout',
  );

  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      // A second Ctrl C during a drain is somebody who means it. The first one
      // starts the drain, the second is ignored rather than starting a second
      // shutdown that races the first.
      if (stopping) return;
      stopping = true;
      void shutdown(built, signal).then(
        () => process.exit(0),
        (err: unknown) => {
          log.error({ err: String(err) }, 'shutdown failed');
          process.exit(1);
        },
      );
    });
  }
}

await main();
