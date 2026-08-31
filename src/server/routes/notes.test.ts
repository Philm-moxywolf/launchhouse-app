/**
 * notes.test.ts: the note list never lies about its own length.
 *
 * WHY THIS FILE EXISTS. The rules gate was measured against ordinary founder
 * writing and most of what it finds was moved from holding a file to noting it.
 * That made notes the common volume, and it turned a cap that used to fire
 * almost never into one that fires on an ordinary turn.
 *
 * A cap that cuts in silence says "that was everything". For 130 founders who
 * cannot read the code, that is the app telling them something untrue about
 * their own work, which is the exact failure the gate was rebuilt to stop.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Violation } from '../rules/types.ts';
import { NOTES_SHOWN, noteLines } from './run-turn.ts';

function note(message: string): Violation {
  return {
    code: 'proof.unbacked-figure',
    severity: 'warn',
    message,
    why: 'because',
    recovery: '',
    found: '',
    where: { path: 'content-30.md', line: 1, column: 1, excerpt: '' },
  } as unknown as Violation;
}

function many(n: number): Violation[] {
  return Array.from({ length: n }, (_unused, i) => note(`note ${i + 1}`));
}

describe('the notes a founder reads beside saved work', () => {
  it('SAYS NOTHING WHEN THERE IS NOTHING, so a quiet turn stays quiet', () => {
    assert.deepEqual(noteLines([]), []);
  });

  it('shows every note while they fit, and adds no counting line', () => {
    for (let n = 1; n <= NOTES_SHOWN; n++) {
      const lines = noteLines(many(n));
      assert.equal(lines.length, n, `${n} notes should be ${n} lines`);
      assert.deepEqual(
        lines,
        many(n).map((v) => v.message),
        'the messages come through unchanged and in order',
      );
    }
  });

  it('NEVER CUTS THE LIST IN SILENCE, which is the whole point of the file', () => {
    for (let extra = 1; extra <= 12; extra++) {
      const lines = noteLines(many(NOTES_SHOWN + extra));
      assert.equal(lines.length, NOTES_SHOWN + 1, 'the shown notes, and one line about the rest');
      const last = lines[lines.length - 1] ?? '';
      assert.match(last, new RegExp(`\\b${extra}\\b`), 'the count of what was cut is in the sentence');
      assert.doesNotMatch(last, /[—–]/, 'founder facing, so the house style applies');
    }
  });

  it('counts one in the singular, because "There are 1 more notes" reads like a bug', () => {
    const last = noteLines(many(NOTES_SHOWN + 1)).at(-1) ?? '';
    assert.match(last, /There is 1 more note\b/);
    assert.doesNotMatch(last, /notes/);
  });

  it('the counting line tells them what to do, not just what happened', () => {
    const last = noteLines(many(NOTES_SHOWN + 5)).at(-1) ?? '';
    assert.match(last, /Ask for the rest/, 'a founder needs the next action, not a number alone');
  });
});
