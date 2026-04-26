/**
 * Chat Routes
 * REST API endpoints for Chat management with SSE streaming support.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { stat as fsStat, mkdtemp, writeFile as fsWriteFile, readFile as fsReadFile, rm } from 'fs/promises';
import { createReadStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);
import http from 'http';
import { chatService } from '../services/chat.service.js';
import { streamRegistry } from '../services/stream-registry.js';
import { workspaceManager } from '../services/workspace-manager.js';
import { agentCoreCommandService } from '../services/agentcore-command.service.js';
import { prisma } from '../config/database.js';
import { devServerManager } from '../services/dev-server-manager.js';
import { sanitizeEvent } from '../services/output-sanitizer.js';
import { generateQuickQuestions } from '../services/quick-questions.service.js';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { scopeAccessService } from '../services/scopeAccess.service.js';
import {
  chatStreamRequestSchema,
  createChatSessionSchema,
  updateChatSessionSchema,
  type ChatStreamRequest,
  type CreateChatSessionInput,
  type UpdateChatSessionInput,
} from '../schemas/chat.schema.js';
import { idParamSchema } from '../schemas/common.schema.js';
import { ZodError, z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Request types for route handlers
 */
interface StreamChatRequest {
  Body: ChatStreamRequest;
}

interface GetSessionByIdRequest {
  Params: { id: string };
}

interface CreateSessionRequest {
  Body: CreateChatSessionInput;
}

interface UpdateSessionRequest {
  Params: { id: string };
  Body: UpdateChatSessionInput;
}

interface DeleteSessionRequest {
  Params: { id: string };
}

interface GetHistoryRequest {
  Params: { sessionId: string };
  Querystring: { limit?: number; before?: string };
}

interface GetContextRequest {
  Params: { sopId: string };
}

/**
 * Parse and validate Zod schema, throwing AppError on failure
 */
function validateSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw AppError.validation('Validation failed', error.issues);
    }
    throw error;
  }
}

/**
 * Build a WorkspaceFileNode tree from flat file entries returned by Command API.
 */
function buildTreeFromEntries(
  entries: Array<{ type: 'file' | 'directory'; size: number; path: string }>,
): import('../services/workspace-manager.js').WorkspaceFileNode[] {
  type FileNode = import('../services/workspace-manager.js').WorkspaceFileNode;
  const root: Map<string, any> = new Map();

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (i === parts.length - 1) {
        current.set(part, { type: entry.type, size: entry.size });
      } else {
        if (!current.has(part)) current.set(part, new Map());
        current = current.get(part);
      }
    }
  }

  const mapToNodes = (map: Map<string, any>, parentPath: string): FileNode[] => {
    const nodes: FileNode[] = [];
    const sorted = [...map.entries()].sort(([aName, aVal], [bName, bVal]) => {
      const aIsDir = aVal instanceof Map || aVal?.type === 'directory';
      const bIsDir = bVal instanceof Map || bVal?.type === 'directory';
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return aName.localeCompare(bName);
    });
    for (const [name, value] of sorted) {
      const path = parentPath ? `${parentPath}/${name}` : name;
      if (value instanceof Map) {
        nodes.push({ name, path, type: 'directory', children: mapToNodes(value, path) });
      } else {
        nodes.push({ name, path, type: value.type ?? 'file', size: value.size });
      }
    }
    return nodes;
  };

  return mapToNodes(root, '');
}

// ---------------------------------------------------------------------------
// Workspace file-tree cache (TTL-based, avoids hitting AgentCore/S3 on every poll)
// ---------------------------------------------------------------------------
interface WorkspaceCacheEntry {
  data: import('../services/workspace-manager.js').WorkspaceFileNode[];
  workspacePath: string | null;
  expiresAt: number;
}
const workspaceFileCache = new Map<string, WorkspaceCacheEntry>();
const WORKSPACE_CACHE_TTL_MS = 15_000; // 15 seconds

function getCachedWorkspaceFiles(sessionId: string): WorkspaceCacheEntry | null {
  const entry = workspaceFileCache.get(sessionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    workspaceFileCache.delete(sessionId);
    return null;
  }
  return entry;
}

function setCachedWorkspaceFiles(sessionId: string, data: WorkspaceCacheEntry['data'], workspacePath: string | null): void {
  workspaceFileCache.set(sessionId, {
    data,
    workspacePath,
    expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
  });
}

/**
 * Register chat routes on the Fastify instance.
 * All routes require authentication and filter by organization_id.
 */
export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/chat/stream
   * Stream a chat response using SSE.
   * Requirements: 8.1, 8.2, 8.3, 8.7
   */
  fastify.post<StreamChatRequest>(
    '/stream',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Stream a chat response using Server-Sent Events',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            agent_id: { type: 'string', format: 'uuid' },
            business_scope_id: { type: 'string', format: 'uuid' },
            mention_agent_id: { type: 'string', format: 'uuid' },
            session_id: { type: 'string', format: 'uuid' },
            message: { type: 'string', minLength: 1 },
            model: { type: 'string' },
            context: { type: 'object' },
          },
        },
        response: {
          200: {
            description: 'SSE stream of chat response chunks',
            type: 'string',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<StreamChatRequest>, reply: FastifyReply) => {
      const data = validateSchema(chatStreamRequestSchema, request.body);

      // Enforce scope access if a business_scope_id is provided
      if (data.business_scope_id) {
        await scopeAccessService.requireAccess(request.user!, data.business_scope_id, 'viewer');
      }

      await chatService.streamChat(reply, request.user!.orgId, request.user!.id, {
        agentId: data.agent_id,
        businessScopeId: data.business_scope_id,
        mentionAgentId: data.mention_agent_id,
        sessionId: data.session_id,
        message: data.message,
        model: data.model,
        context: data.context,
      });
    }
  );

  /**
   * GET /api/chat/sessions
   * Get all chat sessions for the authenticated user.
   */
  fastify.get(
    '/sessions',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all chat sessions for the authenticated user',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            business_scope_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                organization_id: { type: 'string' },
                user_id: { type: 'string' },
                business_scope_id: { type: 'string', nullable: true },
                agent_id: { type: 'string', nullable: true },
                claude_session_id: { type: 'string', nullable: true },
                title: { type: 'string', nullable: true },
                status: { type: 'string', enum: ['idle', 'generating', 'error'] },
                sop_context: { type: 'string', nullable: true },
                context: { type: 'object' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { business_scope_id?: string } }>, reply: FastifyReply) => {
      const scopeId = request.query.business_scope_id;
      const isAdmin = request.user!.role === 'owner' || request.user!.role === 'admin';

      let sessions;
      if (scopeId) {
        // Admins see all sessions in the scope; regular users see only their own
        sessions = await chatService.getSessionsByScope(
          request.user!.orgId,
          scopeId,
          isAdmin ? undefined : request.user!.id,
        );
      } else {
        if (isAdmin) {
          // Admins see all sessions across the organization
          sessions = await chatService.getAllSessions(request.user!.orgId);
        } else {
          sessions = await chatService.getSessions(request.user!.orgId, request.user!.id);
        }
      }
      return reply.status(200).send(sessions);
    }
  );

  /**
   * GET /api/chat/sessions/:id
   * Get a chat session by ID.
   */
  fastify.get<GetSessionByIdRequest>(
    '/sessions/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get a chat session by ID',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              user_id: { type: 'string' },
              sop_context: { type: 'string', nullable: true },
              context: { type: 'object' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetSessionByIdRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      const session = await chatService.getSessionById(id, request.user!.orgId);

      return reply.status(200).send(session);
    }
  );

  /**
   * GET /api/chat/sessions/:id/status
   * Get the current status of a session (idle, generating, error).
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/status',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get session generation status',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['idle', 'generating', 'error'] },
              streamAvailable: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);
      return reply.status(200).send({
        status: session.status ?? 'idle',
        streamAvailable: streamRegistry.isActive(id),
      });
    }
  );

  /**
   * GET /api/chat/sessions/:id/stream
   * Reconnect to an active SSE stream for a generating session.
   * Replays buffered events then streams live events.
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/stream',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Reconnect to an active session stream',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      // Verify ownership
      await chatService.getSessionById(id, request.user!.orgId);

      const subscription = streamRegistry.subscribe(id);
      if (!subscription) {
        return reply.status(404).send({ error: 'No active stream for this session' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });

      // Replay buffered events
      for (const event of subscription.buffer) {
        const data = JSON.stringify(sanitizeEvent(event));
        reply.raw.write(`data: ${data}\n\n`);
      }

      // If already done, close immediately
      if (subscription.done) {
        reply.raw.write(`data: [DONE]\n\n`);
        reply.raw.end();
        return;
      }

      // Subscribe to live events
      let clientDisconnected = false;
      const onEvent = (event: unknown) => {
        if (clientDisconnected) return;
        try {
          reply.raw.write(`data: ${JSON.stringify(sanitizeEvent(event as import('../services/claude-agent.service.js').ConversationEvent))}\n\n`);
        } catch { /* client gone */ }
      };
      const onDone = () => {
        if (!clientDisconnected) {
          try {
            reply.raw.write(`data: [DONE]\n\n`);
            reply.raw.end();
          } catch { /* client gone */ }
        }
        cleanup();
      };
      const cleanup = () => {
        subscription.emitter.removeListener('event', onEvent);
        subscription.emitter.removeListener('done', onDone);
      };

      reply.raw.on('close', () => {
        clientDisconnected = true;
        cleanup();
      });

      subscription.emitter.on('event', onEvent);
      subscription.emitter.on('done', onDone);
    }
  );

  /**
   * POST /api/chat/sessions
   * Create a new chat session.
   */
  fastify.post<CreateSessionRequest>(
    '/sessions',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Create a new chat session',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            business_scope_id: { type: 'string', format: 'uuid', nullable: true },
            agent_id: { type: 'string', format: 'uuid', nullable: true },
            sop_context: { type: 'string', nullable: true },
            context: { type: 'object', default: {} },
            provision_workspace: { type: 'boolean', default: false },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              user_id: { type: 'string' },
              sop_context: { type: 'string', nullable: true },
              context: { type: 'object' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<CreateSessionRequest>, reply: FastifyReply) => {
      const data = validateSchema(createChatSessionSchema, request.body);

      const session = await chatService.createSession(data, request.user!.orgId, request.user!.id);

      // Fire-and-forget workspace provisioning — return the session ID immediately
      // so the frontend can show the chat UI without waiting. The workspace will
      // be ready by the time the first message arrives (prepareScopeSession calls
      // ensureWorkspaceUpToDate as a fallback if provisioning hasn't finished).
      if (data.provision_workspace && session.business_scope_id) {
        chatService.provisionSessionWorkspace(
          session.id, request.user!.orgId,
        ).then(() => {
          console.log(`[chat] Workspace provisioned successfully for session ${session.id}`);
        }).catch(err => {
          console.warn(`[chat] Eager workspace provisioning failed for session ${session.id}:`, err instanceof Error ? err.message : err);
        });
      }

      return reply.status(201).send(session);
    }
  );

  /**
   * PUT /api/chat/sessions/:id
   * Update a chat session.
   */
  fastify.put<UpdateSessionRequest>(
    '/sessions/:id',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Update a chat session',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            sop_context: { type: 'string', nullable: true },
            context: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              user_id: { type: 'string' },
              sop_context: { type: 'string', nullable: true },
              context: { type: 'object' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<UpdateSessionRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const data = validateSchema(updateChatSessionSchema, request.body);

      const session = await chatService.updateSession(id, data, request.user!.orgId);

      return reply.status(200).send(session);
    }
  );

  /**
   * DELETE /api/chat/sessions/:id
   * Delete a chat session and all its messages.
   * Requirements: 8.5
   */
  fastify.delete<DeleteSessionRequest>(
    '/sessions/:id',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Delete a chat session and all its messages',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'Session deleted successfully',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<DeleteSessionRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      await chatService.deleteSession(id, request.user!.orgId);

      return reply.status(204).send();
    }
  );

  /**
   * GET /api/chat/history/:sessionId
   * Get chat history for a session.
   * Requirements: 8.4
   */
  fastify.get<GetHistoryRequest>(
    '/history/:sessionId',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get chat history for a session',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            before: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                organization_id: { type: 'string' },
                session_id: { type: 'string' },
                type: { type: 'string', enum: ['user', 'ai'] },
                content: { type: 'string' },
                created_at: { type: 'string' },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetHistoryRequest>, reply: FastifyReply) => {
      const sessionIdSchema = z.object({ sessionId: z.string().uuid() });
      const { sessionId } = validateSchema(sessionIdSchema, request.params);

      const messages = await chatService.getChatHistory(request.user!.orgId, {
        sessionId,
        limit: request.query.limit,
        before: request.query.before,
      });

      return reply.status(200).send(messages);
    }
  );

  /**
   * DELETE /api/chat/history/:sessionId
   * Clear chat history for a session (delete all messages but keep session).
   * Requirements: 8.5
   */
  fastify.delete<GetHistoryRequest>(
    '/history/:sessionId',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Clear chat history for a session',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'Chat history cleared successfully',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetHistoryRequest>, reply: FastifyReply) => {
      const sessionIdSchema = z.object({ sessionId: z.string().uuid() });
      const { sessionId } = validateSchema(sessionIdSchema, request.params);

      // Verify session exists
      await chatService.getSessionById(sessionId, request.user!.orgId);

      // Delete messages only, keep the session and workspace
      await chatService.clearSessionMessages(sessionId, request.user!.orgId);

      return reply.status(204).send();
    }
  );

  /**
   * GET /api/chat/context/:sopId
   * Get context data for an SOP.
   * Requirements: 8.6
   */
  fastify.get<GetContextRequest>(
    '/context/:sopId',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get context data for an SOP',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['sopId'],
          properties: {
            sopId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              user_id: { type: 'string' },
              sop_context: { type: 'string', nullable: true },
              context: { type: 'object' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetContextRequest>, reply: FastifyReply) => {
      const { sopId } = request.params;

      const session = await chatService.getContextBySop(request.user!.orgId, sopId);

      return reply.status(200).send(session);
    }
  );

  /**
   * GET /api/chat/sessions/:id/workspace
   * List files in the session's workspace directory.
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/workspace',
    {
      preHandler: [authenticate],
      schema: {
        description: 'List files in the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      // Check cache first — avoids hitting AgentCore/S3 on every 5s poll
      const cached = getCachedWorkspaceFiles(id);
      if (cached) {
        return reply.status(200).send({ files: cached.data, workspacePath: cached.workspacePath });
      }

      const session = await chatService.getSessionById(id, request.user!.orgId);

      const context = session.context as Record<string, unknown> | null;
      const scopeIdForPath = session.business_scope_id
        || (context?.project_id as string | undefined)
        || null;

      if (!scopeIdForPath) {
        return reply.status(200).send({ files: [], workspacePath: null });
      }

      try {
        const { config: appConfig } = await import('../config/index.js');
        let files;
        if (appConfig.agentRuntime === 'agentcore') {
          // Local-first strategy: return local workspace instantly if available,
          // then let subsequent polls pick up the authoritative AgentCore/S3 data.
          const localFiles = await workspaceManager.listWorkspaceFiles(
            request.user!.orgId,
            scopeIdForPath,
            session.id,
          );

          if (localFiles && localFiles.length > 0) {
            // Local workspace exists — return immediately with a short cache TTL.
            // The next poll (after cache expires) will try AgentCore for fresh data.
            const wsPath = workspaceManager.getSessionWorkspacePath(
              request.user!.orgId, scopeIdForPath, session.id,
            );
            setCachedWorkspaceFiles(id, localFiles, wsPath);
            return reply.status(200).send({ files: localFiles, workspacePath: wsPath });
          }

          // No local workspace — try AgentCore container, then S3
          try {
            const entries = await agentCoreCommandService.listWorkspaceFiles(session.id);
            files = buildTreeFromEntries(entries);
          } catch (cmdErr) {
            // Expected when session has no active microVM (idle >15min or no messages yet).
            files = await workspaceManager.listWorkspaceFilesFromS3(
              request.user!.orgId,
              scopeIdForPath,
              session.id,
            );
          }
        } else {
          files = await workspaceManager.listWorkspaceFiles(
            request.user!.orgId,
            scopeIdForPath,
            session.id,
          );
        }

        const wsPath = files ? workspaceManager.getSessionWorkspacePath(
          request.user!.orgId, scopeIdForPath, session.id,
        ) : null;

        // Cache the result
        if (files) {
          setCachedWorkspaceFiles(id, files, wsPath);
        }

        return reply.status(200).send({
          files: files ?? [],
          workspacePath: wsPath,
        });
      } catch (err) {
        console.warn(`[workspace] Failed to list files for session ${id}:`, err instanceof Error ? err.message : err);
        return reply.status(200).send({ files: [], workspacePath: null });
      }
    },
  );

  /**
   * GET /api/chat/sessions/:id/workspace/skills
   * List skills installed in the session's workspace.
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/workspace/skills',
    {
      preHandler: [authenticate],
      schema: {
        description: 'List skills in the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(200).send({ data: [] });
      }

      const skills = await workspaceManager.listWorkspaceSkills(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
      );

      return reply.status(200).send({ data: skills });
    },
  );

  /**
   * DELETE /api/chat/sessions/:id/workspace/skills/:skillName
   * Delete a skill folder from the session's workspace.
   */
  fastify.delete<{ Params: { id: string; skillName: string } }>(
    '/sessions/:id/workspace/skills/:skillName',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Delete a skill from the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'skillName'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            skillName: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const deleted = await workspaceManager.deleteWorkspaceSkill(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        request.params.skillName,
      );

      if (!deleted) {
        return reply.status(404).send({ error: 'Skill not found in workspace' });
      }

      // In agentcore mode, also delete from the container
      const { config: appConfig } = await import('../config/index.js');
      if (appConfig.agentRuntime === 'agentcore') {
        try {
          await agentCoreCommandService.deleteDirectory(session.id, `.claude/skills/${request.params.skillName}`);
        } catch (err) {
          console.warn('[workspace] Failed to delete skill from container:', err instanceof Error ? err.message : err);
        }
      }

      return reply.status(204).send();
    },
  );

  /**
   * GET /api/chat/sessions/:id/workspace/file
   * Read a file from the session workspace.
   */
  fastify.get<{ Params: { id: string }; Querystring: { path: string } }>(
    '/sessions/:id/workspace/file',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Read a file from the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['path'],
          properties: { path: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const content = await workspaceManager.readWorkspaceFile(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        request.query.path,
      );

      if (content === null) {
        // In agentcore mode, try reading directly from container via Command API
        const { config: appConfig } = await import('../config/index.js');
        if (appConfig.agentRuntime === 'agentcore') {
          try {
            const cmdContent = await agentCoreCommandService.readFile(session.id, request.query.path);
            if (cmdContent !== null) {
              return reply.status(200).send({ path: request.query.path, content: cmdContent });
            }
          } catch {
            // Command API failed, try S3 fallback
          }
          const s3Content = await workspaceManager.readWorkspaceFileFromS3(
            request.user!.orgId,
            session.business_scope_id,
            session.id,
            request.query.path,
          );
          if (s3Content !== null) {
            return reply.status(200).send({ path: request.query.path, content: s3Content });
          }
        }
        return reply.status(404).send({ error: 'File not found' });
      }

      return reply.status(200).send({ path: request.query.path, content });
    },
  );

  /**
   * GET /api/chat/sessions/:id/workspace/file/raw
   * Serve a workspace file with its raw content-type (for images, etc).
   */
  fastify.get<{ Params: { id: string }; Querystring: { path: string; token?: string } }>(
    '/sessions/:id/workspace/file/raw',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Serve a raw workspace file',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1 },
            token: { type: 'string', description: 'Auth token for iframe/img src' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const resolvedPath = workspaceManager.resolveWorkspaceFilePath(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        request.query.path,
      );

      if (!resolvedPath) {
        return reply.status(404).send({ error: 'File not found' });
      }

      const ext = request.query.path.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
        pdf: 'application/pdf',
        html: 'text/html', htm: 'text/html',
        css: 'text/css', js: 'application/javascript', mjs: 'application/javascript',
        json: 'application/json',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt: 'application/vnd.ms-powerpoint',
        zip: 'application/zip',
        gz: 'application/gzip',
        tar: 'application/x-tar',
        csv: 'text/csv',
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';

      // Try local filesystem first
      let fileStat;
      try {
        fileStat = await fsStat(resolvedPath);
      } catch {
        // Local file not found — in agentcore mode, fall back to Command API then S3
        const { config: appConfig } = await import('../config/index.js');
        if (appConfig.agentRuntime === 'agentcore') {
          const isBinaryContent = !contentType.startsWith('text/') && contentType !== 'application/json' && contentType !== 'application/javascript';

          // Try reading from the agentcore container via Command API (text only — Command API returns strings)
          if (!isBinaryContent) {
            try {
              const cmdContent = await agentCoreCommandService.readFile(session.id, request.query.path);
              if (cmdContent !== null) {
                const buf = Buffer.from(cmdContent, 'utf-8');
                return reply
                  .type(contentType)
                  .header('Content-Length', buf.length)
                  .send(buf);
              }
            } catch {
              // Command API failed, try S3 fallback
            }
          }

          // Try S3 fallback — use raw binary read for binary content types
          if (isBinaryContent) {
            const s3Buffer = await workspaceManager.readWorkspaceFileFromS3Raw(
              request.user!.orgId,
              session.business_scope_id,
              session.id,
              request.query.path,
            );
            if (s3Buffer !== null) {
              return reply
                .type(contentType)
                .header('Content-Length', s3Buffer.length)
                .send(s3Buffer);
            }
          } else {
            const s3Content = await workspaceManager.readWorkspaceFileFromS3(
              request.user!.orgId,
              session.business_scope_id,
              session.id,
              request.query.path,
            );
            if (s3Content !== null) {
              const buf = Buffer.from(s3Content, 'utf-8');
              return reply
                .type(contentType)
                .header('Content-Length', buf.length)
                .send(buf);
            }
          }
        }
        return reply.status(404).send({ error: 'File not found' });
      }

      const stream = createReadStream(resolvedPath);
      return reply
        .type(contentType)
        .header('Content-Length', fileStat.size)
        .send(stream);
    },
  );

  /**
   * GET /api/chat/sessions/:id/workspace/file/pdf-preview
   * Convert a docx/pptx/doc/ppt file to PDF on-the-fly using LibreOffice headless
   * and return the PDF for in-browser preview.
   */
  fastify.get<{ Params: { id: string }; Querystring: { path: string; token?: string } }>(
    '/sessions/:id/workspace/file/pdf-preview',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Convert an Office document to PDF for preview',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', minLength: 1 },
            token: { type: 'string', description: 'Auth token for iframe src' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const filePath = request.query.path;
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const allowedExts = new Set(['doc', 'docx', 'ppt', 'pptx']);
      if (!allowedExts.has(ext)) {
        return reply.status(400).send({ error: 'Only doc/docx/ppt/pptx files can be converted to PDF' });
      }

      // Read the original binary file
      let sourceBuffer: Buffer | null = null;

      // Try local filesystem first
      const resolvedPath = workspaceManager.resolveWorkspaceFilePath(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        filePath,
      );

      if (resolvedPath) {
        try {
          sourceBuffer = await fsReadFile(resolvedPath);
        } catch {
          // Local file not found, try fallbacks
        }
      }

      // Fallback: S3 raw read (agentcore mode)
      if (!sourceBuffer) {
        const { config: appConfig } = await import('../config/index.js');
        if (appConfig.agentRuntime === 'agentcore') {
          sourceBuffer = await workspaceManager.readWorkspaceFileFromS3Raw(
            request.user!.orgId,
            session.business_scope_id,
            session.id,
            filePath,
          );
        }
      }

      if (!sourceBuffer) {
        return reply.status(404).send({ error: 'File not found' });
      }

      // Convert to PDF using LibreOffice headless
      // Detect the correct binary name: macOS uses 'soffice', Linux uses 'libreoffice'
      let sofficeBin: string | null = null;
      for (const candidate of ['libreoffice', 'soffice']) {
        try {
          await execFileAsync('which', [candidate]);
          sofficeBin = candidate;
          break;
        } catch { /* not found, try next */ }
      }
      if (!sofficeBin) {
        return reply.status(500).send({ error: 'LibreOffice is not installed. Install it with: brew install --cask libreoffice (macOS) or apt-get install libreoffice-core (Ubuntu)' });
      }

      let tmpDir: string | null = null;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), 'pdf-preview-'));
        const inputFile = join(tmpDir, `input.${ext}`);
        await fsWriteFile(inputFile, sourceBuffer);

        await execFileAsync(sofficeBin, [
          '--headless',
          '--norestore',
          '--convert-to', 'pdf',
          '--outdir', tmpDir,
          inputFile,
        ], { timeout: 30_000 });

        const pdfPath = join(tmpDir, 'input.pdf');
        const pdfBuffer = await fsReadFile(pdfPath);

        return reply
          .type('application/pdf')
          .header('Content-Length', pdfBuffer.length)
          .header('Content-Disposition', 'inline')
          .send(pdfBuffer);
      } catch (err) {
        console.error('[pdf-preview] LibreOffice conversion failed:', err instanceof Error ? err.message : err);
        return reply.status(500).send({ error: 'PDF conversion failed. Ensure LibreOffice is installed on the server.' });
      } finally {
        // Clean up temp directory
        if (tmpDir) {
          rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
  );

  /**
   * PUT /api/chat/sessions/:id/workspace/file
   * Write/save a file to the session workspace.
   */
  fastify.put<{ Params: { id: string }; Body: { path: string; content: string } }>(
    '/sessions/:id/workspace/file',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Write a file to the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['path', 'content'],
          properties: {
            path: { type: 'string', minLength: 1 },
            content: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const ok = await workspaceManager.writeWorkspaceFile(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        request.body.path,
        request.body.content,
      );

      if (!ok) {
        return reply.status(400).send({ error: 'Failed to write file' });
      }

      // In agentcore mode, also write directly to the container
      const { config: appConfig } = await import('../config/index.js');
      if (appConfig.agentRuntime === 'agentcore') {
        try {
          await agentCoreCommandService.writeFile(session.id, request.body.path, request.body.content);
        } catch (err) {
          console.warn('[workspace] Failed to write file to container:', err instanceof Error ? err.message : err);
        }
      }

      return reply.status(200).send({ path: request.body.path, saved: true });
    },
  );

  /**
   * POST /api/chat/sessions/:id/workspace/upload
   * Upload a file (base64-encoded) to the session workspace.
   */
  fastify.post<{ Params: { id: string }; Body: { fileName: string; content: string } }>(
    '/sessions/:id/workspace/upload',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Upload a base64-encoded file to the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['fileName', 'content'],
          properties: {
            fileName: { type: 'string', minLength: 1 },
            content: { type: 'string', description: 'Base64-encoded file content' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const decoded = Buffer.from(request.body.content, 'base64');
      const ok = await workspaceManager.writeWorkspaceFileRaw(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        request.body.fileName,
        decoded,
      );

      if (!ok) {
        return reply.status(400).send({ error: 'Failed to upload file' });
      }

      return reply.status(200).send({ path: request.body.fileName, uploaded: true });
    },
  );

  /**
   * POST /api/chat/sessions/:id/workspace/upload-file
   * Upload a file via multipart/form-data to the session workspace.
   * Supports large files (up to 100MB) without base64 overhead.
   */
  fastify.post<{ Params: { id: string } }>(
    '/sessions/:id/workspace/upload-file',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Upload a file via multipart/form-data to the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file provided' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }

      if (data.file.truncated) {
        return reply.status(413).send({ error: 'File too large. Maximum size is 100MB.' });
      }

      const buffer = Buffer.concat(chunks);
      const fileName = data.filename;

      const ok = await workspaceManager.writeWorkspaceFileRaw(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
        fileName,
        buffer,
      );

      if (!ok) {
        return reply.status(400).send({ error: 'Failed to upload file' });
      }

      return reply.status(200).send({ path: fileName, uploaded: true });
    },
  );

  /**
   * POST /api/chat/quick-questions
   * Generate LLM-powered contextual quick questions based on business scope and conversation.
   */
  fastify.post<{
    Body: {
      business_scope_id?: string;
      agent_id?: string;
      conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
  }>(
    '/quick-questions',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Generate contextual quick questions using LLM',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            business_scope_id: { type: 'string', format: 'uuid', nullable: true },
            agent_id: { type: 'string', format: 'uuid', nullable: true },
            conversation_history: {
              type: 'array',
              items: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                },
              },
              nullable: true,
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                icon: { type: 'string' },
                category: { type: 'string' },
                text: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const questions = await generateQuickQuestions({
          organizationId: request.user!.orgId,
          businessScopeId: request.body.business_scope_id ?? undefined,
          agentId: request.body.agent_id ?? undefined,
          conversationHistory: request.body.conversation_history ?? undefined,
        });

        return reply.status(200).send(questions);
      } catch (err) {
        request.log.error({ err }, '[quick-questions] Route handler error');
        // Return defaults rather than a 500
        return reply.status(200).send([
          { id: 'qq-err-1', icon: '❓', category: 'General', text: 'What can you help me with?' },
          { id: 'qq-err-2', icon: '📝', category: 'General', text: 'How do I get started?' },
        ]);
      }
    },
  );

  // ==========================================================================
  // App Preview — Dev Server Management & Proxy
  // ==========================================================================

  /**
   * POST /api/chat/sessions/:id/preview/start
   * Start a Vite dev server for the session workspace.
   */
  fastify.post<{ Params: { id: string } }>(
    '/sessions/:id/preview/start',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Start a Vite dev server for app preview',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(404).send({ error: 'No workspace for this session' });
      }

      const workspacePath = workspaceManager.getSessionWorkspacePath(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
      );

      // In agentcore mode, ensure local workspace is synced from S3 before
      // starting the dev server. The container writes files to S3 and the
      // sync-back to local is fire-and-forget, so files may not be present yet.
      const { config: appConfig } = await import('../config/index.js');
      if (appConfig.agentRuntime === 'agentcore') {
        try {
          await workspaceManager.ensureS3SyncedToLocal(
            request.user!.orgId,
            session.business_scope_id,
            session.id,
          );
        } catch (err) {
          console.warn(`[preview] S3 sync failed for session ${id}:`, err instanceof Error ? err.message : err);
        }
      }

      try {
        const port = await devServerManager.ensureDevServer(session.id, workspacePath);
        return reply.status(200).send({ port, status: 'running' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start dev server';
        return reply.status(400).send({ error: message });
      }
    },
  );

  /**
   * DELETE /api/chat/sessions/:id/preview/stop
   * Stop the dev server for a session.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/sessions/:id/preview/stop',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Stop the Vite dev server for a session',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      devServerManager.stop(id);
      return reply.status(200).send({ status: 'stopped' });
    },
  );

  /**
   * GET /api/chat/sessions/:id/preview/*
   * Proxy all requests to the session's Vite dev server.
   */
  fastify.get<{ Params: { id: string; '*': string }; Querystring: { token?: string } }>(
    '/sessions/:id/preview/*',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Proxy to Vite dev server',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            '*': { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const port = devServerManager.getPort(id);

      if (!port) {
        return reply.status(404).send({ error: 'No dev server running for this session. Call POST /preview/start first.' });
      }

      const proxyPath = '/' + (request.params['*'] || '');
      const url = new URL(request.url, `http://localhost:${port}`);

      // Remove the token param from proxied URL
      url.searchParams.delete('token');

      return new Promise<void>((resolve) => {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: proxyPath + (url.search || ''),
            method: 'GET',
            headers: {
              ...request.headers,
              host: `127.0.0.1:${port}`,
            },
          },
          (proxyRes) => {
            reply.raw.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(reply.raw);
            proxyRes.on('end', resolve);
          },
        );

        proxyReq.on('error', () => {
          reply.status(502).send({ error: 'Dev server not reachable' });
          resolve();
        });

        proxyReq.end();
      });
    },
  );

  // ==========================================================================
  // App Detection — Scan workspace for publishable apps
  // ==========================================================================

  /**
   * GET /api/chat/sessions/:id/workspace/detect-apps
   * Scan the session workspace for folders containing an index.html entry point.
   * Returns a list of detected app folders with metadata.
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/workspace/detect-apps',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Detect publishable apps in the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);

      if (!session.business_scope_id) {
        return reply.status(200).send({ apps: [] });
      }

      // In agentcore mode, the local workspace is a cache that gets synced
      // from S3 in the background after each agent invocation (fire-and-forget
      // in runConversation). We skip the blocking S3 sync here because:
      //   1. detect-apps only needs to know IF an app exists (folder structure),
      //      not whether file contents are up-to-date.
      //   2. The publish-from-workspace endpoint does its own ensureS3SyncedToLocal
      //      before actually copying the bundle, so freshness is guaranteed at
      //      publish/preview time.
      //   3. Blocking here adds seconds of latency to every detect-apps call,
      //      making the app-detector bar feel sluggish after each agent response.

      const wsPath = workspaceManager.getSessionWorkspacePath(
        request.user!.orgId,
        session.business_scope_id,
        session.id,
      );

      const { readdir, stat: fsStat2 } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { join } = await import('path');

      const apps: Array<{
        folder: string;
        entryPoint: string;
        hasPackageJson: boolean;
        name: string | null;
        publishedAppId: string | null;
        publishedAt: string | null;
        publishedVersion: string | null;
        previewAppId: string | null;
      }> = [];

      // Check root-level index.html
      const rootEntry = ['index.html', 'index.htm'].find(f => existsSync(join(wsPath, f)));
      if (rootEntry) {
        let name: string | null = null;
        const pkgPath = join(wsPath, 'package.json');
        if (existsSync(pkgPath)) {
          try {
            const { readFile: rf } = await import('fs/promises');
            const pkg = JSON.parse(await rf(pkgPath, 'utf-8'));
            name = pkg.name || null;
          } catch { /* ignore */ }
        }
        apps.push({
          folder: '.',
          entryPoint: rootEntry,
          hasPackageJson: existsSync(pkgPath),
          name,
          publishedAppId: null,
          publishedAt: null,
          publishedVersion: null,
          previewAppId: null,
        });
      }

      // Scan up to 2 levels deep for index.html
      const scanDir = async (basePath: string, relPrefix: string, depth: number) => {
        if (depth > 2) return;
        try {
          const entries = await readdir(basePath, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
            const dirPath = join(basePath, entry.name);
            const relFolder = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
            const candidates = ['dist/index.html', 'build/index.html', 'index.html'];
            const found = candidates.find(c => existsSync(join(dirPath, c)));

            if (found) {
              let name: string | null = null;
              const pkgPath = join(dirPath, 'package.json');
              if (existsSync(pkgPath)) {
                try {
                  const { readFile: rf } = await import('fs/promises');
                  const pkg = JSON.parse(await rf(pkgPath, 'utf-8'));
                  name = pkg.name || null;
                } catch { /* ignore */ }
              }
              apps.push({
                folder: relFolder,
                entryPoint: found,
                hasPackageJson: existsSync(pkgPath),
                name: name || entry.name,
                publishedAppId: null,
                publishedAt: null,
                publishedVersion: null,
                previewAppId: null,
              });
            } else {
              // No index.html here — scan one level deeper
              await scanDir(dirPath, relFolder, depth + 1);
            }
          }
        } catch {
          // directory may not exist
        }
      };

      await scanDir(wsPath, '', 1);

      // Check which detected apps are already published or previewed
      const knownApps = await prisma.published_apps.findMany({
        where: {
          org_id: request.user!.orgId,
          session_id: id,
          status: { in: ['published', 'preview'] },
        },
        select: { id: true, status: true, metadata: true, published_at: true, name: true, version: true },
      });

      // Build maps from source_folder → app record
      const publishedMap = new Map<string, { id: string; published_at: Date | null; version: string; name: string }>();
      const previewMap = new Map<string, { id: string; name: string }>();
      for (const pa of knownApps) {
        const meta = pa.metadata as Record<string, unknown> | null;
        const srcFolder = meta?.source_folder as string | undefined;
        if (!srcFolder) continue;
        if (pa.status === 'published') {
          publishedMap.set(srcFolder, { id: pa.id, published_at: pa.published_at, version: pa.version, name: pa.name });
        } else if (pa.status === 'preview') {
          previewMap.set(srcFolder, { id: pa.id, name: pa.name });
        }
      }

      // Enrich detected apps with published/preview status.
      // Use the DB name (set by user during publish) over the package.json name
      // so that user-edited names survive page refreshes.
      for (const app of apps) {
        const folder = app.folder === '.' ? '.' : app.folder;
        const pubMatch = publishedMap.get(folder);
        app.publishedAppId = pubMatch?.id || null;
        app.publishedAt = pubMatch?.published_at?.toISOString() || null;
        app.publishedVersion = pubMatch?.version || null;
        app.previewAppId = previewMap.get(folder)?.id || null;

        // Prefer the user-edited name from the most recent publish/preview
        const dbName = pubMatch?.name || previewMap.get(folder)?.name;
        if (dbName) {
          app.name = dbName;
        }
      }

      return reply.status(200).send({ apps });
    },
  );

  // ==========================================================================
  // Session-level MCP Server Management
  // ==========================================================================

  /**
   * GET /api/chat/sessions/:id/mcp-servers
   * List MCP servers configured in the session's .claude/settings.json.
   */
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id/mcp-servers',
    {
      preHandler: [authenticate],
      schema: {
        description: 'List MCP servers in the session workspace settings',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);
      if (!session.business_scope_id) {
        return reply.status(200).send({ servers: [] });
      }

      const content = await workspaceManager.readWorkspaceFile(
        request.user!.orgId, session.business_scope_id, session.id,
        '.claude/settings.json',
      );
      if (!content) return reply.status(200).send({ servers: [] });

      try {
        const settings = JSON.parse(content);
        const mcpServers = settings.mcpServers ?? {};
        const servers = Object.entries(mcpServers).map(([name, cfg]) => ({
          name,
          ...(cfg as Record<string, unknown>),
        }));
        return reply.status(200).send({ servers });
      } catch {
        return reply.status(200).send({ servers: [] });
      }
    },
  );

  /**
   * PUT /api/chat/sessions/:id/mcp-servers
   * Add or update an MCP server in the session's .claude/settings.json.
   */
  fastify.put<{ Params: { id: string }; Body: { name: string; config: Record<string, unknown> } }>(
    '/sessions/:id/mcp-servers',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Add or update an MCP server in the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['name', 'config'],
          properties: {
            name: { type: 'string', minLength: 1 },
            config: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const session = await chatService.getSessionById(id, request.user!.orgId);
      if (!session.business_scope_id) {
        throw AppError.validation('Session has no business scope');
      }

      // Read existing settings
      const content = await workspaceManager.readWorkspaceFile(
        request.user!.orgId, session.business_scope_id, session.id,
        '.claude/settings.json',
      );
      let settings: Record<string, unknown> = {};
      if (content) {
        try { settings = JSON.parse(content); } catch { /* start fresh */ }
      }

      // Merge in the new MCP server
      const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
      mcpServers[request.body.name] = request.body.config;
      settings.mcpServers = mcpServers;

      await workspaceManager.writeWorkspaceFile(
        request.user!.orgId, session.business_scope_id, session.id,
        '.claude/settings.json',
        JSON.stringify(settings, null, 2),
      );

      return reply.status(200).send({ success: true, name: request.body.name });
    },
  );

  /**
   * DELETE /api/chat/sessions/:id/mcp-servers/:name
   * Remove an MCP server from the session's .claude/settings.json.
   */
  fastify.delete<{ Params: { id: string; name: string } }>(
    '/sessions/:id/mcp-servers/:name',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Remove an MCP server from the session workspace',
        tags: ['Chat'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const serverName = request.params.name;
      const session = await chatService.getSessionById(id, request.user!.orgId);
      if (!session.business_scope_id) {
        throw AppError.validation('Session has no business scope');
      }

      const content = await workspaceManager.readWorkspaceFile(
        request.user!.orgId, session.business_scope_id, session.id,
        '.claude/settings.json',
      );
      if (!content) return reply.status(204).send();

      let settings: Record<string, unknown> = {};
      try { settings = JSON.parse(content); } catch { return reply.status(204).send(); }

      const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
      delete mcpServers[serverName];
      settings.mcpServers = mcpServers;

      await workspaceManager.writeWorkspaceFile(
        request.user!.orgId, session.business_scope_id, session.id,
        '.claude/settings.json',
        JSON.stringify(settings, null, 2),
      );

      return reply.status(204).send();
    },
  );

  // ==========================================================================
  // Star / Favorite endpoints (明星案例)
  // ==========================================================================

  /** PUT /api/chat/sessions/:id/star — Star a session */
  fastify.put<{ Params: { id: string }; Body: { category?: string } }>(
    '/sessions/:id/star',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { chatSessionRepository } = await import('../repositories/chat.repository.js');
      const result = await chatSessionRepository.star(
        request.params.id,
        request.user!.orgId,
        request.user!.id,
        request.body?.category,
      );
      if (!result) return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' });
      return reply.send({ data: result });
    },
  );

  /** PUT /api/chat/sessions/:id/unstar — Unstar a session */
  fastify.put<{ Params: { id: string } }>(
    '/sessions/:id/unstar',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { chatSessionRepository } = await import('../repositories/chat.repository.js');
      const result = await chatSessionRepository.unstar(
        request.params.id,
        request.user!.orgId,
      );
      if (!result) return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' });
      return reply.send({ data: result });
    },
  );

  /** PUT /api/chat/sessions/:id/star-category — Update star category */
  fastify.put<{ Params: { id: string }; Body: { category: string | null } }>(
    '/sessions/:id/star-category',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { chatSessionRepository } = await import('../repositories/chat.repository.js');
      const result = await chatSessionRepository.updateStarCategory(
        request.params.id,
        request.user!.orgId,
        request.body?.category ?? null,
      );
      if (!result) return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' });
      return reply.send({ data: result });
    },
  );

  /** GET /api/chat/sessions/starred — List all starred sessions */
  fastify.get<{ Querystring: { scope_id?: string; user_id?: string } }>(
    '/sessions/starred',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { chatSessionRepository } = await import('../repositories/chat.repository.js');
      const isAdmin = request.user!.role === 'owner' || request.user!.role === 'admin';

      const sessions = await chatSessionRepository.findStarred(
        request.user!.orgId,
        {
          scopeId: request.query.scope_id,
          // Non-admin users can only see their own starred sessions
          userId: isAdmin ? request.query.user_id : request.user!.id,
        },
      );

      return reply.send({ data: sessions });
    },
  );
}
