/**
 * tests/unit/wiring.test.ts
 *
 * WHAT THIS IS. Two assertions about `src/server/index.ts`, read as text: the
 * agent loop is wired into the process, and the fail closed stand in it replaced
 * is still available to anybody who needs it.
 *
 * WHY IT EXISTS. This is the failure the whole build was in, and nothing in a
 * green suite would have shown it.
 *
 *   `src/server/storage/turn.ts` and `src/server/agent/runner.ts` had 788 tests
 *   between them and ZERO non test importers. Every unit was green and no
 *   founder could produce a single file, because `buildServer()` handed the
 *   queue executor `notWiredRun(...)`, which rejects every turn. A founder
 *   signed in, was walked through setup, started a Founder Brain, got a 202, and
 *   read "That one did not finish."
 *
 *   A unit test cannot catch that, by construction: every unit was working. The
 *   only thing that catches it is asking whether the composition root actually
 *   composes, which is what this file does.
 *
 * WHY IT READS THE FILE AS TEXT rather than importing it. `src/server/index.ts`
 * calls `loadEnv()` as its first statement and binds a port at the bottom, so
 * importing it in a test either fails on the environment or starts a server.
 * `src/server/routes/errors.test.ts` reads the same file the same way for the
 * same reason. The proof that the wired runner actually works is
 * `scripts/prove-turn.ts`, which runs the real chain against a real Postgres
 * with only the model stubbed.
 *
 * WHAT IT READS. src/server/index.ts and src/server/routes/turn-executor.ts, as
 * text. WHAT IT WRITES. Nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const indexPath = fileURLToPath(new URL('../../src/server/index.ts', import.meta.url));
const executorPath = fileURLToPath(new URL('../../src/server/routes/turn-executor.ts', import.meta.url));

test('THE AGENT LOOP IS WIRED INTO THE PROCESS, and no founder message ends at notWiredRun', () => {
  const source = readFileSync(indexPath, 'utf8');

  assert.equal(
    source.includes('notWiredRun'),
    false,
    [
      'src/server/index.ts still names notWiredRun.',
      'That is the stand in that rejects every turn, so every founder message would end at',
      '"That one did not finish." If this is deliberate, say why here rather than deleting the test.',
    ].join('\n'),
  );

  assert.ok(
    source.includes('createRunTurn'),
    'src/server/index.ts does not build the real runner. See src/server/routes/run-turn.ts.',
  );

  // The runner has to reach the executor, not merely be constructed. A `const
  // runTurn = createRunTurn(...)` that nothing passes on is the same bug wearing
  // a different hat.
  const built = /const\s+runTurn\s*=\s*createRunTurn\s*\(/.test(source);
  const passed = /new QueueTurnExecutor\([^)]*runTurn\s*\)/s.test(source);
  assert.ok(built, 'index.ts does not assign createRunTurn(...) to runTurn');
  assert.ok(passed, 'index.ts does not pass runTurn to QueueTurnExecutor, so the executor has nothing to run');
});

test('the fail closed stand in still exists, so a deployment without the loop can still say so', () => {
  const source = readFileSync(executorPath, 'utf8');
  assert.ok(
    source.includes('export function notWiredRun'),
    [
      'routes/turn-executor.ts no longer exports notWiredRun.',
      'It is not used by the running process any more, and it should stay: it is the honest',
      'answer for any build of this app that ships without the agent loop, and deleting it',
      'means the next such build sits at queued for ever instead.',
    ].join('\n'),
  );
});
