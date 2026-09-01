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

export const APOLLO = {
  /**
   * What comes back, field by field, from either call.
   *
   * Pending and staying pending until a real response has been read. The docs describe
   * the shape in prose, and a field name taken from prose is a guess wearing the clothes
   * of a fact, which is the one thing this directory is for.
   */
  searchResponse: pending<{ peopleKey: string; idKey: string; pagination: unknown }>(
    'S-06',
    'the field names in a real people search response. One call with one real key settles it.',
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
  sequences: pending<{ method: string; path: string; body: unknown }>(
    'S-06',
    'whether contacts can be added to a sequence over the API at all, and on which plans. The manual spreadsheet route exists because this answer is not known.',
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
