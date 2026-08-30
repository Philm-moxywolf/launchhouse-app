/**
 * src/server/env.ts
 *
 * WHAT THIS IS. The one place the process reads its environment. Every variable is named,
 * typed and checked here, and nowhere else in the server calls process.env.
 *
 * WHY IT EXISTS, AND IT IS NOT THE REASON IT USED TO BE.
 *
 * This file was written for ONE deployment serving 130 founders. In that shape a missing
 * variable was an operator's mistake, the operator was us, and the cheapest possible
 * failure was a process that refused to start with one line naming the variable. Thirteen
 * variables were required and every refusal was correct.
 *
 * The shape changed. There are now 130 deployments, one per founder, each one remixed into
 * a founder's own Replit account and set up by that founder in a staffed room. The
 * operator is a non technical person with a laptop open and sixty four other people in the
 * same room. For them a refusal to boot is not one readable line. It is a blank page, a
 * container that restarts for ever, and a stall that costs the room rather than costing
 * them.
 *
 * So the rule inverted. NOTHING IN THE ENVIRONMENT IS REQUIRED ANY MORE. The app boots with
 * an empty environment, binds a port, serves a page, and that page says what is missing and
 * what to do about it. There is exactly one thing a founder must supply, an Anthropic API
 * key, and they paste it into the running app rather than into a settings pane. A key that
 * is pasted into the app cannot also be required to start the app, which is the whole
 * reason ANTHROPIC_API_KEY is optional below.
 *
 * WHAT DID NOT CHANGE. A value that is present and WRONG still stops the process. A cap
 * that reads "two dollars fifty" is not a cap. A DATABASE_ENV_TAG that disagrees with
 * APP_ENV is a process holding the wrong connection string. Absent is now a default or a
 * warning. Malformed is still a refusal, and the boot report still lists every problem at
 * once so fixing them takes one restart and not four.
 *
 * It also holds three checks that are not really about variables at all, and they are here
 * because this is the only code guaranteed to run before anything else:
 *
 *   - The process clock is UTC. Every date in the system is UTC or an IANA zone name
 *     carried beside it. A server that quietly runs in some other zone puts a founder's
 *     ops-log entry under the wrong day heading, and ops-log.md is append only. This one
 *     is still fatal, and it cannot fire on the founder path: package.json's own start
 *     script sets TZ=UTC, and package.json is copied by a Replit remix.
 *   - Full ICU is present, so America/New_York resolves. A slim Node build does not know
 *     that zone, and every scheduled post depends on it.
 *   - No ambient vendor credential exists. There is no GHL_TOKEN and no Apollo key at
 *     process level, by design. A vendor credential with no founder attached to it is how
 *     one founder's post ends up in another founder's account. Still fatal. It is not an
 *     absence, it is a wrong thing being present.
 *
 * WHAT IS NOT HERE ANY MORE, AND WHY. GE_MASTER_KEY has left the Env object. It is
 * resolved AFTER the database answers, by src/server/boot/master-key.ts, because a single
 * tenant app generates its own key on first boot and keeps it where a redeploy cannot lose
 * it. A value that is settled after the database is reached cannot live on an object that
 * is frozen before the database is reached, and leaving an empty string there is how a
 * caller ends up signing a cookie with nothing. installMasterKey below is the one seam
 * that puts the resolved key where storage/crypto.ts already looks for it.
 *
 * WHAT CALLS IT. src/server/index.ts, first thing, before Fastify is constructed. Tests
 * call parseEnv directly, which is why parseEnv throws and only loadEnv exits.
 *
 * WHAT IT READS. process.env. Nothing else.
 * WHAT IT WRITES. Nothing. It returns a frozen object, and it may end the process.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

export type AppEnvName = "dev" | "preview" | "prod";

/**
 * Names whose values must never reach a log, an error, or a support screenshot.
 *
 * GE_MASTER_KEY stays on this list even though it is no longer an Env field, because this
 * list is what the redaction rules are read from and the key does exist in the process once
 * boot/master-key.ts has resolved it.
 */
const SECRET_KEYS = ["ANTHROPIC_API_KEY", "GE_MASTER_KEY", "DATABASE_URL", "OWNER_PASSPHRASE"] as const;

/**
 * The subset of SECRET_KEYS that are fields on Env.
 *
 * describeEnv names an absent secret rather than leaving it out, so "[not set]" is a real
 * answer instead of a missing line. GE_MASTER_KEY is deliberately not in here: it is not an
 * Env field, and printing "[not set]" beside it every boot would say something false about
 * a key the boot path has in fact resolved.
 */
const ENV_SECRET_FIELDS = ["ANTHROPIC_API_KEY", "DATABASE_URL", "OWNER_PASSPHRASE"] as const;

export interface Env {
  readonly NODE_ENV: "development" | "production" | "test";
  readonly APP_ENV: AppEnvName;
  readonly PORT: number;
  readonly TZ: "UTC";
  readonly APP_BASE_URL: string;
  readonly LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";

  /**
   * Undefined is a normal state, not a failure.
   *
   * Replit supplies this to a deployment. A founder who has not finished creating the
   * database has no value here, and the app boots anyway and says so on the first screen.
   * Every write path refuses while it is undefined. See src/server/boot/readiness.ts.
   */
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_ENV_TAG: AppEnvName | undefined;

  /**
   * Undefined until the founder pastes one in. This is THE key, and it is the only thing
   * they must supply. It is optional here for the reason in the file header: a key pasted
   * into the running app cannot be a condition of the app running.
   */
  readonly ANTHROPIC_API_KEY: string | undefined;
  readonly MODEL_PRIMARY: string;
  readonly MODEL_UTILITY: string;
  readonly MODEL_FALLBACK: string | undefined;

  readonly MAX_CONCURRENT_RUNS: number;
  readonly MAX_LIVE_SESSIONS: number;
  readonly SESSION_IDLE_MS: number;
  readonly SSE_HEARTBEAT_MS: number;
  readonly RATE_TURNS_PER_HOUR: number;
  readonly RATE_TURNS_PER_DAY: number;

  readonly TURN_SPEND_CAP_USD: number;
  readonly FOUNDER_SPEND_CAP_USD: number;
  readonly COHORT_DAILY_CAP_USD: number;

  readonly GE_BIN: string;
  readonly GE_SHELL: string;
  readonly GE_TIMEOUT_MS: number;
  readonly WORKSPACE_ROOT: string;

  /**
   * The one secret a founder sets in the Secrets pane, and it is empty here more often
   * than not.
   *
   * WHY IT IS NOT REQUIRED AT BOOT even though nobody can sign in without it. Requiring it
   * would mean a founder who has not set it yet gets a container that will not start, and
   * a container that will not start cannot show them the screen that tells them to set it.
   * auth/owner.ts checks the value properly, refuses every sign in while it is unusable,
   * and auth/plugin.ts answers every request with the screen that names it. That is fail
   * closed AND it is legible, which a refusal to boot is not.
   *
   * NOT TRIMMED. A passphrase is typed by a person and the spaces in it are theirs. A
   * value that is nothing but whitespace still reads as absent, which is what compact()
   * does for every variable.
   */
  readonly OWNER_PASSPHRASE: string;

  readonly OBJECT_STORAGE_BUCKET_ID: string | undefined;
  readonly ALERT_WEBHOOK_URL: string | undefined;

  readonly SESSION_COOKIE_NAME: string;
  readonly SESSION_TTL_DAYS: number;

  /** Warnings that are worth saying out loud at boot but must not stop the process. */
  readonly warnings: readonly string[];

  /** Keeps secrets out of a stray JSON.stringify or a pino log line. */
  toJSON(): Record<string, unknown>;
}

/** One problem with one variable, in the shape the boot report prints. */
export interface EnvProblem {
  readonly variable: string;
  readonly problem: string;
  readonly whatItIsFor: string;
}

export class EnvError extends Error {
  readonly problems: readonly EnvProblem[];
  constructor(problems: readonly EnvProblem[]) {
    super(`Environment is not usable. ${String(problems.length)} problem(s).`);
    this.name = "EnvError";
    this.problems = problems;
  }
}

// ---------------------------------------------------------------------------------------
// Small schema helpers
//
// Deliberately built from z.string() and .transform() rather than z.coerce, so the failure
// message says "whole number, digits only" instead of "expected number, received nan".
// Somebody reads these at boot on a bad morning.
// ---------------------------------------------------------------------------------------

const wholeNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, "whole number, digits only")
    .transform((s) => Number.parseInt(s, 10))
    .refine((n) => n >= min && n <= max, `must be between ${String(min)} and ${String(max)}`);

const usDollars = () =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,4})?$/, "US dollars, digits and up to four decimal places, for example 2.50")
    .transform((s) => Number.parseFloat(s))
    .refine((n) => n > 0, "must be greater than zero");

const absoluteUrl = () =>
  z
    .string()
    .trim()
    .refine((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "must be a full URL beginning http:// or https://")
    .refine((s) => !s.endsWith("/"), "must not end with a slash, because paths are appended to it");

// ---------------------------------------------------------------------------------------
// The defaults, gathered
//
// WHY THEY ARE CONSTANTS AND NOT INLINE. Every number below used to be either a required
// variable or a literal halfway down a 200 line function. A founder never sets any of them,
// so the only readers left are us, and the question we ask is always "what does a founder
// who set nothing actually get". That question deserves one screen.
// ---------------------------------------------------------------------------------------

/**
 * The model that writes in a founder's voice.
 *
 * IT USED TO HAVE NO DEFAULT ON PURPOSE, so that model ids were looked up on the day
 * rather than inherited from a stale table. That reasoning assumed the person setting it
 * was us. It is now a founder, on their own bill, in a room, and "look up the current model
 * id" is not an instruction that survives contact with 130 of them. The id is pinned here,
 * it is said out loud at boot so a stale one is visible rather than silent, and
 * MODEL_PRIMARY still overrides it.
 */
const DEFAULT_MODEL_PRIMARY = "claude-opus-5";

/** Status, gate, doctor and digests. Cheap on purpose: none of it writes in a voice. */
const DEFAULT_MODEL_UTILITY = "claude-haiku-4-5";

/**
 * The three spend caps, re-aimed at one founder paying their own bill.
 *
 * They were required with no default because "a cap with a default is a cap nobody chose",
 * and that was right when the bill was ours and one bug billed 130 people. The bill is now
 * the founder's own key, and a founder who has chosen nothing must not get an app with no
 * ceiling on it. So there are defaults, and they are chosen rather than round:
 *
 *   TURN cap 2.50   One turn that reads three files and writes one. A turn that wants more
 *                   than this is looping, and stopping it costs a retry.
 *   FOUNDER cap 100 Everything this deployment may ever spend. The backstop, not the
 *                   working limit, and the one a founder raises if they mean to.
 *   DAILY cap 25    THIS IS THE ONE THAT MATTERS NOW. It was the cohort breaker, a global
 *                   ceiling across 130 founders, and for one founder that idea is
 *                   meaningless. Read as a daily ceiling for this one deployment it is the
 *                   most useful of the three: a loop that starts at 3am stops at 25 dollars
 *                   rather than at 100. The variable keeps its name because Budget reads it
 *                   under that name, and renaming it would be a change in a file this one
 *                   does not own.
 */
const DEFAULT_TURN_CAP_USD = 2.5;
const DEFAULT_FOUNDER_CAP_USD = 100;
const DEFAULT_DAILY_CAP_USD = 25;

// ---------------------------------------------------------------------------------------
// The schema. Everything is optional here on purpose: defaults are applied below, in one
// readable block, so the whole picture is on one screen.
// ---------------------------------------------------------------------------------------

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  APP_ENV: z.enum(["dev", "preview", "prod"]).optional(),
  PORT: wholeNumber(1, 65535).optional(),
  TZ: z.string().trim().optional(),
  APP_BASE_URL: absoluteUrl().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),

  DATABASE_URL: z.string().trim().min(1).optional(),
  DATABASE_ENV_TAG: z.enum(["dev", "preview", "prod"]).optional(),

  GE_MASTER_KEY: z.string().trim().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  MODEL_PRIMARY: z.string().trim().min(1).optional(),
  MODEL_UTILITY: z.string().trim().min(1).optional(),
  MODEL_FALLBACK: z.string().trim().min(1).optional(),

  MAX_CONCURRENT_RUNS: wholeNumber(1, 500).optional(),
  MAX_LIVE_SESSIONS: wholeNumber(1, 2000).optional(),
  SESSION_IDLE_MS: wholeNumber(10_000, 86_400_000).optional(),
  SSE_HEARTBEAT_MS: wholeNumber(1_000, 60_000).optional(),
  RATE_TURNS_PER_HOUR: wholeNumber(1, 10_000).optional(),
  RATE_TURNS_PER_DAY: wholeNumber(1, 100_000).optional(),

  TURN_SPEND_CAP_USD: usDollars().optional(),
  FOUNDER_SPEND_CAP_USD: usDollars().optional(),
  COHORT_DAILY_CAP_USD: usDollars().optional(),

  // GE_BIN, GE_SHELL, GE_TIMEOUT_MS, WORKSPACE_ROOT, PGPOOL_MAX, PG_STATEMENT_TIMEOUT_MS,
  // GE_CONTENT_ROOT and GE_MASTER_KEY_VERSION are checked by lateSchema below, and checked
  // there once rather than twice, so a bad value is one line in the boot report.

  // NOT trimmed, and not length checked here. The spaces in a passphrase belong to the
  // person who typed it, and auth/owner.ts owns every rule about what makes one usable:
  // it has the length floor, the placeholder list, and the screen that explains both.
  // Checking it twice would mean two sets of words for one mistake.
  OWNER_PASSPHRASE: z.string().min(1).optional(),

  OBJECT_STORAGE_BUCKET_ID: z.string().trim().min(1).optional(),
  ALERT_WEBHOOK_URL: absoluteUrl().optional(),

  SESSION_COOKIE_NAME: z.string().trim().regex(/^[A-Za-z0-9_-]+$/, "letters, digits, underscore and hyphen only").optional(),
  SESSION_TTL_DAYS: wholeNumber(1, 365).optional(),
});

/** What each variable is for, printed beside its problem so nobody has to go and look. */
const PURPOSE: Readonly<Record<string, string>> = {
  NODE_ENV: "Node's own mode. Default production, because the deployed app is the one that matters.",
  APP_ENV: "Which environment this is. Default prod: a founder's own deployment holds their real work.",
  PORT: "The port to bind on 0.0.0.0. Replit supplies it. Default 5000.",
  TZ: "Must be UTC if it is set at all. The process clock is asserted separately and that assertion is what counts.",
  APP_BASE_URL: "The public URL of this deployment. Derived from REPLIT_DOMAINS when it is not set.",
  LOG_LEVEL: "pino level. Default info.",
  DATABASE_URL: "Postgres. Replit supplies it. It is the record: anything not harvested into it is lost.",
  DATABASE_ENV_TAG: "Which environment this database belongs to. Must equal APP_ENV if it is set at all.",
  GE_MASTER_KEY: "32 bytes, base64. Wraps every file this founder owns. Generated on first boot when it is not set.",
  GE_MASTER_KEY_VERSION: "Which master key version is in use. Default 1.",
  ANTHROPIC_API_KEY: "The founder's own key. Pasted into the app, not set here, and never required to boot.",
  MODEL_PRIMARY: `The model that writes in a founder's voice. Default ${DEFAULT_MODEL_PRIMARY}.`,
  MODEL_UTILITY: `The model for status, gate, doctor and digests. Default ${DEFAULT_MODEL_UTILITY}.`,
  MODEL_FALLBACK: "Optional. Degrades instead of stalling when capacity blips.",
  MAX_CONCURRENT_RUNS: "Concurrent agent runs. Default 24. A guess until memory is measured.",
  MAX_LIVE_SESSIONS: "Idle CLI subprocesses held between turns. Default 60.",
  SESSION_IDLE_MS: "How long a session may idle before its subprocess is torn down. Default 600000.",
  SSE_HEARTBEAT_MS: "Heartbeat on the SSE stream. Default 15000, and it must sit under the proxy's real idle timeout.",
  RATE_TURNS_PER_HOUR: "Per founder token bucket. Default 30.",
  RATE_TURNS_PER_DAY: "Per founder token bucket. Default 200.",
  TURN_SPEND_CAP_USD: `Hard ceiling for one turn. Default ${String(DEFAULT_TURN_CAP_USD)} dollars.`,
  FOUNDER_SPEND_CAP_USD: `Ceiling for everything this deployment may spend. Default ${String(DEFAULT_FOUNDER_CAP_USD)} dollars.`,
  COHORT_DAILY_CAP_USD: `The daily breaker. Default ${String(DEFAULT_DAILY_CAP_USD)} dollars. This is what stops a loop at 3am.`,
  GE_BIN: "Path to ge inside the pinned submodule. Default vendor/growth-engine/plugins/growth-engine/bin/ge",
  GE_SHELL: "The shell ge runs under. Default /bin/sh.",
  GE_TIMEOUT_MS: "How long a ge invocation may take before it is killed. Default 10000, which is the number in the build document failure table.",
  WORKSPACE_ROOT: "Root of the per founder scratch folders. Default /tmp/ge. Not durable, by design.",
  GE_CONTENT_ROOT: "Where the public content repo is checked out. Blank uses the vendored submodule.",
  PGPOOL_MAX: "Postgres connections this process may open. Default 10, and it is a guess until B7 is run.",
  PG_STATEMENT_TIMEOUT_MS: "Cap on one statement. Default 30000. A statement past it is wedged, and a wedged statement holds a founder's lock.",
  OWNER_PASSPHRASE: "The passphrase that signs the founder in. Set it in Replit Secrets. Nobody can sign in until it is there.",
  OBJECT_STORAGE_BUCKET_ID: "Bucket for the nightly backup. Blank switches backups off, out loud.",
  ALERT_WEBHOOK_URL: "Optional. Where the daily spend breaker sends an alert. Blank means log only.",
  SESSION_COOKIE_NAME: "Default lh_session.",
  SESSION_TTL_DAYS: "Sliding session lifetime. Default 90, long on purpose.",
  REPLIT_DOMAINS: "Set by Replit. The domain this deployment answers on. APP_BASE_URL is built from it.",
};

const purposeOf = (name: string): string => PURPOSE[name] ?? "See .env.example.";

/**
 * Run a schema, collect every problem, and STILL return the fields that were fine.
 *
 * WHY IT EXISTS, and it is a bug this file used to have rather than a nicety. zod's
 * safeParse gives back either data or an error, never both. So one unreadable value, say a
 * spend cap typed as "free", meant `v` was an empty object and every check written against
 * `v` was skipped. A boot report that promises "every problem at once" was quietly
 * reporting one, and the founder fixed it, restarted, and met the next one. A test that
 * set two wrong values at the same time is what found it.
 *
 * The second pass drops exactly the fields that failed and re-reads the rest, so a bad
 * spend cap and a bad TZ are two lines in one report. Only ever runs on the failing path.
 */
function parseCollecting<T extends z.ZodType>(
  s: T,
  cleaned: Record<string, string>,
  problems: EnvProblem[],
): Partial<z.infer<T>> {
  const first = s.safeParse(cleaned);
  if (first.success) return first.data as Partial<z.infer<T>>;

  const failed = new Set<string>();
  for (const issue of first.error.issues) {
    const name = String(issue.path[0] ?? "(unknown)");
    failed.add(name);
    problems.push({ variable: name, problem: issue.message, whatItIsFor: purposeOf(name) });
  }

  const survivors: Record<string, string> = {};
  for (const [k, value] of Object.entries(cleaned)) if (!failed.has(k)) survivors[k] = value;
  const second = s.safeParse(survivors);
  return second.success ? (second.data as Partial<z.infer<T>>) : {};
}

// ---------------------------------------------------------------------------------------
// Checks that are not about a single variable
// ---------------------------------------------------------------------------------------

/**
 * Full ICU, proved rather than assumed.
 *
 * A slim Node build accepts an unknown timezone silently in some paths and throws in
 * others. Constructing the formatter here, at boot, turns a wrong scheduled post into a
 * process that refuses to start.
 */
export function assertFullIcu(): EnvProblem[] {
  const problems: EnvProblem[] = [];
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    // A build with only English data still resolves the zone, so also check the offset is
    // real: 2026-07-01T16:00Z is 12:00 in New York on daylight time.
    const parts = fmt.formatToParts(new Date("2026-07-01T16:00:00Z"));
    const hour = parts.find((p) => p.type === "hour")?.value;
    if (hour !== "12") {
      problems.push({
        variable: "ICU",
        problem: `America/New_York resolved but produced hour ${String(hour)} where 12 was expected. The timezone database in this image is wrong.`,
        whatItIsFor: "Every founder facing time and every scheduled post depends on this zone.",
      });
    }
  } catch (err) {
    problems.push({
      variable: "ICU",
      problem: `America/New_York does not resolve in this Node build: ${err instanceof Error ? err.message : String(err)}`,
      whatItIsFor: "Full ICU. Without it no founder time can be rendered correctly.",
    });
  }
  return problems;
}

/** The process really is running in UTC, not merely told to. */
export function assertUtcProcessClock(): EnvProblem[] {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolved !== "UTC" && resolved !== "Etc/UTC") {
    return [
      {
        variable: "TZ",
        problem: `The process clock resolved to ${resolved}, not UTC. Setting TZ after boot does not move it. The start script in package.json sets TZ=UTC, so this means the app was started some other way.`,
        whatItIsFor: "The server stores and reasons in UTC. Founder local time is a conversion at the edges.",
      },
    ];
  }
  return [];
}

/**
 * No ambient vendor credential exists.
 *
 * This is layer 2 of the five that keep one founder's token off another founder's calls.
 * Every vendor credential belongs to one founder, lives encrypted in the database bound to
 * that founder's id, and is decrypted at the call site. A process wide token is a
 * credential with no owner. If one is ever set, on any machine, this refuses to boot rather
 * than let some later module quietly pick it up as a default.
 *
 * STILL FATAL, AND THAT IS NOT AN EXCEPTION TO THE NEW RULE. The new rule is that an
 * ABSENT variable never stops the boot. This is not an absence. It is a wrong thing that is
 * present, and a founder who pasted a GoHighLevel token into the Secrets pane instead of
 * into the app needs to be told, not accommodated.
 */
export function assertNoAmbientVendorCredentials(raw: Readonly<Record<string, string | undefined>>): EnvProblem[] {
  const vendor = /(GHL|GOHIGHLEVEL|HIGHLEVEL|APOLLO)/i;
  const credential = /(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|BEARER|PIT)/i;
  const problems: EnvProblem[] = [];
  for (const name of Object.keys(raw)) {
    if (vendor.test(name) && credential.test(name) && (raw[name] ?? "") !== "") {
      problems.push({
        variable: name,
        problem: "A vendor credential is set at process level. Unset it. There is no ambient vendor credential in this app.",
        whatItIsFor:
          "Nothing. Vendor credentials are per founder rows, encrypted and bound to a founder id, decrypted only at the call site.",
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------
// APP_BASE_URL, derived rather than asked for
// ---------------------------------------------------------------------------------------

export type BaseUrlSource = "APP_BASE_URL" | "REPLIT_DOMAINS" | "REPLIT_DEV_DOMAIN" | "localhost";

/**
 * Where this deployment answers, worked out rather than typed in.
 *
 * WHY IT EXISTS. APP_BASE_URL was a required variable. Asking a founder to find their own
 * deployment's URL and paste it back into that same deployment, correctly, without a
 * trailing slash, is a step that fails in a room. Replit already knows the answer.
 *
 * WHAT IS VERIFIED AND WHAT IS NOT. The Replit documentation names REPLIT_DOMAINS and
 * describes republishing as the way to refresh "the domain list", so the name is real and
 * the value is a list of something. It does NOT document the separator, whether a scheme is
 * included, or whether a path can appear. None of that is guessed at below. The value is
 * read defensively: split on commas, take the first entry that is not empty, throw away
 * anything that looks like a scheme or a path, keep the host. That reading is correct
 * whether the value turns out to be one bare host or five with schemes on them, and it is
 * correct without anybody having run the deployment probe first.
 *
 * FAIL CLOSED. If what comes back does not build a URL, it is ignored and the fallback is
 * used, with a warning. A wrong base URL is a broken link. A throw here is a founder who
 * cannot start the app at all.
 *
 * ORDER. An explicit APP_BASE_URL always wins, because somebody typing one means it.
 *
 * WHAT CALLS IT. parseEnv, and its own test.
 * WHAT IT READS. The object it is handed. WHAT IT WRITES. Nothing.
 */
export function deriveAppBaseUrl(
  raw: Readonly<Record<string, string | undefined>>,
  port: number,
): { url: string; from: BaseUrlSource } {
  const explicit = (raw["APP_BASE_URL"] ?? "").trim();
  if (explicit !== "") return { url: explicit.replace(/\/+$/, ""), from: "APP_BASE_URL" };

  // REPLIT_DOMAINS is the one the documentation names and the one that exists in a
  // deployment. REPLIT_DEV_DOMAIN is its workspace only sibling, tried second because it
  // costs one lookup and it turns "try it in the workspace first" into a working link.
  const order: readonly BaseUrlSource[] = ["REPLIT_DOMAINS", "REPLIT_DEV_DOMAIN"];
  for (const name of order) {
    const host = firstHost(raw[name]);
    if (host !== undefined) return { url: `https://${host}`, from: name };
  }

  return { url: `http://localhost:${String(port)}`, from: "localhost" };
}

/**
 * The first usable host out of a value whose exact shape nobody has read off a real
 * deployment yet. Returns undefined rather than a half parsed string.
 */
function firstHost(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  for (const piece of value.split(",")) {
    // Drop a scheme if there is one, drop everything from the first slash, drop whitespace.
    const candidate = piece
      .trim()
      .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
      .split("/")[0]
      ?.trim();
    if (candidate === undefined || candidate === "") continue;
    // Checked by construction rather than by regex guesswork: if the URL constructor will
    // not take it as a host, it is not a host.
    try {
      const parsed = new URL(`https://${candidate}`);
      if (parsed.hostname !== "") return parsed.host;
    } catch {
      continue;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// The settings that are read after boot
//
// WHY THIS BLOCK EXISTS. Five modules need a value at the moment they are called rather
// than once at startup: ge/run.ts decides which binary to spawn and under which shell,
// storage/paths.ts turns a founder id into a directory, storage/crypto.ts holds a keyring
// that a rotation adds to, db/client.ts sizes the pool, and rules/content-root.ts finds
// the content repo. Each of them read process.env itself, so each carried its own default
// and its own idea of what a bad value meant. A GE_SHELL typo found inside ge/run.ts is
// found at a founder's first turn, on the tenancy critical path. The same typo found here
// stops the process before it serves anything.
//
// So the reading and the checking happen once, here, and those modules call lateSettings().
// parseEnv runs the same check at boot. A process that never called loadEnv, meaning a test
// or a one off script, gets the same check on every call instead: same schema, same
// defaults, same refusal, later. One place to look, one set of numbers.
//
// THE KEYRING IS NOW WRITABLE ONCE, through installMasterKey. See its header.
// ---------------------------------------------------------------------------------------

/** src/server/env.ts -> src/server -> src -> the app repo root. */
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The submodule path, relative to the app repo root. */
const DEFAULT_GE_BIN_REL = "vendor/growth-engine/plugins/growth-engine/bin/ge";

/** How many master key versions a rotation may hold at once. */
export const MAX_MASTER_KEY_VERSION = 9;

export interface LateSettings {
  /**
   * Absolute, always, and that is the point of resolving it here.
   *
   * It is argv[1] of a spawn whose cwd is the founder's own folder, so a relative path
   * is looked for inside /tmp/ge/<founderId>, ge is not there, and every founder write
   * fails with 127. The existsSync check below resolves against the server's working
   * directory instead, where the file really is, so boot passes and only founders see it.
   */
  readonly geBin: string;
  readonly geShell: string;
  readonly geTimeoutMs: number;
  readonly workspaceRoot: string;
  readonly pgPoolMax: number;
  readonly pgStatementTimeoutMs: number;
  readonly databaseUrl: string | undefined;
  readonly contentRoot: string | undefined;
  /**
   * Master keys by version, base64 exactly as given. The bytes are decoded and checked by
   * storage/crypto.ts, which is where the refusal messages live and where a key that is
   * 16 bytes or all zeroes is named. This carries strings and reads none of them.
   *
   * ON A FOUNDER'S DEPLOYMENT THIS MAP IS EMPTY WHEN loadEnv RETURNS, and is filled a
   * moment later by installMasterKey once the database has answered. Nothing reads it in
   * between: crypto.ts is only reached from inside a turn, and turns are refused until the
   * boot path has finished.
   */
  readonly masterKeys: ReadonlyMap<number, string>;
  /** GE_MASTER_KEY_VERSION when it is set. Absent means the highest version held. */
  readonly masterKeyVersionPin: number | undefined;
  /** Keeps the database URL and the keyring out of a stray log line. */
  toJSON(): Record<string, unknown>;
}

/**
 * The late variables, and the only place they are checked.
 *
 * GE_MASTER_KEY, GE_MASTER_KEY_V2 to V9 and DATABASE_URL are not in here. They are carried
 * through as the strings they are: their content is checked in the boot schema above and
 * in storage/crypto.ts, and checking a value twice means reporting one mistake twice.
 */
const lateSchema = z.object({
  GE_BIN: z.string().trim().min(1).optional(),
  GE_SHELL: z.string().trim().min(1).optional(),
  GE_TIMEOUT_MS: wholeNumber(1_000, 600_000).optional(),
  WORKSPACE_ROOT: z.string().trim().min(1).optional(),
  PGPOOL_MAX: wholeNumber(1, 500).optional(),
  PG_STATEMENT_TIMEOUT_MS: wholeNumber(1_000, 600_000).optional(),
  GE_CONTENT_ROOT: z.string().trim().min(1).optional(),
  GE_MASTER_KEY_VERSION: wholeNumber(1, MAX_MASTER_KEY_VERSION).optional(),
});

/**
 * A blank variable is an absent one.
 *
 * .env.example ships every name with nothing after it, and a Replit Secret left empty
 * arrives as "". Read literally, a variable set to nothing passes as present and
 * GE_BIN="" resolves to the working directory.
 *
 * THIS ONE LINE IS ALSO WHAT MAKES A REPLIT REMIX WORK. Replit's own documentation says a
 * remix copies "Secret names, not values. Your Remix lists them so you know what to fill
 * in, with empty values." So every founder's very first boot sees a full set of blank
 * variables, and every one of them has to read as absent rather than as present and empty.
 */
function compact(raw: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}

/**
 * Check and resolve the late variables. Returns the problems rather than throwing, so
 * parseEnv can print every problem in the environment in one report instead of four.
 *
 * Defaults are applied even when there are problems. Nothing uses the result in that case,
 * because parseEnv throws, and a half built object is easier to reason about than a
 * partial type.
 */
export function parseLateSettings(raw: Readonly<Record<string, string | undefined>>): {
  settings: LateSettings;
  problems: EnvProblem[];
} {
  const cleaned = compact(raw);
  const problems: EnvProblem[] = [];

  const v = parseCollecting(lateSchema, cleaned, problems);

  // Rotation is additive: GE_MASTER_KEY is version 1, GE_MASTER_KEY_V2 is version 2, and an
  // old key stays until every row wrapped under it has been rewritten.
  const masterKeys = new Map<number, string>();
  const first = cleaned["GE_MASTER_KEY"];
  if (first !== undefined) masterKeys.set(1, first);
  for (let n = 2; n <= MAX_MASTER_KEY_VERSION; n++) {
    const key = cleaned[`GE_MASTER_KEY_V${String(n)}`];
    if (key !== undefined) masterKeys.set(n, key);
  }

  const databaseUrl = cleaned["DATABASE_URL"];

  const settings: LateSettings = Object.freeze({
    // An explicit GE_BIN is resolved against the working directory, which is what an
    // operator typing a relative path in a shell means. The default is resolved against
    // this file's own location, so the answer does not depend on where the process was
    // started from.
    geBin: v.GE_BIN !== undefined ? resolve(v.GE_BIN) : join(APP_ROOT, DEFAULT_GE_BIN_REL),
    geShell: v.GE_SHELL ?? "/bin/sh",
    // Ten seconds, then SIGTERM and a two second grace. The build document failure table
    // is the source of this number and ge/run.ts implements the rest of that row.
    geTimeoutMs: v.GE_TIMEOUT_MS ?? 10_000,
    workspaceRoot: v.WORKSPACE_ROOT ?? "/tmp/ge",
    pgPoolMax: v.PGPOOL_MAX ?? 10,
    pgStatementTimeoutMs: v.PG_STATEMENT_TIMEOUT_MS ?? 30_000,
    databaseUrl,
    contentRoot: v.GE_CONTENT_ROOT !== undefined ? resolve(v.GE_CONTENT_ROOT) : undefined,
    masterKeys: masterKeys as ReadonlyMap<number, string>,
    masterKeyVersionPin: v.GE_MASTER_KEY_VERSION,
    toJSON(): Record<string, unknown> {
      return {
        geBin: settings.geBin,
        geShell: settings.geShell,
        geTimeoutMs: settings.geTimeoutMs,
        workspaceRoot: settings.workspaceRoot,
        pgPoolMax: settings.pgPoolMax,
        pgStatementTimeoutMs: settings.pgStatementTimeoutMs,
        contentRoot: settings.contentRoot,
        databaseUrl: databaseUrl === undefined ? "[not set]" : "[set, not shown]",
        masterKeys: `${String(settings.masterKeys.size)} version(s) held, values not shown`,
        masterKeyVersionPin: settings.masterKeyVersionPin,
      };
    },
  });

  return { settings, problems };
}

let cachedLate: LateSettings | undefined;

/**
 * The late settings, for the five modules that read one.
 *
 * After boot this is the object loadEnv already checked, so what a module gets is what the
 * process was allowed to start with. Before boot, which means a test or a one off script,
 * it re-reads and re-checks the environment on every call. The re-read is deliberate: a
 * test that sets WORKSPACE_ROOT to a temporary directory in beforeEach has to be able to
 * see it, and a value cached from whatever the first test set would leak between them.
 */
export function lateSettings(): LateSettings {
  if (cachedLate) return cachedLate;
  const { settings, problems } = parseLateSettings(process.env);
  if (problems.length > 0) throw new EnvError(problems);
  return settings;
}

/**
 * Put the resolved master key where storage/crypto.ts already looks for it.
 *
 * WHY IT EXISTS. On a founder's own deployment there is no GE_MASTER_KEY in the environment
 * and there never will be. The key is generated on first boot and kept in Postgres by
 * src/server/boot/master-key.ts, which cannot run until the database has answered, which is
 * long after loadEnv has returned a frozen object. crypto.ts reads its keyring through
 * lateSettings(). This is the one seam that joins those two facts, and it exists precisely
 * so that crypto.ts did not have to change at all.
 *
 * WHY IT REFUSES A SECOND, DIFFERENT KEY. Installing a different key over a live one is the
 * exact shape of the accident this whole boot path is built to prevent: every blob already
 * written is wrapped under the first key and would stop opening. Installing the SAME key
 * again is a no op, so a restart or a re-entrant call is harmless.
 *
 * WHAT CALLS IT. src/server/boot/master-key.ts, once, from main(). Tests call it directly.
 * WHAT IT READS. The current late settings. WHAT IT WRITES. The module level cache.
 */
export function installMasterKey(base64: string, version: number): void {
  if (!Number.isInteger(version) || version < 1 || version > MAX_MASTER_KEY_VERSION) {
    throw new Error(`master key version must be a whole number from 1 to ${String(MAX_MASTER_KEY_VERSION)}`);
  }
  const current = cachedLate ?? lateSettings();
  const existing = current.masterKeys.get(version);
  if (existing === base64) return;
  if (existing !== undefined) {
    throw new Error(
      `a different master key is already installed at version ${String(version)}. Everything this founder owns is wrapped under the first one, so replacing it would make every file unreadable.`,
    );
  }

  const keys = new Map(current.masterKeys);
  keys.set(version, base64);
  cachedLate = Object.freeze({
    ...current,
    masterKeys: keys as ReadonlyMap<number, string>,
    toJSON: (): Record<string, unknown> => ({
      ...current.toJSON(),
      masterKeys: `${String(keys.size)} version(s) held, values not shown`,
    }),
  });
}

// ---------------------------------------------------------------------------------------
// parseEnv
// ---------------------------------------------------------------------------------------

/**
 * Turn a raw environment into a checked Env, or throw EnvError listing every problem at
 * once. Every problem at once matters: fixing one variable, restarting, and finding the
 * next one is four restarts and forty minutes.
 *
 * IT ACCEPTS AN EMPTY OBJECT. That is the property this whole file now turns on, and
 * tests/unit/env.test.ts asserts it directly rather than trusting this sentence.
 *
 * Pure with respect to the process. It reads the object it is handed and touches the
 * filesystem only to see whether ge is there.
 */
export function parseEnv(raw: Readonly<Record<string, string | undefined>>): Env {
  // A .env file or a Replit Secret left blank arrives as "", not as absent. Treat the two
  // the same, or a variable set to nothing passes as present.
  const cleaned = compact(raw);

  const problems: EnvProblem[] = [];
  const warnings: string[] = [];

  const v = parseCollecting(schema, cleaned, problems);

  // The late variables are checked here as well as read here. That is the whole point of
  // them living in this file: a GE_SHELL that names nothing, or a GE_TIMEOUT_MS of "20s",
  // stops the process instead of stopping a founder mid turn.
  const late = parseLateSettings(cleaned);
  problems.push(...late.problems);

  // ---- TZ, if it is set at all -----------------------------------------------------------
  //
  // No longer required. assertUtcProcessClock asks the process what zone it is actually in,
  // which is the question that matters, and package.json's start script sets TZ=UTC so the
  // founder path cannot miss it. A TZ set to something else is still a refusal, because it
  // is somebody stating an intention this app cannot honour.
  if (v.TZ !== undefined && v.TZ !== "UTC") {
    problems.push({
      variable: "TZ",
      problem: `is "${v.TZ}". It must be exactly UTC, or left unset.`,
      whatItIsFor: purposeOf("TZ"),
    });
  }

  // ---- the master key, IF somebody set one by hand ----------------------------------------
  //
  // Almost nobody sets this now: it is generated on first boot and kept in Postgres. But
  // anybody who does set one, and sets it wrong, has to be told here rather than at the
  // first turn. A 24 byte key is a founder whose files never encrypt.
  if (v.GE_MASTER_KEY !== undefined) {
    // Buffer.from with base64 does not throw on bad input, it silently drops what it
    // cannot read. So the only meaningful check is the decoded length, and 32 characters
    // decoding to 24 bytes is exactly the mistake this catches.
    const bytes = Buffer.from(v.GE_MASTER_KEY, "base64").length;
    if (bytes !== 32) {
      problems.push({
        variable: "GE_MASTER_KEY",
        problem: `must be 32 bytes base64 encoded. This one decodes to ${String(bytes)} bytes. Leave it unset and the app generates one. Or generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
        whatItIsFor: purposeOf("GE_MASTER_KEY"),
      });
    }
  }

  // ---- defaults, in one block, so the whole picture is on one screen ---------------------
  //
  // APP_ENV DEFAULTS TO prod, AND THAT IS THE DELIBERATE PART. A founder's own deployment
  // holds their real work, so calling it anything else would put a false word in the health
  // endpoint and in every log line. What used to hang off "prod", a set of refusals that
  // kept a shared estate apart, is downgraded to warnings below: those rules were about
  // three environments belonging to us, and there is now one belonging to them.
  const appEnv: AppEnvName = v.APP_ENV ?? "prod";
  const port = v.PORT ?? 5000;
  const logLevel = v.LOG_LEVEL ?? "info";
  const maxConcurrentRuns = v.MAX_CONCURRENT_RUNS ?? 24;
  const maxLiveSessions = v.MAX_LIVE_SESSIONS ?? 60;
  const sessionIdleMs = v.SESSION_IDLE_MS ?? 600_000;
  const sseHeartbeatMs = v.SSE_HEARTBEAT_MS ?? 15_000;
  const ratePerHour = v.RATE_TURNS_PER_HOUR ?? 30;
  const ratePerDay = v.RATE_TURNS_PER_DAY ?? 200;
  const geShell = late.settings.geShell;
  const geTimeoutMs = late.settings.geTimeoutMs;
  const workspaceRoot = late.settings.workspaceRoot;
  const cookieName = v.SESSION_COOKIE_NAME ?? "lh_session";
  const sessionTtlDays = v.SESSION_TTL_DAYS ?? 90;
  const turnCap = v.TURN_SPEND_CAP_USD ?? DEFAULT_TURN_CAP_USD;
  const founderCap = v.FOUNDER_SPEND_CAP_USD ?? DEFAULT_FOUNDER_CAP_USD;
  const dailyCap = v.COHORT_DAILY_CAP_USD ?? DEFAULT_DAILY_CAP_USD;

  const base = deriveAppBaseUrl(cleaned, port);

  // ---- rules that need two variables at once, and are still refusals ----------------------

  // Two values that disagree is somebody having pasted a connection string into the wrong
  // pane, and the dangerous direction is a scratch process holding the string for the
  // database that holds real work.
  if (v.DATABASE_ENV_TAG !== undefined && v.DATABASE_ENV_TAG !== appEnv) {
    problems.push({
      variable: "DATABASE_ENV_TAG",
      problem: `says ${v.DATABASE_ENV_TAG} while APP_ENV says ${appEnv}. One of the two is wrong, and the dangerous case is a scratch process holding a connection string for real work.`,
      whatItIsFor: purposeOf("DATABASE_ENV_TAG"),
    });
  }

  // A turn that may spend more than the whole allowance is not a cap.
  if (turnCap > founderCap) {
    problems.push({
      variable: "TURN_SPEND_CAP_USD",
      problem: `is ${String(turnCap)} while FOUNDER_SPEND_CAP_USD is ${String(founderCap)}, so one turn could spend the whole allowance.`,
      whatItIsFor: purposeOf("TURN_SPEND_CAP_USD"),
    });
  }

  // A live session count below the concurrent run count means evicting a session that is
  // mid turn, which reads to a founder as the app forgetting the conversation.
  if (maxLiveSessions < maxConcurrentRuns) {
    problems.push({
      variable: "MAX_LIVE_SESSIONS",
      problem: `is ${String(maxLiveSessions)}, below MAX_CONCURRENT_RUNS at ${String(maxConcurrentRuns)}. That evicts sessions that are mid turn.`,
      whatItIsFor: purposeOf("MAX_LIVE_SESSIONS"),
    });
  }

  problems.push(...assertNoAmbientVendorCredentials(raw));

  // ---- warnings. Everything below here says something and starts anyway -------------------

  if (v.OWNER_PASSPHRASE === undefined) {
    warnings.push("OWNER_PASSPHRASE is not set, so nobody can sign in. Add it in Replit Secrets. The app starts and every page says the same thing until it is there.");
  }

  if (v.NODE_ENV !== undefined && v.NODE_ENV !== "production" && appEnv === "prod") {
    warnings.push(`NODE_ENV is ${v.NODE_ENV} while APP_ENV is prod. Libraries behave differently in the two, and this is rarely intentional.`);
  }

  if (v.DATABASE_URL === undefined) {
    warnings.push("DATABASE_URL is not set. Replit supplies it once the database exists. The app starts and the first screen says so, and nothing can be saved until it is there.");
  } else if (appEnv === "prod" && /(^|[@/])(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(v.DATABASE_URL)) {
    warnings.push("DATABASE_URL points at localhost. On a deployment that is almost certainly the wrong database.");
  }

  if (v.DATABASE_ENV_TAG === undefined && appEnv !== "prod") {
    warnings.push("DATABASE_ENV_TAG is not set. Setting it in every environment is what makes one database unreachable from another by accident.");
  }

  if (v.ANTHROPIC_API_KEY === undefined) {
    warnings.push("ANTHROPIC_API_KEY is not set. That is expected: it is pasted into the app, not into the environment. Nothing runs a turn until it is there.");
  }

  if (base.from === "localhost") {
    warnings.push(`APP_BASE_URL is not set and no Replit domain was found, so links are built against ${base.url}. That is right on a laptop and wrong on a deployment.`);
  }
  if (appEnv === "prod" && !base.url.startsWith("https://")) {
    warnings.push(`APP_BASE_URL is ${base.url}. Session cookies are Secure over https only, so nobody can sign in over http.`);
  }

  if (v.MODEL_PRIMARY === undefined || v.MODEL_UTILITY === undefined) {
    // Not a refusal any more, and not silent either. A pinned model id ages, and the day it
    // ages this line is the first place anybody looks.
    warnings.push(`Model ids are built in defaults: ${v.MODEL_PRIMARY ?? DEFAULT_MODEL_PRIMARY} for writing and ${v.MODEL_UTILITY ?? DEFAULT_MODEL_UTILITY} for utility work. Set MODEL_PRIMARY and MODEL_UTILITY to change them.`);
  }

  if (v.TURN_SPEND_CAP_USD === undefined || v.FOUNDER_SPEND_CAP_USD === undefined || v.COHORT_DAILY_CAP_USD === undefined) {
    warnings.push(`Spend caps are built in defaults: ${String(turnCap)} for one turn, ${String(dailyCap)} for one day, ${String(founderCap)} in total. US dollars, against the pasted API key. Change them with TURN_SPEND_CAP_USD, COHORT_DAILY_CAP_USD and FOUNDER_SPEND_CAP_USD.`);
  }

  // ge has to be there for a founder to produce anything, and its absence used to be fatal
  // outside dev. IT IS NOT FATAL ANYWHERE NOW, AND THAT IS THE POINT. However the content
  // engine reaches a founder's copy, this process cannot verify that it arrived until it
  // looks, and a founder whose copy arrived without it has to land on a screen that says so
  // rather than on a container that will not start. boot/readiness.ts turns this warning
  // into a blocker that refuses turns and explains itself in words they can act on.
  const geBinPath = late.settings.geBin;
  if (!existsSync(geBinPath)) {
    warnings.push(`GE_BIN not found at ${geBinPath}. Nothing that writes founder files works until it is there. The first screen says so, and turns are refused rather than started.`);
  }

  if (v.OBJECT_STORAGE_BUCKET_ID === undefined) {
    warnings.push("OBJECT_STORAGE_BUCKET_ID is not set, so the nightly backup is OFF. Postgres version history still holds, and this is said out loud rather than assumed.");
  }
  if (v.ALERT_WEBHOOK_URL === undefined) {
    warnings.push("ALERT_WEBHOOK_URL is not set. The daily spend breaker fires into the log only.");
  }
  if (v.SSE_HEARTBEAT_MS === undefined) {
    warnings.push("SSE_HEARTBEAT_MS is using the default 15000. Fifteen seconds is a guess. Set it from the measured proxy idle timeout in the deployment probe.");
  }

  if (problems.length > 0) throw new EnvError(problems);

  const env: Env = {
    NODE_ENV: v.NODE_ENV ?? "production",
    APP_ENV: appEnv,
    PORT: port,
    TZ: "UTC",
    APP_BASE_URL: base.url,
    LOG_LEVEL: logLevel,

    DATABASE_URL: v.DATABASE_URL,
    DATABASE_ENV_TAG: v.DATABASE_ENV_TAG,

    ANTHROPIC_API_KEY: v.ANTHROPIC_API_KEY,
    MODEL_PRIMARY: v.MODEL_PRIMARY ?? DEFAULT_MODEL_PRIMARY,
    MODEL_UTILITY: v.MODEL_UTILITY ?? DEFAULT_MODEL_UTILITY,
    MODEL_FALLBACK: v.MODEL_FALLBACK,

    MAX_CONCURRENT_RUNS: maxConcurrentRuns,
    MAX_LIVE_SESSIONS: maxLiveSessions,
    SESSION_IDLE_MS: sessionIdleMs,
    SSE_HEARTBEAT_MS: sseHeartbeatMs,
    RATE_TURNS_PER_HOUR: ratePerHour,
    RATE_TURNS_PER_DAY: ratePerDay,

    TURN_SPEND_CAP_USD: turnCap,
    FOUNDER_SPEND_CAP_USD: founderCap,
    COHORT_DAILY_CAP_USD: dailyCap,

    GE_BIN: geBinPath,
    GE_SHELL: geShell,
    GE_TIMEOUT_MS: geTimeoutMs,
    WORKSPACE_ROOT: workspaceRoot,

    OWNER_PASSPHRASE: v.OWNER_PASSPHRASE ?? "",

    OBJECT_STORAGE_BUCKET_ID: v.OBJECT_STORAGE_BUCKET_ID,
    ALERT_WEBHOOK_URL: v.ALERT_WEBHOOK_URL,

    SESSION_COOKIE_NAME: cookieName,
    SESSION_TTL_DAYS: sessionTtlDays,

    warnings: Object.freeze(warnings),

    // pino serialises objects it is handed. Without this, one log line puts the founder's
    // own API key into a log aggregator and then into a support screenshot.
    toJSON(): Record<string, unknown> {
      return describeEnv(this);
    },
  };

  return Object.freeze(env);
}

/** A summary safe to log, print, or paste into a support thread. Secrets are named, never shown. */
export function describeEnv(env: Env): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, value] of Object.entries(env)) {
    if (typeof value === "function") continue;
    if ((SECRET_KEYS as readonly string[]).includes(k)) {
      // Undefined is now a normal state for two of these, so say which of the two it is.
      // "[not set]" and "[set, not shown]" are both answers. A missing line is not.
      out[k] = value === undefined || value === "" ? "[not set]" : "[set, not shown]";
      continue;
    }
    out[k] = value;
  }
  for (const k of ENV_SECRET_FIELDS) if (!(k in out)) out[k] = "[not set]";
  return out;
}

/** The boot report. One block, every problem, each naming its variable. */
export function formatProblems(problems: readonly EnvProblem[]): string {
  const lines: string[] = [
    "",
    "==========================================================================",
    " The app cannot start. Something that IS set is wrong.",
    "==========================================================================",
    "",
    `${String(problems.length)} problem${problems.length === 1 ? "" : "s"}, all of them listed so this takes one fix and not four restarts.`,
    "",
    "Nothing below is a missing variable. Missing is fine now: the app starts with an empty",
    "environment and the first screen says what to do. Everything below is a value that is",
    "present and cannot be used.",
    "",
  ];
  for (const p of problems) {
    lines.push(`  ${p.variable}`);
    lines.push(`    ${p.problem}`);
    lines.push(`    What it is for: ${p.whatItIsFor}`);
    lines.push("");
  }
  lines.push("Every variable is documented in .env.example. Set them in Replit Secrets, or");
  lines.push("copy .env.example to .env on a laptop. There are no values in .env.example and");
  lines.push("there never will be.");
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// loadEnv: the boot path
// ---------------------------------------------------------------------------------------

let cached: Env | undefined;

/**
 * Read, check and freeze the environment, or end the process with a readable report.
 *
 * This is the only function here that may exit, and after this change it almost never
 * does. Tests call parseEnv instead, which throws, because a test runner killed by
 * process.exit tells you nothing about what failed.
 */
export function loadEnv(raw: Readonly<Record<string, string | undefined>> = process.env): Env {
  if (cached) return cached;

  const runtimeProblems = [...assertUtcProcessClock(), ...assertFullIcu()];

  try {
    const env = parseEnv(raw);
    if (runtimeProblems.length > 0) {
      process.stderr.write(formatProblems(runtimeProblems));
      process.exit(1);
    }
    for (const w of env.warnings) process.stderr.write(`WARNING  ${w}\n`);
    cached = env;
    // Boot checked these, so every later reader gets the values the process was allowed to
    // start with rather than whatever process.env holds by then.
    cachedLate = parseLateSettings(raw).settings;
    return env;
  } catch (err) {
    if (err instanceof EnvError) {
      process.stderr.write(formatProblems([...err.problems, ...runtimeProblems]));
      process.exit(1);
    }
    throw err;
  }
}

/** Test seam. Only tests call this. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
  cachedLate = undefined;
}
