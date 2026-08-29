/**
 * gate.test.ts: the three gates, driven with the two worked example founders.
 *
 * WHY IT EXISTS: the two rules gates.md states have to be tested as rules, not
 *   described. A self-reported yes must not be able to make a file-backed item
 *   pass, and no item may ever be dropped from the report. Both are easy to
 *   break and neither shows up until somebody is standing in a room in Atlanta.
 *
 * CALLED BY: node --test.
 * READS:     gates.md and the two example brains from the content repo.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkAllGates, checkGate, checkGateAsRule, type FolderState } from './gate.ts';
import { gatesSource } from './gates-source.ts';
import { exampleBrain } from './test-fixtures.ts';
import { checkProseText } from './prose.ts';
import type { Track } from './types.ts';

function fileOf(text: string) {
  return {
    exists: true,
    bytes: Buffer.byteLength(text),
    contentBytes: text.replace(/\s/g, '').length,
    text,
  };
}

function emptyFolder(track: Track): FolderState {
  return { track, files: {}, peopleByStatus: {}, approvedPieces: 0, openersWritten: 0 };
}

function folderWithBrain(track: Track): FolderState {
  return { ...emptyFolder(track), files: { 'founder-brain.md': fileOf(exampleBrain(track)) } };
}

test('a founder who has done nothing is told so, item by item, with nothing dropped', () => {
  const report = checkGate('A', emptyFolder('b2b'));
  const expected = gatesSource().items.filter((i) => i.gate === 'A').length;
  assert.equal(report.items.length, expected);
  assert.equal(report.filesComplete, false);
  for (const item of report.items) {
    assert.ok(item.recovery.label.length > 0, item.item);
  }
});

test('a finished Brain passes gate A, item by item, on both tracks', () => {
  for (const track of ['b2b', 'b2c'] as const) {
    const report = checkGate('A', folderWithBrain(track));
    const fileItems = report.items.filter((i) => i.provedBy === 'file-backed');
    for (const item of fileItems) {
      assert.equal(item.state, 'done', `${track}: ${item.item} said ${item.state} (${item.evidence})`);
    }
    assert.equal(report.filesComplete, true);
  }
});

test('a Brain with no Voice section fails only the voice item', () => {
  const brain = exampleBrain('b2b').replace(/^## Voice[\s\S]*?(?=^## Flags)/m, '');
  const folder: FolderState = { ...emptyFolder('b2b'), files: { 'founder-brain.md': fileOf(brain) } };
  const report = checkGate('A', folder);
  const voice = report.items.find((i) => i.item.includes('voice'));
  assert.equal(voice?.state, 'not-done', voice?.evidence);
  const thesis = report.items.find((i) => i.item.includes('thesis'));
  assert.equal(thesis?.state, 'done');
});

test('a self-reported yes cannot make a file-backed item pass', () => {
  const folder: FolderState = {
    ...emptyFolder('b2b'),
    // The founder says every single thing is done. Nothing is on disk.
    selfReported: Object.fromEntries(gatesSource().items.map((i) => [i.item, true])),
  };
  const report = checkGate('A', folder);
  for (const item of report.items.filter((i) => i.provedBy === 'file-backed')) {
    assert.equal(item.state, 'not-done', item.item);
    assert.equal(item.fileBacked, false);
  }
  assert.equal(report.filesComplete, false);
});

test('a self-reported answer is recorded as an answer, never as evidence', () => {
  const flags = gatesSource().items.find((i) => i.gate === 'A' && i.provedBy === 'self-reported');
  assert.ok(flags);
  const folder: FolderState = { ...folderWithBrain('b2b'), selfReported: { [flags.item]: true } };
  const item = checkGate('A', folder).items.find((i) => i.item === flags.item);
  assert.equal(item?.state, 'answered-yes');
  assert.equal(item?.fileBacked, false);
  assert.match(item?.evidence ?? '', /not as evidence/);
});

test('a file that exists but is nearly empty says so, rather than saying nothing', () => {
  const folder: FolderState = {
    ...emptyFolder('b2c'),
    files: { 'content-30.md': fileOf('# Thirty pieces\n') },
  };
  const item = checkGate('B', folder).items.find((i) => i.item.includes('thirty pieces'));
  assert.equal(item?.state, 'nearly-empty');
  assert.match(item?.evidence ?? '', /nearly empty/);
});

test('pieces read but never approved count as not done, which gates.md says on purpose', () => {
  const folder: FolderState = {
    ...emptyFolder('b2b'),
    files: {
      'content-30.md': fileOf('x'.repeat(400)),
      'content-30.csv': fileOf('x'.repeat(400)),
      'rss-feeds.md': fileOf('x'.repeat(400)),
      'ledger.md': fileOf('x'.repeat(400)),
    },
    approvedPieces: 0,
  };
  const item = checkGate('B', folder).items.find((i) => i.item.includes('approved'));
  assert.equal(item?.state, 'not-done');
  assert.match(item?.evidence ?? '', /0 of 30/);
  assert.equal(checkGate('B', folder).filesComplete, false);
});

test('gate C forks, and neither founder is shown the other track\'s items', () => {
  const b2b = checkGate('C', emptyFolder('b2b')).items.map((i) => i.item).join(' ');
  const b2c = checkGate('C', emptyFolder('b2c')).items.map((i) => i.item).join(' ');
  assert.match(b2b, /sequence/);
  assert.doesNotMatch(b2b, /hook bank/);
  assert.match(b2c, /hook bank/);
  assert.doesNotMatch(b2c, /sequence/);
});

test('with nothing recorded as sent, the B2C send item asks rather than guesses', () => {
  const item = checkGate('C', emptyFolder('b2c')).items.find((i) => i.item.includes('sent'));
  assert.equal(item?.state, 'unanswered');
  assert.equal(item?.recovery.action.kind, 'reply');
  assert.match(item?.evidence ?? '', /Nothing is recorded as sent/);
});

test('recording the sends is what turns them into evidence', () => {
  const folder: FolderState = { ...emptyFolder('b2c'), peopleByStatus: { sent: 25 } };
  const item = checkGate('C', folder).items.find((i) => i.item.includes('sent'));
  assert.equal(item?.state, 'done');
  assert.match(item?.evidence ?? '', /25 of 25/);
});

test('nothing anywhere in a gate report counts replies', () => {
  const folder: FolderState = {
    ...folderWithBrain('b2b'),
    peopleByStatus: { candidate: 20, replied: 4, sent: 10 },
    approvedPieces: 30,
    openersWritten: 25,
  };
  const words = checkAllGates(folder)
    .flatMap((r) => [r.headline, ...r.items.map((i) => `${i.item} ${i.evidence}`)])
    .join(' ');
  assert.doesNotMatch(words, /\b\d+ repl/i, 'a reply count reached a founder');
  assert.doesNotMatch(words, /reply rate/i);
});

test('no person is ever named in a gate report', () => {
  const folder: FolderState = { ...folderWithBrain('b2c'), peopleByStatus: { sent: 3, target: 22 } };
  const words = checkAllGates(folder)
    .flatMap((r) => r.items.map((i) => `${i.item} ${i.evidence}`))
    .join(' ');
  assert.doesNotMatch(words, /@/, 'an address reached the report');
});

test('every word a founder reads in a gate report passes the house style gate', () => {
  const folder: FolderState = {
    ...folderWithBrain('b2b'),
    peopleByStatus: { candidate: 25 },
    approvedPieces: 12,
    openersWritten: 3,
    selfReported: { 'the flags are answered honestly': false },
  };
  for (const report of checkAllGates(folder)) {
    for (const [i, line] of [report.headline, ...report.items.map((x) => `${x.evidence} ${x.recovery.label}`)].entries()) {
      const prose = checkProseText(`gate ${report.gate} line ${i}`, line);
      assert.deepEqual(prose.violations.map((v) => `${v.code}: ${v.found}`), [], line);
    }
  }
});

test('being behind a gate is a note, never a refusal', () => {
  const result = checkGateAsRule('B', emptyFolder('b2b'));
  assert.equal(result.ok, true, 'a gate must not stop the work that would clear it');
  assert.ok(result.violations.length > 0);
  assert.ok(result.violations.every((v) => v.severity === 'warn'));
});

test('a gate cannot be checked before a track exists', () => {
  assert.throws(
    () => checkGate('A', { ...emptyFolder('b2b'), track: null }),
    /before a track is chosen/,
  );
});
