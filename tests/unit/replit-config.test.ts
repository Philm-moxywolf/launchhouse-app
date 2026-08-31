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

  describe('the message a founder reads when it fires', () => {
    const text = failureMessage(checkReplitConfig(REAL.replace('deploymentTarget = "vm"', '')));

    it('OPENS BY SAYING THEY HAVE NOT BROKEN ANYTHING, before anything technical', () => {
      // A build that goes red on somebody who did not write the code reads as their
      // fault. The first sentence has to take that off the table, and it has to be
      // near the top rather than at the bottom under the detail.
      const opening = text.split('MISSING:')[0] ?? '';
      assert.match(opening, /not done anything wrong/);
    });

    it('carries the exact block to paste, not a link to it', () => {
      assert.match(text, /deploymentTarget = "vm"/);
      assert.match(text, /npm ci && npm run build/);
    });

    it('OFFERS THE ROLLBACK, because clicking a checkpoint beats editing a config file', () => {
      assert.match(text, /checkpoint/i, 'Replit can go back to a checkpoint and most founders would rather do that');
      assert.match(text, /assistant/i, 'the likeliest cause is the assistant having just edited the file');
    });

    it('WARNS THAT A ROLLBACK TAKES OTHER WORK WITH IT', () => {
      // The whole reason pasting is offered first. A founder who rolls back an
      // afternoon of work to fix four lines has been badly advised.
      assert.match(text, /undoes EVERYTHING since that checkpoint/);
    });

    it('puts the safe option first, because an anxious reader takes the first one', () => {
      assert.ok(
        text.indexOf('OPTION 1') < text.indexOf('OPTION 2'),
        'the option that loses nothing has to come first',
      );
      assert.match(text, /OPTION 1[^\n]*Loses nothing/);
    });

    it('DOES NOT CLAIM TO KNOW A SCREEN NOBODY HERE HAS SEEN', () => {
      // The same rule as the run sheet stamps. Confident directions to a button
      // that might be labelled something else send somebody looking for a thing
      // that is not there and then doubting the rest of the message.
      assert.match(text, /trust the labels you\s+actually see/, 'the hedge has to survive a relabelled UI');
      assert.match(text, /not something we have tested/, 'what rollback does beyond files is genuinely unknown');
    });

    it('says nothing was altered, and ends on where to go if both fail', () => {
      assert.match(text, /only ever reads/);
      assert.match(text, /Slack/, 'a founder who is stuck needs somewhere to go, not another attempt');
    });

    it('follows the house style, because a founder may read every word of it', () => {
      assert.doesNotMatch(text, /[—–]/, 'no em or en dashes');
      assert.doesNotMatch(text, /supercharge|unlock|seamless|effortless|leverage/i, 'no marketing words');
    });
  });
});
