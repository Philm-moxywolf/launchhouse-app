/**
 * src/server/auth/owner.ts
 *
 * WHAT THIS IS. Sign in, for an app that belongs to one person. One passphrase,
 * one owner, one deployment. It replaces the magic link, the roster of 130 and
 * the mailer.
 *
 * WHY IT EXISTS, AND WHY THE THING IT REPLACES WAS WRONG RATHER THAN
 * UNFINISHED. The old flow looked an address up in a pre seeded roster and
 * emailed a single use link. Every part of that assumed a cohort. In the remix
 * model the founder presses Remix, gets a FRESH DATABASE that has never
 * connected to the original, pastes their keys, and opens the app. There is no
 * roster to be on, no cohort to belong to, and no address to send a link to.
 * The old stack could not be repaired into this; it had to be removed.
 *
 * THE THREE OPTIONS, AND WHY THIS ONE.
 *
 *   FIRST RUN CLAIM, where whoever opens it first becomes the owner. Rejected
 *   as the gate. The window between the deployment going live and the founder
 *   opening it is a window in which anybody who finds the URL owns the app, and
 *   the failure is silent and unrecoverable from the founder's side: they are
 *   told the app already has an owner, in a room, with 64 other people waiting.
 *   Replit publishes at a guessable name. The good half of this idea is kept:
 *   nothing is pre seeded and the owner row is created on the first successful
 *   sign in. It is the "whoever is first" part that is gone.
 *
 *   THE REPLIT ACCOUNT BOUNDARY, if the deployment is private to them.
 *   Rejected. It is exactly the class of assumption this work exists to remove.
 *   Deployments are not copied by a remix, so the founder makes their own, and
 *   whether it lands private depends on their plan and on a setting they have
 *   to find. They will also open the workspace preview URL during the session,
 *   which is a different address again. Leaning on it would mean a stranger who
 *   finds the URL reaching founder files, which is the one outcome that is not
 *   allowed. It is worth having underneath, and it is worth nothing as the gate.
 *
 *   A PASSPHRASE THE FOUNDER SETS. Chosen, with one change that removes its
 *   worst property. The founder does not invent it in the browser and hope to
 *   remember it. It is `OWNER_PASSPHRASE`, a Replit Secret, set on the same
 *   screen and in the same minute as the three keys they are already pasting.
 *
 * WHY THE SECRET IS THE RIGHT HOME FOR IT, in the words of the two facts we
 * have verified from Replit's own documentation:
 *
 *   "All files and configuration copy over, so the app runs exactly as the
 *   source did."
 *   "Secret names, not values. Your Remix lists them so you know what to fill
 *   in, with empty values."
 *
 *   So the founder is SHOWN the name `OWNER_PASSPHRASE` with an empty value,
 *   next to the three keys, by Replit, without us having to teach them
 *   anything. It survives every redeploy. It needs no table, no migration, no
 *   email and no SMTP client.
 *
 *   AND IT ANSWERS "WHAT IF THEY FORGET" BETTER THAN ANY OTHER OPTION. They
 *   open their own Replit project, click Secrets, and read it. Nothing to
 *   reset, nobody to ask, no mentor pulled out of a session. A passphrase
 *   hashed into our database would be genuinely lost. This one cannot be.
 *
 *   THE PHONE AT THE EVENT WORKS BECAUSE OF THE SAME PROPERTY. They open the
 *   app on a phone, type the passphrase, and are in. No second device to reach
 *   for, no code to read off a laptop, no mail app that will not open a browser.
 *
 * FAIL CLOSED. No passphrase, one under 12 characters, or one of the obvious
 * placeholders, and this refuses every sign in and ./plugin.ts refuses every
 * request. An app on a public address with no passphrase is an app anybody can
 * open, so it does not run in that state and it says on screen exactly what to
 * set.
 *
 * WHAT CALLS IT. ./plugin.ts. Nothing else.
 * WHAT IT READS. The owner row and `ge_event`, through the AuthStore.
 * WHAT IT WRITES. The owner row on first claim, `sessions`, and `ge_event`.
 */

import { mintSession, type MintedSession, type SessionConfig } from './session.ts';
import { SigninAttempts } from './rate-limit.ts';
import { secretsMatch } from './tokens.ts';
import {
  OWNER_PLACEHOLDER_TIMEZONE,
  OWNER_ROW_KEY,
  type AuthStore,
  type Clock,
  type FounderRow,
  type Logger,
  type Sleep,
} from './types.ts';

/**
 * Twelve characters, and it is a floor rather than a policy.
 *
 * There is no character class rule here on purpose. "At least twelve" is
 * answerable by a founder in a room in four seconds, and a short sentence they
 * will remember beats a mangled short word on every axis including the one that
 * matters, which is whether they can type it again on a phone tomorrow. What
 * makes the passphrase safe is not its shape: it is that it lives in Replit
 * Secrets rather than in their head, that wrong answers are limited per client
 * and slowed deployment wide, and that there is exactly one of them to guess.
 */
export const MIN_PASSPHRASE_LENGTH = 12;

/**
 * What this will hash. A passphrase is typed by a person, so anything past this
 * is a paste or a payload, and sha256 over a megabyte on an unauthenticated
 * route is somebody else deciding how much CPU we spend.
 */
export const MAX_PASSPHRASE_BYTES = 1_024;

/** The audit verb for a refused attempt. Counted, in Postgres, to slow a guesser down. */
export const REFUSED_VERB = 'signin-refused';

/**
 * Passphrases that are not passphrases.
 *
 * Short ones are already refused by the length floor, so this list is for the
 * long ones somebody would still type: the name of the product, the word
 * passphrase, and the sentence from the instructions. Exact matches only, case
 * folded, whitespace collapsed. A list that refused anything CONTAINING these
 * would refuse "the launchhouse app is mine", which is a fine passphrase.
 */
const TOO_EASY: readonly string[] = [
  'password',
  'passphrase',
  'changeme',
  'change me',
  'launchhouse',
  'launchhouse atlanta',
  'owner passphrase',
  'owner_passphrase',
  'your passphrase here',
  'set this to something',
  'letmein',
  'let me in',
  '123456789012',
];

export type Readiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: 'missing' | 'too_short' | 'too_easy' };

/**
 * Is this deployment set up to let anybody in.
 *
 * Pure, so the boot guard and the request path cannot disagree about it, and so
 * a test can walk every refusal without a server.
 */
export function passphraseReadiness(passphrase: string): Readiness {
  const trimmed = passphrase.trim();
  if (trimmed.length === 0) return { ready: false, reason: 'missing' };
  if (trimmed.length < MIN_PASSPHRASE_LENGTH) return { ready: false, reason: 'too_short' };

  const folded = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (TOO_EASY.includes(folded)) return { ready: false, reason: 'too_easy' };
  // One character repeated is long and carries nothing.
  if (new Set(folded.replace(/\s/g, '')).size <= 1) return { ready: false, reason: 'too_easy' };
  return { ready: true };
}

export class OwnerAuthRefused extends Error {
  readonly reason: 'missing' | 'too_short' | 'too_easy';
  constructor(reason: 'missing' | 'too_short' | 'too_easy', message: string) {
    super(message);
    this.name = 'OwnerAuthRefused';
    this.reason = reason;
  }
}

/**
 * The same rule as a throw, for a caller that wants one.
 *
 * DO NOT USE THIS TO END THE PROCESS ON A FOUNDER'S DEPLOYMENT. On Replit an
 * exit is a container that restarts for ever behind a URL that never answers,
 * and the founder sees a blank page with no way to tell a missing passphrase
 * from a crash. That is why src/server/boot/readiness.ts starts the process and
 * lists what is missing instead, and why ./plugin.ts answers every request with
 * a screen naming the variable. Neither of them calls this.
 *
 * It is here for scripts and for tests: a check that has to fail loudly in a
 * terminal, where an exit is the right answer and somebody is reading.
 */
export function assertOwnerAuthReady(passphrase: string): void {
  const state = passphraseReadiness(passphrase);
  if (state.ready) return;
  const detail =
    state.reason === 'missing'
      ? 'OWNER_PASSPHRASE is not set. This app has one user and that variable is the only thing between the internet and their files.'
      : state.reason === 'too_short'
        ? `OWNER_PASSPHRASE is shorter than ${String(MIN_PASSPHRASE_LENGTH)} characters. A short sentence you will remember is ideal.`
        : 'OWNER_PASSPHRASE is one of the obvious ones. Set it to something only you would type.';
  throw new OwnerAuthRefused(state.reason, `${detail} Set it in Replit Secrets, then redeploy.`);
}

export interface OwnerAuthConfig {
  /** OWNER_PASSPHRASE, read once through src/server/env.ts and passed in here. */
  readonly passphrase: string;
  readonly session: SessionConfig;
}

export type SignInOutcome =
  | { readonly kind: 'signed_in'; readonly founder: FounderRow; readonly minted: MintedSession }
  | { readonly kind: 'refused'; readonly reason: 'not_set_up' | 'wrong_passphrase' | 'account_closed' }
  | { readonly kind: 'refused'; readonly reason: 'too_many_tries'; readonly retryAfterMs: number };

/**
 * The ULID alphabet, Crockford base 32, with I, L, O and U left out so no
 * character can be misread down a telephone.
 *
 * DUPLICATED FROM src/server/index.ts ON PURPOSE, and it is eight lines.
 * index.ts imports this module, so importing its generator back would be a
 * cycle at boot, and a cycle in the file that has to run first is a class of
 * failure that costs far more than eight lines. `storage/paths.ts` is the
 * authority on the shape and it refuses anything else, which is what keeps
 * these two honest.
 */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The shape storage/paths.ts refuses anything else against. 26 Crockford characters. */
export const FOUNDER_ID_SHAPE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The owner's id, generated once in the life of a deployment.
 *
 * It becomes a directory name under /tmp/ge, so it is a ULID and never an
 * address. Nothing here needs the time ordering a ULID normally carries,
 * because there is exactly one of them, but the shape is what paths.ts accepts
 * and inventing a second shape for one row would mean two rules about what a
 * founder id is.
 */
export function newFounderId(): string {
  const bytes = new Uint8Array(26);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ULID_ALPHABET[byte % 32] ?? '0';
  return out;
}

export class OwnerAuth {
  constructor(
    private readonly cfg: OwnerAuthConfig,
    private readonly store: AuthStore,
    private readonly attempts: SigninAttempts,
    private readonly clock: Clock,
    private readonly sleep: Sleep,
    private readonly log: Logger,
  ) {}

  readiness(): Readiness {
    return passphraseReadiness(this.cfg.passphrase);
  }

  /**
   * One passphrase box, one button. This is what the button does.
   *
   * THE ORDER OF THE FIRST THREE CHECKS IS THE SECURITY OF THIS FILE. Readiness
   * before anything, so an unconfigured deployment never mints a session. The
   * per client limit before the comparison, so a guesser is refused without
   * costing us a hash. The comparison in constant time, so the answer carries
   * no information about how much of it was right.
   *
   * AND THE OWNER ROW IS CREATED AFTER THE PASSPHRASE IS ACCEPTED, NEVER
   * BEFORE. A wrong guess writes no founder row. Otherwise a stranger who found
   * the URL could claim the deployment by guessing badly, which is the failure
   * the first run claim design was rejected for.
   */
  async signIn(typed: string, clientKey: string): Promise<SignInOutcome> {
    const state = this.readiness();
    if (!state.ready) {
      this.log.warn({ reason: state.reason }, 'sign in refused, OWNER_PASSPHRASE is not usable');
      return { kind: 'refused', reason: 'not_set_up' };
    }

    const verdict = this.attempts.check(clientKey);
    if (!verdict.allowed) {
      this.log.warn({}, 'sign in refused, too many wrong answers from one client');
      return { kind: 'refused', reason: 'too_many_tries', retryAfterMs: verdict.retryAfterMs };
    }

    // Trimmed, because a phone keyboard adds a trailing space and a paste
    // brings a newline, and a founder who typed the right passphrase must not
    // be told it is wrong. Never lower cased: a passphrase is case sensitive
    // and folding it would throw away most of what makes it hard to guess.
    const offered = typed.trim();
    const tooLong = Buffer.byteLength(offered, 'utf8') > MAX_PASSPHRASE_BYTES;

    if (tooLong || !secretsMatch(offered, this.cfg.passphrase.trim())) {
      this.attempts.recordWrong(clientKey);
      await this.recordAndSlow();
      return { kind: 'refused', reason: 'wrong_passphrase' };
    }

    const now = this.clock.now();
    const founder = await this.store.ensureOwner({
      id: newFounderId(),
      email: OWNER_ROW_KEY,
      displayName: null,
      timezone: OWNER_PLACEHOLDER_TIMEZONE,
      track: null,
      disabledAt: null,
      deletedAt: null,
    });

    if (founder.disabledAt !== null || founder.deletedAt !== null) {
      // readSession refuses a disabled row on the very next request, so minting
      // a session here would sign somebody in and out in one round trip, which
      // reads as a loop rather than as a refusal.
      this.log.warn({ founderId: founder.id }, 'sign in refused, the owner row is closed');
      return { kind: 'refused', reason: 'account_closed' };
    }

    this.attempts.forget(clientKey);
    const minted = mintSession(founder.id, this.cfg.session, this.clock);
    await this.store.insertSession(minted.row);
    await this.store.recordAuthEvent(founder.id, 'founder', 'signin', null, now);

    this.log.info({ founderId: founder.id }, 'signed in');
    return { kind: 'signed_in', founder, minted };
  }

  /**
   * Write the refusal down, then wait if this deployment is being guessed at.
   *
   * THE WAIT IS NEVER A REFUSAL. A deployment wide lockout would let anybody
   * who found the URL lock the founder out of their own app during a live
   * session. This costs a guesser everything and costs the founder two seconds
   * once, and the founder is usually not even the client generating the
   * failures.
   *
   * NOTHING IS RECORDED ON A DEPLOYMENT NOBODY HAS CLAIMED. There is no owner
   * row to hang an audit line on, and there is nothing behind the door yet
   * either. The per client limit still applies, because that one is counted in
   * memory and needs no row.
   */
  private async recordAndSlow(): Promise<void> {
    const owner = await this.store.findOwner();
    if (owner === null) return;

    const now = this.clock.now();
    // 'system' rather than 'founder'. We do not know who this was, and writing
    // 'founder' would put a claim in the audit line that is not true.
    await this.store.recordAuthEvent(owner.id, 'system', REFUSED_VERB, null, now);
    const failures = await this.store.countAuthEvents(owner.id, REFUSED_VERB, this.attempts.windowStart());
    const wait = this.attempts.slowdownMs(failures);
    if (wait > 0) {
      this.log.warn({ failures }, 'sign in answers are being slowed down, this deployment is being guessed at');
      await this.sleep(wait);
    }
  }
}
