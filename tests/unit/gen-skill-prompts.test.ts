/**
 * tests/unit/gen-skill-prompts.test.ts
 *
 * WHAT THIS IS. The proof that scripts/gen-skill-prompts.ts is deterministic,
 * that the file it committed matches the skills on disk, and that the bodies it
 * emits are the ones assemble.ts expects to be handed.
 *
 * WHY IT EXISTS. The generator has one job that cannot be checked by reading
 * it: same input, byte identical output. That property is what the whole cost
 * model rests on, because the prompt cache only fires on an identical prefix
 * and roughly 65 founders share one prefix per route and track. A generator
 * that emits keys in filesystem order, or that lets a carriage return through,
 * produces a file that looks correct in review and doubles the bill.
 *
 * The second job is the one a reader would not think to check. Two skill bodies
 * carry both tracks' prose behind markers, and a founder who has not chosen a
 * track yet must be handed both branches. The `#unforked` twin is how that
 * happens, and the assertions below are what stop it quietly becoming a copy of
 * the b2b half.
 *
 * WHAT IT READS. app/content/skills/, and the committed generated file.
 * WHAT IT WRITES. Nothing.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  hasTrackMarkers,
  normaliseBody,
  readSkills,
  render,
  stripFrontmatter,
  UNFORKED_SUFFIX,
  withoutTrackMarkers,
  type SkillSource,
} from '../../scripts/gen-skill-prompts.ts';
import { stripOtherTrack } from '../../src/server/agent/assemble.ts';
import { SKILL_BODIES, SKILL_BODY_SHA256, SKILL_KEYS } from '../../app/content/skill-bodies.generated.ts';
import { ROUTES } from '../../app/content/routes.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = join(APP_ROOT, 'app', 'content', 'skill-bodies.generated.ts');

describe('gen-skill-prompts is deterministic', () => {
  it('renders byte identical output twice from the same input', () => {
    const skills = readSkills();
    assert.equal(render(skills), render(skills));
  });

  it('does not depend on the order the filesystem hands the directories over', () => {
    const skills = readSkills();
    const reversed = [...skills].reverse();
    const shuffled = [skills[3], skills[0], skills[7], ...skills.filter((_, i) => ![0, 3, 7].includes(i))].filter(
      (s): s is SkillSource => s !== undefined,
    );
    assert.equal(render(reversed), render(skills));
    assert.equal(render(shuffled), render(skills));
  });

  it('normalises CRLF, so a body edited on Windows hashes like one edited on a Mac', () => {
    const unix = '# Title\n\nA line.\nAnother.\n';
    const windows = '# Title\r\n\r\nA line.\r\nAnother.\r\n';
    assert.equal(normaliseBody(windows), normaliseBody(unix));
  });

  it('collapses trailing whitespace to exactly one newline', () => {
    assert.equal(normaliseBody('# Title\n\n\n   \n'), '# Title\n');
    assert.equal(normaliseBody('# Title'), '# Title\n');
  });

  it('strips leading blank lines left behind by the frontmatter', () => {
    assert.equal(normaliseBody('\n\n\n# Title\n'), '# Title\n');
  });

  it('the committed file is what the skills on disk generate', () => {
    // This is `npm run skills:gen -- --check` as a test, so a skill edited
    // without regenerating fails here rather than at a founder's first turn.
    assert.equal(readFileSync(OUTPUT, 'utf8'), render(readSkills()));
  });
});

describe('gen-skill-prompts strips the frontmatter', () => {
  it('removes a leading YAML block and keeps everything after it', () => {
    const text = '---\nname: x\ndescription: y\n---\n\n# Heading\n\nBody.\n';
    assert.equal(stripFrontmatter(text), '\n# Heading\n\nBody.\n');
  });

  it('leaves a body alone when it does not open with a block', () => {
    const text = '# Heading\n\n---\n\nA horizontal rule is not frontmatter.\n';
    assert.equal(stripFrontmatter(text), text);
  });

  it('refuses a block that opens and never closes, rather than truncating a skill', () => {
    assert.throws(() => stripFrontmatter('---\nname: x\n\n# Heading\n'), /never closed/);
  });

  it('no generated body still carries its frontmatter', () => {
    for (const key of SKILL_KEYS) {
      const body = SKILL_BODIES[key] ?? '';
      assert.ok(!body.startsWith('---'), `${key} still opens with a frontmatter fence`);
      assert.ok(!/^description:/m.test(body.split('\n').slice(0, 3).join('\n')), `${key} still carries a description line`);
    }
  });
});

describe('the generated map covers the routing table', () => {
  it('every route names a skill that exists', () => {
    for (const route of ROUTES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(SKILL_BODIES, route.skill),
        `route ${route.id} names skill ${route.skill}, which is not in the generated map`,
      );
    }
  });

  it('every body is non empty and hashed', () => {
    for (const key of SKILL_KEYS) {
      assert.ok((SKILL_BODIES[key] ?? '').trim().length > 0, `${key} is empty`);
      assert.match(SKILL_BODY_SHA256[key] ?? '', /^[0-9a-f]{64}$/, `${key} has no hash`);
    }
  });

  it('no body carries a carriage return', () => {
    for (const key of SKILL_KEYS) {
      assert.ok(!(SKILL_BODIES[key] ?? '').includes('\r'), `${key} carries a carriage return`);
    }
  });
});

describe('the unforked twin keeps both branches', () => {
  const forked = readSkills().filter((s) => s.forked);

  it('there is at least one forked body, or this whole mechanism is dead code', () => {
    assert.ok(forked.length > 0);
  });

  it('emits a twin for every body carrying markers, and only those', () => {
    const twins = SKILL_KEYS.filter((k) => k.endsWith(UNFORKED_SUFFIX));
    assert.deepEqual(
      [...twins].sort(),
      forked.map((s) => `${s.name}${UNFORKED_SUFFIX}`).sort(),
    );
  });

  it('a twin has no markers left, so stripOtherTrack cannot remove anything from it', () => {
    for (const skill of forked) {
      const twin = SKILL_BODIES[`${skill.name}${UNFORKED_SUFFIX}`] ?? '';
      assert.ok(!hasTrackMarkers(twin), `${skill.name} twin still has markers`);
      assert.equal(stripOtherTrack(twin, 'b2b'), twin);
      assert.equal(stripOtherTrack(twin, 'b2c'), twin);
    }
  });

  it('a twin keeps prose that either single track body would have dropped', () => {
    for (const skill of forked) {
      const twin = SKILL_BODIES[`${skill.name}${UNFORKED_SUFFIX}`] ?? '';
      const original = SKILL_BODIES[skill.name] ?? '';
      const b2bOnly = stripOtherTrack(original, 'b2b');
      const b2cOnly = stripOtherTrack(original, 'b2c');
      // Whatever the b2b run keeps and the b2c run drops is branch prose. The
      // twin has to hold both sides of it, or a trackless founder is being
      // interviewed as one kind of business before they have said which.
      assert.ok(twin.length > b2bOnly.length, `${skill.name} twin is not longer than the b2b body`);
      assert.ok(twin.length > b2cOnly.length, `${skill.name} twin is not longer than the b2c body`);
    }
  });

  it('the founder-brain twin asks both the B2B and the B2C audience questions', () => {
    const twin = SKILL_BODIES[`founder-brain${UNFORKED_SUFFIX}`] ?? '';
    assert.match(twin, /If track is B2B/);
    assert.match(twin, /If track is B2C/);
  });

  it('withoutTrackMarkers removes only the marker lines', () => {
    const body = ['before', '<!-- TRACK:b2b -->', 'b2b prose', '<!-- /TRACK -->', 'after'].join('\n');
    assert.equal(withoutTrackMarkers(body), ['before', 'b2b prose', 'after'].join('\n'));
  });
});
