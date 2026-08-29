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
 *   Both of those are about our code. The runtime check, `checkNoDmAutomation`,
 *   is about the model's output: a skill that offers to automate DMs for a
 *   founder is a bug even if nothing in our code could carry it out, because
 *   the founder would then go and do it with somebody else's tool.
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
 * Phrases that offer automation to the founder.
 *
 * The first pattern is lifted from `validate.sh`, so the pre commit check and
 * this one look for the same thing. The rest cover the ways a model offers a
 * thing without using the word "automation".
 */
const OFFER_SHAPES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  {
    // The lifted pattern needs the word "dm" straight after "automate". This
    // one allows the possessive in between, which is how the sentence is
    // actually written: "automate your DMs".
    pattern: /\bautomat\w*\s+(the\s+|your\s+|their\s+|these\s+|all\s+|his\s+|her\s+)?(cold\s+)?dms?\b/gi,
    label: 'automating DMs',
  },
  { pattern: /\b(bulk|mass|bot)[- ]?(send|dm|messag\w+)\b/gi, label: 'sending in bulk' },
  { pattern: /\bauto[- ]?(dm|reply to dms|respond to dms)\b/gi, label: 'automatic DMs' },
  { pattern: /\bschedule (the |your |these )?dms?\b/gi, label: 'scheduling DMs' },
  { pattern: /\bsend (the |your |these |all )?(\d+ )?dms? (for you|automatically|on a schedule)\b/gi, label: 'sending DMs for the founder' },
  { pattern: /\b(tool|script|software|service) (that |to )?(sends?|blast\w*) (cold )?dms?\b/gi, label: 'a tool that sends DMs' },
];

/**
 * Words that mean the line is refusing automation rather than offering it.
 *
 * The skills say "no DM automation" in as many words, and the ops engine
 * explains why. A gate that refuses the sentence explaining the rule is a gate
 * that gets switched off in week one.
 *
 * Two lists, and the split matters. "Instead of" and "by hand" only count in
 * front of the phrase. Behind it they are the tail of an offer: "automate your
 * DMs instead of sending them by hand" is exactly the sentence rule 2 exists to
 * stop, and a single list that looked anywhere on the line would have let it
 * through as a refusal.
 */
const REFUSAL_BEFORE =
  /\b(never|not|no|cannot|can't|do not|don't|avoid|refus\w*|forbid\w*|against|instead of|rather than|without|by hand|manual\w*)\b/i;

const REFUSAL_AFTER = /\b(never|not|forbidden|banned|restricted|refus\w*)\b/i;

/** The few words either side of a match, which is where the meaning sits. */
function nearWords(line: string, from: number, to: number): { before: string; after: string } {
  const before = line.slice(0, from).split(/\s+/).slice(-6).join(' ');
  const after = line.slice(to).split(/\s+/).slice(0, 8).join(' ');
  return { before, after };
}

function checkOffers(artifact: Artifact, out: Violation[]): void {
  const lines = artifact.text.split('\n');
  let offset = 0;

  const { dmMention } = houseStyleSource();
  const shapes = [
    { pattern: new RegExp(dmMention.regex.source, 'gi'), label: 'DM automation' },
    ...OFFER_SHAPES,
  ];

  for (const line of lines) {
    for (const shape of shapes) {
      const re = new RegExp(shape.pattern.source, 'gi');
      const match = re.exec(line);
      if (!match) continue;
      const { before, after } = nearWords(line, match.index, match.index + match[0].length);
      const refusing = REFUSAL_BEFORE.test(before) || REFUSAL_AFTER.test(after);
      out.push({
        rule: RULE,
        code: refusing ? 'dm.mentioned-while-refusing' : 'dm.offered',
        severity: refusing ? 'warn' : 'block',
        where: locate(artifact.path, artifact.text, offset + match.index),
        found: match[0],
        message: refusing
          ? `This line mentions ${shape.label} while saying not to. Read it once to be sure it reads as a refusal.`
          : `This offers ${shape.label}. That is not something this product does, or should suggest you do elsewhere.`,
        why: 'Automated cold DMs get accounts restricted, and Instagram only allows messaging after someone has messaged you first. Your twenty five go out by hand, from your own account, spread out. The automation you do get is on the inbound side, after somebody comes to you.',
        recovery: {
          label: 'See how the inbound side works instead',
          action: { kind: 'route', skill: 'ghl-workflows' },
        },
      });
      break; // One report per line. The founder has one problem to fix, not five.
    }
    offset += line.length + 1;
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
  checkOffers(artifact, violations);
  notes.push(
    'The DM pattern was read from scripts/validate.sh, so the pre commit check and this one look for the same thing.',
  );
  return resultFrom(RULE, [artifact.path], violations, notes);
}
