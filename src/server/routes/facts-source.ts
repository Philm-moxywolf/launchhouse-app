/**
 * src/server/routes/facts-source.ts
 *
 * WHAT THIS IS. The FactsSource port from src/server/agent/ports.ts, filled in.
 * It answers, for one founder and one engine: which track they are on, which
 * files they already have, which of this engine's files are still missing,
 * which gates have been passed, and what today's date is where they are.
 * Those five answers become the run context header, which is the first user
 * message of every run.
 *
 * WHY IT EXISTS. Four failures.
 *
 *   THE MODEL AND THE SCREEN DISAGREEING. A founder looks at Files, sees
 *   content-30.md, and the model says it cannot find it. The header is built
 *   from the founder's materialised folder, and that folder is built by
 *   storage/materialise.ts from ge_file, which is exactly what the Files screen
 *   renders. One source, two surfaces.
 *
 *   THE FOLDER HUNTING PARAGRAPH. Every skill body in the plugin opens by
 *   telling the model where the founder's folder is and how to find it. In the
 *   app the folder is the cwd and the file list is in the first message, so
 *   none of that prose has anything to do. Handing the model the list is what
 *   replaces it.
 *
 *   A CONNECTION DEADLOCK UNDER LOAD, and this is why the file list is read
 *   from disk rather than from the database. factsFor runs INSIDE the turn's
 *   transaction, which is already holding a pooled connection and the founder's
 *   advisory lock. Asking the pool for a second connection from in there means
 *   that with PGPOOL_MAX at 10 and MAX_CONCURRENT_RUNS at 24, ten turns can
 *   each hold a connection while waiting for an eleventh that no one will ever
 *   release. The folder on disk carries the same answer and costs no
 *   connection, so it is where the answer comes from.
 *
 *   A STALE TRACK. The Track line in founder-brain.md is the authority and the
 *   founder.track column is a cache. This reads the file, every run, so a
 *   founder who hand edits their Brain gets what they edited.
 *
 * WHAT CALLS IT. src/server/agent/assemble.ts, once per run, through the port.
 * Constructed by src/server/index.ts.
 *
 * WHAT IT READS. The founder's materialised folder, and nothing else. No
 * database connection, no network.
 * WHAT IT WRITES. Nothing.
 *
 * WHAT IT CANNOT ANSWER YET, SAID OUT LOUD RATHER THAN GUESSED.
 * There is no gate state anywhere in this tree: no table, no route, no column.
 * Gate submissions arrive on Google Forms and are marked by a mentor, and
 * nothing has been built to record that yet. So `gates` is empty, and
 * assemble.ts prints "No gates apply yet." That is the honest sentence. The
 * alternative, printing "Gate A: not submitted", is the app asserting something
 * it does not know, to a founder who may have submitted it on the Friday.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { DateTime } from 'luxon';

import type { FactsSource, Logger, RunFacts } from '../agent/ports.ts';
import type { FileFact, FounderContext, RouteId, Track } from '../agent/types.ts';
import { geHome, isExcludedPath, relFromGeHome } from '../storage/paths.ts';
import { parseBrainHeader } from '../storage/turn.ts';
import type { ContentRouteCatalogue } from './agent-content.ts';

/** How deep the scan goes. people/ is one level; nothing legitimate is deeper. */
const MAX_DEPTH = 4;

/** How many files reach the header before it is truncated. See listFor. */
const MAX_FILES_IN_HEADER = 60;

export interface FactsSourceDeps {
  readonly catalogue: ContentRouteCatalogue;
  readonly log: Logger;
  /** Injected so a test can pin the day without waiting for midnight. */
  readonly now?: () => Date;
}

export class FolderFactsSource implements FactsSource {
  constructor(private readonly deps: FactsSourceDeps) {}

  async factsFor(ctx: FounderContext, routeId: RouteId): Promise<RunFacts> {
    const files = await listFiles(ctx.founderId, ctx.timezone, this.deps.log);
    const present = new Set(files.map((f) => f.path));
    const route = this.deps.catalogue.byId(routeId);

    // Only this engine's own outputs. Listing every file the founder does not
    // have would be a list of the whole programme, which reads as a to do list
    // rather than as what this run is for.
    const absent = (route?.produces ?? []).filter((p) => !present.has(p));

    return {
      // THE FILE'S SILENCE IS AN ANSWER. It used to fall back to `ctx.track`,
      // which is the cached `founder.track` column, and the column is never
      // authoritative. A founder on their very first run has no Brain and no
      // track, and falling back to the cache handed the model a track they had
      // not chosen. Null now reaches assemble.ts, which keeps both branches of
      // the intake and says the question is still open.
      track: await this.trackOf(ctx.founderId),
      // Truncated for the header only. `present` above was built from the whole
      // list, so a founder with 200 files never has one of them reported absent
      // because the header ran out of room.
      files: files.slice(0, MAX_FILES_IN_HEADER),
      absent,
      // See the header. There is nowhere in this tree that records a gate
      // submission, so nothing is claimed about one.
      gates: [],
      today: today(ctx.timezone, this.deps.now?.() ?? new Date(), this.deps.log),
    };
  }

  /**
   * The track as the founder's own file states it, or null when they have not
   * chosen yet.
   *
   * Exported behaviour rather than a private helper because run-turn.ts needs
   * the same answer BEFORE the run is assembled, to decide which skill body key
   * to use. Two implementations of "what track is this founder on" is precisely
   * how the two disagree.
   */
  async trackOf(founderId: string): Promise<Track | null> {
    try {
      const text = await readFile(join(geHome(founderId), 'founder-brain.md'), 'utf8');
      const header = parseBrainHeader(text);
      return header.track === 'b2b' || header.track === 'b2c' ? header.track : null;
    } catch {
      // No Brain yet is the normal first state, not an error. A founder on
      // their first turn has no file to read and no track to read from it.
      return null;
    }
  }
}

/**
 * Today, in the founder's own zone, already formatted.
 *
 * The process runs in UTC and a founder in Atlanta at 22:00 on the 24th is on
 * the 24th, not the 25th. Getting this wrong dates a founder's ops log entry to
 * the wrong day, and ops-log.md is append only so it cannot be corrected.
 *
 * An unusable zone falls back to UTC and says so, rather than throwing. A run
 * that refuses to start because a timezone string is wrong is a founder locked
 * out of their own work over a column somebody typed.
 */
export function today(timezone: string, at: Date, log: Logger): string {
  const zoned = DateTime.fromJSDate(at, { zone: timezone });
  if (!zoned.isValid) {
    log.warn({ timezone, reason: zoned.invalidReason }, 'timezone is not usable, dating the run in UTC');
    return DateTime.fromJSDate(at, { zone: 'UTC' }).toISODate() ?? '';
  }
  return zoned.toISODate() ?? '';
}

/** '12 Sep', in the founder's own zone. The format the run header example uses. */
export function changedOn(mtime: Date, timezone: string): string {
  const zoned = DateTime.fromJSDate(mtime, { zone: timezone });
  return (zoned.isValid ? zoned : DateTime.fromJSDate(mtime, { zone: 'UTC' })).toFormat('d LLL');
}

/**
 * Walk the materialised folder and describe every file in it.
 *
 * stat only. The bytes are not read, because the header needs a size and a date
 * and nothing else, and reading 400 files to print a list is most of a second
 * on the path a founder waits on. The harvest reads the bytes later, when it
 * has a reason to.
 *
 * Sorted by path, so two founders with the same files get the same header and a
 * founder's own header does not reshuffle between turns.
 */
export async function listFiles(founderId: string, timezone: string, log: Logger): Promise<FileFact[]> {
  const home = geHome(founderId);
  const found: FileFact[] = [];

  async function descend(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // No folder yet is a founder with no files, which is the right answer on
      // a first turn and not a failure.
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await descend(abs, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      let rel: string;
      try {
        rel = relFromGeHome(founderId, abs);
      } catch {
        // A name storage will not accept. The harvest is what refuses it, in
        // founder prose, at the end of the turn. Leaving it out of the header
        // here just means the model is not told about a file it cannot keep.
        continue;
      }
      // .state/, snapshots/ and the epoch file. ge's own bookkeeping is not the
      // founder's work and putting it in the header invites the model to edit it.
      if (isExcludedPath(rel)) continue;
      try {
        const info = await stat(abs);
        found.push({ path: rel, sizeBytes: info.size, changed: changedOn(info.mtime, timezone) });
      } catch {
        continue;
      }
    }
  }

  try {
    await descend(home, 0);
  } catch (err: unknown) {
    // A header with a short file list is a worse run. A header that throws is
    // no run at all, and the founder's work is untouched either way.
    log.error({ founderId, err: String(err) }, 'could not list the founder folder for the run header');
  }

  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return found;
}
