/**
 * message-text.test.ts: what a founder actually reads on screen.
 *
 * Three bugs in one screenshot, all of them here:
 *   "**Your webinar is Monday 7 September**" arrived with the asterisks showing.
 *   The dashes the house style bans were in it, because the rules gate checks files
 *   the app SAVES and nothing was checking what the model SAYS.
 *   And the model relayed a shell command to somebody with no shell.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { houseStyle, inlineParts } from './MessageText.tsx';

test('BOLD IS RENDERED, not shown as punctuation', () => {
  const parts = inlineParts('**Your webinar is Monday 7 September.** It is your channel.');
  assert.deepEqual(parts, [
    { bold: true, text: 'Your webinar is Monday 7 September.' },
    { bold: false, text: ' It is your channel.' },
  ]);
});

test('text with no markers comes through untouched, character for character', () => {
  const plain = 'Thirty six students across three cohorts, and 12 per class.';
  assert.deepEqual(inlineParts(plain), [{ bold: false, text: plain }]);
});

test('A HALF ARRIVED MARKER IS LEFT ALONE, because the screen streams', () => {
  // The renderer runs on partial text while a turn is still writing. An unclosed
  // marker must show as typed rather than swallow the rest of the message.
  const parts = inlineParts('Your webinar is **Monday');
  assert.deepEqual(parts, [{ bold: false, text: 'Your webinar is **Monday' }]);
});

test('THE BANNED DASHES ARE REPLACED, on the half of the app nobody was checking', () => {
  assert.equal(
    houseStyle('Monday 7 September — seven days out'),
    'Monday 7 September, seven days out',
  );
  assert.equal(houseStyle('eleven – twelve'), 'eleven, twelve');
  assert.equal(houseStyle('a spaced - hyphen reads the same way'), 'a spaced, hyphen reads the same way');
});

test('a hyphen inside a word is not a dash, and must survive', () => {
  // "Set One Futures AI Ltd" is fine, but so is "co-founder" and "90-day".
  assert.equal(houseStyle('a 90-day plan from a co-founder'), 'a 90-day plan from a co-founder');
  assert.equal(houseStyle('growth-engine/founder-brain.md'), 'growth-engine/founder-brain.md');
});

test('NOTHING BUILDS HTML FROM MODEL TEXT, which is the rule that cannot bend', () => {
  // The text comes from a model reading a founder's own files. A founder who pastes
  // something with a tag in it must not be able to run it in their own browser by
  // asking the engine to quote it back.
  // Comment lines stripped first, because the file names the thing it refuses to do
  // and a check that cannot tell prose from code would fail on its own explanation.
  const code = readFileSync(new URL('./MessageText.tsx', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');
  assert.doesNotMatch(code, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(code, /innerHTML/);

  // And the parts are data, so a tag stays a string rather than becoming an element.
  const parts = inlineParts('<script>alert(1)</script> and **bold**');
  assert.equal(parts[0]?.text, '<script>alert(1)</script> and ');
  assert.equal(parts[0]?.bold, false);
});
