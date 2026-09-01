/**
 * src/server/integrations/contracts/apollo.ts
 *
 * WHAT THIS IS
 *   Every Apollo detail this product depends on, in one file, each one marked with how
 *   far it can be trusted. Nothing outside this directory holds an Apollo string.
 *
 * WHY THE BLOCKER THAT USED TO BE AT THE TOP OF THIS FILE IS GONE
 *   It said the auth question was the blocker, and named three parts: whether one seat
 *   can act for 130 founders, what that costs in credits per enrichment, and whether
 *   doing so is inside Apollo's terms.
 *
 *   All three assumed one deployment serving a cohort. That architecture no longer
 *   exists. Every founder remixes this app into their own Replit account, with their own
 *   database and their own credentials, which is the same change that removed the magic
 *   link and the roster of 130 from `auth/owner.ts`. So there is no shared seat, the
 *   credits are the founder's own, and a person using their own API key against their
 *   own account is ordinary use rather than a terms question.
 *
 *   The paragraph was left behind by the architecture it was written against, and it read
 *   as a live blocker to anybody who opened the file. That is the only reason it is
 *   called out here rather than quietly deleted.
 *
 * THE THREE KINDS OF ENTRY BELOW, AND THE DIFFERENCE IS THE POINT
 *   A DOCUMENTED value comes from Apollo's own published reference, read on 1 September
 *   2026, and has never been sent. It is better than a guess and it is not a fact yet.
 *   Every one of them is named `_DOCUMENTED` so that nothing reads as settled.
 *
 *   A PENDING entry has no value at all and throws on first touch, naming what would
 *   fill it. Response field names are all pending, because a field name invented from a
 *   prose description is exactly the kind of plausible value this directory exists to
 *   keep out.
 *
 *   WHAT WOULD MOVE THE FIRST GROUP TO SETTLED is one real call with one real key. Until
 *   that has run, no screen may render any of this and no copy may promise it.
 *
 * WHAT CALLS IT
 *   `../http.ts` for the host and the path prefixes. Nothing else yet, because the
 *   client is not built.
 *
 *   IF A SCREEN EVER IMPORTS THIS FILE IT REACHES THE BROWSER BUNDLE, so it may import
 *   nothing but its neighbours in this directory: no env, no database, no node builtin.
 *   `vendor-facts.test.ts` holds that.
 *
 * READS   nothing.
 * WRITES  nothing.
 */

import { pending } from './pending.ts';

/** The one host. Documented, never called. */
export const APOLLO_HOST_DOCUMENTED = 'api.apollo.io';

/** The path every endpoint sits under. */
export const APOLLO_BASE_PATH_DOCUMENTED = '/api/v1';

/**
 * How a request says who it is. DOCUMENTED.
 *
 * A header carrying the key itself, not a bearer scheme, so nothing about it is shaped
 * like the GoHighLevel token and nothing should be copied across from it.
 */
export const APOLLO_AUTH_DOCUMENTED = {
  header: 'x-api-key',
  alsoRequired: { 'Content-Type': 'application/json' },
} as const;

/**
 * Finding people. DOCUMENTED.
 *
 * THE PATH IS THE PART WORTH READING TWICE. `/mixed_people/search` and
 * `/mixed_people/api_search` both exist and only the second is meant for API use; the
 * first answers 403 on lower plans. A founder on a plan we recommended would have hit
 * that in session 3 with no way to tell it from a bad key.
 *
 * It is documented as costing no credits, which is what makes a search cheap enough to
 * run twice. Enrichment is the one that spends, and the two must not be confused in any
 * screen that names a cost.
 */
export const APOLLO_SEARCH_DOCUMENTED = {
  method: 'POST',
  path: '/api/v1/mixed_people/api_search',
  costsCredits: false,
  maxPerPage: 100,
} as const;

/**
 * Filling in an email address. DOCUMENTED, and it spends the founder's money.
 *
 * So it is a commit with the cost named on the button, never something a model calls on
 * its own. That rule predates knowing the endpoint and is not softened by knowing it.
 */
export const APOLLO_ENRICH_DOCUMENTED = {
  method: 'POST',
  path: '/api/v1/people/match',
  costsCredits: true,
} as const;

/**
 * Creating a sequence. DOCUMENTED.
 *
 * Apollo calls the same object a sequence in one endpoint and an emailer campaign in
 * the other, and both names are theirs. Written down rather than tidied, because a
 * caller reading only one of them would look for the wrong word in a response.
 */
export const APOLLO_CREATE_SEQUENCE_DOCUMENTED = {
  method: 'POST',
  path: '/api/v1/sequences',
} as const;

/**
 * Putting people into it. DOCUMENTED, and the one with a gate on it.
 *
 * It answers 403 unless the key is a master key or scoped to this endpoint, which is
 * `sequenceKeyPermission` below and is the open question for the whole feature.
 *
 * `send_email_from_email_account_id` means a mailbox must already be connected inside
 * Apollo before any of this runs. The skill already tells founders to do that, so it is
 * not new work, but nothing here can paper over it if they have not.
 *
 * A CONTACT IS NOT A SEARCH RESULT. Apollo distinguishes a person in its database from a
 * contact the team has explicitly added, and only contacts go into sequences. So the
 * flow is three steps, not two: search, add as contacts, then sequence.
 */
export const APOLLO_ADD_TO_SEQUENCE_DOCUMENTED = {
  method: 'POST',
  path: '/api/v1/emailer_campaigns/{sequenceId}/add_contact_ids',
  queryParams: ['emailer_campaign_id', 'send_email_from_email_account_id', 'contact_ids[]'],
  costsCredits: false,
  rateLimitPerHour: 600,
  needsMasterOrScopedKey: true,
} as const;

export const APOLLO = {
  /**
   * What comes back, field by field, from either call.
   *
   * Pending and staying pending until a real response has been read. The docs describe
   * the shape in prose, and a field name taken from prose is a guess wearing the clothes
   * of a fact, which is the one thing this directory is for.
   */
  /**
   * VERIFIED, from a real call on 1 September 2026. The rest of this object is not.
   *
   * WHAT SEARCH ACTUALLY RETURNS, and it is less than the name suggests. A person
   * comes back as `id`, `first_name`, `title` and their organisation's `name`. The
   * surname is `last_name_obfuscated` and arrives as "Ni***l". There is no email
   * field at all, only `has_email: true` saying one exists.
   *
   * THAT IS THE DESIGN, NOT A LIMIT WE HIT. Search is free because it hands back a
   * catalogue rather than contact details, and enrichment is what costs. So a
   * founder cannot write to anybody on search results alone: 25 people means 25
   * enrichments, and the cost is real and per person.
   *
   * WATCH `has_direct_phone`. Every other `has_` field is a boolean and that one is
   * the string "Yes". Reading it as a boolean would make every person look
   * reachable by phone, which is exactly the kind of field that is right in testing
   * and wrong in front of a founder.
   */
  searchResponseVerified: {
    totalKey: 'total_entries',
    peopleKey: 'people',
    person: {
      id: 'id',
      firstName: 'first_name',
      /** Obfuscated at this endpoint. "Ni***l". The real surname needs enrichment. */
      lastNameObfuscated: 'last_name_obfuscated',
      title: 'title',
      lastRefreshedAt: 'last_refreshed_at',
      /** Booleans, except hasDirectPhone, which is the string "Yes". */
      hasEmail: 'has_email',
      hasDirectPhone: 'has_direct_phone',
      organization: 'organization',
    },
    organization: { name: 'name' },
  },
  /**
   * How to ask for page two.
   *
   * The verified call sent `per_page` and got two people back, so that parameter is
   * real. Nothing in that response named a page, a cursor or a total page count, so
   * how to walk past the first page is still unknown and is not going to be guessed.
   */
  pagination: pending<{ requestKey: string; responseKey: string }>(
    'S-06',
    'how to ask for page two. per_page is verified; nothing in the response named a page or a cursor.',
  ),
  enrichResponse: pending<{ personKey: string; emailKey: string }>(
    'S-06',
    'the field names in a real enrichment response, and what comes back when Apollo has no email for that person.',
  ),
  creditsRemaining: pending<{ method: string; path: string }>(
    'S-06',
    'whether the remaining credit balance can be read at all. Without it a batch cannot say what it will cost before it runs.',
  ),
  rateLimit: pending<{ requestsPerSecond: number; burst: number }>(
    'S-06',
    'the real rate ceiling, and what a refusal looks like when the account runs out of credit rather than out of rate.',
  ),
  /**
   * WHICH PLAN MAY CREATE A KEY THAT CAN DO THE ABOVE. The one thing left that
   * decides whether any of it works for a founder.
   *
   * `add_contact_ids` answers 403 unless the key is a master key or is scoped to
   * that endpoint, and Apollo's published reference does not say which subscription
   * tiers may create either. The programme now recommends the 65 USD plan and the
   * engine is built on Apollo doing the sending, so a founder on that plan who
   * cannot create the key finds out in session 3 with the weekend already booked.
   *
   * This is a pricing page and an account, not a call. It stays a hole until
   * somebody has made a master key on the plan we actually recommend.
   */
  sequenceKeyPermission: pending<{ plan: string; keyKind: string }>(
    'S-06',
    'which Apollo plan may create a key that add_contact_ids accepts. 403 otherwise, and the docs do not say.',
  ),
} as const;

/**
 * The client is not built, so the feature is off, and the screen says so.
 *
 * Knowing the endpoints is not the same as having called them. This stays true until a
 * real call has run and the response fields above have values.
 *
 * What founders get meanwhile is not a consolation. The B2B track is 25 messages to
 * people the founder chose, one at a time, in a list they built and can name. Nothing
 * here promises replies, and nothing anywhere else should either.
 */
export const APOLLO_IS_OFF = true;
