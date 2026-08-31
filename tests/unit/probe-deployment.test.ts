/**
 * tests/unit/probe-deployment.test.ts
 *
 * WHAT THIS IS. Tests for scripts/probe-deployment.ts.
 *
 * WHY IT EXISTS. The probe answers the questions everything else rests on, and it gets one
 * chance in front of a non developer. A probe that crashes half way through leaves a page
 * with three answers on it and no way to tell that two are missing.
 *
 * The important test here is the ELF one. glibc against musl is read out of a binary's
 * program headers, and it is not something anybody can check by eye. A synthetic ELF file
 * with a known interpreter string proves the reader is right, on a Mac, where there is no
 * real Linux binary to test against.
 *
 * RUNNER. node:test, matching the rest of this repository.
 */
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkSecrets,
  checkShell,
  checkTimezone,
  hostLibc,
  readElfInterpreter,
  renderReport,
  wrap,
} from "../../scripts/probe-deployment.ts";

/**
 * Build a minimal but structurally real ELF64 file carrying one PT_INTERP segment.
 *
 * Layout: a 64 byte header, one 56 byte program header at offset 64, and the interpreter
 * string at offset 128. Those are the offsets the reader walks, so if the reader is wrong
 * about any of them this fails.
 */
function syntheticElf(interpreter: string): Buffer {
  const interpAt = 128;
  const interpBytes = Buffer.from(`${interpreter}\0`, "latin1");
  const buf = Buffer.alloc(interpAt + interpBytes.length);

  buf.write("\x7fELF", 0, "latin1");
  buf.writeUInt8(2, 4); // EI_CLASS: 64 bit
  buf.writeUInt8(1, 5); // EI_DATA: little endian
  buf.writeUInt8(1, 6); // EI_VERSION
  buf.writeBigUInt64LE(64n, 0x20); // e_phoff
  buf.writeUInt16LE(56, 0x36); // e_phentsize
  buf.writeUInt16LE(1, 0x38); // e_phnum

  const ph = 64;
  buf.writeUInt32LE(3, ph); // p_type = PT_INTERP
  buf.writeUInt32LE(4, ph + 4); // p_flags
  buf.writeBigUInt64LE(BigInt(interpAt), ph + 8); // p_offset
  buf.writeBigUInt64LE(BigInt(interpBytes.length), ph + 32); // p_filesz
  interpBytes.copy(buf, interpAt);
  return buf;
}

const elfDir = mkdtempSync(join(tmpdir(), "probe-elf-"));
after(() => {
  rmSync(elfDir, { recursive: true, force: true });
});

describe("reading the C library out of a binary", () => {
  test("reads the glibc interpreter out of a real ELF layout", () => {
    const p = join(elfDir, "glibc.bin");
    writeFileSync(p, syntheticElf("/lib64/ld-linux-x86-64.so.2"));
    const info = readElfInterpreter(p);
    assert.equal(info.isElf, true);
    assert.equal(info.interpreter, "/lib64/ld-linux-x86-64.so.2");
  });

  test("reads the musl interpreter, which is the whole point of the check", () => {
    // Both packages exist. Installing the wrong one fails at exec with an error naming a
    // file that plainly exists, and that error has cost people whole afternoons.
    const p = join(elfDir, "musl.bin");
    writeFileSync(p, syntheticElf("/lib/ld-musl-x86_64.so.1"));
    assert.equal(readElfInterpreter(p).interpreter, "/lib/ld-musl-x86_64.so.1");
  });

  test("says plainly when a file is a script rather than a binary", () => {
    const p = join(elfDir, "script.js");
    writeFileSync(p, "#!/usr/bin/env node\nconsole.log('hi')\n", "utf8");
    const info = readElfInterpreter(p);
    assert.equal(info.isElf, false);
    assert.match(info.note, /script/);
  });

  test("does not throw on a file that is not there", () => {
    const info = readElfInterpreter(join(elfDir, "absent"));
    assert.equal(info.isElf, false);
    assert.match(info.note, /could not be read/);
  });

  test("reports this machine's C library without guessing", () => {
    const libc = hostLibc();
    assert.ok(["glibc", "musl", "both", "unknown"].includes(libc.kind));
    // A Mac has neither loader, and saying "unknown" is the honest answer rather than
    // picking one.
    if (process.platform === "darwin") assert.equal(libc.kind, "unknown");
  });
});

describe("the shell probes actually run", () => {
  // Not a mock. The entire point of a probe is that it executed something.
  const finding = checkShell();

  test("resolves what /bin/sh is", () => {
    assert.match(finding.answer.join(" "), /\/bin\/sh resolves to/);
  });

  test("ran mktemp, readlink, date and sort for real and recorded each exit code", () => {
    const text = finding.evidence.join("\n");
    for (const tool of ["mktemp", "readlink -f", "date", "sort under LC_ALL=C"]) {
      assert.ok(text.includes(tool), `${tool} was not probed`);
    }
    assert.match(text, /exit \d/);
  });

  test("checks C collation on sort, because the person export depends on it", () => {
    assert.match(finding.evidence.join("\n"), /A B a b/);
  });
});

describe("the timezone and ICU check", () => {
  const finding = checkTimezone();

  test("answers, on any machine with full ICU", () => {
    assert.equal(finding.status, "ANSWERED");
    assert.match(finding.answer.join(" "), /Full ICU is present/);
  });

  test("proves the zone across the daylight saving change, not only today", () => {
    // A 90 day plan built on 27 September runs into December, past 1 November.
    const text = finding.evidence.join("\n");
    assert.match(text, /EDT/);
    assert.match(text, /EST/);
  });
});

describe("the secrets check never prints a value", () => {
  test("reports names only, and a fingerprint rather than the secret", () => {
    const finding = checkSecrets();
    const text = [...finding.answer, ...finding.evidence].join("\n");
    // Every value in the environment, checked against the whole rendered finding.
    for (const [name, value] of Object.entries(process.env)) {
      if (typeof value !== "string" || value.length < 8) continue;
      if (name === "PATH" || name === "npm_config_user_agent") continue;
      assert.ok(!text.includes(value), `the value of ${name} reached the page`);
    }
  });
});

describe("the page a non developer pastes back", () => {
  const page = renderReport([checkTimezone()]);

  test("wraps to something readable in a chat window", () => {
    // Long unbroken file paths are allowed through, because breaking a path makes it
    // uncopyable. Everything that CAN wrap must wrap.
    //
    // THE RULE USED TO BE "does this line contain a space", AND THAT MADE THE SUITE DEPEND
    // ON WHERE IT WAS CHECKED OUT. A line like `  Working folder  /very/long/path` has
    // spaces, so it was asserted, and it failed on any machine whose working folder path was
    // long. That is the test measuring the machine rather than the code. On Replit the path
    // is short and it passed; in a deep scratch directory it did not, and neither outcome
    // said anything about whether the report wraps.
    //
    // So the question is now the honest one: could this line have been wrapped at all? A
    // line carrying a single token too long to fit could not, whatever the wrapper did.
    for (const line of page.split("\n")) {
      if (line.length <= 92) continue;
      const longest = Math.max(0, ...line.trim().split(/\s+/).map((t) => t.length));
      const indent = line.length - line.trimStart().length;
      assert.ok(
        indent + longest > 92,
        `too long and it could have wrapped, longest token is ${String(longest)}: ${line}`,
      );
    }
  });

  test("leads with the short version, so the answer is not buried", () => {
    assert.ok(page.indexOf("THE SHORT VERSION") < page.indexOf("QUESTION"));
  });

  test("tells the reader what to do next", () => {
    assert.match(page, /WHAT TO DO NEXT/);
    assert.match(page, /Copy this whole page/);
  });

  test("says out loud that it holds nothing sensitive", () => {
    assert.match(page, /no founder data/);
  });
});

describe("wrap", () => {
  test("keeps every line inside the width, including the indent", () => {
    const lines = wrap("one two three four five six seven eight nine ten eleven twelve", 20, "    ");
    for (const l of lines) assert.ok(l.length <= 24, `too long: ${l}`);
    assert.equal(lines.join(" ").replace(/\s+/g, " ").trim(), "one two three four five six seven eight nine ten eleven twelve");
  });
});
