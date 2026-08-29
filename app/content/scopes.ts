/**
 * app/content/scopes.ts
 *
 * WHAT IT IS
 * The founder facing half of the GoHighLevel permissions. Why each of the seven
 * is asked for, in the founder's own terms; which scope each verification call
 * needs; and the check that a requested list is exactly the seven and nothing
 * else.
 *
 * NEITHER LIST IS WRITTEN DOWN HERE. The seven, and the three that were cut, are
 * written down once, in `src/server/integrations/contracts/ghl.ts`, and this file
 * imports them. `src/server/integrations/contracts/vendor-facts.test.ts` fails if
 * any file outside that directory writes one of them out again.
 *
 * WHY IT EXISTS
 * Two failures, and the second is the serious one.
 *
 * The first is drift. The founder ticks these boxes by hand at 10pm, three weeks
 * before the event. The list appears on the token walk screen, in the failure
 * copy when a call is refused, and in the docs. If those three ever disagree, a
 * founder ticks six boxes, the token is short one permission, and the failure
 * shows up in session 3 with the founder mid task. That is why the strings sit in
 * the contracts directory with every other vendor detail nobody has verified, and
 * why this file holds copy rather than a second copy of the list.
 *
 * The second is rule 2, no Instagram DM automation, ever.
 * `planning/delivery/00-scope.md:30` cut three conversation scopes on 20 August
 * 2026. `planning/spike-findings.md:26` still lists them, calls the total nine
 * and then lists ten. As written, running that spike produces a token that can
 * send Instagram DMs. The scope list is the outermost of the five layers that
 * hold rule 2: if a scope is never granted, no bug anywhere in the app can send
 * a message, because the credential itself cannot. So the cut scopes are named
 * as forbidden rather than merely absent, and a test asserts they never appear
 * in a requested list.
 *
 * WHY THE REASONS ARE KEYED BY AN ID AND NOT BY THE SCOPE STRING
 * The whole point of spike S-01 is to find out whether the spellings are right,
 * so the expected outcome is that one of them changes. Keyed by the string, a
 * respelling would quietly unpair a reason from its scope, and the screen would
 * tell a founder that the contacts box proves their token belongs to their sub
 * account. Keyed by our own id, a respelling changes one character in the
 * contract and nothing here.
 *
 * WHAT CALLS IT
 * `app/content/ghl-walk.ts` for the copy, `src/web/lib/setup-rail.ts` for the
 * failure table, and `app/tests/content-prose.test.ts`.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is data.
 */

import {
  FORBIDDEN_GHL_SCOPES_UNVERIFIED,
  GHL_SCOPES_UNVERIFIED,
  GHL_SCOPE_BY_ID,
  GHL_SCOPE_STRINGS_UNVERIFIED,
} from "../../src/server/integrations/contracts/ghl.ts";
import type { GhlScope, GhlScopeId } from "../../src/server/integrations/contracts/ghl.ts";

export type { GhlScope };

/**
 * The seven, in the order the boxes are read out on the token walk screen.
 *
 * Unverified, and marked as such where it is written down. Nobody has opened the
 * GoHighLevel Private Integrations screen with this list beside them, so what
 * this file can promise is that the screen, the failure copy and the docs all
 * show the same seven, not that the seven are right.
 */
export const GHL_SCOPES: readonly GhlScope[] = GHL_SCOPE_STRINGS_UNVERIFIED;

/**
 * Why each one is asked for, in the founder's own terms.
 *
 * Not decoration. A founder who does not know why a box exists ticks all of
 * them, including any the screen did not ask for, and the scope list stops
 * being a boundary. One short sentence each, no jargon.
 *
 * Adding a scope to the contract breaks this object until a reason is written
 * for it, which is the point: a box with no reason next to it never reaches a
 * screen.
 */
const REASON_BY_ID: Readonly<Record<GhlScopeId, string>> = {
  postRead: "So we can read a post back after we make it, and show you it is really there.",
  postWrite: "So we can put your 30 pieces into Social Planner for you.",
  accountRead: "So we can list the accounts you have connected, and name them back to you.",
  statsRead: "So you can see how a post did without leaving the app.",
  contactRead: "So we can check a contact is already in your CRM before we add them twice.",
  contactWrite: "So we can add the people you build your list from.",
  locationRead: "So we can prove your token belongs to the sub account you gave us.",
};

/**
 * The same reasons, keyed by the scope string, because that is what the screen
 * and the failure copy have in their hands.
 *
 * The assertion is on the key type only. Every key comes from the contract's own
 * list, and `content-prose.test.ts` asserts that every scope has a reason, so a
 * missing pair fails a test rather than reaching a founder.
 */
export const GHL_SCOPE_REASONS = Object.fromEntries(
  GHL_SCOPES_UNVERIFIED.map((row) => [row.scope, REASON_BY_ID[row.id]] as const),
) as Readonly<Record<GhlScope, string>>;

/**
 * Cut on 20 August 2026 and never to be re-added.
 *
 * A token carrying any of these can send a message. That is the capability rule
 * 2 exists to remove, so it is removed at the credential, before any code has
 * a chance to be wrong about it.
 */
export const FORBIDDEN_GHL_SCOPES = FORBIDDEN_GHL_SCOPES_UNVERIFIED;

export { FORBIDDEN_GHL_SCOPES_REASON } from "../../src/server/integrations/contracts/ghl.ts";

/**
 * Which scope each verification call needs.
 *
 * WHY THIS IS HERE AND NOT IN THE VERIFIER. When a call fails after the token
 * has already authenticated, the honest guess is that the box for the scope
 * that call needed was not ticked, and the failure copy names that scope. That
 * copy and the call have to agree, so they read one map.
 *
 * UNVERIFIED, and it stays unverified until the spike runs: which status code
 * GoHighLevel returns for a scope refusal is not known. It might be 401, or 403,
 * or a 200 with an error in the body. The verifier treats any non success on a
 * call whose auth already succeeded as a probable scope problem, names the scope
 * below, and says it is a guess.
 */
export const SCOPE_FOR_VERIFY_CALL: Readonly<Record<"location" | "accounts" | "contacts", GhlScope>> = {
  location: GHL_SCOPE_BY_ID.locationRead,
  accounts: GHL_SCOPE_BY_ID.accountRead,
  contacts: GHL_SCOPE_BY_ID.contactRead,
};

/** True when a list is exactly the seven, in order, with nothing forbidden in it. */
export function isExactScopeSet(scopes: readonly string[]): boolean {
  return (
    scopes.length === GHL_SCOPES.length &&
    scopes.every((s, i) => s === GHL_SCOPES[i]) &&
    !scopes.some((s) => (FORBIDDEN_GHL_SCOPES as readonly string[]).includes(s))
  );
}
