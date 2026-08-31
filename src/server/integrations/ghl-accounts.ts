/**
 * src/server/integrations/ghl-accounts.ts
 *
 * WHAT THIS IS
 *   Reading a founder's connected social accounts back from GoHighLevel, and the one
 *   call the token walk is proved by.
 *
 * WHY ONE CALL IS ENOUGH
 *   It answers both halves at once. A 200 says the token is real and carries the
 *   account permission. The rows say whose token it is, in words the founder
 *   recognises: their own page name and their own handle. Step 6 deliberately does not
 *   show a green tick, because a tick can be a bug and a page name cannot.
 *
 * THE SHAPE HERE IS NOT A GUESS
 *   It was read off a real response on 31 August 2026, from a Private Integration
 *   token made in a sub account on the 97 dollar Starter plan, which is exactly what a
 *   founder will hold. Every field below appeared in that body. Nothing was inferred
 *   from documentation and nothing was assumed from a similar API.
 *
 * WHAT THE RESPONSE LOOKS LIKE, kept here in full because the next person to touch
 * this should not have to go and get one:
 *
 *   {
 *     "success": true, "statusCode": 200, "message": "Fetched Accounts",
 *     "results": {
 *       "accounts": [{
 *         "id": "<oauthId>_<locationId>_<originId>_<type>",
 *         "oauthId": "...", "profileId": "...",
 *         "name": "Elevate AI Consulting LTD",
 *         "platform": "linkedin", "type": "page",
 *         "expire": "2026-10-30T15:06:14.155Z", "isExpired": false,
 *         "originId": "140683954", "meta": { "urn": "..." },
 *         "deleted": false, "hasStatisticsPermissions": true, ...
 *       }],
 *       "groups": []
 *     },
 *     "traceId": "..."
 *   }
 *
 * THREE THINGS IN THAT BODY EARN THEIR OWN HANDLING, and each is a founder problem
 * rather than a parsing detail:
 *
 *   `deleted` is on the row. A deleted account is not one they can post to, and
 *   showing it back to them as proof of a working connection is a lie they will
 *   discover on the Sunday when nothing posts.
 *
 *   `isExpired` is separate from deleted and separate from the token. An account can
 *   be present, undeleted, and expired, and GoHighLevel will accept the post and never
 *   send it. So an expired account is surfaced rather than counted.
 *
 *   `id` CONTAINS THE LOCATION ID. That is a free cross check nobody had to build: a
 *   token whose accounts belong to a different location than the founder typed is the
 *   `location_mismatch` failure, and this is how it is caught rather than guessed.
 *
 * READS   nothing on disk. One outbound call through `http.ts`, which allowlists it.
 * WRITES  nothing. It returns what it found.
 */

import { GHL_API_VERSION, GHL } from './contracts/ghl.ts';
import { vendorFetch, type VendorAnswer } from './http.ts';

/** One row, as GoHighLevel writes it. Only the fields anything here reads. */
export interface GhlAccountRow {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly type: string;
  readonly isExpired: boolean;
  readonly deleted: boolean;
}

/** What the walk needs to know after one call. */
export type AccountsOutcome =
  | {
      readonly kind: 'ok';
      /** Live accounts, in the order GoHighLevel returned them. */
      readonly accounts: readonly GhlAccountRow[];
      /** Present but expired. Not a failure, and not something to hide either. */
      readonly expired: readonly GhlAccountRow[];
      /** Location ids seen on the rows, for the mismatch check. */
      readonly locationIds: readonly string[];
    }
  | { readonly kind: 'auth_rejected' }
  | { readonly kind: 'scope_probably_missing' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'vendor_unavailable' }
  | { readonly kind: 'unreadable'; readonly why: string };

/**
 * The location id out of an account id.
 *
 * The id is `<oauthId>_<locationId>_<originId>_<type>`, seen on both rows of a real
 * response. Returns null rather than guessing when it does not split that way, because
 * a wrong location read here would raise a mismatch against a token that is fine.
 */
export function locationIdFromAccountId(id: string): string | null {
  const parts = id.split('_');
  return parts.length >= 4 ? (parts[1] ?? null) : null;
}

/** True when the row is one a founder could actually post to today. */
function isLive(row: GhlAccountRow): boolean {
  return !row.deleted && !row.isExpired;
}

function readRow(value: unknown): GhlAccountRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const id = typeof r['id'] === 'string' ? r['id'] : null;
  const name = typeof r['name'] === 'string' ? r['name'] : null;
  if (id === null || name === null) return null;
  return {
    id,
    name,
    platform: typeof r['platform'] === 'string' ? r['platform'] : 'unknown',
    type: typeof r['type'] === 'string' ? r['type'] : 'unknown',
    // ABSENT MEANS THE SAFE ANSWER, not the convenient one. A missing `isExpired` is
    // read as expired, so a shape change surfaces the account as needing attention
    // rather than quietly promising a founder it will post.
    isExpired: r['isExpired'] !== false,
    deleted: r['deleted'] === true,
  };
}

/** Turn a raw body into rows, or say why it could not be read. */
export function readAccountsBody(body: unknown): AccountsOutcome {
  if (body === null || typeof body !== 'object') {
    return { kind: 'unreadable', why: 'the body was not an object' };
  }
  const results = (body as Record<string, unknown>)['results'];
  if (results === null || typeof results !== 'object') {
    return { kind: 'unreadable', why: 'there was no results object on the body' };
  }
  const raw = (results as Record<string, unknown>)['accounts'];
  if (!Array.isArray(raw)) {
    return { kind: 'unreadable', why: 'results.accounts was not a list' };
  }
  const rows = raw.map(readRow).filter((r): r is GhlAccountRow => r !== null);
  const live = rows.filter(isLive);
  const expired = rows.filter((r) => !r.deleted && r.isExpired);
  const locationIds = [
    ...new Set(rows.map((r) => locationIdFromAccountId(r.id)).filter((v): v is string => v !== null)),
  ];
  return { kind: 'ok', accounts: live, expired, locationIds };
}

/** Map a status onto the failure the walk knows how to talk about. */
export function outcomeForStatus(status: number): AccountsOutcome | null {
  if (status === 401) return { kind: 'auth_rejected' };
  // 403 is READ AS A SCOPE PROBLEM AND SAID TO BE A GUESS elsewhere, because
  // `GHL.scopeRefusalStatus` is still open: nobody has seen what a missing permission
  // actually comes back as. The copy the founder reads names the scope and says it is
  // a guess, which is why this mapping is allowed to be one.
  if (status === 403) return { kind: 'scope_probably_missing' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status >= 500) return { kind: 'vendor_unavailable' };
  return null;
}

/**
 * Ask GoHighLevel for this founder's connected accounts.
 *
 * The token never appears in a return value, a log line or an error from here.
 */
export async function fetchSocialAccounts(
  token: string,
  locationId: string,
  fetchImpl?: typeof globalThis.fetch,
): Promise<AccountsOutcome> {
  const path = GHL.listSocialAccounts.path.replace('{locationId}', encodeURIComponent(locationId));
  let answer: VendorAnswer;
  try {
    answer = await vendorFetch(
      {
        vendor: 'ghl',
        operation: 'list social accounts',
        url: `${GHL.baseUrl}${path}`,
        method: 'GET',
        headers: {
          [GHL.headerNames.auth]: `Bearer ${token}`,
          [GHL.headerNames.version]: GHL_API_VERSION,
          accept: 'application/json',
        },
      },
      fetchImpl,
    );
  } catch (error: unknown) {
    // A refusal from vendorFetch is our own mistake, not the vendor's, and it must not
    // be dressed up as GoHighLevel being unavailable.
    return { kind: 'unreadable', why: error instanceof Error ? error.message : 'the call was refused' };
  }

  if (answer.kind === 'no_answer') return { kind: 'vendor_unavailable' };
  const mapped = outcomeForStatus(answer.status);
  if (mapped !== null) return mapped;
  if (answer.status < 200 || answer.status >= 300) {
    return { kind: 'unreadable', why: `GoHighLevel answered ${String(answer.status)}` };
  }
  return readAccountsBody(answer.body);
}
