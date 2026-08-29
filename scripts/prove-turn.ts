/**
 * scripts/prove-turn.ts
 *
 * WHAT THIS IS. The whole chain, run for real, with the model stubbed.
 * `npm run prove:turn`.
 *
 *   a founder message
 *     -> src/server/routes/run-turn.ts
 *       -> src/server/storage/turn.ts  BEGIN, lock, materialise
 *         -> src/server/agent/session-pool.ts -> agent/runner.ts -> the model
 *           -> the model writes a file into the founder's own scratch folder
 *         -> the harvest reads it
 *         -> THE RULES GATE reads it
 *       -> COMMIT, and the file is a ge_file row the founder can download
 *
 * WHY IT EXISTS. Every piece of that chain had a test and the chain had none,
 * because the join between them did not exist: `storage/turn.ts` and
 * `agent/runner.ts` had no non test importer at all. A suite of green units over
 * a chain nobody has run end to end is exactly the state this project was in
 * when a founder could sign in, be walked through setup, start a Founder Brain
 * and read "That one did not finish."
 *
 * WHAT IS REAL HERE, AND IT IS NEARLY ALL OF IT. Postgres, the migrations, the
 * advisory lock, the encrypted blobs, materialise, the harvest, the rules gate,
 * the routing table, the generated skill bodies, the run header, the session
 * pool, the turn_events rows, the assistant message row and the thread digest.
 *
 * WHAT IS STUBBED, AND ONLY THIS. `queryFn`, the one function in the process
 * that reaches the Claude Agent SDK. It follows the documented message order
 * that `src/server/agent/runner.test.ts` already scripts against, and it writes a
 * real file into the real per founder folder, which is the only thing the rest of
 * the chain cares about a model doing.
 *
 * WHAT THIS THEREFORE DOES NOT PROVE, SAID PLAINLY RATHER THAN LEFT TO BE FOUND:
 *   - that a real model, given the assembled prompt, writes the file the skill
 *     asks for. That needs a key and 20 minutes of somebody's attention.
 *   - that the CLI subprocess starts inside the deployment image, that the tool
 *     surface really has no Bash in it at run time, or that `system/init` comes
 *     back with the fields `assertInit` demands. Those are the deployment probe's
 *     five questions and the smoke run's.
 *   - anything about prompt cache hit rates, which need real token counts.
 * A green run here means the plumbing carries water. It does not mean the tap
 * works.
 *
 * WHAT CALLS IT. `npm run prove:turn`. Nothing imports it.
 *
 * WHAT IT READS. The environment, through src/server/env.ts.
 * WHAT IT WRITES. Its own fictional founder, that founder's rows, and that
 * founder's scratch folder. It refuses to run against prod, and it removes what
 * it made on the way out.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { and, eq } from 'drizzle-orm';

import { loadEnv } from '../src/server/env.ts';

/* Fail before the env parser does, with the two lines somebody can act on. */
if (!process.env['DATABASE_URL'] || !process.env['GE_MASTER_KEY']) {
  process.stderr.write(
    [
      'prove-turn needs a scratch Postgres and a master key. Neither is a secret worth guarding here.',
      '',
      '  DATABASE_URL=postgres://localhost:5432/launchhouse_proof \\',
      '  GE_MASTER_KEY=$(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))") \\',
      '  npm run prove:turn',
      '',
      'It migrates the database it is pointed at. Point it at a scratch one.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const env = loadEnv();

import { Budget } from '../src/server/agent/budget.ts';
import { createGeTools, GE_TOOL_NAMES } from '../src/server/agent/mcp/ge-tools.ts';
import { systemClock as agentClock, type GeRunner } from '../src/server/agent/ports.ts';
import { Pushable } from '../src/server/agent/pushable.ts';
import type { QueryFn, RunnerDeps } from '../src/server/agent/runner.ts';
import { SessionPool } from '../src/server/agent/session-pool.ts';
import { createSessionStore } from '../src/server/agent/session-store.ts';
import { REAL_CLI_TOOLS, realInit } from '../src/server/agent/test-fixtures.ts';
import type { FounderContext } from '../src/server/agent/types.ts';
import { closeDb, getDb } from '../src/server/db/client.ts';
import { runMigrations } from '../src/server/db/migrate.ts';
import { founders, spend, threads, turnEvents } from '../src/server/db/schema.ts';
import { ContentRouteCatalogue, GeneratedSkillBodies } from '../src/server/routes/agent-content.ts';
import { TurnEventBus, TurnEvents } from '../src/server/routes/events.ts';
import { FolderFactsSource } from '../src/server/routes/facts-source.ts';
import { systemClock, type IdSource, type Logger, type TurnJob } from '../src/server/routes/ports.ts';
import { createRunTurn } from '../src/server/routes/run-turn.ts';
import { PgSpendReader } from '../src/server/routes/spend-ledger.ts';
import { PgAppStore } from '../src/server/routes/store-pg.ts';
import { PgTranscriptStore } from '../src/server/routes/transcripts-pg.ts';
import { createFounderKey } from '../src/server/storage/crypto.ts';
import { founderRoot, geHome } from '../src/server/storage/paths.ts';

/** Its own founder, its own id, so it can never collide with a seeded one. */
// No I, L, O or U: those four are not in the founder id alphabet, and a proof
// script that cannot build its own path is a poor advertisement for the check.
const FOUNDER_ID = '01K3PRVTRN0000000000000001';
const FOUNDER_EMAIL = 'prove-turn@example.com';
const THREAD_ID = 'th_01K3PROVE0000000000000001';
const SESSION_ID = 'sess-prove-turn';

/** A Brain with no dash, no banned word and no digit in it, so it passes the gate. */
const CLEAN_BRAIN = [
  '# Founder Brain',
  '',
  '- **Founder:** Priya Raman',
  '- **Business:** Lumen Studio',
  '- **Track:** b2c',
  '- **Model:** service',
  '',
  '## Thesis',
  '',
  'She helps people who have just moved house make the place feel like theirs.',
  '',
  '## Offer',
  '',
  'One room, planned and styled, in a fortnight.',
  '',
  '## Audience',
  '',
  'People who have just moved and cannot picture the finished room.',
  '',
  '## Proof',
  '',
  'Thin so far. She has photographs of her own flat and nothing else.',
  '',
  '## Goal',
  '',
  'Enough enquiries to fill the diary without discounting.',
  '',
  '## Channels',
  '',
  'Instagram, because that is where she already writes.',
  '',
  '## Voice',
  '',
  'Warm, plain, and a little dry. Short sentences.',
  '',
  '## Flags',
  '',
  '- Nothing open yet.',
  '',
].join('\n');

/** The same file with one em dash in it. The gate must refuse this. */
const DASHED_BRAIN = CLEAN_BRAIN.replace(
  'Warm, plain, and a little dry.',
  'Warm, plain — and a little dry.',
);

/* -------------------------------------------------------------------------- */
/* The one stub                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A stand in for the SDK's query(), following the documented message order.
 *
 * It is deliberately the same shape as the fake in
 * `src/server/agent/runner.test.ts`, because that one is already proved against
 * the runner. The one thing it does that a unit test's fake does not is write a
 * real file into the real folder, which is what makes everything below the
 * runner in this chain have something to do.
 */
interface Seen {
  systemPromptAppend: string;
  firstUserMessage: string;
}

function stubQuery(
  fileToWrite: () => { path: string; text: string } | null,
  seen: Seen,
): QueryFn {
  return (params) => {
    const out = new Pushable<Record<string, unknown>>();
    const options = params.options as
      | {
          cwd?: string;
          model?: string;
          systemPrompt?: { append?: string };
          hooks?: { PostToolUse?: { hooks?: ((input: unknown) => Promise<unknown>)[] }[] };
        }
      | undefined;
    const cwd = options?.cwd ?? process.cwd();
    seen.systemPromptAppend = options?.systemPrompt?.append ?? '';

    const drain = async (): Promise<void> => {
      // The real CLI's init, from src/server/agent/test-fixtures.ts, not a
      // hand written one. This stub used to send BUILT_IN_TOOLS, which contains
      // TodoWrite, and an empty skills list, and CLI 2.1.250 sends neither. A
      // stub that models a CLI which does not exist is what the chain this
      // script exists to prove already went wrong on once.
      out.push(
        realInit({
          session_id: SESSION_ID,
          tools: [...REAL_CLI_TOOLS, ...GE_TOOL_NAMES],
          model: options?.model ?? env.MODEL_PRIMARY,
        }),
      );

      let cumulative = 0;
      for await (const message of params.prompt) {
        const content = (message as { message?: { content?: unknown } }).message?.content;
        if (seen.firstUserMessage === '' && typeof content === 'string') seen.firstUserMessage = content;
        out.push({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Right. Writing that down now.' } },
          session_id: SESSION_ID,
        });

        const file = fileToWrite();
        if (file !== null) {
          // The real thing: a file appears in the founder's own folder, written
          // by something pretending to be the model, at the path the skill names.
          await mkdir(join(cwd, 'growth-engine'), { recursive: true });
          await writeFile(join(cwd, 'growth-engine', file.path), file.text, 'utf8');
          out.push({
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'tool_use', id: 'tu_1', name: 'Write', input: { file_path: file.path } }],
            },
            session_id: SESSION_ID,
          });
          out.push({
            type: 'user',
            message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] },
            session_id: SESSION_ID,
          });
          // The SDK calls PostToolUse after a Write, and that hook is the ONLY
          // thing that produces a live `file` frame. A stub that skipped it
          // would leave the file panel's whole reason for existing unexercised.
          const hook = options?.hooks?.PostToolUse?.[0]?.hooks?.[0];
          if (hook !== undefined) {
            await hook({
              hook_event_name: 'PostToolUse',
              tool_name: 'Write',
              tool_input: { file_path: file.path },
              tool_use_id: 'tu_1',
            });
          }
        }

        cumulative += 0.02;
        out.push({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: 'That is written down. Tell me about the room you did last.',
          total_cost_usd: cumulative,
          modelUsage: { [options?.model ?? 'primary']: { cacheReadInputTokens: 9000 } },
          session_id: SESSION_ID,
        });
      }
      out.end();
    };
    void drain();

    const iterator = out[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => iterator.next(),
      interrupt: () => Promise.resolve(),
      // Only the members runner.ts uses. Implementing the whole Query surface
      // would be a second implementation of the SDK.
    } as unknown as ReturnType<QueryFn>;
  };
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

const results: { ok: boolean; what: string; detail: string }[] = [];

function check(ok: boolean, what: string, detail = ''): void {
  results.push({ ok, what, detail });
  process.stdout.write(`${ok ? '  ok   ' : '  FAIL '} ${what}${detail === '' ? '' : `  (${detail})`}\n`);
}

/* -------------------------------------------------------------------------- */

const collected: { level: string; msg: string }[] = [];
const log: Logger = {
  info: (_o, m) => collected.push({ level: 'info', msg: m }),
  warn: (_o, m) => collected.push({ level: 'warn', msg: m }),
  error: (o, m) => {
    collected.push({ level: 'error', msg: m });
    process.stdout.write(`  log.error ${m} ${JSON.stringify(o)}\n`);
  },
};

let turnCounter = 0;
/**
 * Unique per CALL, not per turn.
 *
 * The first version numbered ids by the turn, and the answer's message row
 * collided with the founder's own message row on the primary key. It was the
 * harness that was wrong and not the app, but it is worth the comment: this is
 * exactly the failure the real ULID source cannot have, and a fake that can have
 * it will find it in the harness rather than in production.
 */
let idCounter = 0;
const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}_01K3PRVTRN${String(idCounter).padStart(14, '0')}`;
};
const ids: IdSource = {
  thread: () => THREAD_ID,
  message: () => nextId('ms'),
  turn: () => nextId('tn'),
};

async function ensureFounder(): Promise<void> {
  const { wrapped } = createFounderKey(FOUNDER_ID);
  await getDb()
    .insert(founders)
    .values({
      id: FOUNDER_ID,
      email: FOUNDER_EMAIL,
      displayName: 'Priya Raman',
      timezone: 'America/New_York',
      // No track. Every real founder's first run is this one, and it is the run
      // where an unforked founder must be handed both branches of the intake.
      track: null,
      wrappedKey: wrapped,
    })
    .onConflictDoNothing({ target: founders.id });
}

async function removeFounder(): Promise<void> {
  await getDb().delete(founders).where(eq(founders.id, FOUNDER_ID));
  await rm(founderRoot(FOUNDER_ID), { recursive: true, force: true });
}

async function versionOf(): Promise<number> {
  const rows = await getDb().select({ v: founders.version }).from(founders).where(eq(founders.id, FOUNDER_ID));
  return Number(rows[0]?.v ?? -1);
}

async function main(): Promise<number> {
  if (env.APP_ENV === 'prod' || env.DATABASE_ENV_TAG === 'prod') {
    process.stderr.write('prove-turn refuses to run against prod.\n');
    return 1;
  }

  process.stdout.write(`prove-turn\n  database ${env.DATABASE_ENV_TAG}, workspace ${founderRoot(FOUNDER_ID)}\n\n`);

  await runMigrations();
  await removeFounder();
  await ensureFounder();

  const store = new PgAppStore();
  const bus = new TurnEventBus();
  const events = new TurnEvents(store, bus, systemClock);
  const catalogue = new ContentRouteCatalogue();
  const bodies = new GeneratedSkillBodies();
  const facts = new FolderFactsSource({ catalogue, log });
  const transcripts = new PgTranscriptStore({ log });
  const budget = new Budget(
    { turnCapUsd: env.TURN_SPEND_CAP_USD, founderCapUsd: env.FOUNDER_SPEND_CAP_USD, cohortDailyCapUsd: env.COHORT_DAILY_CAP_USD },
    new PgSpendReader(),
    log,
  );

  // What the stubbed model writes on the next turn. Changed between scenarios.
  let nextWrite: { path: string; text: string } | null = null;

  const geRunnerFor = (ctx: FounderContext): GeRunner => ({
    run: () => Promise.reject(new Error(`ge is not exercised by prove-turn (founder ${ctx.founderId})`)),
  });

  const seen: Seen = { systemPromptAppend: '', firstUserMessage: '' };

  const runnerDeps: RunnerDeps = {
    queryFn: stubQuery(() => nextWrite, seen),
    bodies,
    facts,
    budget,
    log,
    clock: agentClock,
    config: {
      primaryModel: env.MODEL_PRIMARY,
      utilityModel: env.MODEL_UTILITY,
      fallbackModel: env.MODEL_FALLBACK,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      path: '/usr/bin:/bin',
      claudeConfigDir: '/tmp/claude-config',
      sessionLoadTimeoutMs: 10_000,
    },
    makeGeTools: (ctx) => ({
      servers: { ge: createGeTools(ctx, { ge: geRunnerFor(ctx), log }) },
      toolNames: GE_TOOL_NAMES,
    }),
    sessionStore: createSessionStore(transcripts, log),
    onCheckpoint: () => Promise.resolve(),
    onBrainChanged: () => {},
  };

  const pool = new SessionPool({ maxLiveSessions: 4, sessionIdleMs: 600_000, sweepEveryMs: 30_000 }, runnerDeps, agentClock, log);
  const runTurn = createRunTurn({ store, events, pool, catalogue, bodies, facts, transcripts, ids, log });

  await store.createThread({
    id: THREAD_ID,
    founderId: FOUNDER_ID,
    routeId: 'founder-brain',
    title: 'Founder Brain',
    at: new Date(),
  });

  const accept = async (text: string): Promise<TurnJob> => {
    turnCounter += 1;
    const accepted = await store.acceptMessage({
      founderId: FOUNDER_ID,
      threadId: THREAD_ID,
      text,
      clientMsgId: `cm_${String(turnCounter)}`,
      messageId: ids.message(),
      turnId: ids.turn(),
      at: new Date(),
    });
    return {
      turnId: accepted.turnId,
      threadId: THREAD_ID,
      founderId: FOUNDER_ID,
      routeId: 'founder-brain',
      priority: accepted.priority,
      text,
    };
  };

  /* ---------------------------------------------------------------- one */
  process.stdout.write('ONE. A founder message reaches the model, the model writes a file, and it lands in ge_file.\n');

  const before = await versionOf();
  nextWrite = { path: 'founder-brain.md', text: CLEAN_BRAIN };
  const jobOne = await accept('I style rooms for people who have just moved in.');
  await runTurn(jobOne, new AbortController().signal);

  const stored = await store.readFile(FOUNDER_ID, 'founder-brain.md');
  check(stored !== null, 'founder-brain.md is a ge_file row');
  check(
    stored !== null && stored.bytes.toString('utf8') === CLEAN_BRAIN,
    'the stored bytes are the bytes the model wrote',
    stored === null ? 'no row' : `${String(stored.bytes.length)} bytes`,
  );
  const afterOne = await versionOf();
  check(afterOne === before + 1, 'founder.version was bumped once', `${String(before)} to ${String(afterOne)}`);

  const framesOne = await getDb()
    .select({ kind: turnEvents.kind, data: turnEvents.data })
    .from(turnEvents)
    .where(and(eq(turnEvents.turnId, jobOne.turnId), eq(turnEvents.founderId, FOUNDER_ID)));
  check(framesOne.some((f) => f.kind === 'delta'), 'the founder was streamed at least one delta frame');
  check(framesOne.some((f) => f.kind === 'file'), 'a file frame told the file panel something changed');
  check(
    framesOne.every((f) => f.kind !== 'turn_end'),
    'no turn_end was written from inside the turn, so the browser is not told it is over before the commit',
  );

  // RULE 1, ON THE ONE RUN WHERE IT IS HARDEST. This founder has no track,
  // because the fork happens in the Founder Brain and setup does not ask. The
  // prompt they were handed must therefore carry both branches of the intake and
  // must not assert a track they have not chosen.
  check(
    seen.systemPromptAppend.includes('has not chosen a track yet'),
    'an unforked founder is told, in the prompt, that the track question is still open',
  );
  check(
    !/^# This founder's track: /m.test(seen.systemPromptAppend),
    'and is NOT told they are on a track nobody picked',
  );
  check(
    seen.firstUserMessage.includes('Track: not chosen yet'),
    'the run header says not chosen yet rather than naming a track',
  );
  check(
    seen.systemPromptAppend.includes('B2C') && seen.systemPromptAppend.includes('B2B'),
    'both branches of the intake survived, so either answer can be asked for',
  );

  const said = await store.listMessages(FOUNDER_ID, THREAD_ID, 20);
  check(
    said.some((m) => m.role === 'assistant' && m.text.length > 0),
    'the answer is a messages row, so a reload still shows it',
  );

  const threadRows = await getDb()
    .select({ sdkSessionId: threads.sdkSessionId, digest: threads.digest })
    .from(threads)
    .where(eq(threads.id, THREAD_ID));
  check(threadRows[0]?.sdkSessionId === SESSION_ID, 'the SDK session id was stored, so the next turn resumes');
  check(
    typeof threadRows[0]?.digest === 'string' && threadRows[0].digest.includes('founder-brain.md'),
    'the thread digest names the file, so a cold resume is seeded from the record',
  );

  /* ---------------------------------------------------------------- two */
  process.stdout.write('\nTWO. The same chain, with an em dash in what the model wrote. The gate must refuse it.\n');

  nextWrite = { path: 'founder-brain.md', text: DASHED_BRAIN };
  const jobTwo = await accept('Actually, make my voice sound a bit drier.');
  let refused: unknown = null;
  try {
    await runTurn(jobTwo, new AbortController().signal);
  } catch (err: unknown) {
    refused = err;
  }
  check(refused !== null, 'the turn was refused rather than committed');
  check(
    refused instanceof Error && /dash/i.test(refused.message),
    'the refusal names the em dash',
    refused instanceof Error ? refused.message.split('\n')[0] ?? '' : String(refused),
  );

  const afterTwo = await store.readFile(FOUNDER_ID, 'founder-brain.md');
  check(
    afterTwo !== null && afterTwo.bytes.toString('utf8') === CLEAN_BRAIN,
    'THE RECORD IS UNTOUCHED. The refused bytes never reached ge_file and the founder still has what they had.',
  );
  check((await versionOf()) === afterOne, 'founder.version did not move on a refused turn');

  const framesTwo = await getDb()
    .select({ kind: turnEvents.kind, data: turnEvents.data })
    .from(turnEvents)
    .where(and(eq(turnEvents.turnId, jobTwo.turnId), eq(turnEvents.founderId, FOUNDER_ID)));
  check(
    framesTwo.some((f) => f.kind === 'status' && JSON.stringify(f.data).toLowerCase().includes('dash')),
    'the founder was told what was refused, in their own words, before the generic failure',
  );

  /* -------------------------------------------------------------- three */
  process.stdout.write('\nTHREE. The transcript mirror, which is what a cold container resumes from.\n');

  await transcripts.append(`founder-${FOUNDER_ID}`, SESSION_ID, undefined, [
    { type: 'user', uuid: 'u1', text: 'one' },
    { type: 'assistant', uuid: 'a1', text: 'two' },
  ]);
  check(transcripts.pendingCount() === 2, 'append buffers rather than taking a second connection mid turn');
  const mirrored = await transcripts.flush(SESSION_ID);
  check(mirrored === 2, 'flush after the commit wrote both entries', String(mirrored));
  const loaded = await transcripts.load(`founder-${FOUNDER_ID}`, SESSION_ID, undefined);
  check(loaded !== null && loaded.length === 2, 'they load back in order');
  // Same batch again. The uuid is the idempotency key, so a retry must not double.
  await transcripts.append(`founder-${FOUNDER_ID}`, SESSION_ID, undefined, [{ type: 'user', uuid: 'u1', text: 'one' }]);
  await transcripts.flush(SESSION_ID);
  const reloaded = await transcripts.load(`founder-${FOUNDER_ID}`, SESSION_ID, undefined);
  check(reloaded !== null && reloaded.length === 2, 'a replayed batch does not duplicate a row');
  const heldBefore = transcripts.pendingCount();
  await transcripts.append('nothing-founder-shaped', SESSION_ID, undefined, [{ type: 'user', uuid: 'x1' }]);
  check(
    transcripts.pendingCount() === heldBefore,
    'a project key with no founder id in it is dropped rather than filed under a guess',
  );
  check(
    (await transcripts.load('nothing-founder-shaped', SESSION_ID, undefined)) === null,
    'and it reads back as nothing, rather than as somebody else\'s conversation',
  );

  /* --------------------------------------------------------------- four */
  process.stdout.write('\nFOUR. The tenancy belt, at the seam this file owns.\n');

  const otherId = '01K3PRVTRN0000000000000002';
  const { wrapped: otherKey } = createFounderKey(otherId);
  await getDb()
    .insert(founders)
    .values({ id: otherId, email: 'prove-other@example.com', displayName: 'Somebody Else', timezone: 'UTC', wrappedKey: otherKey })
    .onConflictDoNothing({ target: founders.id });

  let crossed: unknown = null;
  try {
    // Founder A's id, founder B's thread. Only the pair is safe to read on, and
    // this is the line that says so in SQL rather than in a comment.
    await runTurn(
      { turnId: 'tn_cross', threadId: THREAD_ID, founderId: otherId, routeId: 'founder-brain', priority: 'normal', text: 'let me see that' },
      new AbortController().signal,
    );
  } catch (err: unknown) {
    crossed = err;
  }
  check(
    crossed instanceof Error && /does not belong to this founder/.test(crossed.message),
    'one founder cannot run a turn on another founder\'s thread',
    crossed instanceof Error ? crossed.message : String(crossed),
  );
  await getDb().delete(founders).where(eq(founders.id, otherId));

  /* --------------------------------------------------------------- five */
  process.stdout.write('\nFIVE. The cost of every turn reached the ledger.\n');

  // The spend row is written outside the turn's transaction, on purpose: a
  // model run that cost money and was then refused by the rules gate still cost
  // money. So it is polled for rather than assumed to have landed already.
  let spendRows = 0;
  for (let attempt = 0; attempt < 20 && spendRows < 2; attempt += 1) {
    const rows = await getDb().select({ id: spend.id }).from(spend).where(eq(spend.founderId, FOUNDER_ID));
    spendRows = rows.length;
    if (spendRows < 2) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(spendRows >= 2, 'both turns wrote a spend row, the refused one included', `${String(spendRows)} rows`);

  /* ------------------------------------------------------------ tidy up */
  await pool.stop();
  await removeFounder();

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(
    [
      '',
      `${String(results.length - failed.length)} of ${String(results.length)} checks passed.`,
      '',
      'What a green run here does NOT prove, and it is the last mile:',
      '  the real model, given the assembled prompt, writing the file the skill asks for.',
      '  the CLI subprocess starting inside the deployment image at all.',
      '  system/init coming back with the fields assertInit demands.',
      '  any prompt cache hit rate, which needs real token counts.',
      'All four need ANTHROPIC_API_KEY and a deployed container. Nothing else does.',
      '',
    ].join('\n'),
  );
  return failed.length === 0 ? 0 : 1;
}

const code = await main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err)}\n`);
  return 1;
});
// Best effort, because the folder is a cache and the database is the record.
await rm(geHome(FOUNDER_ID), { recursive: true, force: true }).catch(() => undefined);
await closeDb();
process.exit(code);
