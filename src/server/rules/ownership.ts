/**
 * ownership.ts: rule 4. Everything the founder makes is theirs, visible and
 *   downloadable.
 *
 * WHY IT EXISTS: on a laptop this rule held itself. The files were in a folder
 *   the founder could open, and if they could not find the folder that was
 *   their problem and their fix. On a server it is our problem, and the ways to
 *   break it are quiet ones. A file written outside `growth-engine/` never
 *   reaches the files view or the download. A file written to a name nothing
 *   lists is on disk and invisible, which is worse than absent because the
 *   founder is told it exists. And a rewrite that tidies up the founder's own
 *   sentences takes something that was theirs and makes it ours.
 *
 *   That last one is the ported version of `tests/cases/26-founder-prose.sh`
 *   from the content repo, which exists because `memory.md` says "Anything
 *   below this heading is yours, ge never writes here" and ordinary commands
 *   were breaking that promise. On a laptop a shell test could catch it. Here
 *   it has to be checked on the way past, because the writer is a model.
 *
 * WHAT IT CHECKS
 *   1. Containment. The path sits inside `growth-engine/`, is relative, has no
 *      `..` in it, and is not absolute.
 *   2. Visibility. The path is one the files view and the ZIP will list: a file
 *      gates.md names, a `.state/` file, or a person file whose name follows the
 *      derive rule in `schemas/person.md`.
 *   3. The founder's own blocks. Everything outside ge's markers, and
 *      everything under `## Yours`, is byte for byte what it was.
 *
 * WHAT IT DOES NOT CHECK, and why: the size and count limits. Those are
 *   storage's, they are refused before the write, and a second copy of a limit
 *   is a second number to keep in step.
 *
 * CALLED BY: index.ts, before an artifact is saved.
 * READS:     `schemas/gates.md` through gates-source.ts, and the twelve schema
 *            files, for the line in each that says where its file lives.
 * WRITES:    nothing.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { contentRoot } from './content-root.ts';
import { gatesSource } from './gates-source.ts';
import {
  locate,
  resultFrom,
  type Artifact,
  type RuleResult,
  type Violation,
} from './types.ts';

const RULE = 'ownership' as const;

/**
 * Files `ge` writes that gates.md does not list, because they are not gate
 * work. They are still the founder's and still appear in the files view, behind
 * the disclosure the build document describes.
 *
 * Read out of the twelve schema files rather than typed here. Every schema
 * opens with a line saying where its file lives, and that line is the answer.
 * A hand written list would be a thirteenth place the set of files is recorded,
 * and it would be the one nobody updates.
 */
function schemaDeclaredPaths(): string[] {
  const dir = join(contentRoot(), 'plugins', 'growth-engine', 'schemas');
  const found = new Set<string>();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const text = readFileSync(join(dir, entry), 'utf8');
    for (const match of text.matchAll(/lives at `growth-engine\/([^`]+)`/g)) {
      const path = match[1];
      if (path !== undefined) found.add(path);
    }
  }
  if (found.size === 0) {
    throw new Error(
      'No schema in the content repo says where its file lives, so the rules gate cannot tell a real file from an invisible one.\nIt refuses to run rather than let a founder be handed a file nothing lists.\nFix: check the schemas folder in the content repo.',
    );
  }
  return [...found];
}

/**
 * The paths the schemas declare, for sources-ready.ts.
 *
 * Exported so the one place that forces every disk-backed list to load can
 * force this one too. It is the rule 4 equivalent of the banned word list: an
 * empty answer here means every file the model writes looks unlisted, and the
 * rule stops being able to tell a real file from an invisible one.
 */
export function listedPaths(): readonly string[] {
  return schemaDeclaredPaths();
}

let stateFilesCache: readonly string[] | null = null;

/** Only for tests that load a different content tree. */
export function resetOwnershipCacheForTests(): void {
  stateFilesCache = null;
}

function stateFiles(): readonly string[] {
  if (stateFilesCache === null) {
    stateFilesCache = schemaDeclaredPaths().filter((p) => p.startsWith('.state/'));
  }
  return stateFilesCache;
}

/** Folders inside `growth-engine/` a founder's own material may sit in. */
const KNOWN_FOLDERS: readonly string[] = ['people/', 'voice-samples/', 'snapshots/', '.state/'];

/**
 * The person file name rule, copied in behaviour from `schemas/person.md`:
 * lower case, every character that is not a letter or a digit becomes a dash,
 * runs of dashes collapse to one, leading and trailing dashes go, and the
 * result is cut to 60 characters.
 */
const PERSON_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PERSON_SLUG_MAX = 60;

/** The marker convention, from `schemas/memory.md` and `schemas/person.md`. */
const GE_BLOCK = /<!-- GE:([A-Z]+):START -->([\s\S]*?)<!-- GE:\1:END -->/g;

/** The heading under which nothing but the founder ever writes. */
const YOURS_HEADING = /^##\s+Yours\s*$/m;

export interface OwnershipOptions {
  /**
   * The previous version of this file, when there is one.
   *
   * Without it the founder's own writing cannot be compared, and the check says
   * so in a note rather than passing quietly.
   */
  previous?: string;
}

function isPersonPath(path: string): boolean {
  return path.startsWith('people/');
}

function checkContainment(artifact: Artifact, out: Violation[]): boolean {
  const path = artifact.path;
  const where = { path, line: 1, column: 1, excerpt: path };

  const problems: Array<[string, string]> = [];
  if (path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)) {
    problems.push(['ownership.absolute-path', 'starts from the root of a disk']);
  }
  if (path.split('/').includes('..')) {
    problems.push(['ownership.escapes-folder', 'climbs out of the folder with ..']);
  }
  if (path.includes('\\')) {
    problems.push(['ownership.backslash-path', 'uses a backslash, which is not a folder separator here']);
  }
  if (path.trim() !== path || path === '') {
    problems.push(['ownership.odd-path', 'has spaces at one end, or is empty']);
  }

  for (const [code, what] of problems) {
    out.push({
      rule: RULE,
      code,
      severity: 'block',
      where,
      found: path,
      message: `This was heading for a place that ${what}, which is outside your folder.`,
      why: 'Everything made for you lands in the one folder you can open and download. A file written anywhere else sits on a machine you cannot reach, so it may as well not exist.',
      recovery: { label: 'See your files', action: { kind: 'route', skill: 'status' } },
    });
  }
  return problems.length === 0;
}

function checkVisibility(artifact: Artifact, out: Violation[]): void {
  const path = artifact.path;
  const listed = new Set(gatesSource().files.map((f) => f.file));

  if (listed.has(path) || stateFiles().includes(path)) return;

  if (isPersonPath(path)) {
    const name = path.slice('people/'.length);
    if (name === 'README.md') return;
    const slug = name.replace(/\.md$/, '');
    if (name.endsWith('.md') && PERSON_SLUG.test(slug) && slug.length <= PERSON_SLUG_MAX) return;
    out.push({
      rule: RULE,
      code: 'ownership.unlistable-person-file',
      severity: 'block',
      where: { path, line: 1, column: 1, excerpt: path },
      found: name,
      message: `A person saved as "${name}" would not show up in your people list.`,
      why: 'Every person is filed under their address or their handle, always the same way, so you can find them by typing it. Filed any other way, they are somebody you cannot look up and cannot delete.',
      recovery: { label: 'Add them again', action: { kind: 'reply' } },
    });
    return;
  }

  const inKnownFolder = KNOWN_FOLDERS.some((f) => path.startsWith(f));
  out.push({
    rule: RULE,
    code: 'ownership.not-listed',
    severity: inKnownFolder ? 'warn' : 'block',
    where: { path, line: 1, column: 1, excerpt: path },
    found: path,
    message: inKnownFolder
      ? `"${path}" is in your folder, and nothing lists it by name yet, so it is easy to miss.`
      : `"${path}" is not something your files view knows how to show, so it would sit there without ever appearing.`,
    why: 'Your files view and your download are both built from a list. A file that is not on that list is somewhere you cannot open it, and knowing it exists only makes that more annoying.',
    recovery: { label: 'See your files', action: { kind: 'route', skill: 'status' } },
  });
}

/**
 * The text with every `<!-- GE:...:START -->` block reduced to its name.
 *
 * Reduced to a name rather than blanked to the same length, because a touch log
 * that gained a line is longer than it was, and a length preserving blank would
 * report that ordinary growth as a rewrite of the founder's prose around it.
 */
function outsideGeBlocks(text: string): string {
  return text.replace(GE_BLOCK, (_whole, name: string) => `<GE:${name}>`);
}

/** The two halves of a file: everything before `## Yours`, and everything under it. */
function splitAtYours(text: string): { ours: string; theirs: string | null } {
  const match = YOURS_HEADING.exec(text);
  if (!match || match.index === undefined) return { ours: text, theirs: null };
  return {
    ours: text.slice(0, match.index),
    theirs: text.slice(match.index + match[0].length),
  };
}

function checkFounderWriting(
  artifact: Artifact,
  previous: string | undefined,
  out: Violation[],
  notes: string[],
): void {
  if (artifact.authored === 'founder') return;

  if (previous === undefined) {
    notes.push(
      `There was no earlier version of ${artifact.path} to compare, so the founder's own blocks were not checked.`,
    );
    return;
  }

  const was = splitAtYours(previous);
  const now = splitAtYours(artifact.text);

  if (was.theirs !== null && now.theirs !== was.theirs) {
    const at = artifact.text.search(YOURS_HEADING);
    out.push({
      rule: RULE,
      code: 'ownership.rewrote-yours',
      severity: 'block',
      where: locate(artifact.path, artifact.text, at < 0 ? 0 : at),
      found: '## Yours',
      message: 'Your own notes under "Yours" came back changed, and nothing but you writes in there.',
      why: 'That section is yours. A space tidied, a heading nudged, none of it asked for. Your words come back exactly as you left them or the promise is not worth making.',
      recovery: { label: 'Open the file and check that section', action: { kind: 'edit', path: artifact.path } },
    });
  }

  // Above `## Yours`, the marked blocks are the toolkit's to rewrite and
  // everything around them is copied through. Compared with the blocks blanked
  // out, so a changed touch log does not read as a rewritten sentence.
  if (outsideGeBlocks(was.ours) !== outsideGeBlocks(now.ours)) {
    out.push({
      rule: RULE,
      code: 'ownership.rewrote-outside-markers',
      severity: 'warn',
      where: { path: artifact.path, line: 1, column: 1, excerpt: artifact.path },
      found: artifact.path,
      message: 'Something outside the parts this toolkit looks after has changed in this file. Worth a glance.',
      why: 'The marked blocks get rewritten each time. Everything around them is yours and is meant to be copied through untouched.',
      recovery: { label: 'Open the file and compare', action: { kind: 'edit', path: artifact.path } },
    });
  }
}

/** Run rule 4 over one artifact. */
export function checkOwnership(
  artifact: Artifact,
  options: OwnershipOptions = {},
): RuleResult {
  const violations: Violation[] = [];
  const notes: string[] = [];

  const pathIsSound = checkContainment(artifact, violations);
  if (pathIsSound) checkVisibility(artifact, violations);
  checkFounderWriting(artifact, options.previous, violations, notes);

  return resultFrom(RULE, [artifact.path], violations, notes);
}

/**
 * Every path a founder must be able to see and download, given their track.
 *
 * The files view and the ZIP are built from this. It is here rather than in the
 * files route so that the rule and the screen cannot disagree about what rule 4
 * covers.
 */
export function visiblePaths(track: 'b2b' | 'b2c' | null): string[] {
  const rows = gatesSource().files.filter(
    (f) => f.track === 'both' || (track !== null && f.track === track),
  );
  return [...rows.map((f) => f.file), ...stateFiles()];
}
