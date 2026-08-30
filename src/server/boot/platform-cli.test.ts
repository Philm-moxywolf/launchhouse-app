/**
 * src/server/boot/platform-cli.test.ts
 *
 * WHAT THIS IS. Tests for src/server/boot/platform-cli.ts.
 *
 * WHY IT EXISTS. The thing being tested is a guard, and a guard that has only ever been
 * watched passing is a guard nobody has tested. On a working machine this check returns ok
 * every time, which is exactly what it did in the version that shipped with the check
 * missing altogether. So the tests below drive the failure branches on purpose, by handing
 * the function a resolver that cannot find things, and assert it REFUSES.
 *
 * The one test that proves it against the real machine runs it with the real resolver. That
 * one is a smoke test and it is deliberately the smallest test here, because a green
 * result from it is the least informative outcome this file can produce.
 *
 * WHAT IT READS. node_modules, through the real resolver, in one test. WHAT IT WRITES.
 * Nothing.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readElf, resolvePlatformCli, wantedPlatformPackage } from './platform-cli.ts';

const real = createRequire(import.meta.url).resolve;

/** A resolver that finds everything except the specifiers named. */
const resolverWithout = (...blocked: string[]) => {
  return (specifier: string): string => {
    if (blocked.some((b) => specifier.startsWith(b))) {
      throw new Error(`Cannot find module '${specifier}'`);
    }
    return real(specifier);
  };
};

describe('which package this machine needs', () => {
  test('names the Linux glibc and musl builds separately, because they are separate packages', () => {
    assert.equal(
      wantedPlatformPackage('linux', 'x64', 'glibc'),
      '@anthropic-ai/claude-agent-sdk-linux-x64',
    );
    assert.equal(
      wantedPlatformPackage('linux', 'x64', 'musl'),
      '@anthropic-ai/claude-agent-sdk-linux-x64-musl',
    );
    assert.equal(
      wantedPlatformPackage('linux', 'arm64', 'musl'),
      '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
    );
  });

  test('never puts a musl suffix on a platform that has no musl build', () => {
    // hostLibc only answers musl on Linux, but the suffix rule is asserted here as well, so
    // a change to either one cannot quietly invent @anthropic-ai/claude-agent-sdk-darwin-arm64-musl.
    assert.equal(
      wantedPlatformPackage('darwin', 'arm64', 'musl'),
      '@anthropic-ai/claude-agent-sdk-darwin-arm64',
    );
    assert.equal(
      wantedPlatformPackage('win32', 'x64', 'musl'),
      '@anthropic-ai/claude-agent-sdk-win32-x64',
    );
  });
});

describe('the guard can fail', () => {
  test('refuses when the SDK itself is not installed', async () => {
    const out = await resolvePlatformCli(resolverWithout('@anthropic-ai/claude-agent-sdk'));
    assert.equal(out.ok, false);
    assert.ok(out.ok === false && /not installed at all/.test(out.detail), out.ok === false ? out.detail : '');
  });

  /**
   * THE FAILURE THIS FILE WAS WRITTEN FOR. npm may skip an optional dependency and still
   * exit 0. Before the check existed, this state booted green and answered /healthz with
   * {"ok":true,"blockers":[]}.
   */
  test('refuses when the platform package was skipped by the install', async () => {
    // Block only the per platform packages, which all carry a suffix after the SDK name.
    const out = await resolvePlatformCli((specifier) => {
      if (/^@anthropic-ai\/claude-agent-sdk-/.test(specifier)) {
        throw new Error(`Cannot find module '${specifier}'`);
      }
      return real(specifier);
    });
    assert.equal(out.ok, false);
    if (out.ok === false) {
      assert.match(out.detail, /NOT INSTALLED/);
      // The line a mentor needs, in the log and not on the founder's screen.
      assert.match(out.detail, /npm ci --include=optional/);
    }
  });

  test('the founder sentence names no command, because a founder has no terminal', async () => {
    const out = await resolvePlatformCli(resolverWithout('@anthropic-ai/claude-agent-sdk'));
    assert.equal(out.ok, false);
    if (out.ok === false) {
      assert.ok(!/npm /.test(out.founderMessage), 'the founder message must not name a command');
      assert.match(out.founderMessage, /not with anything you did/);
      for (const dash of ['—', '–']) {
        assert.ok(!out.founderMessage.includes(dash), 'the founder message must not contain a dash');
      }
    }
  });
});

describe('reading a binary', () => {
  /**
   * The libc half of the failure, driven against real bytes rather than a mock. A musl
   * build and a glibc build differ in one string inside the file, and that string is what
   * this check reads. Anything not ELF, which is every macOS build, reports isElf false
   * rather than guessing.
   */
  test('reads the loader out of an ELF file and reports a non ELF file as such', () => {
    const elf = elfFixture('/lib/ld-musl-x86_64.so.1');
    const path = join(tmpdir(), `lh-elf-${String(process.pid)}.bin`);
    writeFileSync(path, elf);
    try {
      const facts = readElf(path);
      assert.equal(facts.isElf, true);
      assert.equal(facts.is64, true);
      assert.equal(facts.machine, 62, 'x86-64 is e_machine 62');
      assert.equal(facts.interpreter, '/lib/ld-musl-x86_64.so.1');
    } finally {
      rmSync(path, { force: true });
    }

    const notElf = join(tmpdir(), `lh-notelf-${String(process.pid)}.bin`);
    writeFileSync(notElf, '#!/bin/sh\necho hi\n');
    try {
      assert.equal(readElf(notElf).isElf, false);
    } finally {
      rmSync(notElf, { force: true });
    }
  });
});

describe('against this machine', () => {
  test('resolves the CLI and finds a binary this machine can execute', async () => {
    const out = await resolvePlatformCli();
    assert.equal(out.ok, true, out.ok === false ? out.detail : '');
    if (out.ok) {
      assert.match(out.path, /claude(\.exe)?$/);
      assert.ok(out.detail.length > 0);
    }
  });
});

/**
 * The smallest 64 bit ELF file that has a PT_INTERP entry in it.
 *
 * Built by hand rather than copied from somewhere, because the check under test reads exactly
 * these offsets and a fixture that came from a real binary would not say which bytes matter.
 */
function elfFixture(interpreter: string): Buffer {
  const PHOFF = 64;
  const PHENTSIZE = 56;
  const INTERP_AT = PHOFF + PHENTSIZE;
  const interp = Buffer.from(`${interpreter}\0`, 'latin1');

  const head = Buffer.alloc(64);
  head.write('\x7fELF', 0, 'latin1');
  head.writeUInt8(2, 4); // 64 bit
  head.writeUInt8(1, 5); // little endian
  head.writeUInt16LE(62, 0x12); // e_machine: x86-64
  head.writeBigUInt64LE(BigInt(PHOFF), 0x20); // e_phoff
  head.writeUInt16LE(PHENTSIZE, 0x36); // e_phentsize
  head.writeUInt16LE(1, 0x38); // e_phnum

  const ph = Buffer.alloc(PHENTSIZE);
  ph.writeUInt32LE(3, 0); // PT_INTERP
  ph.writeBigUInt64LE(BigInt(INTERP_AT), 8); // p_offset
  ph.writeBigUInt64LE(BigInt(interp.length), 32); // p_filesz

  return Buffer.concat([head, ph, interp]);
}
