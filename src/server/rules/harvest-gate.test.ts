/**
 * src/server/rules/harvest-gate.test.ts
 *
 * WHAT THIS IS. The gate's own policy, under test, with no database and no
 * filesystem: which paths it reads, which it does not, what it does with a
 * blocking violation, and what it does when it was handed nothing to read.
 *
 * WHY IT EXISTS. The end to end proof lives in storage/turn.rules.test.ts, which
 * runs a real turn and asserts a banned word never reaches ge_file. That test is
 * the one that matters and it is slow to reason about. This one holds the decisions
 * that test depends on, as a pure function over one object, so that every branch
 * including the refusal has a case that runs in milliseconds:
 *
 *   1. A banned word in something the model wrote throws, rather than returning a
 *      flag a caller can forget to read.
 *   2. The not gated list is exactly the five entries the header argues for. Every
 *      one of them is a hole by construction, so it is pinned rather than trusted.
 *   3. A turn that only touched ge's own files answers null, and null is not a pass.
 *   4. A file the plan named with no bytes behind it is refused, not skipped.
 *
 * WHAT IT CALLS. rules/harvest-gate.ts, and through it every rule in this folder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  gateHarvest,
  notGatedReason,
  RulesRefused,
  GE_OWNED_FILES,
  NOT_GATED_FOLDERS,
  type HarvestedFile,
} from './harvest-gate.ts';

const BRAIN = ['# Founder Brain', '', '- **Track:** b2b', '- **Model:** service', '', '## Thesis', '', 'We help operations leads at mid sized logistics firms.'].join('\n');

function file(path: string, text: string, kind: HarvestedFile['kind'] = 'new'): HarvestedFile {
  return { path, kind, bytes: Buffer.from(text, 'utf8') };
}

function input(changes: HarvestedFile[]): Parameters<typeof gateHarvest>[0] {
  return { founderId: '01J8ZQTMK4NRC7XVYB3D9GHF40', changes, track: 'b2b', brain: BRAIN };
}

describe('what the gate refuses', () => {
  it('THROWS ON A BANNED WORD, so a caller cannot save the file by ignoring a flag', async () => {
    await assert.rejects(
      () => gateHarvest(input([file('content-30.md', 'Post 1: this will supercharge your pipeline.')])),
      (err: unknown) => {
        assert.ok(err instanceof RulesRefused, `expected RulesRefused, got ${String(err)}`);
        assert.equal(err.code, 'rules_refused');
        assert.equal(err.paths[0], 'content-30.md');
        assert.equal(err.answer.blocked[0]?.rule, 'prose');
        assert.equal(err.answer.blocked[0]?.where.path, 'content-30.md');
        // The founder gets a sentence and a way out, not a rule name.
        assert.ok(err.message.length > 0);
        assert.ok(err.answer.blocked[0]?.recovery.label.length > 0);
        return true;
      },
    );
  });

  it('refuses the WHOLE turn when one of several files fails', async () => {
    // A turn writes several files and they are saved in one transaction. Letting
    // the clean ones through leaves a folder that half describes a business.
    await assert.rejects(
      () =>
        gateHarvest(
          input([
            file('content-30.md', 'Post 1: what we learned last week.'),
            file('ops-workflow.md', 'We can automate DMs for you overnight.'),
          ]),
        ),
      RulesRefused,
    );
  });

  it('refuses an em dash, because the house style rules run on the same pass', async () => {
    await assert.rejects(
      () => gateHarvest(input([file('90-day-plan.md', 'Week one — write the plan.')])),
      RulesRefused,
    );
  });

  it('refuses the other track\'s file, which is rule 1', async () => {
    await assert.rejects(
      () => gateHarvest(input([file('hook-bank.md', 'Ten hooks for your feed.')])),
      (err: unknown) => {
        assert.ok(err instanceof RulesRefused);
        assert.ok(err.answer.blocked.some((v) => v.rule === 'track'));
        return true;
      },
    );
  });

  it('REFUSES A FILE THE PLAN NAMED WITH NO BYTES, rather than skipping it quietly', async () => {
    // Fail closed. A file that cannot be read cannot be checked, and an empty
    // check is not a pass.
    await assert.rejects(
      () => gateHarvest(input([{ path: 'content-30.md', kind: 'new' }])),
      /cannot be checked/,
    );
  });
});

describe('what the gate lets through', () => {
  it('passes clean work and reports what it read', async () => {
    const report = await gateHarvest(
      input([file('content-30.md', '## Post 1\n\nWhat we learned last week, in three lines.\n')]),
    );
    assert.deepEqual(report.checked, ['content-30.md']);
    assert.equal(report.answer?.ok, true);
    assert.deepEqual(report.notGated, []);
  });

  it('reads the founder\'s own message as grounding, so a number they gave is not invented', async () => {
    const withNumber = file('content-30.md', '## Post 1\n\nWe ran 47 onboarding calls last quarter.\n');
    await assert.rejects(() => gateHarvest(input([withNumber])), RulesRefused);

    const report = await gateHarvest({
      ...input([withNumber]),
      grounding: [{ path: 'the message you sent', text: 'we ran 47 onboarding calls last quarter', authored: 'founder' }],
    });
    assert.equal(report.answer?.ok, true);
  });

  it('carries warnings out instead of blocking on them', async () => {
    const report = await gateHarvest(
      input([file('ops-workflow.md', 'There is no DM automation here. Cold DMs are manual.')]),
    );
    assert.equal(report.answer?.ok, true);
    assert.ok(report.notes.length > 0, 'a warning should reach the founder beside the work');
    assert.ok(report.notes.every((v) => v.severity === 'warn'));
  });
});

describe('what the gate does not read, and why that is written down', () => {
  it('THE NOT GATED LIST IS EXACTLY THESE FIVE, and adding a sixth is a visible act', () => {
    assert.deepEqual([...GE_OWNED_FILES], ['ledger.md', 'memory.md', 'ops-log.md']);
    assert.deepEqual(
      NOT_GATED_FOLDERS.map((f) => f.prefix),
      ['.state/', 'snapshots/', 'people/', 'voice-samples/'],
    );
    for (const folder of NOT_GATED_FOLDERS) {
      assert.ok(folder.why.length > 20, `${folder.prefix} needs a reason, not a label`);
    }
  });

  it('leaves ge\'s own files alone, and says so rather than saying nothing', async () => {
    // ledger.md here carries a banned word on purpose. ge wrote it, ge refuses
    // rather than guesses at its own writes, and a second parser of ge's formats
    // costs a founder a whole turn the day the two disagree.
    const report = await gateHarvest(
      input([
        file('ledger.md', '| id | status |\n| 1 | seamless |\n'),
        file('people/sam-example-com.md', 'key: sam@example.com\n'),
        file('.state/index.md', '| file | gate |\n'),
        file('snapshots/content-30.md', 'anything'),
        file('voice-samples/how-i-write.md', 'I write in long sentences — always have.'),
      ]),
    );
    assert.equal(report.answer, null, 'nothing was checked, so there is no answer to give');
    assert.deepEqual(report.checked, []);
    assert.deepEqual(
      report.notGated.map((n) => n.path),
      ['ledger.md', 'people/sam-example-com.md', '.state/index.md', 'snapshots/content-30.md', 'voice-samples/how-i-write.md'],
    );
    for (const entry of report.notGated) assert.ok(entry.why.length > 0);
  });

  it('GATES dm-openers.md, even though ge owns a block inside it', async () => {
    // The audience engine owns the rest of that file, and the rest of it is what a
    // founder sends to a stranger.
    assert.equal(notGatedReason('dm-openers.md'), null);
  });

  it('gates a file nobody planned for, rather than waving it through', async () => {
    assert.equal(notGatedReason('some-file-nobody-listed.md'), null);
    await assert.rejects(
      () => gateHarvest(input([file('some-file-nobody-listed.md', 'anything at all')])),
      (err: unknown) => {
        assert.ok(err instanceof RulesRefused);
        assert.ok(err.answer.blocked.some((v) => v.rule === 'ownership'));
        return true;
      },
    );
  });

  it('has nothing to read when the turn only deleted things', async () => {
    const report = await gateHarvest(input([{ path: 'content-30.md', kind: 'deleted' }]));
    assert.equal(report.answer, null);
    assert.equal(report.notGated[0]?.path, 'content-30.md');
  });
});

describe('rule 4, the founder\'s own section', () => {
  it('refuses a rewrite of what sits under "Yours"', async () => {
    const previous = ['# Ops workflow', '', 'The toolkit part.', '', '## Yours', '', 'My own note, exactly as I left it.'].join('\n');
    const now = ['# Ops workflow', '', 'The toolkit part.', '', '## Yours', '', 'My own note, tidied up a bit.'].join('\n');

    await assert.rejects(
      () =>
        gateHarvest({
          ...input([file('ops-workflow.md', now, 'changed')]),
          readPrevious: async () => previous,
        }),
      (err: unknown) => {
        assert.ok(err instanceof RulesRefused);
        assert.ok(err.answer.blocked.some((v) => v.code === 'ownership.rewrote-yours'));
        return true;
      },
    );
  });

  it('asks for the previous version only for a file that is changing', async () => {
    const asked: string[] = [];
    await gateHarvest({
      ...input([file('content-30.md', 'Post 1: three lines.', 'new')]),
      readPrevious: async (path) => {
        asked.push(path);
        return undefined;
      },
    });
    assert.deepEqual(asked, [], 'a new file has no previous version, so nothing should be decrypted for it');
  });
});
