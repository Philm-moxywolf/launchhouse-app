/**
 * src/server/auth/roster.ts
 *
 * WHAT THIS IS. How an address typed into a browser is turned into a roster
 * lookup, and what the answer is when there is no match.
 *
 * WHY IT EXISTS. Two failures.
 *
 *   The first is a founder who cannot get in. They booked as
 *   "Sam.Taylor@Example.com " with a trailing space from a copy and paste, and
 *   the roster holds "sam.taylor@example.com". Postgres citext makes the case
 *   half of that free. The trimming and the shape check are here, in one place,
 *   so the sign in form and any later screen agree about what an address is.
 *
 *   The second is the dead end. Showing "check your email" to somebody who is
 *   not on the list leaves them staring at an empty inbox in a room with 130
 *   people in it, and the first they hear of the problem is a mentor being
 *   pulled out of a session. This is a closed event with a known guest list and
 *   the roster is not a secret worth protecting, so the screen says we cannot
 *   find that address, shows what they typed, names the two usual explanations,
 *   and gives two buttons.
 *
 * WHAT CALLS IT. ./magic-link.ts and ./plugin.ts.
 *
 * WHAT IT READS AND WRITES. Nothing directly. It is handed an AuthStore.
 */

import type { AuthStore, FounderRow } from './types.ts';

/**
 * Trim, lower case, and reject anything that is not shaped like an address.
 *
 * Deliberately loose about what an address may contain. This is not validation
 * of the internet's rules, it is a guard against an empty box, a name with no
 * at sign, and a paste that brought a newline with it. A real address that this
 * rejects is a founder who cannot sign in, which costs far more than a
 * nonsense address that reaches a roster lookup and misses.
 */
export function normaliseEmail(typed: string): string | null {
  const trimmed = typed.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (/\s/.test(trimmed)) return null;
  const at = trimmed.indexOf('@');
  if (at <= 0 || at !== trimmed.lastIndexOf('@')) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
  return trimmed.toLowerCase();
}

/** Why a lookup did not produce a founder anybody may sign in as. */
export type RosterMiss =
  | { readonly kind: 'malformed'; readonly typed: string }
  | { readonly kind: 'not_on_roster'; readonly email: string }
  | { readonly kind: 'disabled'; readonly email: string };

export type RosterAnswer =
  | { readonly ok: true; readonly founder: FounderRow }
  | { readonly ok: false; readonly miss: RosterMiss };

/**
 * Look one address up against the roster of 130.
 *
 * A deleted founder is treated exactly as an absent one. Their row is still
 * there because the audit line references it, and saying "that account is
 * deleted" to whoever typed the address tells a stranger something true about
 * somebody else.
 */
export async function lookupRoster(store: AuthStore, typed: string): Promise<RosterAnswer> {
  const email = normaliseEmail(typed);
  if (email === null) return { ok: false, miss: { kind: 'malformed', typed } };

  const founder = await store.findFounderByEmail(email);
  if (founder === null || founder.deletedAt !== null) {
    return { ok: false, miss: { kind: 'not_on_roster', email } };
  }
  if (founder.disabledAt !== null) {
    return { ok: false, miss: { kind: 'disabled', email } };
  }
  return { ok: true, founder };
}

/**
 * What the founder reads when there is no match.
 *
 * Names their doubt first, shows what they typed so a typo is visible without
 * anybody having to describe it, then ends on an action. No apology paragraph:
 * they want to get in, not to be consoled.
 */
export function missMessage(miss: RosterMiss): { readonly heading: string; readonly body: readonly string[] } {
  switch (miss.kind) {
    case 'malformed':
      return {
        heading: 'That does not look like an email address',
        body: [
          `You typed: ${miss.typed}`,
          'Check for a missing at sign or a stray space, then try again.',
        ],
      };
    case 'not_on_roster':
      return {
        heading: 'We cannot find that address',
        body: [
          `You typed: ${miss.email}`,
          'Two things usually explain it. You booked with a different address, perhaps a personal one. Or there is a typo above.',
          'Try another address, or tell a mentor and somebody will sort it out.',
        ],
      };
    case 'disabled':
      return {
        heading: 'That account is not active',
        body: [
          `You typed: ${miss.email}`,
          'A mentor can turn it back on. Tell a mentor and somebody will sort it out.',
        ],
      };
  }
}
