/**
 * src/server/auth/tokens.ts
 *
 * WHAT THIS IS. The three pieces of arithmetic sign in does on a secret: make
 * one, hash one, and compare two without leaking how much of one matched.
 *
 * WHY IT EXISTS. Three failures, all of them quiet.
 *
 *   A predictable session cookie is somebody else's workspace. Math.random is
 *   seeded from the clock, so the only acceptable source is randomBytes.
 *
 *   A session row stored as the cookie itself means a database dump is a live
 *   session. Hashing costs one sha256 per request and removes that entirely.
 *
 *   A comparison with === on a secret leaks its prefix through timing. Against
 *   a passphrase typed by a founder that is a real leak: an attacker who can
 *   learn the first character can learn the second.
 *
 * WHAT WENT, AND WHY. `newCode`, `normaliseCode`, `newRequestId`, `linkRowId`,
 * `codeRowId` and `requestIdOf` were the six digit code and the two row ids of
 * one magic link email. There is no email and there are no tokens now, so they
 * are deleted rather than kept for a caller that no longer exists.
 *
 * WHAT CALLS IT. ./session.ts, ./owner.ts, ./store-pg.ts, and
 * ../routes/errors.ts through ./pages.ts.
 *
 * WHAT IT READS AND WRITES. Nothing. Pure, apart from the random source.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes, base64url. What goes in the session cookie. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Sha256, hex, lower case. 64 characters, which is what `char(64)` in the
 * schema is sized for.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
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
