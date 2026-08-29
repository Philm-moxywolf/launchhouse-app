/**
 * src/server/db/schema.ts
 *
 * WHAT THIS IS
 *   The Drizzle definition of every table in the Launchhouse database. Postgres is
 *   the record. The container filesystem is a cache and is not durable, so if a
 *   fact is not in one of these tables it does not exist.
 *
 * WHY IT EXISTS
 *   It prevents the failure named in build doc section 2: a founder finishes a turn,
 *   the container dies, and their work is gone because it only ever lived in /tmp.
 *   It also prevents the failure that ends the product, one founder reading another
 *   founder's prospects: every founder owned table carries founder_id in its primary
 *   key or as its first index column, and the migration puts row level security on
 *   the four tables where a leak would be worst.
 *
 * WHAT CALLS IT
 *   src/server/storage/* (blobs, materialise, harvest, turn), src/server/db/client.ts,
 *   and every route and agent module that reads state. Nothing writes founder files
 *   directly: writes go through storage/turn.ts.
 *
 * READS  nothing
 * WRITES nothing. It is a declaration. Migrations under db/migrations/ apply it.
 *
 * THE TABLES IN THE BUILD DOC ARE COPIED, NOT REDESIGNED. Section 5 gives DDL for
 * founder, ge_file, ge_file_version, ge_blob and ge_event. Those five are transcribed
 * column for column. The app layer tables are named in section 5 but have no DDL
 * there, so their columns are derived from what sections 4, 6 and 7 say they hold.
 * Each of those carries a comment naming the section it came from.
 *
 * ONE TABLE IS IN NEITHER LIST, and it is named here rather than left to be found.
 * `mentor_requests` is not in the build document. Section 6 describes the screen it
 * serves ("The second writes into a mentor queue") and never says where that queue
 * lives, and the answer it was given was a log line. The table is what makes the
 * sentence on that screen true. Its own comment carries the reasoning.
 *
 * NAMING NOTE. Section 5's DDL says `create table founder` (singular) and its prose
 * says `founders.track`. The SQL wins, because it is the part that has to compile.
 * The SQL table is `founder`; the exported binding is `founders` because every other
 * binding here is plural; `founder` is exported as an alias so code written from
 * either half of the doc compiles.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  char,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * citext, case insensitive text.
 *
 * WHY: section 5 specifies `email citext`. A founder who signs up as Sam@Corp.com
 * and later types sam@corp.com is one person, and a roster check that says otherwise
 * turns into a support conversation in a room with 130 people in it. The extension
 * is created by migration 0000. If the Postgres tier ever refuses the extension the
 * fallback is text plus a unique index on lower(email), and that is a schema change,
 * not a runtime one, so it is better to fail at migrate time than to silently differ.
 */
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

/**
 * bytea. Drizzle's pg-core has no first class bytea, and the two candidates behave
 * differently on read: node-postgres returns a Buffer for bytea, so the mapped type
 * is Buffer in and Buffer out. Uint8Array is accepted on write and normalised, so
 * callers never have to care which one they are holding.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  },
});

// ---------------------------------------------------------------------------
// The founder, and the founder's files. Section 5 DDL, transcribed.
// ---------------------------------------------------------------------------

export const founders = pgTable(
  'founder',
  {
    /**
     * ULID, 26 characters, opaque. NEVER the email.
     *
     * WHY IT MATTERS HERE AND NOT ONLY IN THE PROSE: this id becomes a path
     * segment, /tmp/ge/<id>/. An email in a path leaks a real person's address
     * into every log line, every stack trace and every process listing. It is
     * also the reason storage/paths.ts validates the id shape before joining it
     * to anything.
     */
    id: text('id').primaryKey(),
    email: citext('email').notNull().unique(),
    displayName: text('display_name'),

    /**
     * IANA zone name, never an offset. Section 5 change 3: a founder in Atlanta
     * logging at 22:00 on the 24th must not get a heading dated the 25th, and
     * ops-log.md is append only so it cannot be corrected afterwards. This value
     * is passed to ge as TZ on every spawn.
     */
    timezone: text('timezone').notNull(),

    /**
     * Cache of the Track line in founder-brain.md. NEVER authoritative.
     * If this column and the file disagree, the file wins and the column is the
     * bug. It exists so a mentor screen can list 130 founders without spawning
     * 130 shells and so the sidebar can paint before any model call.
     */
    track: text('track'),

    /**
     * Derived from track and model by app/content/routes.ts and nothing else
     * (build doc F3: two vocabularies for one fork, mapped in one place). Same
     * cache status as track. storage/turn.ts does not compute it; it writes what
     * an injected deriveRoute returns, or leaves it alone.
     */
    route: text('route'),

    /**
     * The per founder data key, wrapped by GE_MASTER_KEY. Every blob is encrypted
     * under this key, uniformly, so there is no "did we remember to mark this file
     * sensitive" bug to have. Two consequences, named rather than discovered:
     * deduplication is per founder, and losing the master key loses every founder's
     * work, so it is escrowed offline before the first founder signs in.
     */
    wrappedKey: bytea('wrapped_key').notNull(),

    /**
     * Monotonic per founder. Bumped once per committed turn. The materialised
     * folder carries this number in .ge-epoch, and a mismatch is what tells the
     * next turn the warm folder is stale.
     */
    version: bigint('version', { mode: 'number' }).notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('founder_email_idx').on(t.email)],
);

/** Alias. Section 5's DDL says `founder`, its prose says `founders`. Both compile. */
export const founder = founders;

/**
 * The live tree. One row per file that exists right now, for one founder.
 * `path` is relative to growth-engine/, for example 'founder-brain.md' or
 * 'people/sam-example-com.md'. It never starts with a slash and never contains '..'.
 * storage/paths.ts is the only thing allowed to decide that.
 */
export const geFile = pgTable(
  'ge_file',
  {
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    /** sha256 of the PLAINTEXT bytes. Not of the ciphertext: ciphertext is nonced. */
    blobSha: char('blob_sha', { length: 64 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mtime: timestamp('mtime', { withTimezone: true }).notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.founderId, t.path] })],
);

/**
 * Every version, kept forever. Layer 3 of the four backup layers: the ge snapshot
 * ring is ten deep and rolls, and this is the layer that answers "it was fine three
 * weeks ago". These are 10 KB files and there are 130 founders, so forever is cheap.
 */
export const geFileVersion = pgTable(
  'ge_file_version',
  {
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
    blobSha: char('blob_sha', { length: 64 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /**
     * Which ge verb or model action produced this version, for the history panel.
     * Null when the change came from a model Write or Edit rather than from ge.
     */
    verb: text('verb'),
    /**
     * Set when this version is a deletion rather than content. Without it a deleted
     * file is an absence in the history panel, and an absence cannot be restored
     * because nothing says when it went.
     */
    deleted: boolean('deleted').notNull().default(false),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.founderId, t.path, t.version] }),
    index('ge_file_version_founder_at_idx').on(t.founderId, t.at),
  ],
);

/**
 * Content addressed, per founder, encrypted.
 *
 * Per founder rather than global because each founder's blobs are encrypted under
 * their own data key, so two founders with byte identical files still hold two rows.
 * That is the stated cost of uniform encryption and it is worth it.
 *
 * The saving that pays for the design: ge snapshot copies a file before overwriting
 * it, so a snapshot's bytes are identical to a version already stored here. Content
 * addressing means the snapshot costs one small ge_file row and no new blob.
 */
export const geBlob = pgTable(
  'ge_blob',
  {
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    sha: char('sha', { length: 64 }).notNull(),
    /** AES 256 GCM ciphertext with the 16 byte auth tag appended. See storage/crypto.ts. */
    ciphertext: bytea('ciphertext').notNull(),
    /** The 12 byte GCM IV. Fresh per write, never reused. */
    nonce: bytea('nonce').notNull(),
    /** Size of the PLAINTEXT, so a quota can be summed without decrypting anything. */
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.founderId, t.sha] })],
);

/**
 * The audit line. NEVER founder text, never a name.
 *
 * `subject` is a path or a slug and nothing else. The rule is enforced by review,
 * not by the type system, so it is written here in capitals where somebody adding a
 * column will read it.
 */
export const geEvent = pgTable(
  'ge_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** 'founder', 'model', 'ge', 'system', or 'mentor:<id>'. Never a person's name. */
    actor: text('actor').notNull(),
    verb: text('verb').notNull(),
    /** A path or a slug. NEVER a name or an address. */
    subject: text('subject'),
    exitCode: integer('exit_code'),
    versionBefore: bigint('version_before', { mode: 'number' }),
    versionAfter: bigint('version_after', { mode: 'number' }),
  },
  (t) => [index('ge_event_founder_at_idx').on(t.founderId, t.at)],
);

// ---------------------------------------------------------------------------
// Auth. Section 8 step 5, and section 6 "Sign in".
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_founder_idx').on(t.founderId)],
);

/**
 * Magic link tokens. The token itself is never stored, only its sha256, so a
 * database dump does not hand somebody 130 live sign in links.
 *
 * consumedAt exists because of assumption E2: Microsoft Safe Links may fetch the
 * URL before a human clicks it. The GET then POST verify page is what makes that
 * moot, and this column is what proves whether it did.
 */
export const signinTokens = pgTable(
  'signin_tokens',
  {
    id: text('id').primaryKey(),
    email: citext('email').notNull(),
    tokenSha: char('token_sha', { length: 64 }).notNull().unique(),
    founderId: text('founder_id').references(() => founders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('signin_tokens_email_idx').on(t.email)],
);

/**
 * The mentor queue. Somebody typed an address that is not on the roster and pressed
 * the second button on the roster miss screen.
 *
 * WHY IT IS A TABLE AND NOT A LOG LINE. The screen they are then shown says "A
 * mentor has been told. We have passed on <address>. Somebody will add you and email
 * you a link." That is a promise, and until this table existed the only thing behind
 * it was one `log.warn`, so the page answered 200 with the database down and with
 * nothing written anywhere at all. A promise whose only evidence is a log line is
 * kept when somebody happens to be reading the log.
 *
 * THIS IS THE ONE TABLE THAT HOLDS AN ADDRESS ON PURPOSE. Everywhere else an address
 * is the thing being kept out: `ge_event` takes a founder id and a slug and never a
 * name, because an audit line is a place a purge cannot reach. Here the address is
 * the entire content of the request. There is nothing else about this person that we
 * have, and without it nobody can be added.
 *
 * NO founder_id, AND THAT IS THE POINT. This person has no founder row. That is why
 * they are here. It is also why the table carries no row level security policy: a
 * policy filters on `app.founder_id` and there is no founder to filter on. The guard
 * is that nothing a founder can reach ever reads this table.
 *
 * NOTHING READS IT YET, said plainly rather than left to be discovered. The mentor
 * board is not built. Until it is, this table is how somebody finds out who is
 * waiting, with one query, at any point afterwards. That is the whole gain over the
 * log line it replaced: the rows are still there tomorrow.
 *
 * HANDLING. `handled_at` and `handled_by` are for when a mentor has actually added
 * the person, so the board can show what is still outstanding and a second press
 * does not read as a second person. Both stay null until that board exists.
 *
 * RETENTION. These rows are the shortest lived personal data in the database. They
 * exist so somebody can be added before the event and they have no use after it, so
 * the post event purge deletes them outright rather than anonymising them. An
 * anonymised sign in attempt is a row with no reason to exist.
 */
export const mentorRequests = pgTable(
  'mentor_requests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /**
     * citext, for the same reason `founder.email` is. Somebody who booked as
     * Sam.Taylor@Example.com and typed sam.taylor@example.com is one person, and a
     * mentor working down this list must not meet them twice.
     */
    email: citext('email').notNull(),
    /** Why they are here. Written by the route, in our words, never the founder's. */
    note: text('note').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    /** 'mentor:<id>'. The same actor shape as ge_event, and never a person's name. */
    handledBy: text('handled_by'),
  },
  // What a mentor asks this table is "who is still waiting, oldest first". A partial
  // index would be smaller. This list is a few dozen rows in its whole life, so the
  // plain one is the one that needs no explaining.
  (t) => [index('mentor_requests_handled_at_idx').on(t.handledAt, t.at)],
);

// ---------------------------------------------------------------------------
// Conversation. Section 4 "Sessions" and "Streaming".
// ---------------------------------------------------------------------------

export const threads = pgTable(
  'threads',
  {
    id: text('id').primaryKey(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    /** A row id from app/content/routes.ts, for example 'founder-brain'. */
    routeId: text('route_id').notNull(),
    title: text('title'),
    /**
     * The Agent SDK session id, for resume. Nullable because a thread exists before
     * its first run, and because a cold container may have to start fresh.
     */
    sdkSessionId: text('sdk_session_id'),
    /**
     * The thread digest. Section 4: the interview's real state is the file it is
     * writing, not the transcript. On a cold resume where sessionStore load()
     * returns null, a fresh run is seeded from this. sessionStore is marked @alpha
     * in the SDK, so correctness must not depend on it, and this column is what
     * that sentence means in practice.
     */
    digest: text('digest'),
    /**
     * Set when a compact_boundary is seen. The next turn is prefixed with the track,
     * the skill and which numbered step is in flight, because compaction summarises
     * and "you are on step 3 of 5" is exactly what a summary loses.
     */
    reanchor: boolean('reanchor').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastTurnAt: timestamp('last_turn_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('threads_founder_idx').on(t.founderId, t.createdAt)],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    text: text('text').notNull(),
    /**
     * Supplied by the browser. The unique index below is what makes a retry after a
     * dropped connection impossible to double send. Section 2 step 2.
     */
    clientMsgId: text('client_msg_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('messages_thread_client_msg_idx')
      .on(t.threadId, t.clientMsgId)
      .where(sql`${t.clientMsgId} is not null`),
    index('messages_thread_idx').on(t.threadId, t.createdAt),
  ],
);

/**
 * One row per unit of work. The in memory queue is backed by this table so a
 * restart re queues rather than losing work (section 4, Concurrency).
 *
 * status: queued | running | done | failed | refused | interrupted
 * priority: 'high' is the next turn of a thread that already has turns, meaning
 *   someone mid interview. 'normal' is the first turn of a new thread. High beats
 *   normal, because otherwise a stampede of new starts strands 30 people halfway
 *   through an interview, which is the worst possible failure during a live session.
 */
export const turns = pgTable(
  'turns',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    messageId: text('message_id'),
    status: text('status').notNull().default('queued'),
    priority: text('priority').notNull().default('normal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Machine readable. The founder facing sentence is built from this, never shown raw. */
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    /** Founder version before and after, so a turn can be tied to what it changed. */
    versionBefore: bigint('version_before', { mode: 'number' }),
    versionAfter: bigint('version_after', { mode: 'number' }),
  },
  (t) => [
    index('turns_founder_status_idx').on(t.founderId, t.status),
    index('turns_thread_idx').on(t.threadId, t.createdAt),
    index('turns_status_priority_idx').on(t.status, t.priority, t.createdAt),
  ],
);

/**
 * Every SSE frame, durable.
 *
 * The bigserial id is the SSE `id:` field. That is the whole point of the table: a
 * browser that dropped mid stream reconnects with Last-Event-ID and gets the rest
 * replayed from here, then live. Without it a dropped connection at second 40 of a
 * 90 second turn loses the answer.
 *
 * kind: status | delta | tool | file | queued | turn_end | error
 */
export const turnEvents = pgTable(
  'turn_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    turnId: text('turn_id').notNull(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** The frame body, exactly as it goes on the wire. Never raw tool JSON. */
    data: jsonb('data').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('turn_events_thread_id_idx').on(t.threadId, t.id)],
);

/**
 * The Agent SDK sessionStore, over Postgres. Section 4: upsert on uuid as an
 * idempotency key. Marked @alpha in the SDK type declarations, so this is the
 * primary answer for a cold resume and threads.digest is the one that must work.
 */
export const transcriptEntries = pgTable(
  'transcript_entries',
  {
    sessionId: text('session_id').notNull(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    uuid: text('uuid').notNull(),
    entry: jsonb('entry').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.uuid] }),
    index('transcript_entries_session_seq_idx').on(t.sessionId, t.seq),
  ],
);

// ---------------------------------------------------------------------------
// Money. Section 4, Cost control.
// ---------------------------------------------------------------------------

/**
 * One row per turn.
 *
 * THE RULE THAT MUST BE A CODE COMMENT, because getting it wrong double counts by
 * an order of magnitude: total_cost_usd on the SDK result message is CUMULATIVE
 * across turns in a streaming input session. Difference it against the run's
 * previous reading, and reset the baseline to zero whenever a run is spawned with
 * resume. costUsd below is the DIFFERENCE, not the reading. runReadingUsd stores
 * the raw reading so the arithmetic can be audited after the fact, which is what
 * assumption C4 tests.
 */
export const spend = pgTable(
  'spend',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    threadId: text('thread_id'),
    turnId: text('turn_id'),
    model: text('model'),
    /** The difference for this turn. Six decimal places: turns cost cents. */
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull(),
    /** The raw cumulative reading this difference was taken from. */
    runReadingUsd: numeric('run_reading_usd', { precision: 12, scale: 6 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /**
     * Assumption C2: after turn two of any thread this must be above zero. If it is
     * zero, something volatile is sitting in the cacheable prefix and the cost model
     * is wrong by roughly three times. That is why the column exists rather than
     * being folded into inputTokens.
     */
    cacheReadTokens: integer('cache_read_tokens'),
    cacheCreationTokens: integer('cache_creation_tokens'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('spend_founder_at_idx').on(t.founderId, t.at)],
);

// ---------------------------------------------------------------------------
// Setup. Section 6.
// ---------------------------------------------------------------------------

/**
 * Per step state: not_started | in_progress | done | skipped | failed.
 *
 * skipped and failed are different ON PURPOSE and the mentor board treats them
 * differently. "Not bought GoHighLevel yet" on 6 September is skipped and is fine.
 * "Private Integrations is not in my Settings menu" is failed and needs a human today.
 * Collapsing the two is how the founder who needs help becomes invisible.
 *
 * State is written on ENTERING a substep, not on leaving it, so a closed tab resumes
 * where they actually were rather than where they last succeeded.
 */
export const setupSteps = pgTable(
  'setup_steps',
  {
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    stepId: text('step_id').notNull(),
    state: text('state').notNull().default('not_started'),
    enteredAt: timestamp('entered_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Founder facing detail. Never a token, never a secret. */
    detail: text('detail'),
  },
  (t) => [primaryKey({ columns: [t.founderId, t.stepId] })],
);

/**
 * The receipt, one store and two surfaces.
 *
 * Keyed on (founder_id, check_name), which gives for free the exact rule
 * schemas/receipt.md describes: setting a check already present replaces that one
 * line and nothing else moves. The founder downloads the file, the mentor queries
 * the table, and neither is a copy of the other so they cannot disagree.
 *
 * evidence is the exact evidence string, not a category, because "GoHighLevel
 * failed" produces a diagnostic conversation and a named missing scope produces a
 * fix. The pit- guard from receipt.sh:110 runs over every value written here.
 */
export const setupChecks = pgTable(
  'setup_checks',
  {
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    checkName: text('check_name').notNull(),
    status: text('status').notNull(),
    evidence: text('evidence'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.founderId, t.checkName] })],
);

export const setupEvents = pgTable(
  'setup_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    stepId: text('step_id'),
    kind: text('kind').notNull(),
    detail: text('detail'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('setup_events_founder_at_idx').on(t.founderId, t.at)],
);

// ---------------------------------------------------------------------------
// Vendor credentials and vendor calls. Section 7.
// ---------------------------------------------------------------------------

/**
 * One row per founder per vendor. Holds the credential ciphertext and nothing that
 * could reconstruct it.
 *
 * THE COLUMN SHAPES ARE SETTLED HERE, THE VENDOR FIELD NAMES ARE NOT. locationId is
 * GoHighLevel's own identifier for the founder's location and is stored because the
 * layer 5 read back compares it. Everything else about the vendor request shape is
 * UNVERIFIED and lives in src/server/integrations/contracts/, not here.
 *
 * AAD on the ciphertext is `${founderId}:${vendor}:${keyVersion}`, so handing
 * founder B's ciphertext to a decrypt made under founder A's id fails GCM
 * authentication and throws. A mix up becomes a crash with a stack trace, not a
 * wrong send. That is the layer that holds when the others have a bug in them.
 *
 * purgedAt exists because founders agreed to us using a token for a programme, not
 * to us keeping it indefinitely. The post event purge nulls every ciphertext column
 * and stamps this.
 */
export const connections = pgTable(
  'connections',
  {
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    /** 'ghl' or 'apollo'. */
    vendor: text('vendor').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    ciphertext: bytea('ciphertext'),
    nonce: bytea('nonce'),
    /** The vendor's own id for this founder's account. Not a secret. */
    locationId: text('location_id'),
    /** connected | unverified | failed | purged */
    status: text('status').notNull().default('unverified'),
    /**
     * Assumption E7: record the prefix and the character length only, NEVER the
     * token. This is what answers "do real tokens start with pit-" without ever
     * putting one in a row somebody can select.
     */
    tokenPrefix: text('token_prefix'),
    tokenLength: integer('token_length'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.founderId, t.vendor] })],
);

/**
 * The audit receipt. One row per outbound call. No bodies, no headers, no tokens.
 *
 * Both founder ids are written and asserted equal at insert, and a nightly check
 * asserts zero rows where they differ. Writing only one id would make the check
 * impossible, which is the entire reason there are two columns for what should
 * always be the same value.
 */
export const vendorCalls = pgTable(
  'vendor_calls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionFounderId: text('session_founder_id').notNull(),
    credentialFounderId: text('credential_founder_id').notNull(),
    vendor: text('vendor').notNull(),
    operation: text('operation').notNull(),
    status: integer('status'),
    durationMs: integer('duration_ms'),
    /** The vendor's own request id, when they return one. Not ours. */
    requestId: text('request_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('vendor_calls_at_idx').on(t.at),
    index('vendor_calls_mismatch_idx').on(t.sessionFounderId, t.credentialFounderId),
  ],
);

/**
 * Propose and commit, the spine of section 7.
 *
 * propose builds a plan and stores it here: the batch row, the exact request bodies,
 * the preview table. It has no side effect, ever. commit is an authenticated browser
 * POST and is the only half that calls a vendor.
 *
 * The consequence is the point: there is no sequence of model outputs that posts,
 * enrolls, sends or spends a credit. The capability is not in the model's hands.
 *
 * state: proposed | committing | committed | failed | expired
 */
export const publishBatches = pgTable(
  'publish_batches',
  {
    id: text('id').primaryKey(),
    founderId: text('founder_id')
      .notNull()
      .references(() => founders.id, { onDelete: 'cascade' }),
    vendor: text('vendor').notNull(),
    operation: text('operation').notNull(),
    state: text('state').notNull().default('proposed'),
    /** The exact request bodies, as they will be sent. Shape is vendor specific and unverified. */
    payload: jsonb('payload').notNull(),
    /** What the founder is shown before they press the button. */
    preview: jsonb('preview'),
    itemCount: integer('item_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    /** The session id that committed. A browser session, never a model. */
    committedBySession: text('committed_by_session'),
    errorDetail: text('error_detail'),
  },
  (t) => [index('publish_batches_founder_idx').on(t.founderId, t.createdAt)],
);

/** Every table, for the migration runner and for tests that truncate. */
export const allTables = {
  founders,
  geFile,
  geFileVersion,
  geBlob,
  geEvent,
  sessions,
  signinTokens,
  mentorRequests,
  threads,
  messages,
  turns,
  turnEvents,
  transcriptEntries,
  spend,
  setupSteps,
  setupChecks,
  setupEvents,
  connections,
  vendorCalls,
  publishBatches,
} as const;

export type Founder = typeof founders.$inferSelect;
export type NewFounder = typeof founders.$inferInsert;
export type GeFileRow = typeof geFile.$inferSelect;
export type GeBlobRow = typeof geBlob.$inferSelect;
export type GeEventRow = typeof geEvent.$inferSelect;
export type MentorRequestRow = typeof mentorRequests.$inferSelect;
