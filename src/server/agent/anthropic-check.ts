/**
 * src/server/agent/anthropic-check.ts
 *
 * WHAT THIS IS. The check that runs the moment a founder pastes their Anthropic key, and
 * the table that turns whatever Anthropic answers into a sentence the founder can act on.
 *
 * WHY IT EXISTS. A key box that stores whatever it is given is a box that tells 130 people
 * they are set up. The mistake then surfaces three screens later, mid session, as a turn
 * that does not finish, and by then the founder has no idea which of the last four things
 * they did was the wrong one. A key is checked here, once, while the founder is still
 * looking at the box they pasted it into and can still fix it in one action.
 *
 * WHAT "CHECKED" MEANS, IN TWO CALLS, BECAUSE ONE WOULD NOT BE ENOUGH.
 *
 *   1. List the models the key can see. This proves the key is a key and that Anthropic
 *      accepts it. It costs nothing and it spends no tokens.
 *   2. Send one very short message. This proves the account can actually generate, which
 *      is a different question and the one that catches an account with no credit on it.
 *      A key that passes step 1 and fails step 2 is exactly the founder who would have
 *      reached session 1 believing they were ready.
 *
 * The model for step 2 is chosen out of what step 1 listed, so this file never names a
 * model the founder's own account did not. The preference order is the cheapest models in
 * the Claude API reference, and the fallback is whatever the account listed first.
 *
 * THE FAILURE TABLE IS DATA, AND THAT IS THE POINT. Nobody here has watched Anthropic
 * refuse a key with a real founder's account behind it. What is known is the documented
 * shape: an HTTP status and an `error.type` string. So the mapping from a shape to a
 * sentence is a list of rows, matched most specific first, with a row for "we do not have
 * words for that yet" at the end that never claims to know why. When somebody watches a
 * real refusal, they add a row. They do not write a branch, and they do not have to change
 * the code that calls this.
 *
 * ANTHROPIC'S OWN WORDS ARE CARRIED, SCRUBBED. "Your credit balance is too low" is a far
 * better sentence than anything written in advance, and it is theirs to write, not ours to
 * predict. It is passed through as `vendorSaid`, after the pasted key has been taken out
 * of it, and the screen renders it under our sentence rather than instead of it.
 *
 * NOTHING HERE PRINTS, LOGS OR RETURNS A KEY. The key goes into one header and nowhere
 * else. Every string that leaves this file has been through `scrubbed`, which replaces the
 * key rather than shortening it, because a partial key is still a key on a screen.
 *
 * WHAT CALLS IT. src/server/routes/setup.ts, when a founder saves or rechecks a key.
 * WHAT IT READS. Nothing on disk. One host, api.anthropic.com, through vendorFetch.
 * WHAT IT WRITES. Nothing.
 */

import { vendorFetch, type VendorAnswer } from '../integrations/http.ts';
import { scrubAnthropicKeys } from './anthropic-key.ts';

/**
 * The Anthropic API, as the Claude API reference documents it.
 *
 * Written out here rather than guessed: the host, the two addresses, the two header names
 * and the one version value are all from that reference. If any of them moves, this block
 * is the only thing that changes.
 */
const ANTHROPIC = {
  models: 'https://api.anthropic.com/v1/models',
  messages: 'https://api.anthropic.com/v1/messages',
  keyHeader: 'x-api-key',
  versionHeader: 'anthropic-version',
  version: '2023-06-01',
} as const;

/**
 * Which model step 2 would rather use, cheapest first.
 *
 * These are ids from the Claude API reference. NONE OF THEM IS SENT UNLESS THE ACCOUNT
 * LISTED IT in step 1, so a founder whose account has none of them is checked against a
 * model they really do have rather than refused for a list that is out of date.
 */
const PREFERRED_PROBE_MODELS: readonly string[] = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5'];

/**
 * Four tokens, not one.
 *
 * The answer is thrown away, so one would do. Four costs a fraction of a penny more and
 * removes any question about a model that thinks before it writes having nowhere to put
 * the first token. A reply that stops at the cap is still a reply, and a reply is the
 * whole of what this step is asking for.
 */
const PROBE_MAX_TOKENS = 4;

/** A key box is not a document box. Comfortably above any key, far below a paste of a page. */
export const MAX_KEY_CHARACTERS = 500;

/** Which of the three things we were doing when it went wrong. */
export type CheckStage = 'read' | 'authenticate' | 'generate';

/** Every named failure. The code is ours, is stable, and is what a log line carries. */
export type KeyProblemCode =
  | 'empty'
  | 'too_long'
  | 'not_plain_text'
  | 'key_not_accepted'
  | 'key_not_allowed'
  | 'refused_the_test'
  | 'model_missing'
  | 'no_models'
  | 'busy'
  | 'vendor_down'
  | 'no_answer_yet'
  | 'cannot_reach'
  | 'wrong_box'
  | 'not_saved'
  | 'unknown';

export interface KeyProblem {
  readonly code: KeyProblemCode;
  /** What happened, named before it is explained. Never a status code. */
  readonly title: string;
  /** What the founder does next. Always an action. */
  readonly whatToDo: string;
  /** True when pressing the button again could reasonably work. */
  readonly retryable: boolean;
  /** Anthropic's own sentence, with the key taken out of it, or null. */
  readonly vendorSaid: string | null;
}

export type KeyCheck =
  | { readonly ok: true; readonly checkedAt: Date; readonly provedWith: string }
  | { readonly ok: false; readonly problem: KeyProblem };

/**
 * Every sentence this file can put in front of a founder.
 *
 * Held together in one object so they can be read as a set, the way a founder meets them:
 * say what happened, say whether their work is safe, end on one thing to do. Their prose
 * is checked by this file's own test against the same rule the rest of the product uses.
 */
export const KEY_PROBLEMS: Readonly<Record<KeyProblemCode, Omit<KeyProblem, 'code' | 'vendorSaid'>>> = {
  empty: {
    title: 'There is nothing in the box yet.',
    whatToDo: 'Open console.anthropic.com, go to API keys, copy your key, and paste it here.',
    retryable: true,
  },
  too_long: {
    title: 'That is longer than any API key.',
    whatToDo: 'Nothing was saved. Check you copied the key on its own rather than the page around it, then paste it again.',
    retryable: true,
  },
  not_plain_text: {
    title: 'That paste has characters in it that cannot be sent.',
    whatToDo:
      'Nothing was saved. Copy the key again straight from console.anthropic.com rather than from a document or an email, then paste it here.',
    retryable: true,
  },
  key_not_accepted: {
    title: 'Anthropic did not accept that key.',
    whatToDo:
      'Nothing was saved and nothing you have made is affected. Open console.anthropic.com, go to API keys, copy the whole key including the last character, and paste it here again.',
    retryable: true,
  },
  key_not_allowed: {
    title: 'Anthropic knows that key and will not let it do this.',
    whatToDo:
      'Nothing was saved. Make a new key at console.anthropic.com, under API keys, and paste that one here instead.',
    retryable: true,
  },
  refused_the_test: {
    title: 'The key is real, and Anthropic would not run a test message with it.',
    whatToDo:
      'Nothing was saved. Read what Anthropic said below. If it mentions credit or billing, add credit at console.anthropic.com and press Check again.',
    retryable: true,
  },
  model_missing: {
    title: 'The key works, and this account cannot use the model this app writes with.',
    whatToDo:
      'Nothing was saved and nothing you have made is affected. Show this screen to somebody from the Launchhouse team. They will tell you what to turn on.',
    retryable: false,
  },
  no_models: {
    title: 'Anthropic accepted the key and listed no models for it.',
    whatToDo:
      'Nothing was saved. Open console.anthropic.com, check the account has billing set up, then press Check again.',
    retryable: true,
  },
  busy: {
    title: 'Anthropic is limiting how often this key can be used at the moment.',
    whatToDo: 'That is not a problem with your key. Wait a minute, then press Check again.',
    retryable: true,
  },
  vendor_down: {
    title: 'Anthropic did not answer properly.',
    whatToDo:
      'That is their side rather than your key, and nothing you have made is affected. Wait a minute, then press Check again.',
    retryable: true,
  },
  no_answer_yet: {
    title: 'Anthropic took too long to answer.',
    whatToDo: 'Nothing was saved and nothing you have made is affected. Wait a minute, then press Check again.',
    retryable: true,
  },
  cannot_reach: {
    title: 'We could not reach Anthropic at all.',
    whatToDo:
      'That is the connection out of this app rather than your key. Wait a minute and press Check again. If it keeps happening, tell whoever is running the room.',
    retryable: true,
  },
  /**
   * Anthropic said yes and our own database said no.
   *
   * It has its own sentence because it is the one failure where the founder did nothing
   * wrong and re-pasting will not help. Reporting it as success would be worse than any
   * other lie on this screen: the key would work until the container was replaced, and
   * then stop, with nobody able to say why.
   */
  not_saved: {
    title: 'Anthropic accepted your key and we could not save it.',
    whatToDo:
      'Nothing you have made is affected and the key has not been kept. Wait a moment and press Save again. If it happens twice, tell whoever is running the room.',
    retryable: true,
  },
  wrong_box: {
    title: 'That looks like your GoHighLevel token, and Anthropic did not accept it.',
    whatToDo:
      'Nothing was saved and your GoHighLevel token has not been kept anywhere. This box wants the key from console.anthropic.com. Copy that one and paste it here.',
    retryable: true,
  },
  unknown: {
    title: 'Anthropic answered in a way we do not have words for yet.',
    whatToDo:
      'Nothing was saved and nothing you have made is affected. Show this screen to somebody from the Launchhouse team, and carry on with the rest of setup.',
    retryable: true,
  },
};

/**
 * One row of the mapping from what came back to what the founder reads.
 *
 * Every field is optional except the code, and an absent field matches anything. The list
 * is walked in order and the first row that matches wins, so the specific rows come first
 * and the catch alls come last. THIS IS THE PART THAT FILLS IN LATER: somebody who watches
 * a real refusal adds a row above the catch all, and no other file changes.
 */
export interface AnswerRule {
  readonly stage?: CheckStage;
  readonly status?: number;
  readonly statusFrom?: number;
  /** The `error.type` string in the body, when there is one. */
  readonly type?: string;
  readonly code: KeyProblemCode;
}

/**
 * The rules, most specific first.
 *
 * The statuses and the type strings are the ones the Claude API reference documents.
 * Nothing here is a guess about a body's wording, because a rule that matched on wording
 * would be a rule that quietly stops matching the day somebody rewrites a sentence.
 */
export const ANSWER_RULES: readonly AnswerRule[] = [
  { status: 401, code: 'key_not_accepted' },
  { type: 'authentication_error', code: 'key_not_accepted' },
  { status: 403, code: 'key_not_allowed' },
  { type: 'permission_error', code: 'key_not_allowed' },
  { stage: 'generate', status: 404, code: 'model_missing' },
  { stage: 'generate', status: 400, code: 'refused_the_test' },
  { status: 429, code: 'busy' },
  { type: 'rate_limit_error', code: 'busy' },
  { type: 'overloaded_error', code: 'vendor_down' },
  { statusFrom: 500, code: 'vendor_down' },
  // Last, and it never claims to know why. Everything unrecognised lands here.
  { code: 'unknown' },
];

/** Match one answer against the rules. Exported so a test can drive it without a network. */
export function codeFor(stage: CheckStage, status: number, type: string | null): KeyProblemCode {
  for (const rule of ANSWER_RULES) {
    if (rule.stage !== undefined && rule.stage !== stage) continue;
    if (rule.status !== undefined && rule.status !== status) continue;
    if (rule.statusFrom !== undefined && status < rule.statusFrom) continue;
    if (rule.type !== undefined && rule.type !== type) continue;
    return rule.code;
  }
  // Unreachable while the last rule matches everything, and returned rather than thrown
  // because a founder pressing a button must never meet an exception.
  return 'unknown';
}

/** Build a problem from a code, with the vendor's own words attached when there are any. */
export function problemOf(code: KeyProblemCode, vendorSaid: string | null = null): KeyProblem {
  return { code, ...KEY_PROBLEMS[code], vendorSaid };
}

/**
 * What the founder actually typed, or the reason it cannot be used.
 *
 * Trimming is not tidiness. A key copied from a console page arrives with a newline on the
 * end more often than not, and a newline in a header value throws inside fetch, which
 * reaches the founder as a 500 and reads as the app being broken.
 */
export function readPastedKey(raw: unknown): { ok: true; key: string } | { ok: false; problem: KeyProblem } {
  if (typeof raw !== 'string') return { ok: false, problem: problemOf('empty') };
  const key = raw.trim();
  if (key === '') return { ok: false, problem: problemOf('empty') };
  if (key.length > MAX_KEY_CHARACTERS) return { ok: false, problem: problemOf('too_long') };
  for (const ch of key) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x21 || code > 0x7e) return { ok: false, problem: problemOf('not_plain_text') };
  }
  return { ok: true, key };
}

export interface CheckOptions {
  /**
   * Model ids this deployment will actually use, when the caller knows them.
   *
   * Empty today, and the shape is here rather than the wiring because the models live on
   * the runner's config and the route does not hold one. When it is filled in, a key whose
   * account cannot see one of these fails the check with `model_missing` instead of
   * failing at the founder's first turn.
   */
  readonly mustHaveModels?: readonly string[];
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly now?: () => Date;
  /** Per call deadline. Left to vendorFetch's own default in the app; set by tests. */
  readonly timeoutMs?: number;
}

/**
 * Check one key, end to end.
 *
 * Never throws. Every path returns a KeyCheck, because the caller is a route answering a
 * founder who is looking at a box, and the one thing that must not happen there is an
 * exception with somebody else's writing in it.
 */
export async function checkAnthropicKey(key: string, options: CheckOptions = {}): Promise<KeyCheck> {
  const now = options.now ?? ((): Date => new Date());
  const scrub = (text: string): string => scrubbed(text, key);

  const listed = await ask('authenticate', ANTHROPIC.models, 'GET', key, undefined, options);
  if (!listed.ok) return { ok: false, problem: listed.problem };

  const models = modelIdsIn(listed.body);
  if (models.length === 0) return { ok: false, problem: problemOf('no_models') };

  const required = options.mustHaveModels ?? [];
  const absent = required.filter((wanted) => !models.includes(wanted));
  if (absent.length > 0) return { ok: false, problem: problemOf('model_missing') };

  const probeModel = PREFERRED_PROBE_MODELS.find((id) => models.includes(id)) ?? models[0];
  if (probeModel === undefined) return { ok: false, problem: problemOf('no_models') };

  const generated = await ask(
    'generate',
    ANTHROPIC.messages,
    'POST',
    key,
    { model: probeModel, max_tokens: PROBE_MAX_TOKENS, messages: [{ role: 'user', content: 'Hi' }] },
    options,
  );
  if (!generated.ok) return { ok: false, problem: generated.problem };

  return { ok: true, checkedAt: now(), provedWith: scrub(probeModel) };
}

type AskResult = { ok: true; body: unknown } | { ok: false; problem: KeyProblem };

/** One call, with the answer already turned into either a body or a problem. */
async function ask(
  stage: CheckStage,
  url: string,
  method: 'GET' | 'POST',
  key: string,
  body: unknown,
  options: CheckOptions,
): Promise<AskResult> {
  let answer: VendorAnswer;
  try {
    answer = await vendorFetch(
      {
        vendor: 'anthropic',
        operation: stage === 'authenticate' ? 'list models' : 'send one short message',
        url,
        method,
        headers: { [ANTHROPIC.keyHeader]: key, [ANTHROPIC.versionHeader]: ANTHROPIC.version },
        ...(body === undefined ? {} : { body }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      },
      options.fetchImpl,
    );
  } catch {
    // vendorFetch throws only for a request that should never have been built, and the one
    // way a founder can cause that is a header value we let through. readPastedKey already
    // refuses those, so this is the second wall rather than the first.
    return { ok: false, problem: problemOf('not_plain_text') };
  }

  if (answer.kind === 'no_answer') {
    return { ok: false, problem: problemOf(answer.reason === 'timeout' ? 'no_answer_yet' : 'cannot_reach') };
  }
  if (answer.status >= 200 && answer.status < 300) return { ok: true, body: answer.body };

  const said = errorMessageIn(answer.body);
  return {
    ok: false,
    problem: problemOf(codeFor(stage, answer.status, errorTypeIn(answer.body)), said === null ? null : scrubbed(said, key)),
  };
}

/** `data: [{ id }]`, as the Models API documents it. Anything else is no models. */
export function modelIdsIn(body: unknown): readonly string[] {
  if (typeof body !== 'object' || body === null) return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => (typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

/** `error.type`, as the error reference documents it, or null. */
export function errorTypeIn(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const type = (error as { type?: unknown }).type;
  return typeof type === 'string' && type !== '' ? type : null;
}

/** `error.message`, capped, or null. Their sentence, not ours, and it is worth showing. */
export function errorMessageIn(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string' || message.trim() === '') return null;
  return message.trim().slice(0, 300);
}

/**
 * Take the key out of a string, whether or not this process is holding it yet.
 *
 * The key being checked has not been stored at the point most of these strings are built,
 * so `scrubAnthropicKeys` alone would not see it. Both run: the one being checked, and
 * every one already held.
 */
export function scrubbed(text: string, key: string): string {
  const withoutThisOne = key === '' ? text : text.split(key).join('[the key]');
  return scrubAnthropicKeys(withoutThisOne);
}
