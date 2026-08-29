/**
 * src/server/ge/no-shell.test.ts
 *
 * WHAT THIS IS. A grep over the server tree, as a test.
 *
 * WHY IT EXISTS. The build doc says this exactly: shell: true is never set, anywhere,
 * and the boundary is one line, so guard it with a lint rule rather than a comment. A
 * comment saying "never set shell" is invisible to the person who adds a second spawn
 * six weeks from now under time pressure. A failing test is not.
 *
 * It also holds the other half of the same boundary: exec and execSync take a command
 * STRING, so they are a shell by another name. There is no legitimate use of either in
 * this codebase, and an argv array is never less convenient than a string here because
 * every argv is built by a named function in ge/verbs.ts.
 *
 * WHAT IT CALLS. The filesystem. It reads src/server and nothing else.
 *
 * NOTE THE DISTINCTION IT PROTECTS. The model's tool surface has no shell: Bash is in
 * disallowedTools. The SERVER spawns ge as a child process with an argv array it built.
 * Those are different things and both have to hold. This test is about the second.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SERVER_ROOT = new URL('../', import.meta.url).pathname;

/**
 * Patterns that would put a shell back. Each names why it is here, because a banned
 * list without reasons gets an exception added to it.
 */
const BANNED: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /shell\s*:\s*true/, why: 'shell: true hands the argv to a shell to re parse' },
  { pattern: /\bexecSync\s*\(/, why: 'execSync takes a command string, which is a shell' },
  { pattern: /\bexecFileSync\s*\(/, why: 'a synchronous spawn blocks the one process serving 130 people' },
  { pattern: /\bchild_process['"]\s*\)\s*\.\s*exec\b/, why: 'exec takes a command string' },
  { pattern: /^\s*import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*'node:child_process'/m, why: 'exec takes a command string' },
  { pattern: /\bspawnSync\s*\(/, why: 'a synchronous spawn blocks the one process serving 130 people' },
];

/**
 * Comments are stripped before matching.
 *
 * Not a nicety: several files in this tree explain in prose why shell: true is never
 * set, and a check that fired on the explanation would train everybody to delete the
 * explanation. The check is about code.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function everyServerFile(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      await everyServerFile(abs, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(abs);
    }
  }
  return out;
}

describe('no shell anywhere in the server', () => {
  it('finds files to check, so a passing run is not an empty run', async () => {
    const files = await everyServerFile(SERVER_ROOT);
    assert.ok(files.length > 5, `only ${files.length} server files were found, so this check is scanning nothing`);
  });

  it('has no shell: true, no exec, no execSync and no synchronous spawn', async () => {
    const files = await everyServerFile(SERVER_ROOT);
    const hits: string[] = [];
    for (const file of files) {
      if (file.endsWith('no-shell.test.ts')) continue;
      const source = codeOnly(await readFile(file, 'utf8'));
      for (const { pattern, why } of BANNED) {
        if (pattern.test(source)) {
          hits.push(`${relative(SERVER_ROOT, file)}: ${why}`);
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  it('reaches child_process from exactly one file, so there is one boundary and not several', async () => {
    // The count, not the absence, is the assertion. Two files that both spawn are two
    // places the environment has to be got right, and the second one is always the one
    // that inherits process.env by accident.
    const files = await everyServerFile(SERVER_ROOT);
    const importers: string[] = [];
    for (const file of files) {
      if (file.endsWith('.test.ts')) continue;
      const source = codeOnly(await readFile(file, 'utf8'));
      if (/from\s*'node:child_process'|require\(\s*'node:child_process'\s*\)|from\s*'child_process'/.test(source)) {
        importers.push(relative(SERVER_ROOT, file));
      }
    }
    assert.deepEqual(importers, ['ge/run.ts']);
  });
});
