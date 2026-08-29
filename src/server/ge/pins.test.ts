/**
 * src/server/ge/pins.test.ts
 *
 * WHAT THIS IS. The pins in the child environment, proved against the real ge rather
 * than read out of run.ts.
 *
 * WHY IT EXISTS. run.test.ts already proves the wrapper SETS GE_HOME, TZ and LC_ALL,
 * by reading `env` back out of a stub. That is a fact about run.ts. It says nothing
 * about whether ge honours any of them, and two of the three are changes that were
 * being made in the content repo in parallel with this app. A pin nobody has ever
 * watched hold is not a pin.
 *
 * Five things are proved here, each with a consequence attached:
 *
 *   The bin path is absolute. cwd is the founder's own folder, so a relative one is
 *   looked for inside that folder and /bin/sh exits 127 on every turn, while the boot
 *   check passes because access() resolves against the server's working directory.
 *
 *   The child environment is closed. Not three named secrets absent: exactly the five
 *   present and nothing else, because the deployment's environment holds the key that
 *   funds 130 founders and the one every founder file is encrypted under.
 *
 *   GE_HOME. Founder A's turn writing into founder B's folder is the failure that
 *   ends this product. assertGeInterface() runs ge with GE_HOME pointing at folder A
 *   while cwd is folder B, and checks A was built and B was left alone. It is called
 *   at boot; this runs it in CI so a submodule bump that loses the pin fails here
 *   first.
 *
 *   TZ. ops-log.md is append only, so a heading written under the wrong day cannot be
 *   corrected afterwards. Two founders logging at the same instant from zones 25
 *   hours apart must get different day headings, and 25 hours apart is chosen so the
 *   two local dates can never coincide, whatever time this test runs at.
 *
 *   Stdin restore. The History panel's put this back button hands ge the bytes of an
 *   old version on stdin. Without it the database keeps every version and nothing can
 *   put one back without the app writing a founder file, which breaks one writer.
 *
 * THE ONES THAT NEED ge SKIP RATHER THAN FAIL when it is not resolvable, because a red suite on a
 * laptop with no vendor/ trains people to ignore red.
 *
 * WHAT IT CALLS. src/server/ge/run.ts, the real bin/ge, and the filesystem.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertGeInterface, geBinPath, probeGeStdinRestore, runGe } from './run.ts';
import { founderRoot, geHome } from '../storage/paths.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF2X';

let workspace: string;
const saved: Record<string, string | undefined> = {};

/** Null when the submodule is not initialised, which is a skip and not a failure. */
async function realGe(): Promise<string | null> {
  const candidate = geBinPath();
  try {
    await stat(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function skip(): void {
  // eslint-disable-next-line no-console -- a skip that says nothing is a skip nobody fixes
  console.warn('skipped: ge is not resolvable. Run git submodule update --init.');
}

beforeEach(async () => {
  for (const name of ['WORKSPACE_ROOT', 'GE_BIN', 'GE_TIMEOUT_MS', 'GE_SHELL']) {
    saved[name] = process.env[name];
  }
  delete process.env.GE_BIN;
  workspace = await mkdtemp(join(tmpdir(), 'lh-ge-pins-'));
  process.env.WORKSPACE_ROOT = workspace;
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(workspace, { recursive: true, force: true });
});

describe('the pins ge has to honour', () => {
  it('resolves ge to an ABSOLUTE path, because cwd is a founder folder', async () => {
    // Not a style point. The path is argv[1] of a spawn whose cwd is /tmp/ge/<id>, so
    // a relative one is looked for inside the founder's own folder and /bin/sh exits
    // 127 on every turn. assertGeInstalled's access() check resolves against the
    // server's cwd instead, so boot passes and only founders see it.
    assert.equal(geBinPath().startsWith('/'), true, geBinPath());

    // .env.example ships `GE_BIN=` with nothing after it, and a file like that is
    // read as an empty string rather than as unset. An empty override falls back to
    // the submodule rather than resolving to the working directory.
    process.env.GE_BIN = '';
    assert.equal(geBinPath().endsWith('/plugins/growth-engine/bin/ge'), true, geBinPath());
    delete process.env.GE_BIN;

    // A relative override still comes back absolute.
    process.env.GE_BIN = 'vendor/growth-engine/plugins/growth-engine/bin/ge';
    assert.equal(geBinPath().startsWith('/'), true, geBinPath());
  });

  it('THE CHILD ENVIRONMENT IS EXACTLY THE FIVE, and nothing else got in', async () => {
    // run.test.ts proves three named secrets do not leak. This proves the stronger
    // thing: the set is closed. geEnv builds from scratch rather than spreading
    // process.env, and the deployment's environment holds an Anthropic key that
    // funds 130 founders, a database URL and the master key that every founder file
    // is encrypted under. A sixth variable arriving here is how one of those starts
    // travelling into a founder's shell.
    const stubDir = await mkdtemp(join(tmpdir(), 'lh-ge-envstub-'));
    try {
      const stub = join(stubDir, 'ge');
      await writeFile(stub, '#!/bin/sh\nenv\n', 'utf8');
      await chmod(stub, 0o755);
      process.env.GE_BIN = stub;
      process.env.SHOULD_NEVER_REACH_A_FOUNDER_SHELL = 'x';
      await mkdir(founderRoot(FOUNDER), { recursive: true });

      const result = await runGe({ founderId: FOUNDER, timezone: 'America/New_York', argv: ['version'] });
      const names = result.stdout
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => l.slice(0, l.indexOf('=')))
        // PWD, SHLVL and _ are set by /bin/sh itself, not passed in by us.
        .filter((n) => !['PWD', 'SHLVL', '_', 'OLDPWD'].includes(n))
        .sort();

      assert.deepEqual(names, ['GE_HOME', 'HOME', 'LC_ALL', 'PATH', 'TZ'], result.stdout);
    } finally {
      delete process.env.SHOULD_NEVER_REACH_A_FOUNDER_SHELL;
      delete process.env.GE_BIN;
      await rm(stubDir, { recursive: true, force: true });
    }
  });

  it('GE_HOME PINS THE FOLDER: ge builds the folder it names and leaves cwd alone', async () => {
    if (!(await realGe())) return skip();
    // Throws with a sentence naming what strayed. This is the tenancy boundary.
    await assertGeInterface();
  });

  it('TZ IS THE FOUNDER\'S OWN DAY: two zones 25 hours apart stamp different days', async () => {
    if (!(await realGe())) return skip();

    // +14 and -11. Always 25 hours apart, so the two local dates can never be the
    // same one, whatever instant this runs at.
    const days = new Map<string, string>();
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Niue']) {
      const founder = zone === 'Pacific/Kiritimati' ? FOUNDER : '01J8ZQTMK4NRC7XVYB3D9GHF2Y';
      await mkdir(founderRoot(founder), { recursive: true });
      const init = await runGe({ founderId: founder, timezone: zone, argv: ['init'], timeoutMs: 20_000 });
      assert.equal(init.exitCode, 0, init.stderr);
      const logged = await runGe({
        founderId: founder,
        timezone: zone,
        argv: ['log', 'note', 'the day heading is the thing under test'],
        timeoutMs: 20_000,
      });
      assert.equal(logged.exitCode, 0, logged.stderr);

      const opsLog = await readFile(join(geHome(founder), 'ops-log.md'), 'utf8');
      const heading = /\b(\d{4}-\d{2}-\d{2})\b/.exec(opsLog)?.[1];
      assert.ok(heading, `no dated heading in ops-log.md for ${zone}:\n${opsLog}`);
      days.set(zone, heading);
    }

    assert.notEqual(
      days.get('Pacific/Kiritimati'),
      days.get('Pacific/Niue'),
      'both zones stamped the same day, so TZ is not reaching ge and every founder gets the container\'s day',
    );
  });

  it('ge restore reads bytes on stdin, which is what the History panel needs', async () => {
    if (!(await realGe())) return skip();
    assert.equal(await probeGeStdinRestore(), true);
  });
});
