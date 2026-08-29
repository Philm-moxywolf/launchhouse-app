/**
 * eslint.config.js
 *
 * WHAT THIS IS. The lint rules. Most of it is ordinary TypeScript linting. Four rules are
 * not ordinary, and those four are the reason this file has a header comment.
 *
 * WHY IT EXISTS. The build document puts four safety properties in code rather than in
 * prose, because a rule that lives in a document is a rule somebody breaks in a hurry on
 * the Thursday of the fix window:
 *
 *   1. `shell: true` never appears anywhere. ge is spawned with an argv array, so anything
 *      a founder types arrives as one argument and cannot be read as shell. That is the
 *      injection boundary and it is one property on one call.
 *   2. process.env is read in exactly one place, src/server/env.ts. Anywhere else and a
 *      missing variable is found at 3am instead of at boot.
 *   3. fetch against a vendor happens in exactly one function. Every founder credential
 *      flows through it, and the read back, the ledger write, the audit row and the rate
 *      limit all live there. A second call site is a second place with none of that.
 *   4. Inside the GoHighLevel modules, nothing formats a date except the one conversion
 *      function. The founder means 09:30 where they are. If any other file reaches for
 *      toISOString, a post lands at the wrong hour for 130 people.
 *
 * WHAT CALLS IT. `npm run lint`, and the editor.
 *
 * These rules point at files that do not all exist yet. That is deliberate: the rule lands
 * before the code it governs, so the first version of that code is written under it.
 *
 * WHY TEST FILES ARE EXEMPT FROM RULE 2, AND ONLY FROM RULE 2. A test that sets
 * WORKSPACE_ROOT to a temporary directory in beforeEach and puts the old value back in
 * afterEach is not bypassing the boot check. It IS the boot check's test: it is the only
 * way to prove that a founder folder really moves when an operator moves it, and that a
 * bad value is refused. The alternative considered was a helper that tests call instead,
 * and it was rejected: a helper is a second door into process.env, the rule cannot see
 * through it, and the day somebody imports the helper from a route there is nothing left
 * to catch it. An exemption is visible in this file; a helper is invisible in fifty.
 *
 * The exemption is exactly one rule wide. shell: true stays banned in test files, because
 * a test is where a spawn gets copied from. Rules 3 and 4 come off in tests for the same
 * reason as rule 2: a test double for a vendor call has to be able to build a date and
 * stand in for a fetch.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Rule 1, written once and referenced everywhere it applies. It applies everywhere,
 * including tests and scripts, so it is a constant rather than three copies that can be
 * edited apart from each other.
 */
const NO_SHELL_TRUE = {
  selector: "Property[key.name='shell'][value.value=true]",
  message:
    "shell: true is never set anywhere in this repository. Spawn with an argv array so a founder's text cannot be read as shell.",
};

/**
 * Test files, fixtures, the deployment probe and the build config. Everything here runs
 * on a laptop or in CI. None of it serves a founder.
 */
const NOT_THE_APP = [
  "scripts/**/*.ts",
  "tests/**/*.ts",
  "**/*.test.ts",
  "**/test-fixtures.ts",
  "*.config.ts",
];

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "vendor/**", "coverage/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Rule 1. The injection boundary.
      "no-restricted-syntax": ["error", NO_SHELL_TRUE],
    },
  },
  {
    // Rule 2. process.env is read once, at boot, and checked there.
    files: ["src/**/*.ts", "src/**/*.tsx", "app/**/*.ts"],
    ignores: ["src/server/env.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_SHELL_TRUE,
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Read the environment through src/server/env.ts. It validates at boot, names the variable when it fails, and keeps secrets out of logs. Values read after boot come from lateSettings().",
        },
      ],
    },
  },
  {
    /**
     * Nothing in the server prints with console. The server logs through pino, which
     * redacts and which the deployment can actually read; a console.log carries whatever
     * it was handed, and what it is usually handed during a bug hunt is a founder's own
     * text or a token. The four places that legitimately print, migrate.ts and two test
     * skips, say so with a disable comment and a reason, which is the point: the
     * exception is written down where it happens.
     */
    files: ["src/**/*.ts", "src/**/*.tsx", "app/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
  {
    // Rule 3. One vendor fetch, one place. The test that greps for this is the belt; this
    // is the braces, and it fails in the editor rather than in CI.
    files: ["src/server/**/*.ts"],
    ignores: ["src/server/integrations/http.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Vendor calls go through vendorFetch in src/server/integrations/http.ts, which is the only function in this repository that calls a vendor host." },
      ],
      "no-restricted-imports": [
        "error",
        { paths: [
          { name: "axios", message: "Vendor calls go through vendorFetch in src/server/integrations/http.ts." },
          { name: "got", message: "Vendor calls go through vendorFetch in src/server/integrations/http.ts." },
          { name: "undici", message: "Vendor calls go through vendorFetch in src/server/integrations/http.ts." },
          { name: "node:http", message: "Vendor calls go through vendorFetch in src/server/integrations/http.ts." },
          { name: "node:https", message: "Vendor calls go through vendorFetch in src/server/integrations/http.ts." },
        ] },
      ],
    },
  },
  {
    // Rule 4. The timezone rule, and it is the highest stakes one in the build.
    files: ["src/server/integrations/ghl/**/*.ts"],
    ignores: ["src/server/integrations/ghl/schedule-value.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='toISOString']",
          message:
            "Only schedule-value.ts formats a date for GoHighLevel. The founder means 09:30 where they are, and how the vendor reads that value has never been tested.",
        },
        {
          selector: "MemberExpression[property.name='getTime']",
          message: "Only schedule-value.ts formats a date for GoHighLevel.",
        },
        {
          selector: "MemberExpression[property.name='getTimezoneOffset']",
          message: "Never a fixed offset. Offsets change twice a year and a 90 day plan built on 27 September runs past 1 November.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='UTC']",
          message: "Only schedule-value.ts formats a date for GoHighLevel.",
        },
      ],
    },
  },
  {
    /**
     * Nothing here serves a founder, so rules 2, 3 and 4 come off. Rule 1 does not: it is
     * restated rather than switched off, because "off" here would let shell: true into a
     * test, and a test is where somebody copies a spawn from.
     *
     * This block is last on purpose. ESLint takes the last matching config, so a test file
     * under src/server/integrations/ghl/ lands here rather than under rule 4 and may build
     * a date to compare against.
     */
    files: NOT_THE_APP,
    rules: {
      "no-restricted-syntax": ["error", NO_SHELL_TRUE],
      "no-restricted-globals": "off",
      "no-restricted-imports": "off",
      /**
       * A test double that implements an interface with an object literal has to reach its
       * own fake from inside that literal, and `this` there is the literal. Aliasing is
       * the only way to write it. In the app the rule stays on, because there the same
       * line is usually a method that should have been an arrow function.
       */
      "@typescript-eslint/no-this-alias": "off",
    },
  },
);
