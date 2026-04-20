/**
 * Widget Routes — External API for the chat widget.
 * Uses API Key authentication (not JWT).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { widgetAuthService } from '../services/widget-auth.service.js';
import { supportService } from '../services/support.service.js';
import { chatService } from '../services/chat.service.js';

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

    return reply.status(201).send({
      conversationId: conversation.id,
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

  // POST /api/v1/widget/sessions/:id/messages — Send a message
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

    // TODO: Integrate with chatService for AI response
    // For now, just acknowledge the message
    return reply.send({
      acknowledged: true,
      conversationId: id,
      status: conversation.status,
    });
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
