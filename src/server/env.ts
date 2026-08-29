/**
 * src/server/env.ts
 *
 * WHAT THIS IS. The one place the process reads its environment. Every variable is named,
 * typed and checked here, and nowhere else in the server calls process.env.
 *
 * WHY IT EXISTS. It fails at boot, not at 3am. A missing ANTHROPIC_API_KEY discovered when
 * a founder presses send is a support conversation during a live session with 65 people in
 * a room. The same variable discovered at boot is a deploy that refuses to start and one
 * line of output naming the variable. Those are the same bug and they cost different
 * amounts, and the difference is this file.
 *
 * It also holds three checks that are not really about variables at all, and they are here
 * because this is the only code guaranteed to run before anything else:
 *
 *   - The process clock is UTC. Every date in the system is UTC or an IANA zone name
 *     carried beside it. A server that quietly runs in some other zone puts a founder's
 *     ops-log entry under the wrong day heading, and ops-log.md is append only.
 *   - Full ICU is present, so America/New_York resolves. A slim Node build does not know
 *     that zone, and every scheduled post depends on it.
 *   - No ambient vendor credential exists. There is no GHL_TOKEN and no Apollo key at
 *     process level, by design. A vendor credential with no founder attached to it is how
 *     founder A's post ends up in founder B's account.
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
export type MailTransport = "log" | "smtp";

/** Names whose values must never reach a log, an error, or a support screenshot. */
const SECRET_KEYS = ["ANTHROPIC_API_KEY", "GE_MASTER_KEY", "DATABASE_URL", "SMTP_URL"] as const;

export interface Env {
  readonly NODE_ENV: "development" | "production" | "test";
  readonly APP_ENV: AppEnvName;
  readonly PORT: number;
  readonly TZ: "UTC";
  readonly APP_BASE_URL: string;
  readonly LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";

  readonly DATABASE_URL: string;
  readonly DATABASE_ENV_TAG: AppEnvName | undefined;

  readonly GE_MASTER_KEY: string;
  readonly GE_MASTER_KEY_VERSION: number;

  readonly ANTHROPIC_API_KEY: string;
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

  readonly MAIL_TRANSPORT: MailTransport;
  readonly MAIL_FROM: string;
  readonly MAIL_ALLOWLIST: readonly string[];
  readonly SMTP_URL: string | undefined;

  readonly OBJECT_STORAGE_BUCKET_ID: string | undefined;
  readonly ALERT_WEBHOOK_URL: string | undefined;

  readonly SESSION_COOKIE_NAME: string;
  readonly SESSION_TTL_DAYS: number;
  readonly SIGNIN_TOKEN_TTL_MINUTES: number;

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
// The schema. Everything is optional here on purpose: required-ness and defaults are
// applied below, in one readable block, so the whole picture is on one screen.
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

  MAIL_TRANSPORT: z.enum(["log", "smtp"]).optional(),
  MAIL_FROM: z.string().trim().min(3).optional(),
  MAIL_ALLOWLIST: z.string().trim().min(1).optional(),
  SMTP_URL: z.string().trim().min(1).optional(),

  OBJECT_STORAGE_BUCKET_ID: z.string().trim().min(1).optional(),
  ALERT_WEBHOOK_URL: absoluteUrl().optional(),

  SESSION_COOKIE_NAME: z.string().trim().regex(/^[A-Za-z0-9_-]+$/, "letters, digits, underscore and hyphen only").optional(),
  SESSION_TTL_DAYS: wholeNumber(1, 365).optional(),
  SIGNIN_TOKEN_TTL_MINUTES: wholeNumber(1, 1440).optional(),
});

/** What each variable is for, printed beside its problem so nobody has to go and look. */
const PURPOSE: Readonly<Record<string, string>> = {
  NODE_ENV: "Node's own mode. development, production or test.",
  APP_ENV: "Which of the three environments this is: dev, preview or prod.",
  PORT: "The port to bind on 0.0.0.0. Replit supplies it. Default 5000.",
  TZ: "Must be UTC. The process clock. Founder times are converted at the two edges only.",
  APP_BASE_URL: "The public URL of this deployment. Magic link emails are built from it.",
  LOG_LEVEL: "pino level. Default info.",
  DATABASE_URL: "Postgres. It is the record: anything not harvested into it is lost.",
  DATABASE_ENV_TAG: "Which environment this database belongs to. Must equal APP_ENV.",
  GE_MASTER_KEY: "32 bytes, base64. Wraps every founder's data key. Escrowed offline.",
  GE_MASTER_KEY_VERSION: "Which master key version is in use. Default 1.",
  ANTHROPIC_API_KEY: "The key funding all 130 founders. The spend caps exist because of it.",
  MODEL_PRIMARY: "The model that writes in a founder's voice. No default, on purpose.",
  MODEL_UTILITY: "The model for status, gate, doctor and digests. No default, on purpose.",
  MODEL_FALLBACK: "Optional. Degrades instead of stalling when capacity blips.",
  MAX_CONCURRENT_RUNS: "Concurrent agent runs. Default 24. A guess until memory is measured.",
  MAX_LIVE_SESSIONS: "Idle CLI subprocesses held between turns. Default 60.",
  SESSION_IDLE_MS: "How long a session may idle before its subprocess is torn down. Default 600000.",
  SSE_HEARTBEAT_MS: "Heartbeat on the SSE stream. Default 15000, and it must sit under the proxy's real idle timeout.",
  RATE_TURNS_PER_HOUR: "Per founder token bucket. Default 30.",
  RATE_TURNS_PER_DAY: "Per founder token bucket. Default 200.",
  TURN_SPEND_CAP_USD: "Hard ceiling for one turn. Required, no default, because a cap with a default is a cap nobody chose.",
  FOUNDER_SPEND_CAP_USD: "Ceiling for one founder across the programme. Required, no default.",
  COHORT_DAILY_CAP_USD: "The cohort breaker. Global daily ceiling. Required, no default.",
  GE_BIN: "Path to ge inside the pinned submodule. Default vendor/growth-engine/plugins/growth-engine/bin/ge",
  GE_SHELL: "The shell ge runs under. Default /bin/sh.",
  GE_TIMEOUT_MS: "How long a ge invocation may take before it is killed. Default 10000, which is the number in the build document failure table.",
  WORKSPACE_ROOT: "Root of the per founder scratch folders. Default /tmp/ge. Not durable, by design.",
  GE_CONTENT_ROOT: "Where the public content repo is checked out. Blank uses the vendored submodule.",
  PGPOOL_MAX: "Postgres connections this process may open. Default 10, and it is a guess until B7 is run.",
  PG_STATEMENT_TIMEOUT_MS: "Cap on one statement. Default 30000. A statement past it is wedged, and a wedged statement holds a founder's lock.",
  MAIL_TRANSPORT: "log or smtp. Default log. prod refuses log.",
  MAIL_FROM: "The From address on sign in emails.",
  MAIL_ALLOWLIST: "Comma separated addresses that may receive mail outside prod. The mailer fails closed on anything else.",
  SMTP_URL: "SMTP connection string. Required when MAIL_TRANSPORT is smtp.",
  OBJECT_STORAGE_BUCKET_ID: "Bucket for the nightly per founder backup. Blank switches backups off, out loud.",
  ALERT_WEBHOOK_URL: "Optional. Where the cohort breaker sends an alert. Blank means log only.",
  SESSION_COOKIE_NAME: "Default lh_session.",
  SESSION_TTL_DAYS: "Sliding session lifetime. Default 90, long on purpose.",
  SIGNIN_TOKEN_TTL_MINUTES: "Sign in link lifetime. Default 30, not 15, because founders read email on a phone and walk to a laptop.",
};

const purposeOf = (name: string): string => PURPOSE[name] ?? "See .env.example.";

// ---------------------------------------------------------------------------------------
// Checks that are not about a single variable
// ---------------------------------------------------------------------------------------

/**
 * Full ICU, proved rather than assumed.
 *
 * A slim Node build accepts an unknown timezone silently in some paths and throws in
 * others. Constructing the formatter here, at boot, turns a wrong scheduled post for 130
 * founders into a deployment that refuses to start.
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
        problem: `The process clock resolved to ${resolved}, not UTC. Setting TZ after boot does not move it.`,
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
// The settings that are read after boot
//
// WHY THIS BLOCK EXISTS. Five modules need a value at the moment they are called rather
// than once at startup: ge/run.ts decides which binary to spawn and under which shell,
// storage/paths.ts turns a founder id into a directory, storage/crypto.ts holds a keyring
// that a rotation adds to, db/client.ts sizes the pool, and rules/content-root.ts finds
// the content repo. Each of them read process.env itself, so each carried its own default
// and its own idea of what a bad value meant. A GE_SHELL typo found inside ge/run.ts is
// found at a founder's first turn, on the tenancy critical path, with 65 people in a room.
// The same typo found here is a deploy that refuses to start.
//
// So the reading and the checking happen once, here, and those modules call lateSettings().
// parseEnv runs the same check at boot, which is what makes a bad value a failed deploy. A
// process that never called loadEnv, meaning a test or a one off script, gets the same
// check on every call instead: same schema, same defaults, same refusal, later. One place
// to look, one set of numbers.
// ---------------------------------------------------------------------------------------

/** src/server/env.ts -> src/server -> src -> the app repo root. */
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The submodule path, relative to the app repo root. */
const DEFAULT_GE_BIN_REL = "vendor/growth-engine/plugins/growth-engine/bin/ge";

/** How many master key versions a rotation may hold at once. */
const MAX_MASTER_KEY_VERSION = 9;

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
   *16 bytes or all zeroes is named. This carries strings and reads none of them.
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
 * arrives as "". Read literally, a required variable set to nothing passes as present and
 * GE_BIN="" resolves to the working directory.
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

  const parsed = lateSchema.safeParse(cleaned);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0] ?? "(unknown)");
      problems.push({ variable: name, problem: issue.message, whatItIsFor: purposeOf(name) });
    }
  }
  const v = parsed.success ? parsed.data : ({} as Partial<z.infer<typeof lateSchema>>);

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
        masterKeys: `${String(masterKeys.size)} version(s) held, values not shown`,
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
 * deploy was allowed to start with. Before boot, which means a test or a one off script,
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

// ---------------------------------------------------------------------------------------
// parseEnv
// ---------------------------------------------------------------------------------------

/**
 * Turn a raw environment into a checked Env, or throw EnvError listing every problem at
 * once. Every problem at once matters: fixing one variable, redeploying, and finding the
 * next one is four deploys and forty minutes.
 *
 * Pure with respect to the process. It reads the object it is handed and touches the
 * filesystem only to confirm ge exists.
 */
export function parseEnv(raw: Readonly<Record<string, string | undefined>>): Env {
  // A .env file or a Replit Secret left blank arrives as "", not as absent. Treat the two
  // the same, or a required variable set to nothing passes as present.
  const cleaned = compact(raw);

  const problems: EnvProblem[] = [];
  const warnings: string[] = [];

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = String(issue.path[0] ?? "(unknown)");
      problems.push({ variable: name, problem: issue.message, whatItIsFor: purposeOf(name) });
    }
  }
  const v = parsed.success ? parsed.data : ({} as Partial<z.infer<typeof schema>>);

  // The late variables are checked here as well as read here. That is the whole point of
  // them living in this file: a GE_SHELL that names nothing, or a GE_TIMEOUT_MS of "20s",
  // stops the deploy instead of stopping a founder mid turn.
  const late = parseLateSettings(cleaned);
  problems.push(...late.problems);

  const missing = (name: keyof typeof PURPOSE, why = "is required and is not set"): void => {
    problems.push({ variable: String(name), problem: why, whatItIsFor: purposeOf(String(name)) });
  };

  // ---- required, always ----------------------------------------------------------------
  if (v.NODE_ENV === undefined) missing("NODE_ENV");
  if (v.APP_ENV === undefined) missing("APP_ENV");
  if (v.APP_BASE_URL === undefined) missing("APP_BASE_URL");
  if (v.DATABASE_URL === undefined) missing("DATABASE_URL");
  if (v.GE_MASTER_KEY === undefined) missing("GE_MASTER_KEY");
  if (v.ANTHROPIC_API_KEY === undefined) missing("ANTHROPIC_API_KEY");
  if (v.MODEL_PRIMARY === undefined) missing("MODEL_PRIMARY", "is required and has no default, so that model ids are looked up on the day rather than inherited from a stale table");
  if (v.MODEL_UTILITY === undefined) missing("MODEL_UTILITY", "is required and has no default, for the same reason as MODEL_PRIMARY");
  if (v.MAIL_FROM === undefined) missing("MAIL_FROM");
  if (v.TURN_SPEND_CAP_USD === undefined) missing("TURN_SPEND_CAP_USD", "is required and has no default. A cap with a default is a cap nobody chose");
  if (v.FOUNDER_SPEND_CAP_USD === undefined) missing("FOUNDER_SPEND_CAP_USD", "is required and has no default");
  if (v.COHORT_DAILY_CAP_USD === undefined) missing("COHORT_DAILY_CAP_USD", "is required and has no default. This is the breaker that stops a bug billing 130 people at 3am");

  // ---- TZ, as a variable as well as a runtime fact --------------------------------------
  if (v.TZ === undefined) {
    missing("TZ", "is required and must be exactly UTC");
  } else if (v.TZ !== "UTC") {
    problems.push({
      variable: "TZ",
      problem: `is "${v.TZ}". It must be exactly UTC.`,
      whatItIsFor: purposeOf("TZ"),
    });
  }

  // ---- the master key is 32 bytes, decoded, not 32 characters ---------------------------
  if (v.GE_MASTER_KEY !== undefined) {
    // Buffer.from with base64 does not throw on bad input, it silently drops what it
    // cannot read. So the only meaningful check is the decoded length, and 32 characters
    // decoding to 24 bytes is exactly the mistake this catches.
    const bytes = Buffer.from(v.GE_MASTER_KEY, "base64").length;
    if (bytes !== 32) {
      problems.push({
        variable: "GE_MASTER_KEY",
        problem: `must be 32 bytes base64 encoded. This one decodes to ${String(bytes)} bytes. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
        whatItIsFor: purposeOf("GE_MASTER_KEY"),
      });
    }
  }

  // ---- defaults, in one block, so the whole picture is on one screen ---------------------
  const appEnv: AppEnvName = v.APP_ENV ?? "dev";
  const port = v.PORT ?? 5000;
  const logLevel = v.LOG_LEVEL ?? "info";
  const masterKeyVersion = late.settings.masterKeyVersionPin ?? 1;
  const maxConcurrentRuns = v.MAX_CONCURRENT_RUNS ?? 24;
  const maxLiveSessions = v.MAX_LIVE_SESSIONS ?? 60;
  const sessionIdleMs = v.SESSION_IDLE_MS ?? 600_000;
  const sseHeartbeatMs = v.SSE_HEARTBEAT_MS ?? 15_000;
  const ratePerHour = v.RATE_TURNS_PER_HOUR ?? 30;
  const ratePerDay = v.RATE_TURNS_PER_DAY ?? 200;
  const geShell = late.settings.geShell;
  const geTimeoutMs = late.settings.geTimeoutMs;
  const workspaceRoot = late.settings.workspaceRoot;
  const mailTransport: MailTransport = v.MAIL_TRANSPORT ?? "log";
  const cookieName = v.SESSION_COOKIE_NAME ?? "lh_session";
  const sessionTtlDays = v.SESSION_TTL_DAYS ?? 90;
  const signinTtlMinutes = v.SIGNIN_TOKEN_TTL_MINUTES ?? 30;

  const mailAllowlist = (v.MAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  // ---- rules that need two variables at once --------------------------------------------

  // The accident that ends this project is a preview process pointed at the prod database,
  // writing over a founder's Brain. Two variables that must agree is a cheap guard against
  // a connection string pasted into the wrong pane.
  if (v.DATABASE_ENV_TAG !== undefined && v.DATABASE_ENV_TAG !== appEnv) {
    problems.push({
      variable: "DATABASE_ENV_TAG",
      problem: `says ${v.DATABASE_ENV_TAG} while APP_ENV says ${appEnv}. One of the two is wrong, and the dangerous case is a non prod process holding a prod connection string.`,
      whatItIsFor: purposeOf("DATABASE_ENV_TAG"),
    });
  }
  if (appEnv === "prod" && v.DATABASE_ENV_TAG === undefined) {
    missing("DATABASE_ENV_TAG", "is required when APP_ENV is prod");
  }
  if (appEnv !== "prod" && v.DATABASE_ENV_TAG === undefined) {
    warnings.push("DATABASE_ENV_TAG is not set. Setting it in every environment is what makes the prod database unreachable from anywhere else by accident.");
  }

  if (appEnv === "prod" && v.NODE_ENV !== undefined && v.NODE_ENV !== "production") {
    problems.push({
      variable: "NODE_ENV",
      problem: `is ${v.NODE_ENV} while APP_ENV is prod. Libraries behave differently and this is never intentional.`,
      whatItIsFor: purposeOf("NODE_ENV"),
    });
  }

  if (appEnv === "prod" && v.DATABASE_URL !== undefined && /(^|[@/])(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(v.DATABASE_URL)) {
    problems.push({
      variable: "DATABASE_URL",
      problem: "points at localhost while APP_ENV is prod.",
      whatItIsFor: purposeOf("DATABASE_URL"),
    });
  }

  if (appEnv === "prod" && v.APP_BASE_URL !== undefined && !v.APP_BASE_URL.startsWith("https://")) {
    problems.push({
      variable: "APP_BASE_URL",
      problem: "must be https in prod. Session cookies are Secure, so a http base URL means nobody can sign in.",
      whatItIsFor: purposeOf("APP_BASE_URL"),
    });
  }

  // The mailer fails closed outside prod. A seeded founder with a plausible address must not
  // be able to cause a real email to a real person.
  if (appEnv !== "prod" && mailAllowlist.length === 0) {
    missing("MAIL_ALLOWLIST", "is required outside prod. Without it the mailer has nothing to fail closed against");
  }
  if (appEnv === "prod" && mailTransport === "log") {
    problems.push({
      variable: "MAIL_TRANSPORT",
      problem: "is log in prod. Sign in is a magic link, so a prod deployment that cannot send mail is one nobody can sign in to.",
      whatItIsFor: purposeOf("MAIL_TRANSPORT"),
    });
  }
  if (mailTransport === "smtp" && v.SMTP_URL === undefined) {
    missing("SMTP_URL", "is required when MAIL_TRANSPORT is smtp");
  }
  if (appEnv === "prod" && mailAllowlist.length > 0) {
    warnings.push("MAIL_ALLOWLIST is set in prod and will be ignored. In prod the roster is the list.");
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

  if (v.TURN_SPEND_CAP_USD !== undefined && v.FOUNDER_SPEND_CAP_USD !== undefined && v.TURN_SPEND_CAP_USD > v.FOUNDER_SPEND_CAP_USD) {
    problems.push({
      variable: "TURN_SPEND_CAP_USD",
      problem: `is larger than FOUNDER_SPEND_CAP_USD, so one turn could spend a founder's whole allowance.`,
      whatItIsFor: purposeOf("TURN_SPEND_CAP_USD"),
    });
  }

  // ge has to exist. In dev it may legitimately not, because the submodule is initialised
  // separately. Anywhere else its absence means every founder write fails at the first turn.
  const geBinPath = late.settings.geBin;
  if (!existsSync(geBinPath)) {
    const note = `not found at ${geBinPath}. Run: git submodule update --init`;
    if (appEnv === "dev") warnings.push(`GE_BIN ${note}. Nothing that writes founder state will work until it is there.`);
    else problems.push({ variable: "GE_BIN", problem: note, whatItIsFor: purposeOf("GE_BIN") });
  }

  if (v.OBJECT_STORAGE_BUCKET_ID === undefined) {
    warnings.push("OBJECT_STORAGE_BUCKET_ID is not set, so the nightly per founder backup is OFF. Postgres version history still holds, and this is said out loud rather than assumed.");
  }
  if (v.ALERT_WEBHOOK_URL === undefined) {
    warnings.push("ALERT_WEBHOOK_URL is not set. The cohort breaker will fire into the log only, where nobody is watching at 3am.");
  }
  if (v.SSE_HEARTBEAT_MS === undefined) {
    warnings.push("SSE_HEARTBEAT_MS is using the default 15000. Fifteen seconds is a guess. Set it from the measured proxy idle timeout in the deployment probe.");
  }

  problems.push(...assertNoAmbientVendorCredentials(raw));

  if (problems.length > 0) throw new EnvError(problems);

  const env: Env = {
    NODE_ENV: v.NODE_ENV ?? "development",
    APP_ENV: appEnv,
    PORT: port,
    TZ: "UTC",
    APP_BASE_URL: v.APP_BASE_URL ?? "",
    LOG_LEVEL: logLevel,

    DATABASE_URL: v.DATABASE_URL ?? "",
    DATABASE_ENV_TAG: v.DATABASE_ENV_TAG,

    GE_MASTER_KEY: v.GE_MASTER_KEY ?? "",
    GE_MASTER_KEY_VERSION: masterKeyVersion,

    ANTHROPIC_API_KEY: v.ANTHROPIC_API_KEY ?? "",
    MODEL_PRIMARY: v.MODEL_PRIMARY ?? "",
    MODEL_UTILITY: v.MODEL_UTILITY ?? "",
    MODEL_FALLBACK: v.MODEL_FALLBACK,

    MAX_CONCURRENT_RUNS: maxConcurrentRuns,
    MAX_LIVE_SESSIONS: maxLiveSessions,
    SESSION_IDLE_MS: sessionIdleMs,
    SSE_HEARTBEAT_MS: sseHeartbeatMs,
    RATE_TURNS_PER_HOUR: ratePerHour,
    RATE_TURNS_PER_DAY: ratePerDay,

    TURN_SPEND_CAP_USD: v.TURN_SPEND_CAP_USD ?? 0,
    FOUNDER_SPEND_CAP_USD: v.FOUNDER_SPEND_CAP_USD ?? 0,
    COHORT_DAILY_CAP_USD: v.COHORT_DAILY_CAP_USD ?? 0,

    GE_BIN: geBinPath,
    GE_SHELL: geShell,
    GE_TIMEOUT_MS: geTimeoutMs,
    WORKSPACE_ROOT: workspaceRoot,

    MAIL_TRANSPORT: mailTransport,
    MAIL_FROM: v.MAIL_FROM ?? "",
    MAIL_ALLOWLIST: Object.freeze(mailAllowlist),
    SMTP_URL: v.SMTP_URL,

    OBJECT_STORAGE_BUCKET_ID: v.OBJECT_STORAGE_BUCKET_ID,
    ALERT_WEBHOOK_URL: v.ALERT_WEBHOOK_URL,

    SESSION_COOKIE_NAME: cookieName,
    SESSION_TTL_DAYS: sessionTtlDays,
    SIGNIN_TOKEN_TTL_MINUTES: signinTtlMinutes,

    warnings: Object.freeze(warnings),

    // pino serialises objects it is handed. Without this, one log line puts the API key
    // funding 130 founders into a log aggregator and then into a support screenshot.
    toJSON(): Record<string, unknown> {
      return describeEnv(this);
    },
  };

  return Object.freeze(env);
}

/** A summary safe to log, print, or paste into Slack. Secrets are named, never shown. */
export function describeEnv(env: Env): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, value] of Object.entries(env)) {
    if (typeof value === "function") continue;
    out[k] = (SECRET_KEYS as readonly string[]).includes(k) ? "[set, not shown]" : value;
  }
  for (const k of SECRET_KEYS) if (!(k in out)) out[k] = "[not set]";
  return out;
}

/** The boot report. One block, every problem, each naming its variable. */
export function formatProblems(problems: readonly EnvProblem[]): string {
  const lines: string[] = [
    "",
    "==========================================================================",
    " The app cannot start. The environment is not usable.",
    "==========================================================================",
    "",
    `${String(problems.length)} problem${problems.length === 1 ? "" : "s"}, all of them listed so this takes one fix and not four deploys.`,
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
 * This is the only function here that may exit. Tests call parseEnv instead, which throws,
 * because a test runner killed by process.exit tells you nothing about what failed.
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
    // Boot checked these, so every later reader gets the values the deploy was allowed to
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
