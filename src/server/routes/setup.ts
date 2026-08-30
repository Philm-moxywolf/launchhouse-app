/**
 * src/server/routes/setup.ts
 *
 * WHAT THIS IS. The setup rail: what is set up, the two first run answers, the
 * state of each step of the GoHighLevel walk, the Location ID, and
 * disconnecting. Plus the two routes that honestly refuse, because the thing
 * they would do has never been proved to work.
 *
 * WHY IT EXISTS. Setup has two finish lines and the app names both. Ready to
 * start is sign in, a name and a timezone, due before session 1, and it blocks
 * everything. Ready to publish is GoHighLevel and an account to post to, due at
 * the clinic on 23 September, and it blocks publishing and sending only. A
 * founder who has done tier one is done for now, and the screen can only say
 * that if this route tells it which rows are in which tier's state.
 *
 * THE TIMEZONE IS THE ONE ANSWER NOTHING ELSE CAN CAPTURE. A laptop knew it and
 * a server does not. It is stored as an IANA name and never an offset, because
 * offsets change twice a year and a 90 day plan built on 27 September runs past
 * the 1 November change. So the write below refuses a zone this Node cannot
 * resolve rather than storing it: a bad zone is silent, and every date after it
 * is wrong by however many hours.
 *
 * TWO ROUTES REFUSE, AND THAT IS THE HONEST ANSWER TODAY.
 *
 *   `POST /api/setup/ghl/token` and `POST /api/setup/ghl/verify` are the screen
 *   that makes the difference: the founder does not get a green tick, they get
 *   evidence, from three reads against GoHighLevel. THE SPIKE HAS NEVER RUN.
 *   Every endpoint, header, field name and status code for those reads is
 *   unverified, which is why `src/server/integrations/contracts/` holds holes
 *   that throw rather than plausible values.
 *
 *   So there are two ways to write these routes. One stores the token and
 *   answers `{ ok: true }`, which is a green tick we invented, on a credential
 *   we cannot use, three weeks before anybody finds out. The other says what is
 *   true: we cannot check it yet, so do not paste it yet. This is the second
 *   one. Nothing unverifiable is put in the database, and the founder is given
 *   the next thing to do rather than a tick.
 *
 *   They answer 501, which is the server saying it does not do this, rather
 *   than 404, which would say there is nothing at that address. The address
 *   exists. What it does is not built.
 *
 * AND ONE ROUTE DOES NOT REFUSE, WHICH IS THE ANTHROPIC KEY.
 *
 *   `POST /api/setup/key` is the first thing a founder does after signing in, and until
 *   today there was nowhere to do it. `boot/readiness.ts` told them to paste their key
 *   into the setup screen; there was no route, no form and no field anywhere that took
 *   one. The key was read once out of the environment at startup, so even a founder who
 *   found Replit Secrets would have needed a restart nobody told them about and that they
 *   cannot perform.
 *
 *   IT IS NOT LIKE THE GOHIGHLEVEL ROUTES ABOVE, AND THE DIFFERENCE IS EVIDENCE. The
 *   GoHighLevel check refuses because nobody has ever made those calls and every field
 *   name in them is a guess. Anthropic's is not a guess: this app already talks to that
 *   API on every turn, the addresses and header names are in the Claude API reference, and
 *   the check below is two real calls whose answer is the founder's answer. So this one
 *   verifies for real, and it does it before the key is stored rather than three screens
 *   later.
 *
 *   THE ORDER IS CHECK, THEN STORE, THEN ANNOUNCE. A key that has not been proved is never
 *   written down, so `set: true` on the screen means Anthropic accepted it and not that
 *   somebody typed something. Storing it puts it in memory, and the holder tells
 *   `boot/readiness.ts`, which drops its blocker and reopens the two routes that start a
 *   turn. That is what makes it work without a restart.
 *
 * WHAT CALLS IT. ./index.ts registers it. The setup screens and the token walk.
 * WHAT IT READS. `founder`, `setup_steps` and `connections`, founder scoped.
 * WHAT IT WRITES. `founder` (name and timezone), `setup_steps`, `connections`.
 */

import type { FastifyInstance, RouteHandlerMethod } from 'fastify';

import { GHL_WALK_STEPS } from '../../../app/content/ghl-walk.ts';
import { GHL_TOKEN_PREFIX_GUESS } from '../integrations/contracts/ghl.ts';
import { checkAnthropicKey, problemOf, readPastedKey, type KeyProblem } from '../agent/anthropic-check.ts';
import { anthropicKeyFor, describeAnthropicKey } from '../agent/anthropic-key.ts';
import { forgetStoredAnthropicKey, saveAnthropicKey } from '../agent/anthropic-key-store.ts';
import { trackOf } from './founder-state.ts';
import { errorBody, type FounderError } from './errors.ts';
import type { SetupStepState } from './ports.ts';
import type { RouteDeps } from './deps.ts';

/** The vendor key on `connections`. One word, and it is not a display name. */
const GHL = 'ghl';
const APOLLO = 'apollo';

/**
 * The step slugs a founder may write.
 *
 * Taken from the walk itself rather than typed out again, so a slug renamed in
 * the copy cannot become a row nobody can write. Anything else is refused: this
 * is a primary key column, and an open key space is a table a browser can fill
 * with whatever it likes.
 */
const STEP_SLUGS: ReadonlySet<string> = new Set(GHL_WALK_STEPS.map((s) => s.slug));

const STEP_STATES: ReadonlySet<string> = new Set([
  'not_started',
  'in_progress',
  'done',
  'skipped',
  'failed',
]);

/** What a founder can write as evidence. Read by a mentor, so it is a sentence, not a file. */
const MAX_EVIDENCE = 500;

/**
 * A Location ID is a house number, not a password. It is still bounded.
 *
 * The real shape is unverified, so nothing here checks a pattern. What it does
 * check is that the value could not be a token, which is the mistake this field
 * invites: the box is deliberately not masked, it sits one screen before the
 * one that asks for the token, and a founder who pastes the wrong clipboard
 * into it would otherwise have their credential written to a column that is not
 * encrypted.
 */
const MAX_LOCATION_ID = 200;

/** The `pit-` guard from receipt.sh:110, run before any value is stored. */
export function looksLikeAToken(value: string): boolean {
  return value.toLowerCase().includes(GHL_TOKEN_PREFIX_GUESS);
}

/**
 * Every sentence this file refuses with.
 *
 * Written here rather than inline so they can be read together, in one place,
 * the way a founder meets them: name the doubt, say what is true, end on
 * something to do.
 */
export const SETUP_ERRORS = {
  badName: {
    status: 400,
    code: 'bad_name',
    message: 'We need something to call you. Type a name and press Start.',
  },
  badTimezone: {
    status: 400,
    code: 'bad_timezone',
    message: 'We do not recognise that place, so a time in your plan would come out wrong. Pick one from the list and try again.',
  },
  unknownStep: {
    status: 400,
    code: 'unknown_step',
    message: 'We do not have a step by that name. Go back to the setup list and pick from there.',
  },
  badStepState: {
    status: 400,
    code: 'bad_step_state',
    message: 'That did not arrive in a form we can read. Reload the page and try it again.',
  },
  badLocationId: {
    status: 400,
    code: 'bad_location_id',
    message: 'That does not look like a Location ID. It is the short code from Settings, then Business Profile, and it is not the token.',
  },
  looksLikeAToken: {
    status: 400,
    code: 'looks_like_a_token',
    message: 'That looks like your private token, and this box is not the place for it. Nothing was saved. Copy the Location ID from Settings, then Business Profile, and paste that instead.',
  },
  /**
   * The two that are not built. 501, and the sentence carries the date of the
   * clinic, because "not yet" with no date is the same as "never" to somebody
   * trying to finish a checklist.
   */
  ghlCheckNotBuilt: {
    status: 501,
    code: 'ghl_check_not_built',
    message:
      'We cannot check a GoHighLevel token yet, so there is no point pasting one in. Nothing you have made is affected. Bring the token to the setup clinic on 23 September and a mentor will connect it with you.',
  },
} as const satisfies Record<string, FounderError>;

/**
 * Does this paste begin the way a GoHighLevel token is guessed to begin?
 *
 * `startsWith`, not `includes`, and the difference matters here where it did not in the
 * Location ID box. An Anthropic key is around a hundred characters of near random text, so
 * `includes('pit-')` would refuse a perfectly good key roughly once in twelve thousand
 * pastes. Across 130 founders that is unlikely and it is not impossible, and the founder it
 * happened to would be told their correct key was somebody else's token.
 *
 * IT DOES NOT BLOCK. contracts/ghl.ts says the prefix is a guess and that a guess must
 * never stop a founder who has pasted the right thing. So the key is sent to Anthropic
 * either way, and this only changes which sentence a REFUSED key comes back with.
 */
export function startsLikeAGhlToken(value: string): boolean {
  return value.toLowerCase().startsWith(GHL_TOKEN_PREFIX_GUESS);
}

/**
 * Codes that mean the key itself is finished, as opposed to a bad moment.
 *
 * A recheck that lands on one of these forgets the stored key, because a key Anthropic has
 * stopped accepting is worse than no key: the blocker stays down, turns keep being
 * admitted, and every one of them fails. Anything else, a rate limit or a bad minute at
 * Anthropic, leaves the key exactly where it was.
 */
const KEY_IS_FINISHED: readonly string[] = ['key_not_accepted', 'key_not_allowed'];

/**
 * Is this a zone this machine can actually convert with?
 *
 * Asked of Node rather than checked against a list, because the list that
 * matters is the one the process will use when it renders a founder a time. A
 * zone that passes a regex and throws at render is a founder whose plan has no
 * dates in it.
 */
export function isRealTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function readString(body: unknown, field: string, maxBytes: number): string | null {
  if (body === null || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || Buffer.byteLength(trimmed, 'utf8') > maxBytes) return null;
  return trimmed;
}

export async function registerSetupRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  /**
   * Everything the setup screens read, in one request.
   *
   * WHAT IT DOES NOT CLAIM, and this is the whole shape of the answer today.
   * `locationName` is null and `accounts` is empty because naming the page and
   * the Instagram handle back to a founder is the proof that the connection
   * works, and we have never made that read. `contacts` is `not_checked`
   * because the tool name for it is not known at all. Rule 5 applies to our own
   * screens: a tick could be a bug, and we do not have one to show.
   *
   * RULE 1 IS STRUCTURAL. The `apollo` key is absent for a B2C founder, not
   * false and not skipped. A skip line saying "not needed on your track" is
   * still the other track's material on their screen.
   */
  app.get('/api/setup', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);

    const [rows, ghl] = await Promise.all([
      deps.store.listSetupSteps(founder.id),
      deps.store.findConnection(founder.id, GHL),
    ]);

    const steps: Record<string, { state: SetupStepState; evidence: string | null }> = {};
    for (const row of rows) steps[row.stepId] = { state: row.state, evidence: row.detail };

    const apollo =
      trackOf(founder) === 'b2b'
        ? { apollo: { connected: (await deps.store.findConnection(founder.id, APOLLO))?.status === 'connected' } }
        : {};

    return reply.send({
      profile: { name: founder.displayName, timezone: founder.timezone },
      steps,
      /**
       * READ OUT OF MEMORY, NOT OUT OF THE DATABASE, AND THAT IS DELIBERATE.
       *
       * The holder is what the running app will actually use on the next turn. A row in
       * `connections` that this process has not loaded is a key the next turn would not
       * use, so reporting it as set would be a tick that is wrong in the one direction
       * that matters. The rows are loaded once at boot, below, and after that memory and
       * the database say the same thing because nothing writes one without the other.
       *
       * No key material, no prefix and no part of one. A boolean, a length and a date.
       */
      anthropic: describeAnthropicKey(founder.id),
      ghl: {
        connected: ghl?.status === 'connected',
        locationId: ghl?.locationId ?? null,
        locationName: null,
        accounts: [],
        contacts: 'not_checked',
        tokenMadeAt: ghl?.verifiedAt?.toISOString() ?? null,
      },
      ...apollo,
    });
  });

  /**
   * Paste the key, check it against Anthropic, and keep it only if it worked.
   *
   * 200 EITHER WAY, AND THAT IS NOT SLOPPINESS. The request did what it was asked: it
   * checked a key. A key Anthropic refused is an answer, not a failure of ours, and it
   * carries a title, an action and Anthropic's own words. Sending it as a 4xx would put it
   * through the browser's general refusal handling, which has one sentence for everything
   * and would throw away the two fields the founder needs. The GoHighLevel verify route
   * answers the same way, for the same reason. A malformed request is still a refusal, and
   * `readPastedKey` produces one.
   */
  app.post('/api/setup/key', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);

    const read = readPastedKey((request.body as { key?: unknown } | undefined)?.key);
    if (!read.ok) {
      // The code, never the value. Nothing about what they pasted reaches a log line.
      deps.log.info({ founderId: founder.id, code: read.problem.code }, 'a pasted Anthropic key was not usable as typed');
      return reply.send({ saved: false, problem: read.problem, anthropic: describeAnthropicKey(founder.id) });
    }

    const check = await checkAnthropicKey(read.key);
    if (!check.ok) {
      const problem: KeyProblem =
        check.problem.code === 'key_not_accepted' && startsLikeAGhlToken(read.key)
          ? { ...problemOf('wrong_box'), vendorSaid: check.problem.vendorSaid }
          : check.problem;
      deps.log.warn({ founderId: founder.id, code: problem.code }, 'Anthropic did not accept a pasted key');
      return reply.send({ saved: false, problem, anthropic: describeAnthropicKey(founder.id) });
    }

    try {
      await saveAnthropicKey(founder.id, read.key, check.checkedAt);
    } catch {
      // The message is not carried. It is a driver's writing and it can hold a connection
      // string. What matters is that the founder is not told this worked.
      deps.log.error({ founderId: founder.id }, 'an Anthropic key passed its check and could not be written to the database');
      return reply.send({ saved: false, problem: problemOf('not_saved'), anthropic: describeAnthropicKey(founder.id) });
    }

    deps.log.info(
      { founderId: founder.id, provedWith: check.provedWith },
      'an Anthropic key was checked, stored and is now live. Turns can run without a restart.',
    );
    return reply.send({ saved: true, anthropic: describeAnthropicKey(founder.id) });
  });

  /**
   * Check the key that is already there.
   *
   * WHY A SECOND BUTTON EXISTS. A key can stop working after it was stored: somebody
   * deletes it in the console, the account runs out of credit, the card on it expires.
   * Every one of those turns into "That one did not finish" on a founder's next turn,
   * which reads as the app being broken. This is the button that answers "is it me".
   */
  app.post('/api/setup/key/check', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);

    const key = anthropicKeyFor(founder.id, '');
    if (key === '') return reply.send({ saved: false, problem: problemOf('empty'), anthropic: describeAnthropicKey(founder.id) });

    const check = await checkAnthropicKey(key);
    if (!check.ok) {
      if (KEY_IS_FINISHED.includes(check.problem.code)) {
        try {
          // Forgotten on purpose. See KEY_IS_FINISHED: a key Anthropic will not accept is
          // worse than no key, because the gate stays open and every turn behind it fails.
          await forgetStoredAnthropicKey(founder.id, deps.clock.now());
          deps.log.warn({ founderId: founder.id, code: check.problem.code }, 'a stored Anthropic key stopped working and was removed');
        } catch {
          /*
            THE NEWS THE FOUNDER CAME FOR STILL GETS THROUGH.
            
            Tidying up our own copy is our problem, not theirs, and it fails when the
            database is unreachable. Letting it throw turned "Anthropic will not accept
            your key" into a 500, which reads as the app being broken and hides the one
            sentence that would have told them what to do. The key stays where it was,
            because the database write comes before the memory clear, so nothing is now
            half removed.
          */
          deps.log.error({ founderId: founder.id }, 'a stored Anthropic key stopped working and our copy could not be removed');
        }
      } else {
        deps.log.warn({ founderId: founder.id, code: check.problem.code }, 'a stored Anthropic key could not be checked just now');
      }
      /**
        * THE KEY STATE GOES BACK WITH THE FAILURE, AND THE SCREEN MUST NOT GUESS IT.
        *
        * Some of these failures threw the key away just above and some left it exactly
        * where it was. A browser that decided for itself would clear the row on a rate
        * limit, and the founder would be looking at a paste box asking for a key that is
        * still stored and still working. So the answer carries what is true now.
        */
      return reply.send({ saved: false, problem: check.problem, anthropic: describeAnthropicKey(founder.id) });
    }

    // Written again so `verifiedAt` is the last time it was actually proved, rather than
    // the first. A mentor asking "when did this last work" needs the second number.
    try {
      await saveAnthropicKey(founder.id, key, check.checkedAt);
    } catch {
      deps.log.warn({ founderId: founder.id }, 'an Anthropic key still works and the checked at time could not be written');
    }
    return reply.send({ saved: true, anthropic: describeAnthropicKey(founder.id) });
  });

  /**
   * Take our copy away.
   *
   * REMOVING OUR COPY DOES NOT SWITCH THE KEY OFF AT ANTHROPIC, and the screen says so in
   * as many words. A founder told "removed" who believes the key is dead has a live
   * credential they have stopped thinking about. The order is on the screen: remove it
   * here, then delete it at console.anthropic.com.
   */
  app.post('/api/setup/key/forget', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    await forgetStoredAnthropicKey(founder.id, deps.clock.now());
    deps.log.info({ founderId: founder.id }, 'a founder removed their Anthropic key. Our copy is gone; the key is not');
    return reply.code(204).send();
  });

  /**
   * The two questions of the first run screen.
   *
   * NO TRACK QUESTION, and there never will be one here. Rule 1 says the fork
   * happens once, in the Founder Brain. Asking here would fork it twice and the
   * two answers would disagree the first time somebody changed their mind. This
   * route cannot write the track column: the store method it calls does not
   * take one.
   */
  app.post('/api/setup/profile', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);

    const name = readString(request.body, 'name', 200);
    if (name === null) return reply.code(SETUP_ERRORS.badName.status).send(errorBody(SETUP_ERRORS.badName));

    const timezone = readString(request.body, 'timezone', 100);
    if (timezone === null || !isRealTimezone(timezone)) {
      return reply.code(SETUP_ERRORS.badTimezone.status).send(errorBody(SETUP_ERRORS.badTimezone));
    }

    await deps.store.saveProfile(founder.id, name, timezone);
    deps.log.info({ founderId: founder.id, timezone }, 'the first run answers were saved');
    return reply.code(204).send();
  });

  /**
   * One step of the walk.
   *
   * Written on ENTERING a step, not on leaving it, so a closed tab resumes
   * where the founder actually was rather than where they last succeeded. That
   * is why this runs far more often than it changes anything, and why the store
   * upserts on the composite key rather than inserting.
   */
  app.post('/api/setup/steps/:slug', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const { slug } = request.params as { slug: string };

    if (!STEP_SLUGS.has(slug)) {
      return reply.code(SETUP_ERRORS.unknownStep.status).send(errorBody(SETUP_ERRORS.unknownStep));
    }

    const body = request.body as { state?: unknown; evidence?: unknown } | undefined;
    if (typeof body?.state !== 'string' || !STEP_STATES.has(body.state)) {
      return reply.code(SETUP_ERRORS.badStepState.status).send(errorBody(SETUP_ERRORS.badStepState));
    }

    let evidence: string | null = null;
    if (typeof body.evidence === 'string' && body.evidence.trim() !== '') {
      evidence = body.evidence.trim().slice(0, MAX_EVIDENCE);
      // A secret written into a row is a secret in the next backup and in the
      // next support screenshot. The founder is told, rather than having it
      // quietly dropped, because they need to know it did not save.
      if (looksLikeAToken(evidence)) {
        deps.log.warn({ founderId: founder.id, slug }, 'a step evidence string looked like a token and was refused');
        return reply.code(SETUP_ERRORS.looksLikeAToken.status).send(errorBody(SETUP_ERRORS.looksLikeAToken));
      }
    }

    await deps.store.recordSetupStep({
      founderId: founder.id,
      stepId: slug,
      state: body.state as SetupStepState,
      detail: evidence,
      at: deps.clock.now(),
    });
    return reply.code(204).send();
  });

  /** The Location ID. Not a secret, and it survives a resume. */
  app.post('/api/setup/ghl/location', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);

    const locationId = readString(request.body, 'locationId', MAX_LOCATION_ID);
    if (locationId === null) {
      return reply.code(SETUP_ERRORS.badLocationId.status).send(errorBody(SETUP_ERRORS.badLocationId));
    }
    if (looksLikeAToken(locationId)) {
      deps.log.warn({ founderId: founder.id }, 'a token shaped value was pasted into the Location ID box and was refused');
      return reply.code(SETUP_ERRORS.looksLikeAToken.status).send(errorBody(SETUP_ERRORS.looksLikeAToken));
    }

    await deps.store.saveLocationId(founder.id, GHL, locationId, deps.clock.now());
    return reply.code(204).send();
  });

  /**
   * Paste the token, and check it.
   *
   * Both refuse, for the reason in the header of this file. They are registered
   * rather than absent so the browser gets a sentence written for a founder
   * instead of "there is nothing at that address", and so the contract test can
   * see that the address exists.
   */
  const notBuilt: RouteHandlerMethod = async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    deps.log.warn(
      { founderId: founder.id, path: request.url.split('?')[0] ?? '' },
      'a founder reached the GoHighLevel check, which is not built because the spike has never run',
    );
    return reply.code(SETUP_ERRORS.ghlCheckNotBuilt.status).send(errorBody(SETUP_ERRORS.ghlCheckNotBuilt));
  };

  app.post('/api/setup/ghl/token', notBuilt);
  app.post('/api/setup/ghl/verify', notBuilt);

  /**
   * Disconnect.
   *
   * DELETING OUR COPY REVOKES NOTHING, and the screen says so in as many words.
   * A founder told "disconnected" who believes the token is dead has a live
   * credential they have stopped thinking about. The order matters and the copy
   * carries it: disconnect here, then delete the integration in GoHighLevel.
   */
  app.post('/api/setup/ghl/disconnect', async (request, reply) => {
    if (!(await deps.auth.requireFounder(request, reply))) return reply;
    const founder = deps.auth.founderOf(request);
    const at = deps.clock.now();

    await deps.store.forgetConnection(founder.id, GHL, at);
    // The walk resumes at "paste the token", because we never held the token in
    // a form we could put back on screen. Recorded rather than inferred, so a
    // founder who closes the tab comes back to the right screen.
    await deps.store.recordSetupStep({
      founderId: founder.id,
      stepId: 'paste-token',
      state: 'not_started',
      detail: null,
      at,
    });
    deps.log.info({ founderId: founder.id }, 'a founder disconnected GoHighLevel. Our copy is gone; the token is not');
    return reply.code(204).send();
  });
}
