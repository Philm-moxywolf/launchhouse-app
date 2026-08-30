/**
 * src/server/auth/test-fixtures.ts
 *
 * WHAT THIS IS. An AuthStore held in Maps, a clock that can be wound forward, a
 * wait that records instead of waiting, and a logger that collects instead of
 * printing.
 *
 * WHY IT EXISTS. There is no Postgres on a laptop here, and there will not be
 * one in CI before the freeze. Sign in is the first thing the founder does with
 * their own deployment, in a staffed room, so it is the last path that may go
 * untested. Everything in ./types.ts is an interface for this reason, and this
 * is the other implementation.
 *
 * IT COPIES THE DATABASE'S BEHAVIOUR WHERE THAT BEHAVIOUR IS THE POINT. The
 * owner row is keyed on `founder.email`, which is unique in the schema, so
 * `ensureOwner` here refuses a second insert exactly as Postgres does. A
 * fixture that let two callers each create an owner would prove the opposite of
 * what the test claims.
 *
 * THE SLEEP RECORDS RATHER THAN SLEEPS. ./owner.ts slows a wrong passphrase
 * down deliberately, and a test that proved that by waiting two seconds is a
 * test somebody deletes. `RecordingSleep` remembers what it was asked for, so
 * the guard can be shown to fire before it is trusted to fire.
 *
 * WHAT CALLS IT. The tests in this folder and in ../routes/.
 * WHAT IT READS AND WRITES. Its own Maps. Nothing on disk, nothing over a socket.
 */

import { OWNER_ROW_KEY, type AuthStore, type Clock, type FounderRow, type Logger, type SessionRow } from './types.ts';

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

/** Every wait that was asked for, in order, in milliseconds. Nothing actually waits. */
export class RecordingSleep {
  readonly waits: number[] = [];
  readonly fn = (ms: number): Promise<void> => {
    this.waits.push(ms);
    return Promise.resolve();
  };
  get total(): number {
    return this.waits.reduce((a, b) => a + b, 0);
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

export interface AuthEvent {
  readonly founderId: string;
  readonly actor: string;
  readonly verb: string;
  readonly subject: string | null;
  readonly at: Date;
}

export class MemoryAuthStore implements AuthStore {
  readonly founders = new Map<string, FounderRow>();
  readonly sessions = new Map<string, SessionRow>();
  readonly events: AuthEvent[] = [];

  addFounder(row: Partial<FounderRow> & { id: string; email: string }): FounderRow {
    const full: FounderRow = {
      displayName: null,
      timezone: 'UTC',
      track: null,
      disabledAt: null,
      deletedAt: null,
      ...row,
      email: row.email.toLowerCase(),
    };
    this.founders.set(full.id, full);
    return full;
  }

  ensureOwner(candidate: FounderRow): Promise<FounderRow> {
    const existing = this.ownerRow();
    // `founder.email` is unique in the schema and the owner row always carries
    // the same word, so a second claim inserts nothing and reads back the first.
    if (existing !== null) return Promise.resolve(existing);
    return Promise.resolve(this.addFounder({ ...candidate, email: OWNER_ROW_KEY }));
  }

  findOwner(): Promise<FounderRow | null> {
    return Promise.resolve(this.ownerRow());
  }

  findFounderById(id: string): Promise<FounderRow | null> {
    return Promise.resolve(this.founders.get(id) ?? null);
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

  countAuthEvents(founderId: string, verb: string, since: Date): Promise<number> {
    let n = 0;
    for (const e of this.events) {
      if (e.founderId === founderId && e.verb === verb && e.at.getTime() >= since.getTime()) n += 1;
    }
    return Promise.resolve(n);
  }

  recordAuthEvent(founderId: string, actor: string, verb: string, subject: string | null, at: Date): Promise<void> {
    this.events.push({ founderId, actor, verb, subject, at });
    return Promise.resolve();
  }

  private ownerRow(): FounderRow | null {
    for (const row of this.founders.values()) if (row.email === OWNER_ROW_KEY) return row;
    return null;
  }
}

/**
 * Two ids, ULID shaped, because storage/paths.ts refuses anything else.
 *
 * FOUNDER_B IS KEPT EVEN THOUGH THIS APP HAS ONE FOUNDER. The tenancy tests in
 * ../routes/ use it to prove that a request holding one founder's session
 * cannot reach another founder's files. That property is currently unnecessary,
 * because there is only ever one row, and it is exactly the kind of check
 * somebody removes as dead and then needs. A second id costs one line.
 */
export const FOUNDER_A = '01J0AAAAAAAAAAAAAAAAAAAAAA';
export const FOUNDER_B = '01J0BBBBBBBBBBBBBBBBBBBBBB';

/**
 * A store where the deployment has already been claimed, which is the state
 * almost every test wants to start in.
 *
 * FOUNDER_A is the owner. FOUNDER_B is a row that exists only so the tenancy
 * tests have somebody else's id to be refused.
 */
export function seededStore(): MemoryAuthStore {
  const store = new MemoryAuthStore();
  store.addFounder({ id: FOUNDER_A, email: OWNER_ROW_KEY, displayName: 'Ama Boateng', timezone: 'America/New_York', track: 'b2b' });
  store.addFounder({ id: FOUNDER_B, email: 'not-the-owner', displayName: 'Ben Ortiz', timezone: 'America/New_York', track: 'b2c' });
  return store;
}

/**
 * A passphrase that passes ./owner.ts readiness, for tests that need a real one
 * rather than a placeholder. Written once so a change to the floor does not
 * quietly turn a dozen tests into tests of the refusal path.
 */
export const TEST_PASSPHRASE = 'the shed on wolf lane';
