/**
 * Chat Service
 * Business logic layer for Chat management with SSE streaming support.
 * Supports both legacy agent-based flow and new business-scope-based sessions.
 * Requirements: 2.1, 2.6, 2.7, 3.2, 3.4, 3.5, 11.1, 11.2, 11.3, 11.4
 */

import { FastifyReply } from 'fastify';
import {
  chatSessionRepository,
  chatMessageRepository,
  type ChatSessionEntity,
  type ChatMessageEntity,
} from '../repositories/chat.repository.js';
import { agentRepository } from '../repositories/agent.repository.js';
import {
  businessScopeRepository,
  type BusinessScopeEntity,
} from '../repositories/businessScope.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import type { CreateChatSessionInput, UpdateChatSessionInput } from '../schemas/chat.schema.js';
import { formatSSEEvent, type SSEEvent } from '../utils/sse.js';
import {
  type ConversationEvent,
  type AgentConfig,
  type ContentBlock,
} from './claude-agent.service.js';
import type { AgentRuntime } from './agent-runtime.js';
import { agentRuntime as defaultAgentRuntime } from './agent-runtime-factory.js';
import {
  workspaceManager as defaultWorkspaceManager,
  type WorkspaceManager,
  type SkillForWorkspace,
  type ScopeForWorkspace,
  type McpServerForWorkspace,
  type PluginForWorkspace,
  type DocGroupForWorkspace,
} from './workspace-manager.js';
import {
  businessScopeService as defaultBusinessScopeService,
  type BusinessScopeService,
} from './businessScope.service.js';
import { skillService as defaultSkillService, type SkillService } from './skill.service.js';
import { agentStatusService } from './agent-status.service.js';
import { streamRegistry } from './stream-registry.js';
import { config } from '../config/index.js';
import {
  startConversationTrace,
  recordEvent,
  endConversationTrace,
  flushLangfuse,
} from './langfuse.service.js';
import { processConversationEvent, flushActiveSubAgents, type ConversationHookContext } from './conversation-hooks.js';
import { sanitizeEvent } from './output-sanitizer.js';
import { distillationService } from './distillation.service.js';

export type { SSEEvent };
export { formatSSEEvent };

/** Chat stream options — now supports business_scope_id as primary entry point. */
export interface ChatStreamOptions {
  agentId?: string;
  businessScopeId?: string;
  mentionAgentId?: string;
  sessionId?: string;
  message: string;
  /** Per-request model override (from chat UI model selector). */
  model?: string;
  context?: Record<string, unknown>;
}

export interface ChatHistoryOptions {
  sessionId: string;
  limit?: number;
  before?: string;
}

export class ChatService {
  private agentRuntime: AgentRuntime;
  private skillService: SkillService;
  private workspaceManager: WorkspaceManager;
  private businessScopeService: BusinessScopeService;

  constructor(
    runtime?: AgentRuntime,
    skillSvc?: SkillService,
    wsMgr?: WorkspaceManager,
    bsSvc?: BusinessScopeService,
  ) {
    this.agentRuntime = runtime ?? defaultAgentRuntime;
    this.skillService = skillSvc ?? defaultSkillService;
    this.workspaceManager = wsMgr ?? defaultWorkspaceManager;
    this.businessScopeService = bsSvc ?? defaultBusinessScopeService;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  async getSessions(organizationId: string, userId: string): Promise<ChatSessionEntity[]> {
    return chatSessionRepository.findByUser(organizationId, userId);
  }

  /**
   * Get all sessions across the organization (admin view).
   */
  async getAllSessions(organizationId: string): Promise<ChatSessionEntity[]> {
    return chatSessionRepository.findAll(organizationId, {
      orderBy: { created_at: 'desc' },
    });
  }

  async getSessionsByScope(
    organizationId: string,
    businessScopeId: string,
    userId?: string,
  ): Promise<ChatSessionEntity[]> {
    return chatSessionRepository.findByBusinessScope(organizationId, businessScopeId, userId);
  }

  async getSessionById(sessionId: string, organizationId: string): Promise<ChatSessionEntity> {
    const session = await chatSessionRepository.findById(sessionId, organizationId);
    if (!session) throw AppError.notFound(`Chat session with ID ${sessionId} not found`);
    return session;
  }

  async createSession(
    data: CreateChatSessionInput,
    organizationId: string,
    userId: string,
  ): Promise<ChatSessionEntity> {
    // Validate business_scope_id belongs to this organization (prevents FK errors)
    if (data.business_scope_id) {
      const scope = await businessScopeRepository.findById(data.business_scope_id, organizationId);
      if (!scope) {
        throw AppError.notFound(`Business scope with ID ${data.business_scope_id} not found`);
      }
    }

    return chatSessionRepository.createForUser(
      {
        business_scope_id: data.business_scope_id ?? null,
        agent_id: data.agent_id ?? null,
        claude_session_id: null,
        title: null,
        status: 'idle',
        sop_context: data.sop_context ?? null,
        context: data.context ?? {},
      },
      organizationId,
      userId,
    );
  }

  async updateSession(
    sessionId: string,
    data: UpdateChatSessionInput,
    organizationId: string,
  ): Promise<ChatSessionEntity> {
    const existing = await chatSessionRepository.findById(sessionId, organizationId);
    if (!existing) throw AppError.notFound(`Chat session with ID ${sessionId} not found`);

    const updateData: Partial<ChatSessionEntity> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.sop_context !== undefined) updateData.sop_context = data.sop_context;
    if (data.context !== undefined) updateData.context = data.context;

    const updated = await chatSessionRepository.update(sessionId, organizationId, updateData);
    if (!updated) throw AppError.notFound(`Chat session with ID ${sessionId} not found`);
    return updated;
  }

  async deleteSession(sessionId: string, organizationId: string): Promise<boolean> {
    await chatMessageRepository.deleteBySession(organizationId, sessionId);
    const deleted = await chatSessionRepository.delete(sessionId, organizationId);
    if (!deleted) throw AppError.notFound(`Chat session with ID ${sessionId} not found`);
    return true;
  }

  /**
   * Clear all messages for a session but keep the session itself intact.
   */
  async clearSessionMessages(sessionId: string, organizationId: string): Promise<void> {
    const session = await chatSessionRepository.findById(sessionId, organizationId);
    if (!session) throw AppError.notFound(`Chat session with ID ${sessionId} not found`);
    await chatMessageRepository.deleteBySession(organizationId, sessionId);
  }

  // ==========================================================================
  // Message Management
  // ==========================================================================

  async getChatHistory(organizationId: string, options: ChatHistoryOptions): Promise<ChatMessageEntity[]> {
    const session = await chatSessionRepository.findById(options.sessionId, organizationId);
    if (!session) throw AppError.notFound(`Chat session with ID ${options.sessionId} not found`);

    const beforeDate = options.before ? new Date(options.before) : undefined;
    const messages = await chatMessageRepository.findBySession(organizationId, options.sessionId, {
      limit: options.limit ?? 50,
      before: beforeDate,
    });
    return messages.reverse();
  }

  async addMessage(
    organizationId: string,
    sessionId: string,
    type: 'user' | 'ai' | 'agent' | 'system',
    content: string,
    options?: { agentId?: string; mentionAgentId?: string; metadata?: Record<string, unknown> },
  ): Promise<ChatMessageEntity> {
    const session = await chatSessionRepository.findById(sessionId, organizationId);
    if (!session) throw AppError.notFound(`Chat session with ID ${sessionId} not found`);
    return chatMessageRepository.create({
      session_id: sessionId,
      type,
      content,
      agent_id: options?.agentId ?? null,
      mention_agent_id: options?.mentionAgentId ?? null,
      metadata: options?.metadata ?? {},
    }, organizationId);
  }

  // ==========================================================================
  // Non-SSE Message Processing (for IM integrations)
  // ==========================================================================

  /**
   * Process a message and return the full response (non-streaming).
   * Used by IM integrations (Slack, Discord, etc.) where SSE is not applicable.
   * Reuses the same workspace provisioning and Claude invocation as streamChat.
   */
  async processMessage(options: {
    sessionId?: string;
    businessScopeId: string;
    message: string;
    organizationId: string;
    userId: string;
    /** Override the agent's system prompt (used by Project module to inject dev-focused instructions) */
    systemPromptOverride?: string;
  }): Promise<{ text: string; sessionId: string; contentBlocks: ContentBlock[] }> {
    const result = await this.prepareScopeSession(
      options.organizationId,
      options.userId,
      {
        businessScopeId: options.businessScopeId,
        sessionId: options.sessionId,
        message: options.message,
      },
    );

    const { sessionId, agentConfig, skills, claudeSessionId, workspacePath, pluginPaths, mcpServers } = result;

    // Apply system prompt override if provided (e.g., for Project module)
    if (options.systemPromptOverride) {
      agentConfig.systemPrompt = options.systemPromptOverride;
    }

    // Persist user message
    await this.addMessage(options.organizationId, sessionId, 'user', options.message);

    // Mark session as generating
    await chatSessionRepository.updateStatus(sessionId, options.organizationId, 'generating');
    await agentStatusService.setBusy(agentConfig.id, options.organizationId);

    const allContentBlocks: ContentBlock[] = [];

    try {
      const conversationGenerator = this.agentRuntime.runConversation(
        {
          agentId: agentConfig.id,
          sessionId: options.sessionId,
          providerSessionId: claudeSessionId,
          message: options.message,
          organizationId: options.organizationId,
          userId: options.userId,
          workspacePath,
          scopeId: options.businessScopeId,
        },
        agentConfig,
        skills,
        pluginPaths.length > 0 ? pluginPaths : undefined,
        Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      );

      const timeoutMs = config.claude.responseTimeoutMs;
      let timedOut = false;

      await this.iterateWithTimeout(
        conversationGenerator,
        timeoutMs,
        (event: ConversationEvent) => {
          if (event.type === 'session_start' && event.sessionId) {
            chatSessionRepository.updateClaudeSessionId(sessionId, options.organizationId, event.sessionId).catch(() => {});
          }
          if (event.type === 'assistant' && event.content) {
            allContentBlocks.push(...event.content);
          }
        },
        () => { timedOut = true; },
      );

      if (timedOut) {
        throw new Error('Agent response timed out');
      }
    } finally {
      await agentStatusService.setActive(agentConfig.id, options.organizationId);
      await chatSessionRepository.updateStatus(sessionId, options.organizationId, 'idle').catch(() => {});

      if (allContentBlocks.length > 0) {
        await this.addMessage(options.organizationId, sessionId, 'ai', JSON.stringify(allContentBlocks)).catch((err) => {
          console.error('[ChatService] Failed to save AI reply:', err instanceof Error ? err.message : err);
        });
      }

      this.maybeSetTitle(options.organizationId, sessionId, options.message).catch(() => {});

      // Auto-distill memories (same as streamChat)
      if (allContentBlocks.length > 0 && options.businessScopeId) {
        distillationService.enqueue({
          organizationId: options.organizationId,
          scopeId: options.businessScopeId,
          sessionId,
          agentId: agentConfig.id,
          contentBlocks: allContentBlocks,
          userMessage: options.message,
        }).catch(() => {});
      }
    }

    // Extract text from content blocks
    const text = allContentBlocks
      .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return { text: text || '(No response)', sessionId, contentBlocks: allContentBlocks };
  }

  // ==========================================================================
  // Streaming
  // ==========================================================================

  /**
   * Public wrapper for prepareScopeSession — used by group chat routes
   * that need to run the conversation generator directly (for SSE streaming).
   */
  async prepareScopeSessionPublic(
    organizationId: string,
    userId: string,
    options: ChatStreamOptions,
  ) {
    return this.prepareScopeSession(organizationId, userId, options);
  }

  /**
   * Provision a workspace for an existing session ahead of the first message.
   * This allows the frontend to eagerly create a session + workspace when the
   * user selects a business scope, so the workspace is ready by the time the
   * user sends their first message.
   *
   * This is a no-op if the session already has a provisioned workspace.
   */
  async provisionSessionWorkspace(
    sessionId: string,
    organizationId: string,
  ): Promise<void> {
    const session = await this.getSessionById(sessionId, organizationId);
    const scopeId = session.business_scope_id;
    if (!scopeId) {
      console.log(`[provisionSessionWorkspace] Session ${sessionId} has no business_scope_id, skipping`);
      return;
    }

    const selectedAgentId = session.agent_id ?? null;
    console.log(`[provisionSessionWorkspace] Building scope workspace data for scope=${scopeId}, agent=${selectedAgentId}`);

    // Build the ScopeForWorkspace data (same logic as prepareScopeSession)
    const scopeForWorkspace = await this.buildScopeForWorkspace(
      scopeId, organizationId, selectedAgentId,
    );

    console.log(`[provisionSessionWorkspace] Provisioning workspace for session=${sessionId}, scope=${scopeId}, skills=${scopeForWorkspace.skills.length}, agents=${scopeForWorkspace.agents.length}`);

    // Provision workspace (idempotent — ensureWorkspaceUpToDate handles existing ones)
    const result = await this.workspaceManager.ensureSessionWorkspace(
      organizationId, sessionId, scopeForWorkspace, selectedAgentId,
    );

    console.log(`[provisionSessionWorkspace] Workspace provisioned at ${result.workspacePath}, plugins=${result.pluginPaths.length}`);
  }

  /**
   * Build the ScopeForWorkspace data structure needed by workspace-manager.
   * Extracted from prepareScopeSession so it can be reused by provisionSessionWorkspace.
   */
  private async buildScopeForWorkspace(
    scopeId: string,
    organizationId: string,
    selectedAgentId: string | null,
  ): Promise<ScopeForWorkspace> {
    const scope = await businessScopeRepository.findById(scopeId, organizationId) as BusinessScopeEntity | null;
    if (!scope) throw AppError.notFound(`Business scope with ID ${scopeId} not found`);

    // Run independent DB queries in parallel
    const { skillService: scopeSkillService } = await import('./skill.service.js');
    const { documentGroupRepository: docGroupRepo } = await import('../repositories/document-group.repository.js');

    const [agentsWithSkills, scopeLevelSkills, scopeMcpServers, scopePlugins, rawDocGroups] = await Promise.all([
      this.businessScopeService.getScopeAgentsWithSkills(scopeId, organizationId),
      scopeSkillService.getScopeLevelSkills(organizationId, scopeId),
      this.loadScopeMcpServers(scopeId),
      this.loadScopePlugins(scopeId),
      docGroupRepo.getGroupsForScope(scopeId),
    ]);

    // Build skills list
    const skillMap = new Map<string, SkillForWorkspace>();
    const agentsToCollectSkillsFrom = selectedAgentId
      ? agentsWithSkills.filter(a => a.id === selectedAgentId)
      : agentsWithSkills;

    for (const agent of agentsToCollectSkillsFrom) {
      for (const skill of agent.skills) {
        if (!skillMap.has(skill.id)) {
          skillMap.set(skill.id, {
            id: skill.id,
            name: skill.name,
            hashId: skill.hash_id,
            s3Bucket: skill.s3_bucket,
            s3Prefix: skill.s3_prefix,
            localPath: skill.metadata?.localPath as string | undefined,
            description: skill.description ?? (skill.metadata?.description as string | undefined),
            body: skill.metadata?.body as string | undefined,
          });
        }
      }
    }

    // Scope-level skills
    for (const skill of scopeLevelSkills) {
      if (!skillMap.has(skill.id)) {
        const meta = skill.metadata as Record<string, unknown> | null;
        skillMap.set(skill.id, {
          id: skill.id,
          name: skill.name,
          hashId: skill.hash_id,
          s3Bucket: skill.s3_bucket,
          s3Prefix: skill.s3_prefix,
          localPath: meta?.localPath as string | undefined,
          description: meta?.description as string | undefined,
          body: meta?.body as string | undefined,
        });
      }
    }
    const skills = Array.from(skillMap.values());

    const docGroups = rawDocGroups.map(g => ({
      id: g.id,
      name: g.name,
      storagePath: g.storage_path,
      fileCount: g.files?.length ?? 0,
    }));

    return {
      id: scope.id,
      name: scope.name,
      description: scope.description,
      systemPrompt: scope.system_prompt ?? null,
      settings: (scope as any).settings as Record<string, unknown> | null ?? null,
      configVersion: scope.config_version,
      agents: agentsWithSkills.map(a => {
        const mc = a.model_config as Record<string, unknown> | null;
        const generatedFromConfig = Array.isArray(mc?.generatedSkills)
          ? (mc!.generatedSkills as Array<{ name: string; description: string; body: string }>)
          : [];

        const toolsArray = Array.isArray(a.tools) ? a.tools as Array<{ id?: string; name: string; skillMd?: string }> : [];
        const generatedFromTools = toolsArray
          .filter(t => t.name && t.skillMd)
          .map(t => ({
            name: t.name,
            description: t.skillMd!.split('\n').find(line => line.trim() && !line.startsWith('#'))?.trim() || t.name,
            body: t.skillMd!,
          }));

        const seenNames = new Set(generatedFromConfig.map(s => s.name));
        const allGenerated = [
          ...generatedFromConfig,
          ...generatedFromTools.filter(s => !seenNames.has(s.name)),
        ];

        const includeGeneratedSkills = !selectedAgentId || a.id === selectedAgentId;

        return {
          id: a.id,
          name: a.name,
          displayName: a.display_name,
          role: a.role,
          systemPrompt: a.system_prompt,
          skillNames: a.skills.map(s => s.name),
          avatar: a.avatar ?? null,
          generatedSkills: includeGeneratedSkills && allGenerated.length > 0 ? allGenerated : undefined,
        };
      }),
      skills,
      mcpServers: scopeMcpServers,
      plugins: scopePlugins,
      documentGroups: docGroups,
    };
  }

  /**
   * Stream a chat response using SSE.
   * Supports two flows:
   *   1. Business-scope-based (new): uses per-session workspace with CLAUDE.md, subagents, skills
   *   2. Legacy agent-based: uses per-agent workspace (backward compat)
   */
  async streamChat(
    reply: FastifyReply,
    organizationId: string,
    userId: string,
    options: ChatStreamOptions,
    skillsOverride?: SkillForWorkspace[],
    systemPromptOverride?: string,
  ): Promise<void> {
    // Determine which flow to use
    const useScopeFlow = !!options.businessScopeId;

    let sessionId = options.sessionId;
    let agentConfig: AgentConfig;
    let skills: SkillForWorkspace[];
    let claudeSessionId: string | undefined;
    let workspacePath: string | undefined;
    let subAgentNames: string[] = [];
    let subAgentNameToId: Map<string, string> = new Map();
    let subAgentInfoMap: Map<string, { displayName: string; avatar: string | null }> = new Map();
    let pluginPaths: string[] = [];
    let mcpServers: Record<string, import('./claude-agent.service.js').MCPServerSDKConfig> = {};

    if (useScopeFlow) {
      // ---- Business Scope Flow ----
      const result = await this.prepareScopeSession(
        organizationId, userId, options,
      );
      sessionId = result.sessionId;
      agentConfig = result.agentConfig;
      skills = result.skills;
      claudeSessionId = result.claudeSessionId;
      workspacePath = result.workspacePath;
      subAgentNames = result.subAgentNames;
      subAgentNameToId = result.subAgentNameToId;
      subAgentInfoMap = result.subAgentInfoMap;
      pluginPaths = result.pluginPaths;
      mcpServers = result.mcpServers;
    } else {
      // ---- Legacy Agent Flow ----
      if (!options.agentId) {
        throw AppError.validation('Either agent_id or business_scope_id is required');
      }
      const result = await this.prepareLegacySession(
        organizationId, userId, options, skillsOverride,
      );
      sessionId = result.sessionId;
      agentConfig = result.agentConfig;
      skills = result.skills;
      claudeSessionId = result.claudeSessionId;
      workspacePath = result.workspacePath;
    }

    // Apply system prompt override if provided (e.g., single-skill workshop testing)
    if (systemPromptOverride) {
      agentConfig.systemPrompt = systemPromptOverride;
    }

    // Apply per-request model override from chat UI (takes priority over scope default)
    console.log(`[chat] options.model=${options.model}, agentConfig.model=${agentConfig.model}, claudeSessionId=${claudeSessionId}`);
    if (options.model) {
      // Only reset Claude Code session if the model actually changed.
      // SDK locks model per session, so switching requires a fresh session
      // that falls back to history injection for context continuity.
      const currentModel = agentConfig.model;
      agentConfig.model = options.model;
      if (options.model !== currentModel && claudeSessionId) {
        console.log(`[chat] Model changed from ${currentModel} to ${options.model}, resetting Claude session`);
        claudeSessionId = undefined;
        if (sessionId) {
          chatSessionRepository.updateClaudeSessionId(sessionId, organizationId, null).catch(() => {});
        }
      }
    }
    console.log(`[chat] Final model=${agentConfig.model}, claudeSessionId=${claudeSessionId}`);

    // Persist user message + mark session as generating + agent as busy (in parallel)
    const resolvedAgentId = agentConfig.id;
    await Promise.all([
      this.addMessage(organizationId, sessionId, 'user', options.message, {
        mentionAgentId: options.mentionAgentId,
      }),
      chatSessionRepository.updateStatus(sessionId, organizationId, 'generating'),
      agentStatusService.setBusy(resolvedAgentId, organizationId),
    ]);

    // Start Langfuse trace for this chat turn
    const langfuseTrace = startConversationTrace({
      sessionId,
      userId,
      organizationId,
      userMessage: options.message,
      agentConfig,
      model: config.claude.model,
    });

    // Build conversation hook context for metrics tracking
    const hookCtx: ConversationHookContext = {
      organizationId,
      sessionId,
      agentId: agentConfig.id,
      userId,
      source: 'chat',
      subAgentNames: new Set(subAgentNames),
      subAgentNameToId,
      activeSubAgentCalls: new Map(),
      subAgentStartTimes: new Map(),
    };

    // Register in stream registry so other clients can reconnect
    streamRegistry.register(sessionId);

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    });

    reply.raw.write(formatSSEEvent({ event: 'session', data: JSON.stringify({ session_id: sessionId }) }));

    let clientDisconnected = false;
    let conversationSessionId: string | undefined;

    const onClose = () => {
      clientDisconnected = true;
      // Do NOT abort the agent — let it continue running server-side.
      // Reconnecting clients can pick up from the stream registry.
      console.log(`Client disconnected for session ${sessionId} — agent continues running`);
    };
    reply.raw.on('close', onClose);

    const heartbeatInterval = setInterval(() => {
      if (!clientDisconnected) {
        try {
          reply.raw.write(formatSSEEvent({ data: JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }) }));
        } catch { /* client disconnected */ }
      }
    }, 15_000);

    const allContentBlocks: ContentBlock[] = [];
    let lastModelId: string | undefined;

    // Listen for external events pushed to the registry by other routes (e.g. preview_ready)
    const registrySub = streamRegistry.subscribe(sessionId);
    const onExternalEvent = (event: ConversationEvent) => {
      if (clientDisconnected) return;
      // Only forward event types that don't come from the conversation generator
      if (event.type === 'preview_ready') {
        try {
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({ type: event.type, appId: event.appId, url: event.url, appName: event.appName }),
          }));
        } catch { /* client gone */ }
      }
    };
    if (registrySub) {
      registrySub.emitter.on('event', onExternalEvent);
    }

    // Track active sub-agent for speaker identity annotation.
    // When a Task tool_use is seen, record the sub-agent info keyed by tool_use_id.
    // When the matching tool_result arrives, clear the current speaker.
    const activeSubAgentByToolId = new Map<string, { displayName: string; avatar: string | null }>();
    let currentSpeaker: { displayName: string; avatar: string | null } | null = null;

    // Build the effective message — inject a routing hint when a specific agent is @mentioned
    let effectiveMessage = options.message;
    if (options.mentionAgentId && useScopeFlow) {
      // Resolve mentionAgentId to the agent's technical name for Task tool routing
      const mentionedName = [...subAgentNameToId.entries()].find(([, id]) => id === options.mentionAgentId)?.[0];
      if (mentionedName) {
        const mentionedInfo = subAgentInfoMap.get(mentionedName);
        const displayLabel = mentionedInfo?.displayName ?? mentionedName;
        effectiveMessage = `[System routing: The user has @mentioned agent "${displayLabel}" (name: \`${mentionedName}\`). You MUST delegate this request to the \`${mentionedName}\` subagent using the Task tool. Do NOT answer directly — always delegate.]\n\n${options.message}`;
      }
    }

    try {
      // Use the configured agent runtime (claude or openclaw).
      // AgentCore container isolation is handled by the runtime provider itself
      // when AGENT_RUNTIME=openclaw (which runs on AgentCore).
      const conversationGenerator = this.agentRuntime.runConversation(
            {
              agentId: agentConfig.id,
              sessionId: options.sessionId,
              providerSessionId: claudeSessionId,
              message: effectiveMessage,
              organizationId,
              userId,
              workspacePath,
              scopeId: options.businessScopeId,
            },
            agentConfig,
            skills,
            pluginPaths.length > 0 ? pluginPaths : undefined,
            Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
          );

      const timeoutMs = config.claude.responseTimeoutMs;

      await this.iterateWithTimeout(
        conversationGenerator,
        timeoutMs,
        (event: ConversationEvent) => {
          if (event.type === 'session_start' && event.sessionId) {
            conversationSessionId = event.sessionId;
            // Store the Claude SDK session ID for future resume
            if (sessionId) {
              chatSessionRepository.updateClaudeSessionId(sessionId, organizationId, event.sessionId).catch((err) => {
                console.error('Failed to store claude_session_id:', err);
              });
            }
          }

          if (event.type === 'assistant' && event.content) {
            allContentBlocks.push(...event.content);
            if (event.model) lastModelId = event.model;

            // Detect sub-agent speaker changes from content blocks
            for (const block of event.content) {
              if (block.type === 'tool_use' && block.name === 'Task') {
                const input = block.input as Record<string, unknown>;
                const subAgentName = (input.subagent_type ?? input.agent) as string | undefined;
                if (typeof subAgentName === 'string') {
                  const info = subAgentInfoMap.get(subAgentName);
                  if (info) {
                    activeSubAgentByToolId.set(block.id, info);
                    currentSpeaker = info;
                  }
                }
              } else if (block.type === 'tool_result') {
                if (activeSubAgentByToolId.has(block.tool_use_id)) {
                  activeSubAgentByToolId.delete(block.tool_use_id);
                  if (activeSubAgentByToolId.size === 0) currentSpeaker = null;
                }
              }
            }

            // Annotate event with current speaker if a sub-agent is active
            if (currentSpeaker) {
              event.speakerAgentName = currentSpeaker.displayName;
              event.speakerAgentAvatar = currentSpeaker.avatar;
            }
          }

          // Record event in Langfuse trace
          recordEvent(langfuseTrace, event);

          // Inject tracked model into result event so the frontend can display it
          if (event.type === 'result' && lastModelId && !event.model) {
            event.model = lastModelId;
          }

          // Process through conversation hooks (metrics, sub-agent detection)
          processConversationEvent(hookCtx, event);

          // Push to stream registry for reconnecting clients
          streamRegistry.push(sessionId, event);

          // Only write to SSE if client is still connected
          if (!clientDisconnected) {
            this.writeConversationEventSSE(reply, event);
          }
        },
        () => {
          if (!clientDisconnected) {
            const timeoutEvent: ConversationEvent = {
              type: 'error', sessionId: conversationSessionId,
              code: 'AGENT_TIMEOUT', message: 'Agent response timed out', suggestedAction: 'Please try again',
            };
            this.writeConversationEventSSE(reply, timeoutEvent);
          }
          if (conversationSessionId) {
            this.agentRuntime.disconnectSession(conversationSessionId).catch((err) => {
              console.error('Error disconnecting session on timeout:', err);
            });
          }
        },
      );
    } catch (error) {
      if (!clientDisconnected) {
        const errorEvent: ConversationEvent = {
          type: 'error', sessionId: conversationSessionId,
          code: 'AGENT_EXECUTION_ERROR', message: error instanceof Error ? error.message : 'Unknown error',
          suggestedAction: 'Please try again',
        };
        streamRegistry.push(sessionId, errorEvent);
        this.writeConversationEventSSE(reply, errorEvent);
      }
    } finally {
      clearInterval(heartbeatInterval);
      reply.raw.removeListener('close', onClose);
      if (registrySub) {
        registrySub.emitter.removeListener('event', onExternalEvent);
      }

      // Flush any sub-agents still tracked as busy (handles interrupted sessions)
      flushActiveSubAgents(hookCtx);

      // Send [DONE] immediately so the frontend can stop the loading indicator.
      // All remaining cleanup (DB writes, traces) happens after.
      streamRegistry.complete(sessionId);
      if (!clientDisconnected) {
        try {
          reply.raw.write(formatSSEEvent({ data: '[DONE]' }));
          reply.raw.end();
        } catch { /* client disconnected */ }
      }

      // --- Non-blocking cleanup below (client already received [DONE]) ---

      // Mark agent as active + session as idle + persist AI response (in parallel)
      await Promise.all([
        agentStatusService.setActive(resolvedAgentId, organizationId),
        chatSessionRepository.updateStatus(sessionId, organizationId, 'idle').catch((err) => {
          console.error('Failed to set session status to idle:', err);
        }),
        allContentBlocks.length > 0
          ? this.addMessage(organizationId, sessionId, 'ai', JSON.stringify(allContentBlocks)).catch((err) => {
              console.error('Failed to persist assistant response:', err);
            })
          : Promise.resolve(),
      ]);

      // Finalize Langfuse trace
      endConversationTrace(langfuseTrace, allContentBlocks);
      flushLangfuse().catch((err) => console.error('Langfuse flush error:', err));

      // Auto-generate title from first user message if not set
      if (useScopeFlow && sessionId) {
        this.maybeSetTitle(organizationId, sessionId, options.message).catch(() => {});
      }

      // Auto-distill memories from the conversation (fire-and-forget)
      if (useScopeFlow && allContentBlocks.length > 0 && options.businessScopeId) {
        console.log(`[distillation-debug] Enqueuing: scope=${options.businessScopeId}, session=${sessionId}, blocks=${allContentBlocks.length}`);
        distillationService.enqueue({
          organizationId,
          scopeId: options.businessScopeId,
          sessionId,
          agentId: resolvedAgentId,
          contentBlocks: allContentBlocks,
          userMessage: options.message,
        }).catch(() => {});
      }
    }
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Prepare a business-scope-based session: load scope data, provision/refresh workspace.
   */
  private async prepareScopeSession(
    organizationId: string,
    userId: string,
    options: ChatStreamOptions,
  ): Promise<{ sessionId: string; workspacePath: string; agentConfig: AgentConfig; skills: SkillForWorkspace[]; claudeSessionId?: string; subAgentNames: string[]; subAgentNameToId: Map<string, string>; subAgentInfoMap: Map<string, { displayName: string; avatar: string | null }>; pluginPaths: string[]; mcpServers: Record<string, import('./claude-agent.service.js').MCPServerSDKConfig> }> {
    const scopeId = options.businessScopeId!;
    // mentionAgentId is NOT used as selectedAgentId — it should not change the orchestrator identity.
    // Instead, it's handled by injecting a routing hint into the message so the orchestrator
    // delegates to the mentioned agent via the Task tool.
    const selectedAgentId = options.agentId ?? null;

    // Build scope data for workspace manager and load agents in parallel.
    // buildScopeForWorkspace already queries scope + agentsWithSkills internally,
    // so we reuse its result instead of querying agentsWithSkills separately.
    const scopeForWorkspace = await this.buildScopeForWorkspace(scopeId, organizationId, selectedAgentId);

    // Derive agentsWithSkills from scopeForWorkspace to avoid a duplicate DB query
    const agentsWithSkills = scopeForWorkspace.agents;

    // Get or create session
    let sessionId = options.sessionId;
    let session: ChatSessionEntity;
    let pluginPaths: string[] = [];

    if (!sessionId) {
      session = await this.createSession(
        { business_scope_id: scopeId, agent_id: selectedAgentId, context: options.context ?? {} },
        organizationId,
        userId,
      );
      sessionId = session.id;

      // Provision new workspace
      const provisionResult = await this.workspaceManager.ensureSessionWorkspace(
        organizationId, sessionId, scopeForWorkspace, selectedAgentId,
      );
      pluginPaths = provisionResult.pluginPaths;
    } else {
      session = await this.getSessionById(sessionId, organizationId);

      // Lazy refresh: check if workspace is up-to-date
      const refreshResult = await this.workspaceManager.ensureWorkspaceUpToDate(
        organizationId, sessionId, scopeForWorkspace, selectedAgentId,
      );
      pluginPaths = refreshResult.pluginPaths;
    }

    const workspacePath = this.workspaceManager.getSessionWorkspacePath(organizationId, scopeId, sessionId);

    // Build agent config — use selected agent's prompt or scope-level
    const selectedAgent = selectedAgentId
      ? agentsWithSkills.find(a => a.id === selectedAgentId)
      : null;

    const agentConfig: AgentConfig = {
      id: selectedAgent?.id ?? scopeId,
      name: selectedAgent?.name ?? scopeForWorkspace.name,
      displayName: selectedAgent?.displayName ?? scopeForWorkspace.name,
      systemPrompt: selectedAgent?.systemPrompt ?? null,
      model: scopeForWorkspace.settings?.modelId as string | undefined
        ?? (selectedAgent?.model_config as Record<string, unknown>)?.modelId as string | undefined,
      organizationId,
      skillIds: scopeForWorkspace.skills.map(s => s.id),
      mcpServerIds: [],
    };

    const subAgentInfoMap = new Map(agentsWithSkills.map(a => {
      // Resolve avatar S3 key to a full API URL so the frontend can load it directly
      let avatarUrl: string | null = null;
      if (a.avatar) {
        const key = a.avatar.replace(/^\/+/, '');
        avatarUrl = `/api/avatars/${key}`;
      }
      return [a.name, { displayName: a.displayName || a.name, avatar: avatarUrl }];
    }));
    return { sessionId, workspacePath, agentConfig, skills: scopeForWorkspace.skills, claudeSessionId: session.claude_session_id ?? undefined, subAgentNames: agentsWithSkills.map(a => a.name), subAgentNameToId: new Map(agentsWithSkills.map(a => [a.name, a.id])), subAgentInfoMap, pluginPaths, mcpServers: await this.readSessionMcpServers(workspacePath) };
  }

  /**
   * Read MCP servers from a session workspace's settings.json and convert to SDK format.
   * This is the single source of truth for which MCP servers are active in a session.
   */
  private async readSessionMcpServers(workspacePath: string): Promise<Record<string, import('./claude-agent.service.js').MCPServerSDKConfig>> {
    try {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const content = await readFile(join(workspacePath, '.claude', 'settings.json'), 'utf-8');
      const settings = JSON.parse(content);
      const mcpServers = settings.mcpServers;
      if (!mcpServers || typeof mcpServers !== 'object') return {};
      // The settings.json format already matches MCPServerSDKConfig shape
      return mcpServers as Record<string, import('./claude-agent.service.js').MCPServerSDKConfig>;
    } catch {
      return {};
    }
  }

  /**
   * Load MCP servers attached to a business scope via the scope_mcp_servers junction table.
   */
  private async loadScopeMcpServers(scopeId: string): Promise<McpServerForWorkspace[]> {
    try {
      const rows = await prisma.$queryRaw<Array<{ name: string; host_address: string; status: string; config: Record<string, unknown> | null }>>`
        SELECT ms.name, ms.host_address, ms.status, ms.config
        FROM scope_mcp_servers sms
        JOIN mcp_servers ms ON ms.id = sms.mcp_server_id
        WHERE sms.business_scope_id = ${scopeId}::uuid
          AND ms.status = 'active'
      `;
      return rows.map(r => ({
        name: r.name,
        hostAddress: r.host_address,
        config: r.config,
      }));
    } catch (error) {
      console.error('Failed to load scope MCP servers:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Load plugins attached to a business scope via the scope_plugins table.
   */
  private async loadScopePlugins(scopeId: string): Promise<PluginForWorkspace[]> {
    try {
      const rows = await prisma.$queryRaw<Array<{ name: string; git_url: string; ref: string }>>`
        SELECT name, git_url, ref
        FROM scope_plugins
        WHERE business_scope_id = ${scopeId}::uuid
      `;
      return rows.map(r => ({
        name: r.name,
        gitUrl: r.git_url,
        ref: r.ref,
      }));
    } catch (error) {
      console.error('Failed to load scope plugins:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Prepare a legacy agent-based session (backward compat).
   */
  private async prepareLegacySession(
    organizationId: string,
    userId: string,
    options: ChatStreamOptions,
    skillsOverride?: SkillForWorkspace[],
  ): Promise<{ sessionId: string; workspacePath: string; agentConfig: AgentConfig; skills: SkillForWorkspace[]; claudeSessionId?: string }> {
    const agent = await agentRepository.findById(options.agentId!, organizationId);
    if (!agent) throw AppError.notFound(`Agent with ID ${options.agentId} not found`);

    let skills: SkillForWorkspace[];
    if (skillsOverride) {
      skills = skillsOverride;
    } else {
      skills = await this.loadAgentSkills(organizationId, options.agentId!);
    }

    let sessionId = options.sessionId;
    let claudeSessionId: string | undefined;
    if (!sessionId) {
      const session = await this.createSession({ context: options.context ?? {} }, organizationId, userId);
      sessionId = session.id;
    } else {
      const session = await chatSessionRepository.findById(sessionId, organizationId);
      if (!session) {
        // Session not found (e.g. DB was reset) — create a new one instead of failing
        console.warn(`Chat session ${sessionId} not found, creating a new session`);
        const newSession = await this.createSession({ context: options.context ?? {} }, organizationId, userId);
        sessionId = newSession.id;
      } else {
        claudeSessionId = session.claude_session_id ?? undefined;
      }
    }

    const workspacePath = await this.workspaceManager.ensureWorkspace(agent.id, skills);

    const agentConfig: AgentConfig = {
      id: agent.id,
      name: agent.name,
      displayName: agent.display_name || agent.name,
      systemPrompt: agent.system_prompt,
      model: (agent.model_config as Record<string, unknown>)?.modelId as string | undefined,
      organizationId,
      skillIds: skills.map(s => s.id),
      mcpServerIds: [],
    };

    return { sessionId, workspacePath, agentConfig, skills, claudeSessionId };
  }

  private async loadAgentSkills(organizationId: string, agentId: string): Promise<SkillForWorkspace[]> {
    try {
      const skillEntities = await this.skillService.getAgentSkills(organizationId, agentId);
      return skillEntities.map(skill => ({
        id: skill.id, name: skill.name, hashId: skill.hash_id,
        s3Bucket: skill.s3_bucket, s3Prefix: skill.s3_prefix,
        localPath: (skill.metadata as Record<string, unknown>)?.localPath as string | undefined,
      }));
    } catch (error) {
      console.error(`Failed to load skills for agent ${agentId}:`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  /** Auto-set session title from first user message (truncated). */
  private async maybeSetTitle(organizationId: string, sessionId: string, message: string): Promise<void> {
    try {
      const session = await chatSessionRepository.findById(sessionId, organizationId);
      if (session && !session.title) {
        const title = message.length > 80 ? message.substring(0, 77) + '...' : message;
        await chatSessionRepository.update(sessionId, organizationId, { title } as Partial<ChatSessionEntity>);
      }
    } catch { /* non-critical */ }
  }

  private writeConversationEventSSE(reply: FastifyReply, event: ConversationEvent): void {
    try {
      const safe = sanitizeEvent(event);
      switch (safe.type) {
        case 'session_start':
          break;
        case 'assistant':
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({ type: 'assistant', content: safe.content, model: safe.model, speakerAgentName: safe.speakerAgentName, speakerAgentAvatar: safe.speakerAgentAvatar }),
          }));
          break;
        case 'result':
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({ type: 'result', session_id: safe.sessionId, duration_ms: safe.durationMs, num_turns: safe.numTurns, model: safe.model, token_usage: safe.tokenUsage ? { input_tokens: safe.tokenUsage.inputTokens, output_tokens: safe.tokenUsage.outputTokens, cache_read_input_tokens: safe.tokenUsage.cacheReadInputTokens, cache_creation_input_tokens: safe.tokenUsage.cacheCreationInputTokens, total_cost_usd: safe.tokenUsage.totalCostUsd } : undefined }),
          }));
          break;
        case 'heartbeat':
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }),
          }));
          break;
        case 'error':
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({ type: 'error', code: safe.code, message: safe.message, suggested_action: safe.suggestedAction }),
          }));
          break;
      }
    } catch { /* client disconnected */ }
  }

  /**
     * Iterates an async generator with an idle timeout.
     * The timeout resets on every yielded event, so long-running but
     * actively-progressing conversations won't be killed prematurely.
     */
    private async iterateWithTimeout<T>(
      generator: AsyncGenerator<T>,
      timeoutMs: number,
      onEvent: (event: T) => void,
      onTimeout: () => void,
    ): Promise<void> {
      const timeoutSymbol = Symbol('timeout');

      let timer: ReturnType<typeof setTimeout> | null = null;
      let resolveTimeout: ((v: typeof timeoutSymbol) => void) | null = null;

      const resetTimeout = () => {
        if (timer) clearTimeout(timer);
        return new Promise<typeof timeoutSymbol>((resolve) => {
          resolveTimeout = resolve;
          timer = setTimeout(() => resolve(timeoutSymbol), timeoutMs);
        });
      };

      let timeoutPromise = resetTimeout();
      let done = false;

      while (!done) {
        const result = await Promise.race([generator.next(), timeoutPromise]);
        if (result === timeoutSymbol) {
          onTimeout();
          try { await generator.return(undefined as unknown as T); } catch { /* ignore */ }
          return;
        }
        // Event received — reset the idle timer
        timeoutPromise = resetTimeout();
        const iterResult = result as IteratorResult<T>;
        if (iterResult.done) { done = true; } else { onEvent(iterResult.value); }
      }

      // Clean up timer on normal completion
      if (timer) clearTimeout(timer);
    }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  async getContextBySop(organizationId: string, sopContext: string): Promise<ChatSessionEntity> {
    const session = await chatSessionRepository.findBySopContext(organizationId, sopContext);
    if (!session) throw AppError.notFound(`No chat session found for SOP context: ${sopContext}`);
    return session;
  }

  async getSessionMessages(organizationId: string, sessionId: string, limit?: number): Promise<ChatMessageEntity[]> {
    return this.getChatHistory(organizationId, { sessionId, limit });
  }
}

export const chatService = new ChatService();
