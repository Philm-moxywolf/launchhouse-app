/**
 * src/server/auth/pages.test.ts
 *
 * WHAT THIS IS. The founder facing writing rules, run over every string a
 * founder reads while signing in.
 *
 * WHY IT EXISTS. The rules for anything a founder reads are enforced by
 * `scripts/validate.sh` across the content repo, and nothing enforced them over
 * the app's own screens. These screens are read by all 130 founders before any
 * skill is. A dash here is the same mistake as a dash in a skill body, and
 * until this file existed it was the one nobody would catch.
 *
 * The rules, from the project's own writing section: no em dashes or en dashes,
 * ranges written as "11 to 13", no marketing language, short sentences, name
 * the reader's doubt first, end on an action.
 *
 * WHAT IT CALLS. ./pages.ts. Strings only.
 * WHAT IT READS AND WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkYourEmailPage,
  codePage,
  codeRefusedNotice,
  escapeHtml,
  mentorAskedPage,
  notOnRosterPage,
  signInEmail,
  signInPage,
  verifyPage,
} from './pages.ts';
import type { RefusalReason } from './magic-link.ts';

/** Every screen and every message, built once so one loop covers all of them. */
function everyString(): Array<[string, string]> {
  const reasons: RefusalReason[] = ['unknown', 'expired', 'used', 'wrong_code', 'no_attempts_left'];
  return [
    ['signInEmail', signInEmail({ url: 'https://x.test/auth/verify?t=abc', code: '123456', minutes: 30, firstName: 'Ama' })],
    ['signInEmail, no name', signInEmail({ url: 'https://x.test/a', code: '000000', minutes: 30, firstName: null })],
    ['signInPage', signInPage()],
    ['checkYourEmailPage', checkYourEmailPage('ama@example.com', 30)],
    ['notOnRosterPage', notOnRosterPage({ kind: 'not_on_roster', email: 'nobody@example.com' })],
    ['notOnRosterPage, malformed', notOnRosterPage({ kind: 'malformed', typed: 'ama' })],
    ['notOnRosterPage, disabled', notOnRosterPage({ kind: 'disabled', email: 'ama@example.com' })],
    ['mentorAskedPage', mentorAskedPage('nobody@example.com')],
    ['verifyPage, valid', verifyPage({ kind: 'valid', email: 'ama@example.com' }, 'tok', 30)],
    ['verifyPage, used', verifyPage({ kind: 'used' }, 'tok', 30)],
    ['verifyPage, expired', verifyPage({ kind: 'expired' }, 'tok', 30)],
    ['verifyPage, unknown', verifyPage({ kind: 'unknown' }, 'tok', 30)],
    ['codePage', codePage()],
    ...reasons.map((r): [string, string] => [`codeRefusedNotice ${r}`, codeRefusedNotice(r)]),
  ];
}

test('NO EM DASH AND NO EN DASH ANYWHERE A FOUNDER READS', () => {
  for (const [name, text] of everyString()) {
    assert.ok(!text.includes('—'), `${name} has an em dash`);
    assert.ok(!text.includes('–'), `${name} has an en dash`);
    assert.ok(!text.includes('―'), `${name} has a horizontal bar`);
  }
});

test('NO MARKETING LANGUAGE ANYWHERE A FOUNDER READS', () => {
  // The list is the one validate.sh enforces across the content repo.
  const banned = [
    'supercharge',
    'unlock',
    'revolutionary',
    'seamless',
    'leverage',
    'game changer',
    'game-changer',
    'effortless',
    'cutting-edge',
    'cutting edge',
  ];
  for (const [name, text] of everyString()) {
    const lower = text.toLowerCase();
    for (const word of banned) {
      assert.ok(!lower.includes(word), `${name} contains "${word}"`);
    }
  }
});

test('NO SCREEN PROMISES ANYTHING WE CANNOT DELIVER', () => {
  // The same discipline as never promising a reply rate, applied to sign in. A
  // sentence about how fast an email arrives is a promise about somebody else's
  // mail server.
  const promises = [/arrives? in seconds/i, /instantly/i, /guarantee/i, /always works/i, /never fails/i];
  for (const [name, text] of everyString()) {
    for (const promise of promises) {
      assert.ok(!promise.test(text), `${name} promises something: ${promise.source}`);
    }
  }
});

test('EVERY DEAD END SCREEN ENDS ON AN ACTION', () => {
  const endings: Array<[string, string, RegExp]> = [
    ['not on the roster', notOnRosterPage({ kind: 'not_on_roster', email: 'x@y.com' }), /Try this one|Tell a mentor/],
    ['used link', verifyPage({ kind: 'used' }, 't', 30), /Send me a new link/],
    ['expired link', verifyPage({ kind: 'expired' }, 't', 30), /Send me a new link/],
    ['check your email', checkYourEmailPage('x@y.com', 30), /ask for another one/],
    ['too many codes', codeRefusedNotice('no_attempts_left'), /Ask for a new email/],
  ];
  for (const [name, text, action] of endings) {
    assert.match(text, action, `${name} does not end on an action`);
  }
});

test('THE ROSTER MISS NAMES THE DOUBT FIRST, THEN ANSWERS IT', () => {
  const page = notOnRosterPage({ kind: 'not_on_roster', email: 'nobody@example.com' });
  const heading = page.indexOf('We cannot find that address');
  const typed = page.indexOf('You typed: nobody@example.com');
  const reasons = page.indexOf('Two things usually explain it');
  assert.ok(heading > 0 && typed > heading && reasons > typed, 'doubt, then what they typed, then the answer');
});

test('MARKUP IN AN ADDRESS IS ESCAPED, IN EVERY PLACE ONE IS ECHOED BACK', () => {
  const nasty = '"><script>alert(1)</script>';
  assert.equal(escapeHtml(nasty), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  for (const page of [
    notOnRosterPage({ kind: 'malformed', typed: nasty }),
    signInPage({ prefill: nasty }),
    codePage({ prefill: nasty, notice: nasty }),
    mentorAskedPage(nasty),
    checkYourEmailPage(nasty, 30),
    verifyPage({ kind: 'valid', email: nasty }, nasty, 30),
  ]) {
    assert.doesNotMatch(page, /<script>alert/);
  }
});

test('THE EMAIL CARRIES THE LINK, THE CODE, AND THE SENTENCE THAT STOPS A SUPPORT MESSAGE', () => {
  const text = signInEmail({ url: 'https://x.test/auth/verify?t=abc', code: '004321', minutes: 30, firstName: 'Ama' });
  assert.match(text, /^Hello Ama,/);
  assert.match(text, /https:\/\/x\.test\/auth\/verify\?t=abc/);
  assert.match(text, /^ {4}004321$/m, 'a code beginning with a zero is still six characters');
  assert.match(text, /works for 30 minutes/);
  assert.match(text, /If you did not ask for this, ignore it/);
});
