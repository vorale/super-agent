/**
 * Claude Agent Service
 *
 * Manages Claude Agent SDK conversations using the @anthropic-ai/claude-agent-sdk
 * `query()` function. Provides an async generator interface that yields
 * ConversationEvents for SSE streaming.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3
 */

import { config } from '../config/index.js';
import { join } from 'path';
import { getBedrockModelId } from '../utils/claude-config.js';
import { createToken } from '../middleware/auth.js';
import { dangerousCommandBlocker, binaryFileReadBlocker, createSkillAccessChecker } from './claude-hooks.js';
import { WorkspaceManager, type SkillForWorkspace } from './workspace-manager.js';
import { prisma } from '../config/database.js';

// ---------------------------------------------------------------------------
// Re-export SDK types from @anthropic-ai/claude-agent-sdk for consumers.
// We define local interfaces that mirror the SDK surface so tests can
// inject a mock queryFactory without depending on the real SDK.
// ---------------------------------------------------------------------------

export interface SDKHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
  [key: string]: unknown;
}

export interface SDKHookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: 'approve' | 'block';
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
}

export type SDKHookCallback = (
  input: SDKHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<SDKHookOutput>;

export interface SDKHookCallbackMatcher {
  matcher?: string;
  hooks: SDKHookCallback[];
}

/** MCP server configuration in the format expected by the SDK. */
export interface MCPServerSDKConfig {
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

/**
 * In-process SDK MCP server config (created via createSdkMcpServer).
 * The `instance` property holds the live McpServer object.
 */
export interface MCPServerInProcessConfig {
  type: 'sdk';
  name: string;
  instance: unknown; // McpServer instance from the SDK
}

/** Union of all MCP server config types the service accepts. */
export type AnyMCPServerConfig = MCPServerSDKConfig | MCPServerInProcessConfig;

export interface ClaudeCodeOptions {
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  allowedTools?: string[];
  cwd?: string;
  resume?: string;
  model?: string;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowDangerouslySkipPermissions?: boolean;
  hooks?: Partial<Record<string, SDKHookCallbackMatcher[]>>;
  mcpServers?: Record<string, AnyMCPServerConfig>;
  abortController?: AbortController;
  maxTurns?: number;
  pathToClaudeCodeExecutable?: string;
  env?: Record<string, string | undefined>;
  stderr?: (data: string) => void;
  /** Load filesystem settings: 'project' enables CLAUDE.md, skills, agents discovery. */
  settingSources?: Array<'user' | 'project' | 'local'>;
  /** Local plugins to load into the Claude Code session. */
  plugins?: Array<{ type: 'local'; path: string }>;
}

// ---------------------------------------------------------------------------
// SDK message types
// ---------------------------------------------------------------------------

export interface SDKSystemMessage {
  type: 'system';
  subtype: string;
  session_id: string;
  uuid: string;
  model?: string;
  tools?: string[];
  cwd?: string;
  [key: string]: unknown;
}

export interface TextBlock { type: 'text'; text: string; }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; }
export interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string | null; is_error: boolean; }
export type SDKContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface SDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    model?: string;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
}

export interface SDKResultMessage {
  type: 'result';
  subtype: string;
  uuid: string;
  session_id: string;
  duration_ms: number;
  num_turns: number;
  is_error: boolean;
  result?: string;
  [key: string]: unknown;
}

export type SDKMessage = SDKSystemMessage | SDKAssistantMessage | SDKResultMessage | { type: string; [key: string]: unknown };

export interface SDKQuery extends AsyncGenerator<SDKMessage, void> { interrupt(): Promise<void>; }
export type QueryFactory = (args: { prompt: string; options?: ClaudeCodeOptions }) => SDKQuery;

// ---------------------------------------------------------------------------
// Service-level types
// ---------------------------------------------------------------------------

export interface ClaudeAgentServiceOptions {
  agentId: string;
  sessionId?: string;
  claudeSessionId?: string;
  message: string;
  organizationId: string;
  userId: string;
  /** Pre-provisioned workspace path (scope-session flow). Skips legacy ensureWorkspace when set. */
  workspacePath?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  displayName: string;
  systemPrompt: string | null;
  /** Model identifier (e.g. LiteLLM model name). Passed to container to override ANTHROPIC_MODEL. */
  model?: string;
  organizationId: string;
  skillIds: string[];
  mcpServerIds: string[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | null; is_error: boolean };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
}

export interface ConversationEvent {
  type: 'session_start' | 'assistant' | 'result' | 'heartbeat' | 'error' | 'preview_ready';
  sessionId?: string;
  content?: ContentBlock[];
  model?: string;
  durationMs?: number;
  numTurns?: number;
  code?: string;
  message?: string;
  suggestedAction?: string;
  /** preview_ready fields */
  appId?: string;
  url?: string;
  appName?: string;
  /** Sub-agent speaker identity — set when the message originates from a sub-agent */
  speakerAgentName?: string;
  speakerAgentAvatar?: string | null;
  /** Token usage from the LLM — populated on result events */
  tokenUsage?: TokenUsage;
}

export interface MCPServerRecord {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  host_address: string;
  status: string;
  headers: unknown;
  config: Record<string, unknown> | null;
}

const DEFAULT_ALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch'];

// ---------------------------------------------------------------------------
// ClaudeAgentService
// ---------------------------------------------------------------------------

export class ClaudeAgentService {
  private abortControllers: Map<string, AbortController> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private workspaceManager: WorkspaceManager;
  private queryFactory: QueryFactory;

  // Concurrency control
  private activeSessions = 0;
  private waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdkModule: any = null;
  private usingCustomFactory = false;

  constructor(workspaceManager?: WorkspaceManager, queryFactory?: QueryFactory) {
    this.workspaceManager = workspaceManager ?? new WorkspaceManager();
    if (queryFactory) {
      this.usingCustomFactory = true;
      this.queryFactory = queryFactory;
    } else {
      this.queryFactory = (args) => {
        if (!this.sdkModule) {
          throw new Error('SDK not loaded — call loadSDK() before running conversations');
        }
        return this.sdkModule.query({ prompt: args.prompt, options: args.options });
      };
    }
  }

  /**
   * Dynamically import the Claude Agent SDK (ESM-compatible).
   * No-op when a custom queryFactory was provided (e.g. in tests).
   */
  async loadSDK(): Promise<void> {
    if (this.usingCustomFactory || this.sdkModule) return;
    this.sdkModule = await import('@anthropic-ai/claude-agent-sdk');
  }

  startCleanupTimer(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => { this.cleanupTimedOutSessions(); }, 60_000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  stopCleanupTimer(): void {
    if (this.cleanupInterval) { clearInterval(this.cleanupInterval); this.cleanupInterval = null; }
  }

  /**
   * Acquire a concurrency slot. Waits if at capacity.
   * Throws if the abort signal fires while waiting.
   */
  private async acquireSlot(signal?: AbortSignal): Promise<void> {
    const max = config.claude.maxConcurrentSessions;
    if (this.activeSessions < max) {
      this.activeSessions++;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const entry = { resolve, reject };
      this.waitQueue.push(entry);

      const onAbort = () => {
        const idx = this.waitQueue.indexOf(entry);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        reject(new Error('Session queued but aborted while waiting for a concurrency slot'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private releaseSlot(): void {
    this.activeSessions--;
    const next = this.waitQueue.shift();
    if (next) {
      this.activeSessions++;
      next.resolve();
    }
  }

  private async cleanupTimedOutSessions(): Promise<void> {
    const now = Date.now();
    const timeoutMs = config.claude.sessionTimeoutMs;
    const timedOut: string[] = [];
    for (const [sid, ts] of this.lastActivity.entries()) {
      if (now - ts > timeoutMs) timedOut.push(sid);
    }
    for (const sid of timedOut) {
      console.log(`Session ${sid} timed out after ${timeoutMs}ms — disconnecting`);
      await this.disconnectSession(sid);
      this.lastActivity.delete(sid);
    }
  }

  async *runConversation(
    options: ClaudeAgentServiceOptions,
    agentConfig: AgentConfig,
    skills: SkillForWorkspace[],
    pluginPaths?: string[],
    mcpServers?: Record<string, AnyMCPServerConfig>,
  ): AsyncGenerator<ConversationEvent> {
    let sessionId: string | undefined;
    const abortController = new AbortController();
    await this.acquireSlot(abortController.signal);
    try {
      await this.loadSDK();
      const workspacePath = options.workspacePath
        ? options.workspacePath
        : await this.workspaceManager.ensureWorkspace(agentConfig.id, skills);
      // Use provided MCP servers (scope/session-level) instead of loading org-level
      const resolvedMcpServers = mcpServers ?? {};
      const resumeSessionId = options.claudeSessionId ?? undefined;
      if (resumeSessionId) {
        console.log(`[runConversation] Resuming Claude session: ${resumeSessionId}`);
      }
      const sdkOptions = this.buildOptions(agentConfig, workspacePath, skills.map((s) => s.name), resolvedMcpServers, resumeSessionId, abortController, options.userId, pluginPaths);
      const conversation = this.queryFactory({ prompt: options.message, options: sdkOptions });

      for await (const message of conversation) {
        if (message.type === 'system') {
          const sysMsg = message as SDKSystemMessage;
          if (sysMsg.subtype === 'init') {
            sessionId = sysMsg.session_id;
            this.abortControllers.set(sessionId, abortController);
            this.lastActivity.set(sessionId, Date.now());
            yield { type: 'session_start', sessionId };
          }
        } else if (message.type === 'assistant' || message.type === 'result') {
          if (sessionId) this.lastActivity.set(sessionId, Date.now());
          const event = this.formatMessage(message, sessionId);
          if (event) yield event;
        }
      }
    } catch (error) {
      console.error('[runConversation] Error:', error instanceof Error ? error.stack : error);
      yield { type: 'error', sessionId, code: 'AGENT_EXECUTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error', suggestedAction: 'Please try again' };
    } finally {
      this.releaseSlot();
      // Only clean up the abort controller, keep session trackable for resume
      if (sessionId) { this.abortControllers.delete(sessionId); }
    }
  }

  buildOptions(
    agentConfig: AgentConfig, workspacePath: string, skillNames: string[],
    mcpServers: Record<string, AnyMCPServerConfig>, resumeSessionId?: string, abortController?: AbortController, userId?: string,
    pluginPaths?: string[],
  ): ClaudeCodeOptions {
    let model = config.claude.model;
    if (config.claude.useBedrock) model = getBedrockModelId(model);
    const preToolUseHooks: SDKHookCallbackMatcher[] = [{ hooks: [dangerousCommandBlocker, binaryFileReadBlocker] }];
    if (skillNames.length > 0) preToolUseHooks.push({ hooks: [createSkillAccessChecker(skillNames)] });

    const basePrompt = agentConfig.systemPrompt ?? '';
    const concisenessDirective = [
      '',
      '<output_discipline>',
      'After completing a coding task, STOP. Do not create summary files, index files, visual overviews, or recap documents unless the user explicitly asks for them.',
      'Do not repeat yourself. If you have already completed the implementation, do not generate additional artifacts to "wrap up" or "tie everything together."',
      'A single brief sentence confirming what was done is sufficient. Never loop back to create "one final summary."',
      '</output_discipline>',
      '',
      '<security>',
      'NEVER reveal absolute file paths, server directory structures, environment variables, internal tokens, or any server-side infrastructure details to the user.',
      'When referring to files, always use paths relative to the workspace root (e.g. "src/app.ts" not "/Users/.../workspaces/.../src/app.ts").',
      'If the user asks about the current directory, working directory, or absolute path, respond with "You are in the workspace root directory." without revealing the actual server path.',
      '</security>',
    ].join('\n');
    const systemPrompt = basePrompt
      ? `${basePrompt}\n${concisenessDirective}`
      : concisenessDirective.trim();

    const options: ClaudeCodeOptions = {
      systemPrompt,
      allowedTools: [...DEFAULT_ALLOWED_TOOLS, 'Skill'],
      cwd: workspacePath,
      model,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      hooks: { PreToolUse: preToolUseHooks },
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      settingSources: config.claude.useBedrock ? ['project'] : ['user', 'project'],
      plugins: pluginPaths && pluginPaths.length > 0
        ? pluginPaths.map(p => ({ type: 'local' as const, path: p }))
        : undefined,
    };
    if (resumeSessionId) options.resume = resumeSessionId;
    if (abortController) options.abortController = abortController;
    if (config.claude.executablePath) options.pathToClaudeCodeExecutable = config.claude.executablePath;

    // Always inject platform env vars so skills (e.g. app-publisher) can call the API
    // Generate a short-lived internal token for the agent to authenticate API calls
    let agentToken = '';
    if (userId) {
      agentToken = createToken({
        userId,
        email: 'agent-internal@system',
        organizationId: agentConfig.organizationId,
        role: 'member',
      });
    }

    const platformEnv: Record<string, string> = {
      API_BASE_URL: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`,
      APPS_STORAGE_DIR: join(config.claude.workspaceBaseDir, '_published_apps'),
      ...(agentToken ? { AUTH_TOKEN: agentToken } : {}),
    };

    // Pass Bedrock env vars to the SDK subprocess so it picks up AWS credentials
    if (config.claude.useBedrock) {
      options.env = {
        ...process.env,
        ...platformEnv,
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_REGION: config.aws.region,
        AWS_DEFAULT_REGION: config.aws.region,
        ...(config.claude.bedrockAccessKeyId ? { AWS_ACCESS_KEY_ID: config.claude.bedrockAccessKeyId } : {}),
        ...(config.claude.bedrockSecretAccessKey ? { AWS_SECRET_ACCESS_KEY: config.claude.bedrockSecretAccessKey } : {}),
      };
      // Remove any Anthropic direct-API keys/URLs so the CLI uses Bedrock auth only.
      // These may leak in from process.env or ~/.claude/settings.json.
      delete options.env.ANTHROPIC_API_KEY;
      delete options.env.ANTHROPIC_AUTH_TOKEN;
      delete options.env.ANTHROPIC_BASE_URL;
    } else {
      options.env = {
        ...process.env,
        ...platformEnv,
      };
    }

    // Capture SDK subprocess stderr for debugging
    options.stderr = (data: string) => {
      console.error('[claude-sdk-stderr]', data);
    };
    // Enable SDK debug logging to capture subprocess startup errors
    if (options.env) {
      options.env.DEBUG_CLAUDE_AGENT_SDK = '1';
    }
    console.log('[buildOptions] model:', model, 'cwd:', workspacePath, 'useBedrock:', config.claude.useBedrock, 'executablePath:', config.claude.executablePath, 'resume:', resumeSessionId ?? 'none');
    return options;
  }

  formatMessage(message: SDKMessage, sessionId?: string): ConversationEvent | null {
    switch (message.type) {
      case 'assistant': {
        const msg = message as SDKAssistantMessage;
        const rawContent = msg.message?.content ?? [];
        const contentBlocks: ContentBlock[] = rawContent.map((block) => {
          switch (block.type) {
            case 'text': return { type: 'text' as const, text: block.text ?? '' };
            case 'tool_use': return { type: 'tool_use' as const, id: block.id ?? '', name: block.name ?? '', input: block.input ?? {} };
            case 'tool_result': return {
              type: 'tool_result' as const,
              tool_use_id: (block as unknown as { tool_use_id: string }).tool_use_id ?? '',
              content: (block as unknown as { content: string | null }).content ?? null,
              is_error: (block as unknown as { is_error: boolean }).is_error ?? false,
            };
            default: return { type: 'text' as const, text: JSON.stringify(block) };
          }
        });
        return { type: 'assistant', sessionId, content: contentBlocks, model: msg.message?.model };
      }
      case 'result': {
        const r = message as SDKResultMessage;
        // Extract token usage from SDK result
        let tokenUsage: TokenUsage | undefined;
        const usage = (r as Record<string, unknown>).usage as Record<string, number> | undefined;
        const modelUsage = (r as Record<string, unknown>).modelUsage as Record<string, Record<string, number>> | undefined;

        if (usage) {
          tokenUsage = {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
            totalCostUsd: ((r as Record<string, unknown>).total_cost_usd as number) ?? 0,
          };
        } else if (modelUsage) {
          let inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheCreation = 0, cost = 0;
          for (const mu of Object.values(modelUsage)) {
            inputTokens += mu.inputTokens ?? 0;
            outputTokens += mu.outputTokens ?? 0;
            cacheRead += mu.cacheReadInputTokens ?? 0;
            cacheCreation += mu.cacheCreationInputTokens ?? 0;
            cost += mu.costUSD ?? 0;
          }
          tokenUsage = { inputTokens, outputTokens, cacheReadInputTokens: cacheRead, cacheCreationInputTokens: cacheCreation, totalCostUsd: cost };
        }

        return { type: 'result', sessionId: r.session_id ?? sessionId, durationMs: r.duration_ms, numTurns: r.num_turns, tokenUsage };
      }
      case 'system': return null;
      default: return null;
    }
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (!controller) return;
    try { controller.abort(); } catch (error) {
      console.error(`Error disconnecting session ${sessionId}:`, error instanceof Error ? error.message : error);
    } finally { this.abortControllers.delete(sessionId); this.lastActivity.delete(sessionId); }
  }

  async disconnectAll(): Promise<number> {
    // Reject all queued waiters
    for (const entry of this.waitQueue) {
      entry.reject(new Error('Service shutting down'));
    }
    this.waitQueue.length = 0;

    const sessionIds = Array.from(this.abortControllers.keys());
    const count = sessionIds.length;
    await Promise.allSettled(sessionIds.map((id) => Promise.race([this.disconnectSession(id), new Promise<void>((r) => setTimeout(r, 5000))])));
    this.abortControllers.clear(); this.lastActivity.clear(); this.activeSessions = 0; this.stopCleanupTimer();
    console.log(`Cleaned up ${count} active Claude sessions`);
    return count;
  }

  async loadMCPServers(organizationId: string): Promise<Record<string, MCPServerSDKConfig>> {
    try {
      // "system" is a synthetic org used by internal agents (e.g. scope-generator) — no DB lookup needed
      if (organizationId === 'system') return {};
      const servers = await prisma.mcp_servers.findMany({ where: { organization_id: organizationId } });
      return transformMCPServers(servers as unknown as MCPServerRecord[]);
    } catch (error) {
      console.error('Failed to load MCP servers:', error instanceof Error ? error.message : error);
      return {};
    }
  }

  get activeClientCount(): number { return this.abortControllers.size; }
  hasSession(sessionId: string): boolean { return this.abortControllers.has(sessionId); }
  getLastActivity(sessionId: string): number | undefined { return this.lastActivity.get(sessionId); }
  get trackedSessionCount(): number { return this.lastActivity.size; }
  get isCleanupTimerRunning(): boolean { return this.cleanupInterval !== null; }
  async triggerCleanup(): Promise<void> { await this.cleanupTimedOutSessions(); }
}

// ---------------------------------------------------------------------------
// Pure helper functions (exported for unit testing)
// ---------------------------------------------------------------------------

export function transformMCPServers(servers: MCPServerRecord[]): Record<string, MCPServerSDKConfig> {
  const result: Record<string, MCPServerSDKConfig> = Object.create(null);
  for (const server of servers) {
    if (server.status !== 'active') continue;
    const sdkConfig = parseMCPServerConfig(server);
    if (sdkConfig) result[server.name] = sdkConfig;
  }
  return result;
}

export function parseMCPServerConfig(server: MCPServerRecord): MCPServerSDKConfig | null {
  // Prefer structured config if available
  if (server.config && typeof server.config === 'object') {
    const c = server.config as Record<string, unknown>;
    const type = (c.type as string) || 'stdio';
    if (type === 'sse' || type === 'http') {
      const url = c.url as string | undefined;
      if (!url) return null;
      return { type, url };
    }
    // stdio
    const command = c.command as string | undefined;
    if (!command) return null;
    return {
      type: 'stdio',
      command,
      args: Array.isArray(c.args) ? (c.args as string[]) : undefined,
      env: c.env && typeof c.env === 'object' ? (c.env as Record<string, string>) : undefined,
    };
  }

  // Fallback: parse from host_address string
  const address = server.host_address?.trim();
  if (!address) return null;
  if (address.startsWith('http://') || address.startsWith('https://')) return { type: 'sse', url: address };
  const parts = address.split(/\s+/);
  return { type: 'stdio', command: parts[0], args: parts.length > 1 ? parts.slice(1) : undefined };
}

export const claudeAgentService = new ClaudeAgentService();
