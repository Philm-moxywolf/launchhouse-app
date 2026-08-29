/**
 * index.test.ts: the gate as a whole, and the gate turned on itself.
 *
 * WHY IT EXISTS: two things nothing else can prove.
 *
 *   First, that the rules run together and a refusal from any one of them stops
 *   the artifact. A gate assembled wrongly passes every unit test underneath it.
 *
 *   Second, the self test. Every sentence this folder can show a founder is run
 *   through the house style rules this folder enforces. A gate that refuses an
 *   em dash in a founder's post while writing one in its own refusal message is
 *   not going to be taken seriously, and this is the only way to know.
 *
 * CALLED BY: node --test.
 * READS:     the content repo, through the rules.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { explainRefusal, runRules, runRulesOverAll } from './index.ts';
import { checkNoDmAutomation } from './no-dm-automation.ts';
import { checkNoInventedProof } from './no-invented-proof.ts';
import { checkOwnership } from './ownership.ts';
import { checkProse, checkProseText } from './prose.ts';
import { checkTrack } from './track.ts';
import { checkAllGates, type FolderState } from './gate.ts';
import { exampleBrain } from './test-fixtures.ts';
import type { Artifact, FounderContext, Track, Violation } from './types.ts';

const EM = String.fromCodePoint(0x2014);

function ctxFor(track: Track): FounderContext {
  return { track, brain: exampleBrain(track) };
}

function post(text: string, path = 'content-30.md'): Artifact {
  return { path, text, authored: 'model' };
}

test('a clean post on the right track passes every rule', () => {
  const answer = runRules(
    post('The whiteboard in the portacabin is not a system. It is a memory.'),
    ctxFor('b2b'),
  );
  assert.equal(answer.ok, true, JSON.stringify(answer.blocked, null, 1));
  assert.deepEqual(answer.blocked, []);
  assert.equal(answer.results.length, 5);
});

test('every rule reports what it checked, so no rule can pass on nothing', () => {
  const answer = runRules(post('Anything.'), ctxFor('b2c'));
  for (const result of answer.results) {
    assert.ok(result.checked.length > 0, result.rule);
  }
});

test('a refusal from any one rule stops the artifact', () => {
  const cases: Array<[string, Artifact, FounderContext]> = [
    ['track', post('Enrol them in the email sequence.'), ctxFor('b2c')],
    ['no-dm-automation', post('We can automate DMs for you.'), ctxFor('b2c')],
    ['no-invented-proof', post('We have 63 clients now.'), ctxFor('b2b')],
    ['prose', post(`A seamless start ${EM} and quick.`), ctxFor('b2b')],
    ['ownership', post('Fine text.', '../elsewhere.md'), ctxFor('b2b')],
  ];
  for (const [rule, artifact, ctx] of cases) {
    const answer = runRules(artifact, ctx);
    assert.equal(answer.ok, false, `${rule} did not stop it`);
    assert.ok(answer.blocked.some((v) => v.rule === rule), `${rule} was not the one that stopped it`);
  }
});

test('one bad file refuses the whole turn, so a folder is never left half written', () => {
  const answer = runRulesOverAll(
    [post('This one is fine.'), post('We can automate DMs for you.')],
    ctxFor('b2c'),
  );
  assert.equal(answer.ok, false);
});

test('the gate refuses to be handed nothing', () => {
  assert.throws(() => runRulesOverAll([], ctxFor('b2b')), /fail closed/);
});

test('the founder is told the track problem before the punctuation problem', () => {
  const answer = runRules(post(`Enrol them in the email sequence ${EM} today.`), ctxFor('b2c'));
  assert.equal(answer.blocked[0]?.rule, 'track');
});

test('the explanation names the problem and the reason, and says how many more', () => {
  const answer = runRules(post('A seamless and effortless start.'), ctxFor('b2b'));
  const text = explainRefusal(answer);
  assert.match(text, /seamless/);
  assert.match(text, /one more like it/);
});

/* ---------------------------------------------------------------------- */
/* The self test: this folder held to its own rules                        */
/* ---------------------------------------------------------------------- */

/** Every violation this folder can produce, driven out of the real rules. */
function everyViolation(): Violation[] {
  const b2b = ctxFor('b2b');
  const b2c = ctxFor('b2c');
  const out: Violation[] = [];

  const push = (vs: Violation[]): void => {
    out.push(...vs);
  };

  push(checkProse(post(`A seamless ${EM} game changer, 11-13 of them, and we guarantee a reply.`)).violations);
  push(checkProse({ path: 'memory.md', text: 'Truly seamless.', authored: 'founder' }, { includeFounderWriting: true }).violations);

  push(checkTrack(post('Enrol them in the email sequence with Apollo, ICP and DKIM.'), b2c).violations);
  push(checkTrack(post('Set up your hook bank and a Business account.'), b2b).violations);
  push(checkTrack(post('x', 'outreach-sequence.md'), b2c).violations);
  push(checkTrack(post('x', 'dm-openers.md'), { track: null, brain: null }).violations);
  push(checkTrack(post('# Founder Brain\n\n## Thesis\nx\n', 'founder-brain.md'), b2b).violations);
  push(checkTrack(post('# Founder Brain\n\n- **Track:** both\n', 'founder-brain.md'), b2b).violations);
  push(checkTrack(post('# Founder Brain\n\n- **Track:** b2c\n', 'founder-brain.md'), b2b).violations);
  push(checkTrack(post('key: a@b.co\nname: X\n\n## Yours\n', 'people/a-b-co.md'), b2b).violations);
  push(checkTrack(post('key: a@b.co\nkind: lurker\n\n## Yours\n', 'people/a-b-co.md'), b2b).violations);
  push(checkTrack(post('key: a@b.co\nkind: prospect\n\n## Yours\n', 'people/a-b-co.md'), b2c).violations);
  push(checkTrack(post('key: a@b.co\nkind: prospect\nhandle: x\n\n## Yours\n', 'people/a-b-co.md'), b2b).violations);

  push(checkNoDmAutomation(post('We can automate DMs for you, in bulk, on a schedule.')).violations);
  push(checkNoDmAutomation(post('There is no DM automation here.')).violations);

  push(checkNoInventedProof(post('We have 63 clients and 68% stay.'), b2b).violations);
  push(checkNoInventedProof(post('Try 63 openers.'), b2c).violations);
  push(checkNoInventedProof(post('Anything.'), { track: 'b2b', brain: null }).violations);

  push(checkOwnership(post('x', '../out.md')).violations);
  push(checkOwnership(post('x', '/etc/passwd')).violations);
  push(checkOwnership(post('x', 'people\\bad.md')).violations);
  push(checkOwnership(post('x', 'scratch.md')).violations);
  push(checkOwnership(post('x', 'voice-samples/one.md')).violations);
  push(checkOwnership(post('x', 'people/Bad Name.md')).violations);
  push(
    checkOwnership(
      { path: 'people/a-b-co.md', text: 'k: v\n\n## Yours\nmine, tidied', authored: 'model' },
      { previous: 'k: v\n\n## Yours\nmine, untidied   ' },
    ).violations,
  );

  const folder: FolderState = {
    track: 'b2c',
    files: {},
    peopleByStatus: {},
    approvedPieces: 4,
    openersWritten: 2,
    selfReported: { 'the pieces sound like the founder': false },
  };
  for (const report of checkAllGates(folder)) {
    for (const item of report.items) {
      out.push({
        rule: 'gate',
        code: 'gate.selftest',
        severity: 'warn',
        where: { path: '.state/index.md', line: 1, column: 1, excerpt: item.item },
        found: item.item,
        message: item.evidence,
        why: report.headline,
        recovery: item.recovery,
      });
    }
  }

  return out;
}

test('the gate produces enough different messages for the self test to mean something', () => {
  const codes = new Set(everyViolation().map((v) => v.code));
  assert.ok(codes.size >= 15, `only ${codes.size} distinct violation codes were reached`);
});

/**
 * Blank out the founder's own words where the gate quotes them back.
 *
 * THE USE AND MENTION DISTINCTION, AND WHY IT IS DRAWN THIS NARROWLY. The rule is
 * that no sentence the gate WRITES contains a banned word, a dash, a dashed range
 * or a promise of a reply. When the founder's post says "seamless", the most
 * useful thing the gate can say is: the word "seamless" is on the list this
 * toolkit does not use. Naming the word is what makes the refusal actionable for
 * somebody who is not technical, and it is the founder's own text, quoted, not the
 * gate's prose. `explainRefusal` renders that paragraph on its own with no file
 * highlight beside it, so taking the word out would leave a founder reading "one
 * word here is not allowed" with no way to know which.
 *
 * So only the quoted form is masked: the exact `found` text with a double quote at
 * each end, once per field. An unquoted banned word anywhere in the gate's own
 * copy is still a failure, which is what stops this from becoming an exemption.
 * "Try something more seamless" would still be caught on a banned-word violation
 * whose found is "seamless".
 */
function withoutQuotedEvidence(text: string, found: string): string {
  const quoted = `"${found}"`;
  const at = text.indexOf(quoted);
  if (at < 0) return text;
  return `${text.slice(0, at)}${' '.repeat(quoted.length)}${text.slice(at + quoted.length)}`;
}

test('EVERY SENTENCE THIS GATE SHOWS A FOUNDER PASSES ITS OWN HOUSE STYLE RULES', () => {
  const failures: string[] = [];
  for (const v of everyViolation()) {
    for (const [field, text] of [
      ['message', v.message],
      ['why', v.why],
      ['recovery label', v.recovery.label],
    ] as const) {
      const own = withoutQuotedEvidence(text, v.found);
      const result = checkProseText(`${v.code} ${field}`, own);
      for (const bad of result.violations) {
        failures.push(`${v.code} ${field}: ${bad.code} on "${bad.found}" in: ${text}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('the self test still catches a banned word the gate wrote itself', () => {
  // Proves the masking above is narrow. If this ever passes, the exemption has
  // widened into "anything a violation quotes", and the self test above stops
  // meaning anything.
  const banned = 'Try something more seamless.';
  assert.equal(withoutQuotedEvidence(banned, 'seamless'), banned);
  assert.ok(checkProseText('proof', withoutQuotedEvidence(banned, 'seamless')).violations.length > 0);
});

test('every violation the gate can produce ends on a way out', () => {
  for (const v of everyViolation()) {
    assert.ok(v.recovery.label.trim().length > 0, `${v.code} has no recovery label`);
    assert.ok(
      ['route', 'reply', 'edit'].includes(v.recovery.action.kind),
      `${v.code} has no way out`,
    );
  }
});

test('no violation shows a founder a raw path from inside the app', () => {
  // The ported spirit of tests/cases/29-no-internal-leaks.sh: nothing from
  // inside the machinery reaches a founder's eyes.
  for (const v of everyViolation()) {
    const shown = `${v.message} ${v.why} ${v.recovery.label}`;
    assert.doesNotMatch(shown, /src\/server/, v.code);
    assert.doesNotMatch(shown, /\.ts:\d/, v.code);
    assert.doesNotMatch(shown, /node_modules/, v.code);
    assert.doesNotMatch(shown, /\/Users\//, v.code);
  }
});

test('every violation names a place, and the line is a real line', () => {
  const artifact = post(`line one\nline two\nA seamless ${EM} thing.`);
  for (const v of runRules(artifact, ctxFor('b2b')).blocked) {
    assert.ok(v.where.line >= 1, v.code);
    assert.ok(v.where.line <= artifact.text.split('\n').length, v.code);
    assert.equal(v.where.path, artifact.path);
  }
});
