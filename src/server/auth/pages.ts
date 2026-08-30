/**
 * src/server/auth/pages.ts
 *
 * WHAT THIS IS. Every word the founder reads while signing in, and the small
 * amount of HTML that carries it. Pure functions from state to a string.
 *
 * WHY IT EXISTS. Three reasons.
 *
 *   Sign in cannot depend on the browser bundle. These screens have to work
 *   with JavaScript switched off and before dist/web exists at all, because
 *   somebody who cannot sign in cannot report that they cannot sign in. Server
 *   rendered HTML with a plain form has no such dependency, and on a first
 *   deployment the bundle is the most likely thing to be missing.
 *
 *   Prose is testable when it is a function. The rules for anything a founder
 *   reads are: no dashes, short sentences, name the doubt first, end on an
 *   action, and never a promise we cannot keep. A test can assert that over a
 *   string. It cannot assert it over a template buried in a route handler.
 *
 *   And the screens have to say what to DO. This deployment belongs to one
 *   person and there is nobody to ask. So the sentence that tells them where
 *   their own passphrase is written down appears on every screen where they
 *   might need it, rather than once.
 *
 * WHAT CALLS IT. ./plugin.ts for the screens. `escapeHtml` and `layout` are
 * also used by ../routes/errors.ts, which is why they are exported and why
 * their signatures have not changed.
 *
 * WHAT IT READS AND WRITES. Nothing. Strings in, strings out.
 */

/**
 * Escape before interpolation, every time, with no exceptions made for values
 * that "cannot" contain markup. Kept exactly as it was: the sign in screens no
 * longer echo anything a stranger typed, and this is not the file to remove an
 * escape from on the strength of that.
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
  ol { margin: 0 0 1rem; padding-left: 1.3rem; }
  li { margin: 0 0 0.6rem; }
  .quiet { opacity: 0.75; font-size: 0.95rem; }
  form { margin: 1.5rem 0 0; }
  label { display: block; font-weight: 600; margin: 0 0 0.4rem; }
  input[type=email], input[type=text], input[type=password] {
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

/**
 * The one sentence that makes forgetting the passphrase a non event.
 *
 * It is a constant and it is used on three screens rather than written three
 * times, because the day somebody changes the name of the variable is the day
 * two of the three would still say the old one.
 */
export const WHERE_THE_PASSPHRASE_IS =
  'Cannot remember it? Open this project on Replit, click Secrets, and read OWNER_PASSPHRASE there.';

/** Notices the sign in screen can carry, named rather than passed as text. */
export type SignInNotice = 'signed_out' | 'wrong_passphrase' | 'account_closed' | 'session_ended';

/**
 * WHY THESE ARE KEYS AND NOT A STRING FROM THE QUERY.
 *
 * The old screen took `?notice=` and printed it. Escaped, so it was not a
 * scripting hole, but it still meant anybody could send the founder a link to
 * their own app carrying any sentence they liked above the passphrase box.
 * "Your passphrase has expired, type the old one and the new one" is a
 * convincing thing to read on a real address with a real padlock. A fixed set
 * of keys removes that entirely, and there are only four things this screen
 * ever has to say.
 */
export function signInNotice(notice: SignInNotice): string {
  switch (notice) {
    case 'signed_out':
      return 'You are signed out on this device. Your work is where you left it.';
    case 'wrong_passphrase':
      return 'That passphrase is not right. Check for a capital letter you missed, then try again.';
    case 'account_closed':
      return 'This app is closed. Its owner row in the database is switched off, so nobody can sign in until that is cleared.';
    case 'session_ended':
      return 'You were signed out because the passphrase changed. Sign in with the new one.';
  }
}

/** Read a notice key out of a query string, or nothing. Never trusts the value. */
export function asSignInNotice(value: unknown): SignInNotice | null {
  return value === 'signed_out' || value === 'wrong_passphrase' || value === 'account_closed' || value === 'session_ended'
    ? value
    : null;
}

/**
 * One passphrase box and one button.
 *
 * IT NAMES THE DOUBT IN THE FIRST SENTENCE. The doubt on this screen is not
 * "which password did I use", it is "I never made an account, so what is it
 * asking me for". Answering that before the box is what stops somebody hunting
 * for a sign up link that does not exist.
 */
export function signInPage(args: { notice?: SignInNotice } = {}): string {
  const notice = args.notice === undefined ? '' : `<p>${escapeHtml(signInNotice(args.notice))}</p>`;
  return layout(
    'Sign in',
    `<h1>Sign in</h1>
${notice}
<p>There is no account to make. This app belongs to one person, and the passphrase is the one
you put into Replit Secrets under the name OWNER_PASSPHRASE. A Replit Secret is a private
setting for your app that nobody else can read.</p>
<form method="POST" action="/auth/signin">
  <label for="passphrase">Your passphrase</label>
  <input id="passphrase" name="passphrase" type="password" autocomplete="current-password"
         autocapitalize="none" spellcheck="false" required autofocus>
  <button type="submit">Sign in</button>
</form>
<p class="quiet row">${escapeHtml(WHERE_THE_PASSPHRASE_IS)}</p>`,
  );
}

/**
 * The deployment has no usable passphrase, so nobody can sign in, including the
 * founder.
 *
 * THIS SCREEN IS THE FAIL CLOSED STATE MADE READABLE. The app refuses every
 * request while it is in this state. That is only defensible if the person who
 * meets it is told exactly what to do, in the order they have to do it, with
 * the name of the variable spelled out.
 */
export function notSetUpPage(reason: 'missing' | 'too_short' | 'too_easy', minLength: number): string {
  const heading =
    reason === 'missing'
      ? 'This app has no passphrase yet'
      : reason === 'too_short'
        ? 'The passphrase is too short'
        : 'That passphrase is too easy to guess';

  const doubt =
    reason === 'missing'
      ? 'Nobody can sign in, and that includes you. It is on purpose. An app on a public web address with no passphrase is an app anybody can open.'
      : reason === 'too_short'
        ? `OWNER_PASSPHRASE is set, and it is under ${String(minLength)} characters. Short passphrases are guessed, and this one is the only thing between the internet and your files.`
        : 'OWNER_PASSPHRASE is set to one of the ones people try first. Anybody who found this address would try it too.';

  const third =
    reason === 'missing'
      ? `Add a secret named OWNER_PASSPHRASE. Make it at least ${String(minLength)} characters. A short sentence you will remember is ideal.`
      : reason === 'too_short'
        ? `Change OWNER_PASSPHRASE to at least ${String(minLength)} characters. A short sentence you will remember is ideal.`
        : 'Change OWNER_PASSPHRASE to something only you would type. A short sentence about your own business works well.';

  return layout(
    heading,
    `<h1>${escapeHtml(heading)}</h1>
<p>${escapeHtml(doubt)}</p>
<p>Four steps and you are in.</p>
<ol>
  <li>Open this project on Replit.</li>
  <li>Click Secrets in the tools list on the left.</li>
  <li>${escapeHtml(third)}</li>
  <li>Redeploy, then reload this page.</li>
</ol>
<p class="quiet">Nothing you have made is affected while you do this. The passphrase decides who gets in, and nothing else.</p>`,
  );
}

/**
 * Too many wrong answers from one device.
 *
 * SAYS WHEN, NOT JUST NO. A screen that says "try again later" with no time on
 * it is a dead end, and a dead end on the sign in screen of an app somebody
 * owns is where they decide it is broken.
 */
export function tooManyTriesPage(retryAfterMs: number): string {
  return layout(
    'Too many tries',
    `<h1>Too many wrong tries from this device</h1>
<p>${escapeHtml(waitSentence(retryAfterMs))}</p>
<p>That limit is what stops somebody guessing their way into your app from the internet, so it
applies to you as well.</p>
<p class="quiet">${escapeHtml(WHERE_THE_PASSPHRASE_IS)}</p>`,
  );
}

/**
 * How long to wait, rounded up to a whole minute, because a founder reading a
 * screen does not count seconds and "in 47 seconds" invites a stopwatch.
 */
export function waitSentence(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return minutes === 1 ? 'Wait a minute, then try again.' : `Wait ${String(minutes)} minutes, then try again.`;
}
