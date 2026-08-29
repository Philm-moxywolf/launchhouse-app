/**
 * src/server/integrations/contracts/apollo.ts
 *
 * WHAT THIS IS
 *   Every Apollo detail this product would depend on. All of it is a hole.
 *
 * WHY IT EXISTS
 *   Apollo is off. The build document's own feature table says "Apollo, all of it:
 *   off until the auth question is answered", and what founders get instead is the
 *   manual route, which is first class rather than a fallback: the B2B track is 25
 *   low volume messages to a list the founder built and can name.
 *
 *   So this file could have been empty. It is not, because an empty file invites
 *   somebody to write the first Apollo call wherever they happen to be working, and
 *   then the vendor strings are in three places. This is the one place they can go,
 *   and today every one of them throws.
 *
 *   THE AUTH QUESTION IS THE BLOCKER AND IT IS NOT A DETAIL. Whether one seat can
 *   act for 130 founders, what that costs in credits per enrichment, and whether
 *   doing so is inside Apollo's terms, are three answers we do not have. A guess at
 *   any of them spends somebody's money or breaks somebody's contract.
 *
 * WHAT CALLS IT
 *   Nothing yet, which is the correct number while the feature is off.
 *
 * READS   nothing.
 * WRITES  nothing. It throws.
 */

import { pending } from './pending.ts';

export const APOLLO = {
  hosts: pending<readonly string[]>(
    'S-06',
    'the hostnames Apollo is reached on. Nothing is sent anywhere until this is a real list.',
  ),
  auth: pending<{ header: string; scheme: string }>(
    'S-06',
    'how a request is authenticated, and whether one seat may act on behalf of 130 founders at all. That last part is a terms question before it is a technical one.',
  ),
  search: pending<{ method: string; path: string; body: unknown }>(
    'S-06',
    'the people search call. It costs a query against the seat, so it is a commit and not a model callable read, and the count is shown before the button.',
  ),
  enrich: pending<{ method: string; path: string; body: unknown }>(
    'S-06',
    'the enrichment call, and what one enrichment costs in credits. It spends the founder\'s money, so it is a commit with the cost named on the button.',
  ),
  creditsRemaining: pending<{ method: string; path: string }>(
    'S-06',
    'whether the remaining credit balance can be read at all. Without it a batch cannot say what it will cost before it runs.',
  ),
  rateLimit: pending<{ requestsPerSecond: number; burst: number }>(
    'S-06',
    'the real rate ceiling, and what a refusal looks like when the seat runs out of credit rather than out of rate.',
  ),
} as const;

/**
 * What founders get while all of the above is a hole, and it is not a consolation.
 *
 * The B2B track is 25 messages to people the founder chose, one at a time, in a
 * list they built and can name. That is the product, not a degraded version of it.
 * Nothing here promises replies, and nothing anywhere else should either.
 */
export const APOLLO_IS_OFF = true;
