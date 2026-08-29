/**
 * src/server/ge/verbs.ts
 *
 * WHAT THIS IS
 *   One typed function per ge verb. Every argv the app ever builds is built here.
 *
 * WHY IT EXISTS
 *   Three failures.
 *
 *   A string of arguments assembled at a call site is where a founder's own text
 *   eventually ends up next to a flag. Building each argv in one named function, from
 *   named parameters, means the shape of every call is reviewable in one file.
 *
 *   The frozen registry. VERBS below is the complete list of things this app can ask
 *   ge to do, and runVerb refuses anything not in it. That is one of the five layers
 *   holding rule 2: there is no verb here that sends a message to anybody, so no
 *   sequence of model output can reach one. ge person touch RECORDS that a founder
 *   sent something. It does not send it.
 *
 *   Values the model can choose. A status, a kind, a source and a priority all come
 *   from fixed lists in the schemas. Checking them here means an invented value is a
 *   typed error in our process rather than a refusal ge has to print to a founder.
 *
 * WHAT CALLS IT
 *   The agent's in process MCP tools for remember and person, the setup routes for
 *   receipt and accounts, the files view for index and lint, and storage/turn.ts's
 *   callers. Everything goes through storage/turn.ts so the writes are harvested.
 *
 * READS  nothing directly
 * WRITES nothing directly. ge writes inside the founder's folder.
 *
 * NO FUNCTION HERE TAKES A FOLDER, A PATH PREFIX OR A TOKEN. The context carries the
 * founder id and the timezone, and run.ts turns those into cwd, HOME and GE_HOME. A
 * tool schema that named a folder would be a way for the model to name someone else's.
 */

import { isNotFound, isRefusal, runGe, type GeResult } from './run.ts';

export interface GeCallContext {
  founderId: string;
  /** IANA zone from the founder row. Never an offset, never the container's. */
  timezone: string;
  timeoutMs?: number;
}

/**
 * Every verb this app may ask for. ge has more; these are the ones with a caller.
 *
 * ADDING A ROW IS A DECISION, not a formality. The list is what makes "nothing in the
 * runtime can send a message anywhere" a fact about the code rather than a promise in
 * a skill file.
 */
export const VERBS = [
  'init',
  'context',
  'check',
  'index',
  'lint',
  'version',
  'invocation',
  'log',
  'remember',
  'person',
  'ledger',
  'receipt',
  'accounts',
  'snapshot',
  'restore',
  'undo',
] as const;
export type Verb = (typeof VERBS)[number];

const VERB_SET: ReadonlySet<string> = new Set(VERBS);

export class VerbRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerbRefused';
  }
}

/** Values from the schemas. Checked at the boundary so ge never has to refuse them. */
export const LOG_TYPES = ['decision', 'result', 'blocker', 'note'] as const;
export const MEMORY_KINDS = ['decision', 'worked', 'didnot', 'voice', 'angle', 'thread'] as const;
export const PERSON_SOURCES = ['manual', 'apollo', 'import', 'form'] as const;
export const PROSPECT_STATUSES = ['candidate', 'cut', 'contacted_ok', 'enrolled', 'replied', 'stopped'] as const;
export const TARGET_STATUSES = ['target', 'opener_written', 'sent', 'replied', 'booked', 'no_reply'] as const;
export const TARGET_PLATFORMS = ['ig', 'fb', 'other'] as const;
export const TOUCH_CHANNELS = ['email', 'dm', 'call', 'form', 'other'] as const;
export const TOUCH_DIRECTIONS = ['in', 'out'] as const;
export const LEDGER_STATUSES = ['draft', 'approved', 'scheduled', 'posted', 'failed', 'archived'] as const;
export const LEDGER_LANES = ['text', 'media'] as const;
export const PRIORITIES = ['1', '2', '3'] as const;
/**
 * email_status only takes unverified today. Assumption A11: the exact Apollo field
 * carrying deliverability status is unverified, and two files already write
 * email_status. Widening this list is a change that waits for the spike.
 */
export const EMAIL_STATUSES = ['unverified'] as const;

export type LogType = (typeof LOG_TYPES)[number];
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type PersonSource = (typeof PERSON_SOURCES)[number];
export type TargetPlatform = (typeof TARGET_PLATFORMS)[number];
export type TouchChannel = (typeof TOUCH_CHANNELS)[number];
export type TouchDirection = (typeof TOUCH_DIRECTIONS)[number];
export type Priority = (typeof PRIORITIES)[number];

function oneOf<T extends string>(allowed: readonly T[], value: string, what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new VerbRefused(`${what} must be one of ${allowed.join(', ')}, and it was ${JSON.stringify(value)}`);
  }
  return value as T;
}

/**
 * Text a founder or a model supplies, on its way into an argument.
 *
 * A line break and the marker text are refused here as well as inside ge. ge refuses
 * them because both survive the write and break the file afterwards, when nobody is
 * watching. Refusing here means the founder gets the app's sentence rather than a
 * shell tool's, and means a model tool call fails in our process where it can be
 * retried, rather than costing a spawn.
 *
 * NOTE WHAT IS NOT DONE HERE. Nothing is escaped, quoted or stripped. There is no
 * shell, so there is nothing to escape for, and a sanitiser would change a founder's
 * own words.
 */
function assertText(value: string, what: string, maxBytes = 2000): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new VerbRefused(`the ${what} cannot be empty`);
  }
  if (/[\r\n]/.test(value)) {
    throw new VerbRefused(`the ${what} cannot contain a line break. Put the text on one line.`);
  }
  if (value.includes('<!-- GE:')) {
    throw new VerbRefused(`the ${what} cannot contain "<!-- GE:". That is how ge marks the parts of a file it owns.`);
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new VerbRefused(`the ${what} is longer than ${maxBytes} bytes`);
  }
  return value;
}

/**
 * The single door. Every function below reaches ge through this one, and this one
 * checks the verb is on the frozen list before anything is spawned.
 */
async function runVerb(
  ctx: GeCallContext,
  argv: readonly string[],
  stdin?: string | Buffer,
): Promise<GeResult> {
  const verb = argv[0];
  if (!verb || !VERB_SET.has(verb)) {
    throw new VerbRefused(`ge verb ${JSON.stringify(verb ?? '')} is not one this app may call`);
  }
  const options: Parameters<typeof runGe>[0] = {
    founderId: ctx.founderId,
    timezone: ctx.timezone,
    argv,
  };
  if (stdin !== undefined) options.stdin = stdin;
  if (ctx.timeoutMs !== undefined) options.timeoutMs = ctx.timeoutMs;
  return runGe(options);
}

/**
 * Turn a result into a value, or throw.
 *
 * Exit 2 is passed through rather than thrown, because it is not a failure: ge person
 * distinguishes 1 from 2 so the app can offer to add somebody. Callers that care use
 * isNotFound on the result; callers that do not get a thrown refusal on exit 1 only.
 */
function expectOk(result: GeResult, what: string): GeResult {
  if (result.timedOut) {
    throw new VerbRefused(`${what} did not finish in time. Nothing was changed.`);
  }
  if (isRefusal(result)) {
    throw new VerbRefused(result.stderr.trim() || `${what} was refused`);
  }
  if (result.exitCode !== 0 && !isNotFound(result)) {
    throw new VerbRefused(`${what} ended with an unexpected code ${result.exitCode}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// The folder
// ---------------------------------------------------------------------------

/** Build the growth-engine folder. Safe to run again, and ge init is idempotent. */
export async function init(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['init']), 'ge init');
}

/**
 * Rebuild .state/index.md.
 *
 * The files view renders this table and nothing else. It already exists, it is
 * already in build order rather than alphabetical, and it already forks on the Track
 * line so a B2B founder never sees hook-bank.md. Rendering anything else would be a
 * second answer to what a founder has.
 */
export async function index(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['index']), 'ge index');
}

/** Warnings about the shape of the founder's files. Changes nothing. */
export async function lint(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['lint']), 'ge lint');
}

/** What state the folder is in. Read only. */
export async function check(ctx: GeCallContext): Promise<GeResult> {
  // check reports faults by exiting non zero, so its own exit code is the answer and
  // is handed back rather than thrown.
  return runVerb(ctx, ['check']);
}

/** A short summary of where the founder's work stands. Read only. */
export async function context(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['context']), 'ge context');
}

/** Which version of the toolkit this container holds. For the health endpoint. */
export async function version(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['version']), 'ge version');
}

// ---------------------------------------------------------------------------
// The two verbs the model calls mid conversation
// ---------------------------------------------------------------------------

/** One line in the ops log. Append only: nothing logged is ever rewritten. */
export async function log(ctx: GeCallContext, type: LogType, text: string): Promise<GeResult> {
  return expectOk(
    await runVerb(ctx, ['log', oneOf(LOG_TYPES, type, 'log type'), assertText(text, 'log text')]),
    'ge log',
  );
}

/**
 * One line in the curated memory.
 *
 * Exposed to the model as an MCP tool. The tool's input schema has a kind and a text
 * and nothing else: no founder id, no path, no folder. The model cannot name a
 * founder, so it cannot name the wrong one.
 */
export async function remember(
  ctx: GeCallContext,
  kind: MemoryKind,
  text: string,
  detail?: string,
): Promise<GeResult> {
  const argv = ['remember', oneOf(MEMORY_KINDS, kind, 'memory kind'), assertText(text, 'memory text')];
  if (detail !== undefined) argv.push('--detail', assertText(detail, 'detail'));
  return expectOk(await runVerb(ctx, argv), 'ge remember');
}

// ---------------------------------------------------------------------------
// People. Real names, companies, titles, addresses and handles.
// ---------------------------------------------------------------------------

export interface PersonCommonFields {
  foundVia?: string;
  whyThem?: string;
  priority?: Priority;
  note?: string;
  noteSource?: string;
  source?: PersonSource;
}

function commonPersonFlags(fields: PersonCommonFields): string[] {
  const argv: string[] = [];
  if (fields.source !== undefined) argv.push('--source', oneOf(PERSON_SOURCES, fields.source, 'source'));
  if (fields.foundVia !== undefined) argv.push('--found-via', assertText(fields.foundVia, 'found via'));
  if (fields.whyThem !== undefined) argv.push('--why-them', assertText(fields.whyThem, 'why them'));
  if (fields.priority !== undefined) argv.push('--priority', oneOf(PRIORITIES, fields.priority, 'priority'));
  if (fields.note !== undefined) argv.push('--note', assertText(fields.note, 'note'));
  if (fields.noteSource !== undefined) argv.push('--note-source', assertText(fields.noteSource, 'note source'));
  return argv;
}

/** A B2B prospect, keyed on their email address. */
export async function personAddProspect(
  ctx: GeCallContext,
  args: PersonCommonFields & { email: string; name: string; company?: string; title?: string },
): Promise<GeResult> {
  const argv = [
    'person',
    'add',
    'prospect',
    assertText(args.email, 'email address', 320),
    assertText(args.name, 'name'),
  ];
  if (args.company !== undefined) argv.push('--company', assertText(args.company, 'company'));
  if (args.title !== undefined) argv.push('--title', assertText(args.title, 'title'));
  argv.push(...commonPersonFlags(args));
  return expectOk(await runVerb(ctx, argv), 'ge person add prospect');
}

/**
 * A B2C target, keyed on platform and handle.
 *
 * RULE 2 LIVES HERE AS AN ABSENCE. There is no verb that messages a target, and there
 * is no flag on this one that schedules anything. Cold DMs are 25 of them, by hand,
 * spread out. Automation lives on the inbound side only, and the inbound side is a
 * GoHighLevel workflow the founder builds, not a call this app makes.
 */
export async function personAddTarget(
  ctx: GeCallContext,
  args: PersonCommonFields & {
    platform: TargetPlatform;
    handle: string;
    name: string;
    platformLabel?: string;
  },
): Promise<GeResult> {
  const argv = [
    'person',
    'add',
    'target',
    oneOf(TARGET_PLATFORMS, args.platform, 'platform'),
    assertText(args.handle, 'handle', 200),
    assertText(args.name, 'name'),
  ];
  if (args.platformLabel !== undefined) {
    argv.push('--platform-label', assertText(args.platformLabel, 'platform label'));
  }
  argv.push(...commonPersonFlags(args));
  return expectOk(await runVerb(ctx, argv), 'ge person add target');
}

/**
 * Set one field on one person. key, kind and created cannot change.
 *
 * The field name is not checked against a list here, because the list differs by kind
 * and ge already refuses a field the person cannot have, with a sentence written for
 * the founder. Status values are checked, because those are the ones a model invents.
 */
export async function personSet(
  ctx: GeCallContext,
  who: string,
  field: string,
  value: string,
): Promise<GeResult> {
  if (field === 'status') {
    const known = [...PROSPECT_STATUSES, ...TARGET_STATUSES] as readonly string[];
    if (!known.includes(value)) {
      throw new VerbRefused(`status must be one of ${known.join(', ')}, and it was ${JSON.stringify(value)}`);
    }
  }
  if (field === 'email_status') oneOf(EMAIL_STATUSES, value, 'email_status');
  if (field === 'priority') oneOf(PRIORITIES, value, 'priority');
  return expectOk(
    await runVerb(ctx, [
      'person',
      'set',
      assertText(who, 'person', 320),
      assertText(field, 'field', 64),
      assertText(value, 'value'),
    ]),
    'ge person set',
  );
}

/** The whole person file, or one value. Exit 2 means nobody of that name. */
export async function personGet(ctx: GeCallContext, who: string, field?: string): Promise<GeResult> {
  const argv = ['person', 'get', assertText(who, 'person', 320)];
  if (field !== undefined) argv.push(assertText(field, 'field', 64));
  return expectOk(await runVerb(ctx, argv), 'ge person get');
}

export interface PersonListFilters {
  kind?: 'prospect' | 'target';
  status?: string;
  platform?: TargetPlatform;
  source?: PersonSource;
  priority?: Priority;
  needs?: 'opener' | 'followup' | 'touch';
  long?: boolean;
}

/**
 * The people list.
 *
 * ge person list prints a malformed file as a row with the reason beside it rather
 * than dropping it, which is why the files view expands the people row from this and
 * not from a directory listing. A dropped row is a person the founder thinks they
 * have not added.
 *
 * A MENTOR NEVER SEES THE OUTPUT OF THIS. The mentor surface reduces to counts by
 * status before anything leaves the server. That single choice keeps thousands of
 * strangers' contact details out of a browser tab in a room with 130 people in it.
 */
export async function personList(
  ctx: GeCallContext,
  filters: PersonListFilters = {},
): Promise<GeResult> {
  const argv = ['person', 'list'];
  if (filters.kind !== undefined) argv.push('--kind', oneOf(['prospect', 'target'] as const, filters.kind, 'kind'));
  if (filters.status !== undefined) {
    const known = [...PROSPECT_STATUSES, ...TARGET_STATUSES] as readonly string[];
    if (!known.includes(filters.status)) throw new VerbRefused(`status ${JSON.stringify(filters.status)} is not one of the known ones`);
    argv.push('--status', filters.status);
  }
  if (filters.platform !== undefined) argv.push('--platform', oneOf(TARGET_PLATFORMS, filters.platform, 'platform'));
  if (filters.source !== undefined) argv.push('--source', oneOf(PERSON_SOURCES, filters.source, 'source'));
  if (filters.priority !== undefined) argv.push('--priority', oneOf(PRIORITIES, filters.priority, 'priority'));
  if (filters.needs !== undefined) {
    argv.push('--needs', oneOf(['opener', 'followup', 'touch'] as const, filters.needs, 'needs'));
  }
  if (filters.long) argv.push('--long');
  return expectOk(await runVerb(ctx, argv), 'ge person list');
}

/** A note about a person. Appended, never rewritten. */
export async function personNote(
  ctx: GeCallContext,
  who: string,
  text: string,
  source?: string,
): Promise<GeResult> {
  const argv = ['person', 'note', assertText(who, 'person', 320), assertText(text, 'note')];
  if (source !== undefined) argv.push('--source', assertText(source, 'note source'));
  return expectOk(await runVerb(ctx, argv), 'ge person note');
}

/**
 * Record one contact. RECORDS, does not send.
 *
 * The only status this advances on its own is an outbound dm on a target, which moves
 * opener_written to sent, because those are the two states where the meaning is plain.
 */
export async function personTouch(
  ctx: GeCallContext,
  who: string,
  channel: TouchChannel,
  direction: TouchDirection,
  text: string,
): Promise<GeResult> {
  return expectOk(
    await runVerb(ctx, [
      'person',
      'touch',
      assertText(who, 'person', 320),
      oneOf(TOUCH_CHANNELS, channel, 'channel'),
      oneOf(TOUCH_DIRECTIONS, direction, 'direction'),
      assertText(text, 'what happened'),
    ]),
    'ge person touch',
  );
}

/**
 * Write the opener for one person, from bytes rather than from a path.
 *
 * '-' and stdin rather than --file: a path argument would mean the app writing a
 * temporary file inside the founder's folder, which the harvest would then find and
 * store. ge person opener already caps an opener at 2000 bytes and 12 lines because
 * somebody pointed --file at a content plan, and the same class of accident exists in
 * a browser, so the cap is respected here rather than argued with.
 */
export async function personOpener(ctx: GeCallContext, who: string, opener: string): Promise<GeResult> {
  if (Buffer.byteLength(opener, 'utf8') > 2000) {
    throw new VerbRefused('an opener is at most 2000 bytes');
  }
  if (opener.split(/\r?\n/).length > 12) {
    throw new VerbRefused('an opener is at most 12 lines');
  }
  return expectOk(
    await runVerb(ctx, ['person', 'opener', assertText(who, 'person', 320), '-'], opener),
    'ge person opener',
  );
}

/** Back the person file up and take it out of the live folder. Reversible. */
export async function personRemove(ctx: GeCallContext, who: string): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['person', 'remove', assertText(who, 'person', 320)]), 'ge person remove');
}

/**
 * Destroy the person file and every backup of it. stopped or cut only.
 *
 * STEP 2 OF SIX, AND THE OTHER FIVE ARE NOT HERE. Purge refuses unless the status is
 * already stopped or cut, and that is deliberate. The full removal a prospect asks
 * for is: set the status, purge, regenerate both exports, delete the ge_file and
 * ge_file_version rows and the orphaned blobs, delete every object storage backup for
 * that founder and take a fresh one, then show the founder what is gone and what is
 * not. A deletion that leaves the person in GoHighLevel or Apollo is not a deletion.
 *
 * The regeneration of the two exports is change 4 of the five ge needs. Until it
 * lands, a purged prospect's address stays in outreach-firstlines.csv, which is a CSV
 * the founder is about to send from, so the caller regenerates both by hand.
 */
export async function personPurge(ctx: GeCallContext, who: string): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['person', 'purge', assertText(who, 'person', 320)]), 'ge person purge');
}

/** Write growth-engine/outreach-firstlines.csv. */
export async function personExportFirstlines(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['person', 'export', 'firstlines']), 'ge person export firstlines');
}

/** Write the GE:TARGETS block inside growth-engine/dm-openers.md. */
export async function personExportOpeners(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['person', 'export', 'openers']), 'ge person export openers');
}

// ---------------------------------------------------------------------------
// The content ledger
// ---------------------------------------------------------------------------

export async function ledgerAddContent(
  ctx: GeCallContext,
  args: { id: string; pillar: number; format: string; lane: (typeof LEDGER_LANES)[number] },
): Promise<GeResult> {
  if (!Number.isInteger(args.pillar) || args.pillar < 0) {
    throw new VerbRefused('a pillar is a whole number');
  }
  if (args.id.includes('|') || args.format.includes('|')) {
    // The separator is a pipe because it cannot appear in an id, a format, a status
    // or a post id. ge refuses one too; refusing here names the field.
    throw new VerbRefused('no value in the ledger may contain a pipe');
  }
  // An id may not start with a dash on a new row: ge ledger approve -x would read it
  // as an option and never find the piece, so the founder could write it and never
  // post it.
  if (args.id.startsWith('-')) {
    throw new VerbRefused('an id may not start with a dash');
  }
  return expectOk(
    await runVerb(ctx, [
      'ledger',
      'add-content',
      assertText(args.id, 'id', 200),
      String(args.pillar),
      assertText(args.format, 'format', 64),
      oneOf(LEDGER_LANES, args.lane, 'lane'),
    ]),
    'ge ledger add-content',
  );
}

export async function ledgerSetContent(
  ctx: GeCallContext,
  id: string,
  field: string,
  value: string,
): Promise<GeResult> {
  if (value.includes('|')) throw new VerbRefused('no value in the ledger may contain a pipe');
  if (field === 'status') oneOf(LEDGER_STATUSES, value, 'status');
  if (field === 'lane') oneOf(LEDGER_LANES, value, 'lane');
  // '--' says the next word is an id and not an option, and every verb that takes an
  // id honours it. A row written before the leading dash rule existed is still
  // reachable this way.
  const argv = ['ledger', 'set-content'];
  if (id.startsWith('-')) argv.push('--');
  argv.push(assertText(id, 'id', 200), assertText(field, 'field', 64), assertText(value, 'value'));
  return expectOk(await runVerb(ctx, argv), 'ge ledger set-content');
}

export async function ledgerApprove(ctx: GeCallContext, id: string): Promise<GeResult> {
  const argv = ['ledger', 'approve'];
  if (id.startsWith('-')) argv.push('--');
  argv.push(assertText(id, 'id', 200));
  return expectOk(await runVerb(ctx, argv), 'ge ledger approve');
}

export async function ledgerApproveAllText(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['ledger', 'approve', '--all-text']), 'ge ledger approve --all-text');
}

export async function ledgerList(ctx: GeCallContext, status?: string): Promise<GeResult> {
  const argv = ['ledger', 'list', 'C'];
  if (status !== undefined) argv.push('--status', oneOf(LEDGER_STATUSES, status, 'status'));
  return expectOk(await runVerb(ctx, argv), 'ge ledger list');
}

// ---------------------------------------------------------------------------
// The receipt and the accounts list
// ---------------------------------------------------------------------------

/**
 * Set one check line in .state/receipt.md.
 *
 * ge receipt set checks the value, refuses a token shaped one, and takes a backup
 * first. The pit- guard from receipt.sh runs on ge's side; the app runs its own
 * before the call, because a secret written into a file is then in a backup and in
 * the next support screenshot.
 */
export async function receiptSet(
  ctx: GeCallContext,
  checkName: string,
  value: string,
): Promise<GeResult> {
  if (/\bpit-/.test(value)) {
    throw new VerbRefused('that value looks like a token, and a token is never written into a file');
  }
  return expectOk(
    await runVerb(ctx, ['receipt', 'set', assertText(checkName, 'check name', 64), assertText(value, 'value')]),
    'ge receipt set',
  );
}

export async function receiptShow(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['receipt', 'show']), 'ge receipt show');
}

/**
 * Replace the whole social accounts list. Rows are piped in, not typed after it.
 *
 * The row shape is `<id>|<platform>|<label>` per schemas/ghl-accounts.md. The ids
 * themselves come from GoHighLevel and their shape is UNVERIFIED, so nothing here
 * validates them beyond the pipe count: inventing a format is how a fixture stops
 * matching the vendor.
 */
export async function accountsSet(
  ctx: GeCallContext,
  rows: ReadonlyArray<{ id: string; platform: string; label: string }>,
): Promise<GeResult> {
  const lines = rows.map((row) => {
    for (const [what, value] of [['id', row.id], ['platform', row.platform], ['label', row.label]] as const) {
      if (value.includes('|') || /[\r\n]/.test(value)) {
        throw new VerbRefused(`an account ${what} cannot contain a pipe or a line break`);
      }
    }
    return `${row.id}|${row.platform}|${row.label}`;
  });
  return expectOk(await runVerb(ctx, ['accounts', 'set'], `${lines.join('\n')}\n`), 'ge accounts set');
}

export async function accountsList(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['accounts', 'list']), 'ge accounts list');
}

/** Backs up first. Never offered on a recovery line, and the app asks before calling it. */
export async function accountsClear(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['accounts', 'clear']), 'ge accounts clear');
}

// ---------------------------------------------------------------------------
// The snapshot ring
// ---------------------------------------------------------------------------

/** Copy one file before it is changed. No backup, no write. */
export async function snapshot(ctx: GeCallContext, file: string): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['snapshot', assertText(file, 'file name', 400)]), 'ge snapshot');
}

/** Put an older copy back from ge's own ten deep ring. */
export async function restore(ctx: GeCallContext, file: string): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['restore', assertText(file, 'file name', 400)]), 'ge restore');
}

/**
 * Put a version from the database back, by handing ge the bytes on stdin.
 *
 * WHY THIS EXISTS AT ALL. ge restore reads its own ten deep ring. The database keeps
 * every version forever, and there is no way to put one of those back without the app
 * writing a founder file, which breaks one writer. ge snapshots first, so the restore
 * is itself undoable, which is what makes the History panel's put this back button
 * safe to press.
 *
 * DEPENDS ON A ge CHANGE THAT IS BEING MADE IN PARALLEL, change 2 of five. Probe it
 * with probeGeStdinRestore() before relying on it in a deployment.
 */
export async function restoreFromBytes(
  ctx: GeCallContext,
  file: string,
  bytes: Buffer,
): Promise<GeResult> {
  return expectOk(
    await runVerb(ctx, ['restore', assertText(file, 'file name', 400), '--from', '-'], bytes),
    'ge restore --from -',
  );
}

/**
 * Undo the last change ge made.
 *
 * Pressing it twice is safe, because .state/undone records what a previous undo
 * already put back, WHICH IS THE WHOLE REASON THAT FILE IS HARVESTED. A cold
 * container that starts without it recreates the bug where a second undo hands the
 * damage back.
 */
export async function undo(ctx: GeCallContext): Promise<GeResult> {
  return expectOk(await runVerb(ctx, ['undo']), 'ge undo');
}

export { isNotFound, isRefusal };
export type { GeResult };
