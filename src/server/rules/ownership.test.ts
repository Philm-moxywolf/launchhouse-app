/**
 * ownership.test.ts: rule 4.
 *
 * WHY IT EXISTS: the ways rule 4 breaks are quiet, so the tests have to be
 *   explicit about each of them. The last group is the ported version of
 *   `tests/cases/26-founder-prose.sh`: the founder's own writing, awkward in
 *   the ways real writing is, compared to the byte after a write.
 *
 * CALLED BY: node --test.
 * READS:     the content repo, for the file list and the schema paths.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOwnership, visiblePaths } from './ownership.ts';
import type { Artifact } from './types.ts';

function at(path: string, text = 'content\n'): Artifact {
  return { path, text, authored: 'model' };
}

test('the files a founder is meant to have are all visible', () => {
  for (const path of ['founder-brain.md', 'content-30.md', 'content-30.csv', 'ledger.md', 'memory.md', 'ops-log.md']) {
    assert.deepEqual(checkOwnership(at(path)).violations, [], path);
  }
});

test('the state files are visible too, read from the schemas', () => {
  for (const path of ['.state/index.md', '.state/receipt.md', '.state/ghl-accounts.md']) {
    assert.deepEqual(checkOwnership(at(path)).violations, [], path);
  }
});

test('a path outside the folder is refused', () => {
  const result = checkOwnership(at('../secrets.md'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'ownership.escapes-folder');
});

test('an absolute path is refused', () => {
  assert.equal(checkOwnership(at('/etc/passwd')).violations[0]?.code, 'ownership.absolute-path');
});

test('a Windows style path is refused', () => {
  const result = checkOwnership(at('people\\sam.md'));
  assert.ok(result.violations.some((v) => v.code === 'ownership.backslash-path'));
});

test('a file nothing lists is refused, because the founder could never see it', () => {
  const result = checkOwnership(at('scratch-notes.md'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'ownership.not-listed');
  assert.match(result.violations[0]?.why ?? '', /built from a list/);
});

test('a person file named by the derive rule is visible', () => {
  for (const name of ['sam-northfield-io.md', 'ig-lumen-skin.md', 'helen-makes.md']) {
    assert.deepEqual(checkOwnership(at(`people/${name}`)).violations, [], name);
  }
});

test('a person file named any other way is refused', () => {
  for (const name of ['Sam Okoye.md', 'sam@northfield.io.md', 'sam_northfield.md', '-sam-.md']) {
    const result = checkOwnership(at(`people/${name}`));
    assert.equal(
      result.violations[0]?.code,
      'ownership.unlistable-person-file',
      `${name} should not be listable`,
    );
  }
});

test('a person file name longer than the rule allows is refused', () => {
  const long = `${'a'.repeat(61)}.md`;
  assert.equal(
    checkOwnership(at(`people/${long}`)).violations[0]?.code,
    'ownership.unlistable-person-file',
  );
});

/* The ported case 26: the founder's own writing, held to the byte. */

const THEIR_WRITING = [
  'Handover is the whole thing.   ',
  '',
  'Zoe said it first, in the Tuesday session.',
  '\tthe tab here is on purpose',
  '- 2026-01-01 this looks like one of ge entries and is mine',
  '',
  '### My own heading',
  'Still mine.',
].join('\n');

function personFile(theirs: string, touch: string): string {
  return [
    '<!-- Written by ge person. -->',
    'key: sam@northfield.io',
    'kind: prospect',
    '',
    '## Touch log',
    '<!-- GE:TOUCH:START -->',
    touch,
    '<!-- GE:TOUCH:END -->',
    '',
    '## Yours',
    theirs,
  ].join('\n');
}

test('a write that leaves the founder\'s own section alone passes', () => {
  const before = personFile(THEIR_WRITING, '- 2026-08-27 email out: sent the opener');
  const after = personFile(THEIR_WRITING, '- 2026-08-27 email out: sent the opener\n- 2026-08-28 email in: replied');
  const result = checkOwnership(
    { path: 'people/sam-northfield-io.md', text: after, authored: 'model' },
    { previous: before },
  );
  assert.deepEqual(result.violations, []);
});

test('tidying up the founder\'s own section is refused', () => {
  const before = personFile(THEIR_WRITING, '- 2026-08-27 email out: sent the opener');
  // Exactly what a careless rewrite does: the trailing spaces go and the tab
  // becomes spaces. Nothing a founder can see changed, and it is still theirs.
  const tidied = THEIR_WRITING.replace('thing.   ', 'thing.').replace('\t', '    ');
  const after = personFile(tidied, '- 2026-08-27 email out: sent the opener');
  const result = checkOwnership(
    { path: 'people/sam-northfield-io.md', text: after, authored: 'model' },
    { previous: before },
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'ownership.rewrote-yours');
  assert.match(result.violations[0]?.why ?? '', /exactly as you left them/);
});

test('rewriting the founder\'s prose outside the markers is surfaced', () => {
  const before = personFile(THEIR_WRITING, '- 2026-08-27 email out: sent');
  const after = before.replace('key: sam@northfield.io', 'key: sam@northfield.io ');
  const result = checkOwnership(
    { path: 'people/sam-northfield-io.md', text: after, authored: 'model' },
    { previous: before },
  );
  assert.ok(result.violations.some((v) => v.code === 'ownership.rewrote-outside-markers'));
});

test('with no earlier version, the check says so rather than passing quietly', () => {
  const result = checkOwnership(at('memory.md', 'anything'));
  assert.match(result.notes.join(' '), /no earlier version/);
});

test('the founder editing their own file is never the app rewriting it', () => {
  const before = personFile(THEIR_WRITING, '- 2026-08-27 email out: sent');
  const after = personFile('I changed my mind about all of this.', '- 2026-08-27 email out: sent');
  const result = checkOwnership(
    { path: 'people/sam-northfield-io.md', text: after, authored: 'founder' },
    { previous: before },
  );
  assert.deepEqual(result.violations, []);
});

test('the visible list forks on track, so neither founder sees the other track', () => {
  const b2b = visiblePaths('b2b');
  const b2c = visiblePaths('b2c');
  assert.ok(b2b.includes('outreach-sequence.md'));
  assert.ok(!b2b.includes('hook-bank.md'));
  assert.ok(b2c.includes('hook-bank.md'));
  assert.ok(!b2c.includes('outreach-sequence.md'));
  for (const both of ['founder-brain.md', 'content-30.md', 'ledger.md']) {
    assert.ok(b2b.includes(both) && b2c.includes(both), both);
  }
});

test('before a track is chosen, neither track\'s session 3 files are listed', () => {
  const none = visiblePaths(null);
  assert.ok(!none.includes('outreach-sequence.md'));
  assert.ok(!none.includes('hook-bank.md'));
  assert.ok(none.includes('founder-brain.md'));
});

test('every refusal ends on a way out', () => {
  for (const path of ['../x.md', '/etc/passwd', 'scratch.md', 'people/Bad Name.md']) {
    for (const v of checkOwnership(at(path)).violations) {
      assert.ok(v.recovery.label.length > 0, path);
    }
  }
});
