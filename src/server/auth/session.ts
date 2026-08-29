/**
 * src/server/auth/session.ts
 *
 * WHAT THIS IS. The session cookie: how one is minted, how one is read back
 * into a founder, when it slides, and how it is thrown away.
 *
 * WHY IT EXISTS. This file is the tenancy boundary at the HTTP edge. Every
 * route in this app answers "which founder is this" by calling into here and
 * nowhere else. There is no code path anywhere that takes a founder id from a
 * body, a query string or a header, because the only function that produces one
 * takes a cookie.
 *
 * The failures it prevents, in the order they would happen:
 *
 *   A cookie stored as itself means a leaked database row is a live session.
 *   The session id IS the sha256 of the cookie value, so the row cannot be
 *   turned back into a cookie.
 *
 *   A session that expires during the weekend is a founder standing in the
 *   Atlanta venue on the Friday unable to get in. Ninety days, sliding, on
 *   purpose. Sessions are per device with no limit, because founders sign in
 *   again on a phone on event day.
 *
 *   A cookie written without Secure over https is a session id in plain text on
 *   a venue network. A cookie written WITH Secure over http on a laptop is a
 *   developer who can never sign in and concludes sign in is broken. Both are
 *   handled here, from APP_BASE_URL, rather than guessed per route.
 *
 * WHAT CALLS IT. ./plugin.ts on every request, ./magic-link.ts on a successful
 * verify, and the sign out route.
 *
 * WHAT IT READS. The AuthStore, and the cookie on the request.
 * WHAT IT WRITES. The `sessions` table, through the store, and one Set-Cookie.
 */

import { newSecret, sha256Hex } from './tokens.ts';
import type { AuthStore, Clock, FounderRow, SessionRow } from './types.ts';

export interface SessionConfig {
  readonly cookieName: string;
  readonly ttlDays: number;
  /** True when APP_BASE_URL is https. A Secure cookie over http is never sent back. */
  readonly secure: boolean;
}

/** What a caller needs to set the cookie, whatever the HTTP framework is. */
export interface MintedSession {
  readonly cookieValue: string;
  readonly row: SessionRow;
  readonly cookieOptions: {
    readonly httpOnly: true;
    readonly secure: boolean;
    readonly sameSite: 'lax';
    readonly path: '/';
    readonly maxAge: number;
  };
}

const DAY_MS = 86_400_000;

/**
 * Do not write to the sessions table on every request.
 *
 * A founder mid interview makes a request every few seconds, and an UPDATE per
 * request is write amplification against the one table every authenticated
 * request already reads. An hour of granularity is far finer than a 90 day
 * window needs, and it keeps the sliding behaviour honest: a founder who used
 * the app at any point in the last 90 days stays signed in.
 */
const SLIDE_AFTER_MS = 3_600_000;

export function cookieOptionsFor(cfg: SessionConfig): MintedSession['cookieOptions'] {
  return {
    httpOnly: true,
    secure: cfg.secure,
    // Lax rather than Strict. Strict means the cookie is not sent on the
    // navigation that follows the verify POST, so a founder who has just signed
    // in lands on the app signed out, which reads as sign in being broken.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor((cfg.ttlDays * DAY_MS) / 1000),
  };
}

/**
 * Mint a session for a founder who has just proved they hold a valid token.
 *
 * The caller writes the row inside the same transaction that consumed the
 * token, which is what makes a token single use in the way that matters: there
 * is no window where a token is spent and no session exists.
 */
export function mintSession(founderId: string, cfg: SessionConfig, clock: Clock): MintedSession {
  const cookieValue = newSecret();
  const now = clock.now();
  return {
    cookieValue,
    row: {
      id: sha256Hex(cookieValue),
      founderId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + cfg.ttlDays * DAY_MS),
      lastSeenAt: now,
      revokedAt: null,
    },
    cookieOptions: cookieOptionsFor(cfg),
  };
}

export type SessionLookup =
  | { readonly ok: true; readonly session: SessionRow; readonly founder: FounderRow }
  | { readonly ok: false; readonly reason: 'absent' | 'unknown' | 'expired' | 'revoked' | 'no_founder' };

/**
 * Turn a cookie value into a founder, or say why it is not one.
 *
 * The reasons are distinguished for the log and for the sign in screen, never
 * for the founder: every one of them ends at the same screen saying sign in
 * again. Telling a browser that a session id was "unknown" rather than
 * "expired" tells whoever sent it whether they guessed a real id.
 *
 * Also refuses a founder whose row is disabled or deleted, so revoking access
 * does not depend on hunting down every live session first.
 */
export async function readSession(
  store: AuthStore,
  cookieValue: string | undefined,
  clock: Clock,
): Promise<SessionLookup> {
  if (cookieValue === undefined || cookieValue.length === 0) return { ok: false, reason: 'absent' };

  const session = await store.findSession(sha256Hex(cookieValue));
  if (session === null) return { ok: false, reason: 'unknown' };
  if (session.revokedAt !== null) return { ok: false, reason: 'revoked' };

  const now = clock.now();
  if (session.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };

  const founder = await store.findFounderById(session.founderId);
  if (founder === null || founder.deletedAt !== null || founder.disabledAt !== null) {
    return { ok: false, reason: 'no_founder' };
  }
  return { ok: true, session, founder };
}

/**
 * Push the expiry out, at most once an hour.
 *
 * Returns the new expiry when it moved, so the caller can refresh the cookie's
 * own Max-Age at the same time. A row that says 90 days behind a cookie the
 * browser threw away after 30 is a founder who is signed in according to us and
 * signed out according to their laptop.
 */
export async function slideSession(
  store: AuthStore,
  session: SessionRow,
  cfg: SessionConfig,
  clock: Clock,
): Promise<Date | null> {
  const now = clock.now();
  if (now.getTime() - session.lastSeenAt.getTime() < SLIDE_AFTER_MS) return null;
  const expiresAt = new Date(now.getTime() + cfg.ttlDays * DAY_MS);
  await store.touchSession(session.id, now, expiresAt);
  return expiresAt;
}

/** Sign out on this device. Other devices keep their own sessions, on purpose. */
export async function endSession(store: AuthStore, cookieValue: string | undefined, clock: Clock): Promise<void> {
  if (cookieValue === undefined || cookieValue.length === 0) return;
  await store.revokeSession(sha256Hex(cookieValue), clock.now());
}
