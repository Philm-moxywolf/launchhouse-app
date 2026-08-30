/**
 * src/web/routes/signin-agrees.test.ts
 *
 * WHAT IT IS
 * The two sign in screens, read side by side, and the assertion that they say the same
 * thing.
 *
 * WHY IT EXISTS
 * There are two renderings of one journey and there always will be. The server rendered
 * screen in src/server/auth/pages.ts has to exist, because it is the only one that works
 * before dist/web is built and with JavaScript switched off, and a founder who cannot sign
 * in cannot report that they cannot sign in. This React screen has to exist, because it is
 * the first thing anybody sees and it should look like the app they just deployed.
 *
 * TWO RENDERINGS OF ONE JOURNEY IS EXACTLY WHAT WENT WRONG LAST TIME. The React screen
 * posted JSON at an address nobody had registered while the server rendered form posted
 * somewhere else, and a founder pressing the button was told their address was wrong. The
 * routes agree now, because there is only one of them. This file is what keeps the WORDS
 * agreeing as well, so somebody editing one screen finds out here rather than from a
 * founder who read two different explanations of the same thing.
 *
 * WHAT IT READS AND WRITES
 * Renders the component to a string. Reads the server's page function. Nothing else.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { WHERE_THE_PASSPHRASE_IS, signInPage } from "../../server/auth/pages.ts";
import { markup, screenText } from "../test-fixtures.ts";
import { SignIn } from "./SignIn.tsx";

/** The server page as prose, with the markup and the inline stylesheet taken out. */
function serverText(): string {
  return signInPage()
    .replace(/<style>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

test("BOTH SIGN IN SCREENS NAME THE SAME VARIABLE AND THE SAME PLACE TO READ IT", () => {
  const react = screenText(createElement(SignIn));
  const server = serverText();

  for (const [where, text] of [
    ["the React screen", react],
    ["the server rendered screen", server],
  ] as const) {
    assert.match(text, /There is no account to make/, `${where} does not answer the first doubt`);
    assert.match(text, /OWNER_PASSPHRASE/, `${where} does not name the variable`);
    assert.match(text, /Replit Secret/, `${where} does not say where it lives`);
  }

  // The recovery sentence is one string on the server. The React screen cannot import it,
  // because that module is not in the browser bundle, so it is retyped there and checked
  // here. This is the assertion that catches the retyped copy going stale.
  assert.ok(react.includes(WHERE_THE_PASSPHRASE_IS), "the React screen has drifted from WHERE_THE_PASSPHRASE_IS");
  assert.ok(server.includes(WHERE_THE_PASSPHRASE_IS));
});

test("BOTH SIGN IN SCREENS POST TO THE SAME ROUTE, WHICH IS WHY THERE IS ONLY ONE OF THEM", () => {
  // The React screen is a real HTML form rather than a fetch. If somebody turns it back
  // into a fetch at a second address, this is what says so.
  const html = markup(createElement(SignIn));
  assert.match(html, /<form[^>]+method="post"[^>]*>/i);
  assert.match(html, /action="\/auth\/signin"/);
  assert.match(html, /name="passphrase"/);
  assert.match(html, /type="password"/);
  assert.match(signInPage(), /<form method="POST" action="\/auth\/signin">/);
});

test("NEITHER SCREEN ASKS FOR AN EMAIL ADDRESS, BECAUSE THERE IS NOWHERE TO SEND ONE", () => {
  const react = screenText(createElement(SignIn));
  const server = serverText();
  for (const [where, text] of [
    ["the React screen", react],
    ["the server rendered screen", server],
  ] as const) {
    assert.doesNotMatch(text, /email/i, `${where} still mentions email`);
    assert.doesNotMatch(text, /magic link/i, `${where} still mentions a magic link`);
    assert.doesNotMatch(text, /roster/i, `${where} still mentions the roster`);
    assert.doesNotMatch(text, /mentor/i, `${where} sends somebody to a mentor who is not there`);
  }
});
