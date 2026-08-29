/**
 * src/server/auth/test-fixtures.ts
 *
 * WHAT THIS IS. An AuthStore held in Maps, a clock that can be wound forward,
 * and a logger that collects instead of printing.
 *
 * WHY IT EXISTS. There is no Postgres on a laptop here, and there will not be
 * one in CI before the freeze. Sign in is the path every one of 130 founders
 * takes first, so it is the last path that may go untested. Everything in
 * ./types.ts is an interface for this reason, and this is the other
 * implementation.
 *
 * IT COPIES THE DATABASE'S BEHAVIOUR WHERE THAT BEHAVIOUR IS THE POINT.
 * `founder.email` is citext, so lookups here are case folded. `token_sha` is
 * unique, so a duplicate insert throws here too. `consumeSigninToken` is a
 * conditional update that returns whether this caller won, because the race
 * between two tabs is a real race and a fixture that lets both win would prove
 * the opposite of what the test claims.
 *
 * WHAT CALLS IT. The tests in this folder and in ../routes/.
 * WHAT IT READS AND WRITES. Its own Maps. Nothing on disk, nothing over a socket.
 */

import { requestIdOf } from './tokens.ts';
import type { AuthStore, Clock, FounderRow, Logger, SessionRow, SigninTokenRow } from './types.ts';

export class TestClock implements Clock {
  constructor(private at: Date = new Date('2026-09-25T13:00:00.000Z')) {}
  now(): Date {
    return new Date(this.at.getTime());
  }
  advance(ms: number): void {
    this.at = new Date(this.at.getTime() + ms);
  }
  set(at: Date): void {
    this.at = new Date(at.getTime());
  }
}

export interface LoggedLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly obj: Record<string, unknown>;
  readonly msg: string;
}

export class TestLogger implements Logger {
  readonly lines: LoggedLine[] = [];
  info(obj: Record<string, unknown>, msg: string): void {
    this.lines.push({ level: 'info', obj, msg });
  }
  warn(obj: Record<string, unknown>, msg: string): void {
    this.lines.push({ level: 'warn', obj, msg });
  }
  error(obj: Record<string, unknown>, msg: string): void {
    this.lines.push({ level: 'error', obj, msg });
  }
}

export interface MentorRequest {
  readonly email: string;
  readonly note: string;
  readonly at: Date;
}

export interface AuthEvent {
  readonly founderId: string;
  readonly actor: string;
  readonly verb: string;
  readonly subject: string | null;
  readonly at: Date;
}

export class MemoryAuthStore implements AuthStore {
  readonly founders = new Map<string, FounderRow>();
  readonly tokens = new Map<string, SigninTokenRow>();
  readonly sessions = new Map<string, SessionRow>();
  readonly mentorRequests: MentorRequest[] = [];
  readonly events: AuthEvent[] = [];

  addFounder(row: Partial<FounderRow> & { id: string; email: string }): FounderRow {
    const full: FounderRow = {
      displayName: null,
      timezone: 'America/New_York',
      track: null,
      disabledAt: null,
      deletedAt: null,
      ...row,
      email: row.email.toLowerCase(),
    };
    this.founders.set(full.id, full);
    return full;
  }

  findFounderByEmail(email: string): Promise<FounderRow | null> {
    const wanted = email.toLowerCase();
    for (const row of this.founders.values()) if (row.email === wanted) return Promise.resolve(row);
    return Promise.resolve(null);
  }

  findFounderById(id: string): Promise<FounderRow | null> {
    return Promise.resolve(this.founders.get(id) ?? null);
  }

  countSigninRequests(email: string, since: Date): Promise<number> {
    const wanted = email.toLowerCase();
    let n = 0;
    for (const row of this.tokens.values()) {
      // One request writes two rows, a link and a code. The limit counts
      // requests, so only one of the pair is counted, exactly as the SQL does.
      if (row.email === wanted && row.id.endsWith('.link') && row.createdAt >= since) n += 1;
    }
    return Promise.resolve(n);
  }

  insertSigninTokens(rows: readonly SigninTokenRow[]): Promise<void> {
    for (const row of rows) {
      for (const existing of this.tokens.values()) {
        if (existing.tokenSha === row.tokenSha) {
          // token_sha is unique in the schema. A fixture that swallowed this
          // would hide the collision the code hash is salted to prevent.
          throw new Error('duplicate token_sha');
        }
      }
      this.tokens.set(row.id, { ...row, email: row.email.toLowerCase() });
    }
    return Promise.resolve();
  }

  findSigninTokenBySha(tokenSha: string): Promise<SigninTokenRow | null> {
    for (const row of this.tokens.values()) if (row.tokenSha === tokenSha) return Promise.resolve(row);
    return Promise.resolve(null);
  }

  consumeSigninToken(id: string, at: Date): Promise<boolean> {
    const row = this.tokens.get(id);
    if (row === undefined || row.consumedAt !== null) return Promise.resolve(false);
    this.tokens.set(id, { ...row, consumedAt: at });
    return Promise.resolve(true);
  }

  burnSigninRequest(requestId: string, at: Date): Promise<void> {
    for (const [id, row] of this.tokens) {
      if (requestIdOf(id) === requestId && row.consumedAt === null) {
        this.tokens.set(id, { ...row, consumedAt: at });
      }
    }
    return Promise.resolve();
  }

  burnLiveTokensForEmail(email: string, at: Date): Promise<void> {
    const wanted = email.toLowerCase();
    for (const [id, row] of this.tokens) {
      if (row.email === wanted && row.consumedAt === null) this.tokens.set(id, { ...row, consumedAt: at });
    }
    return Promise.resolve();
  }

  insertSession(row: SessionRow): Promise<void> {
    this.sessions.set(row.id, row);
    return Promise.resolve();
  }

  findSession(id: string): Promise<SessionRow | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    const row = this.sessions.get(id);
    if (row !== undefined) this.sessions.set(id, { ...row, lastSeenAt, expiresAt });
    return Promise.resolve();
  }

  revokeSession(id: string, at: Date): Promise<void> {
    const row = this.sessions.get(id);
    if (row !== undefined) this.sessions.set(id, { ...row, revokedAt: at });
    return Promise.resolve();
  }

  recordMentorRequest(email: string, note: string, at: Date): Promise<void> {
    this.mentorRequests.push({ email, note, at });
    return Promise.resolve();
  }

  recordAuthEvent(founderId: string, actor: string, verb: string, subject: string | null, at: Date): Promise<void> {
    this.events.push({ founderId, actor, verb, subject, at });
    return Promise.resolve();
  }
}

/** Two founders, ULID shaped ids, because storage/paths.ts refuses anything else. */
export const FOUNDER_A = '01J0AAAAAAAAAAAAAAAAAAAAAA';
export const FOUNDER_B = '01J0BBBBBBBBBBBBBBBBBBBBBB';

export function seededStore(): MemoryAuthStore {
  const store = new MemoryAuthStore();
  store.addFounder({ id: FOUNDER_A, email: 'ama@example.com', displayName: 'Ama Boateng', track: 'b2b' });
  store.addFounder({ id: FOUNDER_B, email: 'ben@example.com', displayName: 'Ben Ortiz', track: 'b2c' });
  return store;
}

/** Pull the link and the code out of what the mailer collected. */
export function readSignInEmail(text: string): { url: string; code: string } {
  const url = /https?:\/\/\S+/.exec(text)?.[0] ?? '';
  const code = /^ {4}(\d{6})$/m.exec(text)?.[1] ?? '';
  return { url, code };
}

/** The token from a verify URL, decoded exactly as the route would decode it. */
export function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('t') ?? '';
}
