/**
 * src/web/lib/track.ts
 *
 * WHAT IT IS
 * The one place the browser decides what a founder on a track is allowed to see. Four pure
 * functions and a type. No component filters anything by track itself.
 *
 * WHY IT EXISTS
 * Rule 1. Two tracks, forked once in the Founder Brain, and a founder never sees the other
 * track's material. In the plugin that was a sentence in a skill and the model was trusted
 * to obey it. Here it is a filter, and the failure it prevents is a B2C founder being shown
 * a cold email sequence, or the word Apollo, on the Saturday of the event.
 *
 * The rule the whole file turns on: **not known yet is not a default**. The track does not
 * exist until the Brain locks it, and a founder can reach Home, Files and Gates before that
 * happens. Guessing a track to have something to show would fork half the cohort the wrong
 * way. So `null` means only the material that belongs to both tracks may render, and a row
 * that belongs to exactly one track cannot appear at all.
 *
 * Structural, not presentational. `routesForTrack` in the routing table already filters, and
 * the server filters again before it answers. This is the third filter, and it is the one
 * that holds when a response arrives carrying a row it should not have: the browser drops
 * it rather than rendering it. Three filters for one rule is the right number when the cost
 * of being wrong is 65 people reading the wrong programme.
 *
 * WHAT CALLS IT
 * Home, Files, Gates and Setup. Nothing else may filter by track.
 *
 * WHAT IT READS AND WRITES
 * Nothing. It is pure functions over the routing table, the gate table and a response body.
 */

import { ROUTES } from "../../../app/content/routes.ts";
import type { RouteRow, Track } from "../../../app/content/routes.ts";
import { GATES, gateFilesForTrack, gatesForTrack } from "../../../app/content/gates.ts";
import type { Gate, GateFileRow } from "../../../app/content/gates.ts";
import type { FileRow } from "./api.ts";

/**
 * Rows that belong to both tracks.
 *
 * A row naming exactly one track is that track's material, whatever else it says, so the
 * test for "safe before the track is known" is the length of `tracks`, not a list of ids
 * somebody keeps up to date.
 */
function isForBothTracks(row: RouteRow): boolean {
  return row.tracks.includes("b2b") && row.tracks.includes("b2c");
}

/**
 * The route cards a founder may see.
 *
 * Hidden rows never appear: `playbook-export` is ported and not offered, and the reason is
 * written next to it in the table.
 */
export function visibleRoutes(track: Track | null): readonly RouteRow[] {
  const offered = ROUTES.filter((r) => !r.hidden);
  if (track === null) return offered.filter(isForBothTracks);
  return offered.filter((r) => r.tracks.includes(track));
}

/**
 * True when this founder may open this route.
 *
 * Checked on every navigation, because a URL can be typed and a link can be pasted into
 * Slack by a mentor who has the other track open in another tab.
 */
export function mayOpenRoute(id: string, track: Track | null): boolean {
  return visibleRoutes(track).some((r) => r.id === id);
}

/**
 * The file rows this founder may see.
 *
 * `ge index` already forks on the Track line, so in the ordinary case every row that
 * arrives is already theirs. This drops the row anyway if it is not, which is what makes a
 * bug on the other side of the wire a missing row rather than the other track's material.
 */
export function visibleFileRows(rows: readonly FileRow[], track: Track | null): readonly FileRow[] {
  if (track === null) return rows.filter((r) => r.track === "both");
  return rows.filter((r) => r.track === "both" || r.track === track);
}

/** The gate file table for this founder, from `schemas/gates.md` by way of gates.ts. */
export function visibleGateFiles(track: Track | null): readonly GateFileRow[] {
  if (track === null) return gateFilesForTrack("b2b").filter((f) => f.track === "both");
  return gateFilesForTrack(track);
}

/**
 * The gate lists for this founder.
 *
 * Gate C is written twice, once per track, and the two lists are different work. Before the
 * track is known only the gates that apply to both are shown, so a founder is never told to
 * write first lines they will not be asked for.
 */
export function visibleGates(track: Track | null): readonly Gate[] {
  if (track === null) return GATES.filter((g) => g.track === "both");
  return gatesForTrack(track);
}

/**
 * Whether the Apollo row exists at all.
 *
 * Section 6 is explicit and this is the whole of it: for a B2C founder the row does not
 * exist in their rail, their receipt carries no Apollo line, not even a skip, and the word
 * does not appear anywhere in their app. A skip line saying "not needed on your track" is
 * still the other track's material on their screen.
 */
export function apolloRowExists(track: Track | null): boolean {
  return track === "b2b";
}
