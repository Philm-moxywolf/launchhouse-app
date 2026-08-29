/**
 * session-store.ts
 *
 * WHAT: A SessionStore adapter over Postgres, so a thread can resume after the
 *       container it was running in has gone.
 *
 * WHY IT EXISTS: The container filesystem is a cache and is not durable. The
 *       CLI writes its transcript to CLAUDE_CONFIG_DIR, which is under /tmp and
 *       dies with the container. Without a mirror, a redeploy on the Thursday
 *       fix window loses every in flight conversation.
 *
 * CALLED BY: runner.ts, passed as Options.sessionStore.
 * READS and WRITES: transcript_entries(session_id, seq, uuid, entry), through
 *       the TranscriptStore port. `uuid` is the idempotency key, so a retried
 *       batch cannot duplicate a row.
 *
 * THIS IS MARKED @alpha IN THE SDK'S OWN TYPE DECLARATIONS, AND SO IS
 * `sessionStoreFlush`. Said out loud rather than discovered later. Nothing in
 * this app's correctness depends on it working:
 *
 *   load() never throws. On any failure it returns null, which the SDK reads as
 *   "never written" and starts a fresh session. runner.ts then seeds that
 *   session with the thread digest, which is built from the founder's own
 *   files. Losing the transcript costs conversational texture. It does not cost
 *   answers, because the interview's real state is the file it is writing.
 *
 * A throw here would be worse than a miss: the SDK's declaration says a load
 * that does not settle inside loadTimeoutMs fails the whole query. A founder
 * mid Founder Brain would get an error instead of a slightly less chatty
 * assistant. So this file swallows and logs, and never rethrows on the read
 * path. Assumption C1 in section 9 is the test that settles whether the mirror
 * works at all; the digest is what makes the answer to it uninteresting.
 */

import type { Logger, TranscriptStore } from './ports.js';

/**
 * The subset of the SDK's SessionStore this app implements, restated
 * structurally so this file does not have to import the SDK at run time. The
 * production wiring in ./index.ts checks it against the real type.
 */
export interface SessionKeyLike {
  readonly projectKey: string;
  readonly sessionId: string;
  readonly subpath?: string;
}

export interface SessionStoreLike {
  append(key: SessionKeyLike, entries: readonly Record<string, unknown>[]): Promise<void>;
  load(key: SessionKeyLike): Promise<Record<string, unknown>[] | null>;
  listSubkeys(key: { projectKey: string; sessionId: string }): Promise<string[]>;
}

export function createSessionStore(
  transcripts: TranscriptStore,
  log: Logger,
): SessionStoreLike {
  return {
    /**
     * Mirrors a batch after the subprocess's own local write has already
     * succeeded, so durability is not at stake here and a slow write is not
     * worth failing a turn over. Errors are thrown, because the SDK retries
     * three times before giving up and emitting a mirror_error, and a
     * transient database blip is exactly what that retry is for.
     */
    async append(key, entries) {
      if (entries.length === 0) return;
      await transcripts.append(key.projectKey, key.sessionId, key.subpath, entries);
    },

    /**
     * Called once, in the parent, before the subprocess is spawned. See the
     * header: this never throws and never hangs the spawn.
     */
    async load(key) {
      try {
        const rows = await transcripts.load(key.projectKey, key.sessionId, key.subpath);
        if (rows === null || rows.length === 0) {
          log.info({ sessionId: key.sessionId }, 'transcript mirror empty, seeding from digest');
          return null;
        }
        return rows;
      } catch (err: unknown) {
        log.error(
          { sessionId: key.sessionId, err: String(err) },
          'transcript mirror load failed, seeding from digest instead',
        );
        return null;
      }
    },

    /**
     * Subagent transcripts. There are none, because Task is not in the tool
     * surface. Implemented anyway so that if Task is ever added, resume does
     * not silently drop half the conversation.
     */
    async listSubkeys(key) {
      try {
        return await transcripts.listSubkeys(key.projectKey, key.sessionId);
      } catch (err: unknown) {
        log.error({ sessionId: key.sessionId, err: String(err) }, 'listSubkeys failed');
        return [];
      }
    },
  };
}

/**
 * The scope a session is stored under.
 *
 * The SDK's default projectKey is the sanitised cwd, and cwd is
 * /tmp/ge/<founderId>, so the default is already per founder. This function
 * exists so that fact is written down and checked, rather than being a happy
 * accident that a later cwd change quietly undoes.
 */
export function projectKeyFor(founderId: string): string {
  return `founder-${founderId}`;
}

/** True when a stored key belongs to this founder. Used before any load. */
export function keyBelongsTo(key: SessionKeyLike, founderId: string): boolean {
  return key.projectKey.includes(founderId);
}
