/**
 * src/server/ge/run.ts
 *
 * WHAT THIS IS
 *   The one place the app spawns ge. An argv array, a pinned environment, a timeout,
 *   and the 0, 1, 2 exit contract turned into a typed result.
 *
 * WHY IT EXISTS
 *   Two failures, and they are different sizes.
 *
 *   The small one: ge is 14,723 lines of tested POSIX sh, and it is the only part of
 *   this product that has ever been tested. Reimplementing it in TypeScript would
 *   make all twelve schemas descriptions of a program that no longer runs. So the app
 *   shells out, and this is the wrapper.
 *
 *   The large one: shell: true. An argv array means anything a founder types arrives
 *   as one argument and cannot be read as shell. That is the injection boundary, it
 *   is one line, and tests/unit/no-shell.test.ts greps the whole server tree for it
 *   rather than trusting this comment.
 *
 *   NOTE THE DISTINCTION THAT IS EASIEST TO MISREAD. The model's tool surface has no
 *   shell: Bash is in disallowedTools and always will be. The SERVER spawns ge, as a
 *   child process, with an argv array it built. Those are different things and both
 *   hold.
 *
 * WHAT CALLS IT
 *   src/server/ge/verbs.ts, and nothing else. Callers use the typed verb functions so
 *   there is one place each argv is built.
 *
 * READS  GE_BIN, GE_SHELL and GE_TIMEOUT_MS, through src/server/env.ts and never through
 *        process.env. Those three decide which file is executed and under which shell, on
 *        the path that keeps one founder out of another founder's folder. Read here they
 *        would be checked at a founder's first turn; read there they are checked at boot,
 *        and a GE_SHELL that names nothing is a deploy that refuses to start.
 * WRITES nothing directly. ge writes inside the founder's folder, and
 *        storage/harvest.ts is what makes those writes durable.
 *
 * WHAT THIS FILE ASSUMES ABOUT ge, AND WHICH OF THOSE IS CHECKED
 *   GE_HOME. When set, it is the founder's growth-engine folder verbatim, and the
 *   walk up the working directory and the home directories never runs. This is change
 *   1 of the five in build doc section 5, made in parallel in the content repo. HOME
 *   and cwd are pinned here as well as GE_HOME, because the doc asks for all three
 *   deliberately, so that missing the pin still cannot leave one founder's tree.
 *
 *   CHECKED AT BOOT, by assertGeInterface(), which src/server/index.ts calls from
 *   main() before it binds a port. Outside dev a ge that does not honour the pin is a
 *   deployment that refuses to start. One spawn, about 150 ms, measured.
 *
 *   Stdin restore. `ge restore <file> --from -` reading bytes on stdin is change 2.
 *   runGe supports stdin today; verbs.ts marks the restore function as depending on
 *   it.
 *
 *   NOT CHECKED AT BOOT, and that is a choice rather than an oversight. It is
 *   probeGeStdinRestore() below, called by scripts/probe-deployment.ts and by CI. It
 *   costs three spawns and a temporary tree, and what depends on it is the History
 *   panel's put this back button, which no founder reaches in their first minute. The
 *   pin is different: it is the tenancy boundary, and it is worth a spawn on every
 *   boot.
 */

import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { lateSettings } from '../env.ts';
import { founderRoot, geHome } from '../storage/paths.ts';

/** ge's exit contract. Anything else is a fault in the wrapper or in the container. */
export const GE_OK = 0;
export const GE_REFUSED = 1;
export const GE_NOT_FOUND = 2;

/** ge answers a signal with 130 and a closed pipe with 141. Both are handled below. */
const GE_INTERRUPTED = 130;
const GE_PIPE_CLOSED = 141;

/**
 * 10 seconds, then SIGTERM. Build doc section 5, size limits and failure.
 *
 * The number lives in env.ts as the GE_TIMEOUT_MS default, so there is one of it and an
 * operator can move it. It is read through geTimeoutMs() below rather than kept here,
 * because a second copy of a timeout is how the wrapper and the operator end up
 * disagreeing about when a founder's lock is released.
 */
/** How long ge gets to tidy up after SIGTERM before SIGKILL. */
const GRACE_MS = 2_000;
/**
 * Cap on captured output. ge prints founder facing text, so the realistic maximum is
 * a long person list. A cap means a runaway cannot fill the heap of a process serving
 * 130 people.
 */
const MAX_OUTPUT_BYTES = 1024 * 1024;

export class GeSpawnError extends Error {
  readonly code: 'not_installed' | 'bad_argv' | 'spawn_failed';
  constructor(code: GeSpawnError['code'], message: string) {
    super(message);
    this.name = 'GeSpawnError';
    this.code = code;
  }
}

export interface GeResult {
  /** 0 done, 1 refused, 2 nothing of that name. See isRefusal and isNotFound. */
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when the 10 second timeout fired. The turn rolls back and the folder goes. */
  timedOut: boolean;
  /** True when output was cut at the cap. The result is still usable, just clipped. */
  truncated: boolean;
  durationMs: number;
  /** The exact argv, for ge_event and for a support conversation. Never logged with values. */
  argv: readonly string[];
}

export function isRefusal(r: GeResult): boolean {
  return r.exitCode === GE_REFUSED;
}

/**
 * Exit 2 is not a failure. ge person distinguishes 1 from 2 on purpose, so that the
 * app can offer to add somebody rather than showing a founder an error for typing a
 * name they have not added yet.
 */
export function isNotFound(r: GeResult): boolean {
  return r.exitCode === GE_NOT_FOUND;
}

/**
 * Where bin/ge is. The submodule path is the default; GE_BIN overrides it.
 *
 * IT COMES BACK ABSOLUTE, AND THAT IS THE WHOLE POINT OF THIS FUNCTION. The path is
 * argv[1] of a spawn whose cwd is the founder's own folder, so a relative path is
 * resolved against /tmp/ge/<founderId> rather than against this repo. ge is not there,
 * /bin/sh exits 127, and every founder write fails.
 *
 * That failure hides, which is why it is worth this many lines. assertGeInstalled()
 * checks the same string with access(), and access() resolves a relative path against
 * the SERVER's working directory, where the file really is. So boot passes, the deploy
 * looks healthy, and every turn hands a founder a 127.
 *
 * The resolving is done in env.ts, once, so the path this returns and the path the boot
 * check tested for existence are the same string. The default is resolved against the app
 * root rather than against the working directory, so the answer does not depend on where
 * the process was started; an explicit GE_BIN is resolved against the working directory,
 * which is what an operator typing a relative path in a shell means.
 */
export function geBinPath(): string {
  return lateSettings().geBin;
}

/**
 * The shell ge runs under. /bin/sh by default, and env.ts holds that default.
 *
 * It is a variable rather than a constant for one reason: the 32 cases run twice, once
 * under the local sh and once with dash forced onto the front of PATH, and being able
 * to point the app at dash is what makes that second run reproducible here. It is
 * never a shell handed a command string. It is argv[0] of a spawn whose argv[1] is a
 * file path, which is the whole difference between this and shell: true.
 */
export function geShellPath(): string {
  return lateSettings().geShell;
}

/** How long one ge invocation may take. env.ts holds the number and checks it at boot. */
export function geTimeoutMs(): number {
  return lateSettings().geTimeoutMs;
}

/**
 * Prove ge is there and runnable, at boot.
 *
 * The same reasoning as resolving the Linux CLI binary at boot: an install that
 * skipped a path fails at the first founder's first turn rather than at deploy, and
 * that is the difference between a failed deploy and a support queue.
 */
export async function assertGeInstalled(): Promise<string> {
  const bin = geBinPath();
  try {
    await access(bin, constants.R_OK);
  } catch {
    throw new GeSpawnError(
      'not_installed',
      `ge is not at ${bin}. Set GE_BIN, or check the vendor submodule was initialised in this image.`,
    );
  }
  return bin;
}

/**
 * Argv validation.
 *
 * A NUL in an argument makes Node throw from inside spawn with a message that names
 * nothing useful. Refusing here names the argument. The check is cheap and it is the
 * only validation an argv array needs: there is no quoting to get right, because
 * there is no shell to quote for.
 */
function assertArgv(argv: readonly string[]): void {
  if (argv.length === 0) throw new GeSpawnError('bad_argv', 'ge was called with no verb');
  argv.forEach((arg, i) => {
    if (typeof arg !== 'string') {
      throw new GeSpawnError('bad_argv', `argument ${i} is not a string`);
    }
    if (arg.includes('\0')) {
      throw new GeSpawnError('bad_argv', `argument ${i} contains a null byte`);
    }
  });
}

export interface RunGeOptions {
  founderId: string;
  /** IANA zone. Goes straight into TZ. Never an offset. */
  timezone: string;
  argv: readonly string[];
  /** Bytes on stdin, for the verbs that read '-'. Stdin is always closed, never left open. */
  stdin?: string | Buffer;
  timeoutMs?: number;
}

/**
 * The environment ge is given. Built from scratch rather than spread from
 * process.env: the deployment's environment holds an Anthropic API key and whatever
 * else Replit injects, and none of that has any business inside a founder's shell.
 * What ge gets is the five variables the build doc names and nothing else.
 */
export function geEnv(args: { root: string; home: string; timezone: string }): NodeJS.ProcessEnv {
  return {
    // Deliberately minimal. Assumption B4 covers whether mktemp, readlink, date and
    // sort behave in this image. If that probe comes back needing another directory,
    // widening it is a code change here and nowhere else.
    PATH: '/usr/bin:/bin',
    // HOME is the founder's own work directory, so that even if the GE_HOME pin is
    // missed the home walk cannot leave that founder's tree.
    HOME: args.root,
    // The pin. When ge honours it, the folder search never runs at all.
    GE_HOME: args.home,
    // The founder's own day, not the container's. A founder in Atlanta logging at
    // 22:00 on the 24th must not get a heading dated the 25th, and ops-log.md is
    // append only so it cannot be corrected afterwards.
    TZ: args.timezone,
    // The person exports sort under it, so the byte order has to be the same one the
    // 32 cases were written against.
    LC_ALL: 'C',
  };
}

interface SpawnGeArgs {
  cwd: string;
  env: NodeJS.ProcessEnv;
  argv: readonly string[];
  stdin?: string | Buffer;
  timeoutMs: number;
}

/**
 * The spawn itself. Everything founder specific has already been decided by the
 * caller, so the boot probes can reach the same code path with a temporary folder.
 *
 * THE OPTIONS OBJECT BELOW HAS NO shell KEY AND MUST NEVER GROW ONE.
 */
function spawnGe(args: SpawnGeArgs): Promise<GeResult> {
  const argv = [...args.argv];
  assertArgv(argv);
  const bin = geBinPath();
  if (!isAbsolute(bin)) {
    // Belt to geBinPath's braces, and it states the invariant where the spawn is. cwd
    // is a founder's folder, so a relative bin is looked for inside that founder's
    // tree, and 127 is the best case. Refusing here names the string.
    throw new GeSpawnError('not_installed', `ge must be named by an absolute path, and GE_BIN resolved to ${bin}`);
  }
  const timeoutMs = args.timeoutMs;
  const started = Date.now();

  return new Promise<GeResult>((resolve, reject) => {
    const child = spawn(geShellPath(), [bin, ...argv], {
      cwd: args.cwd,
      env: args.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      /**
       * OWN PROCESS GROUP, AND THIS IS NOT A STYLE CHOICE. It was added because the
       * timeout test hung for thirty seconds.
       *
       * bin/ge execs scripts/ge.sh, which runs each command file inside a subshell,
       * and ge init runs the real ge index in a child process of its own. Sending
       * SIGTERM to the direct child kills the shell and leaves its descendants
       * running, still holding the stdout pipe, so the close event never fires and
       * the turn keeps the founder's advisory lock long after the ten seconds are up.
       * A founder then cannot do anything at all until that grandchild finishes.
       *
       * detached: true makes the child a process group leader, so kill(-pid) reaches
       * every descendant. The cost is that the child survives this process dying,
       * which on a container restart is moot because the container goes with it.
       */
      detached: true,
      // No shell. No uid juggling. If this object grows another option, say in the
      // commit message why.
    });

    /**
     * Signal the whole group, falling back to the direct child.
     *
     * The negative pid is the group. It throws ESRCH when the group has already gone,
     * which is a race worth swallowing: the thing being asked for has happened.
     */
    const killTree = (signal: NodeJS.Signals): void => {
      try {
        if (typeof child.pid === 'number') process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // Already gone. Nothing to do and nothing to say.
        }
      }
    };

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const termTimer = setTimeout(() => {
      timedOut = true;
      killTree('SIGTERM');
      // Two second grace, then SIGKILL. A ge that is mid write has a snapshot already
      // taken, and the turn rolls back and deletes the folder either way.
      killTimer = setTimeout(() => killTree('SIGKILL'), GRACE_MS);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (outBytes >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return;
      }
      outBytes += chunk.length;
      outChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (errBytes >= MAX_OUTPUT_BYTES) {
        truncated = true;
        return;
      }
      errBytes += chunk.length;
      errChunks.push(chunk);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      reject(new GeSpawnError('spawn_failed', `could not start ge: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);

      // A closed pipe is 141 and means whoever was reading stopped reading. ge itself
      // treats that as a finished run, and so does this.
      let exitCode = code ?? (signal ? GE_INTERRUPTED : GE_REFUSED);
      if (exitCode === GE_PIPE_CLOSED) exitCode = GE_OK;

      resolve({
        exitCode,
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        timedOut,
        truncated,
        durationMs: Date.now() - started,
        argv,
      });
    });

    // Always close stdin, even with nothing to send. `ge person opener <who> -` reads
    // stdin, and a stdin left open turns a typo into a ten second wait and a timeout.
    if (args.stdin !== undefined) {
      child.stdin.end(args.stdin);
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Spawn ge for one founder. The only entry point verbs.ts uses.
 *
 * NOTE THE DISTINCTION THAT IS EASIEST TO MISREAD, again, because it is the sentence
 * this whole file exists to keep true: the model's tool surface has no shell. The
 * server spawns ge, with an argv array it built itself, from a verb function that
 * names every argument.
 */
export async function runGe(options: RunGeOptions): Promise<GeResult> {
  const root = founderRoot(options.founderId);
  const home = geHome(options.founderId);
  const spawnArgs: SpawnGeArgs = {
    cwd: root,
    env: geEnv({ root, home, timezone: options.timezone }),
    argv: options.argv,
    timeoutMs: options.timeoutMs ?? geTimeoutMs(),
  };
  if (options.stdin !== undefined) spawnArgs.stdin = options.stdin;
  return spawnGe(spawnArgs);
}

/**
 * Prove GE_HOME is honoured, using two folders that are not a founder's.
 *
 * THIS IS THE TENANCY BOUNDARY AND ASSERTION IS NOT ENOUGH (assumption D1). It runs
 * ge init with GE_HOME pointing at folder A while cwd is folder B, then checks that A
 * was built and B was left alone. Against a ge that does not yet honour GE_HOME, B
 * gets the folder and this throws, which is a failed deploy rather than 130 founders
 * sharing a tree.
 *
 * CALLED AT BOOT, from checkGePin() in src/server/index.ts, before a port is bound.
 * That sentence was in this comment for a while before it was true: only this file's
 * own test called it, so the tenancy boundary was proved on a laptop and asserted
 * nowhere in the container. One spawn, about 150 ms, measured against the vendored ge.
 *
 * BOTH ITS FAILURE BRANCHES WERE RUN, not reasoned about. Pointed at a ge that ignores
 * the pin it throws "ge did not build the folder GE_HOME names"; pointed at one that
 * honours the pin and also builds in the working directory it throws "the pin is not
 * holding". A guard nobody has watched fail is a guard nobody knows the shape of.
 */
export async function assertGeInterface(): Promise<void> {
  const { mkdtemp, rm, access: canRead } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const base = await mkdtemp(join(tmpdir(), 'ge-probe-'));
  const pinned = join(base, 'pinned', 'growth-engine');
  const elsewhere = join(base, 'elsewhere');
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(pinned, { recursive: true });
    await mkdir(elsewhere, { recursive: true });

    const result = await spawnGe({
      cwd: elsewhere,
      env: geEnv({ root: join(base, 'pinned'), home: pinned, timezone: 'UTC' }),
      argv: ['init'],
      timeoutMs: geTimeoutMs(),
    });
    if (result.exitCode !== GE_OK) {
      throw new GeSpawnError('spawn_failed', `ge init failed during the boot probe: ${result.stderr.trim()}`);
    }
    await canRead(join(pinned, '.state', 'HOME'), constants.R_OK).catch(() => {
      throw new GeSpawnError(
        'spawn_failed',
        'ge did not build the folder GE_HOME names. This ge does not honour the pin, so it must not be deployed.',
      );
    });
    const strayed = await canRead(join(elsewhere, 'growth-engine', '.state', 'HOME'), constants.R_OK).then(
      () => true,
      () => false,
    );
    if (strayed) {
      throw new GeSpawnError(
        'spawn_failed',
        'ge built a folder in the working directory as well as the one GE_HOME names. The pin is not holding.',
      );
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

/**
 * Prove `ge restore <file> --from -` reads bytes on stdin.
 *
 * Not run at boot: it takes several spawns and a temporary tree. It is here for the
 * deployment probe and for CI, because change 2 of the five is being made in parallel
 * and the History panel's put this back button depends on it. Returns true or false
 * rather than throwing, so the probe can report it alongside the other answers.
 */
export async function probeGeStdinRestore(): Promise<boolean> {
  const { mkdtemp, mkdir, rm, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const base = await mkdtemp(join(tmpdir(), 'ge-restore-probe-'));
  const home = join(base, 'growth-engine');
  try {
    await mkdir(home, { recursive: true });
    const env = geEnv({ root: base, home, timezone: 'UTC' });
    const init = await spawnGe({ cwd: base, env, argv: ['init'], timeoutMs: geTimeoutMs() });
    if (init.exitCode !== GE_OK) return false;

    await writeFile(join(home, 'ledger.md'), 'first\n', 'utf8');
    const restored = await spawnGe({
      cwd: base,
      env,
      argv: ['restore', 'ledger.md', '--from', '-'],
      stdin: 'second\n',
      timeoutMs: geTimeoutMs(),
    });
    if (restored.exitCode !== GE_OK) return false;
    return (await readFile(join(home, 'ledger.md'), 'utf8')) === 'second\n';
  } catch {
    return false;
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

/**
 * Pull the recovery line out of a refusal.
 *
 * Every error message ge prints ends with a recovery line: "      → run: ge check".
 * Everything after "run: " is the command, to the end of the line, because a founder
 * selects the whole line and pastes it. In the app that line becomes a button, so it
 * has to come off the text rather than being shown as something to type into a
 * terminal that does not exist here.
 *
 * A bare arrow with no "run: " is deliberate in ge: it means the founder's own text
 * never reached ge, so there is nothing to hand back. That case returns a command of
 * null and the sentence is shown as it is.
 */
export function parseRecovery(stderr: string): { text: string; command: string | null } {
  const lines = stderr.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes('→'));
  if (idx < 0) return { text: stderr.trim(), command: null };
  const arrowLine = lines[idx] ?? '';
  const match = /→\s*run:\s*(.+)$/.exec(arrowLine);
  const text = lines
    .filter((_, i) => i !== idx)
    .join('\n')
    .trim();
  return { text: match ? text : stderr.trim(), command: match?.[1]?.trim() ?? null };
}
