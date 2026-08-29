/**
 * labels.test.ts
 *
 * WHAT: Tests that tool activity reaches a founder as English, and that nothing
 *       from a tool input reaches them except a recognised file name.
 *
 * WHY IT EXISTS: The people folder holds real names and email addresses, about
 *       3,000 of them across the cohort. A status line that echoed a Grep
 *       pattern would put one on screen in a room with 130 people in it. This
 *       is the test that says it cannot.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/labels.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endLabel, friendlyFile, isFileWrite, startLabel } from './labels.js';

test('known files are named the way the sessions name them', () => {
  assert.equal(friendlyFile('growth-engine/founder-brain.md'), 'your Founder Brain');
  assert.equal(friendlyFile('/tmp/ge/01ABC/growth-engine/content-30.csv'), 'your content upload file');
  assert.equal(friendlyFile('growth-engine/.state/index.md'), 'your file list');
});

test('a person file is a person file and never a person', () => {
  const label = friendlyFile('growth-engine/people/sam-example-com.md');
  assert.equal(label, 'one of your people files');
  assert.ok(!label.includes('sam'));
});

test('an unknown path is not a label at all', () => {
  assert.equal(friendlyFile('/etc/passwd'), null);
  assert.equal(friendlyFile(''), null);
  assert.equal(friendlyFile(42), null);
});

test('windows separators still resolve', () => {
  assert.equal(friendlyFile('growth-engine\\founder-brain.md'), 'your Founder Brain');
});

test('a read of a known file reads as English', () => {
  assert.equal(
    startLabel('Read', { file_path: 'growth-engine/founder-brain.md' }),
    'Reading your Founder Brain',
  );
  assert.equal(
    endLabel('Write', { file_path: 'growth-engine/content-30.md' }),
    'Wrote your 30 content pieces',
  );
});

test('nothing from a grep pattern reaches the screen', () => {
  const input = { pattern: 'sam@example.com', path: '/tmp/ge/01ABC/growth-engine/people' };
  const line = startLabel('Grep', input);
  assert.ok(!line.includes('sam@example.com'));
  assert.ok(!line.includes('/tmp'));
  assert.equal(line, 'Looking through your folder');
});

test('an unrecognised path is described vaguely, never quoted', () => {
  const line = startLabel('Read', { file_path: '/etc/shadow' });
  assert.ok(!line.includes('/etc'));
  assert.equal(line, 'Reading one of your files');
});

test('an unknown tool says nothing about itself', () => {
  const line = startLabel('SomeToolWeDidNotShip', { anything: 'at all' });
  assert.equal(line, 'Working on it');
  assert.ok(!line.includes('SomeTool'));
});

test('the two ge tools have their own words', () => {
  assert.equal(startLabel('mcp__ge__remember', {}), 'Noting that down in your memory file');
  assert.equal(endLabel('mcp__ge__person_add', {}), 'Added them to your people list');
});

test('only writes trigger a file frame', () => {
  assert.equal(isFileWrite('Write'), true);
  assert.equal(isFileWrite('Edit'), true);
  assert.equal(isFileWrite('Read'), false);
  assert.equal(isFileWrite('Grep'), false);
});

test('no label contains a dash the house style bans', () => {
  const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'TodoWrite', 'mcp__ge__remember', 'x'];
  for (const t of tools) {
    assert.ok(!/[–—]/.test(startLabel(t, {})));
    assert.ok(!/[–—]/.test(endLabel(t, {})));
  }
});
