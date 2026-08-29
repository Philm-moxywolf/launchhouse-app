/**
 * src/server/auth/types.ts
 *
 * WHAT THIS IS. The seams between sign in and everything it does not own: the
 * database, the mailer and the clock. Interfaces only, no behaviour.
 *
 * WHY IT EXISTS. Two failures, and the second is the one that matters.
 *
 *   A sign in flow that reaches straight into Postgres cannot be tested without
 *   Postgres, and a flow nobody has run is a flow nobody has proved. On 25
 *   September there are 130 people in a room and the first thing every one of
 *   them does is sign in. That path has to have been executed, many times, on a
 *   laptop with no database.
 *
 *   And the founder id has exactly one source: the session cookie. Writing the
 *   store as an interface makes that visible. Nothing in here accepts a founder
 *   id from a caller who did not first present a cookie, because there is no
 *   method that takes one.
 *
 * WHAT CALLS IT. Every file in src/server/auth/. Wired to Drizzle by
 * ./store-pg.ts and to a Map by ./test-fixtures.ts.
 *
 * WHAT IT READS AND WRITES. Nothing. Types only.
 */

/**
 * One row of the pre seeded roster of 130.
 *
 * The roster is `founder` rows, seeded from the ticket list before 4 September.
 * There is no sign up: a founder either exists here or is told so honestly.
 */
export interface FounderRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly timezone: string;
  readonly track: string | null;
  readonly disabledAt: Date | null;
  readonly deletedAt: Date | null;
}

/**
 * One sign in secret. The secret itself is never stored, only its sha256, so a
 * database dump does not hand somebody 130 live sign in links.
 *
 * `id` carries the request it belongs to: `<requestId>.link` and
 * `<requestId>.code`. One email carries both a link and a six digit code, and
 * using either one has to burn the other. Encoding the pairing in the primary
 * key is what lets that happen without a column the schema does not have.
 */
export interface SigninTokenRow {
  readonly id: string;
  readonly email: string;
  readonly tokenSha: string;
  readonly founderId: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface SessionRow {
  /** sha256 of the cookie value. The cookie itself is never stored. */
  readonly id: string;
  readonly founderId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
}

/**
 * Everything sign in does to the database.
 *
 * Every method that can race is written so the database decides the winner.
 * `consumeSigninToken` returns whether this caller was the one that consumed
 * it, because two tabs and a mail scanner can arrive at the same millisecond
 * and exactly one of them may be given a session.
 */
export interface AuthStore {
  findFounderByEmail(email: string): Promise<FounderRow | null>;
  findFounderById(id: string): Promise<FounderRow | null>;

  /**
   * How many sign in requests this address has made since `since`.
   *
   * Counted from the token rows themselves rather than from a counter table,
   * because the rate limit has to survive a restart and the rows already are
   * the durable record of a request having happened.
   */
  countSigninRequests(email: string, since: Date): Promise<number>;

  insertSigninTokens(rows: readonly SigninTokenRow[]): Promise<void>;
  findSigninTokenBySha(tokenSha: string): Promise<SigninTokenRow | null>;

  /**
   * Mark one token used, if it is not used already. True means this caller won
   * and may be given a session. False means somebody, or something, got there
   * first.
   */
  consumeSigninToken(id: string, at: Date): Promise<boolean>;

  /**
   * Burn every unused token of one request. Used after a win: the link and the
   * six digit code are two ways into one sign in, and spending either must
   * spend both.
   */
  burnSigninRequest(requestId: string, at: Date): Promise<void>;

  /**
   * Burn every live token for one address. Used after too many wrong codes.
   *
   * Keyed on the address rather than on a request because a wrong guess matches
   * no row, so there is no request to name. This is the durable half of the
   * defence on a six digit secret, and it is why the in memory attempt counter
   * being lost on a restart does not matter.
   */
  burnLiveTokensForEmail(email: string, at: Date): Promise<void>;

  insertSession(row: SessionRow): Promise<void>;
  findSession(id: string): Promise<SessionRow | null>;
  touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  revokeSession(id: string, at: Date): Promise<void>;

  /**
   * A founder who is not on the roster asked for a mentor. Written where a
   * mentor will see it, so the screen is never a dead end.
   *
   * The audit line takes a founder id and this person has none, so it is
   * recorded against no founder and carries the address only in the place a
   * mentor has to read it. Callers pass the address; implementations decide
   * where it lands.
   */
  recordMentorRequest(email: string, note: string, at: Date): Promise<void>;

  /**
   * The audit line for a sign in, and for the one path where a mentor hands a
   * founder access to their own account.
   *
   * `actor` is 'founder' or 'mentor:<id>'. NEVER a person's name, and `subject`
   * is a path or a slug or nothing. That is the ge_event rule and it is written
   * here as well because this is where the temptation to log an address is.
   */
  recordAuthEvent(
    founderId: string,
    actor: string,
    verb: string,
    subject: string | null,
    at: Date,
  ): Promise<void>;
}

/**
 * The mailer.
 *
 * Fails closed outside prod: the recipient is checked against MAIL_ALLOWLIST
 * and a miss throws. A seeded founder with a plausible address must not be able
 * to cause a real email to a real person.
 */
export interface Mailer {
  send(message: OutboundMail): Promise<void>;
}

export interface OutboundMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Injected so tests do not sleep and so expiry can be wound forward. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Structured logging. pino in production, a collector in tests. */
export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}
