/**
 * mcp/ge-tools.ts
 *
 * WHAT: The two verbs the model can call mid conversation, `remember` and
 *       `person add`, exposed as in process MCP tools. Each one shells out to
 *       ge rather than writing a file itself.
 *
 * WHY IT EXISTS: The model has no shell and never will, so without these two
 *       tools it could not record a decision or add a prospect without the app
 *       reimplementing ge's marker logic in TypeScript. That reimplementation
 *       is the thing this whole build avoids: ge is the only part of this
 *       product that has ever been tested, its twelve schemas describe it, and
 *       founders download the bytes it writes. So the tool is a thin skin over
 *       a child process, and ge stays the one writer.
 *
 * CALLED BY: runner.ts, once per run. The server is constructed per run and
 *       thrown away with it.
 * READS:  nothing. WRITES: through ge, into the founder's own folder only.
 *
 * TWO SAFETY PROPERTIES, BOTH STRUCTURAL RATHER THAN CHECKED.
 *
 *   No tool input schema anywhere in this file contains a founderId, a
 *   locationId or a token field. The founder context is closed over when the
 *   server is built, so the model cannot name a founder and therefore cannot
 *   name the wrong one. A test asserts this, because it is the kind of field
 *   somebody adds later for convenience.
 *
 *   The person tool forks on track before it is built. A B2B founder's run has
 *   a tool that adds a prospect with an email address. A B2C founder's run has
 *   a tool that adds a target with a platform handle. Neither run has the
 *   other, so rule 1 holds in the tool surface itself and not only in the
 *   prose. Nothing here sends a message to anybody, which is rule 2's fourth
 *   layer: a frozen tool registry with no send verb in it.
 */

import { createSdkMcpServer, tool } from '../sdk.js';
import type { GeRunner, Logger } from '../ports.js';
import type { FounderContext } from '../types.js';
import {
  describeGeResult,
  personAddProspectArgv,
  personAddTargetArgv,
  rememberArgv,
  ArgvRefusal,
  PERSON_SOURCES,
  REMEMBER_KINDS,
  TARGET_PLATFORMS,
  type PersonSource,
  type RememberKind,
  type TargetPlatform,
} from './ge-argv.js';
import { z } from 'zod';

/** The MCP server name. Tool names the model sees are mcp__ge__<tool>. */
export const GE_SERVER_NAME = 'ge';

/** The full tool names, for allowedTools and for the init assertion. */
export const GE_TOOL_NAMES = [
  `mcp__${GE_SERVER_NAME}__remember`,
  `mcp__${GE_SERVER_NAME}__person_add`,
] as const;

/**
 * The allowed tool names. One list, because there is nothing track specific left.
 *
 * THERE WERE THREE APOLLO TOOLS HERE AND THEY ARE GONE ON PURPOSE, 1 September 2026.
 * Apollo's own MCP server does search, enrichment and sequences, on the founder's own
 * account, connected to their Claude account. It does all of it better than this did:
 * more endpoints, and a confirmation step of its own before anything is enrolled or
 * activated.
 *
 * Two tools that shell out to ge cannot do what a vendor's own server does, and
 * maintaining a second, worse Apollo client so that the app can do a job the app is not
 * for was the wrong trade. What this app is for is getting a founder's inputs right and
 * writing their assets.
 *
 * `geToolNamesFor` is kept rather than folded back into a constant, because the fork it
 * expresses is real: the person tool already differs by track, and the next tool that
 * belongs to one side will want it back.
 */
export function geToolNamesFor(_track: FounderContext['track']): readonly string[] {
  return [...GE_TOOL_NAMES];
}

export interface GeToolDeps {
  readonly ge: GeRunner;
  readonly log: Logger;
}

/** Wraps one ge call so a refusal never becomes an unhandled rejection. */
async function callGe(
  deps: GeToolDeps,
  ctx: FounderContext,
  argv: readonly string[],
  what: string,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    const result = await deps.ge.run(ctx.founderId, argv);
    deps.log.info(
      // The audit line never carries founder text and never a name. Only the
      // verb and the exit code, which is what ge_event records too.
      { founderId: ctx.founderId, verb: argv[0], exitCode: result.exitCode },
      'ge called from a model tool',
    );
    const reply = describeGeResult(result, what);
    return { content: [{ type: 'text', text: reply.text }], isError: reply.isError };
  } catch (err: unknown) {
    if (err instanceof ArgvRefusal) {
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
    deps.log.error({ founderId: ctx.founderId, err: String(err) }, 'ge tool failed');
    return {
      content: [
        {
          type: 'text',
          text: 'That could not be saved and nothing was written. Tell the founder their files are untouched, and carry on with the conversation.',
        },
      ],
      isError: true,
    };
  }
}

/**
 * Builds the MCP server for one run. `ctx` is closed over by every handler,
 * which is the whole security model of this file.
 */
export function createGeTools(ctx: FounderContext, deps: GeToolDeps) {
  const remember = tool(
    'remember',
    "Record one durable fact into the founder's own memory file. Use it when they decide something, when something worked or did not, when you learn how they write, when you use a content angle, or when something is left open. One line each.",
    {
      kind: z
        .enum(REMEMBER_KINDS as unknown as [RememberKind, ...RememberKind[]])
        .describe('decision, worked, didnot, voice, angle or thread'),
      text: z.string().min(1).max(500).describe('One line, in plain words'),
      detail: z
        .string()
        .max(300)
        .optional()
        .describe('Where the longer version lives, for example an ops log entry'),
    },
    async (args) => callGe(deps, ctx, rememberArgv(args), 'that memory line'),
  );

  // THE FORK. Built once, at run start, from a column. The other track's tool
  // is not registered, so it does not exist for this founder.
  const personAdd =
    ctx.track === 'b2b'
      ? tool(
          'person_add',
          'Add one prospect to the founder\'s people folder. For the 25 low volume messages they will send by hand. This writes a file. It does not contact anybody.',
          {
            email: z.string().min(3).max(254).describe('Their email address'),
            name: z.string().min(1).max(120).describe('Their name'),
            company: z.string().max(160).optional(),
            title: z.string().max(160).optional(),
            source: z
              .enum(PERSON_SOURCES as unknown as [PersonSource, ...PersonSource[]])
              .optional()
              .describe('Where they came from'),
            found_via: z.string().max(300).optional(),
            why_them: z.string().max(300).optional(),
            priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
            note: z.string().max(500).optional(),
          },
          async (args) =>
            callGe(
              deps,
              ctx,
              personAddProspectArgv({
                email: args.email,
                name: args.name,
                company: args.company,
                title: args.title,
                source: args.source,
                foundVia: args.found_via,
                whyThem: args.why_them,
                priority: args.priority,
                note: args.note,
              }),
              'that prospect',
            ),
        )
      : tool(
          'person_add',
          'Add one target to the founder\'s people folder. For the 25 DMs they will send by hand. This writes a file. It does not send a message and it cannot.',
          {
            platform: z
              .enum(TARGET_PLATFORMS as unknown as [TargetPlatform, ...TargetPlatform[]])
              .describe('ig, fb or other'),
            handle: z.string().min(1).max(120).describe('Their handle on that platform'),
            name: z.string().min(1).max(120).describe('Their name'),
            platform_label: z.string().max(60).optional(),
            source: z
              .enum(PERSON_SOURCES as unknown as [PersonSource, ...PersonSource[]])
              .optional(),
            found_via: z.string().max(300).optional(),
            why_them: z.string().max(300).optional(),
            priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
            note: z.string().max(500).optional(),
          },
          async (args) =>
            callGe(
              deps,
              ctx,
              personAddTargetArgv({
                platform: args.platform,
                handle: args.handle,
                name: args.name,
                platformLabel: args.platform_label,
                source: args.source,
                foundVia: args.found_via,
                whyThem: args.why_them,
                priority: args.priority,
                note: args.note,
              }),
              'that target',
            ),
        );




  return createSdkMcpServer({
    name: GE_SERVER_NAME,
    version: '1.0.0',
    instructions:
      "These two tools write into the founder's own growth-engine folder. Nothing here contacts anybody.",
    // Every tool is always in the prompt. There are few enough that there is nothing to
    // gain from deferring them behind a search, and a tool the model cannot see is a
    // tool it works around by writing the file by hand.
    alwaysLoad: true,
    tools: [remember, personAdd],
  });
}
