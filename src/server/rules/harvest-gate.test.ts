/**
 * src/server/rules/harvest-gate.test.ts
 *
 * WHAT THIS IS. The gate's own policy, under test, with no database and no
 * filesystem: which paths it reads, which it does not, what a blocking violation
 * costs, and what it does when it was handed nothing to read.
 *
 * WHY IT EXISTS. The end to end proof lives in storage/turn.rules.test.ts, which
 * runs a real turn and asserts a held file never reaches ge_file while its
 * neighbours do. That test is the one that matters and it is slow to reason about.
 * This one holds the decisions that test depends on, as a pure function over one
 * object, so that every branch has a case that runs in milliseconds:
 *
 *   1. A blocking violation holds ITS FILE and leaves the rest of the turn alone.
 *   2. The one violation on `WORTH_THE_WHOLE_TURN` still throws, so the guard can
 *      be proved to fail before it is trusted to pass.
 *   3. A code nobody has classified holds the file rather than costing the turn.
 *   4. Ordinary founder sentences never cost a turn. That test is the measurement
 *      behind the size of the list, kept runnable, and it is the gate on the next
 *      thing anybody wants to add to it.
 *   5. The not gated list is exactly the five entries the header argues for. Every
 *      one of them is a hole by construction, so it is pinned rather than trusted.
 *   6. A turn that only touched ge's own files answers null, and null is not a pass.
 *   7. A file the plan named with no bytes behind it is refused, not skipped.
 *   8. The founder reads a sentence about the file they did not get.
 *
 * WHY THE ASSERTIONS CHANGED. Five cases in here used to assert that an em dash, a
 * banned word, the other track's file, an unlisted path and a rewritten "Yours"
 * section each cost the whole turn. They now assert a hold. That is the fix, not a
 * relaxation: the file is still never saved, and the growth plan written beside it
 * no longer dies with it. The argument sits in the header of harvest-gate.ts.
 *
 * WHAT IT CALLS. rules/harvest-gate.ts, and through it every rule in this folder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  explainHold,
  gateHarvest,
  notGatedReason,
  outcomeFor,
  RulesRefused,
  GE_OWNED_FILES,
  NOT_GATED_FOLDERS,
  WORTH_THE_WHOLE_TURN,
  type HarvestedFile,
} from './harvest-gate.ts';
import { checkProseText } from './prose.ts';
import type { Violation } from './types.ts';

const BRAIN = ['# Founder Brain', '', '- **Track:** b2b', '- **Model:** service', '', '## Thesis', '', 'We help operations leads at mid sized logistics firms.'].join('\n');

/** Built rather than typed, so no editor can normalise them away. */
const EM = String.fromCodePoint(0x2014);

function file(path: string, text: string, kind: HarvestedFile['kind'] = 'new'): HarvestedFile {
  return { path, kind, bytes: Buffer.from(text, 'utf8') };
}

function input(changes: HarvestedFile[]): Parameters<typeof gateHarvest>[0] {
  return { founderId: '01J8ZQTMK4NRC7XVYB3D9GHF40', changes, track: 'b2b', brain: BRAIN };
}

/** A violation with everything filled in, so a test can vary one field. */
function violation(over: Partial<Violation> = {}): Violation {
  return {
    rule: 'prose',
    code: 'prose.banned-word',
    severity: 'block',
    where: { path: 'content-30.md', line: 14, column: 3, excerpt: 'A word from the list sits on this line.' },
    found: 'the list',
    message: 'The word "the list" is on the list this toolkit does not use.',
    why: 'The words on it are the ones that make writing sound like everybody else.',
    recovery: { label: 'Ask for that one again', action: { kind: 'reply' } },
    ...over,
  };
}

describe('what a blocking violation costs', () => {
  it('HOLDS THE FILE AND KEEPS THE REST OF THE TURN, which is the whole point', async () => {
    const report = await gateHarvest(
      input([
        file('90-day-plan.md', '## Week one\n\nWrite the plan and book the calls.\n'),
        file('outreach-sequence.md', '## Step one\n\nOne short note about their onboarding.\n'),
        file('content-30.md', '## Post 1\n\nWe saved a client 11 hours a week.\n'),
      ]),
    );

    assert.deepEqual(report.held.map((h) => h.path), ['content-30.md']);
    assert.deepEqual(report.saved, ['90-day-plan.md', 'outreach-sequence.md']);
    assert.equal(report.answer?.ok, false, 'the artifact failed, and the report says so');
    assert.equal(report.held[0]?.violations[0]?.severity, 'block', 'it still blocked its own file');
  });

  it('HOLDS AND DOES NOT REFUSE for an em dash, a wrong track file, an unlisted path', async () => {
    // Four rules, four vocabulary lists, four things that are not worth a founder's
    // afternoon. Each one is written beside a clean file so the hold is visible.
    const cases: Array<{ what: string; bad: HarvestedFile }> = [
      // NOT an em dash any more. A dash is a note: see the row for prose.dash in
      // confidence.ts. What is left on this list is the other track's method,
      // which is jargon that does not turn up by accident.
      { what: 'the other track\'s method', bad: file('90-day-plan.md', 'Week one: build your hook bank.') },
      { what: 'the other track\'s file', bad: file('hook-bank.md', '# Hooks\n\nTen openers for your feed.\n') },
      { what: 'a path nobody listed', bad: file('some-file-nobody-listed.md', 'Anything at all.\n') },
    ];

    for (const { what, bad } of cases) {
      const report = await gateHarvest(
        input([file('content-30.md', '## Post 1\n\nWhat we learned last week, in three lines.\n'), bad]),
      );
      assert.deepEqual(report.held.map((h) => h.path), [bad.path], `${what} should hold one file`);
      assert.deepEqual(report.saved, ['content-30.md'], `${what} should leave the clean file alone`);
    }
  });

  it('HOLDS THE FILE that offers to automate DMs, and saves the one beside it', async () => {
    // THIS USED TO REFUSE THE WHOLE TURN. The argument was contamination: a run that
    // made the offer once had written every other file in the same state. One night
    // of real use killed it. Every file is checked by the same rule, so a neighbour
    // that does not trip it is not contaminated by the gate's own definition, and
    // destroying it asserts something the gate just looked for and did not find.
    //
    // A founder lost twelve files over four runs to one heading before this changed.
    const out = await gateHarvest(
      input([
        file('content-30.md', '## Post 1\n\nWhat we learned last week.\n'),
        file('ops-workflow.md', 'We can automate DMs for you overnight.\n'),
      ]),
    );
    assert.deepEqual(out.held.map((h) => h.path), ['ops-workflow.md'], 'the offer must never be saved');
    assert.deepEqual([...out.saved], ['content-30.md'], 'and its neighbour must survive');
    assert.ok(
      out.answer?.blocked.some((v) => v.code === 'dm.offered'),
      'the violation is still raised, it just costs one file rather than the run',
    );
  });

  it('NOTHING IS WORTH A WHOLE TURN, and putting something back is a real decision', () => {
    // Empty since 1 September 2026. A row here costs a founder every file in a turn,
    // including the ones the gate approved, so it needs a harm a hold cannot contain.
    // `dm.offered` was the last entry and it did not meet that bar in practice: it
    // destroyed twelve good files over four runs, all over one heading in a file
    // about the inbound automation rule 2 exists to permit.
    assert.deepEqual([...WORTH_THE_WHOLE_TURN], []);
    // If somebody does add one back, the argument has to be in the row rather than
    // in a commit message nobody reads at the event.
    for (const entry of WORTH_THE_WHOLE_TURN) {
      assert.ok(entry.why.length > 200, `${entry.code} needs the argument, not a label`);
    }
  });

  it('A CODE NOBODY CLASSIFIED HOLDS THE FILE, because the default must never cost a turn', () => {
    assert.equal(outcomeFor(violation({ code: 'proof.something-added-next-week' })), 'hold-the-file');
    assert.equal(outcomeFor(violation({ code: 'dm.offered-but-renamed' })), 'hold-the-file');
    assert.equal(outcomeFor(violation({ code: '' })), 'hold-the-file');
  });

  it('holds every rule 5 reading, strong and weak', () => {
    // Two of these three cannot reach `outcomeFor` on a real turn any more,
    // because `confidence.ts` files them below a hold. Asserted anyway: this
    // function is the last word on what a block costs, and it has to answer
    // safely for a code that arrives by a route nobody predicted.
    assert.equal(outcomeFor(violation({ code: 'proof.invented-result' })), 'hold-the-file');
    assert.equal(outcomeFor(violation({ code: 'proof.ungrounded-number' })), 'hold-the-file');
    assert.equal(outcomeFor(violation({ code: 'proof.nothing-to-check-against' })), 'hold-the-file');
  });

  it('EVERY RULE 2 CODE HOLDS ITS FILE NOW, including the loudest one', () => {
    // `dm.offered` was the exception and is not any more. The file it is found in is
    // still never saved; what changed is that the founder keeps everything else the
    // same turn produced.
    assert.equal(outcomeFor(violation({ code: 'dm.possible-offer' })), 'hold-the-file');
    assert.equal(outcomeFor(violation({ code: 'dm.mentioned-while-refusing' })), 'hold-the-file');
    assert.equal(outcomeFor(violation({ code: 'dm.offered' })), 'hold-the-file');
  });
});

describe('what the founder reads about a file they did not get', () => {
  it('SAYS WHAT THEY GOT, WHAT WAS HELD, WHICH LINE, AND WHAT TO DO', async () => {
    const report = await gateHarvest(
      input([
        file('90-day-plan.md', '## Week one\n\nWrite the plan and book the calls.\n'),
        file('outreach-sequence.md', '## Step one\n\nOne short note about their onboarding.\n'),
        file('content-30.md', '## Post 1\n\nWe saved a client 11 hours a week.\n'),
      ]),
    );

    const message = report.held[0]?.message ?? '';
    assert.match(message, /90-day-plan\.md/, 'what they got');
    assert.match(message, /outreach-sequence\.md/, 'what they got');
    assert.match(message, /One file is not there yet: content-30\.md/, 'what was held');
    assert.match(message, /line 3/, 'which line');
    assert.match(message, /We saved a client 11 hours a week\./, 'the sentence itself');
    assert.match(message, /Then ask for content-30\.md again\./, 'what to do now');
    assert.match(message, /restricted|back up|stand behind/, 'why it matters to them');
    assert.match(message, /If that line is right as it stands/, 'the way past it');

    // Never a rule code, never a rule number, never a pattern.
    assert.doesNotMatch(message, /prose\.|proof\.|track\.|ownership\.|dm\./);
    assert.doesNotMatch(message, /rule \d/i);
    // And never the app talking about its own machinery.
    assert.doesNotMatch(message, /violation|severity|gate|pattern|block(ed|ing)?\b/i);
  });

  it('does not accuse a founder of inventing anything when the rule is guessing', () => {
    const message = explainHold(
      'content-30.md',
      violation({
        rule: 'no-invented-proof',
        code: 'proof.ungrounded-number',
        found: '40',
        where: { path: 'content-30.md', line: 9, column: 4, excerpt: 'We book around 40 calls a month.' },
        message: 'The number 40 is not in your Founder Brain, and this line does not make clear where it came from.',
        why: 'Nothing here invents a number about your business.',
        recovery: { label: 'If that number is real, add it to your Founder Brain', action: { kind: 'edit', path: 'founder-brain.md' } },
      }),
      ['90-day-plan.md'],
    );
    assert.doesNotMatch(message, /you invented|you made up|fabricat/i);
    assert.match(message, /is not in your Founder Brain/);
  });

  it('the copy follows the house style it enforces', () => {
    // Run over a hold whose quoted line is clean, because the quote is the model's
    // words rather than the toolkit's and it is shown verbatim on purpose.
    const message = explainHold('content-30.md', violation(), ['90-day-plan.md', 'outreach-sequence.md']);
    const result = checkProseText('the held file message', message);
    assert.deepEqual(
      result.violations.map((v) => `${v.code}: ${v.found}`),
      [],
      'the sentence a founder reads has to pass the rules it is explaining',
    );
  });

  it('says so plainly when the held file was the only thing that request wrote', async () => {
    const report = await gateHarvest(input([file('content-30.md', '## Post 1\n\nWe saved a client 11 hours a week.\n')]));
    assert.equal(report.saved.length, 0);
    assert.match(report.held[0]?.message ?? '', /Nothing else from that request is waiting for you\./);
  });

  it('DOES NOT READ ge\'s BOOKKEEPING BACK TO A FOUNDER', async () => {
    // ge index rewrites .state/index.md on nearly every run, so without this the
    // first thing a founder read after losing a file was a path they have never
    // heard of, with their own plan pushed into "and 1 more".
    const report = await gateHarvest(
      input([
        file('90-day-plan.md', '# The plan\n\nWeek one: write it.\n'),
        file('.state/index.md', '| file | gate |\n'),
        file('snapshots/content-30.md', 'a byte copy'),
        file('ledger.md', '| id | status |\n'),
        file('content-30.md', '## Post 1\n\nWe saved a client 11 hours a week.\n'),
      ]),
    );
    const message = report.held[0]?.message ?? '';
    assert.match(message, /saved: 90-day-plan\.md and ledger\.md\./);
    assert.doesNotMatch(message, /\.state|snapshots/);
    // The report itself still tells the truth about all four.
    assert.equal(report.saved.length, 4);
  });

  it('COUNTS THE HELD FILES rather than telling a founder one when it was two', async () => {
    const report = await gateHarvest(
      input([
        file('90-day-plan.md', '# The plan\n\nWeek one: write it.\n'),
        file('content-30.md', '## Post 1\n\nWe saved a client 11 hours a week.\n'),
        file('ops-workflow.md', '# Ops\n\nStep one: write your hook bank.\n'),
      ]),
    );
    assert.equal(report.held.length, 2);
    for (const entry of report.held) {
      assert.match(entry.message, /2 files are not there yet/);
      assert.match(entry.message, new RegExp(`this is one of them: ${entry.path.replace('.', '\\.')}\\.`));
      assert.match(entry.message, /Everything else from that request is saved: 90-day-plan\.md\./);
    }
  });

  it('PUTS THE HELD FILE FIRST IN THE NOTES, because the surface shows only the first few', async () => {
    const report = await gateHarvest(
      input([
        // A banned word is a note now rather than a hold, which makes it the
        // right thing to stand beside a held file in this test.
        file('ops-workflow.md', '# Ops\n\nA seamless handover.\n'),
        file('content-30.md', '## Post 1\n\nWe saved a client 11 hours a week.\n'),
      ]),
    );
    assert.ok(report.notes.length > 1, 'this case needs a warning as well as a hold');
    assert.equal(report.notes[0]?.code, 'held.proof.invented-result');
    assert.equal(report.notes[0]?.severity, 'warn', 'a note is a note; the block is recorded in held');
    assert.equal(report.notes[0]?.message, report.held[0]?.message);
    assert.ok(
      report.notes.slice(1).every((n) => !n.code.startsWith('held.')),
      'the warnings follow the holds',
    );
  });

  it('TELLS THE FOUNDER WHICH FILE WAS HELD AND WHY, in the terms that make it matter', async () => {
    // This used to assert the whole turn refusal message, because `dm.offered` was
    // the one code that threw a run away. It holds its file now, so what a founder
    // reads is the hold, and the hold has to carry the same weight the refusal did:
    // a restricted Instagram account is not recoverable by asking again.
    const out = await gateHarvest(
      input([
        file('content-30.md', '## Post 1\n\nWhat we learned last week.\n'),
        file('ops-workflow.md', 'We can automate DMs for you overnight.\n'),
      ]),
    );
    const said = out.notes.map((n) => n.message).join(' ');
    assert.match(said, /ops-workflow\.md/, 'they have to be told which file');
    assert.match(said, /Instagram/i, 'and why it matters, not just that a rule fired');
    assert.doesNotMatch(said, /dm\.offered|no-dm-automation/, 'never a rule code');
    assert.doesNotMatch(said, /—|–/, 'the hold follows the house style it enforces');
    // AND IT MUST NOT SAY NOTHING WAS SAVED, because something was.
    assert.doesNotMatch(said, /Nothing from that request was saved/);
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
    assert.deepEqual(report.held, []);
    assert.deepEqual(report.saved, ['content-30.md']);
  });

  it('reads the founder\'s own message as grounding, so a number they gave is not invented', async () => {
    const withNumber = file('content-30.md', '## Post 1\n\nWe cut their onboarding to 47 days.\n');
    const withoutIt = await gateHarvest(input([withNumber]));
    assert.deepEqual(withoutIt.held.map((h) => h.path), ['content-30.md'], 'ungrounded, so held');

    const report = await gateHarvest({
      ...input([withNumber]),
      grounding: [{ path: 'the message you sent', text: 'we cut their onboarding to 47 days', authored: 'founder' }],
    });
    assert.equal(report.answer?.ok, true);
    assert.deepEqual(report.held, []);
  });

  it('SAYING A FIGURE IS RIGHT SETTLES IT, so the founder is not asked twice', async () => {
    // The override, end to end. A founder whose real result is 47 days says so
    // once. Nothing about that figure is raised again, in this file or the next.
    const withNumber = file('content-30.md', '## Post 1\n\nWe cut their onboarding to 47 days.\n');
    const report = await gateHarvest({
      ...input([withNumber]),
      confirmed: [{ rule: 'no-invented-proof', found: '47' }],
    });
    assert.deepEqual(report.held, []);
    assert.deepEqual(report.saved, ['content-30.md']);
    assert.deepEqual(report.notes, [], 'settled means settled, not settled with a note');
  });

  it('a confirmation is scoped to the rule that raised it', async () => {
    // Saying a figure is right must not also switch off the house style. If this
    // ever passes with an empty notes list, one click has quietly turned the
    // whole gate off for that founder.
    const report = await gateHarvest({
      ...input([file('content-30.md', '## Post 1\n\nA seamless handover in 47 days.\n')]),
      confirmed: [{ rule: 'no-invented-proof', found: 'seamless' }],
    });
    assert.ok(report.notes.some((n) => n.code === 'prose.banned-word'));
  });

  it('carries warnings out instead of blocking on them', async () => {
    const report = await gateHarvest(
      input([file('ops-workflow.md', '# Ops\n\nA seamless handover.\n')]),
    );
    assert.equal(report.answer?.ok, true);
    assert.deepEqual(report.held, []);
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
    // costs a founder a file the day the two disagree.
    const report = await gateHarvest(
      input([
        file('ledger.md', '| id | status |\n| 1 | seamless |\n'),
        file('people/sam-example-com.md', 'key: sam@example.com\n'),
        file('.state/index.md', '| file | gate |\n'),
        file('snapshots/content-30.md', 'anything'),
        file('voice-samples/how-i-write.md', `I write in long sentences ${EM} always have.`),
      ]),
    );
    assert.equal(report.answer, null, 'nothing was checked, so there is no answer to give');
    assert.deepEqual(report.checked, []);
    assert.deepEqual(report.held, []);
    assert.deepEqual(
      report.notGated.map((n) => n.path),
      ['ledger.md', 'people/sam-example-com.md', '.state/index.md', 'snapshots/content-30.md', 'voice-samples/how-i-write.md'],
    );
    // Not read is not the same as not saved. All five are still committed.
    assert.equal(report.saved.length, 5);
    for (const entry of report.notGated) assert.ok(entry.why.length > 0);
  });

  it('GATES dm-openers.md, even though ge owns a block inside it', async () => {
    // The audience engine owns the rest of that file, and the rest of it is what a
    // founder sends to a stranger.
    assert.equal(notGatedReason('dm-openers.md'), null);
  });

  it('gates a file nobody planned for, rather than waving it through', async () => {
    assert.equal(notGatedReason('some-file-nobody-listed.md'), null);
    const report = await gateHarvest(input([file('some-file-nobody-listed.md', 'anything at all')]));
    assert.deepEqual(report.held.map((h) => h.path), ['some-file-nobody-listed.md']);
    assert.ok(report.held[0]?.violations.some((v) => v.rule === 'ownership'));
  });

  it('has nothing to read when the turn only deleted things', async () => {
    const report = await gateHarvest(input([{ path: 'content-30.md', kind: 'deleted' }]));
    assert.equal(report.answer, null);
    assert.equal(report.notGated[0]?.path, 'content-30.md');
    // A deletion is not something the founder still has, so it is not in `saved`.
    assert.deepEqual(report.saved, []);
  });
});

describe('rule 4, the founder\'s own section', () => {
  it('holds the file when what sits under "Yours" was rewritten', async () => {
    // Holding is the whole fix here, and it is better than the refusal it replaces:
    // the stored version still carries the founder's own words, untouched.
    const previous = ['# Ops workflow', '', 'The toolkit part.', '', '## Yours', '', 'My own note, exactly as I left it.'].join('\n');
    const now = ['# Ops workflow', '', 'The toolkit part.', '', '## Yours', '', 'My own note, tidied up a bit.'].join('\n');

    const report = await gateHarvest({
      ...input([file('ops-workflow.md', now, 'changed')]),
      readPrevious: async () => previous,
    });
    assert.deepEqual(report.held.map((h) => h.path), ['ops-workflow.md']);
    assert.ok(report.held[0]?.violations.some((v) => v.code === 'ownership.rewrote-yours'));
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
