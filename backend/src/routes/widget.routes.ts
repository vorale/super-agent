/**
 * Widget Routes — External API for the chat widget.
 * Uses API Key authentication (not JWT).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { widgetAuthService } from '../services/widget-auth.service.js';
import { supportService } from '../services/support.service.js';
import { chatService } from '../services/chat.service.js';
import { supportWorkflowService } from '../services/support-workflow.service.js';
import { prisma } from '../config/database.js';

const WIDGET_USER_ID = '00000000-0000-0000-0000-000000000000'; // System user for widget sessions

interface WidgetAuthRequest {
  Headers: { authorization?: string };
}

interface CreateWidgetSessionRequest extends WidgetAuthRequest {
  Body: {
    scopeId?: string;
    customerExternalId?: string;
    customerName?: string;
    customerEmail?: string;
  };
}

interface WidgetMessageRequest extends WidgetAuthRequest {
  Params: { sessionId: string };
  Body: { message: string };
}

interface WidgetFaqSearchRequest extends WidgetAuthRequest {
  Querystring: { q?: string; category?: string; limit?: number };
}

/**
 * Extract and validate API key from Authorization header.
 */
async function authenticateWidget(request: FastifyRequest, reply: FastifyReply): Promise<{ organizationId: string }> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid authorization header', code: 'UNAUTHORIZED' });
    throw new Error('Unauthorized');
  }
  const apiKey = authHeader.substring(7);
  const result = await widgetAuthService.authenticate(apiKey);
  if (!result.valid) {
    reply.status(401).send({ error: result.error, code: 'UNAUTHORIZED' });
    throw new Error('Unauthorized');
  }
  return { organizationId: result.organizationId! };
}

export async function widgetRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/v1/widget/sessions — Create or resume a widget session
  fastify.post('/sessions', async (request: FastifyRequest<CreateWidgetSessionRequest>, reply: FastifyReply) => {
    const { organizationId } = await authenticateWidget(request, reply);
    const body = request.body;

    // Create or find customer profile
    let customerId: string | undefined;
    if (body.customerName) {
      const customer = await supportService.createOrUpdateCustomer({
        organizationId,
        externalId: body.customerExternalId,
        name: body.customerName,
        email: body.customerEmail,
        sourceChannel: 'web_widget',
      });
      customerId = customer.id;
    }

    // Create support conversation
    const conversation = await supportService.createConversation({
      organizationId,
      channelType: 'web_widget',
      customerId,
    });

    // Create a chat session linked to this support conversation
    let chatSession;
    if (body.scopeId) {
      chatSession = await chatService.createSession(
        { business_scope_id: body.scopeId },
        organizationId,
        WIDGET_USER_ID,
      );
    } else {
      chatSession = await chatService.createSession(
        {},
        organizationId,
        WIDGET_USER_ID,
      );
    }

    // Link chat session to support conversation
    await supportService.updateConversation(
      conversation.id,
      organizationId,
      { session_id: chatSession.id } as any,
    );

    return reply.status(201).send({
      conversationId: conversation.id,
      sessionId: chatSession.id,
      customerId,
      status: conversation.status,
    });
  });

  // GET /api/v1/widget/sessions/:id/stream — SSE stream for chat
  fastify.get('/sessions/:id/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = await authenticateWidget(request, reply);
    const { id } = request.params as { id: string };

    const conversation = await supportService.getConversation(id, organizationId);
    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', conversationId: id })}\n\n`);

    // Keep alive
    const keepAlive = setInterval(() => {
      reply.raw.write(':keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  // POST /api/v1/widget/sessions/:id/messages — Send a message and get AI response
  fastify.post('/sessions/:id/messages', async (request: FastifyRequest<WidgetMessageRequest>, reply: FastifyReply) => {
    const { organizationId } = await authenticateWidget(request, reply);
    const { id } = request.params as { id: string };
    const { message } = request.body;

    if (!message?.trim()) {
      return reply.status(400).send({ error: 'Message cannot be empty' });
    }

    const conversation = await supportService.getConversation(id, organizationId);
    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    // Get or create chat session for this support conversation
    let sessionId = conversation.session_id;
    if (!sessionId) {
      const scopes = await prisma.business_scopes.findMany({
        where: { organization_id: organizationId, deleted_at: null },
        take: 1,
      });
      const scopeId = scopes[0]?.id;
      if (!scopeId) {
        return reply.status(400).send({ error: 'No business scope configured for customer service' });
      }
      const chatSession = await chatService.createSession(
        { business_scope_id: scopeId },
        organizationId,
        WIDGET_USER_ID,
      );
      sessionId = chatSession.id;
      await supportService.updateConversation(id, organizationId, { session_id: sessionId } as any);
    }

    // Try the support workflow first
    try {
      const scopeId = (await prisma.chat_sessions.findUnique({
        where: { id: sessionId },
        select: { business_scope_id: true },
      }))?.business_scope_id;

      const workflowExecutionId = await supportWorkflowService.executeForMessage({
        organizationId,
        businessScopeId: scopeId ?? undefined,
        userId: WIDGET_USER_ID,
        message,
        sessionId,
        conversationId: id,
      });

      // The workflow runs asynchronously via queue.
      // For synchronous widget response, fall through to direct AI call
      // and let the workflow handle background tasks (logging, analytics, etc.)
      console.log(`[Widget] Workflow ${workflowExecutionId} started for conversation ${id}`);
    } catch (workflowErr) {
      // Workflow not available — fall through to direct AI call
      console.warn('[Widget] Workflow execution failed, using direct AI:', workflowErr);
    }

    // Direct AI response for synchronous widget reply
    try {
      const result = await chatService.processMessage({
        sessionId,
        businessScopeId: (await prisma.chat_sessions.findUnique({
          where: { id: sessionId },
          select: { business_scope_id: true },
        }))?.business_scope_id ?? undefined,
        message,
        organizationId,
        userId: WIDGET_USER_ID,
      });

      return reply.send({
        reply: result.text,
        sessionId: result.sessionId,
        conversationId: id,
        status: conversation.status,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'AI service unavailable';
      console.error('[Widget] AI response failed:', errorMessage);

      return reply.status(503).send({
        error: 'AI service temporarily unavailable',
        reply: 'Sorry, I am currently unable to process your request. Please try again in a moment.',
        conversationId: id,
      });
    }
  });

  // GET /api/v1/widget/faq/search — Search FAQ
  fastify.get('/faq/search', async (request: FastifyRequest<WidgetFaqSearchRequest>, reply: FastifyReply) => {
    const { organizationId } = await authenticateWidget(request, reply);
    const { q, category, limit } = request.query;

    // TODO: Integrate with RAG service for semantic search
    // For now, return empty results
    return reply.send({
      results: [],
      query: q,
      total: 0,
    });
  });
}
