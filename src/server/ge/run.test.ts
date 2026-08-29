/**
 * src/server/ge/run.test.ts
 *
 * WHAT THIS IS. The spawn wrapper, executed. Two halves.
 *
 *   With a stub standing in for ge: the argv boundary, the pinned environment, the
 *   exit contract, the timeout and stdin. These always run, because they are about
 *   this file rather than about ge.
 *
 *   With the real ge: a founder's text containing shell metacharacters going in one
 *   end and coming out of ops-log.md verbatim. This half skips when ge is not
 *   resolvable, and says why rather than passing quietly.
 *
 * WHY IT EXISTS. shell: true is the one line that would turn a founder's own typing
 * into a command. A test that has never spawned anything proves nothing about that, so
 * this one spawns. The stub is a real /bin/sh script and the payload is a real
 * founder shaped sentence.
 *
 * WHAT IT CALLS. src/server/ge/run.ts, /bin/sh, and the filesystem.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeSpawnError, geBinPath, parseRecovery, runGe } from './run.ts';
import { founderRoot, geHome } from '../storage/paths.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF2W';
const TZ = 'America/New_York';

let workspace: string;
let stubDir: string;
const saved: Record<string, string | undefined> = {};

function remember(name: string) {
  saved[name] = process.env[name];
}

beforeEach(async () => {
  for (const name of ['WORKSPACE_ROOT', 'GE_BIN', 'GE_TIMEOUT_MS', 'GE_SHELL']) remember(name);
  workspace = await mkdtemp(join(tmpdir(), 'lh-ge-run-'));
  stubDir = await mkdtemp(join(tmpdir(), 'lh-ge-stub-'));
  process.env.WORKSPACE_ROOT = workspace;
  await mkdir(founderRoot(FOUNDER), { recursive: true });
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(workspace, { recursive: true, force: true });
  await rm(stubDir, { recursive: true, force: true });
});

/** Write a stub that stands in for bin/ge and point GE_BIN at it. */
async function stub(body: string): Promise<void> {
  const path = join(stubDir, 'ge');
  await writeFile(path, `#!/bin/sh\n${body}\n`, 'utf8');
  await chmod(path, 0o755);
  process.env.GE_BIN = path;
}

describe('the argv boundary', () => {
  it('hands a founder sentence over as ONE argument, metacharacters and all', async () => {
    // Printed one per line by the stub. If a shell were involved anywhere, this
    // arrives as several arguments, or the semicolon runs as a second command.
    await stub('for a in "$@"; do printf "%s\\n" "$a"; done');
    const nasty = 'sold 3 units; rm -rf / && echo $(whoami) `id` | tee /tmp/x';
    const result = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['log', 'note', nasty] });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.stdout.split('\n').slice(0, 3), ['log', 'note', nasty]);
  });

  it('keeps an argument that is only a quote, which is what a founder types by accident', async () => {
    await stub('for a in "$@"; do printf "%s\\n" "$a"; done');
    const result = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['log', 'note', '"'] });
    assert.equal(result.stdout.split('\n')[2], '"');
  });

  it('refuses an argument with a null byte, and names which one', async () => {
    await stub('exit 0');
    await assert.rejects(
      runGe({ founderId: FOUNDER, timezone: TZ, argv: ['log', 'note', 'a\u0000b'] }),
      GeSpawnError,
    );
  });

  it('refuses an empty argv rather than running ge with no verb', async () => {
    await stub('exit 0');
    await assert.rejects(runGe({ founderId: FOUNDER, timezone: TZ, argv: [] }), { message: /no verb/ });
  });
});

describe('the environment', () => {
  it('pins HOME, GE_HOME, TZ, LC_ALL and PATH, and passes nothing else', async () => {
    await stub('env | sort');
    process.env.ANTHROPIC_API_KEY = 'sk-should-never-reach-a-founder-shell';
    try {
      const result = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['version'] });
      const seen = new Map(
        result.stdout
          .split('\n')
          .filter((l) => l.includes('='))
          .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)] as const),
      );
      assert.equal(seen.get('HOME'), founderRoot(FOUNDER));
      assert.equal(seen.get('GE_HOME'), geHome(FOUNDER));
      assert.equal(seen.get('TZ'), TZ);
      assert.equal(seen.get('LC_ALL'), 'C');
      assert.equal(seen.get('PATH'), '/usr/bin:/bin');
      // THE ONE THAT MATTERS: the deployment's API key funds 130 founders and has no
      // business inside a founder's shell.
      assert.equal(seen.has('ANTHROPIC_API_KEY'), false);
      assert.equal(seen.has('DATABASE_URL'), false);
      assert.equal(seen.has('GE_MASTER_KEY'), false);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('runs with the founder folder as the working directory', async () => {
    await stub('pwd');
    const result = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['version'] });
    // On a Mac /tmp is reached as /private/tmp, so compare what the kernel resolved.
    assert.equal((await stat(result.stdout.trim())).ino, (await stat(founderRoot(FOUNDER))).ino);
  });

  it('refuses to build a working directory for anything that is not a founder id', async () => {
    await stub('exit 0');
    await assert.rejects(runGe({ founderId: '../escape', timezone: TZ, argv: ['version'] }));
  });
});

describe('the exit contract', () => {
  it('reads 0 as done', async () => {
    await stub('exit 0');
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['index'] });
    assert.equal(r.exitCode, 0);
  });

  it('reads 1 as a refusal and keeps the founder facing text', async () => {
    await stub('printf "FAIL  ge could not do that.\\n      → run: ge check\\n" >&2; exit 1');
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['index'] });
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('FAIL'), `the founder facing text was dropped: ${r.stderr}`);
  });

  it('reads 2 as nothing of that name, which is NOT a failure', async () => {
    // ge person distinguishes 1 from 2 on purpose, so the app can offer to add
    // somebody rather than showing an error for a name not added yet.
    await stub('exit 2');
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['person', 'get', 'nobody'] });
    assert.equal(r.exitCode, 2);
  });

  it('reads 141 as done, because a closed pipe means the reader stopped reading', async () => {
    await stub('exit 141');
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['person', 'list'] });
    assert.equal(r.exitCode, 0);
  });
});

describe('the timeout', () => {
  it('kills a verb that will not return, and says it timed out', async () => {
    await stub('sleep 30');
    const started = Date.now();
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['index'], timeoutMs: 300 });
    assert.equal(r.timedOut, true);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 5_000, `the kill took ${elapsed}ms, so the timeout is not the thing that stopped it`);
  });

  it('SIGKILLs a verb that ignores SIGTERM, rather than holding the founder lock for ever', { timeout: 20_000 }, async () => {
    await stub('trap "" TERM; sleep 30');
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['index'], timeoutMs: 200 });
    assert.equal(r.timedOut, true);
  });
});

describe('stdin', () => {
  it('sends bytes, for the verbs that read a dash', async () => {
    await stub('cat');
    const r = await runGe({
      founderId: FOUNDER,
      timezone: TZ,
      argv: ['person', 'opener', 'sam@example.com', '-'],
      stdin: 'Saw your post about the Peachtree job.\n',
    });
    assert.equal(r.stdout, 'Saw your post about the Peachtree job.\n');
  });

  it('CLOSES stdin when there is nothing to send, so a verb that reads it does not hang', async () => {
    await stub('cat');
    const r = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['index'], timeoutMs: 2_000 });
    assert.equal(r.timedOut, false);
    assert.equal(r.stdout, '');
  });
});

describe('parseRecovery', () => {
  it('lifts the command off the arrow line so it can become a button', () => {
    const stderr = [
      'FAIL  ge cannot start, because one of its own files is missing.',
      '      Installing the plugin again puts a clean copy back.',
      '      → run: ge check',
    ].join('\n');
    const { text, command } = parseRecovery(stderr);
    assert.equal(command, 'ge check');
    assert.ok(!text.includes('→'), `the arrow line was left in the text: ${text}`);
    assert.ok(text.includes('one of its own files is missing'), `the reason was dropped: ${text}`);
  });

  it('leaves a bare arrow alone, because ge uses one when there is nothing to paste', () => {
    // ge prints a bare arrow when the founder's own text never reached it, so there is
    // no command to hand back. Turning that into a button would hand them their own
    // mistake to press.
    const stderr = 'FAIL  "--company" was read as the name.\n      → Put a quote at each end.';
    const { command } = parseRecovery(stderr);
    assert.equal(command, null);
  });

  it('says nothing about a command when there is no arrow at all', () => {
    assert.equal(parseRecovery('something went wrong').command, null);
  });
});

/**
 * The real ge. Skipped rather than failed when the submodule is not initialised,
 * because a red suite on a laptop with no vendor/ trains people to ignore red.
 */
describe('against the real ge', () => {
  async function realGe(): Promise<string | null> {
    delete process.env.GE_BIN;
    const candidate = geBinPath();
    try {
      await stat(candidate);
      return candidate;
    } catch {
      return null;
    }
  }

  it('writes a founder sentence into the ops log verbatim, metacharacters and all', { timeout: 60_000 }, async () => {
    const bin = await realGe();
    if (!bin) {
      // eslint-disable-next-line no-console -- a skip that says nothing is a skip nobody fixes
      console.warn('skipped: ge is not resolvable. Set GE_BIN or run git submodule update --init.');
      return;
    }
    process.env.GE_BIN = bin;

    const init = await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['init'], timeoutMs: 20_000 });
    assert.equal(init.exitCode, 0, init.stderr);

    const sentence = 'picked b2b; rm -rf $HOME && echo `id`';
    const logged = await runGe({
      founderId: FOUNDER,
      timezone: TZ,
      argv: ['log', 'decision', sentence],
      timeoutMs: 20_000,
    });
    assert.equal(logged.exitCode, 0, logged.stderr);

    const opsLog = await readFile(join(geHome(FOUNDER), 'ops-log.md'), 'utf8');
    assert.ok(opsLog.includes(sentence), `the sentence did not reach ops-log.md verbatim:\n${opsLog}`);
    // Nothing ran as a command: the founder's home is the founder folder and it is
    // still there with the log in it.
    assert.equal((await stat(founderRoot(FOUNDER))).isDirectory(), true);
  });

  it('answers an unknown person with 2, not 1', { timeout: 60_000 }, async () => {
    const bin = await realGe();
    if (!bin) return;
    process.env.GE_BIN = bin;
    await runGe({ founderId: FOUNDER, timezone: TZ, argv: ['init'], timeoutMs: 20_000 });
    const r = await runGe({
      founderId: FOUNDER,
      timezone: TZ,
      argv: ['person', 'get', 'nobody@example.com'],
      timeoutMs: 20_000,
    });
    assert.equal(r.exitCode, 2);
  });
});
