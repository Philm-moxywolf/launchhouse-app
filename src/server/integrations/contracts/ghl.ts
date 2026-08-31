/**
 * src/server/integrations/contracts/ghl.ts
 *
 * WHAT THIS IS
 *   Every GoHighLevel detail this product depends on, in one file, each one marked
 *   with how far it can be trusted. Nothing outside this directory holds a
 *   GoHighLevel string.
 *
 * WHY IT EXISTS
 *   The spike has never run. `planning/spike-findings.md` says "Status: not
 *   started", so nothing below has been compared against a real GoHighLevel
 *   account, and the difference between the two kinds of entry here is the whole
 *   point of the file.
 *
 *   AN UNVERIFIED VALUE is a real string that a screen has to render today, whose
 *   spelling nobody has checked. The seven scopes are the example. They cannot be
 *   holes, because a founder ticks them by hand three weeks before the event and
 *   the screen has to show something. They can be, and are, marked.
 *
 *   A PENDING ENTRY is a detail that has no value at all: an endpoint, a header
 *   name, a status code, a field. Those are `pending()` and they throw. There is no
 *   placeholder path in this file, deliberately. A plausible path would look like
 *   knowledge, and the day the spike runs it would be wrong in a way nobody traces.
 *
 * WHY THE SCOPES ARE HERE
 *   They were also in `app/content/scopes.ts`, described there as "exactly as it is
 *   spelled in their own UI", and that second copy was the one every screen read.
 *   Nothing had ever checked the spelling. The failure it invites is precise and it
 *   is not recoverable at the event: a founder ticks the list at 10pm, one string is
 *   wrong, the token comes out short a permission, and GoHighLevel gives no way to
 *   add a permission to a token that already exists. So the strings sit here, with
 *   the same treatment `GHL_TOKEN_PREFIX_GUESS` already had, `app/content/scopes.ts`
 *   imports them and keeps only the founder facing copy, and `vendor-facts.test.ts`
 *   fails if any file outside this directory writes one of them out again.
 *
 * WHY EACH SCOPE CARRIES AN ID OF OUR OWN
 *   The expected outcome of spike S-01 is that a spelling changes. If the founder
 *   facing reason for a scope were keyed by the vendor's string, changing that
 *   string would silently unpair a reason from its scope, and the screen would tell
 *   a founder that the contacts box proves their token belongs to their sub account.
 *   The id is ours, it is never sent anywhere, and it survives a respelling.
 *
 * WHAT CALLS IT
 *   `app/content/scopes.ts` and `app/content/ghl-walk.ts` for the strings a founder
 *   sees. `../http.ts` for the hosts and paths, which are all holes today, so
 *   nothing can call GoHighLevel yet and that is correct.
 *
 *   BECAUSE THE SCREENS IMPORT THIS FILE, IT REACHES THE BROWSER BUNDLE. It may
 *   therefore import nothing but its neighbours in this directory: no env, no
 *   database, no node builtin. `vendor-facts.test.ts` holds that.
 *
 * READS   nothing.
 * WRITES  nothing. It is data, and some of the data is a refusal.
 */

import { pending } from './pending.ts';

/* -------------------------------------------------------------------------- */
/* Unverified values: real strings, unchecked spelling                        */
/* -------------------------------------------------------------------------- */

/**
 * The seven scopes, UNVERIFIED, each with our own id beside it.
 *
 * SOURCE: `planning/delivery/00-scope.md:33-34`, which says seven and lists seven.
 * Not `planning/spike-findings.md`, which calls the total nine and then lists ten,
 * and which is being corrected.
 *
 * WHAT IS UNVERIFIED: the exact spelling of each string, as GoHighLevel writes it
 * in their own Private Integrations screen. Nobody has opened that screen with this
 * list beside them.
 *
 * WHAT WOULD SETTLE IT: spike S-01. Make a token in a real sub account, tick the
 * seven boxes, and copy the strings back out of the UI character for character.
 * When that happens, the `scope` values here change and nothing else does.
 *
 * ORDER MATTERS. It is the order the boxes are read out on the token walk screen,
 * grouped so a founder ticking them can keep their place. It is one list rather
 * than a list plus a separate ordering, because two structures can lose an entry
 * between them and a scope that is never shown is a token short a permission.
 */
export const GHL_SCOPES_UNVERIFIED = [
  { id: 'postRead', scope: 'socialplanner/post.readonly' },
  { id: 'postWrite', scope: 'socialplanner/post.write' },
  { id: 'accountRead', scope: 'socialplanner/account.readonly' },
  { id: 'statsRead', scope: 'socialplanner/statistics.readonly' },
  { id: 'contactRead', scope: 'contacts.readonly' },
  { id: 'contactWrite', scope: 'contacts.write' },
  { id: 'locationRead', scope: 'locations.readonly' },
] as const;

/** Our own name for a scope. Never sent anywhere, and it survives a respelling. */
export type GhlScopeId = (typeof GHL_SCOPES_UNVERIFIED)[number]['id'];

/** A scope string as we currently believe GoHighLevel spells it. */
export type GhlScope = (typeof GHL_SCOPES_UNVERIFIED)[number]['scope'];

/**
 * The seven, in the order the boxes are read out, as plain strings.
 *
 * Derived rather than written again. This is what the token walk prints into the
 * seven copy buttons, and a founder copies it character for character.
 */
export const GHL_SCOPE_STRINGS_UNVERIFIED: readonly GhlScope[] = GHL_SCOPES_UNVERIFIED.map(
  (row) => row.scope,
);

/**
 * The same seven, keyed by our id, so copy can name one without spelling it.
 *
 * The assertion is on the key type only. `Object.fromEntries` cannot know the keys
 * came from the tuple above, and the tuple is the only source they can come from.
 * `vendor-facts.test.ts` checks the built map against the tuple entry by entry.
 */
export const GHL_SCOPE_BY_ID = Object.fromEntries(
  GHL_SCOPES_UNVERIFIED.map((row) => [row.id, row.scope] as const),
) as Readonly<Record<GhlScopeId, GhlScope>>;

/** True, and it stays true until spike S-01 has been run against a real account. */
export const GHL_SCOPES_ARE_UNVERIFIED = true;

export const GHL_SCOPES_SOURCE =
  'planning/delivery/00-scope.md:33-34. Never compared against the GoHighLevel UI. Spike S-01 settles it.';

/**
 * Cut on 20 August 2026 and never to be re-added, also UNVERIFIED as strings.
 *
 * A token carrying any of these can send a message. That is the capability rule 2
 * exists to remove, and removing it at the credential is the outermost of the five
 * layers, because it is the one we do not enforce ourselves.
 *
 * Their spelling being unverified is safe in the direction that matters. If one of
 * these three is misspelled, the real scope is simply never requested, because the
 * requested list is the seven above and nothing else. The list is here so that a
 * test can assert none of them ever appears in a requested set, and so the reason
 * is written down next to the strings rather than in a planning document.
 */
export const FORBIDDEN_GHL_SCOPES_UNVERIFIED = [
  'conversations.readonly',
  'conversations/message.readonly',
  'conversations/message.write',
] as const;

export const FORBIDDEN_GHL_SCOPES_REASON =
  'Cut on 20 August 2026. A token carrying any of these can send a message, and rule 2 ' +
  'says nothing we ship sends a DM. Removing the scope removes the capability, which is ' +
  'stronger than removing the code that would have used it.';

/**
 * What a GoHighLevel Private Integration Token looks like, UNVERIFIED.
 *
 * WHAT IS UNVERIFIED: whether a real token starts with this at all. The prefix is
 * inferred from our own code, `scripts/cmd/receipt.sh:110` and `accounts.sh:127`,
 * both of which refuse any value matching it after lowercasing on the grounds that
 * it looks like a token. Nothing has ever compared it against a real one.
 *
 * WHAT WOULD SETTLE IT: spike S-01. Look at a real token.
 *
 * IT WARNS, IT DOES NOT BLOCK. If real tokens do not carry the prefix this is one
 * line to delete, and a founder who has pasted a correct token must not be stopped
 * by a guess of ours.
 */
export const GHL_TOKEN_PREFIX_GUESS = 'pit-';
export const GHL_TOKEN_PREFIX_IS_A_GUESS = true;

/**
 * Where the two screens a founder has to reach were, the last time anybody looked.
 * UNVERIFIED, and held to the same standard as the prefix above.
 *
 * WHAT IS UNVERIFIED: all of it. The route, the wording of each menu item, and
 * whether either screen sits in the same place on every plan. The source is
 * `REPLIT-BUILD.md:991` and `:1003`, which are our own notes, and spike A1 has not
 * been run, so nobody on this project has opened that menu.
 *
 * WHAT WOULD SETTLE IT: spike A1. Buy one Starter seat and read the menu.
 *
 * WHY IT IS A STRING AND NOT A HOLE. A founder has to be sent somewhere. A hole
 * would leave the hardest screen in the programme with no instruction on it, which
 * is worse than an instruction that says how old it is.
 *
 * WHY THE COPY DOES NOT DEPEND ON IT BEING RIGHT. A vendor moves a menu item
 * whenever it likes, and this copy is read at 10pm three weeks before the event by
 * somebody with nobody to ask. So every sentence that uses one of these says when
 * we last looked, then tells the founder to search the page for the words, and step
 * 2's hard stop names both causes rather than telling a founder their plan is wrong
 * when the truth may be that a menu moved. `vendor-facts.test.ts` fails if any
 * founder facing string carries one of these routes without the hedge.
 *
 * THE SCREEN NAMES THEMSELVES ARE PROSE, on purpose. "Private Integrations" appears
 * in eight sentences in the token walk, and threading it through a constant would
 * leave the one file that has to be readable out loud full of substitutions. What
 * is single sourced here is the claim about where a screen sits, because that is
 * the part that is a claim.
 */
export const GHL_MENU_PATHS_UNVERIFIED = {
  /** The screen that makes the token, on steps 2 and 4 and in the revoke notice. */
  privateIntegrations: 'Settings, then Private Integrations',
  /** The screen carrying the Location ID, on step 3. */
  businessProfile: 'Settings, then Business Profile',
} as const;

export const GHL_MENU_PATHS_ARE_A_GUESS = true;

export const GHL_MENU_PATHS_SOURCE =
  'REPLIT-BUILD.md:991 and :1003, which are our own notes rather than anything read off a real account. Spike A1 settles it.';

/** The hedge every founder facing sentence carrying one of those routes has to use. */
export const GHL_MENU_PATH_HEDGE = 'When we last looked';

/* -------------------------------------------------------------------------- */
/* Evidenced: read off a workflow that runs against real GoHighLevel           */
/* -------------------------------------------------------------------------- */

/**
 * WHERE THESE CAME FROM, and how far they can be trusted.
 *
 * SOURCE: an n8n workflow, "Moxywolf Blog and Social Posting Automation to Blog and
 * GHL Socials 2.0", supplied on 31 August 2026. It posts to GoHighLevel on a
 * schedule in production, so its calls are not documentation and not a guess: they
 * are requests that a real GoHighLevel account has been answering.
 *
 * THAT IS A THIRD KIND OF EVIDENCE and this file only had two, so it is worth
 * naming. An UNVERIFIED value is a real string nobody has checked. A PENDING entry
 * has no value at all. These are neither: somebody else's account has answered
 * them, repeatedly, and we have not put our own token behind them.
 *
 * WHAT THAT DOES NOT COVER, said plainly, because the gap is the useful part:
 *
 *   The token may not be the same kind. That workflow's Authorization header could
 *   be carrying an agency token where a founder will carry a sub account Private
 *   Integration token. The header SHAPE is proven either way. Whether our seven
 *   scopes are grantable on the 97 dollar tier is untouched by this and is still
 *   spike S-01.
 *
 *   Nothing here proves a response shape. The calls are proven; the fields that
 *   come back are not, because a workflow that posts does not have to read.
 *
 *   Nothing here proves what a refusal looks like, which is still S-01.
 *
 * WHAT WOULD PROMOTE THESE TO VERIFIED: one call with a founder's own token, from
 * this app, and the response written down. That is still spike S-02, and it is now
 * a much smaller spike than it was this morning.
 */

/**
 * EVERY PATH IN THIS DIRECTORY, WITH WHERE IT CAME FROM.
 *
 * `vendor-facts.test.ts` extracts every path shaped string in these files and fails
 * if one is not a key here. That is the guard that used to say "no path at all",
 * which was the right rule while there was no evidence and the wrong one the moment
 * there was: it would have kept real knowledge out of the file to keep guesses out,
 * and guesses were the only thing it was ever aimed at.
 *
 * A path added without a line here fails the build. Adding provenance is therefore
 * the same act as adding a path, which is the property worth having.
 */
export const GHL_PATH_PROVENANCE: Readonly<Record<string, string>> = {
  '/social-media-posting/': 'Allowlist prefix for the two social calls below.',
  '/blogs/': 'Allowlist prefix. The blog call is in the source workflow and this product does not use it yet, so the prefix is here and no entry reads it.',
  '/social-media-posting/{locationId}/accounts':
    'n8n workflow "Moxywolf Blog and Social Posting Automation to Blog and GHL Socials 2.0", node "Get Social ID\'s from GHL", 31 August 2026.',
  '/social-media-posting/{locationId}/posts':
    'Same workflow, node "Post to Social LinkedIn Image3". Runs on a schedule against a real account.',
};

/** The API version header value. Sent on every call in the source workflow. */
export const GHL_API_VERSION = '2021-07-28';

/**
 * THE LOCATION ID IS A PATH SEGMENT, NOT A HEADER, and that changed a shape here.
 *
 * `headerNames` used to be typed `{ auth, location, version }` because nobody knew
 * where the location went. Every call in the source workflow puts it in the path
 * and sends no location header at all, so the third name was a field waiting to be
 * filled with something that does not exist. The shape is ours to decide and the
 * evidence decided it.
 *
 * Path templates below carry `{locationId}` for that reason. Substitution is the
 * caller's job and it is deliberately not a string concatenation helper here: this
 * file is data, it reaches the browser bundle, and it holds no logic.
 */
export const GHL_LOCATION_ID_IS_A_PATH_SEGMENT = true;

/* -------------------------------------------------------------------------- */
/* Pending: details with no value at all                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every GoHighLevel detail that has no answer yet.
 *
 * Reading any of these throws and names the spike. That is what stops a feature
 * shipping on a guess: the boot check walks this object for the features that are
 * switched on, and refuses to start in production if one of them depends on a hole.
 *
 * NOTHING HERE IS A PLACEHOLDER. Not one of these is "probably /v1/something". A
 * hole that throws with the spike named is better than a value that is wrong, and
 * the difference only shows up on the day it matters.
 */
export const GHL = {
  /** EVIDENCED. Every GoHighLevel call in the source workflow goes to this one host. */
  hosts: ['services.leadconnectorhq.com'] as readonly string[],
  /**
   * EVIDENCED. Plain REST, not MCP over JSON-RPC. That was the open half of this
   * entry's old question and the workflow settles it: ordinary HTTP requests with a
   * bearer token and a version header.
   */
  baseUrl: 'https://services.leadconnectorhq.com',
  /**
   * EVIDENCED, and deliberately only these two. The allowlist is rule 2 layer 2, so
   * it is the wrong place to be generous: a prefix nobody needs today is a prefix
   * nothing checks tomorrow. Add one when a call needs it, not in advance.
   */
  permittedPathPrefixes: ['/social-media-posting/', '/blogs/'] as readonly string[],
  /**
   * EVIDENCED. `Authorization: Bearer <token>` and `Version: 2021-07-28`, on every
   * call. There is no location header: see GHL_LOCATION_ID_IS_A_PATH_SEGMENT above,
   * which is why this shape lost a field rather than gaining a value.
   */
  headerNames: { auth: 'Authorization', version: 'Version' },
  readLocation: pending<{ method: string; path: string }>(
    'S-02',
    'the call that reads a location back, and the field in the response that carries its name. Step 6 of the token walk reads the founder their own page name, and a page name a bug cannot fake is the whole proof.',
  ),
  /**
   * EVIDENCED for the call. NOT for the response: a workflow that reads account ids
   * out by hand does not tell us what a row is shaped like, and step 6 of the token
   * walk reads a founder their own account names back. So the request is settled and
   * the row shape is still S-02.
   */
  listSocialAccounts: { method: 'GET', path: '/social-media-posting/{locationId}/accounts' },
  /**
   * EVIDENCED, body and all. `status` is 'scheduled' in the source workflow and the
   * draft path presumably differs, which is one word and is not something to guess:
   * whichever word a draft takes is S-02, and until it is known the CSV export stays
   * the way drafts reach a founder, which is a working path and not a degraded one.
   *
   * `userId` is in the body and is a fourth thing a founder has to supply, alongside
   * the token, the location id and the account ids. The token walk does not ask for
   * it today. That is a real gap in the walk rather than a gap in this file.
   */
  createPost: {
    method: 'POST',
    path: '/social-media-posting/{locationId}/posts',
    body: {
      accountIds: 'string[], from listSocialAccounts',
      summary: 'string, the post text',
      type: "'post'",
      status: "'scheduled', and the draft word is not yet known",
      scheduleDate: 'ISO 8601 instant, see scheduleEncoding',
      userId: 'string, and nothing collects this from a founder yet',
      media: '[{ url, type, caption }], optional',
    },
  },
  readPost: pending<{ method: string; path: string }>(
    'S-02',
    'the call that reads one post back. Every write is read back, and the read back is what catches a credential mix up after the fact.',
  ),
  listPostsInWindow: pending<{ method: string; path: string }>(
    'S-02',
    'the call that lists posts in a time window. Reconciliation after a stopped batch depends on it, because writes are never retried automatically.',
  ),
  deletePost: pending<{ method: string; path: string }>('S-02', 'the call that deletes a post.'),
  readContacts: pending<{ method: string; path: string }>(
    'A2',
    'the name of the contacts read. This one is not merely unverified, it is unknown: the token walk copy for the third check is written and the call is not.',
  ),
  createContact: pending<{ method: string; path: string; body: unknown }>(
    'A2',
    'the call that adds a contact, for the "push my 25 people into the CRM" commit.',
  ),
  /**
   * STILL PENDING, AND THIS IS THE ONE TO READ, because it looks answered and is not.
   *
   * The source workflow sends `scheduleDate` as a full ISO 8601 instant in UTC, from
   * `Date.toISOString()`, for example 2026-09-08T15:00:00.000Z. So of the four
   * candidate encodings, one is evidenced and the other three are not. That is real
   * progress and it is not the answer.
   *
   * WHAT IS STILL OPEN. Whether GoHighLevel treats that offset as authoritative, or
   * ignores it and reads the wall clock in the location's own timezone. The source
   * workflow cannot tell us: its own comment says it uses UTC "to avoid DST
   * weirdness", so it sidesteps the question rather than answering it, and it never
   * checks what hour the post actually went out in the location's zone.
   *
   * WHY THAT MATTERS AT 130x. A founder means half past nine where they are. If the
   * offset is authoritative, converting from America/New_York is correct and
   * daylight saving is handled by the conversion. If it is reinterpreted, the same
   * value posts four or five hours off, in the same direction, for everybody, and it
   * changes twice a year.
   *
   * WHAT WOULD SETTLE IT, and it is now five minutes rather than a spike: schedule
   * one post for a known instant, then look at what time GoHighLevel says it will go
   * out. One post, one glance.
   */
  scheduleEncoding: pending<{ branch: string }>(
    'S-03',
    "how GoHighLevel READS the schedule value. The value's format is evidenced: a full ISO 8601 UTC instant, as sent by the source workflow. What is not known is whether the offset is authoritative or is reinterpreted in the location's timezone, and the two differ by hours in the same direction for every founder. Schedule one post for a known instant and look at the time it shows.",
  ),
  scopeRefusalStatus: pending<number>(
    'S-01',
    'which status code a scope refusal comes back as. It might be 401, or 403, or a 200 with an error in the body. Until it is known the verifier treats any failure on a call whose auth already succeeded as a probable scope problem, names the scope, and says it is a guess.',
  ),
  rateLimit: pending<{ requestsPerSecond: number; burst: number }>(
    'S-04',
    'the real rate ceiling. The product runs deliberately slow until this is measured, because getting throttled on day one costs more than twenty seconds does.',
  ),
  socialPlannerCsvHeader: pending<readonly string[]>(
    'S-05',
    'the exact header row GoHighLevel expects, read byte for byte from a template downloaded from their own UI. The exporter never contains a hardcoded header row: it reads the first line of that fixture and writes exactly that.',
  ),
} as const;

/* -------------------------------------------------------------------------- */
/* The one thing that is verified                                             */
/* -------------------------------------------------------------------------- */

/**
 * `ghl-workflows` makes no outbound call at all, and that is a fact rather than a
 * hole.
 *
 * No API creates a GoHighLevel workflow. The engine writes copy the founder pastes
 * at the clinic, so a whole engine has no integration work in it. The app's only
 * job there is to render the key to copy table with a Copy button per row.
 */
export const GHL_WORKFLOWS_HAVE_NO_API = true;
