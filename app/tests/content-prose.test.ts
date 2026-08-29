/**
 * app/tests/content-prose.test.ts
 *
 * WHAT IT IS
 * The house style and product rules, applied to every string in
 * `app/content/` that a founder can end up reading.
 *
 * WHY IT EXISTS
 * `scripts/validate.sh` in the content repo checks files a human wrote, before
 * a commit. None of it reaches this repo, and these strings are the ones a
 * founder reads on the hardest screen in the programme. The rules that were
 * enforced there have to be enforced here or they are not enforced at all. The
 * banned word list and the dash rule below are the ones from
 * `scripts/validate.sh:244-271`, imported rather than reinvented.
 *
 * WHAT IT READS
 * The exported values of `routes.ts`, `scopes.ts`, `ghl-walk.ts` and
 * `gates.ts`. It walks the real objects rather than the source text, so a
 * comment explaining a rule is not mistaken for a breach of it.
 *
 * `gates.md` is deliberately not checked. It is a byte-for-byte port of a
 * maintainer's schema, it says so in its own words at line 148, and the test
 * that matters for it is the one asserting it is identical to the original.
 *
 * WHAT IT WRITES
 * Nothing.
 *
 * HOW TO RUN
 *   node --import tsx --test app/tests/content-prose.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as routes from "../content/routes.ts";
import * as scopes from "../content/scopes.ts";
import * as walk from "../content/ghl-walk.ts";
import * as gates from "../content/gates.ts";
import { ROUTES, SCREEN_DESTINATIONS, normalisePhrase, routeFor, routesForTrack, routeIsVisibleTo } from "../content/routes.ts";
import { GHL_SCOPES, FORBIDDEN_GHL_SCOPES, isExactScopeSet } from "../content/scopes.ts";
import { APP_ROOT } from "../content/skill-diff.ts";

/** Every string reachable from a module's exports, with the path that found it. */
function strings(value: unknown, path: string, out: { path: string; text: string }[] = []): { path: string; text: string }[] {
  if (typeof value === "string") {
    out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object" && !(value instanceof RegExp)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "function") continue;
      strings(v, `${path}.${k}`, out);
    }
  }
  return out;
}

const ALL: { path: string; text: string }[] = [
  ...strings(routes, "routes"),
  ...strings(scopes, "scopes"),
  ...strings(walk, "ghl-walk"),
  ...strings(gates, "gates"),
];

test("there is content to check, so a passing run means something", () => {
  // A walker that silently found nothing would pass every test below.
  assert.ok(ALL.length > 150, `only ${ALL.length} strings found, so the walker is not reaching the content`);
});

test("no em dash and no en dash anywhere", () => {
  const bad = ALL.filter((s) => /[—–]/.test(s.text));
  assert.deepEqual(bad, [], bad.map((s) => `${s.path}: ${s.text}`).join("\n"));
});

test("no banned marketing word", () => {
  // scripts/validate.sh:268-269, word for word.
  const banned = /(^|[^-a-z0-9])(supercharge[a-z]*|unlock[a-z]*|revolutionary|seamless[a-z]*|leverage[a-z]*|effortless[a-z]*|synergy|turnkey)([^-a-z0-9]|$)/i;
  const bannedPhrases = /(game[ -]changer|cutting[ -]edge|best[ -]in[ -]class)/i;
  const bad = ALL.filter((s) => banned.test(s.text) || bannedPhrases.test(s.text));
  assert.deepEqual(bad, [], bad.map((s) => `${s.path}: ${s.text}`).join("\n"));
});

test("nothing promises a reply", () => {
  // Rule 3. scripts/validate.sh:284, same shape.
  const promise = /(guarantee[ds]? (a )?(reply|replies|response)|promise[ds]? (a )?(reply|replies))/i;
  const bad = ALL.filter((s) => promise.test(s.text) && !/never|not |cannot|no one|nobody|none of/i.test(s.text));
  assert.deepEqual(bad, [], bad.map((s) => `${s.path}: ${s.text}`).join("\n"));
});

test("nothing offers to automate a DM", () => {
  // Rule 2. Every mention has to be a refusal, so a line that mentions DM
  // automation without refusing it fails here.
  const mentions = ALL.filter((s) => /automat[a-z]* (cold )?dm|dm automation/i.test(s.text));
  for (const m of mentions) {
    assert.ok(
      /not a bug|restricted|correct behaviour|never|do not|cannot/i.test(m.text),
      `${m.path} mentions DM automation without refusing it: ${m.text}`,
    );
  }
});

test("the seven scopes are written down in exactly one file", () => {
  // The claim REPLIT-BUILD.md section 6 makes: "The seven strings live in
  // exactly one file". It is only true if nothing else spells them out, so
  // this greps the content directory for the literals.
  const files = readdirSync(APP_ROOT + "/content", { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && e.name !== "scopes.ts")
    .map((e) => e.name);
  assert.ok(files.length > 0);

  for (const name of files) {
    const src = readFileSync(join(APP_ROOT, "content", name), "utf8");
    for (const scope of GHL_SCOPES) {
      // A scope may be named inside a comment explaining the rule, which is
      // where the failure copy example lives, so only code lines count.
      const offending = src
        .split("\n")
        .filter((line) => line.includes(scope) && !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"));
      assert.deepEqual(
        offending,
        [],
        `${name} writes the scope ${scope} out again. Import it from scopes.ts instead:\n  ${offending.join("\n  ")}`,
      );
    }
  }
});

test("the cut scopes appear nowhere as something we ask for", () => {
  // Rule 2's outermost layer. planning/spike-findings.md:26 still lists these
  // three. A token carrying any of them can send an Instagram DM.
  assert.equal(GHL_SCOPES.length, 7);
  for (const forbidden of FORBIDDEN_GHL_SCOPES) {
    assert.ok(
      !(GHL_SCOPES as readonly string[]).includes(forbidden),
      `${forbidden} was cut on 20 August 2026 and is being asked for again`,
    );
  }
  assert.ok(isExactScopeSet([...GHL_SCOPES]));
  assert.ok(!isExactScopeSet([...GHL_SCOPES, "conversations/message.write"]));
  assert.ok(!isExactScopeSet(GHL_SCOPES.slice(0, 6)));
  // Order matters: the founder ticks them down the screen in this order.
  assert.ok(!isExactScopeSet([...GHL_SCOPES].reverse()));
});

test("every scope has a reason a founder can read", () => {
  for (const scope of GHL_SCOPES) {
    const reason = scopes.GHL_SCOPE_REASONS[scope];
    assert.ok(reason && reason.length > 20, `${scope} has no reason a founder could read`);
    assert.ok(reason.endsWith("."), `${scope}'s reason is not a sentence`);
  }
  assert.equal(walk.GHL_WALK_SCOPE_ROWS.length, 7);
});

test("the token walk is six steps, each with its own URL and one action", () => {
  assert.equal(walk.GHL_WALK_STEPS.length, walk.GHL_WALK_TOTAL_STEPS);
  walk.GHL_WALK_STEPS.forEach((step, i) => {
    assert.equal(step.number, i + 1, `step ${i + 1} is numbered ${step.number}`);
    assert.ok(step.slug.length > 0 && /^[a-z-]+$/.test(step.slug), `step ${step.number} has no usable slug`);
    assert.ok(step.doubt.length > 0, `step ${step.number} does not name the doubt first`);
    assert.ok(step.body.length > 0);
    assert.ok(step.buttons.length >= 1, `step ${step.number} ends on no action`);
  });
  const slugs = walk.GHL_WALK_STEPS.map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length, "two steps share a URL");
  assert.equal(walk.progressLabel(3), "Step 3 of 6");
});

test("no failure a founder reads is a bare status code", () => {
  for (const failure of walk.GHL_WALK_FAILURES) {
    assert.ok(
      !/\b(4\d{2}|5\d{2}|5xx)\b/.test(failure.founderReads),
      `a founder is shown a status code: ${failure.founderReads}`,
    );
    assert.ok(failure.action.length > 0, `${failure.seen} has no next click`);
    assert.ok(failure.founderReads.length > 40, `${failure.seen} does not explain the cause`);
  }
  assert.equal(walk.GHL_WALK_FAILURES.length, 6);
});

test("the scope refusal copy names a scope we actually ask for", () => {
  for (const scope of GHL_SCOPES) {
    const copy = walk.scopeRefusalCopy(scope);
    assert.ok(copy.includes(scope));
    assert.ok(/make a new one/i.test(copy), "the copy has to say a scope cannot be added to an existing token");
  }
});

test("what is unverified is still marked unverified", () => {
  // Three named gaps. If any of these flips to false without a spike result
  // landing, the app has started claiming something it cannot prove.
  assert.equal(walk.GHL_WALK_TOKEN_SHAPE_WARNING_IS_A_GUESS, true);
  assert.equal(walk.GHL_CONTACTS_READ_PENDING.pending, true);
  assert.equal(gates.EMPTINESS_FLOOR_PENDING, true);
});

test("a skip and a fail are different things and say different words", () => {
  assert.equal(walk.GHL_WALK_NOT_BOUGHT.state, "skipped");
  assert.equal(walk.GHL_WALK_NO_PRIVATE_INTEGRATIONS.state, "failed");
  // The evidence string is what a mentor reads in the "needs attention"
  // column, so it has to be the reason and not a category.
  assert.match(walk.GHL_WALK_NOT_BOUGHT.evidence, /23 September/);
  assert.match(walk.GHL_WALK_NO_PRIVATE_INTEGRATIONS.evidence, /Private Integrations/);

  // No guilt on the skip screen. A founder who has done everything currently
  // possible must not be told they are late, so the screen may say "not
  // behind" and may not say "behind" on its own.
  const skipCopy = `${walk.GHL_WALK_NOT_BOUGHT.title} ${walk.GHL_WALK_NOT_BOUGHT.body.join(" ")}`;
  assert.ok(
    !/(you are|you're|youre)\s+(behind|late|overdue)/i.test(skipCopy),
    `the skip screen tells the founder they are behind: ${skipCopy}`,
  );
  assert.match(skipCopy, /not behind/i, "the skip screen should say so in as many words");
});

test("no evidence string could carry a token", () => {
  // receipt.sh:110 refuses any value matching pit- after lowercasing, because a
  // secret written into a file is then in a backup and in the next support
  // screenshot. The same guard applies to the strings we write ourselves.
  for (const s of ALL) {
    if (s.path.includes("PREFIX_GUESS") || s.path.includes("SHAPE_WARNING")) continue;
    assert.ok(!/pit-[a-z0-9]{6,}/i.test(s.text), `${s.path} looks like it carries a token`);
  }
});

test("each route row is complete and a hidden row says why", () => {
  const ids = ROUTES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "two routes share an id");
  assert.equal(ROUTES.length, 9);

  for (const row of ROUTES) {
    assert.ok(row.label.length > 0 && row.subtitle.length > 0, `${row.id} has no label or subtitle`);
    assert.ok(row.tracks.length > 0, `${row.id} is on no track`);
    assert.ok(row.phrases.length > 0, `${row.id} cannot be reached in plain language`);
    if (row.hidden) {
      assert.ok(row.hiddenBecause, `${row.id} is hidden with no reason recorded`);
    }
  }

  // 00-scope.md:54. Ported so it is ready, not offered.
  const playbook = ROUTES.find((r) => r.id === "playbook-export");
  assert.ok(playbook?.hidden);
});

test("no route row names the other track to the founder who sees it", () => {
  // The split of commands/engine2.md:2, which named both tracks in one string.
  for (const row of ROUTES) {
    if (row.tracks.length !== 1) continue;
    const other = row.tracks[0] === "b2b" ? /b2c|consumer/i : /b2b|business to business/i;
    const shown = `${row.label} ${row.subtitle}`;
    assert.ok(!other.test(shown), `${row.id} shows the other track's name: ${shown}`);
  }
});

test("no plain language phrase is ambiguous for a founder on one track", () => {
  for (const track of ["b2b", "b2c"] as const) {
    const seen = new Map<string, string>();
    for (const row of routesForTrack(track)) {
      for (const phrase of row.phrases) {
        const key = normalisePhrase(phrase);
        const already = seen.get(key);
        assert.equal(already, undefined, `"${phrase}" reaches both ${already} and ${row.id} on ${track}`);
        seen.set(key, row.id);
      }
    }
    for (const screen of SCREEN_DESTINATIONS) {
      for (const phrase of screen.phrases) {
        const already = seen.get(normalisePhrase(phrase));
        assert.equal(already, undefined, `"${phrase}" reaches both ${already} and the ${screen.id} screen on ${track}`);
      }
    }
  }
});

test("a phrase never starts the other track's engine", () => {
  // The failure this prevents: a B2C founder types "cold email", the router
  // matches the B2B outreach row, and rule 1 is broken by a string match.
  assert.equal(routes.matchPhrase("cold email", "b2b")?.id, "outreach-engine");
  assert.equal(routes.matchPhrase("cold email", "b2c"), undefined);
  assert.equal(routes.matchPhrase("my hooks", "b2c")?.id, "audience-engine");
  assert.equal(routes.matchPhrase("my hooks", "b2b"), undefined);

  // Punctuation and case are not a fork in the road.
  assert.equal(routes.matchPhrase("What's left?", "b2b")?.id, "status");
  assert.equal(routes.matchPhrase("  BUILD MY FOUNDER BRAIN  ", "b2c")?.id, "founder-brain");
  assert.equal(routes.matchPhrase("", "b2b"), undefined);

  // A hidden row is not reachable by typing at it either.
  assert.equal(routes.matchPhrase("print my playbook", "b2b"), undefined);
});

test("visibility is checked server side, not left to the sidebar", () => {
  assert.equal(routeIsVisibleTo("outreach-engine", "b2b"), true);
  assert.equal(routeIsVisibleTo("outreach-engine", "b2c"), false);
  assert.equal(routeIsVisibleTo("audience-engine", "b2b"), false);
  assert.equal(routeIsVisibleTo("playbook-export", "b2b"), false);
  assert.equal(routeIsVisibleTo("no-such-route", "b2b"), false);

  assert.equal(routesForTrack("b2b").filter((r) => r.id === "audience-engine").length, 0);
  assert.equal(routesForTrack("b2c").filter((r) => r.id === "outreach-engine").length, 0);
});

test("Track and Model become a route name here and nowhere else", () => {
  // F3 in REPLIT-BUILD.md section 9.
  assert.equal(routeFor("b2b", null), "b2b");
  assert.equal(routeFor("b2b", "service"), "b2b", "Model is never asked of a B2B founder, so it cannot change their route");
  assert.equal(routeFor("b2c", "service"), "b2c-service");
  assert.equal(routeFor("b2c", "ecommerce"), "b2c-ecom");
  // A Brain written before the Model question existed. Guessing would pick one
  // of two different snapshots with different dependencies.
  assert.equal(routeFor("b2c", null), null);
  assert.equal(routeFor("b2c", undefined), null);

  assert.deepEqual(Object.keys(routes.SNAPSHOT_FOR_ROUTE).sort(), ["b2b", "b2c-ecom", "b2c-service"]);
});

test("every skill a route names exists on disk", () => {
  const dirs = new Set(
    readdirSync(join(APP_ROOT, "content", "skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );
  for (const row of ROUTES) {
    assert.ok(dirs.has(row.skill), `route ${row.id} points at skill ${row.skill}, which does not exist`);
  }
  // And every skill is reachable, so nothing is ported and then orphaned.
  const used = new Set(ROUTES.map((r) => r.skill));
  assert.deepEqual([...dirs].filter((d) => !used.has(d)), []);
});
