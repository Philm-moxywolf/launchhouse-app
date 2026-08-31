/**
 * scripts/check-replit-config.ts
 *
 * WHAT THIS IS
 *   A guard on four lines of `.replit` that decide whether this app works at all,
 *   run before every build, so a deployment that would be silently wrong fails
 *   loudly instead.
 *
 * WHY IT EXISTS
 *   `.replit` is not only ours. Replit's own agent writes to it, an import can
 *   rewrite it, and a founder can open it. It already happened once: the agent
 *   deleted two comments from this file on 31 August 2026, and one of them was the
 *   note explaining why Node 22 is required. Nothing noticed.
 *
 *   The four lines below are different from the rest, because losing them does not
 *   break anything visibly. `deploymentTarget = "vm"` is the whole difference
 *   between a Reserved VM and Autoscale, and this app on Autoscale does not fail. It
 *   degrades: connections cut mid turn, live sessions killed when the machine scales
 *   to zero, the queue lost with the process, 30 to 180 second turns against a
 *   request timeout. A founder reads that as the app being flaky and asks a mentor,
 *   and the mentor cannot see it either.
 *
 *   THE REASON A COMMENT IS NOT ENOUGH. A comment stops a person who reads it. It
 *   does not stop an agent rewriting the file, and it does not stop a remix that
 *   inherits a file somebody already tidied. Files and configuration copy on a
 *   remix; pane settings do not. So this section is how 130 founders get a working
 *   deployment target without any of them choosing one, which also means it is a
 *   single point of failure for all 130 at once.
 *
 * WHY IT FAILS THE BUILD RATHER THAN FIXING ITSELF
 *   Writing the section back would be tidier and it is the wrong call. Two things
 *   would be silently rewriting the same file, on a schedule nobody controls, and
 *   the first symptom of them disagreeing would be at the event. A failed build is
 *   visible, it happens before anything is serving, and the message below says
 *   exactly what to paste. A wrong deployment target is invisible until it matters.
 *
 * WHAT CALLS IT
 *   `npm run prebuild`, which npm runs before `npm run build` on its own. The
 *   deployment build command is `npm ci && npm run build`, so this runs there
 *   without the command having to mention it, which is deliberate: a check that has
 *   to be added to a pane is a check that is one pane edit from being off.
 *
 *   `tests/unit/replit-config.test.ts` calls `checkReplitConfig` directly, so `npm
 *   test` catches it too, and so the failure text itself is under test.
 *
 * READS   `.replit`. WRITES nothing, ever.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPLIT_CONFIG_PATH = join(HERE, '..', '.replit');

/** The block that has to be in the file, and the text a person pastes back. */
export const REQUIRED_DEPLOYMENT_BLOCK = `[deployment]
deploymentTarget = "vm"
run = ["npm", "run", "start"]
build = ["bash", "-c", "npm ci && npm run build"]`;

/** One thing that has to be true, with what it costs when it is not. */
interface Requirement {
  readonly what: string;
  readonly present: (config: string) => boolean;
  readonly cost: string;
}

const REQUIREMENTS: readonly Requirement[] = [
  {
    what: 'a [deployment] section',
    present: (c) => /^\[deployment\]/m.test(c),
    cost: 'Without it the deployment target comes from the Deployments pane, which a remix does not copy, so every founder picks their own and the default is the wrong one.',
  },
  {
    what: 'deploymentTarget = "vm"',
    present: (c) => /^\s*deploymentTarget\s*=\s*"vm"\s*$/m.test(c),
    cost: 'This is the Reserved VM. On Autoscale this app does not fail, it degrades: connections cut mid turn, live sessions killed when the machine scales to zero, the queue lost with the process. It reads as flakiness and nobody can see the cause.',
  },
  {
    what: 'run = ["npm", "run", "start"]',
    present: (c) => /^\s*run\s*=\s*\[\s*"npm"\s*,\s*"run"\s*,\s*"start"\s*\]\s*$/m.test(c),
    cost: 'The run command. Anything else skips prestart, which is what builds the screens when they are missing.',
  },
  {
    what: 'build with npm ci, not npm install',
    present: (c) => /^\s*build\s*=\s*\[[^\]]*npm ci[^\]]*\]\s*$/m.test(c),
    cost: 'npm install can skip the optional per platform binary the agent loop spawns. The deployment then goes green and fails at the founder\'s first message, which is the worst place to find out.',
  },
];

/** Every requirement that is not met. Empty means the file is intact. */
export function checkReplitConfig(config: string): string[] {
  return REQUIREMENTS.filter((r) => !r.present(config)).map(
    (r) => `MISSING: ${r.what}\n    ${r.cost}`,
  );
}

/** The whole message, including the block to paste. Exported so a test can read it. */
export function failureMessage(problems: readonly string[]): string {
  return [
    '',
    '  .replit has lost something a deployment depends on.',
    '',
    '  Nothing is broken in your own work and you have not done anything wrong. One',
    '  settings file lost a few lines. There are two ways back and both are quick.',
    '',
    ...problems.map((p) => `  ${p}\n`),
    '  ------------------------------------------------------------------------',
    '  OPTION 1. PUT THE LINES BACK. Loses nothing. Do this one if you are unsure.',
    '  ------------------------------------------------------------------------',
    '',
    '  Open the file called .replit and paste this into it:',
    '',
    ...REQUIRED_DEPLOYMENT_BLOCK.split('\n').map((l) => `      ${l}`),
    '',
    '  It goes at the outer level of the file, not tucked inside another block that',
    '  starts with a name in square brackets. If some of these lines are already',
    '  there, leave them and add only the missing ones. Then build again.',
    '',
    '  ------------------------------------------------------------------------',
    '  OPTION 2. ROLL BACK, IF SOMETHING CHANGED YOUR PROJECT A MOMENT AGO.',
    '  ------------------------------------------------------------------------',
    '',
    '  Replit keeps checkpoints of your project, and it can go back to one. If you',
    '  just asked the Replit assistant to do something and this error appeared right',
    '  afterwards, going back to the checkpoint from just BEFORE that change is the',
    '  cleanest fix, because it undoes whatever removed these lines.',
    '',
    '  Look in Replit for the project history or checkpoint list, usually beside the',
    '  assistant. Nobody here has photographed that screen, so trust the labels you',
    '  actually see over the words used here.',
    '',
    '  TWO THINGS TO KNOW BEFORE YOU ROLL BACK, and they are why option 1 is first.',
    '',
    '    Rolling back undoes EVERYTHING since that checkpoint, not only this. If you',
    '    have done work you want to keep since then, use option 1 instead.',
    '',
    '    It puts files back. What it does to anything that is not a file, such as',
    '    your saved secrets or your database, is not something we have tested. If',
    '    that worries you, option 1 touches nothing but these few lines.',
    '',
    '  ------------------------------------------------------------------------',
    '',
    '  WHY THIS STOPPED THE BUILD. Losing these lines does not break the app in a way',
    '  anybody can see. It makes it unreliable in a way that looks like bad luck, and',
    '  a build that stops now is cheaper than that later. Nothing has been altered',
    '  for you either way: this check only ever reads.',
    '',
    '  If neither option works, do not keep trying. Post in the Slack channel with',
    '  this whole message and somebody will sort it out.',
    '',
  ].join('\n');
}

function main(): void {
  let config: string;
  try {
    config = readFileSync(REPLIT_CONFIG_PATH, 'utf8');
  } catch {
    // Not on Replit and no .replit present. A checkout somewhere else is not a
    // broken deployment, and failing here would block every contributor.
    process.stdout.write('No .replit here, so there is no deployment config to check.\n');
    return;
  }
  const problems = checkReplitConfig(config);
  if (problems.length === 0) {
    process.stdout.write('.replit still carries its deployment section. Reserved VM, npm ci.\n');
    return;
  }
  process.stderr.write(failureMessage(problems));
  process.exit(1);
}

// Run only when invoked directly, never on import. Compared as resolved paths
// rather than by filename, because two files called the same thing in different
// folders would both match a name test.
const invoked = process.argv[1];
if (invoked !== undefined && fileURLToPath(import.meta.url) === resolve(invoked)) {
  main();
}
