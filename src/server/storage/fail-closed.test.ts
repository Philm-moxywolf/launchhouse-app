/**
 * src/server/storage/fail-closed.test.ts
 *
 * WHAT THIS IS. The rule, executed: anything written to the container filesystem that
 * has not been harvested into Postgres is already lost, so an absence nobody can
 * explain refuses the turn instead of quietly dropping a founder's file.
 *
 * WHY IT EXISTS. harvest.test.ts already proves the DECISION, as a pure function over
 * three arguments. It does not prove that the decision is reached before anything is
 * written, and it does not prove that a refused turn leaves nothing behind on disk.
 * Those two are the difference between a rule and a rule that holds, and neither of
 * them needs Postgres to check:
 *
 *   1. planHarvest refuses on a real folder, having read a real directory tree, and
 *      applyHarvest is never reached. A limit or a refusal checked after the first
 *      INSERT is a refusal that leaves half a turn in the database.
 *
 *   2. runTurn removes the founder's folder when anything throws. Not tidiness: a
 *      folder holding uncommitted writes with no epoch would be rebuilt anyway, and
 *      removing it means a bug that left half a file behind cannot be read by the
 *      next turn.
 *
 *   3. The epoch goes with it, so the next turn rebuilds from the record rather than
 *      trusting what is on disk.
 *
 * THE FAKES ARE SMALL AND THEY ARE HONEST. The database handle here answers exactly
 * the calls the code under test makes and throws on any write, which is the assertion
 * rather than a convenience. The end to end version of the same guarantee, against a
 * real Postgres and a real ROLLBACK, is turn.db.test.ts, which skips when there is no
 * DATABASE_URL.
 *
 * WHAT IT CALLS. storage/harvest.ts, storage/turn.ts, storage/paths.ts, and the
 * filesystem. No database, no ge spawn, no model.
 */

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Db, Queryable } from '../db/client.ts';
import { HarvestRefused, harvest } from './harvest.ts';
import type { MaterialisedSet } from './materialise.ts';
import { epochPath, founderRoot, geHome } from './paths.ts';
import { runTurn, TurnRefused } from './turn.ts';
import type { DataKey } from './crypto.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF30';

let workspace: string;
let savedWorkspaceRoot: string | undefined;

beforeEach(async () => {
  savedWorkspaceRoot = process.env.WORKSPACE_ROOT;
  workspace = await mkdtemp(join(tmpdir(), 'lh-failclosed-'));
  process.env.WORKSPACE_ROOT = workspace;
  await mkdir(geHome(FOUNDER), { recursive: true });
});

afterEach(async () => {
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

/** A key shaped value. Nothing here reaches the cipher, because nothing here writes. */
const NEVER_USED_KEY = Buffer.alloc(32, 7) as unknown as DataKey;

interface StoredRow {
  path: string;
  blobSha: string;
  mtime: Date;
}

/**
 * A database handle that can answer the one SELECT planHarvest makes and refuses
 * every write.
 *
 * The refusal IS the assertion. If applyHarvest is ever reached on a turn that should
 * have been refused, the test fails with the sentence below rather than with a
 * confusing type error.
 */
function readOnlyTx(rows: StoredRow[]): Queryable {
  const refuse = (): never => {
    throw new Error('applyHarvest was reached on a turn that should have been refused before any write');
  };
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
    insert: refuse,
    update: refuse,
    delete: refuse,
    execute: refuse,
  } as unknown as Queryable;
}

function materialisedSet(paths: string[]): MaterialisedSet {
  return { founderId: FOUNDER, version: 1, paths: new Set(paths), rebuilt: true };
}

describe('the harvest refuses before it writes anything', () => {
  it('REFUSES AN UNEXPLAINED ABSENCE on a real folder, and reaches no INSERT', async () => {
    // founder-brain.md is on disk and stored, so it is unchanged. The person file is
    // stored, is not on disk, and materialise never wrote it. That second one is data
    // loss in progress and it is the whole reason this branch exists.
    await writeFile(join(geHome(FOUNDER), 'founder-brain.md'), '- **Track:** b2b\n', 'utf8');
    const tx = readOnlyTx([
      { path: 'founder-brain.md', blobSha: 'a'.repeat(64), mtime: new Date(0) },
      { path: 'people/sam-example-com.md', blobSha: 'b'.repeat(64), mtime: new Date(0) },
    ]);

    await assert.rejects(
      () =>
        harvest(tx, {
          founderId: FOUNDER,
          dataKey: NEVER_USED_KEY,
          materialised: materialisedSet(['founder-brain.md']),
          version: 2,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HarvestRefused, `expected HarvestRefused, got ${String(err)}`);
        assert.equal(err.code, 'unexplained_absence');
        assert.equal(err.subject, 'people/sam-example-com.md');
        return true;
      },
    );
  });

  it('refuses a file name it cannot store, as a refusal a surface can render', async () => {
    // The model has Write and Edit, so it can name a file anything, and an
    // apostrophe in a title is the ordinary way this happens rather than an attack.
    // paths.ts refuses the name; what matters here is that the refusal arrives as a
    // HarvestRefused with a subject, and not as a bare PathRefused nothing switches
    // on. The turn is refused either way, which is the correct half.
    await writeFile(join(geHome(FOUNDER), "sam's notes.md"), 'anything\n', 'utf8');
    await assert.rejects(
      () =>
        harvest(readOnlyTx([]), {
          founderId: FOUNDER,
          dataKey: NEVER_USED_KEY,
          materialised: materialisedSet([]),
          version: 2,
        }),
      (err: unknown) => {
        assert.ok(err instanceof HarvestRefused, `expected HarvestRefused, got ${String(err)}`);
        assert.equal(err.code, 'bad_path');
        assert.equal(err.subject, "sam's notes.md");
        return true;
      },
    );
  });

  it('calls the same absence a deletion when materialise DID write the file', async () => {
    // The two look identical on disk and need opposite responses. This is the other
    // side of the branch above, run through the same real folder walk, so a change
    // that broke the distinction could not pass one and fail the other.
    const tx = readOnlyTx([{ path: 'ledger.md', blobSha: 'c'.repeat(64), mtime: new Date(0) }]);
    await assert.rejects(
      () =>
        harvest(tx, {
          founderId: FOUNDER,
          dataKey: NEVER_USED_KEY,
          materialised: materialisedSet(['ledger.md']),
          version: 2,
        }),
      // It gets past the refusal and into applyHarvest, where the read only handle
      // refuses. Reaching the write is the pass condition here.
      /applyHarvest was reached/,
    );
  });
});

describe('a refused turn leaves nothing on disk', () => {
  /** A handle whose transaction fails, which is every failure from BEGIN to COMMIT. */
  function failingDb(how: 'at-begin' | 'inside'): Db {
    if (how === 'at-begin') {
      return {
        transaction: async () => {
          throw new TurnRefused('connection_lost', 'the connection went away before BEGIN');
        },
      } as unknown as Db;
    }
    return {
      transaction: async (fn: (tx: Queryable) => Promise<unknown>) => {
        const tx = {
          execute: async () => {
            throw new TurnRefused('statement_failed', 'the first statement of the turn failed');
          },
        } as unknown as Queryable;
        return fn(tx);
      },
    } as unknown as Db;
  }

  for (const how of ['at-begin', 'inside'] as const) {
    it(`removes the founder folder when the turn fails ${how}`, async () => {
      await writeFile(join(geHome(FOUNDER), 'ledger.md'), 'half a turn\n', 'utf8');
      await writeFile(epochPath(FOUNDER), '4\n', 'utf8');

      await assert.rejects(
        () =>
          runTurn({ founderId: FOUNDER, actor: 'system', verb: 'test', db: failingDb(how) }, async () => 'never'),
        TurnRefused,
      );

      assert.equal(await exists(founderRoot(FOUNDER)), false, 'the folder survived a refused turn');
      // Named separately because it is the invariant the next turn reads: an absent
      // epoch means the folder tells you nothing, so rebuild it.
      assert.equal(await exists(epochPath(FOUNDER)), false, 'the epoch survived a refused turn');
    });
  }

  it('does not stamp an epoch for a version that was never committed', async () => {
    await writeFile(epochPath(FOUNDER), '4\n', 'utf8');
    await assert.rejects(
      () => runTurn({ founderId: FOUNDER, actor: 'system', verb: 'test', db: failingDb('inside') }, async () => 1),
      TurnRefused,
    );
    // If writeEpoch ran on the failure path this would hold 5, and the next turn
    // would trust a folder that holds an uncommitted write.
    assert.equal(await exists(epochPath(FOUNDER)), false);
  });
});
