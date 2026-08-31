/**
 * replit-config.test.ts: the four lines that decide whether this app works.
 *
 * WHY THESE ARE TESTED AND THE REST OF .replit IS NOT. Everything else in that file
 * fails visibly. These fail invisibly. `deploymentTarget = "vm"` is the difference
 * between a Reserved VM and Autoscale, and this app on Autoscale still starts, still
 * serves and still answers: it just cuts connections mid turn, loses live sessions
 * when the machine scales to zero, and drops the queue with the process. A founder
 * reads that as bad luck.
 *
 * AND IT IS ONE FILE FOR 130 PEOPLE. A remix copies files and configuration and does
 * not copy pane settings, so this section is how every founder gets the right target
 * without choosing one, which also makes it a single point of failure for all of
 * them at once.
 *
 * The guard runs at build time via prebuild. It is tested here as well because a
 * check that only runs inside a build is a check nobody sees fail until a build.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  REPLIT_CONFIG_PATH,
  REQUIRED_DEPLOYMENT_BLOCK,
  checkReplitConfig,
  failureMessage,
} from '../../scripts/check-replit-config.ts';

const REAL = readFileSync(REPLIT_CONFIG_PATH, 'utf8');

describe('the deployment section of .replit', () => {
  it('IS INTACT IN THIS REPOSITORY RIGHT NOW, which is the point of the file', () => {
    assert.deepEqual(checkReplitConfig(REAL), []);
  });

  it('the block we tell people to paste back is itself a passing config', () => {
    // A recovery instruction that does not satisfy the check it recovers from is
    // worse than none: somebody follows it, the build fails again, and now they do
    // not trust the message either.
    assert.deepEqual(checkReplitConfig(REQUIRED_DEPLOYMENT_BLOCK), []);
  });

  it('CATCHES THE WHOLE SECTION BEING TIDIED AWAY, which is the case it exists for', () => {
    // Built by deleting the four lines by name rather than by matching a region.
    // A region match is a second regex that can be subtly wrong, and then the test
    // passes while testing something other than what it says.
    const tidied = REAL.split('\n')
      .filter(
        (line) =>
          !/^\[deployment\]/.test(line) &&
          !/^\s*deploymentTarget\s*=/.test(line) &&
          !/^\s*run\s*=\s*\[/.test(line) &&
          !/^\s*build\s*=\s*\[/.test(line),
      )
      .join('\n');
    assert.doesNotMatch(tidied, /^\[deployment\]/m, 'the fixture has to actually be missing the section');

    const problems = checkReplitConfig(tidied);
    assert.equal(problems.length, 4, 'all four requirements should fail when the section is gone');
  });

  it('catches Autoscale specifically, because that is the one that looks fine', () => {
    const autoscale = REAL.replace('deploymentTarget = "vm"', 'deploymentTarget = "autoscale"');
    const problems = checkReplitConfig(autoscale);
    assert.equal(problems.length, 1, 'only the target changed, so only one thing should be wrong');
    assert.match(problems[0] ?? '', /deploymentTarget/);
    assert.match(problems[0] ?? '', /degrades|scales to zero/, 'the message has to say what it costs, not just what is missing');
  });

  it('catches npm install where npm ci belongs', () => {
    const loose = REAL.replace('npm ci && npm run build', 'npm install && npm run build');
    const problems = checkReplitConfig(loose);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /optional/, 'the reason is the optional binary, and the message has to say so');
  });

  it('the failure tells a non developer what to paste, and says it changed nothing', () => {
    const text = failureMessage(checkReplitConfig(REAL.replace('deploymentTarget = "vm"', '')));
    assert.match(text, /WHAT TO DO/);
    assert.match(text, /deploymentTarget = "vm"/, 'the fix has to be in the message, not a link to it');
    assert.match(text, /only ever reads/, 'somebody staring at a failed build needs to know nothing was altered');
    assert.doesNotMatch(text, /[—–]/, 'a founder may read this, so the house style applies');
  });
});
