/**
 * src/server/db/migrate.ts
 *
 * WHAT THIS IS
 *   The only thing that changes the shape of the database. Three phases, in order:
 *   extensions, generated table migrations, row level security.
 *
 * WHY IT EXISTS
 *   drizzle-kit push and drizzle-kit migrate both stop at the table DDL. Two things
 *   this schema needs are outside that: the citext extension, which must exist
 *   before `create table founder` runs, and the policies in rls.sql. Splitting them
 *   across a README step and a migration is how one of them gets skipped on the one
 *   deployment where it mattered.
 *
 * WHAT CALLS IT
 *   `npm run db:migrate`, the deploy step, and tests/db/setup.ts before any database
 *   test runs.
 *
 * READS  src/server/db/migrations/*.sql, src/server/db/rls.sql, DATABASE_URL
 * WRITES the database schema, and the drizzle migrations bookkeeping table.
 *
 * IT VERIFIES ITSELF AT THE END. FORCE ROW LEVEL SECURITY is the load bearing word
 * in rls.sql and an ALTER that silently did not apply looks identical to one that
 * did. The assertion at the bottom is what turns that into a failed deploy.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb } from './client.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Tables that rls.sql must leave with row level security enabled AND forced. */
export const RLS_TABLES = [
  'ge_file',
  'ge_file_version',
  'ge_blob',
  'connections',
  'publish_batches',
] as const;

export async function runMigrations(): Promise<void> {
  const db = getDb();

  // Phase 1. Extensions are a precondition, not a migration: `create table founder`
  // in 0000 names citext, so it has to exist before the migrator opens that file.
  // IF NOT EXISTS makes this safe to run on every boot.
  await db.execute(sql`create extension if not exists citext`);

  // Phase 2. The generated table DDL. Regenerate with `npm run db:generate` after
  // any change to schema.ts. Never hand edit a file under migrations/.
  await migrate(db, { migrationsFolder: join(here, 'migrations') });

  // Phase 3. Policies. Idempotent by construction: every CREATE POLICY is preceded
  // by a DROP POLICY IF EXISTS in the same file.
  const rls = await readFile(join(here, 'rls.sql'), 'utf8');
  await db.execute(sql.raw(rls));

  await assertRlsForced();
}

/**
 * Prove the policies are actually in force.
 *
 * relrowsecurity says ENABLE ran. relforcerowsecurity says FORCE ran, and that is
 * the one that matters, because ENABLE alone does not apply to the table's owner and
 * a managed Postgres usually hands the application the owner role. Without this
 * check the second belt reads as present in a code review and is absent at runtime.
 */
export async function assertRlsForced(): Promise<void> {
  const db = getDb();
  const res = await db.execute(sql`
    select c.relname,
           c.relrowsecurity      as enabled,
           c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = current_schema()
       and c.relname = any(${sql.raw(`array[${RLS_TABLES.map((t) => `'${t}'`).join(',')}]`)})
  `);
  const rows = res as unknown as Array<{ relname: string; enabled: boolean; forced: boolean }>;
  const seen = new Map(rows.map((r) => [r.relname, r]));
  const bad: string[] = [];
  for (const table of RLS_TABLES) {
    const row = seen.get(table);
    if (!row) bad.push(`${table}: table not found`);
    else if (!row.enabled) bad.push(`${table}: row level security not enabled`);
    else if (!row.forced) bad.push(`${table}: row level security not FORCEd, so it does not apply to the owner`);
  }
  if (bad.length > 0) {
    throw new Error(`Row level security did not apply. Refusing to continue.\n  ${bad.join('\n  ')}`);
  }
}

// Run directly: `npm run db:migrate`.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      // eslint-disable-next-line no-console -- this is a CLI entry point, not server code
      console.log('migrations applied, row level security verified');
      await closeDb();
    })
    .catch(async (err: unknown) => {
      // eslint-disable-next-line no-console -- this is a CLI entry point, not server code
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}
