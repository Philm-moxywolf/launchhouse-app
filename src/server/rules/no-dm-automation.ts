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
 *   person. Its own section below says how it works and what it was getting
 *   wrong, which was most of what it was for: it matched six fixed phrasings,
 *   and naming the platform was enough to walk past every one of them.
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
 * IT USED TO LOOK FOR PHRASINGS INSTEAD, and a phrasing list is a coincidence
 * rather than a guard. Putting the platform name in was enough to walk past it.
 * "We can automate DMs for you" was refused. "We can automate the Instagram
 * DMs for you" passed clean: no block, no note, nothing. The pattern wanted the
 * word "DM" within a word or two of "automate", so the more natural the
 * sentence, the more likely it was to survive. Six of the nine most ordinary
 * ways to offer this went straight through, and every one of the six named
 * Instagram, which is to say every one of the six was worse than the three that
 * were caught.
 *
 * So the shape changed. Rather than matching whole sentences it looks for two
 * things inside one sentence and then asks one question.
 *
 *   THE CHANNEL   a private message to a person: a DM, a direct message, an
 *                 Instagram message.
 *   THE DELEGATE  something other than the founder's own hand doing the
 *                 sending: an automation word, a bot, a scheduler, a tool that
 *                 sends, "for you", "on your behalf", "everybody gets one".
 *   THE QUESTION  did the other person start it?
 *
 * THE QUESTION IS THE WHOLE RULE, because it is the only thing separating the
 * half of this product that is forbidden from the half that is promised.
 * Inbound automation is sanctioned and it is most of what the B2C track ships:
 * a comment fires a DM, a workflow answers somebody who wrote in, a qualify and
 * book flow runs on a conversation the other person opened. Every one of those
 * is a channel plus a delegate. Every one of them has to pass, or this gate has
 * blocked the product instead of the mistake. What they carry, and what a cold
 * blast never carries, is the trigger: a comment, a keyword, a message that came
 * in first.
 *
 * A FOLLOW IS NOT A TRIGGER. "Every new follower gets a DM" is the most common
 * way this gets built and it is the exact thing that restricts accounts:
 * Instagram permits messaging after somebody messages you, not after somebody
 * follows you. So following appears in the cold list below and never in the
 * inbound one.
 *
 * THE DOCUMENT IS PART OF THE SENTENCE, for two of the readings. Under a
 * heading that says "Comment to DM", the line "write the auto DM message" is
 * the sanctioned flow and refusing it would refuse the deliverable. And
 * "automate the opener" is the banned thing in a DM document and ordinary work
 * in a B2B one, where the openers are emails and the sequence is meant to be
 * automated in GoHighLevel. Neither can be settled by the sentence on its own,
 * so the heading and the paragraph are read as well. The cold list is what
 * stops that becoming a way through: no heading rescues a line that says "for
 * you" or "every new follower".
 *
 * WHERE IT ERRS. Ambiguity is refused. A sentence that automates DMs without
 * saying what set them off gets blocked, and the fix the model then makes is to
 * name the trigger, which is the sentence a founder needed anyway. The cost of
 * a wrong block is a rewrite. The cost of a wrong pass is a founder's Instagram
 * account, at an event they paid to attend.
 */

/** A private message to a person, in the words a model actually uses. */
const CHANNEL: readonly RegExp[] = [
  /\bdm(?:s|'s|ing|med|ming|'d|ed)?\b/i,
  /\bdirect[\s-]?messag(?:e|es|ing)\b/i,
  /\b(?:instagram|insta|ig)\s+(?:dms?|messag(?:e|es|ing))\b/i,
  /\bmessag(?:e|es|ing)\s+(?:on|via|through|in)\s+(?:instagram|ig|the\s+dms?)\b/i,
];

/**
 * "Message" on its own is not a channel. It is what a founder does in the
 * composer, what the ops engine logs, and what half this codebase is named
 * after. Same for an inbox and a conversation. They only count when the same
 * sentence says which platform, or who it is going to.
 */
const GENERIC_CHANNEL = /\b(?:messag(?:e|es|ed|ing)|inbox|conversations?|threads?)\b/i;
const CHANNEL_CONTEXT = /\b(?:instagram|insta|ig|followers?)\b/i;

/**
 * Words that mean a DM only in a document that is about DMs.
 *
 * "Automate the opener" is the banned thing in `dm-openers.md` and it is
 * ordinary B2B work in `outreach-sequence.md`, where the openers are emails and
 * the automation is a GoHighLevel campaign the founder is meant to build. The
 * word cannot decide that on its own. The document can, so these count only
 * under a heading or inside a paragraph that has already said DM.
 */
const NEAR_CHANNEL = /\b(?:openers?|conversations?|inbox|first message|messages?)\b/i;

/** What makes a heading or a paragraph a DM document. */
const DM_WORD = /\b(?:dms?|direct[\s-]?messag(?:e|es|ing))\b/i;

/**
 * Anything that sends without a person choosing to send that one.
 *
 * The connector in the middle is optional because both halves of it get
 * written: "a tool that sends the DMs" and "the workflow sends them a DM" are
 * the same claim, and the second one is the shorter, so it is the one a model
 * reaches for.
 */
const TOOL_SENDS =
  /\b(?:tool|tools|app|apps|application|chatbot|bot|bots|script|scripts|software|service|services|platform|plugin|extension|integration|automation|scheduler|sender|workflow|system|robot)\b\s*(?:[^.!?\n]{0,45}?\b(?:to|that|which|and it|so it)\s+)?(?:automatically\s+)?(?:sends?|blasts?|fires?|delivers?|dms?|messages?|pushes?|answers?|replies|reply|responds?|handles?|handle|manages?|takes? over|takes? care of)\b/i;

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
  /(?:[Uu]se|[Uu]sing|[Cc]onnect|[Ii]nstall|[Aa]dd|[Tt]ry|[Gg]et|[Rr]un|[Cc]onfigure|[Ii]ntegrate|[Bb]uy|[Ss]ubscribe to|[Ss]et ?up|[Hh]ook up|[Pp]lug in|[Ww]ire up|[Pp]oint|[Ss]witch on|[Tt]urn on|[Ee]nable)\s+(?:the\s+|a\s+|an\s+)?[A-Z][A-Za-z0-9]{2,}\b[^.!?\n]{0,25}?\b(?:to|that|which|and it|so it|so they)\s+(?:automatically\s+)?(?:sends?|blasts?|fires?|delivers?|dms?|messages?|pushes?|handles?|handle)\b/

/** "Every new follower gets a message." Nobody chose to send that one either. */
const MASS_RECEIPT =
  /\b(?:every|each|all|any|anyone|everyone|whoever)\b[^.!?\n]{0,40}?\b(?:gets?|receives?|is sent|are sent|will get|will receive)\b[^.!?\n]{0,20}?\b(?:a\s+|an\s+|the\s+)?(?:dms?|messages?|direct messages?)\b/i;

/**
 * The same thing said the other way round: "DM everyone on the list".
 *
 * Kept tight on purpose, twice over. The mass word has to sit right after the
 * verb, with at most a determiner in between, because "dm-openers.md, numbered,
 * with the target handle against each" is a sentence this product writes and it
 * is not an offer to message everybody. And the mass word has to be followed by
 * a recipient rather than by the message itself: "send each DM from your own
 * phone" is the instruction to do all 25 by hand, and "DM everyone on the list"
 * is the thing that gets the account restricted.
 */
const MASS_SEND =
  /\b(?:dm|dms|message|messages|send|sends|sending|sent|deliver\w*|blast\w*|fire\w*|push\w*)\s+(?:(?:a|an|the|them|it|these|those)\s+)?(?:to\s+)?(?:each|every|all|any|anyone|everyone|whoever)\b(?!\s+(?:dms?|messages?|direct\s+messages?|openers?|of\s+the\s+dms?))/i;

/**
 * Sending with the founder taken out of it.
 *
 * "for you" carries a lookahead because "the DM openers for you to send by
 * hand" is the opposite claim, and it is a sentence this product writes.
 */
const HANDS_OFF =
  /\b(?:for you\b(?!\s+to\b)|on your behalf|while you sleep|in your sleep|without lifting a finger|without you\b|without touching|with no work from you|no work from you|hands[\s-]?off|hands free|set (?:it )?and forget|on autopilot|autopilot|overnight|round the clock|24\/7|while you focus|by itself|on its own|runs itself|so you (?:do not|don'?t) have to)/i;

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
const DELEGATES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:bulk|mass|batch(?:es|ed|ing)?|blast(?:s|ed|ing)?|drip(?:s|ped|ping)?|at scale|in volume|at volume|high[\s-]?volume)\b/i, label: 'sending DMs in bulk' },
  { pattern: /\b(?:chat)?bots?\b/i, label: 'a bot that sends DMs' },
  { pattern: /\b(?:schedul(?:e|es|ed|er|ers|ing)|queue(?:s|d)?|queuing|queueing|on a timer|timer|cron)\b/i, label: 'scheduling DMs' },
  { pattern: /\bautomat(?:e|es|ed|ing|ion|ic|ically)\b/i, label: 'automating DMs' },
  { pattern: /\bauto[\s-]?(?:dm|dms|send|sends|sender|sending|message|messages|messaging|reply|replies|respond|responder)\b/i, label: 'automating DMs' },
  { pattern: TOOL_SENDS, label: 'a tool that sends DMs' },
  { pattern: NAMED_TOOL_SENDS, label: 'a tool that sends DMs' },
  { pattern: MASS_RECEIPT, label: 'sending the same DM to everybody' },
  { pattern: MASS_SEND, label: 'sending the same DM to everybody' },
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
 * Words that are never true of a reply to somebody who wrote in.
 *
 * These override the inbound reading. An inbound workflow answers one person
 * who acted; it is not run "at scale", it does not go to "every new follower",
 * and nobody describes it as happening "for you" or "while you sleep". So when
 * one of these is in the sentence, saying "inbound" somewhere else in the
 * paragraph does not rescue it.
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
  /\b(?:your|their|the target)\s+(?:list|prospects?|leads?)\b/i,
  /\btarget accounts?\b/i,
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
 * explains why. A gate that refuses the sentence explaining the rule is a gate
 * that gets switched off in week one.
 *
 * SEPARATE LISTS, AND THE SPLIT IS WHAT STOPS IT BEING A BYPASS. Negation only
 * counts in FRONT of the offer. Consequences only count BEHIND it. A sentence
 * that names the manual way counts as a refusal only when it is not offering to
 * replace it, because "automate your DMs instead of sending them by hand" is
 * the exact sentence rule 2 exists to stop and it is made almost entirely of
 * refusal words. And a negation that is itself negated does not count at all,
 * because "nothing stops you automating the DMs" is a permission.
 */
const REFUSAL_BEFORE =
  /\b(?:never|not|no|cannot|can't|do not|don't|avoid\w*|refus\w*|forbid\w*|against|instead of|rather than|without|by hand|manual\w*|stop\w*|nothing|none|neither|nor)\b/i;

const CONSEQUENCE_AFTER =
  /\b(?:restrict\w*|banned|bans?|shadow ?ban\w*|suspend\w*|blocked|action blocks?|at risk|flagged|forbidden|not allowed|against the (?:rules|terms|guidelines)|scrap(?:ing|es)|violat\w*|puts? the account|lose (?:the|your) account|is a bug)\b/i;

/** The founder decides each one, which is what rule 2 asks for. */
const HUMAN_DECIDES_EACH_ONE =
  /\b(?:by hand|manual(?:ly)?|one at a time|one by one|yourself|from your own (?:account|phone|app)|in your own app)\b/i;

/**
 * A negation that is itself negated. "Nothing stops you automating the DMs" is
 * made of refusal words and it is a permission, so the words in front of the
 * offer stop counting when one of these is among them.
 */
const NOT_ACTUALLY_REFUSING =
  /\b(?:nothing (?:stops|is stopping|prevents|wrong with)|no reason not to|no harm in|not a problem|nobody (?:is )?stopping|why not)\b/i;

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

function isCold(sentence: string): boolean {
  for (const pattern of NEVER_INBOUND) {
    const match = pattern.exec(sentence);
    if (match === null) continue;
    if (NEGATED_JUST_BEFORE.test(sentence.slice(0, match.index))) continue;
    return true;
  }
  return false;
}

interface Sentence {
  text: string;
  /** Offset of this sentence in the whole artifact. */
  start: number;
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
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== ';' && ch !== '\n') continue;
    const end = i + 1;
    if (ch !== '\n' && end < text.length && !/\s/.test(text[end] ?? '')) continue;
    out.push({ text: text.slice(start, end), start });
    start = end;
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
 * opener in the B2B track's sequence, where automating it is the plan.
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

function findChannel(sentence: string, aboutDms: boolean): Span | null {
  const direct = firstOf(CHANNEL, sentence);
  if (direct !== null) return direct;
  if (CHANNEL_CONTEXT.test(sentence)) {
    const generic = GENERIC_CHANNEL.exec(sentence);
    if (generic !== null) return { start: generic.index, end: generic.index + generic[0].length };
  }
  if (!aboutDms) return null;
  const near = NEAR_CHANNEL.exec(sentence);
  return near === null ? null : { start: near.index, end: near.index + near[0].length };
}

function findDelegate(sentence: string, lifted: RegExp): (Span & { label: string }) | null {
  for (const { pattern, label } of DELEGATES) {
    const match = pattern.exec(sentence);
    if (match !== null) {
      return { start: match.index, end: match.index + match[0].length, label };
    }
  }
  const handsOff = HANDS_OFF.exec(sentence);
  if (handsOff !== null && SEND_VERB.test(sentence)) {
    return { start: handsOff.index, end: handsOff.index + handsOff[0].length, label: 'sending DMs for you' };
  }
  // Last, whatever validate.sh is looking for today. Nothing it currently holds
  // gets here, because the delegates above already cover it. It is here so that
  // a pattern added to the shell script tomorrow is considered by this gate
  // without anybody remembering to come and copy it.
  const fromScript = lifted.exec(sentence);
  if (fromScript !== null) {
    return { start: fromScript.index, end: fromScript.index + fromScript[0].length, label: 'automating DMs' };
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

function checkOffers(artifact: Artifact, out: Violation[], notes: string[]): void {
  const context = contextByLine(artifact.text);
  const lineStarts: number[] = [0];
  for (let i = 0; i < artifact.text.length; i += 1) {
    if (artifact.text[i] === '\n') lineStarts.push(i + 1);
  }
  const { dmMention } = houseStyleSource();
  // Rebuilt without the global flag: a global regex carries lastIndex between
  // calls, and this one is read from a cache that outlives the turn.
  const lifted = new RegExp(dmMention.regex.source, 'i');

  const byLine = new Map<number, Violation>();
  let leftAlone = 0;

  for (const sentence of splitSentences(artifact.text)) {
    const here = context[lineIndexOf(lineStarts, sentence.start)] ?? { inbound: false, aboutDms: false };
    const channel = findChannel(sentence.text, here.aboutDms);
    if (channel === null) continue;
    const delegate = findDelegate(sentence.text, lifted);
    if (delegate === null) continue;

    const coreStart = Math.min(channel.start, delegate.start);
    const coreEnd = Math.max(channel.end, delegate.end);
    const before = sentence.text.slice(0, coreStart);
    const after = sentence.text.slice(coreEnd);

    const replacing = REPLACES_THE_MANUAL_WAY.test(sentence.text);
    const refusing =
      (REFUSAL_BEFORE.test(before) && !NOT_ACTUALLY_REFUSING.test(before)) ||
      (!replacing && (CONSEQUENCE_AFTER.test(after) || HUMAN_DECIDES_EACH_ONE.test(sentence.text)));

    const where = locate(artifact.path, artifact.text, sentence.start + coreStart);

    if (!refusing) {
      const cold = isCold(sentence.text);
      const startedByThem = STARTED_BY_THEM.some((rx) => rx.test(sentence.text)) || here.inbound;
      if (startedByThem && !cold) {
        leftAlone += 1;
        continue;
      }
    }

    const violation: Violation = {
      rule: RULE,
      code: refusing ? 'dm.mentioned-while-refusing' : 'dm.offered',
      severity: refusing ? 'warn' : 'block',
      where,
      found: sentence.text.slice(coreStart, coreEnd).trim().slice(0, 160),
      message: refusing
        ? `This line mentions ${delegate.label} while saying not to. Read it once to be sure it reads as a refusal.`
        : `This offers ${delegate.label}. That is not something this product does, or should suggest you do elsewhere.`,
      why: 'Automated cold DMs get accounts restricted, and Instagram only allows messaging after someone has messaged you first. Your twenty five go out by hand, from your own account, spread out. The automation you do get is on the inbound side, after somebody comes to you.',
      recovery: {
        label: 'See how the inbound side works instead',
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
