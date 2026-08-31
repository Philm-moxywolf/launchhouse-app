/**
 * track.ts: rule 1. A B2C founder is never handed B2B material, and a B2B
 *   founder is never handed B2C material.
 *
 * WHY IT EXISTS: the fork happens once, in the Founder Brain, and after that
 *   every skill is supposed to read the `Track` field and adapt. In the plugin
 *   that was a sentence in a prompt and the model was trusted to obey it. In
 *   the app the routing fork is a server side switch, which makes the big
 *   version of the mistake impossible, and this file catches the small version:
 *   a skill that reads the Brain correctly and still writes the word "Apollo"
 *   into a skincare founder's content plan, or drops an `outreach-sequence.md`
 *   into a folder whose owner has never heard of outreach.
 *
 *   A founder who sees the other track's material once stops trusting the whole
 *   thing, because they now have to wonder which of the other files were meant
 *   for somebody else. That is why the leak is a refusal and not a warning.
 *
 * WHAT IT CHECKS
 *   1. The file. gates.md carries a track column and it is the list.
 *   2. The Brain's own `Track` line against the track the server is running on.
 *      A disagreement means the fork is about to go the wrong way.
 *   3. Person files. `kind: prospect` is B2B and `kind: target` is B2C, and
 *      person.md says a file carrying both kinds' fields "is one person in two
 *      tracks, which is the one thing the two track rule forbids".
 *   4. The words. A short list of terms that belong to one track only.
 *
 * CALLED BY: index.ts, before an artifact is saved and before a file is served.
 * READS:     `schemas/gates.md`, through gates-source.ts.
 * WRITES:    nothing.
 */

import { trackForFile } from './gates-source.ts';
import {
  locate,
  maskNonProse,
  resultFrom,
  type Artifact,
  type FounderContext,
  type RuleResult,
  type Severity,
  type Track,
  type Violation,
} from './types.ts';

const RULE = 'track' as const;

const TRACK_NAME: Record<Track, string> = {
  b2b: 'the outreach track',
  b2c: 'the audience track',
};

function other(track: Track): Track {
  return track === 'b2b' ? 'b2c' : 'b2b';
}

/**
 * A term that belongs to one track.
 *
 * `nearby` exists for the words that are ordinary English on their own.
 * "Sequence" is the clearest case: "a sequence of three posts" is fine in a
 * skincare content plan, and "enrol them in the sequence" is B2B outreach that
 * has reached the wrong founder. The line the word sits on decides which it is,
 * so the check reads the line rather than the word.
 */
interface TrackTerm {
  pattern: RegExp;
  label: string;
  /** The track this term belongs to. Seeing it on the other track is the fault. */
  track: Track;
  severity: Severity;
  nearby?: RegExp;
}

const TERMS: readonly TrackTerm[] = [
  // B2B only.
  { pattern: /\bApollo\b/gi, label: 'Apollo', track: 'b2b', severity: 'block' },
  { pattern: /\boutreach[- ]sequence\b/gi, label: 'outreach sequence', track: 'b2b', severity: 'block' },
  { pattern: /\boutreach[- ]firstlines\b/gi, label: 'outreach firstlines', track: 'b2b', severity: 'block' },
  { pattern: /\bICP\b/g, label: 'ICP', track: 'b2b', severity: 'block' },
  { pattern: /\bfirmographic\w*\b/gi, label: 'firmographics', track: 'b2b', severity: 'block' },
  { pattern: /\b(DKIM|DMARC)\b/g, label: 'the email sending records', track: 'b2b', severity: 'block' },
  {
    // SPF is two things. In B2B it is an email sending record. In skincare it
    // is sun protection factor, and it is in the B2C worked example, in the
    // line about mineral SPF. The first draft of this list refused Priya
    // Raman's own Brain because of it. So SPF only counts when the line it sits
    // on is about email.
    pattern: /\bSPF\b/g,
    label: 'the email sending records',
    track: 'b2b',
    severity: 'block',
    nearby: /\b(DKIM|DMARC|domain|dns|sending|sender|email|inbox|deliverab\w*|record)\w*\b/i,
  },
  { pattern: /\bcold emails?\b/gi, label: 'cold email', track: 'b2b', severity: 'block' },
  {
    // LINKEDIN IS TWO THINGS, the same shape of problem as SPF above. The B2B
    // track is LinkedIn and email, so "connect with them on LinkedIn" is the
    // other track's material arriving on an audience founder's screen. But a
    // B2C founder can perfectly well have a LinkedIn profile, and saying so in
    // their own Brain is not a leak. So the bare word is a note, and it is only
    // refused when the line it sits on is about working the platform.
    //
    // IT WAS NOT ON THIS LIST AT ALL until 1 September, which is how an audience
    // founder was asked for LinkedIn URLs for six people. Apollo, ICP and
    // firmographics were all here. The most identifiable B2B word in the
    // programme was not.
    pattern: /\bLinkedIn\b/gi,
    label: 'LinkedIn',
    track: 'b2b',
    severity: 'block',
    nearby: /\b(url|urls|connect\w*|invite|inmail|outreach|prospect|sequence|search|export|scrape)\w*\b/i,
  },
  { pattern: /\bLinkedIn\b/gi, label: 'LinkedIn', track: 'b2b', severity: 'warn' },
  {
    pattern: /\bsequences?\b/gi,
    label: 'sequence',
    track: 'b2b',
    severity: 'block',
    nearby: /\b(email|outreach|enrol|enroll|step|cadence|drip|prospect|sender|inbox)\w*\b/i,
  },
  { pattern: /\bsequences?\b/gi, label: 'sequence', track: 'b2b', severity: 'warn' },
  { pattern: /\bprospects?\b/gi, label: 'prospect', track: 'b2b', severity: 'warn' },

  // B2C only.
  { pattern: /\bhook[- ]bank\b/gi, label: 'hook bank', track: 'b2c', severity: 'block' },
  { pattern: /\bdm[- ]openers?\b/gi, label: 'DM openers', track: 'b2c', severity: 'block' },
  { pattern: /\binbound[- ]scripts?\b/gi, label: 'inbound scripts', track: 'b2c', severity: 'block' },
  {
    pattern: /\b(Business|Creator) account\b/gi,
    label: 'a Business or Creator account',
    track: 'b2c',
    severity: 'block',
  },
  { pattern: /\bInstagram\b/gi, label: 'Instagram', track: 'b2c', severity: 'warn' },
  { pattern: /\blink in bio\b/gi, label: 'link in bio', track: 'b2c', severity: 'warn' },
  { pattern: /\bReels?\b/g, label: 'Reels', track: 'b2c', severity: 'warn' },
];

/** The person kinds, and which track each belongs to. From schemas/person.md. */
const PERSON_KIND_TRACK: Record<string, Track> = {
  prospect: 'b2b',
  target: 'b2c',
};

/** Fields person.md says only one kind may carry. */
const PROSPECT_ONLY_FIELDS = ['email', 'first_name', 'company', 'title', 'email_status'];
const TARGET_ONLY_FIELDS = ['platform', 'handle', 'platform_label'];

function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function isPersonFile(path: string): boolean {
  return path.startsWith('people/') && path.endsWith('.md') && baseName(path) !== 'README.md';
}

/** The labelled fields above the first `## ` line, as person.md defines them. */
function personFields(text: string): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  for (const raw of text.split('\n')) {
    if (raw.startsWith('## ')) break;
    const match = /^([a-z_]+):\s*(.*)$/.exec(raw);
    if (!match) continue;
    const name = match[1] ?? '';
    const value = (match[2] ?? '').trim();
    if (value === '') continue;
    const existing = fields.get(name);
    if (existing) existing.push(value);
    else fields.set(name, [value]);
  }
  return fields;
}

function checkFileScope(artifact: Artifact, ctx: FounderContext, out: Violation[]): void {
  const name = baseName(artifact.path);
  const fileTrack = trackForFile(name) ?? trackForFile(`${name}/`);
  if (fileTrack === null || fileTrack === 'both') return;

  if (ctx.track === null) {
    out.push({
      rule: RULE,
      code: 'track.not-chosen-yet',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: artifact.path },
      found: name,
      message: `${name} only makes sense once you have picked B2B or B2C, and that has not happened yet.`,
      why: 'You pick once, in your Founder Brain, and everything after that follows it. Built before the choice, this would be half a set of work for a track that might not be yours.',
      recovery: { label: 'Build your Founder Brain first', action: { kind: 'route', skill: 'founder-brain' } },
    });
    return;
  }

  if (fileTrack !== ctx.track) {
    out.push({
      rule: RULE,
      code: 'track.wrong-track-file',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: artifact.path },
      found: name,
      message: `${name} is built for ${TRACK_NAME[fileTrack]}. You are on ${TRACK_NAME[ctx.track]}, so it would be an hour spent on the wrong thing.`,
      why: 'You picked your track once and nothing should hand you the other one. A file from the other side is work you cannot use, and finding one makes the rest of the folder harder to trust.',
      recovery: { label: 'See what is next on your track', action: { kind: 'route', skill: 'status' } },
    });
  }
}

function checkBrainTrackLine(artifact: Artifact, ctx: FounderContext, out: Violation[]): void {
  if (baseName(artifact.path) !== 'founder-brain.md') return;

  // schemas/brain.md: the label is read without case, with the list dash and
  // the stars taken off, and only above the first `## ` line.
  const header = artifact.text.split(/^## /m)[0] ?? '';
  const match = /^[-*\s]*\**\s*track\s*:?\**\s*:?\s*(\S+)/im.exec(header);
  const declared = match?.[1]?.replace(/\*/g, '').trim().toLowerCase() ?? null;

  if (declared === null) {
    out.push({
      rule: RULE,
      code: 'track.missing-from-brain',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: '# Founder Brain' },
      found: '',
      message: 'Your Brain has no Track line yet, so nothing after it knows whether to build you the B2B half or the B2C half.',
      why: 'Eleven later steps read that one line. Without it you would be asked which track you are on at every single one of them.',
      recovery: { label: 'Finish your Founder Brain', action: { kind: 'route', skill: 'founder-brain' } },
    });
    return;
  }

  if (declared !== 'b2b' && declared !== 'b2c') {
    out.push({
      rule: RULE,
      code: 'track.unknown-value',
      severity: 'block',
      where: locate(artifact.path, artifact.text, artifact.text.toLowerCase().indexOf('track')),
      found: declared,
      message: `Your Track line reads "${declared}". It needs to say b2b or b2c, exactly.`,
      why: 'Every later step reads that one word. Anything else and they have nothing to match on, so you get asked again at each step.',
      recovery: { label: 'Finish your Founder Brain', action: { kind: 'route', skill: 'founder-brain' } },
    });
    return;
  }

  if (ctx.track !== null && declared !== ctx.track) {
    out.push({
      rule: RULE,
      code: 'track.brain-disagrees',
      severity: 'block',
      where: locate(artifact.path, artifact.text, artifact.text.toLowerCase().indexOf('track')),
      found: declared,
      message: `Your Brain says ${declared} and this session is running on ${ctx.track}. They need to agree.`,
      why: 'One of them picks the steps you are shown and the other picks what gets written into them. While they disagree, half your work would come out built for the other track.',
      recovery: { label: 'Open your Founder Brain and check the Track line', action: { kind: 'edit', path: artifact.path } },
    });
  }
}

function checkPersonFile(artifact: Artifact, ctx: FounderContext, out: Violation[]): void {
  if (!isPersonFile(artifact.path)) return;
  const fields = personFields(artifact.text);
  const kind = fields.get('kind')?.[0]?.toLowerCase();

  if (kind === undefined) {
    out.push({
      rule: RULE,
      code: 'track.person-no-kind',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: artifact.path },
      found: '',
      message: 'This person file has no kind line, so nothing can tell whether they are someone you email or someone you message.',
      why: 'The kind decides which statuses the person can have and which sheet they appear on. A file without one drops off both.',
      recovery: { label: 'Add them again', action: { kind: 'reply' } },
    });
    return;
  }

  const kindTrack = PERSON_KIND_TRACK[kind];
  if (kindTrack === undefined) {
    out.push({
      rule: RULE,
      code: 'track.person-unknown-kind',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: `kind: ${kind}` },
      found: kind,
      message: `This person file says kind "${kind}". The only two are prospect and target.`,
      why: 'Those two kinds have different statuses and different sheets, and a third one belongs to neither.',
      recovery: { label: 'Add them again', action: { kind: 'reply' } },
    });
    return;
  }

  if (ctx.track !== null && kindTrack !== ctx.track) {
    out.push({
      rule: RULE,
      code: 'track.person-wrong-kind',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: `kind: ${kind}` },
      found: kind,
      message: `This person is filed as a ${kind}, which belongs to ${TRACK_NAME[kindTrack]}. You are on ${TRACK_NAME[ctx.track]}.`,
      why: 'People on your list have to be the kind your track works with, or they sit in your folder and never appear on the sheet you actually work down.',
      recovery: { label: 'See your people', action: { kind: 'route', skill: 'status' } },
    });
  }

  const crossed = kind === 'prospect' ? TARGET_ONLY_FIELDS : PROSPECT_ONLY_FIELDS;
  const present = crossed.filter((f) => fields.has(f));
  if (present.length > 0) {
    out.push({
      rule: RULE,
      code: 'track.person-both-kinds',
      severity: 'block',
      where: { path: artifact.path, line: 1, column: 1, excerpt: `kind: ${kind}` },
      found: present.join(', '),
      message: `This person is filed as a ${kind} and also carries ${present.join(' and ')}, which belongs to the other kind.`,
      why: 'One person cannot be on both tracks. A file that is both turns up on the wrong sheet, and the wrong sheet is the one somebody works down by hand.',
      recovery: { label: 'Add them again', action: { kind: 'reply' } },
    });
  }
}

function checkVocabulary(artifact: Artifact, ctx: FounderContext, out: Violation[]): void {
  if (ctx.track === null) return;
  const wrong = other(ctx.track);
  const masked = maskNonProse(artifact.text);
  const lines = masked.split('\n');
  const reported = new Set<string>();

  for (const term of TERMS) {
    if (term.track !== wrong) continue;
    let offset = 0;
    for (const line of lines) {
      const re = new RegExp(term.pattern.source, term.pattern.flags.replace('g', '') + 'g');
      for (const match of line.matchAll(re)) {
        if (match.index === undefined) continue;
        if (term.nearby && !term.nearby.test(line)) continue;
        // One report per term per line, keyed on the label rather than on the
        // list entry. Two things follow, and both are wanted. A word repeated
        // four times in a paragraph is one problem, not four. And where the
        // same word appears twice in the list, once as a refusal with a
        // `nearby` test and once as a warning, the refusal is listed first and
        // wins, so a founder is never told the same word is both.
        const lineKey = `${term.label}:${offset}`;
        if (reported.has(lineKey)) continue;
        reported.add(lineKey);
        out.push({
          rule: RULE,
          code: term.severity === 'block' ? 'track.wrong-track-word' : 'track.wrong-track-word-maybe',
          severity: term.severity,
          where: locate(artifact.path, artifact.text, offset + match.index),
          found: artifact.text.slice(offset + match.index, offset + match.index + match[0].length),
          message:
            term.severity === 'block'
              ? `This uses ${term.label}, which is part of the ${TRACK_NAME[wrong]} method. You are on ${TRACK_NAME[ctx.track]}, where it does not apply.`
              : `This mentions ${term.label}, which usually sits on the ${TRACK_NAME[wrong]} side. Probably fine. Worth a glance.`,
          why: 'You picked your track once and everything after it is built for that side. Advice from the other side is not work you can use, and following it costs a morning.',
          recovery: { label: 'Ask for that one again', action: { kind: 'reply' } },
        });
      }
      offset += line.length + 1;
    }
  }
}

export interface TrackOptions {
  /**
   * Scan the words as well as the file name and the fields.
   *
   * On for anything a model wrote. Off for the founder's own writing, because a
   * skincare founder is allowed to write the word "prospect" in her own notes
   * and the app has no business telling her not to.
   */
  checkVocabulary?: boolean;
}

/** Run rule 1 over one artifact. */
export function checkTrack(
  artifact: Artifact,
  ctx: FounderContext,
  options: TrackOptions = {},
): RuleResult {
  const violations: Violation[] = [];
  const notes: string[] = [];

  checkFileScope(artifact, ctx, violations);
  checkBrainTrackLine(artifact, ctx, violations);
  checkPersonFile(artifact, ctx, violations);

  const scanWords = options.checkVocabulary ?? artifact.authored === 'model';
  if (scanWords) {
    checkVocabulary(artifact, ctx, violations);
  } else {
    notes.push(`The words in ${artifact.path} were not scanned, because the founder wrote them.`);
  }

  if (ctx.track === null) {
    notes.push('No track is set yet, so only the file name and the Brain were checked.');
  }

  return resultFrom(RULE, [artifact.path], violations, notes);
}

/** The terms, exported so a test can prove the two lists stay symmetrical. */
export const TRACK_TERMS = TERMS;
