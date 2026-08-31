/**
 * src/server/routes/ports.ts
 *
 * WHAT THIS IS. Everything the HTTP layer needs from the database and from the
 * agent, expressed as interfaces. No behaviour.
 *
 * WHY IT EXISTS. Two failures.
 *
 *   The first is untested routes. There is no Postgres on a laptop here and
 *   there will not be one in CI before the freeze, so a route layer that
 *   imports Drizzle directly is a route layer nobody runs until the deployment.
 *   The four properties this build has to prove, one founder never seeing
 *   another's workspace among them, are properties of these routes and they
 *   have to be provable on a laptop.
 *
 *   The second is quieter and worse. EVERY METHOD HERE THAT TOUCHES FOUNDER
 *   DATA TAKES A FOUNDER ID AS ITS FIRST ARGUMENT, and that argument comes from
 *   the session cookie and from nowhere else. Writing the store as an interface
 *   makes that shape visible on one screen: there is no method that reads a
 *   thread by id alone, so there is no way to write a handler that reads
 *   somebody else's thread by accident. `WHERE founder_id` is the first belt and
 *   row level security in Postgres is the second.
 *
 * WHAT CALLS IT. Every file in src/server/routes/. Wired to Drizzle by
 * ./store-pg.ts and to Maps by ./test-fixtures.ts.
 *
 * WHAT IT READS AND WRITES. Nothing. Types only.
 */

/** SSE frame kinds. Section 4: status, delta, tool, file, queued, turn_end, error. */
export type EventKind = 'status' | 'delta' | 'tool' | 'file' | 'queued' | 'turn_end' | 'error';

export type TurnStatus = 'queued' | 'running' | 'done' | 'failed' | 'refused' | 'interrupted';
export type TurnPriority = 'high' | 'normal';

export interface ThreadRow {
  readonly id: string;
  readonly founderId: string;
  readonly routeId: string;
  readonly title: string | null;
  readonly sdkSessionId: string | null;
  readonly createdAt: Date;
  readonly lastTurnAt: Date | null;
  readonly closedAt: Date | null;
}

export interface MessageRow {
  readonly id: string;
  readonly threadId: string;
  readonly founderId: string;
  readonly role: 'founder' | 'assistant';
  readonly text: string;
  readonly clientMsgId: string | null;
  readonly createdAt: Date;
}

export interface TurnRow {
  readonly id: string;
  readonly threadId: string;
  readonly founderId: string;
  readonly messageId: string | null;
  readonly status: TurnStatus;
  readonly priority: TurnPriority;
  readonly createdAt: Date;
}

export interface TurnEventRow {
  /** bigserial. This is the SSE `id:` field, and it is what makes reconnect lossless. */
  readonly id: number;
  readonly turnId: string;
  readonly threadId: string;
  readonly founderId: string;
  readonly kind: EventKind;
  readonly data: Record<string, unknown>;
  readonly at: Date;
}

export interface FileRow {
  readonly path: string;
  readonly blobSha: string;
  readonly sizeBytes: number;
  readonly mtime: Date;
  readonly version: number;
}

/** What accepting one founder message produced. */
export interface Accepted {
  readonly turnId: string;
  readonly messageId: string;
  readonly priority: TurnPriority;
  /**
   * True when this exact (thread, clientMsgId) had already been accepted, so
   * nothing new was written and the caller is being handed the turn id it was
   * given the first time. A browser that retried after a dropped connection
   * gets the same answer twice and the founder's message is sent once.
   */
  readonly duplicate: boolean;
}

export interface AcceptMessageInput {
  readonly founderId: string;
  readonly threadId: string;
  readonly text: string;
  readonly clientMsgId: string | null;
  readonly messageId: string;
  readonly turnId: string;
  readonly at: Date;
}

export interface NewThread {
  readonly id: string;
  readonly founderId: string;
  readonly routeId: string;
  readonly title: string | null;
  readonly at: Date;
}

/**
 * One row of the setup rail, keyed by the step slug the browser addresses.
 *
 * `skipped` and `failed` are different ON PURPOSE and the mentor board treats
 * them differently. "Not bought GoHighLevel yet" on 6 September is skipped and
 * is fine. "Private Integrations is not in my Settings menu" is failed and
 * needs a human today. Collapsing the two is how the founder who needs help
 * becomes invisible.
 */
export type SetupStepState = 'not_started' | 'in_progress' | 'done' | 'skipped' | 'failed';

export interface SetupStepRow {
  readonly stepId: string;
  readonly state: SetupStepState;
  /**
   * Founder facing detail, and NEVER a token. The `pit-` guard runs over every
   * value before it reaches here, because a secret written into a row is a
   * secret in the next backup and in the next support screenshot.
   */
  readonly detail: string | null;
  readonly updatedAt: Date;
}

export interface SetupStepWrite {
  readonly founderId: string;
  readonly stepId: string;
  readonly state: SetupStepState;
  readonly detail: string | null;
  readonly at: Date;
}

/**
 * What the browser is allowed to know about a vendor connection.
 *
 * NO CIPHERTEXT, NO NONCE, NO TOKEN PREFIX AND NO LENGTH. The columns exist on
 * the table and none of them is anything a screen needs, so none of them is
 * carried on the shape a route can reach. A field that is never loaded cannot
 * be rendered by accident.
 */
export interface ConnectionRow {
  readonly vendor: string;
  /** GoHighLevel's own id for the founder's sub account. Not a secret. */
  readonly locationId: string | null;
  /** connected | unverified | failed | purged */
  readonly status: string;
  readonly createdAt: Date;
  readonly verifiedAt: Date | null;
  readonly purgedAt: Date | null;
}

export interface AppStore {
  listThreads(founderId: string): Promise<readonly ThreadRow[]>;
  /** Founder scoped. A thread belonging to somebody else is null, never a row. */
  findThread(founderId: string, threadId: string): Promise<ThreadRow | null>;
  createThread(input: NewThread): Promise<ThreadRow>;
  listMessages(founderId: string, threadId: string, limit: number): Promise<readonly MessageRow[]>;

  /**
   * One founder message and the turn that will answer it, written together.
   *
   * ONE CALL BECAUSE IT IS ONE ATOMIC ACCEPT. A message inserted without a turn
   * is a founder message nothing will ever answer, which reads as the app
   * ignoring them. A turn inserted without a message is a run with nothing to
   * say. The unique index on (thread_id, client_msg_id) is what makes a retry
   * after a dropped connection impossible to double send, and it can only do
   * that if both rows are decided inside one transaction.
   */
  acceptMessage(input: AcceptMessageInput): Promise<Accepted>;

  findTurn(founderId: string, turnId: string): Promise<TurnRow | null>;

  /**
   * The turn that is queued or running on one thread, or null.
   *
   * WHY IT EXISTS. Stop is one button and the founder does not know a turn id.
   * Without this the browser would have to send one, and the only id it holds
   * is whatever it last saw on the stream, which after a reconnect is not
   * necessarily the turn that is actually running.
   *
   * Founder scoped, like everything else here, so there is no way to write a
   * handler that stops somebody else's run.
   */
  findActiveTurn(founderId: string, threadId: string): Promise<TurnRow | null>;

  /**
   * The last event a reconnecting browser already has, which is the highest
   * `turn_events` id on this thread that belongs to a turn that has finished.
   *
   * WHY THE EXCLUSION. A finished turn's words are in `messages`, so the
   * browser has them from the thread read and replaying them would print the
   * answer twice. A turn still running is not in `messages` at all, so its
   * events must replay or the founder watches a blank space where a sentence
   * was being written when their wifi dropped.
   */
  lastEventIdFor(founderId: string, threadId: string, exceptTurnId: string | null): Promise<number | null>;
  setTurnStatus(turnId: string, status: TurnStatus, at: Date, error?: { code: string; detail: string }): Promise<void>;

  /**
   * Boot path. The turns table is the record, so a restart re queues rather
   * than losing work.
   *
   * Returns the whole job rather than the turn row, because a resubmit needs
   * the founder's own words and the route they were on, and those live in
   * `messages` and `threads`. A caller that had to fetch them itself would be
   * three queries in a loop across every founder, on the path that decides how
   * long a deploy takes to become useful again.
   */
  queuedTurns(limit: number): Promise<readonly TurnJob[]>;

  /**
   * Append one SSE frame, durably, and return it with the id the database
   * assigned. Durable BEFORE it reaches a socket: a frame on the wire that is
   * not in this table cannot be replayed, and replay is the whole reason the
   * table exists.
   */
  appendTurnEvent(row: Omit<TurnEventRow, 'id' | 'at'> & { at: Date }): Promise<TurnEventRow>;

  /** Replay for a reconnecting browser. Founder scoped, ordered by id. */
  eventsSince(founderId: string, threadId: string, afterId: number, limit: number): Promise<readonly TurnEventRow[]>;

  /**
   * The two answers of the first run screen: what to call this founder, and
   * which clock they are on.
   *
   * The timezone is here rather than guessed because a laptop knew it and a
   * server does not. Stored as an IANA name, never an offset: offsets change
   * twice a year and a 90 day plan built on 27 September runs past 1 November.
   */
  saveProfile(founderId: string, displayName: string, timezone: string): Promise<void>;

  /** The setup rail, one row per step this founder has actually entered. */
  listSetupSteps(founderId: string): Promise<readonly SetupStepRow[]>;

  /**
   * Written on ENTERING a step, not on leaving it, so a closed tab resumes
   * where the founder actually was rather than where they last succeeded.
   */
  recordSetupStep(input: SetupStepWrite): Promise<void>;

  findConnection(founderId: string, vendor: string): Promise<ConnectionRow | null>;

  /**
   * The Location ID, which is not a secret and survives a resume. Written on
   * its own, before any token, because step 3 of the walk comes before step 5
   * and a founder who closes the tab between them must not lose it.
   */
  saveLocationId(founderId: string, vendor: string, locationId: string, at: Date): Promise<void>;

  /**
   * The location id this founder saved, or null.
   *
   * It sits here beside its own write rather than being read straight from the
   * database by the route. A route that reaches for `getDb()` is a route that cannot
   * run in a harness without one, and the GoHighLevel connect route found that out by
   * answering a founder with a server error instead of a sentence.
   */
  locationIdFor(founderId: string, vendor: string): Promise<string | null>;

  /**
   * Delete our copy of a credential. IT DOES NOT SWITCH THE TOKEN OFF at the
   * vendor, and the screen says so, because a founder told "disconnected" who
   * believes the token is dead has a live credential they have stopped
   * thinking about.
   */
  forgetConnection(founderId: string, vendor: string, at: Date): Promise<void>;

  /**
   * Sign out, from the browser. The id is the sha256 of the cookie value, so
   * this method cannot be called with anything a founder typed.
   */
  revokeSession(sessionId: string, at: Date): Promise<void>;

  listFiles(founderId: string): Promise<readonly FileRow[]>;
  /**
   * One file's plaintext bytes, or null when this founder has no such file.
   *
   * The decryption lives behind this method rather than in the route, so no
   * handler ever holds a data key and no handler can be written that decrypts
   * with the wrong founder's key.
   */
  readFile(founderId: string, path: string): Promise<{ row: FileRow; bytes: Buffer } | null>;
  /** Everything, for the ZIP. Served from the record, so a download never waits on a warm cache. */
  readAllFiles(founderId: string): Promise<readonly { row: FileRow; bytes: Buffer }[]>;
}

/**
 * The agent, from the route layer's point of view.
 *
 * The route does not run a turn. It accepts a message in under 50 milliseconds
 * and hands the turn id to this, which admits it, queues it and reports
 * everything it does as `turn_events` rows. That separation is why the POST can
 * return 202 and stream nothing.
 */
export interface TurnExecutor {
  submit(job: TurnJob): void;
  /** Stop: Query.interrupt(). True when there was something to interrupt. */
  interrupt(turnId: string): Promise<boolean>;
  /** How many turns are mid flight. Graceful shutdown waits on this reaching zero. */
  inFlight(): number;
}

export interface TurnJob {
  readonly turnId: string;
  readonly threadId: string;
  readonly founderId: string;
  readonly routeId: string;
  readonly priority: TurnPriority;
  readonly text: string;
}

/** Injected so tests do not sleep and so heartbeats can be wound forward. */
export interface Clock {
  now(): Date;
  setInterval(fn: () => void, ms: number): { cancel(): void };
}

export const systemClock: Clock = {
  now: () => new Date(),
  setInterval: (fn, ms) => {
    const t = setInterval(fn, ms);
    // The process must be able to shut down with heartbeat timers pending.
    if (typeof t.unref === 'function') t.unref();
    return { cancel: () => clearInterval(t) };
  },
};

export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** ULID shaped ids, because storage/paths.ts refuses anything else for a founder. */
export interface IdSource {
  thread(): string;
  message(): string;
  turn(): string;
}
