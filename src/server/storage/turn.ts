/**
 * src/server/storage/turn.ts
 *
 * WHAT THIS IS
 *   The turn. Take the per founder gate, open on the record, rebuild the folder from
 *   Postgres if the epoch is stale, run the thing with no connection held, plan the
 *   harvest, put what the model wrote through the rules gate, commit. Every state
 *   change in the app goes through this function.
 *
 * WHY IT EXISTS
 *   THE RULE: anything written to the container filesystem that has not been
 *   harvested into Postgres is already lost. Everything in this file is one of two
 *   things: making that not happen, or refusing rather than pretending it did not.
 *
 *   The second half matters as much as the first. A write that cannot be proved must
 *   not be reported as done. An unexplained absence rolls the turn back and tells the
 *   founder to try again, with their data untouched, rather than deleting a row and
 *   showing a green tick.
 *
 * THE RULES GATE RUNS HERE, BETWEEN THE PLAN AND THE WRITE. rules/index.ts has
 * always said the gate sits between the model writing a file and storage saving it.
 * This is the seat it was talking about, and the order below is what makes the
 * sentence true: planHarvest reads the bytes, gateHarvest answers on them, and only
 * then does applyHarvest touch ge_file. A blocking violation throws, which rolls the
 * transaction back, so an artifact that failed a rule never reaches ge_file at all.
 * Nothing here can be reordered without the test beside this file failing.
 *
 * WHAT CALLS IT
 *   The agent runner around a model run, ge/verbs.ts around a single ge spawn, and
 *   the setup and gate routes. The work function receives a context and does its own
 *   thing inside the folder; this file owns everything around it.
 *
 * READS  founder, ge_file, ge_blob, and the folder on disk
 * WRITES ge_file, ge_file_version, ge_blob, ge_event, founder.version, founder.track
 *
 * WRITE THROUGH, NOT WRITE BEHIND. Founders type at human speed and the corpus is
 * small. A turn is durable the moment it returns, so there is no window where a
 * container death costs a founder the last thing they said.
 *
 * ONE WRITER PER FOUNDER COMES FROM HERE, NOT FROM ge. ge does not enforce one
 * writer at runtime; that is a design rule in schemas/writers.md checked by hand.
 * What ge enforces is snapshot before overwrite, build whole and move into place,
 * and refuse rather than guess. Concurrency is solved by the three locks below,
 * and ge never sees two writers because the app never gives it any.
 *
 * ------------------------------------------------------------------------------
 * THE TURN IS TWO TRANSACTIONS WITH THE MODEL RUN BETWEEN THEM, AND IT USED TO BE
 * ONE. This is the most important change in this file, so here is the whole story.
 *
 * The build document, section 2 steps 6 to 15, describes the turn as BEGIN, lock,
 * materialise, run, harvest, COMMIT. That reads well and it is wrong in one word:
 * "run". A ge spawn is seconds. A MODEL run is 30 to 180 seconds by the build
 * document's own figure, and longer when a founder is mid Founder Brain. Holding a
 * transaction across it means holding a pooled connection across it, and the pool
 * is PGPOOL_MAX connections wide, default 10.
 *
 * That was not a slow app. It was a permanently wedged one, and it was measured
 * against a real Postgres before this was written:
 *
 *     2 turns    2 of 2 finished
 *     9 turns    9 of 9 finished
 *    10 turns    0 of 10 finished in 25 seconds
 *    24 turns    0 of 24 finished in 25 seconds
 *    1 turn with PGPOOL_MAX=1    never finished
 *
 * The mechanism: inside the run, AgentRun.spawn asks Budget for the spend cap,
 * Budget asks the spend ledger, and the ledger queries THE POOL. So one turn needed
 * two connections. Ten turns each held one and each waited for the eleventh, which
 * only frees when a turn ends, which cannot happen. MAX_CONCURRENT_RUNS ships at 24,
 * so the app deadlocked well below its own configured concurrency. On the Monday
 * night, 65 founders on one track all working at once, that is the event.
 *
 * Raising PGPOOL_MAX moves the number and keeps the shape. The shape is the bug: a
 * scarce fixed resource held for a duration decided by something outside the app.
 * So the transaction no longer spans the run.
 *
 *   T1, milliseconds.  BEGIN, scope, advisory lock, read the founder, materialise,
 *                      invalidate the epoch, COMMIT.
 *   the run.           NO transaction, NO connection held. Minutes are fine here.
 *   T2, milliseconds.  BEGIN, scope, advisory lock, prove nothing moved, plan,
 *                      the rules gate, apply, bump, ge_event, COMMIT.
 *
 * T1 WRITES NOTHING TO THE RECORD. It is a read and a lock; materialise writes only
 * to disk. So "a refused turn leaves the record exactly as it was" is still exactly
 * true, and turn.db.test.ts still proves it.
 *
 * WHAT STILL GUARANTEES ONE WRITER PER FOUNDER, now that the lock cannot span the
 * run. Three things, and each covers what the others cannot:
 *
 *   1  THE LOCAL GATE, withFounderGate below. One turn per founder in this process,
 *      end to end. This is the one that protects the FOLDER, and it is the right
 *      place for it: /tmp/ge/<id> belongs to this process, the queue and the live
 *      session map are already in memory on one Reserved VM, and a second turn now
 *      waits on a promise instead of waiting on a lock while holding a connection.
 *      That second half is the other half of the old deadlock.
 *   2  THE ADVISORY LOCK, in T1 and again in T2. Still transaction scoped, still
 *      safe through a pooler, still "one writer per founder, across containers", now
 *      held for milliseconds at each end instead of for the length of a model run.
 *   3  THE VERSION CHECK IN T2. The plan is computed against the folder materialise
 *      built from founder.version as it was in T1. If that version moved while the
 *      model was running, some other writer committed and the plan describes a state
 *      the record no longer has. T2 refuses with turn_superseded and rolls back
 *      rather than overwriting. This is the belt that makes the split safe even if
 *      assumption B6 turns out to say more than one container runs.
 *
 * The one thing lost is that a second container's turn now discovers the conflict
 * after its run instead of waiting before it. It costs that turn its work and the
 * founder is told to send again, with their data untouched. That is the correct
 * trade against an app that stops.
 * ------------------------------------------------------------------------------
 */

import { utimes } from 'node:fs/promises';
import { and, eq, getTableName, sql } from 'drizzle-orm';
import {
  getDb,
  inFounderScope,
  setFounderScope,
  takeFounderLock,
  whileHoldingAConnection,
  type Db,
  type Queryable,
} from '../db/client.ts';
import { RLS_TABLES } from '../db/migrate.ts';
import { founders, geEvent, geFile } from '../db/schema.ts';
import { gateHarvest, type HarvestGateReport } from '../rules/harvest-gate.ts';
import type { Artifact, Track } from '../rules/index.ts';
import { getBlob } from './blobs.ts';
import { unwrapDataKey, type DataKey } from './crypto.ts';
import { applyHarvest, planHarvest, type HarvestPlan } from './harvest.ts';
import {
  invalidateEpoch,
  materialise,
  removeFounderFolder,
  writeEpoch,
  type MaterialisedSet,
} from './materialise.ts';
import { founderRoot, geHome, resolveInGeHome } from './paths.ts';
import { readFile } from 'node:fs/promises';

export class TurnRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TurnRefused';
    this.code = code;
  }
}

/** What the work function is handed. Everything it needs, nothing it does not. */
export interface TurnContext {
  founderId: string;
  /** /tmp/ge/<founderId>. cwd and HOME for a ge spawn. */
  root: string;
  /** /tmp/ge/<founderId>/growth-engine. GE_HOME for a ge spawn. */
  home: string;
  /** IANA zone. Goes into the child's TZ so ge stamps the founder's own day. */
  timezone: string;
  /** The version this turn will commit as, if it changes anything. */
  version: number;
  materialised: MaterialisedSet;
  /**
   * A READ HANDLE ON THE POOL. It used to be the turn's open transaction, and it is
   * not one any more, because the turn no longer holds a transaction while the work
   * runs. See the header for why.
   *
   * What that changes for a work function:
   *
   *   Reads still work, and each one borrows a connection for its own statement and
   *   gives it straight back. Nothing is held between statements.
   *
   *   Writes are refused, loudly. The harvest is the only writer of ge_file, ge_blob
   *   and ge_file_version, which this always said; and now that the work does not
   *   run inside the turn's transaction, a write through here would not roll back
   *   with a refused turn either. Refusing is the honest answer to both.
   *
   *   A read of a table under row level security is refused rather than answered
   *   with zero rows. There is no SET LOCAL app.founder_id on a pool handle, so the
   *   policy would fail closed and hand back an empty result that looks exactly like
   *   a founder's data being gone. Use `read` for those.
   */
  tx: Queryable;
  /**
   * Read the record founder scoped, in one short transaction that is opened and
   * closed around the callback.
   *
   * This is the way to read anything under row level security from inside the work:
   * ge_file, ge_file_version, ge_blob, connections, publish_batches. It holds a
   * connection only for as long as the callback runs, so a founder waiting on it
   * waits milliseconds and never waits on somebody else's model run.
   *
   * Anything written through it commits immediately and is NOT rolled back if the
   * turn is later refused. It is named `read` for that reason.
   */
  read: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
}

export interface TurnOutcome<T> {
  value: T;
  plan: HarvestPlan;
  versionBefore: number;
  versionAfter: number;
  /** True when the folder was rebuilt from Postgres rather than reused warm. */
  rebuilt: boolean;
  trackBefore: string | null;
  trackAfter: string | null;
  /**
   * What the rules gate read, what it did not read, and anything it wants said.
   *
   * Carried out of a turn that COMMITTED, so it holds warnings and never a
   * refusal: a blocking violation throws and this object is never built. The
   * warnings are here because the founder is meant to see them beside the work,
   * and a surface that has to ask a second time for them will not ask.
   */
  gate: HarvestGateReport;
}

export interface RunTurnOptions {
  founderId: string;
  /** 'founder', 'model', 'ge', 'system'. Written to ge_event. Never a person's name. */
  actor: string;
  /** What this turn was, for ge_event and for the version rows. 'remember', 'agent-run'. */
  verb: string;
  /** A path or a slug for ge_event.subject. NEVER a name or an address. */
  subject?: string | null;
  db?: Db;
  /**
   * Turns (track, model) into a route id. app/content/routes.ts owns that mapping and
   * nothing else computes it (build doc F3), so this file takes it as an argument and
   * leaves founder.route alone when it is not supplied.
   */
  deriveRoute?: (track: string | null, model: string | null) => string | null;
  /**
   * What the founder actually said this turn, for the rules gate.
   *
   * Rule 5 is "never invent proof", and it works by asking whether a number in
   * generated output appears anywhere the founder put it. Their own message is the
   * newest place a number can come from, and it is the one place that has not been
   * written to a file yet. Without it, a founder who says "we did 40 calls last
   * month" in the chat gets that sentence refused when the model writes it down.
   *
   * Optional, and its absence is not silent: the rule records that it had less to
   * check against rather than passing quietly.
   */
  founderSaid?: string;
}

/**
 * Read the Track and Model lines out of founder-brain.md.
 *
 * THIS IS THE ONE PLACE THE STORAGE LAYER PARSES A FOUNDER FILE, and it is named as
 * an exception in the build doc rather than smuggled in. Everywhere else this layer
 * hashes bytes and stores bytes, which is why the entirely PENDING vendor spike costs
 * storage nothing.
 *
 * founder.track is a CACHE. If this and the column disagree, the file wins and the
 * column is the bug. That is what keeps rule 1 anchored to the one place the founder
 * can see, and it is what makes a founder's hand edit take effect.
 *
 * The parsing rule is schemas/brain.md: everything above the first '## ' line is the
 * header, a label is the text before the first colon with the list dash and the stars
 * taken off, and the label is read without case. Below the first heading a line with
 * a colon in it is ordinary prose, so a founder writing "status: still thinking"
 * under ## Flags is writing a sentence, not setting a field.
 */
export function parseBrainHeader(text: string): { track: string | null; model: string | null } {
  let track: string | null = null;
  let model: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.startsWith('## ')) break;
    const colon = rawLine.indexOf(':');
    if (colon < 0) continue;
    const label = rawLine
      .slice(0, colon)
      .replace(/^\s*[-*]\s*/, '')
      .replace(/\*/g, '')
      .trim()
      .toLowerCase();
    const value = rawLine.slice(colon + 1).replace(/\*/g, '').trim().toLowerCase();
    if (label === 'track' && (value === 'b2b' || value === 'b2c')) track = value;
    if (label === 'model' && (value === 'service' || value === 'ecommerce')) model = value;
  }
  return { track, model };
}

/**
 * The Brain as it stands on disk, header parsed, text kept.
 *
 * The text is kept because the rules gate needs it whole: rule 5 grounds every
 * number in generated output against what the Brain says, so handing the gate only
 * the parsed header would leave it with nothing to check against and refuse every
 * post carrying a digit.
 */
async function readBrain(
  founderId: string,
): Promise<{ text: string; track: string | null; model: string | null } | null> {
  try {
    const text = await readFile(resolveInGeHome(founderId, 'founder-brain.md'), 'utf8');
    return { text, ...parseBrainHeader(text) };
  } catch {
    // No Brain yet is the normal first state. Nothing to refresh from, so the cache
    // is left exactly as it is rather than blanked.
    return null;
  }
}

/**
 * The stored text of one file, for rule 4.
 *
 * Read inside the turn's transaction and BEFORE applyHarvest runs, so `ge_file`
 * still names the version the founder had when this turn started. Called only for a
 * file that is changing, because a new file has no previous version and a decrypt
 * per unchanged file would be most of a second on the path a founder waits on.
 */
async function previousText(
  tx: Queryable,
  founderId: string,
  dataKey: DataKey,
  path: string,
): Promise<string | undefined> {
  const rows = await tx
    .select({ blobSha: geFile.blobSha })
    .from(geFile)
    .where(and(eq(geFile.founderId, founderId), eq(geFile.path, path)));
  const sha = rows[0]?.blobSha;
  if (sha === undefined) return undefined;
  return (await getBlob(tx, founderId, dataKey, sha)).toString('utf8');
}

/** The two values the fork is allowed to take. Anything else is no answer at all. */
function asTrack(value: string | null): Track | null {
  return value === 'b2b' || value === 'b2c' ? value : null;
}

/**
 * The founder's own message this turn, in the shape the rules read.
 *
 * `authored: 'founder'` is the load bearing part. It marks the text as theirs, so
 * the house style rules leave it alone and rule 5 treats the numbers in it as real.
 * The path is a label rather than a file, because this text is not a file: it is
 * what they typed, and it is never written to their folder by this function.
 */
function founderSaidAsGrounding(said: string | undefined): Artifact[] | undefined {
  if (said === undefined || said.trim() === '') return undefined;
  return [{ path: 'the message you sent', text: said, authored: 'founder' }];
}

/* -------------------------------------------------------------------------- */
/* One writer per founder, in this process                                     */
/* -------------------------------------------------------------------------- */

interface FounderGate {
  /** Resolves when the turn currently in front has finished. */
  tail: Promise<void>;
  /** How many turns are queued behind this gate, so an idle one can be dropped. */
  holders: number;
}

/**
 * One turn per founder at a time, in this process.
 *
 * WHY THIS AND NOT THE ADVISORY LOCK. The thing that actually needs protecting for
 * the length of a whole turn is the FOLDER at /tmp/ge/<id>, and the folder belongs
 * to this process, not to Postgres. The build document puts the queue and the live
 * session map in memory on one Reserved VM for the same reason. So the end to end
 * exclusion is a promise chain and costs nothing, and the database lock is kept for
 * the two moments a database write actually happens.
 *
 * It is also strictly better than what it replaces. A founder's second concurrent
 * turn used to wait on pg_advisory_xact_lock from INSIDE its own transaction, so it
 * waited while holding a pool connection. That is half of the deadlock this file
 * exists to remove. Here it waits holding nothing.
 *
 * The wait is unbounded on purpose: it is exactly as long as the turn in front, and
 * that is the same wait the advisory lock gave. The queue's per founder single
 * flight admission means it is rarely reached at all.
 */
const founderGates = new Map<string, FounderGate>();

async function withFounderGate<T>(founderId: string, fn: () => Promise<T>): Promise<T> {
  const gate: FounderGate = founderGates.get(founderId) ?? { tail: Promise.resolve(), holders: 0 };
  founderGates.set(founderId, gate);
  gate.holders += 1;

  const inFront = gate.tail;
  // Assigned synchronously inside the Promise constructor, so it is always set by
  // the time anything can call it. The `= () => undefined` is only there to prove
  // that to TypeScript without a non null assertion.
  let letTheNextOneIn: () => void = () => undefined;
  gate.tail = new Promise<void>((resolve) => {
    letTheNextOneIn = resolve;
  });

  // inFront can only ever resolve: the promise it came from is settled in a finally.
  await inFront;
  try {
    return await fn();
  } finally {
    letTheNextOneIn();
    gate.holders -= 1;
    // Do not leave 130 gates in a map for the life of the process.
    if (gate.holders === 0) founderGates.delete(founderId);
  }
}

/** Exported for the tests: how many founders currently have a turn queued. */
export function founderGateCount(): number {
  return founderGates.size;
}

/* -------------------------------------------------------------------------- */
/* The handle the work function is given                                       */
/* -------------------------------------------------------------------------- */

const RLS_TABLE_NAMES: ReadonlySet<string> = new Set(RLS_TABLES);

/**
 * The pool, wearing two refusals.
 *
 * Neither refusal is a style preference. A write through here would not be rolled
 * back by a refused turn, and a read of a table under row level security would come
 * back empty because no SET LOCAL named the founder. Both of those are silent, and
 * both look to a founder like their work having vanished. So both throw instead, and
 * the message says which one to reach for.
 *
 * The casts are here because Drizzle's `select` carries the shape of the columns
 * through its overloads and there is no way to wrap it that preserves that shape.
 * They are confined to this function, and everything they cast is checked at the
 * point it is used: `from` is the only method a select builder starts with, and the
 * table it is given is checked by name before the real builder ever sees it.
 */
function turnReadHandle(db: Db): Queryable {
  const refuseWrite = (verb: string): never => {
    throw new TurnRefused(
      'turn_context_write',
      `a turn's work called ctx.tx.${verb}(). The work does not run inside the turn's ` +
        'transaction any more, so a write here would not roll back with a refused turn, ' +
        'and the harvest is the only writer of ge_file, ge_blob and ge_file_version. ' +
        'Write to the founder\'s folder and let the harvest store it.',
    );
  };

  const guardedSelect = (...fields: unknown[]): unknown => {
    const builder = (db.select as (...a: unknown[]) => { from: (t: unknown) => unknown })(...fields);
    return {
      from: (table: unknown): unknown => {
        // A `from` that is not a plain table, a subquery for instance, has no name
        // to check. Nothing in this app does that, and letting it through rather
        // than refusing it keeps this guard about the mistake it was written for.
        let name = '';
        try {
          if (table !== null && typeof table === 'object') name = String(getTableName(table as never));
        } catch {
          name = '';
        }
        if (RLS_TABLE_NAMES.has(name)) {
          throw new TurnRefused(
            'turn_context_unscoped_read',
            `a turn's work read ${name} through ctx.tx. That table is under row level ` +
              'security and this handle names no founder, so the policy would fail closed ' +
              'and hand back zero rows, which reads exactly like the founder\'s data being ' +
              'gone. Use ctx.read(tx => ...) instead: it sets the founder scope.',
          );
        }
        return builder.from(table);
      },
    };
  };

  return {
    // Raw SQL. Passed through, because the app's own health and count queries use it
    // and there is no table name to check. Anything under row level security read
    // this way comes back empty, which is why every such read in this codebase goes
    // through a scoped transaction instead.
    //
    // Forwarded when it is called rather than bound when the handle is built. A test
    // handle that implements only `transaction` is a legitimate handle, and binding
    // eagerly turns it into a TypeError at the top of every turn.
    execute: ((...args: unknown[]): unknown =>
      (db.execute as (...a: unknown[]) => unknown)(...args)) as unknown as Queryable['execute'],
    select: guardedSelect as unknown as Queryable['select'],
    insert: ((): never => refuseWrite('insert')) as unknown as Queryable['insert'],
    update: ((): never => refuseWrite('update')) as unknown as Queryable['update'],
    delete: ((): never => refuseWrite('delete')) as unknown as Queryable['delete'],
  };
}

/**
 * Everything T1 found out, carried across the run to T2.
 *
 * The data key is in here rather than being re read, because unwrapping it is the
 * one expensive thing in T1 and because re reading it in T2 would mean a second
 * chance for the two halves of a turn to disagree about which key the founder has.
 */
interface OpenTurn {
  readonly versionBefore: number;
  readonly versionAfter: number;
  readonly dataKey: DataKey;
  readonly timezone: string;
  readonly trackBefore: string | null;
  readonly materialised: MaterialisedSet;
}

/**
 * T1. Take the lock, prove the founder may run, put the folder in the state the
 * record says it should be in, and let the connection go.
 *
 * IT WRITES NOTHING TO THE RECORD. Every statement here is a read; materialise
 * writes only to disk. That is what keeps "a refused turn leaves the record exactly
 * as it was" true after the split, because there is nothing in T1 that could have
 * committed something a later refusal would need to undo.
 */
async function openTurn(db: Db, founderId: string): Promise<OpenTurn> {
  const opened = await db.transaction(async (tx) =>
    whileHoldingAConnection("a turn's opening transaction", async () => {
      await setFounderScope(tx, founderId);
      await takeFounderLock(tx, founderId);

      const rows = await tx
        .select({
          version: founders.version,
          wrappedKey: founders.wrappedKey,
          timezone: founders.timezone,
          track: founders.track,
          disabledAt: founders.disabledAt,
          deletedAt: founders.deletedAt,
        })
        .from(founders)
        .where(eq(founders.id, founderId));
      const row = rows[0];
      if (!row) throw new TurnRefused('no_such_founder', `no founder ${founderId}`);
      if (row.deletedAt) throw new TurnRefused('founder_deleted', 'this account has been deleted');
      if (row.disabledAt) throw new TurnRefused('founder_disabled', 'this account is not active');

      const dataKey: DataKey = unwrapDataKey(founderId, row.wrappedKey);
      const versionBefore = Number(row.version);
      const materialised = await materialise(tx, { founderId, dataKey, version: versionBefore });

      return {
        versionBefore,
        versionAfter: versionBefore + 1,
        dataKey,
        timezone: row.timezone,
        trackBefore: row.track,
        materialised,
      } satisfies OpenTurn;
    }),
  );

  // From here until T2 commits the folder on disk is not to be trusted by anybody.
  // Outside the transaction because it is a filesystem write and T1 is a read: it
  // has to happen before the work runs, and nothing about it wants a connection.
  await invalidateEpoch(founderId);
  return opened;
}

/**
 * T2. Prove nothing moved, plan the harvest, run the rules gate, write, commit.
 *
 * THE ORDER INSIDE HERE IS THE ORDER IN THE BUILD DOCUMENT and every line of it is
 * load bearing:
 *
 *   1  BEGIN
 *   2  SET LOCAL app.founder_id      row level security has something to compare to
 *   3  pg_advisory_xact_lock         one writer per founder, across containers
 *   4  the version check             refuses a turn another writer has overtaken
 *   5  plan the harvest              hash everything, refuse an unexplained absence
 *   6  the rules gate                rules 1 to 5 over what the model wrote
 *   7  apply the harvest             the first line in this list that touches ge_file
 *   8  bump version, refresh track   only when something actually changed
 *   9  ge_event
 *  10  COMMIT
 *
 * STEP 6 SITS WHERE IT DOES ON PURPOSE. Before it, nothing has been written to
 * ge_file; after it, everything has. Move it one line down and an artifact with a
 * banned word in it is already stored when the gate speaks, and the gate becomes a
 * report on a thing that already happened.
 *
 * STEP 4 IS NEW AND IT IS WHAT PAYS FOR THE SPLIT. The plan below is computed
 * against a folder materialise built from `versionBefore`. If the founder's version
 * moved while the model was running, another writer committed and this plan is
 * describing a state the record no longer has. Committing it would silently
 * overwrite that writer's work. Refusing costs this turn and keeps both.
 */
async function commitTurn<T>(
  db: Db,
  options: RunTurnOptions,
  opened: OpenTurn,
  value: T,
): Promise<{ outcome: TurnOutcome<T>; mtimeResets: Array<{ path: string; mtime: Date }> }> {
  const { founderId, actor, verb } = options;
  const { dataKey, versionBefore, versionAfter, materialised } = opened;

  // Read AFTER the work, so a Brain written in this very turn is what the gate
  // grounds against. Reading it before would refuse the first post a founder ever
  // generates, on the grounds that the Brain it came from did not exist when we
  // looked. Read BEFORE the transaction opens, because it is a file read and the
  // point of this whole file is that nothing slow happens on a held connection.
  const brain = await readBrain(founderId);

  return db.transaction(async (tx) =>
    whileHoldingAConnection("a turn's committing transaction", async () => {
      await setFounderScope(tx, founderId);
      await takeFounderLock(tx, founderId);

      const rows = await tx
        .select({
          version: founders.version,
          track: founders.track,
          disabledAt: founders.disabledAt,
          deletedAt: founders.deletedAt,
        })
        .from(founders)
        .where(eq(founders.id, founderId));
      const row = rows[0];
      if (!row) throw new TurnRefused('no_such_founder', `no founder ${founderId}`);
      if (row.deletedAt) throw new TurnRefused('founder_deleted', 'this account has been deleted');
      if (row.disabledAt) throw new TurnRefused('founder_disabled', 'this account is not active');
      if (Number(row.version) !== versionBefore) {
        throw new TurnRefused(
          'turn_superseded',
          `this turn started at version ${versionBefore} and the record is now at ` +
            `${String(row.version)}. Something else wrote for this founder while the run ` +
            'was going. Nothing has been changed. Send it again.',
        );
      }

      const plan = await planHarvest(tx, { founderId, materialised, version: versionAfter });

      const gate = await gateHarvest({
        founderId,
        changes: plan.changes.map((c) => ({
          path: c.path,
          kind: c.kind,
          bytes: plan.bytesByPath.get(c.path),
        })),
        // The SESSION's track, not the track in the file being checked. Comparing
        // the file against itself is how rule 1's "these two disagree" check
        // silently stops firing.
        track: asTrack(row.track),
        brain: brain?.text ?? null,
        grounding: founderSaidAsGrounding(options.founderSaid),
        readPrevious: (path) => previousText(tx, founderId, dataKey, path),
      });

      // NOTHING ABOVE THIS LINE HAS TOUCHED ge_file. Nothing below it can be reached
      // by an artifact that failed a rule, because gateHarvest throws.
      await applyHarvest(tx, dataKey, plan, verb);

      const changed = plan.changes.length > 0;
      let trackAfter = row.track;

      if (changed) {
        const brainTouched = plan.changes.some((c) => c.path === 'founder-brain.md');
        const patch: Record<string, unknown> = { version: versionAfter };
        if (brainTouched && brain) {
          trackAfter = brain.track;
          patch['track'] = brain.track;
          if (options.deriveRoute) patch['route'] = options.deriveRoute(brain.track, brain.model);
        }
        // The version in the WHERE is the check from step 4 said a second time, as a
        // condition rather than as a read. Between the two, only this transaction's
        // advisory lock stands, and this is the belt for the day somebody removes it:
        // no row back means somebody else got there, and the throw rolls us back.
        const updated = await tx
          .update(founders)
          .set(patch)
          .where(and(eq(founders.id, founderId), eq(founders.version, versionBefore)))
          .returning({ version: founders.version });
        if (updated.length !== 1) {
          throw new TurnRefused(
            'turn_superseded',
            'another writer moved this founder on between the check and the write. ' +
              'Nothing has been changed. Send it again.',
          );
        }
      }

      await tx.insert(geEvent).values({
        founderId,
        actor,
        verb,
        subject: options.subject ?? null,
        versionBefore,
        versionAfter: changed ? versionAfter : versionBefore,
      });

      const outcome: TurnOutcome<T> = {
        value,
        plan,
        versionBefore,
        versionAfter: changed ? versionAfter : versionBefore,
        rebuilt: materialised.rebuilt,
        trackBefore: opened.trackBefore,
        trackAfter,
        gate,
      };
      return { outcome, mtimeResets: plan.mtimeResets };
    }),
  );
}

/**
 * Run one unit of work against a founder's folder, durably.
 *
 * THE SHAPE, and the header at the top of this file says why it is this shape:
 *
 *   the local gate     one turn per founder in this process, holding nothing
 *   T1                 lock, read, materialise, invalidate the epoch, COMMIT
 *   the work           a ge spawn, or a whole model run. NO CONNECTION HELD
 *   T2                 lock, check the version, plan, THE RULES GATE, write, COMMIT
 *   after the commit   put the modification times back, write the epoch
 *
 * A throw anywhere before T2 commits removes the folder and leaves the record
 * exactly as it was. Removing the folder is not tidiness: a folder left holding
 * unharvested writes with no epoch would be rebuilt anyway, and removing it means a
 * bug that leaves half a file behind cannot be read by the next turn.
 */
export async function runTurn<T>(
  options: RunTurnOptions,
  work: (ctx: TurnContext) => Promise<T>,
): Promise<TurnOutcome<T>> {
  const { founderId } = options;
  const db = options.db ?? getDb();

  return withFounderGate(founderId, async () => {
    // Declared without an initialiser on purpose. The catch below always rethrows,
    // so control never reaches the lines after the try without this having been
    // assigned, and TypeScript proves that. A `= null` here would have to be
    // narrowed away afterwards, which reads as though the post COMMIT steps can run
    // on a turn that did not commit. They cannot, and that is the point of this
    // whole function.
    let committed: {
      outcome: TurnOutcome<T>;
      mtimeResets: Array<{ path: string; mtime: Date }>;
    };

    try {
      const opened = await openTurn(db, founderId);

      const ctx: TurnContext = {
        founderId,
        root: founderRoot(founderId),
        home: geHome(founderId),
        timezone: opened.timezone,
        version: opened.versionAfter,
        materialised: opened.materialised,
        tx: turnReadHandle(db),
        read: (fn) => inFounderScope(db, founderId, fn),
      };

      // THE ONLY SLOW LINE IN THIS FUNCTION, AND THE ONE THING NO CONNECTION IS
      // HELD ACROSS. A model run is 30 to 180 seconds. Holding a pooled connection
      // here is what deadlocked the app at ten concurrent turns.
      const value = await work(ctx);

      committed = await commitTurn(db, options, opened, value);
    } catch (err) {
      // Either no transaction ever committed anything, or the committing one rolled
      // back. Either way the record is the state before the turn. The folder is the
      // only thing left that could hold a partial write.
      await removeFounderFolder(founderId).catch(() => undefined);
      throw err;
    }

    // Everything below runs after COMMIT. A failure here costs a rebuild on the next
    // turn and nothing else, so it is logged by the caller rather than rolled back:
    // the founder's work is already durable and taking it away would be the bug.
    await restoreUnchangedMtimes(founderId, committed.mtimeResets);
    await writeEpoch(founderId, committed.outcome.versionAfter);
    return committed.outcome;
  });
}

/**
 * Put back the modification time of a file whose bytes did not change.
 *
 * ge index rewrites .state/index.md on every run and ge writes several files whole
 * even when the words come out the same, so a warm folder drifts in mtime from a
 * rebuilt one. That drift is visible: ge index prints a modified column, so the
 * founder would see files marked as changed today that nobody changed, and the next
 * turn would harvest index.md as a real change. Resetting the times keeps the
 * invariant exact: the folder matches what the database holds, stat included.
 */
async function restoreUnchangedMtimes(
  founderId: string,
  resets: ReadonlyArray<{ path: string; mtime: Date }>,
): Promise<void> {
  for (const reset of resets) {
    try {
      await utimes(resolveInGeHome(founderId, reset.path), reset.mtime, reset.mtime);
    } catch {
      // Not worth failing a committed turn over. The next rebuild fixes it.
    }
  }
}

/**
 * Refresh founder.track from the file, without running a turn.
 *
 * Called at run start, because the build doc says the column is refreshed on every
 * harvest that touches the Brain AND on every run start. It only reads and only
 * writes the cache columns, so it needs no lock and no harvest.
 */
export async function refreshTrackCache(
  founderId: string,
  options?: { db?: Db; deriveRoute?: (track: string | null, model: string | null) => string | null },
): Promise<{ track: string | null; model: string | null } | null> {
  const brain = await readBrain(founderId);
  if (!brain) return null;
  const db = options?.db ?? getDb();
  const patch: Record<string, unknown> = { track: brain.track };
  if (options?.deriveRoute) patch['route'] = options.deriveRoute(brain.track, brain.model);
  await db.transaction(async (tx) =>
    // Two statements and nothing else. Marked all the same, so that a pool read
    // added in here later refuses instead of waiting for a connection it is
    // holding. See the rule at the top of db/client.ts.
    whileHoldingAConnection('the track cache refresh', async () => {
      await setFounderScope(tx, founderId);
      await tx.update(founders).set(patch).where(eq(founders.id, founderId));
    }),
  );
  return brain;
}

/** Bump nothing, just read the founder's current version. Used by the files view. */
export async function currentVersion(founderId: string, db?: Db): Promise<number> {
  const handle = db ?? getDb();
  const rows = await handle
    .select({ version: founders.version })
    .from(founders)
    .where(eq(founders.id, founderId));
  const row = rows[0];
  if (!row) throw new TurnRefused('no_such_founder', `no founder ${founderId}`);
  return Number(row.version);
}

/** Exported for the ops surface: how many rows this founder has, without decrypting. */
export async function fileCount(founderId: string, db?: Db): Promise<number> {
  const handle = db ?? getDb();
  const rows = await handle.execute(
    sql`select count(*)::text as n from ge_file where founder_id = ${founderId}`,
  );
  return Number((rows as unknown as Array<{ n: string }>)[0]?.n ?? 0);
}
