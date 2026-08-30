/**
 * src/server/auth/session.ts
 *
 * WHAT THIS IS. The session cookie: how one is minted, how one is read back
 * into the owner, when it slides, and how it is thrown away.
 *
 * WHY IT EXISTS. This file is the boundary at the HTTP edge. Every route in
 * this app answers "who is this" by calling into here and nowhere else. There
 * is no code path anywhere that takes a founder id from a body, a query string
 * or a header, because the only function that produces one takes a cookie.
 *
 * The failures it prevents, in the order they would happen:
 *
 *   A cookie stored as itself means a leaked database row is a live session.
 *   The row id is a hash, so the row cannot be turned back into a cookie.
 *
 *   A session that expires during the weekend is a founder standing in the
 *   venue on the Friday unable to get in. Ninety days, sliding, on purpose.
 *   Sessions are per device with no limit, because the founder signs in again
 *   on a phone at the event and the laptop must stay signed in.
 *
 *   A cookie written without Secure over https is a session id in plain text on
 *   a venue network. A cookie written WITH Secure over http on a laptop is a
 *   developer who can never sign in and concludes sign in is broken. Both are
 *   handled here, from APP_BASE_URL, rather than guessed per route.
 *
 *   AND THE ONE THIS FILE GAINED. Changing the passphrase has to sign every
 *   device out. Without that, a founder who thinks somebody got in changes
 *   OWNER_PASSPHRASE, is told the app is now safe, and the stranger's cookie
 *   still works. `sessionIdFor` below is how that is made true, and it is made
 *   true with no extra column, no boot time sweep and no call anybody has to
 *   remember.
 *
 * WHAT CALLS IT. ./plugin.ts on every request, ./owner.ts on a successful sign
 * in, and the sign out route.
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
  /**
   * The secret every session id is derived with. Today this IS the owner
   * passphrase, and that is the point of it.
   *
   * IT IS A REQUIRED FIELD OF THIS OBJECT RATHER THAN A FOURTH ARGUMENT TO
   * THREE FUNCTIONS, and that is deliberate. A positional argument somebody
   * forgets to pass is a set of sessions that quietly survive a passphrase
   * change, which is the exact failure this exists to prevent, arriving in
   * silence. As a required property of one config object, the compiler refuses
   * the build instead.
   */
  readonly bindingSecret: string;
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

/**
 * The row id for one cookie value, on this deployment, under this passphrase.
 *
 * TWO PROPERTIES, AND BOTH OF THEM ARE THE REASON THIS IS NOT PLAIN sha256.
 *
 *   A leaked row is not a live session. The id is a hash, so it cannot be
 *   turned back into a cookie. That was already true.
 *
 *   Changing the passphrase ends every session. The passphrase is mixed in
 *   before hashing, so every cookie minted under the old one now hashes to an
 *   id that is in no row, and `findSession` returns null for all of them. The
 *   founder who suspects somebody got in edits one Replit Secret, redeploys,
 *   and every device including the stranger's is signed out. There is no column
 *   for a passphrase fingerprint in the schema and this needs none.
 *
 * The newline separator cannot appear in the cookie value, which is base64url,
 * so there is no pair of different inputs that hash the same way.
 *
 * A DEPLOYMENT WITH NO PASSPHRASE SET STILL PRODUCES IDS, and that is safe
 * because nothing mints or accepts a session in that state: ./owner.ts refuses
 * before it gets here and ./plugin.ts refuses every request. This function is
 * arithmetic and does not need to know about readiness.
 */
export function sessionIdFor(cookieValue: string, bindingSecret: string): string {
  return sha256Hex(`${cookieValue}\n${bindingSecret}`);
}

export function cookieOptionsFor(cfg: SessionConfig): MintedSession['cookieOptions'] {
  return {
    httpOnly: true,
    secure: cfg.secure,
    // Lax rather than Strict. Two reasons, and the second one is protection
    // rather than convenience. Strict means the cookie is not sent on the
    // navigation that follows the sign in POST, so a founder who has just
    // signed in lands on the app signed out. And Lax already withholds the
    // cookie on a cross site POST, which is what stops another page on the
    // internet posting to /auth/signout or to an API route on the founder's
    // behalf. That is this app's CSRF defence and it is one word.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor((cfg.ttlDays * DAY_MS) / 1000),
  };
}

/**
 * Mint a session for whoever has just proved they hold the passphrase.
 *
 * The caller writes the row immediately. There is no window where a sign in has
 * been accepted and no session exists.
 */
export function mintSession(founderId: string, cfg: SessionConfig, clock: Clock): MintedSession {
  const cookieValue = newSecret();
  const now = clock.now();
  return {
    cookieValue,
    row: {
      id: sessionIdFor(cookieValue, cfg.bindingSecret),
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
 * Turn a cookie value into the founder, or say why it is not one.
 *
 * The reasons are distinguished for the log, never for the person holding the
 * cookie: every one of them ends at the same screen saying sign in again.
 * Telling a browser that a session id was "unknown" rather than "expired" tells
 * whoever sent it whether they guessed a real id.
 *
 * Also refuses a founder row that is disabled or deleted. That is kept from the
 * roster model deliberately. It is the only way to end access without hunting
 * down every live session first, it costs one comparison per request, and a
 * single tenant app is exactly where somebody would remove it as unnecessary
 * and then need it.
 */
export async function readSession(
  store: AuthStore,
  cookieValue: string | undefined,
  cfg: SessionConfig,
  clock: Clock,
): Promise<SessionLookup> {
  if (cookieValue === undefined || cookieValue.length === 0) return { ok: false, reason: 'absent' };

  const session = await store.findSession(sessionIdFor(cookieValue, cfg.bindingSecret));
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

/**
 * Sign out on this device. Other devices keep their own sessions, on purpose.
 *
 * The founder signs in on a phone at the event with the laptop still open, and
 * closing the phone must not close the laptop.
 */
export async function endSession(
  store: AuthStore,
  cookieValue: string | undefined,
  cfg: SessionConfig,
  clock: Clock,
): Promise<void> {
  if (cookieValue === undefined || cookieValue.length === 0) return;
  await store.revokeSession(sessionIdFor(cookieValue, cfg.bindingSecret), clock.now());
}
