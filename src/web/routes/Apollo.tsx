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

import type { ReactElement } from "react";
import { downloadUrl } from "../lib/api.ts";
import { hrefFor } from "../lib/nav.ts";

export function Apollo(): ReactElement {
  return (
    <div className="page page-narrow">
      <h1>Two ways to do this</h1>
      <p className="lede">Both end in the same place. Nothing sends until you press send.</p>

      <section className="choice">
        <h2>Connect Apollo</h2>
        <p>
          We put your 25 contacts and your opening lines straight into a sequence, paused, for you to check and start.
        </p>
        <p className="quiet">
          This one is not switched on yet. We are still testing it, and we will tell you either way before session 3.
        </p>
      </section>

      <section className="choice">
        <h2>Do it by hand</h2>
        <p>We give you a spreadsheet. You upload it to Apollo yourself. Twenty five rows, about ten minutes.</p>
        <a className="button" href={downloadUrl("outreach-firstlines.csv")}>
          Download the spreadsheet
        </a>
        <p className="quiet">It appears here once you have built your outreach engine in session 3.</p>
      </section>

      <p className="crumb">
        <a href={hrefFor({ kind: "setup" })}>Back to setup</a>
      </p>
    </div>
  );
}
