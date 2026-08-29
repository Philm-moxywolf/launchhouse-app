/**
 * src/server/storage/harvest.test.ts
 *
 * WHAT THIS IS. The rule that decides whether a founder keeps a file or loses it,
 * under test, with no database and no ge spawn.
 *
 * WHY IT EXISTS. diffFiles holds one branch that must never be got wrong: a ge_file
 * row with no file on disk means ge deleted it if the path was materialised, and means
 * data loss in progress if it was not. Those need opposite responses and they look
 * identical. If that branch were only reachable through a live Postgres and a real
 * spawn, it would get tested once and never again.
 *
 * WHAT IT CALLS. src/server/storage/harvest.ts and paths.ts. Nothing else.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffFiles, HarvestRefused, type StoredFile } from './harvest.ts';

const T0 = new Date('2026-09-19T10:00:00.000Z');
const T1 = new Date('2026-09-19T11:00:00.000Z');

function disk(rel: string, sha: string, mtime = T0, size = 100) {
  return { rel, sha, size, mtime };
}

function storedMap(entries: Array<[string, string, Date?]>): Map<string, StoredFile> {
  return new Map(entries.map(([path, sha, mtime]) => [path, { sha, mtime: mtime ?? T0 }]));
}

describe('diffFiles', () => {
  it('calls a file with no row new', () => {
    const { changes } = diffFiles({
      onDisk: [disk('founder-brain.md', 'aaa')],
      stored: storedMap([]),
      materialisedPaths: new Set(),
    });
    assert.deepEqual(changes, [
      { path: 'founder-brain.md', kind: 'new', sha: 'aaa', sizeBytes: 100, mtime: T0 },
    ]);
  });

  it('calls a different sha changed', () => {
    const { changes } = diffFiles({
      onDisk: [disk('ledger.md', 'bbb')],
      stored: storedMap([['ledger.md', 'aaa']]),
      materialisedPaths: new Set(['ledger.md']),
    });
    assert.equal(changes.length, 1);
    assert.equal(changes[0]?.kind, 'changed');
  });

  it('leaves an identical file completely alone', () => {
    const { changes, unchangedCount, mtimeResets } = diffFiles({
      onDisk: [disk('ledger.md', 'aaa')],
      stored: storedMap([['ledger.md', 'aaa']]),
      materialisedPaths: new Set(['ledger.md']),
    });
    assert.deepEqual(changes, []);
    assert.equal(unchangedCount, 1);
    assert.deepEqual(mtimeResets, []);
  });

  it('records a modification time to put back when ge rewrote a file with the same words', () => {
    // ge index rewrites .state/index.md on every run. Without the reset a founder sees
    // every file marked as changed today that nobody changed.
    const { changes, mtimeResets } = diffFiles({
      onDisk: [disk('.state/index.md', 'aaa', T1)],
      stored: storedMap([['.state/index.md', 'aaa', T0]]),
      materialisedPaths: new Set(['.state/index.md']),
    });
    assert.deepEqual(changes, []);
    assert.deepEqual(mtimeResets, [{ path: '.state/index.md', mtime: T0 }]);
  });

  it('calls an absence a deletion WHEN materialise wrote the file', () => {
    const { changes } = diffFiles({
      onDisk: [],
      stored: storedMap([['people/sam-example-com.md', 'aaa']]),
      materialisedPaths: new Set(['people/sam-example-com.md']),
    });
    assert.deepEqual(changes, [
      { path: 'people/sam-example-com.md', kind: 'deleted', sha: null, sizeBytes: 0, mtime: null },
    ]);
  });

  it('THE REFUSAL: an absence materialise never wrote rolls the turn back', () => {
    let thrown: unknown;
    try {
      diffFiles({
        onDisk: [],
        stored: storedMap([['people/sam-example-com.md', 'aaa']]),
        materialisedPaths: new Set(),
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof HarvestRefused, `expected a HarvestRefused, got ${String(thrown)}`);
    assert.equal((thrown as HarvestRefused).code, 'unexplained_absence');
    assert.equal((thrown as HarvestRefused).subject, 'people/sam-example-com.md');
  });

  it('refuses on the FIRST unexplained absence rather than deleting the rest', () => {
    assert.throws(() =>
      diffFiles({
        onDisk: [disk('founder-brain.md', 'aaa')],
        stored: storedMap([
          ['founder-brain.md', 'aaa'],
          ['people/one.md', 'bbb'],
          ['people/two.md', 'ccc'],
        ]),
        materialisedPaths: new Set(['founder-brain.md', 'people/one.md']),
      }), HarvestRefused);
  });

  it('leaves an excluded path alone rather than deleting its row', () => {
    // .state/memory.lock is never walked, so its absence from the disk list proves
    // nothing. Deleting the row would be acting on no evidence.
    const { changes } = diffFiles({
      onDisk: [],
      stored: storedMap([['.state/memory.lock', 'aaa']]),
      materialisedPaths: new Set(),
    });
    assert.deepEqual(changes, []);
  });

  it('handles the whole shape of one ge person touch: a file changed and a snapshot added', () => {
    // One verb can touch several files, which is why the harvest hashes rather than
    // trying to track writes.
    const { changes, unchangedCount } = diffFiles({
      onDisk: [
        disk('people/sam-example-com.md', 'new-sha'),
        disk('.state/snapshots/people__sam-example-com.md.20260919T100000Z', 'old-sha'),
        disk('founder-brain.md', 'brain'),
      ],
      stored: storedMap([
        ['people/sam-example-com.md', 'old-sha'],
        ['founder-brain.md', 'brain'],
      ]),
      materialisedPaths: new Set(['people/sam-example-com.md', 'founder-brain.md']),
    });
    const byKind = Object.fromEntries(changes.map((c) => [c.path, c.kind]));
    assert.equal(byKind['people/sam-example-com.md'], 'changed');
    assert.equal(byKind['.state/snapshots/people__sam-example-com.md.20260919T100000Z'], 'new');
    assert.equal(unchangedCount, 1);
    // The snapshot's bytes are identical to a version already stored. Content
    // addressing is what makes that cost one row and no new blob.
    const snapshot = changes.find((c) => c.path.startsWith('.state/snapshots/'));
    assert.equal(snapshot?.sha, 'old-sha');
  });

  it('does nothing at all on a turn that read and wrote nothing', () => {
    const stored = storedMap([
      ['founder-brain.md', 'a'],
      ['ledger.md', 'b'],
    ]);
    const { changes, unchangedCount } = diffFiles({
      onDisk: [disk('founder-brain.md', 'a'), disk('ledger.md', 'b')],
      stored,
      materialisedPaths: new Set(stored.keys()),
    });
    assert.deepEqual(changes, []);
    assert.equal(unchangedCount, 2);
  });
});
