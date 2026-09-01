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

  test('an outreach founder may also enrich, which is the one that costs', () => {
    assert.ok(geToolNamesFor('b2b').some((n) => n.endsWith('__apollo_enrich')));
  });

  test('an outreach founder may prepare a sequence, which is as close to sending as this gets', () => {
    assert.ok(geToolNamesFor('b2b').some((n) => n.endsWith('__apollo_sequence_prepare')));
  });

  test('there is no tool anywhere that activates or approves a sequence', () => {
    // The line this product does not cross. Apollo creates a sequence inactive and
    // activating is a separate call, so the founder pressing start in their own account
    // is the only way anything sends. A tool named for it would be the whole safety
    // property undone by one registration.
    for (const track of ['b2b', 'b2c'] as const) {
      const names = geToolNamesFor(track).join(' ');
      assert.doesNotMatch(names, /approve|activate|send_now|start_sequence/i);
    }
  });

  test('an audience founder is offered none of them, and the word is not in their list', () => {
    const names = geToolNamesFor('b2c');
    assert.ok(!names.some((n) => n.endsWith('__apollo_search')));
    assert.ok(!names.some((n) => n.endsWith('__apollo_enrich')));
    assert.ok(!names.some((n) => n.endsWith('__apollo_sequence_prepare')));
    assert.doesNotMatch(names.join(' '), /apollo/i, 'the other track\'s vendor is not named in their allowlist');
  });

  test('the base list is what both tracks share, and nothing in it names a vendor', () => {
    // A FOUNDER WITH NO TRACK YET IS TREATED AS b2b AND THAT IS NOT THIS FILE'S DOING.
    // run-turn.ts builds the context with `track ?? asTrack(founder.track) ?? 'b2b'`,
    // so a founder who has not finished the Brain arrives here as b2b and gets the
    // outreach tools. person_add has always forked the same way, so this is the
    // existing behaviour rather than something the Apollo tool introduced. It is
    // written down here because it is the kind of default that is invisible until it
    // offers Apollo to somebody halfway through choosing their track.
    assert.doesNotMatch([...GE_TOOL_NAMES].join(' '), /apollo|ghl/i);
  });

  test('both tracks keep the tools that are not track specific', () => {
    for (const track of ['b2b', 'b2c'] as const) {
      const names = geToolNamesFor(track);
      assert.ok(names.some((n) => n.endsWith('__remember')), 'remember is for everybody');
      assert.ok(names.some((n) => n.endsWith('__person_add')), 'person_add is for everybody, forked inside');
    }
  });
});
