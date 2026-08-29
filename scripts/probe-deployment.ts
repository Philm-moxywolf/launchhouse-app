/**
 * scripts/probe-deployment.ts
 *
 * WHAT THIS IS. A tiny app whose only job is to be deployed and answer five questions that
 * cannot be answered from a laptop. It has no database, no dependencies beyond Node itself,
 * and it does not import a single line of the real app. Deploy it, open its URL, copy the
 * page, and the answers are on it in plain words.
 *
 * WHY IT EXISTS. Five separate design decisions rest on how the deployment container
 * behaves, and every one of them is currently a guess:
 *
 *   1. The storage design assumes the container filesystem is a cache and is wiped. If it
 *      is actually durable, a lot of machinery is unnecessary. If it is wiped and we
 *      assumed otherwise, founders lose work.
 *   2. The agent loop spawns a Claude Code CLI subprocess. That binary ships as a per
 *      platform optional dependency, so an install that skipped optional dependencies
 *      fails at the first founder message rather than at install time. And two builds
 *      exist, glibc and musl. The wrong one fails at exec with an unhelpful error.
 *   3. Every secret in the design assumes Replit Secrets reach the Deployment on their own.
 *      If they have to be promoted by hand, that is a deploy checklist item nobody knows
 *      about yet.
 *   4. ge is 14,723 lines of POSIX shell that calls mktemp, readlink, date and sort. A
 *      green test suite on a Mac proves nothing about this container.
 *   5. The SSE heartbeat is set to fifteen seconds and fifteen is a guess. It has to sit
 *      comfortably under the proxy's real idle timeout, and nobody has measured it.
 *
 * It also prints the resolved timezone and asserts full ICU, because every scheduled post
 * depends on America/New_York resolving and a slim Node build does not know that zone.
 *
 * WHY IT HAS NO DEPENDENCIES. If the probe imported Fastify, a failed install would take
 * the probe down with it, and the probe is the thing that tells you the install failed.
 * node:http is forty lines here and it cannot break for a reason the probe is meant to
 * find. The one exception is that it tries to resolve the Agent SDK, inside a try, because
 * that resolution is question two.
 *
 * WHAT CALLS IT. `npm run probe`, and the Replit Deployment run command while the probe is
 * what is deployed. Nothing in the app imports it.
 *
 * WHAT IT READS. PROBE_SECRET, PROBE_PUBLIC_URL, PROBE_STATE_DIR, PORT, and the container.
 * WHAT IT WRITES. A marker file in two places, which is the whole of question one, and a
 * report to stdout at boot.
 *
 * See scripts/PROBE.md for how to deploy it without being a developer.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statfsSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// =========================================================================================
// CHANGE THIS NUMBER BEFORE YOU REDEPLOY.
//
// Question one has two halves. Restarting answers the first half. To answer the second half
// the probe has to be able to tell "this is a new build" from "this is the same build
// booting again", and the only reliable way is a number a human changes on purpose.
//
// Deploy with 1. Then change it to 2, redeploy, and reload the page. The report says which
// half it just answered.
// =========================================================================================
const BUILD_ID = 1;

const PROBE_VERSION = "1.0.0";
const STARTED_AT = new Date();

// =========================================================================================
// Findings
// =========================================================================================

type Status = "ANSWERED" | "PARTLY ANSWERED" | "PROBLEM" | "NEEDS A REDEPLOY" | "NEEDS ONE ACTION";

interface Finding {
  n: string;
  question: string;
  status: Status;
  answer: string[];
  meaning: string[];
  evidence: string[];
}

const truncate = (s: string, max = 400): string =>
  s.length <= max ? s : `${s.slice(0, max)} ... [${String(s.length - max)} more characters]`;

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

// =========================================================================================
// Question 1. Does the deployment filesystem persist?
// =========================================================================================

interface Marker {
  probeVersion: string;
  firstSeenAt: string;
  firstSeenBuild: number;
  boots: { at: string; build: number; pid: number; host: string }[];
  sseObservations: SseObservation[];
}

interface SseObservation {
  at: string;
  source: string;
  secondsOpen: number;
  endedBy: string;
}

const markerLocations = (): { label: string; dir: string }[] => {
  const appDir = process.env["PROBE_STATE_DIR"] ?? resolve(process.cwd(), ".probe-state");
  return [
    { label: "the app folder", dir: appDir },
    { label: "/tmp", dir: join(tmpdir(), "launchhouse-probe-state") },
  ];
};

function readMarker(dir: string): Marker | undefined {
  const file = join(dir, "marker.json");
  if (!existsSync(file)) return undefined;
  try {
    // The file is ours and small. A parse failure is itself a finding, so it is reported
    // rather than swallowed.
    return JSON.parse(readFileSync(file, "utf8")) as Marker;
  } catch {
    return undefined;
  }
}

function writeMarker(dir: string, marker: Marker): string | undefined {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "marker.json"), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Kept in memory so the SSE observations can be appended without re reading. */
const liveMarkers = new Map<string, { dir: string; marker: Marker }>();

function checkFilesystem(): Finding {
  const answer: string[] = [];
  const meaning: string[] = [];
  const evidence: string[] = [];
  let sawSurvival = false;
  let sawRedeploySurvival = false;
  let sawWipe = false;

  for (const { label, dir } of markerLocations()) {
    const before = readMarker(dir);
    const now = new Date().toISOString();

    if (!before) {
      sawWipe = true;
      answer.push(`${label}: NO marker was here. Either this is the first ever boot, or the filesystem was wiped.`);
      evidence.push(`${dir}/marker.json  did not exist at boot`);
    } else {
      const builds = new Set(before.boots.map((b) => b.build));
      builds.add(before.firstSeenBuild);
      const fromAnotherBuild = [...builds].some((b) => b !== BUILD_ID);
      sawSurvival = true;
      if (fromAnotherBuild) sawRedeploySurvival = true;

      answer.push(
        `${label}: a marker WAS here, first written ${before.firstSeenAt} by build ${String(before.firstSeenBuild)}, ` +
          `and this container has now booted ${String(before.boots.length + 1)} times.`,
      );
      evidence.push(
        `${dir}/marker.json  first seen ${before.firstSeenAt}, builds seen: ${[...builds].sort((a, b) => a - b).join(", ")}`,
      );
      for (const b of before.boots.slice(-5)) {
        evidence.push(`   boot  ${b.at}  build ${String(b.build)}  pid ${String(b.pid)}  host ${b.host}`);
      }
    }

    const marker: Marker = before ?? {
      probeVersion: PROBE_VERSION,
      firstSeenAt: now,
      firstSeenBuild: BUILD_ID,
      boots: [],
      sseObservations: [],
    };
    marker.boots.push({ at: now, build: BUILD_ID, pid: process.pid, host: hostname() });
    if (marker.boots.length > 40) marker.boots = marker.boots.slice(-40);
    const writeError = writeMarker(dir, marker);
    if (writeError) {
      evidence.push(`${dir}  COULD NOT BE WRITTEN: ${writeError}`);
      answer.push(`${label}: could not be written at all. That is a bigger problem than persistence.`);
    } else {
      liveMarkers.set(label, { dir, marker });
    }

    // Free space, because /tmp is where every founder's working folder is rebuilt.
    try {
      const st = statfsSync(dir);
      const freeGb = (Number(st.bavail) * Number(st.bsize)) / 1024 ** 3;
      evidence.push(`${dir}  free space ${freeGb.toFixed(2)} GB`);
      if (label === "/tmp" && freeGb < 1) {
        meaning.push(
          `/tmp has under 1 GB free (${freeGb.toFixed(2)} GB). Every founder's working folder is rebuilt there. Check this before load testing.`,
        );
      }
    } catch (err) {
      evidence.push(`${dir}  free space could not be read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let status: Status;
  if (sawRedeploySurvival) {
    status = "ANSWERED";
    meaning.unshift(
      "The filesystem survived a REDEPLOY. That is the strong answer, and it is the one the storage design did not assume.",
      "It changes nothing that is already built, because Postgres is still the record, but it means a warm founder folder may survive longer than expected and the .ge-epoch check earns its keep.",
    );
  } else if (sawSurvival && !sawWipe) {
    status = "NEEDS A REDEPLOY";
    meaning.unshift(
      "The filesystem survived a RESTART. Half the question is answered.",
      `For the other half: change BUILD_ID at the top of scripts/probe-deployment.ts from ${String(BUILD_ID)} to ${String(BUILD_ID + 1)}, redeploy, and reload this page.`,
    );
  } else if (sawWipe && !sawSurvival) {
    status = "NEEDS A REDEPLOY";
    meaning.unshift(
      "No marker was found. On a first ever boot that is expected and means nothing yet.",
      "Restart the deployment and reload this page. If the marker is still absent after a restart, the filesystem is wiped between boots, which is exactly what the storage design assumes: anything written to the container and not harvested into Postgres is already lost.",
    );
  } else {
    status = "PARTLY ANSWERED";
    meaning.unshift(
      "The two locations disagree with each other. Read the evidence below: one mount persists and the other does not, and the working folder must live on the one that behaves as expected.",
    );
  }

  meaning.push(
    "Either answer is survivable. What is not survivable is not knowing, because the harvest step refuses a turn when a file it expected on disk is missing, and that refusal is correct only if we know which mount we are on.",
  );

  return {
    n: "1",
    question: "Does the deployment filesystem persist across a restart, and across a redeploy?",
    status,
    answer,
    meaning,
    evidence,
  };
}

// =========================================================================================
// Question 2. Does the Linux CLI binary from the Agent SDK resolve in this image?
// =========================================================================================

const ELF_MAGIC = "\x7fELF";

interface ElfInfo {
  isElf: boolean;
  interpreter?: string;
  note: string;
}

/**
 * Read an ELF file's program headers and pull out PT_INTERP, which names the dynamic
 * loader. That string is the difference between glibc and musl:
 *
 *   /lib64/ld-linux-x86-64.so.2   glibc
 *   /lib/ld-musl-x86_64.so.1      musl
 *
 * Reading it is the only way to know which build actually installed. Running the binary
 * with the wrong loader gives "no such file or directory" naming a file that plainly
 * exists, which is the unhelpful error the build document warns about.
 */
function readElfInterpreter(path: string): ElfInfo {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const head = Buffer.alloc(64);
    const got = readSync(fd, head, 0, 64, 0);
    if (got < 64 || head.subarray(0, 4).toString("latin1") !== ELF_MAGIC) {
      const kind = head.subarray(0, 2).toString("latin1") === "#!" ? "a script with a #! line" : "not an ELF binary";
      return { isElf: false, note: kind };
    }
    const is64 = head.readUInt8(4) === 2;
    if (!is64) return { isElf: true, note: "a 32 bit ELF binary, which is not what this image should be running" };

    const phoff = Number(head.readBigUInt64LE(0x20));
    const phentsize = head.readUInt16LE(0x36);
    const phnum = head.readUInt16LE(0x38);

    const table = Buffer.alloc(phentsize * phnum);
    readSync(fd, table, 0, table.length, phoff);

    for (let i = 0; i < phnum; i++) {
      const off = i * phentsize;
      const pType = table.readUInt32LE(off);
      if (pType !== 3) continue; // PT_INTERP
      const pOffset = Number(table.readBigUInt64LE(off + 8));
      const pFilesz = Number(table.readBigUInt64LE(off + 32));
      const interp = Buffer.alloc(pFilesz);
      readSync(fd, interp, 0, pFilesz, pOffset);
      return { isElf: true, interpreter: interp.toString("latin1").replace(/\0+$/, ""), note: "dynamically linked" };
    }
    return { isElf: true, note: "statically linked, no interpreter, so glibc against musl does not apply to it" };
  } catch (err) {
    return { isElf: false, note: `could not be read: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function hostLibc(): { kind: string; detail: string } {
  const musl = existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1");
  const glibcLoader = existsSync("/lib64/ld-linux-x86-64.so.2") || existsSync("/lib/ld-linux-aarch64.so.1");
  let reported = "";
  try {
    // process.report is typed as returning `object`, so the one field wanted is read
    // through a narrow cast. Cast and not `any`: this is the documented shape and nothing
    // else on the report is used.
    const header = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header;
    if (header?.glibcVersionRuntime) reported = `Node reports glibc ${header.glibcVersionRuntime} at runtime`;
  } catch {
    reported = "";
  }
  if (musl && !glibcLoader) return { kind: "musl", detail: `musl loader present. ${reported}`.trim() };
  if (glibcLoader && !musl) return { kind: "glibc", detail: `glibc loader present. ${reported}`.trim() };
  if (glibcLoader && musl) return { kind: "both", detail: `both loaders present, which is unusual. ${reported}`.trim() };
  return { kind: "unknown", detail: `neither loader found at the usual paths (${process.platform}/${process.arch}). ${reported}`.trim() };
}

function findCliCandidates(pkgRoot: string): string[] {
  // Not a hardcoded path. The layout of the SDK package is not something to know from
  // memory, so the probe looks and reports what it finds. A wrong guess here would report
  // "missing" for a binary that is present, which is worse than reporting nothing.
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (dir: string, depth: number): void => {
    if (depth > 3 || seen.has(dir)) return;
    seen.add(dir);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const full = join(dir, name);
      let isDir: boolean;
      try {
        isDir = lstatSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (name === "node_modules" && depth > 0) continue;
        walk(full, depth + 1);
      } else if (/^(cli|claude|claude-code)(\.[cm]?js)?$/.test(name)) {
        found.push(full);
      }
    }
  };

  walk(pkgRoot, 0);
  return found;
}

function checkCliBinary(): Finding {
  const answer: string[] = [];
  const meaning: string[] = [];
  const evidence: string[] = [];
  let status: Status = "ANSWERED";

  const req = createRequire(import.meta.url);
  const libc = hostLibc();
  evidence.push(`This image's C library looks like: ${libc.kind}. ${libc.detail}`);

  let pkgRoot: string | undefined;
  try {
    const entry = req.resolve("@anthropic-ai/claude-agent-sdk");
    evidence.push(`@anthropic-ai/claude-agent-sdk resolved to ${entry}`);
    let dir = dirname(entry);
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(dir, "package.json"))) {
        try {
          const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string };
          if (pj.name === "@anthropic-ai/claude-agent-sdk") {
            pkgRoot = dir;
            break;
          }
        } catch {
          /* keep walking */
        }
      }
      dir = dirname(dir);
    }
  } catch (err) {
    status = "PROBLEM";
    answer.push("The Agent SDK is NOT INSTALLED in this image. The agent loop cannot start at all.");
    evidence.push(`resolve failed: ${err instanceof Error ? err.message : String(err)}`);
    meaning.push(
      "Nothing else in the app matters until this resolves. Check that the deployment build command runs `npm ci` and that it did not skip optional dependencies.",
    );
    return { n: "2", question: "Does the Linux CLI binary from the Agent SDK resolve inside the deployment image?", status, answer, meaning, evidence };
  }

  if (!pkgRoot) {
    status = "PROBLEM";
    answer.push("The SDK resolved but its package folder could not be located, which should not happen.");
    return { n: "2", question: "Does the Linux CLI binary from the Agent SDK resolve inside the deployment image?", status, answer, meaning, evidence };
  }

  // Which optional platform packages actually installed. This is the whole "install skipped
  // optional dependencies" failure, made visible. The CLI the loop spawns does not live in
  // the SDK package at all: it is a single native executable inside a per platform package,
  // so those package folders have to be searched as well.
  const roots: string[] = [pkgRoot];

  // The one this image needs. musl and glibc are separate packages, which is precisely why
  // the wrong one can install and nothing complains until exec.
  const wanted = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}${libc.kind === "musl" ? "-musl" : ""}`;
  evidence.push(`This image needs the platform package: ${wanted}`);

  try {
    const pj = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
      version?: string;
      optionalDependencies?: Record<string, string>;
    };
    evidence.push(`SDK version ${pj.version ?? "unknown"}`);
    const optional = Object.keys(pj.optionalDependencies ?? {});
    if (optional.length === 0) {
      evidence.push("The SDK declares no optional dependencies in this version, so the CLI is not a separate package here.");
    }
    let wantedFound = false;
    for (const name of optional) {
      let where = "NOT INSTALLED";
      try {
        where = dirname(req.resolve(`${name}/package.json`));
        roots.push(where);
      } catch {
        where = "NOT INSTALLED";
      }
      evidence.push(`optional dependency ${name}: ${where}`);
      if (name === wanted && where !== "NOT INSTALLED") wantedFound = true;
    }
    if (optional.includes(wanted) && !wantedFound) {
      status = "PROBLEM";
      answer.push(
        `The platform package this image needs, ${wanted}, is NOT INSTALLED. This is the failure the build document names: an install that skipped optional dependencies. It fails at the first founder message, not at install time.`,
      );
    } else if (wantedFound) {
      answer.push(`The platform package for this image, ${wanted}, is installed.`);
    } else if (optional.length > 0 && !optional.includes(wanted)) {
      status = "PROBLEM";
      answer.push(`The SDK ships no platform package for ${process.platform}/${process.arch}. Nothing here can spawn the CLI.`);
    }
  } catch (err) {
    evidence.push(`could not read the SDK package.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  const candidates = roots.flatMap((r) => findCliCandidates(r));
  if (candidates.length === 0) {
    status = "PROBLEM";
    answer.push("No CLI entry point was found inside the SDK package. The agent loop has nothing to spawn.");
  }
  for (const c of candidates.slice(0, 12)) {
    const elf = readElfInterpreter(c);
    const size = (() => {
      try {
        return `${String(lstatSync(c).size)} bytes`;
      } catch {
        return "size unknown";
      }
    })();
    if (elf.isElf && elf.interpreter) {
      const isMusl = /musl/.test(elf.interpreter);
      const kind = isMusl ? "musl" : "glibc";
      evidence.push(`${c}  ${size}  ELF, needs ${elf.interpreter}  (${kind})`);
      if (libc.kind !== "unknown" && libc.kind !== "both" && kind !== libc.kind) {
        status = "PROBLEM";
        answer.push(
          `MISMATCH. ${c} is a ${kind} binary and this image is ${libc.kind}. It will fail at exec with an error naming a file that plainly exists, which is the unhelpful error to watch for.`,
        );
      }
    } else {
      evidence.push(`${c}  ${size}  ${elf.note}`);
    }
  }

  // The definitive test: actually run it. argv array, never shell: true.
  // Prefer the native executable, because that is what the agent loop actually spawns. A
  // .js entry point running under node proves something different and weaker.
  const runnable = candidates.find((c) => !/\.[cm]?js$/.test(c)) ?? candidates[0];
  if (runnable) {
    const usesNode = /\.[cm]?js$/.test(runnable);
    const cmd = usesNode ? process.execPath : runnable;
    const args = usesNode ? [runnable, "--version"] : ["--version"];
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 20_000 });
    evidence.push(`ran: ${cmd} ${args.join(" ")}`);
    evidence.push(`  exit code ${r.status === null ? "null (killed or timed out)" : String(r.status)}`);
    if (r.stdout) evidence.push(`  stdout: ${truncate(oneLine(r.stdout), 200)}`);
    if (r.stderr) evidence.push(`  stderr: ${truncate(oneLine(r.stderr), 300)}`);
    if (r.error) evidence.push(`  error: ${r.error.message}`);
    if (r.status === 0) {
      answer.push(`The CLI runs in this image. It answered --version with: ${truncate(oneLine(r.stdout), 120)}`);
    } else {
      status = "PROBLEM";
      answer.push("The CLI is present but did NOT run cleanly. Read the exit code and stderr in the evidence below.");
    }
  }

  if (status === "ANSWERED" && answer.length === 0) {
    answer.push("The SDK is installed and a CLI entry point was found.");
  }

  meaning.push(
    "This is the binary the agent loop spawns for every founder turn. If it is missing or is the wrong libc, the app installs cleanly, deploys cleanly, and fails at the first founder message.",
    "The app's own boot must repeat this resolution and refuse to start when it fails, rather than discovering it during a live session.",
  );

  return { n: "2", question: "Does the Linux CLI binary from the Agent SDK resolve inside the deployment image?", status, answer, meaning, evidence };
}

// =========================================================================================
// Question 3. Do Replit Secrets reach the Deployment on their own?
// =========================================================================================

function checkSecrets(): Finding {
  const answer: string[] = [];
  const meaning: string[] = [];
  const evidence: string[] = [];
  const raw = process.env["PROBE_SECRET"];
  let status: Status;

  if (raw && raw.trim() !== "") {
    status = "ANSWERED";
    const digest = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    answer.push("YES. PROBE_SECRET arrived in this process without being promoted by hand.");
    answer.push(`It is ${String(raw.length)} characters long and its fingerprint is ${digest}.`);
    answer.push("The value itself is not printed here and never will be. Compare the fingerprint against the workspace if you need to prove they match.");
    meaning.push(
      "Secrets set in the workspace reach the Deployment. The env.ts boot check is therefore the only gate needed, and there is no extra promotion step to add to the deploy checklist.",
    );
  } else {
    status = "NEEDS ONE ACTION";
    answer.push("PROBE_SECRET is NOT set in this process.");
    answer.push("Either it was never set in the workspace, or workspace secrets do not reach the Deployment on their own.");
    meaning.push(
      "Set PROBE_SECRET to any random string in the workspace Secrets pane, redeploy WITHOUT touching the deployment environment, and reload this page.",
      "If it is still absent, secrets must be promoted to the Deployment by hand, and that becomes a checklist item on every deploy. Getting that wrong on 25 September means an app that boots and cannot reach Postgres.",
    );
  }

  // Variable NAMES only. A name cannot leak a value, and the team needs to know the real
  // platform variable names rather than guess them from memory.
  const names = Object.keys(process.env).sort();
  evidence.push(`${String(names.length)} environment variables are present. Names only, values never:`);
  const platform = names.filter((n) => /^(REPL|REPLIT|DEPLOY)/i.test(n));
  evidence.push(`  platform supplied, by the look of the names: ${platform.length > 0 ? platform.join(", ") : "none found"}`);
  const database = names.filter((n) => /(DATABASE|PG|POSTGRES)/i.test(n));
  evidence.push(`  database shaped: ${database.length > 0 ? database.join(", ") : "none found"}`);
  evidence.push(`  all names: ${names.join(", ")}`);

  return { n: "3", question: "Do Replit Secrets reach the Deployment automatically, without being promoted?", status, answer, meaning, evidence };
}

// =========================================================================================
// Question 4. What is /bin/sh, and do mktemp, readlink, date and sort behave?
// =========================================================================================

interface ShellProbe {
  name: string;
  command: string;
  exit: string;
  output: string;
  verdict: string;
  ok: boolean;
}

function runProbe(name: string, cmd: string, args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): ShellProbe {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: 10_000,
    ...(opts.input === undefined ? {} : { input: opts.input }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
  });
  const out = oneLine(`${r.stdout ?? ""} ${r.stderr ?? ""}`);
  return {
    name,
    command: `${cmd} ${args.join(" ")}`,
    exit: r.status === null ? "null (killed or timed out)" : String(r.status),
    output: truncate(out, 200),
    verdict: "",
    ok: r.status === 0,
  };
}

function checkShell(): Finding {
  const answer: string[] = [];
  const meaning: string[] = [];
  const evidence: string[] = [];
  const probes: ShellProbe[] = [];
  let status: Status = "ANSWERED";

  // What /bin/sh actually is.
  let shTarget: string;
  try {
    shTarget = realpathSync("/bin/sh");
  } catch (err) {
    shTarget = `could not be resolved: ${err instanceof Error ? err.message : String(err)}`;
    status = "PROBLEM";
  }
  answer.push(`/bin/sh resolves to ${shTarget}`);

  const bashCheck = runProbe("is /bin/sh really bash", "/bin/sh", ["-c", "echo ${BASH_VERSION:-not-bash}"]);
  bashCheck.verdict =
    bashCheck.output === "not-bash"
      ? "Not bash. ge is POSIX sh and its suite runs under dash, so this is the stricter and better case."
      : `bash ${bashCheck.output}. ge will run, but bash is more forgiving than dash, so keep running the suite under dash too or a bashism will get in unnoticed.`;
  probes.push(bashCheck);

  // mktemp, both forms ge uses.
  const tmpFile = runProbe("mktemp", "mktemp", []);
  tmpFile.verdict = tmpFile.ok ? "Works. ge builds every new file under a temporary name and moves it into place in one step." : "FAILS. ge cannot write any file safely without it.";
  if (!tmpFile.ok) status = "PROBLEM";
  probes.push(tmpFile);
  if (tmpFile.ok) {
    try {
      rmSync(tmpFile.output, { force: true });
    } catch {
      /* leaving one temp file behind is not a finding */
    }
  }

  const tmpDir = runProbe("mktemp -d", "mktemp", ["-d"]);
  tmpDir.verdict = tmpDir.ok ? "Works." : "FAILS.";
  if (!tmpDir.ok) status = "PROBLEM";
  probes.push(tmpDir);
  if (tmpDir.ok) {
    try {
      rmSync(tmpDir.output, { recursive: true, force: true });
    } catch {
      /* as above */
    }
  }

  // readlink -f, on a symlink this probe makes, so the answer is not about some path that
  // happens to exist in the image.
  let readlinkProbe: ShellProbe;
  try {
    const dir = mkdtempSync(join(tmpdir(), "probe-readlink-"));
    const target = join(dir, "real.txt");
    const link = join(dir, "link.txt");
    writeFileSync(target, "x", "utf8");
    symlinkSync(target, link);
    readlinkProbe = runProbe("readlink -f", "readlink", ["-f", link]);
    readlinkProbe.verdict =
      readlinkProbe.ok && readlinkProbe.output.endsWith("real.txt")
        ? "GNU style readlink -f works. ge's path resolution is safe."
        : "readlink -f did NOT resolve the link. ge resolves founder folder paths with it, so this needs the compatibility branch checking.";
    if (!readlinkProbe.verdict.startsWith("GNU")) status = "PROBLEM";
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    readlinkProbe = { name: "readlink -f", command: "readlink -f <symlink>", exit: "n/a", output: err instanceof Error ? err.message : String(err), verdict: "The probe could not create a symlink to test with.", ok: false };
    status = "PROBLEM";
  }
  probes.push(readlinkProbe);

  // date. GNU and BSD take different flags for the same job, and ge carries a compatibility
  // layer for exactly this. Which branch this image takes is worth knowing.
  const dateNow = runProbe("date, ISO in UTC", "date", ["-u", "+%Y-%m-%dT%H:%M:%SZ"]);
  dateNow.verdict = dateNow.ok ? "Works." : "FAILS. Every ops-log heading and every stamp depends on it.";
  if (!dateNow.ok) status = "PROBLEM";
  probes.push(dateNow);

  const dateGnu = runProbe("date -d, the GNU form", "date", ["-u", "-d", "@0", "+%Y"]);
  const dateBsd = runProbe("date -r, the BSD form", "date", ["-u", "-r", "0", "+%Y"]);
  const gnuWorks = dateGnu.ok && dateGnu.output === "1970";
  const bsdWorks = dateBsd.ok && dateBsd.output === "1970";
  dateGnu.verdict = gnuWorks ? "GNU date. This is the coreutils build and it is what ge's compatibility layer expects first." : "The GNU form is not accepted.";
  dateBsd.verdict = bsdWorks ? "The BSD form also works, which is unusual on Linux." : "The BSD form is not accepted, which is normal on a GNU image.";
  probes.push(dateGnu, dateBsd);
  if (!gnuWorks && !bsdWorks) {
    status = "PROBLEM";
    answer.push("Neither the GNU nor the BSD form of date works. ge's date compatibility layer has no branch for this image.");
  }

  // sort under LC_ALL=C. The person exports sort under it, and a different collation
  // silently reorders every founder's people file.
  const sortEnv: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C", LANG: "C" };
  const sortProbe = runProbe("sort under LC_ALL=C", "sort", [], { input: "b\nA\na\nB\n", env: sortEnv });
  const sorted = oneLine(sortProbe.output);
  sortProbe.verdict =
    sorted === "A B a b"
      ? "C collation, which is what ge sets and what the person export assumes. Uppercase sorts before lowercase."
      : `Unexpected order: "${sorted}". C collation should give "A B a b". The person export order would differ from every other environment.`;
  if (sorted !== "A B a b") status = "PROBLEM";
  probes.push(sortProbe);

  for (const p of probes) {
    evidence.push(`${p.name}`);
    evidence.push(`  command: ${p.command}`);
    evidence.push(`  exit ${p.exit}   output: ${p.output}`);
    evidence.push(`  ${p.verdict}`);
  }

  if (status === "ANSWERED") {
    answer.push("All four tools behave the way ge needs. mktemp, readlink -f, date and sort under C collation are all correct.");
  } else {
    answer.push("At least one tool does not behave the way ge needs. Read the evidence below before writing any storage code.");
  }

  meaning.push(
    "ge is 14,723 lines of POSIX shell and it is the only part of this product that has ever been tested. It writes every founder file. These four tools are what it writes them with.",
    "This probe is a spot check and not the real test. The real test is running the 32 case suite inside this image, in CI, which is step 1 of the build order.",
  );

  return { n: "4", question: "What is /bin/sh in this image, and do mktemp, readlink, date and sort behave?", status, answer, meaning, evidence };
}

// =========================================================================================
// Question 5. What is the SSE idle timeout?
// =========================================================================================

const sseObservations: SseObservation[] = [];
let openStreams = 0;

function recordSse(obs: SseObservation): void {
  sseObservations.push(obs);
  // Persist, so a restart does not lose a measurement that took ten minutes to take.
  for (const [, entry] of liveMarkers) {
    entry.marker.sseObservations = [...(entry.marker.sseObservations ?? []), obs].slice(-40);
    writeMarker(entry.dir, entry.marker);
  }
}

function allSseObservations(): SseObservation[] {
  const fromDisk: SseObservation[] = [];
  for (const { dir } of markerLocations()) {
    const m = readMarker(dir);
    if (m?.sseObservations) fromDisk.push(...m.sseObservations);
  }
  const all = [...fromDisk, ...sseObservations];
  const seen = new Set<string>();
  return all.filter((o) => {
    const k = `${o.at}|${o.source}|${String(o.secondsOpen)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function checkSse(): Finding {
  const answer: string[] = [];
  const meaning: string[] = [];
  const evidence: string[] = [];
  const all = allSseObservations();
  // The authoritative measurements are the ones taken by a client that was still waiting
  // when the connection died. A server side view cannot tell a proxy timeout from somebody
  // closing a tab, so it is evidence and never the answer.
  const throughProxy = all.filter((o) => o.source.startsWith("browser") || o.source === "self test, through proxy");
  const direct = all.filter((o) => o.source === "self test, direct");

  let status: Status;
  if (throughProxy.length === 0) {
    status = "NEEDS ONE ACTION";
    answer.push("Not measured yet. No client has held a stream open through the public URL and watched it die.");
    answer.push("Open /sse-test in a browser tab, leave it alone for fifteen minutes, then come back to this page.");
    answer.push("Or set PROBE_PUBLIC_URL to this deployment's own address and redeploy, and the probe measures it by itself.");
  } else {
    const longest = Math.max(...throughProxy.map((o) => o.secondsOpen));
    const shortest = Math.min(...throughProxy.map((o) => o.secondsOpen));
    const cutByProxy = throughProxy.filter((o) => o.endedBy !== "still open");
    if (cutByProxy.length === 0) {
      status = "PARTLY ANSWERED";
      answer.push(`A stream stayed open through the public URL for ${longest.toFixed(0)} seconds and was never cut.`);
      answer.push("That is a floor, not the timeout. Leave one open longer to find the ceiling.");
    } else {
      status = "ANSWERED";
      const cut = Math.min(...cutByProxy.map((o) => o.secondsOpen));
      answer.push(`An idle stream through the public URL was cut after ${cut.toFixed(0)} seconds.`);
      answer.push(`Longest seen ${longest.toFixed(0)} seconds, shortest ${shortest.toFixed(0)} seconds.`);
      const suggested = Math.max(5, Math.floor((cut / 3) / 5) * 5);
      meaning.push(
        `Set SSE_HEARTBEAT_MS to about ${String(suggested * 1000)}, which is ${String(suggested)} seconds, roughly a third of the measured cut off. The default of 15 seconds is a guess and this replaces it with a number.`,
      );
    }
  }

  for (const o of all.slice(-20)) {
    evidence.push(`${o.at}  ${o.source}  open for ${o.secondsOpen.toFixed(1)}s  ended by: ${o.endedBy}`);
  }
  evidence.push("");
  evidence.push("How to read the sources. 'browser' and 'self test, through proxy' are the answer: a client that was still waiting when the connection died. 'self test, direct' bypasses the proxy and is the control, so if it is cut at the same second the timeout is Node's and not the proxy's. 'server side view' is neither, because from the server a proxy timeout and a closed tab look identical.");
  evidence.push(`Observations that count: ${String(throughProxy.length)}. Controls: ${String(direct.length)}.`);
  evidence.push(`${String(openStreams)} stream(s) open right now.`);

  meaning.push(
    "A founder types for minutes at a time while the stream sits idle. If the proxy closes it and the heartbeat is longer than the proxy's patience, the founder sees the app disconnect for no reason, repeatedly, during a live session.",
    "The heartbeat must sit comfortably under the measured number. A third of it is a safe rule.",
    "Reconnection is lossless by design, because every frame carries the id of a turn_events row and the browser reconnects with Last-Event-ID. This measurement is about how often that has to happen, not about whether anything is lost.",
  );

  return { n: "5", question: "What is the SSE idle timeout on this deployment?", status, answer, meaning, evidence };
}

// =========================================================================================
// Also checked: timezone and full ICU
// =========================================================================================

function checkTimezone(): Finding {
  const answer: string[] = [];
  const meaning: string[] = [];
  const evidence: string[] = [];
  let status: Status = "ANSWERED";

  const tzVar = process.env["TZ"] ?? "(not set)";
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  answer.push(`TZ is ${tzVar}. The process clock resolves to ${resolved}.`);
  evidence.push(`process.versions.icu: ${process.versions.icu ?? "(none, which means a small-icu build)"}`);
  evidence.push(`Node ${process.version} on ${process.platform}/${process.arch}`);
  evidence.push(`new Date().toString(): ${new Date().toString()}`);

  // The assertion the app makes at boot, run here so the answer arrives before the app is
  // written rather than as a failed deploy afterwards.
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "short",
      hour: "numeric",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
    const summer = fmt.format(new Date("2026-07-01T16:00:00Z"));
    const beforeChange = fmt.format(new Date("2026-10-31T16:00:00Z"));
    const afterChange = fmt.format(new Date("2026-11-15T16:00:00Z"));
    evidence.push(`America/New_York, 1 Jul 2026 16:00 UTC  -> ${summer}`);
    evidence.push(`America/New_York, 31 Oct 2026 16:00 UTC -> ${beforeChange}`);
    evidence.push(`America/New_York, 15 Nov 2026 16:00 UTC -> ${afterChange}`);

    const summerOk = summer.includes("12:00") && summer.includes("EDT");
    const winterOk = afterChange.includes("11:00") && afterChange.includes("EST");
    if (summerOk && winterOk) {
      answer.push("Full ICU is present. America/New_York resolves, and it changes from EDT to EST across 1 November 2026 correctly.");
      meaning.push(
        "Every founder facing time and every scheduled post depends on this. The 90 day plan built on 27 September runs into December, past the daylight saving change, so the zone has to be right on both sides of it.",
      );
    } else {
      status = "PROBLEM";
      answer.push("America/New_York resolved but produced the wrong hours. The timezone database in this image is wrong or stale.");
      meaning.push("Do not schedule anything from this image until this is fixed. A post at the wrong hour for 130 people is worse than a post the founder scheduled by hand.");
    }
  } catch (err) {
    status = "PROBLEM";
    answer.push("America/New_York DOES NOT RESOLVE in this Node build. This is a slim ICU build.");
    evidence.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    meaning.push("The app must refuse to start on an image like this, and the deployment needs a full ICU Node build.");
  }

  if (resolved !== "UTC" && resolved !== "Etc/UTC") {
    meaning.push(
      `The probe itself deliberately does not set TZ, so this reports what the image gives you: ${resolved}. The app sets TZ=UTC and asserts it, so this is information, not a fault.`,
    );
  }

  return { n: "6", question: "Also checked: the resolved timezone, and full ICU", status, answer, meaning, evidence };
}

// =========================================================================================
// The report
// =========================================================================================

function wrap(text: string, width = 88, indent = ""): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line === "") line = w;
    else if ((line + " " + w).length + indent.length <= width) line += ` ${w}`;
    else {
      lines.push(indent + line);
      line = w;
    }
  }
  if (line !== "") lines.push(indent + line);
  return lines;
}

/**
 * Wrap one evidence line while keeping its own indentation.
 *
 * Evidence lines carry file paths, and a path has no spaces in it, so a long path stays on
 * one line rather than being broken somewhere that makes it uncopyable. Everything else,
 * including the long comma separated lists, wraps.
 */
function wrapEvidence(line: string): string[] {
  const lead = /^(\s*)/.exec(line)?.[1] ?? "";
  return wrap(line.trim(), 84, `    ${lead}`);
}

function renderReport(findings: readonly Finding[]): string {
  const L: string[] = [];
  const rule = "=".repeat(88);
  const thin = "-".repeat(88);

  L.push(rule);
  L.push("  LAUNCHHOUSE DEPLOYMENT PROBE");
  L.push(rule);
  L.push("");
  L.push(...wrap(
    "This page answers five questions about the machine this app runs on. Nobody can answer them from a laptop, and five design decisions rest on them. Copy this whole page and paste it back to whoever asked for it. You do not need to understand it.",
  ));
  L.push("");
  L.push(`  Probe version   ${PROBE_VERSION}`);
  L.push(`  Build id        ${String(BUILD_ID)}   (change this and redeploy to answer question 1 fully)`);
  L.push(`  Booted at       ${STARTED_AT.toISOString()}`);
  L.push(`  Up for          ${(process.uptime() / 60).toFixed(1)} minutes`);
  L.push(`  Read at         ${new Date().toISOString()}`);
  L.push(`  Host            ${hostname()}`);
  L.push(`  Node            ${process.version} on ${process.platform}/${process.arch}`);
  L.push(`  Working folder  ${process.cwd()}`);
  L.push("");

  L.push(rule);
  L.push("  THE SHORT VERSION");
  L.push(rule);
  L.push("");
  for (const f of findings) {
    L.push(...wrap(`${f.n}. [${f.status}]  ${f.question}`, 86, "  "));
  }
  L.push("");
  const todo = findings.filter((f) => f.status !== "ANSWERED");
  if (todo.length === 0) {
    L.push("  Everything is answered. Nothing further to do here.");
  } else {
    L.push("  Still to do:");
    for (const f of todo) {
      for (const m of f.meaning.slice(0, 1)) L.push(...wrap(`${f.n}. ${m}`, 86, "     "));
    }
  }
  L.push("");

  for (const f of findings) {
    L.push(rule);
    L.push(`  QUESTION ${f.n}.  ${f.question}`);
    L.push(`  STATUS: ${f.status}`);
    L.push(rule);
    L.push("");
    L.push("  The answer");
    for (const a of f.answer) L.push(...wrap(a, 86, "    "));
    L.push("");
    L.push("  What it means for the build");
    for (const m of f.meaning) {
      L.push(...wrap(m, 86, "    "));
      L.push("");
    }
    L.push("  The evidence");
    for (const e of f.evidence) L.push(...wrapEvidence(e));
    L.push("");
    L.push(thin);
    L.push("");
  }

  L.push(rule);
  L.push("  WHAT TO DO NEXT");
  L.push(rule);
  L.push("");
  L.push(...wrap("1. Copy this whole page and paste it back.", 86, "  "));
  L.push(...wrap(`2. If question 1 says NEEDS A REDEPLOY: open scripts/probe-deployment.ts, change BUILD_ID from ${String(BUILD_ID)} to ${String(BUILD_ID + 1)}, redeploy, and open this page again.`, 86, "  "));
  L.push(...wrap("3. If question 3 says NEEDS ONE ACTION: set PROBE_SECRET to any random string in the Secrets pane, redeploy without touching the deployment environment, and open this page again.", 86, "  "));
  L.push(...wrap("4. If question 5 says NEEDS ONE ACTION: open /sse-test in a browser tab, leave it alone for fifteen minutes, then open this page again.", 86, "  "));
  L.push("");
  L.push(...wrap("This probe holds no founder data, no keys and no secrets, and it prints no value from the environment. It is safe to leave running and safe to delete.", 86, "  "));
  L.push("");
  return L.join("\n");
}

/**
 * The four checks that must run exactly once.
 *
 * checkFilesystem WRITES the boot marker, and checkCliBinary and checkShell each spawn
 * child processes. Running them per request would inflate the boot count that question one
 * reads, and would fork a dozen processes every time somebody reloaded the page. The SSE
 * finding is recomputed each time because observations arrive while the page is open, and
 * the timezone check is free.
 */
let bootFindings: Finding[] | undefined;

export function runAllChecks(): Finding[] {
  bootFindings ??= [checkFilesystem(), checkCliBinary(), checkSecrets(), checkShell()];
  return [...bootFindings, checkSse(), checkTimezone()];
}

// =========================================================================================
// The server
// =========================================================================================

const SSE_TEST_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Probe: how long does a quiet connection stay open</title>
<style>
 body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:2rem;max-width:44rem;background:#fff;color:#111}
 h1{font-size:1.4rem} .n{font-size:3rem;font-weight:700;font-variant-numeric:tabular-nums}
 .box{border:1px solid #ccc;border-radius:8px;padding:1rem 1.25rem;margin:1.5rem 0}
 .done{border-color:#0a0;background:#f2fff2}
</style></head><body>
<h1>How long does a quiet connection stay open</h1>
<p>This page opens one connection to the server and then says nothing on it, which is exactly
what happens while a founder is typing. Leave this tab open and come back in fifteen minutes.
You do not need to watch it.</p>
<div class="box" id="box">
  <div class="n" id="t">0:00</div>
  <div id="s">The connection is open.</div>
</div>
<p>When it closes, the time above is the answer. Then open the main page and copy it.</p>
<script>
 var start = Date.now(), timer, done = false;
 var es = new EventSource('/sse');
 function tick(){
   var s = Math.round((Date.now()-start)/1000);
   document.getElementById('t').textContent = Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 }
 timer = setInterval(tick, 1000);
 function finish(why){
   if (done) return; done = true;
   clearInterval(timer); tick();
   document.getElementById('box').className = 'box done';
   document.getElementById('s').textContent = 'Closed after the time above. Reason: ' + why;
   try { es.close(); } catch (e) {}
   fetch('/sse/report', { method:'POST', headers:{'content-type':'application/json'},
     body: JSON.stringify({ seconds:(Date.now()-start)/1000, endedBy: why }) });
 }
 es.onerror = function(){ if (es.readyState === 2) finish('the connection was closed'); };
 window.addEventListener('beforeunload', function(){ if(!done) finish('the tab was closed'); });
</script>
</body></html>`;

function startServer(): void {
  const port = Number(process.env["PORT"] ?? 5000);

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    if (url.startsWith("/sse")) {
      if (url === "/sse/report" && req.method === "POST") {
        let body = "";
        req.on("data", (c: Buffer) => {
          body += c.toString("utf8");
          if (body.length > 4096) req.destroy();
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body) as { seconds?: number; endedBy?: string };
            recordSse({
              at: new Date().toISOString(),
              source: "browser, through proxy",
              secondsOpen: Number(parsed.seconds ?? 0),
              endedBy: String(parsed.endedBy ?? "unknown"),
            });
          } catch {
            /* a malformed report is not worth failing over */
          }
          res.writeHead(204).end();
        });
        return;
      }

      if (url === "/sse-test" || url === "/sse/test") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(SSE_TEST_PAGE);
        return;
      }

      // The measurement itself. Headers exactly as the real stream will send them, then
      // nothing at all. No heartbeat: the silence is the experiment.
      const opened = Date.now();
      openStreams += 1;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(": probe stream open. nothing will be sent on it. the silence is the test.\n\n");
      res.socket?.setTimeout(0);
      res.socket?.setKeepAlive(false);

      // One observation per stream. Both "close" and "error" fire on an abort, and two
      // rows for one stream would double every count on the page.
      let recorded = false;
      const close = (endedBy: string): void => {
        if (recorded) return;
        recorded = true;
        openStreams = Math.max(0, openStreams - 1);
        // Deliberately NOT labelled "through proxy". From here there is no way to tell a
        // proxy timeout from a person closing a tab, and counting the second as the first
        // would put a confidently wrong number on the page. Only a client that was still
        // waiting when the connection died can answer this question.
        recordSse({
          at: new Date().toISOString(),
          source: "server side view",
          secondsOpen: (Date.now() - opened) / 1000,
          endedBy,
        });
      };
      req.on("close", () => {
        close("the far end went away. Could be the proxy, could be somebody closing a tab.");
      });
      req.on("error", (e: Error) => {
        close(`the connection errored: ${e.message}`);
      });
      return;
    }

    if (url === "/health") {
      const findings = runAllChecks();
      res
        .writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
        .end(JSON.stringify({ buildId: BUILD_ID, startedAt: STARTED_AT.toISOString(), findings }, null, 2));
      return;
    }

    // Everything else is the report. text/plain so it pastes cleanly out of a browser.
    res
      .writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" })
      .end(renderReport(runAllChecks()));
  });

  // Node's own request timeouts must not be what cuts the SSE measurement, or the probe
  // measures itself instead of the proxy.
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 0;
  server.timeout = 0;

  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`\nProbe listening on 0.0.0.0:${String(port)}\n`);
    process.stdout.write(renderReport(runAllChecks()));
    process.stdout.write("\nOpen the deployment URL to read this page in a browser. /sse-test measures the idle timeout.\n\n");
    void selfTestSse();
  });
}

/**
 * Measure the idle timeout without a human holding a browser tab open.
 *
 * Two streams: one through the public URL, which is the number that matters because it goes
 * through the proxy, and one straight to 127.0.0.1 as a control. If both are cut at the same
 * second the timeout is Node's, not the proxy's, and the heartbeat is not the fix.
 */
async function selfTestSse(): Promise<void> {
  const port = Number(process.env["PORT"] ?? 5000);
  const targets: { url: string; source: string }[] = [{ url: `http://127.0.0.1:${String(port)}/sse`, source: "self test, direct" }];
  const publicUrl = process.env["PROBE_PUBLIC_URL"];
  if (publicUrl && publicUrl.trim() !== "") {
    targets.push({ url: `${publicUrl.replace(/\/+$/, "")}/sse`, source: "self test, through proxy" });
  }

  for (const t of targets) {
    void (async () => {
      const started = Date.now();
      try {
        const res = await fetch(t.url, { headers: { accept: "text/event-stream" } });
        const reader = res.body?.getReader();
        if (!reader) return;
        const cap = setTimeout(() => {
          void reader.cancel();
        }, 15 * 60 * 1000);
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
        clearTimeout(cap);
        const seconds = (Date.now() - started) / 1000;
        recordSse({
          at: new Date().toISOString(),
          source: t.source,
          secondsOpen: seconds,
          endedBy: seconds >= 15 * 60 - 5 ? "still open" : "the stream ended on its own",
        });
      } catch (err) {
        recordSse({
          at: new Date().toISOString(),
          source: t.source,
          secondsOpen: (Date.now() - started) / 1000,
          endedBy: `the connection failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();
  }
}

// Only start the server when this file is the thing that was run. Importing it from a test
// must not open a port.
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) startServer();

export { renderReport, checkFilesystem, checkCliBinary, checkSecrets, checkShell, checkSse, checkTimezone, readElfInterpreter, hostLibc, wrap };
export type { Finding, Status };
