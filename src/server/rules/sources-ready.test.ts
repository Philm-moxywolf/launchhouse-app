/**
 * sources-ready.test.ts: the test that fails if a rule goes quiet again.
 *
 * WHY IT EXISTS. Every rule in this folder reads its list off disk. Twice a
 * check has stopped checking and nothing said so, and the second time is what
 * this file was written for: `BANNED=''` in the content repo read as a found
 * assignment, and the banned word rule then scanned every founder file against
 * a list of nothing.
 *
 * WHAT IT PROVES, and the third one is the one that keeps working next year.
 *
 *   1  On the content the app actually ships, every list loads. That is the
 *      positive control, and without it the rest of this file could be passing
 *      because the harness throws at everything.
 *   2  With any one list broken, the GATE REFUSES. Not a pass, not a partial
 *      answer, not a file saved unchecked. Each case doctors a real copy of the
 *      content the way a bad merge really would, then asserts the file that
 *      should have been held is not in `saved` because nothing was.
 *   3  A module in this folder cannot read from disk without being named in
 *      `RULES_SOURCES`. That one is mechanical, it reads the folder rather than
 *      a list somebody maintains, and it is the only one of the three that
 *      catches a read nobody has thought of yet.
 *
 * HOW THE DOCTORING WORKS. `GE_CONTENT_ROOT` points the resolver at a copy in a
 * temporary directory, which is what it is for. Every cache in the folder is
 * reset around each case, because all of them are keyed on nothing: they are
 * built once per process on the argument that committed files cannot change
 * while it runs, which is true in production and false in here.
 *
 * CALLED BY: node --test.
 * READS:     the vendored content, and copies of it it makes itself.
 * WRITES:    a temporary directory per case, removed afterwards.
 */

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { contentRoot, resetContentRootCacheForTests } from './content-root.ts';
import { resetGatesCacheForTests } from './gates-source.ts';
import { gateHarvest } from './harvest-gate.ts';
import { resetOwnershipCacheForTests } from './ownership.ts';
import {
  assertRulesSourcesReady,
  resetRulesSourcesReadyForTests,
  RULES_SOURCES,
} from './sources-ready.ts';
import { resetHouseStyleCacheForTests } from './validate-source.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = HERE;

const BRAIN = [
  '# Founder Brain',
  '',
  '- **Track:** b2b',
  '',
  '## Thesis',
  'We help operations leads at mid sized logistics firms cut their onboarding time.',
].join('\n');

/** A file the gate would ordinarily hold, so a pass is visible as a pass. */
const A_BANNED_WORD = '## Post 1\n\nThis will supercharge your pipeline.\n';

let temporary: string[] = [];

function resetEveryCache(): void {
  resetContentRootCacheForTests();
  resetHouseStyleCacheForTests();
  resetGatesCacheForTests();
  resetOwnershipCacheForTests();
  resetRulesSourcesReadyForTests();
}

afterEach(() => {
  delete process.env.GE_CONTENT_ROOT;
  resetEveryCache();
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
  temporary = [];
  // Leave the process on the real content. A later test file gets its own
  // process, but a later test in THIS one would otherwise inherit a removed
  // directory and fail for a reason that has nothing to do with what it checks.
  assertRulesSourcesReady();
});

/**
 * A copy of the shipped content, with one thing broken in it.
 *
 * A copy rather than a fixture, because a hand written fixture drifts from the
 * real thing and then the test is checking a shape the app never meets.
 */
function contentWith(damage: (root: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'lh-content-'));
  temporary.push(dir);
  cpSync(contentRoot(), dir, { recursive: true });
  damage(dir);
  process.env.GE_CONTENT_ROOT = dir;
  resetEveryCache();
  return dir;
}

function editValidateSh(root: string, edit: (text: string) => string): void {
  const path = join(root, 'scripts/validate.sh');
  writeFileSync(path, edit(readFileSync(path, 'utf8')), 'utf8');
}

/** What the gate does with one banned-word file on the current content. */
async function gateOn(text = A_BANNED_WORD): Promise<{ saved: string[]; threw: string | null }> {
  try {
    const report = await gateHarvest({
      founderId: '01J8ZQTMK4NRC7XVYB3D9GHF40',
      changes: [{ path: 'content-30.md', kind: 'new', bytes: Buffer.from(text, 'utf8') }],
      track: 'b2b',
      brain: BRAIN,
    });
    return { saved: [...report.saved], threw: null };
  } catch (err) {
    return { saved: [], threw: err instanceof Error ? err.message : String(err) };
  }
}

describe('the content the app ships', () => {
  it('LOADS EVERY LIST, which is what makes the rest of this file mean something', () => {
    // THE POSITIVE CONTROL. Every case below asserts a throw. If the harness
    // were broken so that everything threw, they would all pass and this folder
    // would be unprotected. This is the line that says the harness can say yes.
    assert.doesNotThrow(() => {
      assertRulesSourcesReady();
    });
  });

  it('names at least one source per rule that reads from disk', () => {
    assert.ok(RULES_SOURCES.length >= 4, 'a shrinking list is how this stops covering things');
    for (const source of RULES_SOURCES) {
      assert.ok(source.name.length > 0, 'a source with no name cannot be reported');
      assert.match(source.module, /\.ts$/);
      assert.ok(source.reads.length > 0, `${source.name} does not say what it reads`);
    }
  });

  it('THE UNDOCTORED COPY STILL WORKS, so a doctored one failing is the damage', async () => {
    // The second half of the control, and the important half. `contentWith`
    // copies a tree and sets an environment variable, and either of those could
    // silently do nothing. Copying it and breaking NOTHING must behave exactly
    // like the real content: the banned word is a note, and the file is saved.
    contentWith(() => undefined);
    const answer = await gateOn();
    assert.equal(answer.threw, null, answer.threw ?? '');
    assert.deepEqual(answer.saved, ['content-30.md']);
  });
});

describe('a list that will not load refuses the turn, and never passes it', () => {
  it('AN EMPTIED BANNED LIST IS REFUSED, not treated as nothing to complain about', async () => {
    // THE ONE THAT HAPPENED. `BANNED=''` is what a bad merge leaves behind, and
    // it used to read as a found assignment. Before this was closed, the empty
    // pattern matched a zero length string at every position and the process ran
    // out of memory on the first turn.
    contentWith((root) => {
      editValidateSh(root, (text) => text.replace(/^BANNED='[^']*'/m, "BANNED=''"));
    });
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'an empty banned word list was accepted as a pass');
    assert.match(answer.threw, /empty pattern for BANNED/);
    assert.deepEqual(answer.saved, [], 'a file was saved by a rule that checked nothing');
  });

  it('a pattern that matches everything is refused too', async () => {
    // The same bug wearing a hat. `(a|)` is not empty, so the emptiness check
    // above lets it past, and it still matches at every position of every file.
    contentWith((root) => {
      editValidateSh(root, (text) => text.replace(/^BANNED='[^']*'/m, "BANNED='supercharge|'"));
    });
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'a pattern that matches everywhere was accepted');
    assert.match(answer.threw, /matches the empty string/);
  });

  it('A RENAMED ASSIGNMENT IS REFUSED, so renaming in the content repo breaks loudly', async () => {
    contentWith((root) => {
      editValidateSh(root, (text) => text.replace(/^BANNED=/m, 'BANNED_WORDS='));
    });
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'a renamed list was treated as no list');
    assert.match(answer.threw, /could not find BANNED=/);
    assert.deepEqual(answer.saved, []);
  });

  it('a missing validate.sh is refused rather than read as a clean bill', async () => {
    contentWith((root) => {
      rmSync(join(root, 'scripts/validate.sh'));
    });
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'the house style checked nothing and said fine');
    assert.deepEqual(answer.saved, []);
  });

  it('AN EMPTIED GATES TABLE IS REFUSED, because that is rule 1 switched off', async () => {
    // Rule 1 reads gates.md to decide which track a file belongs to. An empty
    // table means no file belongs to either track, so nothing is ever the wrong
    // track's material and a b2b founder can be handed a b2c file.
    contentWith((root) => {
      const path = join(root, 'plugins/growth-engine/schemas/gates.md');
      writeFileSync(path, '# Gates\n\nNothing here any more.\n', 'utf8');
    });
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'rule 1 ran against a table with no rows');
    assert.deepEqual(answer.saved, []);
  });

  it('EMPTIED SCHEMAS ARE REFUSED, because that is rule 4 switched off', async () => {
    // Rule 4 reads the schemas to tell a real file from one nothing lists.
    contentWith((root) => {
      const dir = join(root, 'plugins/growth-engine/schemas');
      for (const entry of readdirSync(dir)) {
        if (entry.endsWith('.md')) writeFileSync(join(dir, entry), '# A schema\n', 'utf8');
      }
    });
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'rule 4 ran against a list of no files');
    assert.deepEqual(answer.saved, []);
  });

  it('A TURN THAT WROTE NOTHING IS REFUSED TOO, on a deployment that cannot check', async () => {
    // THE ONE THE EXPLICIT GUARD IS ACTUALLY FOR, and it was found by breaking
    // the guard and watching every test stay green.
    //
    // Every other case here would refuse without `assertRulesSourcesReady()`,
    // because the first rule to run reaches for its list and throws on its own.
    // This one would not. `gateHarvest` returns early when the turn wrote
    // nothing the model owns, and on that path no rule is ever called, so a
    // broken deployment answered with a clean report and the turn committed.
    //
    // It matters because that is the FIRST turn a founder takes: setup writes
    // nothing, `ge` writes its own files, and a deployment that cannot check
    // anything would have looked healthy right up until the first content plan.
    contentWith((root) => {
      editValidateSh(root, (text) => text.replace(/^BANNED='[^']*'/m, "BANNED=''"));
    });

    await assert.rejects(
      () =>
        gateHarvest({
          founderId: '01J8ZQTMK4NRC7XVYB3D9GHF40',
          changes: [],
          track: 'b2b',
          brain: BRAIN,
        }),
      /empty pattern for BANNED/,
      'a turn that wrote nothing was answered by a gate that cannot read its lists',
    );
  });

  it('a turn of only ge\'s own files is refused too, for the same reason', async () => {
    // The same early return, reached the other way. ledger.md is `ge`'s file, so
    // no rule reads it, so nothing would have thrown.
    contentWith((root) => {
      editValidateSh(root, (text) => text.replace(/^BANNED='[^']*'/m, "BANNED=''"));
    });

    await assert.rejects(
      () =>
        gateHarvest({
          founderId: '01J8ZQTMK4NRC7XVYB3D9GHF40',
          changes: [{ path: 'ledger.md', kind: 'new', bytes: Buffer.from('| id |\n| 1 |\n', 'utf8') }],
          track: 'b2b',
          brain: BRAIN,
        }),
      /empty pattern for BANNED/,
    );
  });

  it('A CONTENT ROOT THAT IS NOT THERE IS REFUSED, and never falls back quietly', async () => {
    // Found by this test rather than reasoned about. GE_CONTENT_ROOT used to be
    // one candidate in a list, so pointing it at a tree that is not the content
    // repo fell through to the vendored copy and everything carried on. The
    // person who set it was then checking founder artifacts against prose they
    // had not chosen, and nothing anywhere said so.
    const missing = join(tmpdir(), 'lh-content-that-is-not-there');
    process.env.GE_CONTENT_ROOT = missing;
    resetEveryCache();
    const answer = await gateOn();
    assert.ok(answer.threw !== null, 'a content root that is not there was read as nothing to check');
    assert.match(answer.threw, /GE_CONTENT_ROOT is set/);
    assert.ok(answer.threw.includes(missing), 'the error has to name the path, or nobody can fix it');
    assert.deepEqual(answer.saved, []);
  });
});

describe('a new read cannot be added quietly', () => {
  it('EVERY MODULE THAT READS FROM DISK IS NAMED IN RULES_SOURCES', () => {
    // THE ONE THAT KEEPS WORKING WITHOUT ANYBODY MAINTAINING IT. The three
    // cases above cover the reads that exist today. This one reads the folder,
    // so the read somebody adds next year is covered on the day they add it.
    //
    // The exemption below carries its reason, because an exemption without one
    // is how a list like this stops meaning anything.
    const EXEMPT: ReadonlyArray<{ module: string; why: string }> = [
      {
        module: 'no-dm-automation.ts',
        why: 'its filesystem read is scanSourceTree, which greps this repository at test time and is not on the path of a founder turn. The list it checks a founder artifact against comes from validate-source.ts, which is covered.',
      },
    ];

    const named = new Set(RULES_SOURCES.map((s) => s.module));
    const exempt = new Set(EXEMPT.map((e) => e.module));
    const uncovered: string[] = [];

    for (const entry of readdirSync(RULES_DIR)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      const text = readFileSync(join(RULES_DIR, entry), 'utf8');
      if (!/from 'node:fs'/.test(text)) continue;
      if (named.has(entry) || exempt.has(entry)) continue;
      uncovered.push(entry);
    }

    assert.deepEqual(
      uncovered,
      [],
      'these modules read from disk and nothing forces that read to succeed. Add them to RULES_SOURCES in sources-ready.ts, or exempt them here with the reason.',
    );
  });

  it('THIS CHECK CAN FAIL, so its passing means something', () => {
    // The negative control for the check above. If the folder scan stopped
    // finding files, or the filesystem test stopped matching, it would report an
    // empty list and pass for ever. This runs the same scan with the real list
    // of covered modules emptied, and requires it to find something.
    const found: string[] = [];
    for (const entry of readdirSync(RULES_DIR)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      if (/from 'node:fs'/.test(readFileSync(join(RULES_DIR, entry), 'utf8'))) found.push(entry);
    }
    assert.ok(found.length >= 3, `the scan found only ${String(found.length)} modules reading from disk`);
    assert.ok(found.includes('content-root.ts'), 'the scan no longer sees a module it must see');
  });
});
