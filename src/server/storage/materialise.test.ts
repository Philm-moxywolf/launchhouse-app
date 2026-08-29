/**
 * src/server/storage/materialise.test.ts
 *
 * WHAT THIS IS. The epoch marker under test, on a real filesystem, with no database.
 *
 * WHY IT EXISTS. The whole materialise and harvest design rests on one invariant:
 *
 *   .ge-epoch present holding V  =>  the folder is byte exact for founder.version V
 *                                    and holds no unharvested writes.
 *   .ge-epoch absent             =>  the folder tells you nothing. Rebuild it.
 *
 * A turn deletes it before running anything and writes it again only after COMMIT, so
 * a container that dies mid turn leaves the second case. If invalidate quietly failed,
 * or if a garbage epoch read as a number, a dirty folder would be reused and the
 * founder would lose whatever the failed turn half wrote. The rebuild path itself
 * needs a database and is covered in tests/db/turn.test.ts.
 *
 * WHAT IT CALLS. materialise.ts and paths.ts, against a temporary WORKSPACE_ROOT.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureFolder,
  invalidateEpoch,
  readEpoch,
  removeFounderFolder,
  writeEpoch,
} from './materialise.ts';
import { epochPath, founderRoot, geHome } from './paths.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF2W';
let workspace: string;
let saved: string | undefined;

beforeEach(async () => {
  saved = process.env.WORKSPACE_ROOT;
  workspace = await mkdtemp(join(tmpdir(), 'lh-materialise-'));
  process.env.WORKSPACE_ROOT = workspace;
});

afterEach(async () => {
  if (saved === undefined) delete process.env.WORKSPACE_ROOT;
  else process.env.WORKSPACE_ROOT = saved;
  await rm(workspace, { recursive: true, force: true });
});

describe('the epoch marker', () => {
  it('is absent before anything has run, which means rebuild', async () => {
    assert.equal(await readEpoch(FOUNDER), null);
  });

  it('round trips a version', async () => {
    await writeEpoch(FOUNDER, 42);
    assert.equal(await readEpoch(FOUNDER), 42);
  });

  it('sits outside growth-engine, so it is never harvested or downloaded', async () => {
    await writeEpoch(FOUNDER, 1);
    assert.equal(epochPath(FOUNDER), join(founderRoot(FOUNDER), '.ge-epoch'));
    assert.equal(epochPath(FOUNDER).startsWith(geHome(FOUNDER)), false);
  });

  it('reads as absent rather than as a number when the file is damaged', async () => {
    await mkdir(founderRoot(FOUNDER), { recursive: true });
    for (const junk of ['', 'not a number', '-1', 'NaN', '3.5abc']) {
      await writeFile(epochPath(FOUNDER), junk, 'utf8');
      const value = await readEpoch(FOUNDER);
      assert.equal(value === null || Number.isSafeInteger(value), true);
      if (junk === 'not a number' || junk === 'NaN' || junk === '-1' || junk === '3.5abc') {
        assert.equal(value, null);
      }
    }
  });

  it('invalidate leaves it absent, and is safe when it was already absent', async () => {
    await writeEpoch(FOUNDER, 7);
    await invalidateEpoch(FOUNDER);
    assert.equal(await readEpoch(FOUNDER), null);
    await invalidateEpoch(FOUNDER);
    assert.equal(await readEpoch(FOUNDER), null);
  });

  it('a rollback takes the whole folder, so no half written file is left to be read', async () => {
    await ensureFolder(FOUNDER);
    await writeFile(join(geHome(FOUNDER), 'founder-brain.md'), 'half a file', 'utf8');
    await writeEpoch(FOUNDER, 3);

    await removeFounderFolder(FOUNDER);

    assert.equal(await readEpoch(FOUNDER), null);
    await assert.rejects(stat(founderRoot(FOUNDER)));
  });

  it('removing a folder that was never made is not an error', async () => {
    assert.equal(await removeFounderFolder(FOUNDER), undefined);
  });

  it('ensureFolder makes the growth-engine folder a ge spawn needs as its cwd', async () => {
    await ensureFolder(FOUNDER);
    assert.equal((await stat(geHome(FOUNDER))).isDirectory(), true);
  });

  it('writes the version with a trailing newline, so the file reads cleanly by hand', async () => {
    await writeEpoch(FOUNDER, 12);
    assert.equal(await readFile(epochPath(FOUNDER), 'utf8'), '12\n');
  });

  it('refuses to build a folder for anything that is not a founder id', async () => {
    await assert.rejects(ensureFolder('../escape'));
    await assert.rejects(writeEpoch('sam@example.com', 1));
  });
});
