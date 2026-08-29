/**
 * track.test.ts: rule 1, tested in both directions with the two real worked
 *   examples.
 *
 * WHY IT EXISTS: the strongest test of a two track rule is to run each real
 *   founder through their own track and get silence, then run them through the
 *   other one and get a refusal. Anything weaker proves only that the code
 *   compiles.
 *
 * CALLED BY: node --test.
 * READS:     the two example brains from the content repo.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkTrack } from './track.ts';
import { exampleBrain } from './test-fixtures.ts';
import type { Artifact, FounderContext, Track } from './types.ts';

function ctx(track: Track | null): FounderContext {
  return { track, brain: null };
}

function art(path: string, text: string): Artifact {
  return { path, text, authored: 'model' };
}

test('each worked example brain passes on its own track', () => {
  for (const track of ['b2b', 'b2c'] as const) {
    const result = checkTrack(art('founder-brain.md', exampleBrain(track)), ctx(track));
    assert.deepEqual(
      result.violations.map((v) => `${v.code}: ${v.found}`),
      [],
      `the ${track} brain should pass on ${track}`,
    );
  }
});

test('the B2B brain handed to a B2C founder is refused, and Apollo is named', () => {
  const result = checkTrack(art('founder-brain.md', exampleBrain('b2b')), ctx('b2c'));
  assert.equal(result.ok, false);
  const codes = result.violations.map((v) => v.code);
  assert.ok(codes.includes('track.brain-disagrees'), 'the Track line disagreement is caught');
  const words = result.violations.filter((v) => v.code === 'track.wrong-track-word');
  assert.ok(
    words.some((v) => v.found.toLowerCase() === 'apollo'),
    'Apollo must never reach a B2C founder',
  );
});

test('the B2C brain handed to a B2B founder is refused', () => {
  const result = checkTrack(art('founder-brain.md', exampleBrain('b2c')), ctx('b2b'));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'track.brain-disagrees'));
});

test('a B2B file cannot land in a B2C folder', () => {
  const result = checkTrack(art('outreach-sequence.md', '# Sequence\n'), ctx('b2c'));
  assert.equal(result.ok, false);
  const v = result.violations.find((x) => x.code === 'track.wrong-track-file');
  assert.ok(v);
  assert.match(v?.message ?? '', /outreach-sequence\.md/);
  assert.equal(v?.recovery.action.kind, 'route');
});

test('a B2C file cannot land in a B2B folder', () => {
  const result = checkTrack(art('hook-bank.md', '# Hooks\n'), ctx('b2b'));
  assert.equal(result.violations[0]?.code, 'track.wrong-track-file');
});

test('a both-tracks file is fine on either track', () => {
  for (const track of ['b2b', 'b2c'] as const) {
    const result = checkTrack(art('content-30.md', '# Thirty pieces\n'), ctx(track));
    assert.deepEqual(result.violations, []);
  }
});

test('a track file before the Brain exists is refused, and points at the Brain', () => {
  const result = checkTrack(art('dm-openers.md', '# Openers\n'), ctx(null));
  const v = result.violations.find((x) => x.code === 'track.not-chosen-yet');
  assert.ok(v);
  assert.deepEqual(v?.recovery.action, { kind: 'route', skill: 'founder-brain' });
});

test('a Brain with no Track line is refused', () => {
  const result = checkTrack(art('founder-brain.md', '# Founder Brain\n\n## Thesis\nWords.\n'), ctx('b2b'));
  assert.ok(result.violations.some((v) => v.code === 'track.missing-from-brain'));
});

test('a Brain with a Track line nobody can fork on is refused', () => {
  const brain = '# Founder Brain\n\n- **Track:** both\n\n## Thesis\nWords.\n';
  const result = checkTrack(art('founder-brain.md', brain), ctx('b2b'));
  assert.equal(result.violations[0]?.code, 'track.unknown-value');
});

test('a prospect cannot appear in a B2C folder', () => {
  const person = 'key: sam@northfield.io\nkind: prospect\nname: Sam Carter\nstatus: candidate\n\n## Yours\n';
  const result = checkTrack(art('people/sam-northfield-io.md', person), ctx('b2c'));
  assert.ok(result.violations.some((v) => v.code === 'track.person-wrong-kind'));
});

test('a target cannot appear in a B2B folder', () => {
  const person = 'key: ig:lumen.skin\nkind: target\nplatform: ig\nhandle: lumen.skin\n\n## Yours\n';
  const result = checkTrack(art('people/ig-lumen-skin.md', person), ctx('b2b'));
  assert.ok(result.violations.some((v) => v.code === 'track.person-wrong-kind'));
});

test('a person carrying both kinds of field is refused, which is the leak person.md names', () => {
  const person = 'key: sam@northfield.io\nkind: prospect\nemail: sam@northfield.io\nhandle: samokoye\n\n## Yours\n';
  const result = checkTrack(art('people/sam-northfield-io.md', person), ctx('b2b'));
  const v = result.violations.find((x) => x.code === 'track.person-both-kinds');
  assert.ok(v);
  assert.match(v?.found ?? '', /handle/);
});

test('a person file on the right track with the right fields passes', () => {
  const person = 'key: ig:lumen.skin\nkind: target\nplatform: ig\nhandle: lumen.skin\nstatus: target\n\n## Yours\n';
  const result = checkTrack(art('people/ig-lumen-skin.md', person), ctx('b2c'));
  assert.deepEqual(result.violations, []);
});

test('an outreach sequence step reaching a B2C founder is refused', () => {
  const post = 'Then enrol them in the email sequence and wait three days.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  const v = result.violations.find((x) => x.code === 'track.wrong-track-word');
  assert.ok(v, 'expected a refusal');
  assert.equal(v?.found.toLowerCase(), 'sequence');
});

test('an innocent use of the same word is a note, not a refusal', () => {
  const post = 'Post these in a sequence over three weeks.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  assert.equal(result.ok, true, 'a warning must not stop the founder getting their work');
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('the same word is never reported twice on one line', () => {
  const post = 'Sequence after sequence after sequence, in the email sequence.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  assert.equal(result.violations.length, 1);
});

test('a term inside a link or a code span is not a leak', () => {
  const post = 'Read https://example.com/apollo-notes and run `ge person list --kind prospect`.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  assert.deepEqual(result.violations, []);
});

test('SPF in a skincare sentence is sun protection, not an email record', () => {
  // The real regression. Priya Raman's Brain lists mineral SPF among the things
  // her customers already buy, and the first draft of the term list refused it.
  const post = 'Mineral SPF over the barrier cream, every morning.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  assert.deepEqual(result.violations, []);
});

test('SPF beside the other email records is still refused on the audience track', () => {
  const post = 'Check the domain has SPF, DKIM and DMARC set before you send.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  assert.equal(result.ok, false);
});

test('the founder\'s own words are not scanned', () => {
  const theirs: Artifact = {
    path: 'memory.md',
    text: 'I still think of them as prospects even though Apollo is not for me.',
    authored: 'founder',
  };
  const result = checkTrack(theirs, ctx('b2c'));
  assert.deepEqual(result.violations, []);
  assert.match(result.notes.join(' '), /the founder wrote them/);
});
