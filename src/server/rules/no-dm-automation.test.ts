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
 *   THE PLANT RUNS IN A COPY OF THE REPOSITORY'S SHAPE, not in the repository.
 *   Writing a file containing a send path into somebody's working tree and
 *   deleting it afterwards works right up until the run is interrupted, and
 *   then it leaves the one string this project refuses to contain sitting in
 *   `app/`. The mirror has the same directory names and the same exclusions, so
 *   it exercises the same decision, and the test above it proves the real root
 *   is the repository.
 *
 * CALLED BY: node --test.
 * READS:     the whole repository, for the scan.
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

test('offering to automate DMs is refused', () => {
  const result = checkNoDmAutomation(art('We can automate DMs for you overnight.'));
  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.code, 'dm.offered');
  assert.match(result.violations[0]?.why ?? '', /by hand, from your own account/);
});

test('offering a bulk sender is refused', () => {
  const result = checkNoDmAutomation(art('Use a tool that sends cold DMs at scale.'));
  assert.equal(result.ok, false);
});

test('offering to schedule the DMs is refused', () => {
  const result = checkNoDmAutomation(art('Schedule the DMs so they go out while you sleep.'));
  assert.equal(result.ok, false);
});

test('the sentence that explains the rule is not itself refused', () => {
  const result = checkNoDmAutomation(
    art('There is no DM automation here. Cold DMs are manual, twenty five of them, spread out.'),
  );
  assert.equal(result.ok, true);
  assert.equal(result.violations[0]?.severity, 'warn');
});

test('an offer dressed up as a refusal is still refused', () => {
  // The sentence that a single word list would have let through.
  const result = checkNoDmAutomation(
    art('Automate your DMs instead of sending them by hand.'),
  );
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

test('every refusal ends on a way out', () => {
  const result = checkNoDmAutomation(art('We can automate DMs for you.'));
  for (const v of result.violations) {
    assert.ok(v.recovery.label.length > 0);
    assert.ok(v.recovery.action.kind.length > 0);
  }
});
