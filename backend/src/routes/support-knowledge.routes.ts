/**
 * Support Knowledge Routes — Self-learning and knowledge management APIs.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { supportKnowledgeService } from '../services/support-knowledge.service.js';

export async function supportKnowledgeRoutes(fastify: FastifyInstance): Promise<void> {

  // ── FAQ Drafts ──────────────────────────────────────────────

  // GET /api/support/knowledge/drafts — List pending draft FAQs
  fastify.get('/knowledge/drafts', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const drafts = await supportKnowledgeService.getDrafts(organizationId);
    return reply.send({ drafts });
  });

  // POST /api/support/knowledge/drafts/:id/publish — Publish a draft FAQ
  fastify.post('/knowledge/drafts/:id/publish', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: { question?: string; answer?: string; category?: string } }>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const faq = await supportKnowledgeService.publishDraft(
      request.params.id,
      organizationId,
      request.body,
    );
    return reply.send({ faq });
  });

  // DELETE /api/support/knowledge/drafts/:id — Reject and delete a draft
  fastify.delete('/knowledge/drafts/:id', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    await supportKnowledgeService.rejectDraft(request.params.id, organizationId);
    return reply.send({ success: true });
  });

  // ── Distillation ─────────────────────────────────────────────

  // POST /api/support/knowledge/distill — Distill a specific conversation
  fastify.post('/knowledge/distill', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<{ Body: { conversationId: string } }>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const pairs = await supportKnowledgeService.distillConversation(
      request.body.conversationId,
      organizationId,
    );
    return reply.send({ extracted: pairs.length, pairs });
  });

  // POST /api/support/knowledge/distill-all — Batch distill resolved conversations
  fastify.post('/knowledge/distill-all', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const body = request.body as any;
    const extracted = await supportKnowledgeService.distillResolvedConversations(
      organizationId,
      { hours: body.hours },
    );
    return reply.send({ extracted });
  });

  // ── Knowledge Gaps ───────────────────────────────────────────

  // GET /api/support/knowledge/gaps — Detect knowledge gaps
  fastify.get('/knowledge/gaps', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const days = Number((request.query as any).days) || 7;
    const gaps = await supportKnowledgeService.detectGaps(organizationId, { days });
    return reply.send({ gaps, total: gaps.length });
  });

  // GET /api/support/knowledge/gap-report — Generate full gap report
  fastify.get('/knowledge/gap-report', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const days = Number((request.query as any).days) || 7;
    const report = await supportKnowledgeService.generateGapReport(organizationId, { days });
    return reply.send(report);
  });
}
