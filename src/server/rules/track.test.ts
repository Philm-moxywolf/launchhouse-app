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

// THESE TWO CHANGED ON 1 SEPTEMBER AND THE REASON IS A JUDGEMENT, SO IT IS
// WRITTEN DOWN. They used to assert that a Brain declaring the other track was
// refused. That case cannot be told apart from a founder changing track: both
// are a Brain declaring b2b, full of B2B words, while the record still says b2c.
// One of them had to win.
//
// Not being able to change track is certain, happens at session 1, and is the
// mistake the help skill already names. A Brain that wrongly declares the other
// track needs a skill bug that rewrites the Track line, and it fails loudly,
// because every one of that founder's files drops out of their list at once.
//
// So the Brain may declare a new track, and the founder is told. The Apollo
// guard is kept where it still applies, which is the Brain that is staying put.

test('the B2B brain arriving on a B2C founder is the track changing, and it is said out loud', () => {
  const result = checkTrack(art('founder-brain.md', exampleBrain('b2b')), ctx('b2c'));
  assert.equal(result.ok, true, 'the Brain is where the track is decided');
  assert.ok(
    result.violations.some((v) => v.code === 'track.brain-disagrees'),
    'and the founder is told their side is changing, because nothing about this may be silent',
  );
});

test('Apollo in a Brain that is staying on B2C is still refused', () => {
  // The half of the old test that is still true, and the half that was doing the
  // work. A founder who is not changing track must never be handed Apollo.
  const staying = exampleBrain('b2c') + '\n\nBuild the list in Apollo and export it.\n';
  const result = checkTrack(art('founder-brain.md', staying), ctx('b2c'));
  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some(
      (v) => v.code === 'track.wrong-track-word' && v.found.toLowerCase() === 'apollo',
    ),
    'Apollo must never reach a founder who is staying B2C',
  );
});

test('the B2C brain arriving on a B2B founder is the track changing too', () => {
  const result = checkTrack(art('founder-brain.md', exampleBrain('b2c')), ctx('b2b'));
  assert.equal(result.ok, true);
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

test('asking an audience founder for LinkedIn URLs is refused', () => {
  // THE REGRESSION, 31 August 2026. A B2C founder finished the audience engine
  // and was asked for "LinkedIn URLs for the six". Apollo, ICP and firmographics
  // were all on the term list. LinkedIn was not, so nothing caught it.
  const text = 'Send me the LinkedIn URLs for the six and I will write batch 2.';
  const result = checkTrack(art('dm-openers.md', text), ctx('b2c'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.found?.toLowerCase(), 'linkedin');
});

test('an audience founder who simply has a LinkedIn is not held', () => {
  // The other half. Plenty of B2C founders have a LinkedIn and saying so is not
  // the other track's material. Blocking this would be the rule getting in the
  // way of a founder for no gain.
  const text = 'She has a LinkedIn but everything that works for her is on Instagram.';
  const result = checkTrack(art('content-30.md', text), ctx('b2c'));
  assert.equal(result.ok, true, 'a note must not stop the founder getting their work');
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('LinkedIn on the outreach track is ordinary', () => {
  const text = 'Send the LinkedIn URLs through and the sequence will pick them up.';
  const result = checkTrack(art('outreach-sequence.md', text), ctx('b2b'));
  assert.deepEqual(result.violations, []);
});

test('a founder changing their track in the Brain is not blocked', () => {
  // THE DEADLOCK, 1 September 2026. This was a block, so the Brain carrying the
  // new track was held, and the record only updates from a Brain that committed.
  // The track could never change, and "change my track" is the documented fix
  // for a founder who picked the wrong one in session 1.
  const brain = '# Founder Brain\n\nTrack: b2b\nModel: service\n';
  const result = checkTrack(art('founder-brain.md', brain), ctx('b2c'));
  assert.equal(result.ok, true, 'the Brain is where the track is decided, so it must be able to say so');
  assert.equal(result.violations[0]?.code, 'track.brain-disagrees');
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('changing the track does not open the door to the other track\'s files', () => {
  // The guard that matters. Only the Brain may disagree with the record.
  const result = checkTrack(art('dm-openers.md', '# Openers\n'), ctx('b2b'));
  assert.equal(result.ok, false);
});

test('a Brain with no Track line at all is still refused', () => {
  const result = checkTrack(art('founder-brain.md', '# Founder Brain\n\nModel: service\n'), ctx('b2c'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'track.missing-from-brain');
});

test('a Brain moving to the other track is read against the track it declares', () => {
  // THE SECOND HALF OF THE DEADLOCK, 1 September 2026. Making the Track line a
  // note was not enough. A founder moving to B2B writes a Brain full of B2B
  // words, and every one of them was read against the b2c record still in the
  // database, so the Brain was held on ICP and DKIM and the record never moved.
  const brain = [
    '# Founder Brain',
    '',
    '- **Track:** b2b',
    '',
    '## Audience',
    'The ICP is heads of digital learning at independent schools.',
    'Email from a domain with SPF, DKIM and DMARC, then a short sequence.',
  ].join('\n');
  const result = checkTrack(art('founder-brain.md', brain), ctx('b2c'));
  assert.equal(result.ok, true, 'the Brain is where the track is decided');
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0]?.code, 'track.brain-disagrees');
});

test('only the Brain gets that, every other file is read against the record', () => {
  const post = 'The ICP is heads of digital learning, reached by cold email.';
  const result = checkTrack(art('content-30.md', post), ctx('b2c'));
  assert.equal(result.ok, false, 'a content file cannot declare its way onto the other track');
});

test('a Brain with no readable Track line falls back to the record', () => {
  const brain = '# Founder Brain\n\n- **Track:** wibble\n\n## Audience\n\nThe ICP is schools.\n';
  const result = checkTrack(art('founder-brain.md', brain), ctx('b2c'));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'track.unknown-value'));
});
