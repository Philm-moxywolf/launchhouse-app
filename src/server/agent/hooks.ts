/**
 * hooks.ts
 *
 * WHAT: The two SDK hooks this app registers. PostToolUse turns a write into a
 *       live file frame. PreCompact records that the next turn needs re
 *       anchoring.
 *
 * WHY IT EXISTS: PostToolUse is the moment the product feels real. A founder
 *       watches their Founder Brain appear in the file panel while they are
 *       still talking. It costs nothing and it is the difference between "is
 *       this doing anything" and "there it is".
 *
 *       PreCompact exists because compaction summarises, and "you are on step 3
 *       of 5" is exactly what a summary loses. Without the flag the model
 *       restarts a group of questions the founder has already answered, twenty
 *       minutes into an interview.
 *
 * CALLED BY: runner.ts, which passes these into Options.hooks.
 * READS:  the tool input, which is untrusted model output. WRITES: nothing
 *         directly. It calls back into the runner, which emits frames.
 *
 * A hook runs inside the turn and blocks it. So these do almost nothing: they
 * hand a fact to a callback and return. Anything slow belongs in harvest.
 */

import { friendlyFile, isFileWrite } from './labels.js';

/** Structural shape of the SDK's PostToolUse hook input. Kept minimal. */
export interface PostToolUseInput {
  readonly hook_event_name: 'PostToolUse';
  readonly tool_name: string;
  readonly tool_input: unknown;
  readonly tool_use_id: string;
}

/** Structural shape of the SDK's PreCompact hook input. */
export interface PreCompactInput {
  readonly hook_event_name: 'PreCompact';
  readonly trigger: 'manual' | 'auto';
}

/** What a hook returns. `continue: true` means carry on with the turn. */
export interface HookOutput {
  readonly continue: boolean;
  readonly suppressOutput?: boolean;
}

export interface HookDeps {
  /** Emits a `file` frame. The Files panel is listening for it. */
  readonly onFileWritten: (path: string) => void;
  /**
   * Called when founder-brain.md itself was written. The cached track column
   * is refreshed from the file, because the file wins and the column is the
   * bug when they disagree.
   */
  readonly onBrainChanged: () => void;
  /** Sets the re anchor flag for the next turn. */
  readonly onCompactStarting: (trigger: 'manual' | 'auto') => void;
}

/**
 * Fires after every Write and Edit. The path is read out of tool_input, which
 * is model output and therefore untrusted, so it is only used after it has been
 * matched against the known file list. An unrecognised path emits no frame at
 * all rather than putting an arbitrary string on a founder's screen.
 */
export function postToolUse(deps: HookDeps) {
  return async (input: PostToolUseInput): Promise<HookOutput> => {
    if (!isFileWrite(input.tool_name)) return { continue: true };

    const raw =
      typeof input.tool_input === 'object' && input.tool_input !== null
        ? (input.tool_input as { file_path?: unknown }).file_path
        : undefined;
    if (typeof raw !== 'string') return { continue: true };
    if (friendlyFile(raw) === null) return { continue: true };

    const relative = raw.replace(/\\/g, '/').replace(/^.*?growth-engine\//, '');
    deps.onFileWritten(relative);
    if (relative === 'founder-brain.md') deps.onBrainChanged();
    return { continue: true };
  };
}

/**
 * Fires just before the SDK compacts. The checkpoint itself happens on the
 * compact_boundary message in runner.ts, because that message carries the
 * token counts worth logging and this hook does not.
 */
export function preCompact(deps: HookDeps) {
  return async (input: PreCompactInput): Promise<HookOutput> => {
    deps.onCompactStarting(input.trigger);
    return { continue: true };
  };
}
