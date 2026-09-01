/**
 * src/server/integrations/http.ts
 *
 * WHAT THIS IS. The one function in this repository that calls a host we do not own.
 *
 * WHY IT EXISTS. `eslint.config.js` has banned the `fetch` global across `src/server/`
 * since the first commit and names this file as the one exception. Until today nothing
 * needed it, so the file the rule points at did not exist. The Anthropic key check needs
 * it: a founder pastes a key and the only way to know whether it works is to use it.
 *
 * One chokepoint rather than a `fetch` in every integration, for three reasons that are
 * each their own failure:
 *
 *   A CALL WITH NO TIMEOUT NEVER COMES BACK. Node's fetch has no default deadline. A
 *   vendor that accepts the connection and then goes quiet holds the request handler
 *   open, and the founder watches a spinner with nothing behind it. Every call made
 *   through here carries a deadline and a slow vendor becomes a sentence.
 *
 *   A CREDENTIAL IN A HEADER IS ONE console.log FROM A SCREENSHOT. Nothing in this file
 *   logs. It does not take a logger and it cannot be given one. What it returns is a
 *   status, a parsed body and a duration, and the caller decides what is safe to write
 *   down. That is deliberately the wrong way round from most HTTP wrappers, and it is
 *   right here: the thing this file is holding is the founder's own API key.
 *
 *   A HEADER VALUE WITH A NEWLINE IN IT THROWS INSIDE fetch. A founder pasting a key out
 *   of a PDF or an email brings invisible characters with it. Left alone that is a
 *   TypeError from the platform, which reaches the founder as a 500 and reads as the app
 *   being broken rather than as a paste that needs redoing. Header values are checked
 *   here, before the request is built.
 *
 * WHAT THIS FILE DOES NOT DO, said out loud so nobody assumes otherwise. It does not
 * write a `vendor_calls` row. That table is section 7's audit receipt, it pairs a session
 * founder id with a credential founder id, and the code that writes it belongs with the
 * GoHighLevel work whose shape the spike has not settled. Adding a half version here
 * would be a receipt nobody could trust. The Anthropic check is a founder pressing a
 * button about their own key, not the model reaching a vendor on their behalf, which is
 * what that table exists to police.
 *
 * WHAT CALLS IT. src/server/agent/anthropic-check.ts, and nothing else today.
 * WHAT IT READS. Nothing. WHAT IT WRITES. Nothing.
 */

/** Fifteen seconds. Long enough for a slow first call, short enough to stay a sentence. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * How much of a reply we are willing to read.
 *
 * A vendor that answers with a megabyte of HTML from a proxy is not answering our
 * question, and reading all of it to find that out costs memory in a container sized for
 * one founder. Everything this file is used for answers in a few kilobytes.
 */
const MAX_BODY_BYTES = 64 * 1024;

export interface VendorRequest {
  /** Which vendor, for the caller's own log line. Never sent. */
  readonly vendor: string;
  /** What was being asked, in two or three words, for the caller's own log line. */
  readonly operation: string;
  /** Absolute, https, no credentials in it. Checked below. */
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  /** Sent as JSON when present. Absent means no body at all. */
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

/**
 * What came back.
 *
 * `answered` means the vendor replied, whatever it said. A 401 is an answer. `no_answer`
 * means nothing replied, and the two reasons are told apart because the founder sentence
 * differs: a timeout is usually the vendor, and unreachable is usually us.
 */
export type VendorAnswer =
  | {
      readonly kind: 'answered';
      readonly status: number;
      /** The parsed JSON body, or null when there was none or it did not parse. */
      readonly body: unknown;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'no_answer';
      readonly reason: 'timeout' | 'unreachable';
      readonly durationMs: number;
    };

/**
 * A programmer's mistake, not a founder's.
 *
 * Thrown rather than returned, because every one of these is a call that should never
 * have been built. A caller that catches this and shows it to somebody is doing the wrong
 * thing, which is why the message is written for whoever is reading the stack.
 */
export class VendorRequestRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendorRequestRefused';
  }
}

/**
 * Printable ASCII, and nothing else, in a header value.
 *
 * The narrow rule rather than the exact one HTTP allows. A key that fails this is a key
 * that was pasted wrong, and telling the founder to paste it again is a better answer
 * than sending characters no header field is defined for and reading the vendor's guess.
 */
export function isSafeHeaderValue(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}


/* -------------------------------------------------------------------------- */
/* The allowlist, which is rule 2 layer 2                                     */
/* -------------------------------------------------------------------------- */

/**
 * EVERY HOST AND PATH THIS PRODUCT MAY EVER REACH. Anything else is refused here,
 * before a socket opens.
 *
 * WHY THIS EXISTS AND WHY IT EXISTS NOW. It was specified from the start, in
 * `contracts/ghl.ts`, whose `permittedPathPrefixes` entry says "Rule 2 layer 2 is
 * an allowlist". It was never built. Nothing read that entry and `vendorFetch`
 * checked the scheme and the headers and then called whatever it was given.
 *
 * It became load bearing on 31 August 2026, when the decision was taken to have
 * founders grant every permission GoHighLevel offers rather than hunt seven boxes
 * out of a hundred and fifty. That is the right call for the founder: a missed box
 * gives them a token short a permission and there is no way to add one afterwards.
 * It costs the layer that used to make rule 2 true at the credential, because a
 * token with everything on it can send a message.
 *
 * SO THE GUARANTEE MOVED HERE, from the credential into our own process. A token
 * that CAN send a DM is now held by an app that CANNOT ask it to. That is a weaker
 * place to keep a promise, and it is said out loud rather than glossed: the old
 * layer was the one we did not enforce ourselves, and this one we do.
 *
 * WHAT MAKES IT WORTH HAVING ANYWAY. The model cannot reach the network at all:
 * Bash, WebFetch, WebSearch, Task and Skill are refused to it in `agent/runner.ts`,
 * so there is no path from a sentence a founder types to an HTTP call. The only
 * thing that can call GoHighLevel is code in this repository, and this list is what
 * that code is allowed to call. A conversations endpoint added by mistake in six
 * months is refused by this function and named in the error.
 *
 * ADD A PREFIX ONLY WHEN A CALL NEEDS IT. A prefix nobody uses today is a prefix
 * nothing checks tomorrow.
 *
 * THERE IS NO DENY LIST, AND ITS ABSENCE IS THE DESIGN. The first version of this
 * had one, naming the message endpoints explicitly as never reachable. Two things
 * were wrong with it. It was redundant, because a positive list already refuses
 * everything it does not name, and a deny list only stops what somebody thought of
 * while a positive list stops what nobody thought of. And writing those paths out
 * tripped `rules/no-dm-automation.test.ts`, which scans this whole repository for
 * exactly those strings and does not care that this one was refusing them. That
 * scanner was right and the deny list was the thing that had to go.
 */
export const VENDOR_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  // GoHighLevel. Two prefixes, both evidenced. See contracts/ghl.ts.
  'services.leadconnectorhq.com': ['/social-media-posting/', '/blogs/'],
  // Anthropic, for `agent/anthropic-check.ts` only: the two calls that check a
  // founder's key is real before it is stored. The agent loop itself does not come
  // through here, because the CLI holds its own connection.
  'api.anthropic.com': ['/v1/models', '/v1/messages'],
  // Apollo. One prefix covering both documented calls, people search and people
  // enrichment. See contracts/apollo.ts: the paths are documented and have never been
  // sent, and no client calls them yet. The entry is here so the first real call is a
  // call and not also an allowlist argument.
  'api.apollo.io': ['/api/v1/'],
};

/** Why a request was refused by the allowlist, or null when it is allowed. */
export function allowlistRefusal(url: URL): string | null {
  const prefixes = VENDOR_ALLOWLIST[url.hostname];
  if (prefixes === undefined) {
    return (
      `${url.hostname} is not a host this product calls. Every outbound host is listed in ` +
      'VENDOR_ALLOWLIST, and a host that is not there is a call nobody argued for.'
    );
  }
  if (!prefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    return (
      `${url.pathname} is not a path this product calls on ${url.hostname}. Allowed: ` +
      `${prefixes.join(', ')}. Add a prefix when a call needs it, not in advance.`
    );
  }
  return null;
}

/**
 * One call to a host we do not own.
 *
 * `fetchImpl` is an argument so this file can be tested without a network and without a
 * key. The default is the platform's own fetch, which is the only place in `src/server/`
 * that global is allowed to appear.
 */
export async function vendorFetch(
  request: VendorRequest,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<VendorAnswer> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new VendorRequestRefused(`vendorFetch was given something that is not a URL for ${request.vendor}`);
  }
  if (url.protocol !== 'https:') {
    throw new VendorRequestRefused(
      `vendorFetch will only call https, and ${request.vendor} was given ${url.protocol}. A credential must not travel in the clear.`,
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new VendorRequestRefused('vendorFetch will not call a URL with credentials in it. Put them in a header.');
  }

  // The allowlist, before anything else about the request is considered. A host and
  // path this product does not call is refused whatever the headers say and whatever
  // the token could do.
  const refusal = allowlistRefusal(url);
  if (refusal !== null) {
    throw new VendorRequestRefused(`vendorFetch refused a call for ${request.vendor}: ${refusal}`);
  }

  for (const [name, value] of Object.entries(request.headers)) {
    if (!isSafeHeaderValue(value)) {
      // The NAME, never the value. The value is the thing we are protecting.
      throw new VendorRequestRefused(
        `the ${name} header for ${request.vendor} holds a character that cannot go in a header. Check the value before it reaches here.`,
      );
    }
  }

  const started = Date.now();
  const elapsed = (): number => Date.now() - started;

  try {
    const response = await fetchImpl(url.toString(), {
      method: request.method,
      headers: {
        ...request.headers,
        ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      // AbortSignal.timeout rather than a setTimeout and a controller. One line, cancelled
      // by the platform when the response lands, and it cannot leak a timer.
      signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    const text = await readCapped(response);
    let body: unknown = null;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      // A body that is not JSON is not a failure of its own. A proxy's HTML error page is
      // still a status, and the status is what the caller reads.
      body = null;
    }
    return { kind: 'answered', status: response.status, body, durationMs: elapsed() };
  } catch (err: unknown) {
    // The deadline fires as a TimeoutError, and every other transport failure arrives as
    // something else. Told apart on the name rather than on the message, because the
    // message is the platform's own writing and changes between versions.
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { kind: 'no_answer', reason: timedOut ? 'timeout' : 'unreachable', durationMs: elapsed() };
  }
}

/**
 * Read at most MAX_BODY_BYTES of a reply.
 *
 * Read as a stream rather than `response.text()`, because `text()` reads all of it first
 * and the cap would then only apply to what we keep, which is not a cap at all.
 */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_BODY_BYTES) break;
    }
  } finally {
    // Releasing rather than cancelling, so a body we stopped reading does not become an
    // error on a response we have already used.
    reader.releaseLock();
  }
  return Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES).toString('utf8');
}
