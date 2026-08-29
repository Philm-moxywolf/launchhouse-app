/**
 * tests/unit/db-suites-visible.test.ts
 *
 * WHAT THIS IS. The line that stops `npm test` reporting a clean run while the
 * most consequential assertions in the repository never executed.
 *
 * WHY IT EXISTS. `src/server/storage/turn.db.test.ts` wraps its assertions in
 * `describe(..., { skip })` when there is no DATABASE_URL. node:test counts a
 * skipped suite under `# suites` and under nothing else, so on a machine with no
 * Postgres the summary read
 *
 *     # tests 795   # suites 47   # pass 795   # fail 0   # skipped 0
 *
 * Every number in that line is true and the line as a whole misleads. `# skipped
 * 0` says nothing was skipped, and a whole suite was. Not an ordinary one: it
 * holds the only proof this project has that a refused turn leaves the record
 * exactly as it was, which is the sentence a founder is shown when their work is
 * untouched.
 *
 * A SKIPPED TEST IS COUNTED. A SKIPPED SUITE IS NOT. That is the whole
 * mechanism. This file registers one test, skipped under the same two conditions
 * as those suites, so the summary reads `# skipped 1` and the line above it names
 * what did not run and gives the command that runs it. Nothing here reproduces
 * what those assertions check. It makes their absence visible.
 *
 * IT COUNTS THEM RATHER THAN QUOTING A NUMBER, because a number typed into a
 * sentence goes stale the first time somebody adds an assertion, and a skip line
 * with a stale number in it is the same class of thing this file exists to
 * remove.
 *
 * IT ALSO WATCHES FOR THE NEXT SUITE, AND THE NEXT SUITE ARRIVED THE SAME
 * AFTERNOON. `turn.concurrency.test.ts` skips on the same variable and is now on
 * the list too. The first test finds a database suite by what it does, not by
 * what it is called: the file reads `process.env.DATABASE_URL` and hands node:test
 * a `skip`. Both suites are named in `DB_SUITES`, and a third that is not on the
 * list fails that test rather than skipping quietly.
 *
 * WHAT IT READS. Every test file under src, tests and app, as text, and two
 * environment variables. No database, no connection, and it never imports the
 * suites it describes: importing one would register its tests a second time.
 * WHAT IT WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

/** Every test file that cannot run without a real Postgres. */
const DB_SUITES: readonly string[] = [
  'src/server/storage/turn.db.test.ts',
  'src/server/storage/turn.concurrency.test.ts',
];

/** This file. It reads the same variable and must not find itself. */
const SELF = 'tests/unit/db-suites-visible.test.ts';

/**
 * What makes a file a database suite, and it is not the name.
 *
 * The first version of this looked for a `.db.test.ts` suffix, and a second database
 * suite arrived the same afternoon called `turn.concurrency.test.ts`, skipping just
 * as quietly. So the test is the behaviour instead: the file reads
 * `process.env.DATABASE_URL` and hands a `skip` to node:test. Both halves are
 * needed. Several files mention the variable in a comment and one asserts that a
 * child process cannot see it, and none of those is a suite that does not run.
 */
const READS_THE_VARIABLE = /process\.env(?:\.DATABASE_URL\b|\[["']DATABASE_URL["']\])/;
const SKIPS = /\bskip\s*:/;

/** The directories `npm test` globs. A file outside them is not run at all. */
const TEST_ROOTS = ['src', 'tests', 'app'];

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
    const source = readFileSync(full, 'utf8');
    if (READS_THE_VARIABLE.test(source) && SKIPS.test(source)) found.push(path);
  }
  return found;
}

/**
 * How many assertions one suite holds.
 *
 * Deliberately crude. It is counting a number that goes into a sentence, not
 * parsing a program, and the test below fails rather than printing a wrong
 * number if the count ever comes back as zero.
 */
function assertionsIn(file: string): number {
  const source = readFileSync(join(REPO, file), 'utf8');
  return (source.match(/^\s*(?:it|test)\(/gm) ?? []).length;
}

const TOTAL = DB_SUITES.reduce((n, file) => n + assertionsIn(file), 0);

test('EVERY SUITE THAT NEEDS A DATABASE IS ON THE LIST THIS FILE MAKES VISIBLE', () => {
  const onDisk = TEST_ROOTS.flatMap((root) => walk(join(REPO, root), [])).sort();
  assert.deepEqual(
    onDisk,
    [...DB_SUITES].sort(),
    [
      'A test file gates a skip on DATABASE_URL and is not in DB_SUITES, or one in DB_SUITES has moved.',
      'A database suite that is not on this list skips silently, and then the summary says nothing was skipped.',
      'Add it to DB_SUITES.',
    ].join('\n'),
  );
});

test('THE SKIP LINE KNOWS WHAT IT IS TALKING ABOUT', () => {
  assert.ok(TOTAL > 0, 'no assertions were counted, so the skip line would say nothing did not run');

  for (const file of DB_SUITES) {
    const source = readFileSync(join(REPO, file), 'utf8');
    // The two conditions are mirrored below rather than imported, and mirrored
    // conditions drift. This is the mirror checked against what it mirrors: if
    // the suite stops reading one of these, this file is skipping on the wrong
    // question and says so here rather than staying quiet.
    for (const variable of ['DATABASE_URL', 'GE_MASTER_KEY']) {
      assert.ok(
        source.includes(variable),
        `${file} no longer reads ${variable}, so the skip condition in this file mirrors something that has changed.`,
      );
    }
  }
});

/**
 * The two conditions, in the same order and for the same reason as the suite
 * itself: a machine with a database and no master key would otherwise fail with
 * a cipher error and look like a storage bug rather than a missing secret.
 */
const HAVE_DB = typeof process.env['DATABASE_URL'] === 'string' && process.env['DATABASE_URL'].length > 0;
const HAVE_KEY = typeof process.env['GE_MASTER_KEY'] === 'string' && process.env['GE_MASTER_KEY'].length > 0;

const MISSING = !HAVE_DB ? 'DATABASE_URL' : 'GE_MASTER_KEY';
const WHY =
  `${MISSING} is not set, so ${String(TOTAL)} assertions did not run, in ${DB_SUITES.join(' and ')}. ` +
  'They hold the only proof that a refused turn leaves the record untouched. Run them with: ' +
  'DATABASE_URL=postgres://user@localhost:5432/launchhouse_test ' +
  'GE_MASTER_KEY=$(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))") npm test';

test(
  `the ${String(TOTAL)} assertions that need a real Postgres ran`,
  HAVE_DB && HAVE_KEY ? {} : { skip: WHY },
  () => {
    // Reached only when both are set, which is the case where the suites really
    // did run. There is nothing else to assert: this test exists to be counted
    // when it is skipped, and the summary is where it is read.
    assert.equal(HAVE_DB && HAVE_KEY, true);
  },
);
