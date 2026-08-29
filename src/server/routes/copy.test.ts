/**
 * src/server/routes/copy.test.ts
 *
 * WHAT THIS IS. Every sentence this folder puts in front of a founder, held to
 * the house style by the app's own prose rule.
 *
 * WHY IT EXISTS. `errors.test.ts` already does this for `ERRORS`, and the moment
 * a second and third table of refusals appeared, `SETUP_ERRORS` and
 * `FILE_ERRORS`, they were outside every check in the build. The rules gate runs
 * over what a model writes into a founder's folder. Nothing ran over what we
 * write on their screen.
 *
 * That gap is not cosmetic. A dash in a refusal is the same rule the toolkit
 * refuses a founder's own file for, and a founder who is told their content
 * cannot use one while the app uses one has been given two answers. It is also
 * the cheapest possible check: the rule already exists, it is the same one, and
 * running it here costs nothing.
 *
 * TWO THINGS ARE CHECKED THAT THE RULE CANNOT SEE, and both are the reason the
 * refusals in this folder exist at all. A sentence that says something is not
 * built has to say when the founder can do it instead, or "not yet" reads as
 * "never". And a sentence about work has to say the work is safe, because that
 * is the doubt the founder has first.
 *
 * WHAT IT CALLS. The rules module's own prose check, and the two tables.
 * WHAT IT READS AND WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkProseText } from '../rules/prose.ts';
import { FILE_ERRORS } from './files.ts';
import { SETUP_ERRORS } from './setup.ts';

const TABLES = { SETUP_ERRORS, FILE_ERRORS } as const;

test('EVERY REFUSAL THIS FOLDER WRITES OBEYS THE HOUSE STYLE', () => {
  let checked = 0;
  for (const [table, rows] of Object.entries(TABLES)) {
    for (const [name, e] of Object.entries(rows as Record<string, { message: string }>)) {
      const result = checkProseText(`${table}.${name}`, e.message);
      assert.equal(
        result.violations.length,
        0,
        `${table}.${name}: ${result.violations.map((v) => v.message).join(' ')}`,
      );
      checked += 1;
    }
  }
  // A floor, so an empty table cannot make this test pass by having nothing in
  // it to check.
  assert.ok(checked >= 7, `only ${String(checked)} sentences were checked`);
});

test('A REFUSAL ENDS ON SOMETHING TO DO, AND NEVER ON A STATUS CODE', () => {
  for (const rows of Object.values(TABLES)) {
    for (const [name, e] of Object.entries(rows as Record<string, { message: string; status: number }>)) {
      assert.doesNotMatch(e.message, /\b[45]\d\d\b/, `${name} reads a status code back to the founder`);
      // Every one of these is at least two sentences: what happened, then what
      // to do. One sentence is either an explanation with no action or an
      // instruction with no reason, and both send a founder to a mentor.
      const sentences = e.message.split(/\.\s+/).filter((s) => s.trim() !== '');
      assert.ok(sentences.length >= 2, `${name} does not end on an action: ${e.message}`);
    }
  }
});

test('THE PARTS THAT ARE NOT BUILT SAY WHEN THE FOUNDER CAN DO IT INSTEAD', () => {
  // 501 is this folder's word for "the address exists and we cannot do this
  // yet". A founder reading that needs a date or an alternative, because "not
  // yet" with neither is indistinguishable from never.
  assert.equal(SETUP_ERRORS.ghlCheckNotBuilt.status, 501);
  assert.match(SETUP_ERRORS.ghlCheckNotBuilt.message, /23 September/);

  assert.equal(FILE_ERRORS.sampleNotBuilt.status, 501);
  assert.match(FILE_ERRORS.sampleNotBuilt.message, /messages instead/);

  // And both say the founder's work is safe, which is the first thing they want
  // to know and the last thing a refusal usually says.
  for (const e of [SETUP_ERRORS.ghlCheckNotBuilt, FILE_ERRORS.sampleNotBuilt]) {
    assert.match(e.message, /Nothing you have made is affected/);
  }
});

/**
 * The one refusal that is about a secret, and it has a job beyond politeness.
 *
 * A founder who pastes their token into the Location ID box has to be told it
 * was not saved. Without that sentence they assume it was, and a credential
 * they believe is stored is a credential they stop watching.
 */
test('THE TOKEN GUARD TELLS THE FOUNDER NOTHING WAS SAVED', () => {
  assert.match(SETUP_ERRORS.looksLikeAToken.message, /Nothing was saved/);
  assert.match(SETUP_ERRORS.looksLikeAToken.message, /Location ID/);
});
