/**
 * src/server/agent/anthropic-key.ts
 *
 * WHAT THIS IS. The Anthropic API key this process is actually going to use, held in
 * memory, and the one place anything asks for it. No database, no network, no imports.
 *
 * WHY IT EXISTS. The key used to be read once, out of the environment, at startup. That
 * is correct for a deployment an operator sets up and wrong for 130 deployments a founder
 * sets up. A founder cannot put a value in Replit Secrets and restart a container, and
 * nothing anywhere told them to. So the key is pasted into the running app, and a value
 * pasted into a running app has to be picked up by that same running app. This holder is
 * what makes "without a restart" true rather than aspirational:
 *
 *   the founder pastes           -> routes/setup.ts checks it, stores it, calls remember()
 *   remember() tells the listener -> boot/readiness.ts drops the "no key" blocker
 *   the next turn spawns          -> runner.ts reads keyFor() and hands it to the CLI
 *
 * Every one of those three is a separate failure if it is missing. Without the first the
 * key is nowhere. Without the second the app keeps refusing turns and telling a founder to
 * do the thing they have just done, which is the fastest way to teach somebody to ignore a
 * screen. Without the third the turn runs with an empty key and the founder reads "That
 * one did not finish", which reads as the app being broken rather than as anything they
 * can fix.
 *
 * THE ENVIRONMENT IS THE FALLBACK, NEVER THE OTHER WAY ROUND. ANTHROPIC_API_KEY still
 * works if somebody sets it, because that is how a laptop and the two prove scripts run.
 * A pasted key wins, because it is the more recent deliberate act and because it is the
 * only one of the two that has been checked against Anthropic.
 *
 * NO KEY IS EVER RETURNED FOR LOGGING, PRINTING OR RENDERING. There is no accessor here
 * that hands back a key without a founder id to check it against, and `describe()` carries
 * a boolean, a length and a date and nothing else. `scrub()` is the belt: any string about
 * to be written down goes through it first, and a key that somehow reached that string is
 * replaced rather than printed.
 *
 * WHY IT IS A MODULE SINGLETON, WHICH IS NOT THIS FOLDER'S HABIT. Everything else in
 * src/server/agent/ takes its dependencies as arguments so it can be tested. This holds no
 * dependency to take: it is memory, and the process has one memory. Making it an injected
 * object would mean routes/setup.ts, boot/readiness.ts and runner.ts each being handed the
 * same instance through three different wirings, and the day one of them is handed a
 * different instance the app stores a key that the gate never hears about. The state is
 * process wide because the key is process wide: the CLI subprocess reads it out of its own
 * environment. `forgetEverythingForTests` is the seam a test needs, and it is named so
 * that nothing else calls it.
 *
 * WHAT CALLS IT.
 *   src/server/routes/setup.ts        stores, forgets and describes.
 *   src/server/agent/runner.ts        reads it for the CLI subprocess environment.
 *   src/server/agent/intent.ts        the same, for the routing classifier.
 *   src/server/boot/readiness.ts      listens, so the gate reopens without a restart.
 *   src/server/agent/anthropic-key-store.ts  fills it at boot from the database.
 * WHAT IT READS. Nothing. WHAT IT WRITES. Nothing. It is memory.
 */

/**
 * One founder's key, as this process holds it.
 *
 * The founder id is stored beside the key rather than the key alone, because the read
 * below is checked against it. Two founders on one deployment is not the shape of this
 * product, and it is one comparison to make sure a bug that produced it could not spend
 * one founder's money on another founder's work.
 */
interface HeldKey {
  readonly founderId: string;
  readonly key: string;
  /** When this process last saw Anthropic accept it. Never null: nothing is held unchecked. */
  readonly checkedAt: Date;
}

/** What a screen or a log line may know. No key material, and no part of one. */
export interface AnthropicKeyDescription {
  readonly set: boolean;
  /** ISO 8601, or null when nothing is held. */
  readonly checkedAt: string | null;
  /**
   * How many characters the held key has.
   *
   * A number, not a prefix and not a suffix. It is here because "I pasted it and it says
   * 43 characters" is the one thing a mentor can act on across a room without anybody
   * reading a key out loud.
   */
  readonly length: number | null;
}

const held = new Map<string, HeldKey>();

/**
 * The one listener, not a list.
 *
 * A process has one readiness list, so a second subscriber would be a second thing
 * claiming to be it. A slot rather than a Set also means a test that constructs several
 * ReadinessState objects leaves one live listener behind rather than a growing pile.
 */
let listener: ((keyIsSet: boolean) => void) | null = null;

/**
 * Be told when the answer to "is there a key" changes.
 *
 * Called by boot/readiness.ts from its own constructor. It is a push rather than a pull
 * because the readiness list is computed once and then held: a getter would be read at
 * boot and never again, which is exactly the bug this whole file exists to remove.
 */
export function onAnthropicKeyChanged(next: (keyIsSet: boolean) => void): void {
  listener = next;
}

function announce(): void {
  // Wrapped, because a listener that throws must not undo a key that has already been
  // stored. The store is the record; the gate is a consequence of it.
  try {
    listener?.(held.size > 0);
  } catch {
    // Nothing to do and nowhere safe to write it. The next change announces again.
  }
}

/**
 * Hold a key that Anthropic has just accepted.
 *
 * Only called after a successful check, and that ordering is the point. A key held here
 * is a key this process has proved, so `runner.ts` handing it to a subprocess is not a
 * guess and `readiness` dropping its blocker is not optimism.
 */
export function rememberAnthropicKey(founderId: string, key: string, checkedAt: Date): void {
  held.set(founderId, { founderId, key, checkedAt });
  announce();
}

/** Drop it. Called when a founder disconnects, and when a stored key stops working. */
export function forgetAnthropicKey(founderId: string): void {
  held.delete(founderId);
  announce();
}

/**
 * The key for one founder's turn, or the environment's, or nothing.
 *
 * THE FOUNDER ID IS COMPARED RATHER THAN IGNORED. `runner.ts` runs inside a founder
 * context and passes that context's id. A held key belonging to somebody else is not
 * returned, and the caller falls back to the environment, which is empty on a founder's
 * deployment. The turn then fails with a key problem instead of succeeding against the
 * wrong account, and failing is the correct end of that story.
 */
export function anthropicKeyFor(founderId: string, fallback: string): string {
  return held.get(founderId)?.key ?? fallback;
}

/**
 * The key for work that has no founder in scope, which today is the routing classifier.
 *
 * The classifier is built once for the process, before any founder exists, so it cannot be
 * given an id to check against. One founder per deployment makes "the deployment's key"
 * exact. TWO WOULD MAKE IT A GUESS, so with two it refuses and hands back the fallback:
 * routing then finds no match and the founder's sentence is handled as ordinary
 * conversation, which is a shrug rather than a wrong charge on somebody else's account.
 */
export function anthropicKeyForThisDeployment(fallback: string): string {
  if (held.size !== 1) return fallback;
  const only = held.values().next();
  return only.done === true ? fallback : only.value.key;
}

/** Whether this process has a key at all. This is the fact readiness turns into a blocker. */
export function anthropicKeyIsSet(): boolean {
  return held.size > 0;
}

/** What the setup screen renders. See AnthropicKeyDescription: no key material in it. */
export function describeAnthropicKey(founderId: string): AnthropicKeyDescription {
  const row = held.get(founderId);
  if (row === undefined) return { set: false, checkedAt: null, length: null };
  return { set: true, checkedAt: row.checkedAt.toISOString(), length: row.key.length };
}

/**
 * Take every held key out of a string before it is written down.
 *
 * WHY IT EXISTS RATHER THAN A RULE THAT NOBODY LOGS A KEY. The strings this app writes
 * down include text that came back from Anthropic, and what a vendor puts in an error
 * message is not ours to promise. One function, run over anything that is about to reach
 * a log or a screen, is a guard that holds whatever the vendor decides to say tomorrow.
 *
 * It replaces rather than truncating, because a partial key is still a leak: the rule for
 * this build is that no part of a key reaches a screen or a log, not even a short one.
 */
export function scrubAnthropicKeys(text: string): string {
  let out = text;
  for (const row of held.values()) {
    // split and join rather than a regular expression, because a key is a literal and
    // building a pattern out of one is a way to leak it into a stack trace.
    if (out.includes(row.key)) out = out.split(row.key).join('[the key]');
  }
  return out;
}

/** Test seam. Nothing in the app calls this, and its name is the reason. */
export function forgetEverythingForTests(): void {
  held.clear();
  listener = null;
}
