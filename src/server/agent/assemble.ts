/**
 * assemble.ts
 *
 * WHAT: Builds the two pieces of prompt one run needs. The stable half is the
 *       skill body with the other track's blocks stripped out. The volatile
 *       half is the run context header naming this founder, their files and
 *       their gates.
 *
 * WHY IT EXISTS: Two failures, and they pull in opposite directions.
 *       The first is cost. One API key funds 130 founders across three sessions
 *       and a weekend, and the single biggest lever on that bill is prompt
 *       caching. Caching only works on a byte identical prefix, so the skill
 *       body must be the same bytes for every founder on a route, and anything
 *       that differs per founder must sit after it.
 *       The second is rule 1. The skill bodies for founder-brain and
 *       content-engine carry both tracks' prose in one file. A B2C founder must
 *       never be handed the B2B half, so it is removed before the body is sent
 *       rather than left for the model to skip.
 *
 * CALLED BY: runner.ts, once per run, before query() is called.
 * READS:  the generated skill bodies (SkillBodies port) and the run facts
 *         (FactsSource port). WRITES: nothing.
 *
 * ORDER MATTERS, AND THIS IS THE COMMENT THAT SAYS WHY.
 *
 *   systemPrompt.append   the skill body, track stripped.  STABLE.
 *                         Same bytes for all ~65 founders on one route and one
 *                         track, and the same bytes tomorrow. This is the
 *                         cacheable prefix.
 *   first user message    the run header. Founder name, business, today's
 *                         date, file sizes, gate dates. VOLATILE. Different
 *                         for every founder and different an hour later.
 *
 * Putting the header in the system prompt would read better and would cost
 * roughly three times as much, because no two founders would share a prefix
 * and no founder would share one with themselves across a day. That is the
 * whole reason the header is a user message. Do not move it back.
 * `excludeDynamicSections: true` is set for the same reason and works the same
 * way: the SDK strips the per user sections out of the preset system prompt
 * and re injects them as the first user message.
 */

import { createHash } from 'node:crypto';
import type { FactsSource, RunFacts, SkillBodies } from './ports.js';
import type {
  CohortRoute,
  FileFact,
  FounderContext,
  GateFact,
  RouteRow,
  Track,
} from './types.js';

/** The two halves of a run's prompt, and the fingerprint of the stable half. */
export interface AssembledPrompt {
  /** Goes into systemPrompt.append. Stable across founders. */
  readonly systemPromptAppend: string;
  /** Goes in as the first user message of the run. Volatile. */
  readonly runHeader: string;
  /**
   * sha256 of systemPromptAppend. Two founders on the same route and track
   * must produce the same value. The smoke test asserts it, which catches a
   * volatile string leaking into the prefix without needing an API key or a
   * cache token count.
   */
  readonly prefixHash: string;
}

/** Thrown when a skill body's track markers do not pair up. Fail closed. */
export class TrackMarkerError extends Error {}

const OPEN = /^<!--\s*TRACK:(b2b|b2c)\s*-->$/;
const CLOSE = /^<!--\s*\/TRACK\s*-->$/;

/**
 * Removes every block belonging to a track other than `track`.
 *
 * Markers sit on their own line, which is the convention the project already
 * uses. Carriage returns are tolerated, because the skill files are edited on
 * three operating systems and a stray CR must not silently turn a marker into
 * ordinary prose that then reaches a founder.
 *
 * An opening marker with no closing marker throws. That is deliberate and it
 * matches what ge does with a half marked block: refuse rather than guess. The
 * alternative is stripping to the end of the file and shipping a truncated
 * skill, which reads as a working skill and is not one.
 */
export function stripOtherTrack(body: string, track: Track | null): string {
  // NULL IS A FOUNDER WHO HAS NOT FORKED YET, and the whole body is what they
  // get. Their first Founder Brain asks the fork question in group 2 and then
  // asks the B2B audience questions or the B2C ones in group 3. Strip either
  // branch before they have answered and the model can only ask one of them.
  // The markers themselves are still removed below, because a founder never
  // sees our routing comments.
  const lines = body.split('\n');
  const out: string[] = [];
  let skippingFrom: number | null = null;
  let openLine = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const bare = line.replace(/\r$/, '').trim();
    const open = OPEN.exec(bare);
    if (open) {
      if (skippingFrom !== null) {
        throw new TrackMarkerError(
          `nested TRACK marker at line ${i + 1}, already open at line ${openLine}`,
        );
      }
      openLine = i + 1;
      // The marker lines themselves never reach the model, on either branch.
      // -1 means "inside a block we are keeping". A null track keeps both.
      skippingFrom = track === null || open[1] === track ? -1 : i;
      continue;
    }
    if (CLOSE.test(bare)) {
      if (skippingFrom === null) {
        throw new TrackMarkerError(`closing TRACK marker with no opener at line ${i + 1}`);
      }
      skippingFrom = null;
      continue;
    }
    if (skippingFrom === null || skippingFrom === -1) out.push(line);
  }

  if (skippingFrom !== null) {
    throw new TrackMarkerError(`TRACK marker opened at line ${openLine} is never closed`);
  }
  return out.join('\n');
}

/**
 * The strip is belt and braces, so the braces are said out loud too. If the
 * strip is ever removed the skill still behaves, because founder-brain line 63
 * already says not to ask B2B questions of a B2C founder. This sentence is the
 * third layer, and it is stable per track so it stays inside the cached prefix.
 */
function trackStrip(track: Track | null): string {
  // The unforked founder. Said as plainly as the forked version, because the
  // model has both branches in front of it and needs to know why.
  if (track === null) {
    return [
      '',
      '---',
      '',
      '# This founder has not chosen a track yet',
      '',
      'The track question is asked once, in the Founder Brain, and it has not',
      'been answered. The instructions above therefore carry both tracks.',
      '',
      'Do not assume either answer and do not guess from what they sell. Ask the',
      'question when the interview reaches it, take the answer, and work from',
      'there. Once it is written down it is not yours to change.',
    ].join('\n');
  }
  return [
    '',
    '---',
    '',
    `# This founder's track: ${track}`,
    '',
    `This founder is on the ${track} track. It was chosen once, in the Founder`,
    'Brain, and it is not yours to change. Material for the other track has',
    'already been removed from the instructions above.',
    '',
    'Never write, offer, or mention material belonging to the other track. If',
    'the founder asks for it, say which track they are on and what that means',
    'for them, then carry on with the work in front of you.',
  ].join('\n');
}

/**
 * The stable half. Depends on the skill body and the track and on nothing
 * else. No founder id, no name, no date, no file list.
 */
export function buildSystemPromptAppend(
  bodies: SkillBodies,
  route: RouteRow,
  track: Track | null,
): string {
  const body = bodies.get(route.skill);
  return `${stripOtherTrack(body, track)}${trackStrip(track)}\n`;
}

/**
 * The volatile half. Everything in here changes per founder or per hour, which
 * is exactly why it is not in the system prompt.
 *
 * Built from the same index the Files screen renders, so the screen and the
 * model cannot disagree about what a founder has.
 */
export function buildRunHeader(
  ctx: FounderContext,
  route: RouteRow,
  facts: RunFacts,
): string {
  const present =
    facts.files.length > 0
      ? wrap(facts.files.map(describeFile).join(', '), 78)
      : 'nothing yet';
  const absent = facts.absent.length > 0 ? facts.absent.join(', ') : 'nothing';

  return [
    '# Run context',
    '',
    `Founder: ${ctx.displayName}`,
    `Business: ${ctx.businessName}`,
    // Both vocabularies for "route" are printed, and they are labelled, so the
    // model never has to work out which one a bare word meant. See types.ts.
    // 'not chosen yet' rather than a value, on the one run where it is true.
    // Printing a track here that the founder has not picked is the run header
    // telling the model to fork material that has not been forked.
    `Track: ${facts.track ?? 'not chosen yet'}    Model: ${ctx.model}    Route: ${ctx.cohortRoute}    Engine: ${route.id}`,
    `Today: ${facts.today}`,
    '',
    'Your files live in growth-engine/. Read and write them with the file tools.',
    'The founder can see and download every one of them from Files.',
    '',
    `Present: ${present}`,
    `Absent: ${absent}`,
    '',
    describeGates(facts.gates),
    '',
    facts.track === null
      ? 'Do not write material for either track until they have chosen one.'
      : 'Never write or mention material belonging to a track other than the one above.',
    '',
  ].join('\n');
}

/** Both halves at once, plus the fingerprint the cache test asserts on. */
export async function assemble(
  deps: { readonly bodies: SkillBodies; readonly facts: FactsSource },
  ctx: FounderContext,
  route: RouteRow,
): Promise<AssembledPrompt> {
  const facts = await deps.facts.factsFor(ctx, route.id);
  // The file is the authority on track, never the cached column. A founder who
  // hand edits their Brain gets what they edited, which is what schemas/brain.md
  // promises them.
  const systemPromptAppend = buildSystemPromptAppend(deps.bodies, route, facts.track);
  return {
    systemPromptAppend,
    runHeader: buildRunHeader(ctx, route, facts),
    prefixHash: createHash('sha256').update(systemPromptAppend, 'utf8').digest('hex'),
  };
}

/**
 * The line that goes in front of the next turn after the SDK compacts.
 *
 * Compaction summarises, and "you are on step 3 of 5" is exactly the kind of
 * thing a summary loses. Losing it in the middle of the Founder Brain means
 * re asking questions the founder has already answered, which is the single
 * most annoying thing this app could do to somebody who has given it 20
 * minutes.
 */
export function reAnchor(
  ctx: FounderContext,
  route: RouteRow,
  step: string | null,
): string {
  const where = step === null ? '' : ` You were part way through: ${step}.`;
  return [
    'The conversation above was summarised to save room, so some detail is gone.',
    `Track: ${ctx.track}. Engine: ${route.id}.${where}`,
    'Do not start again and do not re ask anything already answered above.',
    'Read the founder files before you assume anything is missing.',
  ].join('\n');
}

/**
 * What a cold resume is seeded with when the transcript could not be loaded.
 *
 * The interview's real state is the file it is writing, not the transcript.
 * This is what makes that true rather than hopeful: losing the transcript costs
 * conversational texture, it does not cost answers.
 */
export function resumeSeed(
  route: RouteRow,
  digest: { readonly summary: string; readonly lastMessages: readonly string[] },
): string {
  const recent =
    digest.lastMessages.length > 0
      ? ['', 'The last things they said, in their own words:', ...digest.lastMessages.map((m) => `- ${m}`)]
      : [];
  return [
    `You are part way through ${route.label}. The record of the conversation`,
    'was lost when the server restarted. Their files were not, and neither was',
    'this summary.',
    '',
    digest.summary,
    ...recent,
    '',
    'Read their files first. Then pick up where this leaves off. Do not start',
    'again, and do not ask for anything the files already hold.',
  ].join('\n');
}

// ------------------------------------------------------------------ helpers

/** '4.1 KB' and '18 KB'. One decimal, and a trailing .0 is dropped. */
export function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  const oneDecimal = Math.round(kb * 10) / 10;
  const text = Number.isInteger(oneDecimal) ? String(oneDecimal) : oneDecimal.toFixed(1);
  return `${text} KB`;
}

function describeFile(f: FileFact): string {
  return `${f.path} (${formatSize(f.sizeBytes)}, ${f.changed})`;
}

function describeGates(gates: readonly GateFact[]): string {
  if (gates.length === 0) return 'No gates apply yet.';
  return gates
    .map((g) => {
      if (g.state === 'passed') return `Gate ${g.letter}: passed ${g.on ?? ''}`.trim() + '.';
      if (g.state === 'submitted') return `Gate ${g.letter}: submitted, not marked yet.`;
      return `Gate ${g.letter}: not submitted.`;
    })
    .join(' ');
}

/** Soft wrap on spaces. Keeps the header readable in a log and in a transcript. */
function wrap(text: string, width: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length === 0) line = word;
    else if (line.length + 1 + word.length <= width) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join('\n');
}

/**
 * The cache unit. Two founders with the same value here share a prefix, so
 * roughly 65 of them share one, twice over. Exported so the smoke test and the
 * cost dashboard can group by the same key the cache does.
 */
export function cacheUnit(routeId: string, track: Track, cohortRoute: CohortRoute): string {
  // cohortRoute is carried for reporting only. It must NOT be in the prefix,
  // because b2c-service and b2c-ecom founders on one route share a body.
  void cohortRoute;
  return `${routeId}:${track}`;
}
