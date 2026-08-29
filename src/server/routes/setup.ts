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
 * WHAT CALLS IT. ./index.ts registers it. The setup screens and the token walk.
 * WHAT IT READS. `founder`, `setup_steps` and `connections`, founder scoped.
 * WHAT IT WRITES. `founder` (name and timezone), `setup_steps`, `connections`.
 */

import type { FastifyInstance, RouteHandlerMethod } from 'fastify';

import { GHL_WALK_STEPS } from '../../../app/content/ghl-walk.ts';
import { GHL_TOKEN_PREFIX_GUESS } from '../integrations/contracts/ghl.ts';
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
