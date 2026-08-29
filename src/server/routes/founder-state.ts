/**
 * src/server/routes/founder-state.ts
 *
 * WHAT THIS IS. Two questions the home screen and the gates screen both ask of
 * a founder's folder, answered once: which files they actually have, and what
 * state each gate file is in.
 *
 * WHY IT EXISTS. Both screens are answers to "where am I up to", and if they
 * are computed twice they will eventually disagree. A founder reading "Gate A
 * done" on one screen and "Founder Brain comes first" on the other has no way
 * to tell which is lying, and will believe the worse one.
 *
 * TWO RULES ARE APPLIED HERE AND NOT LEFT TO THE CALLERS.
 *
 *   Rule 1. The track filter runs before anything is counted, so a B2C
 *   founder's gate state cannot carry a row named after a B2B file, even as a
 *   file that is missing. Absent, not greyed out, is the shape rule 1 takes
 *   everywhere. The filter is built from `schemas/gates.md` through the rules
 *   module, and a deployment where that read fails answers nothing rather than
 *   answering everything, which is the same fail closed rule the gate applies
 *   to a write.
 *
 *   Rule 5, never invent proof. A file that exists but is empty is reported as
 *   `empty`, which the gates screen renders as started rather than as passed.
 *   WHAT COUNTS AS ENOUGH CONTENT IS NOT DECIDED: `app/content/gates.ts` sets
 *   EMPTINESS_FLOOR_PENDING and no threshold, and a byte count invented here
 *   would either pass an empty founder-brain.md at gate A or fail an honest
 *   short one. So the only line drawn is the one that is certain: zero bytes is
 *   not content.
 *
 * WHAT CALLS IT. ./home.ts and ./gates.ts.
 * WHAT IT READS. `ge_file`, founder scoped, through the AppStore, and the gate
 * table. WHAT IT WRITES. Nothing.
 */

import type { FastifyReply } from 'fastify';

import { GATE_FILES } from '../../../app/content/gates.ts';
import { fileFilterFor, type Track } from '../rules/index.ts';
import { ERRORS, errorBody } from './errors.ts';
import type { FileRow } from './ports.ts';
import type { RouteDeps } from './deps.ts';

/** What the gates screen reads off one file. */
export type FileStatus = 'missing' | 'empty' | 'ok';

/**
 * The founder's track, as one of the two values rule 1 knows about.
 *
 * `founder.track` is a nullable text column, so it can hold whatever the
 * database holds. Anything that is not one of the two tracks reads as not
 * chosen yet, which is the strictest answer available and is not a guess.
 * Guessing would hand half the cohort the other track's programme.
 */
export function trackOf(founder: { readonly track: string | null }): Track | null {
  return founder.track === 'b2b' || founder.track === 'b2c' ? founder.track : null;
}

/**
 * The rule 1 test for this request, or null when it could not be built.
 *
 * Null means the reply has already been sent. Callers return immediately on
 * null and never fall through to serving an unfiltered answer.
 */
export function trackFilter(
  deps: RouteDeps,
  founder: { readonly id: string; readonly track: string | null },
  reply: FastifyReply,
): ((path: string) => boolean) | null {
  try {
    return fileFilterFor(trackOf(founder));
  } catch (err) {
    deps.log.error(
      { founderId: founder.id, detail: String(err) },
      'the track filter could not be built, so no state was served',
    );
    void reply.code(ERRORS.serverFault.status).send(errorBody(ERRORS.serverFault));
    return null;
  }
}

/**
 * The files this founder has, that this founder may see, that have something in
 * them.
 *
 * `.state/` is left out. It is the toolkit's own bookkeeping, it is on the files
 * screen behind a disclosure because it is theirs too, and it is not work a
 * card should count as done.
 *
 * ZERO BYTES DOES NOT COUNT AS PRESENT, and that is the one judgement in this
 * file. A card that unblocks on an empty founder-brain.md sends a founder into
 * session 2 on top of a turn that failed.
 */
export function presentFiles(rows: readonly FileRow[], mayShow: (path: string) => boolean): readonly string[] {
  return rows
    .filter((r) => r.sizeBytes > 0 && !r.path.startsWith('.state/') && mayShow(r.path))
    .map((r) => r.path);
}

/**
 * The state of every gate file, for this founder's track.
 *
 * `people/` is a folder rather than a file, so it is answered from whether the
 * folder holds anything with content. Every other row is one path.
 */
export function gateFileStatus(
  rows: readonly FileRow[],
  mayShow: (path: string) => boolean,
): Readonly<Record<string, FileStatus>> {
  const visible = rows.filter((r) => mayShow(r.path));
  const out: Record<string, FileStatus> = {};

  for (const row of GATE_FILES) {
    if (!mayShow(row.file)) continue;

    if (row.file.endsWith('/')) {
      const inside = visible.filter((r) => r.path.startsWith(row.file));
      out[row.file] = inside.length === 0 ? 'missing' : inside.some((r) => r.sizeBytes > 0) ? 'ok' : 'empty';
      continue;
    }

    const found = visible.find((r) => r.path === row.file);
    out[row.file] = found === undefined ? 'missing' : found.sizeBytes > 0 ? 'ok' : 'empty';
  }
  return out;
}
