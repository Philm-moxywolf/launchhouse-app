/**
 * labels.ts
 *
 * WHAT: Turns one tool call into one line a founder can read. `Read
 *       growth-engine/founder-brain.md` becomes "reading your Founder Brain".
 *
 * WHY IT EXISTS: A founder watching nothing happen for 40 seconds while the
 *       model reads three files concludes the app is broken and messages a
 *       mentor. There are 130 of them and three days. So tool activity is
 *       forwarded, and it is forwarded as plain English, because raw tool JSON
 *       on the screen of a non technical founder is worse than silence.
 *
 * CALLED BY: runner.ts, on every tool_use block and every PostToolUse hook.
 * READS:  nothing. WRITES: nothing. Pure functions.
 *
 * Two rules hold here and both are deliberate.
 *   Nothing from tool input reaches the founder except a file path that
 *   matched the known file list. A model writing a prospect's email address
 *   into a Grep pattern must not put it on a status line, and from there into
 *   a screenshot in a room with 130 people in it.
 *   An unknown tool gets a vague line, never its name and never its input. The
 *   tool surface is frozen, so an unknown tool is a deploy bug, and a founder
 *   is not the right person to read the stack trace.
 */

/** The founder's own files, in the words the playbook and the sessions use. */
const FILE_NAMES: Readonly<Record<string, string>> = {
  'founder-brain.md': 'your Founder Brain',
  'content-30.md': 'your 30 content pieces',
  'content-30.csv': 'your content upload file',
  'rss-feeds.md': 'your topic sources',
  'outreach-sequence.md': 'your outreach sequence',
  'outreach-firstlines.csv': 'your first lines file',
  'dm-openers.md': 'your DM openers',
  'hook-bank.md': 'your hook bank',
  'inbound-scripts.md': 'your inbound scripts',
  'ops-workflow.md': 'your workflow copy',
  'growth-plan.md': 'your 90 day plan',
  'ledger.md': 'your content ledger',
  'memory.md': 'your memory file',
  'ops-log.md': 'your ops log',
  '.state/index.md': 'your file list',
};

/**
 * Strips the leading growth-engine/ and any path the model wrote relative to
 * its cwd, then looks the tail up. Returns null when it is not a known file,
 * which is what stops an arbitrary path reaching a founder's screen.
 */
export function friendlyFile(rawPath: unknown): string | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null;
  const normalised = rawPath.replace(/\\/g, '/');
  const afterRoot = normalised.replace(/^.*?growth-engine\//, '');
  const known = FILE_NAMES[afterRoot];
  if (known) return known;
  if (afterRoot.startsWith('people/')) return 'one of your people files';
  if (afterRoot.startsWith('voice-samples/')) return 'one of your writing samples';
  if (afterRoot.startsWith('.state/')) return 'your working notes';
  return null;
}

/** What we say when the file is not one we recognise. Vague on purpose. */
const A_FILE = 'one of your files';

/**
 * The line shown while a tool is running. `input` is untrusted: it is whatever
 * the model emitted, so nothing is read out of it except a path, and only after
 * that path has matched the known list.
 */
export function startLabel(toolName: string, input: unknown): string {
  const path = pathFrom(input);
  const file = path === null ? null : friendlyFile(path);
  switch (toolName) {
    case 'Read':
      return `Reading ${file ?? A_FILE}`;
    case 'Write':
      return `Writing ${file ?? A_FILE}`;
    case 'Edit':
      return `Updating ${file ?? A_FILE}`;
    case 'Glob':
    case 'Grep':
      return 'Looking through your folder';
    case 'TodoWrite':
      return 'Keeping track of the steps';
    case 'mcp__ge__remember':
      return 'Noting that down in your memory file';
    case 'mcp__ge__person_add':
      return 'Adding somebody to your people list';
    default:
      // Deliberately says nothing about which tool. See the header comment.
      return 'Working on it';
  }
}

/** The line shown once a tool has finished. Past tense, same discipline. */
export function endLabel(toolName: string, input: unknown): string {
  const path = pathFrom(input);
  const file = path === null ? null : friendlyFile(path);
  switch (toolName) {
    case 'Read':
      return `Read ${file ?? A_FILE}`;
    case 'Write':
      return `Wrote ${file ?? A_FILE}`;
    case 'Edit':
      return `Updated ${file ?? A_FILE}`;
    case 'Glob':
    case 'Grep':
      return 'Looked through your folder';
    case 'TodoWrite':
      return 'Updated the steps';
    case 'mcp__ge__remember':
      return 'Noted that in your memory file';
    case 'mcp__ge__person_add':
      return 'Added them to your people list';
    default:
      return 'Done';
  }
}

/**
 * The only field ever read out of a tool input. Both Read and Write use
 * file_path; Edit uses it too. Anything else is ignored.
 */
function pathFrom(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const candidate = (input as { file_path?: unknown }).file_path;
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Which tool writes founder files. runner.ts emits a `file` frame after these,
 * so the Files panel updates live and the founder watches the Brain appear.
 */
export function isFileWrite(toolName: string): boolean {
  return toolName === 'Write' || toolName === 'Edit';
}

