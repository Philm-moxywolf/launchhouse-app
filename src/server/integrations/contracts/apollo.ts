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
  /**
   * THE REFERENCE AND THE KEY SCREEN DISAGREE, AND THE KEY SCREEN WINS.
   *
   * Apollo's published reference describes this as `/api/v1/sequences`. The endpoint
   * list on the create-key screen of a real account says `api/v1/sequences/create`.
   * A key is scoped by that second spelling, so a call to the first would be scoped
   * against something that is not in the list and answer 403 for a reason nobody
   * would find.
   *
   * Both are written down rather than one being quietly picked, because the first
   * real call is what settles it and whoever makes it needs to know there were two.
   */
  path: '/api/v1/sequences/create',
  pathInPublishedReference: '/api/v1/sequences',
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

/**
 * READ OFF THE CREATE-KEY SCREEN of a real Apollo account, 1 September 2026.
 *
 * That screen lists every endpoint a key on that account may be scoped to, so it is
 * better evidence of existence and availability than the reference is. It says nothing
 * about method, parameters or response shape, and none of those are guessed here.
 *
 * THREE OF THESE CLOSE HOLES THAT HAD BEEN OPEN SINCE THIS FILE WAS WRITTEN.
 *
 *   `usage_stats/credit_usage_stats` is the credit balance. A batch can now say what it
 *   will cost before it runs, which is the thing that made enrichment a commit.
 *
 *   `usage_stats/api_usage_stats` is the rate ceiling, read rather than assumed.
 *
 *   `email_accounts/index` is where `send_email_from_email_account_id` comes from. That
 *   parameter had no source and a founder cannot be asked to find an internal id by
 *   hand.
 *
 * TWO OF THEM CHANGE WHAT THE ENGINE SHOULD DO.
 *
 *   `people/bulk_match` enriches many in one call. Twenty five people is one request,
 *   not twenty five, which matters against a rate limit and against a founder watching
 *   a screen.
 *
 *   `email_domain_diagnosis/authentication_status` reads whether a domain's SPF, DKIM
 *   and DMARC are actually right. PRE-WORK marks that time critical for every B2B
 *   founder and today the only check is the founder believing they did it. This turns
 *   the most expensive silent failure on the track into something the app can see.
 */
export const APOLLO_ENDPOINTS_ON_KEY_SCREEN = {
  search: 'api/v1/mixed_people/api_search',
  enrich: 'api/v1/people/match',
  enrichMany: 'api/v1/people/bulk_match',
  createContact: 'api/v1/contacts/create',
  createContacts: 'api/v1/contacts/bulk_create',
  createSequence: 'api/v1/sequences/create',
  updateSequence: 'api/v1/sequences/update',
  addToSequence: 'api/v1/emailer_campaigns/add_contact_ids',
  stopForContacts: 'api/v1/emailer_campaigns/remove_or_stop_contact_ids',
  approveSequence: 'api/v1/emailer_campaigns/approve',
  abortSequence: 'api/v1/emailer_campaigns/abort',
  sendingMailboxes: 'api/v1/email_accounts/index',
  domainAuthStatus: 'api/v1/email_domain_diagnosis/authentication_status',
  creditBalance: 'api/v1/usage_stats/credit_usage_stats',
  apiUsage: 'api/v1/usage_stats/api_usage_stats',
} as const;

/**
 * Enrichment. DOCUMENTED, and the only call here that spends a founder's money.
 *
 * TWO PARAMETERS ARE DELIBERATELY NOT USED AND MUST NOT BECOME TOOL ARGUMENTS.
 * `reveal_personal_emails` and `reveal_phone_number` both exist. This programme sends 25
 * business emails to people at work. A personal address or a mobile number is a
 * different act with a different consent question behind it, they cost more, and the
 * phone one needs a webhook this app does not run. Hard off, and not offered.
 */
export const APOLLO_ENRICH_PARAMS_DOCUMENTED = {
  byId: 'id',
  revealPersonalEmails: false,
  revealPhoneNumber: false,
} as const;

/**
 * Creating a sequence, and the reason this product can offer it at all.
 *
 * APOLLO CREATES A SEQUENCE INACTIVE UNLESS YOU ASK OTHERWISE. `active` defaults to
 * false, and activating is a separate call. So this app can build a founder's sequence
 * and fill it, and the thing that actually sends stays a button the founder presses in
 * their own Apollo account.
 *
 * THAT IS THE LINE, AND IT IS NOT A LIMITATION WE HIT. `active: true` is never sent, and
 * `emailer_campaigns/approve` has no client and must not get one. The Apollo screen has
 * said "nothing sends until you press send" since before any of this was built, and this
 * is what makes that sentence true rather than a hope.
 *
 * `emailer_schedule_id` is required, and it comes from `emailer_schedules/index`, which
 * is on the key screen. A founder cannot be asked to find an internal id by hand.
 */
export const APOLLO_SEQUENCE_DOCUMENTED = {
  createPath: '/api/v1/sequences/create',
  requiredOnCreate: ['name', 'emailer_schedule_id'],
  /** Never sent. Absent means inactive, which is the whole safety property. */
  activateKey: 'active',
  responseKey: 'emailer_campaign',
  responseIdKey: 'id',
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
  /**
   * DOCUMENTED, read 1 September 2026. Not yet seen from a real call, because a real
   * call spends a credit and that is the founder's money.
   *
   * The one thing still genuinely unknown is what comes back when Apollo has no email
   * for that person: whether `email` is absent, null, or a placeholder. Whatever it is
   * must be treated as "no email" rather than written into a file, so the caller checks
   * for a plausible address rather than trusting the key to be missing.
   */
  enrichResponseDocumented: {
    personKey: 'person',
    person: {
      id: 'id',
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      /** For example "verified". Worth carrying: an unverified address is a bounce. */
      emailStatus: 'email_status',
      title: 'title',
      organizationName: 'organization_name',
      linkedinUrl: 'linkedin_url',
    },
  },
  /**
   * The path exists, the shape does not.
   *
   * `usage_stats/credit_usage_stats` and `usage_stats/api_usage_stats` are both on the
   * key screen, so the old question, whether a balance can be read at all, is answered
   * yes. What comes back from either has not been seen, and a balance rendered from a
   * guessed field name would be a number in front of a founder that nobody checked.
   */
  usageResponses: pending<{ creditsKey: string; limitKey: string }>(
    'S-06',
    'what credit_usage_stats and api_usage_stats actually return. Both endpoints are confirmed to exist.',
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
  /**
   * WHAT IS PAID FOR IS NOT ACCESS. Closed 1 September 2026.
   *
   * The endpoint list above was read off a FREE account and carries the whole emailer
   * set: sequences, add_contact_ids, approve, abort, send_now. So the question this
   * entry used to ask, whether the recommended plan may create a key that
   * add_contact_ids accepts, is answered by the free tier already having it.
   *
   * THAT MOVES THE REASON FOR THE 65 USD PLAN, and the copy has to move with it. It is
   * not bought for API access. It is bought for what the account may then do: credits,
   * sending limits, mailboxes. A founder who reads "you need the plan to connect it" and
   * then finds the free one connects fine has been told something untrue by us, and
   * every other number we gave them is worth less afterwards.
   *
   * The limits themselves are unread, which is the entry below. Nothing may state a
   * sending cap or a credit allowance until somebody has.
   */
  planLimits: pending<{ creditsPerMonth: number; sendingCap: number }>(
    'S-06',
    'what the free tier actually allows in credits, sending and mailboxes, against the 65 USD plan. Access is confirmed identical; the limits are what differ and none of them are read.',
  ),
} as const;

/**
 * HOW A FOUNDER MAKES THE KEY, AND WHY THIS IS THE GOHIGHLEVEL SCOPE PROBLEM AGAIN.
 *
 * Apollo keys are made at Settings, Integrations, API Keys, Create new key. The founder
 * then either ticks endpoints one at a time or turns on "Set as master key", which
 * selects all of them. DOCUMENTED, read 1 September 2026.
 *
 * A 403 HAS TWO CAUSES AND THEY LOOK THE SAME FROM HERE. Either the endpoint is not in
 * that founder's plan, or their key was not scoped to it. Apollo's own reference says
 * "all pricing plans include at least basic access to the Apollo API, but more advanced
 * functionality is only available on certain plans" and never says which.
 *
 * THAT IS THE SAME FAILURE `ghl.ts` IS WRITTEN AROUND: a founder ticks a list of
 * permissions from a screen we wrote, three weeks before the event, and one wrong tick
 * surfaces in session 3 with no way to widen a key that already exists. It cost that
 * file an essay and its own id scheme.
 *
 * SO THE WALK SHOULD TELL FOUNDERS TO USE THE MASTER TOGGLE, not a list of endpoints to
 * tick. It is one switch instead of a hunt through a list, it cannot come out short, and
 * the failure it removes is the expensive one. The cost is that the key can do anything
 * the account can, which is why the paste screen must say so plainly and why the key is
 * sealed the same way every other credential here is.
 *
 * WHAT THIS DOES NOT SETTLE, and it is the one that matters: whether the plan the
 * programme now recommends includes the sequence endpoints at all. A master key on a
 * plan without them still answers 403. That is `sequenceKeyPermission` above, it is a
 * pricing page and an account rather than a call, and no screen may promise sequences
 * until somebody has looked.
 */
export const APOLLO_KEY_CREATION_DOCUMENTED = {
  where: 'Settings, Integrations, API Keys, Create new key',
  masterToggleLabel: 'Set as master key',
  forbiddenReasons: ['the endpoint is not in this plan', 'the key was not scoped to it'],
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
