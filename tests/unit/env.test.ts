/**
 * tests/unit/env.test.ts
 *
 * WHAT THIS IS. Tests for src/server/env.ts.
 *
 * WHY IT EXISTS, AND WHY IT IS NOW THE OPPOSITE OF WHAT IT WAS. This file used to prove
 * that env.ts stopped the process for each of thirteen missing variables. It now proves the
 * reverse for every one of them, and the first test is the whole point: AN EMPTY
 * ENVIRONMENT BOOTS. A founder remixing this app into their own Replit account gets every
 * secret name copied with an empty value, and if any of those emptied names could stop the
 * process there would be no screen to tell them what to set.
 *
 * WHAT STAYED. A value that is present and unusable still stops the process, and those
 * tests are unchanged in substance. Absent is now fine. Wrong never was, and still is not.
 *
 * THE GUARDS ARE PROVED TO FAIL BEFORE THEY ARE TRUSTED TO PASS. Every refusal below is
 * asserted by making the thing go wrong, not by asserting that a correct environment is
 * accepted. A guard only ever watched passing is a comment.
 *
 * IT PASSES WHETHER OR NOT THE PROCESS WAS STARTED WITH A MASTER KEY, AND IT DID NOT
 * USED TO. parseEnv is handed a plain object, so nothing here reads the real
 * environment, with one exception: the installMasterKey block at the bottom goes
 * through lateSettings(), which builds its keyring out of process.env. A GE_MASTER_KEY
 * in the environment is therefore already a live key, installMasterKey refuses to put a
 * different one over a live key, and four assertions failed. Not a rare environment
 * either: the skip line this project prints for its database suites tells the next
 * person to set that exact variable, so the file was red for anybody who followed the
 * instructions and green for everybody who ignored them. See
 * withNoMasterKeyInTheEnvironment below, and the first test of that block, which sets
 * a key on purpose and proves the seal against it.
 *
 * RUNNER. node:test, which is what most of this repository uses. See README.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  EnvError,
  MAX_MASTER_KEY_VERSION,
  assertFullIcu,
  assertNoAmbientVendorCredentials,
  assertUtcProcessClock,
  deriveAppBaseUrl,
  describeEnv,
  formatProblems,
  installMasterKey,
  lateSettings,
  parseEnv,
  resetEnvCacheForTests,
} from "../../src/server/env.ts";

const key = randomBytes(32).toString("base64");

/** Any file that certainly exists, so the ge presence check is not what a test is measuring. */
const GE_STAND_IN = resolve(process.cwd(), "package.json");

/**
 * A complete environment, of the kind somebody who set everything by hand would have.
 *
 * IT IS NO LONGER THE STARTING POINT FOR THE TESTS THAT MATTER. It exists so a test that
 * varies one value has a clean background to vary it against. The important tests start
 * from an empty object, because that is what a founder actually has.
 */
const full = (): Record<string, string> => ({
  NODE_ENV: "production",
  APP_ENV: "preview",
  TZ: "UTC",
  APP_BASE_URL: "https://preview.example.test",
  DATABASE_URL: "postgres://user:pw@db.example.test:5432/launchhouse",
  DATABASE_ENV_TAG: "preview",
  GE_MASTER_KEY: key,
  ANTHROPIC_API_KEY: "test-key-not-real",
  OWNER_PASSPHRASE: "a sentence i will remember",
  MODEL_PRIMARY: "a-model-id",
  MODEL_UTILITY: "another-model-id",
  TURN_SPEND_CAP_USD: "2.50",
  FOUNDER_SPEND_CAP_USD: "40",
  COHORT_DAILY_CAP_USD: "400",
  GE_BIN: GE_STAND_IN,
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

const accepts = (raw: Record<string, string>): void => {
  const named = refused(raw);
  assert.deepEqual(named, [], `expected this to be accepted, and it refused: ${named.join(", ")}`);
};

// =========================================================================================
// The property the whole file now turns on
// =========================================================================================

describe("an empty environment starts the app", () => {
  test("parseEnv accepts {} and refuses nothing at all", () => {
    // THIS IS THE TEST. A founder in a room, with a remix that copied every secret name and
    // no value, has to reach a screen. Anything that makes this throw takes the screen away.
    accepts({});
  });

  test("every variable that used to be required is now absent and fine", () => {
    // Named one at a time rather than asserted in bulk, so that re-requiring any single one
    // of them fails here with that variable's own name in the message.
    for (const name of [
      "NODE_ENV",
      "APP_ENV",
      "APP_BASE_URL",
      "DATABASE_URL",
      "GE_MASTER_KEY",
      "ANTHROPIC_API_KEY",
      "MODEL_PRIMARY",
      "MODEL_UTILITY",
      "TURN_SPEND_CAP_USD",
      "FOUNDER_SPEND_CAP_USD",
      "COHORT_DAILY_CAP_USD",
      "TZ",
      "OWNER_PASSPHRASE",
    ]) {
      const raw = full();
      delete raw[name];
      const named = refused(raw);
      assert.ok(!named.includes(name), `${name} is still required, and nothing may be required any more`);
    }
  });

  test("a whole environment of empty strings is read as absent, which is what a remix produces", () => {
    // Replit's own words: "Secret names, not values. Your Remix lists them so you know what
    // to fill in, with empty values." So this shape is every founder's first boot.
    const blanked: Record<string, string> = {};
    for (const name of Object.keys(full())) blanked[name] = "";
    accepts(blanked);
    assert.equal(parseEnv(blanked).ANTHROPIC_API_KEY, undefined);
  });

  test("the defaults a founder who set nothing actually gets", () => {
    const env = parseEnv({});
    assert.equal(env.APP_ENV, "prod");
    assert.equal(env.NODE_ENV, "production");
    assert.equal(env.PORT, 5000);
    assert.equal(env.TZ, "UTC");
    assert.equal(env.MODEL_PRIMARY, "claude-opus-5");
    assert.equal(env.MODEL_UTILITY, "claude-haiku-4-5");
    assert.equal(env.TURN_SPEND_CAP_USD, 2.5);
    assert.equal(env.COHORT_DAILY_CAP_USD, 25);
    assert.equal(env.FOUNDER_SPEND_CAP_USD, 100);
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.ANTHROPIC_API_KEY, undefined);
    assert.equal(env.OWNER_PASSPHRASE, "");
    assert.equal(env.MAX_CONCURRENT_RUNS, 24);
    assert.equal(env.MAX_LIVE_SESSIONS, 60);
    assert.equal(env.SESSION_IDLE_MS, 600_000);
    assert.equal(env.SSE_HEARTBEAT_MS, 15_000);
    assert.equal(env.SESSION_TTL_DAYS, 90);
    assert.equal(env.GE_SHELL, "/bin/sh");
    assert.equal(env.WORKSPACE_ROOT, "/tmp/ge");
  });

  test("the default turn cap sits under the default founder cap, so the defaults cannot refuse each other", () => {
    // The one pair of defaults that could contradict. Checked because a later edit to either
    // number would otherwise stop an empty environment booting, which is the property above.
    const env = parseEnv({});
    assert.ok(env.TURN_SPEND_CAP_USD < env.FOUNDER_SPEND_CAP_USD);
  });

  test("says out loud what is missing rather than passing over it in silence", () => {
    // GE_BIN is not in this list on purpose: the submodule IS checked out in this
    // repository, so an empty environment finds it. Its absence is warned about by the
    // test further down that points GE_BIN at nothing.
    const w = parseEnv({}).warnings.join(" ");
    for (const fragment of ["DATABASE_URL", "ANTHROPIC_API_KEY", "OWNER_PASSPHRASE", "Spend caps", "Model ids"]) {
      assert.match(w, new RegExp(fragment), `a founder who set nothing should be told about ${fragment}`);
    }
  });
});

// =========================================================================================
// Absent is fine. Present and wrong is not.
// =========================================================================================

describe("a value that is set and unusable still stops the process", () => {
  test("refuses a TZ that is not UTC, because it states an intention this app cannot honour", () => {
    refuses({ ...full(), TZ: "America/New_York" }, "TZ");
  });

  test("accepts no TZ at all, because the process clock is asserted separately", () => {
    const raw = full();
    delete raw["TZ"];
    accepts(raw);
  });

  test("refuses a master key that is not 32 bytes once decoded", () => {
    // 32 characters is not 32 bytes, and that is exactly the mistake this catches.
    refuses({ ...full(), GE_MASTER_KEY: "0123456789abcdef0123456789abcdef" }, "GE_MASTER_KEY");
    refuses({ ...full(), GE_MASTER_KEY: randomBytes(16).toString("base64") }, "GE_MASTER_KEY");
  });

  test("refuses a database tag that disagrees with APP_ENV", () => {
    refuses({ ...full(), DATABASE_ENV_TAG: "prod" }, "DATABASE_ENV_TAG");
  });

  test("refuses a live session pool smaller than the concurrent run limit", () => {
    // Otherwise a founder mid turn is evicted, which reads as the app forgetting them.
    refuses({ ...full(), MAX_CONCURRENT_RUNS: "24", MAX_LIVE_SESSIONS: "10" }, "MAX_LIVE_SESSIONS");
  });

  test("refuses a turn cap larger than the whole allowance, defaults included", () => {
    refuses({ ...full(), TURN_SPEND_CAP_USD: "80", FOUNDER_SPEND_CAP_USD: "40" }, "TURN_SPEND_CAP_USD");
    // And with only the turn cap set, so the comparison is against the DEFAULT founder cap
    // rather than against another value set in the same test.
    refuses({ TURN_SPEND_CAP_USD: "500" }, "TURN_SPEND_CAP_USD");
  });

  test("refuses a spend cap that is not a number", () => {
    refuses({ ...full(), TURN_SPEND_CAP_USD: "two dollars fifty" }, "TURN_SPEND_CAP_USD");
  });

  test("refuses a base URL with a trailing slash, because paths are appended to it", () => {
    refuses({ ...full(), APP_BASE_URL: "https://preview.example.test/" }, "APP_BASE_URL");
  });

  test("refuses a late variable that cannot be read, so a founder does not meet it mid turn", () => {
    refuses({ ...full(), GE_TIMEOUT_MS: "20s" }, "GE_TIMEOUT_MS");
  });

  test("treats a variable set to whitespace as missing rather than as present and empty", () => {
    accepts({ ...full(), ANTHROPIC_API_KEY: "   " });
    assert.equal(parseEnv({ ...full(), ANTHROPIC_API_KEY: "   " }).ANTHROPIC_API_KEY, undefined);
  });

  test("names every problem at once, not one per restart", () => {
    const named = refused({ ...full(), TZ: "Europe/London", TURN_SPEND_CAP_USD: "free", MAX_LIVE_SESSIONS: "1" });
    for (const v of ["TZ", "TURN_SPEND_CAP_USD", "MAX_LIVE_SESSIONS"]) {
      assert.ok(named.includes(v), `${v} should have been named`);
    }
  });
});

describe("what used to be fatal and is now a warning", () => {
  test("a missing ge warns and starts, because a remix may not have copied the submodule", () => {
    // This is the one the whole workstream exists for. A founder whose copy arrived without
    // vendor/growth-engine must reach a screen, not a container that will not start.
    const raw = { ...full(), GE_BIN: "/nowhere/growth-engine/bin/ge" };
    accepts(raw);
    assert.match(parseEnv(raw).warnings.join(" "), /GE_BIN/);
  });

  test("a missing database warns and starts", () => {
    const raw = full();
    delete raw["DATABASE_URL"];
    accepts(raw);
    assert.match(parseEnv(raw).warnings.join(" "), /DATABASE_URL is not set/);
  });

  test("a http base URL in prod warns and starts, and says nobody can sign in", () => {
    const raw = { ...full(), APP_ENV: "prod", DATABASE_ENV_TAG: "prod", APP_BASE_URL: "http://app.example.test" };
    accepts(raw);
    assert.match(parseEnv(raw).warnings.join(" "), /Secure over https only/);
  });
});

// =========================================================================================
// The base URL, derived rather than asked for
// =========================================================================================

describe("APP_BASE_URL is worked out rather than typed in", () => {
  test("an explicit value wins over anything Replit says", () => {
    const got = deriveAppBaseUrl({ APP_BASE_URL: "https://mine.example", REPLIT_DOMAINS: "theirs.replit.app" }, 5000);
    assert.deepEqual(got, { url: "https://mine.example", from: "APP_BASE_URL" });
  });

  test("reads REPLIT_DOMAINS whether it holds one host or several", () => {
    assert.equal(deriveAppBaseUrl({ REPLIT_DOMAINS: "app.replit.app" }, 5000).url, "https://app.replit.app");
    // The separator is not documented anywhere we have read, so a list is handled without
    // the code depending on there being one. A single value takes the same path.
    assert.equal(deriveAppBaseUrl({ REPLIT_DOMAINS: "first.replit.app,second.example" }, 5000).url, "https://first.replit.app");
    assert.equal(deriveAppBaseUrl({ REPLIT_DOMAINS: " first.replit.app , second.example " }, 5000).url, "https://first.replit.app");
  });

  test("survives a scheme or a path being in there, because neither is ruled out", () => {
    assert.equal(deriveAppBaseUrl({ REPLIT_DOMAINS: "https://app.replit.app" }, 5000).url, "https://app.replit.app");
    assert.equal(deriveAppBaseUrl({ REPLIT_DOMAINS: "https://app.replit.app/some/path" }, 5000).url, "https://app.replit.app");
  });

  test("falls back to the workspace domain, then to localhost, and never throws", () => {
    assert.deepEqual(deriveAppBaseUrl({ REPLIT_DEV_DOMAIN: "dev.replit.dev" }, 5000), {
      url: "https://dev.replit.dev",
      from: "REPLIT_DEV_DOMAIN",
    });
    assert.deepEqual(deriveAppBaseUrl({}, 5000), { url: "http://localhost:5000", from: "localhost" });
    assert.equal(deriveAppBaseUrl({}, 3000).url, "http://localhost:3000");
  });

  test("ignores a value it cannot make a host out of rather than building a broken URL", () => {
    // Fail closed. Whatever REPLIT_DOMAINS really contains, a wrong link is better than a
    // crash, and a half parsed host is worse than both.
    for (const junk of ["", "   ", ",,,", "/", "https://"]) {
      assert.equal(
        deriveAppBaseUrl({ REPLIT_DOMAINS: junk }, 5000).from,
        "localhost",
        `should have ignored: ${JSON.stringify(junk)}`,
      );
    }
  });

  test("parseEnv uses it, so a deployment gets a real base URL with nothing set", () => {
    const env = parseEnv({ REPLIT_DOMAINS: "founder-app.replit.app" });
    assert.equal(env.APP_BASE_URL, "https://founder-app.replit.app");
  });
});

// =========================================================================================
// The checks that are about a wrong thing being present
// =========================================================================================

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

  test("is wired into parseEnv, not only available beside it, and an empty environment is no way round it", () => {
    refuses({ ...full(), APOLLO_API_KEY: "x" }, "APOLLO_API_KEY");
    refuses({ APOLLO_API_KEY: "x" }, "APOLLO_API_KEY");
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

// =========================================================================================
// Secrets, and the seam the master key arrives through
// =========================================================================================

describe("secrets do not leak through a log line", () => {
  test("keeps the API key and the passphrase out of JSON.stringify", () => {
    const serialised = JSON.stringify(parseEnv(full()));
    assert.ok(!serialised.includes("test-key-not-real"), "the API key reached a serialised env");
    assert.ok(!serialised.includes("a sentence i will remember"), "the passphrase reached a serialised env");
    assert.match(serialised, /\[set, not shown\]/);
  });

  test("describeEnv names every secret without showing one, set or not", () => {
    const described = describeEnv(parseEnv(full()));
    assert.equal(described["ANTHROPIC_API_KEY"], "[set, not shown]");
    assert.equal(described["DATABASE_URL"], "[set, not shown]");
    assert.equal(described["OWNER_PASSPHRASE"], "[set, not shown]");
    assert.equal(described["APP_ENV"], "preview");

    // Absent is a real answer and it has to be said, or a support thread cannot tell an
    // unset key from a line somebody forgot to print.
    const empty = describeEnv(parseEnv({}));
    assert.equal(empty["ANTHROPIC_API_KEY"], "[not set]");
    assert.equal(empty["DATABASE_URL"], "[not set]");
    assert.equal(empty["OWNER_PASSPHRASE"], "[not set]");
  });
});

// =========================================================================================
// The keyring seam, sealed against the environment it runs in
// =========================================================================================

/**
 * Every variable parseLateSettings builds the keyring out of.
 *
 * Derived from MAX_MASTER_KEY_VERSION rather than typed out, so widening the rotation
 * range cannot leave a name behind that this file then fails to clear.
 */
const KEYRING_NAMES: readonly string[] = [
  "GE_MASTER_KEY",
  ...Array.from({ length: MAX_MASTER_KEY_VERSION - 1 }, (_, i) => `GE_MASTER_KEY_V${String(i + 2)}`),
  "GE_MASTER_KEY_VERSION",
];

/**
 * Run body with no master key anywhere in the process environment, then put the
 * environment back exactly as it was.
 *
 * WHY IT EXISTS. resetEnvCacheForTests clears the cached late settings, and the next
 * lateSettings() call rebuilds the keyring from process.env. So GE_MASTER_KEY in the
 * environment is a key that is already installed at version 1, and installMasterKey
 * refuses to put a different one over it. That refusal is correct, and it is the reason
 * these tests could not install anything. The environment is the test's to control, so
 * this takes control of it rather than hoping.
 *
 * Absent variables are restored as absent, not as empty strings. env.ts reads an empty
 * string as absent anyway, and a test helper that quietly changes the shape of what it
 * borrowed is the next thing somebody debugs.
 */
function withNoMasterKeyInTheEnvironment<T>(body: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const name of KEYRING_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  resetEnvCacheForTests();
  try {
    return body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    resetEnvCacheForTests();
  }
}

describe("installMasterKey, the seam the resolved key arrives through", () => {
  test("THE SEAL ITSELF, PROVED AGAINST A KEY DELIBERATELY LEFT IN THE ENVIRONMENT", () => {
    // Everything below depends on the keyring starting empty. On a machine with no
    // GE_MASTER_KEY that is true by accident, and a test that is right by accident says
    // nothing. So the accident is removed: a key is put in the environment on purpose,
    // the unsealed reading is shown to pick it up, and the sealed reading is shown not
    // to. This is the whole difference between the file passing and the file being
    // hermetic.
    const ambient = randomBytes(32).toString("base64");
    const saved = process.env["GE_MASTER_KEY"];
    process.env["GE_MASTER_KEY"] = ambient;
    try {
      // Unsealed. This is the failure, watched rather than assumed: the environment
      // reaches the keyring, so version 1 is already taken before any test runs.
      resetEnvCacheForTests();
      assert.equal(lateSettings().masterKeys.get(1), ambient);
      assert.throws(() => {
        installMasterKey(randomBytes(32).toString("base64"), 1);
      }, /already installed/);

      // Sealed. Same process, same variable still set, and now the keyring is empty and
      // a key installs.
      withNoMasterKeyInTheEnvironment(() => {
        assert.equal(lateSettings().masterKeys.size, 0, "the seal let a key through");
        const fresh = randomBytes(32).toString("base64");
        installMasterKey(fresh, 1);
        assert.equal(lateSettings().masterKeys.get(1), fresh);
      });

      // And the borrowed variable is exactly as it was, so nothing after this can tell.
      assert.equal(process.env["GE_MASTER_KEY"], ambient);
    } finally {
      if (saved === undefined) delete process.env["GE_MASTER_KEY"];
      else process.env["GE_MASTER_KEY"] = saved;
      resetEnvCacheForTests();
    }
  });

  test("puts a key where storage/crypto.ts looks for it", () => {
    withNoMasterKeyInTheEnvironment(() => {
      const fresh = randomBytes(32).toString("base64");
      installMasterKey(fresh, 1);
      assert.equal(lateSettings().masterKeys.get(1), fresh);
    });
  });

  test("installing the same key twice is a no op, so a restart is harmless", () => {
    withNoMasterKeyInTheEnvironment(() => {
      const fresh = randomBytes(32).toString("base64");
      installMasterKey(fresh, 1);
      installMasterKey(fresh, 1);
      assert.equal(lateSettings().masterKeys.get(1), fresh);
    });
  });

  test("REFUSES a different key over a live one, because that orphans every file already written", () => {
    withNoMasterKeyInTheEnvironment(() => {
      installMasterKey(randomBytes(32).toString("base64"), 1);
      assert.throws(() => {
        installMasterKey(randomBytes(32).toString("base64"), 1);
      }, /already installed/);
    });
  });

  test("refuses a version outside the rotation range rather than storing it", () => {
    withNoMasterKeyInTheEnvironment(() => {
      for (const bad of [0, MAX_MASTER_KEY_VERSION + 1, 1.5]) {
        assert.throws(() => {
          installMasterKey(randomBytes(32).toString("base64"), bad);
        }, /version/);
      }
    });
  });

  test("the keyring never prints a key, even when one is installed", () => {
    withNoMasterKeyInTheEnvironment(() => {
      const fresh = randomBytes(32).toString("base64");
      installMasterKey(fresh, 1);
      const printed = JSON.stringify(lateSettings());
      assert.ok(!printed.includes(fresh), "the master key reached a serialised late settings object");
      assert.match(printed, /version\(s\) held, values not shown/);
    });
  });
});

describe("the boot report", () => {
  test("names the variable, the problem and what it is for", () => {
    const text = formatProblems([
      { variable: "TURN_SPEND_CAP_USD", problem: "is not a number", whatItIsFor: "Hard ceiling for one turn." },
    ]);
    for (const fragment of ["TURN_SPEND_CAP_USD", "is not a number", "What it is for", ".env.example"]) {
      assert.ok(text.includes(fragment), `the boot report should say: ${fragment}`);
    }
  });

  test("says that nothing in it is a missing variable, because missing no longer stops anything", () => {
    const text = formatProblems([{ variable: "TZ", problem: "is wrong", whatItIsFor: "The clock." }]);
    assert.match(text, /Missing is fine/);
  });
});
