/**
 * src/web/lib/ghl-walk-view.ts
 *
 * WHAT IT IS
 * The small decisions the token walk screens need: which step a slug is, where the next and
 * previous ones are, whether a pasted value looks like a token, and the one line that lives
 * inside a button's meaning in the content file.
 *
 * WHY IT EXISTS
 * `app/content/ghl-walk.ts` holds every string in the walk, and the screens are supposed to
 * use it rather than restate it. Restating copy inside a component is how the seven scopes
 * drifted between two documents once already. So anything that looks like a sentence is
 * read out of the content file here, in one place, and the components render what they are
 * handed.
 *
 * The token shape check is here for a different reason. It is a guess. The `pit-` prefix is
 * inferred from our own shell, `receipt.sh:110` and `accounts.sh:127`, both of which refuse
 * a value matching it after lowercasing, and it has never been compared against a real
 * GoHighLevel token because no spike has run. A guess must not block a founder at 10pm
 * three weeks before the event, so this returns whether it looks right and the screen warns
 * and lets them continue. If real tokens turn out not to carry the prefix, this file and
 * one constant are the whole of the change.
 *
 * WHAT CALLS IT
 * The token walk screens.
 *
 * WHAT IT READS AND WRITES
 * Nothing. Pure functions over the content file.
 */

import { GHL_TOKEN_PREFIX_GUESS, GHL_WALK_STEPS } from "../../../app/content/ghl-walk.ts";
import type { WalkStep } from "../../../app/content/ghl-walk.ts";

export function stepBySlug(slug: string): WalkStep | undefined {
  return GHL_WALK_STEPS.find((s) => s.slug === slug);
}

/** The step after this one, or undefined at the end of the walk. */
export function nextStep(slug: string): WalkStep | undefined {
  const index = GHL_WALK_STEPS.findIndex((s) => s.slug === slug);
  return index === -1 ? undefined : GHL_WALK_STEPS[index + 1];
}

/**
 * Whether a pasted value looks like a GoHighLevel token.
 *
 * Lowercased before the comparison, the same way the shell does it, so a founder who pastes
 * `PIT-...` is not warned about nothing. Whitespace is trimmed because a copy out of a
 * browser usually brings some.
 */
export function tokenLooksRight(value: string): boolean {
  return value.trim().toLowerCase().startsWith(GHL_TOKEN_PREFIX_GUESS);
}

/**
 * The line step 1 shows when a founder says they are not sure whether they have bought
 * GoHighLevel.
 *
 * The sentence was written into that button's `meaning` in the content file, which is where
 * the copy for this walk lives. It is read from there rather than typed again here, so
 * somebody editing the copy end to end changes it in the file they are reading.
 */
export function notSureLine(): string {
  const step = stepBySlug("have-it");
  const button = step?.buttons.find((b) => b.label === "I am not sure");
  const meaning = button?.meaning ?? "";
  const at = meaning.indexOf(": ");
  const sentence = at === -1 ? meaning : meaning.slice(at + 2);
  return capitaliseFirst(sentence);
}

/** A sentence written mid line in the content file, shown as a sentence on screen. */
export function capitaliseFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
