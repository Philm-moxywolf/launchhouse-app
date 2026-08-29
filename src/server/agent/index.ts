/**
 * index.ts
 *
 * WHAT: The composition root for the agent module. Wires the real SDK, the real
 *       ge tools and the real session store into the objects the route layer
 *       uses, and exports the public surface of this folder.
 *
 * WHY IT EXISTS: Every other file in here takes its dependencies as arguments,
 *       which is what makes them testable without a database, a subprocess or
 *       an API key. Something has to do the wiring. Keeping that in one file
 *       means there is exactly one place where the real SDK is reached, and one
 *       place to look when a deploy behaves differently from the tests.
 *
 * CALLED BY: src/server/index.ts and the route handlers under src/server/routes/.
 * READS:  configuration, passed in. WRITES: nothing.
 */

import { Budget, type BudgetConfig } from './budget.js';
import { createGeTools, GE_TOOL_NAMES } from './mcp/ge-tools.js';
import { createIntentClassifier, type IntentConfig } from './intent.js';
import { createSessionStore } from './session-store.js';
import { DEFAULT_POOL_CONFIG, SessionPool, type PoolConfig } from './session-pool.js';
import { DEFAULT_QUEUE_CONFIG, TurnQueue, type QueueConfig } from './queue.js';
import { Router } from './router.js';
import { query } from './sdk.js';
import type { QueryFn, RunnerConfig, RunnerDeps } from './runner.js';
import type {
  Clock,
  FactsSource,
  GeRunner,
  Logger,
  RouteCatalogue,
  SkillBodies,
  SpendLedger,
  TranscriptStore,
} from './ports.js';
import type { FounderContext } from './types.js';

export interface AgentModuleConfig {
  readonly runner: RunnerConfig;
  readonly budget: BudgetConfig;
  readonly queue?: QueueConfig;
  readonly pool?: PoolConfig;
  readonly intent: IntentConfig;
}

export interface AgentModuleDeps {
  readonly catalogue: RouteCatalogue;
  readonly bodies: SkillBodies;
  readonly facts: FactsSource;
  readonly ge: GeRunner;
  readonly ledger: SpendLedger;
  readonly transcripts: TranscriptStore;
  readonly log: Logger;
  readonly clock: Clock;
  /** Called after every write and at every turn end, so storage can harvest. */
  readonly onCheckpoint?: (reason: 'compact' | 'turn_end') => Promise<void>;
  readonly onBrainChanged?: () => void;
}

export interface AgentModule {
  readonly router: Router;
  readonly queue: TurnQueue;
  readonly pool: SessionPool;
  readonly budget: Budget;
  start(): void;
  stop(): Promise<void>;
}

export function createAgentModule(
  cfg: AgentModuleConfig,
  deps: AgentModuleDeps,
): AgentModule {
  // The one runtime reference to the SDK's query() in the whole app.
  const queryFn = query as unknown as QueryFn;

  const budget = new Budget(cfg.budget, deps.ledger, deps.log);
  const sessionStore = createSessionStore(deps.transcripts, deps.log);

  const runnerDeps: RunnerDeps = {
    queryFn,
    bodies: deps.bodies,
    facts: deps.facts,
    budget,
    log: deps.log,
    clock: deps.clock,
    config: cfg.runner,
    makeGeTools: (ctx: FounderContext) => ({
      servers: { ge: createGeTools(ctx, { ge: deps.ge, log: deps.log }) },
      toolNames: GE_TOOL_NAMES,
    }),
    sessionStore,
    onCheckpoint: deps.onCheckpoint,
    onBrainChanged: deps.onBrainChanged,
  };

  const pool = new SessionPool(
    cfg.pool ?? DEFAULT_POOL_CONFIG,
    runnerDeps,
    deps.clock,
    deps.log,
  );
  const queue = new TurnQueue(
    cfg.queue ?? DEFAULT_QUEUE_CONFIG,
    budget,
    deps.clock,
    deps.log,
  );
  const router = new Router({
    catalogue: deps.catalogue,
    log: deps.log,
    classifier: createIntentClassifier(queryFn, cfg.intent, deps.log),
  });

  return {
    router,
    queue,
    pool,
    budget,
    start: () => pool.start(),
    stop: () => pool.stop(),
  };
}

export { AgentRun, BUILT_IN_TOOLS, FORBIDDEN_TOOLS } from './runner.js';
export { Router, engineTwoFor, missingRequirements } from './router.js';
export { TurnQueue, DEFAULT_QUEUE_CONFIG, ordinal } from './queue.js';
export { SessionPool, DEFAULT_POOL_CONFIG } from './session-pool.js';
export { Budget, CostMeter, cacheReadTokensOf } from './budget.js';
export { assemble, buildRunHeader, buildSystemPromptAppend, stripOtherTrack, reAnchor, resumeSeed } from './assemble.js';
export { matchPhrase, normalise, SKILL_DESCRIPTION_PHRASES } from './phrases.js';
export { GE_TOOL_NAMES } from './mcp/ge-tools.js';
export * from './types.js';
export type * from './ports.js';
