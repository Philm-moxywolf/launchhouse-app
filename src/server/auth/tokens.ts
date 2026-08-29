/**
 * src/server/auth/tokens.ts
 *
 * WHAT THIS IS. The secrets sign in hands out, and the arithmetic on them:
 * a link token, a six digit code, the sha256 they are stored as, and the
 * constant time comparison used to check one.
 *
 * WHY IT EXISTS. Three failures, all of them quiet.
 *
 *   A predictable token is somebody else's workspace. Math.random is seeded
 *   from the clock and a founder id is public inside the room, so the only
 *   acceptable source is randomBytes.
 *
 *   A token stored as itself means a database dump is 130 live sign in links.
 *   Storing the sha256 costs one hash per sign in and removes that entirely.
 *
 *   A comparison with === on a secret leaks its prefix through timing. It is a
 *   small leak against a 32 byte token and a real one against a six digit code,
 *   where there are only a million answers and the attacker gets to watch.
 *
 * WHAT CALLS IT. ./magic-link.ts, ./session.ts, ./store-pg.ts.
 *
 * WHAT IT READS AND WRITES. Nothing. Pure, apart from the random source.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 32 bytes, base64url. What goes in the email link and in the session cookie. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Sha256, hex, lower case. 64 characters, which is what `char(64)` in the
 * schema is sized for. Used for both the token and the session cookie.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * A six digit code, from the same email as the link.
 *
 * For the founder whose mobile mail app will not open a browser, and for the
 * mentor who reads six digits out loud in a venue. randomInt is the crypto
 * grade integer generator, not Math.random, and the padded string keeps a code
 * beginning with a zero six characters long rather than five.
 *
 * Six digits is a million answers, which is thin. What makes it safe is not the
 * length: it is that a code is single use, expires in minutes, and is burned in
 * the database after a handful of wrong guesses. Those three are in
 * ./magic-link.ts and they are the defence.
 */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Digits only, exactly six, spaces and dashes forgiven because people retype what they hear. */
export function normaliseCode(typed: string): string | null {
  const digits = typed.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Compare two secrets without leaking how much of one matched.
 *
 * Both sides are hashed first, so the comparison is always over two 32 byte
 * buffers whatever length the caller supplied. Comparing raw values of
 * different lengths would either throw or return early, and both of those are
 * the timing leak this exists to remove.
 */
export function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The id of one sign in request. Both rows it writes hang off it.
 *
 * Not a ULID, because nothing sorts these and a sortable id would put the order
 * founders signed in into a primary key for no reason.
 */
export function newRequestId(): string {
  return randomBytes(12).toString('base64url');
}

/** `<requestId>.link` and `<requestId>.code`, which is how one email burns both. */
export function linkRowId(requestId: string): string {
  return `${requestId}.link`;
}
export function codeRowId(requestId: string): string {
  return `${requestId}.code`;
}

/**
 * The request a token row belongs to.
 *
 * Returns null on a row id that does not follow the rule, rather than guessing.
 * A guess here would burn a token row belonging to a different founder.
 */
export function requestIdOf(rowId: string): string | null {
  const dot = rowId.lastIndexOf('.');
  if (dot <= 0) return null;
  const suffix = rowId.slice(dot + 1);
  if (suffix !== 'link' && suffix !== 'code') return null;
  return rowId.slice(0, dot);
}
