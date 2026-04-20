/**
 * Support Settings Routes — Configuration APIs for escalation rules,
 * response templates, business hours, and CSAT surveys.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { escalationService } from '../services/escalation.service.js';
import { surveyService } from '../services/survey.service.js';
import { businessHoursService } from '../services/business-hours.service.js';
import { supportMetricsService } from '../services/support-metrics.service.js';
import { prisma } from '../config/database.js';

// ── Escalation Rules ─────────────────────────────────────────────

interface CreateEscalationRuleRequest {
  Body: {
    businessScopeId?: string;
    name: string;
    description?: string;
    conditions: { logic?: string; rules: unknown[] };
    actions: unknown[];
    priority?: number;
  };
}

interface UpdateEscalationRuleRequest {
  Params: { id: string };
  Body: Record<string, unknown>;
}

// ── Response Templates ───────────────────────────────────────────

interface CreateTemplateRequest {
  Body: {
    businessScopeId?: string;
    name: string;
    content: string;
    category?: string;
    shortcut?: string;
    channelTypes?: string[];
  };
}

interface UpdateTemplateRequest {
  Params: { id: string };
  Body: Record<string, unknown>;
}

// ── Business Hours ───────────────────────────────────────────────

interface UpsertBusinessHoursRequest {
  Body: {
    name: string;
    timezone?: string;
    schedule: Record<string, { start?: string; end?: string } | null>;
    holidayDates?: string[];
    offlineMessage?: string;
  };
}

// ── CSAT ─────────────────────────────────────────────────────────

interface SubmitSurveyRequest {
  Body: {
    conversationId: string;
    customerId?: string;
    rating: number;
    comment?: string;
  };
}

export async function supportSettingsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Escalation Rules ──────────────────────────────────────────

  fastify.get('/escalation-rules', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const rules = await escalationService.listRules(organizationId);
    return reply.send({ rules });
  });

  fastify.post('/escalation-rules', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<CreateEscalationRuleRequest>, reply: FastifyReply) => {
    const { organizationId, id: userId } = (request as any).user;
    const { businessScopeId, name, description, conditions, actions, priority } = request.body;
    const rule = await escalationService.createRule({
      organizationId,
      businessScopeId,
      name,
      description,
      conditions: conditions as any,
      actions: actions as any,
      priority,
      createdById: userId,
    });
    return reply.status(201).send({ rule });
  });

  fastify.put('/escalation-rules/:id', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<UpdateEscalationRuleRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const rule = await escalationService.updateRule(request.params.id, organizationId, request.body);
    if (!rule) return reply.status(404).send({ error: 'Rule not found' });
    return reply.send({ rule });
  });

  fastify.delete('/escalation-rules/:id', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    await escalationService.deleteRule(request.params.id, organizationId);
    return reply.send({ success: true });
  });

  // ── Response Templates ────────────────────────────────────────

  fastify.get('/templates', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const templates = await prisma.response_templates.findMany({
      where: { organization_id: organizationId },
      orderBy: { category: 'asc' },
    });
    return reply.send({ templates });
  });

  fastify.post('/templates', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<CreateTemplateRequest>, reply: FastifyReply) => {
    const { organizationId, id: userId } = (request as any).user;
    const template = await prisma.response_templates.create({
      data: {
        organization_id: organizationId,
        business_scope_id: request.body.businessScopeId ?? null,
        name: request.body.name,
        content: request.body.content,
        category: request.body.category ?? null,
        shortcut: request.body.shortcut ?? null,
        channel_types: request.body.channelTypes ?? [],
        created_by: userId,
      },
    });
    return reply.status(201).send({ template });
  });

  fastify.put('/templates/:id', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<UpdateTemplateRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    await prisma.response_templates.update({
      where: { id: request.params.id, organization_id: organizationId },
      data: request.body as any,
    });
    const template = await prisma.response_templates.findUnique({ where: { id: request.params.id } });
    if (!template) return reply.status(404).send({ error: 'Template not found' });
    return reply.send({ template });
  });

  fastify.delete('/templates/:id', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    await prisma.response_templates.delete({ where: { id: request.params.id, organization_id: organizationId } });
    return reply.send({ success: true });
  });

  // ── Business Hours ────────────────────────────────────────────

  fastify.get('/business-hours', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const config = await businessHoursService.getConfig(organizationId);
    return reply.send({ config });
  });

  fastify.post('/business-hours', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest<UpsertBusinessHoursRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const config = await businessHoursService.upsertConfig({
      organizationId,
      ...request.body,
    });
    return reply.send({ config });
  });

  // ── CSAT Surveys ──────────────────────────────────────────────

  fastify.post('/surveys', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<SubmitSurveyRequest>, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const survey = await surveyService.submitSurvey({
      organizationId,
      ...request.body,
    });
    return reply.status(201).send({ survey });
  });

  fastify.get('/surveys/stats', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const days = Number((request.query as any).days) || 30;
    const stats = await surveyService.getStats(organizationId, { days });
    return reply.send(stats);
  });

  fastify.get('/surveys', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const limit = Number((request.query as any).limit) || 20;
    const offset = Number((request.query as any).offset) || 0;
    const surveys = await surveyService.listRecent(organizationId, { limit, offset });
    return reply.send({ surveys });
  });

  // ── Metrics ───────────────────────────────────────────────────

  fastify.get('/metrics', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const q = request.query as any;
    const metrics = await supportMetricsService.getMetrics(organizationId, {
      days: q.days ? Number(q.days) : undefined,
      startDate: q.startDate,
      endDate: q.endDate,
    });
    return reply.send(metrics);
  });

  fastify.post('/metrics/aggregate', {
    preHandler: [authenticate, requireModifyAccess],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { organizationId } = (request as any).user;
    const body = request.body as any;
    await supportMetricsService.aggregateDaily(
      body.date ? new Date(body.date) : undefined,
      organizationId,
    );
    return reply.send({ success: true });
  });
}
