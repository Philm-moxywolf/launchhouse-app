/**
 * sdk.ts
 *
 * WHAT: The one place this app imports @anthropic-ai/claude-agent-sdk at run
 *       time. Everything else imports types from it, which are erased, or takes
 *       what it needs as an argument.
 *
 * WHY IT EXISTS: A loop that imports the SDK directly cannot be unit tested
 *       without a CLI binary and an API key, so it never gets tested. With one
 *       seam, runner.ts takes `query` as an argument and every test drives it
 *       with a scripted generator. The real SDK is wired in exactly once, in
 *       ./index.ts, and the code path is identical either way.
 *
 *       It is also where a version pin lives. The SDK ships the Linux CLI as a
 *       per platform optional dependency, so an install that skipped optional
 *       dependencies fails at the first query rather than at install time. That
 *       is assumption B2, and the boot check belongs beside this import.
 *
 * CALLED BY: ./index.ts, and mcp/ge-tools.ts for the MCP helpers.
 * READS:  nothing. WRITES: nothing.
 */

export {
  query,
  createSdkMcpServer,
  tool,
  AbortError,
} from '@anthropic-ai/claude-agent-sdk';

export type {
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SessionStore,
  McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';
