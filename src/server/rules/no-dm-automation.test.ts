/**
 * no-dm-automation.test.ts: rule 2, and the test that makes the source scan
 *   build breaking.
 *
 * WHY IT EXISTS: the source scan in no-dm-automation.ts only does anything if
 *   something fails the build on a hit. This file is that something. If it is
 *   deleted, layer B of rule 2 quietly stops existing, which is why the test
 *   name says so out loud.
 *
 *   The second half of this file is about the scan's ROOT. The root used to be
 *   `src/server`, which left `app/`, `scripts/` and the future `src/web/`
 *   unscanned, so a send path planted in `src/server` turned the scan red and
 *   the identical string in `app/content` left it green. The tests below hold
 *   the widened root two ways: what the scan actually reads today, listed by
 *   directory, and what it does with a plant in each of the newly covered
 *   directories.
 *
 *   THE THIRD SECTION IS THE CORPUS, and it is the point of this file now. The
 *   runtime check used to be six regular expressions matched against whole
 *   phrasings, and six phrasings is a coincidence rather than a guard: naming
 *   the platform walked straight past it, so "we can automate DMs for you" was
 *   refused and "we can automate the Instagram DMs for you" passed clean. Six
 *   of the nine most ordinary ways to offer the thing rule 2 exists to prevent
 *   went through, and all six of them named Instagram.
 *
 *   So the corpus below is written first and the rule is held to it: offers
 *   with the platform named and without, in the passive, as an instruction, with
 *   a tool named, and hedged. Beside it sits the half that must keep passing,
 *   because inbound automation is sanctioned and is most of what the B2C track
 *   ships. A rule that refuses those has blocked the product rather than the
 *   mistake, so the paired tests take one clause out of an allowed sentence and
 *   prove the same sentence is then refused.
 *
 *   THAT CORPUS WAS NOT ENOUGH EITHER, AND THE FOURTH SECTION IS WHY. The rule
 *   it produced matched a channel list AND a delegate list, and a reviewer
 *   invented fourteen fresh offers in one sitting of which thirteen reached a
 *   founder. Every list is a coincidence, whether it holds phrasings or words.
 *   `FOURTEEN_INVENTED_OFFERS` is that sitting, and `STILL_MISSED` names the one
 *   that is still not caught so the count cannot drift back up quietly.
 *
 *   THE SAME SECTION HOLDS THE DISCLAIMER, and it is the more urgent half. The
 *   gate refused "Automated cold DMs are not something we do. They get accounts
 *   restricted.", which is the sentence `audience-b2c/SKILL.md` instructs the
 *   model to write when a founder asks for DM automation. A block cost the whole
 *   turn. So the product was telling the model to write something that destroyed
 *   a founder's afternoon.
 *
 *   EVERY GUARD IN THE FIX HAS A PAIR, because a guard nobody has watched fail
 *   is a guard nobody has tested. Each of the tests below that proves a rescue
 *   works is followed by one that removes the reason and proves the same
 *   sentence is then refused. Reverting any single line of the fix in the source
 *   turns at least one of them red; that was checked by doing it, one line at a
 *   time, rather than assumed.
 *
 *   THE PLANT RUNS IN A COPY OF THE REPOSITORY'S SHAPE, not in the repository.
 *   Writing a file containing a send path into somebody's working tree and
 *   deleting it afterwards works right up until the run is interrupted, and
 *   then it leaves the one string this project refuses to contain sitting in
 *   `app/`. The mirror has the same directory names and the same exclusions, so
 *   it exercises the same decision, and the test above it proves the real root
 *   is the repository.
 *
 * CALLED BY: node --test.
 * READS:     the whole repository, for the scan, and the audience-b2c skill from
 *   the vendored content, for the false positive test.
 * WRITES:    a temporary tree under the system temp directory, removed after.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkNoDmAutomation,
  DENIED_SOURCE_TOKENS,
  OUTBOUND_MESSAGE_CAPABILITIES,
  repositoryRoot,
  RULE_2,
  SCAN_EXCLUDED_DIRS,
  SCAN_EXCLUDED_FILES,
  SCAN_EXEMPT_PATHS,
  scannedFiles,
  scanSourceTree,
  sourceScanFailure,
  type NoCapabilities,
} from './no-dm-automation.ts';
import { readContentFile } from './content-root.ts';
import { checkProseText } from './prose.ts';
import type { Artifact } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function art(text: string): Artifact {
  return { path: 'ops-workflow.md', text, authored: 'model' };
}

test('THE BUILD BREAKS IF ANYTHING IN THIS REPOSITORY CAN SEND A MESSAGE', () => {
  const hits = scanSourceTree();
  assert.deepEqual(hits, [], hits.length > 0 ? sourceScanFailure(hits) : 'clean');
});

test('the scan really does find a send path when there is one to find', () => {
  // Without this, the test above passes on an empty tree and layer B is a
  // comment. The fixture is written outside both repos, torn down after, and
  // its content is the shape somebody would actually add: a fetch to a Meta
  // host with a send verb beside it.
  const dir = mkdtempSync(join(tmpdir(), 'rules-dm-scan-'));
  try {
    writeFileSync(
      join(dir, 'somebody-was-in-a-hurry.ts'),
      ['export async function reachOut() {', '  await fetch(`https://graph.facebook.com/v0/me/messages`);', '}', ''].join('\n'),
    );
    const hits = scanSourceTree(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.token, 'graph.facebook.com');
    assert.equal(hits[0]?.line, 2);
    assert.match(sourceScanFailure(hits), /never calls Meta/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every denied token is a string the scan would actually match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rules-dm-tokens-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"name":"mirror"}\n');
    for (const [i, entry] of DENIED_SOURCE_TOKENS.entries()) {
      writeFileSync(join(dir, `f${i}.ts`), `const x = '${entry.token}';\n`);
    }
    const hits = scanSourceTree(dir);
    const found = new Set(hits.map((h) => h.token));
    for (const entry of DENIED_SOURCE_TOKENS) {
      assert.ok(found.has(entry.token), `${entry.token} is on the list but the scan misses it`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE TWO EXCEPTIONS ARE EXACTLY TWO WORDS WIDE, AND ONLY IN THE BROWSER', () => {
  // The exception exists because "send a message" is this product's own words
  // for what a founder does in the composer. It must not have quietly grown into
  // a general pass for src/web, which is the one directory where a link to
  // somebody else's inbox would plausibly be added.
  const withException = DENIED_SOURCE_TOKENS.filter((t) => t.exceptIn !== undefined);
  assert.deepEqual(
    withException.map((t) => t.token),
    ['sendMessage', 'send_message'],
  );
  for (const entry of withException) {
    assert.deepEqual(entry.exceptIn, ['src/web/']);
    assert.ok((entry.exceptWhy ?? '').length > 20, `${entry.token} has an exception with no argument behind it`);
  }

  const root = mkdtempSync(join(tmpdir(), 'rules-dm-exception-'));
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"mirror"}\n');
    mkdirSync(join(root, 'src', 'web', 'lib'), { recursive: true });
    mkdirSync(join(root, 'src', 'server', 'agent'), { recursive: true });

    // The real shape: the composer posting the founder's own text to our own server.
    writeFileSync(join(root, 'src/web/lib/api.ts'), 'export function sendMessage(t: string) { return t; }\n');
    // Everything else stays red in the browser, and these are the ones that matter
    // there: somebody else's host, somebody else's inbox path, and every DM word.
    writeFileSync(join(root, 'src/web/lib/inbox.ts'), 'const a = "graph.instagram.com";\nconst b = "/conversations";\nconst c = "sendDm";\nconst d = "autoDm";\n');
    // And the exception does not reach the server, where a credential exists.
    writeFileSync(join(root, 'src/server/agent/thing.ts'), 'export const verb = "sendMessage";\n');

    const byFile = new Map<string, string[]>();
    for (const hit of scanSourceTree(root)) {
      byFile.set(hit.file, [...(byFile.get(hit.file) ?? []), hit.token]);
    }

    assert.equal(byFile.has('src/web/lib/api.ts'), false, 'the composer post should not be a hit');
    assert.deepEqual(byFile.get('src/server/agent/thing.ts'), ['sendMessage'], 'the exception must not reach the server');
    assert.deepEqual(
      (byFile.get('src/web/lib/inbox.ts') ?? []).sort(),
      ['/conversations', 'autoDm', 'graph.instagram.com', 'sendDm'],
      `every DM word and every third party host stays denied in the browser\n\n${RULE_2}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the exemption list is exactly one path, and nobody has added their own', () => {
  assert.deepEqual(SCAN_EXEMPT_PATHS, ['src/server/rules/no-dm-automation.ts']);
});

/* -------------------------------------------------------------------------- */
/* The scan root, which is the whole repository                               */
/* -------------------------------------------------------------------------- */

test('THE SCAN ROOT IS THE REPOSITORY, not one directory inside it', () => {
  const root = repositoryRoot();
  // Named against this file's own location rather than a hardcoded path, so the
  // test says "three levels up from the rules folder" the same way the code does.
  assert.equal(root, join(HERE, '..', '..', '..'));
  assert.equal(scanSourceTree(root).length, 0);
});

test('THE SCAN READS app/, scripts/ AND src/server/, WHICH IS THE WIDENING', () => {
  // The direct answer, with nothing planted anywhere. Before the widening this
  // list held src/server and nothing else.
  const files = scannedFiles();
  const topLevel = new Set(files.map((f) => f.split('/')[0]));

  for (const dir of ['app', 'scripts', 'src']) {
    assert.ok(topLevel.has(dir), `the scan does not read ${dir}/, so a send path there would pass`);
  }
  assert.ok(files.includes('app/content/ghl-walk.ts'), 'app/content is not being read');
  assert.ok(files.includes('scripts/probe-deployment.ts'), 'scripts/ is not being read');
  assert.ok(files.includes('src/server/agent/labels.ts'), 'src/server is not being read');
  assert.ok(files.includes('eslint.config.js'), 'the repository root files are not being read');

  // And the things it must not read, for the reasons written beside them.
  assert.ok(!files.some((f) => f.startsWith('node_modules/')), 'the scan is reading node_modules');
  assert.ok(!files.some((f) => f.startsWith('vendor/')), 'the scan is following the symlink into the content repo');
  assert.ok(!files.includes('package-lock.json'), 'the scan is reading the lockfile');
  assert.ok(!files.includes('src/server/rules/no-dm-automation.ts'), 'the denylist is scanning itself');
});

test('the excluded lists are exactly these, and each one carries a reason', () => {
  assert.deepEqual(
    SCAN_EXCLUDED_DIRS.map((d) => d.name),
    ['node_modules', 'dist', 'coverage', 'vendor'],
  );
  assert.deepEqual(
    SCAN_EXCLUDED_FILES.map((f) => f.name),
    ['package-lock.json'],
  );
  for (const entry of [...SCAN_EXCLUDED_DIRS, ...SCAN_EXCLUDED_FILES]) {
    assert.ok(entry.why.length > 20, `${entry.name} needs a reason, not a label`);
  }
});

test('IT GOES RED FOR A PLANT IN EVERY NEWLY COVERED DIRECTORY', () => {
  // One fixture, five plants, one assertion per directory. src/web does not
  // exist yet and is the one that matters most: it is where a link to a
  // conversations inbox would plausibly be added, because that is where links
  // live.
  const root = mkdtempSync(join(tmpdir(), 'rules-dm-root-'));
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"mirror"}\n');

    const plants: Array<{ where: string; file: string; line: string; token: string }> = [
      { where: 'app/content', file: 'inbox-link.ts', line: 'export const path = "/conversations";', token: '/conversations' },
      { where: 'scripts', file: 'blast.ts', line: 'export async function sendDm() {}', token: 'sendDm' },
      { where: 'src/web/routes', file: 'Inbox.tsx', line: 'const host = "graph.instagram.com";', token: 'graph.instagram.com' },
      { where: 'src/server/agent', file: 'labels.ts', line: 'export const verb = "send_message";', token: 'send_message' },
      { where: '.', file: 'helper.mjs', line: 'export const autoDm = true;', token: 'autoDm' },
    ];
    for (const plant of plants) {
      mkdirSync(join(root, plant.where), { recursive: true });
      writeFileSync(join(root, plant.where, plant.file), `${plant.line}\n`);
    }

    // And the places a plant must NOT be found, so the exclusions are exercised
    // by the same walk rather than being taken on trust.
    for (const excluded of ['node_modules/somepackage', 'vendor/growth-engine', 'dist', 'coverage']) {
      mkdirSync(join(root, excluded), { recursive: true });
      writeFileSync(join(root, excluded, 'thing.ts'), 'export const x = "sendDm";\n');
    }
    writeFileSync(join(root, 'package-lock.json'), '{"name":"sendDm"}\n');
    // A test file, which is skipped so that this very file can exist.
    writeFileSync(join(root, 'src/web/routes/Inbox.test.ts'), 'const x = "sendDm";\n');

    const hits = scanSourceTree(root);
    const byFile = new Map(hits.map((h) => [h.file, h]));

    for (const plant of plants) {
      const rel = plant.where === '.' ? plant.file : `${plant.where}/${plant.file}`;
      const hit = byFile.get(rel);
      assert.ok(hit, `${rel} was planted with a send path and the scan did not find it\n\n${RULE_2}`);
      assert.equal(hit.token, plant.token);
      assert.equal(hit.line, 1);
    }

    for (const clean of [
      'node_modules/somepackage/thing.ts',
      'vendor/growth-engine/thing.ts',
      'dist/thing.ts',
      'coverage/thing.ts',
      'package-lock.json',
      'src/web/routes/Inbox.test.ts',
    ]) {
      assert.equal(byFile.has(clean), false, `${clean} should not be scanned, and it was`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('THE ROOT IS CHECKED, NOT COUNTED, so a moved folder refuses instead of scanning a subtree', () => {
  // The failure this prevents: somebody moves the rules folder, the "three
  // levels up" arithmetic quietly points at src/, and the denylist covers a
  // third of the code while still reporting clean. That is the exact bug the
  // widening was fixing, arriving a second time by a different door.
  const orphan = mkdtempSync(join(tmpdir(), 'rules-dm-orphan-'));
  try {
    const nested = join(orphan, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    assert.throws(() => repositoryRoot(nested), /could not find the repository root/);
  } finally {
    rmSync(orphan, { recursive: true, force: true });
  }
});

test('the send capability list is empty and the type keeps it that way', () => {
  assert.equal(OUTBOUND_MESSAGE_CAPABILITIES.length, 0);
});

/**
 * A COMPILE TIME ASSERTION, and it is the only thing that proves layer A has teeth.
 *
 * The check above only says the array is empty today. It says nothing about whether
 * the constraint would refuse a send capability tomorrow, which is the whole claim.
 * `Allowed` puts the question to the constraint directly. If somebody widens
 * `NoCapabilities` to `readonly string[]` so their new capability compiles, the
 * second line below evaluates to 'allowed', the annotation says 'refused', and
 * `tsc --noEmit` fails here with rule 2 printed beside it.
 *
 * Both values are read at runtime, so neither is an unused local.
 */
type Allowed<T> = T extends NoCapabilities ? 'allowed' : 'refused';

test('THE TYPE THAT KEEPS THE SEND LIST EMPTY REFUSES A NON EMPTY ONE', () => {
  const emptyList: Allowed<typeof OUTBOUND_MESSAGE_CAPABILITIES> = 'allowed';
  const withASendCapability: Allowed<readonly ['send_dm']> = 'refused';
  assert.equal(emptyList, 'allowed');
  assert.equal(withASendCapability, 'refused', RULE_2);
});

test('the failure message states rule 2 in full, for whoever trips it', () => {
  const message = sourceScanFailure([
    { file: 'src/server/x.ts', line: 3, token: 'sendDm', reason: 'a send verb', excerpt: 'x' },
  ]);
  assert.ok(message.includes(RULE_2));
  assert.match(message, /accounts restricted/);
  assert.match(message, /after the user has messaged first/);
  assert.match(message, /Do not add a file to SCAN_EXEMPT_PATHS/);
});

/* -------------------------------------------------------------------------- */
/* The runtime check, and the corpus it is held to                            */
/* -------------------------------------------------------------------------- */

/**
 * WAYS TO OFFER THE THING RULE 2 EXISTS TO PREVENT.
 *
 * This list is the test. The rule used to be six regular expressions matched
 * against whole phrasings, and a phrasing list is a coincidence rather than a
 * guard: naming the platform was enough to walk past it, so the six most
 * natural sentences in this list passed clean, no block and no note, while the
 * three that left "Instagram" out were caught.
 *
 * So the corpus is written first and the rule is held to it. Every group below
 * is a different way of saying the same thing, and the groups are the ones a
 * model actually reaches for: with the platform named and without, in the
 * passive, as an instruction rather than an offer, with a tool named, and
 * hedged. If a new phrasing gets through in a rehearsal, it goes in here first
 * and the rule is changed second.
 *
 * THE TOOL NAMES ARE MADE UP, on purpose. No real product is named and nothing
 * is claimed about any vendor's behaviour. The point of the group is that the
 * rule must not depend on knowing what the tool is called, because the tool
 * that gets a founder banned will be the one launched after any list was
 * written.
 */
const OFFERS_TO_AUTOMATE: readonly string[] = [
  // With the platform named. These are the six that used to pass clean.
  'Automate your Instagram DMs so every new follower gets a message.',
  'Set up a bot to send automated Instagram DMs to every follower.',
  'We can automate the Instagram DMs for you.',
  'Use a scheduler to send Instagram DMs to your followers automatically.',
  'Connect a tool that sends Instagram DMs on your behalf.',
  'Set up automated direct messages on Instagram.',

  // Without the platform named. These three were the only ones caught before.
  'We can automate DMs for you overnight.',
  'Use a tool that sends cold DMs at scale.',
  'Schedule the DMs so they go out while you sleep.',
  'Automate your DMs instead of sending them by hand.',
  'We can automate DMs for you, in bulk, on a schedule.',
  'Automate the DMs on whichever platform you like.',

  // In the passive, where there is no "we" offering anything.
  'The DMs are sent automatically to everyone who follows you.',
  'Your Instagram DMs can be automated.',
  'The DMs get handled by a bot.',
  'Direct messages are fired off automatically to each new follower.',
  'Cold DMs are handled by the scheduler.',
  'Instagram DMs are sent on your behalf once the integration is live.',

  // As an instruction rather than an offer.
  'Install an app that DMs everyone who likes the post.',
  'Set up automation so the DMs go out to your list every morning.',
  'Configure the workflow to blast DMs to your prospects.',
  'Hook up a Zap so every new follower gets a DM.',
  'Add a chatbot to your account so it answers new followers with a DM.',
  'Run the DM sequence in bulk overnight.',

  // With a tool named. The names below are invented.
  'Use Sendly to send Instagram DMs to your followers.',
  'Connect Postbox and it will DM every new follower for you.',
  'Try Reachy, it sends the direct messages for you.',

  // Hedged, softened, or offered as an aside.
  'If you want, we can set up automated DMs to your target accounts.',
  'Some founders use a bot for their Instagram DMs.',
  'You could automate the direct messages and let it run.',
  'It might be worth automating your Instagram DMs at this volume.',

  // Written to break the rule after it was rewritten, rather than while it was
  // being written. Nine of these got through the first version of the new check
  // and each one is here because it did.
  'Turn on automatic DMs for new followers.',
  'Let the software handle the DMs from here.',
  'A DM bot will keep the pipeline warm.',
  'Point an automation at your Instagram inbox so it opens conversations for you.',
  'The DMs can go out on a drip, twenty a day, without you touching it.',
  'Queue up the DMs and let them fire on a timer.',
  'Batch send the direct messages to your saved audience.',
  'Have the assistant DM everyone on the hashtag list.',
  'Automating your Instagram outreach means the DMs land while you focus elsewhere.',
  'Once it is wired up, Instagram DMs are delivered to each new follower with no work from you.',
  'Set the tool to message 50 accounts a day on Instagram.',
  'Bulk DM the people who liked your reel.',
  'An Instagram DM automation is the fastest way to fill the calendar.',
  'Schedule Instagram direct messages to your target list.',
  'We will hook the CRM up so it DMs your followers automatically.',
  'Use an outreach platform to send the first DM for you.',
  // A refusal word in front of an offer. It is still an offer.
  'Nothing stops you automating the first DM.',
];

/**
 * THE SIX THE BUG REPORT NAMED, kept separate and kept exactly as written.
 *
 * A corpus can be quietly edited until it agrees with the code. These six
 * cannot: they are the sentences that were observed passing clean, and the day
 * one of them passes again is the day the rule has regressed to what it was.
 */
const THE_SIX_THAT_USED_TO_PASS: readonly string[] = [
  'Automate your Instagram DMs so every new follower gets a message.',
  'Set up a bot to send automated Instagram DMs to every follower.',
  'We can automate the Instagram DMs for you.',
  'Use a scheduler to send Instagram DMs to your followers automatically.',
  'Connect a tool that sends Instagram DMs on your behalf.',
  'Set up automated direct messages on Instagram.',
];

/**
 * AUTOMATION THIS PRODUCT ACTUALLY SELLS, which must keep passing.
 *
 * Every line here is a channel plus a delegate, which is to say every line here
 * looks exactly like the list above to anything counting keywords. What makes
 * them different is that the other person started it. Step 5 of the audience
 * B2C skill is built out of these sentences, so a rule that refuses them has
 * blocked half the B2C track instead of blocking the mistake.
 */
const INBOUND_AUTOMATION: readonly string[] = [
  'Comment to DM. The founder posts, the caption invites a comment keyword, and Instagram fires an automatic DM because the user initiated.',
  'Write the trigger keyword, the auto-DM message, and the follow-up.',
  'The automated DM goes out after they message you first.',
  'A workflow that answers every DM from someone who messaged you first is fine.',
  'The auto DM is triggered by the comment, so the messaging window is open.',
  'Set up the workflow to send the DM in reply to their comment.',
  'The bot answers anyone who dms you, and only them.',
  'Automate the reply to inbound DMs, never the first message.',
];

/** The manual half, and the sentences that explain the rule. Also allowed. */
const MANUAL_OR_EXPLAINING: readonly string[] = [
  'When somebody comments the keyword, the workflow replies to them. They messaged you first.',
  'Send the 25 DMs by hand, from your own account, spread across the afternoon.',
  '25 DMs fired in a rapid burst can trigger Instagram action blocks.',
  'Write the DM openers for you to send by hand tomorrow.',
  'We can write the DM openers for you.',
  'Answer the DM they sent you, in your own words, when you get to it.',
  'Two sentences maximum. Long DMs do not get read.',
  'There is no DM automation here. Cold DMs are manual, twenty five of them, spread out.',
  'Automated cold DMs on Instagram get accounts restricted or banned.',
  'Any tool that claims to send unsolicited DMs at volume is scraping the interface, and it puts the account at risk.',
  'Do not build, recommend, or write copy for volume DM automation.',
  'The automation lives entirely on the inbound side, where it is fully supported.',

  // Written to break the rule the other way: sentences the gate must not touch,
  // chosen because they are stuffed with the words it looks for.
  'The inbound machine answers the DM within a minute of them writing in.',
  'GoHighLevel fires the workflow when the comment keyword lands, and the DM goes out then.',
  'The comment keyword is the trigger. Nothing goes out before somebody uses it.',
  'Qualify the inbound DM in three steps, then route to the booking link.',
  'Reply to every comment on the post by hand for the first week.',
  'Paste the handle and one detail, and we will draft the DM opener.',
  'Number the 25 DM openers so you can tick them off as you send.',
  'Your Instagram account needs to be Business or Creator before the inbound DM flow works.',
  'The DM openers file is yours to edit before Saturday.',
  'Read the DM they sent, then answer it in your own voice.',
  'A workflow triggered by a customer action is allowed. A workflow that starts the conversation is not.',
  'Never automate the first DM. Automate the reply to one you were sent.',
  'Send them spread across the Saturday afternoon, a few at a time with gaps.',
  'The auto responder only runs for people who opted in.',

  // Instructions to do it by hand that are built out of the same words as an
  // offer to automate it. Every one of these was refused by a version of this
  // rule, which is the gate refusing the work rather than the mistake.
  'You have to send the 25 DMs yourself.',
  'You have to send each DM from your own phone.',
  'Get your DM openers ready to send on Saturday.',
  'Add the handle to the list, then send the DM when you are ready.',
  'Use the opener you wrote to send a DM to that one account.',
  'Let the founder decide which DM to send first.',
  'Run through the 25 DMs and send the ones you are happy with.',
];

test('EVERY WAY IN THE CORPUS OF OFFERING DM AUTOMATION IS REFUSED', () => {
  const slippedThrough: string[] = [];
  for (const line of OFFERS_TO_AUTOMATE) {
    const result = checkNoDmAutomation(art(line));
    if (result.ok) {
      slippedThrough.push(line);
      continue;
    }
    assert.equal(result.violations[0]?.code, 'dm.offered', line);
    assert.equal(result.violations[0]?.severity, 'block', line);
  }
  assert.deepEqual(
    slippedThrough,
    [],
    `${slippedThrough.length} of ${OFFERS_TO_AUTOMATE.length} offers reached a founder.\n\n${RULE_2}`,
  );
});

test('THE SIX THAT NAMING THE PLATFORM USED TO GET PAST ARE ALL REFUSED', () => {
  for (const line of THE_SIX_THAT_USED_TO_PASS) {
    const result = checkNoDmAutomation(art(line));
    assert.equal(
      result.ok,
      false,
      `This is one of the six sentences that passed clean before, and it passes again.\n"${line}"\n\n${RULE_2}`,
    );
  }
});

test('NAMING THE PLATFORM CHANGES NOTHING, WHICH IS THE WHOLE BUG', () => {
  // The pair that made the old rule look like it worked. Both are the same
  // offer. Only one of them used to be refused.
  const withoutIt = checkNoDmAutomation(art('We can automate DMs for you.'));
  const withIt = checkNoDmAutomation(art('We can automate the Instagram DMs for you.'));
  assert.equal(withoutIt.ok, false);
  assert.equal(withIt.ok, false, `Adding the word Instagram switched the rule off.\n\n${RULE_2}`);
});

test('INBOUND AUTOMATION STILL PASSES, BECAUSE IT IS HALF THE B2C PROMISE', () => {
  const refused: string[] = [];
  for (const line of [...INBOUND_AUTOMATION, ...MANUAL_OR_EXPLAINING]) {
    const result = checkNoDmAutomation(art(line));
    if (!result.ok) refused.push(`${line}\n    ${result.violations[0]?.message ?? ''}`);
  }
  assert.deepEqual(
    refused,
    [],
    'The gate refused automation this product sells. That is the product blocked, not the mistake.',
  );
});

test('the inbound lines pass because the rule read them, not because it missed them', () => {
  // Without this, INBOUND_AUTOMATION would keep passing if the runtime check
  // were deleted entirely, and the test above would still be green. The note is
  // only written when a line was found to be a channel plus a delegate and was
  // then let through on the trigger.
  for (const line of INBOUND_AUTOMATION) {
    const result = checkNoDmAutomation(art(line));
    assert.ok(
      result.notes.some((n) => n.includes('left alone')),
      `The rule never saw this line as automation at all, so its passing proves nothing:\n"${line}"`,
    );
  }
});

test('TAKE THE TRIGGER OUT AND THE SAME SENTENCE IS REFUSED', () => {
  // The pairs are the argument. Each left hand side is allowed, each right hand
  // side is refused, and the only difference between them is who started the
  // conversation. If both sides of a pair ever agree, the rule has stopped
  // reading the one thing it is supposed to read.
  const pairs: ReadonlyArray<readonly [string, string]> = [
    [
      'Automate the DM that goes out when somebody comments.',
      'Automate the DM that goes out to every new follower.',
    ],
    [
      'The auto DM answers anyone who messages you first.',
      'The auto DM goes out to anyone who follows you.',
    ],
    [
      'Set up the workflow to send the DM in reply to their comment.',
      'Set up the workflow to send the DM to your whole list.',
    ],
  ];
  for (const [allowed, refused] of pairs) {
    assert.equal(checkNoDmAutomation(art(allowed)).ok, true, `refused the inbound half: "${allowed}"`);
    assert.equal(
      checkNoDmAutomation(art(refused)).ok,
      false,
      `allowed the cold half: "${refused}"\n\n${RULE_2}`,
    );
  }
});

test('A FOLLOW IS NOT A TRIGGER, WHICH IS THE MISTAKE THAT RESTRICTS ACCOUNTS', () => {
  // Instagram opens the window when somebody messages you. Following is not
  // messaging, and "welcome DM to new followers" is the single most common way
  // a founder builds the banned thing while believing they are on the inbound
  // side. So it has its own test rather than sitting in the list.
  for (const line of [
    'Send an automatic welcome DM to every new follower.',
    'When someone follows you, the workflow sends them a DM.',
    'Each new follower gets a DM within the hour, automatically.',
  ]) {
    assert.equal(checkNoDmAutomation(art(line)).ok, false, `${line}\n\n${RULE_2}`);
  }
});

test('a heading about the inbound machine does not excuse a cold line under it', () => {
  // The document context that lets "Write the auto DM message" through is the
  // hole this closes. A heading cannot rescue a line that says every new
  // follower, because an inbound reply is never described that way.
  const underAnInboundHeading = (body: string): string => `## Comment to DM\n\n${body}\n`;

  assert.equal(
    checkNoDmAutomation(art(underAnInboundHeading('Write the auto DM message here.'))).ok,
    true,
    'the inbound deliverable itself was refused',
  );
  assert.equal(
    checkNoDmAutomation(art('Write the auto DM message here.')).ok,
    false,
    'with no trigger named anywhere, an automated DM has to be refused',
  );
  assert.equal(
    checkNoDmAutomation(art(underAnInboundHeading('Automate the DMs to every new follower.'))).ok,
    false,
    `the heading excused a cold blast.\n\n${RULE_2}`,
  );
});

test('a refusal word in front of an offer does not make it a refusal', () => {
  // "Nothing stops you" is made of refusal words and it grants permission. The
  // gate reads the words in front of an offer to spot the sentences that
  // explain rule 2, and this is the sentence that abuses that.
  const result = checkNoDmAutomation(art('Nothing stops you automating the first DM.'));
  assert.equal(result.violations[0]?.code, 'dm.offered', RULE_2);
  assert.equal(result.ok, false);
});

test('AN OPENER IS A DM IN ONE DOCUMENT AND AN EMAIL IN THE OTHER', () => {
  // Rule 1: two tracks, and this is where they collide. The same sentence is
  // the banned thing for a B2C founder and ordinary work for a B2B one, whose
  // openers are emails and whose sequence is meant to be automated in
  // GoHighLevel. The word cannot tell them apart. The document can.
  const line = 'You can automate the opener and only step in when they reply.';
  const inADmDocument = `## Step 2: 25 DM openers\n\n${line}\n`;
  const inAnEmailDocument = `## Step 2: 25 email openers\n\n${line}\n`;

  assert.equal(checkNoDmAutomation(art(inADmDocument)).ok, false, `${line}\n\n${RULE_2}`);
  assert.equal(
    checkNoDmAutomation(art(inAnEmailDocument)).ok,
    true,
    'the B2B track had its email sequence refused, which is rule 1 broken by rule 2',
  );
});

test('a refusal and an offer on the same line report the offer', () => {
  // One report per line, and the blocking one wins. A founder gets one thing to
  // fix, and it is the thing that would cost them the account.
  const result = checkNoDmAutomation(
    art('There is no DM automation here. Set up a bot to DM every new follower.'),
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0]?.code, 'dm.offered');
});

test('THE SKILL THAT DESCRIBES THE INBOUND MACHINE IS NOT REFUSED', () => {
  // The real founder-facing copy, read from the content this deployment ships.
  // It is the hardest false positive test there is, because it was written to
  // explain the rule and to sell the inbound machine in the same document.
  const text = readContentFile('plugins/growth-engine/skills/audience-b2c/SKILL.md');
  const result = checkNoDmAutomation({ path: 'audience-b2c.md', text, authored: 'model' });

  assert.deepEqual(
    result.violations.filter((v) => v.severity === 'block').map((v) => `${v.where.line}: ${v.where.excerpt}`),
    [],
    'The gate refuses the skill that describes the sanctioned inbound machine.',
  );
  // And it is awake on that file rather than blind to it: the lines that state
  // rule 2 are noticed, and noticed as refusals.
  assert.ok(result.violations.length > 0, 'the rule found nothing at all in a document about DM automation');
  for (const v of result.violations) {
    assert.equal(v.code, 'dm.mentioned-while-refusing', `${v.where.line}: ${v.where.excerpt}`);
  }
});

test('and it goes red the moment an offer is planted in that same skill', () => {
  // Without this, the test above passes just as well against a rule that never
  // blocks anything.
  const text = `${readContentFile('plugins/growth-engine/skills/audience-b2c/SKILL.md')}\n\nUse a scheduler to send Instagram DMs to your followers automatically.\n`;
  const result = checkNoDmAutomation({ path: 'audience-b2c.md', text, authored: 'model' });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'dm.offered'));
});

/* -------------------------------------------------------------------------- */
/* The sentence the product tells the model to write                          */
/* -------------------------------------------------------------------------- */

/**
 * THE DISCLAIMER, WHICH THE GATE USED TO REFUSE.
 *
 * `audience-b2c/SKILL.md` says it in as many words: if the founder asks for DM
 * automation, explain why not and offer the inbound machine instead. So the
 * product instructs the model to write these sentences, and every one of them
 * was blocked. On the Sunday turn a block took the plan, the sequence and the
 * CSV with it, and told the founder they had invented proof.
 *
 * The three at the top are the ones that were observed being refused, kept word
 * for word. They fail three different ways and all three are the same bug: the
 * refusal was only ever looked for in FRONT of the offer, inside one sentence,
 * and a sentence ended at a newline. Put the offer in the subject and nothing
 * can precede it. Put the reason in the next sentence and it is out of reach.
 * Let the editor wrap the line and the reason lands in a fragment of its own.
 */
const THE_PRODUCT_OWN_DISCLAIMER: readonly string[] = [
  'Automated cold DMs are not something we do. They get accounts restricted.',
  'Automating your Instagram DMs is a bad idea. The account gets restricted.',
  'Automated DMs get accounts\nrestricted.',

  // The same claim in the other shapes a model reaches for when told to explain
  // the rule rather than to state it.
  'Automated cold DMs are against the Instagram terms.',
  'DM automation is not something this toolkit does.',
  'Automating Instagram DMs is a bug, not a feature.',
  'Automating the DMs will get the account restricted, so we do not.',
  'Bulk DM tools scrape the interface. They put the account at risk.',
  'Automated cold DMs on Instagram get accounts restricted or banned.',
];

test('THE SENTENCE THE PRODUCT TELLS THE MODEL TO WRITE IS NOT REFUSED', () => {
  const refused: string[] = [];
  for (const line of THE_PRODUCT_OWN_DISCLAIMER) {
    const result = checkNoDmAutomation(art(line));
    if (!result.ok) refused.push(`${JSON.stringify(line)}\n    ${result.violations[0]?.message ?? ''}`);
  }
  assert.deepEqual(
    refused,
    [],
    `The gate refused the disclaimer audience-b2c/SKILL.md instructs the model to write. A founder who asks "can I automate my DMs" gets the correct answer written, then loses the turn that wrote it.\n\n${RULE_2}`,
  );
});

test('a line the editor wrapped is one sentence, and reads the same as one line', () => {
  // The third disclaimer above, both ways round. A founder does not choose
  // where their editor wraps and neither does the model, so a wrap must not
  // change the answer. It used to: the unwrapped form warned and the wrapped
  // form blocked, because the newline cut the reason off from the claim.
  const wrapped = checkNoDmAutomation(art('Automated DMs get accounts\nrestricted.'));
  const oneLine = checkNoDmAutomation(art('Automated DMs get accounts restricted.'));
  assert.equal(wrapped.ok, oneLine.ok, 'wrapping the line changed the verdict');
  assert.equal(wrapped.violations[0]?.code, oneLine.violations[0]?.code);
  assert.equal(wrapped.violations[0]?.severity, 'warn');
});

test('a full stop still ends a sentence, so a refusal cannot excuse the next line', () => {
  // Without this, "one sentence per wrapped line" would have become "one
  // judgement per paragraph", and the refusal in the first half would excuse
  // the offer in the second. That is the bypass the sentence split exists for.
  const result = checkNoDmAutomation(
    art('There is no DM automation here.\nSet up a bot to DM every new follower.'),
  );
  assert.equal(result.ok, false, RULE_2);
  assert.ok(result.violations.some((v) => v.code === 'dm.offered'));
});

test('THE REASON IS ALLOWED TO BE IN THE NEXT SENTENCE', () => {
  // The second of the three shapes the bug report named. The offer is the
  // subject, so nothing can precede it, and the verdict is not in its own
  // predicate either. The pair is what makes this a test rather than an
  // observation: take the reason out and the same sentence is refused.
  const withReason = checkNoDmAutomation(
    art('Automating the DMs is something founders ask about. It gets accounts restricted.'),
  );
  assert.equal(withReason.ok, true, RULE_2);
  assert.equal(withReason.violations[0]?.code, 'dm.mentioned-while-refusing');

  const withoutReason = checkNoDmAutomation(
    art('Automating the DMs is something founders ask about. It fills the calendar.'),
  );
  assert.equal(withoutReason.ok, false, 'the rescue fires whatever the next sentence says');
});

test('and only from the same paragraph, and only when it is not an offer itself', () => {
  // Two holes the reach into the next sentence would open, each closed and each
  // proved closed. A blank line ends the thought, so a refusal in the paragraph
  // below cannot reach back up. And a sentence that is an offer in its own right
  // is not a verdict on the one before it, however many refusal words it holds.
  const acrossABreak = checkNoDmAutomation(
    art('Automating the DMs is something founders ask about.\n\nIt gets accounts restricted.'),
  );
  assert.equal(acrossABreak.ok, false, 'a refusal in the next paragraph excused an offer in this one');

  // The second sentence is stuffed with refusal words and it is an offer. That
  // is the shape "automate your DMs instead of sending them by hand" already has,
  // and letting it speak for the sentence above it would hand a bypass to any
  // model that writes two lines instead of one.
  const bothAreOffers = checkNoDmAutomation(
    art('Automated DMs are the fastest way to fill the calendar.\nAutomate the DMs so you never have to send one by hand.'),
  );
  assert.equal(bothAreOffers.violations[0]?.where.line, 1);
  assert.equal(bothAreOffers.violations[0]?.severity, 'block', `an offer was excused by the offer after it.\n\n${RULE_2}`);
});

test('THE DISCLAIMER RESCUE DOES NOT RESCUE AN OFFER', () => {
  // The rescue was widened to look behind the offer and into the next sentence.
  // If that widening had no limit it would be a bypass: put a consequence word
  // anywhere near an offer and it downgrades. Each line below is an offer with
  // refusal words all over it, and each one must still be refused.
  for (const line of [
    // Refusal words after the offer, but the offer is not the subject, so the
    // predicate reading never runs.
    'Set up a bot to DM every new follower. Automated DMs get accounts restricted.',
    // Made of refusal words, and it replaces the manual way rather than keeping it.
    'Automate your DMs instead of sending them by hand.',
    // A negation that is itself negated.
    'Nothing stops you automating the first DM.',
    // The next sentence is an offer in its own right, so it cannot rescue.
    'Automated DMs are the fastest way to fill the calendar. Automate them for every new follower.',
  ]) {
    const result = checkNoDmAutomation(art(line));
    assert.equal(result.ok, false, `the rescue let this through:\n${line}\n\n${RULE_2}`);
  }
});

/* -------------------------------------------------------------------------- */
/* The fourteen, and what a list cannot do                                    */
/* -------------------------------------------------------------------------- */

/**
 * FOURTEEN OFFERS INVENTED IN ONE SITTING. THIRTEEN REACHED A FOUNDER.
 *
 * This is the corpus that killed the closed AND. Not one of these says
 * "automate a DM", every one of them offers it, and the old check needed a
 * sentence to hit a channel list and a delegate list at once. The word "agent"
 * was missing from a noun list. "Opener" only counted inside a document that
 * had already said DM. "Everyone who views your story" was not on the list of
 * people who did not ask. Adding those three strings would have bought a week
 * and this list would be fifteen long.
 *
 * The last one is here because it is worse than being missed: it WARNED, which
 * means the file was saved and the founder read it. It warned because "one by
 * one" is in the sentence, and the check read that as the founder deciding each
 * one, when it is the offer to stop them doing that.
 */
const FOURTEEN_INVENTED_OFFERS: readonly string[] = [
  'Use an AI agent to open conversations with your target accounts on Instagram.',
  'Set up an autoresponder for people you have not spoken to yet.',
  'Load the 25 openers into the tool and let it work through them.',
  'Fire the opener at everyone who views your story.',
  'Have something else write and send the first message on Instagram.',
  'Point the agent at your follower list and it handles the openers.',
  'The openers go out overnight without you.',
  'Warm up the list with an automated first touch on Instagram.',
  'An agent can handle Instagram outreach end to end.',
  'Let it work through the list of handles on Instagram.',
  'Once configured, new story viewers get the opener.',
  'The sequence handles the Instagram side too.',
  'Give the tool your handles and it takes it from there.',
  'Put the DMs on a schedule so you are not doing them one by one.',
];

/**
 * THE ONE THAT IS STILL MISSED, named so it cannot quietly become two.
 *
 * It has a delegate and an audience and no word at all for what is being sent.
 * Letting a delegate and an audience convict on their own would refuse
 * "configure the workflow to email your list every morning", which is the B2B
 * track's own deliverable, and rule 1 says the tracks never see each other's
 * material. That trade is argued in the file. This test holds the count at one.
 */
const STILL_MISSED: readonly string[] = ['Give the tool your handles and it takes it from there.'];

test('NONE OF THE FOURTEEN IS SILENT, EXCEPT THE ONE NAMED AS MISSED', () => {
  const silent: string[] = [];
  for (const line of FOURTEEN_INVENTED_OFFERS) {
    if (checkNoDmAutomation(art(line)).violations.length === 0) silent.push(line);
  }
  assert.deepEqual(
    silent,
    STILL_MISSED,
    `A reviewer invented fourteen offers in one sitting and thirteen reached a founder. That is what a vocabulary list does. If this list has grown, the answer is not another word.\n\n${RULE_2}`,
  );
});

test('TWELVE OF THE FOURTEEN ARE REFUSED OUTRIGHT, NOT MERELY NOTED', () => {
  // A warning is not silence, but it is not a refusal either: the file is saved
  // and the founder reads the line. So the count that matters is how many are
  // blocked, and it is held here rather than left to drift downwards.
  const blocked = FOURTEEN_INVENTED_OFFERS.filter((line) => !checkNoDmAutomation(art(line)).ok);
  assert.ok(
    blocked.length >= 12,
    `only ${blocked.length} of the fourteen are refused.\n${FOURTEEN_INVENTED_OFFERS.filter(
      (l) => checkNoDmAutomation(art(l)).ok,
    ).join('\n')}\n\n${RULE_2}`,
  );
});

test('A SCHEDULE THAT STOPS YOU SENDING ONE BY ONE IS THE OFFER, NOT THE RESCUE', () => {
  // The fourteenth. It warned, so the file was saved and the founder read it.
  // "One by one" is the founder deciding each one, which is what rule 2 asks
  // for, and negated it is the offer to take them out of it. The pair is the
  // argument: the same words, one negated, opposite answers.
  const negated = checkNoDmAutomation(art('Put the DMs on a schedule so you are not doing them one by one.'));
  assert.equal(negated.ok, false, RULE_2);
  assert.equal(negated.violations[0]?.code, 'dm.offered');

  const plain = checkNoDmAutomation(art('Take the DMs off the schedule and send them one by one.'));
  assert.equal(plain.ok, true, 'sending them one at a time is the deliverable, not the mistake');
});

/* -------------------------------------------------------------------------- */
/* The parts of the score, each proved able to fail                           */
/* -------------------------------------------------------------------------- */

test('A SET OF WORDS COUNTS ONCE, WHICH IS WHAT KEEPS THE SCORE HONEST', () => {
  // "Opener" says the channel and says the coldness. Counting it twice would
  // make every sentence with the word in it a block, and the B2B track's email
  // openers are written by the same engine. The pair below is the same sentence
  // with a second, separate audience added, and only the second one blocks.
  const oneWord = checkNoDmAutomation(art('The opener can be automated.'));
  assert.equal(oneWord.ok, true, 'one word was counted as two points of evidence');
  assert.ok(oneWord.violations.length > 0, 'and it was not noticed at all, which is the other failure');

  const twoThings = checkNoDmAutomation(art('The opener can be automated for every new follower.'));
  assert.equal(twoThings.ok, false, `a second, separate audience is a second point.\n\n${RULE_2}`);
});

test('a delegate that takes the founder out is worth a point, one that does not is not', () => {
  // Both sentences name a weak channel and a delegate and no audience. The only
  // difference is that one delegate says outright that nobody is deciding each
  // one. A workflow does not: the sanctioned inbound machine is a workflow.
  const excludes = checkNoDmAutomation(art('The openers go out overnight without you.'));
  assert.equal(excludes.ok, false, RULE_2);

  const neutral = checkNoDmAutomation(art('The sequence handles the Instagram side too.'));
  assert.equal(neutral.ok, true);
  assert.equal(neutral.violations[0]?.code, 'dm.possible-offer', 'and it still says something');
});

test('A WRAPPED LINE IS ONE SENTENCE EVEN WHEN THE OFFER IS NOT THE SUBJECT', () => {
  // The narrower half of the wrap fix, isolated. When the offer IS the subject
  // the rescue can reach into the next sentence and the wrap does not matter, so
  // the disclaimer test above would still pass with the splitter reverted. Here
  // something precedes the offer, that path is closed, and the only thing
  // holding the claim and its reason together is that the wrap is not a break.
  const wrapped = checkNoDmAutomation(art('Honestly, automating the DMs gets accounts\nrestricted.'));
  const oneLine = checkNoDmAutomation(art('Honestly, automating the DMs gets accounts restricted.'));
  assert.equal(oneLine.ok, true, 'the unwrapped form was refused, so the pair proves nothing');
  assert.equal(wrapped.ok, true, 'a wrap turned a warning into a refusal, and a founder does not choose where their editor wraps');
  assert.equal(wrapped.violations[0]?.code, oneLine.violations[0]?.code);
});

test('TWO WORDS A PARAGRAPH APART ARE NOT ONE CLAIM', () => {
  // This matters more since a wrap stopped ending a sentence. A hard wrapped
  // paragraph is now one sentence, and a paragraph holds two jobs: the
  // GoHighLevel workflow on the first line, the 25 DM openers on the third.
  // Reading those as one offer refuses a growth plan that is entirely correct.
  //
  // The pair is the argument. The limit is a distance, not a hole: the same two
  // words close together are still refused.
  const twoJobs = [
    'Your GoHighLevel workflow handles the email follow-up, with a two day wait',
    'between steps, an exit condition once they book a call with you, and a tag',
    'applied when they reach the end of it, and the 25 DM openers are a separate',
    'job for Saturday.',
  ].join('\n');
  assert.equal(checkNoDmAutomation(art(twoJobs)).ok, true, 'two unrelated jobs in one paragraph were read as one offer');

  const close = checkNoDmAutomation(art('The workflow handles the 25 DM openers.'));
  assert.equal(close.ok, false, `the distance limit became a way through.\n\n${RULE_2}`);
});

test('THE WARNING TIER IS REACHABLE, AND IT IS NOT THE ANSWER FOR A CLEAR OFFER', () => {
  // One point of evidence warns and two blocks. Both halves need proving: a
  // check that only ever warns has stopped guarding, and a check that only ever
  // blocks is back to betting a founder's turn on an uncertain sentence.
  const one = checkNoDmAutomation(art('The sequence handles the Instagram side too.'));
  assert.equal(one.violations[0]?.severity, 'warn');
  assert.equal(one.violations[0]?.code, 'dm.possible-offer');
  assert.equal(one.ok, true, 'a single weak signal must not cost the founder the file');

  const two = checkNoDmAutomation(art('Use a scheduler to send Instagram DMs to your followers automatically.'));
  assert.equal(two.violations[0]?.severity, 'block');
  assert.equal(two.violations[0]?.code, 'dm.offered');
});

test('the warning says what is missing, not just that something is wrong', () => {
  // A warning a founder cannot act on is a warning they learn to scroll past,
  // and test case 21 in the content repo holds every refusal to a way out.
  const v = checkNoDmAutomation(art('The sequence handles the Instagram side too.')).violations[0];
  assert.ok(v, 'the warning tier produced nothing');
  assert.match(v.message, /who asked/);
  assert.match(v.message, /Say what sets the message off/);
  assert.equal(v.recovery.action.kind, 'route');
});

test('A COMMAND ARGUMENT IS NOT A CHANNEL, AND THE SCHEMA THAT PROVED IT', () => {
  // `schemas/person.md` documents the touch command. The `dm` in it is an
  // argument, and this rule read it as a word for a channel and refused the
  // schema. It only started doing that when a wrapped line stopped ending a
  // sentence: the wrap used to keep the command and the phrase three lines below
  // it apart, and that was luck rather than a decision.
  //
  // Read from the file rather than quoted, because a quote can be edited until
  // it agrees with the code and the shipped schema cannot.
  const path = 'plugins/growth-engine/schemas/person.md';
  const result = checkNoDmAutomation({ path, text: readContentFile(path), authored: 'model' });
  assert.deepEqual(
    result.violations.map((v) => `${v.where.line}: ${v.where.excerpt}`),
    [],
    'the rule refused a schema document because a command takes an argument called dm',
  );

  // And the masking has not made the rule blind. The pair is the same three
  // wrapped lines from that schema, once as shipped and once with every backtick
  // removed. The second one is prose making the same claim, and it is refused.
  const lines = [
    'Recording an outbound %dm% to a target is the',
    'send, so %ge person touch <who> dm out "..."% moves a target from %target% or',
    '%opener_written% to %sent% by itself.',
  ].join('\n');
  const asShipped = checkNoDmAutomation(art(lines.replaceAll('%', '`')));
  const asProse = checkNoDmAutomation(art(lines.replaceAll('%', '')));
  assert.equal(asShipped.ok, true, 'a command argument was read as a channel');
  assert.equal(asProse.ok, false, `masking turned the rule off rather than narrowing it\n\n${RULE_2}`);
});

test('WHAT A REFUSAL COSTS DEPENDS ON WHETHER THE CHANNEL WAS NAMED OR INFERRED', () => {
  // A COORDINATION WITH harvest-gate.ts, pinned here so it cannot drift.
  //
  // That file rolls the WHOLE turn back for `dm.offered`, and the argument it
  // writes beside that decision is that the code "fires only when a channel and
  // a hand off verb sit in the same sentence". Widening this rule broke that
  // sentence: half the fourteen name no channel at all and are caught by
  // inference. So the inferred half carries its own code, and harvest-gate's own
  // rule for a code it has never heard of is to hold the file and save the rest
  // of the turn. Losing a founder's Sunday on an inference is a different bet
  // from losing it on "we can automate your Instagram DMs".
  //
  // If this test goes red, the question is not which code to rename. It is
  // whether the sentence in WORTH_THE_WHOLE_TURN is still true.
  for (const named of [
    'We can automate DMs for you overnight.',
    'Use a scheduler to send Instagram DMs to your followers automatically.',
    'Put the DMs on a schedule so you are not doing them one by one.',
    'Have something else write and send the first message on Instagram.',
  ]) {
    const v = checkNoDmAutomation(art(named)).violations[0];
    assert.equal(v?.code, 'dm.offered', `the channel is named in "${named}"`);
  }

  for (const inferred of [
    'The openers go out overnight without you.',
    'Load the 25 openers into the tool and let it work through them.',
    'Fire the opener at everyone who views your story.',
    'Set up an autoresponder for people you have not spoken to yet.',
  ]) {
    const v = checkNoDmAutomation(art(inferred)).violations[0];
    assert.equal(v?.severity, 'block', `${inferred}\n\n${RULE_2}`);
    assert.equal(
      v?.code,
      'dm.offered-by-inference',
      `"${inferred}" names no channel, and it must not cost a founder the whole turn on an inference`,
    );
  }
});

test('the inferred refusal tells the founder how to tell the two tracks apart', () => {
  // A B2B founder reading "this offers automating DMs" about a sentence that
  // says nothing about DMs has nothing to act on, and rule 1 says they should
  // never have been shown the other track's material at all. So the inferred
  // message says what is missing and gives both ways out.
  const v = checkNoDmAutomation(art('Set up an autoresponder for people you have not spoken to yet.')).violations[0];
  assert.ok(v);
  assert.match(v.message, /does not say DM anywhere/);
  assert.match(v.message, /if it is about email, say so/);
});

/* -------------------------------------------------------------------------- */
/* The half that must pass, held against the real documents                   */
/* -------------------------------------------------------------------------- */

test('THE TWO INBOUND DOCUMENTS ARE NOT REFUSED, BECAUSE THEY ARE THE PRODUCT', () => {
  // audience-b2c describes the sanctioned inbound machine and states rule 2 in
  // the same file. ghl-workflows is where that machine is actually written. If
  // either is refused, half the B2C track cannot be generated at all.
  for (const path of [
    'plugins/growth-engine/skills/audience-b2c/SKILL.md',
    'plugins/growth-engine/skills/ghl-workflows/SKILL.md',
  ]) {
    const result = checkNoDmAutomation({ path, text: readContentFile(path), authored: 'model' });
    assert.deepEqual(
      result.violations
        .filter((v) => v.severity === 'block')
        .map((v) => `${v.where.line}: ${v.where.excerpt}`),
      [],
      `${path} was refused, and it is the document that describes the sanctioned machine.`,
    );
  }
});

test('B2B EMAIL AUTOMATION IS NOT REFUSED, WHICH IS RULE 1 HELD AGAINST RULE 2', () => {
  // Rule 1: two tracks, and a founder never sees the other one's material. The
  // B2B sequence is emails and it is meant to be automated in GoHighLevel, so
  // every sentence here is ordinary work for half the cohort and would be the
  // banned thing for the other half. Nothing in this rule may refuse them,
  // because a B2B founder cannot fix a refusal that is about Instagram.
  const path = 'plugins/growth-engine/skills/outreach-b2b/SKILL.md';
  const result = checkNoDmAutomation({ path, text: readContentFile(path), authored: 'model' });
  assert.deepEqual(
    result.violations.filter((v) => v.severity === 'block').map((v) => `${v.where.line}: ${v.where.excerpt}`),
    [],
    'the B2B track had its own outreach skill refused by the rule about Instagram',
  );

  for (const line of [
    'Configure the workflow to email your list every morning.',
    'Automate the email sequence in GoHighLevel and step in when they reply.',
    'The campaign sends the follow-up two days later.',
  ]) {
    assert.equal(checkNoDmAutomation(art(line)).ok, true, `refused ordinary B2B work: "${line}"`);
  }
});

test('EVERY SENTENCE THIS RULE CAN SHOW A FOUNDER PASSES HOUSE STYLE', () => {
  // The messages carry a label that changes with what was offered, so the whole
  // corpus is run through and every distinct sentence checked. A refusal that
  // breaks the house style is a refusal a founder does not believe.
  const shown = new Set<string>();
  for (const line of [
    ...OFFERS_TO_AUTOMATE,
    ...INBOUND_AUTOMATION,
    ...MANUAL_OR_EXPLAINING,
    ...THE_PRODUCT_OWN_DISCLAIMER,
    ...FOURTEEN_INVENTED_OFFERS,
  ]) {
    for (const v of checkNoDmAutomation(art(line)).violations) {
      shown.add(v.message);
      shown.add(v.why);
      shown.add(v.recovery.label);
    }
  }
  assert.ok(shown.size >= 6, `only ${shown.size} distinct sentences were reached`);
  const failures: string[] = [];
  for (const sentence of shown) {
    for (const bad of checkProseText('rule 2 message', sentence).violations) {
      failures.push(`${bad.code} on "${bad.found}" in: ${sentence}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the sentence that explains the rule is not itself refused', () => {
  const result = checkNoDmAutomation(
    art('There is no DM automation here. Cold DMs are manual, twenty five of them, spread out.'),
  );
  assert.equal(result.ok, true);
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('an offer dressed up as a refusal is still refused', () => {
  // The sentence a single word list would have let through. Every word in it
  // after the offer is a refusal word, and it is still an offer.
  const result = checkNoDmAutomation(art('Automate your DMs instead of sending them by hand.'));
  assert.equal(result.ok, false, RULE_2);
  assert.equal(result.violations[0]?.code, 'dm.offered');
});

test('inbound automation is left alone, because that is where automation belongs', () => {
  const result = checkNoDmAutomation(
    art('When somebody comments the keyword, the workflow replies to them. They messaged you first.'),
  );
  assert.deepEqual(result.violations, []);
});

test('the founder\'s own note about wanting automation is not thrown back at them', () => {
  const theirs: Artifact = {
    path: 'memory.md',
    text: 'I keep wondering whether I should automate DMs.',
    authored: 'founder',
  };
  const result = checkNoDmAutomation(theirs);
  assert.equal(result.ok, true);
});

test('every refusal names a real line and ends on a way out', () => {
  const text = 'A clean first line.\nAnd a second.\nWe can automate the Instagram DMs for you.';
  const result = checkNoDmAutomation(art(text));
  assert.equal(result.ok, false);
  for (const v of result.violations) {
    assert.equal(v.where.line, 3);
    assert.ok(v.where.column >= 1);
    assert.ok(text.split('\n')[v.where.line - 1]?.includes(v.found), `${v.found} is not on line ${v.where.line}`);
    assert.ok(v.recovery.label.length > 0);
    assert.equal(v.recovery.action.kind, 'route');
  }
});
