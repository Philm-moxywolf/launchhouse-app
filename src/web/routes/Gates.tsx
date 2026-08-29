/** @jsxRuntime automatic */
/**
 * src/web/routes/Gates.tsx
 *
 * WHAT IT IS
 * What is done, what is next, and what is blocking. One panel per gate.
 *
 * WHY IT EXISTS
 * A gate is the thing a founder has to pass to keep their place in the programme, and the
 * worst version of that is finding out on the day that something was missing. This screen
 * is the standing answer to "am I ready", built from `schemas/gates.md` by way of
 * `app/content/gates.ts`, so the app, the status engine and a mentor's list all read the
 * same file and cannot disagree.
 *
 * Two honesty rules are visible on the screen, and both are rule 5 turned into an
 * interface. Items we cannot check are shown as the founder's own answer, not as a tick we
 * invented: nothing in a folder can see whether their posts sound like them. And a file
 * that exists but is nearly empty is reported as started rather than as passed, because
 * what counts as enough content per file is genuinely not decided yet.
 *
 * RULE 1. Gate C is two different lists, one per track, and a founder sees theirs. Before
 * the Brain locks a track, only the gates that apply to both are shown, so nobody is told
 * to write first lines they will never be asked for.
 *
 * WHAT CALLS IT
 * app.tsx, on `#/gates`.
 *
 * WHAT IT READS AND WRITES
 * Reads the gate state. Writes nothing. The gate form itself is a Google Form and opens in
 * a new tab.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { EMPTINESS_FLOOR_PENDING } from "../../../app/content/gates.ts";
import { fetchGates } from "../lib/api.ts";
import type { Founder, GatesState } from "../lib/api.ts";
import { gateView } from "../lib/gate-view.ts";
import type { GateItemView, ItemState } from "../lib/gate-view.ts";
import { visibleGates } from "../lib/track.ts";
import { formatDay, plainFileName } from "../lib/format.ts";
import { Notice } from "../components/Notice.tsx";
import { Working } from "../components/Working.tsx";

const ITEM_WORDS: Readonly<Record<ItemState, string>> = {
  done: "Done",
  started: "Started",
  not_yet: "Not yet",
  you_say: "Your call",
};

export function Gates({ founder }: { readonly founder: Founder }): ReactElement {
  const [state, setState] = useState<GatesState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchGates().then((result) => {
      if (!live) return;
      if (result.ok) setState(result.value);
      else setProblem(result.problem.text);
    });
    return () => {
      live = false;
    };
  }, []);

  const gates = visibleGates(founder.track);

  return (
    <div className="page">
      <h1>Gates</h1>
      <p className="lede">
        A gate is the short form you send after each session. This is what it will ask for, and where you are up to.
      </p>

      {problem !== null ? <Notice tone="problem" lines={[problem]} /> : null}
      {state === null && problem === null ? <Working what="Checking your work." /> : null}

      {founder.track === null ? (
        <Notice
          title="Two of the three are the same for everybody"
          lines={[
            "The last gate depends on what you sell, and you decide that in session 1 when you build your Founder Brain.",
            "Until then, here are the two that apply to everyone.",
          ]}
        />
      ) : null}

      {state === null
        ? null
        : gates.map((gate) => {
            const submitted = state.submitted[gate.id];
            const view = gateView(gate, state.fileStatus, submitted ?? null);
            const form = state.formUrl[gate.id];
            return (
              <section key={`${gate.id}-${gate.track}`} className="gate">
                <div className="gate-head">
                  <h2>{view.heading}</h2>
                  <span className="gate-count">
                    {String(view.doneCount)} of {String(view.checkableCount)} done
                  </span>
                </div>

                {view.submitted === null ? null : (
                  <p className="gate-submitted">You sent this one on {formatDay(view.submitted)}.</p>
                )}

                <ul className="gate-items">
                  {view.items.map((item) => (
                    <GateItem key={item.item} item={item} />
                  ))}
                </ul>

                {view.next === null ? (
                  <p className="gate-next">Everything we can check is done. The rest is your own call.</p>
                ) : (
                  <p className="gate-next">Next: {view.next.item}.</p>
                )}

                {form === null || form === undefined ? (
                  <p className="quiet">The form for this one opens after the session.</p>
                ) : (
                  <a className="button" href={form} target="_blank" rel="noreferrer noopener">
                    Open the form
                  </a>
                )}
              </section>
            );
          })}

      {EMPTINESS_FLOOR_PENDING ? (
        <p className="quiet">
          We check that a file exists and that there is something in it. We do not judge whether there is enough. That
          is your call, and a mentor will read it with you.
        </p>
      ) : null}
    </div>
  );
}

function GateItem({ item }: { readonly item: GateItemView }): ReactElement {
  return (
    <li className={`gate-item gate-item-${item.state}`}>
      <span className="gate-item-state">{ITEM_WORDS[item.state]}</span>
      <span className="gate-item-text">{item.item}</span>
      {item.file === null ? (
        <span className="gate-item-file">Nothing on file can prove this one, so you tell us.</span>
      ) : (
        <span className="gate-item-file">From {plainFileName(item.file)}.</span>
      )}
    </li>
  );
}
