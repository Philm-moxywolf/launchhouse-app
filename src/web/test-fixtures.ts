/**
 * src/web/test-fixtures.ts
 *
 * WHAT IT IS
 * The fixtures and the two helpers the render tests in this folder use: a founder, a setup
 * state, a home state, and a way to read a rendered component as the words on the screen.
 *
 * WHY IT EXISTS
 * The strongest assertions in this app are negative. "A B2C founder never sees the word
 * Apollo" is only provable against the text that actually reaches the screen, not against
 * the props that went in, because the word could arrive through a label, a subtitle, a
 * blurb or a link. `screenText` renders the component the way a browser would and hands
 * back the words, so a test can assert on absence and mean it.
 *
 * Entities are decoded because React escapes text by construction, and an assertion against
 * copy containing an apostrophe would otherwise fail for a reason that has nothing to do
 * with the behaviour under test.
 *
 * WHAT CALLS IT
 * The `*.test.ts` files in src/web. Nothing in the app imports it, so it is not in the
 * browser bundle.
 *
 * WHAT IT READS AND WRITES
 * Nothing.
 */

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Founder, HomeState, SetupState } from "./lib/api.ts";
import type { Track } from "../../app/content/routes.ts";

/** The markup a browser would receive. */
export function markup(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

/** The words a founder would read, with tags removed and entities decoded. */
export function screenText(element: ReactElement): string {
  return markup(element)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function founder(track: Track | null, extra: Partial<Founder> = {}): Founder {
  return {
    id: "f_1",
    firstName: "Priya",
    displayName: "Priya",
    timezone: "America/New_York",
    track,
    trackLocked: track !== null,
    ...extra,
  };
}

export function homeState(extra: Partial<HomeState> = {}): HomeState {
  return { routes: {}, nextRouteId: "founder-brain", presentFiles: [], ...extra };
}

export function setupState(extra: Partial<SetupState> = {}): SetupState {
  return {
    profile: { name: "Priya", timezone: "America/New_York" },
    steps: {},
    ghl: {
      connected: false,
      locationId: null,
      locationName: null,
      accounts: [],
      contacts: "not_checked",
      tokenMadeAt: null,
    },
    /**
     * NOT SET, because that is the state every founder starts in and the one the screens
     * are most often wrong about. A fixture that arrived with a key already in it would
     * render the settled row, and the paste box, which is the first thing 130 people
     * touch, would never be read by the house style test.
     */
    anthropic: { set: false, checkedAt: null, length: null },
    ...extra,
  };
}
