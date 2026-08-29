/** @jsxRuntime automatic */
/**
 * src/web/routes/GhlWalk.tsx
 *
 * WHAT IT IS
 * The GoHighLevel token walk. Six screens, one action on each, and the page that reads the
 * connection back to the founder in their own words.
 *
 * WHY IT EXISTS
 * This is the hardest thing a non-technical founder does in the whole programme, and the
 * words are the part that decides whether they get through it. So every string on these
 * screens comes from `app/content/ghl-walk.ts` and not one of them is written here. That
 * file can be read end to end, out loud, by somebody who has never opened the code, and
 * changed without touching a line of logic. A component that restates copy is a component
 * that quietly disagrees with the docs three weeks later, which is exactly how the scope
 * list drifted once already.
 *
 * The three decisions that matter, all from section 6.
 *
 * Nothing here blocks anything. Most founders cannot do any of this before the clinic on 23
 * September, and the screens say so rather than showing a red mark.
 *
 * A skip and a failure are different, and the difference reaches the mentor board. "Not
 * bought yet" waits. "Private Integrations is not in my Settings menu" needs a human today.
 *
 * The founder does not get a green tick at the end. They get their own page name and their
 * own Instagram handle read back to them. A tick could be a bug. A page name they recognise
 * cannot be.
 *
 * WHAT CALLS IT
 * app.tsx, on `#/setup/ghl` and `#/setup/ghl/<slug>`.
 *
 * WHAT IT READS AND WRITES
 * Writes the step state on entering a step, the Location ID, and the token. Reads back the
 * verification result. The token goes one way and is never sent back to the browser.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  GHL_CONTACTS_READ_PENDING,
  GHL_WALK_CONNECTED,
  GHL_WALK_INTRO,
  GHL_WALK_NOT_BOUGHT,
  GHL_WALK_NO_PRIVATE_INTEGRATIONS,
  GHL_WALK_RESUME_AT_PASTE,
  GHL_WALK_RETRY,
  GHL_WALK_REVOKE,
  GHL_WALK_SCOPE_NOTE,
  GHL_WALK_SCOPE_ROWS,
  GHL_WALK_TOKEN_SHAPE_WARNING,
} from "../../../app/content/ghl-walk.ts";
import type { WalkStep } from "../../../app/content/ghl-walk.ts";
import { connectGhl, disconnectGhl, recordStep, saveLocationId, verifyGhl } from "../lib/api.ts";
import type { GhlState, GhlVerifyResult, SetupState } from "../lib/api.ts";
import { ghlFailureCopy } from "../lib/setup-rail.ts";
import type { FailureCopy } from "../lib/setup-rail.ts";
import { notSureLine, nextStep, stepBySlug, tokenLooksRight } from "../lib/ghl-walk-view.ts";
import { formatDay } from "../lib/format.ts";
import { hrefFor } from "../lib/nav.ts";
import { Notice } from "../components/Notice.tsx";
import { StepProgress } from "../components/StepProgress.tsx";
import { Working } from "../components/Working.tsx";
import { CopyRow } from "../components/CopyRow.tsx";

/** The intro, shown above the walk rather than as a seventh step. */
export function GhlIntro({ onGo }: { readonly onGo: (slug: string) => void }): ReactElement {
  return (
    <div className="page page-narrow">
      <h1>{GHL_WALK_INTRO.title}</h1>
      <p className="doubt">{GHL_WALK_INTRO.doubt}</p>
      {GHL_WALK_INTRO.body.map((line, index) => (
        <p key={`${String(index)}-${line}`}>{line}</p>
      ))}
      <button type="button" className="button button-big" onClick={() => onGo("have-it")}>
        {GHL_WALK_INTRO.action}
      </button>
      <p className="crumb">
        <a href={hrefFor({ kind: "setup" })}>Back to setup</a>
      </p>
    </div>
  );
}

export function GhlWalk({
  slug,
  setup,
  onGo,
  onBackToRail,
  onSetupChanged,
}: {
  readonly slug: string;
  readonly setup: SetupState;
  readonly onGo: (slug: string) => void;
  readonly onBackToRail: () => void;
  readonly onSetupChanged: () => void;
}): ReactElement {
  const step = stepBySlug(slug);

  // Written on ENTERING a step, not on leaving it, so a closed tab resumes where the
  // founder actually was rather than where they last succeeded.
  useEffect(() => {
    if (step === undefined) return;
    void recordStep(step.slug, "in_progress");
  }, [step]);

  if (step === undefined) {
    return (
      <div className="page page-narrow">
        <Notice
          tone="problem"
          title="We do not have that step"
          lines={["The link may have been cut short. Start the walk again and you will not lose anything."]}
        />
        <a className="button" href={hrefFor({ kind: "setup-ghl-intro" })}>
          Back to the start of this
        </a>
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <StepProgress step={step.number} />
      <h1>{step.title}</h1>
      <p className="doubt">{step.doubt}</p>
      {step.body.map((line, index) => (
        <p key={`${String(index)}-${line}`}>{line}</p>
      ))}
      <StepBody
        step={step}
        setup={setup}
        onGo={onGo}
        onBackToRail={onBackToRail}
        onSetupChanged={onSetupChanged}
      />
      <p className="crumb">
        <a href={hrefFor({ kind: "setup" })}>Back to setup</a>
      </p>
    </div>
  );
}

function StepBody({
  step,
  setup,
  onGo,
  onBackToRail,
  onSetupChanged,
}: {
  readonly step: WalkStep;
  readonly setup: SetupState;
  readonly onGo: (slug: string) => void;
  readonly onBackToRail: () => void;
  readonly onSetupChanged: () => void;
}): ReactElement {
  switch (step.slug) {
    case "have-it":
      return <HaveIt step={step} onGo={onGo} onBackToRail={onBackToRail} />;
    case "plan":
      return <Plan step={step} onGo={onGo} onBackToRail={onBackToRail} />;
    case "location-id":
      return <LocationId step={step} setup={setup} onGo={onGo} onSetupChanged={onSetupChanged} />;
    case "make-token":
      return <MakeToken step={step} onGo={onGo} />;
    case "paste-token":
      return <PasteToken step={step} setup={setup} onGo={onGo} onSetupChanged={onSetupChanged} />;
    case "verify":
      return <Verify setup={setup} onBackToRail={onBackToRail} onSetupChanged={onSetupChanged} onGo={onGo} />;
    default:
      return <p className="quiet">Nothing to do on this one.</p>;
  }
}

/** Step 1. Three buttons, and "Not yet" is a normal answer that turns nothing red. */
function HaveIt({
  step,
  onGo,
  onBackToRail,
}: {
  readonly step: WalkStep;
  readonly onGo: (slug: string) => void;
  readonly onBackToRail: () => void;
}): ReactElement {
  const [hint, setHint] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const buttons = step.buttons;

  if (skipped) {
    return (
      <Notice
        tone="good"
        title={GHL_WALK_NOT_BOUGHT.title}
        lines={GHL_WALK_NOT_BOUGHT.body}
        actionLabel={GHL_WALK_NOT_BOUGHT.action}
        onAction={onBackToRail}
      />
    );
  }

  return (
    <>
      <div className="button-row">
        {buttons.map((button, index) => (
          <button
            key={button.label}
            type="button"
            className={index === 0 ? "button" : "button button-quiet"}
            onClick={() => {
              if (index === 0) {
                onGo(nextStep(step.slug)?.slug ?? "plan");
                return;
              }
              if (index === 1) {
                void recordStep(step.slug, "skipped", GHL_WALK_NOT_BOUGHT.evidence);
                setSkipped(true);
                return;
              }
              setHint(true);
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
      {hint ? <Notice tone="plain" lines={[notSureLine()]} /> : null}
    </>
  );
}

/** Step 2. "No" is a hard stop with a real next action, recorded as a failure. */
function Plan({
  step,
  onGo,
  onBackToRail,
}: {
  readonly step: WalkStep;
  readonly onGo: (slug: string) => void;
  readonly onBackToRail: () => void;
}): ReactElement {
  const [stopped, setStopped] = useState(false);
  const buttons = step.buttons;

  if (stopped) {
    return (
      <Notice
        tone="problem"
        title={GHL_WALK_NO_PRIVATE_INTEGRATIONS.title}
        lines={GHL_WALK_NO_PRIVATE_INTEGRATIONS.body}
        actionLabel={GHL_WALK_NO_PRIVATE_INTEGRATIONS.action}
        onAction={onBackToRail}
      />
    );
  }

  return (
    <div className="button-row">
      {buttons.map((button, index) => (
        <button
          key={button.label}
          type="button"
          className={index === 0 ? "button" : "button button-quiet"}
          onClick={() => {
            if (index === 0) {
              void recordStep(step.slug, "done");
              onGo(nextStep(step.slug)?.slug ?? "location-id");
              return;
            }
            void recordStep(step.slug, "failed", GHL_WALK_NO_PRIVATE_INTEGRATIONS.evidence);
            setStopped(true);
          }}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Step 3. Visible on purpose.
 *
 * Masking something that is not secret teaches a founder that everything on these screens is
 * dangerous, and then they treat the real token with the same shrug as the house number.
 */
function LocationId({
  step,
  setup,
  onGo,
  onSetupChanged,
}: {
  readonly step: WalkStep;
  readonly setup: SetupState;
  readonly onGo: (slug: string) => void;
  readonly onSetupChanged: () => void;
}): ReactElement {
  const [value, setValue] = useState(setup.ghl.locationId ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = (): void => {
    setSaving(true);
    setProblem(null);
    void saveLocationId(value.trim()).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setProblem(result.problem.text);
        return;
      }
      void recordStep(step.slug, "done");
      onSetupChanged();
      onGo(nextStep(step.slug)?.slug ?? "make-token");
    });
  };

  if (saving) return <Working what="Saving your Location ID." />;

  return (
    <>
      {problem === null ? null : <Notice tone="problem" lines={[problem]} />}
      <label className="field">
        <span className="field-label">Location ID</span>
        <input
          className="field-input field-mono"
          type="text"
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" className="button" onClick={save} disabled={value.trim() === ""}>
        {step.buttons[0]?.label ?? "Save and carry on"}
      </button>
    </>
  );
}

/** Step 4. The seven scopes, each with a copy button, and the note that says what the tick does. */
function MakeToken({ step, onGo }: { readonly step: WalkStep; readonly onGo: (slug: string) => void }): ReactElement {
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const toggle = (scope: string, on: boolean): void => {
    setTicked(on ? [...ticked, scope] : ticked.filter((s) => s !== scope));
  };

  return (
    <>
      <ul className="scope-list">
        {GHL_WALK_SCOPE_ROWS.map((row) => (
          <CopyRow
            key={row.scope}
            value={row.scope}
            note={row.reason}
            checked={ticked.includes(row.scope)}
            onCheck={(on) => toggle(row.scope, on)}
          />
        ))}
      </ul>
      <p className="scope-note">{GHL_WALK_SCOPE_NOTE}</p>
      <button
        type="button"
        className="button"
        onClick={() => {
          void recordStep(step.slug, "done");
          onGo(nextStep(step.slug)?.slug ?? "paste-token");
        }}
      >
        {step.buttons[0]?.label ?? "I have made it"}
      </button>
    </>
  );
}

/** Step 5. Masked, one shape check that warns rather than blocks, and no second paste ever. */
function PasteToken({
  step,
  setup,
  onGo,
  onSetupChanged,
}: {
  readonly step: WalkStep;
  readonly setup: SetupState;
  readonly onGo: (slug: string) => void;
  readonly onSetupChanged: () => void;
}): ReactElement {
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [failure, setFailure] = useState<FailureCopy | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const shapeIsOff = token.trim() !== "" && !tokenLooksRight(token);
  const returning = !setup.ghl.connected && setup.steps["paste-token"]?.state === "in_progress";

  const connect = (): void => {
    setConnecting(true);
    setFailure(null);
    setProblem(null);
    void connectGhl(token.trim()).then((result) => {
      setConnecting(false);
      if (!result.ok) {
        setProblem(result.problem.text);
        return;
      }
      setToken("");
      if (result.value.ok) {
        void recordStep(step.slug, "done");
        onSetupChanged();
        onGo("verify");
        return;
      }
      setFailure(ghlFailureCopy(result.value.kind, result.value.call));
    });
  };

  if (connecting) return <Working what="Checking your token with GoHighLevel." />;

  return (
    <>
      {returning ? <Notice tone="plain" lines={[GHL_WALK_RESUME_AT_PASTE]} /> : null}
      {problem === null ? null : <Notice tone="problem" lines={[problem]} />}
      {failure === null ? null : (
        <Notice tone="problem" lines={failureLines(failure)} actionLabel={failure.action} onAction={() => {
          if (failure.backTo !== null) onGo(failure.backTo);
          else setFailure(null);
        }} />
      )}
      <label className="field">
        <span className="field-label">Your token</span>
        <input
          className="field-input field-mono"
          type="password"
          value={token}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      {shapeIsOff ? <p className="warn">{GHL_WALK_TOKEN_SHAPE_WARNING}</p> : null}
      <button type="button" className="button" onClick={connect} disabled={token.trim() === ""}>
        {step.buttons[0]?.label ?? "Connect"}
      </button>
    </>
  );
}

/**
 * Step 6. Evidence, not a tick.
 *
 * The location name and the account names are read off GoHighLevel and printed back. The
 * contacts line has three states because the third read has no known call yet, and saying
 * "not checked" is the honest version of that. Reporting a pass we did not make is the one
 * thing this screen must never do.
 */
function Verify({
  setup,
  onGo,
  onBackToRail,
  onSetupChanged,
}: {
  readonly setup: SetupState;
  readonly onGo: (slug: string) => void;
  readonly onBackToRail: () => void;
  readonly onSetupChanged: () => void;
}): ReactElement {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<GhlVerifyResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const check = (): void => {
    setChecking(true);
    setProblem(null);
    void verifyGhl().then((answer) => {
      setChecking(false);
      if (!answer.ok) {
        setProblem(answer.problem.text);
        return;
      }
      setResult(answer.value);
      onSetupChanged();
    });
  };

  const ghl: GhlState = result !== null && result.ok ? result.ghl : setup.ghl;
  const failure = result !== null && !result.ok ? ghlFailureCopy(result.kind, result.call) : null;
  // "Check again" only makes sense once we hold a token. A founder who reached this screen
  // without pasting one is sent back rather than shown a button that cannot do anything,
  // and rather than being asked to paste a credential a second time for no reason.
  const tokenOnFile = ghl.connected || setup.steps["paste-token"]?.state === "done";

  if (checking) return <Working what="Reading your account back from GoHighLevel." />;

  return (
    <>
      {problem === null ? null : <Notice tone="problem" lines={[problem]} />}

      {failure === null ? null : (
        <Notice
          tone="problem"
          lines={failureLines(failure)}
          actionLabel={failure.action}
          onAction={() => {
            if (failure.backTo !== null) onGo(failure.backTo);
            else check();
          }}
        />
      )}

      {ghl.connected ? <Connected ghl={ghl} onDone={onBackToRail} /> : null}

      {tokenOnFile ? (
        <>
          <div className="button-row">
            <button type="button" className="button button-quiet" onClick={check}>
              Check again
            </button>
          </div>
          <p className="quiet">{GHL_WALK_RETRY}</p>
        </>
      ) : (
        <Notice
          tone="plain"
          lines={["We do not have a token from you yet, so there is nothing to check."]}
          actionLabel="Go back and paste it"
          onAction={() => onGo("paste-token")}
        />
      )}

      {ghl.connected ? <Revoke onDone={onSetupChanged} /> : null}
    </>
  );
}

function Connected({ ghl, onDone }: { readonly ghl: GhlState; readonly onDone: () => void }): ReactElement {
  const posting =
    ghl.accounts.length === 0
      ? "nothing yet"
      : ghl.accounts.map((a) => `${a.platform}, ${a.name}`).join(" and ");
  return (
    <section className="connected">
      <h2>{GHL_WALK_CONNECTED.title}</h2>
      <dl className="connected-list">
        <dt>{GHL_WALK_CONNECTED.lines.location}</dt>
        <dd>{ghl.locationName ?? ghl.locationId ?? ""}</dd>
        <dt>{GHL_WALK_CONNECTED.lines.posting}</dt>
        <dd>{posting}</dd>
        <dt>{GHL_WALK_CONNECTED.lines.contacts}</dt>
        <dd>{ghl.contacts === "readable" ? GHL_WALK_CONNECTED.contactsReadable : "not checked yet"}</dd>
        <dt>{GHL_WALK_CONNECTED.lines.tokenMade}</dt>
        <dd>{ghl.tokenMadeAt === null ? "" : formatDay(ghl.tokenMadeAt)}</dd>
      </dl>
      {ghl.contacts === "readable" ? null : (
        <p className="quiet">{GHL_CONTACTS_READ_PENDING.founderReadsWhilePending}</p>
      )}
      <button type="button" className="button" onClick={onDone}>
        {GHL_WALK_CONNECTED.action}
      </button>
    </section>
  );
}

/** Disconnecting, and the order matters, because deleting our copy revokes nothing. */
function Revoke({ onDone }: { readonly onDone: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  if (working) return <Working what="Deleting our copy of your token." />;

  if (!open) {
    return (
      <div className="button-row">
        <button type="button" className="button button-quiet" onClick={() => setOpen(true)}>
          {GHL_WALK_REVOKE.title}
        </button>
      </div>
    );
  }

  return (
    <Notice
      tone="problem"
      title={GHL_WALK_REVOKE.title}
      lines={GHL_WALK_REVOKE.body}
      actionLabel={GHL_WALK_REVOKE.action}
      onAction={() => {
        setWorking(true);
        void disconnectGhl().then(() => {
          setWorking(false);
          setOpen(false);
          onDone();
        });
      }}
    />
  );
}

/**
 * The lines of a failure.
 *
 * When the cause is our guess rather than something GoHighLevel told us, the screen says so.
 * Which status code means a scope refusal is not known, and stating a guess as a fact sends
 * a founder to make a new token for a reason that may not be the real one.
 */
export function failureLines(failure: FailureCopy): readonly string[] {
  return failure.isAGuess
    ? [failure.text, "That is our best guess at the cause. GoHighLevel does not tell us which permission was missing."]
    : [failure.text];
}
