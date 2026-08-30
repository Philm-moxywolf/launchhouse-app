/**
 * src/server/boot/platform-cli.ts
 *
 * WHAT THIS IS. The boot check that resolves the Claude Code CLI binary the agent loop
 * spawns, and proves it can actually run on this machine before the app reports ready.
 *
 * WHY IT EXISTS. The Agent SDK does not contain the binary it spawns. It declares eight per
 * platform packages as OPTIONAL dependencies, one per operating system, processor and C
 * library, and npm is allowed to skip an optional dependency for any reason and still exit
 * 0. So an install can succeed, a build can succeed, a deployment can go green, and the app
 * can answer /healthz with {"ok":true,"blockers":[]} while there is nothing on disk for the
 * loop to spawn. Measured, not argued: moving the platform package aside and booting gave
 * exactly that, {"ok":true,"blockers":[]}, and not one line in the log.
 *
 * The failure then lands on the founder's FIRST MESSAGE. They have signed in, pasted a key,
 * answered the interview questions, pressed send, and the first thing the app has ever been
 * asked to do is the thing it cannot do. In a staffed room that reads as the app being
 * broken rather than as an install that needs redoing, and it costs the mentor the whole
 * diagnosis from scratch.
 *
 * agent/sdk.ts says so in its own header: "the boot check belongs beside this import".
 * It did not exist there. The only copy of this logic was in scripts/probe-deployment.ts,
 * which runs only when somebody changes the Replit run command to `npm run probe`, and no
 * founder will ever do that. A check that runs only when a person remembers to run it is a
 * check that reads as a guarantee in a review and is absent in the container.
 *
 * BOTH LIBC VARIANTS EXIST AND THE WRONG ONE IS THE HARD CASE. There is a glibc build and a
 * musl build for each Linux architecture, in separate packages. Install the wrong one and
 * the file is there, has the right name and the right size, and exec fails with "no such
 * file or directory" naming a file that plainly exists. That message sends whoever reads it
 * looking for a missing file for twenty minutes. So resolving the path is not enough, and
 * this file reads the binary's own ELF header: its architecture, and the dynamic loader it
 * asks for. A musl build names /lib/ld-musl-x86_64.so.1 and a glibc build names
 * /lib64/ld-linux-x86-64.so.2, and comparing that to the loaders present on the machine
 * settles the question before a founder ever sends a message.
 *
 * IT READS THE BINARY RATHER THAN RUNNING IT, AND THAT IS A RULE AND NOT A PREFERENCE.
 * ge/no-shell.test.ts holds the whole server tree to ONE file that may import
 * node:child_process, and that file is ge/run.ts. The reason it gives is exactly right: two
 * files that spawn are two places the environment has to be got right, and the second is
 * always the one that inherits process.env by accident. Running `claude --version` here
 * would have been a stronger proof and a second spawn boundary, so the first draft did it
 * and that test caught it.
 *
 * WHAT THAT LEAVES UNCAUGHT, said plainly rather than glossed. Reading the header proves the
 * file is an executable of the right architecture asking for a C library this machine has.
 * It does not prove every shared library it needs beyond the loader is present. That gap is
 * narrow, it is the same gap ge/run.ts lives with, and scripts/probe-deployment.ts still
 * runs the binary for a person who wants the stronger answer before the event.
 *
 * WHAT CALLS IT. src/server/index.ts, in main(), before the port binds. Its own test.
 * WHAT IT READS. node_modules, and the first few kilobytes of the binary.
 * WHAT IT WRITES. Nothing. It spawns nothing and returns a fact.
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** The package the loop spawns from. Named once, because it is named in three places here. */
const SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk';

/**
 * ELF e_machine values for the two architectures this app can run on.
 *
 * A wrong architecture is a separate failure from a wrong C library and it produces the same
 * useless "cannot execute binary file". Checking it costs two bytes of the header.
 */
const ELF_MACHINE: Readonly<Record<string, number>> = { x64: 62, arm64: 183 };

export interface PlatformCliReady {
  readonly ok: true;
  /** Absolute path to the binary the agent loop will spawn. */
  readonly path: string;
  /** What the header says about it, for one log line. Never a version: it was not run. */
  readonly detail: string;
}

export interface PlatformCliRefused {
  readonly ok: false;
  /** One sentence a founder can act on. It reaches the first screen. */
  readonly founderMessage: string;
  /** The longer version, for whoever is running the room. Goes to the log. */
  readonly detail: string;
}

export type PlatformCliOutcome = PlatformCliReady | PlatformCliRefused;

/**
 * The sentence a founder gets.
 *
 * IT IS THE SAME SHAPE AS THE MISSING ENGINE BLOCKER, and for the same reason. This is a
 * fault in the copy of the app they were handed. There is no Secret to set and no button to
 * press, so the only honest action is to tell the person who can reinstall it. Naming
 * `npm ci --include=optional` here would be writing an instruction for a founder who has no
 * terminal. That instruction goes to the log, where the mentor looks.
 */
const FOUNDER_MESSAGE =
  'Part of Claude is missing from this copy of the app, so it cannot write anything yet. This is a problem with the copy you were given, not with anything you did. Tell whoever is running the room.';

function refuse(detail: string): PlatformCliRefused {
  return { ok: false, founderMessage: FOUNDER_MESSAGE, detail };
}

/**
 * Which C library this machine uses, which decides which of the two Linux builds is right.
 *
 * The loader path is the tell. glibc puts it at /lib64/ld-linux-x86-64.so.2 or
 * /lib/ld-linux-aarch64.so.1, musl at /lib/ld-musl-<arch>.so.1. Only asked on Linux: macOS
 * and Windows have one build each and no musl variant, so asking there would invent a
 * distinction the packages do not have.
 */
function hostLibc(): 'glibc' | 'musl' | 'unknown' {
  if (process.platform !== 'linux') return 'unknown';
  const musl = existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1');
  const glibc = existsSync('/lib64/ld-linux-x86-64.so.2') || existsSync('/lib/ld-linux-aarch64.so.1');
  if (musl && !glibc) return 'musl';
  if (glibc && !musl) return 'glibc';
  return 'unknown';
}

/**
 * The name of the package this machine needs.
 *
 * Built from the same three facts npm uses to decide whether to install it: platform,
 * architecture, and on Linux the C library. It is checked against the SDK's own declared
 * list below rather than trusted, so a name this function gets wrong shows up as "the SDK
 * ships no package for this machine" instead of as a silent pass.
 */
export function wantedPlatformPackage(platform: string, arch: string, libc: string): string {
  const suffix = platform === 'linux' && libc === 'musl' ? '-musl' : '';
  return `${SDK_PACKAGE}-${platform}-${arch}${suffix}`;
}

/** What an ELF header says. Every field is optional because a truncated file has none of it. */
export interface ElfFacts {
  readonly isElf: boolean;
  readonly is64: boolean;
  /** e_machine. Compared against ELF_MACHINE for the host architecture. */
  readonly machine: number | undefined;
  /** PT_INTERP, the dynamic loader. Absent on a statically linked binary. */
  readonly interpreter: string | undefined;
}

/**
 * Read an ELF header and the program header table.
 *
 * THE INTERPRETER IS THE POINT. A musl build names /lib/ld-musl-x86_64.so.1 and a glibc
 * build names /lib64/ld-linux-x86-64.so.2. That string is the only thing on disk that says
 * which of the two packages actually installed, and getting it wrong is the failure that
 * reports itself as "no such file or directory" about a file that is plainly there.
 *
 * Returns isElf false for anything that is not ELF, which includes every macOS build. That
 * is not a fault: a Mach-O binary on macOS is correct, and there is nothing here to check.
 */
export function readElf(path: string): ElfFacts {
  const none: ElfFacts = { isElf: false, is64: false, machine: undefined, interpreter: undefined };
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const head = Buffer.alloc(64);
    if (readSync(fd, head, 0, 64, 0) < 64) return none;
    if (head.subarray(0, 4).toString('latin1') !== '\x7fELF') return none;

    const is64 = head.readUInt8(4) === 2;
    const machine = head.readUInt16LE(0x12);
    if (!is64) return { isElf: true, is64: false, machine, interpreter: undefined };

    const phoff = Number(head.readBigUInt64LE(0x20));
    const phentsize = head.readUInt16LE(0x36);
    const phnum = head.readUInt16LE(0x38);
    const table = Buffer.alloc(phentsize * phnum);
    readSync(fd, table, 0, table.length, phoff);

    for (let i = 0; i < phnum; i++) {
      const off = i * phentsize;
      if (table.readUInt32LE(off) !== 3) continue; // PT_INTERP
      const at = Number(table.readBigUInt64LE(off + 8));
      const size = Number(table.readBigUInt64LE(off + 32));
      const interp = Buffer.alloc(size);
      readSync(fd, interp, 0, size, at);
      return { isElf: true, is64: true, machine, interpreter: interp.toString('latin1').replace(/\0+$/, '') };
    }
    // Statically linked. Nothing to match against a loader, and nothing wrong with that.
    return { isElf: true, is64: true, machine, interpreter: undefined };
  } catch {
    return none;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Everything that can be known about the binary without running it.
 *
 * FOUR CHECKS, EACH FOR A FAILURE SEEN IN THE WILD. A zero length file is a download that
 * was cut off. A file with no execute bit is an archive unpacked without permissions, which
 * fails with EACCES. A wrong e_machine is an x64 image running an arm64 package. A loader
 * that does not match the machine's is the libc mismatch.
 */
function inspectBinary(path: string, libc: 'glibc' | 'musl' | 'unknown'): { ok: true; detail: string } | { ok: false; why: string } {
  let size: number;
  try {
    const st = statSync(path);
    if (!st.isFile()) return { ok: false, why: `${path} is not a file.` };
    size = st.size;
    if (size === 0) return { ok: false, why: `${path} is empty, so the download was cut off. Delete node_modules and run npm ci --include=optional` };
    // Any execute bit. Which one applies depends on the user the container runs as, and
    // requiring the owner bit specifically would refuse a correct install on some images.
    if ((st.mode & 0o111) === 0) {
      return { ok: false, why: `${path} has no execute permission, so spawning it fails with EACCES. Reinstall with npm ci --include=optional` };
    }
  } catch (err) {
    return { ok: false, why: `${path} could not be read. ${err instanceof Error ? err.message : String(err)}` };
  }

  if (process.platform !== 'linux') {
    // macOS and Windows have one build each and no musl variant. There is no ELF header to
    // read and no second package that could have installed instead, so the checks above are
    // the whole of what can be known here.
    return { ok: true, detail: `${String(size)} bytes, executable` };
  }

  const elf = readElf(path);
  if (!elf.isElf) return { ok: false, why: `${path} is not an ELF binary, so this Linux machine cannot execute it.` };
  if (!elf.is64) return { ok: false, why: `${path} is a 32 bit binary and this machine runs 64 bit.` };

  const expected = ELF_MACHINE[process.arch];
  if (expected !== undefined && elf.machine !== expected) {
    return {
      ok: false,
      why: `${path} is built for a different processor. Its ELF machine is ${String(elf.machine)} and this machine needs ${String(expected)} for ${process.arch}.`,
    };
  }

  if (elf.interpreter !== undefined && libc !== 'unknown') {
    const binaryIsMusl = /musl/.test(elf.interpreter);
    if (binaryIsMusl !== (libc === 'musl')) {
      return {
        ok: false,
        why: `${path} asks for ${elf.interpreter} and this machine is ${libc}. The wrong C library build installed. It fails at exec with an error naming a file that is plainly there, which is the unhelpful error to watch for. Reinstall with npm ci --include=optional`,
      };
    }
  }

  return { ok: true, detail: `${String(size)} bytes, ${elf.interpreter ?? 'statically linked'}` };
}

/**
 * Walk up from a resolved entry point to the folder holding that package's package.json.
 *
 * WHY NOT JUST RESOLVE `<name>/package.json`. Because the Agent SDK does not let you. It
 * declares an `exports` map, and an exports map that does not list "./package.json" makes
 * that path unresolvable: Node answers `Package subpath './package.json' is not defined by
 * "exports"`. The first version of this file did exactly that, and the test that drives the
 * happy path caught it refusing on a machine where everything was installed correctly. A
 * guard that fails on a working machine is worse than no guard, because it teaches the room
 * to ignore the screen.
 *
 * The name is checked rather than assumed, because a nested node_modules can put a different
 * package.json in the way on the walk up.
 */
function packageRootOf(entry: string, name: string): string | undefined {
  let dir = dirname(entry);
  for (let i = 0; i < 8; i++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const pj = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
        if (pj.name === name) return dir;
      } catch {
        /* not readable, keep walking */
      }
    }
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
  return undefined;
}

/** The executable inside a platform package. One file, at the package root. */
function findBinary(packageRoot: string): string | undefined {
  for (const name of ['claude', 'claude.exe']) {
    const full = join(packageRoot, name);
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      /* try the next name */
    }
  }
  return undefined;
}

/**
 * Resolve the CLI and check the machine can execute it.
 *
 * FIVE THINGS CAN GO WRONG AND THEY ARE TOLD APART, because they need different people.
 * The SDK missing is a broken install. The platform package missing is the skipped optional
 * dependency this file was written for. No package for this machine at all is somebody
 * running the app somewhere it was never built for. A package with no binary in it is a
 * download that was cut off. A binary that is present and cannot be executed is the libc or
 * architecture mismatch. Each returns its own detail line for the log, and every one of them
 * returns the same sentence to the founder, because the founder's action is the same in all
 * five: tell whoever is running the room.
 *
 * `resolveFrom` is injectable so the test can point it at a resolver that finds nothing and
 * prove this function can fail. A guard that has only ever been watched passing is a guard
 * nobody has tested.
 *
 * It is async because main() awaits it alongside the ge checks, and because a future version
 * that needs to read more of the file should not have to change its callers. Nothing in it
 * blocks today.
 */
export async function resolvePlatformCli(
  resolveFrom: (specifier: string) => string = createRequire(import.meta.url).resolve,
): Promise<PlatformCliOutcome> {
  // 1. The SDK itself.
  let sdkRoot: string | undefined;
  try {
    sdkRoot = packageRootOf(resolveFrom(SDK_PACKAGE), SDK_PACKAGE);
  } catch (err) {
    return refuse(
      `${SDK_PACKAGE} is not installed at all, so there is nothing for the agent loop to spawn. Run npm ci and check it did not fail. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (sdkRoot === undefined) {
    return refuse(
      `${SDK_PACKAGE} resolved but its package folder could not be found by walking up from the entry point. That should not happen, and it means this check cannot read which CLI package the machine needs.`,
    );
  }

  // 2. What it says it needs. Read from the SDK's own package.json rather than remembered,
  //    because the list of platform packages is the SDK's to change and not ours to know.
  let optional: string[];
  try {
    const pj = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8')) as {
      optionalDependencies?: Record<string, string>;
    };
    optional = Object.keys(pj.optionalDependencies ?? {});
  } catch (err) {
    return refuse(
      `The Agent SDK's package.json could not be read at ${sdkRoot}, so there is no way to tell which CLI package this machine needs. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const libc = hostLibc();
  const wanted = wantedPlatformPackage(process.platform, process.arch, libc);

  if (optional.length === 0) {
    // Not a founder's machine problem. This version of the SDK does not ship the CLI as a
    // separate package, which means the shape this file checks has changed under it. Refuse
    // rather than pass, and name this file, because passing here would put the app back to
    // discovering the fault at the first founder message.
    return refuse(
      `The installed ${SDK_PACKAGE} declares no optional platform packages, so this check no longer matches the SDK. Somebody changed the SDK version. Open src/server/boot/platform-cli.ts before the freeze.`,
    );
  }

  if (!optional.includes(wanted)) {
    return refuse(
      `The Agent SDK ships no CLI build for ${process.platform}/${process.arch}${libc === 'musl' ? ' (musl)' : ''}. It offers: ${optional.join(', ')}. Nothing here can spawn the CLI.`,
    );
  }

  // 3. Is the one this machine needs actually on disk.
  //
  //    RESOLVED DIFFERENTLY FROM THE SDK ABOVE, and the asymmetry is real rather than an
  //    oversight. A platform package contains one executable and declares no `main`, so
  //    resolving it by name fails with "Cannot find module" even when it is installed.
  //    Its package.json has no `exports` map in the way, so that path resolves. The SDK is
  //    the mirror image of both. Checked on this machine rather than reasoned about.
  let packageRoot: string;
  try {
    packageRoot = dirname(resolveFrom(`${wanted}/package.json`));
  } catch {
    return refuse(
      `The platform package this machine needs, ${wanted}, is NOT INSTALLED. This is an install that skipped optional dependencies. Reinstall with: npm ci --include=optional`,
    );
  }

  const binary = findBinary(packageRoot);
  if (binary === undefined) {
    return refuse(
      `${wanted} is installed at ${packageRoot} but holds no claude executable, so the package is incomplete. Delete node_modules and run npm ci --include=optional`,
    );
  }

  // 4. Can this machine actually execute it. Reading the header, not running it: see the
  //    file header for why, and for what that leaves uncaught.
  const usable = inspectBinary(binary, libc);
  if (!usable.ok) return refuse(usable.why);

  return { ok: true, path: binary, detail: usable.detail };
}
