/**
 * runner.test.ts
 *
 * WHAT: Drives the loop with a scripted SDK, so every branch of it runs on a
 *       laptop with no API key, no CLI binary and no network.
 *
 * WHY IT EXISTS: The three things that must never be wrong in this file are the
 *       tool surface, the cost arithmetic across turns, and stop. All three are
 *       exercised here. What is NOT proved here is that the real SDK behaves as
 *       its type declarations say: that streaming input holds a multi turn
 *       interview (C7), that the budget cap actually fires (C3), that resume
 *       works from a cold container (C1) and that the cache is hit (C2). Those
 *       four need an API key and a deployed container, and each one has a
 *       failing-if-wrong test written against it in the smoke suite. The fake
 *       here follows the documented contract exactly, so when the real thing
 *       disagrees, the disagreement is the finding.
 *
 * RUN: node_modules/.bin/tsx --test src/server/agent/runner.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetEverythingForTests, rememberAnthropicKey } from './anthropic-key.js';
import { Budget, type BudgetConfig } from './budget.js';
import { Pushable } from './pushable.js';
import {
  AgentRun,
  BUILT_IN_TOOLS,
  EXPECTED_CLI_VERSION,
  FORBIDDEN_TOOLS,
  InitMismatchError,
  OPTIONAL_TOOLS,
  REQUIRED_TOOLS,
  textDeltaOf,
  type QueryFn,
  type RunnerConfig,
  type RunnerDeps,
} from './runner.js';
import type { FactsSource, SkillBodies, SpendLedger } from './ports.js';
import {
  collectingLogger,
  fakeClock,
  founder,
  FIXTURE_GE_TOOLS,
  REAL_CLI_SKILLS,
  REAL_CLI_TOOLS,
  realInit,
  routeById,
} from './test-fixtures.js';
import type { TurnEvent } from './types.js';

const CONFIG: RunnerConfig = {
  primaryModel: 'test-primary',
  utilityModel: 'test-utility',
  fallbackModel: 'test-fallback',
  anthropicApiKey: 'sk-test',
  path: '/usr/bin:/bin',
  claudeConfigDir: '/tmp/claude-config',
  sessionLoadTimeoutMs: 10_000,
};

const BUDGET_CFG: BudgetConfig = { turnCapUsd: 0.5, founderCapUsd: 10, cohortDailyCapUsd: 400 };

const bodies: SkillBodies = {
  get: () => '# Skill\nDo the thing.\n<!-- TRACK:b2b -->\nB2B only.\n<!-- /TRACK -->\n',
  keys: () => ['founder-brain'],
};

const facts: FactsSource = {
  factsFor: async () => ({
    track: 'b2b',
    files: [{ path: 'founder-brain.md', sizeBytes: 2048, changed: '12 Sep' }],
    absent: ['content-30.md'],
    gates: [{ letter: 'A', state: 'not submitted' }],
    today: '2026-09-19',
  }),
};

/** A scripted stand in for the SDK. It follows the documented message order. */
class FakeSdk {
  readonly out = new Pushable<Record<string, unknown>>();
  readonly received: string[] = [];
  options: Record<string, unknown> | undefined;
  interrupts = 0;
  /** Set to make the message stream itself fail, the way a dead CLI would. */
  failure: Error | null = null;
  private cumulative = 0;

  /** Called with each founder message, so a test can script the reply. */
  onMessage: (text: string, sdk: FakeSdk) => void = () => {};

  readonly queryFn: QueryFn = (params) => {
    this.options = params.options as unknown as Record<string, unknown>;
    void this.drain(params.prompt as AsyncIterable<{ message: { content: string } }>);
    const iterator = this.out[Symbol.asyncIterator]();
    const self = this;
    // Only the members runner.ts actually uses. Cast at the boundary, with the
    // reason written down: implementing the whole Query surface would be a
    // second implementation of the SDK, and this is a test double.
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => (self.failure ? Promise.reject(self.failure) : iterator.next()),
      async interrupt() {
        self.interrupts += 1;
      },
    } as unknown as ReturnType<QueryFn>;
  };

  private async drain(prompt: AsyncIterable<{ message: { content: string } }>): Promise<void> {
    this.emitInit();
    for await (const msg of prompt) {
      const text = msg.message.content;
      this.received.push(text);
      this.onMessage(text, this);
    }
    // Input EOF ends the message stream, which is what the real CLI does when
    // its stdin closes. Without this the fake would model a subprocess that
    // never exits, and a test could pass while production hung on eviction.
    this.out.end();
  }

  emitInit(over: Record<string, unknown> = {}): void {
    this.out.push(realInit(over));
  }

  emitDelta(text: string): void {
    this.out.push({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
      session_id: 'sess-1',
    });
  }

  emitToolUse(id: string, name: string, input: unknown): void {
    this.out.push({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
      session_id: 'sess-1',
    });
  }

  emitToolResult(id: string): void {
    this.out.push({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id }] },
      session_id: 'sess-1',
    });
  }

  emitCompact(pre = 120000, post = 30000): void {
    this.out.push({
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'auto', pre_tokens: pre, post_tokens: post },
      session_id: 'sess-1',
    });
  }

  /** `cost` is this turn's cost. The fake adds it to the running total, which
   *  is what the real SDK reports. */
  emitResult(cost: number, over: Record<string, unknown> = {}): void {
    this.cumulative += cost;
    this.out.push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'done',
      total_cost_usd: this.cumulative,
      modelUsage: { 'test-primary': { cacheReadInputTokens: 9000 } },
      session_id: 'sess-1',
      ...over,
    });
  }
}

function build(sdk: FakeSdk, over: Partial<RunnerDeps> = {}) {
  const log = collectingLogger();
  const clock = fakeClock();
  const spendRows: Parameters<SpendLedger['add']>[0][] = [];
  const ledger: SpendLedger = {
    spendToDate: async () => 0,
    cohortSpendToday: async () => 0,
    add: async (r) => {
      spendRows.push(r);
    },
  };
  const deps: RunnerDeps = {
    queryFn: sdk.queryFn,
    bodies,
    facts,
    budget: new Budget(BUDGET_CFG, ledger, log),
    log,
    clock,
    config: CONFIG,
    makeGeTools: () => ({
      servers: {} as never,
      toolNames: [...FIXTURE_GE_TOOLS],
    }),
    ...over,
  };
  return { deps, log, clock, spendRows };
}

function collect() {
  const events: TurnEvent[] = [];
  return { events, emit: (e: TurnEvent) => events.push(e) };
}

test('the tool surface has no shell, and it is set in three places', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const { emit } = collect();
  await run.send('t1', 'hello', emit, { ctx: founder('b2b'), route: routeById('founder-brain') });

  const o = sdk.options ?? {};
  assert.deepEqual(o.tools, [...BUILT_IN_TOOLS]);
  assert.deepEqual(o.disallowedTools, [...FORBIDDEN_TOOLS]);
  for (const banned of FORBIDDEN_TOOLS) {
    assert.ok(!(o.tools as string[]).includes(banned), `${banned} in tools`);
    assert.ok(!(o.allowedTools as string[]).includes(banned), `${banned} in allowedTools`);
  }
  assert.ok((o.allowedTools as string[]).includes('mcp__ge__remember'));
  await run.close();
});

test('the options that keep 130 founders apart are all set', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  await run.send('t1', 'hello', () => {}, { ctx, route: routeById('founder-brain') });

  const o = sdk.options ?? {};
  assert.equal(o.cwd, ctx.workdir);
  assert.deepEqual(o.settingSources, []);
  assert.equal(o.strictMcpConfig, true);
  assert.deepEqual(o.skills, []);
  assert.equal(o.permissionMode, 'bypassPermissions');
  assert.equal(o.allowDangerouslySkipPermissions, true);
  assert.equal(o.includePartialMessages, true);
  assert.equal(o.maxTurns, 80);
  assert.equal(o.maxBudgetUsd, 0.5);
  assert.equal(o.model, 'test-primary');
  assert.equal(o.fallbackModel, 'test-fallback');
  // env REPLACES the subprocess environment, so what is here is all there is.
  assert.deepEqual(o.env, {
    PATH: '/usr/bin:/bin',
    HOME: '/tmp',
    CLAUDE_CONFIG_DIR: '/tmp/claude-config',
    ANTHROPIC_API_KEY: 'sk-test',
  });
  // Extended thinking is deliberately left alone.
  assert.equal(o.thinking, undefined);
  assert.equal(o.maxThinkingTokens, undefined);
  await run.close();
});

/** The environment the CLI subprocess would have been given. Typed, because `env` is optional. */
function spawnEnv(sdk: FakeSdk): Record<string, string | undefined> {
  return (sdk.options?.env ?? {}) as Record<string, string | undefined>;
}

/**
 * The key the subprocess is handed, and where it comes from.
 *
 * WHY IT IS A TEST OF ITS OWN. On a founder's own deployment the environment has no
 * Anthropic key in it and never will: they paste one into the running app, because they
 * cannot restart a Replit container and nothing tells them to. The config value above is
 * settled once at boot, so a spawn that read it would use the environment for ever and the
 * paste screen would be decoration. This is the line that makes "without a restart" true,
 * and it is one property that is invisible in a code review.
 *
 * It is asserted BOTH WAYS ROUND. A test that only checked the pasted key would still pass
 * if the holder had quietly become the only source, which would break every laptop and
 * both prove scripts.
 */
test('THE SPAWN USES THE PASTED KEY WHEN THERE IS ONE, AND THE ENVIRONMENT WHEN THERE IS NOT', async () => {
  const ctx = founder('b2b');
  const pasted = 'not-a-real-key-pasted-into-the-running-app';
  try {
    rememberAnthropicKey(ctx.founderId, pasted, new Date());
    const withKey = new FakeSdk();
    withKey.onMessage = (_t, s) => s.emitResult(0.01);
    const first = new AgentRun(build(withKey).deps, ctx, routeById('founder-brain'));
    await first.send('t1', 'hello', () => {}, { ctx, route: routeById('founder-brain') });
    assert.equal(spawnEnv(withKey).ANTHROPIC_API_KEY, pasted);
    await first.close();

    // And with nothing pasted it is the config, which is where a laptop and the two prove
    // scripts get theirs.
    forgetEverythingForTests();
    const without = new FakeSdk();
    without.onMessage = (_t, s) => s.emitResult(0.01);
    const second = new AgentRun(build(without).deps, ctx, routeById('founder-brain'));
    await second.send('t1', 'hello', () => {}, { ctx, route: routeById('founder-brain') });
    assert.equal(spawnEnv(without).ANTHROPIC_API_KEY, 'sk-test');
    await second.close();
  } finally {
    forgetEverythingForTests();
  }
});

/**
 * The same holder, asked for somebody else's key.
 *
 * One founder per deployment means the ids always match. The comparison is what keeps that
 * true if it ever stops being, and a spawn billing the wrong account is the most expensive
 * thing in this file.
 */
test('and a key belonging to another founder is not used', async () => {
  const ctx = founder('b2b');
  try {
    rememberAnthropicKey('01JSOMEBODYELSEXXXXXXXXXXX', 'not-a-real-key-belonging-to-somebody-else', new Date());
    const sdk = new FakeSdk();
    sdk.onMessage = (_t, s) => s.emitResult(0.01);
    const run = new AgentRun(build(sdk).deps, ctx, routeById('founder-brain'));
    await run.send('t1', 'hello', () => {}, { ctx, route: routeById('founder-brain') });
    assert.equal(spawnEnv(sdk).ANTHROPIC_API_KEY, 'sk-test');
    await run.close();
  } finally {
    forgetEverythingForTests();
  }
});

test('the cacheable prefix is the skill body and the volatile header is not in it', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  await run.send('t1', 'we sell to construction firms', () => {}, {
    ctx,
    route: routeById('founder-brain'),
  });

  const prompt = (sdk.options?.systemPrompt ?? {}) as { append?: string; excludeDynamicSections?: boolean };
  assert.equal(prompt.excludeDynamicSections, true);
  assert.ok(prompt.append?.includes('Do the thing.'));
  assert.ok(!prompt.append?.includes('Priya Raman'));
  // The header rides in front of the founder's first message, as one message,
  // so one thing they typed is one turn.
  assert.equal(sdk.received.length, 1);
  assert.ok(sdk.received[0]?.includes('# Run context'));
  assert.ok(sdk.received[0]?.includes('we sell to construction firms'));
  await run.close();
});

test('a utility route runs on the mid tier model', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.001, { model: 'test-utility' });
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('status'));
  const { events } = collect();
  sdk.emitInit = ((over: Record<string, unknown> = {}) => {
    sdk.out.push(realInit({ model: 'test-utility', ...over }));
  }) as typeof sdk.emitInit;
  await run.send('t1', 'where am I up to', (e) => events.push(e), {
    ctx: founder('b2b'),
    route: routeById('status'),
  });
  assert.equal(sdk.options?.model, 'test-utility');
  await run.close();
});

test('a shell in the init message refuses the turn loudly', async () => {
  const sdk = new FakeSdk();
  sdk.emitInit = (() => {
    sdk.out.push(realInit({ tools: [...REAL_CLI_TOOLS, 'Bash'] }));
  }) as typeof sdk.emitInit;
  const { deps, log } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const { events } = collect();
  await assert.rejects(
    run.send('t1', 'hello', (e) => events.push(e), {
      ctx: founder('b2b'),
      route: routeById('founder-brain'),
    }),
  );
  const shout = log.lines.find((l) => l.msg.includes('INIT ASSERTION FAILED'));
  assert.ok(shout, 'a forbidden tool was present and nothing was logged');
  assert.ok(String((shout?.obj.problems as string[])?.join()).includes('Bash'));
  assert.ok(events.some((e) => e.kind === 'error'));
});

test('a settings file leaking into the deployment refuses the turn', async () => {
  const sdk = new FakeSdk();
  // Only a plugin now. The old version planted a plugin AND a skill and could
  // pass for either reason, which is how it kept passing while the skills half
  // of the assertion was refusing every real turn.
  sdk.emitInit = (() => {
    sdk.out.push(realInit({ plugins: [{ name: 'growth-engine', path: '/x' }] }));
  }) as typeof sdk.emitInit;
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  await assert.rejects(
    run.send('t1', 'hello', () => {}, { ctx: founder('b2b'), route: routeById('founder-brain') }),
    InitMismatchError,
  );
});

test('an mcp server that did not connect refuses the turn', async () => {
  const sdk = new FakeSdk();
  sdk.emitInit = (() => {
    sdk.out.push(realInit({ mcp_servers: [{ name: 'ge', status: 'failed' }] }));
  }) as typeof sdk.emitInit;
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  await assert.rejects(
    run.send('t1', 'hi', () => {}, { ctx: founder('b2b'), route: routeById('founder-brain') }),
  );
});

/**
 * THE REGRESSION TEST. This is the one that was missing.
 *
 * Every turn, for every founder, on every route, was refused before a single
 * token, because assertInit demanded TodoWrite and refused on discovered
 * skills, and CLI 2.1.250 ships neither an existing TodoWrite nor an empty
 * skills list. realInit() is what the real CLI says. If this test goes red, a
 * founder cannot type.
 */
test('a turn reaches the model on the CLI we actually ship', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s2) => {
    s2.emitDelta('Right. ');
    s2.emitResult(0.01);
  };
  const { deps, log } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const { events } = collect();

  const outcome = await run.send('t1', 'hello', (e) => events.push(e), {
    ctx: founder('b2b'),
    route: routeById('founder-brain'),
  });

  assert.equal(outcome.status, 'ok');
  assert.ok(!log.lines.some((l) => l.msg.includes('INIT ASSERTION FAILED')), 'the turn was refused at init');
  assert.ok(events.some((e) => e.kind === 'delta'), 'nothing reached the founder');
  await run.close();
});

/** TodoWrite absent must not refuse, and it must not be quietly required back. */
test('a built in tool this CLI does not ship is not a reason to refuse', async () => {
  assert.ok(!REQUIRED_TOOLS.includes('TodoWrite' as never), 'TodoWrite is required again');
  assert.ok(OPTIONAL_TOOLS.includes('TodoWrite' as never), 'TodoWrite is no longer asked for');
  // Still asked for, so the surface does not change on the day a CLI ships it.
  assert.ok(BUILT_IN_TOOLS.includes('TodoWrite' as never));

  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const outcome = await run.send('t1', 'hi', () => {}, {
    ctx: founder('b2b'),
    route: routeById('founder-brain'),
  });
  assert.equal(outcome.status, 'ok');
  await run.close();
});

/** The 16 the CLI bundles. skills: [] does not stop init reporting them. */
test('the bundled skills the CLI discovers do not refuse the turn', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
  const { deps, log } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const outcome = await run.send('t1', 'hi', () => {}, {
    ctx: founder('b2b'),
    route: routeById('founder-brain'),
  });
  assert.equal(outcome.status, 'ok');
  // Not a refusal, and not silent either. The count is on the run started line,
  // so a CLI that starts bundling a different number of them shows up in a log
  // somebody already reads rather than in a founder's failed turn.
  const started = log.lines.find((l) => l.msg === 'run started');
  assert.equal(started?.obj.skillsDiscovered, REAL_CLI_SKILLS.length);
  assert.equal(REAL_CLI_SKILLS.length, 16);
  await run.close();
});

/**
 * THE OTHER HALF, AND IT MUST STAY STRICT. Every forbidden tool, planted one at
 * a time, still refuses the turn. Skill is in this list because it is what
 * actually stops the model reaching one of those 16 bundled skills: they are
 * only ever loaded through the Skill tool, and skills: [] does not remove them.
 */
for (const banned of FORBIDDEN_TOOLS) {
  test(`a planted ${banned} still refuses the turn`, async () => {
    const sdk = new FakeSdk();
    sdk.emitInit = (() => {
      sdk.out.push(realInit({ tools: [...REAL_CLI_TOOLS, banned] }));
    }) as typeof sdk.emitInit;
    // The fake answers the turn. If the assertion ever stops refusing, this
    // test fails on the spot rather than awaiting a promise that never settles,
    // which would be reported as every later test being cancelled.
    sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
    const { deps, log } = build(sdk);
    const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
    const { events } = collect();

    await assert.rejects(
      run.send('t1', 'hello', (e) => events.push(e), {
        ctx: founder('b2b'),
        route: routeById('founder-brain'),
      }),
      InitMismatchError,
    );
    const shout = log.lines.find((l) => l.msg.includes('INIT ASSERTION FAILED'));
    assert.ok(shout, `${banned} was present and nothing was logged`);
    assert.ok(String((shout?.obj.problems as string[])?.join()).includes(banned));
    assert.ok(events.some((e) => e.kind === 'error'));
  });
}

/**
 * The loop above tests whatever FORBIDDEN_TOOLS says, so it cannot catch
 * FORBIDDEN_TOOLS itself being wrong: delete a name and the test for it simply
 * stops existing. Caught by mutating the constant and watching the suite stay
 * green with one fewer test. These two write the names out instead.
 */
test('the forbidden list still holds all five names', () => {
  assert.deepEqual([...FORBIDDEN_TOOLS], ['Bash', 'WebSearch', 'WebFetch', 'Task', 'Skill']);
});

test('a planted Skill tool refuses the turn, named literally', async () => {
  const sdk = new FakeSdk();
  sdk.emitInit = (() => {
    // Not from the constant. This is the thing that stops a bundled skill being
    // reachable, so it has to be checked independently of the list.
    sdk.out.push(realInit({ tools: [...REAL_CLI_TOOLS, 'Skill'] }));
  }) as typeof sdk.emitInit;
  sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
  const { deps, log } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));

  try {
    await assert.rejects(
      run.send('t1', 'hi', () => {}, { ctx: founder('b2b'), route: routeById('founder-brain') }),
      InitMismatchError,
    );
    const shout = log.lines.find((l) => l.msg.includes('INIT ASSERTION FAILED'));
    assert.ok(String((shout?.obj.problems as string[])?.join()).includes('Skill'));
  } finally {
    // If this assertion ever fails, the turn is still in flight. Without the
    // close, the run holds the event loop open and every test after it is
    // reported as cancelled, which buries the one line that matters.
    await run.close();
  }
});

/**
 * The version pin. A CLI that has moved is not itself a refusal: a shell is a
 * shell whatever version reports it, and taking the cohort down over a patch
 * bump would be a worse failure than the one it prevents.
 */
test('a moved CLI version does not refuse the turn, and says so once', async () => {
  const sdk = new FakeSdk();
  sdk.emitInit = (() => {
    sdk.out.push(realInit({ claude_code_version: '2.9.999' }));
  }) as typeof sdk.emitInit;
  sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
  const { deps, log } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));

  const outcome = await run.send('t1', 'hi', () => {}, {
    ctx: founder('b2b'),
    route: routeById('founder-brain'),
  });
  assert.equal(outcome.status, 'ok');
  const warned = log.lines.find((l) => l.msg.includes('moved under this assertion'));
  assert.ok(warned, 'the CLI moved and nobody was told');
  assert.equal(warned?.obj.cliVersion, '2.9.999');
  assert.equal(warned?.obj.expectedCliVersion, EXPECTED_CLI_VERSION);
  await run.close();
});

/** The next person upgrading the SDK should get a sentence, not a mystery. */
test('an init refusal names the version found and the version expected', async () => {
  const sdk = new FakeSdk();
  sdk.emitInit = (() => {
    sdk.out.push(realInit({ tools: [...REAL_CLI_TOOLS, 'Bash'], claude_code_version: '2.9.999' }));
  }) as typeof sdk.emitInit;
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));

  await assert.rejects(
    run.send('t1', 'hi', () => {}, { ctx: founder('b2b'), route: routeById('founder-brain') }),
    (err: unknown) => {
      assert.ok(err instanceof InitMismatchError);
      assert.match(err.message, /Bash/);
      assert.match(err.message, /2\.9\.999/);
      assert.ok(err.message.includes(EXPECTED_CLI_VERSION), err.message);
      return true;
    },
  );
});

/**
 * A message whose first character is "/" is read by the CLI as a slash command
 * and never reaches the model. Measured on 2.1.250: it either hangs the turn
 * forever or returns an empty success. Only turn two onward is exposed, because
 * turn one carries the run header in front.
 */
test('a founder message starting with a slash still reaches the model', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));

  await run.send('t1', 'hello', () => {}, { ctx, route: routeById('founder-brain') });
  await run.send('t2', '/mo pricing, is that clear enough', () => {});

  const second = sdk.received[1] ?? '';
  assert.ok(!second.startsWith('/'), 'the CLI would read this as a slash command');
  assert.equal(second, '\n/mo pricing, is that clear enough');
  await run.close();
});

test('an ordinary follow up message is passed through unchanged', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s2) => s2.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));

  await run.send('t1', 'hello', () => {}, { ctx, route: routeById('founder-brain') });
  await run.send('t2', 'we sell to builders', () => {});

  // Byte identical, so the shared prompt prefix and the cache unit are untouched.
  assert.equal(sdk.received[1], 'we sell to builders');
  await run.close();
});

test('text streams token by token and is not printed twice', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => {
    s.emitDelta('Right. ');
    s.emitDelta('So you sell to construction firms');
    s.out.push({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Right. So you sell to construction firms' }],
      },
      session_id: 'sess-1',
    });
    s.emitResult(0.02);
  };
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const { events, emit } = collect();
  await run.send('t1', 'hello', emit, { ctx: founder('b2b'), route: routeById('founder-brain') });

  const deltas = events.filter((e) => e.kind === 'delta');
  assert.equal(deltas.length, 2);
  assert.equal(
    deltas.map((d) => (d.kind === 'delta' ? d.text : '')).join(''),
    'Right. So you sell to construction firms',
  );
  await run.close();
});

test('a tool call reaches the founder as English, at both ends', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => {
    s.emitToolUse('tu_1', 'Read', { file_path: 'growth-engine/founder-brain.md' });
    s.emitToolResult('tu_1');
    s.emitResult(0.01);
  };
  const { deps } = build(sdk);
  const run = new AgentRun(deps, founder('b2b'), routeById('founder-brain'));
  const { events, emit } = collect();
  await run.send('t1', 'hi', emit, { ctx: founder('b2b'), route: routeById('founder-brain') });

  const tools = events.filter((e) => e.kind === 'tool');
  assert.equal(tools.length, 2);
  assert.deepEqual(
    tools.map((t) => (t.kind === 'tool' ? [t.text, t.done] : [])),
    [
      ['Reading your Founder Brain', false],
      ['Read your Founder Brain', true],
    ],
  );
  await run.close();
});

test('COST IS DIFFERENCED ACROSS TURNS AND NEVER SUMMED', async () => {
  const sdk = new FakeSdk();
  const costs = [0.02, 0.03, 0.06];
  let turn = 0;
  sdk.onMessage = (_t, s) => {
    s.emitResult(costs[turn] ?? 0);
    turn += 1;
  };
  const { deps, spendRows } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const start = { ctx, route: routeById('founder-brain') };

  const a = await run.send('t1', 'one', () => {}, start);
  const b = await run.send('t2', 'two', () => {});
  const c = await run.send('t3', 'three', () => {});

  const round = (n: number): number => Math.round(n * 1000) / 1000;
  assert.deepEqual([round(a.costUsd), round(b.costUsd), round(c.costUsd)], [0.02, 0.03, 0.06]);
  await new Promise((r) => setImmediate(r));
  assert.equal(round(spendRows.reduce((n, r) => n + r.costUsd, 0)), 0.11);
  await run.close();
});

test('a later turn costs no spawn, which is the point of streaming input', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  await run.send('t1', 'one', () => {}, { ctx, route: routeById('founder-brain') });
  await run.send('t2', 'two', () => {});
  assert.equal(sdk.received.length, 2);
  // The header went with the first message only.
  assert.ok(sdk.received[0]?.includes('# Run context'));
  assert.ok(!sdk.received[1]?.includes('# Run context'));
  await run.close();
});

test('stop reaches the SDK and the turn is recorded as interrupted', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => {
    s.emitDelta('half a sen');
  };
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const { events, emit } = collect();
  const pending = run.send('t1', 'go', emit, { ctx, route: routeById('founder-brain') });

  await new Promise((r) => setImmediate(r));
  await run.interrupt();
  assert.equal(sdk.interrupts, 1);
  sdk.emitResult(0.004);
  const outcome = await pending;

  assert.equal(outcome.status, 'interrupted');
  // The partial text already went out as a frame, so the founder can read what
  // they stopped rather than watching it vanish.
  assert.ok(events.some((e) => e.kind === 'delta' && e.text === 'half a sen'));
  await run.close();
});

test('running out of turns is an offer, never an error', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) =>
    s.emitResult(0.2, { subtype: 'error_max_turns', is_error: true, errors: [] });
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const { events, emit } = collect();
  const outcome = await run.send('t1', 'go', emit, { ctx, route: routeById('founder-brain') });

  assert.equal(outcome.status, 'max_turns');
  const status = events.find((e) => e.kind === 'status');
  assert.ok(status && status.kind === 'status' && status.text.includes('carry on'));
  assert.ok(!events.some((e) => e.kind === 'error'));
  await run.close();
});

test('the budget cap ending a run tells the founder how to continue', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) =>
    s.emitResult(0.5, { subtype: 'error_max_budget_usd', is_error: true, errors: [] });
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const { events, emit } = collect();
  const outcome = await run.send('t1', 'go', emit, { ctx, route: routeById('founder-brain') });
  assert.equal(outcome.status, 'max_budget');
  assert.ok(events.some((e) => e.kind === 'status' && e.text.includes('carry on')));
  await run.close();
});

test('compaction checkpoints the files and re anchors the next turn', async () => {
  const sdk = new FakeSdk();
  const checkpoints: string[] = [];
  let first = true;
  sdk.onMessage = (_t, s) => {
    if (first) {
      first = false;
      s.emitCompact();
    }
    s.emitResult(0.01);
  };
  const { deps } = build(sdk, {
    onCheckpoint: async (reason) => {
      checkpoints.push(reason);
    },
  });
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const { events, emit } = collect();
  await run.send('t1', 'one', emit, { ctx, route: routeById('founder-brain') });
  await new Promise((r) => setImmediate(r));
  assert.ok(checkpoints.includes('compact'));
  assert.ok(events.some((e) => e.kind === 'status' && e.text.includes('Your files are safe')));

  await run.send('t2', 'two', () => {});
  assert.ok(
    sdk.received[1]?.includes('was summarised'),
    'the turn after a compaction was not re anchored',
  );
  await run.close();
});

test('a run that ends in an error tells the founder their work is safe', async () => {
  const sdk = new FakeSdk();
  // The CLI subprocess dies, so the message stream itself fails. That is how a
  // real failure arrives: out of the generator, not out of the input side.
  sdk.onMessage = (_t, s) => {
    s.failure = new Error('subprocess died');
    s.out.push({ type: 'system', subtype: 'nudge' });
  };
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const { events, emit } = collect();
  await assert.rejects(run.send('t1', 'go', emit, { ctx, route: routeById('founder-brain') }));
  const error = events.find((e) => e.kind === 'error');
  assert.ok(error && error.kind === 'error' && error.text.includes('Nothing you have made is affected'));
  assert.ok(!/[–—]/.test(error.kind === 'error' ? error.text : ''));
});

test('two turns at once on one run is refused', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = () => {};
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  void run.send('t1', 'one', () => {}, { ctx, route: routeById('founder-brain') });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(run.send('t2', 'two', () => {}), /one turn at a time/);
});

test('the session id is captured so the thread can resume', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  const outcome = await run.send('t1', 'hi', () => {}, { ctx, route: routeById('founder-brain') });
  assert.equal(outcome.sdkSessionId, 'sess-1');
  assert.equal(run.sdkSessionId, 'sess-1');
  await run.close();
});

test('a resume passes the session id through to the SDK', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  await run.send('t1', 'hi', () => {}, {
    ctx,
    route: routeById('founder-brain'),
    resumeSessionId: 'sess-old',
  });
  assert.equal(sdk.options?.resume, 'sess-old');
  await run.close();
});

test('a cold resume seeds from the digest, in front of the first message', async () => {
  const sdk = new FakeSdk();
  sdk.onMessage = (_t, s) => s.emitResult(0.01);
  const { deps } = build(sdk);
  const ctx = founder('b2b');
  const run = new AgentRun(deps, ctx, routeById('founder-brain'));
  await run.send('t1', 'carry on', () => {}, {
    ctx,
    route: routeById('founder-brain'),
    seed: 'You are part way through. Group 4 of 6 is next.',
  });
  assert.ok(sdk.received[0]?.includes('Group 4 of 6'));
  await run.close();
});

test('text deltas are recognised and nothing else is', () => {
  assert.equal(
    textDeltaOf({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }),
    'hi',
  );
  assert.equal(
    textDeltaOf({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' } }),
    null,
  );
  assert.equal(textDeltaOf({ type: 'message_start' }), null);
  assert.equal(textDeltaOf(null), null);
  assert.equal(textDeltaOf('nope'), null);
});
