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

export type BlockerId = 'database' | 'engine' | 'masterKey' | 'anthropicKey' | 'passphrase';

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
  readonly engineReady: boolean;
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

  if (!facts.anthropicKeySet) {
    out.push({
      id: 'anthropicKey',
      heading: 'Your Anthropic key is not set',
      what: 'Everything this app writes is written by Claude, and Claude needs an API key that belongs to you. An API key is a long password that lets this app use your account. There is not one here yet.',
      doThis: 'Go to the setup screen and paste your Anthropic API key. You get one at console.anthropic.com.',
      handledElsewhere: false,
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
      ? 'One thing is missing. The app is running, and this is what it needs.'
      : `${String(count)} things are missing. The app is running, and this is what it needs.`;

  return layout(
    'Start here',
    `<h1>Start here</h1>
<p>${escapeHtml(opener)}</p>
<ol>
${items}
</ol>
<p>Fix them in the order above, then reload this page.</p>
<style>
  h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }
  ol > li { margin-bottom: 1.6rem; }
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
  private current: readonly Blocker[];

  constructor(facts: ReadinessFacts) {
    this.current = blockersFrom(facts);
  }

  set(facts: ReadinessFacts): void {
    this.current = blockersFrom(facts);
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
