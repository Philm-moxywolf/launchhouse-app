/**
 * validate-source.test.ts: proves the extractor really did read the shell
 *   script, and did not quietly fall back on nothing.
 *
 * WHY IT EXISTS: an extractor that returns an empty list on a rename is worse
 *   than no extractor, because everything downstream reports a pass. These
 *   tests assert on words that are in `validate.sh` today. If somebody removes
 *   one on purpose, this test fails and they change it here too, which is the
 *   deliberate act the whole design is asking for.
 *
 * CALLED BY: node --test.
 * READS:     the content repo, through content-root.ts.
 * WRITES:    nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bannedWordRegex,
  ereToRegExp,
  houseStyleSource,
  VALIDATE_SH_PATH,
} from './validate-source.ts';
import { contentRoot, readContentFile } from './content-root.ts';

test('the content repo is found and holds validate.sh', () => {
  assert.ok(contentRoot().length > 0);
  assert.match(readContentFile(VALIDATE_SH_PATH), /^#!/);
});

test('the dash class is lifted, not retyped, and holds two characters', () => {
  const source = houseStyleSource();
  assert.equal([...source.dashChars].length, 2, 'expected an em dash and an en dash');
  const [em, en] = [...source.dashChars];
  assert.equal(em?.codePointAt(0), 0x2014, 'em dash');
  assert.equal(en?.codePointAt(0), 0x2013, 'en dash');
});

test('the banned word list carries the words the project documents name', () => {
  const source = houseStyleSource();
  for (const word of ['supercharge', 'unlock', 'revolutionary', 'seamless', 'leverage']) {
    assert.ok(source.banned.ere.includes(word), `${word} is missing from BANNED`);
  }
  for (const phrase of ['game', 'cutting', 'best']) {
    assert.ok(source.bannedPhrases.ere.includes(phrase), `${phrase} is missing from BANNED_PHRASES`);
  }
});

test('the banned word regex respects the same boundaries the shell script uses', () => {
  const hit = (text: string): boolean => {
    const re = bannedWordRegex();
    re.lastIndex = 0;
    return re.test(text);
  };
  assert.ok(hit('this will unlock the door'), 'a bare banned word is caught');
  assert.ok(hit('Seamless onboarding.'), 'case does not matter');
  assert.ok(!hit('padlocked'), 'a word that merely contains one is not caught');
  assert.ok(!hit('half-unlocked'), 'the hyphen boundary is respected');
});

test('the reply promise pattern and its negation filter both arrive', () => {
  const source = houseStyleSource();
  const promise = new RegExp(source.promise.ere, 'i');
  assert.ok(promise.test('we guarantee a reply within two days'));
  assert.ok(source.promiseNegation.regex.test('nothing here promises a reply, and it never will'));
});

test('the DM automation pattern arrives', () => {
  const source = houseStyleSource();
  const dm = new RegExp(source.dmMention.ere, 'i');
  assert.ok(dm.test('we can automate cold DMs for you'));
  assert.ok(dm.test('turn on DM automation'));
});

test('every lifted pattern names a real line in validate.sh', () => {
  const source = houseStyleSource();
  const total = readContentFile(VALIDATE_SH_PATH).split('\n').length;
  for (const p of [source.dashes, source.banned, source.bannedPhrases, source.promise, source.dmMention]) {
    assert.ok(p.line > 0 && p.line <= total, `${p.name} points at line ${p.line}`);
  }
});

test('a POSIX class is translated rather than passed through', () => {
  const re = ereToRegExp('[[:digit:]]+', '', 'a test');
  assert.ok(re.test('42'));
  assert.ok(!re.test('no numbers here'));
});

test('an untranslatable construct throws rather than compiling something close', () => {
  assert.throws(() => ereToRegExp('\\bword\\b', '', 'a test'), /Perl style class/);
  assert.throws(() => ereToRegExp('(?:group)', '', 'a test'), /group modifier/);
});
