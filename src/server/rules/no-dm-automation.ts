/**
 * no-dm-automation.ts: rule 2. No Instagram DM automation, ever.
 *
 * WHY IT EXISTS: automated cold DMs get accounts restricted. The Instagram API
 *   only permits messaging after the user has messaged first. A founder whose
 *   account is restricted at the event has lost the one channel the whole B2C
 *   track is built on, and there is no appeal desk to send them to. So the
 *   twenty five cold DMs are sent by hand, from the founder's own account,
 *   spread out, and the automation lives on the inbound side only, in a
 *   GoHighLevel workflow fired by something the user did first.
 *
 *   The build document asks for this to be structurally impossible to add by
 *   accident later, not merely absent today. Three of the five layers it names
 *   live outside this folder: the token is created without the message write
 *   scope, the vendor path allowlist has no conversation prefix, and every
 *   integration tool can only propose. Two live here, and this file is both of
 *   them.
 *
 * THE TWO LAYERS THIS FILE IS
 *
 *   Layer A, a compile time guard. `OUTBOUND_MESSAGE_CAPABILITIES` is typed as
 *   an empty tuple of `never`. Adding any string to it changes its type and
 *   `tsc` fails on the assertion below it. That is a broken build on the
 *   author's own machine, before a test runs, before a review, before a deploy.
 *
 *   Layer B, a source scan. `scanSourceTree` greps the repository for the
 *   strings a send path would have to contain, and the test in this folder fails
 *   the build on any hit. Its failure message states rule 2 in full, with the
 *   reason, because the person who trips it is probably new and is certainly in
 *   a hurry.
 *
 *   THE SCAN ROOT IS THE REPOSITORY, and it did not use to be. It was
 *   `src/server`, which meant a planted send path in `src/server` turned the
 *   scan red and the identical string in `app/content` left it green. Three
 *   directories were unscanned and one of them is the dangerous one: `src/web`
 *   is exactly where somebody adds a link to a conversations inbox, because
 *   that is where links live. `app/` holds the founder facing copy, and
 *   `scripts/` runs against real deployments. A denylist that covers a third of
 *   the code is a denylist that reads as covering all of it.
 *
 *   BOTH OF THOSE ARE ABOUT OUR CODE. The third thing in this file is not. The
 *   runtime check, `checkNoDmAutomation`, reads what the model wrote for a
 *   founder, and a skill that offers to automate DMs is a bug even though
 *   nothing in our code could carry it out, because the founder then goes and
 *   does it with somebody else's tool. That check is the one that reaches a
 *   person, and it is the one that keeps being wrong.
 *
 *   IT HAS BEEN WRONG TWICE, THE SAME WAY BOTH TIMES. First it matched six
 *   fixed phrasings, and naming the platform walked past every one of them.
 *   Then it matched two closed lists joined by an AND, and a reviewer invented
 *   fourteen fresh offers in a sitting of which thirteen reached a founder. A
 *   vocabulary list catches what somebody thought of. It cannot do this job. So
 *   the check now weighs three signals and answers with two severities rather
 *   than one, and its own section below argues every part of that.
 *
 *   IT ALSO REFUSED THE SENTENCE THE PRODUCT ASKS FOR. `audience-b2c/SKILL.md`
 *   tells the model that when a founder asks for DM automation, the answer is
 *   to explain why not. "Automated cold DMs are not something we do. They get
 *   accounts restricted." was blocked, and a block cost the whole turn. That is
 *   the product instructing the model to write something the gate destroys a
 *   founder's afternoon over, and fixing it came before anything else here.
 *
 * CALLED BY: index.ts for the runtime check. no-dm-automation.test.ts for the
 *   source scan, which is what makes the scan build breaking.
 * READS:     `scripts/validate.sh` for the DM pattern. The whole repository, for
 *   the source scan only.
 * WRITES:    nothing.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { houseStyleSource } from './validate-source.ts';
import {
  locate,
  maskNonProse,
  resultFrom,
  type Artifact,
  type RuleResult,
  type Violation,
} from './types.ts';

const RULE = 'no-dm-automation' as const;

/** Rule 2 in full, in the words the project uses. Printed on every failure. */
export const RULE_2 = [
  'Rule 2: no Instagram DM automation, ever.',
  'Automated cold DMs get accounts restricted, and the Instagram API only permits messaging after the user has messaged first.',
  'Cold DMs are manual. Twenty five of them, sent by hand from the founder\'s own account, spread out.',
  'Automation lives on the inbound side only, as a GoHighLevel workflow fired by something the user did first.',
  'The inbox itself stays in the GoHighLevel app. We link to it. We never fetch it, embed it or proxy it.',
].join('\n');

/* -------------------------------------------------------------------------- */
/* Layer A: the compile time guard                                            */
/* -------------------------------------------------------------------------- */

/**
 * The set of capabilities this product has for sending a message to anybody.
 *
 * It is empty, and the type below is what keeps it empty. Write
 * `['send_dm']` here and the type becomes `readonly string[]`, `EmptyForever`
 * stops accepting it, and the build fails with this file named. There is no way
 * to add one quietly.
 */
export const OUTBOUND_MESSAGE_CAPABILITIES = Object.freeze([] as const);

/**
 * The only shape the list above may have: a tuple with nothing in it.
 *
 * Exported as a type so the test beside this file can prove the constraint REJECTS a
 * non empty list, at compile time. Widening it to `readonly string[]` would leave the
 * assertion below compiling with a send capability in the array, and the only thing
 * that catches that is a test which instantiates this type with one.
 */
export type NoCapabilities = readonly never[];

/** Accepts only a tuple with nothing in it. */
type EmptyForever<T extends NoCapabilities> = T;

/**
 * The assertion. If this line stops compiling, somebody added a send
 * capability, and the answer is to take it out again rather than to widen the
 * type. Read RULE_2 above before doing anything else.
 */
type _NoSendCapabilityExists = EmptyForever<typeof OUTBOUND_MESSAGE_CAPABILITIES>;

/** Referenced so the type above cannot be deleted as unused. */
export type OutboundMessageCapability = _NoSendCapabilityExists[number];

/* -------------------------------------------------------------------------- */
/* Layer B: the source scan                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Strings a send path would have to contain.
 *
 * These are refusals, not claims. Nothing here says GoHighLevel or Meta really
 * uses a given path or host: the spike has never run and no vendor shape is
 * verified. They are the strings we decline to contain whether the vendor uses
 * them or not, which is safe in both directions.
 *
 * TWO OF THEM CARRY AN EXCEPTION, and it appeared the moment the scan root grew
 * past `src/server`. "Send a message" is this product's own words for the thing
 * a founder does in the composer: they type, the browser posts it to our own
 * server, and a turn starts. `src/web/lib/api.ts` therefore has a `sendMessage`,
 * and it has nothing to do with Instagram.
 *
 * The line drawn below is not convenience, it is where the capability is. The
 * browser holds no vendor credential and cannot reach a vendor: every vendor
 * call goes through `vendorFetch` in `src/server/integrations/http.ts`, which
 * an ESLint rule and a test both hold to one file. So a send verb in `src/web`
 * names a call to our own origin, by construction.
 *
 * The exception is exactly two words wide and it is only about the word
 * "message". Every DM word stays denied in the browser too, because "DM" is
 * never this product's word for anything it does, and so are all four third
 * party hosts and the conversation path, because those name somebody else's
 * inbox and the browser is exactly where a link to one would be added.
 *
 * IF `sendMessage` IN `src/web` IS EVER RENAMED, delete the exception with it.
 * A narrower name there, `submitMessage` or `postTurn`, would let this list go
 * back to being unconditional, which is better than an exception that is
 * correct.
 */
export const DENIED_SOURCE_TOKENS: ReadonlyArray<{
  token: string;
  reason: string;
  /** Path prefixes, from the repository root, where this token is not a hit. */
  exceptIn?: readonly string[];
  /** Why the exception holds. Required whenever there is one. */
  exceptWhy?: string;
}> = [
  { token: 'graph.facebook.com', reason: 'a Meta graph host. Our server never calls Meta.' },
  { token: 'graph.instagram.com', reason: 'a Meta graph host. Our server never calls Meta.' },
  { token: 'api.instagram.com', reason: 'a Meta host. Our server never calls Meta.' },
  { token: '/conversations', reason: 'a conversation path. Nothing here reads or writes a message thread.' },
  {
    token: 'sendMessage',
    reason: 'a send verb. Nothing in this product sends a message anywhere.',
    exceptIn: ['src/web/'],
    exceptWhy:
      'the browser composer posts the founder\'s own message to our own server, and the browser holds no vendor credential.',
  },
  {
    token: 'send_message',
    reason: 'a send verb. Nothing in this product sends a message anywhere.',
    exceptIn: ['src/web/'],
    exceptWhy:
      'the browser composer posts the founder\'s own message to our own server, and the browser holds no vendor credential.',
  },
  { token: 'send_dm', reason: 'a send verb. Cold DMs are sent by hand, by the founder.' },
  { token: 'sendDm', reason: 'a send verb. Cold DMs are sent by hand, by the founder.' },
  { token: 'dmAutomation', reason: 'DM automation, which rule 2 forbids outright.' },
  { token: 'dm_automation', reason: 'DM automation, which rule 2 forbids outright.' },
  { token: 'bulkDm', reason: 'sending in bulk, which is the exact thing that gets accounts restricted.' },
  { token: 'autoDm', reason: 'automatic DMs, which rule 2 forbids outright.' },
];

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The repository root, which is the whole of what this scan covers.
 *
 * Derived by walking up from this file and then CHECKED, rather than trusted.
 * Three levels up happens to be right today; the day somebody moves this folder
 * the count is silently wrong, the scan quietly covers a subtree, and a denylist
 * that covers less than it says is worse than no denylist. So the answer is
 * confirmed against `package.json` and this throws if it is not there.
 */
export function repositoryRoot(from: string = HERE): string {
  const root = resolve(from, '..', '..', '..');
  if (!existsSync(join(root, 'package.json'))) {
    throw new Error(
      `The DM automation scan could not find the repository root. It looked in ${root} and there is no package.json there, so it does not know what it is scanning. Fix the path in no-dm-automation.ts rather than narrowing the scan.`,
    );
  }
  return root;
}

/**
 * Directories the scan does not enter, each with the reason it does not.
 *
 * Every line is a hole by construction, so each carries an argument and a test
 * pins the list. None of these holds code we write and ship.
 */
export const SCAN_EXCLUDED_DIRS: ReadonlyArray<{ name: string; why: string }> = [
  { name: 'node_modules', why: 'installed packages. Not ours, and npm audits them.' },
  { name: 'dist', why: 'build output. Whatever is in it came from a file that was scanned.' },
  { name: 'coverage', why: 'test run output, regenerated every run.' },
  {
    name: 'vendor',
    why: 'the content repo, a separate public repository with its own validator. It is symlinked in, so following it walks out of this tree entirely.',
  },
];

/**
 * Files the scan does not read.
 *
 * One entry, and it holds no code. A lockfile is a list of package names and
 * hashes that npm regenerates, so a hit in it names somebody else's dependency
 * rather than anything this repository does.
 */
export const SCAN_EXCLUDED_FILES: ReadonlyArray<{ name: string; why: string }> = [
  { name: 'package-lock.json', why: 'generated by npm. It is a list of dependencies, not code we wrote.' },
];

/**
 * The one file the scan skips, named by its path from the repository root.
 *
 * This file, because a denylist has to spell out the things it denies. It is a
 * PATH and not a file name, which matters more now than it used to: with the
 * root widened to the whole repository, a bare name would have exempted any
 * file called `no-dm-automation.ts` anywhere, `src/web` included.
 *
 * Test files are skipped separately, in the walk, because a test proving the
 * scan works has to contain a string the scan refuses.
 */
export const SCAN_EXEMPT_PATHS: readonly string[] = ['src/server/rules/no-dm-automation.ts'];

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

export interface SourceHit {
  /** Path relative to the scanned root. */
  file: string;
  line: number;
  token: string;
  reason: string;
  /** The line, trimmed. */
  excerpt: string;
}

function walk(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    if (SCAN_EXCLUDED_DIRS.some((d) => d.name === entry)) continue;
    if (SCAN_EXCLUDED_FILES.some((f) => f.name === entry)) continue;

    const full = join(dir, entry);
    // lstat, not stat. stat follows a symlink and reports the target's type, and
    // the one symlink in this tree points at the other repository. A symlinked
    // FILE is still source this repository builds, so it is read; a symlinked
    // DIRECTORY is a way out of the tree and into somebody else's, so it is not
    // entered.
    const info = lstatSync(full);
    if (info.isDirectory()) {
      if (info.isSymbolicLink()) continue;
      walk(root, full, out);
      continue;
    }
    if (!SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
    if (entry.endsWith('.test.ts')) continue;
    if (SCAN_EXEMPT_PATHS.includes(relative(root, full))) continue;
    out.push(full);
  }
}

/**
 * Every file the scan reads, relative to the root.
 *
 * Exported so a test can assert which directories are covered without planting
 * anything. "The scan reads a file in app/, in scripts/ and in src/server/" is
 * a direct answer to the question the widening was about, and it does not
 * involve writing a send path into somebody's working tree to find out.
 */
export function scannedFiles(root: string = repositoryRoot()): string[] {
  const files: string[] = [];
  walk(root, root, files);
  return files.map((f) => relative(root, f)).sort();
}

/**
 * Scan a source tree for anything that could become a send path.
 *
 * Returns the hits. The test in this folder is what turns a hit into a failed
 * build, because a scan nobody runs is a comment.
 */
export function scanSourceTree(root: string = repositoryRoot()): SourceHit[] {
  const files: string[] = [];
  walk(root, root, files);

  const hits: SourceHit[] = [];
  for (const file of files) {
    const rel = relative(root, file);
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (const denied of DENIED_SOURCE_TOKENS) {
      if (denied.exceptIn?.some((prefix) => rel.startsWith(prefix))) continue;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        if (!line.includes(denied.token)) continue;
        hits.push({
          file: rel,
          line: i + 1,
          token: denied.token,
          reason: denied.reason,
          excerpt: line.trim().slice(0, 160),
        });
      }
    }
  }
  return hits;
}

/** The message the person who trips the scan reads. Written for them. */
export function sourceScanFailure(hits: SourceHit[]): string {
  return [
    'The DM automation scan found something in the server source.',
    '',
    ...hits.map((h) => `  ${h.file}:${h.line}  "${h.token}"  ${h.reason}\n    ${h.excerpt}`),
    '',
    RULE_2,
    '',
    'If you are adding an inbound reply, it belongs in a GoHighLevel workflow, not here.',
    'If you are adding a link to the founder\'s inbox, a plain link out is the whole feature.',
    'If you genuinely believe this string is harmless, say so in the pull request and get a second pair of eyes. Do not add a file to SCAN_EXEMPT_PATHS, and do not narrow the scan root.',
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* The runtime check on what the model wrote                                  */
/* -------------------------------------------------------------------------- */

/**
 * WHAT THIS LAYER LOOKS FOR, in one sentence: an offer to send messages the
 * other person did not ask for, with nobody deciding each one.
 *
 * IT USED TO LOOK FOR PHRASINGS, and then it looked for two closed lists joined
 * by an AND, and both are the same mistake wearing different clothes. A list
 * catches the sentences somebody thought of and misses the ones they did not.
 * One reviewer sat down and invented fourteen fresh ways to offer this. Thirteen
 * of them reached a founder:
 *
 *     Use an AI agent to open conversations with your target accounts.
 *     Set up an autoresponder for people you have not spoken to yet.
 *     Load the 25 openers into the tool and let it work through them.
 *     Fire the opener at everyone who views your story.
 *
 * Not one of those says "automate a DM". Every one of them offers it. The word
 * "agent" was missing from a noun list, "opener" only counted inside a document
 * that had already said DM, and "everyone who views your story" was not on the
 * list of people who did not ask. Adding those four strings would buy a week.
 *
 * SO THE AND IS GONE, and three signals are weighed instead. The change that
 * matters is not that there are more patterns. It is that no single list has to
 * be complete for the gate to say something.
 *
 *   THE CHANNEL   is a message going to a person? Named outright ("DM",
 *                 "Instagram message") it is worth two. Implied ("the opener",
 *                 "the first touch", or the platform on its own) it is worth
 *                 one, because on Instagram the only thing you can send a
 *                 stranger is a DM whatever noun the sentence uses. REQUIRED,
 *                 for the reason under WHERE IT STILL ERRS below.
 *   THE DELEGATE  is anything other than the founder's own hand doing the
 *                 sending. REQUIRED. Without one there is no automation and
 *                 rule 2 has nothing to say: the 25 openers sent by hand are the
 *                 deliverable, not the mistake. Worth a point of its own when
 *                 the phrasing takes the founder out by itself, which "let it
 *                 work through them" does and "a workflow" does not.
 *   THE UNASKED   did the recipient ask? A follower, a story viewer, a target
 *                 list, somebody you have not spoken to. Worth one.
 *
 * Two points of evidence blocks. One warns. That is the whole decision, and it
 * is why no single list has to be complete: a sentence is caught by the channel
 * it names plus the audience it names, or by the channel alone when it names it
 * plainly, or by a weak channel plus a delegate that says outright that nobody
 * is deciding each one. Two of the fourteen are caught with no new word at all.
 * "The openers go out overnight without you" is an opener, which this file
 * already knew, plus a hands off phrase, which it already knew, and it used to
 * need both of them to be something else. "Put the DMs on a schedule so you are
 * not doing them one by one" was WORSE than missed: it warned, so the file was
 * saved and the founder read it, because "one by one" was read as the founder
 * deciding each one when it is the offer to stop them.
 *
 * A SET OF WORDS COUNTS ONCE. "Automate the opener" names the channel and the
 * coldness with the same word and that is one point, not two. Without that rule
 * the score is just a longer list wearing a number.
 *
 * THE QUESTION THAT OVERRIDES ALL THREE: did the other person start it?
 * Inbound automation is sanctioned and it is most of what the B2C track ships:
 * a comment fires a DM, a workflow answers somebody who wrote in, a qualify and
 * book flow runs on a conversation the other person opened. Every one of those
 * is a channel plus a delegate and every one of them has to pass, or this gate
 * has blocked the product instead of the mistake. What they carry, and what a
 * cold blast never carries, is the trigger: a comment, a keyword, a message that
 * came in first.
 *
 * A FOLLOW IS NOT A TRIGGER, and neither is a story view or a like. Instagram
 * permits messaging after somebody messages you, not after somebody looks at
 * you. So all three appear in the unasked list and never in the inbound one.
 *
 * WHAT EACH ANSWER COSTS, AND WHY THIS FILE HAS THREE ANSWERS NOW.
 *
 * This check used to have one outcome that mattered, and it cost the founder the
 * whole turn: the plan, the sequence and the CSV all went back with the folder.
 * One uncertain sentence was worth six files. That made every widening here a
 * bet against a founder's Sunday, so the honest move was to widen nothing, and
 * the fourteen are what widening nothing bought.
 *
 * `harvest-gate.ts` has since split that. Most blocking violations now hold the
 * one file and the rest of the turn is saved. Its `WORTH_THE_WHOLE_TURN` list is
 * what still costs everything, and one code from this rule is on it: `dm.offered`
 * rolls the turn back. The argument written beside that entry is specific, and it
 * is worth quoting because this file has to keep it true: the rule "fires only
 * when a channel and a hand off verb sit in the same sentence".
 *
 * THAT SENTENCE STOPPED BEING TRUE HERE, so the codes were split rather than the
 * claim quietly broken. "The openers go out overnight without you" names no
 * channel: the channel is INFERRED, from a word for an opening message and a
 * delegate that says nobody is deciding each one. Losing a Sunday turn on an
 * inference is not the same bet as losing it on "we can automate your Instagram
 * DMs", so the two get different codes:
 *
 *   dm.offered               a channel NAMED, plus a delegate. Two points of
 *                            evidence. Costs the whole turn, unchanged, and it
 *                            is exactly the set of sentences that entry argues
 *                            about.
 *   dm.offered-by-inference  the channel INFERRED, brought to two points by the
 *                            audience, the delegate or the document. Blocks, and
 *                            `harvest-gate.ts` holds the file, because its own
 *                            rule is that a code it has never heard of holds
 *                            rather than refuses. That is used here on purpose.
 *   dm.possible-offer        one point of evidence. A note beside the file, which
 *                            is saved.
 *
 * THAT IS WHY IT IS NOW RIGHT TO SPEAK UP ON ONE POINT OF EVIDENCE. Silence was
 * only ever the safe answer because the alternative was so expensive. It is not
 * any more, and thirteen of the fourteen say something. If the blast radius ever
 * goes back to all or nothing, the thing to change is that, not this file: going
 * quiet again puts the fourteen back in front of a founder.
 *
 * WHERE IT STILL ERRS, named rather than implied.
 *
 *   Ambiguity is refused when two signals agree and flagged when one does. A
 *   sentence that automates DMs without saying what set them off gets blocked,
 *   and the fix the model then makes is to name the trigger, which is the
 *   sentence a founder needed anyway.
 *
 *   A sentence that names no channel at all is missed, and that is a decision
 *   rather than an oversight. "Give the tool your handles and it takes it from
 *   there" has a delegate and an audience and no word at all for what is being
 *   sent, and it passes. One of the fourteen is exactly that sentence, so the
 *   gap is measured rather than assumed. The alternative is to let the delegate
 *   and the audience convict on their own, and the sentence that then gets
 *   refused is "configure the workflow to email your list every morning", which
 *   is the B2B track's own deliverable. Rule 1 says the two tracks never see
 *   each other's material. Blocking half the cohort's email sequence to catch
 *   one Instagram sentence is rule 2 breaking rule 1, and it is the worse trade.
 *
 *   Two words far apart in one long sentence are not one claim, so there is a
 *   distance limit and a sentence can hide an offer by padding it. The limit is
 *   named and argued where it is set.
 *
 *   The cost of a wrong block is a rewrite. The cost of a wrong pass is a
 *   founder's Instagram account, at an event they paid to attend.
 */

/** A private message to a person, named outright. Worth two on its own. */
const CHANNEL: readonly RegExp[] = [
  /\bdm(?:s|'s|ing|med|ming|'d|ed)?\b/i,
  /\bdirect[\s-]?messag(?:e|es|ing)\b/i,
  /\b(?:instagram|insta|ig)\s+(?:dms?|messag(?:e|es|ing))\b/i,
  /\bmessag(?:e|es|ing)\s+(?:on|via|through|in)\s+(?:instagram|ig|the\s+dms?)\b/i,
];

/**
 * Words for a message that do not say which one.
 *
 * "Message" on its own is not a DM. It is what a founder does in the composer,
 * what the ops engine logs, and what half this codebase is named after. Same
 * for an inbox, a conversation, an opener and an outreach. Each of them names
 * the act of messaging while leaving the channel open, so each is worth one
 * point rather than two, and next to a platform word it is worth the full two.
 *
 * "Autoresponder" is in here as well as in the delegate list, and that is not
 * double counting: a responder responds with a message, so the word names the
 * channel by saying what the thing does. The evidence sum below refuses to count
 * the same span twice.
 */
const IMPLIED_CHANNEL =
  /\b(?:messag(?:e|es|ed|ing)|inbox|conversations?|threads?|openers?|first (?:messages?|dms?|touch|contact)|auto[\s-]?(?:responder|responders|repl(?:y|ies)))\b/i;

/**
 * Words for the activity rather than for the message.
 *
 * "Outreach" is what you call the work, not what you call the thing you send,
 * and the B2B track's outreach is email. So it is a channel only next to the
 * platform, and never on its own. Without that line, `outreach-b2b/SKILL.md`
 * has its own cold email guidance refused, which is rule 1 broken by rule 2.
 */
const ACTIVITY_CHANNEL = /\b(?:outreach|reach(?:ing)? out)\b/i;

/** The platform, or the audience on it. Enough to make a message word a DM. */
const CHANNEL_CONTEXT = /\b(?:instagram|insta|ig|followers?)\b/i;

/** What makes a heading or a paragraph a DM document. */
const DM_WORD = /\b(?:dms?|direct[\s-]?messag(?:e|es|ing))\b/i;

/**
 * Anything that sends without a person choosing to send that one.
 *
 * The noun set is a small closed class on purpose: things that act. It is not a
 * list of products, and adding the tool of the month to it is the wrong fix.
 * The connector in the middle is optional because both halves of it get
 * written: "a tool that sends the DMs" and "the workflow sends them a DM" are
 * the same claim, and the second one is the shorter, so it is the one a model
 * reaches for.
 */
const ACTOR_NOUN =
  'tool|tools|app|apps|application|chatbot|bot|bots|script|scripts|software|service|services|platform|plugin|extension|integration|automation|scheduler|sender|responder|autoresponder|agent|agents|assistant|assistants|ai|sequence|sequences|campaign|campaigns|crm|zap|macro|workflow|system|robot';

const TOOL_SENDS = new RegExp(
  `\\b(?:${ACTOR_NOUN})\\b\\s*(?:(?:can|will|would|should|could|may|might)\\s+)?(?:[^.!?\\n]{0,45}?\\b(?:to|that|which|and it|so it)\\s+)?(?:automatically\\s+)?(?:sends?|blasts?|fires?|delivers?|dms?|messages?|pushes?|answers?|replies|reply|responds?|handles?|handle|manages?|opens?|starts?|initiates?|writes?|drafts?|takes? over|takes? care of)\\b`,
  'i',
);

/**
 * The instruction form with a product named: "use Sendly to send the DMs".
 *
 * It is deliberately blind to what the product is called. A list of tool names
 * would be a list somebody has to keep up to date, and the one that gets a
 * founder banned will be the one launched after the list was written. What it
 * keys on instead is the shape: a verb of installation, then a name, then
 * sending.
 *
 * THE CAPITAL LETTER IS DOING REAL WORK, which is why the starters are spelled
 * out in both cases rather than the whole pattern carrying an `i` flag. Without
 * it this matched "you have to send the 25 DMs yourself" and "get your DM
 * openers ready to send on Saturday", which are instructions to do it by hand,
 * and refusing those is the gate refusing the work. A lower case noun after the
 * verb is the founder's own thing. A capitalised one is somebody's product.
 */
const NAMED_TOOL_SENDS =
  /(?:[Uu]se|[Uu]sing|[Cc]onnect|[Ii]nstall|[Aa]dd|[Tt]ry|[Gg]et|[Rr]un|[Cc]onfigure|[Ii]ntegrate|[Bb]uy|[Ss]ubscribe to|[Ss]et ?up|[Hh]ook up|[Pp]lug in|[Ww]ire up|[Pp]oint|[Ss]witch on|[Tt]urn on|[Ee]nable)\s+(?:the\s+|a\s+|an\s+)?[A-Z][A-Za-z0-9]{2,}\b[^.!?\n]{0,25}?\b(?:to|that|which|and it|so it|so they)\s+(?:automatically\s+)?(?:sends?|blasts?|fires?|delivers?|dms?|messages?|pushes?|handles?|handle)\b/;

/** "Every new follower gets a message." Nobody chose to send that one either. */
const MASS_RECEIPT =
  /\b(?:every|each|all|any|anyone|everyone|whoever)\b[^.!?\n]{0,40}?\b(?:gets?|receives?|is sent|are sent|will get|will receive)\b[^.!?\n]{0,20}?\b(?:a\s+|an\s+|the\s+)?(?:dms?|messages?|direct messages?)\b/i;

/**
 * The same thing said the other way round: "DM everyone on the list".
 *
 * Kept tight on purpose, twice over. The mass word has to sit close to the verb,
 * with a determiner or a short object and a preposition in between, because
 * "dm-openers.md, numbered, with the target handle against each" is a sentence
 * this product writes and it is not an offer to message everybody. And the mass
 * word has to be followed by a recipient rather than by the message itself:
 * "send each DM from your own phone" is the instruction to do all 25 by hand,
 * and "DM everyone on the list" is the thing that gets the account restricted.
 *
 * THE OBJECT SLOT IS WHY "fire the opener at everyone" IS CAUGHT. A verb, then
 * what is being sent, then who it is going to, is the ordinary English order and
 * the pattern used to allow only a determiner there.
 */
const MASS_SEND =
  /\b(?:dm|dms|message|messages|send|sends|sending|sent|deliver\w*|blast\w*|fire\w*|push\w*)\s+(?:[^.!?\n]{0,24}?\b(?:to|at)\s+)?(?:(?:a|an|the|them|it|these|those)\s+)?(?:each|every|all|any|anyone|everyone|whoever)\b(?!\s+(?:dms?|messages?|direct\s+messages?|openers?|of\s+the\s+dms?))/i;

/**
 * Sending with the founder taken out of it.
 *
 * "for you" carries a lookahead because "the DM openers for you to send by
 * hand" is the opposite claim, and it is a sentence this product writes.
 */
const HANDS_OFF =
  /\b(?:for you\b(?!\s+to\b)|on your behalf|while you sleep|in your sleep|without lifting a finger|without you\b|without touching|with no work from you|no work from you|hands[\s-]?off|hands free|set (?:it )?and forget|on autopilot|autopilot|overnight|round the clock|24\/7|while you focus|by itself|on its own|runs itself|so you (?:do not|don'?t) have to)/i;

/**
 * The delegate named by a pronoun, which is how a model writes it when it has
 * already said what the thing is.
 *
 * "Load the 25 openers into the tool and let it work through them" puts the
 * delegate in "let it", not in "tool", because the noun and the verb are in
 * different clauses. Keying on the noun alone misses it, and this is the single
 * commonest shape in the fourteen: give a thing the list, then let the thing
 * work.
 */
const LET_IT_DO_IT = new RegExp(
  `\\b(?:let|have|point)\\s+(?:it|them|that|something else|someone else|somebody else|(?:the|a|an|your)\\s+(?:${ACTOR_NOUN}))\\b[^.!?\\n]{0,30}?\\b(?:run|runs|running|work|works|working|handle|handles|send|sends|sending|write|writes|dm|dms|message|messages|goes?|go|fire|fires|do|does|take|takes|open|opens)\\b`,
  'i',
);

/** "It takes it from there." The subject is a thing and the thing is working. */
const IT_TAKES_OVER =
  /\b(?:it|they|that)\s+(?:handles?\s+(?:it|that|the|them|those|everything)|takes? (?:it )?(?:from there|over)|does the rest|works? through|runs? (?:itself|on its own))\b/i;

/**
 * "Once it is wired up ..." Somebody configured a thing and now it runs.
 *
 * On its own that is just a setup instruction, so it counts as a delegate only
 * when the same sentence has something going out or arriving. It is the shape
 * behind "Once configured, new story viewers get the opener", where no noun in
 * the sentence names the thing doing the sending.
 */
const CONFIGURED_THEN_RUNS =
  /\bonce\s+(?:it\s+is\s+|it'?s\s+|its\s+|you\s+have\s+|the\s+\w+\s+is\s+)?(?:configured|set\s?up|wired\s?up|connected|live|installed|turned\s+on|switched\s+on|enabled|running)\b/i;

/** Somebody receives something. The other half of CONFIGURED_THEN_RUNS. */
const RECEIPT_VERB = /\b(?:gets?|receives?|lands?|arrives?|is sent|are sent|will get|will receive)\b/i;

/**
 * Sending, as a verb.
 *
 * "DM" is not in the plain list, and that is deliberate. It is a verb and a
 * noun spelled the same way, and this product writes the noun constantly: the
 * DM openers, the DM scripts. Reading the noun as a send verb turned "we can
 * write the DM openers for you" into an offer to send DMs on the founder's
 * behalf, which is the gate blocking the work instead of the mistake. So DM
 * counts as a verb only where the grammar says it is one: after a modal or a
 * subject, or in front of an object.
 */
const SEND_VERB =
  /\b(?:send|sends|sent|sending|deliver|delivers|delivered|delivering|fire|fires|fired|firing|blast|blasts|blasted|blasting|push|pushes|pushed|pushing|dming|dm'?d|dmed|message|messages|messaged|messaging|go out|goes out|going out|reach out|reaches out|reaching out)\b|\b(?:will|to|can|should|would|could|it|they|and)\s+dms?\b|\bdms\s+(?:them|him|her|everyone|every|each|all|anyone|new|your|the|people)\b/i;

/**
 * The delegates, most specific label first.
 *
 * The label is founder-facing. It goes into the sentence "This offers ...", so
 * it says what was offered rather than which pattern matched.
 */
interface Delegate {
  pattern: RegExp;
  label: string;
  /**
   * Does this phrasing take the founder out by itself?
   *
   * WHY THE FLAG EXISTS. A workflow, a bot and a scheduler are all things the
   * sanctioned inbound machine is built out of, so naming one says a mechanism
   * is involved and nothing about who it goes to. "Let it work through them",
   * "while you sleep" and "DM everyone on the list" say the second half of the
   * rule outright: nobody is deciding each one. That is a point of evidence in
   * its own right, and it is why "the openers go out overnight without you" is
   * refused while "the sequence handles the Instagram side" is only flagged.
   */
  excludesTheFounder: boolean;
}

const DELEGATES: ReadonlyArray<Delegate> = [
  { pattern: /\b(?:bulk|mass|batch(?:es|ed|ing)?|blast(?:s|ed|ing)?|drip(?:s|ped|ping)?|at scale|in volume|at volume|high[\s-]?volume)\b/i, label: 'sending DMs in bulk', excludesTheFounder: true },
  { pattern: /\b(?:chat)?bots?\b/i, label: 'a bot that sends DMs', excludesTheFounder: false },
  { pattern: /\b(?:schedul(?:e|es|ed|er|ers|ing)|queue(?:s|d)?|queuing|queueing|on a timer|timer|cron)\b/i, label: 'scheduling DMs', excludesTheFounder: false },
  { pattern: /\bautomat(?:e|es|ed|ing|ion|ic|ically)\b/i, label: 'automating DMs', excludesTheFounder: false },
  { pattern: /\bauto[\s-]?(?:dm|dms|send|sends|sender|sending|message|messages|messaging|reply|replies|respond|responder)\b/i, label: 'automating DMs', excludesTheFounder: false },
  { pattern: TOOL_SENDS, label: 'a tool that sends DMs', excludesTheFounder: false },
  { pattern: NAMED_TOOL_SENDS, label: 'a tool that sends DMs', excludesTheFounder: false },
  { pattern: LET_IT_DO_IT, label: 'letting something else send the DMs', excludesTheFounder: true },
  { pattern: IT_TAKES_OVER, label: 'letting something else send the DMs', excludesTheFounder: true },
  { pattern: MASS_RECEIPT, label: 'sending the same DM to everybody', excludesTheFounder: true },
  { pattern: MASS_SEND, label: 'sending the same DM to everybody', excludesTheFounder: true },
];

/**
 * The other person started it, which is the whole of what makes automation
 * allowed here.
 *
 * Note what is absent: following, liking, viewing a story, being on a list.
 * None of those is a message, none of them opens the window Instagram actually
 * permits, and treating any of them as a trigger is how a founder gets
 * restricted while believing they were on the inbound side.
 */
const STARTED_BY_THEM: readonly RegExp[] = [
  /\bcomment[\s-]?(?:to|2)[\s-]?dm\b/i,
  /\bwhen(?:ever)?\s+(?:someone|somebody|anyone|a follower|they|people|a customer|a viewer|a person)\s+(?:comments?|messages?|dms?|repl(?:y|ies)|writes?|asks?|sends?|gets? in touch|reaches out)/i,
  /\bafter\s+(?:someone|somebody|anyone|they|a follower|people|a customer)\s+(?:comments?|messages?|dms?|replies|writes|asks|reaches out|has messaged)/i,
  /\b(?:messaged|messages|message|contacted|contacts|wrote|writes|reached out|reaches out|dm'?d|dmed)\s+(?:you|us)\s+first\b/i,
  /\bthey\s+(?:messaged|contacted|dm'?d|dmed|wrote to)\s+(?:you|us)\b/i,
  /\b(?:the\s+)?(?:user|customer|follower|person|they|someone|somebody)\s+(?:initiated|initiates|started it|started the conversation|starts the conversation|opened the conversation)\b/i,
  /\binbound\b/i,
  /\btrigger(?:ed|s)?\s+by\b/i,
  /\b(?:trigger|comment|keyword)\s+(?:keyword|trigger)\b/i,
  /\bin\s+(?:reply|response)\s+to\b/i,
  /\brepl(?:y|ies|ying)\s+to\s+(?:their|the|a|an|his|her|each|every|someone'?s?)?\s*(?:comment|comments|message|messages|dm|dms|question|questions|enquiry|enquiries|inquiry)\b/i,
  /\brespond(?:ing|s)?\s+to\s+(?:their|the|a|an|each|every)?\s*(?:comment|comments|message|messages|dm|dms|question|questions)\b/i,
  /\bwho\s+(?:comment|comments|commented|message|messages|messaged|dm|dms|dm'?d|dmed|asked|asks|replied|replies|wrote|write)\b/i,
  /\bopt(?:ed|s)?[\s-]?in\b/i,
  /\bmessaging window\b/i,
  /\b24[\s-]?hour window\b/i,
];

/**
 * The recipient did not ask, in the words a model uses for that.
 *
 * This list has two jobs and it is worth being clear which is which. It is a
 * point of evidence in its own right, so a cold audience plus a delegate is
 * enough to speak up even where the sentence never says DM. And it overrides
 * the inbound reading, because an inbound reply answers one person who acted:
 * it is not run "at scale", it does not go to "every new follower", and nobody
 * describes it as happening "for you" or "while you sleep". Saying "inbound"
 * somewhere else in the paragraph does not rescue a sentence that says one of
 * these.
 *
 * PASSIVE ENGAGEMENT IS IN HERE FOR THE SAME REASON A FOLLOW IS. Viewing a
 * story, liking a reel and visiting a profile are all things somebody can do
 * without opening the window Instagram permits a reply in, so a recipient
 * defined by one of them is a stranger who did not ask.
 */
const NEVER_INBOUND: readonly RegExp[] = [
  /\bcold\b/i,
  // An opener opens. Whatever the paragraph around it says, it is the first
  // message rather than a reply to one, so no context can make it inbound.
  /\bopeners?\b/i,
  /\bfirst (?:message|dm|touch|contact)\b/i,
  /\binitial (?:message|dm|outreach)\b/i,
  /\bunsolicited\b/i,
  /\boutbound\b/i,
  /\b(?:bulk|mass|blast(?:s|ed|ing)?|at scale|in volume|at volume|high[\s-]?volume)\b/i,
  /\b(?:every|each|all|any)\s+(?:new\s+|single\s+)?followers?\b/i,
  /\bnew followers\b/i,
  /\ball (?:your|their|the) followers\b/i,
  /\b(?:everyone|anyone|whoever)\s+(?:who\s+)?follows\b/i,
  /\b(?:your|their|the|our)\s+(?:list|lists|prospects?|leads?)\b/i,
  /\b(?:your|their|the)\s+(?:follower|prospect|lead|target|contact|handle|hashtag|saved|story)\s+(?:list|lists|audience|accounts?)\b/i,
  /\btarget accounts?\b/i,
  /\b(?:story|post|reel|profile|page)\s+viewers?\b/i,
  /\b(?:everyone|anyone|whoever|people|those|accounts?|users?)\s+who\s+(?:views?|viewed|watch(?:es|ed)?|sees?|saw|likes?|liked|follows?|followed|visits?|visited)\b/i,
  /\b(?:not|never|have ?n'?t|has ?n'?t|had ?n'?t|have not|has not)\s+(?:yet\s+)?(?:spoken|talked|met|messaged|dm'?d|dmed|written to|heard from|worked with)\b/i,
  /\bfor you\b(?!\s+to\b)/i,
  /\bon your behalf\b/i,
  /\b(?:while|in) (?:you|your) sleep\b/i,
  /\bwithout lifting a finger\b/i,
  /\bhands[\s-]?off\b/i,
  /\bset (?:it )?and forget\b/i,
  /\bautopilot\b/i,
];

/**
 * Words that mean the line is refusing the thing rather than offering it.
 *
 * The skills say "no DM automation" in as many words, and the ops engine
 * explains why. `audience-b2c/SKILL.md` goes further: it tells the model that if
 * a founder asks for DM automation, the answer is to explain why not. So the
 * product instructs the model to write this sentence, and a gate that refuses it
 * refuses the turn the founder asked for.
 *
 * WHERE THE REFUSAL IS ALLOWED TO SIT, which is what this used to get wrong.
 * Negation counted only in FRONT of the offer, within one sentence, and a
 * sentence ended at a newline. All three of these were therefore refused:
 *
 *     Automated cold DMs are not something we do. They get accounts restricted.
 *     Automating your Instagram DMs is a bad idea. The account gets restricted.
 *     Automated DMs get accounts\nrestricted.
 *
 * The first two put the offer in the SUBJECT, where nothing can precede it. The
 * third is one sentence a text editor happened to wrap. So the rule now is
 * positional rather than a bigger word list: a refusal counts wherever the
 * grammar can put it. In front of the offer, as before. In the predicate, when
 * the offer is the subject and there is no room in front. And in the next
 * sentence of the same paragraph, when that sentence is not itself an offer.
 *
 * SEPARATE LISTS, AND THE SPLIT IS STILL WHAT STOPS IT BEING A BYPASS. A
 * sentence that names the manual way counts as a refusal only when it is not
 * offering to replace it, because "automate your DMs instead of sending them by
 * hand" is the exact sentence rule 2 exists to stop and it is made almost
 * entirely of refusal words. And a negation that is itself negated does not
 * count at all, because "nothing stops you automating the DMs" is a permission.
 *
 * A WRONG READ HERE COSTS A WARNING, NOT A PASS. Every path below downgrades a
 * block to a warning; none of them makes a line clean. So the worst case of
 * reading an offer as a refusal is that the founder gets the line with a note
 * beside it asking them to read it once, which is the right way round given the
 * alternative was refusing the sentence the product told the model to write.
 */
const REFUSAL_BEFORE =
  /\b(?:never|not|no|cannot|can't|do not|don't|avoid\w*|refus\w*|forbid\w*|against|instead of|rather than|without|by hand|manual\w*|stop\w*|nothing|none|neither|nor)\b/i;

const CONSEQUENCE_AFTER =
  /\b(?:restrict\w*|banned|bans?|shadow ?ban\w*|suspend\w*|blocked|action blocks?|at risk|flagged|forbidden|not allowed|against\s+(?:the\s+|our\s+|their\s+)?(?:[a-z]+\s+){0,2}?(?:rules|terms|guidelines|policy|policies)|scrap(?:e|es|ed|ing)\w*|violat\w*|puts? the account|lose (?:the|your) account|is a bug)\b/i;

/**
 * The offer is the subject and the verdict is the predicate.
 *
 * Only consulted when nothing at all precedes the offer in its sentence, which
 * is the one position where REFUSAL_BEFORE is structurally unable to fire. The
 * judgement words are few on purpose: the position is doing the work, not the
 * vocabulary, and a longer list here would be the same mistake this file is
 * about.
 */
const REFUSAL_PREDICATE = new RegExp(
  `${REFUSAL_BEFORE.source}|${CONSEQUENCE_AFTER.source}|\\b(?:bad idea|mistake|risky|dangerous|not worth|a trap|off the table|a bug)\\b`,
  'i',
);

/** The founder decides each one, which is what rule 2 asks for. */
const HUMAN_DECIDES_EACH_ONE =
  /\b(?:by hand|manual(?:ly)?|one at a time|one by one|yourself|from your own (?:account|phone|app)|in your own app)\b/i;

/**
 * A negation that is itself negated. "Nothing stops you automating the DMs" is
 * made of refusal words and it is a permission, so the words in front of the
 * offer stop counting when one of these is among them.
 */
const NOT_ACTUALLY_REFUSING =
  /\b(?:nothing (?:stops|is stopping|prevents|wrong with)|no reason not to|no harm in|not a problem|nobody (?:is )?stopping|why not|no matter what|regardless)\b/i;

/** The manual way named in order to be taken away. Not a refusal. */
const REPLACES_THE_MANUAL_WAY =
  /\b(?:instead of|rather than|no more|no need to|so you (?:never|no longer|do not|don'?t) have to|saves? you)\b/i;

interface Span {
  start: number;
  end: number;
}

/**
 * Is one of the cold words actually being claimed, or being ruled out?
 *
 * "Automate the reply to inbound DMs, never the first message" names the cold
 * half in order to exclude it. Read as a flat word match, "first message" would
 * override the inbound reading and refuse the sentence that states the rule
 * correctly. So a cold word with a negation right in front of it does not
 * count.
 */
const NEGATED_JUST_BEFORE = /\b(?:never|not|no|rather than|instead of|without|excludes?|except)\b[^.!?\n]{0,16}$/i;

/**
 * Every stretch of the sentence that names somebody who did not ask.
 *
 * ALL OF THEM, not the first, and that is not tidiness. The evidence sum below
 * refuses to count one set of words twice, because "automate the opener" says
 * the channel and the coldness with the same word and that is one point rather
 * than two. Returning only the first match meant "fire the opener at everyone
 * who views your story" handed back "opener", which is exactly the word already
 * counted as the channel, and the audience it also names went uncounted.
 */
function coldSpans(sentence: string): Span[] {
  const spans: Span[] = [];
  for (const pattern of NEVER_INBOUND) {
    const match = pattern.exec(sentence);
    if (match === null) continue;
    if (NEGATED_JUST_BEFORE.test(sentence.slice(0, match.index))) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/** Two spans that share no character. */
function apart(a: Span, b: Span): boolean {
  return a.start >= b.end || a.end <= b.start;
}

interface Sentence {
  text: string;
  /** Offset of this sentence in the whole artifact. */
  start: number;
}

/**
 * How far apart the channel and the delegate may sit and still be one claim.
 *
 * A number, so it is arguable, and it was measured rather than guessed. Across
 * the whole corpus and all nine skills, the widest span between the channel word
 * and the delegate word in a genuine offer is 61 characters: "add a chatbot to
 * your account so it answers new followers with a DM". A hundred and forty is
 * more than twice that.
 *
 * IT MATTERS MORE SINCE A WRAPPED LINE STOPPED ENDING A SENTENCE. Before that,
 * the wrap put a ceiling on how long a sentence could get and this limit had
 * little to do. Now a hard wrapped paragraph is one sentence, and a paragraph
 * can hold two unrelated jobs: a GoHighLevel workflow on the first line and the
 * 25 DM openers on the fourth. Those are not one claim and must not be read as
 * one offer.
 */
const SAME_CLAIM = 140;

/**
 * Does this newline end a sentence, or is it a line the writer wrapped?
 *
 * IT USED TO ALWAYS END ONE, and that was a real refusal: "Automated DMs get
 * accounts\nrestricted." was cut in half, the consequence landed in a fragment
 * of its own, and the first half read as a bare offer. The same words on one
 * line only warned. A founder does not control where their editor wraps, and
 * neither does the model.
 *
 * So a newline ends a sentence when the line it closes ended one: terminal
 * punctuation, or a block boundary. A blank line, a heading, a list bullet, a
 * table row and a fenced block all end the thought whatever the punctuation
 * says. Anything else is a wrap, and a wrap is whitespace.
 */
const BLOCK_START = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~|\s*$)/;
const ENDS_A_THOUGHT = /[.!?;:)"'\]]\s*$/;

function newlineEndsSentence(closed: string, next: string | undefined): boolean {
  if (next === undefined) return true;
  if (ENDS_A_THOUGHT.test(closed)) return true;
  if (BLOCK_START.test(next)) return true;
  return BLOCK_START.test(closed);
}

/**
 * Split into sentences, keeping the offset of each.
 *
 * WHY SENTENCES AND NOT LINES. A line can hold an offer and a refusal at once:
 * "Cold DMs go by hand. Set up a bot for the rest." Judged as one line, the
 * refusal in the first half excuses the offer in the second. Judged a sentence
 * at a time, the second half is refused on its own, which is right.
 *
 * A full stop only ends a sentence when whitespace follows, so "25." and "e.g."
 * do not shred a line into fragments that have lost their subject.
 */
function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const lines = text.split('\n');
  let lineNo = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    if (ch === '\n') {
      const closed = lines[lineNo] ?? '';
      const next = lineNo + 1 < lines.length ? lines[lineNo + 1] : undefined;
      lineNo += 1;
      if (!newlineEndsSentence(closed, next)) continue;
    } else if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== ';') {
      continue;
    } else {
      const after = text[i + 1];
      if (i + 1 < text.length && after !== undefined && !/\s/.test(after)) continue;
    }
    out.push({ text: text.slice(start, i + 1), start });
    start = i + 1;
  }
  if (start < text.length) out.push({ text: text.slice(start), start });
  return out.filter((s) => s.text.trim().length > 0);
}

/**
 * What the heading and the paragraph around each line say about it.
 *
 * WHY CONTEXT AT ALL. `inbound-scripts.md` is written as a document, not as a
 * list of self contained sentences. Under a heading that says "Comment to DM",
 * the line "Write the auto DM message" is about the sanctioned flow and every
 * reader knows it. Judged alone it is an automated DM with no trigger named,
 * and blocking it would block the deliverable.
 *
 * The hole this opens is closed by NEVER_INBOUND: a heading cannot rescue a
 * sentence that says "for you" or "every new follower", because an inbound
 * reply is never described that way.
 *
 * The second question it answers is whether the document is about DMs at all,
 * which is what lets "opener" mean a DM opener in `dm-openers.md` and an email
 * opener in the B2B track's sequence, where automating it is the plan. It is
 * also the only thing that can supply a channel for a sentence that names none,
 * which is how "give the tool your handles and it takes it from there" gets
 * noticed at all.
 */
interface LineContext {
  /** The heading or paragraph says the other person started it. */
  inbound: boolean;
  /** The heading or paragraph is about DMs, so "opener" means a DM opener. */
  aboutDms: boolean;
}

function contextByLine(text: string): LineContext[] {
  const lines = text.split('\n');
  const paragraphOf: number[] = new Array<number>(lines.length).fill(-1);
  const headingInboundOf: boolean[] = new Array<boolean>(lines.length).fill(false);
  const headingDmOf: boolean[] = new Array<boolean>(lines.length).fill(false);
  const paragraphs: string[][] = [];

  let headingIsInbound = false;
  let headingIsAboutDms = false;
  let open = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      open = -1;
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      headingIsInbound = STARTED_BY_THEM.some((rx) => rx.test(line));
      headingIsAboutDms = DM_WORD.test(line);
      headingInboundOf[i] = headingIsInbound;
      headingDmOf[i] = headingIsAboutDms;
      open = -1;
      continue;
    }
    headingInboundOf[i] = headingIsInbound;
    headingDmOf[i] = headingIsAboutDms;
    if (open === -1) {
      paragraphs.push([]);
      open = paragraphs.length - 1;
    }
    paragraphOf[i] = open;
    paragraphs[open]?.push(line);
  }

  const paragraphInbound = paragraphs.map((p) => STARTED_BY_THEM.some((rx) => rx.test(p.join(' '))));
  const paragraphAboutDms = paragraphs.map((p) => DM_WORD.test(p.join(' ')));

  return lines.map((_, i) => {
    const p = paragraphOf[i] ?? -1;
    return {
      inbound: (headingInboundOf[i] ?? false) || (p >= 0 && (paragraphInbound[p] ?? false)),
      aboutDms: (headingDmOf[i] ?? false) || (p >= 0 && (paragraphAboutDms[p] ?? false)),
    };
  });
}

function firstOf(patterns: readonly RegExp[], text: string): Span | null {
  let best: Span | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (best === null || match.index < best.start) {
      best = { start: match.index, end: match.index + match[0].length };
    }
  }
  return best;
}

/**
 * Is a message going to a person, and how plainly does the sentence say so?
 *
 * Two is named outright: a DM word, or a message word next to the platform.
 * One is implied: a message word with no platform, an opener, an outreach, or
 * the platform on its own. That last one is the reading that catches "let it
 * work through the list of handles on Instagram", where no noun in the sentence
 * is a word for a message. On Instagram, the only thing a stranger can be sent
 * is a DM, so naming the platform is weak evidence of the channel rather than
 * none.
 */
type ChannelSpan = Span & { strength: 1 | 2 };

function findChannel(sentence: string): ChannelSpan | null {
  const direct = firstOf(CHANNEL, sentence);
  if (direct !== null) return { ...direct, strength: 2 };

  const platform = CHANNEL_CONTEXT.exec(sentence);
  const implied = IMPLIED_CHANNEL.exec(sentence);
  if (implied !== null) {
    return {
      start: implied.index,
      end: implied.index + implied[0].length,
      strength: platform === null ? 1 : 2,
    };
  }
  if (platform === null) return null;

  const activity = ACTIVITY_CHANNEL.exec(sentence);
  if (activity !== null) {
    return { start: activity.index, end: activity.index + activity[0].length, strength: 2 };
  }
  return { start: platform.index, end: platform.index + platform[0].length, strength: 1 };
}

type DelegateSpan = Span & { label: string; excludesTheFounder: boolean };

function findDelegate(sentence: string, lifted: RegExp): DelegateSpan | null {
  for (const { pattern, label, excludesTheFounder } of DELEGATES) {
    const match = pattern.exec(sentence);
    if (match !== null) {
      return { start: match.index, end: match.index + match[0].length, label, excludesTheFounder };
    }
  }
  const handsOff = HANDS_OFF.exec(sentence);
  if (handsOff !== null && SEND_VERB.test(sentence)) {
    return {
      start: handsOff.index,
      end: handsOff.index + handsOff[0].length,
      label: 'sending DMs for you',
      excludesTheFounder: true,
    };
  }
  // Configured once, then running. Only a delegate when something is going out
  // or arriving in the same sentence, because on its own it is setup.
  const configured = CONFIGURED_THEN_RUNS.exec(sentence);
  if (configured !== null && (SEND_VERB.test(sentence) || RECEIPT_VERB.test(sentence))) {
    return {
      start: configured.index,
      end: configured.index + configured[0].length,
      label: 'sending DMs with nobody deciding each one',
      excludesTheFounder: true,
    };
  }
  // Last, whatever validate.sh is looking for today. Nothing it currently holds
  // gets here, because the delegates above already cover it. It is here so that
  // a pattern added to the shell script tomorrow is considered by this gate
  // without anybody remembering to come and copy it.
  const fromScript = lifted.exec(sentence);
  if (fromScript !== null) {
    return {
      start: fromScript.index,
      end: fromScript.index + fromScript[0].length,
      label: 'automating DMs',
      excludesTheFounder: false,
    };
  }
  return null;
}

/** Which line an offset falls on, zero based. The context arrays are by line. */
function lineIndexOf(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((lineStarts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Nothing but whitespace and markdown furniture in front of the offer. */
const ONLY_FURNITURE = /^[\s>*_`#+\-|.•]*$/;

/**
 * Is this line refusing the thing it names, rather than offering it?
 *
 * Three places a refusal is allowed to sit, and the third is the one that was
 * missing. See the comment above REFUSAL_BEFORE for what each is for.
 */
function readsAsRefusal(
  sentence: string,
  before: string,
  after: string,
  nextSentence: string | null,
): boolean {
  if (REFUSAL_BEFORE.test(before) && !NOT_ACTUALLY_REFUSING.test(before)) return true;

  const replacing = REPLACES_THE_MANUAL_WAY.test(sentence);
  if (replacing) return false;

  if (CONSEQUENCE_AFTER.test(after)) return true;

  // The founder's own hand, named as the way it is done. It stops counting when
  // it is negated: "so you are not doing them one by one" is the offer to take
  // the founder out, written with the words that describe leaving them in.
  const byHand = HUMAN_DECIDES_EACH_ONE.exec(sentence);
  if (byHand !== null && !NEGATED_JUST_BEFORE.test(sentence.slice(0, byHand.index))) return true;

  // The offer is the subject of its own sentence, so nothing could precede it
  // and the verdict can only be behind it.
  if (!ONLY_FURNITURE.test(before)) return false;
  if (REFUSAL_PREDICATE.test(after) && !NOT_ACTUALLY_REFUSING.test(after)) return true;
  if (nextSentence === null) return false;
  return REFUSAL_PREDICATE.test(nextSentence) && !NOT_ACTUALLY_REFUSING.test(nextSentence);
}

function checkOffers(artifact: Artifact, out: Violation[], notes: string[]): void {
  // READ THE PROSE, NOT THE COMMANDS. `maskNonProse` blanks fenced blocks,
  // inline code spans, HTML comments and URLs, leaving every newline and every
  // offset where it was, so a line number still points at the real line.
  //
  // WHY THIS RULE NEEDS IT NOW. `schemas/person.md` documents the touch command
  // as `ge person touch <who> dm out "..."`. The `dm` in there is an argument to
  // a command, not a word for a channel, and this rule read it as one and
  // refused the schema. It only started doing that when a wrapped line stopped
  // ending a sentence: the wrap used to hold the command and the phrase "by
  // itself" three lines below it in separate sentences, and that separation was
  // luck rather than a decision. The other rules in this folder have masked for
  // this reason all along.
  const prose = maskNonProse(artifact.text);
  const context = contextByLine(prose);
  const lineStarts: number[] = [0];
  for (let i = 0; i < prose.length; i += 1) {
    if (prose[i] === '\n') lineStarts.push(i + 1);
  }
  const { dmMention } = houseStyleSource();
  // Rebuilt without the global flag: a global regex carries lastIndex between
  // calls, and this one is read from a cache that outlives the turn.
  const lifted = new RegExp(dmMention.regex.source, 'i');

  const byLine = new Map<number, Violation>();
  let leftAlone = 0;

  const sentences = splitSentences(prose);
  for (const [index, sentence] of sentences.entries()) {
    const here = context[lineIndexOf(lineStarts, sentence.start)] ?? { inbound: false, aboutDms: false };

    // The delegate is required. Without one there is no automation, and the 25
    // openers sent by hand are the deliverable rather than the mistake.
    const delegate = findDelegate(sentence.text, lifted);
    if (delegate === null) continue;

    const channel = findChannel(sentence.text);
    if (channel === null) continue;

    const coreStart = Math.min(channel.start, delegate.start);
    const coreEnd = Math.max(channel.end, delegate.end);
    const before = sentence.text.slice(0, coreStart);
    const after = sentence.text.slice(coreEnd);

    // TWO WORDS THIS FAR APART ARE NOT ONE CLAIM. A hard wrapped paragraph is
    // one sentence now, and a paragraph holds two jobs: the GoHighLevel workflow
    // on its first line and the 25 DM openers on its third. See SAME_CLAIM.
    if (coreEnd - coreStart > SAME_CLAIM) continue;

    const cold = coldSpans(sentence.text);

    // The evidence. The one rule that keeps the sum honest is that a set of
    // words counts once: "automate the opener" says the channel and the
    // coldness with the same word, and that is one point rather than two.
    let evidence = channel.strength;
    if (here.aboutDms && channel.strength === 1) evidence += 1;
    if (cold.some((span) => apart(span, channel))) evidence += 1;
    if (delegate.excludesTheFounder) evidence += 1;

    // The next sentence, for the refusal rescue, and only when two things hold.
    // It has to be in the same paragraph, because a blank line ends the thought
    // and a refusal below it is not a verdict on this one. And it must not be an
    // offer in its own right: "automate the DMs so you never have to send one by
    // hand" is made of refusal words and it is an offer, so it cannot speak for
    // the sentence above it.
    const following = sentences[index + 1];
    let nextSentence: string | null = null;
    if (following !== undefined) {
      const between = prose.slice(sentence.start + sentence.text.length, following.start + 1);
      const sameParagraph = !/\n\s*\n/.test(between);
      const nextChannel = findChannel(following.text);
      const nextDelegate = findDelegate(following.text, lifted);
      const nextIsAnOffer = nextChannel !== null && nextDelegate !== null;
      if (sameParagraph && !nextIsAnOffer) nextSentence = following.text;
    }

    // THE TRIGGER IS ASKED FIRST, and the order matters. "Automate the reply to
    // inbound DMs, never the first message" is the sentence that states rule 2
    // correctly, and it is both a refusal and a description of the sanctioned
    // flow. Reading the refusal first turned the best line in the document into
    // a note asking the founder to check it. A line that answers somebody who
    // wrote in, and claims nothing cold, is the product working.
    const startedByThem = STARTED_BY_THEM.some((rx) => rx.test(sentence.text)) || here.inbound;
    if (startedByThem && cold.length === 0) {
      leftAlone += 1;
      continue;
    }

    const refusing = readsAsRefusal(sentence.text, before, after, nextSentence);
    const where = locate(artifact.path, artifact.text, sentence.start + coreStart);

    // THREE CODES, AND THE SPLIT IS A COORDINATION WITH `harvest-gate.ts`.
    //
    // That file decides what a blocking violation costs, and it holds one code
    // from this rule on its `WORTH_THE_WHOLE_TURN` list: `dm.offered` rolls the
    // whole turn back, the folder and all. Its argument for that is written out
    // beside the entry, and it is specific: the rule "fires only when a channel
    // and a hand off verb sit in the same sentence". That was true of every
    // sentence this rule could block before the widening. It is not true now.
    // "The openers go out overnight without you" names no channel at all: the
    // channel is inferred, from a word that means an opening message and from a
    // delegate that says nobody is deciding each one.
    //
    // Losing a founder's Sunday turn on an inference is not the same bet as
    // losing it on "we can automate your Instagram DMs", and the difference
    // should be visible to the thing making the decision rather than argued for
    // here. So a channel this rule INFERRED gets its own code. That file already
    // says what happens to a code it has never heard of: the file is held and
    // the rest of the turn is saved, on the reasoning that a code nobody has
    // argued for is a code nobody has argued is worth a founder's afternoon.
    // This is that mechanism used on purpose rather than by accident.
    const inferred = channel.strength === 1;
    const severity: Violation['severity'] = refusing || evidence < 2 ? 'warn' : 'block';

    // WHAT THE FOUNDER READS. They did not write this line. The model did, and
    // it wrote something that would cost them their Instagram account if they
    // acted on it. So the sentence names what happened, then what it would cost
    // THEM, and it never says "that is not something this product does", which
    // is the app talking about itself to somebody who asked about their business.
    let code: string;
    let message: string;
    if (refusing) {
      code = 'dm.mentioned-while-refusing';
      message = `This line explains why ${delegate.label} is done by hand. That is the right answer.`;
    } else if (evidence < 2) {
      code = 'dm.possible-offer';
      message = `This line might be about ${delegate.label} going out on their own. If it is about your inbox answering people who wrote to you first, it is fine as it is.`;
    } else if (inferred) {
      code = 'dm.offered-by-inference';
      message = `This reads as messages going out to people who did not ask. It never says Instagram, so it may be about email, where this is fine. If it is Instagram, that is the one that gets accounts restricted.`;
    } else {
      code = 'dm.offered';
      message = `This suggests ${delegate.label}. Instagram restricts accounts that do it, and yours is the account your whole plan runs through.`;
    }

    const violation: Violation = {
      rule: RULE,
      code,
      severity,
      where,
      found: sentence.text.slice(coreStart, coreEnd).trim().slice(0, 160),
      message,
      why: 'Instagram only lets a message go out after the other person has written to you first, and it restricts accounts that get round that. There is no appeal desk. Your twenty five go out by hand, from your own account, spread over the week, and the automation you do get sits on the inbound side, after somebody comes to you.',
      recovery: {
        label: 'Set up the inbound automation instead',
        action: { kind: 'route', skill: 'ghl-workflows' },
      },
    };

    // One report per line. The founder has one problem to fix, not five, and a
    // block on a line always wins over a warning on the same line.
    const already = byLine.get(where.line);
    if (already === undefined || (already.severity === 'warn' && violation.severity === 'block')) {
      byLine.set(where.line, violation);
    }
  }

  const found = [...byLine.values()].sort(
    (a, b) => a.where.line - b.where.line || a.where.column - b.where.column,
  );
  out.push(...found);

  if (leftAlone > 0) {
    notes.push(
      'Automation that answers somebody who wrote in first was read and left alone. That is where automation belongs.',
    );
  }
}

/** Run rule 2 over one artifact. */
export function checkNoDmAutomation(artifact: Artifact): RuleResult {
  const notes: string[] = [];

  if (artifact.authored === 'founder') {
    notes.push(`${artifact.path} was written by the founder, so it was not scanned for offers.`);
    return resultFrom(RULE, [artifact.path], [], notes);
  }

  const violations: Violation[] = [];
  checkOffers(artifact, violations, notes);
  notes.push(
    'The DM pattern was read from scripts/validate.sh, so the pre commit check and this one look for the same thing.',
  );
  return resultFrom(RULE, [artifact.path], violations, notes);
}
