/**
 * Rule 1 in the tool surface.
 *
 * `ge-tools.ts` says the other track's tool is not registered, so it does not exist for
 * this founder. That is a stronger guarantee than a prompt instruction and it is worth a
 * test, because the failure it prevents is silent: a B2C founder whose model can see an
 * Apollo tool will eventually be offered Apollo, and rule 1 says they never read the word.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { GE_TOOL_NAMES, geToolNamesFor } from './ge-tools.ts';

describe('which tool names each track is allowed', () => {
  test('an outreach founder may use the Apollo search', () => {
    const names = geToolNamesFor('b2b');
    assert.ok(names.some((n) => n.endsWith('__apollo_search')));
  });

  test('an audience founder is not offered it, and the word is not in their list', () => {
    const names = geToolNamesFor('b2c');
    assert.ok(!names.some((n) => n.endsWith('__apollo_search')));
    assert.doesNotMatch(names.join(' '), /apollo/i, 'the other track\'s vendor is not named in their allowlist');
  });

  test('a founder with no track yet gets the two that belong to both', () => {
    // The Brain has not forked them yet. Neither track's extra tool is theirs.
    assert.deepEqual([...geToolNamesFor(null)], [...GE_TOOL_NAMES]);
  });

  test('both tracks keep the tools that are not track specific', () => {
    for (const track of ['b2b', 'b2c', null] as const) {
      const names = geToolNamesFor(track);
      assert.ok(names.some((n) => n.endsWith('__remember')), 'remember is for everybody');
      assert.ok(names.some((n) => n.endsWith('__person_add')), 'person_add is for everybody, forked inside');
    }
  });
});
