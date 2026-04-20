/**
 * Support Routes — Internal API for the customer service workspace.
 * Uses JWT authentication (same as other internal routes).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { supportService } from '../services/support.service.js';
import {
  faqArticleRepository,
  type FaqStatus,
} from '../repositories/faq.repository.js';

interface ListConversationsRequest {
  Querystring: {
    status?: string;
    channelType?: string;
    assignedAgentId?: string;
    priority?: string;
    skip?: number;
    take?: number;
  };
}

interface ConversationParamRequest {
  Params: { id: string };
}

interface AssignAgentRequest {
  Params: { id: string };
  Body: { agentId: string };
}

interface ResolveConversationRequest {
  Params: { id: string };
  Body: { notes?: string };
}

interface CreateFaqRequest {
  Body: {
    question: string;
    answer: string;
    category?: string;
    tags?: string[];
    businessScopeId?: string;
  };
}

interface UpdateFaqRequest {
  Params: { id: string };
  Body: {
    question?: string;
    answer?: string;
    category?: string;
    tags?: string[];
    status?: FaqStatus;
  };
}

interface ListFaqRequest {
  Querystring: {
    status?: string;
    category?: string;
    businessScopeId?: string;
  };
}

export async function supportRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Conversations ──────────────────────────────────────────

  // GET /api/support/conversations — List conversations (inbox)
  fastify.get('/conversations', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<ListConversationsRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const { status, channelType, assignedAgentId, priority, skip, take } = request.query;

    const conversations = await supportService.listConversations(organizationId, {
      status: status as any,
      channelType: channelType as any,
      assignedAgentId,
      priority: priority as any,
    }, {
      skip: Number(skip) || 0,
      take: Number(take) || 50,
    });

    return reply.send({ conversations });
  });

  // GET /api/support/conversations/:id — Get conversation detail
  fastify.get('/conversations/:id', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<ConversationParamRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const conversation = await supportService.getConversation(request.params.id, organizationId);

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    return reply.send({ conversation });
  });

  // PUT /api/support/conversations/:id/assign — Assign agent
  fastify.put('/conversations/:id/assign', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<AssignAgentRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const conversation = await supportService.assignAgent(
      request.params.id,
      organizationId,
      request.body.agentId,
    );
    return reply.send({ conversation });
  });

  // PUT /api/support/conversations/:id/resolve — Resolve conversation
  fastify.put('/conversations/:id/resolve', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<ResolveConversationRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const conversation = await supportService.resolveConversation(
      request.params.id,
      organizationId,
      request.body.notes,
    );
    return reply.send({ conversation });
  });

  // PUT /api/support/conversations/:id/close — Close conversation
  fastify.put('/conversations/:id/close', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<ConversationParamRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const conversation = await supportService.closeConversation(request.params.id, organizationId);
    return reply.send({ conversation });
  });

  // POST /api/support/conversations/:id/handoff — Request human handoff
  fastify.post('/conversations/:id/handoff', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<ConversationParamRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const conversation = await supportService.requestHumanHandoff(request.params.id, organizationId);
    return reply.send({ conversation });
  });

  // ── Customer Profiles ──────────────────────────────────────

  // GET /api/support/customers/:id — Get customer profile
  fastify.get('/customers/:id', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<ConversationParamRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const customer = await supportService.getCustomerProfile(request.params.id, organizationId);
    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found' });
    }
    const conversations = await supportService.getCustomerConversations(request.params.id, organizationId);
    return reply.send({ customer, conversations });
  });

  // ── FAQ ────────────────────────────────────────────────────

  // GET /api/support/faq — List FAQ articles
  fastify.get('/faq', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<ListFaqRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const { status, category, businessScopeId } = request.query;

    let articles;
    if (businessScopeId) {
      articles = await faqArticleRepository.findByScope(organizationId, businessScopeId);
    } else if (category) {
      articles = await faqArticleRepository.findByCategory(organizationId, category);
    } else if (status) {
      articles = await faqArticleRepository.findAll(organizationId, {
        where: { status } as any,
      });
    } else {
      articles = await faqArticleRepository.findPublished(organizationId);
    }

    return reply.send({ articles });
  });

  // POST /api/support/faq — Create FAQ article
  fastify.post('/faq', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<CreateFaqRequest>, reply: FastifyReply) => {
    const { organizationId, id: userId } = (request as any).user;
    const { question, answer, category, tags, businessScopeId } = request.body;

    const article = await faqArticleRepository.create({
      organization_id: organizationId,
      business_scope_id: businessScopeId ?? null,
      question,
      answer,
      category: category ?? null,
      tags: tags ?? [],
      status: 'published',
      created_by: userId,
    } as any);

    return reply.status(201).send({ article });
  });

  // PUT /api/support/faq/:id — Update FAQ article
  fastify.put('/faq/:id', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<UpdateFaqRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const { id } = request.params;
    const updates = request.body;

    await faqArticleRepository.update(id, organizationId, updates as any);
    const article = await faqArticleRepository.findById(id, organizationId);

    if (!article) {
      return reply.status(404).send({ error: 'FAQ article not found' });
    }

    return reply.send({ article });
  });
}
