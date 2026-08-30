/**
 * src/server/auth/types.ts
 *
 * WHAT THIS IS. The seams between sign in and everything it does not own: the
 * database and the clock. Interfaces only, no behaviour.
 *
 * WHY IT EXISTS. Two failures, and the second is the one that matters.
 *
 *   A sign in flow that reaches straight into Postgres cannot be tested without
 *   Postgres, and a flow nobody has run is a flow nobody has proved. Sign in is
 *   the first thing the founder does with their own deployment, in a staffed
 *   room, so it has to have been executed many times on a laptop with no
 *   database.
 *
 *   And the founder id has exactly one source: the session cookie. Writing the
 *   store as an interface makes that visible. Nothing in here accepts a founder
 *   id from a caller who did not first present a cookie, because there is no
 *   method that takes one.
 *
 * WHAT CHANGED, AND WHY THE OLD SHAPE WAS WRONG RATHER THAN INCOMPLETE. This
 * used to describe a roster of 130 people, one time sign in tokens and a
 * mailer. One founder owns one deployment now. There is no roster to look an
 * address up in, no cohort to be a member of, and no address to send anything
 * to. `SigninTokenRow` and `Mailer` are gone rather than left unused, because
 * an interface with no implementation reads in a review exactly like one that
 * works.
 *
 * WHAT CALLS IT. Every file in src/server/auth/. Wired to Drizzle by
 * ./store-pg.ts and to a Map by ./test-fixtures.ts.
 *
 * WHAT IT READS AND WRITES. Nothing. Types only.
 */

/**
 * The one founder this deployment belongs to.
 *
 * Still called a founder row, and it is still the `founder` table, because
 * every other module in the app hangs off `founderId`: the storage paths, the
 * spend ledger, the threads, the audit line. One row instead of 130 does not
 * change any of that, and renaming the concept would touch files that have
 * nothing to do with sign in.
 */
export interface FounderRow {
  readonly id: string;
  /**
   * `founder.email` is `citext NOT NULL UNIQUE` in the schema, from the roster
   * model. There is no address in this model, so the owner row carries the
   * fixed word in OWNER_ROW_KEY below instead.
   *
   * THE COLUMN NOW EARNS ITS PLACE FOR A DIFFERENT REASON. Because it is
   * unique, and because the owner row always carries the same value, "there is
   * exactly one owner" is something Postgres enforces rather than something
   * this code hopes for. Two browser tabs racing to claim a fresh deployment
   * both insert, the database refuses the second, and both end up on the same
   * row.
   */
  readonly email: string;
  readonly displayName: string | null;
  readonly timezone: string;
  readonly track: string | null;
  readonly disabledAt: Date | null;
  readonly deletedAt: Date | null;
}

/**
 * The value written into `founder.email` for the owner row.
 *
 * Not an address, and it cannot be mistaken for one: there is no at sign in it.
 * Nothing in this build sends mail, so nothing can try.
 */
export const OWNER_ROW_KEY = 'owner';

/**
 * The timezone the owner row is created with, before the founder is asked.
 *
 * UTC is the honest answer to a question nobody has been asked yet. It is not a
 * guess at where they are. `founder.timezone` is NOT NULL, so the row needs
 * something, and the first run screen replaces it with a real zone before any
 * date is written. The screen is reached because `display_name` is null, not
 * because the zone is UTC, so this value is never load bearing.
 */
export const OWNER_PLACEHOLDER_TIMEZONE = 'UTC';

export interface SessionRow {
  /**
   * The session id. NOT the cookie value, and not a plain hash of it either:
   * see `sessionIdFor` in ./session.ts. The cookie itself is never stored.
   */
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
 * Small on purpose. The old interface had eleven methods because a roster, a
 * token pair, a rate limit counted in Postgres and a mentor queue all lived
 * behind it. What is left is the owner row, sessions, and the audit line, and
 * every one of those has a caller in this folder.
 */
export interface AuthStore {
  /**
   * Return the owner row, creating it if this deployment has never been
   * claimed.
   *
   * WHY THIS IS ONE METHOD RATHER THAN A READ AND A WRITE. A remix gets a fresh
   * database with no founder in it, so the first successful sign in is also the
   * moment the owner row comes into existence. Two tabs can reach that moment
   * at the same time. Splitting it into "is there one" and "make one" puts a
   * gap between the two statements that both tabs land in, and the second
   * insert fails on the unique constraint with a 500 on a founder's screen.
   * Implementations insert and let the database refuse the loser, then read
   * back whichever row won.
   */
  ensureOwner(candidate: FounderRow): Promise<FounderRow>;

  /**
   * The owner row, or null on a deployment nobody has signed in to yet.
   *
   * READ ONLY, AND THAT IS THE WHOLE REASON IT IS NOT `ensureOwner`. A wrong
   * passphrase has to be counted somewhere, and the count hangs off the owner's
   * id. If the only way to get that id also created the row, a stranger
   * guessing badly at an unclaimed deployment would claim it by getting it
   * wrong, which is exactly the failure the first run claim design was
   * rejected for.
   */
  findOwner(): Promise<FounderRow | null>;

  findFounderById(id: string): Promise<FounderRow | null>;

  insertSession(row: SessionRow): Promise<void>;
  findSession(id: string): Promise<SessionRow | null>;
  touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  revokeSession(id: string, at: Date): Promise<void>;

  /**
   * How many audit lines with this verb the owner has since `since`.
   *
   * This is the durable half of the defence on the passphrase. The process
   * restarts, so a counter held in memory resets with it, and the cheapest way
   * past an in memory limit is to wait for a redeploy. The audit lines are
   * already the durable record that an attempt happened, so counting them costs
   * one indexed query and no new table.
   */
  countAuthEvents(founderId: string, verb: string, since: Date): Promise<number>;

  /**
   * The audit line for a sign in, and for a refused one.
   *
   * `actor` is 'founder'. NEVER a person's name, and `subject` is a path or a
   * slug or nothing. That is the ge_event rule and it is written here as well
   * because this is where the temptation to log something identifying is.
   */
  recordAuthEvent(
    founderId: string,
    actor: string,
    verb: string,
    subject: string | null,
    at: Date,
  ): Promise<void>;
}

/** Injected so tests do not sleep and so expiry can be wound forward. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/**
 * Waiting, injected for the same reason the clock is.
 *
 * ./owner.ts slows a wrong passphrase down deliberately. A test that proved
 * that by actually waiting two seconds would be a test somebody deletes, so the
 * wait is a function and the test records what it was asked for.
 */
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Structured logging. pino in production, a collector in tests. */
export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}
