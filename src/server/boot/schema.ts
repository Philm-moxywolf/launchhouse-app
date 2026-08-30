/**
 * src/server/boot/schema.ts
 *
 * WHAT THIS IS. The one call that builds the database before the port binds, and the one
 * sentence a founder reads when it could not.
 *
 * WHY IT EXISTS. Nothing ran the migration. `.replit` runs `npm run start`, the documented
 * deployment build command is `npm ci && npm run build`, and neither of those touches
 * `npm run db:migrate`. So a founder who created a Replit database, set a passphrase, and
 * pressed Sign in got a 500 carrying an incident id and the words "tell a mentor". The log
 * line, which the founder never sees, said relation "founder" does not exist. That is the
 * first wall on the path, it is hit within two minutes of a remix, and it is hit by every
 * founder rather than by an unlucky one.
 *
 * WHY MIGRATING AT BOOT RATHER THAN NAMING IT ON THE START PAGE. Both were on the table.
 * boot/readiness.ts exists precisely so that a missing thing becomes a sentence instead of
 * a container that will not start, and adding one more blocker to that list is the smaller
 * change. It is also the wrong one here, and the reason is the room.
 *
 *   A blocker is only worth writing if the founder can act on it. Every other blocker on
 *   that list ends on something a founder can do from the Replit web page they already have
 *   open: create a database, set a Secret, paste a key, ask the person running the room.
 *   The action for an unmigrated database is `npm run db:migrate` in a terminal. A founder
 *   who has just bought a Core plan and pressed Remix does not have a terminal open, has
 *   never seen one, and is one of 130 people in a staffed room where the mentors are
 *   walking the floor. Multiply one terminal command by 130 and the day is gone.
 *
 *   The second reason is that there is nothing to decide. Every founder needs exactly the
 *   same migration applied to a database only they use, on first boot, with no data in it
 *   to protect. A question with one right answer, asked of somebody who cannot answer it,
 *   should not be asked.
 *
 * SO IT DOES BOTH, AND THE SECOND HALF IS THE PART THAT MATTERS. It runs the migration at
 * boot, and when the migration does not work it still produces a blocker, because a boot
 * that could not build the database must not go on to report ready. That is the fail closed
 * rule: the thing that cannot be proved is not reported as done. The difference from the
 * old behaviour is that the blocker now says a mentor has to look, which is an action, and
 * it says it INSTEAD of a 500 on the sign in button, which is not.
 *
 * IT NEVER THROWS. main() gathers facts and decides once, and a throw here would go back to
 * one question, one exit, which is the behaviour this whole boot path was built to remove.
 *
 * WHAT CALLS IT. src/server/index.ts, in main(), after the database has answered and before
 * the master key is resolved. Its own test.
 * WHAT IT READS. The database, through db/migrate.ts. WHAT IT WRITES. The database schema.
 */

import { runMigrations } from '../db/migrate.ts';

export interface SchemaReady {
  readonly ok: true;
  /** True when this process ran the phases rather than waiting for another copy to. */
  readonly applied: boolean;
  /** How many migrations were genuinely applied. Zero on a boot that had nothing to do. */
  readonly newlyApplied: number;
}

export interface SchemaRefused {
  readonly ok: false;
  /** One sentence a founder can act on. It reaches the first screen. */
  readonly founderMessage: string;
  /** The longer version, for the log. */
  readonly detail: string;
}

export type SchemaOutcome = SchemaReady | SchemaRefused;

/**
 * The sentence a founder gets when the database could not be built.
 *
 * IT DOES NOT NAME A COMMAND. `npm run db:migrate` is the fix and it is useless on this
 * screen: the person reading it cannot run it. What they can do is show the screen to
 * somebody who can, and that is a real action taken in a room with mentors in it. The
 * detail that tells the mentor what to type goes to the log, where the mentor will look.
 *
 * IT NAMES THE DOUBT FIRST. A founder whose app has just told them something is wrong with
 * their database assumes they broke it. They did not, this happens before they have typed
 * anything, and saying so is the difference between a founder who asks for help and one who
 * quietly starts again from scratch.
 */
const FOUNDER_MESSAGE =
  'Your database is there and the tables inside it were not built, so there is nowhere yet to save your work. You did not cause this and nothing of yours has been lost. Show this screen to somebody from the Launchhouse team.';

/**
 * Build the database, or say why not.
 *
 * ONLY CALL IT WHEN THE DATABASE HAS ANSWERED. With no database there is nothing to
 * migrate, and running this anyway turns one fault into two lines on the start page for one
 * cause. A founder who reads two lines about a database they have not created yet reads
 * neither.
 */
export async function ensureSchema(): Promise<SchemaOutcome> {
  try {
    const run = await runMigrations();
    return { ok: true, applied: run.applied, newlyApplied: run.newlyApplied };
  } catch (err) {
    return {
      ok: false,
      founderMessage: FOUNDER_MESSAGE,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
