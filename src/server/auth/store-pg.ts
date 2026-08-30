/**
 * src/server/auth/store-pg.ts
 *
 * WHAT THIS IS. The AuthStore over Drizzle and Postgres.
 *
 * WHY IT EXISTS. It is the other implementation of ./types.ts, and it holds the
 * two statements whose exact shape decides whether sign in is safe.
 *
 *   CLAIMING THE DEPLOYMENT IS ONE INSERT THE DATABASE IS ALLOWED TO REFUSE.
 *   A remix gets a fresh database with no founder row in it, so the first
 *   successful sign in creates one. Two tabs can reach that moment together.
 *   Reading "is there an owner" and then inserting is two statements with a gap
 *   between them that both tabs land in, and the loser meets a unique
 *   constraint violation rendered as a 500 on the founder's own screen. Here it
 *   is `insert ... on conflict do nothing` followed by a read, so the database
 *   picks the winner and both callers end on the same row.
 *
 *   THE REFUSAL COUNT IS A COUNT OF ROWS THAT ALREADY EXIST. Not a counter
 *   table and not a Map, because the process restarts and a limiter that resets
 *   on a redeploy is a limiter with a published bypass. `ge_event` is already
 *   the durable record that an attempt happened.
 *
 *   NO SECRET IS EVER STORED. There is nothing to store: the passphrase lives
 *   in Replit Secrets and the session id is a hash of a cookie and that
 *   passphrase. A dump of this database contains no credential at all.
 *
 * WHAT WENT, AND WHY IT WAS DEAD RATHER THAN UNUSED. `findFounderByEmail`,
 * `countSigninRequests`, `insertSigninTokens`, `findSigninTokenBySha`,
 * `consumeSigninToken`, `burnSigninRequest`, `burnLiveTokensForEmail` and
 * `recordMentorRequest` were the roster, the magic link token pair and the
 * mentor queue. One founder owns one deployment now. There is no roster to look
 * an address up in, no token to consume, and no mentor to queue anybody for.
 * `signin_tokens` and `mentor_requests` have no reader left in this codebase,
 * and `mentor_requests` was the only table that held an email address on
 * purpose, so dropping it removes a store of personal data from every founder's
 * own deployment.
 *
 * WHAT CALLS IT. src/server/index.ts, which builds one and hands it to the auth
 * plugin.
 *
 * WHAT IT READS. founder, sessions, ge_event.
 * WHAT IT WRITES. founder (once, on the first claim, including that founder's
 * wrapped data key), sessions, ge_event.
 *
 * NOT YET EXECUTED AGAINST A REAL DATABASE. Every statement is typechecked
 * against the real schema, which catches a wrong column and a missing filter.
 * It does not catch a permission the app role does not have. That needs one run
 * against a real database, and that run has not happened. THE INSERT IN
 * `ensureOwner` IS THE ONE TO WATCH: it is the only statement in this file that
 * writes the `founder` table, and it runs exactly once in the life of a
 * deployment, on the first sign in, in a room.
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { getDb, type Db } from '../db/client.ts';
import { founders, geEvent, sessions } from '../db/schema.ts';
import { createFounderKey } from '../storage/crypto.ts';
import { OWNER_ROW_KEY, type AuthStore, type FounderRow, type Logger, type SessionRow } from './types.ts';

const FOUNDER_COLUMNS = {
  id: founders.id,
  email: founders.email,
  displayName: founders.displayName,
  timezone: founders.timezone,
  track: founders.track,
  disabledAt: founders.disabledAt,
  deletedAt: founders.deletedAt,
} as const;

const SESSION_COLUMNS = {
  id: sessions.id,
  founderId: sessions.founderId,
  createdAt: sessions.createdAt,
  expiresAt: sessions.expiresAt,
  lastSeenAt: sessions.lastSeenAt,
  revokedAt: sessions.revokedAt,
} as const;

export class OwnerRowMissing extends Error {
  constructor() {
    super(
      'The owner row was inserted or already existed, and then could not be read back. The founder table is not answering, so nobody can sign in.',
    );
    this.name = 'OwnerRowMissing';
  }
}

export class PgAuthStore implements AuthStore {
  constructor(
    private readonly log: Logger,
    private readonly db: Db = getDb(),
  ) {}

  /**
   * The owner row, created if this deployment has never been claimed.
   *
   * `founder.email` is unique, and the owner row always carries the same fixed
   * word, so "there is exactly one owner" is enforced by Postgres rather than
   * hoped for by this code. `onConflictDoNothing` is what turns the second
   * caller's insert from an error into a no operation, and the read that
   * follows gives both callers the row that won.
   */
  async ensureOwner(candidate: FounderRow): Promise<FounderRow> {
    // The common path is a deployment that has already been claimed: one SELECT
    // and no key generation. Reading first also keeps the AES wrap below off
    // every sign in for the whole life of the deployment.
    const already = await this.findOwner();
    if (already !== null) return already;

    /**
     * THE WRAPPED KEY IS MADE HERE, AND THIS IS THE ONLY PLACE IN THE RUNTIME
     * THAT MAKES ONE.
     *
     * `founder.wrapped_key` is NOT NULL, so the row cannot exist without it,
     * which is the schema saying that a founder and their data key are one
     * thing rather than two. Every blob this founder ever writes is encrypted
     * under it. So it is created in the same statement as the row rather than
     * by a caller who might one day insert a founder and wire the key up
     * afterwards, leaving a window in which a founder exists and their files
     * cannot be encrypted.
     *
     * IT IS NOT ON `FounderRow`, ON PURPOSE. That type is attached to every
     * request as `request.founder` and read by route handlers. A wrapped key on
     * it would be one careless `reply.send(founder)` away from being served to
     * a browser.
     *
     * `onConflictDoNothing` is what makes a second caller's insert a no
     * operation rather than an overwrite. Rewriting this key would make every
     * blob the founder already owns undecryptable, which is the worst thing
     * this method could do.
     */
    const { wrapped } = createFounderKey(candidate.id);

    await this.db
      .insert(founders)
      .values({
        id: candidate.id,
        email: OWNER_ROW_KEY,
        displayName: candidate.displayName,
        timezone: candidate.timezone,
        track: candidate.track,
        wrappedKey: wrapped,
        disabledAt: candidate.disabledAt,
        deletedAt: candidate.deletedAt,
      })
      .onConflictDoNothing({ target: founders.email });

    const row = await this.findOwner();
    if (row === null) {
      // Not a founder facing message. The route's error handler answers with
      // its own sentence, and this one is for the log and for whoever reads it.
      this.log.error({}, 'the owner row could not be read back after the claim insert');
      throw new OwnerRowMissing();
    }
    if (row.id === candidate.id) {
      this.log.info({ founderId: row.id }, 'this deployment has been claimed by its owner');
    }
    return row;
  }

  async findOwner(): Promise<FounderRow | null> {
    // `email` is citext, so the comparison is case folded by the database, and
    // the value written is a fixed lower case word in any case.
    const rows = await this.db
      .select(FOUNDER_COLUMNS)
      .from(founders)
      .where(eq(founders.email, OWNER_ROW_KEY))
      .limit(1);
    return rows[0] ?? null;
  }

  async findFounderById(id: string): Promise<FounderRow | null> {
    const rows = await this.db.select(FOUNDER_COLUMNS).from(founders).where(eq(founders.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async insertSession(row: SessionRow): Promise<void> {
    await this.db.insert(sessions).values({
      id: row.id,
      founderId: row.founderId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      revokedAt: row.revokedAt,
    });
  }

  async findSession(id: string): Promise<SessionRow | null> {
    const rows = await this.db.select(SESSION_COLUMNS).from(sessions).where(eq(sessions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, id));
  }

  async revokeSession(id: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: at }).where(eq(sessions.id, id));
  }

  /**
   * The durable half of the defence on the passphrase.
   *
   * Filtered on founder id as well as verb, so it uses the
   * `ge_event_founder_at_idx` index rather than reading the table. There is one
   * founder, so the id narrows nothing today, and the index is the reason to
   * write it this way anyway.
   */
  async countAuthEvents(founderId: string, verb: string, since: Date): Promise<number> {
    const rows = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(geEvent)
      .where(and(eq(geEvent.founderId, founderId), eq(geEvent.verb, verb), gte(geEvent.at, since)));
    return Number(rows[0]?.n ?? 0);
  }

  async recordAuthEvent(
    founderId: string,
    actor: string,
    verb: string,
    subject: string | null,
    at: Date,
  ): Promise<void> {
    // ge_event carries no founder text and no name. `actor` is 'founder' for a
    // sign in and 'system' for a refused one, because a refused attempt was not
    // necessarily the founder and writing that it was would put a claim in the
    // audit line that is not true. `subject` is a path or a slug or nothing.
    await this.db.insert(geEvent).values({ founderId, actor, verb, subject, at });
  }
}
