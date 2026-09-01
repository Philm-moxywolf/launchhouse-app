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
import { searchPeople } from '../../integrations/apollo-search.ts';
import { enrichPeople, ENRICH_CAP } from '../../integrations/apollo-enrich.ts';

/** The MCP server name. Tool names the model sees are mcp__ge__<tool>. */
export const GE_SERVER_NAME = 'ge';

/** The full tool names, for allowedTools and for the init assertion. */
export const GE_TOOL_NAMES = [
  `mcp__${GE_SERVER_NAME}__remember`,
  `mcp__${GE_SERVER_NAME}__person_add`,
] as const;

/** Apollo belongs to the outreach track, so its tool name does too. */
const APOLLO_TOOL_NAMES = [
  `mcp__${GE_SERVER_NAME}__apollo_search`,
  `mcp__${GE_SERVER_NAME}__apollo_enrich`,
] as const;

/**
 * The allowed tool names for one founder, forked the same way the tools are.
 *
 * An allowlist naming a tool that is not registered would be harmless in itself: it
 * permits something that does not exist. It is forked anyway, because this file already
 * holds that the other track's tool does not exist for this founder, and a list that
 * says apollo to an audience founder is a list somebody later reads as permission to
 * register it for them.
 */
export function geToolNamesFor(track: FounderContext['track']): readonly string[] {
  return track === 'b2b' ? [...GE_TOOL_NAMES, ...APOLLO_TOOL_NAMES] : [...GE_TOOL_NAMES];
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

  /**
   * Looking for people in Apollo. B2B only, and a read.
   *
   * WHY THIS ONE MAY BE MODEL CALLABLE WHEN THE REST OF APOLLO MAY NOT.
   * Search costs no credits, contacts nobody, and hands back a catalogue rather than
   * contact details: a first name, a hidden surname, a title and a company, with no
   * email. `contracts/apollo.ts` has that from a real response. So the worst a wrong
   * search does is waste a minute.
   *
   * Enrichment spends the founder's money per person and a sequence writes to real
   * people. Neither is here, and this file staying a registry with no send verb in it
   * is the reason. Adding search does not change that property.
   *
   * IT DOES NOT SHELL OUT TO ge. Every other tool here does, because ge owns the
   * founder's files. ge is POSIX sh with no network, so this one calls the integration
   * directly, and the founder's key is opened inside the server for one call and never
   * reaches the model, the transcript or a log line.
   */
  const apolloSearch = tool(
    'apollo_search',
    "Look for people in Apollo who match a description. Free, and it contacts nobody. It gives back first names, job titles and companies, with surnames hidden and no email addresses: Apollo only releases those when a person is enriched, which costs the founder money and is not something you can do. Use it to show the founder who is out there before they choose 25.",
    {
      titles: z.array(z.string().min(1).max(120)).max(10).optional().describe('Job titles to match'),
      locations: z.array(z.string().min(1).max(120)).max(10).optional().describe('Places, for example "London, UK"'),
      employee_ranges: z
        .array(z.string().min(1).max(20))
        .max(10)
        .optional()
        .describe('Company sizes, for example "11,50"'),
      per_page: z.number().int().min(1).max(100).optional().describe('How many to bring back. 10 is usually plenty'),
    },
    async (args) => {
      const outcome = await searchPeople(ctx.founderId, {
        titles: args.titles,
        locations: args.locations,
        employeeRanges: args.employee_ranges,
        perPage: args.per_page,
      });
      deps.log.info({ founderId: ctx.founderId, kind: outcome.kind }, 'apollo search called from a model tool');

      if (outcome.kind === 'no_key') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'This founder has not connected Apollo yet. Ask them to open Setup and paste their Apollo key, then try again. Do not invent names in the meantime.',
            },
          ],
          isError: true,
        };
      }
      if (outcome.kind !== 'ok') {
        // Every one of these is the founder's to fix or Apollo's to recover from, and
        // none of them is a reason to make up people. The model is told that outright,
        // because rule 5 is easiest to break when a tool has just failed.
        return {
          content: [
            {
              type: 'text' as const,
              text: `Apollo could not answer that (${outcome.kind}). Tell the founder plainly and do not invent names or companies.`,
            },
          ],
          isError: true,
        };
      }

      const lines = outcome.people.map(
        (p) =>
          `${p.firstName} ${p.lastNameObfuscated}, ${p.title || 'title not given'}, ${p.company || 'company not given'}` +
          `${p.hasEmail ? '' : ', no email on file'}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `${String(outcome.total)} people match. Showing ${String(outcome.people.length)}.\n` +
              `${lines.join('\n')}\n` +
              'Surnames are hidden and there are no email addresses, which is normal: Apollo releases those only on enrichment, which spends the founder\'s credits. Show these to the founder and let them choose.',
          },
        ],
      };
    },
  );

  /**
   * Getting the email addresses. THE ONE TOOL HERE THAT SPENDS THE FOUNDER'S MONEY.
   *
   * Apollo charges a credit per person and there is no way to ask what an address is
   * without paying for it. So the description tells the model to agree the list with the
   * founder first, and says the number out loud, because a tool that quietly costs money
   * is a tool that will one day cost somebody a lot of it.
   *
   * THE CAP IS NOT IN THIS SCHEMA, IT IS IN THE INTEGRATION. A ceiling written into a
   * tool argument is a ceiling a prompt can talk its way around. `ENRICH_CAP` is a
   * constant in apollo-enrich.ts and the call returns `too_many` before a single request
   * goes out.
   *
   * PERSONAL EMAILS AND PHONE NUMBERS ARE NOT ARGUMENTS HERE and never will be. Apollo
   * offers both. This programme sends business email to people at work.
   */
  const apolloEnrich = tool(
    'apollo_enrich',
    `Get the email addresses for people you found with apollo_search. THIS SPENDS THE FOUNDER'S MONEY: Apollo charges one credit per person, every time, whether or not it finds an address. Agree the exact list with the founder before you call this, say how many people that is, and never call it to explore. At most ${String(ENRICH_CAP)} people in one go. It returns work email addresses only, and some people will have none, which is normal.`,
    {
      apollo_ids: z
        .array(z.string().min(1).max(64))
        .min(1)
        .max(ENRICH_CAP)
        .describe('The ids from apollo_search, for the people the founder chose'),
    },
    async (args) => {
      const outcome = await enrichPeople(ctx.founderId, args.apollo_ids);
      deps.log.info(
        // The count is the audit line. Never a name, never an address.
        { founderId: ctx.founderId, kind: outcome.kind, asked: args.apollo_ids.length },
        'apollo enrich called from a model tool',
      );

      if (outcome.kind === 'no_key') {
        return {
          content: [{ type: 'text' as const, text: 'This founder has not connected Apollo yet. Ask them to open Setup and paste their Apollo key. Nothing was charged.' }],
          isError: true,
        };
      }
      if (outcome.kind === 'too_many') {
        return {
          content: [{ type: 'text' as const, text: `That is ${String(outcome.asked)} people and the limit is ${String(outcome.cap)}. Nothing was charged. Ask the founder to narrow the list.` }],
          isError: true,
        };
      }
      if (outcome.kind !== 'ok') {
        return {
          content: [{ type: 'text' as const, text: `Apollo refused that (${outcome.kind}). Tell the founder plainly, and do not invent email addresses. If it says forbidden, their key or their plan may not cover enrichment.` }],
          isError: true,
        };
      }

      const withEmail = outcome.people.filter((p) => p.email !== null);
      const without = outcome.people.filter((p) => p.email === null);
      const lines = withEmail.map((p) => `${p.name}, ${p.title}, ${p.company}: ${p.email ?? ''}${p.emailStatus === null ? '' : ` (${p.emailStatus})`}`);
      const missing = without.map((p) => `${p.name}, ${p.title}, ${p.company}: no address`);
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Charged for ${String(outcome.spentOn)}. Addresses found for ${String(withEmail.length)}.\n` +
              [...lines, ...missing].join('\n') +
              (without.length === 0
                ? ''
                : `\n${String(without.length)} of them have no address on file. Tell the founder which, so they can replace them rather than finding out on the Saturday.`),
          },
        ],
      };
    },
  );

  return createSdkMcpServer({
    name: GE_SERVER_NAME,
    version: '1.0.0',
    instructions:
      "These tools write into the founder's own growth-engine folder, or look things up for them. Nothing here contacts anybody.",
    // Every tool is always in the prompt. There are few enough that there is nothing to
    // gain from deferring them behind a search, and a tool the model cannot see is a
    // tool it works around by writing the file by hand.
    alwaysLoad: true,
    tools: ctx.track === 'b2b' ? [remember, personAdd, apolloSearch, apolloEnrich] : [remember, personAdd],
  });
}
