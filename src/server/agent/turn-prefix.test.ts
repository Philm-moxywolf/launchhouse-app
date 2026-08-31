/**
 * turn-prefix.test.ts: what the model is told at the start of every turn.
 *
 * THE NIGHT THIS CAME FROM. A rules refusal rolled back three files. The session
 * survived, because a session outlives a turn. On the next turn the model received
 * only what the founder typed, so its picture of the folder was its own history, and
 * its own history showed those writes succeeding.
 *
 * It told the founder "three files are in your Files, ready to open". The turn
 * committed with filesChanged: 0 and reported ok. The founder went to Files, found
 * nothing, went back to the chat and found that gone too.
 *
 * Four separate failures wearing one costume, and this file holds the half about
 * what the model knows.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTurnPrefix } from './assemble.ts';
import type { RunFacts } from './ports.ts';

const FACTS: RunFacts = {
  track: 'b2c',
  files: [{ path: 'founder-brain.md', bytes: 14300, at: '31 Aug' }] as never,
  absent: ['dm-openers.md', 'hook-bank.md', 'inbound-scripts.md'],
  gates: [],
  today: '2026-08-31',
} as never;

test('EVERY TURN IS TOLD WHAT IS ON DISK, not just the first of a session', () => {
  const prefix = buildTurnPrefix(FACTS, null);
  assert.match(prefix, /Present:/);
  assert.match(prefix, /Absent:/);
  assert.match(prefix, /dm-openers\.md/, 'the missing files have to be named');
});

test('AFTER A REFUSAL IT SAYS THE WRITES WERE UNDONE, in words, not by omission', () => {
  // Absent alone was not enough. The old header already carried it, and the model
  // trusted its own tool calls over a list. What was missing was being told, plainly,
  // that what it remembers doing did not survive.
  const prefix = buildTurnPrefix(FACTS, 'This suggests automating DMs.');
  assert.match(prefix, /WAS REFUSED AND EVERY FILE IT WROTE WAS UNDONE/);
  assert.match(prefix, /Your own history/i, 'it has to name the thing the model will otherwise believe');
  assert.match(prefix, /Do not tell the founder those files exist/i);
  assert.match(prefix, /do not skip[\s\S]*because you believe you already wrote it/i);
  assert.match(prefix, /This suggests automating DMs\./, 'the reason travels with it, or it cannot write differently');
  assert.match(prefix, /Write the work again/i);
});

test('a committed turn carries no refusal, so nothing stale is repeated', () => {
  const prefix = buildTurnPrefix(FACTS, null);
  assert.doesNotMatch(prefix, /REFUSED/);
  assert.doesNotMatch(prefix, /undone/i);
});

test('an empty folder reads as empty rather than as a missing section', () => {
  const empty = buildTurnPrefix({ ...FACTS, files: [], absent: [] } as never, null);
  assert.match(empty, /Present: nothing yet/);
  assert.match(empty, /Absent: nothing/);
});

test('THE MODEL IS TOLD NOTHING OUTSIDE THE FOLDER SURVIVES', async () => {
  // It wrote three memory files into the CLI's own config directory in one turn.
  // All three were lost, silently, and the ownership rule could not catch it: a file
  // written outside the folder is never harvested, so nothing ever looks at it.
  const { WHO_IS_READING } = await import('./assemble.ts');
  assert.match(WHO_IS_READING, /NOTHING OUTSIDE THAT FOLDER SURVIVES/);
  assert.match(WHO_IS_READING, /memory directory/i, 'it has to name the place it actually went');
  assert.match(WHO_IS_READING, /ge remember/, 'and name the thing to use instead');
  assert.match(WHO_IS_READING, /gone and nobody is told, including you/i);
});

test('and that the founder has no terminal, which is the other thing it got wrong', async () => {
  const { WHO_IS_READING } = await import('./assemble.ts');
  assert.match(WHO_IS_READING, /no terminal/i);
  assert.match(WHO_IS_READING, /NEVER tell them to run a command/i);
  assert.doesNotMatch(WHO_IS_READING, /[—–]/, 'this reaches a founder through the model, so the house style applies');
});
