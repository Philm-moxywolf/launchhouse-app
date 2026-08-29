/**
 * src/server/storage/turn.db.test.ts
 *
 * WHAT THIS IS. The turn, end to end, against a real Postgres. Materialise, work,
 * harvest, commit, and the refusal that rolls all of it back.
 *
 * WHY IT EXISTS. fail-closed.test.ts proves the decision and proves the folder is
 * removed, using a database handle that refuses to write. Neither of those proves
 * the thing that matters most on the day: that a refused turn leaves the RECORD
 * exactly as it was. Only a real ROLLBACK proves that, and "we rolled back" is the
 * sentence a founder is told when their data is untouched.
 *
 * IT SKIPS WITHOUT A DATABASE, LOUDLY. There is no Postgres on the machine this was
 * written on, so every assertion below is written to run when one appears and to say
 * so plainly when one does not. A skip that says nothing is a skip nobody fixes.
 *
 * HOW TO RUN IT
 *   DATABASE_URL=postgres://user@localhost:5432/launchhouse_test \
 *   GE_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
 *   npx tsx --test src/server/storage/turn.db.test.ts
 *
 * IT MIGRATES THE DATABASE IT IS POINTED AT, and it deletes the founder rows it
 * creates afterwards. Point it at a scratch database, never at anything holding a
 * real founder.
 *
 * WHAT IT CALLS. storage/turn.ts, storage/harvest.ts, storage/materialise.ts,
 * db/migrate.ts, db/client.ts, and the filesystem.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';

import { closeDb, getDb, setFounderScope } from '../db/client.ts';
import { runMigrations } from '../db/migrate.ts';
import { founders, geFile } from '../db/schema.ts';
import { createFounderKey } from './crypto.ts';
import { HarvestRefused } from './harvest.ts';
import { epochPath, founderRoot, geHome } from './paths.ts';
import { runTurn, TurnRefused } from './turn.ts';

/**
 * Two conditions, and they are separate on purpose. A machine with a database and no
 * master key would otherwise fail with a cipher error and look like a storage bug.
 */
const HAVE_DB = typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0;
const HAVE_KEY = typeof process.env.GE_MASTER_KEY === 'string' && process.env.GE_MASTER_KEY.length > 0;
const SKIP = !HAVE_DB || !HAVE_KEY;
const WHY = !HAVE_DB
  ? 'DATABASE_URL is not set, so there is no database to roll back'
  : 'GE_MASTER_KEY is not set, and every blob is encrypted under it';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF31';

let workspace: string;
let savedWorkspaceRoot: string | undefined;

before(async () => {
  if (SKIP) return;
  savedWorkspaceRoot = process.env.WORKSPACE_ROOT;
  workspace = await mkdtemp(join(tmpdir(), 'lh-turn-db-'));
  process.env.WORKSPACE_ROOT = workspace;

  await runMigrations();
  const db = getDb();
  await db.delete(founders).where(eq(founders.id, FOUNDER));
  const { wrapped } = createFounderKey(FOUNDER);
  await db.insert(founders).values({
    id: FOUNDER,
    email: `${FOUNDER.toLowerCase()}@example.test`,
    timezone: 'America/New_York',
    wrappedKey: wrapped,
  });
  await mkdir(geHome(FOUNDER), { recursive: true });
});

after(async () => {
  if (SKIP) return;
  await getDb().delete(founders).where(eq(founders.id, FOUNDER));
  await closeDb();
  if (savedWorkspaceRoot === undefined) delete process.env.WORKSPACE_ROOT;
  else process.env.WORKSPACE_ROOT = savedWorkspaceRoot;
  await rm(workspace, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function versionOf(): Promise<number> {
  const rows = await getDb().select({ version: founders.version }).from(founders).where(eq(founders.id, FOUNDER));
  return Number(rows[0]?.version ?? -1);
}

async function pathsInRecord(): Promise<string[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await setFounderScope(tx, FOUNDER);
    const rows = await tx.select({ path: geFile.path }).from(geFile).where(eq(geFile.founderId, FOUNDER));
    return rows.map((r) => r.path).sort();
  });
}

describe('the turn, against a real Postgres', { skip: SKIP ? WHY : false }, () => {
  it('harvests what the work wrote, and bumps the version once', async () => {
    const before = await versionOf();
    const outcome = await runTurn({ founderId: FOUNDER, actor: 'system', verb: 'seed' }, async (ctx) => {
      await writeFile(join(ctx.home, 'founder-brain.md'), '- **Track:** b2b\n\n## Thesis\n', 'utf8');
      await mkdir(join(ctx.home, 'people'), { recursive: true });
      await writeFile(join(ctx.home, 'people', 'sam-example-com.md'), 'key: sam@example.com\n', 'utf8');
      return 'wrote two';
    });

    assert.equal(outcome.value, 'wrote two');
    assert.equal(outcome.versionAfter, before + 1);
    assert.deepEqual(await pathsInRecord(), ['founder-brain.md', 'people/sam-example-com.md']);
    // The Brain is the one file this layer parses, and the column is a cache of it.
    assert.equal(outcome.trackAfter, 'b2b');
    assert.equal(await readFile(epochPath(FOUNDER), 'utf8'), `${outcome.versionAfter}\n`);
  });

  it('rebuilds the folder from the record when the container has never seen the founder', async () => {
    // The container filesystem is a cache and is not durable. A founder's second turn
    // may land somewhere that has never seen them, and without the rebuild ge index
    // would tell them their work is gone while it sits safely in the database.
    await rm(founderRoot(FOUNDER), { recursive: true, force: true });
    const outcome = await runTurn({ founderId: FOUNDER, actor: 'system', verb: 'read' }, async () => null);
    assert.equal(outcome.rebuilt, true);
    assert.equal(await exists(join(geHome(FOUNDER), 'people', 'sam-example-com.md')), true);
    // Nothing changed, so nothing was spent: the version stays where it was.
    assert.equal(outcome.versionAfter, outcome.versionBefore);
  });

  it('THE REFUSAL, END TO END: an unexplained absence rolls the record back untouched', async () => {
    const versionBefore = await versionOf();
    const recordBefore = await pathsInRecord();

    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'system', verb: 'break' }, async (ctx) => {
          // A ge_file row for a path materialise never wrote and that is not on disk.
          // That is exactly the shape of a materialise bug, and it is the one an
          // ordinary harvest cannot tell apart from a deletion without the
          // materialised set.
          //
          // Planted through ctx.read, which opens a short founder scoped transaction
          // of its own. That is not a detail. The work no longer runs inside the
          // turn's transaction, so this row is COMMITTED the moment it is written and
          // the turn's own rollback cannot take it away. The assertions below account
          // for exactly this one planted row and for nothing else, and the cleanup
          // removes it so the tests after this one see the record they expect.
          await ctx.read(async (tx) => {
            await tx.insert(geFile).values({
              founderId: ctx.founderId,
              path: 'people/never-materialised.md',
              blobSha: 'd'.repeat(64),
              sizeBytes: 10,
              mtime: new Date(),
              version: ctx.version,
            });
          });
          return null;
        }),
      (err: unknown) => {
        assert.ok(err instanceof HarvestRefused, `expected HarvestRefused, got ${String(err)}`);
        assert.equal(err.code, 'unexplained_absence');
        assert.equal(err.subject, 'people/never-materialised.md');
        return true;
      },
    );

    assert.equal(await versionOf(), versionBefore, 'the version moved on a refused turn');
    assert.deepEqual(
      await pathsInRecord(),
      [...recordBefore, 'people/never-materialised.md'].sort(),
      'the refused turn changed something other than the row the test planted',
    );
    assert.equal(await exists(founderRoot(FOUNDER)), false, 'the folder survived a refused turn');
    assert.equal(await exists(epochPath(FOUNDER)), false, 'the epoch survived a refused turn');

    // Take the planted row away, so the next test is looking at the record the
    // founder actually has.
    await getDb().transaction(async (tx) => {
      await setFounderScope(tx, FOUNDER);
      await tx
        .delete(geFile)
        .where(and(eq(geFile.founderId, FOUNDER), eq(geFile.path, 'people/never-materialised.md')));
    });
    assert.deepEqual(await pathsInRecord(), recordBefore, 'the cleanup did not put the record back');
  });

  it('the founder can carry on straight afterwards, with everything they had', async () => {
    // The sentence the screen shows is "try again, your data is untouched". This is
    // that sentence, checked.
    const outcome = await runTurn({ founderId: FOUNDER, actor: 'system', verb: 'retry' }, async (ctx) => {
      await writeFile(join(ctx.home, 'ledger.md'), '# Ledger\n', 'utf8');
      return null;
    });
    assert.equal(outcome.rebuilt, true);
    assert.deepEqual(await pathsInRecord(), [
      'founder-brain.md',
      'ledger.md',
      'people/sam-example-com.md',
    ]);
  });

  it('records a deletion when the work removes a file materialise DID write', async () => {
    await runTurn({ founderId: FOUNDER, actor: 'ge', verb: 'person purge' }, async (ctx) => {
      await rm(join(ctx.home, 'people', 'sam-example-com.md'), { force: true });
      return null;
    });
    assert.deepEqual(await pathsInRecord(), ['founder-brain.md', 'ledger.md']);
  });
  it('THE WRITE THE WORK MAY NOT DO: ctx.tx refuses, and says which handle to use', async () => {
    // ctx.tx used to be the turn's open transaction. It is a read handle on the pool
    // now, because the turn does not hold a transaction across the run any more. Both
    // refusals below are things that would otherwise be silent: a write that never
    // rolls back, and a read that comes back empty because no SET LOCAL named the
    // founder, which looks exactly like a founder's data being gone.
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'system', verb: 'probe' }, async (ctx) => {
          await ctx.tx.insert(geFile).values({
            founderId: ctx.founderId,
            path: 'people/nope.md',
            blobSha: 'e'.repeat(64),
            sizeBytes: 1,
            mtime: new Date(),
            version: ctx.version,
          });
          return null;
        }),
      (err: unknown) => {
        assert.ok(err instanceof TurnRefused, `expected TurnRefused, got ${String(err)}`);
        assert.equal(err.code, 'turn_context_write');
        return true;
      },
    );

    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'system', verb: 'probe' }, async (ctx) => {
          await ctx.tx.select({ path: geFile.path }).from(geFile);
          return null;
        }),
      (err: unknown) => {
        assert.ok(err instanceof TurnRefused, `expected TurnRefused, got ${String(err)}`);
        assert.equal(err.code, 'turn_context_unscoped_read');
        return true;
      },
    );

    // And the scoped handle does the same read correctly, rather than emptily.
    const seen = await runTurn({ founderId: FOUNDER, actor: 'system', verb: 'probe' }, (ctx) =>
      ctx.read(async (tx) => {
        const rows = await tx.select({ path: geFile.path }).from(geFile).where(eq(geFile.founderId, FOUNDER));
        return rows.map((r) => r.path).sort();
      }),
    );
    assert.deepEqual(seen.value, await pathsInRecord());
  });

});
