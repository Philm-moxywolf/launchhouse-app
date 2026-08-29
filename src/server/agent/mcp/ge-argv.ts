/**
 * mcp/ge-argv.ts
 *
 * WHAT: Builds the argv array for the two ge verbs the model is allowed to
 *       call, and turns ge's exit code into something the model can act on.
 *
 * WHY IT EXISTS: Separated from ge-tools.ts so it can be tested without zod,
 *       without the Agent SDK and without a shell. These are the two places
 *       the model reaches ge, so they are the two places worth having tests
 *       for, and a test that needs an API key is a test nobody runs.
 *
 * CALLED BY: mcp/ge-tools.ts.
 * READS:  nothing. WRITES: nothing. Pure functions.
 *
 * THE INJECTION BOUNDARY IS THE ARGV ARRAY, and it is upstream of this file:
 * src/server/ge/run.ts spawns with an argv array and never with shell: true, so
 * anything a founder or a model types arrives as one argument and cannot be
 * read as shell. What this file adds is the second, smaller hazard: ge parses
 * its own options, so a value that begins with a dash can be read as a flag
 * rather than as text. Those are refused here, by name, rather than escaped.
 */

/** The six kinds ge remember accepts. From scripts/cmd/remember.sh. */
export const REMEMBER_KINDS = [
  'decision',
  'worked',
  'didnot',
  'voice',
  'angle',
  'thread',
] as const;
export type RememberKind = (typeof REMEMBER_KINDS)[number];

/** Where a person came from. From scripts/cmd/person.sh. */
export const PERSON_SOURCES = ['apollo', 'manual', 'import', 'form'] as const;
export type PersonSource = (typeof PERSON_SOURCES)[number];

/** The platforms a B2C target can be on. From scripts/cmd/person.sh. */
export const TARGET_PLATFORMS = ['ig', 'fb', 'other'] as const;
export type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

export class ArgvRefusal extends Error {}

/**
 * A value that starts with a dash would be read by ge as an option. There is
 * no escaping that works across every verb, so it is refused and the model is
 * told why in a sentence it can act on.
 */
function plain(field: string, value: string): string {
  if (value.startsWith('-')) {
    throw new ArgvRefusal(
      `The ${field} cannot start with a dash. Rewrite it without the leading dash and try again.`,
    );
  }
  if (value.includes('\n')) {
    throw new ArgvRefusal(
      `The ${field} has to be one line. Put the long version in the ops log and keep this short.`,
    );
  }
  return value;
}

/** Adds `--flag value` only when the value is there and is not empty. */
function optional(argv: string[], flag: string, value: string | undefined): void {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  argv.push(flag, plain(flag.replace(/^--/, ''), trimmed));
}

export interface RememberArgs {
  readonly kind: RememberKind;
  readonly text: string;
  readonly detail?: string;
}

/** ge remember <kind> "<text>" [--detail <pointer>] */
export function rememberArgv(a: RememberArgs): readonly string[] {
  const argv = ['remember', a.kind, plain('memory line', a.text.trim())];
  optional(argv, '--detail', a.detail);
  return argv;
}

/** Fields both kinds of person share. */
interface PersonCommon {
  readonly name: string;
  readonly source?: PersonSource;
  readonly foundVia?: string;
  readonly whyThem?: string;
  readonly priority?: 1 | 2 | 3;
  readonly note?: string;
}

export interface ProspectArgs extends PersonCommon {
  readonly email: string;
  readonly company?: string;
  readonly title?: string;
}

export interface TargetArgs extends PersonCommon {
  readonly platform: TargetPlatform;
  readonly handle: string;
  readonly platformLabel?: string;
}

/** ge person add prospect <email> "<name>" [flags]. B2B only. */
export function personAddProspectArgv(a: ProspectArgs): readonly string[] {
  const argv = [
    'person',
    'add',
    'prospect',
    plain('email address', a.email.trim()),
    plain('name', a.name.trim()),
  ];
  optional(argv, '--company', a.company);
  optional(argv, '--title', a.title);
  addCommon(argv, a);
  return argv;
}

/** ge person add target <ig|fb|other> <handle> "<name>" [flags]. B2C only. */
export function personAddTargetArgv(a: TargetArgs): readonly string[] {
  const argv = [
    'person',
    'add',
    'target',
    a.platform,
    plain('handle', a.handle.trim()),
    plain('name', a.name.trim()),
  ];
  optional(argv, '--platform-label', a.platformLabel);
  addCommon(argv, a);
  return argv;
}

function addCommon(argv: string[], a: PersonCommon): void {
  optional(argv, '--source', a.source);
  optional(argv, '--found-via', a.foundVia);
  optional(argv, '--why-them', a.whyThem);
  if (a.priority !== undefined) argv.push('--priority', String(a.priority));
  optional(argv, '--note', a.note);
}

/** What the model is handed back after ge has run. */
export interface ToolReply {
  readonly text: string;
  readonly isError: boolean;
}

/**
 * ge's three exit codes, each turned into a sentence the model can act on.
 *
 *   0  it did it.
 *   1  it refused, and stderr already says why in founder prose with a
 *      recovery line. That text is passed through rather than rewritten,
 *      because ge's refusals were written for this audience and ours would not
 *      be as good.
 *   2  no such person. Not a failure. It is why ge person distinguishes 2 from
 *      1 at all, and the app's answer is to offer to add them.
 */
export function describeGeResult(
  result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean },
  what: string,
): ToolReply {
  if (result.timedOut) {
    return {
      isError: true,
      text: `That took too long and was stopped, so nothing was written. Tell the founder their files are untouched and offer to try ${what} again.`,
    };
  }
  switch (result.exitCode) {
    case 0:
      return { isError: false, text: result.stdout.trim() || `Done: ${what}.` };
    case 2:
      return {
        isError: false,
        text: `There is nobody by that name or address in their people folder yet. Offer to add them before doing anything else. ge said: ${oneLine(result.stderr)}`,
      };
    default:
      return {
        isError: true,
        text: `That was refused and nothing was written. Read this back to the founder in your own words, keeping any line that starts with an arrow: ${oneLine(result.stderr)}`,
      };
  }
}

function oneLine(text: string): string {
  return text.trim().replace(/\s*\n\s*/g, ' ').slice(0, 1500);
}
