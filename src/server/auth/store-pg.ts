/**
 * src/server/auth/store-pg.ts
 *
 * WHAT THIS IS. The AuthStore over Drizzle and Postgres.
 *
 * WHY IT EXISTS. It is the other implementation of ./types.ts, and it holds the
 * three statements whose exact shape decides whether sign in is safe.
 *
 *   CONSUMPTION IS ONE CONDITIONAL UPDATE. `update ... where id = $1 and
 *   consumed_at is null returning id` is what makes a token single use. Reading
 *   the row, checking it, and then updating it is two statements with a gap
 *   between them, and two tabs and a mail scanner all land in that gap. Here
 *   Postgres decides the winner and returns it, and the caller is told whether
 *   it was them.
 *
 *   THE RATE LIMIT IS A COUNT OF ROWS THAT ALREADY EXIST. Not a counter table
 *   and not a Map, because the process restarts and a limiter that resets on a
 *   deploy is a limiter with a published bypass. Only the `.link` row of each
 *   pair is counted, because one request writes two rows and the limit is on
 *   requests.
 *
 *   NO TOKEN IS EVER STORED. Every lookup is by sha256. A database dump does
 *   not hand somebody 130 live sign in links.
 *
 *   THE MENTOR QUEUE IS A ROW, NOT A LOG LINE. `recordMentorRequest` writes
 *   `mentor_requests`. It used to write `log.warn` and resolve, which meant the
 *   page that says "A mentor has been told" was shown after a call that had
 *   written nothing, and was shown just the same with the database down. Every
 *   sentence this store's callers put on a screen has to have something behind
 *   it, and for that one the something is a row.
 *
 * WHAT CALLS IT. src/server/index.ts, which builds one and hands it to the auth
 * plugin.
 *
 * WHAT IT READS. founder, signin_tokens, sessions.
 * WHAT IT WRITES. signin_tokens, sessions, ge_event, mentor_requests.
 *
 * NOT YET EXECUTED AGAINST A REAL DATABASE. Every statement is typechecked
 * against the real schema and rendered in ../routes/store-pg.test.ts, which
 * catches a wrong column and a missing filter. It does not catch a permission
 * the app role does not have. That needs one run against a real database, and
 * that run has not happened.
 *
 * THE mentor_requests INSERT IS THE NEWEST OF THEM and the one to check first,
 * because it is the only statement here that writes a table added after 0000.
 * A deployment running migration 0000 and not 0001 answers every other route
 * and fails only this one, which is a founder who is not on the roster meeting
 * a 500 on the screen that exists so they never meet a dead end.
 */

import { and, eq, gte, isNull, like, sql } from 'drizzle-orm';

import { getDb, type Db } from '../db/client.ts';
import { founders, geEvent, mentorRequests, sessions, signinTokens } from '../db/schema.ts';
import type { AuthStore, FounderRow, Logger, SessionRow, SigninTokenRow } from './types.ts';

const FOUNDER_COLUMNS = {
  id: founders.id,
  email: founders.email,
  displayName: founders.displayName,
  timezone: founders.timezone,
  track: founders.track,
  disabledAt: founders.disabledAt,
  deletedAt: founders.deletedAt,
} as const;

const TOKEN_COLUMNS = {
  id: signinTokens.id,
  email: signinTokens.email,
  tokenSha: signinTokens.tokenSha,
  founderId: signinTokens.founderId,
  createdAt: signinTokens.createdAt,
  expiresAt: signinTokens.expiresAt,
  consumedAt: signinTokens.consumedAt,
} as const;

const SESSION_COLUMNS = {
  id: sessions.id,
  founderId: sessions.founderId,
  createdAt: sessions.createdAt,
  expiresAt: sessions.expiresAt,
  lastSeenAt: sessions.lastSeenAt,
  revokedAt: sessions.revokedAt,
} as const;

export class PgAuthStore implements AuthStore {
  constructor(
    private readonly log: Logger,
    private readonly db: Db = getDb(),
  ) {}

  async findFounderByEmail(email: string): Promise<FounderRow | null> {
    // `email` is citext, so the comparison is case folded by the database. A
    // founder who booked as Sam.Taylor@Example.com signs in as
    // sam.taylor@example.com without anybody having to remember to lower case.
    const rows = await this.db.select(FOUNDER_COLUMNS).from(founders).where(eq(founders.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async findFounderById(id: string): Promise<FounderRow | null> {
    const rows = await this.db.select(FOUNDER_COLUMNS).from(founders).where(eq(founders.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async countSigninRequests(email: string, since: Date): Promise<number> {
    const rows = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(signinTokens)
      .where(
        and(
          eq(signinTokens.email, email),
          gte(signinTokens.createdAt, since),
          // One request writes a link row and a code row. The limit is on
          // requests, so only one of the pair is counted.
          like(signinTokens.id, '%.link'),
        ),
      );
    return Number(rows[0]?.n ?? 0);
  }

  async insertSigninTokens(rows: readonly SigninTokenRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(signinTokens).values(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        tokenSha: r.tokenSha,
        founderId: r.founderId,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        consumedAt: r.consumedAt,
      })),
    );
  }

  async findSigninTokenBySha(tokenSha: string): Promise<SigninTokenRow | null> {
    const rows = await this.db
      .select(TOKEN_COLUMNS)
      .from(signinTokens)
      .where(eq(signinTokens.tokenSha, tokenSha))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * The race resolver. `and consumed_at is null` is the whole thing: without it
   * two presses both update the row, both get a row back, and both are given a
   * session on a token that was supposed to work once.
   */
  async consumeSigninToken(id: string, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(signinTokens)
      .set({ consumedAt: at })
      .where(and(eq(signinTokens.id, id), isNull(signinTokens.consumedAt)))
      .returning({ id: signinTokens.id });
    return updated.length === 1;
  }

  async burnSigninRequest(requestId: string, at: Date): Promise<void> {
    // The two rows of one request are `<requestId>.link` and `<requestId>.code`.
    // The prefix is generated by us and is base64url, so it carries no LIKE
    // metacharacter, and the value is bound rather than interpolated.
    await this.db
      .update(signinTokens)
      .set({ consumedAt: at })
      .where(and(like(signinTokens.id, `${requestId}.%`), isNull(signinTokens.consumedAt)));
  }

  async burnLiveTokensForEmail(email: string, at: Date): Promise<void> {
    await this.db
      .update(signinTokens)
      .set({ consumedAt: at })
      .where(and(eq(signinTokens.email, email), isNull(signinTokens.consumedAt)));
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
   * The mentor queue, for somebody who is not on the roster.
   *
   * ONE ROW, AND THE ROW IS THE PROMISE. The screen the caller shows next says "A
   * mentor has been told. We have passed on <address>. Somebody will add you and
   * email you a link." Until `mentor_requests` existed this method was one
   * `log.warn` and a resolved promise, so that sentence was shown to a founder
   * after a call that had written nothing, and it was shown just as readily with
   * the database down, when the process could not write anything at all. The
   * insert is what makes the sentence true, and its failure is what stops the
   * sentence being shown.
   *
   * IT DOES NOT SWALLOW A FAILURE. There is no catch here on purpose. If this
   * throws, the route never reaches the page, the error handler answers with the
   * 500 that says "tell a mentor and quote LH...", and the founder is sent to a
   * human. That is worse than working and much better than being told somebody
   * has their address when nobody does.
   *
   * THE ADDRESS DOES NOT GO TO THE LOG. `ge_event` may never carry one, and pino's
   * redact list does not name `email`, so a warn line carrying one would write a
   * real person's address into every log sink for the life of the deployment. The
   * row holds it, where a purge can reach it. The log line below records that a
   * request happened and nothing about who made it.
   */
  async recordMentorRequest(email: string, note: string, at: Date): Promise<void> {
    await this.db.insert(mentorRequests).values({ email, note, at });
    this.log.warn({}, 'MENTOR QUEUE: somebody could not sign in and is waiting to be added');
  }

  async recordAuthEvent(
    founderId: string,
    actor: string,
    verb: string,
    subject: string | null,
    at: Date,
  ): Promise<void> {
    // ge_event carries no founder text and no name. `actor` is 'founder' or
    // 'mentor:<id>', and `subject` is a path or a slug or nothing. An address
    // here would put a real person into the audit line a purge cannot reach.
    await this.db.insert(geEvent).values({ founderId, actor, verb, subject, at });
  }
}
