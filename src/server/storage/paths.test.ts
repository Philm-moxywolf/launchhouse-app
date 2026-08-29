/**
 * src/server/storage/paths.test.ts
 *
 * WHAT THIS IS. The tenancy boundary under test.
 *
 * WHY IT EXISTS. paths.ts is the only thing between a string that arrived from a model
 * Write, a download URL or a founder's own typing and a file on disk. Every case below
 * is a way somebody has escaped a directory somewhere. The assertions are negative on
 * purpose: the strongest thing to prove about this file is what it refuses.
 *
 * WHAT IT CALLS. src/server/storage/paths.ts only. No database, no filesystem.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFounderId,
  assertSafeRelPath,
  founderRoot,
  geHome,
  isExcludedPath,
  isPersonFile,
  personFilePath,
  personSlug,
  PathRefused,
  relFromGeHome,
  resolveInGeHome,
} from './paths.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF2W';

describe('assertFounderId', () => {
  it('takes a ULID', () => {
    assert.equal(assertFounderId(FOUNDER), FOUNDER);
  });

  // One test per row, so a failure names the case rather than the loop.
  for (const [what, value] of [
    ['an email address', 'sam@example.com'],
    ['a path walk', '../other'],
    ['a slash', 'aa/bb'],
    ['too short', '01J8ZQTMK4NRC7XVYB3D9GHF2'],
    ['too long', `${FOUNDER}X`],
    ['lower case', FOUNDER.toLowerCase()],
    ['the letter I, which Crockford base32 leaves out', '01J8ZQTMK4NRC7XVYB3D9GHF2I'],
    ['empty', ''],
  ] as const) {
    it(`refuses ${what}`, () => {
      assert.throws(() => assertFounderId(value), PathRefused);
    });
  }
});

describe('assertSafeRelPath', () => {
  for (const rel of [
    'founder-brain.md',
    'people/sam-example-com.md',
    '.state/index.md',
    '.state/snapshots/ledger.md.20260827T021256Z',
    '.state/snapshots/people__sam-example-com.md.20260827T021255Z',
    'voice-samples/a note with spaces.md',
    '.gitignore',
  ] as const) {
    it(`allows ${rel}`, () => {
      assert.equal(assertSafeRelPath(rel), rel);
    });
  }

  for (const [what, rel] of [
    ['absolute', '/etc/passwd'],
    ['a parent walk', '../../etc/passwd'],
    ['a parent walk in the middle', 'people/../../etc/passwd'],
    ['a bare dot segment', './founder-brain.md'],
    ['an empty segment', 'people//sam.md'],
    ['a backslash', 'people\\sam.md'],
    ['a drive letter', 'C:/windows/system32'],
    ['a trailing slash', 'people/'],
    ['a leading dash, which ge would read as a flag', '-rf.md'],
    ['a leading dash inside a folder', 'people/-x.md'],
    ['a trailing space, which a founder cannot see in a file list', 'brain.md '],
    ['a trailing space on a folder segment', 'people /sam.md'],
    ['a trailing dot', 'brain.md.'],
    ['a tab', 'brain\t.md'],
    ['a newline', 'brain\n.md'],
    ['a null byte', 'ok.md\u0000../../etc/passwd'],
    ['a delete character', 'ok\u007f.md'],
    ['empty', ''],
  ] as const) {
    it(`refuses ${what}`, () => {
      assert.throws(() => assertSafeRelPath(rel), PathRefused);
    });
  }

  it('refuses a path longer than the cap', () => {
    assert.throws(() => assertSafeRelPath(`${'a'.repeat(500)}.md`), PathRefused);
  });
});

describe('resolveInGeHome', () => {
  it('lands inside the founder folder', () => {
    const abs = resolveInGeHome(FOUNDER, 'people/sam-example-com.md');
    assert.equal(abs.startsWith(geHome(FOUNDER)), true);
    assert.equal(abs.endsWith('/growth-engine/people/sam-example-com.md'), true);
  });

  it('refuses to leave it, however the escape is spelled', () => {
    assert.throws(() => resolveInGeHome(FOUNDER, '../../../etc/passwd'), PathRefused);
    assert.throws(() => resolveInGeHome(FOUNDER, '/etc/passwd'), PathRefused);
  });

  it('never lets one founder name another founder folder', () => {
    const other = '01J8ZQTMK4NRC7XVYB3D9GHF2X';
    assert.notEqual(founderRoot(FOUNDER), founderRoot(other));
    assert.throws(() => resolveInGeHome(FOUNDER, `../../${other}/growth-engine/people/x.md`), PathRefused);
  });
});

describe('relFromGeHome', () => {
  it('is the inverse of resolveInGeHome', () => {
    const rel = 'people/sam-example-com.md';
    assert.equal(relFromGeHome(FOUNDER, resolveInGeHome(FOUNDER, rel)), rel);
  });

  it('refuses a path from outside the folder', () => {
    assert.throws(() => relFromGeHome(FOUNDER, '/etc/passwd'), PathRefused);
  });
});

describe('isExcludedPath', () => {
  it('excludes the memory lock, because a harvested lock never unlocks', () => {
    assert.equal(isExcludedPath('.state/memory.lock'), true);
  });

  it('excludes a half written temporary file', () => {
    assert.equal(isExcludedPath('ledger.md.ge-tmp.4321'), true);
    assert.equal(isExcludedPath('.state/index.md.ge-tmp.99'), true);
  });

  it('KEEPS .state/undone, which is what makes pressing undo twice safe', () => {
    assert.equal(isExcludedPath('.state/undone'), false);
  });

  it('KEEPS snapshots, because content addressing makes them nearly free', () => {
    assert.equal(isExcludedPath('.state/snapshots/ledger.md.20260827T021256Z'), false);
  });

  it('keeps every ordinary founder file', () => {
    for (const rel of ['founder-brain.md', 'content-30.md', 'people/sam-example-com.md', '.state/index.md']) {
      assert.equal(isExcludedPath(rel), false);
    }
  });
});

describe('personSlug, the derive rule from schemas/person.md', () => {
  it('matches the two worked examples in the schema', () => {
    assert.equal(personSlug('sam@example.com'), 'sam-example-com');
    assert.equal(personSlug('ig:lumen.skin'), 'ig-lumen-skin');
  });

  it('lower cases, collapses runs of dashes and trims them', () => {
    assert.equal(personSlug('Sam...@@@Example.COM'), 'sam-example-com');
    assert.equal(personSlug('---sam---'), 'sam');
  });

  it('cuts to 60 characters and does not leave a trailing dash behind', () => {
    const slug = personSlug(`${'a'.repeat(59)}@example.com`);
    assert.ok(slug.length <= 60, `the slug is ${slug.length} characters, over the 60 cap`);
    assert.equal(slug.endsWith('-'), false);
  });

  it('builds a people path that passes the path check', () => {
    const rel = personFilePath('sam@example.com');
    assert.equal(rel, 'people/sam-example-com.md');
    assert.equal(assertSafeRelPath(rel), rel);
    assert.equal(isPersonFile(rel), true);
  });

  it('refuses a key that derives nothing', () => {
    assert.throws(() => personFilePath('@@@'), PathRefused);
  });
});
