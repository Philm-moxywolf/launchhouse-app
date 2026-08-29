/**
 * intent.ts
 *
 * WHAT: Stage two of plain language routing. One cheap model call, constrained
 *       to return a route id from an enum or the word none.
 *
 * WHY IT EXISTS: The 47 trigger phrases in the skill descriptions cover what
 *       the people who wrote the skills expected founders to type. Founders
 *       will type other things. "I need to write the emails for my leads" is
 *       not in the list and plainly means the outreach engine. Without stage
 *       two that founder gets a shrug from a product that is meant to be the
 *       easy way in.
 *
 *       It is deliberately not free choice. The model picks from the enum of
 *       routes this founder can actually have, or it picks none. It cannot
 *       invent a route, and it cannot name the other track's engine, because
 *       the other track's rows are never in the candidate list.
 *
 * CALLED BY: router.ts, only when the phrase match found nothing.
 * READS:  nothing. WRITES: nothing. One model call, no tools, no files.
 *
 * Every answer from here goes through a confirm chip before anything runs. A
 * classifier that is wrong once in fifty would otherwise drop a founder into a
 * 30 piece generation they did not ask for.
 */

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { QueryFn } from './runner.js';
import type { IntentClassifier } from './router.js';
import type { Logger } from './ports.js';
import type { RouteId, RouteRow } from './types.js';

export interface IntentConfig {
  /** The mid tier model. This is reading a sentence, not writing in a voice. */
  readonly model: string;
  readonly anthropicApiKey: string;
  readonly path: string;
  readonly claudeConfigDir: string;
  /** A scratch directory with nothing in it. The classifier reads no files. */
  readonly scratchDir: string;
  /** Half a second of budget is plenty and it is the fourth wall on cost. */
  readonly maxBudgetUsd: number;
}

/**
 * Builds the classifier. Injected `queryFn` for the same reason as everywhere
 * else in this folder: a routing decision that can only be tested with an API
 * key is a routing decision nobody tests.
 */
export function createIntentClassifier(
  queryFn: QueryFn,
  cfg: IntentConfig,
  log: Logger,
): IntentClassifier {
  return {
    async classify(text: string, candidates: readonly RouteRow[]): Promise<RouteId | null> {
      if (candidates.length === 0) return null;
      const ids = candidates.map((c) => c.id);

      // A one message prompt. No tools, no cwd of any consequence, no files.
      //
      // The return type is written out rather than inferred. Without it the
      // literal infers a narrower message type than the SDK's, the assignment
      // below fails, and the cheap way out is a cast to any. A cast here would
      // silence the one check that says this really is the message shape the
      // SDK will be handed.
      const prompt = (async function* (): AsyncGenerator<SDKUserMessage> {
        yield {
          type: 'user',
          message: { role: 'user', content: buildPrompt(text, candidates) },
          parent_tool_use_id: null,
        };
      })();

      try {
        const q = queryFn({
          prompt,
          options: {
            cwd: cfg.scratchDir,
            model: cfg.model,
            systemPrompt: SYSTEM,
            settingSources: [],
            strictMcpConfig: true,
            skills: [],
            tools: [],
            allowedTools: [],
            disallowedTools: ['Bash', 'WebSearch', 'WebFetch', 'Task'],
            maxTurns: 1,
            maxBudgetUsd: cfg.maxBudgetUsd,
            outputFormat: {
              type: 'json_schema',
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['route'],
                properties: {
                  route: { type: 'string', enum: [...ids, 'none'] },
                },
              },
            },
            env: {
              PATH: cfg.path,
              HOME: '/tmp',
              CLAUDE_CONFIG_DIR: cfg.claudeConfigDir,
              ANTHROPIC_API_KEY: cfg.anthropicApiKey,
            },
          },
        });

        for await (const msg of q) {
          if (msg.type !== 'result') continue;
          const picked = readRoute((msg as { structured_output?: unknown }).structured_output);
          // Belt and braces on the enum. A model that answers outside the list
          // is treated as no answer, never as a route.
          if (picked && ids.includes(picked)) return picked;
          return null;
        }
        return null;
      } catch (err: unknown) {
        // Routing must never be the thing that fails a founder's message. No
        // answer means the chat box handles it as ordinary conversation.
        log.warn({ err: String(err) }, 'intent classifier failed, treating as no match');
        return null;
      }
    },
  };
}

const SYSTEM = [
  'You match one sentence to one of a fixed list of engines, and nothing else.',
  'Answer with a route id from the list, or none.',
  'Answer none when the sentence is a question, small talk, an answer to',
  'something that was asked, or anything you are not sure about. None is the',
  'right answer far more often than it feels like it should be.',
].join('\n');

function buildPrompt(text: string, candidates: readonly RouteRow[]): string {
  const list = candidates.map((c) => `- ${c.id}: ${c.subtitle}`).join('\n');
  return [
    'The engines available to this founder:',
    list,
    '',
    'The founder typed:',
    text.slice(0, 2000),
    '',
    'Which engine were they asking to start? Answer none if they were not asking to start one.',
  ].join('\n');
}

function readRoute(structured: unknown): string | null {
  if (typeof structured !== 'object' || structured === null) return null;
  const route = (structured as { route?: unknown }).route;
  if (typeof route !== 'string' || route === 'none') return null;
  return route;
}
