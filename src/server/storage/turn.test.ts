/**
 * src/server/storage/turn.test.ts
 *
 * WHAT THIS IS. The one place the storage layer parses a founder file, under test.
 *
 * WHY IT EXISTS. founder.track is a cache and the file is the authority, so this
 * parser is what makes a founder's hand edit take effect. Getting it wrong in the
 * permissive direction hands a founder the other track's material, which is rule 1
 * broken. Getting it wrong in the strict direction silently drops their answer.
 *
 * The parsing rule is schemas/brain.md: everything above the first '## ' line is the
 * header, a label is the text before the first colon with the list dash and the stars
 * taken off, read without case. Below the first heading, a line with a colon in it is
 * ordinary prose.
 *
 * WHAT IT CALLS. parseBrainHeader from src/server/storage/turn.ts. No database.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrainHeader } from './turn.ts';

describe('parseBrainHeader', () => {
  it('reads the schema worked example', () => {
    const text = ['# Founder Brain', '', '- **Track:** b2b', '- **Model:** service', '- **Locked:** 2026-09-08', '', '## Thesis'].join('\n');
    assert.deepEqual(parseBrainHeader(text), { track: 'b2b', model: 'service' });
  });

  it('reads the same line however it is written, because the label is read without case', () => {
    for (const line of ['Track: b2c', '- **Track:** B2C', 'track:b2c', '*Track*: B2c', '  - Track:  b2c  ']) {
      assert.equal(parseBrainHeader(`${line}\n\n## Thesis`).track, 'b2c');
    }
  });

  it('stops at the first heading, so prose under ## Flags is prose', () => {
    const text = ['- **Track:** b2b', '', '## Flags', '', 'track: b2c'].join('\n');
    assert.equal(parseBrainHeader(text).track, 'b2b');
  });

  it('reads no track from a founder who has not answered yet', () => {
    assert.deepEqual(parseBrainHeader('# Founder Brain\n\n## Thesis\n'), { track: null, model: null });
  });

  it('REFUSES A VALUE THAT IS NOT ONE OF THE TWO, rather than guessing at it', () => {
    // schemas/brain.md worked example of a wrong file: "business to business" is not
    // b2b, so every skill that forks on it has no answer. Storing it as a track would
    // make the cache disagree with every reader of the file.
    assert.equal(parseBrainHeader('- **Track:** business to business\n\n## Thesis').track, null);
    assert.equal(parseBrainHeader('- **Track:** enterprise\n\n## Thesis').track, null);
  });

  it('reads only the two model values the schema allows', () => {
    assert.equal(parseBrainHeader('Model: ecommerce\n\n## X').model, 'ecommerce');
    assert.equal(parseBrainHeader('Model: e-commerce\n\n## X').model, null);
  });

  it('does not mind a B2B founder having no Model line, which is the normal case', () => {
    // Model is not asked of a B2B founder, and asking would be showing them the other
    // track's material, which is the one thing never to do.
    assert.deepEqual(parseBrainHeader('- **Track:** b2b\n\n## Thesis'), { track: 'b2b', model: null });
  });

  it('survives carriage returns, because a founder may have edited on Windows', () => {
    assert.equal(parseBrainHeader('- **Track:** b2b\r\n- **Model:** service\r\n\r\n## Thesis').track, 'b2b');
  });

  it('reads an empty file as no answer rather than throwing', () => {
    assert.deepEqual(parseBrainHeader(''), { track: null, model: null });
  });

  it('takes the last Track line when a founder wrote two, so an edit below wins', () => {
    const text = ['- **Track:** b2b', '- **Track:** b2c', '', '## Thesis'].join('\n');
    assert.equal(parseBrainHeader(text).track, 'b2c');
  });
});
