/**
 * src/web/lib/api.ts
 *
 * WHAT IT IS
 * Every call the browser makes to our own server, and the shape of every answer. One file.
 *
 * WHY IT EXISTS
 * Three failures.
 *
 * The first is a screen that lies. `fetch` rejects on a dropped connection and resolves on
 * a 500, so the naive version of this code shows a founder a spinner forever when the
 * server said no. Every function here returns an answer or a problem, never a throw, and
 * every problem carries a sentence a non technical person can act on. That is what makes
 * "never a spinner with no explanation" enforceable rather than a good intention.
 *
 * The second is drift between the two halves of the app, which are being written at the
 * same time by different people. The routes this file names are the contract. Where
 * `planning/REPLIT-BUILD.md` names a path, the path here is that one and the section is
 * cited. Where it does not, the name is ours and is marked ASSUMED, so a mismatch is found
 * by reading one file rather than by a founder pressing a button.
 *
 * The third is failing open. A route that does not exist yet answers 404, and a 404 here
 * becomes `not_built_yet`, which the screens render as a plain sentence saying that part is
 * not connected. It never becomes an empty list that reads as "you have no files".
 *
 * WHAT CALLS IT
 * Every screen in src/web/routes and nothing else. Components take data as props.
 *
 * WHAT IT READS AND WRITES
 * Reads and writes the app's own HTTP API on the same origin. It holds no state and no
 * credential: the session is an HttpOnly cookie the browser attaches by itself, which is
 * why no token is ever in JavaScript reach on this side.
 */

import type { Track } from "../../../app/content/routes.ts";
import type { GhlScope } from "../../../app/content/scopes.ts";
import type { StepState } from "../../../app/content/ghl-walk.ts";

// ---------------------------------------------------------------------------------------
// The result type. Nothing here throws.
// ---------------------------------------------------------------------------------------

/** Why a call did not produce an answer. The kind decides the screen, the text is read. */
export type ProblemKind =
  | "offline"
  | "signed_out"
  | "not_built_yet"
  | "refused"
  | "too_many"
  | "server";

export interface Problem {
  readonly kind: ProblemKind;
  /** What the founder reads. Short, no status code on its own, ends on an action. */
  readonly text: string;
  /** The HTTP status, for the mentor board and the logs. Never rendered on its own. */
  readonly status: number | null;
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: Problem };

/**
 * The sentence for each kind.
 *
 * Written once, here, because the alternative is each screen inventing its own words for
 * the same event and 130 people comparing notes in a room.
 */
export const PROBLEM_TEXT: Readonly<Record<ProblemKind, string>> = {
  offline: "We could not reach Launchhouse. That is usually the wifi. Try again in a moment.",
  signed_out: "You have been signed out. Sign in again and you will be back where you were.",
  not_built_yet: "This part is not connected yet. Nothing you have made is affected.",
  refused: "We could not do that. Nothing was changed.",
  too_many: "That was a lot of requests at once. Wait a minute and try again.",
  server: "Something went wrong on our side. Nothing you have made is affected. Try again.",
};

function problem(kind: ProblemKind, status: number | null, text?: string): Problem {
  return { kind, status, text: text ?? PROBLEM_TEXT[kind] };
}

/** An object body, or null. A JSON array or a bare string is not an answer any route gives. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Map a status onto a kind. 404 is `not_built_yet` on purpose: see the header.
 *
 * 501 joins it, and the two mean different things that read the same to a
 * founder. 404 is "nobody registered that address". 501 is a route that exists
 * and says it cannot do this yet, which today is the GoHighLevel check and
 * saving a pasted sample as a file. Both of those carry a sentence of their own
 * that wins over the general one, so what a founder reads is written for the
 * thing they were actually trying to do.
 */
export function kindForStatus(status: number): ProblemKind {
  if (status === 401 || status === 403) return "signed_out";
  if (status === 404 || status === 501) return "not_built_yet";
  if (status === 429) return "too_many";
  if (status >= 500) return "server";
  return "refused";
}

/**
 * The one place a response becomes a Result.
 *
 * A refusal may carry `{ message }` written by the server for this founder, and when it
 * does that sentence wins, because the server knows which of the four caps was hit and this
 * file does not.
 */
async function toResult<T>(res: Response, expects: Expects): Promise<Result<T>> {
  if (res.status === 204) return { ok: true, value: undefined as T };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // A body that is not JSON is not a failure to report on its own. An empty 500 page from
    // a proxy is still a 500, and the kind below is what the founder reads.
    body = null;
  }
  if (res.ok) {
    // A 2xx carrying something that is not an object, where a screen is about to read fields
    // off it, is a proxy or a sign in page answering in the API's place. It has happened to
    // every app that assumed otherwise, and handing it back as the expected shape puts a
    // null where a field is read, which is a white page instead of a sentence. Fail closed.
    // Calls that expect nothing back are unaffected, so an empty 200 on a write is still a
    // write that worked.
    if (expects === "an answer" && asRecord(body) === null) {
      return { ok: false, problem: problem("server", res.status) };
    }
    return { ok: true, value: body as T };
  }
  const kind = kindForStatus(res.status);
  const message =
    typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : undefined;
  return { ok: false, problem: problem(kind, res.status, message) };
}

/**
 * Whether the caller is going to read fields off the answer.
 *
 * The distinction is not decoration. A write that answers 200 with an empty body has
 * worked, and refusing it would fail a founder for nothing. A read that answers 200 with
 * something we cannot read has not worked, whatever it says.
 */
type Expects = "an answer" | "nothing";

async function request<T>(path: string, expects: Expects, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
      ...init,
    });
    return await toResult<T>(res, expects);
  } catch {
    // A rejected fetch is a transport failure, which for a founder in a venue is the wifi.
    return { ok: false, problem: problem("offline", null) };
  }
}

/** A read. The screen is about to render what comes back, so it has to be readable. */
function get<T>(path: string): Promise<Result<T>> {
  return request<T>(path, "an answer");
}

/**
 * A read of something that is not JSON.
 *
 * One route answers this way and it is the right way for it to answer: a
 * founder's own file is served as its own bytes, with its own content type, so
 * that the same address can be opened, read and saved without three renderings
 * of one file. Wrapping it in JSON would mean a founder downloading a file that
 * is not the file they read.
 *
 * It goes through the same failure handling as everything else, because a
 * dropped connection and a 404 do not care what the body was going to be.
 */
async function getText(path: string): Promise<Result<string>> {
  try {
    const res = await fetch(path, { credentials: "same-origin", headers: { accept: "text/plain, */*" } });
    if (res.ok) return { ok: true, value: await res.text() };
    // A refusal is still JSON, because every refusal in this app is. If it is
    // not, the kind alone carries a sentence.
    let message: string | undefined;
    try {
      const body: unknown = await res.json();
      const named = asRecord(body)?.["message"];
      if (typeof named === "string") message = named;
    } catch {
      message = undefined;
    }
    return { ok: false, problem: problem(kindForStatus(res.status), res.status, message) };
  } catch {
    return { ok: false, problem: problem("offline", null) };
  }
}

/** A write whose answer is read. */
function post<T>(path: string, body?: unknown): Promise<Result<T>> {
  return request<T>(path, "an answer", { method: "POST", body: JSON.stringify(body ?? {}) });
}

/** A write with nothing to read back. It worked or it did not. */
function postVoid(path: string, body?: unknown): Promise<Result<void>> {
  return request<void>(path, "nothing", { method: "POST", body: JSON.stringify(body ?? {}) });
}

// ---------------------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------------------

/**
 * The founder, as the browser is allowed to know them.
 *
 * `track` is null until the Founder Brain locks it, and every screen treats null as "not
 * known yet" rather than as a default. Rule 1 is that the fork happens once, in the Brain.
 * A default here would be a second fork, and it would be wrong for half the cohort.
 */
export interface Founder {
  readonly id: string;
  readonly firstName: string;
  readonly displayName: string | null;
  /** IANA name, never an offset. Offsets change twice a year and a 90 day plan runs past it. */
  readonly timezone: string | null;
  readonly track: Track | null;
  readonly trackLocked: boolean;
}

export type Session = { readonly signedIn: true; readonly founder: Founder } | { readonly signedIn: false };

/**
 * What `/api/me` actually answers with, which is not the shape the screens read.
 *
 * The server has one job on this route: say who is holding this cookie. It
 * answers 200 with the founder's own row, or 401 when the cookie resolves to
 * nobody. That is a better contract than a `signedIn` boolean, because the
 * status already carries it and two ways of saying one thing eventually
 * disagree. This is the shape as it arrives, and `fetchSession` below turns it
 * into the shape the screens were written against.
 */
interface MeBody {
  readonly id?: unknown;
  readonly displayName?: unknown;
  readonly timezone?: unknown;
  readonly track?: unknown;
}

/**
 * The first word of the name on the roster.
 *
 * "there" when there is no name, which reads as a sentence rather than as a
 * blank: "Welcome, there." The roster is seeded from the ticket list so every
 * one of the 130 has a name, and this is what the screens say if one somehow
 * does not. Inventing a name would be worse than a plain word.
 */
function firstNameOf(displayName: string | null): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first === undefined || first === "" ? "there" : first;
}

function asTrack(value: unknown): Track | null {
  return value === "b2b" || value === "b2c" ? value : null;
}

/**
 * Who is signed in.
 *
 * A 401 IS AN ANSWER, NOT A FAILURE, and that is the line that used to be
 * missing. This half of the app and the server half were written at the same
 * time against two shapes of the same idea: the screens read `{ signedIn,
 * founder }` and the server sends the founder's row. So a signed in founder was
 * read as `signedIn === undefined`, which is false, and they were shown the
 * sign in screen for ever with a live session in their browser. The mapping is
 * here, in the one file that is allowed to know what the wire looks like.
 *
 * `trackLocked` is derived rather than sent, and the derivation is exact.
 * `founder.track` is a cache of the Track line in founder-brain.md and the only
 * thing that ever writes it is the harvest that stored the Brain, inside the
 * same transaction. So a track that exists is a track the Brain locked, and a
 * founder who has not run the Brain has null. If the server ever starts setting
 * that column from anywhere else, this line becomes wrong and the server should
 * send the field instead.
 */
export async function fetchSession(): Promise<Result<Session>> {
  const answer = await get<MeBody>("/api/me");
  if (!answer.ok) {
    if (answer.problem.kind === "signed_out") return { ok: true, value: { signedIn: false } };
    return answer;
  }
  const body = answer.value;
  if (typeof body.id !== "string" || body.id === "") {
    // A 200 that does not name a founder is not an answer to this question.
    // Failing closed here shows a sentence rather than a screen built on nulls.
    return { ok: false, problem: problem("server", 200) };
  }
  const displayName = typeof body.displayName === "string" && body.displayName !== "" ? body.displayName : null;
  const track = asTrack(body.track);
  return {
    ok: true,
    value: {
      signedIn: true,
      founder: {
        id: body.id,
        firstName: firstNameOf(displayName),
        displayName,
        timezone: typeof body.timezone === "string" && body.timezone !== "" ? body.timezone : null,
        track,
        trackLocked: track !== null,
      },
    },
  };
}

/** What the sign in screen learns. `not_on_roster` is a normal answer, not an error. */
export type SignInAnswer =
  | { readonly sent: true }
  | {
      readonly sent: false;
      /**
       * Four reasons, kept apart because they are four different next actions.
       *
       * `rate_limited` is here for completeness and the server never sends it:
       * a limited request answers `sent: true`, exactly as the server rendered
       * screen shows the same "check your email" page. Anything else turns the
       * limit into a way of asking which addresses are on the roster.
       */
      readonly reason: "not_on_roster" | "not_an_address" | "disabled" | "rate_limited";
    };

/** ASSUMED path, registered in src/server/routes/auth-api.ts. */
export function requestSignInLink(email: string): Promise<Result<SignInAnswer>> {
  return post<SignInAnswer>("/api/auth/request-link", { email });
}

/**
 * "Tell a mentor" from the sign in screen.
 *
 * Section 6: no dead ends. A founder whose address is not on the roster gets a human, and
 * this is the write into the mentor queue.
 *
 * ASSUMED path.
 */
export function tellAMentor(email: string, note: string): Promise<Result<{ readonly queued: true }>> {
  return post<{ readonly queued: true }>("/api/auth/mentor-note", { email, note });
}

/**
 * ASSUMED path, registered in src/server/routes/auth-api.ts.
 *
 * This device only. Sessions are per device with no limit, because founders
 * sign in again on a phone on event day, and signing out of a laptop must not
 * take the phone with it.
 */
export function signOut(): Promise<Result<void>> {
  return postVoid("/api/auth/sign-out");
}

// ---------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------

export interface SocialAccount {
  /** As GoHighLevel names it back to us. Never a platform we decided on. */
  readonly platform: string;
  readonly name: string;
}

/**
 * What we know about the GoHighLevel connection.
 *
 * `contacts` has a third value on purpose. The name of the contacts read is not known at
 * all, which `app/content/ghl-walk.ts` records against the spike, so the screen reports it
 * as not yet checked rather than reporting a pass it did not make.
 */
export interface GhlState {
  readonly connected: boolean;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly accounts: readonly SocialAccount[];
  readonly contacts: "readable" | "not_checked";
  readonly tokenMadeAt: string | null;
}

/** The six failures of the walk, one kind each, in the order of the table in section 6. */
export type GhlFailureKind =
  | "auth_rejected"
  | "location_mismatch"
  | "scope_probably_missing"
  | "no_accounts"
  | "rate_limited"
  | "vendor_unavailable";

/** Which of the three reads failed. The scope named in the copy is derived from this. */
export type GhlVerifyCall = "location" | "accounts" | "contacts";

export type GhlVerifyResult =
  | { readonly ok: true; readonly ghl: GhlState }
  | { readonly ok: false; readonly kind: GhlFailureKind; readonly call: GhlVerifyCall; readonly scope?: GhlScope };

export interface SetupState {
  readonly profile: { readonly name: string | null; readonly timezone: string | null };
  /** Keyed by the step slug in `app/content/ghl-walk.ts`, plus our own rail slugs. */
  readonly steps: Readonly<Record<string, { readonly state: StepState; readonly evidence: string | null }>>;
  readonly ghl: GhlState;
  /**
   * Absent for a B2C founder, and absent is the point.
   *
   * Section 6: the Apollo row does not exist in their rail, their receipt carries no Apollo
   * line, not even a skip, and the word does not appear anywhere in their app. A field set
   * to false would still be the other track's material arriving on their screen, so the
   * server omits the key and this side treats undefined as "there is no such row".
   */
  readonly apollo?: { readonly connected: boolean };
}

/** ASSUMED path. */
export function fetchSetup(): Promise<Result<SetupState>> {
  return get<SetupState>("/api/setup");
}

/** ASSUMED path. Name and timezone, the two questions of the first run screen. */
export function saveProfile(name: string, timezone: string): Promise<Result<void>> {
  return postVoid("/api/setup/profile", { name, timezone });
}

/**
 * ASSUMED path. Written on ENTERING a step, not on leaving it.
 *
 * Section 6, and the reason is a closed tab: a founder resumes where they actually were
 * rather than where they last succeeded.
 */
export function recordStep(slug: string, state: StepState, evidence?: string): Promise<Result<void>> {
  return postVoid(`/api/setup/steps/${encodeURIComponent(slug)}`, { state, evidence: evidence ?? null });
}

/** ASSUMED path. The Location ID is not a secret and survives a resume. */
export function saveLocationId(locationId: string): Promise<Result<void>> {
  return postVoid("/api/setup/ghl/location", { locationId });
}

/** ASSUMED path. The token crosses the wire once and is never sent back to the browser. */
export function connectGhl(token: string): Promise<Result<GhlVerifyResult>> {
  return post<GhlVerifyResult>("/api/setup/ghl/token", { token });
}

/**
 * ASSUMED path. Re runs all three reads with the token already stored.
 *
 * The founder never re enters the token to retry. Asking somebody to paste a credential a
 * second time because a Facebook Page was not connected is how you lose them.
 */
export function verifyGhl(): Promise<Result<GhlVerifyResult>> {
  return post<GhlVerifyResult>("/api/setup/ghl/verify");
}

/** ASSUMED path. Deletes our copy. It does not switch the token off, and the screen says so. */
export function disconnectGhl(): Promise<Result<void>> {
  return postVoid("/api/setup/ghl/disconnect");
}

// ---------------------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------------------

export type RouteProgress = "not_started" | "in_progress" | "done";

export interface HomeState {
  /** Per route id. A route with no entry has not been started. */
  readonly routes: Readonly<Record<string, { readonly progress: RouteProgress; readonly threadId: string | null }>>;
  /** Which route the founder should do next, decided server side from the same table. */
  readonly nextRouteId: string | null;
  /** File names that exist, so a card can say what is missing before it is started. */
  readonly presentFiles: readonly string[];
}

/** ASSUMED path. */
export function fetchHome(): Promise<Result<HomeState>> {
  return get<HomeState>("/api/home");
}

// ---------------------------------------------------------------------------------------
// Threads, which is the chat
// ---------------------------------------------------------------------------------------

export interface ThreadMessage {
  readonly id: string;
  readonly role: "founder" | "engine";
  readonly text: string;
  readonly at: string;
}

export interface ThreadState {
  readonly id: string;
  readonly routeId: string;
  readonly messages: readonly ThreadMessage[];
  /** The last `turn_events` id already in `messages`, so the stream resumes from there. */
  readonly lastEventId: number | null;
  readonly activeTurnId: string | null;
}

/** ASSUMED path. Starts, or reopens, the thread for one route. */
export function openThread(routeId: string): Promise<Result<{ readonly threadId: string }>> {
  return post<{ readonly threadId: string }>("/api/threads", { routeId });
}

/** ASSUMED path. */
export function fetchThread(threadId: string): Promise<Result<ThreadState>> {
  return get<ThreadState>(`/api/threads/${encodeURIComponent(threadId)}`);
}

/**
 * Section 2 names this one. `202` with a turn id, in under 50 ms, streaming nothing.
 *
 * `clientMsgId` is what makes a retry after a dropped connection impossible to double send:
 * the server holds a unique index on (thread_id, client_msg_id).
 */
export function sendMessage(
  threadId: string,
  text: string,
  clientMsgId: string,
): Promise<Result<{ readonly turnId: string }>> {
  return post<{ readonly turnId: string }>(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
    text,
    clientMsgId,
  });
}

/** Section 2 names this one. Stop. The partial text that already streamed is kept. */
export function interruptThread(threadId: string): Promise<Result<void>> {
  return postVoid(`/api/threads/${encodeURIComponent(threadId)}/interrupt`);
}

/** Section 2 names this one. The SSE URL. Opened by lib/stream.ts, not by fetch. */
export function streamUrl(threadId: string): string {
  return `/api/threads/${encodeURIComponent(threadId)}/stream`;
}

/**
 * A pasted sample, saved as a file instead of sent as a message.
 *
 * ASSUMED path. Section 4 names the behaviour and not the route: the composer caps a paste
 * at roughly 50 KB and offers to attach it as a file, samples land in
 * `growth-engine/voice-samples/`, and the model reads them with the Read tool. That keeps
 * the context small and makes the sample the founder's own downloadable property.
 */
export function saveVoiceSample(name: string, text: string): Promise<Result<{ readonly path: string }>> {
  return post<{ readonly path: string }>("/api/files/voice-samples", { name, text });
}

// ---------------------------------------------------------------------------------------
// Files, which is rule 4
// ---------------------------------------------------------------------------------------

export type FileStatus = "missing" | "empty" | "ok";

/**
 * One row of `.state/index.md`, which `ge index` already builds in build order and already
 * forks on the Track line.
 *
 * `track` comes back so this side can drop a row belonging to the other track. The server
 * filters too. Two filters, because rule 1 is structural and one of them is presentation.
 */
export interface FileRow {
  readonly name: string;
  readonly gateLabel: string;
  readonly status: FileStatus;
  readonly sizeBytes: number;
  readonly changedAt: string | null;
  readonly kind: "markdown" | "csv" | "folder" | "other";
  readonly track: "both" | Track;
  /** Only for `people/`, where the row is a count that expands. */
  readonly count?: number;
}

export interface FilesState {
  readonly rows: readonly FileRow[];
  /** `.state/` sits behind a disclosure labelled in plain words, not hidden. */
  readonly stateRows: readonly FileRow[];
}

/** ASSUMED path. */
export function fetchFiles(): Promise<Result<FilesState>> {
  return get<FilesState>("/api/files");
}

/**
 * ASSUMED path. The text of one file, for reading on screen.
 *
 * The server answers with the file's own bytes and its own content type, not
 * with JSON carrying a string, so this reads text. One address, one set of
 * bytes, whether it is being read on screen or saved to a disk.
 */
export async function fetchFile(name: string): Promise<Result<{ readonly name: string; readonly text: string }>> {
  const answer = await getText(`/api/files/${encodeURIComponent(name)}`);
  return answer.ok ? { ok: true, value: { name, text: answer.value } } : answer;
}

/**
 * Per file download.
 *
 * The doc names `GET /files/:name` in section 5. It is under `/api` here so that one prefix
 * covers everything the browser calls, and it is a plain link rather than a fetch so the
 * browser saves the file itself with no JavaScript in the path.
 */
export function downloadUrl(name: string): string {
  return `/api/files/${encodeURIComponent(name)}/download`;
}

/** Download everything, as one ZIP. Snapshots are a checkbox and default to off. */
export function downloadAllUrl(includeSnapshots: boolean): string {
  return `/api/files/download.zip${includeSnapshots ? "?snapshots=1" : ""}`;
}

// ---------------------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------------------

export interface GatesState {
  /** File name to status, for the file backed items. */
  readonly fileStatus: Readonly<Record<string, FileStatus>>;
  /** When each gate form was submitted, as an ISO date, or null. */
  readonly submitted: Readonly<Record<"A" | "B" | "C", string | null>>;
  /** The gate form link, which is a Google Form. Null until the form exists. */
  readonly formUrl: Readonly<Record<"A" | "B" | "C", string | null>>;
}

/** ASSUMED path. */
export function fetchGates(): Promise<Result<GatesState>> {
  return get<GatesState>("/api/gates");
}
