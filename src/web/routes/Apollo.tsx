/** @jsxRuntime automatic */
/**
 * src/web/routes/Apollo.tsx
 *
 * WHAT IT IS
 * The two ways to get 25 contacts and 25 opening lines into a sequence.
 *
 * WHY IT EXISTS
 * How Apollo connects is genuinely unknown. Today it is OAuth through a Claude connector,
 * and server side there is no client to run that OAuth. So there is a primary and a
 * guaranteed fallback, and the fallback ships either way: the app produces the contacts and
 * the first lines as a spreadsheet, and the founder uploads it themselves. That is not a
 * consolation prize. The pre work docs already treat the manual path as first class with no
 * apology, and twenty five messages is a number a person can handle by hand, which is
 * exactly why an unverified integration is survivable here.
 *
 * RULE 3 IS IN THE COPY. Twenty five is the number, it is low volume on purpose, and
 * nothing on this screen predicts a reply. Not a rate, not a range, not a hint. Replies
 * depend on the list, the offer and the timing, and promising one is the fastest way to
 * lose a founder's trust in week two.
 *
 * RULE 1 IS IN WHO CAN SEE IT. This screen exists for B2B founders. app.tsx checks
 * `apolloRowExists` before it renders, so a B2C founder who lands on this address gets the
 * "not one of yours" answer and never reads the word.
 *
 * WHAT CALLS IT
 * app.tsx, on `#/setup/apollo`, and only for a B2B founder.
 *
 * WHAT IT READS AND WRITES
 * Reads the setup state. The spreadsheet is a plain download link.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { connectApollo, downloadUrl, PROBLEM_TEXT } from "../lib/api.ts";
import type { ApolloFailureKind } from "../lib/api.ts";
import { hrefFor } from "../lib/nav.ts";

export function Apollo(): ReactElement {
  return (
    <div className="page page-narrow">
      <h1>Your Apollo account</h1>
      <p className="lede">
        Two things happen here. You check your key works, so nothing is a surprise later. Then, in Session 3,
        Claude gets its own access and does the work.
      </p>

      <ConnectApollo />

      <section className="choice">
        <h2>Then Claude does the rest, from Session 3</h2>
        <p>
          Apollo has a connector you add to your Claude account. Once it is on, you can ask Claude to find
          people, get their addresses, and build your sequence in your Apollo account. It builds it paused, and
          starting it is a button you press in Apollo having read the messages.
        </p>
        <p className="quiet">
          That connector is separate from the key above. The key proves your account works. The connector is
          what lets Claude use it. We set it up together in Session 3.
        </p>
      </section>

      <section className="choice">
        <h2>Or do it by hand</h2>
        <p>We give you a spreadsheet. You upload it to Apollo yourself. Twenty five rows, about ten minutes.</p>
        <a className="button" href={downloadUrl("outreach-firstlines.csv")}>
          Download the spreadsheet
        </a>
        <p className="quiet">It appears here once you have built your outreach engine.</p>
      </section>

      <p className="crumb">
        <a href={hrefFor({ kind: "setup" })}>Back to setup</a>
      </p>
    </div>
  );
}

/**
 * What each refusal means, in the founder's terms.
 *
 * `forbidden` IS THE ONE THAT EARNS ITS PLACE. Apollo answers 403 both when the plan does
 * not carry the endpoint and when the key was not scoped to it. A founder fixes those in
 * two different places, so the sentence names both and puts the cheaper one first. Telling
 * them the key is wrong would send them back to make another key that fails identically.
 */
const APOLLO_REFUSAL: Readonly<Record<ApolloFailureKind, string>> = {
  auth_rejected:
    "Apollo did not recognise that key. Copy it again from Settings, Integrations, API Keys, and check you copied the whole thing.",
  forbidden:
    "The key reached Apollo and was not allowed to do this. Two things cause that. Either the key was made without every endpoint ticked, which is fixed by making a new one with Set as master key turned on, or your plan does not carry it yet. Try the key first.",
  rate_limited: "Apollo is asking us to slow down. Wait a minute and press it again.",
  vendor_unavailable: "Apollo did not answer. That is their end, not yours. Try again in a few minutes.",
};

/**
 * Paste the key.
 *
 * NOTHING IS STORED UNTIL APOLLO HAS ANSWERED, and the check behind this button is a
 * search, which is the one Apollo call that costs no credits. So pressing it never spends
 * a founder's money, and pressing it twice costs nothing either.
 */
function ConnectApollo(): ReactElement {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const result = await connectApollo(key.trim());
    setBusy(false);
    if (!result.ok) {
      setProblem(PROBLEM_TEXT[result.problem.kind]);
      return;
    }
    if (!result.value.ok) {
      setProblem(APOLLO_REFUSAL[result.value.kind]);
      return;
    }
    setKey("");
    setConnected(true);
  }

  return (
    <section className="choice">
      <h2>Check your key works</h2>
      <p>
        This does one thing: it asks Apollo whether your account is live and your key is good. It is the check
        you would rather fail today than in Session 3.
      </p>

      {connected ? (
        <p className="done">
          Connected. Your key is stored for you and never shown again. You can paste a new one here whenever you like.
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="apollo-key">Your Apollo API key</label>
          <p className="quiet">
            In Apollo, go to Settings, Integrations, API Keys, and create one. Turn on Set as master key so it can do
            everything this needs. A key made with only some endpoints ticked will stop halfway through session 3.
          </p>
          <input
            id="apollo-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={busy || key.trim() === ""}>
            {busy ? "Checking it" : "Check and save"}
          </button>
          <p className="quiet">
            Checking it costs you nothing. We ask Apollo for one search, which is free, and we only keep the key if it
            works.
          </p>
        </form>
      )}

      {problem === null ? null : <p className="problem">{problem}</p>}
    </section>
  );
}
