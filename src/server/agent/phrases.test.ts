/**
 * phrases.test.ts
 *
 * WHAT: Tests stage one of routing, the free half.
 * WHY IT EXISTS: Every phrase here was written by the person who wrote the
 *       skill. If one of them stops matching, a founder types the exact words
 *       the description promised and gets nothing, which is worse than never
 *       having promised them.
 * RUN: node_modules/.bin/tsx --test src/server/agent/phrases.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPhrase, normalise, SKILL_DESCRIPTION_PHRASES } from './phrases.js';
import { FIXTURE_ROUTES } from './test-fixtures.js';

test('every phrase in a skill description matches its own route', () => {
  for (const [routeId, phrases] of Object.entries(SKILL_DESCRIPTION_PHRASES)) {
    const row = FIXTURE_ROUTES.find((r) => r.id === routeId);
    if (!row) continue;
    for (const track of row.tracks) {
      for (const phrase of phrases) {
        const match = matchPhrase(phrase, FIXTURE_ROUTES, track);
        assert.equal(match?.routeId, routeId, `"${phrase}" did not reach ${routeId}`);
        assert.equal(match?.confidence, 'exact');
      }
    }
  }
});

test('the phrases add up to the list in the nine skill descriptions', () => {
  const total = Object.values(SKILL_DESCRIPTION_PHRASES).reduce((n, p) => n + p.length, 0);
  assert.equal(total, 44);
  assert.equal(Object.keys(SKILL_DESCRIPTION_PHRASES).length, 9);
});

test('punctuation and case do not stop a match', () => {
  const match = matchPhrase('Build My Content Engine!', FIXTURE_ROUTES, 'b2b');
  assert.equal(match?.routeId, 'content-engine');
});

test('a phrase inside a longer sentence is a near match', () => {
  const match = matchPhrase(
    'ok I think I am ready to build my content engine now please',
    FIXTURE_ROUTES,
    'b2c',
  );
  assert.equal(match?.routeId, 'content-engine');
  assert.equal(match?.confidence, 'near');
});

test('the longest phrase wins when two could match', () => {
  // "write my content" and "build my content engine" both sit in this sentence.
  const match = matchPhrase('can you build my content engine and write my content', FIXTURE_ROUTES, 'b2b');
  assert.equal(match?.phrase, 'build my content engine');
});

test('a phrase is not matched inside a longer word', () => {
  assert.equal(matchPhrase('my hooksmith is broken', FIXTURE_ROUTES, 'b2c'), null);
});

test('the other track cannot be reached by typing its phrase', () => {
  assert.equal(matchPhrase('instagram outreach', FIXTURE_ROUTES, 'b2b'), null);
  assert.equal(matchPhrase('cold email', FIXTURE_ROUTES, 'b2c'), null);
});

test('an apostrophe is normalised away so both spellings match', () => {
  assert.equal(normalise("what's left"), 'whats left');
  assert.equal(matchPhrase("what's left", FIXTURE_ROUTES, 'b2b')?.routeId, 'status');
  assert.equal(matchPhrase('whats left', FIXTURE_ROUTES, 'b2b')?.routeId, 'status');
});

test('a slash command style trigger still matches', () => {
  assert.equal(matchPhrase('/doctor', FIXTURE_ROUTES, 'b2b')?.routeId, 'setup');
});

test('an empty or whitespace message matches nothing', () => {
  assert.equal(matchPhrase('', FIXTURE_ROUTES, 'b2b'), null);
  assert.equal(matchPhrase('   ', FIXTURE_ROUTES, 'b2b'), null);
});

test('ordinary conversation does not start an engine', () => {
  for (const sentence of [
    'we sell to construction firms',
    'yes that sounds right',
    'about twenty people work there',
  ]) {
    assert.equal(matchPhrase(sentence, FIXTURE_ROUTES, 'b2b'), null, sentence);
  }
});
