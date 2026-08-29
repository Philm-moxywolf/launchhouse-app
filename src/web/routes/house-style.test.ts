/// <reference types="node" />
/**
 * src/web/routes/house-style.test.ts
 *
 * WHAT IT IS
 * Every screen rendered, and its words put through the project's own house style rules.
 *
 * WHY IT EXISTS
 * The writing rules for anything a founder reads are not a preference. No em dashes or en
 * dashes, ranges written as "11 to 13", no marketing language, and nothing anywhere that
 * promises a reply. `scripts/validate.sh` enforces them on the files a human wrote in the
 * content repo, and `src/server/rules/prose.ts` enforces them at runtime on what a model
 * wrote. Neither of them can see this folder, because the copy here is neither: it is
 * written into components and rendered in a browser.
 *
 * So this test renders the screens and runs the same rules over the result. The banned word
 * list is lifted from `validate.sh` by the rule module, not typed out again here, so the
 * three places these rules are enforced cannot drift apart.
 *
 * The reply promise check earns its place on its own. Rule 3 says B2B outreach is 25 low
 * volume messages and that nothing we ship promises replies, because replies depend on the
 * list, the offer and the timing. The Apollo screen is exactly where somebody would
 * eventually write "expect two or three replies", and this is what stops it.
 *
 * THREE SCREENS WERE MISSING, AND ADDING THEM NEEDED A FIXTURE FIRST.
 * Files, Gates and FirstRun were not in SCREENS. FirstRun shows everything it has from its
 * props, so it simply goes in. Files and Gates fetch in `useEffect`, and React runs no
 * effects when it renders to a string, so adding them as they stand renders the waiting
 * state and nothing else: 31 characters for Files, 293 for Gates. Both pass the rules, and
 * they pass without reading one word of the screen a founder sees. That is coverage in name
 * only, and it is worse than none, because the row in the list claims the screen is checked.
 *
 * So `loadedScreen` below renders them with their data in. It runs the component's own
 * effect, lets its own `fetch` call resolve against a stubbed answer, and renders again with
 * what came back. No component is changed, and no copy is retyped here.
 *
 * AND THE FIXTURE IS ITSELF CHECKED. A harness that quietly stopped working would put the
 * waiting state back through the rules and stay green. The last test asserts that each
 * loaded screen carries words that exist only in its loaded state, so the day the harness
 * breaks it says so instead of going quiet.
 *
 * WHAT IT READS AND WRITES. The rule module reads `scripts/validate.sh` from the content
 * repo once. `loadedScreen` replaces `globalThis.fetch` while it runs and puts it back.
 * Nothing is written, and nothing opens a socket.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import type { ReactElement } from "react";
import { checkProseText } from "../../server/rules/prose.ts";
import { GHL_WALK_STEPS } from "../../../app/content/ghl-walk.ts";
import { founder, homeState, screenText, setupState } from "../test-fixtures.ts";
import type { FilesState, Founder, GatesState } from "../lib/api.ts";
import { Home } from "./Home.tsx";
import { Setup } from "./Setup.tsx";
import { SignIn } from "./SignIn.tsx";
import { Apollo } from "./Apollo.tsx";
import { GhlIntro, GhlWalk } from "./GhlWalk.tsx";
import { Thread } from "./Thread.tsx";
import { Files } from "./Files.tsx";
import { FirstRun } from "./FirstRun.tsx";
import { Gates } from "./Gates.tsx";

const noop = (): void => undefined;

// ---------------------------------------------------------------------------------------
// The loaded state fixture
// ---------------------------------------------------------------------------------------

/**
 * React's current hooks dispatcher.
 *
 * `useState` and `useEffect` are one line each inside the React package: they look this up
 * and call it. `react-dom/server` puts its own in for the length of a render, and its
 * `useEffect` does nothing, which is right for a server and is exactly why a screen that
 * fetches renders empty here.
 *
 * SO THE COMPONENT IS CALLED AS A FUNCTION, WITH A DISPATCHER OF OUR OWN, and the element
 * tree it returns is then handed to `react-dom/server` in the ordinary way. Only the top
 * level component's own hooks go through the one below. Every child renders as it always
 * did.
 *
 * IT IS A REACT INTERNAL, AND IT IS NAMED LIKE ONE. That is worth the one place it is used:
 * the alternative is a screen a founder reads and no test does. If React moves it, the
 * assertion below fails at import and says so, rather than this file quietly going back to
 * checking 31 characters.
 */
interface Dispatcher {
  useState: <S>(initial: S | (() => S)) => [S, (next: S | ((prev: S) => S)) => void];
  useEffect: (create: () => void | (() => void), deps?: readonly unknown[]) => void;
}

const REACT_INTERNALS = (
  React as unknown as Record<string, { H: Dispatcher | null } | undefined>
)["__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE"];

assert.ok(
  REACT_INTERNALS !== undefined && "H" in REACT_INTERNALS,
  "React no longer exposes its hooks dispatcher where this file looks for it, so the loaded screens cannot be rendered. Fix the harness rather than dropping the screens: the alternative is copy that nothing checks.",
);

/** One hook's slot. Slots are numbered by call order, which is how React identifies them too. */
interface Slot {
  value: unknown;
  deps: readonly unknown[] | undefined;
}

/**
 * Call a component with our own dispatcher, and collect the effects it asked for.
 *
 * Every hook this does not implement throws, on purpose. A component that grows a
 * `useReducer` tomorrow should stop this file rather than be rendered with a hook that
 * quietly hands back the wrong thing.
 */
function callWithHooks<P>(
  component: (props: P) => ReactElement,
  props: P,
  slots: Map<number, Slot>,
  onSet: () => void,
): { element: ReactElement; effects: (() => void | (() => void))[] } {
  let index = 0;
  const effects: (() => void | (() => void))[] = [];

  const dispatcher = {
    useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
      const at = index;
      index += 1;
      const existing = slots.get(at);
      const value = (
        existing === undefined
          ? typeof initial === "function"
            ? (initial as () => S)()
            : initial
          : existing.value
      ) as S;
      const set = (next: S | ((prev: S) => S)): void => {
        const resolved = typeof next === "function" ? (next as (prev: S) => S)(value) : next;
        slots.set(at, { value: resolved, deps: undefined });
        onSet();
      };
      return [value, set];
    },
    useEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
      const at = index;
      index += 1;
      const existing = slots.get(at);
      const ranBefore = existing !== undefined;
      const sameDeps =
        ranBefore &&
        existing.deps !== undefined &&
        deps !== undefined &&
        existing.deps.length === deps.length &&
        existing.deps.every((d, i) => Object.is(d, deps[i]));
      slots.set(at, { value: null, deps: deps ?? [] });
      // The dependency rule, honoured, because without it the effect fetches again on every
      // pass and the loop below never settles.
      if (!ranBefore || !sameDeps) effects.push(create);
    },
  };

  const guarded = new Proxy(dispatcher as unknown as Record<string, unknown>, {
    get(target, property) {
      if (property in target) return Reflect.get(target, property) as unknown;
      throw new Error(
        `The screen under test calls ${String(property)}, which this fixture does not implement. Implement it here rather than taking the screen off the list.`,
      );
    },
  }) as unknown as Dispatcher;

  const internals = REACT_INTERNALS as { H: Dispatcher | null };
  const previous = internals.H;
  internals.H = guarded;
  try {
    return { element: component(props), effects };
  } finally {
    internals.H = previous;
  }
}

/** A `fetch` that answers the paths named here and refuses everything else. */
function stubFetch(answers: Readonly<Record<string, unknown>>): typeof globalThis.fetch {
  return ((input: RequestInfo | URL) => {
    const path = String(input);
    const body = answers[path];
    if (body === undefined) {
      // Refusing rather than answering 404 keeps a typo in this fixture loud. A 404 becomes
      // `not_built_yet`, which renders a perfectly well written sentence, and the screen
      // would be checked in the wrong state all over again.
      return Promise.reject(new Error(`the fixture has no answer for ${path}`));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    );
  }) as typeof globalThis.fetch;
}

/**
 * A screen with its data in it, rendered the way a founder would see it.
 *
 * Render, run the effects, let the answers arrive, render again with what came back, and
 * stop when nothing changed. Six passes is a ceiling rather than a target: these screens
 * settle on the second.
 *
 * The stub goes on `globalThis.fetch` rather than on `api.ts`, so the real request and the
 * real result handling run. If `toResult` ever started refusing a body of this shape, it
 * would show up here as a screen stuck on its waiting state, which is what the last test in
 * this file catches.
 */
async function loadedScreen<P>(
  component: (props: P) => ReactElement,
  props: P,
  answers: Readonly<Record<string, unknown>>,
): Promise<ReactElement> {
  const slots = new Map<number, Slot>();
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch(answers);
  try {
    let element: ReactElement | null = null;
    for (let pass = 0; pass < 6; pass += 1) {
      let changed = false;
      const run = callWithHooks(component, props, slots, () => {
        changed = true;
      });
      element = run.element;
      // The cleanup a component returns is deliberately never called. Files sets a `live`
      // flag in its cleanup and reads it inside the promise, so calling it here would
      // cancel the very answer this fixture exists to deliver.
      for (const effect of run.effects) effect();
      // One turn of the loop, so a promise that has already resolved gets to run its `then`.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!changed && pass > 0) break;
    }
    assert.ok(element !== null, "the component never rendered");
    return element;
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------------------------------------------------------------------------------------
// The data. Shaped like a founder part way through, because an empty screen checks nothing.
// ---------------------------------------------------------------------------------------

const B2C: Founder = founder("b2c");

const FILES: FilesState = {
  rows: [
    {
      name: "founder-brain.md",
      gateLabel: "gate A",
      status: "ok",
      sizeBytes: 4184,
      changedAt: "2026-09-12T09:00:00Z",
      kind: "markdown",
      track: "both",
    },
    {
      name: "content-30.md",
      gateLabel: "gate B",
      status: "ok",
      sizeBytes: 18422,
      changedAt: "2026-09-19T14:20:00Z",
      kind: "markdown",
      track: "both",
    },
    {
      name: "content-30.csv",
      gateLabel: "gate B",
      status: "empty",
      sizeBytes: 0,
      changedAt: "2026-09-19T14:20:00Z",
      kind: "csv",
      track: "both",
    },
    {
      name: "hook-bank.md",
      gateLabel: "gate C",
      status: "missing",
      sizeBytes: 0,
      changedAt: null,
      kind: "markdown",
      track: "b2c",
    },
    {
      name: "people/",
      gateLabel: "gate B or C",
      status: "ok",
      sizeBytes: 12400,
      changedAt: "2026-09-19T16:00:00Z",
      kind: "folder",
      track: "both",
      count: 27,
    },
  ],
  stateRows: [
    {
      name: ".state/index.md",
      gateLabel: "-",
      status: "ok",
      sizeBytes: 900,
      changedAt: "2026-09-19T16:00:00Z",
      kind: "markdown",
      track: "both",
    },
  ],
};

/**
 * Deliberately mixed. Every state a gate item can be in has to reach the rules: done,
 * started, not yet, and the one only the founder can answer.
 */
const GATES: GatesState = {
  fileStatus: {
    "founder-brain.md": "ok",
    "content-30.md": "ok",
    "content-30.csv": "empty",
    "rss-feeds.md": "missing",
    "ledger.md": "ok",
    "dm-openers.md": "missing",
    "hook-bank.md": "missing",
    "inbound-scripts.md": "missing",
    "ops-workflow.md": "missing",
    "outreach-sequence.md": "missing",
    "outreach-firstlines.csv": "missing",
    "people/": "ok",
  },
  submitted: { A: "2026-09-12", B: null, C: null },
  // One gate with a form and two without, so both branches of that sentence are read.
  formUrl: { A: "https://docs.google.com/forms/d/e/example/viewform", B: null, C: null },
};

function walkStep(slug: string): ReactElement {
  return createElement(GhlWalk, {
    slug,
    setup: setupState(),
    onGo: noop,
    onBackToRail: noop,
    onSetupChanged: noop,
  });
}

/** The screens that had to be loaded first, kept apart so the last test can name them. */
const LOADED: readonly (readonly [string, ReactElement])[] = [
  ["files, with files in it", await loadedScreen(Files, { founder: B2C }, { "/api/files": FILES })],
  ["gates, B2C, with progress on it", await loadedScreen(Gates, { founder: B2C }, { "/api/gates": GATES })],
  [
    "gates, B2B, with progress on it",
    await loadedScreen(Gates, { founder: founder("b2b") }, { "/api/gates": GATES }),
  ],
  [
    "gates, no track yet",
    await loadedScreen(Gates, { founder: founder(null, { trackLocked: false }) }, { "/api/gates": GATES }),
  ],
];

/** Every screen a founder can reach, in the state they first meet it. */
const SCREENS: readonly (readonly [string, ReactElement])[] = [
  ["sign in", createElement(SignIn)],
  ["home, B2C", createElement(Home, { founder: founder("b2c"), home: homeState() })],
  ["home, B2B", createElement(Home, { founder: founder("b2b"), home: homeState() })],
  ["home, no track yet", createElement(Home, { founder: founder(null, { trackLocked: false }), home: homeState() })],
  ["setup", createElement(Setup, { founder: founder("b2b"), setup: setupState({ apollo: { connected: false } }) })],
  ["apollo", createElement(Apollo)],
  ["the token walk introduction", createElement(GhlIntro, { onGo: noop })],
  ["a refused thread", createElement(Thread, { founder: founder("b2c"), routeId: "outreach-engine" })],
  // First run shows everything it has from its props, including the clock it asks the
  // founder to check, so it needs no fixture at all.
  ["first run", createElement(FirstRun, { founder: founder(null, { trackLocked: false }), onDone: noop })],
  ...LOADED,
  ...GHL_WALK_STEPS.map((step) => [`token walk, ${step.slug}`, walkStep(step.slug)] as const),
];

test("no screen a founder reads breaks the house style", () => {
  for (const [label, element] of SCREENS) {
    const result = checkProseText(label, screenText(element));
    assert.equal(
      result.ok,
      true,
      `${label}: ${result.violations.map((v) => `${v.code} on "${v.found}"`).join("; ")}`,
    );
  }
});

test("nothing anywhere promises a reply, which is rule 3", () => {
  // Checked twice on purpose. The rule module carries the check, and naming it here means
  // the day somebody weakens the module, this test still says which rule was lost.
  for (const [label, element] of SCREENS) {
    const text = screenText(element).toLowerCase();
    for (const phrase of ["reply rate", "replies from", "expect replies", "guaranteed"]) {
      assert.ok(!text.includes(phrase), `${label} promises something about replies: "${phrase}"`);
    }
  }
});

test("THE LOADED SCREENS REALLY ARE LOADED, so the two tests above are reading them", () => {
  // The failure this catches: the fixture stops working, every loaded screen falls back to
  // its waiting state, the rules pass over "Your files Fetching your files." and the list
  // above still claims the screen is checked. Each phrase below exists only in the branch
  // that renders after the data has arrived.
  const mustCarry: Readonly<Record<string, readonly string[]>> = {
    "files, with files in it": ["Take everything", "Download everything", "founder-brain.md"],
    "gates, B2C, with progress on it": ["Open the form", "You sent this one on", "Next:"],
    "gates, B2B, with progress on it": ["Open the form", "Next:"],
    "gates, no track yet": ["Two of the three are the same for everybody", "Next:"],
  };

  for (const [label, element] of LOADED) {
    const text = screenText(element);
    // A floor as well as the phrases. Files rendered 31 characters in the state this test
    // exists to stop, and Gates rendered 293.
    assert.ok(text.length > 400, `${label} rendered ${String(text.length)} characters, which is its waiting state`);
    assert.ok(!text.includes("Fetching your files"), `${label} is still waiting for its data`);
    assert.ok(!text.includes("Checking your work"), `${label} is still waiting for its data`);
    for (const phrase of mustCarry[label] ?? []) {
      assert.ok(text.includes(phrase), `${label} does not carry "${phrase}", so it is not the loaded screen`);
    }
  }

  // Rule 1, while these screens are here anyway. The B2C gates screen must not name the
  // other track's work, and the B2B one must not name theirs.
  const textFor = (label: string): string =>
    screenText(LOADED.find(([l]) => l === label)?.[1] as ReactElement);
  const b2c = textFor("gates, B2C, with progress on it").toLowerCase();
  const b2b = textFor("gates, B2B, with progress on it").toLowerCase();
  for (const word of ["first lines", "outreach", "apollo"]) {
    assert.ok(!b2c.includes(word), `"${word}" reached a B2C gates screen`);
  }
  for (const word of ["hook bank", "dm opener", "inbound script"]) {
    assert.ok(!b2b.includes(word), `"${word}" reached a B2B gates screen`);
  }
});
