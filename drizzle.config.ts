/**
 * drizzle.config.ts
 *
 * WHAT: drizzle-kit configuration. `npm run db:generate` diffs src/server/db/schema.ts
 *       against the snapshot in src/server/db/migrations/meta/ and writes SQL.
 * WHY:  a hand written CREATE TABLE and a Drizzle schema drift apart silently, and the
 *       first symptom is a column that exists in TypeScript and not in Postgres at 3am.
 *       Generating removes that class of bug.
 * READS  src/server/db/schema.ts        WRITES src/server/db/migrations/
 *
 * Applying is NOT done by drizzle-kit push. src/server/db/migrate.ts applies, because
 * extensions and row level security are preconditions this file cannot express.
 */
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://unset' },
  strict: true,
  verbose: true,
} satisfies Config;
