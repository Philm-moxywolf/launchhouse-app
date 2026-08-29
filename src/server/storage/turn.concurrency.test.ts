/**
 * src/server/storage/turn.concurrency.test.ts
 *
 * WHAT THIS IS. The test that fails if somebody puts a second Postgres connection
 * back inside the turn's transaction window, or puts the model run back inside a
 * transaction at all.
 *
 * WHY IT EXISTS. This was the worst bug in the app and it was invisible to every
 * test that already existed, because a single turn on an idle pool passes every
 * one of them. The turn held its transaction across the whole model run, and inside
 * that window the spend gate read the ledger on the pool. So one turn needed two
 * connections. At PGPOOL_MAX, default 10, ten concurrent turns held every
 * connection and every one of them waited for the eleventh, which only frees when a
 * turn ends. Measured on the shipped code against a real Postgres 18.4:
 *
 *     2 turns    2 of 2 finished in 19 ms
 *     9 turns    9 of 9 finished in 36 ms
 *    10 turns    0 of 10 finished in 25 seconds
 *    24 turns    0 of 24 finished in 25 seconds
 *    1 turn with PGPOOL_MAX=1   never finished
 *
 * MAX_CONCURRENT_RUNS ships at 24, so the app deadlocked well below its own
 * configured concurrency. Sixty five founders on one track on the Monday night is
 * the room this would have happened in.
 *
 * THE THREE ASSERTIONS, AND WHY EACH ONE IS HERE
 *
 *   1  Every turn holds ZERO connections while its work runs. Asserted from a
 *      SEPARATE connection against pg_stat_activity, so it is Postgres saying it
 *      and not this process. This is the one that names the defect directly.
 *   2  Turns beyond the pool size all finish. Driven at 2, 10, 24 and 40, and the
 *      last two are past both PGPOOL_MAX and MAX_CONCURRENT_RUNS.
 *   3  ONE turn finishes with PGPOOL_MAX=1. A turn that needs two connections
 *      cannot, and there is no pool size at which it can, so this is the version
 *      of the check that no amount of tuning can make pass falsely.
 *
 * Assertions 2 and 3 hold every turn inside its work until all of them have got
 * there. That is what makes them fail rather than merely slow down: a turn holding
 * a connection across its work cannot even reach the barrier, so nobody does.
 *
 * IT SKIPS WITHOUT A DATABASE, LOUDLY, like turn.db.test.ts beside it.
 *
 * HOW TO RUN IT
 *   DATABASE_URL=postgres://user@localhost:5432/launchhouse_test \
 *   GE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
 *   npx tsx --test src/server/storage/turn.concurrency.test.ts
 *
 * WHAT IT CALLS. storage/turn.ts, routes/spend-ledger.ts, agent/budget.ts,
 * db/client.ts, db/migrate.ts.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';

import { Budget } from '../agent/budget.ts';
import {
  APPLICATION_NAME,
  closeDb,
  getDb,
  inFounderScope,
  refuseIfHoldingAConnection,
  whileHoldingAConnection,
} from '../db/client.ts';
import { runMigrations } from '../db/migrate.ts';
import { founders, geFile } from '../db/schema.ts';
import { PgSpendReader } from '../routes/spend-ledger.ts';
import { createFounderKey } from './crypto.ts';
import { geHome } from './paths.ts';
import { runTurn, TurnRefused } from './turn.ts';

const HAVE_DB = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0;
const HAVE_KEY = typeof process.env.GE_MASTER_KEY === 'string' && process.env.GE_MASTER_KEY.length > 0;
const SKIP = !HAVE_DB || !HAVE_KEY;
const WHY = !HAVE_DB
  ? 'DATABASE_URL is not set, so there is no pool to run out of'
  : 'GE_MASTER_KEY is not set, and every blob is encrypted under it';

/**
 * How long a turn may wait at the barrier before this test calls it a deadlock.
 *
 * Generous on purpose. A real turn is 30 to 180 seconds and this one writes one
 * small file, so anything past a few seconds here is not slowness, it is a wedge.
 */
const BARRIER_MS = 10_000;

/** 26 character ULID shaped ids, distinct per turn, in this test's own range. */
function founderIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `01J8ZQTMK4NRC7XVYB3CNC${String(i).padStart(4, '0')}`);
}

let workspace: string;
let savedWorkspaceRoot: string | undefined;
/** Every id this file has ever created, so `after` can clear all of them. */
const created = new Set<string>();

before(async () => {
  if (SKIP) return;
  savedWorkspaceRoot = process.env.WORKSPACE_ROOT;
  workspace = await mkdtemp(join(tmpdir(), 'lh-turn-conc-'));
  process.env.WORKSPACE_ROOT = workspace;
  await runMigrations();
});

after(async () => {
  if (SKIP) return;
  if (created.size > 0) await getDb().delete(founders).where(inArray(founders.id, [...created]));
  await closeDb();
  if (savedWorkspaceRoot === undefined) delete process.env.WORKSPACE_ROOT;
  else process.env.WORKSPACE_ROOT = savedWorkspaceRoot;
  await rm(workspace, { recursive: true, force: true });
});

/** Put n founders in the record and give each one a folder to work in. */
async function seed(ids: readonly string[]): Promise<void> {
  const db = getDb();
  await db.delete(founders).where(inArray(founders.id, [...ids]));
  for (const id of ids) {
    const { wrapped } = createFounderKey(id);
    await db.insert(founders).values({
      id,
      email: `${id.toLowerCase()}@example.test`,
      timezone: 'America/New_York',
      wrappedKey: wrapped,
    });
    await mkdir(geHome(id), { recursive: true });
    created.add(id);
  }
}

/**
 * A barrier: nobody past it until everybody has reached it.
 *
 * This is the whole trick. It turns "the turns are slow" into "the turns cannot
 * start", which is the difference between a test that goes amber and a test that
 * fails. Under the old shape not one turn reaches `wait` at PGPOOL_MAX=1, because
 * the first one is still queued for the connection its own transaction is holding.
 */
interface Barrier {
  /** Called from inside a turn's work. Returns once `release` is called. */
  wait: () => Promise<void>;
  /** Resolves when all n turns are inside their work. Nothing has been let out yet. */
  reached: Promise<void>;
  /** Let all of them carry on. */
  release: () => void;
}

function barrier(n: number): Barrier {
  let arrived = 0;
  let open: () => void = () => undefined;
  let allHere: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    allHere = resolve;
  });
  return {
    wait: async () => {
      arrived += 1;
      // Arriving does NOT let anybody out. The caller decides, so a test can look
      // at the database while every turn is pinned in the middle of its work.
      if (arrived === n) allHere();
      await gate;
    },
    reached,
    release: () => open(),
  };
}

/** Reject after ms, so a wedged pool fails the test instead of hanging the run. */
function deadline(ms: number, what: string): { promise: Promise<never>; cancel: () => void } {
  let timer: NodeJS.Timeout;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} did not happen within ${String(ms)} ms. That is the deadlock.`));
    }, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** The paths one founder has in the record, read founder scoped. */
async function pathsFor(founderId: string): Promise<string[]> {
  return inFounderScope(getDb(), founderId, async (tx) => {
    const rows = await tx.select({ path: geFile.path }).from(geFile).where(eq(geFile.founderId, founderId));
    return rows.map((r) => r.path).sort();
  });
}

async function versionFor(founderId: string): Promise<number> {
  const rows = await getDb().select({ version: founders.version }).from(founders).where(eq(founders.id, founderId));
  return Number(rows[0]?.version ?? -1);
}

describe('the turn under concurrency, against a real Postgres', { skip: SKIP ? WHY : false }, () => {
  it('holds NO connection while the work runs, and Postgres itself says so', async () => {
    const ids = founderIds(6);
    await seed(ids);

    const gate = barrier(ids.length);
    // A connection of its own, outside the app's pool, so that looking does not
    // itself need the thing being measured.
    const watcher = postgres(process.env.DATABASE_URL ?? '', { max: 1, onnotice: () => undefined });
    // No initialiser: if the read below never happens the assertion sees undefined
    // and fails, which is the right answer for a test that could not measure.
    let idleInTransaction: number | undefined;

    try {
      const turns = ids.map((id) =>
        runTurn({ founderId: id, actor: 'system', verb: 'measure' }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), '- **Track:** b2b\n\n## Thesis\n', 'utf8');
          await gate.wait();
          return null;
        }),
      );

      const timeout = deadline(BARRIER_MS, 'every turn reaching the middle of its work');
      await Promise.race([gate.reached, timeout.promise]);
      timeout.cancel();

      // Every turn is PINNED inside its work right now: none of them has been let
      // out. So ask Postgres how many connections this process is holding open
      // inside a transaction. The answer must be none. Looking after releasing them
      // would find T2 legitimately holding connections and prove nothing.
      const rows = await watcher`
        select count(*)::int as n
          from pg_stat_activity
         where datname = current_database()
           and pid <> pg_backend_pid()
           -- THIS process only. Test files run in parallel against one scratch
           -- database, and another one of them legitimately holding a short
           -- transaction is not this test's business.
           and application_name = ${APPLICATION_NAME}
           and state = 'idle in transaction'
      `;
      idleInTransaction = Number(rows[0]?.['n'] ?? -1);

      gate.release();
      await Promise.all(turns);
    } finally {
      await watcher.end({ timeout: 5 });
    }

    assert.equal(
      idleInTransaction,
      0,
      `${String(idleInTransaction)} connections of this process were sitting idle in a transaction while ` +
        'the work ran. A turn is holding a connection across its own model run, which is ' +
        'the deadlock this file exists to prevent. See the header of storage/turn.ts.',
    );
  });

  for (const n of [2, 10, 24, 40]) {
    it(`runs ${String(n)} concurrent turns to completion, all of them inside their work at once`, async () => {
      const ids = founderIds(n);
      await seed(ids);

      const gate = barrier(n);
      const turns = ids.map((id) =>
        runTurn({ founderId: id, actor: 'system', verb: 'concurrent' }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), '- **Track:** b2b\n\n## Thesis\n', 'utf8');
          // Nobody leaves until everybody has arrived. With the pool at 10 and any
          // turn holding a connection across this line, nobody arrives.
          await gate.wait();
          return id;
        }),
      );

      const arrive = deadline(BARRIER_MS, `all ${String(n)} turns reaching the barrier`);
      await Promise.race([gate.reached, arrive.promise]);
      arrive.cancel();
      gate.release();

      const finish = deadline(BARRIER_MS, `all ${String(n)} turns committing`);
      const done = await Promise.race([Promise.all(turns), finish.promise]);
      finish.cancel();

      assert.equal(done.length, n);
      for (const outcome of done) {
        assert.equal(outcome.versionAfter, outcome.versionBefore + 1);
        assert.equal(outcome.trackAfter, 'b2b');
      }
    });
  }

  it('THE LITERAL REGRESSION: the spend gate reads the ledger from inside a turn and the turn still finishes', async () => {
    // This is AgentRun.spawn, line for line: inside the work, ask Budget for the
    // spawn cap, which asks PgSpendReader, which queries the pool. On the shipped
    // code this needed a second connection and ten of them wedged the process.
    const ids = founderIds(12);
    await seed(ids);

    const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
    const budget = new Budget(
      { turnCapUsd: 0.5, founderCapUsd: 5, cohortDailyCapUsd: 500 },
      new PgSpendReader(),
      silent,
    );

    const gate = barrier(ids.length);
    const turns = ids.map((id) =>
      runTurn({ founderId: id, actor: 'model', verb: 'agent-run' }, async (ctx) => {
        const cap = await budget.spawnCapUsd(id);
        await writeFile(join(ctx.home, 'founder-brain.md'), '- **Track:** b2c\n\n## Thesis\n', 'utf8');
        await gate.wait();
        return cap;
      }),
    );

    const arrive = deadline(BARRIER_MS, 'twelve turns reading the spend ledger');
    await Promise.race([gate.reached, arrive.promise]);
    arrive.cancel();
    gate.release();

    const finish = deadline(BARRIER_MS, 'twelve turns committing');
    const done = await Promise.race([Promise.all(turns), finish.promise]);
    finish.cancel();

    assert.equal(done.length, ids.length);
    for (const outcome of done) assert.equal(outcome.value, 0.5);
  });

  it('one founder gets one writer: two turns for the same founder serialise instead of racing', async () => {
    const [id] = founderIds(1);
    assert.ok(id !== undefined);
    await seed([id]);

    const order: string[] = [];
    const first = runTurn({ founderId: id, actor: 'system', verb: 'first' }, async (ctx) => {
      order.push('first in');
      // Both files are ones the files view knows and both are grounded, because
      // rules 4 and 5 refuse anything else and neither refusal is what this test is
      // about.
      await writeFile(join(ctx.home, 'founder-brain.md'), '- **Track:** b2b\n\n## Thesis\n', 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 150));
      order.push('first out');
      return null;
    });
    const second = runTurn({ founderId: id, actor: 'system', verb: 'second' }, async (ctx) => {
      order.push('second in');
      await writeFile(join(ctx.home, 'ledger.md'), '# Ledger\n', 'utf8');
      order.push('second out');
      return null;
    });

    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(order, ['first in', 'first out', 'second in', 'second out']);
    // Two turns, two versions, and the second one saw the first one's file.
    assert.equal(a.versionAfter, a.versionBefore + 1);
    assert.equal(b.versionBefore, a.versionAfter);
    assert.deepEqual(a.plan.changes.map((c) => c.path).sort(), ['founder-brain.md']);
    // The second turn only saw its own change, which means it materialised on top of
    // the first turn's committed work rather than racing it.
    assert.deepEqual(b.plan.changes.map((c) => c.path).sort(), ['ledger.md']);
  });

  it('THE BELT THAT PAYS FOR THE SPLIT: a turn overtaken mid run refuses instead of overwriting', async () => {
    // The lock cannot span the run any more, so this is what stops a second writer's
    // work being silently overwritten by a turn that materialised before it. The
    // simulation is exact: something else commits for this founder while the model is
    // talking, which is what a second container would do.
    const [id] = founderIds(1);
    assert.ok(id !== undefined);
    await seed([id]);

    // A first, ordinary turn, so there is something in the record to overwrite.
    await runTurn({ founderId: id, actor: 'system', verb: 'seed' }, async (ctx) => {
      await writeFile(join(ctx.home, 'founder-brain.md'), '- **Track:** b2b\n\n## Thesis\n', 'utf8');
      return null;
    });
    const recordBefore = await pathsFor(id);
    const versionBefore = await versionFor(id);

    await assert.rejects(
      () =>
        runTurn({ founderId: id, actor: 'model', verb: 'agent-run' }, async (ctx) => {
          await writeFile(join(ctx.home, 'ledger.md'), '# Ledger\n', 'utf8');
          // Somebody else commits, mid run.
          await ctx.read(async (tx) => {
            await tx
              .update(founders)
              .set({ version: versionBefore + 1 })
              .where(eq(founders.id, id));
          });
          return null;
        }),
      (err: unknown) => {
        assert.ok(err instanceof TurnRefused, `expected TurnRefused, got ${String(err)}`);
        assert.equal(err.code, 'turn_superseded');
        // The sentence a founder can act on, not a code.
        assert.match(err.message, /Send it again/);
        return true;
      },
    );

    // The other writer's version stands, and the overtaken turn wrote nothing.
    assert.equal(await versionFor(id), versionBefore + 1);
    assert.deepEqual(await pathsFor(id), recordBefore);
  });

  it('the guard itself can fail: a pool read from inside a held connection is refused', async () => {
    // Proving the guard works, rather than trusting that it does. If this ever
    // stops throwing, the refusal in routes/spend-ledger.ts is decoration.
    await assert.rejects(
      () =>
        whileHoldingAConnection('a pretend transaction', async () => {
          await new PgSpendReader().spendToDate('01J8ZQTMK4NRC7XVYB3CNC0000');
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /second Postgres connection/);
        return true;
      },
    );

    // And it is silent when there is nothing held, which is the normal case.
    refuseIfHoldingAConnection('a read outside any transaction');
    assert.equal(typeof (await new PgSpendReader().cohortSpendToday()), 'number');
  });
});
