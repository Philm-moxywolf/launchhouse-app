/**
 * Rule 1 in the tool surface.
 *
 * `ge-tools.ts` says the other track's tool is not registered, so it does not exist for
 * this founder. That is a stronger guarantee than a prompt instruction and it is worth a
 * test, because the failure it prevents is silent.
 *
 * THE APOLLO TOOLS WERE HERE AND ARE GONE, 1 September 2026. Apollo's own MCP server
 * does that work on the founder's own account. What these tests hold now is the shape
 * that is left: two tools, no vendor named in either, and no send verb anywhere.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { GE_TOOL_NAMES, geToolNamesFor } from './ge-tools.ts';

describe('the tool surface', () => {
  test('is two tools, and neither names a vendor', () => {
    assert.equal(GE_TOOL_NAMES.length, 2);
    assert.doesNotMatch([...GE_TOOL_NAMES].join(' '), /apollo|ghl|gohighlevel/i);
  });

  test('every track gets the same two, because nothing left is track specific', () => {
    for (const track of ['b2b', 'b2c'] as const) {
      assert.deepEqual([...geToolNamesFor(track)], [...GE_TOOL_NAMES]);
    }
  });

  test('there is no tool anywhere that sends, publishes, enrols or activates', () => {
    // THE LINE THIS PRODUCT DOES NOT CROSS. It writes a founder's words. The vendors'
    // own servers do the sending, on the founder's own accounts, with their own
    // confirmations. A tool named for any of these would be that decision undone by one
    // registration, which is why it is a test and not a comment.
    for (const track of ['b2b', 'b2c'] as const) {
      const names = geToolNamesFor(track).join(' ');
      assert.doesNotMatch(names, /send|publish|post|enrol|enroll|approve|activate|sequence/i);
    }
  });

  test('both tools that remain are the ones that write into the founder\'s own folder', () => {
    const names = [...GE_TOOL_NAMES].join(' ');
    assert.match(names, /__remember/);
    assert.match(names, /__person_add/);
  });
});
