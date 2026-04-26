/**
 * Widget Routes
 * External API for customer-facing widget (API Key authentication).
 * Prefix: /api/v1/widget
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { widgetAuthService, WIDGET_SYSTEM_USER_ID } from '../services/widget-auth.service.js';
import { supportService } from '../services/support.service.js';
import { chatService } from '../services/chat.service.js';
import { supportWorkflowService } from '../services/support-workflow.service.js';
import { escalationService } from '../services/escalation.service.js';
import { prisma } from '../config/database.js';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw AppError.validation('Validation failed', result.error.issues);
  return result.data;
}

async function widgetAuth(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or invalid Authorization header');
  }
  const token = authHeader.slice(7);
  const auth = await widgetAuthService.authenticate(token);
  (request as any).widgetAuth = auth;
}

// Request types
interface CreateSessionRequest { Body: { scopeId?: string; customerExternalId?: string; customerName?: string; customerEmail?: string } }
interface SessionIdParam { Params: { id: string } }
interface SendMessageRequest { Params: { id: string }; Body: { content: string } }
interface FaqSearchRequest { Querystring: { q?: string } }

export async function widgetRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/widget/sessions
   */
  fastify.post<CreateSessionRequest>('/sessions', { preHandler: [widgetAuth] },
    async (request: FastifyRequest<CreateSessionRequest>, reply: FastifyReply) => {
      const auth = (request as any).widgetAuth;
      const body = validate(z.object({
        scopeId: z.string().uuid().optional(),
        customerExternalId: z.string().optional(),
        customerName: z.string().optional(),
        customerEmail: z.string().email().optional(),
      }), request.body ?? {});

      let customerId: string | undefined;
      if (body.customerExternalId) {
        const customer = await supportService.upsertCustomer(auth.organizationId, {
          externalId: body.customerExternalId,
          name: body.customerName ?? 'Customer',
          email: body.customerEmail,
          sourceChannel: 'web_widget',
        });
        customerId = customer.id;
      }

      const session = await chatService.createSession(
        { business_scope_id: body.scopeId, context: { widget: true, customerExternalId: body.customerExternalId } },
        auth.organizationId,
        WIDGET_SYSTEM_USER_ID,
      );

      const conversation = await supportService.createConversation(auth.organizationId, {
        sessionId: session.id,
        channelType: 'web_widget',
        customerId,
      });

      return reply.status(201).send({
        conversationId: conversation.id,
        sessionId: session.id,
        customerId: customerId ?? null,
        status: conversation.status,
      });
    });

  /**
   * GET /api/v1/widget/sessions/:id/stream
   */
  fastify.get<SessionIdParam>('/sessions/:id/stream', { preHandler: [widgetAuth] },
    async (_request: FastifyRequest<SessionIdParam>, reply: FastifyReply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const heartbeat = setInterval(() => {
        try { reply.raw.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
      }, 15_000);

      reply.raw.on('close', () => clearInterval(heartbeat));
      reply.raw.write(': connected\n\n');
    });

  /**
   * POST /api/v1/widget/sessions/:id/messages
   */
  fastify.post<SendMessageRequest>('/sessions/:id/messages', { preHandler: [widgetAuth] },
    async (request: FastifyRequest<SendMessageRequest>, reply: FastifyReply) => {
      const auth = (request as any).widgetAuth;
      const { content } = validate(z.object({ content: z.string().min(1) }), request.body);
      const sessionId = request.params.id;

      const conversation = await prisma.support_conversations.findFirst({
        where: { session_id: sessionId, organization_id: auth.organizationId },
      });

      if (!conversation) throw AppError.notFound('Session not found');

      await prisma.chat_messages.create({
        data: {
          organization_id: auth.organizationId,
          session_id: sessionId,
          type: 'user',
          content,
          metadata: { source: 'widget', customerId: conversation.customer_id },
        },
      });

      // Fire-and-forget: trigger workflow execution and escalation evaluation
      supportWorkflowService.executeForMessage(auth.organizationId, {
        message: content,
        sessionId,
        conversationId: conversation.id,
        businessScopeId: undefined,
      }).catch(() => {});

      escalationService.evaluateAndEscalate(conversation.id, auth.organizationId).catch(() => {});

      try {
        const session = await chatService.getSessionById(sessionId, auth.organizationId);
        const scopeId = session.business_scope_id;

        if (!scopeId) {
          return reply.status(503).send({
            error: 'AI service is not configured for this session.',
            sessionId, conversationId: conversation.id, status: 'pending_agent',
          });
        }

        const aiResult = await chatService.processMessage({
          sessionId, businessScopeId: scopeId, message: content,
          organizationId: auth.organizationId, userId: WIDGET_SYSTEM_USER_ID,
        });

        return reply.send({
          reply: aiResult.text, sessionId,
          conversationId: conversation.id, status: conversation.status,
        });
      } catch {
        return reply.status(503).send({
          error: 'AI service is temporarily unavailable.',
          sessionId, conversationId: conversation.id, status: 'pending_agent',
        });
      }
    });

  /**
   * GET /api/v1/widget/faq/search
   */
  fastify.get<FaqSearchRequest>('/faq/search', { preHandler: [widgetAuth] },
    async (_request: FastifyRequest<FaqSearchRequest>, reply: FastifyReply) => {
      return reply.send({ results: [], total: 0 });
    });
}
