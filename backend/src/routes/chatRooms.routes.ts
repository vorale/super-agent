/**
 * Chat Room Routes
 * REST API endpoints for group chat room management.
 *
 * Group chat always uses the local Claude runtime (ClaudeAgentRuntime),
 * regardless of the AGENT_RUNTIME env var, to avoid AgentCore latency
 * and keep the interactive group experience responsive.
 */

import { FastifyInstance } from 'fastify';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { chatRoomService } from '../services/chat-room.service.js';
import { ClaudeAgentRuntime } from '../services/agent-runtime-claude.js';
import { ChatService } from '../services/chat.service.js';

/**
 * Dedicated ChatService instance for group chat — always uses local Claude runtime.
 * This bypasses the global AGENT_RUNTIME setting (which may be 'agentcore').
 */
const roomChatService = new ChatService(new ClaudeAgentRuntime());

export async function chatRoomRoutes(fastify: FastifyInstance): Promise<void> {

  // ==========================================================================
  // Room Lifecycle
  // ==========================================================================

  /**
   * POST /api/chat/rooms — Create a group chat room
   */
  fastify.post<{
    Body: {
      title?: string;
      business_scope_id?: string;
      agent_ids: string[];
    };
  }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const room = await chatRoomService.createRoom(
        request.user!.orgId,
        request.user!.id,
        {
          title: request.body.title,
          businessScopeId: request.body.business_scope_id,
          agentIds: request.body.agent_ids,
        },
      );
      return reply.status(201).send(room);
    }
  );

  /**
   * POST /api/chat/rooms/from-scope — Create room from all agents in a scope
   */
  fastify.post<{ Body: { business_scope_id: string } }>(
    '/from-scope',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const room = await chatRoomService.createRoomFromScope(
        request.user!.orgId,
        request.user!.id,
        request.body.business_scope_id,
      );
      return reply.status(201).send(room);
    }
  );

  /**
   * POST /api/chat/rooms/cross-scope — Create a cross-scope group chat room
   * Body: { title?: string, primary_scope_id?: string, members: [{ agent_id, scope_id }] }
   */
  fastify.post<{
    Body: {
      title?: string;
      primary_scope_id?: string;
      members: Array<{ agent_id: string; scope_id: string }>;
    };
  }>(
    '/cross-scope',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const room = await chatRoomService.createCrossScopeRoom(
        request.user!.orgId,
        request.user!.id,
        {
          title: request.body.title,
          primaryScopeId: request.body.primary_scope_id,
          members: request.body.members.map(m => ({
            agentId: m.agent_id,
            scopeId: m.scope_id,
          })),
        },
      );
      return reply.status(201).send(room);
    }
  );

  /**
   * GET /api/chat/rooms/:roomId — Get room details with members
   */
  fastify.get<{ Params: { roomId: string } }>(
    '/:roomId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { chatSessionRepository } = await import('../repositories/chat.repository.js');
      const session = await chatSessionRepository.findById(request.params.roomId, request.user!.orgId);
      if (!session) return reply.status(404).send({ error: 'Room not found' });

      const members = await chatRoomService.getMembers(request.user!.orgId, request.params.roomId);
      return reply.status(200).send({ ...session, members });
    }
  );

  /**
   * DELETE /api/chat/rooms/:roomId — Delete a room
   */
  fastify.delete<{ Params: { roomId: string } }>(
    '/:roomId',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      const { chatSessionRepository } = await import('../repositories/chat.repository.js');
      await chatSessionRepository.delete(request.params.roomId, request.user!.orgId);
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // Member Management
  // ==========================================================================

  /**
   * GET /api/chat/rooms/:roomId/members
   */
  fastify.get<{ Params: { roomId: string } }>(
    '/:roomId/members',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const members = await chatRoomService.getMembers(request.user!.orgId, request.params.roomId);
      return reply.status(200).send({ members });
    }
  );

  /**
   * POST /api/chat/rooms/:roomId/members — Add agent to room (supports cross-scope)
   */
  fastify.post<{ Params: { roomId: string }; Body: { agent_id: string; source_scope_id?: string } }>(
    '/:roomId/members',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      await chatRoomService.addMember(
        request.user!.orgId,
        request.params.roomId,
        request.body.agent_id,
        request.user!.id,
        request.body.source_scope_id,
      );
      return reply.status(201).send({ ok: true });
    }
  );

  /**
   * DELETE /api/chat/rooms/:roomId/members/:agentId — Remove agent from room
   */
  fastify.delete<{ Params: { roomId: string; agentId: string } }>(
    '/:roomId/members/:agentId',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      await chatRoomService.removeMember(
        request.user!.orgId,
        request.params.roomId,
        request.params.agentId,
      );
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // Group Chat Messaging
  // ==========================================================================

  /**
   * POST /api/chat/rooms/:roomId/messages — Send message, route to agent, and get response
   */
  /**
   * POST /api/chat/rooms/:roomId/messages — Send message, route to agent, stream response via SSE.
   *
   * Returns SSE stream with events:
   *   - route: { type: 'route', ...routeDecision }
   *   - assistant: { type: 'assistant', content: ContentBlock[] }
   *   - done: data: [DONE]
   *   - error: { type: 'error', message: string }
   *
   * The user's original message (not the contextual prompt) is persisted.
   * The AI response is persisted as plain text (not raw content blocks).
   */
  fastify.post<{
    Params: { roomId: string };
    Body: { content: string; mention_agent_id?: string };
  }>(
    '/:roomId/messages',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const orgId = request.user!.orgId;
      const roomId = request.params.roomId;
      const { content, mention_agent_id } = request.body;

      const { chatMessageRepository, chatSessionRepository } = await import('../repositories/chat.repository.js');
      const { formatSSEEvent } = await import('../utils/sse.js');

      // Persist the user's original message (not the contextual prompt)
      await chatMessageRepository.create({
        session_id: roomId,
        type: 'user',
        content,
        agent_id: null,
        mention_agent_id: mention_agent_id ?? null,
        metadata: {},
      }, orgId);

      // Route the message to the appropriate agent
      const route = await chatRoomService.routeMessage(orgId, roomId, content, mention_agent_id);

      // Resolve the scope for the target agent.
      // In cross-scope rooms, use the agent's source_scope_id from room membership.
      // Falls back to the session's business_scope_id.
      const session = await chatSessionRepository.findById(roomId, orgId);
      const { chatRoomMemberRepository: memberRepo } = await import('../repositories/chat-room-member.repository.js');
      const members = await memberRepo.findBySession(roomId);
      const targetMember = members.find(m => m.agent_id === route.targetAgentId);
      const scopeId = targetMember?.source_scope_id
        ?? targetMember?.agent.business_scope_id
        ?? session?.business_scope_id;

      if (!scopeId) {
        return reply.status(400).send({ route, error: 'Room has no business scope' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send route decision immediately so frontend knows who's answering
      reply.raw.write(formatSSEEvent({
        data: JSON.stringify({ type: 'route', ...route }),
      }));

      // Build room context for the agent
      const roomContext = await chatRoomService.buildRoomContext(orgId, roomId, route.targetAgentId);
      const contextualMessage = `${roomContext}\n\n---\nUser message: ${content}`;

      // Prepare workspace + run conversation via local Claude runtime
      try {
        const result = await roomChatService.prepareScopeSessionPublic(orgId, request.user!.id, {
          businessScopeId: scopeId,
          sessionId: roomId,
          message: contextualMessage,
        });

        const { agentConfig, skills, claudeSessionId, workspacePath, pluginPaths, mcpServers } = result;
        const { ClaudeAgentRuntime } = await import('../services/agent-runtime-claude.js');
        const claudeRuntime = new ClaudeAgentRuntime();

        const generator = claudeRuntime.runConversation(
          {
            agentId: agentConfig.id,
            sessionId: roomId,
            providerSessionId: claudeSessionId,
            message: contextualMessage,
            organizationId: orgId,
            userId: request.user!.id,
            workspacePath,
            scopeId,
          },
          agentConfig,
          skills,
          pluginPaths.length > 0 ? pluginPaths : undefined,
          Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        );

        const allContentBlocks: import('../services/claude-agent.service.js').ContentBlock[] = [];

        for await (const event of generator) {
          if (event.type === 'session_start' && event.sessionId) {
            chatSessionRepository.updateClaudeSessionId(roomId, orgId, event.sessionId).catch(() => {});
          }
          if (event.type === 'assistant' && event.content) {
            allContentBlocks.push(...event.content);
            try {
              reply.raw.write(formatSSEEvent({
                data: JSON.stringify({ type: 'assistant', content: event.content }),
              }));
            } catch { break; }
          }
          if (event.type === 'error') {
            try {
              reply.raw.write(formatSSEEvent({
                data: JSON.stringify({ type: 'error', message: event.message }),
              }));
            } catch { break; }
          }
        }

        // Extract plain text and persist AI response
        const text = allContentBlocks
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('\n');

        if (text) {
          await chatMessageRepository.create({
            session_id: roomId,
            type: 'ai',
            content: text,
            agent_id: route.targetAgentId,
            mention_agent_id: null,
            metadata: { routedBy: route.routedBy, confidence: route.confidence },
          }, orgId).catch(() => {});
        }

        // Auto-distill memories from group chat conversation
        if (allContentBlocks.length > 0) {
          const { distillationService } = await import('../services/distillation.service.js');
          distillationService.enqueue({
            organizationId: orgId,
            scopeId,
            sessionId: roomId,
            agentId: route.targetAgentId,
            contentBlocks: allContentBlocks,
            userMessage: content,
          }).catch(() => {});
        }
      } catch (err) {
        console.error(`[ROOM] Stream failed for room ${roomId}:`, err instanceof Error ? err.message : err);
        try {
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({ type: 'error', message: 'Agent failed to respond. Please try again.' }),
          }));
        } catch { /* client gone */ }
      }

      try {
        reply.raw.write(formatSSEEvent({ data: '[DONE]' }));
        reply.raw.end();
      } catch { /* client gone */ }
    }
  );

  /**
   * GET /api/chat/rooms/:roomId/messages — Get message history
   */
  fastify.get<{ Params: { roomId: string }; Querystring: { limit?: number; before?: string } }>(
    '/:roomId/messages',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { chatMessageRepository } = await import('../repositories/chat.repository.js');
      const messages = await chatMessageRepository.findBySession(
        request.user!.orgId,
        request.params.roomId,
        {
          limit: Number(request.query.limit) || 50,
          before: request.query.before ? new Date(request.query.before) : undefined,
        },
      );
      return reply.status(200).send({ messages: messages.reverse() });
    }
  );

  // ==========================================================================
  // In-Room Agent Creation
  // ==========================================================================

  /**
   * POST /api/chat/rooms/:roomId/create-agent — Suggest a new agent for the room
   */
  fastify.post<{ Params: { roomId: string }; Body: { description: string } }>(
    '/:roomId/create-agent',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const result = await chatRoomService.suggestAgentForRoom(
        request.user!.orgId,
        request.params.roomId,
        request.body.description,
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * POST /api/chat/rooms/:roomId/create-agent/confirm — Create and add agent to room
   */
  fastify.post<{
    Params: { roomId: string };
    Body: { name: string; display_name: string; role?: string; system_prompt?: string; tools?: unknown[] };
  }>(
    '/:roomId/create-agent/confirm',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      const result = await chatRoomService.createAgentInRoom(
        request.user!.orgId,
        request.params.roomId,
        request.user!.id,
        request.body,
      );
      return reply.status(201).send(result);
    }
  );
}
