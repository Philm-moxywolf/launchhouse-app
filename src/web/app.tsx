/** @jsxRuntime automatic */
/**
 * src/web/app.tsx
 *
 * WHAT IT IS
 * The whole app in one component: who is signed in, which screen the address names, and the
 * data that screen needs.
 *
 * WHY IT EXISTS
 * Somewhere has to answer three questions before any screen renders, and doing it in each
 * screen produces three different answers. Are we signed in. Have the two first run
 * questions been answered. Is this founder allowed on this address.
 *
 * The third is rule 1 and it is enforced here as well as inside the screens. An address can
 * be typed, and a mentor can paste the wrong link into Slack in a hurry. A founder who lands
 * on a screen that is not theirs gets a plain sentence and a way back, and the screen itself
 * never renders, so there is no moment where the other track's heading is on the page.
 *
 * The second question matters more than it looks. A founder with no timezone has a server
 * that does not know what "9am" means for them, and every date after that is wrong by
 * however many hours. So the two questions come first, whatever address they arrived on.
 *
 * WHAT CALLS IT
 * main.tsx.
 *
 * WHAT IT READS AND WRITES
 * Reads the session, the home state, the setup state, and the address bar. Writes nothing
 * itself.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { fetchHome, fetchSession, fetchSetup, signOut } from "./lib/api.ts";
import type { Founder, HomeState, SetupState } from "./lib/api.ts";
import { HOME, hrefFor, parseHash } from "./lib/nav.ts";
import type { View } from "./lib/nav.ts";
import { apolloRowExists } from "./lib/track.ts";
import { Notice } from "./components/Notice.tsx";
import { Shell } from "./components/Shell.tsx";
import { Working } from "./components/Working.tsx";
import { SignIn } from "./routes/SignIn.tsx";
import { FirstRun } from "./routes/FirstRun.tsx";
import { Home } from "./routes/Home.tsx";
import { Thread } from "./routes/Thread.tsx";
import { Files, FileView } from "./routes/Files.tsx";
import { Gates } from "./routes/Gates.tsx";
import { Setup } from "./routes/Setup.tsx";
import { GhlIntro, GhlWalk } from "./routes/GhlWalk.tsx";
import { Apollo } from "./routes/Apollo.tsx";

type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "out" }
  | { readonly kind: "in"; readonly founder: Founder }
  | { readonly kind: "problem"; readonly text: string };

function useHashView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setView(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((next: View): void => {
    window.location.hash = hrefFor(next).slice(1);
  }, []);
  return [view, go];
}

export function App(): ReactElement {
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
  const [view, go] = useHashView();

  const load = useCallback((): void => {
    void fetchSession().then((result) => {
      if (!result.ok) {
        setSession(
          result.problem.kind === "signed_out"
            ? { kind: "out" }
            : { kind: "problem", text: result.problem.text },
        );
        return;
      }
      setSession(result.value.signedIn ? { kind: "in", founder: result.value.founder } : { kind: "out" });
    });
  }, []);

  useEffect(load, [load]);

  if (session.kind === "loading") {
    return (
      <div className="page page-narrow">
        <Working what="Getting your work." />
      </div>
    );
  }

  if (session.kind === "problem") {
    return (
      <div className="page page-narrow">
        <Notice tone="problem" title="We could not open your account" lines={[session.text]} actionLabel="Try again" onAction={load} />
      </div>
    );
  }

  if (session.kind === "out") return <SignIn />;

  const founder = session.founder;

  // The two first run questions come before anything else, whatever address they arrived
  // on. Without a timezone the server does not know what nine in the morning means for
  // this founder, and every date it writes after that is wrong.
  if (founder.timezone === null || founder.displayName === null) {
    return <FirstRun founder={founder} onDone={load} />;
  }

  return (
    <Shell
      current={view}
      name={founder.displayName}
      onSignOut={() => {
        void signOut().then(load);
      }}
    >
      <Screen founder={founder} view={view} go={go} onFounderChanged={load} />
    </Shell>
  );
}

function Screen({
  founder,
  view,
  go,
  onFounderChanged,
}: {
  readonly founder: Founder;
  readonly view: View;
  readonly go: (view: View) => void;
  readonly onFounderChanged: () => void;
}): ReactElement {
  switch (view.kind) {
    case "home":
      return <HomeScreen founder={founder} />;
    case "first-run":
      return <FirstRun founder={founder} onDone={onFounderChanged} />;
    case "thread":
      return <Thread founder={founder} routeId={view.routeId} />;
    case "files":
      return <Files founder={founder} />;
    case "file":
      return <FileView founder={founder} name={view.name} />;
    case "gates":
      return <Gates founder={founder} />;
    case "setup":
    case "setup-ghl-intro":
    case "setup-ghl-step":
    case "setup-apollo":
      return <SetupScreen founder={founder} view={view} go={go} />;
    case "unknown":
      return (
        <div className="page page-narrow">
          <Notice
            tone="problem"
            title="There is no page at that address"
            lines={[
              "The link may have been cut short somewhere between us and you.",
              "Everything you have made is still here.",
            ]}
          />
          <a className="button" href={hrefFor(HOME)}>
            Back to the start
          </a>
        </div>
      );
  }
}

function HomeScreen({ founder }: { readonly founder: Founder }): ReactElement {
  const [home, setHome] = useState<HomeState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchHome().then((result) => {
      if (!live) return;
      if (result.ok) setHome(result.value);
      else setProblem(result.problem.text);
    });
    return () => {
      live = false;
    };
  }, []);

  if (problem !== null) {
    return (
      <div className="page">
        <Notice tone="problem" lines={[problem]} />
      </div>
    );
  }
  if (home === null) {
    return (
      <div className="page">
        <Working what="Checking where you are up to." />
      </div>
    );
  }
  return <Home founder={founder} home={home} />;
}

/**
 * Every setup screen, and the one place the setup state is fetched.
 *
 * The token walk changes that state on nearly every screen, so a single fetch with a
 * refresh callback keeps the rail, the walk and the connected page reading the same answer.
 */
function SetupScreen({
  founder,
  view,
  go,
}: {
  readonly founder: Founder;
  readonly view: View;
  readonly go: (next: View) => void;
}): ReactElement {
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback((): void => {
    void fetchSetup().then((result) => {
      if (result.ok) setSetup(result.value);
      else setProblem(result.problem.text);
    });
  }, []);

  useEffect(load, [load]);

  if (problem !== null) {
    return (
      <div className="page">
        <Notice tone="problem" title="We could not open your setup" lines={[problem]} actionLabel="Try again" onAction={load} />
      </div>
    );
  }
  if (setup === null) {
    return (
      <div className="page">
        <Working what="Checking what is set up." />
      </div>
    );
  }

  if (view.kind === "setup-apollo") {
    // Rule 1, at the door. A B2C founder never reaches this screen, whatever they type.
    if (!apolloRowExists(founder.track)) return <NotYours />;
    return <Apollo />;
  }

  if (view.kind === "setup-ghl-intro") {
    return <GhlIntro onGo={(slug) => go({ kind: "setup-ghl-step", slug })} />;
  }

  if (view.kind === "setup-ghl-step") {
    return (
      <GhlWalk
        slug={view.slug}
        setup={setup}
        onGo={(slug) => go({ kind: "setup-ghl-step", slug })}
        onBackToRail={() => go({ kind: "setup" })}
        onSetupChanged={load}
      />
    );
  }

  return <Setup founder={founder} setup={setup} />;
}

function NotYours(): ReactElement {
  return (
    <div className="page page-narrow">
      <Notice
        tone="problem"
        title="That is not one of yours"
        lines={[
          "This part of the programme is not on your track, so there is nothing here for you.",
          "If somebody sent you this link, they had the wrong one.",
        ]}
      />
      <a className="button" href={hrefFor(HOME)}>
        Back to the start
      </a>
    </div>
  );
}
