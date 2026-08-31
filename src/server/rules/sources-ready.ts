/**
 * sources-ready.ts: every list the rules read off disk, in one place, forced to
 *   load before a founder's turn is allowed to depend on them.
 *
 * WHY IT EXISTS, and it is the second time, which is why it is a file and not a
 *   line. Twice now a check in this folder has stopped checking and nothing
 *   said so.
 *
 *     The first time, a rule's severity was lowered in one file while another
 *     file still described it as holding. The gate went quiet by policy.
 *
 *     The second time, `BANNED=''` in the content repo read as a found
 *     assignment. The banned word rule scanned every founder file against a
 *     list of nothing. That one did not even fail quietly: an empty pattern
 *     matches at every position, so the scan collected violations until the
 *     heap ran out and the process died on the first turn.
 *
 *   The rules in this folder are the only thing standing between a model and a
 *   founder's folder. A net that quietly stops checking is worse than no net,
 *   because everybody carries on believing it is there. So the reads get named
 *   once, out loud, and something forces them.
 *
 * WHAT IT GUARANTEES. After `assertRulesSourcesReady()` returns, every list the
 *   rules read from disk has been read and is usable. If any one of them cannot
 *   be, this throws and names which, and the caller refuses. It never returns a
 *   partial yes.
 *
 * WHERE IT IS CALLED, and both places matter for a different reason.
 *
 *   `harvest-gate.ts` calls it at the top of every turn. That is the one that
 *   makes the guarantee real: a turn on a deployment whose rules cannot load is
 *   refused rather than saved unchecked. It costs a boolean after the first
 *   call, because every source underneath caches.
 *
 *   `server/index.ts` should call it at boot, so a broken deployment says so
 *   before a founder is in front of it rather than on their first message. That
 *   is the failure the header of index.ts already describes: a copy that booted
 *   green, answered /healthz with no blockers, and failed on the first message.
 *   Refusing the turn is the floor. Refusing to start is the courtesy.
 *
 * THE TEST BESIDE THIS FILE IS THE POINT OF IT. `sources-ready.test.ts` reads
 *   this folder and fails if a module reads from disk without appearing in
 *   `RULES_SOURCES`. That is what stops the next read being added quietly, and
 *   it is a check on this file rather than a check this file performs.
 *
 * CALLED BY: harvest-gate.ts, and the tests in this folder.
 * READS:     nothing itself. It forces the loaders below to read.
 * WRITES:    nothing.
 */

import { contentRoot } from './content-root.ts';
import { gatesSource } from './gates-source.ts';
import { listedPaths } from './ownership.ts';
import { houseStyleSource } from './validate-source.ts';

/** One list the rules cannot work without, and what proves it arrived. */
export interface RulesSource {
  /** What to call it in an error a person has to act on. */
  name: string;
  /** The module in this folder that owns the read. */
  module: string;
  /** What it reads, so the error says where to look. */
  reads: string;
  /**
   * Force the read and prove the result is usable.
   *
   * MUST THROW RATHER THAN RETURN FALSE. A boolean return would let a caller
   * carry on, and the whole argument of this file is that there is no carrying
   * on from here. Each loader below already throws with its own sentence, which
   * is better than anything this file could write, so these mostly just call it
   * and then check the answer is not empty.
   */
  load: () => void;
}

/**
 * Every disk-backed list, in the order a founder would meet the rules using it.
 *
 * EMPTY IS A FAILURE, EVERYWHERE HERE. A list that loaded and holds nothing is
 * the shape of every silent failure this folder has had. So each entry checks a
 * count rather than checking that nothing threw.
 */
export const RULES_SOURCES: readonly RulesSource[] = [
  {
    name: 'the content root',
    module: 'content-root.ts',
    reads: 'vendor/growth-engine, or GE_CONTENT_ROOT when it is set',
    load: (): void => {
      const root = contentRoot();
      if (root.trim() === '') {
        throw new Error('contentRoot() answered with an empty path.');
      }
    },
  },
  {
    name: 'the house style patterns',
    module: 'validate-source.ts',
    reads: 'scripts/validate.sh',
    // Rules 2 and 3 and the whole house style hang off these seven. Every one
    // is checked, because the failure that started this was a single one of
    // them arriving empty while the other six were fine.
    load: (): void => {
      const source = houseStyleSource();
      const patterns = [
        source.dashes,
        source.banned,
        source.bannedPhrases,
        source.promise,
        source.promiseNegation,
        source.dmMention,
      ];
      for (const pattern of patterns) {
        if (pattern.ere.trim() === '') {
          throw new Error(`${pattern.name} was lifted from validate.sh and is empty.`);
        }
      }
      if (source.dashChars.trim() === '') {
        throw new Error('the dash character class was lifted from validate.sh and is empty.');
      }
    },
  },
  {
    name: 'the gates table',
    module: 'gates-source.ts',
    reads: 'plugins/growth-engine/schemas/gates.md',
    // Rule 1 reads this to decide which track a file belongs to. An empty table
    // means every file belongs to both tracks, which is rule 1 switched off.
    load: (): void => {
      const source = gatesSource();
      if (source.files.length === 0) throw new Error('the gates file table has no rows.');
      if (source.items.length === 0) throw new Error('the gates table has no gate items.');
    },
  },
  {
    name: 'the schema declared paths',
    module: 'ownership.ts',
    reads: 'plugins/growth-engine/schemas/',
    // Rule 4 reads these to tell a real file from one nothing lists. An empty
    // answer means every file the model writes looks unlisted.
    load: (): void => {
      if (listedPaths().length === 0) {
        throw new Error('no schema in the content repo says where its file lives.');
      }
    },
  },
];

let ready = false;

/**
 * Prove every list the rules read is there, or throw naming the one that is not.
 *
 * The verdict is cached because the content is committed files, fixed when the
 * deployment was built, and this is called on every turn. Only the yes is
 * cached: a throw is re-thrown on the next call rather than remembered, so a
 * caller that catches and retries gets the same answer rather than a stale one.
 */
export function assertRulesSourcesReady(): void {
  if (ready) return;

  for (const source of RULES_SOURCES) {
    try {
      source.load();
    } catch (cause) {
      const because = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        [
          `The rules gate cannot load ${source.name}, so it cannot check what the model wrote.`,
          'It refuses rather than save a file it has not checked.',
          '',
          `Owned by:  src/server/rules/${source.module}`,
          `Reads:     ${source.reads}`,
          '',
          because,
        ].join('\n'),
        { cause },
      );
    }
  }

  ready = true;
}

/** Only for tests that need to load a doctored content tree. */
export function resetRulesSourcesReadyForTests(): void {
  ready = false;
}
