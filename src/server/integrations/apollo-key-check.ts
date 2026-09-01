/**
 * src/server/integrations/apollo-key-check.ts
 *
 * WHAT THIS IS
 *   Asking Apollo whether a key a founder just pasted actually works, before it is
 *   stored. Mirrors `ghl-accounts.ts`: same outcome shape, same rule that the
 *   credential never appears in a return value, a log line or an error from here.
 *
 * WHY THE CHECK IS A SEARCH
 *   Search is the one call verified to cost no credits. A check that spent a founder's
 *   money to prove their key works would be a charge for pressing a button, and at 130
 *   founders pressing it more than once it stops being a rounding error.
 *
 * WHY IT SENDS A FILTER RATHER THAN AN EMPTY BODY
 *   `{ person_titles: [...], per_page: 1 }` is the shape that has actually been run
 *   against Apollo. An unfiltered search is probably fine and has never been sent, and
 *   a setup screen is the worst place to find out it is not. The title is deliberately
 *   ordinary so the call returns rows on any account.
 *
 * WHY 403 IS ITS OWN OUTCOME AND NOT FOLDED INTO "REJECTED"
 *   Apollo answers 403 for two different situations that a founder fixes in two
 *   different places: the endpoint is not in their plan, or their key was not scoped to
 *   it. `contracts/apollo.ts` records both. Telling somebody their key is wrong when
 *   their plan is the problem sends them to make another key that fails the same way.
 *
 * READS   nothing. WRITES nothing.
 */

import {
  APOLLO_AUTH_DOCUMENTED,
  APOLLO_HOST_DOCUMENTED,
  APOLLO_SEARCH_DOCUMENTED,
} from './contracts/apollo.ts';
import { vendorFetch, type VendorAnswer } from './http.ts';

/** What a key check concluded. Nothing here carries the key. */
export type ApolloKeyOutcome =
  | { readonly kind: 'ok' }
  /** 401. The key is wrong, revoked, or from another account. */
  | { readonly kind: 'auth_rejected' }
  /** 403. Either the plan lacks the endpoint or the key was not scoped to it. */
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'vendor_unavailable' }
  /** Our problem. `why` is for the log and never reaches a founder unedited. */
  | { readonly kind: 'unreadable'; readonly why: string };

/** The status codes that mean something specific. Anything else is unreadable. */
export function outcomeForApolloStatus(status: number): ApolloKeyOutcome | null {
  if (status === 401) return { kind: 'auth_rejected' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'vendor_unavailable' };
  return null;
}

/**
 * A body that came back 200 still has to look like a search result.
 *
 * A 200 carrying an error object, or an HTML page from something in front of Apollo,
 * would otherwise be stored as a working connection and fail in session 3.
 */
function readSearchBody(body: unknown): ApolloKeyOutcome {
  if (body === null || typeof body !== 'object') {
    return { kind: 'unreadable', why: 'Apollo answered 200 with no JSON object' };
  }
  if (!Array.isArray((body as { people?: unknown }).people)) {
    return { kind: 'unreadable', why: 'Apollo answered 200 without a people array' };
  }
  return { kind: 'ok' };
}

/**
 * Does this key work?
 *
 * The key never appears in a return value, a log line or an error from here.
 */
export async function checkApolloKey(
  key: string,
  fetchImpl?: typeof globalThis.fetch,
): Promise<ApolloKeyOutcome> {
  let answer: VendorAnswer;
  try {
    answer = await vendorFetch(
      {
        vendor: 'apollo',
        operation: 'check the key with a free search',
        url: `https://${APOLLO_HOST_DOCUMENTED}${APOLLO_SEARCH_DOCUMENTED.path}`,
        method: 'POST',
        headers: {
          [APOLLO_AUTH_DOCUMENTED.header]: key,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: { person_titles: ['ceo'], per_page: 1 },
      },
      fetchImpl,
    );
  } catch (error: unknown) {
    // A refusal from vendorFetch is our own mistake, most likely the allowlist, and it
    // must not be dressed up as Apollo being unavailable.
    return { kind: 'unreadable', why: error instanceof Error ? error.message : 'the call was refused' };
  }

  if (answer.kind === 'no_answer') return { kind: 'vendor_unavailable' };
  const mapped = outcomeForApolloStatus(answer.status);
  if (mapped !== null) return mapped;
  if (answer.status < 200 || answer.status >= 300) {
    return { kind: 'unreadable', why: `Apollo answered ${String(answer.status)}` };
  }
  return readSearchBody(answer.body);
}
