/**
 * app/content/ghl-walk.ts
 *
 * WHAT IT IS
 * Every string in the GoHighLevel token walk. Six screens, the success page,
 * the failure table, and the revoke notice.
 *
 * WHY IT EXISTS
 * This is the hardest thing a non-technical founder does in the whole
 * programme, and the words are the part that decides whether they get through
 * it. Copy that lives inside components gets edited by whoever is nearest the
 * component, at the moment they are thinking about layout. Here it can be read
 * end to end, out loud, by somebody who has never opened the code, and changed
 * without touching a line of logic. Every screen names the founder's doubt
 * first, answers it, and ends on one action, because a founder who is unsure
 * whether they are about to do something dangerous stops and posts in Slack.
 *
 * WHAT CALLS IT
 * The setup wizard screens, the verifier's failure rendering, and the mentor
 * board, which prints the evidence strings below word for word.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is data. The seven scopes, the token prefix and the two menu
 * routes are imported from the contracts directory and are never written out
 * again here.
 *
 * WHAT IS UNVERIFIED, AND STAYS THAT WAY UNTIL THE SPIKES RUN
 * Four things, each marked at its use below. Which status code GoHighLevel
 * returns for a scope refusal. Whether a real token starts with the prefix we
 * check for. The name of the contacts read. And where GoHighLevel keeps the two
 * screens a founder has to reach. Nothing here invents an endpoint, a field or a
 * status code.
 *
 * HOW THE COPY HANDLES A MENU THAT HAS MOVED
 * A vendor moves a menu item whenever it likes, and nobody on this project has
 * opened that menu. So no sentence here states a route as a fact. Each one says
 * when we last looked, then says what to search the page for, and the hard stop
 * on step 2 names both causes rather than telling a founder their plan is wrong
 * when the truth may be that a screen moved. The rest of the walk points at
 * where the founder has already been, which is the one instruction a menu change
 * cannot break.
 */

import { GHL } from "../../src/server/integrations/contracts/ghl.ts";
import { isPending } from "../../src/server/integrations/contracts/pending.ts";
import { GHL_SCOPES, GHL_SCOPE_LABELS, GHL_SCOPE_REASONS, SCOPE_FOR_VERIFY_CALL } from "./scopes.ts";
import type { GhlScope } from "./scopes.ts";
import {
  GHL_MENU_PATHS_UNVERIFIED,
  GHL_MENU_PATH_HEDGE,
  GHL_TOKEN_PREFIX_GUESS,
  GHL_TOKEN_PREFIX_IS_A_GUESS,
} from "../../src/server/integrations/contracts/ghl.ts";

export { GHL_TOKEN_PREFIX_GUESS };

/** State of one step, as the mentor board reads it. */
export type StepState = "not_started" | "in_progress" | "done" | "skipped" | "failed";

export interface WalkButton {
  readonly label: string;
  /** What pressing it does, in one phrase, for whoever wires the screen. */
  readonly meaning: string;
}

export interface WalkStep {
  /** Its own URL, so a mentor can send a founder straight to one step in Slack. */
  readonly slug: string;
  readonly number: number;
  readonly title: string;
  /** The doubt a founder arrives with. Said first, always. */
  readonly doubt: string;
  /** The answer, then the instruction. One idea per line. */
  readonly body: readonly string[];
  readonly buttons: readonly WalkButton[];
  /** The receipt check this step writes, per REPLIT-BUILD.md section 6. */
  readonly checkName: string | null;
}

export const GHL_WALK_TOTAL_STEPS = 6;

/** "Step 3 of 6". Nobody walks in the dark. */
export function progressLabel(step: number): string {
  return `Step ${step} of ${GHL_WALK_TOTAL_STEPS}`;
}

/**
 * Shown above every step.
 *
 * The cohort buys GoHighLevel together on 23 September, so on 5 September most
 * founders cannot do any of this. A progress bar that says they are behind
 * when they are not is how you teach 130 people to ignore the progress bar.
 */
export const GHL_WALK_INTRO = {
  title: "Connect GoHighLevel",
  doubt: "You may not have bought GoHighLevel yet. On most days before the clinic, that is the normal answer.",
  body: [
    "Nothing here blocks you. You do not need this until session 3.",
    "It is six screens with one thing to do on each. If you already have GoHighLevel open, it takes about ten minutes.",
  ],
  action: "Start",
} as const;

export const GHL_WALK_STEPS: readonly WalkStep[] = [
  {
    slug: "have-it",
    number: 1,
    title: "Do you have GoHighLevel yet",
    doubt:
      "If you have not bought it, you are not behind. The cohort buys together at the clinic on 23 September so that nobody's trial runs out during the weekend.",
    body: [
      "GoHighLevel is the tool that publishes your posts and holds your contacts.",
      "Have you got it already?",
    ],
    buttons: [
      { label: "Yes, I can log in", meaning: "go to step 2" },
      {
        label: "Not yet",
        meaning: "record a skip and go back to the checklist. Nothing turns red.",
      },
      {
        label: "I am not sure",
        meaning:
          "show one line and stay here: look in your inbox for an email from GoHighLevel with a login link. If there is nothing, you have not bought it yet, and that is fine.",
      },
    ],
    checkName: null,
  },
  {
    slug: "plan",
    number: 2,
    title: "Check your plan can do this",
    doubt:
      "The Starter plan you were told to buy does carry this screen. We made a key on one to be sure. So this step is quick, and if you cannot find it the answer is almost never your plan.",
    body: [
      "Log in to GoHighLevel. You are looking for a screen called Private Integrations. It is the one that makes the key.",
      `${GHL_MENU_PATH_HEDGE}, the route was ${GHL_MENU_PATHS_UNVERIFIED.privateIntegrations}, down the left hand menu.`,
      "Menus move, and ours may be out of date. If it is not there, search the page for the word Private: hold Ctrl and press F, or Command and F on a Mac.",
      "Can you find Private Integrations anywhere in GoHighLevel?",
    ],
    buttons: [
      { label: "Yes, I can see it", meaning: "go to step 3" },
      { label: "No, I cannot find it", meaning: "record a fail and show the hard stop below" },
    ],
    checkName: "ghl_plan",
  },
  {
    slug: "location-id",
    number: 3,
    title: "Find your Location ID",
    doubt:
      "This looks like a password. It is not a password. It is more like a house number: it says which business we are talking about, and it is no use to anyone on its own.",
    body: [
      "Your Location ID is on your business profile in GoHighLevel.",
      `${GHL_MENU_PATH_HEDGE}, the route was ${GHL_MENU_PATHS_UNVERIFIED.businessProfile}, with the ID near the top.`,
      "If your menu looks different, search the page for the words Location ID. The label is what to look for, not the route.",
      "Copy it and paste it in the box.",
      "We leave this one visible on purpose. Hiding something that is not secret would teach you to treat the real key on the next screen with the same shrug.",
    ],
    buttons: [{ label: "Save and carry on", meaning: "record the Location ID and go to step 4" }],
    checkName: "ghl_location",
  },
  {
    slug: "make-token",
    number: 4,
    title: "Make the token",
    doubt:
      "This is the fiddly screen: a few clicks and seven boxes to tick. Take it slowly. Do not type any of the seven by hand.",
    body: [
      "Go back to the Private Integrations screen you found on step 2.",
      `If you have closed it since, ${GHL_MENU_PATH_HEDGE.toLowerCase()} the route was ${GHL_MENU_PATHS_UNVERIFIED.privateIntegrations}.`,
      "On that screen, choose Create new integration and name it Launchhouse.",
      "That screen lists well over a hundred permissions. You need seven of them. Each one below shows the name to look for first, then the exact wording underneath it, so you can find the right row by eye and check you have it before you tick.",
      "Use the copy button if you would rather search the page than scroll it. Do not type any of the seven by hand: one typed at 10pm comes out slightly wrong and then you are hunting for something that does not exist.",
      "Do this inside your sub account, not at agency level. A token made at agency level does not reach your business.",
      "GoHighLevel shows you the token once and never again. Keep that tab open until the next screen says it worked.",
    ],
    buttons: [{ label: "I have made it", meaning: "go to step 5" }],
    checkName: null,
  },
  {
    slug: "paste-token",
    number: 5,
    title: "Paste the token",
    doubt:
      "You are pasting a key into somebody else's website, which is exactly the moment to be careful. Here is what happens to it.",
    body: [
      "We use it for two things: putting your posts into Social Planner, and adding the contacts you build.",
      "It never appears on this screen again, and we delete every token after the event.",
      "Paste it in the box and press Connect.",
    ],
    buttons: [{ label: "Connect", meaning: "store the token and run the three checks on step 6" }],
    checkName: "ghl_token",
  },
  {
    slug: "verify",
    number: 6,
    title: "We test it, in front of you",
    doubt:
      "A green tick could be a bug. So you do not get a tick. You get the name of your own page read back to you, which a bug cannot fake.",
    body: [
      "Three checks, in order. This takes a few seconds.",
      "Checking the token works, and that it belongs to the Location ID you gave us.",
      "Reading the list of accounts you can post to.",
      "Checking we can read your contacts.",
    ],
    buttons: [{ label: "Done", meaning: "record the checks and go back to the checklist" }],
    checkName: "ghl_accounts",
  },
];

/**
 * The seven scope rows on step 4, each with a copy button, a checkbox and the
 * reason it is asked for.
 *
 * Built from `scopes.ts` rather than written out, so the screen, the failure
 * copy and the docs cannot end up naming different scopes. That is the drift
 * that already happened once between `00-scope.md` and `spike-findings.md`.
 */
export const GHL_WALK_SCOPE_ROWS: readonly { scope: GhlScope; label: string; reason: string }[] = GHL_SCOPES.map(
  (scope) => ({ scope, label: GHL_SCOPE_LABELS[scope], reason: GHL_SCOPE_REASONS[scope] }),
);

/**
 * Under the seven rows.
 *
 * Founders otherwise believe the checkbox on our page did something. It did
 * not. It keeps their place while they tick the real ones in GoHighLevel.
 */
/**
 * CAN THIS APP CHECK A TOKEN AT ALL YET, asked of the contract rather than answered
 * by a flag somebody has to remember to flip.
 *
 * WHY THIS EXISTS. Step 5 rendered a token box, a Connect button, and above them a
 * notice saying there was no point pasting one in. A founder did exactly what anybody
 * would do: pasted, pressed Connect, and got that same sentence back as an error. A
 * form for something that cannot happen is worse than no form, because it costs the
 * founder the paste and then tells them off for it.
 *
 * IT IS DERIVED, NOT DECLARED. `isPending` asks the contract entries this check would
 * need. So the box disappears while they are holes and comes back on its own the day
 * they are filled in, with nobody having to notice. A boolean maintained by hand here
 * would be a fourth place that has to agree with the other three.
 *
 * WHAT A CHECK NEEDS, and it is deliberately not everything `ghlConnect` needs: an
 * address, the header names, and one call to make. Reading a location back is a
 * separate thing that step 6 wants, and a token can be proved without it: asking for
 * the founder's own social accounts answers both "is this token real" and "whose is
 * it" in one call.
 */
export const GHL_CONTRACT_HAS_WHAT_A_CHECK_NEEDS =
  isPending(GHL.baseUrl) === null &&
  isPending(GHL.headerNames) === null &&
  isPending(GHL.listSocialAccounts) === null;

/**
 * IS THE CODE WRITTEN. Facts and code are two different things and this is the second.
 *
 * `GHL_CONTRACT_HAS_WHAT_A_CHECK_NEEDS` went true on 31 August, when the address, the
 * headers and the accounts call were read off a workflow that runs. Nothing followed
 * it: `routes/setup.ts` still answers both GoHighLevel endpoints with a 501, because
 * no code makes the call. Having the facts is not having the feature, and a flag that
 * conflated them would have put the token box back on a screen whose Connect button
 * still fails.
 *
 * WHAT WOULD MAKE THIS TRUE. One thing, and it is small: what
 * `GET /social-media-posting/{locationId}/accounts` actually returns. The workflow
 * proves the call is right; it reads the ids out by hand, so it says nothing about
 * the shape of a row, and step 6 has to read a founder their own account names back
 * from it. Run the call once with a real token, write the response into the contract,
 * and this becomes true along with the route.
 *
 * `routes/setup.test.ts` asserts the route and this constant agree, so flipping one
 * without the other fails the build rather than lying to a founder.
 */
export const GHL_VERIFY_CALL_IS_WRITTEN = true;

/** Both halves. The token box on step 5 appears when this is true and not before. */
export const GHL_TOKEN_CHECK_IS_BUILT =
  GHL_CONTRACT_HAS_WHAT_A_CHECK_NEEDS && GHL_VERIFY_CALL_IS_WRITTEN;

/**
 * What step 5 says instead of a box, while there is nothing to press it against.
 * It is not an error and it is not the founder's fault, so it does not read as one.
 */
export const GHL_WALK_CANNOT_CHECK_YET = [
  "Keep the token somewhere safe and come back to this screen. There is nothing to paste it into yet, because the part of this app that checks a token with GoHighLevel is still being built.",
  "You have not done anything wrong and nothing you made is wasted. The token you just created is the one you will use.",
  "If it is still not here by the setup clinic on 23 September, bring the token and a mentor will connect it with you in a couple of minutes.",
] as const;

export const GHL_WALK_SCOPE_NOTE =
  "Ticking these here just keeps your place. We check the real permissions in a moment.";

/**
 * Step 2, "No". A hard stop with a real next action.
 *
 * Recorded as `failed`, not `skipped`. The difference is the whole point of
 * having both: not having bought GoHighLevel on 6 September is fine and waits.
 * A plan that cannot make a token needs a human today, and the mentor board
 * sorts on it.
 */
export const GHL_WALK_NO_PRIVATE_INTEGRATIONS = {
  title: "We cannot find the screen that makes the key",
  body: [
    "Most likely GoHighLevel has moved the screen since we wrote this, which they do. The other possibility is that you are on a different plan from the Starter one in the pre work, because Starter definitely carries it: we made a key on one.",
    "It is not something you can fix by guessing. Do not buy an upgrade. Starter is the plan this programme runs on and it is enough, so an upgrade would cost you money and fix nothing. Tell a mentor and we will find where the screen went.",
    "Post in the Slack channel. Say you cannot find Private Integrations, and say what your Settings menu does list. Someone will sort it with you today.",
  ],
  action: "I have posted in Slack",
  state: "failed" as StepState,
  evidence: "cannot find Private Integrations, plan or menu unknown",
};

/** Step 1, "Not yet". A skip, and the screen says so in those words. */
export const GHL_WALK_NOT_BOUGHT = {
  title: "Nothing to do yet",
  body: [
    "You are not behind. You buy GoHighLevel at the clinic on 23 September, with everybody else.",
    "We will bring you back here then.",
  ],
  action: "Back to my checklist",
  state: "skipped" as StepState,
  evidence: "not bought yet, due at the clinic on 23 September",
};

/**
 * Step 5's shape check.
 *
 * UNVERIFIED. The prefix is inferred from our own code,
 * `scripts/cmd/receipt.sh:110` and `accounts.sh:127`, both of which refuse any
 * value matching it after lowercasing, on the grounds that it looks like a
 * token. Nothing has ever compared it against a real one. If real tokens do
 * not carry the prefix this is one line to delete, so it warns and lets the
 * founder continue rather than blocking them.
 *
 * The prefix itself comes from the contracts directory, and the sentence below
 * is built from it, so the check and the words a founder reads cannot disagree
 * about what we are looking for.
 */
export const GHL_WALK_TOKEN_SHAPE_WARNING =
  `That does not look like a GoHighLevel token. They normally start with ${GHL_TOKEN_PREFIX_GUESS}. ` +
  "Check you copied the whole thing, then try again.";
export const GHL_WALK_TOKEN_SHAPE_WARNING_IS_A_GUESS = GHL_TOKEN_PREFIX_IS_A_GUESS;

/**
 * Step 6, the success page.
 *
 * Naming the page and the Instagram handle back to them is the proof. A tick
 * could be a bug. A page name they recognise cannot be. The fields are filled
 * from the reads, never from anything the founder typed.
 */
export const GHL_WALK_CONNECTED = {
  title: "Connected.",
  lines: {
    location: "Location:",
    posting: "Posting to:",
    contacts: "Contacts:",
    tokenMade: "Token made:",
  },
  contactsReadable: "readable",
  action: "Done",
  /**
   * The other half of connecting GoHighLevel, and it is not this app.
   *
   * WHY IT IS HERE AND NOT IN THE PRE WORK. GoHighLevel is bought at the clinic on 23
   * September, so a founder reading the pre work in early September has nothing to
   * connect it to yet. This screen is the moment it exists and is working, which is the
   * only moment the next step makes sense.
   *
   * WHAT IT IS FOR. The token above lets this app publish for them. It does nothing for
   * Claude anywhere else. Connecting GoHighLevel's own MCP server to their Claude
   * account is what lets them ask Claude to check a contact or post something while they
   * are working in Cowork, away from here.
   *
   * IT IS OPTIONAL AND IT IS SAID TO BE. Nothing in the three sessions needs it, and a
   * founder who skips it loses nothing before Atlanta.
   */
  mcp: {
    title: "Optional: let Claude reach GoHighLevel too",
    body: [
      "The token you just pasted lets this app publish for you. It does nothing for Claude when you are working somewhere else.",
      "If you want to ask Claude about your contacts or your posts while you are working in Cowork, GoHighLevel has its own connector you add to your Claude account. It takes a few minutes and nothing here needs it.",
    ],
    linkLabel: "How to set up the GoHighLevel connector",
    linkHref:
      "https://help.gohighlevel.com/support/solutions/articles/155000005741-how-to-setup-and-use-the-highlevel-mcp-server",
  },
};

export interface WalkFailure {
  /** What the verifier saw. Never shown to the founder. */
  readonly seen: string;
  /** What the founder reads. No status code on its own, ever. */
  readonly founderReads: string;
  /** The one next click. */
  readonly action: string;
  /** Which step to send them back to, when the fix is upstream. */
  readonly backTo?: string;
}

/**
 * Every failure state, with a cause in plain words and one next click.
 *
 * A status code on its own tells a founder nothing and tells a mentor almost
 * nothing. Each row names the most likely cause, because the most likely cause
 * is right most of the time and being told a probable reason beats being told
 * a number.
 */
export const GHL_WALK_FAILURES: readonly WalkFailure[] = [
  {
    seen: "401 on the first call",
    founderReads:
      "GoHighLevel did not accept that token. The usual reason is that only part of it got copied, or it was made at agency level instead of inside your sub account.",
    action: "Make a new one",
    backTo: "make-token",
  },
  {
    seen: "the token works but the Location ID does not belong to it",
    founderReads:
      "That token works, but it does not belong to the sub account with that Location ID. One of the two came from a different place.",
    action: "Check the Location ID",
    backTo: "location-id",
  },
  {
    // The accounts read is the call this most often happens on, so the table
    // shows that one. The scope is taken from the map in scopes.ts rather than
    // written out, because the seven strings live in exactly one file and a
    // second copy here is the drift that already happened once between
    // 00-scope.md and spike-findings.md.
    seen: "a call failed after auth had already succeeded, so a scope is probably missing",
    founderReads: scopeRefusalCopy(SCOPE_FOR_VERIFY_CALL.accounts),
    action: "Back to step 4, with that row highlighted",
    backTo: "make-token",
  },
  {
    seen: "the accounts read returned an empty list",
    founderReads:
      "Your token works. There is nothing connected to post to yet. In GoHighLevel, open Social Planner and connect your Facebook Page.",
    action: "I have done that, check again",
  },
  {
    seen: "429",
    founderReads: "GoHighLevel is asking us to slow down. Nothing is wrong with your token.",
    action: "Try again in 60 seconds",
  },
  {
    seen: "5xx or a timeout",
    founderReads: "GoHighLevel did not answer. This is their side, not yours.",
    action: "Try again",
  },
];

/**
 * The scope refusal sentence, built from whichever scope the failing call
 * needed.
 *
 * WHY IT IS A FUNCTION. Which status code means a scope refusal is not known.
 * It might be 401, or 403, or a 200 with an error in the body. Until that is
 * verified, the verifier treats any non success on a call whose auth already
 * succeeded as a probable scope problem and names the scope that call needed.
 * That is the right guess and it is honest about being one, so the copy has to
 * take the scope as an argument rather than hardcode a single row.
 */
export function scopeRefusalCopy(scope: GhlScope): string {
  return (
    `The token is good, but the box for \`${scope}\` was not ticked. ` +
    "You cannot add a permission to a token that already exists, so make a new one."
  );
}

/**
 * Retrying after a failure.
 *
 * The founder never re-enters the token. Asking somebody to paste a credential
 * a second time because a Facebook Page was not connected is how you lose them.
 */
export const GHL_WALK_RETRY =
  "Check again. We use the token you already gave us, so there is nothing to paste twice.";

/**
 * Coming back to step 5 after closing the tab.
 *
 * The Location ID survives a resume. The token does not, because we never held
 * it in a form we could put back on screen. Saying so is the only safe answer,
 * and it is better than a blank box with no explanation.
 */
export const GHL_WALK_RESUME_AT_PASTE =
  "We did not get a working connection last time, so make a new token and paste it here.";

/**
 * Disconnecting, and the order matters.
 *
 * Deleting our copy revokes nothing. A founder who believes it does walks away
 * thinking a live key has been switched off.
 */
export const GHL_WALK_REVOKE = {
  title: "Disconnect GoHighLevel",
  body: [
    "Disconnecting deletes our copy. It does not switch the token off.",
    "To actually cancel it, go back to the Private Integrations screen in GoHighLevel, the one where you made it, and delete the integration called Launchhouse.",
    `${GHL_MENU_PATH_HEDGE}, the route was ${GHL_MENU_PATHS_UNVERIFIED.privateIntegrations}.`,
    "Do that second, after disconnecting here.",
  ],
  action: "Disconnect",
};

/**
 * The third read, which has no known call.
 *
 * The copy exists because the check has to happen: without it, a missing
 * contacts permission is found in session 3 with the founder mid task, three
 * weeks after the token was made. The call itself is a named gap. Do not guess
 * the tool name, the path or the response shape.
 */
export const GHL_CONTACTS_READ_PENDING = {
  pending: true,
  spikeReference: "Decided 1 September 2026. Not a spike any more, see the note below.",
  why:
    "NOT A GAP WAITING TO BE FILLED ANY MORE. Reading a founder's contacts is GoHighLevel's " +
    "own MCP server's job, connected to their Claude account and working on their own " +
    "location. This app connects the token so it can be used, and it does not read contacts " +
    "itself. So step 6 checks the two things it actually needs, which is that the token works " +
    "and that it belongs to the right location, and says so.",
  founderReadsWhilePending:
    "We have checked the two that matter: your token works, and it belongs to this business. We do not read your contacts from here, and there is nothing else for you to do.",
};
