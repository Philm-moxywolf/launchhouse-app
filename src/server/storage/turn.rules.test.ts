/**
 * src/server/storage/turn.rules.test.ts
 *
 * WHAT THIS IS. The proof that an artifact carrying a banned word never reaches
 * ge_file. A real turn, a real folder, a real walk and a real hash, against a
 * database handle that throws on any write.
 *
 * WHY IT EXISTS. rules/index.ts states as fact that the gate sits between the model
 * writing a file and storage saving it, and that nothing reaches ge_file until it
 * has answered. Until the wiring landed, that sentence was false: runRules had no
 * caller outside its own folder. A sentence in a header is worth what the test
 * under it is worth, so this is that test.
 *
 * THE REFUSAL IS THE ASSERTION. The fake handle answers exactly the two SELECTs a
 * turn makes and throws a named sentence on any INSERT, UPDATE or DELETE. So there
 * are only two outcomes and they are both meaningful:
 *
 *   the gate refused    the test sees RulesRefused, and no write was attempted
 *   the gate let it by  the test sees "a write was attempted", and fails
 *
 * There is no third outcome where a violation is recorded and the file is saved
 * anyway, which is the thing the build document rules out in one line: a write that
 * cannot be proved must not be reported as done.
 *
 * WHY IT DOES NOT NEED POSTGRES. turn.db.test.ts covers the real ROLLBACK and skips
 * without a DATABASE_URL, which means it does not run on most machines most of the
 * time. The ordering guarantee this file is about does not need a database to check,
 * and a guarantee that is only checked when somebody remembers to start Postgres is
 * a guarantee that breaks on a Thursday.
 *
 * WHAT IT CALLS. storage/turn.ts, storage/harvest.ts, storage/materialise.ts,
 * storage/crypto.ts, rules/harvest-gate.ts, and the filesystem. No database, no ge
 * spawn, no model.
 */

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Db, Queryable } from '../db/client.ts';
import { founders, geEvent } from '../db/schema.ts';
import { RulesRefused } from '../rules/harvest-gate.ts';
import { createFounderKey } from './crypto.ts';
import { founderRoot, geHome } from './paths.ts';
import { runTurn } from './turn.ts';

const FOUNDER = '01J8ZQTMK4NRC7XVYB3D9GHF32';
const MASTER_KEY = Buffer.alloc(32, 3).toString('base64');

const CLEAN_BRAIN = [
  '# Founder Brain',
  '',
  '- **Track:** b2b',
  '- **Model:** service',
  '',
  '## Thesis',
  '',
  'We help operations leads at mid sized logistics firms cut their onboarding time.',
  '',
].join('\n');

/**
 * The sentence the fake throws when a turn reaches the founder's own content.
 *
 * ge_event is allowed through, and the difference is the point of the claim being
 * tested. ge_event is an audit row saying a turn happened. ge_file, ge_blob and
 * ge_file_version are the founder's work, and those are what a refused artifact
 * must never touch.
 */
const A_WRITE_WAS_ATTEMPTED =
  'a write was attempted: this turn reached ge_file, and the gate was supposed to have refused it first';

let workspace: string;
let saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  saved = {
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT,
    GE_MASTER_KEY: process.env.GE_MASTER_KEY,
    GE_MASTER_KEY_VERSION: process.env.GE_MASTER_KEY_VERSION,
  };
  workspace = await mkdtemp(join(tmpdir(), 'lh-turn-rules-'));
  process.env.WORKSPACE_ROOT = workspace;
  process.env.GE_MASTER_KEY = MASTER_KEY;
  delete process.env.GE_MASTER_KEY_VERSION;
  await mkdir(geHome(FOUNDER), { recursive: true });
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(workspace, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A handle that can answer the founder row and an empty ge_file, and nothing else.
 *
 * Two selects happen in a turn and they hit different tables, so `from` is what
 * tells them apart. Everything that writes throws, and that throw is the assertion
 * rather than a convenience.
 */
function refusingDb(): Db {
  const { wrapped } = createFounderKey(FOUNDER);
  const founderRow = {
    version: 1,
    wrappedKey: wrapped,
    timezone: 'America/New_York',
    track: 'b2b',
    disabledAt: null,
    deletedAt: null,
  };
  const refuse = (): never => {
    throw new Error(A_WRITE_WAS_ATTEMPTED);
  };
  const tx = {
    execute: async () => [],
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === founders ? [founderRow] : []),
      }),
    }),
    insert: (table: unknown) => {
      if (table !== geEvent) refuse();
      return { values: async () => [] };
    },
    update: refuse,
    delete: refuse,
  } as unknown as Queryable;

  return {
    transaction: async (fn: (t: Queryable) => Promise<unknown>) => fn(tx),
  } as unknown as Db;
}

describe('an artifact with a banned word never reaches ge_file', () => {
  it('REFUSES THE TURN, AND ATTEMPTS NO WRITE', async () => {
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          await writeFile(
            join(ctx.home, 'content-30.md'),
            '## Post 1\n\nThis will supercharge your pipeline.\n',
            'utf8',
          );
          return 'the model finished';
        }),
      (err: unknown) => {
        // If this is the sentence the fake throws, the gate let the file past and
        // the turn was already writing when it spoke.
        assert.ok(
          err instanceof RulesRefused,
          `expected the turn to be refused by the rules gate, got: ${String(err)}`,
        );
        assert.equal(err.code, 'rules_refused');
        assert.ok(err.paths.includes('content-30.md'));
        const banned = err.answer.blocked.find((v) => v.rule === 'prose');
        assert.ok(banned, 'the refusal should name the house style rule that caught it');
        assert.equal(banned.where.path, 'content-30.md');
        assert.equal(banned.where.line, 3);
        return true;
      },
    );
  });

  it('leaves nothing behind on disk, so the next turn cannot read the refused file', async () => {
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          await writeFile(join(ctx.home, 'content-30.md'), '## Post 1\n\nA seamless experience.\n', 'utf8');
          return null;
        }),
      RulesRefused,
    );
    assert.equal(await exists(founderRoot(FOUNDER)), false, 'the refused turn left its folder behind');
  });

  it('tells the founder something they can act on', async () => {
    // Not a rule name and not a stack trace. A sentence, then the reason, then a
    // button. Test case 21 in the content repo holds the whole toolkit to this.
    const err = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        await writeFile(join(ctx.home, 'content-30.md'), '## Post 1\n\nAn effortless win.\n', 'utf8');
        return null;
      },
    ).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof RulesRefused);
    assert.ok(err.message.length > 20, 'the founder gets a sentence, not a code');
    assert.doesNotMatch(err.message, /—|–/, 'the refusal itself follows the house style it enforces');
    for (const violation of err.answer.blocked) {
      assert.ok(violation.recovery.label.length > 0, 'every refusal ends on a way out');
      assert.ok(violation.why.length > 0);
    }
  });

  it('refuses an offer to automate DMs, which is rule 2 on what the model wrote', async () => {
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          await writeFile(
            join(ctx.home, 'ops-workflow.md'),
            '# Ops\n\nWe can automate DMs for you overnight.\n',
            'utf8',
          );
          return null;
        }),
      (err: unknown) => {
        assert.ok(err instanceof RulesRefused, String(err));
        assert.ok(err.answer.blocked.some((v) => v.rule === 'no-dm-automation'));
        return true;
      },
    );
  });

  it('refuses the other track\'s file, which is rule 1 held at the write', async () => {
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          // hook-bank.md belongs to B2C. The founder row above says b2b.
          await writeFile(join(ctx.home, 'hook-bank.md'), '# Hooks\n\nTen openers for your feed.\n', 'utf8');
          return null;
        }),
      (err: unknown) => {
        assert.ok(err instanceof RulesRefused, String(err));
        assert.ok(err.answer.blocked.some((v) => v.code === 'track.wrong-track-file'));
        return true;
      },
    );
  });
});

describe('the gate is not in the way of ordinary work', () => {
  it('LETS CLEAN WORK THROUGH, and the write is the next thing that happens', async () => {
    // The mirror image of the test above, and it is what stops the gate from being
    // proved by a version of itself that refuses everything. Reaching the fake's
    // refusal is the pass condition here: it means applyHarvest was called.
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          await writeFile(
            join(ctx.home, 'content-30.md'),
            '## Post 1\n\nWhat we learned from the last three onboardings.\n',
            'utf8',
          );
          return null;
        }),
      new RegExp(A_WRITE_WAS_ATTEMPTED),
    );
  });

  it('does not hold ge\'s own files to the model\'s rules', async () => {
    // ledger.md carries a banned word on purpose. ge wrote it, and a second parser
    // of ge's own formats costs a founder a whole turn the day the two disagree.
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'ge', verb: 'ledger approve', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'ledger.md'), '| id | note |\n| 1 | seamless |\n', 'utf8');
          return null;
        }),
      new RegExp(A_WRITE_WAS_ATTEMPTED),
    );
  });

  it('checks nothing and writes nothing when the turn wrote nothing', async () => {
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'system', verb: 'read', db: refusingDb() },
      async () => 'nothing to do',
    );
    assert.equal(outcome.value, 'nothing to do');
    assert.deepEqual(outcome.plan.changes, []);
    assert.equal(outcome.gate.answer, null, 'an empty check is not a pass, and it does not claim to be one');
    assert.deepEqual(outcome.gate.checked, []);
  });
});
