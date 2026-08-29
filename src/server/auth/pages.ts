/**
 * src/server/auth/pages.ts
 *
 * WHAT THIS IS. Every word a founder reads while signing in, and the small
 * amount of HTML that carries it. Pure functions from state to a string.
 *
 * WHY IT EXISTS. Three reasons.
 *
 *   Sign in cannot depend on the browser bundle. The verify page has to work
 *   with JavaScript switched off and before dist/web exists at all, because a
 *   founder who cannot sign in cannot report that they cannot sign in. Server
 *   rendered HTML with a plain form has no such dependency.
 *
 *   The verify page must contain a POST and nothing else that changes state. A
 *   single page app rendering this screen would be a page whose behaviour
 *   depends on whether the mail scanner runs JavaScript, and several of them
 *   do. A form with a submit button cannot be triggered by a fetch.
 *
 *   Prose is testable when it is a function. The writing rules for anything a
 *   founder reads are: no dashes, short sentences, name the doubt first, end on
 *   an action, and never a promise we cannot keep. A test can assert that over
 *   a string. It cannot assert it over a template buried in a route handler.
 *
 * WHAT CALLS IT. ./plugin.ts for the screens, ./magic-link.ts for the email.
 * WHAT IT READS AND WRITES. Nothing. Strings in, strings out.
 */

import type { LinkState, RefusalReason } from './magic-link.ts';
import type { RosterMiss } from './roster.ts';
import { missMessage } from './roster.ts';

/**
 * Escape before interpolation, every time, with no exceptions made for values
 * that "cannot" contain markup. The address on the roster miss screen is typed
 * by whoever is at the keyboard, and echoing it back is the whole point of that
 * screen.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One page shell, no external requests.
 *
 * Everything is inline. A stylesheet or a font from another host is a request
 * that fails on a venue network with a captive portal, and the screen a founder
 * would see is unstyled text they do not trust.
 */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 17px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         margin: 0; padding: 3rem 1.25rem; display: flex; justify-content: center; }
  main { width: 100%; max-width: 34rem; }
  h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; }
  .quiet { opacity: 0.75; font-size: 0.95rem; }
  form { margin: 1.5rem 0 0; }
  label { display: block; font-weight: 600; margin: 0 0 0.4rem; }
  input[type=email], input[type=text] {
    font: inherit; width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem;
    border: 1px solid currentColor; border-radius: 8px; background: transparent; color: inherit; }
  button { font: inherit; font-weight: 600; margin-top: 1rem; padding: 0.75rem 1.4rem;
    border: 0; border-radius: 8px; cursor: pointer; background: #1a1a1a; color: #fff; }
  @media (prefers-color-scheme: dark) { button { background: #f5f5f5; color: #111; } }
  .row { margin-top: 2rem; }
  code { font: 0.95em ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body><main>
${body}
</main></body>
</html>
`;
}

/** The email itself. Plain text, because a link that renders is a link that gets clicked. */
export function signInEmail(args: {
  url: string;
  code: string;
  minutes: number;
  firstName: string | null;
}): string {
  const hello = args.firstName === null ? 'Hello,' : `Hello ${args.firstName},`;
  return [
    hello,
    '',
    'Here is your sign in link for Launchhouse. There is no password.',
    '',
    args.url,
    '',
    `The link works for ${String(args.minutes)} minutes. Open it and press the button on the page.`,
    '',
    'If your mail app will not open a browser, type this code into the sign in screen instead:',
    '',
    `    ${args.code}`,
    '',
    'You will need the email address you booked with as well as the code.',
    '',
    'If you did not ask for this, ignore it. Nothing happens until somebody presses the button.',
  ].join('\n');
}

/** One email field, one button, and the sentence that stops a founder hunting for a password. */
export function signInPage(args: { prefill?: string; notice?: string } = {}): string {
  const prefill = args.prefill === undefined ? '' : escapeHtml(args.prefill);
  const notice = args.notice === undefined ? '' : `<p>${escapeHtml(args.notice)}</p>`;
  return layout(
    'Sign in to Launchhouse',
    `<h1>Sign in</h1>
${notice}
<p>No password. We send you a link.</p>
<form method="POST" action="/auth/request">
  <label for="email">The email address you booked with</label>
  <input id="email" name="email" type="email" autocomplete="email" autocapitalize="none"
         spellcheck="false" required value="${prefill}">
  <button type="submit">Send me a link</button>
</form>
<div class="row">
  <p class="quiet">Already have a six digit code? <a href="/auth/code">Type it here</a>.</p>
</div>`,
  );
}

/** After a request, whether or not anything was sent. The two must read the same. */
export function checkYourEmailPage(email: string, minutes: number): string {
  return layout(
    'Check your email',
    `<h1>Check your email</h1>
<p>We have sent a link to ${escapeHtml(email)}. It works for ${String(minutes)} minutes.</p>
<p>Open it and press the button on the page. One extra press, and it means a mail scanner
cannot use up your link before you do.</p>
<p class="quiet">Nothing there after a minute? Check your junk folder, then
<a href="/auth/signin">ask for another one</a>.</p>`,
  );
}

/**
 * The roster miss. Not a dead end: what they typed, the two usual reasons, and
 * two buttons. This screen is why the roster is not treated as a secret. It is
 * a closed event with a known guest list, and a founder who cannot get in is a
 * mentor pulled out of a live session.
 */
export function notOnRosterPage(miss: RosterMiss): string {
  const { heading, body } = missMessage(miss);
  const typed = miss.kind === 'malformed' ? miss.typed : miss.email;
  const paragraphs = body.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
  return layout(
    heading,
    `<h1>${escapeHtml(heading)}</h1>
${paragraphs}
<form method="GET" action="/auth/signin">
  <label for="email">Try another address</label>
  <input id="email" name="email" type="email" autocomplete="email" autocapitalize="none"
         spellcheck="false" required value="${escapeHtml(typed)}">
  <button type="submit">Try this one</button>
</form>
<form method="POST" action="/auth/help">
  <input type="hidden" name="email" value="${escapeHtml(typed)}">
  <button type="submit">Tell a mentor</button>
</form>`,
  );
}

/** The mentor queue confirmation. Says what happens next, and when. */
export function mentorAskedPage(email: string): string {
  return layout(
    'A mentor has been told',
    `<h1>A mentor has been told</h1>
<p>We have passed on ${escapeHtml(email)}. Somebody will add you and email you a link.</p>
<p>If you are at the event, find a mentor in the room. That is faster.</p>`,
  );
}

/**
 * THE PAGE THE PREFETCH PROBLEM EXISTS FOR.
 *
 * A GET renders this and changes nothing. The button POSTs. Mail scanners fetch
 * every URL in an incoming message before the human sees it, and several of them
 * follow redirects, but none of them submit forms.
 */
export function verifyPage(state: LinkState, token: string, minutes: number): string {
  if (state.kind === 'valid') {
    return layout(
      'One press and you are in',
      `<h1>One press and you are in</h1>
<p>Signing in as ${escapeHtml(state.email)}.</p>
<form method="POST" action="/auth/verify">
  <input type="hidden" name="t" value="${escapeHtml(token)}">
  <button type="submit">Sign me in</button>
</form>
<p class="quiet row">Why the extra press? Some company mail systems open every link in a
message before you do. Without this page, they would use your link up and you would arrive
at a dead one.</p>`,
    );
  }

  const heading = state.kind === 'used' ? 'That link has already been used' : 'That link will not work';
  const explain =
    state.kind === 'used'
      ? 'Somebody has signed in with it already. If that was you on another device, you are still signed in there.'
      : state.kind === 'expired'
        ? `Links last ${String(minutes)} minutes. This one is past that.`
        : 'We do not recognise it. It may have been cut in half by your mail app.';
  return layout(
    heading,
    `<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(explain)}</p>
<p>Ask for a fresh one. It takes a few seconds.</p>
<form method="GET" action="/auth/signin">
  <button type="submit">Send me a new link</button>
</form>`,
  );
}

/** The six digit code screen, for a mail app that will not open a browser. */
export function codePage(args: { prefill?: string; notice?: string } = {}): string {
  const prefill = args.prefill === undefined ? '' : escapeHtml(args.prefill);
  const notice = args.notice === undefined ? '' : `<p>${escapeHtml(args.notice)}</p>`;
  return layout(
    'Type your code',
    `<h1>Type your code</h1>
${notice}
<p>The code is in the same email as the link. It is six digits.</p>
<form method="POST" action="/auth/code">
  <label for="email">The email address you booked with</label>
  <input id="email" name="email" type="email" autocomplete="email" autocapitalize="none"
         spellcheck="false" required value="${prefill}">
  <label for="code" class="row">Your six digit code</label>
  <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
         maxlength="9" required>
  <button type="submit">Sign me in</button>
</form>`,
  );
}

/** What a refused code says. Never which half was wrong, and never how many tries are left. */
export function codeRefusedNotice(reason: RefusalReason): string {
  switch (reason) {
    case 'no_attempts_left':
      return 'Too many tries on that code. Ask for a new email and use the code in it.';
    case 'expired':
      return 'That code has expired. Ask for a new email.';
    case 'used':
      return 'That code has been used already. Ask for a new email.';
    case 'wrong_code':
    case 'unknown':
      return 'That address and code do not go together. Check both and try again.';
  }
}
