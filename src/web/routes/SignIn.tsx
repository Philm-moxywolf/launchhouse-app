/** @jsxRuntime automatic */
/**
 * src/web/routes/SignIn.tsx
 *
 * WHAT IT IS
 * The first screen anybody sees on their own deployment. One passphrase box, one button.
 *
 * WHY IT EXISTS
 * Three failures, and the third one is the reason this screen is shaped the way it is.
 *
 * One, hunting for a sign up link. This app belongs to one person and there is no account
 * to make, so the screen says that before the founder starts looking. Somebody who spends
 * five minutes looking for something that does not exist decides the software is broken.
 *
 * Two, not knowing what passphrase is being asked for. It is OWNER_PASSPHRASE, a Replit
 * Secret they set in the same minute they pasted the three keys. The screen names the
 * variable and says where to read it, because on a single tenant deployment there is
 * nobody to ask and no email to send.
 *
 * THREE, TWO RENDERINGS OF ONE JOURNEY DISAGREEING. This used to be a React screen that
 * posted JSON to `/api/auth/request-link` while the server rendered a form that posted to
 * `/auth/request`. Two implementations of one decision, and they drifted: for a while the
 * JSON path answered 404 and a founder who WAS on the roster was told their address was
 * wrong. So this is a plain HTML form now, posting to the same `/auth/signin` route the
 * server rendered screen posts to. There is one code path, one set of sentences, and no
 * public JSON endpoint for signing in at all.
 *
 * WHAT THAT COSTS, NAMED RATHER THAN HIDDEN. A refused passphrase lands on the server
 * rendered screen, which is plainer than this one. It happens once, it says the same
 * thing, and it is worth it: the alternative is a second copy of every refusal in two
 * places, and the second copy is the one that goes stale.
 *
 * WHAT CALLS IT
 * app.tsx, when nobody is signed in.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It holds no state, calls nothing, and the browser posts the form itself. That
 * is also why it works with the API unreachable.
 */

import type { ReactElement } from "react";

/**
 * The one sentence that makes forgetting the passphrase a non event.
 *
 * The same words as `WHERE_THE_PASSPHRASE_IS` in src/server/auth/pages.ts.
 * `signin-agrees.test.ts` asserts the two screens say the same thing, so this cannot
 * quietly drift from the screen a founder meets after a wrong answer.
 */
const WHERE_IT_IS =
  "Cannot remember it? Open this project on Replit, click Secrets, and read OWNER_PASSPHRASE there.";

export function SignIn(): ReactElement {
  return (
    <div className="signin">
      <div className="signin-card">
        <h1 className="signin-title">Launchhouse</h1>
        <p className="signin-sub">Atlanta, 25 to 27 September 2026.</p>

        <p>
          There is no account to make. This app belongs to one person, and the passphrase is
          the one you put into Replit Secrets under the name OWNER_PASSPHRASE. A Replit Secret
          is a private setting for your app that nobody else can read.
        </p>

        {/*
          A real form post, not a fetch. The browser sends it, the server answers 303, and
          the next page is the app. No JavaScript is involved, so this screen still works on
          a deployment where the bundle is stale or the API is down.
        */}
        <form method="POST" action="/auth/signin">
          <label className="field" htmlFor="passphrase">
            <span className="field-label">Your passphrase</span>
            <input
              className="field-input"
              id="passphrase"
              name="passphrase"
              type="password"
              autoComplete="current-password"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              required
            />
          </label>
          <button type="submit" className="button button-big">
            Sign in
          </button>
        </form>

        <p className="signin-note">{WHERE_IT_IS}</p>
      </div>
    </div>
  );
}
