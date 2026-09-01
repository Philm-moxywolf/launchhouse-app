/**
 * src/server/integrations/apollo-search.ts
 *
 * WHAT THIS IS
 *   Asking Apollo for people who match a description, on behalf of one founder, using
 *   the key they stored. The one Apollo call that spends nothing.
 *
 * WHY IT IS SAFE FOR A MODEL TO CALL AND THE OTHERS ARE NOT
 *   Search costs no credits, contacts nobody, and returns a catalogue rather than
 *   contact details: `contracts/apollo.ts` records that a person comes back as a first
 *   name, an obfuscated surname, a title and a company, with no email at all. So the
 *   worst a wrong search can do is waste a minute. Enrichment spends the founder's
 *   money and a sequence writes to real people, and neither belongs behind a tool the
 *   model can reach on its own.
 *
 * THE KEY NEVER LEAVES THIS FILE. It is opened from the founder's own row, used for one
 *   call, and never returned, logged or put in an error. The same rule ghl-accounts.ts
 *   follows.
 *
 * READS  `connections`, through apollo-token-store. WRITES nothing.
 */

import { readApolloKey } from './apollo-token-store.ts';
import {
  APOLLO_AUTH_DOCUMENTED,
  APOLLO_HOST_DOCUMENTED,
  APOLLO_SEARCH_DOCUMENTED,
  APOLLO,
} from './contracts/apollo.ts';
import { outcomeForApolloStatus, type ApolloKeyOutcome } from './apollo-key-check.ts';
import { vendorFetch, type VendorAnswer } from './http.ts';

/** One row of the catalogue. Everything Apollo gives without being paid. */
export interface ApolloPerson {
  readonly id: string;
  readonly firstName: string;
  /** "Ni***l". Apollo hides the surname until the person is enriched. */
  readonly lastNameObfuscated: string;
  readonly title: string;
  readonly company: string;
  readonly hasEmail: boolean;
}

export type ApolloSearchOutcome =
  | { readonly kind: 'ok'; readonly total: number; readonly people: readonly ApolloPerson[] }
  | { readonly kind: 'no_key' }
  | Exclude<ApolloKeyOutcome, { kind: 'ok' }>;

/** What a founder may narrow a search by. Deliberately small. */
export interface ApolloSearchFilters {
  readonly titles?: readonly string[];
  readonly locations?: readonly string[];
  readonly employeeRanges?: readonly string[];
  readonly perPage?: number;
}

/** The fields, from `contracts/apollo.ts`, which read them off a real response. */
const F = APOLLO.searchResponseVerified;

function readPerson(row: unknown): ApolloPerson | null {
  if (row === null || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = r[F.person.id];
  if (typeof id !== 'string') return null;
  const org = r[F.person.organization];
  const company =
    org !== null && typeof org === 'object' && typeof (org as Record<string, unknown>)[F.organization.name] === 'string'
      ? ((org as Record<string, unknown>)[F.organization.name] as string)
      : '';
  return {
    id,
    firstName: typeof r[F.person.firstName] === 'string' ? (r[F.person.firstName] as string) : '',
    lastNameObfuscated:
      typeof r[F.person.lastNameObfuscated] === 'string' ? (r[F.person.lastNameObfuscated] as string) : '',
    title: typeof r[F.person.title] === 'string' ? (r[F.person.title] as string) : '',
    company,
    hasEmail: r[F.person.hasEmail] === true,
  };
}

/**
 * Search, for one founder, with their own key.
 *
 * `perPage` is capped at the documented maximum rather than passed through, because a
 * model asking for a thousand is a model that has misunderstood the task, and Apollo
 * refusing it is a worse way to find that out than us not asking.
 */
export async function searchPeople(
  founderId: string,
  filters: ApolloSearchFilters,
  fetchImpl?: typeof globalThis.fetch,
): Promise<ApolloSearchOutcome> {
  const key = await readApolloKey(founderId);
  if (key === null) return { kind: 'no_key' };

  const body: Record<string, unknown> = {
    per_page: Math.min(Math.max(filters.perPage ?? 10, 1), APOLLO_SEARCH_DOCUMENTED.maxPerPage),
  };
  if (filters.titles && filters.titles.length > 0) body['person_titles'] = filters.titles;
  if (filters.locations && filters.locations.length > 0) body['person_locations'] = filters.locations;
  if (filters.employeeRanges && filters.employeeRanges.length > 0) {
    body['organization_num_employees_ranges'] = filters.employeeRanges;
  }

  let answer: VendorAnswer;
  try {
    answer = await vendorFetch(
      {
        vendor: 'apollo',
        operation: 'search people',
        url: `https://${APOLLO_HOST_DOCUMENTED}${APOLLO_SEARCH_DOCUMENTED.path}`,
        method: 'POST',
        headers: {
          [APOLLO_AUTH_DOCUMENTED.header]: key,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body,
      },
      fetchImpl,
    );
  } catch (error: unknown) {
    return { kind: 'unreadable', why: error instanceof Error ? error.message : 'the call was refused' };
  }

  if (answer.kind === 'no_answer') return { kind: 'vendor_unavailable' };
  const mapped = outcomeForApolloStatus(answer.status);
  if (mapped !== null && mapped.kind !== 'ok') return mapped;
  if (answer.status < 200 || answer.status >= 300) {
    return { kind: 'unreadable', why: `Apollo answered ${String(answer.status)}` };
  }

  const parsed = answer.body;
  if (parsed === null || typeof parsed !== 'object') {
    return { kind: 'unreadable', why: 'Apollo answered 200 with no JSON object' };
  }
  const rows = (parsed as Record<string, unknown>)[F.peopleKey];
  if (!Array.isArray(rows)) {
    return { kind: 'unreadable', why: 'Apollo answered 200 without a people array' };
  }
  const total = (parsed as Record<string, unknown>)[F.totalKey];
  return {
    kind: 'ok',
    total: typeof total === 'number' ? total : rows.length,
    people: rows.map(readPerson).filter((p): p is ApolloPerson => p !== null),
  };
}
