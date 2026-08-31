/**
 * src/server/routes/test-fixtures.ts
 *
 * WHAT THIS IS. An AppStore held in Maps, a clock whose timers fire on demand,
 * a queue three methods long, and one function that stands up the whole HTTP
 * surface against all of them.
 *
 * WHY IT EXISTS. There is no Postgres here and there will not be one in CI
 * before the freeze, and the properties that have to be proved are properties
 * of the routes: a session reaches only the founder row it belongs to, a
 * stranger with the URL reaches nothing, a double sent message is stored once,
 * and a queued founder is given a number. Every one of those is a test that has
 * to run on a laptop.
 *
 * IT COPIES THE DATABASE WHERE THE DATABASE IS THE POINT. The unique index on
 * (thread_id, client_msg_id) is implemented here, because a fixture that let a
 * duplicate through would prove the opposite of what the test claims.
 * `appendTurnEvent` hands out increasing ids, because those ids are the SSE
 * `id:` field and replay depends on their order.
 *
 * AND IT SIGNS IN THROUGH THE REAL FRONT DOOR. `signIn` posts the passphrase to
 * `/auth/signin` exactly as the browser posts it, so every test below runs
 * against the door a founder actually opens. A fixture that wrote a session row
 * and handed back a cookie would keep passing on the day the door stops working.
 *
 * WHAT CALLS IT. The tests in this folder.
 * WHAT IT READS AND WRITES. Its own Maps. Nothing on disk, nothing over a socket.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import { createAuth } from '../auth/plugin.ts';
import {
  FOUNDER_A,
  MemoryAuthStore,
  RecordingSleep,
  TEST_PASSPHRASE,
  TestLogger,
  seededStore,
} from '../auth/test-fixtures.ts';
import { OWNER_ROW_KEY } from '../auth/types.ts';
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
  /** Sealed credentials, kept apart from the row exactly as the columns are. */
  readonly secrets = new Map<string, { ciphertext: Uint8Array; nonce: Uint8Array }>();
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

  connectionAccountsFor(founderId: string, vendor: string): Promise<string | null> {
    return Promise.resolve(this.connections.get(`${founderId}\u0000${vendor}`)?.accounts ?? null);
  }

  connectionSecretFor(
    founderId: string,
    vendor: string,
  ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array } | null> {
    return Promise.resolve(this.secrets.get(`${founderId}\u0000${vendor}`) ?? null);
  }

  /** Seed a sealed credential, for a test about reading one back. */
  setConnectionSecret(founderId: string, vendor: string, ciphertext: Uint8Array, nonce: Uint8Array): void {
    this.secrets.set(`${founderId}\u0000${vendor}`, { ciphertext, nonce });
  }

  locationIdFor(founderId: string, vendor: string): Promise<string | null> {
    return Promise.resolve(this.connections.get(`${founderId}\u0000${vendor}`)?.locationId ?? null);
  }

  /**
   * Seed what a successful check would have written, without running one.
   *
   * The real write goes through `saveGhlToken`, which encrypts and needs a master key.
   * A route test about reading accounts back should not have to stand that up, and a
   * fixture that could only be filled by the thing under test would be circular.
   */
  setConnectionAccounts(founderId: string, vendor: string, accounts: string): void {
    const key = `${founderId}\u0000${vendor}`;
    const existing = this.connections.get(key);
    if (existing === undefined) throw new Error('seed a connection before its accounts');
    this.connections.set(key, { ...existing, accounts, status: 'connected' });
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
      accounts: existing?.accounts ?? null,
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
  clock: TestClock;
  log: TestLogger;
  bus: TurnEventBus;
  events: TurnEvents;
  queue: TestQueue;
  routes: RegisteredRoutes;
  deps: RouteDeps;
  /**
   * Every route this instance registered, read off it rather than written down.
   *
   * WHY A TEST NEEDS THE LIVE TABLE. "No route is reachable without a session"
   * is only worth asserting over ALL of them, and a hand written list is a list
   * somebody forgets to add to. The forgetting looks exactly like the bug: a
   * route added on the Tuesday, open to whoever finds the URL, with a green
   * suite. Read here, a route added next week is walked the moment it exists.
   */
  routeTable: readonly { readonly method: string; readonly url: string }[];
  /** The passphrase this deployment was built with, for a test that types a wrong one. */
  passphrase: string;
  /**
   * Sign the owner in the way a browser does, and get their cookie header back.
   *
   * IT POSTS THE FORM. There is one way into this app and this is it, so every
   * test below is driven through the door a founder opens rather than past it.
   */
  signIn(): Promise<string>;
  /**
   * A cookie that resolves to some other founder row.
   *
   * WHY A FIXTURE NEEDS THIS AT ALL WHEN THE APP HAS ONE FOUNDER. Every route
   * in this folder is founder scoped, and the scoping is one `where founder_id`
   * away from being deleted at any time. A single tenant deployment is exactly
   * where somebody removes that filter as unnecessary, and no test that only
   * ever holds the owner's cookie would notice. So the tenancy tests hold a
   * session belonging to a different row and must still reach nothing.
   *
   * THE COOKIE IS REAL, AND THAT IS THE POINT OF DOING IT THIS WAY. It is
   * minted by the sign in route, through the same derivation as any other, and
   * only the row it points at is moved. Nothing here re-implements how a cookie
   * becomes a session id, so this cannot drift away from the real one and go on
   * passing.
   */
  sessionFor(founderId: string): Promise<string>;
}

export interface HarnessOptions {
  readonly run?: RunTurn;
  readonly queue?: TestQueue;
  /**
   * The owner's track. B2B unless a test says otherwise, and `null` for a
   * founder who has not run the Founder Brain yet.
   *
   * ONE FOUNDER OWNS ONE DEPLOYMENT, so the other track is not another person
   * to sign in as: it is another deployment. Building the harness with the
   * track set is what makes a B2C test a test of a B2C founder's own app.
   */
  readonly track?: 'b2b' | 'b2c' | null;
}

export async function buildHarness(options: HarnessOptions = {}): Promise<Harness> {
  const authStore = seededStore();
  if (options.track !== undefined) {
    // The owner row, re-stated with the track this test is about. Keyed on the
    // same id and the same OWNER_ROW_KEY, so `ensureOwner` still finds one owner
    // and the sign in below lands on this row rather than claiming a new one.
    authStore.addFounder({
      id: FOUNDER_A,
      email: OWNER_ROW_KEY,
      displayName: 'Ama Boateng',
      timezone: 'America/New_York',
      track: options.track,
    });
  }
  const store = new MemoryAppStore(authStore);
  const clock = new TestClock();
  const log = new TestLogger();
  const bus = new TurnEventBus();
  const events = new TurnEvents(store, bus, clock);
  const queue = options.queue ?? new TestQueue();

  const app = Fastify({ logger: false });

  // Before anything is registered, because onRoute only sees what comes after it.
  const routeTable: { method: string; url: string }[] = [];
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routeTable.push({ method, url: route.url });
  });

  const { register: registerAuth, context } = createAuth({
    store: authStore,
    // The auth clock takes no timers, so the route clock satisfies it.
    clock: { now: () => clock.now() },
    log,
    passphrase: TEST_PASSPHRASE,
    // secure: false, because a test client does not speak https and a Secure
    // cookie would never come back. env.ts forces https in prod, where it matters.
    cookie: { name: 'lh_session', ttlDays: 90, secure: false },
    // Records instead of waiting. A wrong passphrase is deliberately slowed
    // down, and a suite that actually waited for it is a suite somebody deletes.
    sleep: new RecordingSleep().fn,
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

  async function signIn(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signin',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ passphrase: TEST_PASSPHRASE }).toString(),
    });
    // 303 so the browser follows with a GET. Anything else is the door itself
    // being broken, and a harness that carried on would report that as a
    // failure in whatever route the test was actually about.
    if (res.statusCode !== 303) throw new Error(`sign in failed: ${String(res.statusCode)}`);
    const cookie = res.cookies.find((c) => c.name === 'lh_session');
    if (cookie === undefined) throw new Error('sign in set no session cookie');
    return `lh_session=${cookie.value}`;
  }

  async function sessionFor(founderId: string): Promise<string> {
    const before = new Set(authStore.sessions.keys());
    const cookie = await signIn();
    const id = [...authStore.sessions.keys()].find((key) => !before.has(key));
    if (id === undefined) throw new Error('sign in wrote no session row');
    const row = authStore.sessions.get(id);
    if (row === undefined) throw new Error('the session row went missing');
    // Only the owner of the row moves. The cookie, the derivation and the expiry
    // are all the ones the sign in route made.
    authStore.sessions.set(id, { ...row, founderId });
    return cookie;
  }

  return {
    app,
    store,
    auth: authStore,
    clock,
    log,
    bus,
    events,
    queue,
    routes,
    deps,
    routeTable,
    passphrase: TEST_PASSPHRASE,
    signIn,
    sessionFor,
  };
}
