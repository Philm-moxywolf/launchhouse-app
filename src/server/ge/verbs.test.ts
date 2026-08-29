/**
 * src/server/ge/verbs.test.ts
 *
 * WHAT THIS IS. The frozen registry, frozen. Every ge call this app can make, driven
 * against a stub ge that prints its argv, with the argv asserted.
 *
 * WHY IT EXISTS. The build document names a frozen tool registry as one of the five
 * layers holding rule 2: "one exported array, and a test asserting the exact set of
 * tool names against a literal list. Adding any tool fails the build until someone
 * edits the expected list, which is a visible deliberate act in a diff." The array
 * existed. The test did not, so the array froze nothing.
 *
 * Three things are asserted, and the third is the one that does the work:
 *
 *   1. VERBS matches a literal list written out here. Adding a verb fails until
 *      somebody edits this file too.
 *
 *   2. No verb name is a send verb. There is nothing here that can message anybody,
 *      and ge person touch RECORDS that a founder sent something rather than sending
 *      it.
 *
 *   3. EVERY EXPORTED FUNCTION IS DRIVEN, and the set of functions driven is compared
 *      against the set the module exports. A new exported call fails this test until
 *      it is added to the table below, which is where somebody reads what argv it
 *      builds. That is what stops layer 4 from being a list nobody maintains.
 *
 * WHAT IT CALLS. src/server/ge/verbs.ts, run.ts, and a /bin/sh stub standing in for
 * bin/ge. No real ge, no database, no model.
 */

import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as verbs from './verbs.ts';
import { founderRoot } from '../storage/paths.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF32';
const ctx: verbs.GeCallContext = { founderId: FOUNDER, timezone: 'America/New_York', timeoutMs: 10_000 };

let workspace: string;
let stubDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const name of ['WORKSPACE_ROOT', 'GE_BIN', 'GE_TIMEOUT_MS', 'GE_SHELL']) saved[name] = process.env[name];
  workspace = await mkdtemp(join(tmpdir(), 'lh-verbs-'));
  stubDir = await mkdtemp(join(tmpdir(), 'lh-verbs-stub-'));
  process.env.WORKSPACE_ROOT = workspace;
  await mkdir(founderRoot(FOUNDER), { recursive: true });

  // Prints one argument per line and exits 0. Nothing here needs ge's behaviour; the
  // argv is the subject.
  const path = join(stubDir, 'ge');
  await writeFile(path, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n', 'utf8');
  await chmod(path, 0o755);
  process.env.GE_BIN = path;
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(workspace, { recursive: true, force: true });
  await rm(stubDir, { recursive: true, force: true });
});

/**
 * The literal list. Edit it only with the diff in front of you.
 *
 * There is no verb here that sends a message to anybody. That is layer 4 of rule 2:
 * no sequence of model output can reach a send path, because there is no send path in
 * this list to reach.
 */
const EXPECTED_VERBS = [
  'init',
  'context',
  'check',
  'index',
  'lint',
  'version',
  'invocation',
  'log',
  'remember',
  'person',
  'ledger',
  'receipt',
  'accounts',
  'snapshot',
  'restore',
  'undo',
] as const;

/**
 * Every exported call, with arguments that reach ge, and the verb its argv must open
 * with. The value is what a real caller would pass, so a change to a signature shows
 * up here as a type error rather than as a silently skipped row.
 */
const CALLS: Array<{ name: string; verb: string; run: () => Promise<unknown> }> = [
  { name: 'init', verb: 'init', run: () => verbs.init(ctx) },
  { name: 'index', verb: 'index', run: () => verbs.index(ctx) },
  { name: 'lint', verb: 'lint', run: () => verbs.lint(ctx) },
  { name: 'check', verb: 'check', run: () => verbs.check(ctx) },
  { name: 'context', verb: 'context', run: () => verbs.context(ctx) },
  { name: 'version', verb: 'version', run: () => verbs.version(ctx) },
  { name: 'log', verb: 'log', run: () => verbs.log(ctx, 'decision', 'picked b2b') },
  { name: 'remember', verb: 'remember', run: () => verbs.remember(ctx, 'decision', 'they sell to builders') },
  {
    name: 'personAddProspect',
    verb: 'person',
    run: () => verbs.personAddProspect(ctx, { email: 'sam@example.com', name: 'Sam Reid' }),
  },
  {
    name: 'personAddTarget',
    verb: 'person',
    run: () => verbs.personAddTarget(ctx, { platform: 'ig', handle: 'lumen.skin', name: 'Lumen' }),
  },
  { name: 'personSet', verb: 'person', run: () => verbs.personSet(ctx, 'sam@example.com', 'status', 'candidate') },
  { name: 'personGet', verb: 'person', run: () => verbs.personGet(ctx, 'sam@example.com') },
  { name: 'personList', verb: 'person', run: () => verbs.personList(ctx, { kind: 'prospect' }) },
  { name: 'personNote', verb: 'person', run: () => verbs.personNote(ctx, 'sam@example.com', 'runs a small team') },
  {
    name: 'personTouch',
    verb: 'person',
    run: () => verbs.personTouch(ctx, 'sam@example.com', 'email', 'out', 'sent the first line'),
  },
  { name: 'personOpener', verb: 'person', run: () => verbs.personOpener(ctx, 'sam@example.com', 'Saw the Peachtree job.') },
  { name: 'personRemove', verb: 'person', run: () => verbs.personRemove(ctx, 'sam@example.com') },
  { name: 'personPurge', verb: 'person', run: () => verbs.personPurge(ctx, 'sam@example.com') },
  { name: 'personExportFirstlines', verb: 'person', run: () => verbs.personExportFirstlines(ctx) },
  { name: 'personExportOpeners', verb: 'person', run: () => verbs.personExportOpeners(ctx) },
  {
    name: 'ledgerAddContent',
    verb: 'ledger',
    run: () => verbs.ledgerAddContent(ctx, { id: 'c01', pillar: 1, format: 'story', lane: 'text' }),
  },
  { name: 'ledgerSetContent', verb: 'ledger', run: () => verbs.ledgerSetContent(ctx, 'c01', 'status', 'approved') },
  { name: 'ledgerApprove', verb: 'ledger', run: () => verbs.ledgerApprove(ctx, 'c01') },
  { name: 'ledgerApproveAllText', verb: 'ledger', run: () => verbs.ledgerApproveAllText(ctx) },
  { name: 'ledgerList', verb: 'ledger', run: () => verbs.ledgerList(ctx, 'draft') },
  { name: 'receiptSet', verb: 'receipt', run: () => verbs.receiptSet(ctx, 'domain-checked', '2026-09-01') },
  { name: 'receiptShow', verb: 'receipt', run: () => verbs.receiptShow(ctx) },
  {
    name: 'accountsSet',
    verb: 'accounts',
    run: () => verbs.accountsSet(ctx, [{ id: 'acct-1', platform: 'ig', label: 'Lumen' }]),
  },
  { name: 'accountsList', verb: 'accounts', run: () => verbs.accountsList(ctx) },
  { name: 'accountsClear', verb: 'accounts', run: () => verbs.accountsClear(ctx) },
  { name: 'snapshot', verb: 'snapshot', run: () => verbs.snapshot(ctx, 'ledger.md') },
  { name: 'restore', verb: 'restore', run: () => verbs.restore(ctx, 'ledger.md') },
  {
    name: 'restoreFromBytes',
    verb: 'restore',
    run: () => verbs.restoreFromBytes(ctx, 'ledger.md', Buffer.from('older\n')),
  },
  { name: 'undo', verb: 'undo', run: () => verbs.undo(ctx) },
];

describe('the frozen ge registry', () => {
  it('is exactly this list, so adding a verb is a visible act in a diff', () => {
    assert.deepEqual([...verbs.VERBS], [...EXPECTED_VERBS]);
  });

  it('HOLDS NO VERB THAT SENDS ANYTHING TO ANYBODY, which is rule 2 layer 4', () => {
    // ge person touch records that a founder sent something. It does not send it.
    const sendShaped = /send|message|dm|mail|publish|post|notify|blast/i;
    const offenders = verbs.VERBS.filter((v) => sendShaped.test(v));
    assert.deepEqual(
      offenders,
      [],
      'a verb that could send was added. Rule 2: no Instagram DM automation, ever. Automated cold DMs get accounts restricted, and the API only permits messaging after the user has messaged first.',
    );
  });

  it('drives every exported call, so a new one cannot arrive untested', () => {
    // Exported functions that do not reach ge. Named one by one rather than filtered
    // by a pattern, so adding a real call cannot hide behind a naming convention.
    const NOT_A_GE_CALL = ['VerbRefused', 'isRefusal', 'isNotFound'];
    const exported = Object.entries(verbs)
      .filter(([name, value]) => typeof value === 'function' && !NOT_A_GE_CALL.includes(name))
      .map(([name]) => name)
      .sort();
    const driven = CALLS.map((c) => c.name).sort();
    assert.deepEqual(
      driven,
      exported,
      'the table in this file and the module\'s exports disagree. Add the new call to CALLS with the argv it builds.',
    );
  });

  it('every call opens its argv with a verb from the registry', async () => {
    for (const call of CALLS) {
      const result = (await call.run()) as { stdout: string };
      const argv = result.stdout.split('\n');
      assert.equal(argv[0], call.verb, `${call.name} built argv starting ${JSON.stringify(argv[0])}`);
      assert.ok(
        (verbs.VERBS as readonly string[]).includes(argv[0] ?? ''),
        `${call.name} reached ge with a verb that is not in the registry`,
      );
    }
  });

  it('NO CALL EVER NAMES A FOLDER, A PATH PREFIX OR A TOKEN', async () => {
    // The context carries the founder id and the timezone, and run.ts turns those
    // into cwd, HOME and GE_HOME. An argument naming a folder would be a way for the
    // model to name somebody else's.
    for (const call of CALLS) {
      const result = (await call.run()) as { stdout: string };
      for (const arg of result.stdout.split('\n')) {
        assert.doesNotMatch(arg, /^\//, `${call.name} passed an absolute path: ${arg}`);
        assert.doesNotMatch(arg, /\.\./, `${call.name} passed a path that walks up: ${arg}`);
        assert.ok(!arg.includes(FOUNDER), `${call.name} passed the founder id as an argument`);
      }
    }
  });

  it('refuses an invented value rather than letting ge print the refusal', async () => {
    // A model inventing a status is a typed error in our process, where it can be
    // retried, instead of a spawn and a refusal a founder has to read. These are
    // rejections rather than throws because the checks sit inside async functions.
    await assert.rejects(
      () => verbs.personTouch(ctx, 'sam@example.com', 'carrier pigeon' as never, 'out', 'x'),
      { name: 'VerbRefused' },
    );
    await assert.rejects(() => verbs.remember(ctx, 'hunch' as never, 'x'), { name: 'VerbRefused' });
    await assert.rejects(() => verbs.personSet(ctx, 'sam@example.com', 'status', 'keen'), {
      name: 'VerbRefused',
    });
  });
});
