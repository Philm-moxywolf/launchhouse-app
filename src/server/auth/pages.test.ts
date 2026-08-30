/**
 * src/server/auth/pages.test.ts
 *
 * WHAT THIS IS. The founder facing writing rules, run over every string a
 * founder reads while signing in.
 *
 * WHY IT EXISTS. The rules for anything a founder reads are enforced by
 * `scripts/validate.sh` across the content repo, and nothing enforced them over
 * the app's own screens. These are the first screens anybody sees on a
 * deployment they have just made, and one of them is the only thing standing
 * between a founder and an app that will not let them in. A dash here is the
 * same mistake as a dash in a skill body, and until this file existed it was
 * the one nobody would catch.
 *
 * The rules, from the project's own writing section: no em dashes or en dashes,
 * ranges written as "11 to 13", no marketing language, short sentences, name
 * the reader's doubt first, end on an action.
 *
 * AND ONE RULE THAT IS NOT ABOUT WRITING. Every screen that can leave somebody
 * stuck has to carry the sentence saying where their own passphrase is written
 * down. There is nobody to ask on a single tenant deployment.
 *
 * WHAT IT CALLS. ./pages.ts. Strings only.
 * WHAT IT READS AND WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WHERE_THE_PASSPHRASE_IS,
  asSignInNotice,
  escapeHtml,
  notSetUpPage,
  signInNotice,
  signInPage,
  tooManyTriesPage,
  waitSentence,
  type SignInNotice,
} from './pages.ts';
import { MIN_PASSPHRASE_LENGTH } from './owner.ts';

const NOTICES: SignInNotice[] = ['signed_out', 'wrong_passphrase', 'account_closed', 'session_ended'];

/** Every screen and every message, built once so one loop covers all of them. */
function everyString(): Array<[string, string]> {
  return [
    ['signInPage', signInPage()],
    ...NOTICES.map((n): [string, string] => [`signInPage ${n}`, signInPage({ notice: n })]),
    ...NOTICES.map((n): [string, string] => [`signInNotice ${n}`, signInNotice(n)]),
    ['notSetUpPage missing', notSetUpPage('missing', MIN_PASSPHRASE_LENGTH)],
    ['notSetUpPage too_short', notSetUpPage('too_short', MIN_PASSPHRASE_LENGTH)],
    ['notSetUpPage too_easy', notSetUpPage('too_easy', MIN_PASSPHRASE_LENGTH)],
    ['tooManyTriesPage', tooManyTriesPage(600_000)],
    ['tooManyTriesPage, under a minute', tooManyTriesPage(4_000)],
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
  const promises = [/arrives? in seconds/i, /instantly/i, /guarantee/i, /always works/i, /never fails/i, /completely safe/i];
  for (const [name, text] of everyString()) {
    for (const promise of promises) {
      assert.ok(!promise.test(text), `${name} promises something: ${promise.source}`);
    }
  }
});

test('NO SCREEN LOADS ANYTHING FROM ANOTHER HOST', () => {
  // A stylesheet or a font from another host is a request that fails on a venue
  // network with a captive portal, and the screen the founder sees is unstyled
  // text they do not trust.
  for (const [name, text] of everyString()) {
    assert.doesNotMatch(text, /https?:\/\//, `${name} reaches out to another host`);
  }
});

test('EVERY SCREEN THAT CAN LEAVE SOMEBODY STUCK SAYS WHERE THE PASSPHRASE IS WRITTEN DOWN', () => {
  // Single tenant. There is no mentor to ask and no email to send. The only
  // recovery is the founder's own Replit Secrets pane, so the screens say so.
  for (const [name, text] of [
    ['signInPage', signInPage()],
    ['tooManyTriesPage', tooManyTriesPage(600_000)],
  ] as const) {
    assert.ok(text.includes(escapeHtml(WHERE_THE_PASSPHRASE_IS)), `${name} leaves somebody with nowhere to go`);
  }
  assert.match(WHERE_THE_PASSPHRASE_IS, /OWNER_PASSPHRASE/);
  assert.match(WHERE_THE_PASSPHRASE_IS, /Secrets/);
});

test('THE SIGN IN SCREEN NAMES THE DOUBT BEFORE IT ASKS FOR ANYTHING', () => {
  const page = signInPage();
  // The doubt is "I never made an account, so what is it asking me for".
  const doubt = page.indexOf('There is no account to make');
  const named = page.indexOf('OWNER_PASSPHRASE');
  const box = page.indexOf('<form method="POST" action="/auth/signin">');
  assert.ok(doubt > 0 && named > doubt && box > named, 'doubt, then the answer, then the box');
});

test('THE NOT SET UP SCREEN IS A LIST OF STEPS, NOT AN APOLOGY', () => {
  for (const reason of ['missing', 'too_short', 'too_easy'] as const) {
    const page = notSetUpPage(reason, MIN_PASSPHRASE_LENGTH);
    assert.match(page, /OWNER_PASSPHRASE/);
    assert.match(page, /Replit/);
    assert.match(page, /Secrets/);
    assert.match(page, /Redeploy, then reload this page/, `${reason} does not end on an action`);
    assert.equal((page.match(/<li>/g) ?? []).length, 4, `${reason} should be four steps`);
  }
  // The floor is quoted from the module rather than typed here, so raising it
  // cannot leave the screen telling somebody the old number.
  assert.match(notSetUpPage('missing', MIN_PASSPHRASE_LENGTH), new RegExp(`at least ${String(MIN_PASSPHRASE_LENGTH)} characters`));
});

test('THE TOO MANY TRIES SCREEN SAYS WHEN, NOT JUST NO', () => {
  assert.equal(waitSentence(4_000), 'Wait a minute, then try again.');
  assert.equal(waitSentence(60_000), 'Wait a minute, then try again.');
  assert.equal(waitSentence(600_000), 'Wait 10 minutes, then try again.');
  assert.equal(waitSentence(0), 'Wait a minute, then try again.', 'never says wait zero minutes');
  assert.match(tooManyTriesPage(600_000), /Wait 10 minutes, then try again\./);
});

test('THE NOTICE ON THE SIGN IN SCREEN CANNOT BE WRITTEN BY WHOEVER SENT THE LINK', () => {
  // The old screen printed ?notice= from the query. Escaped, so not a scripting
  // hole, but it meant anybody could send the founder a link to their own app
  // carrying any sentence above the passphrase box. "Your passphrase has
  // expired, type the old one and the new one" is convincing on a real address.
  assert.equal(asSignInNotice('signed_out'), 'signed_out');
  for (const hostile of [
    'Your passphrase has expired, type the old one and the new one',
    '<script>alert(1)</script>',
    'signed_out ',
    '',
    null,
    undefined,
    42,
    ['signed_out'],
  ]) {
    assert.equal(asSignInNotice(hostile), null, JSON.stringify(hostile));
  }
});

test('MARKUP IS ESCAPED, AND THE ESCAPE IS PROVED RATHER THAN ASSUMED', () => {
  const nasty = '"><script>alert(1)</script>';
  assert.equal(escapeHtml(nasty), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  for (const [name, text] of everyString()) {
    assert.doesNotMatch(text, /<script>alert/, name);
  }
});

test('SHORT SENTENCES, EVERYWHERE A FOUNDER READS', () => {
  // Not a style preference. These screens are read by somebody who is stuck, on
  // a phone, in a room. A 40 word sentence is one they stop reading halfway.
  for (const [name, text] of everyString()) {
    const prose = text
      .replace(/<style>[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    for (const sentence of prose.split(/(?<=[.?!])\s/)) {
      const words = sentence.trim().split(/\s+/).filter((w) => w.length > 0);
      assert.ok(words.length <= 34, `${name} has a ${String(words.length)} word sentence: ${sentence.trim()}`);
    }
  }
});
