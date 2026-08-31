/**
 * src/server/storage/turn.rules.test.ts
 *
 * WHAT THIS IS. The proof that a file which failed a rule never reaches ge_file,
 * AND that the files written beside it do. A real turn, a real folder, a real walk
 * and a real hash, against two fake database handles.
 *
 * WHY IT EXISTS. rules/index.ts states as fact that the gate sits between the model
 * writing a file and storage saving it, and that nothing reaches ge_file until it
 * has answered. Until the wiring landed, that sentence was false: runRules had no
 * caller outside its own folder. A sentence in a header is worth what the test
 * under it is worth, so this is that test.
 *
 * TWO HANDLES, BECAUSE THERE ARE NOW TWO CLAIMS.
 *
 *   refusingDb   answers the SELECTs a turn makes and throws a named sentence on
 *                any write to the founder's content. Used where the claim is "this
 *                never reached ge_file": reaching the throw IS the failure, and
 *                seeing RulesRefused instead is the pass.
 *   recordingDb  answers the same SELECTs and writes nowhere, keeping the list of
 *                paths applyHarvest tried to store. Used where the claim is "these
 *                two saved and that one did not", which a handle that throws on the
 *                first write cannot tell you.
 *
 * THE HOLD IS THE PART TO READ. A blocking violation used to cost the whole turn:
 * one banned word in one file rolled back a growth plan, an outreach sequence and a
 * prospect CSV, and removed the folder. These rules are vocabulary lists and they
 * are wrong about ordinary sentences, so that trade was the wrong way round. Now the
 * file is held and the turn commits, and the tests below hold both halves of it:
 * the held file is not in the write list, and the other two are.
 *
 * THERE ARE THREE VOLUMES NOW, NOT TWO, and this file tests all three, because a
 * turn is the only place the difference between them is visible to a founder.
 *
 *   refuse the turn   rule 2 only. Nothing is saved and the folder is removed.
 *   hold the file     the file does not reach ge_file, its neighbours do, and the
 *                     folder is left unstamped so the held bytes cannot be read.
 *   note the file     the file IS saved, with a line beside it. Nothing is taken.
 *
 * `rules/confidence.ts` decides which volume each finding gets, and it can only
 * ever quieten. That is why a banned word, which used to hold a file, now has a
 * test here proving the file arrives. A finding moving between these three is a
 * policy change, and it should break a test in this file rather than surprise
 * somebody in a staffed room.
 *
 * WHAT STILL COSTS THE WHOLE TURN, and is tested here as carefully as the hold: an
 * offer to automate cold DMs, and nothing else. That rule was measured against
 * twelve sentences about DMs and fired only on the three that were real offers. The
 * argument, and the measurement that kept rule 5 off the list, are in
 * rules/harvest-gate.ts.
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
import { founders, geBlob, geEvent, geFile } from '../db/schema.ts';
import { resetContentRootCacheForTests } from '../rules/content-root.ts';
import { resetGatesCacheForTests } from '../rules/gates-source.ts';
import { RulesRefused } from '../rules/harvest-gate.ts';
import { resetOwnershipCacheForTests } from '../rules/ownership.ts';
import { assertRulesSourcesReady, resetRulesSourcesReadyForTests } from '../rules/sources-ready.ts';
import { resetHouseStyleCacheForTests } from '../rules/validate-source.ts';
import { createFounderKey } from './crypto.ts';
import { readEpoch } from './materialise.ts';
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

/**
 * A builder that answers whatever it is chained with, and resolves to `rows`.
 *
 * Drizzle's insert and update read as `.values().onConflictDoNothing().returning()`
 * and the exact chain differs per call site. Answering every link with the same
 * thenable keeps this fake about the one thing it is for, which is which paths were
 * written, rather than about mirroring an ORM.
 */
function chain(rows: unknown[]): Record<string, unknown> {
  const node: Record<string, unknown> = {
    then: (ok?: ((value: unknown[]) => unknown) | null, no?: ((err: unknown) => unknown) | null) =>
      Promise.resolve(rows).then(ok ?? undefined, no ?? undefined),
  };
  for (const link of ['values', 'set', 'where', 'onConflictDoNothing', 'onConflictDoUpdate', 'returning']) {
    node[link] = (): Record<string, unknown> => node;
  }
  return node;
}

/**
 * A handle that lets a turn commit and remembers which ge_file rows it wrote.
 *
 * The list it returns is the assertion for every hold test: a held path in it means
 * the founder's folder now holds a file that failed a rule, and a missing clean path
 * means the hold took a neighbour down with it.
 */
function recordingDb(): { db: Db; written: string[] } {
  const { wrapped } = createFounderKey(FOUNDER);
  const founderRow = {
    version: 1,
    wrappedKey: wrapped,
    timezone: 'America/New_York',
    track: 'b2b',
    disabledAt: null,
    deletedAt: null,
  };
  const written: string[] = [];

  const tx = {
    execute: async () => [],
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === founders ? [founderRow] : []),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        if (table === geFile) written.push(String(row['path']));
        // putBlob reads `.returning()` for its inserted flag, and nothing else
        // downstream reads a row back from an insert.
        return chain(table === geBlob ? [{ sha: row['sha'] }] : []);
      },
    }),
    // One row back, which is what the version check in T2 requires to continue.
    update: () => chain([{ version: 2 }]),
    delete: () => chain([]),
  } as unknown as Queryable;

  return {
    db: { transaction: async (fn: (t: Queryable) => Promise<unknown>) => fn(tx) } as unknown as Db,
    written,
  };
}

describe('a file that fails a rule is held, and its neighbours are saved', () => {
  it('THE OTHER TWO FILES REACH ge_file AND THE HELD ONE DOES NOT', async () => {
    // The Sunday turn, in miniature: a plan, a sequence and thirty posts. One
    // sentence in the posts states a customer count nobody gave it. The old
    // behaviour deleted all three and removed the folder.
    //
    // THE SENTENCE USED TO BE A BANNED MARKETING WORD, and it is worth saying why
    // it is not any more, because the change reads like the test going soft.
    // `rules/confidence.ts` asks two questions of every finding: am I sure, and is
    // the harm real. For a banned word the second answer is no. It is flat copy,
    // not a false claim, and the founder can change a word. Holding a thirty post
    // plan over "supercharge" is the gate serving itself. A customer count nobody
    // gave is the other answer: a buyer asks where it came from, and in a small
    // industry somebody always does. So the property is proved on a sentence the
    // app really does hold, and the banned word gets its own test below.
    const { db, written } = recordingDb();
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        await writeFile(
          join(ctx.home, '90-day-plan.md'),
          '# The plan\n\nWeek one: write the plan and book the calls.\n',
          'utf8',
        );
        await writeFile(
          join(ctx.home, 'outreach-sequence.md'),
          '# Sequence\n\nStep one: one short note about their onboarding.\n',
          'utf8',
        );
        await writeFile(
          join(ctx.home, 'content-30.md'),
          '## Post 1\n\nWe have 214 customers on the platform today.\n',
          'utf8',
        );
        return 'the model finished';
      },
    );

    assert.deepEqual(
      [...written].sort(),
      ['90-day-plan.md', 'founder-brain.md', 'outreach-sequence.md'],
      'the clean files were saved and the held one was not',
    );
    assert.deepEqual(outcome.gate.held.map((h) => h.path), ['content-30.md']);
    assert.deepEqual(
      outcome.plan.changes.map((c) => c.path).sort(),
      ['90-day-plan.md', 'founder-brain.md', 'outreach-sequence.md'],
      'the outcome describes what was committed, not what was attempted',
    );
    assert.equal(outcome.value, 'the model finished');
    assert.equal(outcome.versionAfter, 2, 'the turn committed');
  });

  it('TELLS THE FOUNDER WHAT THEY GOT, WHAT WAS HELD, WHICH LINE, AND WHAT TO DO', async () => {
    const { db } = recordingDb();
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        await writeFile(join(ctx.home, '90-day-plan.md'), '# The plan\n\nWeek one: write it.\n', 'utf8');
        await writeFile(
          join(ctx.home, 'content-30.md'),
          '## Post 1\n\nWe have 214 customers on the platform today.\n',
          'utf8',
        );
        return null;
      },
    );

    // The founder reads this off gate.notes, which is what routes/run-turn.ts
    // already puts on the screen beside the work.
    //
    // THE WORDING MOVED AND THIS TEST MOVED WITH IT. It used to look for "held
    // back and not saved", and `explainHold` deliberately stopped saying that:
    // it is the app describing its own machinery, in the passive, to somebody who
    // asked for a content plan. What a founder needs is the state of their folder.
    // So the four things are still checked, by what they mean rather than by a
    // phrase, and the phrase is free to improve.
    const first = outcome.gate.notes[0];
    assert.ok(first, 'a held file has to say something, or the founder asks a mentor');
    assert.match(first.message, /90-day-plan\.md/, 'what they got');
    assert.match(first.message, /not there yet: content-30\.md/, 'what was held');
    assert.match(first.message, /line 3/, 'which line');
    assert.match(first.message, /We have 214 customers on the platform today\./, 'the sentence itself');
    assert.match(first.message, /ask for content-30\.md again\./, 'what to do now');
    assert.doesNotMatch(first.message, /prose\.|proof\.|track\.|ownership\.|dm\./, 'never a rule code');
    assert.doesNotMatch(first.message, /[\u2014\u2013]/, 'the founder-facing line follows the house style');
  });

  it('LEAVES THE FOLDER UNSTAMPED, so the held bytes cannot be read by the next turn', async () => {
    // The held file is still on disk holding the words that failed. Writing the
    // epoch would tell the next turn the folder matches the record, and the model
    // would then read a file the founder was told was not saved.
    const { db } = recordingDb();
    await runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db }, async (ctx) => {
      await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
      await writeFile(
        join(ctx.home, 'content-30.md'),
        '## Post 1\n\nWe have 214 customers on the platform today.\n',
        'utf8',
      );
      return null;
    });
    assert.equal(await readEpoch(FOUNDER), null, 'a turn that held a file must not stamp the folder');
    assert.equal(await exists(founderRoot(FOUNDER)), true, 'a hold is not a rollback');
  });

  it('a clean turn still stamps the folder, so the hold is what changed and not the epoch', async () => {
    const { db } = recordingDb();
    await runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db }, async (ctx) => {
      await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
      return null;
    });
    assert.equal(await readEpoch(FOUNDER), 2);
  });

  it('A BANNED WORD IS A NOTE: the file is saved, and the folder is stamped', async () => {
    // THE OTHER HALF OF THE LINE, and the reason the three tests above no longer
    // use a banned word. `rules/confidence.ts` files `prose.banned-word` under
    // `note`: the gate is sure it found it and the harm to the founder is nothing,
    // because it is flat copy rather than a false claim.
    //
    // This is pinned here, at the turn, rather than only in the rules folder,
    // because the thing that would go wrong is not a severity. It is a file
    // quietly not reaching ge_file. A founder who asked for thirty posts and got
    // twenty nine has no way to tell a hold from a bug, so the saved list is the
    // assertion.
    const { db, written } = recordingDb();
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        await writeFile(
          join(ctx.home, 'content-30.md'),
          '## Post 1\n\nThis will supercharge your pipeline.\n',
          'utf8',
        );
        return null;
      },
    );

    assert.deepEqual(outcome.gate.held, [], 'a banned word must not take the file away');
    assert.deepEqual([...written].sort(), ['content-30.md', 'founder-brain.md']);
    assert.equal(await readEpoch(FOUNDER), 2, 'nothing was held, so the folder is stamped');
    // Not silent either. The founder is told, beside the work rather than
    // instead of it, and the word is named so they can change it.
    const said = outcome.gate.notes.find((n) => n.code === 'prose.banned-word');
    assert.ok(said !== undefined, 'a note the founder never reads is the same as no rule');
    assert.match(said.message, /supercharge/);
  });

  it('DOES NOT MOVE THE TRACK CACHE FROM A BRAIN IT HELD', async () => {
    // founder.track is a cache of the Track line in the file. If a held Brain could
    // still move it, rule 1 would be anchored to a file nobody has.
    const { db, written } = recordingDb();
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db },
      async (ctx) => {
        await writeFile(
          join(ctx.home, 'founder-brain.md'),
          CLEAN_BRAIN.replace('- **Track:** b2b', '- **Track:** b2c'),
          'utf8',
        );
        return null;
      },
    );
    assert.deepEqual(outcome.gate.held.map((h) => h.path), ['founder-brain.md']);
    assert.deepEqual(written, [], 'a held Brain is not stored');
    assert.equal(outcome.trackAfter, 'b2b', 'the cache still describes the Brain that is stored');
  });

  it('A CUSTOMER COUNT NOBODY GAVE IT NEVER REACHES ge_file', async () => {
    // Rule 5 at its strongest reading, against a handle that would have accepted
    // the write. The number is not stored, which is the thing rule 5 is for, and
    // the plan written beside it is. The measurement behind holding rather than
    // refusing is in the note under WORTH_THE_WHOLE_TURN.
    const { db, written } = recordingDb();
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        await writeFile(join(ctx.home, '90-day-plan.md'), '# The plan\n\nWeek one: write it.\n', 'utf8');
        await writeFile(
          join(ctx.home, 'content-30.md'),
          '## Post 1\n\nWe have 214 customers on the platform today.\n',
          'utf8',
        );
        return null;
      },
    );
    assert.ok(!written.includes('content-30.md'), 'the invented count reached ge_file');
    assert.deepEqual([...written].sort(), ['90-day-plan.md', 'founder-brain.md']);
    assert.ok(outcome.gate.held[0]?.violations.some((v) => v.code === 'proof.invented-result'));
  });

  it('holds the other track\'s file, which is rule 1 held at the write', async () => {
    // Holding is the whole of rule 1's job here. A file that is never stored is a
    // file the founder is never shown, and the clean work beside it survives.
    const { db, written } = recordingDb();
    const outcome = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        // hook-bank.md belongs to B2C. The founder row above says b2b.
        await writeFile(join(ctx.home, 'hook-bank.md'), '# Hooks\n\nTen openers for your feed.\n', 'utf8');
        return null;
      },
    );
    assert.deepEqual(outcome.gate.held.map((h) => h.path), ['hook-bank.md']);
    assert.ok(outcome.gate.held[0]?.violations.some((v) => v.code === 'track.wrong-track-file'));
    assert.deepEqual(written, ['founder-brain.md']);
  });
});

describe('what still costs the whole turn', () => {
  it('REFUSES AN OFFER TO AUTOMATE DMs, AND ATTEMPTS NO WRITE', async () => {
    // Rule 2. If the fake's sentence comes back instead, the gate let the file past
    // and the turn was already writing when it spoke.
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          await writeFile(join(ctx.home, '90-day-plan.md'), '# The plan\n\nWeek one: write it.\n', 'utf8');
          await writeFile(
            join(ctx.home, 'ops-workflow.md'),
            '# Ops\n\nWe can automate DMs for you overnight.\n',
            'utf8',
          );
          return null;
        }),
      (err: unknown) => {
        assert.ok(
          err instanceof RulesRefused,
          `expected the turn to be refused by the rules gate, got: ${String(err)}`,
        );
        assert.equal(err.code, 'rules_refused');
        assert.ok(err.answer.blocked.some((v) => v.code === 'dm.offered'));
        return true;
      },
    );
  });

  it('THE ROLLBACK STILL WORKS: nothing is left on disk for the next turn to read', async () => {
    const { db, written } = recordingDb();
    await assert.rejects(
      () =>
        runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db }, async (ctx) => {
          await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
          await writeFile(join(ctx.home, '90-day-plan.md'), '# The plan\n\nWeek one: write it.\n', 'utf8');
          await writeFile(
            join(ctx.home, 'ops-workflow.md'),
            '# Ops\n\nWe can automate DMs for you overnight.\n',
            'utf8',
          );
          return null;
        }),
      RulesRefused,
    );
    // A handle that would have accepted every write, so an empty list is the gate's
    // doing rather than the fake's.
    assert.deepEqual(written, [], 'a refused turn writes nothing, not even the clean files');
    assert.equal(await exists(founderRoot(FOUNDER)), false, 'the refused turn left its folder behind');
  });

  it('RULES THAT CANNOT LOAD REFUSE THE TURN, and nothing reaches ge_file', async () => {
    // THE THIRD VOLUME, AND THE ONE THAT IS NOT A RULE. Every rule in this
    // folder reads its list off disk. A list that will not load is a rule that
    // cannot answer, and asking it anyway gets a pass nobody earned.
    //
    // The unit tests for this are in rules/sources-ready.test.ts, on doctored
    // copies of the content. This is the end of that argument rather than a
    // repeat of it: a real turn, a handle that would have accepted every write,
    // and the two things a founder can actually check afterwards. Nothing was
    // written, and the folder is gone rather than left half built.
    const { db, written } = recordingDb();
    process.env.GE_CONTENT_ROOT = join(workspace, 'content-that-is-not-there');
    resetContentRootCacheForTests();
    resetHouseStyleCacheForTests();
    resetGatesCacheForTests();
    resetOwnershipCacheForTests();
    resetRulesSourcesReadyForTests();

    try {
      await assert.rejects(
        () =>
          runTurn({ founderId: FOUNDER, actor: 'model', verb: 'agent-run', db }, async (ctx) => {
            await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
            await writeFile(join(ctx.home, '90-day-plan.md'), '# The plan\n\nWeek one: write it.\n', 'utf8');
            return null;
          }),
        /GE_CONTENT_ROOT is set/,
      );
      assert.deepEqual(written, [], 'a turn whose rules could not load still wrote to ge_file');
      assert.equal(await exists(founderRoot(FOUNDER)), false, 'the refused turn left its folder behind');
    } finally {
      // Back on the real content before the next test, and proved rather than
      // assumed: a stale override here would fail every case after this one for
      // a reason that has nothing to do with what it checks.
      delete process.env.GE_CONTENT_ROOT;
      resetContentRootCacheForTests();
      resetHouseStyleCacheForTests();
      resetGatesCacheForTests();
      resetOwnershipCacheForTests();
      resetRulesSourcesReadyForTests();
      assertRulesSourcesReady();
    }
  });

  it('tells the founder nothing was saved, and gives them something to act on', async () => {
    // Not a rule name and not a stack trace. What happened, then the reason, then a
    // way out. Test case 21 in the content repo holds the whole toolkit to this.
    const err = await runTurn(
      { founderId: FOUNDER, actor: 'model', verb: 'agent-run', db: refusingDb() },
      async (ctx) => {
        await writeFile(join(ctx.home, 'founder-brain.md'), CLEAN_BRAIN, 'utf8');
        await writeFile(
          join(ctx.home, 'ops-workflow.md'),
          '# Ops\n\nWe can automate DMs for you overnight.\n',
          'utf8',
        );
        return null;
      },
    ).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(err instanceof RulesRefused);
    assert.match(err.message, /Nothing from that request was saved\./);
    assert.doesNotMatch(err.message, /—|–/, 'the refusal itself follows the house style it enforces');
    for (const violation of err.answer.blocked) {
      assert.ok(violation.recovery.label.length > 0, 'every refusal ends on a way out');
      assert.ok(violation.why.length > 0);
    }
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
