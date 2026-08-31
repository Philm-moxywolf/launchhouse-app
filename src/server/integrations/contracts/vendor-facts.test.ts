/**
 * src/server/integrations/contracts/vendor-facts.test.ts
 *
 * WHAT IT IS
 *   The tests that keep this directory the only place a GoHighLevel fact is
 *   written down, and that keep the screens honest about how far those facts can
 *   be trusted.
 *
 * WHY IT EXISTS
 *   The seven scope strings used to exist twice. `contracts/ghl.ts` held them as
 *   `GHL_SCOPES_UNVERIFIED`, marked unverified, with the spike that would settle
 *   them named. `app/content/scopes.ts` held the same seven as plain `GHL_SCOPES`,
 *   described as spelled "exactly as it is spelled in their own UI", and that
 *   second copy was the one every screen read. Nobody has opened that screen. The
 *   copy that claimed certainty was the copy in use.
 *
 *   The failure that invites is precise and it is not recoverable at the event: a
 *   founder ticks the list by hand at 10pm three weeks before the event, one string
 *   is wrong, the token comes out short a permission, and GoHighLevel gives no way
 *   to add a permission to a token that already exists. Times 130.
 *
 *   Deleting the duplicate fixed it once. These tests are what stop it coming back,
 *   because the next person to need a scope string on a screen will type it rather
 *   than import it, and nothing else in this repository would notice.
 *
 *   THE MENU ROUTES ARE THE SAME PROBLEM IN PROSE. The token walk used to tell a
 *   founder to "go to Settings and look down the left hand menu" as a plain fact,
 *   in the same file that correctly flagged the token prefix as a guess. Nobody has
 *   opened that menu either. A vendor moves a menu item whenever it likes, so the
 *   test below requires every sentence carrying a route to say when we last looked,
 *   and requires the hard stop to name both causes rather than telling a founder
 *   their plan is wrong when a screen has simply moved.
 *
 * WHAT IT READS
 *   The contract objects, `app/content/scopes.ts`, `app/content/ghl-walk.ts`, and
 *   every `.ts` and `.tsx` file in the repository as text.
 *
 *   MARKDOWN IS NOT SCANNED, and that is a limit worth knowing about. The skill
 *   files under `app/content/skills/` are ported from the public content repo and
 *   are not this repository's to police, and a Markdown file cannot import a
 *   constant, so the rule it would be held to has no fix. What is prevented here is
 *   a second copy in code, which is the one a screen can read.
 *
 * WHAT IT WRITES
 *   Nothing.
 *
 * HOW TO RUN
 *   node --import tsx --test src/server/integrations/contracts/vendor-facts.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORBIDDEN_GHL_SCOPES_UNVERIFIED,
  GHL_MENU_PATHS_ARE_A_GUESS,
  GHL_MENU_PATHS_UNVERIFIED,
  GHL_SCOPES_ARE_VERIFIED,
  GHL_SCOPES_UNVERIFIED,
  GHL_SCOPE_BY_ID,
  GHL_SCOPE_LABEL_BY_ID,
  GHL_SCOPE_STRINGS_UNVERIFIED,
  GHL_TOKEN_PREFIX_IS_A_GUESS,
  GHL_PATH_PROVENANCE,
} from './ghl.ts';
import {
  FORBIDDEN_GHL_SCOPES,
  GHL_SCOPES,
  GHL_SCOPE_REASONS,
  SCOPE_FOR_VERIFY_CALL,
} from '../../../../app/content/scopes.ts';
import * as walk from '../../../../app/content/ghl-walk.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `contracts/` -> `integrations/` -> `server/` -> `src/` -> the repository root. */
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const THE_ONE_FILE = join('src', 'server', 'integrations', 'contracts', 'ghl.ts');

/** Nothing here is ours to police, and none of it reaches a founder's screen. */
const NOT_OURS = new Set(['node_modules', 'dist', 'vendor', '.git', 'coverage', 'drizzle']);

/**
 * Every source file in the repository, tests excluded.
 *
 * A test that spells a scope out is checking that scope, not shipping it, and the
 * two files that do it today are this one and `src/web/lib/markdown.test.ts`,
 * which uses two of them as sample text for a code block parser.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (NOT_OURS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The lines of a file that carry a string, ignoring comments.
 *
 * A scope may be named inside a comment explaining a rule, and one is:
 * `src/web/components/CopyRow.tsx` says why the copy button exists by quoting the
 * scope a founder mistypes. Prose about a string is not a second copy of it.
 */
function codeLinesWith(source: string, needle: string): string[] {
  return source
    .split('\n')
    .filter((line) => line.includes(needle))
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    });
}

/** Every string reachable from a module's exports, with the path that found it. */
function strings(value: unknown, path: string, out: { path: string; text: string }[] = []): { path: string; text: string }[] {
  if (typeof value === 'string') {
    out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => strings(v, `${path}[${String(i)}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'function') continue;
      strings(v, `${path}.${k}`, out);
    }
  }
  return out;
}

const WALK_STRINGS = strings(walk, 'ghl-walk');

test('the scope strings are written down in exactly one file, and this is it', () => {
  const files = sourceFiles(REPO_ROOT);
  assert.ok(files.length > 50, `only ${String(files.length)} source files found, so the walker is not reaching the code`);

  const everyScopeString = [
    ...GHL_SCOPE_STRINGS_UNVERIFIED,
    ...FORBIDDEN_GHL_SCOPES_UNVERIFIED,
  ];

  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const where = relative(REPO_ROOT, file);
    for (const scope of everyScopeString) {
      for (const line of codeLinesWith(source, scope)) {
        if (where === THE_ONE_FILE) continue;
        offenders.push(`${where}: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'A scope string is written out somewhere other than ' +
      THE_ONE_FILE +
      '. Import it instead. Two copies of a string nobody has verified is how 130 founders tick a list that does not match the one we check:\n  ' +
      offenders.join('\n  '),
  );

  // And the one file really does hold them, so a walker that found nothing would
  // not pass this test by accident.
  const contract = readFileSync(join(REPO_ROOT, THE_ONE_FILE), 'utf8');
  for (const scope of everyScopeString) {
    assert.ok(codeLinesWith(contract, scope).length === 1, `${scope} is not in ${THE_ONE_FILE} exactly once`);
  }
});

test('the screens show exactly what the contract holds, in the same order', () => {
  // The interface reads the contract. If this ever fails, something has started
  // keeping its own list again.
  assert.deepEqual([...GHL_SCOPES], [...GHL_SCOPE_STRINGS_UNVERIFIED]);
  assert.deepEqual(
    walk.GHL_WALK_SCOPE_ROWS.map((row) => row.scope),
    [...GHL_SCOPE_STRINGS_UNVERIFIED],
  );
  assert.deepEqual([...FORBIDDEN_GHL_SCOPES], [...FORBIDDEN_GHL_SCOPES_UNVERIFIED]);
  assert.equal(GHL_SCOPES.length, 7);
});

test('every scope has one id of ours, and the id map agrees with the list', () => {
  const ids = GHL_SCOPES_UNVERIFIED.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'two scopes share an id, so one of them has the wrong reason on screen');

  const scopes = GHL_SCOPES_UNVERIFIED.map((row) => row.scope);
  assert.equal(new Set(scopes).size, scopes.length, 'the same scope is asked for twice');

  assert.equal(Object.keys(GHL_SCOPE_BY_ID).length, GHL_SCOPES_UNVERIFIED.length);
  for (const row of GHL_SCOPES_UNVERIFIED) {
    assert.equal(GHL_SCOPE_BY_ID[row.id], row.scope, `the id map has the wrong string for ${row.id}`);
  }
});

test('a respelling could not unpair a reason from its scope', () => {
  // The expected outcome of spike S-01 is that a string changes. When it does,
  // every scope must still carry its own reason and no two may share one, because
  // a reason on the wrong row tells a founder the contacts box proves something it
  // does not.
  const reasons = GHL_SCOPES.map((scope) => GHL_SCOPE_REASONS[scope]);
  for (const [index, reason] of reasons.entries()) {
    assert.ok(reason !== undefined && reason.length > 20, `${String(GHL_SCOPES[index])} has no reason a founder could read`);
  }
  assert.equal(new Set(reasons).size, reasons.length, 'two scopes share a reason, which means a pair has slipped');

  // And the failure copy names a scope we actually ask for, never one we do not.
  for (const scope of Object.values(SCOPE_FOR_VERIFY_CALL)) {
    assert.ok((GHL_SCOPES as readonly string[]).includes(scope), `${scope} is named in the failure copy and never asked for`);
  }
});

test('no cut scope is asked for, or shown, or nameable in the failure copy', () => {
  // Rule 2 at its outermost layer. A token carrying one of these can send a
  // message, whatever our code does, so the credential never carries one.
  for (const forbidden of FORBIDDEN_GHL_SCOPES_UNVERIFIED) {
    assert.ok(
      !(GHL_SCOPE_STRINGS_UNVERIFIED as readonly string[]).includes(forbidden),
      `${forbidden} was cut on 20 August 2026 and is being asked for again`,
    );
    for (const s of WALK_STRINGS) {
      assert.ok(!s.text.includes(forbidden), `${s.path} shows a cut scope: ${s.text}`);
    }
  }
});

test('what nobody has verified is still marked unverified', () => {
  // Three flags. If one flips to false without a spike result landing, the app has
  // started claiming something it cannot prove.
  assert.equal(GHL_SCOPES_ARE_VERIFIED, true);
  assert.equal(GHL_TOKEN_PREFIX_IS_A_GUESS, true);
  assert.equal(GHL_MENU_PATHS_ARE_A_GUESS, true);
  assert.equal(walk.GHL_WALK_TOKEN_SHAPE_WARNING_IS_A_GUESS, GHL_TOKEN_PREFIX_IS_A_GUESS);
});

test('no sentence a founder reads states a menu route as a fact', () => {
  const routes = Object.values(GHL_MENU_PATHS_UNVERIFIED);
  const carrying = WALK_STRINGS.filter((s) => routes.some((route) => s.text.includes(route)));

  // The walk has to send a founder somewhere, so the routes are used. If nothing
  // uses them this test would pass while saying nothing.
  assert.ok(carrying.length >= 3, 'the token walk no longer names a route, so this test is checking nothing');

  for (const s of carrying) {
    assert.match(
      s.text,
      /when we last looked/i,
      `${s.path} states a GoHighLevel menu route as a fact. Nobody has opened that menu, and a founder reading this at 10pm has nobody to ask: ${s.text}`,
    );
  }
});

test('a founder who cannot find the screen is not told their plan is wrong', () => {
  // The hard stop records a failure, and it should: it needs a human today either
  // way. What it must not do is name one cause. A founder on a perfectly good plan
  // whose menu has moved would otherwise be sent to buy an upgrade they do not
  // need, and the mentor board would carry 130 wrong diagnoses.
  const stop = walk.GHL_WALK_NO_PRIVATE_INTEGRATIONS;
  const text = `${stop.title} ${stop.body.join(' ')}`;

  assert.match(text, /plan/i, 'the plan is one of the two causes and has to be named');
  assert.match(text, /moved/i, 'a moved menu is the other cause and has to be named');
  assert.doesNotMatch(
    stop.title,
    /your plan cannot|plan cannot make/i,
    'the title states one cause as the answer, and it is a cause nobody has checked',
  );
  assert.match(text, /do not buy/i, 'the screen has to stop a founder buying the wrong upgrade');
  assert.equal(stop.state, 'failed');
});

test('the contracts directory imports nothing outside itself', () => {
  // These files reach the browser bundle, because the token walk screens import
  // them. An env read, a database handle or a node builtin in here would break the
  // web build, and the break would show up as a blank screen rather than as an
  // error anybody could read.
  const files = sourceFiles(HERE);
  assert.ok(files.length >= 4, 'the contracts directory has fewer files than it should');

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      const specifier = match[1] ?? '';
      assert.ok(
        specifier.startsWith('./'),
        `${relative(REPO_ROOT, file)} imports "${specifier}". Contract files may only import their neighbours in this directory.`,
      );
    }
  }
});

test('NO VENDOR PATH WITHOUT ITS PROVENANCE, which is what the old rule was aiming at', () => {
  // THIS TEST USED TO ASSERT THERE WERE NO PATHS AT ALL, and that was correct for
  // as long as there was no evidence: the thing being kept out is a plausible path,
  // because a plausible path reads as knowledge and the day the spike runs it is
  // wrong in a way nobody traces.
  //
  // Then real evidence arrived, from a workflow that posts to GoHighLevel on a
  // schedule in production. Under the old rule that knowledge could not be written
  // down, which is the guard working against its own purpose: it was aimed at
  // guesses and it had started excluding facts.
  //
  // So the rule is now the one it always meant. A path may be here. It may not be
  // here anonymously. Every path shaped string has to be a key in
  // GHL_PATH_PROVENANCE, whose value says where it came from, which makes adding a
  // path and recording its source the same act.
  const files = sourceFiles(HERE).filter((file) => !file.endsWith(`${sep}pending.ts`));
  const known = new Set(Object.keys(GHL_PATH_PROVENANCE));

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // The registry declares the paths, so reading it would make every path vouch
    // for itself. Everything after it is what gets checked.
    const body = source.includes('GHL_PATH_PROVENANCE: Readonly')
      ? source.slice(source.indexOf('};', source.indexOf('GHL_PATH_PROVENANCE: Readonly')))
      : source;

    for (const line of codeLinesWith(body, "'/")) {
      for (const m of line.matchAll(/'(\/[A-Za-z0-9][^']*)'/g)) {
        const found = m[1] ?? '';
        assert.ok(
          known.has(found),
          `${relative(REPO_ROOT, file)} carries the path "${found}" and nothing says where it came from. Add it to GHL_PATH_PROVENANCE with its source, or make it a pending() hole.`,
        );
      }
    }
  }
});

test('every recorded provenance names a real source, not a shrug', () => {
  // A registry whose values could be empty would turn the guard above into a
  // formality: paste the path in, paste it into the registry, done. The value has
  // to actually say something, and it has to say where.
  for (const [path, source] of Object.entries(GHL_PATH_PROVENANCE)) {
    assert.ok(source.trim().length >= 30, `${path} has provenance too short to be a source: "${source}"`);
    assert.match(
      source,
      /workflow|spike|Allowlist prefix|read off|response from/i,
      `${path} does not say where it came from: "${source}"`,
    );
  }
});

test('EVERY SCOPE CARRIES THE NAME A FOUNDER READS, not only the string', () => {
  // The screen a founder ticks these on lists around 150 permissions, each written
  // as a plain name and then the string. Nobody finds `socialplanner/post.readonly`
  // by eye in that list. They find "View Social Media Posts". A scope that reaches
  // the walk without its name is a scope somebody hunts for.
  for (const row of GHL_SCOPES_UNVERIFIED) {
    assert.ok(row.label.length > 0, `${row.scope} has no name beside it`);
    assert.doesNotMatch(row.label, /[/.]/, `${row.label} looks like a scope string rather than the name shown`);
    assert.equal(GHL_SCOPE_LABEL_BY_ID[row.id], row.label, 'the map and the tuple have to agree');
  }
  assert.equal(Object.keys(GHL_SCOPE_LABEL_BY_ID).length, GHL_SCOPES_UNVERIFIED.length);
});

test('the seven are the seven that were read off a real account', () => {
  // Pinned character for character against the list copied out of a live 97 dollar
  // Starter account on 31 August 2026. This test is the reason a later edit to the
  // tuple has to be deliberate: changing a string here fails until somebody has
  // been back to the screen and changed it here too.
  assert.deepEqual(
    GHL_SCOPES_UNVERIFIED.map((r) => `${r.label} - ${r.scope}`),
    [
      'View Social Media Posts - socialplanner/post.readonly',
      'Edit Social Media Posts - socialplanner/post.write',
      'View Social Media Accounts - socialplanner/account.readonly',
      'View Social Media Statistics - socialplanner/statistics.readonly',
      'View Contacts - contacts.readonly',
      'Edit Contacts - contacts.write',
      'View Locations - locations.readonly',
    ],
    'these are written exactly as GoHighLevel writes them on the token screen',
  );
});
