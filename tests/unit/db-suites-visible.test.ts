/**
 * tests/unit/db-suites-visible.test.ts
 *
 * WHAT THIS IS. The line that stops `npm test` reporting a clean run while the most
 * consequential assertions in the repository never executed, and the one place that
 * prints the command which runs them.
 *
 * WHY IT EXISTS. The database suites used to wrap their assertions in
 * `describe(..., { skip })`. node:test counts a skipped TEST under `# skipped`. It
 * counts a skipped SUITE under `# suites` and under nothing else, and prints a line
 * beginning `ok` beside it. So on a machine with no Postgres the summary read
 *
 *     # tests 925   # suites 62   # pass 924   # fail 0   # skipped 0
 *
 * Every number in that line was true and the line as a whole misled. `# skipped 0` said
 * nothing had been left out, and fifteen assertions had been, the ones that hold the
 * only proof this project has that a refused turn leaves the founder record exactly as
 * it was.
 *
 * WHAT CHANGED, AND WHY THIS FILE IS SMALLER FOR IT. The suites now skip one assertion
 * at a time, through `dbTest` in tests/db/setup.ts, so node counts every one of them and
 * the summary says `# skipped` with the real number in it. This file no longer stands in
 * for that count, and no longer quotes one: the count it used to print said 12 when the
 * true figure was 15, because the loop in turn.concurrency.test.ts registers four
 * assertions from one line of source and no amount of reading the text finds that out. A
 * number typed into a sentence goes stale. The runner's own count cannot.
 *
 * SO THIS FILE NOW DOES THREE THINGS.
 *   1  Finds every test file that needs a database, by what it imports rather than by
 *      what it is called, and fails if one of them is not on the list.
 *   2  Fails if a listed suite goes back to skipping whole, which is what would quietly
 *      take those assertions out of the summary again.
 *   3  Carries one skipped test whose reason is a command that works, so the person who
 *      sees the skip has something to paste.
 *
 * WHAT IT READS. Every test file under src, tests and app, as text, and the skip
 * condition from tests/db/setup.ts. No database, no connection, and it never imports the
 * suites it describes: importing one would register its assertions a second time.
 * WHAT IT WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NO_DATABASE } from '../db/setup.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

/** The harness a suite goes through when it needs a real Postgres. */
const HARNESS = join(REPO, 'tests', 'db', 'setup.ts');

/** Every test file that cannot run without one. */
const DB_SUITES: readonly string[] = [
  'src/server/storage/turn.db.test.ts',
  'src/server/storage/turn.concurrency.test.ts',
  'tests/db/setup.test.ts',
];

/** This file. It imports the harness for the skip reason and must not find itself. */
const SELF = 'tests/unit/db-suites-visible.test.ts';

/** The directories `npm test` globs. A file outside them is not run at all. */
const TEST_ROOTS = ['src', 'tests', 'app'];

/**
 * What makes a file a database suite, and it is not the name.
 *
 * The first version of this looked for a `.db.test.ts` suffix and missed
 * turn.concurrency.test.ts, which arrived the same afternoon and skipped just as
 * quietly. The second looked for the text `process.env.DATABASE_URL` next to the text
 * `skip:`, which is a guess about how a file is written rather than a fact about what it
 * needs. This is the fact: a suite that needs a database imports the harness that hands
 * it one. The specifier is resolved rather than matched, so `./setup.ts` from inside
 * tests/db and `../../../tests/db/setup.ts` from inside src/server/storage give the same
 * answer, which is what they are.
 */
function importsTheHarness(file: string, source: string): boolean {
  const dir = dirname(join(REPO, file));
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.startsWith('.')) continue;
    if (resolve(dir, specifier) === HARNESS) return true;
  }
  return false;
}

function walk(dir: string, found: string[]): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, found);
      continue;
    }
    if (!entry.name.endsWith('.test.ts')) continue;
    const path = relative(REPO, full);
    if (path === SELF) continue;
    if (importsTheHarness(path, readFileSync(full, 'utf8'))) found.push(path);
  }
  return found;
}

test('THE DETECTOR ITSELF WORKS, both ways round', () => {
  // Proved before it is trusted. A detector that answered no to everything would let the
  // test below pass against an empty list and find nothing, for ever.
  const importer = "import { dbTest } from '../../../tests/db/setup.ts';\n";
  const other = "import { dbTest } from './some-other-helper.ts';\nimport postgres from 'postgres';\n";
  assert.equal(importsTheHarness('src/server/storage/turn.db.test.ts', importer), true);
  assert.equal(importsTheHarness('src/server/storage/turn.db.test.ts', other), false);
  // The same file reached by a different route is still the same file.
  assert.equal(importsTheHarness('tests/db/setup.test.ts', "import { dbTest } from './setup.ts';\n"), true);
});

test('EVERY SUITE THAT NEEDS A DATABASE IS ON THE LIST THIS FILE MAKES VISIBLE', () => {
  const onDisk = TEST_ROOTS.flatMap((root) => walk(join(REPO, root), [])).sort();
  assert.deepEqual(
    onDisk,
    [...DB_SUITES].sort(),
    [
      'A test file goes through tests/db/setup.ts and is not in DB_SUITES, or one in DB_SUITES has moved.',
      'A database suite that is not on this list skips without being named, and then nobody knows what did not run.',
      'Add it to DB_SUITES.',
    ].join('\n'),
  );
});

test('NO LISTED SUITE SKIPS WHOLE, because a skipped suite is counted nowhere', () => {
  for (const file of DB_SUITES) {
    const source = readFileSync(join(REPO, file), 'utf8');
    assert.ok(
      source.includes('dbTest'),
      `${file} does not register its assertions with dbTest, so they may not be counted as skipped.`,
    );
    assert.ok(
      !/describe\([^)]*\{\s*skip/.test(source),
      `${file} skips a whole describe. node:test counts a skipped test and does not count a skipped suite, ` +
        'so those assertions would vanish from the summary and the run would look clean without them.',
    );
  }
});

/**
 * The command, and why it is written this way.
 *
 * The old one was `DATABASE_URL=postgres://user@localhost:5432/launchhouse_test ... npm
 * test` and it did not work. `user` is a role that does not exist. The database has to
 * be made before anything can connect to it. And following the line as printed produced
 * four failures in tests/unit/env.test.ts on top of that, because setting GE_MASTER_KEY
 * was exactly what that file could not survive. All three are fixed. This is the line as
 * it now runs:
 *
 *   createdb makes the database, and is quiet about it on the second run.
 *   No user in the URL, so Postgres connects as the operating system user, which is who
 *   a local install already trusts.
 *   The key is generated rather than invented, because a real one is 32 bytes and a
 *   32 character string is not.
 */
const COMMAND =
  'createdb launchhouse_test 2>/dev/null; ' +
  'DATABASE_URL=postgres://localhost:5432/launchhouse_test ' +
  'GE_MASTER_KEY=$(node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))") ' +
  'npm test';

const WHY =
  `${NO_DATABASE === false ? '' : NO_DATABASE}. The assertions in ${DB_SUITES.join(', ')} did not run, ` +
  'and the skipped count in the summary below is how many. They hold the only proof that a refused turn ' +
  'leaves the founder record untouched. Point this at a scratch database, never at anything holding a ' +
  `real founder, then run: ${COMMAND}`;

test('the assertions that need a real Postgres ran', NO_DATABASE === false ? {} : { skip: WHY }, () => {
  // Reached only when the harness says there is a database, which is the case where the
  // suites really did run. There is nothing else to assert: this test exists to be
  // counted when it is skipped, and the summary is where it is read.
  assert.equal(NO_DATABASE, false);
});
