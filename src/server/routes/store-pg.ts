/**
 * src/server/routes/store-pg.ts
 *
 * WHAT THIS IS. The AppStore over Drizzle and Postgres. One statement per
 * method, no branching that is not forced by the schema.
 *
 * WHY IT EXISTS. It is the other implementation of ./ports.ts, and it is
 * deliberately the thin one. Everything with a decision in it lives in the
 * route files, which are covered by tests that run on a laptop. What is left
 * here is SQL, and SQL is proved by ./store-pg.test.ts, which renders every
 * statement without a database and asserts on what it says.
 *
 * The failures it is written against:
 *
 *   A QUERY WITH NO FOUNDER IN IT. Every founder scoped statement carries
 *   `where founder_id = $1`, and the test renders each one and fails if it does
 *   not. That is the first belt. Row level security is the second, and it only
 *   works if the transaction has said who it is for, which is why
 *   `setFounderScope` runs at the top of every transaction that touches
 *   `ge_file` or `ge_blob`. A transaction that forgets it sees zero rows and
 *   looks exactly like data loss.
 *
 *   TWO ROWS FOR ONE MESSAGE. `acceptMessage` is one transaction. Insert the
 *   message with ON CONFLICT DO NOTHING against the unique index, and if
 *   nothing came back, the message was already accepted and the turn already
 *   exists. There is no read before the write, because a check then act between
 *   two tabs is exactly the race the index exists to settle.
 *
 *   A DECRYPTION WITH THE WRONG KEY. The data key is unwrapped from the
 *   founder's own row inside the same transaction as the read, and no route
 *   ever holds one.
 *
 * WHAT CALLS IT. src/server/index.ts, which builds one and hands it to the routes.
 *
 * WHAT IT READS. threads, messages, turns, turn_events, ge_file, ge_blob, founder,
 * setup_steps, connections.
 * WHAT IT WRITES. threads, messages, turns, turn_events, founder (name and
 * timezone only), setup_steps, connections (the location id and the forget),
 * sessions (the revoke behind sign out).
 *
 * NOT YET EXECUTED AGAINST A REAL DATABASE. There is no Postgres on this
 * machine. Every statement here is typechecked against the real schema and
 * rendered in the test beside it, which catches a wrong column name and a
 * missing founder filter. It does not catch a wrong index name in an ON
 * CONFLICT or a permission the app role does not have. Those need one run
 * against a real database, and that run has not happened.
 */

import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';

import { getDb, setFounderScope, type Db, type Queryable } from '../db/client.ts';
import {
  connections,
  founders,
  geFile,
  messages,
  sessions,
  setupSteps,
  threads,
  turnEvents,
  turns,
} from '../db/schema.ts';
import { getBlob, getBlobs } from '../storage/blobs.ts';
import { unwrapDataKey, type DataKey } from '../storage/crypto.ts';
import type {
  Accepted,
  AcceptMessageInput,
  AppStore,
  ConnectionRow,
  EventKind,
  FileRow,
  MessageRow,
  NewThread,
  SetupStepRow,
  SetupStepState,
  SetupStepWrite,
  ThreadRow,
  TurnEventRow,
  TurnJob,
  TurnPriority,
  TurnRow,
  TurnStatus,
} from './ports.ts';

/**
 * The columns each row shape needs, named once.
 *
 * Selecting columns rather than whole rows because `select()` with no argument
 * returns every column, and a column added later to `messages` would start
 * arriving in an API response nobody decided to put it in.
 */
const THREAD_COLUMNS = {
  id: threads.id,
  founderId: threads.founderId,
  routeId: threads.routeId,
  title: threads.title,
  sdkSessionId: threads.sdkSessionId,
  createdAt: threads.createdAt,
  lastTurnAt: threads.lastTurnAt,
  closedAt: threads.closedAt,
} as const;

const MESSAGE_COLUMNS = {
  id: messages.id,
  threadId: messages.threadId,
  founderId: messages.founderId,
  role: messages.role,
  text: messages.text,
  clientMsgId: messages.clientMsgId,
  createdAt: messages.createdAt,
} as const;

const TURN_COLUMNS = {
  id: turns.id,
  threadId: turns.threadId,
  founderId: turns.founderId,
  messageId: turns.messageId,
  status: turns.status,
  priority: turns.priority,
  createdAt: turns.createdAt,
} as const;

const EVENT_COLUMNS = {
  id: turnEvents.id,
  turnId: turnEvents.turnId,
  threadId: turnEvents.threadId,
  founderId: turnEvents.founderId,
  kind: turnEvents.kind,
  data: turnEvents.data,
  at: turnEvents.at,
} as const;

/**
 * The database stores `status`, `priority` and `kind` as text, because a
 * Postgres enum is a migration to add a value to. These narrow on the way out,
 * so a row written by an older deploy cannot become an impossible value in a
 * union the rest of the code trusts.
 */
function asStatus(value: string): TurnStatus {
  switch (value) {
    case 'queued':
    case 'running':
    case 'done':
    case 'failed':
    case 'refused':
    case 'interrupted':
      return value;
    default:
      return 'failed';
  }
}
function asPriority(value: string): TurnPriority {
  return value === 'high' ? 'high' : 'normal';
}
function asKind(value: string): EventKind {
  switch (value) {
    case 'status':
    case 'delta':
    case 'tool':
    case 'file':
    case 'queued':
    case 'turn_end':
    case 'error':
      return value;
    default:
      return 'status';
  }
}
function asRole(value: string): MessageRow['role'] {
  return value === 'assistant' ? 'assistant' : 'founder';
}

export class PgAppStore implements AppStore {
  constructor(private readonly db: Db = getDb()) {}

  // ------------------------------------------------------------- threads

  async listThreads(founderId: string): Promise<readonly ThreadRow[]> {
    const rows = await this.db
      .select(THREAD_COLUMNS)
      .from(threads)
      .where(eq(threads.founderId, founderId))
      .orderBy(desc(threads.createdAt));
    return rows;
  }

  async findThread(founderId: string, threadId: string): Promise<ThreadRow | null> {
    // Both halves of the key, always. `where id = $1` alone would return another
    // founder's thread and every check after it would be reasoning about the
    // wrong row.
    const rows = await this.db
      .select(THREAD_COLUMNS)
      .from(threads)
      .where(and(eq(threads.founderId, founderId), eq(threads.id, threadId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createThread(input: NewThread): Promise<ThreadRow> {
    const rows = await this.db
      .insert(threads)
      .values({
        id: input.id,
        founderId: input.founderId,
        routeId: input.routeId,
        title: input.title,
        createdAt: input.at,
      })
      .returning(THREAD_COLUMNS);
    const row = rows[0];
    if (row === undefined) throw new Error('the thread insert returned no row');
    return row;
  }

  async listMessages(founderId: string, threadId: string, limit: number): Promise<readonly MessageRow[]> {
    const rows = await this.db
      .select(MESSAGE_COLUMNS)
      .from(messages)
      .where(and(eq(messages.founderId, founderId), eq(messages.threadId, threadId)))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, role: asRole(r.role) }));
  }

  // ------------------------------------------------------------- the accept

  /**
   * One transaction, and the order in it is the whole point.
   *
   * The insert goes first and the database decides whether it was a duplicate.
   * Reading first to see whether the message exists, then inserting, is two
   * statements with a gap between them, and two tabs retrying at once land in
   * that gap. Here the second one gets nothing back from the insert and is
   * handed the turn the first one made.
   */
  acceptMessage(input: AcceptMessageInput): Promise<Accepted> {
    return this.db.transaction(async (tx) => {
      const inserted =
        input.clientMsgId === null
          ? await tx
              .insert(messages)
              .values({
                id: input.messageId,
                threadId: input.threadId,
                founderId: input.founderId,
                role: 'founder',
                text: input.text,
                clientMsgId: null,
                createdAt: input.at,
              })
              .returning({ id: messages.id })
          : await tx
              .insert(messages)
              .values({
                id: input.messageId,
                threadId: input.threadId,
                founderId: input.founderId,
                role: 'founder',
                text: input.text,
                clientMsgId: input.clientMsgId,
                createdAt: input.at,
              })
              // The index is partial, `where client_msg_id is not null`, so the
              // conflict target has to carry the same predicate for Postgres to
              // infer it. `where` on onConflictDoNothing is that predicate, and
              // without it this raises "no unique or exclusion constraint
              // matching the ON CONFLICT specification" on the busiest route in
              // the app. The rendered SQL is asserted in the test beside this.
              .onConflictDoNothing({
                target: [messages.threadId, messages.clientMsgId],
                where: sql`client_msg_id is not null`,
              })
              .returning({ id: messages.id });

      if (inserted.length === 0 && input.clientMsgId !== null) {
        const existing = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.threadId, input.threadId), eq(messages.clientMsgId, input.clientMsgId)))
          .limit(1);
        const messageId = existing[0]?.id ?? input.messageId;
        const turn = await tx
          .select({ id: turns.id, priority: turns.priority })
          .from(turns)
          .where(and(eq(turns.threadId, input.threadId), eq(turns.messageId, messageId)))
          .limit(1);
        return {
          turnId: turn[0]?.id ?? '',
          messageId,
          priority: asPriority(turn[0]?.priority ?? 'normal'),
          duplicate: true,
        };
      }

      // High is the next turn of a thread that already has turns, meaning
      // somebody mid interview. Normal is the first turn of a new thread. High
      // beats normal, because a stampede of new starts otherwise strands thirty
      // people halfway through an interview.
      const priorTurns = await tx
        .select({ n: sql<string>`count(*)` })
        .from(turns)
        .where(eq(turns.threadId, input.threadId));
      const priority: TurnPriority = Number(priorTurns[0]?.n ?? 0) > 0 ? 'high' : 'normal';

      await tx.insert(turns).values({
        id: input.turnId,
        threadId: input.threadId,
        founderId: input.founderId,
        messageId: input.messageId,
        status: 'queued',
        priority,
        createdAt: input.at,
      });
      await tx.update(threads).set({ lastTurnAt: input.at }).where(eq(threads.id, input.threadId));

      return { turnId: input.turnId, messageId: input.messageId, priority, duplicate: false };
    });
  }

  async findTurn(founderId: string, turnId: string): Promise<TurnRow | null> {
    const rows = await this.db
      .select(TURN_COLUMNS)
      .from(turns)
      .where(and(eq(turns.founderId, founderId), eq(turns.id, turnId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : { ...row, status: asStatus(row.status), priority: asPriority(row.priority) };
  }

  async findActiveTurn(founderId: string, threadId: string): Promise<TurnRow | null> {
    const rows = await this.db
      .select(TURN_COLUMNS)
      .from(turns)
      .where(
        and(
          eq(turns.founderId, founderId),
          eq(turns.threadId, threadId),
          inArray(turns.status, ['queued', 'running']),
        ),
      )
      // Newest first. Two live turns on one thread should not happen, and if
      // they ever do, the one the founder is watching is the later one.
      .orderBy(desc(turns.createdAt))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : { ...row, status: asStatus(row.status), priority: asPriority(row.priority) };
  }

  async lastEventIdFor(founderId: string, threadId: string, exceptTurnId: string | null): Promise<number | null> {
    const where =
      exceptTurnId === null
        ? and(eq(turnEvents.founderId, founderId), eq(turnEvents.threadId, threadId))
        : and(
            eq(turnEvents.founderId, founderId),
            eq(turnEvents.threadId, threadId),
            ne(turnEvents.turnId, exceptTurnId),
          );
    const rows = await this.db
      .select({ id: turnEvents.id })
      .from(turnEvents)
      .where(where)
      // max() through an ordered limit rather than an aggregate, so the
      // statement reads the same index as every other query on this table.
      .orderBy(desc(turnEvents.id))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async setTurnStatus(
    turnId: string,
    status: TurnStatus,
    at: Date,
    error?: { code: string; detail: string },
  ): Promise<void> {
    await this.db
      .update(turns)
      .set({
        status,
        startedAt: status === 'running' ? at : undefined,
        endedAt: status === 'running' ? undefined : at,
        errorCode: error?.code ?? null,
        // Bounded, because this is a message from a subprocess and an
        // unbounded one is a founder's own text on its way into a column that
        // is meant to hold a machine readable reason.
        errorDetail: error === undefined ? null : error.detail.slice(0, 2000),
      })
      .where(eq(turns.id, turnId));
  }

  async queuedTurns(limit: number): Promise<readonly TurnJob[]> {
    // Not founder scoped, on purpose. This is the boot path: the turns table is
    // the record, so a restart puts every founder's queued work back in line
    // rather than losing it.
    //
    // Oldest first. A founder whose turn was accepted before the restart has
    // been waiting longer than one accepted after it, and fairness on this
    // path is what stops a redeploy mid session reordering the room.
    const rows = await this.db
      .select({
        turnId: turns.id,
        threadId: turns.threadId,
        founderId: turns.founderId,
        priority: turns.priority,
        routeId: threads.routeId,
        text: messages.text,
      })
      .from(turns)
      .innerJoin(threads, eq(threads.id, turns.threadId))
      .innerJoin(messages, eq(messages.id, turns.messageId))
      .where(eq(turns.status, 'queued'))
      .orderBy(asc(turns.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, priority: asPriority(r.priority) }));
  }

  // ------------------------------------------------------------- events

  async appendTurnEvent(row: Omit<TurnEventRow, 'id' | 'at'> & { at: Date }): Promise<TurnEventRow> {
    const inserted = await this.db
      .insert(turnEvents)
      .values({
        turnId: row.turnId,
        threadId: row.threadId,
        founderId: row.founderId,
        kind: row.kind,
        data: row.data,
        at: row.at,
      })
      .returning({ id: turnEvents.id, at: turnEvents.at });
    const first = inserted[0];
    if (first === undefined) throw new Error('the turn_events insert returned no row');
    return { ...row, id: first.id, at: first.at };
  }

  async eventsSince(
    founderId: string,
    threadId: string,
    afterId: number,
    limit: number,
  ): Promise<readonly TurnEventRow[]> {
    const rows = await this.db
      .select(EVENT_COLUMNS)
      .from(turnEvents)
      .where(
        and(
          eq(turnEvents.founderId, founderId),
          eq(turnEvents.threadId, threadId),
          gt(turnEvents.id, afterId),
        ),
      )
      // By id, not by time. The id is what Last-Event-ID carries back, and two
      // frames written inside the same millisecond have an order only here.
      .orderBy(asc(turnEvents.id))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      kind: asKind(r.kind),
      data: (r.data ?? {}) as Record<string, unknown>,
    }));
  }

  // ------------------------------------------------------- setup and profile

  /**
   * Two columns and nothing else.
   *
   * NOT `track`, and not by accident. founder.track is a cache of the Track
   * line in founder-brain.md, written by the harvest inside the transaction
   * that stored the file. A profile write that touched it would be a second
   * fork, decided by a screen, and rule 1 says the fork happens once.
   */
  async saveProfile(founderId: string, displayName: string, timezone: string): Promise<void> {
    await this.db.update(founders).set({ displayName, timezone }).where(eq(founders.id, founderId));
  }

  async listSetupSteps(founderId: string): Promise<readonly SetupStepRow[]> {
    const rows = await this.db
      .select({
        stepId: setupSteps.stepId,
        state: setupSteps.state,
        detail: setupSteps.detail,
        updatedAt: setupSteps.updatedAt,
      })
      .from(setupSteps)
      .where(eq(setupSteps.founderId, founderId))
      .orderBy(asc(setupSteps.stepId));
    return rows.map((r) => ({ ...r, state: asStepState(r.state) }));
  }

  /**
   * Upsert on the composite primary key, so re entering a step moves that one
   * row and nothing else. Section 6: state is written on entering, so this runs
   * more often than it changes anything, and it must never grow a second row
   * for the same step.
   */
  async recordSetupStep(input: SetupStepWrite): Promise<void> {
    await this.db
      .insert(setupSteps)
      .values({
        founderId: input.founderId,
        stepId: input.stepId,
        state: input.state,
        detail: input.detail,
        enteredAt: input.at,
        updatedAt: input.at,
      })
      .onConflictDoUpdate({
        target: [setupSteps.founderId, setupSteps.stepId],
        set: { state: input.state, detail: input.detail, updatedAt: input.at },
      });
  }

  // --------------------------------------------------- vendor connections

  async findConnection(founderId: string, vendor: string): Promise<ConnectionRow | null> {
    const rows = await this.db
      .select({
        vendor: connections.vendor,
        locationId: connections.locationId,
        status: connections.status,
        createdAt: connections.createdAt,
        verifiedAt: connections.verifiedAt,
        purgedAt: connections.purgedAt,
        accounts: connections.accounts,
      })
      .from(connections)
      .where(and(eq(connections.founderId, founderId), eq(connections.vendor, vendor)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * The location id, written without a credential anywhere near it.
   *
   * `status` stays `unverified` on purpose. Nothing has been checked against
   * the vendor, so saying anything else here would be a claim we have not
   * earned.
   */
  async connectionSecretFor(
    founderId: string,
    vendor: string,
  ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array } | null> {
    const rows = await this.db
      .select({ ciphertext: connections.ciphertext, nonce: connections.nonce, purgedAt: connections.purgedAt })
      .from(connections)
      .where(and(eq(connections.founderId, founderId), eq(connections.vendor, vendor)));
    const row = rows[0];
    if (row === undefined || row.ciphertext === null || row.nonce === null) return null;
    // A purged row keeps its history and must never hand a credential back.
    if (row.purgedAt !== null) return null;
    return { ciphertext: row.ciphertext, nonce: row.nonce };
  }

  async locationIdFor(founderId: string, vendor: string): Promise<string | null> {
    const rows = await this.db
      .select({ locationId: connections.locationId })
      .from(connections)
      .where(and(eq(connections.founderId, founderId), eq(connections.vendor, vendor)));
    return rows[0]?.locationId ?? null;
  }

  async saveLocationId(founderId: string, vendor: string, locationId: string, at: Date): Promise<void> {
    await this.db
      .insert(connections)
      .values({ founderId, vendor, locationId, status: 'unverified', createdAt: at })
      .onConflictDoUpdate({
        target: [connections.founderId, connections.vendor],
        set: { locationId },
      });
  }

  /**
   * Forget the credential.
   *
   * The ciphertext and the nonce are nulled rather than the row deleted,
   * because the row also carries the location id and the fact that this founder
   * once connected, and a mentor asking "did they ever get this working" needs
   * that. `purgedAt` is stamped so the post event purge and a founder pressing
   * disconnect leave the same evidence.
   */
  async forgetConnection(founderId: string, vendor: string, at: Date): Promise<void> {
    await this.db
      .update(connections)
      .set({ ciphertext: null, nonce: null, status: 'purged', verifiedAt: null, purgedAt: at })
      .where(and(eq(connections.founderId, founderId), eq(connections.vendor, vendor)));
  }

  // ----------------------------------------------------------- sign out

  async revokeSession(sessionId: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: at }).where(eq(sessions.id, sessionId));
  }

  // ------------------------------------------------------------- files

  async listFiles(founderId: string): Promise<readonly FileRow[]> {
    return await this.db.transaction(async (tx) => {
      // Row level security is on for ge_file. Without this the transaction has
      // nothing to compare against and every founder's file list is empty,
      // which reads exactly like data loss.
      await setFounderScope(tx, founderId);
      return await tx
        .select({
          path: geFile.path,
          blobSha: geFile.blobSha,
          sizeBytes: geFile.sizeBytes,
          mtime: geFile.mtime,
          version: geFile.version,
        })
        .from(geFile)
        .where(eq(geFile.founderId, founderId))
        .orderBy(asc(geFile.path));
    });
  }

  async readFile(founderId: string, path: string): Promise<{ row: FileRow; bytes: Buffer } | null> {
    return await this.db.transaction(async (tx) => {
      await setFounderScope(tx, founderId);
      const rows = await tx
        .select({
          path: geFile.path,
          blobSha: geFile.blobSha,
          sizeBytes: geFile.sizeBytes,
          mtime: geFile.mtime,
          version: geFile.version,
        })
        .from(geFile)
        .where(and(eq(geFile.founderId, founderId), eq(geFile.path, path)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      const key = await dataKeyFor(tx, founderId);
      return { row, bytes: await getBlob(tx, founderId, key, row.blobSha) };
    });
  }

  async readAllFiles(founderId: string): Promise<readonly { row: FileRow; bytes: Buffer }[]> {
    return await this.db.transaction(async (tx) => {
      await setFounderScope(tx, founderId);
      const rows = await tx
        .select({
          path: geFile.path,
          blobSha: geFile.blobSha,
          sizeBytes: geFile.sizeBytes,
          mtime: geFile.mtime,
          version: geFile.version,
        })
        .from(geFile)
        .where(eq(geFile.founderId, founderId))
        .orderBy(asc(geFile.path));
      if (rows.length === 0) return [];
      const key = await dataKeyFor(tx, founderId);
      const blobs = await getBlobs(
        tx,
        founderId,
        key,
        rows.map((r) => r.blobSha),
      );
      return rows.map((row) => {
        const bytes = blobs.get(row.blobSha);
        if (bytes === undefined) throw new Error(`blob ${row.blobSha.slice(0, 12)} is named by a file row but is not stored`);
        return { row, bytes };
      });
    });
  }
}

/**
 * The founder's own data key, unwrapped from their own row.
 *
 * Read inside the caller's transaction so it cannot be held across one, and
 * never returned past the store. A key that leaves this module is a key that
 * can be used with the wrong founder id.
 */
/**
 * setup_steps.state is text, because a Postgres enum is a migration to add a
 * value to. A row written by an older deploy, or by hand, cannot become an
 * impossible value in a union the screens trust: anything unrecognised reads as
 * not started, which is the answer that asks the founder to do the step again
 * rather than the answer that tells them it is finished.
 */
function asStepState(value: string): SetupStepState {
  switch (value) {
    case 'in_progress':
    case 'done':
    case 'skipped':
    case 'failed':
      return value;
    default:
      return 'not_started';
  }
}

async function dataKeyFor(tx: Queryable, founderId: string): Promise<DataKey> {
  const rows = await tx
    .select({ wrappedKey: founders.wrappedKey })
    .from(founders)
    .where(eq(founders.id, founderId))
    .limit(1);
  const wrapped = rows[0]?.wrappedKey;
  if (wrapped === undefined) {
    throw new Error('this founder has no data key, so nothing of theirs can be read. Refusing to continue.');
  }
  return unwrapDataKey(founderId, wrapped);
}
