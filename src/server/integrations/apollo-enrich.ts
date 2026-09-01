/**
 * src/server/integrations/apollo-enrich.ts
 *
 * WHAT THIS IS
 *   Turning people found by a search into people with an email address. The only Apollo
 *   call in this product that spends a founder's money, and it is priced per person.
 *
 * WHY IT IS CAPPED HERE RATHER THAN TRUSTED TO THE CALLER
 *   The programme is 25 messages. A model that misreads a conversation and asks for four
 *   hundred is not a hypothetical, it is a Tuesday, and the founder finds out when their
 *   credits are gone. The cap is a number in this file so that no prompt, no tool schema
 *   and no skill edit can raise it.
 *
 * TWO PARAMETERS THAT EXIST AND ARE NOT USED
 *   `reveal_personal_emails` and `reveal_phone_number`. This programme sends 25 business
 *   emails to people at work. A personal address or a mobile number is a different act
 *   with a different consent question behind it. Hard off, never a tool argument, and
 *   `contracts/apollo.ts` says the same thing so the decision is not only in code.
 *
 * NO EMAIL IS A NORMAL ANSWER, NOT A FAILURE. Apollo does not have an address for
 *   everybody. What it returns in that case has not been seen, so this checks for
 *   something that looks like an address rather than trusting a key to be absent, and a
 *   person without one comes back marked instead of dropped. A founder choosing 25 needs
 *   to know which of their choices cannot be written to.
 *
 * READS  `connections`, through apollo-token-store. WRITES nothing.
 */

import { readApolloKey } from './apollo-token-store.ts';
import {
  APOLLO_AUTH_DOCUMENTED,
  APOLLO_ENRICH_DOCUMENTED,
  APOLLO_ENRICH_PARAMS_DOCUMENTED,
  APOLLO_HOST_DOCUMENTED,
  APOLLO,
} from './contracts/apollo.ts';
import { outcomeForApolloStatus, type ApolloKeyOutcome } from './apollo-key-check.ts';
import { vendorFetch, type VendorAnswer } from './http.ts';

/**
 * The most people one call may enrich.
 *
 * NOT THE PROGRAMME'S 25, AND IT WAS FOR ABOUT AN HOUR, WHICH WAS WRONG. Twenty five is
 * the promise made to a founder about what they will have done by the Saturday. It is a
 * floor under the programme, not a ceiling on a person, and their Apollo account and
 * their credits are their own. A founder who wants sixty is not misusing this.
 *
 * WHAT THIS NUMBER IS INSTEAD: one batch. It matches Apollo's own per-page maximum, so
 * it is a size the vendor already thinks in, and it exists for one reason only, which is
 * that a model that has misread a conversation asks for ten thousand rather than for
 * sixty. Anything above this comes back as too_many with the number in it, so the
 * founder is asked rather than charged.
 */
export const ENRICH_CAP = 100;

export interface EnrichedPerson {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly company: string;
  /** Null when Apollo has no address for them, which is normal and not an error. */
  readonly email: string | null;
  /** Apollo's own word, for example "verified". Null when it did not say. */
  readonly emailStatus: string | null;
}

export type ApolloEnrichOutcome =
  | { readonly kind: 'ok'; readonly people: readonly EnrichedPerson[]; readonly spentOn: number }
  | { readonly kind: 'no_key' }
  | { readonly kind: 'too_many'; readonly asked: number; readonly cap: number }
  | Exclude<ApolloKeyOutcome, { kind: 'ok' }>;

const E = APOLLO.enrichResponseDocumented;

/** Something we would be willing to put in front of a founder as an address. */
function plausibleEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Deliberately loose. This is not address validation, it is a check that Apollo gave
  // us an address rather than a placeholder, a null, or the word "email_not_unlocked".
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function readEnriched(fallbackId: string, body: unknown): EnrichedPerson | null {
  if (body === null || typeof body !== 'object') return null;
  const person = (body as Record<string, unknown>)[E.personKey];
  if (person === null || person === undefined || typeof person !== 'object') return null;
  const r = person as Record<string, unknown>;
  const str = (k: string): string => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const first = str(E.person.firstName);
  const last = str(E.person.lastName);
  return {
    id: typeof r[E.person.id] === 'string' ? (r[E.person.id] as string) : fallbackId,
    name: `${first} ${last}`.trim(),
    title: str(E.person.title),
    company: str(E.person.organizationName),
    email: plausibleEmail(r[E.person.email]),
    emailStatus: typeof r[E.person.emailStatus] === 'string' ? (r[E.person.emailStatus] as string) : null,
  };
}

/**
 * Enrich people by their Apollo id, one call each.
 *
 * ONE AT A TIME ON PURPOSE, FOR NOW. `people/bulk_match` exists and is on the key
 * screen, and using it would be one request instead of twenty five. It is not used here
 * because its request and response shapes have not been read, and getting a bulk call
 * wrong spends every credit in the batch before anybody sees the result. The loop is
 * slower and it fails one person at a time.
 */
export async function enrichPeople(
  founderId: string,
  apolloIds: readonly string[],
  fetchImpl?: typeof globalThis.fetch,
): Promise<ApolloEnrichOutcome> {
  if (apolloIds.length > ENRICH_CAP) {
    return { kind: 'too_many', asked: apolloIds.length, cap: ENRICH_CAP };
  }
  const key = await readApolloKey(founderId);
  if (key === null) return { kind: 'no_key' };
  return enrichWithKey(key, apolloIds, fetchImpl);
}

/**
 * The same work, with the key already in hand.
 *
 * SPLIT OUT SO THE PART THAT SPENDS MONEY CAN BE TESTED. Reading the key needs a
 * database, and everything worth proving here is on the other side of that: that the two
 * revealing parameters are never on, that a refusal stops the loop rather than burning
 * the rest of the batch, and that a person with no email comes back marked instead of
 * dropped. Those were untestable while one function did both jobs, which meant the
 * safety properties were claims rather than facts.
 */
export async function enrichWithKey(
  key: string,
  apolloIds: readonly string[],
  fetchImpl?: typeof globalThis.fetch,
): Promise<ApolloEnrichOutcome> {
  if (apolloIds.length > ENRICH_CAP) {
    return { kind: 'too_many', asked: apolloIds.length, cap: ENRICH_CAP };
  }

  const people: EnrichedPerson[] = [];
  let spentOn = 0;

  for (const id of apolloIds) {
    const url = new URL(`https://${APOLLO_HOST_DOCUMENTED}${APOLLO_ENRICH_DOCUMENTED.path}`);
    url.searchParams.set(APOLLO_ENRICH_PARAMS_DOCUMENTED.byId, id);
    // Both hard off. See the header, and contracts/apollo.ts.
    url.searchParams.set('reveal_personal_emails', String(APOLLO_ENRICH_PARAMS_DOCUMENTED.revealPersonalEmails));
    url.searchParams.set('reveal_phone_number', String(APOLLO_ENRICH_PARAMS_DOCUMENTED.revealPhoneNumber));

    let answer: VendorAnswer;
    try {
      answer = await vendorFetch(
        {
          vendor: 'apollo',
          operation: 'enrich one person',
          url: url.toString(),
          method: 'POST',
          headers: {
            [APOLLO_AUTH_DOCUMENTED.header]: key,
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        },
        fetchImpl,
      );
    } catch (error: unknown) {
      return { kind: 'unreadable', why: error instanceof Error ? error.message : 'the call was refused' };
    }

    if (answer.kind === 'no_answer') return { kind: 'vendor_unavailable' };
    const mapped = outcomeForApolloStatus(answer.status);
    // STOPPING ON THE FIRST REFUSAL IS THE POINT. A key that is out of credit answers
    // the same way for every person after it, and carrying on would turn one refusal
    // into twenty five while telling the founder nothing new.
    if (mapped !== null && mapped.kind !== 'ok') return mapped;
    if (answer.status < 200 || answer.status >= 300) {
      return { kind: 'unreadable', why: `Apollo answered ${String(answer.status)}` };
    }

    spentOn += 1;
    const enriched = readEnriched(id, answer.body);
    if (enriched !== null) people.push(enriched);
  }

  return { kind: 'ok', people, spentOn };
}
