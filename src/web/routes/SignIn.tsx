/** @jsxRuntime automatic */
/**
 * src/web/routes/SignIn.tsx
 *
 * WHAT IT IS
 * The first screen anybody sees. One email box, one button, and an honest answer for an
 * address that is not on the roster.
 *
 * WHY IT EXISTS
 * Three failures, and two of them are support conversations during a live session.
 *
 * One, hunting for a password field. There are 130 known people and no passwords anywhere,
 * so the screen says so before the founder starts looking. A founder who spends five
 * minutes looking for something that does not exist arrives at the event believing the
 * software is broken.
 *
 * Two, the scanner problem. Microsoft 365 Safe Links and several corporate scanners fetch
 * every URL in an incoming email before the human sees it, so a link that signs you in on
 * GET is already spent by the time the founder clicks it. The fix lives on the server: the
 * link lands on a page with one button, and the button posts. This screen says that out
 * loud in the "check your email" state, because a founder who is told to expect one more
 * click does not think the link is broken.
 *
 * Three, the dead end. Section 6 is explicit: an address that is not on the roster gets a
 * real answer, not a generic "check your email" that leaves somebody staring at an empty
 * inbox. This is a closed event with a known guest list, the roster is not a secret worth
 * protecting, and the two usual explanations are named with what they typed shown back to
 * them. Two ways forward, always. Never a dead end.
 *
 * WHAT CALLS IT
 * app.tsx, when nobody is signed in.
 *
 * WHAT IT READS AND WRITES
 * Calls requestSignInLink and tellAMentor. Holds the typed address in component state and
 * nowhere else.
 */

import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { requestSignInLink, tellAMentor } from "../lib/api.ts";
import { Notice } from "../components/Notice.tsx";
import { Working } from "../components/Working.tsx";

type Stage =
  | { readonly kind: "asking" }
  | { readonly kind: "sending" }
  | { readonly kind: "sent" }
  | { readonly kind: "not_on_roster" }
  | { readonly kind: "mentor" }
  | { readonly kind: "mentor_sent" }
  | { readonly kind: "problem"; readonly text: string };

export function SignIn(): ReactElement {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "asking" });

  const submit = (): void => {
    const address = email.trim();
    if (address === "") return;
    setStage({ kind: "sending" });
    void requestSignInLink(address).then((result) => {
      if (!result.ok) {
        setStage({ kind: "problem", text: result.problem.text });
        return;
      }
      // A rate limited attempt shows the same screen as a sent one, on purpose. Anything
      // else turns the limit into a way of asking whether an address is on the list.
      setStage(
        result.value.sent || result.value.reason === "rate_limited"
          ? { kind: "sent" }
          : { kind: "not_on_roster" },
      );
    });
  };

  const sendMentorNote = (): void => {
    setStage({ kind: "sending" });
    void tellAMentor(email.trim(), note.trim()).then((result) => {
      setStage(result.ok ? { kind: "mentor_sent" } : { kind: "problem", text: result.problem.text });
    });
  };

  if (stage.kind === "sending") {
    return (
      <SignInFrame>
        <Working what="Sending." />
      </SignInFrame>
    );
  }

  if (stage.kind === "sent") {
    return (
      <SignInFrame>
        <Notice
          tone="good"
          title="Check your email"
          lines={[
            `We have sent a link to ${email.trim()}. It works for 30 minutes.`,
            "The link opens a page with one button on it. Press the button and you are in.",
            "Some work email systems open links before you do, which is why there is a button rather than nothing.",
            "Nothing after a minute or two? Look in your spam folder.",
          ]}
          actionLabel="Use a different address"
          onAction={() => setStage({ kind: "asking" })}
        />
      </SignInFrame>
    );
  }

  if (stage.kind === "not_on_roster") {
    return (
      <SignInFrame>
        <Notice
          tone="problem"
          title="We cannot find that address"
          lines={[
            `You typed ${email.trim()}.`,
            "Two things cause this nearly every time. You booked your ticket with a different address, often a personal one rather than a work one. Or there is a typo in what you typed.",
            "Try the other address first. If you are sure it is right, a mentor will sort it out with you.",
          ]}
        >
          <div className="button-row">
            <button type="button" className="button" onClick={() => setStage({ kind: "asking" })}>
              Try another address
            </button>
            <button type="button" className="button button-quiet" onClick={() => setStage({ kind: "mentor" })}>
              Tell a mentor
            </button>
          </div>
        </Notice>
      </SignInFrame>
    );
  }

  if (stage.kind === "mentor") {
    return (
      <SignInFrame>
        <h2>Tell a mentor</h2>
        <p>A person reads this. Say which address you booked with, if you know it.</p>
        <label className="field">
          <span className="field-label">Your message</span>
          <textarea
            className="field-input"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button type="button" className="button" onClick={sendMentorNote}>
            Send it
          </button>
          <button type="button" className="button button-quiet" onClick={() => setStage({ kind: "asking" })}>
            Back
          </button>
        </div>
      </SignInFrame>
    );
  }

  if (stage.kind === "mentor_sent") {
    return (
      <SignInFrame>
        <Notice
          tone="good"
          title="A mentor has it"
          lines={[
            "Someone will get back to you today.",
            "If you remember the address you booked with in the meantime, try it here.",
          ]}
          actionLabel="Try another address"
          onAction={() => setStage({ kind: "asking" })}
        />
      </SignInFrame>
    );
  }

  return (
    <SignInFrame>
      {stage.kind === "problem" ? <Notice tone="problem" lines={[stage.text]} /> : null}
      <form
        className="signin-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          <span className="field-label">The email address you booked with</span>
          <input
            className="field-input"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit" className="button button-big" disabled={email.trim() === ""}>
          Send me a link
        </button>
      </form>
      <p className="signin-note">There is no password. Nobody has one. We send you a link instead.</p>
    </SignInFrame>
  );
}

function SignInFrame({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className="signin">
      <div className="signin-card">
        <h1 className="signin-title">Launchhouse</h1>
        <p className="signin-sub">Atlanta, 25 to 27 September 2026.</p>
        {children}
      </div>
    </div>
  );
}
