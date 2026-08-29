/**
 * tests/unit/env.test.ts
 *
 * WHAT THIS IS. Tests for src/server/env.ts.
 *
 * WHY IT EXISTS. env.ts exists to stop the process. A boot guard that has never been
 * watched refusing anything is not a guard, it is a comment. Each test here is one thing
 * that must stop a deploy, and the ones at the bottom are the ones that matter most: a
 * process wide vendor credential is refused, because a credential with no founder attached
 * is how founder A's post ends up in founder B's account, and no secret survives a
 * JSON.stringify, because that is how an API key reaches a log and then a screenshot.
 *
 * RUNNER. node:test, which is what most of this repository uses. See README.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  EnvError,
  assertFullIcu,
  assertNoAmbientVendorCredentials,
  assertUtcProcessClock,
  describeEnv,
  formatProblems,
  parseEnv,
} from "../../src/server/env.ts";

const key = randomBytes(32).toString("base64");

/** A complete, valid preview environment. Every test varies one thing from this. */
const base = (): Record<string, string> => ({
  NODE_ENV: "production",
  APP_ENV: "preview",
  TZ: "UTC",
  APP_BASE_URL: "https://preview.example.test",
  DATABASE_URL: "postgres://user:pw@db.example.test:5432/launchhouse",
  DATABASE_ENV_TAG: "preview",
  GE_MASTER_KEY: key,
  ANTHROPIC_API_KEY: "test-key-not-real",
  MODEL_PRIMARY: "a-model-id",
  MODEL_UTILITY: "another-model-id",
  MAIL_FROM: "hello@example.test",
  MAIL_ALLOWLIST: "team@example.test, mentor@example.test",
  TURN_SPEND_CAP_USD: "2.50",
  FOUNDER_SPEND_CAP_USD: "40",
  COHORT_DAILY_CAP_USD: "400",
  // Any file that certainly exists, so the ge presence check passes without the submodule.
  GE_BIN: resolve(process.cwd(), "package.json"),
});

/** The variables env.ts refused, or an empty list if it accepted everything. */
const refused = (raw: Record<string, string>): string[] => {
  try {
    parseEnv(raw);
    return [];
  } catch (err) {
    if (err instanceof EnvError) return err.problems.map((p) => p.variable);
    throw err;
  }
};

const refuses = (raw: Record<string, string>, variable: string): void => {
  const named = refused(raw);
  assert.ok(named.includes(variable), `expected ${variable} to be refused, got: ${named.join(", ") || "nothing"}`);
};

describe("parseEnv, the happy path", () => {
  test("accepts a complete environment and applies the documented defaults", () => {
    const env = parseEnv(base());
    assert.equal(env.APP_ENV, "preview");
    assert.equal(env.PORT, 5000);
    assert.equal(env.MAX_CONCURRENT_RUNS, 24);
    assert.equal(env.MAX_LIVE_SESSIONS, 60);
    assert.equal(env.SESSION_IDLE_MS, 600_000);
    assert.equal(env.SSE_HEARTBEAT_MS, 15_000);
    assert.equal(env.SIGNIN_TOKEN_TTL_MINUTES, 30);
    assert.equal(env.SESSION_TTL_DAYS, 90);
    assert.equal(env.GE_SHELL, "/bin/sh");
    assert.equal(env.WORKSPACE_ROOT, "/tmp/ge");
    assert.deepEqual([...env.MAIL_ALLOWLIST], ["team@example.test", "mentor@example.test"]);
  });

  test("says out loud that the nightly backup is off rather than pretending it ran", () => {
    assert.match(parseEnv(base()).warnings.join(" "), /nightly per founder backup is OFF/);
  });

  test("warns that the SSE heartbeat is still a guess until the probe measures it", () => {
    assert.match(parseEnv(base()).warnings.join(" "), /deployment probe/);
  });
});

describe("parseEnv refuses to boot", () => {
  test("names every missing variable at once, not one per restart", () => {
    const raw = base();
    delete raw["ANTHROPIC_API_KEY"];
    delete raw["MODEL_PRIMARY"];
    delete raw["DATABASE_URL"];
    const named = refused(raw);
    for (const v of ["ANTHROPIC_API_KEY", "MODEL_PRIMARY", "DATABASE_URL"]) {
      assert.ok(named.includes(v), `${v} should have been named`);
    }
  });

  test("treats a variable set to an empty string as missing", () => {
    // A .env file or a Replit Secret left blank arrives as "", and a required variable set
    // to nothing must not pass as present.
    refuses({ ...base(), ANTHROPIC_API_KEY: "   " }, "ANTHROPIC_API_KEY");
  });

  test("refuses a TZ that is not UTC", () => {
    refuses({ ...base(), TZ: "America/New_York" }, "TZ");
  });

  test("refuses a master key that is not 32 bytes once decoded", () => {
    // 32 characters is not 32 bytes, and that is exactly the mistake this catches.
    refuses({ ...base(), GE_MASTER_KEY: "0123456789abcdef0123456789abcdef" }, "GE_MASTER_KEY");
    refuses({ ...base(), GE_MASTER_KEY: randomBytes(16).toString("base64") }, "GE_MASTER_KEY");
  });

  test("refuses a database tag that disagrees with APP_ENV", () => {
    // The accident that ends this project is a preview process holding the prod string.
    refuses({ ...base(), DATABASE_ENV_TAG: "prod" }, "DATABASE_ENV_TAG");
  });

  test("requires the database tag in prod", () => {
    refuses(
      { ...base(), APP_ENV: "prod", DATABASE_ENV_TAG: "", MAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://mail.example.test" },
      "DATABASE_ENV_TAG",
    );
  });

  test("refuses a log mailer in prod, because sign in is a magic link", () => {
    refuses({ ...base(), APP_ENV: "prod", DATABASE_ENV_TAG: "prod", MAIL_TRANSPORT: "log" }, "MAIL_TRANSPORT");
  });

  test("requires a mail allowlist outside prod, so the mailer fails closed", () => {
    const raw = base();
    delete raw["MAIL_ALLOWLIST"];
    refuses(raw, "MAIL_ALLOWLIST");
  });

  test("requires SMTP_URL when the transport is smtp", () => {
    refuses({ ...base(), MAIL_TRANSPORT: "smtp" }, "SMTP_URL");
  });

  test("refuses a live session pool smaller than the concurrent run limit", () => {
    // Otherwise a founder mid turn is evicted, which reads as the app forgetting them.
    refuses({ ...base(), MAX_CONCURRENT_RUNS: "24", MAX_LIVE_SESSIONS: "10" }, "MAX_LIVE_SESSIONS");
  });

  test("refuses a turn cap larger than a founder's whole allowance", () => {
    refuses({ ...base(), TURN_SPEND_CAP_USD: "80", FOUNDER_SPEND_CAP_USD: "40" }, "TURN_SPEND_CAP_USD");
  });

  test("refuses a spend cap that is not a number", () => {
    refuses({ ...base(), TURN_SPEND_CAP_USD: "two dollars fifty" }, "TURN_SPEND_CAP_USD");
  });

  test("refuses a base URL with a trailing slash, because paths are appended to it", () => {
    refuses({ ...base(), APP_BASE_URL: "https://preview.example.test/" }, "APP_BASE_URL");
  });

  test("refuses a http base URL in prod, because the session cookie is Secure", () => {
    refuses(
      {
        ...base(),
        APP_ENV: "prod",
        DATABASE_ENV_TAG: "prod",
        MAIL_TRANSPORT: "smtp",
        SMTP_URL: "smtp://mail.example.test",
        APP_BASE_URL: "http://app.example.test",
      },
      "APP_BASE_URL",
    );
  });

  test("refuses a missing ge in preview and prod, and only warns in dev", () => {
    const missing = { ...base(), GE_BIN: "/nowhere/growth-engine/bin/ge" };
    refuses(missing, "GE_BIN");

    const dev = { ...missing, APP_ENV: "dev", NODE_ENV: "development", DATABASE_ENV_TAG: "dev" };
    assert.match(parseEnv(dev).warnings.join(" "), /GE_BIN/);
  });
});

describe("no ambient vendor credential exists", () => {
  test("refuses to boot when a process level vendor token is set", () => {
    for (const name of ["GHL_TOKEN", "GOHIGHLEVEL_API_KEY", "APOLLO_API_KEY", "HIGHLEVEL_PIT"]) {
      const found = assertNoAmbientVendorCredentials({ [name]: "anything-at-all" });
      assert.ok(
        found.map((p) => p.variable).includes(name),
        `${name} is a vendor credential with no founder attached and must stop the boot`,
      );
    }
  });

  test("leaves alone a vendor variable that is not a credential", () => {
    assert.deepEqual(assertNoAmbientVendorCredentials({ GHL_API_BASE: "https://example.test" }), []);
  });

  test("ignores a credential shaped name that is empty", () => {
    assert.deepEqual(assertNoAmbientVendorCredentials({ GHL_TOKEN: "" }), []);
  });

  test("is wired into parseEnv, not only available beside it", () => {
    refuses({ ...base(), APOLLO_API_KEY: "x" }, "APOLLO_API_KEY");
  });
});

describe("secrets do not leak through a log line", () => {
  test("keeps the API key and the master key out of JSON.stringify", () => {
    const serialised = JSON.stringify(parseEnv(base()));
    assert.ok(!serialised.includes("test-key-not-real"), "the API key reached a serialised env");
    assert.ok(!serialised.includes(key), "the master key reached a serialised env");
    assert.match(serialised, /\[set, not shown\]/);
  });

  test("describeEnv names every secret without showing one", () => {
    const described = describeEnv(parseEnv(base()));
    assert.equal(described["ANTHROPIC_API_KEY"], "[set, not shown]");
    assert.equal(described["GE_MASTER_KEY"], "[set, not shown]");
    assert.equal(described["DATABASE_URL"], "[set, not shown]");
    assert.equal(described["APP_ENV"], "preview");
  });
});

describe("the boot report", () => {
  test("names the variable, the problem and what it is for", () => {
    const text = formatProblems([
      { variable: "ANTHROPIC_API_KEY", problem: "is required and is not set", whatItIsFor: "The key funding all 130 founders." },
    ]);
    for (const fragment of ["ANTHROPIC_API_KEY", "is required and is not set", "What it is for", ".env.example"]) {
      assert.ok(text.includes(fragment), `the boot report should say: ${fragment}`);
    }
  });
});

describe("the runtime assertions", () => {
  test("confirms full ICU on this machine, which is the same check the deployment makes", () => {
    assert.deepEqual(assertFullIcu(), []);
  });

  test("reports the process clock rather than assuming it", () => {
    const problems = assertUtcProcessClock();
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved === "UTC" || resolved === "Etc/UTC") assert.deepEqual(problems, []);
    else assert.ok(problems.map((p) => p.variable).includes("TZ"));
  });
});
