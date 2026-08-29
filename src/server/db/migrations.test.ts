/**
 * src/server/db/migrations.test.ts
 *
 * WHAT THIS IS. Three checks over the files that decide the shape of the database,
 * none of which needs a database to run.
 *
 * WHY IT EXISTS.
 *
 *   The migrator reads meta/_journal.json and opens `${tag}.sql` for each entry. It
 *   never lists the folder. So a stray .sql beside the real ones is invisible to it
 *   and is applied by nobody, while looking in a diff exactly like a migration that
 *   is. One had already appeared here, a byte for byte copy of 0000_initial.sql with
 *   " 2" on the end, of the kind a file manager makes. It was removed, and this is
 *   what stops the next one being noticed by somebody at 3am instead.
 *
 *   RLS_TABLES in migrate.ts is the list assertRlsForced() checks after a deploy. If
 *   rls.sql grows a table and that list does not, the new table's policy is applied
 *   and never verified, which is the same as not knowing whether it is on. The two
 *   are compared here so they cannot drift.
 *
 *   A policy with USING and no WITH CHECK reads rows correctly and lets a founder
 *   INSERT a row carrying somebody else's founder_id. Both halves are required, per
 *   table, and that is asserted rather than assumed.
 *
 * WHAT IT CALLS. The filesystem. No database, and nothing that opens a connection.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RLS_TABLES } from './migrate.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, 'migrations');
const RLS_SQL = readFileSync(join(HERE, 'rls.sql'), 'utf8');

interface Journal {
  entries: Array<{ tag: string }>;
}

function journal(): Journal {
  return JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as Journal;
}

test('EVERY .sql IN migrations/ IS NAMED BY THE JOURNAL, and every entry has a file', () => {
  // Both directions. A file the journal does not name is applied by nobody and is
  // dead weight that reads like a migration. An entry with no file makes the
  // migrator throw at deploy, which is the safer half of the same mistake.
  const onDisk = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const named = journal()
    .entries.map((e) => `${e.tag}.sql`)
    .sort();
  assert.deepEqual(
    onDisk,
    named,
    'migrations/ and meta/_journal.json disagree. Regenerate with `npm run db:generate`; never hand edit a file under migrations/.',
  );
});

test('the journal has no duplicate tags', () => {
  const tags = journal().entries.map((e) => e.tag);
  assert.deepEqual([...new Set(tags)].sort(), [...tags].sort());
});

test('RLS_TABLES and rls.sql name exactly the same tables', () => {
  const forced = [...RLS_SQL.matchAll(/ALTER TABLE "([a-z_]+)"\s+FORCE\s+ROW LEVEL SECURITY/g)]
    .map((m) => m[1] as string)
    .sort();
  assert.deepEqual(
    forced,
    [...RLS_TABLES].sort(),
    'rls.sql forces a different set of tables from the one migrate.ts verifies afterwards. A table in one and not the other is a policy nobody checks, or a check with nothing behind it.',
  );
});

test('every forced table also has ENABLE, because FORCE alone is not a control', () => {
  for (const table of RLS_TABLES) {
    assert.match(
      RLS_SQL,
      new RegExp(`ALTER TABLE "${table}"\\s+ENABLE\\s+ROW LEVEL SECURITY`),
      `${table} is FORCEd without being ENABLEd`,
    );
  }
});

test('EVERY POLICY HAS BOTH USING AND WITH CHECK', () => {
  // USING alone filters reads. Without WITH CHECK a founder can INSERT a row that
  // carries somebody else's founder_id, and the second belt has a hole in exactly
  // the direction that plants data rather than reads it.
  for (const table of RLS_TABLES) {
    const policy = new RegExp(
      `CREATE POLICY \\w+ ON "${table}"\\s+USING\\s+\\([^;]*?\\)\\s+WITH CHECK\\s+\\([^;]*?\\);`,
      's',
    );
    assert.match(RLS_SQL, policy, `${table} has no policy carrying both USING and WITH CHECK`);
  }
});

test('every policy reads the founder from the transaction setting, not from a literal', () => {
  // current_setting('app.founder_id', true) returns NULL when SET LOCAL was never
  // run, and founder_id = NULL is NULL, so a forgotten scope sees zero rows rather
  // than somebody else's. That fail closed behaviour is the whole point of the
  // second argument being true, so it is asserted rather than left to a reading.
  const policies = [...RLS_SQL.matchAll(/CREATE POLICY \w+ ON "([a-z_]+)"([\s\S]*?);/g)];
  assert.equal(policies.length, RLS_TABLES.length);
  for (const [, table, body] of policies) {
    assert.match(
      body ?? '',
      /current_setting\('app\.founder_id', true\)/,
      `${table}'s policy does not read app.founder_id`,
    );
    assert.doesNotMatch(body ?? '', /\bOR\b/i, `${table}'s policy has an OR in it, which is how a belt stops being a belt`);
  }
});
