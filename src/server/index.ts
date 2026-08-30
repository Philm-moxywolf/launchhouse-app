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
 *   before anything is imported for its side effects. Everything the process
 *   is allowed to believe about its configuration is settled on that line.
 *
 *   IT NO LONGER REFUSES TO START, AND THAT IS THE BIGGEST CHANGE IN THIS FILE.
 *   This process used to exit for a missing ANTHROPIC_API_KEY, a missing
 *   database, a missing ge, and eleven other things. Every one of those exits
 *   was right for ONE deployment that we operated. There are now 130, one per
 *   founder, each in the founder's own Replit account, set up by that founder
 *   in a room with sixty four other people in it. An exit there is not a
 *   readable line of output. It is a container that restarts for ever behind a
 *   URL that never answers, and a blank page that cannot tell a missing
 *   database from a missing key.
 *
 *   So main() now GATHERS rather than exits. Each check returns a fact, the
 *   facts become a list of blockers in boot/readiness.ts, the list becomes the
 *   first screen a founder sees, and every route that could act on missing
 *   state is refused with the same words that are on that screen. Nothing got
 *   more permissive: a turn with no engine behind it is still refused, and an
 *   API call with no database behind it is still refused. What changed is that
 *   a founder can now read why.
 *
 *   WHAT STILL EXITS. Two things, and both are a wrong thing being present
 *   rather than a missing thing. A value that is set and unusable, which
 *   env.ts reports and exits on. And assertContractsReady, which throws when a
 *   switched on feature rests on a vendor detail no spike has verified. That is
 *   a mistake in this repository, not a condition of the founder's machine.
 *
 *   THE MASTER KEY IS RESOLVED HERE, AFTER THE DATABASE ANSWERS. It used to be
 *   a Replit Secret we set by hand. A founder cannot be asked to generate 32
 *   random bytes, so boot/master-key.ts finds or makes one and keeps it where a
 *   redeploy cannot lose it. Read that file before changing this order: the key
 *   has to be installed before anything signs a cookie or opens a blob.
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
 *   THE DATABASE IS BUILT HERE, BEFORE THE PORT BINDS, AND THAT IS NEW. Nothing
 *   ran the migration. `.replit` runs `npm run start`, the deployment build
 *   command is `npm ci && npm run build`, and `npm run db:migrate` was in
 *   neither. So the path a founder walks was: create a Replit database, set a
 *   passphrase, press Sign in, get a 500 carrying an incident id and the words
 *   "tell a mentor". The log line they never see said relation "founder" does
 *   not exist. It was the first wall on the path and every founder hit it.
 *   main() now calls ensureSchema() as soon as the database answers. Read
 *   boot/schema.ts for why that is a boot step rather than one more sentence on
 *   the start page: the one line command that fixes it needs a terminal, and a
 *   founder in that room does not have one, so a blocker there is a blocker
 *   nobody can act on.
 *
 *   THE CLI THE AGENT LOOP SPAWNS IS RESOLVED HERE TOO, for the same reason the
 *   ge checks are. The Agent SDK ships that binary as a per platform OPTIONAL
 *   dependency, so an install may skip it and still exit 0. Before this, such a
 *   copy booted green, answered /healthz with {"ok":true,"blockers":[]}, wrote
 *   no log line at all, and failed on the founder's first message. boot/
 *   platform-cli.ts resolves it and reads its ELF header, because resolving a
 *   path proves only that a file exists: the other half of this failure is the
 *   wrong C library build, which is present, correctly named, and fails at exec
 *   with an error naming a file that is plainly there. It reads rather than
 *   runs because ge/no-shell.test.ts holds the server to one spawn boundary.
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
import { closeDb, getDb, type Db } from './db/client.ts';
import { assertGeInstalled, assertGeInterface, runGe } from './ge/run.ts';
import { assertContractsReady, FEATURES_ON } from './integrations/contracts/index.ts';
import { createAuth } from './auth/plugin.ts';
import { PgAuthStore } from './auth/store-pg.ts';
import { ensureMasterKey, type MasterKeyOutcome } from './boot/master-key.ts';
import { resolvePlatformCli, type PlatformCliOutcome } from './boot/platform-cli.ts';
import { ReadinessState, installReadinessGates, type ReadinessFacts } from './boot/readiness.ts';
import { loadStoredAnthropicKeys } from './agent/anthropic-key-store.ts';
import { ensureSchema } from './boot/schema.ts';
import { assertMasterKeyPresent } from './storage/crypto.ts';
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
 * IT USED TO BE FATAL OUTSIDE dev AND IT IS NOT FATAL ANYWHERE NOW. The rule it
 * was protecting has not changed: Postgres is the record, and a process that
 * accepts founder messages while it cannot reach the record either loses them
 * or reports work as done that was never stored. What changed is where that
 * rule is enforced. Exiting enforced it by making the app unreachable, which
 * on a founder's own deployment means a restart loop and a blank page. The gate
 * in boot/readiness.ts enforces the same rule by refusing every API request
 * with a sentence, while the start page stays reachable and says which pane on
 * Replit to open. Same amount of work lost, which is none. A founder who can
 * act, instead of one who cannot see.
 *
 * A MISSING DATABASE_URL IS NOT AN ERROR HERE EITHER. Replit supplies it when
 * the database exists, so its absence means the founder has not created one
 * yet. Asking the pool for a connection in that state throws from
 * db/client.ts, so this checks the variable first and reports the honest
 * answer rather than a stack trace about a URL nobody set.
 */
async function checkDatabase(): Promise<boolean> {
  if (env.DATABASE_URL === undefined) {
    log.warn({}, 'DATABASE_URL is not set, so there is no database to answer. The start page says how to create one.');
    return false;
  }
  try {
    await getDb().execute(sql`select 1`);
    log.info({ appEnv: env.APP_ENV }, 'the database answered');
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn(
      { detail },
      'the database did not answer. The app serves the start page and refuses every API request until it does.',
    );
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
  /** Held so whoever stores a pasted key can tell the gates the world changed. */
  readonly readiness: ReadinessState;
}

/**
 * What buildServer needs that it cannot work out for itself.
 *
 * BOTH OF THESE ARE SETTLED AFTER loadEnv AND BEFORE ANY ROUTE EXISTS, which is
 * exactly why they are arguments rather than module state. The master key comes
 * out of Postgres, so it cannot be on the frozen Env. The readiness list is the
 * result of asking the machine three questions. Passing them in is what makes
 * the order in main() the only order, instead of one of several that happen to
 * work today.
 */
export interface BuildOptions {
  readonly readiness: ReadinessState;
  /**
   * The resolved master key, or an empty string when boot/master-key.ts refused.
   *
   * Empty is a real state and it is safe: readiness is already carrying that
   * refusal as a blocker that stops every API request, so nothing reaches a
   * cookie signed with nothing. @fastify/cookie will not accept an empty
   * secret, so a placeholder is used and named as one below.
   */
  readonly masterKey: string;
}

export async function buildServer(options: BuildOptions): Promise<BuiltServer> {
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

  /**
   * THE READINESS GATES GO ON SECOND, BEFORE THE FIRST ROUTE AND BEFORE AUTH.
   *
   * A Fastify hook applies to routes registered after it and to nothing before
   * it, so this line's position is the whole of its behaviour. Before auth on
   * purpose: a founder missing three things should read three things on one
   * screen, rather than being sent round the passphrase screen and finding the
   * database missing afterwards.
   */
  installReadinessGates(app, options.readiness);

  /**
   * A database handle that does not open a pool until something actually uses it.
   *
   * WHY IT EXISTS, and it was found by booting this process with an empty environment
   * rather than by reading it. `PgAuthStore` and `PgAppStore` both take their handle as
   * `db: Db = getDb()`, a DEFAULT ARGUMENT, which runs the moment the object is
   * constructed. `getDb()` with no DATABASE_URL throws by design. So the two lines below
   * used to take the whole process down before Fastify had a single route on it, and the
   * founder who has not created their database yet got a stack trace instead of the screen
   * telling them to create one. Nothing in the type system says a default argument reaches
   * for a socket, and nothing in a code review looks wrong.
   *
   * THE RULE IS NOT WEAKENED. Any real use still resolves the pool, and still throws the
   * same sentence from db/client.ts if there is no URL. What changed is WHEN: at the first
   * query rather than at construction, by which point boot/readiness.ts is already refusing
   * every API request with words a founder can act on. Building the object graph is not
   * using the database.
   *
   * A Proxy rather than a wrapper class, because `Db` is drizzle's whole surface and a
   * wrapper would be a second thing to keep in step with it. Methods are bound to the real
   * handle, or drizzle loses its own `this` the first time one is called through here.
   */
  const lazyDb = new Proxy({} as Db, {
    get(_target, prop) {
      const real = getDb() as unknown as Record<string | symbol, unknown>;
      const value = real[prop];
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
    },
  });

  const authStore = new PgAuthStore(logger, lazyDb);
  const appStore = new PgAppStore(lazyDb);

  const { register: registerAuth, context: auth } = createAuth({
    store: authStore,
    clock: { now: () => new Date() },
    log: logger,
    passphrase: env.OWNER_PASSPHRASE,
    // A Secure cookie over http is never sent back, so a laptop on http could
    // never sign in. env.ts warns when the base URL is not https, which is
    // where Secure matters.
    cookie: {
      name: env.SESSION_COOKIE_NAME,
      ttlDays: env.SESSION_TTL_DAYS,
      secure: env.APP_BASE_URL.startsWith('https://'),
    },
    /**
     * Not the session secret. The session id is already derived from 32 random
     * bytes and the passphrase; @fastify/cookie simply wants a key before it
     * will sign anything.
     *
     * THE PLACEHOLDER IS NAMED RATHER THAN HIDDEN. When boot/master-key.ts
     * refused, there is no key, and the alternative to a placeholder is a crash
     * inside a library. Readiness is already refusing every API request in that
     * state, so no session minted under this string can do anything. Naming it
     * is what stops somebody later reading an empty fallback as a working one.
     */
    cookieSecret: options.masterKey === '' ? 'no-master-key-resolved-this-boot' : options.masterKey,
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
    // The third constructor that resolves the pool in a default argument. Same reason as
    // the two above: building the object graph is not using the database.
    new PgSpendReader(lazyDb),
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
    /**
     * Empty until the founder pastes one in, and that is a state this process
     * runs in rather than refuses to start in. Nothing gets as far as using it
     * while it is empty: readiness carries "your Anthropic key is not set" as a
     * blocker and the two routes that start a turn are refused with it. The
     * empty string here is what the SDK is handed if that gate is ever removed,
     * so the gate is the thing to keep, not this line.
     */
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
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
      /**
       * What is missing, in the same words the founder's own screen uses.
       *
       * WHY IT IS HERE. The process no longer exits for a missing key or a
       * missing engine, so "the container is up" stopped being the same
       * sentence as "the app can do its job". This is where the second
       * sentence lives, and it is the first thing to read when somebody in the
       * room says the app is not working. It carries headings and actions, and
       * never a value of anything.
       */
      readiness: options.readiness.describe(),
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
  return { app, routes, queue, executor, store: appStore, pool, transcripts, readiness: options.readiness };
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
 * Is ge actually in this copy of the app.
 *
 * IT SHIPS AS A CHECKED OUT SUBMODULE AND A COPY CAN EXIST WITHOUT IT. The
 * failure hides: everything boots, the founder signs in, and the first time a
 * model calls `remember` the spawn exits 127 with a message that names nothing.
 * Resolving the path at boot is what turns that into a sentence.
 *
 * IT USED TO EXIT OUTSIDE dev AND IT DOES NOT NOW, and this one is the reason
 * the whole workstream exists. However the engine reaches a founder's copy,
 * this process cannot know it arrived until it looks, and a copy that arrived
 * without it has no skills, no schemas and no engine. Exiting there means sixty
 * five people looking at a URL that never answers and nobody able to say why.
 * Returning a fact means a screen that names the folder and tells them who to
 * ask. The answer to "did it arrive" belongs to whoever ships it. The answer to
 * "what does the founder see when it did not" belongs here.
 */
async function checkGe(): Promise<boolean> {
  try {
    const bin = await assertGeInstalled();
    log.info({ bin }, 'ge resolved');
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn({ detail }, 'ge is not resolvable, so nothing that writes founder files can run. The start page says so and turns are refused.');
    return false;
  }
}

/**
 * Does this ge honour the pin. One spawn, and it is the tenancy boundary.
 *
 * `assertGeInterface` runs `ge init` with GE_HOME naming folder A while the working
 * directory is folder B, and checks that A was built and B was left alone. Against a
 * ge that walks the working directory to find a folder, B gets it instead.
 *
 * ITS HEADER SAID "CALLED AT BOOT" WHILE ONLY ITS OWN TEST CALLED IT. That is the
 * whole reason this function exists. A probe nobody runs is a probe that reads as a
 * guarantee in a review and is absent in the container, and this one costs 150 ms.
 *
 * A FAILURE HERE COUNTS AS "NO ENGINE", not as a reason to exit. One deployment
 * holds one founder now, so a ge that walks the working directory can reach that
 * founder's own other folders and nobody else's. That is still wrong and still
 * refuses every turn. It is no longer a reason to make the app unreachable.
 */
async function checkGePin(): Promise<boolean> {
  try {
    const started = Date.now();
    await assertGeInterface();
    log.info({ ms: Date.now() - started }, 'ge honours GE_HOME. The founder folder is pinned.');
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn({ detail }, 'ge did not honour the GE_HOME pin, so turns are refused. A ge that walks the working directory writes into the wrong folder.');
    return false;
  }
}

/**
 * Is the binary the agent loop spawns on this machine, and will it run.
 *
 * TWO SEPARATE QUESTIONS, AND ONLY THE SECOND ONE SETTLES IT. The SDK ships its CLI as a
 * per platform optional dependency, so npm may skip it and still exit 0. Resolving the path
 * catches the skipped install. It does NOT catch the other half, which is a glibc build on a
 * musl machine: the file is there, the size is right, and exec fails with "no such file or
 * directory" naming a file that plainly exists. So boot/platform-cli.ts runs `--version`,
 * because running the thing is the only proof that it runs. About 1.5 seconds on a cold
 * container, once, and it buys the difference between finding this at boot and finding it in
 * front of a founder who has just typed their first message.
 *
 * A FAILURE REFUSES TURNS AND NOTHING ELSE. Signing in, reading files and pasting a key all
 * work without the CLI. Only writing needs it.
 */
async function checkPlatformCli(): Promise<PlatformCliOutcome> {
  const started = Date.now();
  const outcome = await resolvePlatformCli();
  if (outcome.ok) {
    log.info(
      { ms: Date.now() - started, path: outcome.path, detail: outcome.detail },
      'the Claude Code CLI is installed and this machine can execute it. Turns have something to spawn.',
    );
  } else {
    log.error({ detail: outcome.detail }, 'the Claude Code CLI is missing or will not run on this machine, so every turn is refused. The start page says so.');
  }
  return outcome;
}

/**
 * Find or make the master key, and say what happened in one line.
 *
 * IT IS ONLY CALLED WHEN THE DATABASE ANSWERED. The key lives in Postgres, so
 * there is nothing to ask before then, and asking anyway would produce a
 * connection error dressed up as a key problem.
 */
async function resolveMasterKey(): Promise<MasterKeyOutcome> {
  try {
    const outcome = await ensureMasterKey({ db: getDb() });
    if (!outcome.ok) {
      log.error({ detail: outcome.detail }, 'the master key was refused. Nothing has been written under a different key.');
      return outcome;
    }
    for (const w of outcome.warnings) log.warn({}, w);
    if (outcome.created) {
      log.info(
        { source: outcome.source, version: outcome.version },
        'a master key was created for this deployment and stored in Postgres. Every file this founder makes is encrypted under it.',
      );
    }
    // Installed is not the same as usable. This decodes it, checks the length,
    // and refuses a placeholder, which is the difference between a key being
    // present and a key working. It costs one function call.
    const version = assertMasterKeyPresent();
    log.info({ version, source: outcome.source }, 'the master key is usable');
    return outcome;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ detail }, 'the master key could not be resolved');
    return {
      ok: false,
      founderMessage: 'The key that opens your files could not be read. Nothing has been lost. Show this screen to somebody from the Launchhouse team.',
      detail,
    };
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

  /* ---------------------------------------------------------------------- *
   * ASK THE MACHINE EVERY QUESTION, THEN DECIDE. Not one question, one exit.
   *
   * The old order asked a question, exited on the answer, and asked the next
   * one. A founder whose copy was missing the engine AND the database learned
   * about the engine, fixed it, redeployed, and learned about the database.
   * That is two restarts and two trips to whoever is running the room, for one
   * conversation that could have been had once. Nothing below stops the walk.
   * ---------------------------------------------------------------------- */

  // The short circuit is deliberate. Asking whether ge honours the GE_HOME pin when ge is
  // not there at all spawns nothing and reports a second fault for one cause, and a founder
  // reading two lines about a folder they do not have is a founder who reads neither.
  const geUp = (await checkGe()) && (await checkGePin());

  // Is the binary the agent loop spawns actually on this machine and runnable.
  //
  // IT IS HERE BECAUSE IT WAS NOWHERE. agent/sdk.ts says in its own header that this check
  // belongs beside its import, and the only copy of it lived in scripts/probe-deployment.ts,
  // which runs only if somebody changes the Replit run command. No founder will. Without it
  // an install that skipped optional dependencies boots green, answers /healthz with
  // {"ok":true,"blockers":[]}, logs nothing at all, and fails on the founder's first
  // message. That was measured by moving the platform package aside and booting.
  const cli = await checkPlatformCli();

  const dbUp = await checkDatabase();

  /**
   * BUILD THE DATABASE BEFORE THE PORT BINDS, and this is the line the first wall was
   * behind. Nothing ran the migration: `.replit` runs `npm run start` and the deployment
   * build command is `npm ci && npm run build`. So a founder created a Replit database, set
   * a passphrase, pressed Sign in, and got a 500 with an incident id and "tell a mentor",
   * while the log said relation "founder" does not exist.
   *
   * ONLY WHEN THE DATABASE ANSWERED. Migrating a database that is not there produces a
   * connection error dressed up as a schema error, which is a second line on the start page
   * for one cause. See boot/schema.ts for why this runs at boot rather than being named as
   * something the founder has to do, and for what happens when two containers boot together.
   */
  const schema = dbUp ? await ensureSchema() : undefined;
  if (schema !== undefined) {
    // Three outcomes and three sentences, because "the tables were built" on a boot that
    // built nothing is how a mentor is sent looking for a migration that never ran.
    if (!schema.ok) {
      log.error({ detail: schema.detail }, 'the database could not be set up, so every API route is refused and the start page says so');
    } else if (!schema.applied) {
      log.info({}, 'another copy of this app was migrating. Waited for it, then checked the schema is current.');
    } else if (schema.newlyApplied > 0) {
      log.info({ newlyApplied: schema.newlyApplied }, 'the database tables were built. This is a first boot, or a new migration shipped.');
    } else {
      log.info({}, 'the database was already up to date. The schema and the row level security policies were checked.');
    }
  }

  // The key lives in Postgres, so there is only a question to ask when the
  // database answered. With no database the founder is told about the database,
  // which is the thing to fix first, and the key is asked for on the next boot.
  const key = dbUp ? await resolveMasterKey() : undefined;

  const facts: ReadinessFacts = {
    databaseUrlSet: env.DATABASE_URL !== undefined,
    databaseAnswered: dbUp,
    schemaRefusal: schema !== undefined && !schema.ok ? schema.founderMessage : undefined,
    engineReady: geUp,
    platformCliRefusal: cli.ok ? undefined : cli.founderMessage,
    masterKeyRefusal: key !== undefined && !key.ok ? key.founderMessage : undefined,
    anthropicKeySet: env.ANTHROPIC_API_KEY !== undefined,
    passphraseSet: env.OWNER_PASSPHRASE !== '',
  };
  const readiness = new ReadinessState(facts);

  /**
   * PUT ANY STORED ANTHROPIC KEY BACK IN MEMORY, ONCE, BEFORE ANYTHING BINDS A PORT.
   *
   * A Replit deployment is replaced whenever Replit feels like it, and the pasted key
   * lives in memory while the process runs. Without this line every replacement would
   * send the founder back to the paste screen to re-enter a key that is already in their
   * own database, and the start page would tell them their key was not set when it was.
   *
   * AFTER the ReadinessState above rather than before it, and that order is the whole
   * behaviour: the state subscribes to the key holder in its constructor, so a key
   * restored here clears the blocker the facts above just raised. Before it, nothing
   * would be listening. It also has to come after resolveMasterKey, because the row is
   * encrypted under that key.
   *
   * NEVER FATAL. No database means the founder is already being told about the database,
   * which is the thing to fix first, and this simply reports that it could not ask.
   */
  if (dbUp) {
    const restored = await loadStoredAnthropicKeys();
    if (restored.loaded > 0) log.info({ keys: restored.loaded }, 'an Anthropic key was restored from the database. Nobody has to paste it again.');
    // Named by founder id, never by content. A row that will not open is a half done
    // rotation or a damaged row, and it needs a person rather than a retry.
    if (restored.unreadable.length > 0) log.error({ founderIds: restored.unreadable }, 'a stored Anthropic key would not decrypt. That founder will be asked to paste theirs again.');
  }

  // One line that answers "is this app able to do its job", separately from "is
  // the container up". Those stopped being the same question when this file
  // stopped exiting.
  if (readiness.ready()) log.info({}, 'nothing is missing. Every part of the app is usable.');
  else log.warn(readiness.describe(), 'the app is starting with things missing. The start page names them and every affected route is refused.');

  const built = await buildServer({
    readiness,
    masterKey: key !== undefined && key.ok ? key.base64 : '',
  });
  /**
   * WORK IS ONLY PUT BACK IN LINE IF IT CAN ACTUALLY RUN, and the second half of
   * that condition is new.
   *
   * The HTTP gate refuses the two routes that start a turn while the engine or
   * the key is missing. This submits straight to the executor and never touches
   * a route, so without this check it would walk round its own gate: every turn
   * that was queued when the container stopped would be resubmitted into an
   * executor that cannot finish one, and the founder would watch a row of
   * "That one did not finish" for work they had already sent.
   *
   * Leaving them alone costs nothing. They stay `queued` in the turns table,
   * which is the record, and the next boot that has everything picks them up.
   */
  const cannotRunTurns = readiness.blockingTurns();
  if (dbUp && cannotRunTurns.length === 0) await restoreQueuedTurns(built);
  else if (dbUp) {
    log.warn(
      { because: cannotRunTurns.map((b) => b.id) },
      'work that was queued when this app last stopped has been left queued, because it cannot be finished yet. It resumes on the first boot that has everything.',
    );
  }
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
