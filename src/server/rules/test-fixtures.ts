/**
 * test-fixtures.ts: the two worked example founders, loaded from the content
 *   repo rather than copied into this repo.
 *
 * WHY IT EXISTS: the tests in this folder need real founder material, and there
 *   are exactly two files in the world that are it: the Brains for Sam Okoye
 *   and Priya Raman in `plugins/growth-engine/assets/examples/`. Pasting a copy
 *   in here would create a second version that drifts, and a rules gate tested
 *   against a stale copy of the standard is a rules gate that passes things the
 *   real standard would refuse.
 *
 *   These two founders are fictional, which is why they may sit in tests at
 *   all. No real founder data is ever a fixture.
 *
 * CALLED BY: the tests in this folder only. Nothing in the running server
 *   imports this.
 * READS:     `plugins/growth-engine/assets/examples/<folder>/founder-brain.md`.
 * WRITES:    nothing.
 */

import { readContentFile } from './content-root.ts';
import type { Track } from './types.ts';

const FOLDERS: Record<Track, string> = {
  b2b: 'b2b-northfield',
  b2c: 'b2c-lumen',
};

/** The Brain for the worked example on that track, as text. */
export function exampleBrain(track: Track): string {
  return readContentFile(
    `plugins/growth-engine/assets/examples/${FOLDERS[track]}/founder-brain.md`,
  );
}

/** The same Brain wrapped as an artifact the gate can be handed. */
export function exampleBrainArtifact(track: Track): {
  path: string;
  text: string;
  authored: 'model';
} {
  return { path: 'founder-brain.md', text: exampleBrain(track), authored: 'model' };
}
