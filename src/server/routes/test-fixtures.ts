/**
 * src/server/routes/test-fixtures.ts
 *
 * WHAT THIS IS. An AppStore held in Maps, a clock whose timers fire on demand,
 * a queue three methods long, and one function that stands up the whole HTTP
 * surface against all of them.
 *
 * WHY IT EXISTS. There is no Postgres here and there will not be one in CI
 * before the freeze, and the properties that have to be proved are properties
 * of the routes: two founders each see only their own workspace, an address
 * that is not on the roster is refused, a double sent message is stored once,
 * and a queued founder is given a number. Every one of those is a test that has
 * to run on a laptop.
 *
 * IT COPIES THE DATABASE WHERE THE DATABASE IS THE POINT. The unique index on
 * (thread_id, client_msg_id) is implemented here, because a fixture that let a
 * duplicate through would prove the opposite of what the test claims.
 * `appendTurnEvent` hands out increasing ids, because those ids are the SSE
 * `id:` field and replay depends on their order.
 *
 * WHAT CALLS IT. The tests in this folder.
 * WHAT IT READS AND WRITES. Its own Maps. Nothing on disk, nothing over a socket.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import { createAuth } from '../auth/plugin.ts';
import { CollectingMailer } from '../auth/mailer.ts';
import { DEFAULT_RATE_LIMIT } from '../auth/rate-limit.ts';
import { MemoryAuthStore, TestLogger, seededStore } from '../auth/test-fixtures.ts';
import { TurnEventBus, TurnEvents } from './events.ts';
import { registerApiRoutes, type RegisteredRoutes } from './index.ts';
import { QueueTurnExecutor, type RunTurn } from './turn-executor.ts';
import type { QueueLike, RouteDeps } from './deps.ts';
import type {
  Accepted,
  AcceptMessageInput,
  AppStore,
  Clock,
  ConnectionRow,
  FileRow,
  IdSource,
  MessageRow,
  NewThread,
  SetupStepRow,
  SetupStepWrite,
  ThreadRow,
  TurnEventRow,
  TurnJob,
  TurnRow,
  TurnStatus,
} from './ports.ts';

export { TestLogger } from '../auth/test-fixtures.ts';

/** A clock whose interval callbacks run when a test says so, never on a timer. */
export class TestClock implements Clock {
  readonly intervals: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];

  constructor(private at: Date = new Date('2026-09-25T13:00:00.000Z')) {}

  now(): Date {
    return new Date(this.at.getTime());
  }
  advance(ms: number): void {
    this.at = new Date(this.at.getTime() + ms);
  }
  setInterval(fn: () => void, ms: number): { cancel(): void } {
    const entry = { fn, ms, cancelled: false };
    this.intervals.push(entry);
    return {
      cancel: () => {
        entry.cancelled = true;
      },
    };
  }
  /** Fire every live interval once. What a heartbeat looks like without waiting for one. */
  tick(): void {
    for (const i of this.intervals) if (!i.cancelled) i.fn();
  }
}

export class TestIds implements IdSource {
  private n = 0;
  thread(): string {
    this.n += 1;
    return `th_${String(this.n)}`;
  }
  message(): string {
    this.n += 1;
    return `ms_${String(this.n)}`;
  }
  turn(): string {
    this.n += 1;
    return `tn_${String(this.n)}`;
  }
}

export class MemoryAppStore implements AppStore {
  readonly threads = new Map<string, ThreadRow>();
  readonly steps = new Map<string, SetupStepRow>();
  readonly connections = new Map<string, ConnectionRow>();
  readonly messages: MessageRow[] = [];
  readonly turns = new Map<string, TurnRow>();
  readonly events: TurnEventRow[] = [];
  readonly files = new Map<string, Map<string, { row: FileRow; bytes: Buffer }>>();
  private nextEventId = 1;

  /**
   * The founder rows and the sessions live in the AuthStore, and in production
   * both stores are one Postgres.
   *
   * WITHOUT THIS LINK THE SIGN OUT TEST WOULD PROVE NOTHING. A fixture where
   * revoking a session writes into a Map nobody reads passes whatever the route
   * does, including doing nothing at all. Handed the real auth store, the
   * revoke lands where `readSession` looks, so the assertion that the next
   * request is 401 is an assertion about behaviour rather than about a Map.
   */
  constructor(private readonly linked: MemoryAuthStore | null = null) {}

  // ------------------------------------------------------------- threads

  listThreads(founderId: string): Promise<readonly ThreadRow[]> {
    return Promise.resolve([...this.threads.values()].filter((t) => t.founderId === founderId));
  }

  findThread(founderId: string, threadId: string): Promise<ThreadRow | null> {
    const row = this.threads.get(threadId);
    // Founder scoped, exactly as the SQL is. A thread belonging to somebody
    // else is not found, and it is not "found but refused".
    return Promise.resolve(row !== undefined && row.founderId === founderId ? row : null);
  }

  createThread(input: NewThread): Promise<ThreadRow> {
    const row: ThreadRow = {
      id: input.id,
      founderId: input.founderId,
      routeId: input.routeId,
      title: input.title,
      sdkSessionId: null,
      createdAt: input.at,
      lastTurnAt: null,
      closedAt: null,
    };
    this.threads.set(row.id, row);
    return Promise.resolve(row);
  }

  closeThread(threadId: string, at: Date): void {
    const row = this.threads.get(threadId);
    if (row !== undefined) this.threads.set(threadId, { ...row, closedAt: at });
  }

  listMessages(founderId: string, threadId: string, limit: number): Promise<readonly MessageRow[]> {
    return Promise.resolve(
      this.messages.filter((m) => m.founderId === founderId && m.threadId === threadId).slice(0, limit),
    );
  }

  // ------------------------------------------------------------- the accept

  acceptMessage(input: AcceptMessageInput): Promise<Accepted> {
    if (input.clientMsgId !== null) {
      // The unique index on (thread_id, client_msg_id). A retry after a dropped
      // connection writes nothing and is handed the turn it already has.
      const existing = this.messages.find(
        (m) => m.threadId === input.threadId && m.clientMsgId === input.clientMsgId,
      );
      if (existing !== undefined) {
        const turn = [...this.turns.values()].find((t) => t.messageId === existing.id);
        return Promise.resolve({
          turnId: turn?.id ?? '',
          messageId: existing.id,
          priority: turn?.priority ?? 'normal',
          duplicate: true,
        });
      }
    }

    const message: MessageRow = {
      id: input.messageId,
      threadId: input.threadId,
      founderId: input.founderId,
      role: 'founder',
      text: input.text,
      clientMsgId: input.clientMsgId,
      createdAt: input.at,
    };
    this.messages.push(message);

    // High is the next turn of a thread that already has turns, meaning
    // somebody mid interview. Normal is the first turn of a new thread.
    const already = [...this.turns.values()].some((t) => t.threadId === input.threadId);
    const turn: TurnRow = {
      id: input.turnId,
      threadId: input.threadId,
      founderId: input.founderId,
      messageId: message.id,
      status: 'queued',
      priority: already ? 'high' : 'normal',
      createdAt: input.at,
    };
    this.turns.set(turn.id, turn);
    return Promise.resolve({ turnId: turn.id, messageId: message.id, priority: turn.priority, duplicate: false });
  }

  findTurn(founderId: string, turnId: string): Promise<TurnRow | null> {
    const row = this.turns.get(turnId);
    return Promise.resolve(row !== undefined && row.founderId === founderId ? row : null);
  }

  findActiveTurn(founderId: string, threadId: string): Promise<TurnRow | null> {
    const live = [...this.turns.values()]
      .filter(
        (t) =>
          t.founderId === founderId &&
          t.threadId === threadId &&
          (t.status === 'queued' || t.status === 'running'),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(live[0] ?? null);
  }

  lastEventIdFor(founderId: string, threadId: string, exceptTurnId: string | null): Promise<number | null> {
    const ids = this.events
      .filter(
        (e) => e.founderId === founderId && e.threadId === threadId && e.turnId !== exceptTurnId,
      )
      .map((e) => e.id);
    return Promise.resolve(ids.length === 0 ? null : Math.max(...ids));
  }

  setTurnStatus(turnId: string, status: TurnStatus, _at: Date): Promise<void> {
    const row = this.turns.get(turnId);
    if (row !== undefined) this.turns.set(turnId, { ...row, status });
    return Promise.resolve();
  }

  queuedTurns(limit: number): Promise<readonly TurnJob[]> {
    return Promise.resolve(
      [...this.turns.values()]
        .filter((t) => t.status === 'queued')
        .slice(0, limit)
        .map((t) => ({
          turnId: t.id,
          threadId: t.threadId,
          founderId: t.founderId,
          routeId: this.threads.get(t.threadId)?.routeId ?? 'founder-brain',
          priority: t.priority,
          text: this.messages.find((m) => m.id === t.messageId)?.text ?? '',
        })),
    );
  }

  // ------------------------------------------------------------- events

  appendTurnEvent(row: Omit<TurnEventRow, 'id' | 'at'> & { at: Date }): Promise<TurnEventRow> {
    const full: TurnEventRow = { ...row, id: this.nextEventId };
    this.nextEventId += 1;
    this.events.push(full);
    return Promise.resolve(full);
  }

  eventsSince(founderId: string, threadId: string, afterId: number, limit: number): Promise<readonly TurnEventRow[]> {
    return Promise.resolve(
      this.events
        .filter((e) => e.founderId === founderId && e.threadId === threadId && e.id > afterId)
        .slice(0, limit),
    );
  }

  // ------------------------------------------------------- setup and profile

  saveProfile(founderId: string, displayName: string, timezone: string): Promise<void> {
    const row = this.linked?.founders.get(founderId);
    if (row !== undefined) this.linked?.founders.set(founderId, { ...row, displayName, timezone });
    return Promise.resolve();
  }

  listSetupSteps(founderId: string): Promise<readonly SetupStepRow[]> {
    return Promise.resolve(
      [...this.steps.entries()]
        .filter(([key]) => key.startsWith(`${founderId}\u0000`))
        .map(([, row]) => row)
        .sort((a, b) => a.stepId.localeCompare(b.stepId)),
    );
  }

  recordSetupStep(input: SetupStepWrite): Promise<void> {
    // The composite primary key, copied. A fixture that grew a second row per
    // step would hide the upsert being wrong, and the walk writes on entering
    // a step, so it runs far more often than it changes anything.
    this.steps.set(`${input.founderId}\u0000${input.stepId}`, {
      stepId: input.stepId,
      state: input.state,
      detail: input.detail,
      updatedAt: input.at,
    });
    return Promise.resolve();
  }

  findConnection(founderId: string, vendor: string): Promise<ConnectionRow | null> {
    return Promise.resolve(this.connections.get(`${founderId}\u0000${vendor}`) ?? null);
  }

  saveLocationId(founderId: string, vendor: string, locationId: string, at: Date): Promise<void> {
    const key = `${founderId}\u0000${vendor}`;
    const existing = this.connections.get(key);
    this.connections.set(key, {
      vendor,
      locationId,
      status: existing?.status ?? 'unverified',
      createdAt: existing?.createdAt ?? at,
      verifiedAt: existing?.verifiedAt ?? null,
      purgedAt: existing?.purgedAt ?? null,
    });
    return Promise.resolve();
  }

  forgetConnection(founderId: string, vendor: string, at: Date): Promise<void> {
    const key = `${founderId}\u0000${vendor}`;
    const existing = this.connections.get(key);
    if (existing !== undefined) {
      this.connections.set(key, { ...existing, status: 'purged', verifiedAt: null, purgedAt: at });
    }
    return Promise.resolve();
  }

  revokeSession(sessionId: string, at: Date): Promise<void> {
    return this.linked === null ? Promise.resolve() : this.linked.revokeSession(sessionId, at);
  }

  // ------------------------------------------------------------- files

  putFile(founderId: string, path: string, text: string, version = 1): void {
    const bytes = Buffer.from(text, 'utf8');
    const forFounder = this.files.get(founderId) ?? new Map<string, { row: FileRow; bytes: Buffer }>();
    forFounder.set(path, {
      row: {
        path,
        blobSha: 'f'.repeat(64),
        sizeBytes: bytes.length,
        mtime: new Date('2026-09-25T12:00:00.000Z'),
        version,
      },
      bytes,
    });
    this.files.set(founderId, forFounder);
  }

  listFiles(founderId: string): Promise<readonly FileRow[]> {
    const forFounder = this.files.get(founderId);
    if (forFounder === undefined) return Promise.resolve([]);
    return Promise.resolve([...forFounder.values()].map((f) => f.row).sort((a, b) => a.path.localeCompare(b.path)));
  }

  readFile(founderId: string, path: string): Promise<{ row: FileRow; bytes: Buffer } | null> {
    return Promise.resolve(this.files.get(founderId)?.get(path) ?? null);
  }

  readAllFiles(founderId: string): Promise<readonly { row: FileRow; bytes: Buffer }[]> {
    const forFounder = this.files.get(founderId);
    if (forFounder === undefined) return Promise.resolve([]);
    return Promise.resolve([...forFounder.values()].sort((a, b) => a.row.path.localeCompare(b.row.path)));
  }
}

/**
 * A queue that runs everything at once unless a test says otherwise.
 *
 * `capacity` is what makes the queued position testable: set it to zero and
 * every turn waits, which is the 65 founders told "now run the Founder Brain"
 * at the same minute, without 65 subprocesses.
 */
export class TestQueue implements QueueLike {
  refusal: { code: string; reason: string } | null = null;
  readonly pending: Array<{ turnId: string; run: () => Promise<void>; onQueued: (n: { position: number; text: string }) => void }> = [];
  running = 0;

  constructor(private capacity = 8) {}

  admit(): Promise<{ ok: true } | { ok: false; code: string; reason: string }> {
    if (this.refusal !== null) return Promise.resolve({ ok: false, ...this.refusal });
    return Promise.resolve({ ok: true });
  }

  enqueue(item: {
    turnId: string;
    founderId: string;
    threadId: string;
    priority: 'high' | 'normal';
    run: () => Promise<void>;
    onQueued: (notice: { position: number; text: string }) => void;
  }): void {
    if (this.running < this.capacity) {
      this.running += 1;
      void item.run().finally(() => {
        this.running -= 1;
      });
      return;
    }
    this.pending.push(item);
    // The real queue writes this sentence, with a measured time in it. The
    // fixture only needs a number and a string, and it deliberately does not
    // copy the real wording so nobody reads this as the founder facing text.
    item.onQueued({ position: this.pending.length, text: `place ${String(this.pending.length)} in line` });
  }

  cancel(turnId: string): boolean {
    const at = this.pending.findIndex((i) => i.turnId === turnId);
    if (at === -1) return false;
    this.pending.splice(at, 1);
    return true;
  }

  stats(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.pending.length };
  }
}

export interface Harness {
  app: FastifyInstance;
  store: MemoryAppStore;
  auth: MemoryAuthStore;
  mailer: CollectingMailer;
  clock: TestClock;
  log: TestLogger;
  bus: TurnEventBus;
  events: TurnEvents;
  queue: TestQueue;
  routes: RegisteredRoutes;
  deps: RouteDeps;
  /** Sign a founder in the way a browser does, and get their cookie back. */
  signIn(email: string): Promise<string>;
}

export interface HarnessOptions {
  readonly run?: RunTurn;
  readonly queue?: TestQueue;
}

export async function buildHarness(options: HarnessOptions = {}): Promise<Harness> {
  const authStore = seededStore();
  const store = new MemoryAppStore(authStore);
  const clock = new TestClock();
  const log = new TestLogger();
  const mailer = new CollectingMailer();
  const bus = new TurnEventBus();
  const events = new TurnEvents(store, bus, clock);
  const queue = options.queue ?? new TestQueue();

  const app = Fastify({ logger: false });

  const { register: registerAuth, context } = createAuth({
    store: authStore,
    mailer,
    // The auth clock takes no timers, so the route clock satisfies it.
    clock: { now: () => clock.now() },
    log,
    // secure: false, because a test client does not speak https and a Secure
    // cookie would never come back. env.ts forces https in prod, where it matters.
    session: { cookieName: 'lh_session', ttlDays: 90, secure: false },
    magicLink: {
      appBaseUrl: 'http://localhost:5000',
      tokenTtlMinutes: 30,
      mentorCodeTtlMinutes: 10,
      session: { cookieName: 'lh_session', ttlDays: 90, secure: false },
    },
    rateLimit: DEFAULT_RATE_LIMIT,
    cookieSecret: 'test-cookie-secret-not-used-for-anything',
  });
  await registerAuth(app);

  const executor = new QueueTurnExecutor(
    queue,
    events,
    store,
    clock,
    log,
    options.run ?? (() => Promise.resolve()),
  );

  const deps: RouteDeps = {
    store,
    auth: context,
    events,
    bus,
    executor,
    clock,
    log,
    ids: new TestIds(),
    heartbeatMs: 15_000,
    maxMessageBytes: 50_000,
  };
  const routes = await registerApiRoutes(app, deps);
  await app.ready();

  async function signIn(email: string): Promise<string> {
    const requested = await app.inject({
      method: 'POST',
      url: '/auth/request',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ email }).toString(),
    });
    if (requested.statusCode !== 200) throw new Error(`sign in request failed: ${String(requested.statusCode)}`);

    const body = mailer.last()?.text ?? '';
    const url = /https?:\/\/\S+/.exec(body)?.[0] ?? '';
    const token = new URL(url).searchParams.get('t') ?? '';

    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ t: token }).toString(),
    });
    const cookie = verified.cookies.find((c) => c.name === 'lh_session');
    if (cookie === undefined) throw new Error('no session cookie was set');
    return `lh_session=${cookie.value}`;
  }

  return { app, store, auth: authStore, mailer, clock, log, bus, events, queue, routes, deps, signIn };
}
