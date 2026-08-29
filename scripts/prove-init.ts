/**
 * scripts/prove-init.ts
 *
 * WHAT THIS IS. The init assertion, proved both ways against the real Claude
 * Code CLI. `npx tsx scripts/prove-init.ts`.
 *
 * WHY IT EXISTS. Every turn, for every founder, on every route, was refused
 * before a single token, and the unit suite was green throughout. It was green
 * because the fake in runner.test.ts answered with a TodoWrite tool and an empty
 * skills list, and the CLI we actually ship does neither. A fake that models a
 * CLI which does not exist cannot catch a mismatch with the one that does.
 *
 * So this script does not use a fake for the part that was wrong. It SPAWNS THE
 * REAL CLI, twice, reads the real `system/init` message off the wire, and then
 * drives the real `AgentRun` with those exact bytes replayed. Two cases:
 *
 *   PASS   runner.ts's own options. The turn must reach the model.
 *   PLANT  the same spawn with Bash allowed back in. The turn must still be
 *          refused, because a guard that has never been seen to fail is not
 *          known to work.
 *
 * WHAT IT DOES NOT NEED. An API key. The assertion runs on `system/init`, which
 * the CLI sends before its first API call.
 *
 * WHAT IT THEREFORE DOES NOT PROVE. Anything after init: that the model answers,
 * that the prompt cache is hit, that the budget cap fires. Those need a key.
 * See scripts/PROBE.md and prove-turn.ts.
 *
 * WHAT CALLS IT. A person, by hand, and anyone bumping the agent SDK.
 * WHAT IT READS. Nothing of the app's. It makes its own temp directories.
 * WHAT IT WRITES. Two temp directories, and its verdict on stdout.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { createSdkMcpServer, query, tool } from '../src/server/agent/sdk.ts';
import { Budget, type BudgetConfig } from '../src/server/agent/budget.ts';
import {
  AgentRun,
  BUILT_IN_TOOLS,
  EXPECTED_CLI_VERSION,
  FORBIDDEN_TOOLS,
  InitMismatchError,
  type QueryFn,
  type RunnerConfig,
  type RunnerDeps,
} from '../src/server/agent/runner.ts';
import type { FactsSource, SkillBodies, SpendLedger } from '../src/server/agent/ports.ts';
import { collectingLogger, fakeClock, founder, routeById } from '../src/server/agent/test-fixtures.ts';

const MODEL = 'claude-sonnet-4-5-20250929';

/** A real in process MCP server called ge, so the ge check is exercised too. */
function geServer(): ReturnType<typeof createSdkMcpServer> {
  return createSdkMcpServer({
    name: 'ge',
    version: '0.0.0',
    tools: [
      tool('ge_status', 'stub for the probe', { q: z.string().optional() }, async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
      })),
    ],
  });
}

/** Spawns the real CLI and returns the real system/init message. */
async function captureInit(plantBash: boolean): Promise<Record<string, unknown>> {
  const cwd = mkdtempSync(join(tmpdir(), 'prove-init-cwd-'));
  const configDir = mkdtempSync(join(tmpdir(), 'prove-init-cfg-'));
  const tools = plantBash ? [...BUILT_IN_TOOLS, 'Bash'] : [...BUILT_IN_TOOLS];

  // One message, then hold the stream open. Measured: the CLI sends system/init
  // only once it has a first input to work on, so a generator that never yields
  // never gets an init. The message itself never reaches the API, because we
  // stop reading at init and tear the subprocess down.
  async function* onePrompt(): AsyncGenerator<Record<string, unknown>, void, unknown> {
    yield { type: 'user', message: { role: 'user', content: 'probe' }, parent_tool_use_id: null };
    await new Promise((r) => setTimeout(r, 60_000));
  }

  const q = query({
    prompt: onePrompt() as never,
    options: {
      cwd,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: 'probe',
        excludeDynamicSections: true,
      },
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      model: MODEL,
      maxTurns: 1,
      tools,
      allowedTools: [...tools, 'mcp__ge__ge_status'],
      // The plant has to remove the disallow too, or the surface is unchanged
      // and the case proves nothing.
      disallowedTools: plantBash ? [] : [...FORBIDDEN_TOOLS],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers: { ge: geServer() },
      env: {
        PATH: '/usr/bin:/bin',
        HOME: '/tmp',
        CLAUDE_CONFIG_DIR: configDir,
        ANTHROPIC_API_KEY: 'sk-ant-no-key-needed-before-init',
      },
      stderr: () => {},
    },
  });

  const deadline = setTimeout(() => {
    console.error('The CLI did not send system/init within 60 seconds. Nothing was proved.');
    process.exit(2);
  }, 60_000);
  try {
    for await (const msg of q) {
      if (msg.type === 'system' && (msg as { subtype?: string }).subtype === 'init') {
        return msg as unknown as Record<string, unknown>;
      }
    }
  } finally {
    clearTimeout(deadline);
    // The subprocess outlives the loop, and an un-torn-down CLI keeps the event
    // loop alive forever. Both cases run to the end and then the script exits
    // explicitly, which is why main() ends with process.exit.
    void q.interrupt().catch(() => {});
  }
  throw new Error('the CLI never sent system/init');
}

/** Replays one captured init, then a result, through the real AgentRun. */
function runnerFor(init: Record<string, unknown>): { deps: RunnerDeps; log: ReturnType<typeof collectingLogger> } {
  const log = collectingLogger();
  const ledger: SpendLedger = {
    spendToDate: async () => 0,
    cohortSpendToday: async () => 0,
    add: async () => {},
  };
  const cfg: BudgetConfig = { turnCapUsd: 0.5, founderCapUsd: 10, cohortDailyCapUsd: 400 };
  const bodies: SkillBodies = { get: () => '# Skill\nDo the thing.\n', keys: () => ['founder-brain'] };
  const facts: FactsSource = {
    factsFor: async () => ({ track: 'b2b', files: [], absent: [], gates: [], today: '2026-08-29' }),
  };
  const config: RunnerConfig = {
    primaryModel: MODEL,
    utilityModel: MODEL,
    anthropicApiKey: 'sk-test',
    path: '/usr/bin:/bin',
    claudeConfigDir: '/tmp/claude-config',
    sessionLoadTimeoutMs: 10_000,
  };

  const queryFn: QueryFn = () => {
    const frames = [
      init,
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'done',
        total_cost_usd: 0.01,
        session_id: String(init.session_id),
      },
    ];
    let i = 0;
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: async () => (i < frames.length ? { value: frames[i++], done: false } : { value: undefined, done: true }),
      interrupt: async () => {},
    } as unknown as ReturnType<QueryFn>;
  };

  return {
    deps: {
      queryFn,
      bodies,
      facts,
      budget: new Budget(cfg, ledger, log),
      log,
      clock: fakeClock(),
      config,
      makeGeTools: () => ({ servers: {} as never, toolNames: ['mcp__ge__ge_status'] }),
    },
    log,
  };
}

async function main(): Promise<void> {
  console.log('Spawning the real CLI. Nothing here needs an API key.\n');

  // ------------------------------------------------------------- PASS case
  const good = await captureInit(false);
  const version = String(good.claude_code_version);
  const skills = good.skills as string[];
  console.log('REAL system/init, from the options runner.ts actually sends:');
  console.log('  claude_code_version :', version);
  console.log('  tools               :', JSON.stringify(good.tools));
  console.log('  skills discovered   :', skills.length, 'despite skills: []');
  console.log('  Skill tool present  :', (good.tools as string[]).includes('Skill'));
  console.log('  TodoWrite present   :', (good.tools as string[]).includes('TodoWrite'));
  console.log('  plugins             :', (good.plugins as unknown[]).length);
  console.log('');

  if (version !== EXPECTED_CLI_VERSION) {
    console.log(`  NOTE: this CLI is ${version}, runner.ts is pinned to ${EXPECTED_CLI_VERSION}.`);
  }

  const a = runnerFor(good);
  const runA = new AgentRun(a.deps, founder('b2b'), routeById('founder-brain'));
  const outcome = await runA.send('t1', 'hello', () => {}, {
    ctx: founder('b2b'),
    route: routeById('founder-brain'),
  });
  assert.equal(outcome.status, 'ok');
  assert.ok(
    !a.log.lines.some((l) => l.msg.includes('INIT ASSERTION FAILED')),
    'the real init was refused',
  );
  await runA.close();
  console.log('PASS  a turn on the real CLI reaches the model. It is not refused at init.');

  // ------------------------------------------------------------ PLANT case
  const planted = await captureInit(true);
  const plantedTools = planted.tools as string[];
  assert.ok(
    plantedTools.includes('Bash'),
    'the plant did not take: the CLI did not hand back Bash, so this case proves nothing',
  );
  console.log(`\nPLANTED spawn, real CLI, tools: ${JSON.stringify(plantedTools)}`);

  const b = runnerFor(planted);
  const runB = new AgentRun(b.deps, founder('b2b'), routeById('founder-brain'));
  let refused: unknown = null;
  try {
    await runB.send('t1', 'hello', () => {}, {
      ctx: founder('b2b'),
      route: routeById('founder-brain'),
    });
  } catch (err: unknown) {
    refused = err;
  }
  await runB.close();
  assert.ok(refused instanceof InitMismatchError, 'a real Bash in the surface did NOT refuse the turn');
  assert.match((refused as Error).message, /FORBIDDEN TOOL PRESENT: Bash/);
  console.log('PASS  a real Bash in the surface still refuses the turn.');
  console.log(`      message: ${(refused as Error).message}`);
  console.log('\nBoth directions proved against the real CLI.');
}

await main();
// Two CLI subprocesses were spawned and are being torn down. Exiting explicitly
// rather than waiting for them keeps this script from hanging on a clean pass.
process.exit(0);
