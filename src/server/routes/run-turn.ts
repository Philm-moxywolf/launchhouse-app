/**
 * src/server/routes/run-turn.ts
 *
 * WHAT THIS IS. The turn, joined up. It is the function `src/server/index.ts`
 * hands to the queue executor in place of `notWiredRun`, and it is the only
 * place in this app where a founder's message, the model, the founder's folder,
 * the rules gate and Postgres are all in the same call stack.
 *
 * WHY IT EXISTS. Because until it did, nothing worked. Every part below this had
 * been built and tested: `storage/turn.ts` materialises, harvests, gates and
 * commits; `agent/runner.ts` runs the model; `agent/session-pool.ts` holds the
 * subprocess between turns; `routes/events.ts` makes every frame durable before
 * it reaches a socket. `storage/turn.ts` and `agent/runner.ts` had ZERO non test
 * importers, which is the measurable version of the same sentence: a founder
 * could sign in, be walked through setup, start a Founder Brain, get a 202, and
 * watch the turn end at `failed` with "That one did not finish." This file is
 * the wire.
 *
 * THE ORDER IS THE BUILD DOCUMENT'S ORDER, section 2, steps 6 to 15, and each
 * step is somewhere below:
 *
 *   BEGIN, founder scope, advisory lock, materialise   storage/turn.ts
 *   the session pool decides spawn or no spawn         this file, step h
 *   the model runs and every frame becomes a row       this file, `emit`
 *   harvest, THE RULES GATE, commit                    storage/turn.ts
 *   session id, digest, the assistant message          this file, after commit
 *
 * WHAT CALLS IT. src/server/index.ts builds it once and passes it to
 * QueueTurnExecutor. Nothing else.
 *
 * WHAT IT READS. `threads`, `founder`, `messages`, and the founder's
 * materialised folder. WHAT IT WRITES. `threads.sdk_session_id`,
 * `threads.digest`, `threads.last_turn_at`, one `messages` row for the answer,
 * and `turn_events` rows through TurnEvents. Everything under
 * `growth-engine/` is written by storage/turn.ts and by nothing here.
 *
 * TWO RULES ABOUT CONNECTIONS, AND BOTH ARE LOAD BEARING.
 *
 *   NOTHING INSIDE THE TRANSACTION AWAITS A SECOND CONNECTION. The whole model
 *   run happens inside the turn's transaction, which is holding a pooled
 *   connection and the founder's advisory lock. PGPOOL_MAX defaults to 10 and
 *   MAX_CONCURRENT_RUNS to 24, so ten turns can hold every connection at once.
 *   A turn that waits inside itself for an eleventh connection waits for a
 *   connection that only frees when a turn ends, and that is a deadlock with 65
 *   people in a room. So `emit` below does not await its own write, and the
 *   transcript mirror buffers in memory. Both are drained after COMMIT, when the
 *   connection is back.
 *
 *   FRAMES STAY IN ORDER ANYWAY. `emit` chains its writes rather than firing
 *   them in parallel, because the `turn_events` id is the SSE `id:` field and a
 *   browser reconnecting with Last-Event-ID replays from it. Frames written out
 *   of order would replay out of order, which is a founder reading their own
 *   answer shuffled.
 */

import { and, eq } from 'drizzle-orm';

import { routeFor } from '../../../app/content/routes.ts';
import { buildTurnPrefix, resumeSeed } from '../agent/assemble.ts';
import type { SessionPool } from '../agent/session-pool.ts';
import type {
  BusinessModel,
  CohortRoute,
  FounderContext,
  RouteRow,
  Track,
  TurnEvent,
  TurnOutcome,
} from '../agent/types.ts';
import { getDb, setFounderScope, type Db, type Queryable } from '../db/client.ts';
import { founders, messages, threads } from '../db/schema.ts';
import { RulesRefused } from '../rules/harvest-gate.ts';
import type { Violation } from '../rules/types.ts';
import { init as geInit } from '../ge/verbs.ts';
import { needsInit } from '../storage/materialise.ts';
import { geHome } from '../storage/paths.ts';
import { runTurn as storageRunTurn, TurnRefused } from '../storage/turn.ts';
import { skillKeyFor, type ContentRouteCatalogue } from './agent-content.ts';
import type { TurnEvents } from './events.ts';
import type { FolderFactsSource } from './facts-source.ts';
import type { AppStore, IdSource, Logger, TurnJob } from './ports.ts';
import type { PgTranscriptStore } from './transcripts-pg.ts';
import type { RunTurn } from './turn-executor.ts';
import type { SkillBodies } from '../agent/ports.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Why the last turn on this thread was refused, or null.
 *
 * Read before the run so it can go in front of the model, and cleared only once THIS
 * turn commits. A founder who is refused and then closes the tab must still be told
 * on their next visit, whenever that is.
 */
async function readLastRefusal(db: Db, job: TurnJob): Promise<string | null> {
  const rows = await db
    .select({ lastRefusal: threads.lastRefusal })
    .from(threads)
    .where(and(eq(threads.id, job.threadId), eq(threads.founderId, job.founderId)))
    .limit(1);
  return rows[0]?.lastRefusal ?? null;
}

/** How many of the founder's own messages the cold resume digest carries. */
const DIGEST_MESSAGES = 3;

/** How much of one of those messages. Enough to recognise, not a second copy of the thread. */
const DIGEST_MESSAGE_CHARS = 400;

/** How many messages to read back to find those three. A turn is one founder message. */
const DIGEST_LOOKBACK = 20;

export interface RunTurnDeps {
  readonly store: AppStore;
  readonly events: TurnEvents;
  readonly pool: SessionPool;
  readonly catalogue: ContentRouteCatalogue;
  readonly bodies: SkillBodies;
  readonly facts: FolderFactsSource;
  readonly transcripts: PgTranscriptStore;
  readonly ids: IdSource;
  readonly log: Logger;
  readonly db?: Db;
}

/**
 * What one turn found out about the founder while the folder was materialised.
 *
 * Carried out of the transaction so the work after COMMIT does not have to open
 * the folder again to find out what happened in it.
 */
interface RunSummary {
  readonly outcome: TurnOutcome;
  readonly track: Track | null;
  readonly routeLabel: string;
}

export function createRunTurn(deps: RunTurnDeps): RunTurn {
  return async (job: TurnJob, signal: AbortSignal): Promise<void> => {
    const db = deps.db ?? getDb();

    // Founder scoped, and the founder id came from the session cookie by way of
    // the turns table. There is no path here that reads a thread by id alone.
    const thread = await readThread(db, job.founderId, job.threadId);
    if (thread === null) {
      throw new TurnRefused('no_such_thread', `thread ${job.threadId} does not belong to this founder`);
    }

    const route = deps.catalogue.byId(thread.routeId);
    if (route === null) {
      // A row id in a thread that the routing table no longer has. Loud, because
      // it means a deploy removed a route out from under a live conversation.
      throw new TurnRefused(
        'no_such_route',
        `thread ${job.threadId} is on route ${thread.routeId}, which app/content/routes.ts does not have`,
      );
    }

    // Every frame the run produces, in order, written durably and published.
    // See the header: NOT awaited inside the transaction.
    let frames: Promise<void> = Promise.resolve();
    const emit = (event: TurnEvent): void => {
      const translated = toFrame(job.turnId, event);
      if (translated === null) return;
      frames = frames
        .then(async () => {
          await deps.events.emit({
            founderId: job.founderId,
            threadId: job.threadId,
            turnId: job.turnId,
            kind: translated.kind,
            data: translated.data,
          });
        })
        .catch((err: unknown) => {
          // A frame that cannot be written is a frame the founder does not read.
          // It is not worth failing a turn whose work is about to be committed,
          // and the chain is reset so the frames after it still try.
          deps.log.error(
            { turnId: job.turnId, kind: translated.kind, err: String(err) },
            'a turn frame could not be written, so the founder did not see it',
          );
        });
    };

    // The stop button. The executor aborts this signal, and the only thing that
    // can actually stop a model mid sentence is the SDK's own interrupt.
    const onAbort = (): void => {
      void deps.pool.interrupt(job.threadId).catch((err: unknown) => {
        deps.log.warn({ turnId: job.turnId, err: String(err) }, 'interrupt did not reach the run');
      });
    };
    signal.addEventListener('abort', onAbort, { once: true });

    let summary: RunSummary;
    try {
      const committed = await storageRunTurn(
        {
          founderId: job.founderId,
          // Never a person's name. 'model' is who wrote in the folder this turn.
          actor: 'model',
          verb: 'agent-run',
          subject: route.id,
          deriveRoute,
          // Rule 5 grounds a number in generated output against somewhere the
          // founder put it, and what they typed this turn is the newest such
          // place and the only one not yet in a file.
          founderSaid: job.text,
          ...(deps.db === undefined ? {} : { db: deps.db }),
        },
        async (turn): Promise<RunSummary> => {
          // BUILD THE FOLDER BEFORE THE MODEL TOUCHES IT, and only when it has not
          // been built. `materialise` writes the founder's stored files and nothing
          // else, so on a first turn it leaves a bare empty directory: no `.state`,
          // no `memory.md`, nothing `ge` recognises as a folder of its own.
          //
          // THAT COST EVERY FOUNDER THEIR FIRST TURN'S MEMORIES. `ge remember` was
          // refused five times inside one answer while the Brain itself wrote fine,
          // because the Brain goes through a different path. The model, asked to
          // explain refusals whose cause it could not see, invented one and told the
          // founder to run a shell command. They have no shell. That is the whole
          // premise of this app.
          //
          // `ge init` is idempotent, so the test is a cheap guard rather than a
          // correctness requirement: it keeps a spawn off every later turn.
          if (await needsInit(job.founderId)) {
            await geInit({ founderId: job.founderId, timezone: turn.timezone });
            deps.log.info({ founderId: job.founderId }, 'the founder folder was built by ge init on its first turn');
          }

          // The folder now matches the record, so this is the first moment the
          // Brain on disk can be trusted. Read here, not before.
          const track = await deps.facts.trackOf(job.founderId);
          const header = await readBrainLabels(job.founderId);
          const founder = await readFounderRow(turn.tx, job.founderId);

          assertTrackMayRun(route, track);

          const ctx: FounderContext = {
            founderId: job.founderId,
            displayName: header.get('founder') ?? founder.displayName ?? 'there',
            // Never invented. A founder who has not named their business in the
            // Brain yet is described as not having named it, which is what the
            // model should know rather than a placeholder it might write down.
            businessName: header.get('business') ?? 'not named yet',
            // THE ONE DEFAULT IN THIS FILE, AND IT IS NARROW ON PURPOSE.
            // `FounderContext.track` cannot say "not chosen yet" and is not this
            // file's type to change. It reaches exactly two places: the ge person
            // tool fork in agent/mcp/ge-tools.ts, and the re anchor line
            // agent/assemble.ts writes after a compaction. It does NOT reach the
            // skill body or the run header: both of those are built from
            // `RunFacts.track`, which does carry null, so an unforked founder is
            // handed both branches of the intake and a header that says the
            // question is open. The remaining gap is written up in the report
            // that landed this file: the fix is `track: Track | null` on
            // FounderContext, and it is one line in three files.
            track: track ?? asTrack(founder.track) ?? 'b2b',
            model: asModel(header.get('model')) ?? 'service',
            cohortRoute: cohortRouteOf(track ?? asTrack(founder.track), asModel(header.get('model'))),
            timezone: turn.timezone,
            // cwd for the subprocess is the founder root, not growth-engine/,
            // because every skill body already says the files live in
            // growth-engine/ and a cwd one level in would make that sentence false.
            workdir: turn.root,
          };

          // A founder who has not forked gets the body with both branches in it.
          // See agent-content.ts: this is the only reason the twin exists.
          const runRoute: RouteRow = { ...route, skill: skillKeyFor(route, track, deps.bodies) };

          const acquired = await deps.pool.acquire(job.threadId, ctx, runRoute, {
            ...(thread.sdkSessionId === null ? {} : { resumeSessionId: thread.sdkSessionId }),
            ...(thread.sdkSessionId === null && thread.digest !== null
              ? { seed: resumeSeed(runRoute, thread.digest) }
              : {}),
          });

          // The folder as it stands, in front of every turn, plus the refusal that
          // undid the last one when there was one. Read before the run, cleared
          // after it commits, so a founder who never comes back does not lose it.
          const undone = await readLastRefusal(db, job);
          const outcome = await acquired.run.send(job.turnId, job.text, emit, {
            ...acquired.startOptions,
            turnPrefix: buildTurnPrefix(await deps.facts.factsFor(ctx, route.id), undone),
          });
          return { outcome, track, routeLabel: route.label };
        },
      );

      summary = committed.value;

      // Warnings from the rules gate. The turn committed, so these are things the
      // founder should see beside the work rather than reasons it was refused.
      for (const text of noteLines(committed.gate.notes)) {
        emit({ kind: 'status', text });
      }

      deps.log.info(
        {
          founderId: job.founderId,
          turnId: job.turnId,
          routeId: route.id,
          track: summary.track ?? 'not chosen yet',
          status: summary.outcome.status,
          filesChanged: committed.plan.changes.length,
          versionAfter: committed.versionAfter,
          gateChecked: committed.gate.checked.length,
          costUsd: summary.outcome.costUsd,
          cacheReadTokens: summary.outcome.cacheReadTokens,
        },
        'turn committed',
      );
    } catch (err: unknown) {
      signal.removeEventListener('abort', onAbort);
      // Say the true thing before the executor says the generic one.
      //
      // QueueTurnExecutor catches whatever is thrown here, marks the turn failed
      // and writes "That one did not finish. Send it again." For a rules refusal
      // that advice is wrong: sending it again produces the same refusal, and the
      // founder needs to know what was refused and what to do about it. So the
      // real sentence goes out first, as a status frame rather than a second
      // error, and then the throw carries on.
      const explained = explain(err);
      if (explained !== null) {
        // ON SCREEN NOW, so the founder is not left watching a spinner stop.
        emit({ kind: 'status', text: explained });
        // AND IN THE THREAD, WHICH IS THE PART THAT WAS MISSING. A status frame is
        // the same channel as "reading your files": transient, overwritten by the
        // next one, and gone when the turn fails and the screen redraws. A founder
        // hit a rules refusal, saw nothing that stayed, and reasonably concluded the
        // engine had worked. The next turn then told them the files were written,
        // because the model had not been told either.
        //
        // ITS OWN TRANSACTION, ON PURPOSE. The turn's transaction is rolling back,
        // which is correct for the files. The explanation of why is not part of what
        // is being undone, and losing it is the thing that made this invisible.
        await settle('the refusal message', deps.log, job, async () => {
          await db.transaction(async (tx) => {
            await setFounderScope(tx, job.founderId);
            await tx.insert(messages).values({
              id: deps.ids.message(),
              threadId: job.threadId,
              founderId: job.founderId,
              role: 'assistant',
              text: explained,
              clientMsgId: null,
            });
            // AND REMEMBERED FOR THE NEXT TURN. The session survives this, and its
            // own history shows the rolled back writes succeeding. The next turn
            // puts this sentence in front of the model so there is nothing left to
            // reconcile between what it remembers and what is on disk.
            await tx
              .update(threads)
              .set({ lastRefusal: explained })
              .where(and(eq(threads.id, job.threadId), eq(threads.founderId, job.founderId)));
          });
        });
      }
      await frames;
      throw err;
    }

    signal.removeEventListener('abort', onAbort);

    // ------------------------------------------------------ after the commit
    // Everything below is best effort. The founder's work is already durable, so
    // nothing here is allowed to turn a committed turn into a failed one.
    await settle('the answer, the session id and the digest', deps.log, job, async () => {
      await recordAfterTurn(db, deps, job, summary);
    });
    await settle('the transcript mirror', deps.log, job, async () => {
      const sessionId = summary.outcome.sdkSessionId;
      const written = await (sessionId === null ? deps.transcripts.flush() : deps.transcripts.flush(sessionId));
      if (written > 0) deps.log.info({ turnId: job.turnId, written }, 'transcript entries mirrored');
    });

    // Last, so a frame written during the turn is durable before the executor
    // writes turn_end after this resolves.
    await frames;
  };
}

/* -------------------------------------------------------------------------- */
/* After the commit                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The answer, the session id, the digest and the clock, in one transaction.
 *
 * THE ANSWER IS A `messages` ROW AND IT HAS TO BE. The thread screen renders
 * `messages`, not `turn_events`. Without this row a founder who reloads the page
 * sees their own question and nothing under it, having just watched an answer
 * stream in. The turn_events rows are for replaying a dropped stream; this is for
 * remembering.
 */
async function recordAfterTurn(
  db: Db,
  deps: RunTurnDeps,
  job: TurnJob,
  summary: RunSummary,
): Promise<void> {
  const digest = await buildDigest(deps, job, summary);
  const answer = summary.outcome.text.trim();

  await db.transaction(async (tx) => {
    await setFounderScope(tx, job.founderId);

    if (answer.length > 0) {
      await tx.insert(messages).values({
        id: deps.ids.message(),
        threadId: job.threadId,
        founderId: job.founderId,
        role: 'assistant',
        text: answer,
        clientMsgId: null,
      });
    }

    await tx
      .update(threads)
      .set({
        // Null would mean "start fresh next time", so it is only written when
        // the SDK actually gave us one.
        ...(summary.outcome.sdkSessionId === null ? {} : { sdkSessionId: summary.outcome.sdkSessionId }),
        digest: JSON.stringify(digest),
        lastTurnAt: new Date(),
        // CLEARED HERE AND NOWHERE ELSE, because this line only runs after a turn
        // has committed. Clearing it when the next turn STARTS would lose it for a
        // founder who was refused, closed the tab and came back on Tuesday: the
        // model would be told nothing and would carry on believing its own history.
        lastRefusal: null,
      })
      .where(and(eq(threads.id, job.threadId), eq(threads.founderId, job.founderId)));
  });
}

/**
 * What a cold resume is seeded with, and every word of it is a fact.
 *
 * The build document describes a one paragraph running summary written on the
 * utility model. THAT HALF IS NOT BUILT AND IS NOT FAKED. What is here is the
 * part that needs no model and carries the actual state: which files exist, and
 * the last few things the founder said in their own words. Section 4 is explicit
 * that the interview's real state is the file it is writing, not the transcript,
 * and this is that sentence made true cheaply.
 *
 * Rule 5 applies to this text as much as to anything else the model reads: there
 * is no number in here that did not come from the record.
 */
async function buildDigest(
  deps: RunTurnDeps,
  job: TurnJob,
  summary: RunSummary,
): Promise<{ summary: string; lastMessages: string[] }> {
  const files = await deps.store.listFiles(job.founderId);
  const names = files.map((f) => f.path).sort();
  const said = await deps.store.listMessages(job.founderId, job.threadId, DIGEST_LOOKBACK);

  const lines: string[] = [];
  lines.push(
    names.length === 0
      ? 'They have not finished a file yet.'
      : `Files they have so far: ${names.join(', ')}.`,
  );
  lines.push(
    summary.track === null
      ? 'They have not chosen a track yet.'
      : `Their Brain records the ${summary.track} track.`,
  );

  const lastMessages = said
    .filter((m) => m.role === 'founder')
    .slice(-DIGEST_MESSAGES)
    .map((m) =>
      m.text.length > DIGEST_MESSAGE_CHARS ? `${m.text.slice(0, DIGEST_MESSAGE_CHARS)}...` : m.text,
    );

  return { summary: lines.join(' '), lastMessages };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

interface ThreadForRun {
  readonly routeId: string;
  readonly sdkSessionId: string | null;
  readonly digest: { summary: string; lastMessages: string[] } | null;
}

async function readThread(db: Db, founderId: string, threadId: string): Promise<ThreadForRun | null> {
  const rows = await db
    .select({ routeId: threads.routeId, sdkSessionId: threads.sdkSessionId, digest: threads.digest })
    .from(threads)
    // Both halves, every time. The thread id came off the wire and the founder id
    // came off the session cookie, and only the pair is safe to read on.
    .where(and(eq(threads.id, threadId), eq(threads.founderId, founderId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { routeId: row.routeId, sdkSessionId: row.sdkSessionId, digest: parseDigest(row.digest) };
}

/** A digest we cannot read is a digest we do not use. It is a cache, not a record. */
function parseDigest(raw: string | null): { summary: string; lastMessages: string[] } | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as { summary?: unknown; lastMessages?: unknown };
    if (typeof record.summary !== 'string') return null;
    const messagesIn = Array.isArray(record.lastMessages) ? record.lastMessages : [];
    return { summary: record.summary, lastMessages: messagesIn.filter((m): m is string => typeof m === 'string') };
  } catch {
    return null;
  }
}

async function readFounderRow(
  tx: Queryable,
  founderId: string,
): Promise<{ displayName: string | null; track: string | null }> {
  const rows = await tx
    .select({ displayName: founders.displayName, track: founders.track })
    .from(founders)
    .where(eq(founders.id, founderId));
  const row = rows[0];
  // storage/turn.ts has already refused a founder that is not there, so this is
  // unreachable rather than a case to handle.
  if (row === undefined) throw new TurnRefused('no_such_founder', `no founder ${founderId}`);
  return row;
}

/**
 * The labelled lines at the top of founder-brain.md, as a map.
 *
 * The parsing rule is schemas/brain.md and it is the same one
 * `storage/turn.ts parseBrainHeader` uses: everything above the first '## ' line
 * is the header, the label is the text before the first colon with the list dash
 * and the stars taken off, and the label is read without case.
 *
 * IT DELIBERATELY DOES NOT RE READ `Track`. That field decides the fork, so it has
 * exactly one reader in this app, `FolderFactsSource.trackOf`, and this function
 * is used for the two display fields the run header prints and nothing else. Two
 * readers of Track is how the two disagree.
 */
export async function readBrainLabels(founderId: string): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  let text: string;
  try {
    text = await readFile(join(geHome(founderId), 'founder-brain.md'), 'utf8');
  } catch {
    // No Brain yet is the normal first state, not a failure.
    return labels;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.startsWith('## ')) break;
    const colon = rawLine.indexOf(':');
    if (colon < 0) continue;
    const label = rawLine.slice(0, colon).replace(/^\s*[-*]\s*/, '').replace(/\*/g, '').trim().toLowerCase();
    const value = rawLine.slice(colon + 1).replace(/\*/g, '').trim();
    if (label.length > 0 && value.length > 0 && !labels.has(label)) labels.set(label, value);
  }
  return labels;
}

/* -------------------------------------------------------------------------- */
/* Small decisions, each in one place                                          */
/* -------------------------------------------------------------------------- */

/**
 * Rule 1, at the last possible moment.
 *
 * The route table already filters the sidebar and `threads.ts mayStart` already
 * refuses at the API. This is the third check and it is the one that runs after
 * the Brain has been read off disk, so it is the only one that sees a founder who
 * hand edited their track between opening the thread and sending the message.
 */
function assertTrackMayRun(route: RouteRow, track: Track | null): void {
  if (track === null) {
    if (route.tracks.length === 2) return;
    throw new TurnRefused(
      'wrong_track',
      `${route.label} belongs to one track and this founder has not chosen one yet`,
    );
  }
  if (!route.tracks.includes(track)) {
    throw new TurnRefused('wrong_track', `${route.label} does not belong to the ${track} track`);
  }
}

/** The two values the fork may take. Anything else is no answer at all. */
function asTrack(value: string | null | undefined): Track | null {
  return value === 'b2b' || value === 'b2c' ? value : null;
}

/** The two values schemas/brain.md allows for Model. */
function asModel(value: string | null | undefined): BusinessModel | null {
  const lower = value?.trim().toLowerCase();
  return lower === 'service' || lower === 'ecommerce' ? lower : null;
}

/**
 * Track and model to a cohort route.
 *
 * `routeFor` in app/content/routes.ts owns this mapping and nothing else computes
 * it, which is build document F3. A founder with no track yet has no cohort route
 * either, and 'b2b' is the value the header prints until they answer. It is
 * display only: nothing forks on it.
 */
function cohortRouteOf(track: Track | null, model: BusinessModel | null): CohortRoute {
  if (track === null) return 'b2b';
  return (routeFor(track, model) ?? 'b2b') as CohortRoute;
}

/** The shape storage/turn.ts asks for, over the content repo's own function. */
function deriveRoute(track: string | null, model: string | null): string | null {
  const t = asTrack(track);
  if (t === null) return null;
  return routeFor(t, asModel(model));
}

/**
 * The frame the browser actually parses.
 *
 * src/web/lib/stream.ts reads `text` for status, delta, tool and error, and reads
 * `name` for a file. The runner speaks of a `path`, because that is what it is.
 * Translating here rather than renaming either side keeps the runner's vocabulary
 * honest and the browser's parser unchanged.
 *
 * `turn_end` is dropped on purpose. QueueTurnExecutor writes the authoritative one
 * AFTER this function's caller has committed, and a second one written from inside
 * the turn would tell the browser the turn was over while the files were still
 * uncommitted.
 */
function toFrame(
  turnId: string,
  event: TurnEvent,
): { kind: 'status' | 'delta' | 'tool' | 'file' | 'queued' | 'error'; data: Record<string, unknown> } | null {
  switch (event.kind) {
    case 'status':
    case 'delta':
      return { kind: event.kind, data: { turnId, text: event.text } };
    case 'tool':
      return { kind: 'tool', data: { turnId, text: event.text, done: event.done } };
    case 'file':
      return { kind: 'file', data: { turnId, name: event.path } };
    case 'queued':
      return { kind: 'queued', data: { turnId, position: event.position, text: event.text } };
    case 'error':
      return {
        kind: 'error',
        // `text` is what the browser renders. `detail` never is: it is for the log
        // and for a mentor reading the row afterwards.
        data: { turnId, text: event.text, ...(event.detail === undefined ? {} : { detail: event.detail }) },
      };
    case 'turn_end':
      return null;
    default:
      return null;
  }
}

/**
 * The founder facing sentence for a failure that has one.
 *
 * Null means there is no better sentence than the executor's own, so nothing
 * extra is said. Saying two vague things is worse than saying one.
 */
function explain(err: unknown): string | null {
  if (err instanceof RulesRefused) {
    // RulesRefused builds its message with explainRefusal, which is already
    // founder prose naming the file, the rule and what to do.
    return err.message;
  }
  if (err instanceof TurnRefused) {
    switch (err.code) {
      case 'wrong_track':
        return 'That engine belongs to the other track, so it was not run. Open the one for your track from the list on the left.';
      case 'founder_disabled':
      case 'founder_deleted':
        return 'This account is not active, so nothing was run. Tell a mentor.';
      case 'no_such_thread':
      case 'no_such_route':
        return 'That conversation could not be opened. Start it again from the list on the left.';
      default:
        return null;
    }
  }
  return null;
}

/** Run something after the commit and never let it fail a turn that already happened. */
async function settle(
  what: string,
  log: Logger,
  job: TurnJob,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    log.error(
      { turnId: job.turnId, founderId: job.founderId, what, err: String(err) },
      'a step after the commit failed. The founder\'s work is committed and is not affected.',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

/** How many notes go on the screen before the rest are counted instead. */
export const NOTES_SHOWN = 3;

/**
 * The status lines a founder reads beside work that was saved.
 *
 * THREE, AND THEN SAY SO. Notes are the common volume now. The gate was measured
 * against ordinary founder writing and most findings were moved off the holding
 * level onto this one, so a turn carrying more than three notes is an ordinary
 * Sunday rather than a rare event. Cutting the list at three in silence tells a
 * founder that was everything, which is the one thing it is not, so what was cut
 * is counted out loud.
 *
 * Three, and not all of them, because a wall of notes beside work that was saved
 * is the same interruption the measuring exercise existed to remove.
 *
 * Pure, and exported, so the counting can be tested without standing up a turn.
 */
export function noteLines(notes: readonly Violation[]): string[] {
  const lines = notes.slice(0, NOTES_SHOWN).map((note) => note.message);
  const unshown = notes.length - NOTES_SHOWN;
  if (unshown > 0) {
    lines.push(
      unshown === 1
        ? 'There is 1 more note like these. Ask for the rest and they will be listed.'
        : `There are ${unshown} more notes like these. Ask for the rest and they will be listed.`,
    );
  }
  return lines;
}
