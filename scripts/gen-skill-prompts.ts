/**
 * scripts/gen-skill-prompts.ts
 *
 * WHAT THIS IS. The generator behind the SkillBodies port. It reads the nine
 * ported skill bodies in app/content/skills/<name>/SKILL.md, strips the
 * frontmatter, normalises the bytes, and writes one typed map to
 * app/content/skill-bodies.generated.ts. That map is committed and imported,
 * so no founder's turn ever waits on a file read.
 *
 * WHY IT EXISTS. Three failures, and the third is the expensive one.
 *
 *   A TURN THAT FAILS BECAUSE A FILE WAS MISSING. src/server/agent/ports.ts
 *   says it out loud: the bodies are read at build time and not at run time on
 *   purpose. A missing directory on a container is a deploy that fails to
 *   typecheck here, not 65 founders in a room watching a spinner.
 *
 *   FRONTMATTER REACHING THE MODEL. Every SKILL.md opens with a YAML block
 *   naming the skill and listing its trigger phrases. That block is routing
 *   metadata for the plugin loader. The app owns routing, so the block is
 *   noise: it spends tokens telling the model to trigger on phrases the server
 *   already matched.
 *
 *   A CACHEABLE PREFIX THAT IS NOT BYTE IDENTICAL. This is the one that costs
 *   money. assemble.ts puts the skill body in systemPrompt.append precisely
 *   because roughly 65 founders on one route and one track then share a prompt
 *   cache prefix. A prefix that differs by one byte between two founders is two
 *   prefixes, and the bill is about three times what it should be. So this
 *   generator is DETERMINISTIC: the same nine files produce a byte identical
 *   output file, on any machine, in any order the filesystem hands them over.
 *   Everything below that could vary is pinned:
 *
 *     - directories are read, then sorted, before anything is emitted
 *     - CRLF is normalised to LF, so a body edited on Windows and a body edited
 *       on a Mac hash the same
 *     - trailing whitespace at the end of a body collapses to exactly one
 *       newline
 *     - nothing carries a timestamp, a hostname, a path or a version number
 *
 *   `--check` re-runs the generation in memory and compares it against the
 *   committed file. That is the proof, and it is cheap enough to run in CI.
 *
 * WHAT CALLS IT. `npm run skills:gen`. Nothing imports it at run time.
 *
 * WHAT IT READS. app/content/skills/<name>/SKILL.md, and nothing else.
 * WHAT IT WRITES. app/content/skill-bodies.generated.ts, and nothing else.
 *
 * THE UNFORKED TWIN, AND WHY IT IS HERE RATHER THAN IN assemble.ts.
 *
 *   Two of the nine bodies carry both tracks' prose behind
 *   `<!-- TRACK:b2b -->` markers, and assemble.ts strips the blocks belonging
 *   to the other track before the body reaches the model. That is rule 1, and
 *   it is right for every route except the one where the founder has not
 *   chosen yet.
 *
 *   A founder starting their first Founder Brain has no track. The intake asks
 *   them the fork question and then, three questions later, asks the B2B
 *   audience questions or the B2C ones depending on the answer. Strip either
 *   block before they have answered and the model can only ask one branch, so
 *   roughly half the cohort is interviewed as the wrong kind of business.
 *
 *   `RunFacts.track` is typed `Track`, which is 'b2b' | 'b2c'. It cannot say
 *   "not chosen yet", so a FactsSource cannot report the truth about a founder
 *   who has not forked. Until that port can, this generator emits a second key
 *   for every body carrying markers, `<skill>#unforked`, with the marker LINES
 *   removed and BOTH branches kept. stripOtherTrack is then a no operation on
 *   it, and a trackless founder is handed the whole intake.
 *
 *   It is a stable key like any other, so it caches like any other. The
 *   moment the port can carry a null track this twin should be deleted and the
 *   strip taught to keep both. See NOTE_UNFORKED below, which is the string a
 *   later reader will grep for.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, resolved from this file rather than from the shell's cwd. */
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(APP_ROOT, 'app', 'content', 'skills');
const OUTPUT = join(APP_ROOT, 'app', 'content', 'skill-bodies.generated.ts');

/** The suffix on an unforked twin. One constant, used by the generator and the wiring. */
export const UNFORKED_SUFFIX = '#unforked';

/** A track marker on a line of its own. Same shapes assemble.ts accepts. */
const TRACK_MARKER = /^<!--\s*(?:TRACK:(?:b2b|b2c)|\/TRACK)\s*-->$/;

export interface SkillSource {
  /** The directory name, which is the key the routing table's `skill` field holds. */
  readonly name: string;
  /** The body, frontmatter removed and bytes normalised. */
  readonly body: string;
  /** True when the body carries track markers and therefore earns a twin. */
  readonly forked: boolean;
}

/**
 * Remove the YAML frontmatter block, if there is one.
 *
 * Deliberately strict about the shape: the block must be the very first thing
 * in the file and must close on a line that is exactly three dashes. A body
 * that opens with a horizontal rule instead of frontmatter is left alone,
 * because silently eating the first section of a skill is a failure nobody
 * would notice until a founder's interview skipped a step.
 */
export function stripFrontmatter(text: string): string {
  const lines = text.split('\n');
  if ((lines[0] ?? '').trim() !== '---') return text;
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() === '---') return lines.slice(i + 1).join('\n');
  }
  // An opener with no closer. Fail closed rather than guess where it ended: a
  // truncated skill reads as a working skill and is not one.
  throw new Error('frontmatter opened with --- and never closed');
}

/**
 * The bytes, pinned.
 *
 * A carriage return that survives into the body is invisible in every editor
 * and halves the prompt cache hit rate, because the founder whose skill was
 * last edited on Windows no longer shares a prefix with the other 64. Leading
 * blank lines go for the same reason: they are what a stripped frontmatter
 * leaves behind, and they differ by editor.
 */
export function normaliseBody(text: string): string {
  return `${text.replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '')}\n`;
}

/** The twin: marker lines removed, both branches kept. See NOTE_UNFORKED. */
export function withoutTrackMarkers(body: string): string {
  return body
    .split('\n')
    .filter((line) => !TRACK_MARKER.test(line.replace(/\r$/, '').trim()))
    .join('\n');
}

/** True when this body has at least one track marker in it. */
export function hasTrackMarkers(body: string): boolean {
  return body.split('\n').some((line) => TRACK_MARKER.test(line.replace(/\r$/, '').trim()));
}

/**
 * Read the nine bodies, in one fixed order.
 *
 * The sort is the determinism. readdir returns whatever order the filesystem
 * feels like, which is inode order on ext4 and alphabetical on APFS, and an
 * output file whose key order depends on which machine generated it is an
 * output file that shows a diff on every regeneration.
 */
export function readSkills(dir: string = SKILLS_DIR): SkillSource[] {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (names.length === 0) throw new Error(`no skills found under ${dir}`);

  return names.map((name) => {
    const body = normaliseBody(stripFrontmatter(readFileSync(join(dir, name, 'SKILL.md'), 'utf8')));
    if (body.trim().length === 0) throw new Error(`${name}/SKILL.md is empty once the frontmatter is off`);
    return { name, body, forked: hasTrackMarkers(body) };
  });
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * A body as a TypeScript literal.
 *
 * Emitted as an array of JSON encoded lines joined on a newline rather than as
 * one long string, so that a diff of the generated file shows which line of the
 * skill changed. A regeneration that shows one changed line is reviewable; one
 * that shows one changed 10 KB line is not, and this file is the thing a
 * reviewer checks when a founder reports the model asked the wrong question.
 */
function encodeBody(body: string): string {
  const lines = body.split('\n').map((line) => `    ${JSON.stringify(line)},`);
  return `[\n${lines.join('\n')}\n  ].join('\\n')`;
}

/** The whole output file, as a string. Pure: same input, same bytes, always. */
export function render(skills: readonly SkillSource[]): string {
  const entries: { key: string; body: string }[] = [];
  for (const skill of skills) {
    entries.push({ key: skill.name, body: skill.body });
    if (skill.forked) entries.push({ key: `${skill.name}${UNFORKED_SUFFIX}`, body: withoutTrackMarkers(skill.body) });
  }
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const header = [
    '/**',
    ' * app/content/skill-bodies.generated.ts',
    ' *',
    ' * GENERATED FROM app/content/skills/<name>/SKILL.md. DO NOT EDIT BY HAND.',
    ' * Regenerate with: npm run skills:gen',
    ' * Check without writing: npm run skills:gen -- --check',
    ' *',
    ' * WHAT IT IS',
    ' * The nine skill bodies, frontmatter removed, as one typed map. This is the',
    ' * cacheable half of every prompt this app sends.',
    ' *',
    ' * WHY IT EXISTS',
    ' * A founder turn must never fail because a file read failed, so the bodies are',
    ' * compiled in rather than read from disk. And the bytes must be identical for',
    ' * every founder on one route, because that identity is what makes the prompt',
    ' * cache work across roughly 65 people. scripts/gen-skill-prompts.ts is',
    ' * deterministic for that reason, and tests/unit/gen-skill-prompts.test.ts',
    ' * proves it.',
    ' *',
    ' * A key ending in #unforked is the same body with the track marker lines',
    ' * removed and both branches kept. It is what a founder who has not chosen a',
    ' * track yet is handed, so their first Founder Brain can ask either branch.',
    ' *',
    ' * WHAT CALLS IT',
    ' * src/server/routes/agent-content.ts, which adapts it to the SkillBodies port.',
    ' *',
    ' * WHAT IT READS AND WRITES',
    ' * Nothing. It is data.',
    ' */',
    '',
  ].join('\n');

  const bodyLines = entries.map((e) => `  ${JSON.stringify(e.key)}: ${encodeBody(e.body)},`).join('\n');
  const shaLines = entries.map((e) => `  ${JSON.stringify(e.key)}: ${JSON.stringify(sha256(e.body))},`).join('\n');

  return [
    header,
    '/** Every body, keyed by the routing table\'s `skill` field. Sorted, always. */',
    'export const SKILL_BODIES: Readonly<Record<string, string>> = {',
    bodyLines,
    '};',
    '',
    '/**',
    ' * sha256 of each body.',
    ' *',
    ' * Here so a deployment can print what it is actually running and a cost report',
    ' * can group by it. Two containers serving one route must print the same hash,',
    ' * and if they do not, the prompt cache is not being shared and the bill says so.',
    ' */',
    'export const SKILL_BODY_SHA256: Readonly<Record<string, string>> = {',
    shaLines,
    '};',
    '',
    '/** The keys, in the order they are declared above. */',
    'export const SKILL_KEYS: readonly string[] = Object.keys(SKILL_BODIES);',
    '',
  ].join('\n');
}

function main(argv: readonly string[]): number {
  const check = argv.includes('--check');
  const skills = readSkills();
  const rendered = render(skills);

  if (check) {
    let current: string;
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {
        console.error(`${OUTPUT} does not exist. Run: npm run skills:gen`);
      return 1;
    }
    if (current !== rendered) {
        console.error(
        `${OUTPUT} is out of date with app/content/skills/. Run: npm run skills:gen`,
      );
      return 1;
    }
    console.log(`skill bodies are up to date: ${String(skills.length)} skills read`);
    return 0;
  }

  writeFileSync(OUTPUT, rendered, 'utf8');
  console.log(
    `wrote ${OUTPUT}\n  ${String(skills.length)} skills, ${String(skills.filter((s) => s.forked).length)} with track markers\n  source sha256 ${sha256(skills.map((s) => `${s.name}\n${s.body}`).join('\n'))}`,
  );
  return 0;
}

// Run only when this file is the entry point, so the exported functions above
// can be imported by a test without the test writing a file. Compared as
// resolved paths rather than by building a file:// URL from argv, because a
// checkout under a path with a space in it produces a URL that never matches.
const invokedAs = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invokedAs !== null && invokedAs === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
