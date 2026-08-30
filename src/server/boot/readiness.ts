/**
 * src/server/boot/readiness.ts
 *
 * WHAT THIS IS. The list of things that are missing, in words a founder can act on, plus
 * the screen that shows the list and the gate that refuses work while it stands.
 *
 * WHY IT EXISTS. Boot used to answer one question, "may this process start", and it
 * answered by exiting. Every one of those exits was correct for one deployment we operated
 * and wrong for 130 deployments a founder operates. On Replit an exit is a container that
 * restarts for ever behind a URL that never answers. The founder sees a blank page. Nobody
 * in the room can tell a missing database from a missing key from a crashed process,
 * because all three look the same.
 *
 * So the process starts, and this file answers a different question: WHAT IS MISSING, AND
 * WHAT DOES THE PERSON DO ABOUT IT. Three parts, and they are here together on purpose,
 * because the day they drift is the day the screen says one thing and the gate does another:
 *
 *   1. blockersFrom() turns the boot facts into a list. Pure, so it is tested directly.
 *   2. startHerePage() renders that list. Server rendered, so it works before the browser
 *      bundle has been built and with JavaScript switched off.
 *   3. ReadinessState plus the two gates refuse work while anything is on the list.
 *
 * FAIL CLOSED IS STILL THE RULE. Nothing here makes the app more permissive. A missing
 * database used to stop the process; now it stops every API request with a sentence, and
 * the founder can read the sentence. A missing engine used to stop the process; now it
 * stops turns. In both cases the amount of founder work that can be silently lost is the
 * same, which is none, and the amount they can understand went from nothing to all of it.
 *
 * THE PASSPHRASE IS ON THE LIST AND IS NOT ONE OF THE GATES. auth/plugin.ts already answers
 * every request with its own screen when OWNER_PASSPHRASE is unusable, and it does that
 * better than a general page could. It is listed here so that a founder who is missing three
 * things reads three things in one place, and `handledElsewhere` is what stops this file
 * taking over a screen that belongs to auth.
 *
 * WHAT CALLS IT. src/server/index.ts, in main() and in buildServer(). Its own test.
 * WHAT IT READS. Only what it is handed. WHAT IT WRITES. Replies, and its own state.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { escapeHtml, layout } from '../auth/pages.ts';
import { onAnthropicKeyChanged } from '../agent/anthropic-key.ts';

export type BlockerId =
  | 'database'
  | 'schema'
  | 'engine'
  | 'platformCli'
  | 'masterKey'
  | 'anthropicKey'
  | 'passphrase';

/** Where a founder signs in. One constant, because the page and its link must not drift. */
export const SIGN_IN_PATH = '/auth/signin';

/**
 * One missing thing.
 *
 * THE THREE FIELDS ARE THE HOUSE RULE MADE INTO A TYPE. `heading` says what happened.
 * `what` names the doubt the founder already has before answering it. `doThis` is an
 * action, never a feeling. A blocker that cannot fill all three is a blocker nobody can act
 * on, and writing it as three fields is what stops one being left out.
 */
export interface Blocker {
  readonly id: BlockerId;
  readonly heading: string;
  readonly what: string;
  readonly doThis: string;
  /** True when another part of the app owns this one's screen. See the file header. */
  readonly handledElsewhere: boolean;
  /** True when a turn must not be started while this stands. */
  readonly blocksTurns: boolean;
  /** True when nothing that reaches the API can work while this stands. */
  readonly blocksEverything: boolean;
}

/** The boot facts, gathered by main() and handed here. Nothing is read from the process. */
export interface ReadinessFacts {
  readonly databaseUrlSet: boolean;
  readonly databaseAnswered: boolean;
  /**
   * The founder sentence from a failed migration, or undefined when the tables are there.
   *
   * A DATABASE THAT ANSWERS IS NOT A DATABASE THAT IS SET UP, and telling those two apart is
   * what this fact is for. Before boot ran the migration, a fresh Replit database answered
   * `select 1`, /healthz said ok, the start page showed nothing, and POST /auth/signin
   * answered 500 with an incident id. See boot/schema.ts.
   */
  readonly schemaRefusal: string | undefined;
  readonly engineReady: boolean;
  /**
   * The founder sentence from a CLI that could not be resolved or could not be run, or
   * undefined when it ran. See boot/platform-cli.ts for why resolving is not enough.
   */
  readonly platformCliRefusal: string | undefined;
  /** The founder sentence from a master key refusal, or undefined when there was none. */
  readonly masterKeyRefusal: string | undefined;
  readonly anthropicKeySet: boolean;
  readonly passphraseSet: boolean;
}

/**
 * Turn the boot facts into the list.
 *
 * ORDER IS THE ORDER TO FIX THEM IN, not the order they were checked. A founder with no
 * database and no key fixes the database first, because the key is stored in it.
 */
export function blockersFrom(facts: ReadinessFacts): Blocker[] {
  const out: Blocker[] = [];

  if (!facts.databaseUrlSet) {
    out.push({
      id: 'database',
      heading: 'There is no database yet',
      what: 'Everything you write is kept in a database. This app cannot find one, so nothing can be saved.',
      doThis: 'Open this project on Replit. Open the Database pane and create a Postgres database. Replit fills in the connection details itself. Then reload this page.',
      handledElsewhere: false,
      blocksTurns: true,
      blocksEverything: true,
    });
  } else if (!facts.databaseAnswered) {
    out.push({
      id: 'database',
      heading: 'The database is not answering',
      what: 'A database is set up and it did not reply. Nothing can be saved until it does, so the app is refusing to pretend otherwise.',
      doThis: 'Open this project on Replit, open the Database pane, and check the database is running. Then reload this page.',
      handledElsewhere: false,
      blocksTurns: true,
      blocksEverything: true,
    });
  }

  /**
   * SECOND, BECAUSE IT IS THE DATABASE'S PROBLEM AND NOT A SEPARATE ONE. A founder with no
   * database never sees this: boot does not try to migrate a database that did not answer,
   * so schemaRefusal stays undefined and they read one line about the database rather than
   * two lines about one cause.
   *
   * IT BLOCKS EVERYTHING. Every API route in the app reads or writes a founder's record, and
   * with no tables every one of them fails the same way: a 500 carrying an incident id. That
   * 500 is the failure this whole blocker exists to replace, so letting any of them through
   * would put it straight back.
   */
  if (facts.schemaRefusal !== undefined) {
    out.push({
      id: 'schema',
      heading: 'Your database is not set up yet',
      what: facts.schemaRefusal,
      doThis: 'Show this screen to somebody from the Launchhouse team. They have one command to run and it takes a few seconds.',
      handledElsewhere: false,
      blocksTurns: true,
      blocksEverything: true,
    });
  }

  if (facts.masterKeyRefusal !== undefined) {
    out.push({
      id: 'masterKey',
      heading: 'The key to your files needs attention',
      what: facts.masterKeyRefusal,
      doThis: 'Do not start again from scratch and do not set a new key. Show this screen to somebody from the Launchhouse team.',
      handledElsewhere: false,
      blocksTurns: true,
      // Reading is refused too. A key that cannot open the files makes every read a
      // failure, and a half working app is harder to diagnose than one that says why.
      blocksEverything: true,
    });
  }

  if (!facts.engineReady) {
    out.push({
      id: 'engine',
      heading: 'The writing engine is missing',
      what: 'The skills and templates that write your files live in a folder inside this app called vendor/growth-engine. It is not in this copy, so nothing can be written.',
      doThis: 'This is a problem with the copy you were given, not with anything you did. Tell whoever is running the room.',
      handledElsewhere: false,
      blocksTurns: true,
      blocksEverything: false,
    });
  }

  /**
   * NEXT TO THE ENGINE, BECAUSE IT IS THE SAME KIND OF FAULT. Both are a part of the app
   * that did not arrive in this copy, and for both the founder's action is to tell somebody.
   * They are two blockers rather than one because they are fixed differently: the engine is
   * a folder that ships with the repository, and this is a package npm was allowed to skip.
   *
   * IT DOES NOT BLOCK EVERYTHING. Signing in, reading files and pasting a key all work
   * without the CLI. Only writing needs it, so only turns are refused.
   */
  if (facts.platformCliRefusal !== undefined) {
    out.push({
      id: 'platformCli',
      heading: 'Part of Claude did not install',
      what: facts.platformCliRefusal,
      doThis: 'This is a problem with the copy you were given, not with anything you did. Tell whoever is running the room.',
      handledElsewhere: false,
      blocksTurns: true,
      blocksEverything: false,
    });
  }

  if (!facts.anthropicKeySet) {
    out.push({
      id: 'anthropicKey',
      heading: 'Your Anthropic key is not set',
      what: 'Everything this app writes is written by Claude, and Claude needs an API key that belongs to you. An API key is a long password that lets this app use your account. There is not one here yet.',
      // IT NAMES SIGNING IN FIRST. The old wording was "go to the setup screen", and the
      // setup screen is behind sign in, so a founder who followed it went looking for a
      // screen they could not reach yet from a page that had no links on it at all.
      doThis: 'Sign in below with your passphrase, then paste your Anthropic API key into the setup screen. You get a key at console.anthropic.com.',
      /**
       * TRUE, LIKE THE PASSPHRASE, AND FOR THE SAME REASON: SOMEBODY ELSE OWNS THIS SCREEN.
       *
       * src/web/routes/Setup.tsx now has the box, checks the key against Anthropic and
       * stores it. That screen is inside the browser app, the browser app is served at
       * GET /, and GET / is the request this page takes over. With false here, a founder
       * whose only missing thing was the key read a page telling them to sign in and paste
       * a key, signed in, was redirected to /, and read the same page again. Sign in
       * redirects to / and / was this page: there was no way through it from inside the
       * app, on the first screen of the first deployment.
       *
       * It is still LISTED whenever something else is missing too, so a founder missing
       * three things still reads three things in one place. It only stands back when it is
       * the one thing left, because then the screen that fixes it is one click away.
       */
      handledElsewhere: true,
      // Reads are fine. The setup screen is a read and a write, and gating it would lock
      // the founder out of the one screen that fixes this.
      blocksTurns: true,
      blocksEverything: false,
    });
  }

  if (!facts.passphraseSet) {
    out.push({
      id: 'passphrase',
      heading: 'There is no passphrase yet',
      what: 'This app is on a public address, so it needs a passphrase before anybody can sign in. Yours is not set.',
      doThis: 'Open this project on Replit, click Secrets, and set OWNER_PASSPHRASE to a short sentence you will remember. Make it at least 12 characters.',
      handledElsewhere: true,
      blocksTurns: true,
      blocksEverything: false,
    });
  }

  return out;
}

/**
 * The first screen, when there is one to show.
 *
 * SERVER RENDERED, and that is not a style choice. The browser bundle is a build artefact.
 * A copy of the app that never ran `npm run build`, or a deployment whose build step
 * failed, has no bundle at all, and that is exactly the copy most likely to be missing
 * other things too. A page rendered here works in both states and with JavaScript off.
 *
 * IT HAS A LINK ON IT NOW, AND THAT WAS THE WHOLE OF THE THIRD FAULT. This page shipped
 * with no anchors at all. A founder landed on it, read "go to the setup screen", and had
 * no way to go anywhere: no menu, no address they could guess, nothing to click. The page
 * that exists to unstick people was itself a dead end.
 *
 * THE LINK IS CONDITIONAL, AND THE CONDITION IS THE POINT. Sign in is offered only when
 * nothing on the list blocks everything. The sign in PAGE renders without touching the
 * database on purpose, but the sign in BUTTON writes a session row, so offering the link
 * while the database is unreachable or unmigrated walks the founder straight into the 500
 * this work exists to remove. A link that leads to a broken screen is worse than no link,
 * because the founder blames themselves for following it.
 *
 * THE COPY IS WRITTEN FOR SOMEBODY WHO PRESSED REMIX FOUR MINUTES AGO. They do not know
 * what a migration is, whether this app is theirs or shared, or whether they have already
 * broken something. So the first line says what this is, the second says nothing is broken,
 * and the list comes third. Naming the doubt before answering it is the house rule, and on
 * this screen the doubt is always the same one: did I do this?
 */
export function startHerePage(blockers: readonly Blocker[]): string {
  const items = blockers
    .map(
      (b) => `<li>
<h2>${escapeHtml(b.heading)}</h2>
<p>${escapeHtml(b.what)}</p>
<p><strong>${escapeHtml(b.doThis)}</strong></p>
</li>`,
    )
    .join('\n');

  const count = blockers.length;
  const opener =
    count === 1
      ? 'One thing is missing, and it is listed below.'
      : `${String(count)} things are missing, and they are listed below.`;

  // Nothing on the list stops a session being written, so sign in works today.
  const canSignIn = !blockers.some((b) => b.blocksEverything);
  const next = canSignIn
    ? `<p class="row"><a href="${SIGN_IN_PATH}">Sign in</a></p>
<p class="quiet">Signing in works now. The rest of the list is done from inside the app or by somebody from the Launchhouse team.</p>`
    : `<p class="row">Work down the list in order, then reload this page.</p>
<p class="quiet">Signing in will not work until the list is empty, so there is no point trying it yet.</p>`;

  return layout(
    'Start here',
    `<h1>Start here</h1>
<p>This is your own copy of the Launchhouse app. It is running, and nobody else is in it.</p>
<p>Nothing is broken and you have not done anything wrong. A new copy always starts with a few things to fill in. ${escapeHtml(opener)}</p>
<ol>
${items}
</ol>
${next}
<style>
  h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }
  ol > li { margin-bottom: 1.6rem; }
  /* Big enough to hit with a thumb. This is the only way off this page. */
  .row a { display: inline-block; font-weight: 600; padding: 0.75rem 1.4rem;
           border: 1px solid currentColor; border-radius: 8px; text-decoration: none; }
</style>`,
  );
}

/**
 * What is missing right now.
 *
 * WHY IT IS A LIVE OBJECT RATHER THAN A LIST COMPUTED ONCE. Two of these change while the
 * process runs. The founder pastes an Anthropic key into the setup screen, and the database
 * can come back after it went away. A list frozen at boot would keep telling a founder to do
 * something they have already done, which is the fastest way to teach somebody to ignore a
 * screen. Whoever stores the pasted key calls set() with the new facts.
 */
export class ReadinessState {
  private facts: ReadinessFacts;
  private current: readonly Blocker[];

  constructor(facts: ReadinessFacts) {
    this.facts = facts;
    this.current = blockersFrom(facts);
    /**
     * THE ONE FACT THAT CHANGES WHILE THE PROCESS RUNS, SUBSCRIBED TO RATHER THAN POLLED.
     *
     * The founder pastes their Anthropic key into the running app and the holder in
     * src/server/agent/anthropic-key.ts says so. Without this line the list computed on
     * the line above stands until somebody restarts the container, so the gate keeps
     * refusing turns while the screen tells the founder to do the thing they have just
     * done. A founder cannot restart a Replit deployment, and nobody tells them to.
     *
     * A push and not a getter, because the list is computed once and then held. A getter
     * would be read here, at boot, and never again.
     */
    onAnthropicKeyChanged((keyIsSet) => {
      this.anthropicKeyStored(keyIsSet);
    });
  }

  set(facts: ReadinessFacts): void {
    this.facts = facts;
    this.current = blockersFrom(facts);
  }

  /**
   * One fact changed, and every other fact is kept.
   *
   * A caller handing over the whole ReadinessFacts would have to know whether the database
   * answered and whether the engine is there, and the code that stores a key knows
   * neither. A stale value for either would put back a blocker somebody has already
   * fixed, or take away one that still stands.
   */
  anthropicKeyStored(keyIsSet: boolean): void {
    this.set({ ...this.facts, anthropicKeySet: keyIsSet });
  }

  blockers(): readonly Blocker[] {
    return this.current;
  }

  /** Nothing at all is missing. */
  ready(): boolean {
    return this.current.length === 0;
  }

  /**
   * What goes on the first screen, which is ALL of it or NONE of it.
   *
   * THE RULE IS NOT "hide the ones somebody else owns", and getting that wrong was worth a
   * test. If this file is showing a screen at all, the founder should read the complete
   * list on it: sending them to fix the passphrase, and only then telling them the database
   * is missing too, is two trips to whoever is running the room for one conversation. But
   * if the passphrase is the ONLY thing missing, this file stands back entirely, because
   * auth/plugin.ts owns that screen and says it better than a general list could.
   */
  ownScreen(): readonly Blocker[] {
    const mine = this.current.filter((b) => !b.handledElsewhere);
    return mine.length === 0 ? [] : this.current;
  }

  blockingEverything(): readonly Blocker[] {
    return this.current.filter((b) => b.blocksEverything);
  }

  blockingTurns(): readonly Blocker[] {
    return this.current.filter((b) => b.blocksTurns);
  }

  /** For /healthz and for the log line at boot. Words, not booleans. */
  describe(): { ready: boolean; blockers: { id: BlockerId; heading: string; doThis: string }[] } {
    return {
      ready: this.ready(),
      blockers: this.current.map((b) => ({ id: b.id, heading: b.heading, doThis: b.doThis })),
    };
  }
}

/** The JSON an API caller gets while something is missing. Same words as the screen. */
export function blockedBody(blockers: readonly Blocker[]): {
  error: string;
  message: string;
  blockers: { id: BlockerId; heading: string; doThis: string }[];
} {
  const first = blockers[0];
  return {
    error: 'not_ready',
    message:
      first === undefined
        ? 'This app is not ready yet. Open the start page to see what it needs.'
        : `${first.heading}. ${first.doThis}`,
    blockers: blockers.map((b) => ({ id: b.id, heading: b.heading, doThis: b.doThis })),
  };
}

/** Paths that start a turn. Anything on this list is refused while an engine or key is missing. */
const TURN_PATHS: readonly RegExp[] = [
  /^\/api\/threads\/?$/,
  /^\/api\/threads\/[^/]+\/messages\/?$/,
];

/**
 * Is this request one that would start a turn.
 *
 * MATCHED ON METHOD AND PATH RATHER THAN GUESSED FROM THE VERB. Every POST is not a turn:
 * the setup screen posts, and gating it would lock a founder out of the one screen that
 * fixes the thing being gated. Two routes start work, they are named here, and routes/
 * did not have to change for it.
 */
export function startsATurn(method: string, url: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  const path = url.split('?')[0] ?? '';
  return TURN_PATHS.some((re) => re.test(path));
}

/**
 * Put the gates on. Called from buildServer BEFORE any route is registered, because a
 * Fastify hook applies to routes registered after it and to nothing before it.
 *
 * THREE HOOKS, NOT ONE, because they refuse different things for different reasons:
 *
 *   The first answers GET / with the start page. It is the property this whole change is
 *   about: boot with nothing set, reach a screen, be told what to do.
 *   The second refuses every API request when the record is unreachable. A request that
 *   cannot read or write the record cannot do anything true.
 *   The third refuses the two routes that start a turn when the engine or the key is
 *   missing. A turn started without either produces "That one did not finish", which reads
 *   to a founder as the app being broken rather than as a thing they can fix.
 */
export function installReadinessGates(app: FastifyInstance, state: ReadinessState): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split('?')[0] ?? '';

    // GET / and nothing else. A founder lands on the root; every other address is either an
    // API call, which gets JSON below, or a page that belongs to somebody else.
    if (request.method === 'GET' && (path === '/' || path === '')) {
      const mine = state.ownScreen();
      if (mine.length > 0) {
        return reply
          .code(200)
          .header('content-type', 'text/html; charset=utf-8')
          // A founder who has just fixed one of these reloads immediately. A cached copy of
          // this page would tell them it is still broken.
          .header('cache-control', 'no-store')
          .send(startHerePage(mine));
      }
      return;
    }

    if (!path.startsWith('/api/')) return;

    const fatal = state.blockingEverything();
    if (fatal.length > 0) {
      return reply.code(503).header('cache-control', 'no-store').send(blockedBody(fatal));
    }

    if (startsATurn(request.method, request.url)) {
      const stopping = state.blockingTurns();
      if (stopping.length > 0) {
        return reply.code(503).header('cache-control', 'no-store').send(blockedBody(stopping));
      }
    }

    return;
  });
}
