/**
 * runner.ts
 *
 * WHAT: THE LOOP. One AgentRun owns one query() from the Claude Agent SDK, for
 *       one founder and one thread, and turns every message that comes out of
 *       it into something a browser can render.
 *
 * WHY IT EXISTS: Everything else in this folder decides what should happen.
 *       This is the only file that makes it happen, and it is the only file
 *       that touches the SDK. Three failures live here and nowhere else.
 *       A founder watching a blank screen for 40 seconds and concluding the
 *       app is broken: solved by streaming partial messages and by translating
 *       tool calls into English. A founder unable to stop a run that has gone
 *       wrong: solved by interrupt. A loop that bills the whole cohort's
 *       allowance at 3 am: solved by the cap that the SDK enforces inside the
 *       loop rather than after a poll.
 *
 * CALLED BY: session-pool.ts, which owns the lifetime of these objects, and
 *       through it the route layer.
 * READS:  the skill bodies and run facts, through assemble.ts. WRITES: nothing
 *       durable itself. It emits TurnEvents; the caller persists them as
 *       turn_events rows and writes the spend row through Budget.
 *
 * THE TOOL SURFACE HAS NO SHELL, AND IT IS SET IN THREE PLACES ON PURPOSE.
 *   `tools`            the base set of built in tools. Named, never a preset.
 *   `allowedTools`     what runs without asking. The same names, plus our two.
 *   `disallowedTools`  Bash, WebSearch, WebFetch, Task and Skill, removed from
 *                      the model's context even if something above let them in.
 * Any one of the three would probably do. All three are set because
 * `permissionMode: 'bypassPermissions'` is only safe BECAUSE there is no shell
 * and cwd is a per founder scratch directory. If either of those ever changes,
 * the permission mode has to change with it. A default is not a decision, and
 * the failure this prevents is a model with a shell inside a folder holding
 * 3,000 real people's contact details.
 *
 * WHY `tools` IS SET AT ALL, MEASURED RATHER THAN ASSUMED. Asked for nothing,
 * CLI 2.1.250 hands the model 29 tools, and that list contains Bash, Task,
 * WebFetch, WebSearch, Skill, SendMessage and CronCreate. The named list is
 * what turns 29 into 5.
 *
 * Note what is not confused here. The MODEL has no shell. The SERVER spawns ge
 * itself, as a child process, with an argv array, in src/server/ge/run.ts. Two
 * different things, and both hold.
 */

import type {
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { anthropicKeyFor } from './anthropic-key.js';
import { assemble, reAnchor, type AssembledPrompt } from './assemble.js';
import { CostMeter, cacheReadTokensOf, type Budget } from './budget.js';
import { postToolUse, preCompact, type HookDeps } from './hooks.js';
import { endLabel, startLabel } from './labels.js';
import type { Clock, FactsSource, Logger, SkillBodies } from './ports.js';
import { Pushable } from './pushable.js';
import type { SessionStoreLike } from './session-store.js';
import type { FounderContext, RouteRow, TurnEvent, TurnOutcome } from './types.js';

/** The SDK's query(), injected so every unit here is testable without it. */
export type QueryFn = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Query;

/** Built per run by mcp/ge-tools.ts. Opaque here, so runner needs no zod. */
export type McpServers = NonNullable<Options['mcpServers']>;

export interface RunnerConfig {
  /** Model id for the primary routes. The product's voice work runs here. */
  readonly primaryModel: string;
  /** Model id for status, gate, doctor and the thread digests. */
  readonly utilityModel: string;
  /** A capacity blip should degrade, not stall a live session. */
  readonly fallbackModel?: string;
  readonly anthropicApiKey: string;
  /** PATH for the subprocess. Deliberately short. */
  readonly path: string;
  /** Where the CLI keeps its own config and its local transcript copy. */
  readonly claudeConfigDir: string;
  /**
   * How long a sessionStore load may take before the spawn gives up. The SDK
   * default is 60 seconds, which is 60 seconds of a founder watching nothing.
   * A miss is cheap here, because a null load falls back to the digest.
   */
  readonly sessionLoadTimeoutMs: number;
}

export interface RunnerDeps {
  readonly queryFn: QueryFn;
  readonly bodies: SkillBodies;
  readonly facts: FactsSource;
  readonly budget: Budget;
  readonly log: Logger;
  readonly clock: Clock;
  readonly config: RunnerConfig;
  /** Built per run so the founder context is closed over. See mcp/ge-tools.ts. */
  readonly makeGeTools: (ctx: FounderContext) => {
    readonly servers: McpServers;
    readonly toolNames: readonly string[];
  };
  /** Optional. Absent means no transcript mirroring, which is a supported state. */
  readonly sessionStore?: SessionStoreLike;
  /** Called after every write, so storage can checkpoint. */
  readonly onCheckpoint?: (reason: 'compact' | 'turn_end') => Promise<void>;
  /** Called when founder-brain.md changed, so the track cache is refreshed. */
  readonly onBrainChanged?: () => void;
}

/**
 * The CLI this file's assertions were read off, by running it. The tool list
 * and the skill list are properties of a CLI version, not of this code, so the
 * two have to move together. Every init failure message names this version and
 * the version that actually answered, so an upgrade that changes the surface
 * gives the next person a sentence instead of a mystery.
 *
 * Verified on 2026-08-29 against @anthropic-ai/claude-agent-sdk 0.3.250, whose
 * bundled CLI reports claude_code_version 2.1.250. To move it: run the same
 * spawn, read system/init, and change these lists to what it actually says.
 */
export const EXPECTED_CLI_VERSION = '2.1.250';

/**
 * Present or the turn is refused. All five measured present in 2.1.250.
 *
 * TodoWrite is deliberately NOT here. It was, and it refused every turn for
 * every founder on every route, because TodoWrite does not exist in this CLI:
 * asked for by name it is silently dropped, and it is absent even from the
 * 29 tool default surface. A built in tool the installed CLI does not happen
 * to ship is not a security property, and it must not be able to stop a
 * founder typing.
 */
export const REQUIRED_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep'] as const;

/**
 * Asked for, never asserted. TodoWrite costs nothing to request on a CLI that
 * does not have it, labels.ts already knows how to describe it in English, and
 * asking keeps the surface the same on the day a later CLI ships it. If it
 * ever appears, the log line at the end of assertInit says so.
 */
export const OPTIONAL_TOOLS = ['TodoWrite'] as const;

/** What goes to the SDK as `tools`. Written out, never a preset. */
export const BUILT_IN_TOOLS = [...REQUIRED_TOOLS, ...OPTIONAL_TOOLS] as const;

/**
 * Never available. Listed by name so a deploy that adds one fails the assert.
 *
 * The first four are the security property this whole design rests on: the
 * model has no shell, no network and no subagents.
 *
 * Skill is the fifth and it is here in place of an assertion that used to be
 * made on the wrong field. See assertInit for the measurement. Short version:
 * the CLI ships 16 skills of its own, `skills: []` does not make init stop
 * reporting them, and the thing that actually stops the model reaching one is
 * that there is no Skill tool to reach it with.
 */
export const FORBIDDEN_TOOLS = ['Bash', 'WebSearch', 'WebFetch', 'Task', 'Skill'] as const;

export class InitMismatchError extends Error {}

/** What a caller gets back after starting a run. */
export interface StartOptions {
  readonly ctx: FounderContext;
  readonly route: RouteRow;
  /** From threads.sdk_session_id. Resume rather than start fresh. */
  readonly resumeSessionId?: string;
  /**
   * Used only when a cold resume found no transcript. Built from the founder's
   * own files, so it survives anything the container does.
   */
  readonly seed?: string;
  /**
   * A line put in front of THIS turn's message, on every turn, not just the first.
   *
   * WHY IT EXISTS. `runHeader` goes in once, in the constructor, and is then set to
   * null. A session survives between turns, so on turn two the model gets only what
   * the founder typed. Its picture of the folder is whatever it remembers, and what
   * it remembers includes its own tool calls.
   *
   * That was not a theory. A rules refusal rolled back three files, the session stayed
   * alive, and on the next turn the model told the founder the files were in their
   * Files because its own history said it had written them. The turn committed with
   * zero files and reported ok. Nothing on either side knew.
   *
   * So the state of the folder is restated every turn, and after a refusal it says
   * plainly that the previous writes were undone. Cheap, and it removes a whole class
   * of drift between what is on disk and what the model believes.
   */
  readonly turnPrefix?: string;
}

export class AgentRun {
  private readonly inbox = new Pushable<SDKUserMessage>();
  /** The hard backstop on teardown. See close(). */
  private readonly abort = new AbortController();
  private readonly meter = new CostMeter();
  /** tool_use_id to what it was, so a tool result can be labelled in English. */
  private readonly liveTools = new Map<string, { name: string; input: unknown }>();
  private q: Query | null = null;
  private pump: Promise<void> | null = null;
  private prompt: AssembledPrompt | null = null;
  private current: ActiveTurn | null = null;
  /** The run header, waiting to ride in front of the first founder message. */
  private pendingPrefix: string | null = null;
  private turnIndex = 0;
  private interruptRequested = false;
  private reAnchorNeeded = false;
  private closed = false;

  /** Set from the first system/init and from every result message. */
  sdkSessionId: string | null = null;
  /** Wall clock of the last turn, for the idle sweep in session-pool.ts. */
  lastActivityAt: number;

  constructor(
    private readonly deps: RunnerDeps,
    readonly ctx: FounderContext,
    readonly route: RouteRow,
  ) {
    this.lastActivityAt = deps.clock.now();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Whether a turn is in flight. session-pool will not evict a busy run. */
  get isBusy(): boolean {
    return this.current !== null;
  }

  /**
   * Sends one founder message and resolves when that turn is finished, either
   * way. The first call spawns the subprocess; later calls cost nothing, which
   * is the whole reason for streaming input mode.
   *
   * `emit` is called for every frame. The caller writes each one as a
   * turn_events row and pushes it down the SSE stream, and it is that row id
   * that makes a reconnect with Last-Event-ID lossless.
   */
  async send(
    turnId: string,
    text: string,
    emit: (event: TurnEvent) => void,
    opts?: StartOptions,
  ): Promise<TurnOutcome> {
    if (this.closed) throw new Error('run is closed');
    if (this.current) throw new Error('one turn at a time per run');

    // EVERY TURN, and it overwrites rather than appends. A prefix left over from a
    // turn that never sent would describe a folder that has since changed, which is
    // the failure this exists to stop rather than a smaller version of it.
    if (opts?.turnPrefix !== undefined) this.pendingPrefix = opts.turnPrefix;

    const active: ActiveTurn = {
      turnId,
      emit,
      text: [],
      settle: () => {},
      failed: null,
    };
    const finished = new Promise<TurnOutcome>((resolve, reject) => {
      active.settle = (outcome, err) => (err ? reject(err) : resolve(outcome as TurnOutcome));
    });
    this.current = active;
    this.turnIndex += 1;
    this.interruptRequested = false;
    this.lastActivityAt = this.deps.clock.now();

    try {
      if (!this.q) await this.spawn(opts);
      this.inbox.push(userMessage(this.composeMessage(text)));
    } catch (err: unknown) {
      this.current = null;
      const message = err instanceof Error ? err.message : String(err);
      emit({
        kind: 'error',
        text: 'That could not be started. Nothing you have made is affected. Try again, and tell a mentor if it happens twice.',
        detail: message,
      });
      throw err;
    }

    return finished;
  }

  /**
   * Stop. The partial text that already streamed has already been written as
   * turn_events rows, so the founder can read what they stopped rather than
   * watching it vanish.
   */
  async interrupt(): Promise<void> {
    this.interruptRequested = true;
    if (!this.q) return;
    try {
      await this.q.interrupt();
    } catch (err: unknown) {
      // An interrupt that fails must not become an unhandled rejection on a
      // founder pressing stop. Worst case the turn finishes on its own.
      this.deps.log.warn(
        { founderId: this.ctx.founderId, err: String(err) },
        'interrupt failed',
      );
    }
  }

  /**
   * Retire the run. The session id survives in Postgres, so the founder's next
   * message resumes rather than restarts.
   *
   * It deliberately does NOT wait for the message generator to finish. Ending
   * the input is the graceful path and the abort is the guarantee: the SDK's
   * own declaration says the abort signal fires only after stdin EOF and a
   * grace window, so calling both gives a clean exit with a hard backstop.
   *
   * Waiting would be worse than useless. session-pool.ts calls this while it
   * evicts, and a close that blocks on a subprocess which is not going to
   * answer stops the pool retiring anything at all. That is the failure that
   * takes the VM down with 65 people in a room, so the wait is not here.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.inbox.end();
    this.abort.abort();
    await Promise.resolve();
  }

  // ------------------------------------------------------------------ spawn

  private async spawn(opts?: StartOptions): Promise<void> {
    this.prompt = await assemble(
      { bodies: this.deps.bodies, facts: this.deps.facts },
      this.ctx,
      this.route,
    );

    const capUsd = await this.deps.budget.spawnCapUsd(this.ctx.founderId);
    if (capUsd <= 0) {
      throw new Error('spend cap reached before spawn, admission should have caught this');
    }

    const ge = this.deps.makeGeTools(this.ctx);
    const hookDeps: HookDeps = {
      onFileWritten: (path) => this.current?.emit({ kind: 'file', path }),
      onBrainChanged: () => this.deps.onBrainChanged?.(),
      onCompactStarting: () => {
        this.reAnchorNeeded = true;
      },
    };

    const options: Options = {
      abortController: this.abort,
      cwd: this.ctx.workdir,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        // ONE skill body, never nine. See assemble.ts for why the volatile
        // half is not here.
        append: this.prompt.systemPromptAppend,
        // Strips the per user sections out of the preset prompt so the prefix
        // is the same bytes for every founder on this route. Without it, ~65
        // founders each pay full price for a prompt they could have shared.
        excludeDynamicSections: true,
      },
      // SDK isolation. Without this the deployment picks up whatever
      // ~/.claude/settings.json happens to exist on the machine, which is a
      // class of bug nobody finds at 2 am on the Saturday.
      settingSources: [],
      // The same discipline for MCP: only the server we passed, never one from
      // a config file that happened to be on the box.
      strictMcpConfig: true,
      // Routing is the app's. There is no skill for the Skill tool to load, so
      // it is turned off explicitly rather than left to a default.
      skills: [],
      model: this.route.tier === 'primary'
        ? this.deps.config.primaryModel
        : this.deps.config.utilityModel,
      fallbackModel: this.deps.config.fallbackModel,
      // Layer 1 of four. This is the layer that actually kills a runaway,
      // because it fires inside the loop rather than after a poll.
      maxBudgetUsd: capUsd,
      maxTurns: this.route.maxTurns,
      includePartialMessages: true,
      tools: [...BUILT_IN_TOOLS],
      allowedTools: [...BUILT_IN_TOOLS, ...ge.toolNames],
      disallowedTools: [...FORBIDDEN_TOOLS],
      permissionMode: 'bypassPermissions',
      // Required by the SDK whenever bypassPermissions is used. Safe here only
      // because of the tool surface above and the per founder cwd.
      allowDangerouslySkipPermissions: true,
      mcpServers: ge.servers,
      resume: opts?.resumeSessionId,
      sessionStore: this.deps.sessionStore as Options['sessionStore'],
      loadTimeoutMs: this.deps.config.sessionLoadTimeoutMs,
      hooks: {
        PostToolUse: [{ hooks: [postToolUse(hookDeps) as never] }],
        PreCompact: [{ hooks: [preCompact(hookDeps) as never] }],
      },
      // env REPLACES the subprocess environment rather than merging with it,
      // which is the point: nothing on the VM leaks in.
      env: {
        PATH: this.deps.config.path,
        HOME: '/tmp',
        CLAUDE_CONFIG_DIR: this.deps.config.claudeConfigDir,
        /**
         * READ AT SPAWN, NOT AT BOOT, AND THAT IS THE WHOLE OF "WITHOUT A RESTART".
         *
         * The config value is settled once, when the process starts, from the
         * environment. On a founder's own deployment the environment has no key
         * in it and never will: they paste one into the running app, because
         * they cannot restart a container and nothing tells them to. So the
         * holder is asked here, on the line that actually hands the key to the
         * subprocess, and the config is what answers when nothing has been
         * pasted. A key pasted two seconds ago is used by the next turn.
         *
         * The founder id is passed so the holder can refuse a key belonging to
         * somebody else. There is one founder per deployment, so it always
         * matches; the comparison is what keeps that true if it ever stops
         * being.
         */
        ANTHROPIC_API_KEY: anthropicKeyFor(this.ctx.founderId, this.deps.config.anthropicApiKey),
      },
      stderr: (data) =>
        this.deps.log.warn({ founderId: this.ctx.founderId, data }, 'cli stderr'),
      // Extended thinking is deliberately not configured. Turning it off is
      // documented to make the model write a tool call into visible text
      // instead of emitting a tool_use block, which in an agentic loop is a
      // silent failure rather than a loud one.
    };

    this.q = this.deps.queryFn({ prompt: this.inbox, options });
    this.pump = this.consume(this.q);

    // The run header rides in front of the founder's first message rather than
    // going in as a message of its own. Two user messages would be two turns,
    // two results and two spend rows for one thing the founder typed.
    this.pendingPrefix = opts?.seed
      ? `${this.prompt.runHeader}\n${opts.seed}\n`
      : this.prompt.runHeader;
  }

  /**
   * Header, re anchor line if the SDK just compacted, then what they typed.
   *
   * THE LEADING SLASH. A message whose FIRST character is "/" is read by the
   * CLI as a slash command rather than as something a founder said, and it
   * never reaches the model. Measured on 2.1.250, both halves reproducible:
   *   "/code-review look at everything"  no system/init, no result, no error.
   *                                      The turn never returns. That is the
   *                                      bad one: `current` stays set, the run
   *                                      stays busy, the pool will not evict it
   *                                      and the founder's SSE stream is held
   *                                      open on a turn that cannot finish.
   *   "/anything-else at all"            init, then result success with
   *                                      num_turns 0 and cost 0. A turn that
   *                                      says it worked and answers nothing.
   * A founder writing a post about pricing types "/mo" and gets one of those.
   *
   * Only turn two onward can hit it, because turn one has the run header in
   * front of the founder's text, which is why nothing caught this earlier.
   *
   * One newline in front is the whole fix, and it is the smallest change to the
   * bytes the model reads. Measured: a leading space or a leading newline both
   * make the same message go through to the model normally. It is applied only
   * when the composed message starts with "/", so every other message is byte
   * identical to what it was and the shared prompt prefix is untouched.
   */
  private composeMessage(text: string): string {
    const parts: string[] = [];
    if (this.pendingPrefix !== null) {
      parts.push(this.pendingPrefix);
      this.pendingPrefix = null;
    }
    if (this.reAnchorNeeded) {
      parts.push(reAnchor(this.ctx, this.route, null));
      this.reAnchorNeeded = false;
    }
    parts.push(text);
    const composed = parts.join('\n\n');
    return composed.startsWith('/') ? `\n${composed}` : composed;
  }

  // ---------------------------------------------------------------- the pump

  private async consume(q: Query): Promise<void> {
    let sawInit = false;
    try {
      for await (const msg of q) {
        if (!sawInit && isInit(msg)) {
          sawInit = true;
          this.assertInit(msg);
          continue;
        }
        this.dispatch(msg);
      }
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      if (this.closed) {
        // We asked for this. close() ends the input and aborts, and the SDK
        // answers an abort by throwing out of the generator. Logging it as an
        // error would put a scary line in the log on every normal eviction.
        this.deps.log.info(
          { founderId: this.ctx.founderId, routeId: this.route.id },
          'run torn down',
        );
      } else {
        this.deps.log.error(
          { founderId: this.ctx.founderId, routeId: this.route.id, detail },
          'agent run ended in an error',
        );
      }
      this.failCurrent(
        'Something went wrong at our end. Nothing you have made is affected. Try that again.',
        err instanceof Error ? err : new Error(detail),
      );
    } finally {
      this.closed = true;
    }
  }

  /**
   * Step 9. The guard that catches a bad deploy before 65 founders find it.
   *
   * A mismatch is a loud server error and the turn is refused, because every
   * one of these means the container is not running what this code thinks it
   * is running: the wrong model, a tool surface with a shell in it, a settings
   * file that leaked in, or an MCP server that did not connect.
   *
   * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR. It exists for one property: the
   * model has no shell, no network and no subagents. That half stays strict and
   * still refuses the turn. It is not for asserting that the installed CLI
   * happens to ship every convenience tool, and it is not for asserting against
   * something the SDK will not honour. Both of those refused every turn for
   * every founder, and neither was a security property.
   *
   * ON THE 16 BUNDLED SKILLS, MEASURED, NOT ASSUMED. This used to refuse when
   * `msg.skills` was non empty, on the reasoning that `skills: []` plus
   * `settingSources: []` should mean nothing was discovered. Spawning the real
   * CLI says otherwise. `msg.skills` comes back with the same 16 names under
   * every value of the option: `[]`, `['code-review']`, `'all'`, and omitted.
   * It is a DISCOVERY list, reporting what the CLI found bundled inside its own
   * binary, and it is invariant. It was never an enabled list, so the old
   * assertion was reading the wrong field.
   *
   * Is a discovered skill a risk? A skill is a page of instructions. It cannot
   * add a tool, so it cannot give the model a shell, the network or a subagent.
   * The first rule is untouched. Nor can it reach the founder's work: a skill is
   * only ever loaded through the Skill tool, and Skill is not in the surface.
   * Measured on 2.1.250: the tool list is Read, Write, Edit, Glob, Grep and the
   * ge tools, with no Skill under any `skills` value, because the explicit
   * `tools` array decides the surface. Asked for by name, Skill does appear,
   * which is how we know its absence is our doing and not luck.
   *
   * So the mitigation is not a new one. It is the same named `tools` array that
   * removes Bash, now written down as an assertion: Skill is in FORBIDDEN_TOOLS.
   * If a future CLI or a bad deploy puts Skill back in the surface, the turn is
   * refused, which is the guarantee `skills: []` could not give us.
   *
   * What remains true and is worth saying plainly: those skill files sit on
   * disk and Read is in the surface, so the model could in principle read one.
   * Reading a page of instructions is not an escalation, we did not write those
   * files, and no founder data is in them.
   */
  private assertInit(msg: InitMessage): void {
    this.sdkSessionId = msg.session_id;
    const problems: string[] = [];
    const tools = new Set(msg.tools);
    const cliVersion = msg.claude_code_version ?? 'unreported';

    for (const required of REQUIRED_TOOLS) {
      if (!tools.has(required)) problems.push(`missing tool ${required}`);
    }
    for (const banned of FORBIDDEN_TOOLS) {
      if (tools.has(banned)) problems.push(`FORBIDDEN TOOL PRESENT: ${banned}`);
    }
    const geServer = msg.mcp_servers.find((s) => s.name === 'ge');
    if (!geServer) problems.push('ge mcp server absent');
    else if (geServer.status !== 'connected') {
      problems.push(`ge mcp server status ${geServer.status}`);
    }
    if (msg.permissionMode !== 'bypassPermissions') {
      problems.push(`permission mode ${msg.permissionMode}`);
    }
    // settingSources: [] should mean this stays empty. If it does not, the
    // deployment read a config file it should not have. Unlike msg.skills, this
    // one was measured empty on the real CLI, so it still means something.
    if (msg.plugins.length > 0) problems.push(`plugins loaded: ${msg.plugins.length}`);

    const expectedModel =
      this.route.tier === 'primary'
        ? this.deps.config.primaryModel
        : this.deps.config.utilityModel;
    if (msg.model !== expectedModel) {
      problems.push(`model ${msg.model}, expected ${expectedModel}`);
    }

    // A version that has moved does NOT refuse the turn on its own. The strict
    // half above is version independent: a shell is a shell whatever the CLI
    // says it is. What a moved version does is explain the strict half's
    // findings, so it rides on every failure message and warns on its own.
    const versionNote =
      cliVersion === EXPECTED_CLI_VERSION
        ? `claude code cli ${cliVersion}`
        : `claude code cli ${cliVersion}, but these assertions were written against ${EXPECTED_CLI_VERSION}, so check the tool list against the new one before changing anything here`;

    if (problems.length > 0) {
      const detail = `${problems.join('; ')} (${versionNote})`;
      this.deps.log.error(
        {
          founderId: this.ctx.founderId,
          routeId: this.route.id,
          prefixHash: this.prompt?.prefixHash,
          problems,
          cliVersion,
          expectedCliVersion: EXPECTED_CLI_VERSION,
        },
        'INIT ASSERTION FAILED, refusing the turn',
      );
      throw new InitMismatchError(detail);
    }

    if (cliVersion !== EXPECTED_CLI_VERSION) {
      this.deps.log.warn(
        { cliVersion, expectedCliVersion: EXPECTED_CLI_VERSION, tools: msg.tools },
        'the claude code cli has moved under this assertion. It still passes. Re read system/init and update EXPECTED_CLI_VERSION in runner.ts',
      );
    }

    this.deps.log.info(
      {
        founderId: this.ctx.founderId,
        routeId: this.route.id,
        track: this.ctx.track,
        model: msg.model,
        sessionId: msg.session_id,
        // The cache unit. Two founders on one route and track must print the
        // same hash, and the smoke test asserts they do.
        prefixHash: this.prompt?.prefixHash,
        cliVersion,
        // Not a problem, and recorded so it is never a surprise. 16 on 2.1.250,
        // none of them reachable without a Skill tool.
        skillsDiscovered: msg.skills.length,
        // Empty on 2.1.250. A name here means a later CLI shipped one of the
        // optional tools, which is worth someone noticing.
        optionalToolsPresent: OPTIONAL_TOOLS.filter((t) => tools.has(t)),
      },
      'run started',
    );
  }

  private dispatch(msg: SDKMessage): void {
    switch (msg.type) {
      case 'stream_event':
        this.onStreamEvent(msg);
        return;
      case 'assistant':
        this.onAssistant(msg);
        return;
      case 'user':
        this.onToolResults(msg);
        return;
      case 'result':
        this.onResult(msg);
        return;
      case 'system':
        this.onSystem(msg);
        return;
      default:
        return;
    }
  }

  /** Token streaming. Text only. Thinking is never shown to a founder. */
  private onStreamEvent(msg: SDKMessage & { type: 'stream_event' }): void {
    const text = textDeltaOf(msg.event);
    if (text === null || text.length === 0) return;
    this.current?.text.push(text);
    this.current?.emit({ kind: 'delta', text });
  }

  /**
   * Only tool_use blocks are read here. The assistant's text has already gone
   * out as deltas, and emitting it again would print every answer twice.
   */
  private onAssistant(msg: SDKMessage & { type: 'assistant' }): void {
    const content = (msg as { message?: { content?: unknown } }).message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!isToolUse(block)) continue;
      this.liveTools.set(block.id, { name: block.name, input: block.input });
      this.current?.emit({
        kind: 'tool',
        text: startLabel(block.name, block.input),
        done: false,
      });
    }
  }

  /** A tool finished. The user message carrying the result names it by id. */
  private onToolResults(msg: SDKMessage & { type: 'user' }): void {
    const content = (msg as { message?: { content?: unknown } }).message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!isToolResult(block)) continue;
      const started = this.liveTools.get(block.tool_use_id);
      if (!started) continue;
      this.liveTools.delete(block.tool_use_id);
      this.current?.emit({
        kind: 'tool',
        text: endLabel(started.name, started.input),
        done: true,
      });
    }
  }

  private onSystem(msg: SDKMessage & { type: 'system' }): void {
    if (msg.subtype !== 'compact_boundary') return;
    const meta = (msg as { compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number } })
      .compact_metadata;
    this.reAnchorNeeded = true;
    this.deps.log.info(
      {
        founderId: this.ctx.founderId,
        routeId: this.route.id,
        trigger: meta?.trigger,
        preTokens: meta?.pre_tokens,
        postTokens: meta?.post_tokens,
      },
      'context compacted',
    );
    // Checkpoint every file immediately. Compaction is the moment we are most
    // likely to lose track of what has been written, so the record is brought
    // up to date before the summary replaces the detail.
    void this.deps.onCheckpoint?.('compact');
    this.current?.emit({
      kind: 'status',
      text: 'Making room in the conversation. Your files are safe and nothing is lost.',
    });
  }

  private onResult(msg: SDKMessage & { type: 'result' }): void {
    const active = this.current;
    this.current = null;
    this.lastActivityAt = this.deps.clock.now();
    if (msg.session_id) this.sdkSessionId = msg.session_id;
    if (!active) return;

    const costUsd = this.meter.turnCost(msg.total_cost_usd);
    const cacheReadTokens = cacheReadTokensOf(
      (msg as { modelUsage?: Record<string, { cacheReadInputTokens?: number }> }).modelUsage,
    );
    const status = this.statusOf(msg);
    const finalText =
      msg.subtype === 'success' && typeof msg.result === 'string' && msg.result.length > 0
        ? msg.result
        : active.text.join('');

    const outcome: TurnOutcome = {
      turnId: active.turnId,
      status,
      costUsd,
      cacheReadTokens,
      sdkSessionId: this.sdkSessionId,
      text: finalText,
    };

    // The ledger write must not be able to fail a turn that already happened.
    void this.deps.budget
      .record({
        founderId: this.ctx.founderId,
        turnId: active.turnId,
        routeId: this.route.id,
        costUsd,
        cacheReadTokens,
        turnIndex: this.turnIndex,
      })
      .catch((err: unknown) =>
        this.deps.log.error(
          { founderId: this.ctx.founderId, turnId: active.turnId, err: String(err) },
          'spend row failed to write',
        ),
      );

    if (status === 'max_turns') {
      // Never presented as an error. It is presented as an offer.
      active.emit({
        kind: 'status',
        text: 'This one has got long. Say carry on and it will pick up where it left off.',
      });
    }
    if (status === 'max_budget') {
      active.emit({
        kind: 'status',
        text: 'That is as far as this run goes for now. Say carry on and it will start again from your files.',
      });
    }
    if (status === 'error') {
      const errors = (msg as { errors?: unknown }).errors;
      active.emit({
        kind: 'error',
        text: 'That stopped before it finished. Nothing you have made is affected. Try again.',
        detail: Array.isArray(errors) ? errors.join('; ') : undefined,
      });
    }

    active.emit({ kind: 'turn_end', outcome });
    void this.deps.onCheckpoint?.('turn_end');
    active.settle(outcome);
  }

  private statusOf(msg: SDKMessage & { type: 'result' }): TurnOutcome['status'] {
    if (this.interruptRequested) return 'interrupted';
    switch (msg.subtype) {
      case 'success':
        return msg.is_error ? 'error' : 'ok';
      case 'error_max_turns':
        return 'max_turns';
      case 'error_max_budget_usd':
        return 'max_budget';
      default:
        return 'error';
    }
  }

  /**
   * The original error is handed back rather than a fresh one wrapping its
   * message. An InitMismatchError means a bad deploy and the caller should
   * page somebody; a transport error means try again. Flattening both into a
   * plain Error would make the caller parse a string to tell them apart.
   */
  private failCurrent(text: string, err: Error): void {
    const active = this.current;
    this.current = null;
    if (!active) return;
    active.emit({ kind: 'error', text, detail: err.message });
    active.settle(undefined, err);
  }
}

// --------------------------------------------------------------- internals

interface ActiveTurn {
  readonly turnId: string;
  readonly emit: (event: TurnEvent) => void;
  readonly text: string[];
  settle: (outcome: TurnOutcome | undefined, err?: Error) => void;
  failed: Error | null;
}

/** The init message, narrowed to the fields the assertion reads. */
interface InitMessage {
  readonly type: 'system';
  readonly subtype: 'init';
  readonly session_id: string;
  readonly tools: string[];
  readonly mcp_servers: { name: string; status: string }[];
  readonly model: string;
  readonly permissionMode: string;
  readonly plugins: unknown[];
  /**
   * The CLI's own bundled skills, discovered. NOT a list of what is enabled,
   * and not something `Options.skills` changes. Read, logged, never asserted.
   */
  readonly skills: string[];
  /** Absent on a CLI old enough not to report it, hence optional. */
  readonly claude_code_version?: string;
}

function isInit(msg: SDKMessage): msg is SDKMessage & InitMessage {
  return msg.type === 'system' && (msg as { subtype?: string }).subtype === 'init';
}

/**
 * The one place a founder's tokens are pulled out of a raw stream event.
 *
 * Narrowed structurally rather than by importing the vendor's beta message
 * types. Those types move, and a version bump that renames a member should
 * make this return null and stop the stream, not fail the build of a file that
 * has nothing to do with it. The shape checked here is the Messages API
 * streaming contract: content_block_delta carrying a text_delta.
 */
export function textDeltaOf(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as { type?: unknown; delta?: unknown };
  if (e.type !== 'content_block_delta') return null;
  const delta = e.delta;
  if (typeof delta !== 'object' || delta === null) return null;
  const d = delta as { type?: unknown; text?: unknown };
  if (d.type !== 'text_delta') return null;
  return typeof d.text === 'string' ? d.text : null;
}

function isToolUse(
  block: unknown,
): block is { type: 'tool_use'; id: string; name: string; input: unknown } {
  if (typeof block !== 'object' || block === null) return false;
  const b = block as { type?: unknown; id?: unknown; name?: unknown };
  return b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string';
}

function isToolResult(block: unknown): block is { type: 'tool_result'; tool_use_id: string } {
  if (typeof block !== 'object' || block === null) return false;
  const b = block as { type?: unknown; tool_use_id?: unknown };
  return b.type === 'tool_result' && typeof b.tool_use_id === 'string';
}

/** Wraps plain text as the SDK's user message shape. */
export function userMessage(text: string): SDKUserMessage {
  return {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
  } as SDKUserMessage;
}
