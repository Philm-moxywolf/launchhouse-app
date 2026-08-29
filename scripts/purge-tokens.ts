/**
 * scripts/purge-tokens.ts
 *
 * WHAT THIS IS. Removes sign in tokens and sessions that are finished with.
 * `npm run purge:tokens`, and `-- --dry-run` to see what it would take without
 * taking it.
 *
 * WHY IT EXISTS. Two reasons, and neither of them is tidiness.
 *
 *   A CREDENTIAL WITH NO USE IS STILL A CREDENTIAL. `signin_tokens` holds one
 *   row per magic link ever sent to one of 130 people. The token itself is never
 *   stored, only its sha256, so a dump does not hand somebody a live link. That
 *   is the belt. This is the braces: a row that has been consumed, or that
 *   expired days ago, can do nothing except sit in a backup with an email
 *   address attached to it. Keeping it has no upside at all.
 *
 *   THE TABLE ONLY GROWS. Sign in is a magic link, so every attempt writes a
 *   row, and the rate limiter means a founder who mistypes an address writes
 *   several. Over three sessions and a weekend with 130 founders that is a table
 *   nobody prunes because nobody wrote the pruner.
 *
 * WHAT IT WILL NOT TOUCH, AND THIS IS THE WHOLE SAFETY ARGUMENT. A token that is
 * unconsumed AND not yet expired is a founder's live sign in link, possibly open
 * on their phone right now. A session that is unrevoked AND not yet expired is a
 * founder signed in. Neither is ever selected: every WHERE clause below reads
 * "expired before now minus the grace period" or "consumed before now minus the
 * grace period". Deleting a live one signs somebody out mid session, which
 * during a live event is a support conversation for the sake of a few rows.
 *
 * THE GRACE PERIOD EXISTS BECAUSE CLOCKS AND HUMANS DISAGREE. A token that
 * expired ninety seconds ago belongs to somebody who is about to click it and
 * see the honest "this link has expired" screen. That screen reads the row. Take
 * the row away and they get the generic one instead, which tells them nothing.
 *
 * WHAT CALLS IT. `npm run purge:tokens`, by hand or from a scheduled job.
 * Nothing imports it.
 *
 * WHAT IT READS. The environment, through src/server/env.ts.
 * WHAT IT WRITES. It deletes from `signin_tokens` and `sessions`. Nothing else.
 */

import { and, isNotNull, lt, or, sql } from 'drizzle-orm';

import { loadEnv } from '../src/server/env.ts';

const env = loadEnv();

import { closeDb, getDb } from '../src/server/db/client.ts';
import { sessions, signinTokens } from '../src/server/db/schema.ts';

/**
 * How long after a token is finished with before it goes.
 *
 * A day, so that "I clicked the link yesterday and it says expired" is still a
 * question the database can answer while somebody is standing at the help desk.
 */
const DEFAULT_GRACE_HOURS = 24;

function graceHours(argv: readonly string[]): number {
  const flag = argv.find((a) => a.startsWith('--grace-hours='));
  if (flag === undefined) return DEFAULT_GRACE_HOURS;
  const value = Number(flag.slice('--grace-hours='.length));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--grace-hours needs a number of hours that is zero or more, and it was ${flag}`);
  }
  return value;
}

async function main(argv: readonly string[]): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const hours = graceHours(argv);
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const db = getDb();

  // Finished with: expired before the cutoff, or consumed before the cutoff.
  // Never "unconsumed and still in date", which is a live link.
  const deadTokens = or(
    lt(signinTokens.expiresAt, cutoff),
    and(isNotNull(signinTokens.consumedAt), lt(signinTokens.consumedAt, cutoff)),
  );
  // Same shape for a session: past its expiry, or revoked before the cutoff.
  const deadSessions = or(
    lt(sessions.expiresAt, cutoff),
    and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, cutoff)),
  );

  const tokenCount = await db
    .select({ n: sql<string>`count(*)` })
    .from(signinTokens)
    .where(deadTokens);
  const sessionCount = await db
    .select({ n: sql<string>`count(*)` })
    .from(sessions)
    .where(deadSessions);

  const tokens = Number(tokenCount[0]?.n ?? 0);
  const stale = Number(sessionCount[0]?.n ?? 0);

  process.stdout.write(
    [
      `environment ${env.APP_ENV}, database tagged ${env.DATABASE_ENV_TAG}`,
      `finished with more than ${String(hours)} hours ago, so before ${cutoff.toISOString()}`,
      `  signin_tokens  ${String(tokens)}`,
      `  sessions       ${String(stale)}`,
      '',
    ].join('\n'),
  );

  if (dryRun) {
    process.stdout.write('--dry-run, so nothing was deleted.\n');
    return 0;
  }
  if (tokens === 0 && stale === 0) {
    process.stdout.write('nothing to remove.\n');
    return 0;
  }

  const removedTokens = await db.delete(signinTokens).where(deadTokens).returning({ id: signinTokens.id });
  const removedSessions = await db.delete(sessions).where(deadSessions).returning({ id: sessions.id });

  process.stdout.write(
    `removed ${String(removedTokens.length)} sign in tokens and ${String(removedSessions.length)} sessions.\n` +
      'Nothing live was touched: a token that is unconsumed and in date, and a session that is unrevoked and in date, are never selected.\n',
  );
  return 0;
}

const code = await main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  return 1;
});
await closeDb();
process.exit(code);
