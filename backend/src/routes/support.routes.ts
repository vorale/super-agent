/**
 * Support Routes
 * REST API endpoints for customer service workspace.
 * Prefix: /api/support
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { supportService } from '../services/support.service.js';
import { supportSettingsService } from '../services/support-settings.service.js';
import { supportKnowledgeService } from '../services/support-knowledge.service.js';
import { surveyService } from '../services/survey.service.js';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw AppError.validation('Validation failed', result.error.issues);
  return result.data;
}

// ============================================================================
// Request Types
// ============================================================================
interface ConvListRequest { Querystring: { status?: string; channelType?: string; assignedAgentId?: string; priority?: string; skip?: string; take?: string } }
interface IdParam { Params: { id: string } }
interface SendMsgRequest { Params: { id: string }; Body: { content: string } }
interface AssignRequest { Params: { id: string }; Body: { agentId: string } }
interface ResolveRequest { Params: { id: string }; Body: { notes?: string } }
interface FaqListRequest { Querystring: { status?: string; category?: string; businessScopeId?: string } }
interface CreateFaqRequest { Body: { question: string; answer: string; category?: string; tags?: string[]; businessScopeId?: string } }
interface UpdateFaqRequest { Params: { id: string }; Body: Record<string, unknown> }
interface GroupCreateRequest { Body: { name: string; description?: string; routingStrategy?: string; maxConcurrent?: number; businessScopeId?: string } }
interface GroupUpdateRequest { Params: { id: string }; Body: Record<string, unknown> }
interface MemberRequest { Params: { id: string }; Body: { userId: string } }
interface MemberRemoveRequest { Params: { id: string; userId: string } }
interface RuleCreateRequest { Body: { name: string; conditions?: unknown; actions?: unknown; priority?: number; agentGroupId?: string; businessScopeId?: string } }
interface RuleUpdateRequest { Params: { id: string }; Body: Record<string, unknown> }
interface TemplateCreateRequest { Body: { name: string; content: string; category?: string; shortcut?: string; channelTypes?: unknown; businessScopeId?: string } }
interface TemplateUpdateRequest { Params: { id: string }; Body: Record<string, unknown> }
interface BhCreateRequest { Body: Record<string, unknown> }
interface BhUpdateRequest { Params: { id: string }; Body: Record<string, unknown> }
interface DraftPublishRequest { Params: { id: string }; Body: { question?: string; answer?: string; category?: string } }
interface DistillRequest { Body: { hours?: number } }
interface GapReportRequest { Querystring: { days?: string } }
interface SubmitSurveyRequest { Body: { conversationId: string; rating: number; comment?: string } }
interface CreateConvRequest { Body: { customerName: string; customerEmail?: string; message: string; channelType?: string; priority?: string } }

// ============================================================================
// Support Workspace Routes
// ============================================================================
export async function supportRoutes(fastify: FastifyInstance): Promise<void> {
  // Conversations
  fastify.get<ConvListRequest>('/conversations', { preHandler: [authenticate] },
    async (request: FastifyRequest<ConvListRequest>, reply: FastifyReply) => {
      const { status, channelType, assignedAgentId, priority, skip, take } = request.query;
      const result = await supportService.getConversations(request.user!.orgId, { status, channelType, assignedAgentId, priority }, Number(skip) || 0, Number(take) || 20);
      return reply.send(result);
    });

  fastify.get<IdParam>('/conversations/:id', { preHandler: [authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      return reply.send(await supportService.getConversationById(request.params.id, request.user!.orgId));
    });

  // Create a new conversation (with customer profile and initial message)
  fastify.post<CreateConvRequest>('/conversations', { preHandler: [authenticate] },
    async (request: FastifyRequest<CreateConvRequest>, reply: FastifyReply) => {
      const data = validate(z.object({
        customerName: z.string().min(1),
        customerEmail: z.string().email().optional(),
        message: z.string().min(1),
        channelType: z.string().optional(),
        priority: z.string().optional(),
      }), request.body);

      const result = await supportService.createConversationWithMessage(
        request.user!.orgId,
        request.user!.id,
        data,
      );
      return reply.status(201).send(result);
    });

  fastify.post<SendMsgRequest>('/conversations/:id/messages', { preHandler: [authenticate] },
    async (request: FastifyRequest<SendMsgRequest>, reply: FastifyReply) => {
      const { content } = validate(z.object({ content: z.string().min(1) }), request.body);
      return reply.status(201).send(await supportService.sendMessage(request.params.id, request.user!.orgId, request.user!.id, content));
    });

  fastify.put<AssignRequest>('/conversations/:id/assign', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<AssignRequest>, reply: FastifyReply) => {
      const { agentId } = validate(z.object({ agentId: z.string().uuid() }), request.body);
      return reply.send(await supportService.assignAgent(request.params.id, request.user!.orgId, agentId));
    });

  fastify.put<ResolveRequest>('/conversations/:id/resolve', { preHandler: [authenticate] },
    async (request: FastifyRequest<ResolveRequest>, reply: FastifyReply) => {
      return reply.send(await supportService.resolveConversation(request.params.id, request.user!.orgId, request.body?.notes));
    });

  fastify.put<IdParam>('/conversations/:id/close', { preHandler: [authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      return reply.send(await supportService.closeConversation(request.params.id, request.user!.orgId));
    });

  fastify.post<IdParam>('/conversations/:id/handoff', { preHandler: [authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      return reply.send(await supportService.handoffToHuman(request.params.id, request.user!.orgId));
    });

  // Customer Profiles
  fastify.get<IdParam>('/customers/:id', { preHandler: [authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      return reply.send(await supportService.getCustomerById(request.params.id, request.user!.orgId));
    });

  // FAQ
  fastify.get<FaqListRequest>('/faq', { preHandler: [authenticate] },
    async (request: FastifyRequest<FaqListRequest>, reply: FastifyReply) => {
      return reply.send(await supportService.getFaqArticles(request.user!.orgId, request.query));
    });

  fastify.post<CreateFaqRequest>('/faq', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<CreateFaqRequest>, reply: FastifyReply) => {
      const data = validate(z.object({
        question: z.string().min(1), answer: z.string().min(1),
        category: z.string().optional(), tags: z.array(z.string()).optional(),
        businessScopeId: z.string().uuid().optional(),
      }), request.body);
      return reply.status(201).send(await supportService.createFaqArticle(request.user!.orgId, data, request.user!.id));
    });

  fastify.put<UpdateFaqRequest>('/faq/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<UpdateFaqRequest>, reply: FastifyReply) => {
      return reply.send(await supportService.updateFaqArticle(request.params.id, request.user!.orgId, request.body));
    });

  // CSAT Surveys
  fastify.post<SubmitSurveyRequest>('/surveys', { preHandler: [authenticate] },
    async (request: FastifyRequest<SubmitSurveyRequest>, reply: FastifyReply) => {
      const data = validate(z.object({
        conversationId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      }), request.body);
      return reply.status(201).send(await surveyService.submitSurvey(request.user!.orgId, data));
    });

  fastify.get<IdParam>('/surveys/:id', { preHandler: [authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      const survey = await surveyService.getSurveyByConversation(request.params.id, request.user!.orgId);
      return reply.send(survey ?? {});
    });
}

// ============================================================================
// Support Settings Routes
// ============================================================================
export async function supportSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // Agent Groups
  fastify.get('/agent-groups', { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.getAgentGroups(request.user!.orgId));
    });

  fastify.post<GroupCreateRequest>('/agent-groups', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<GroupCreateRequest>, reply: FastifyReply) => {
      return reply.status(201).send(await supportSettingsService.createAgentGroup(request.user!.orgId, request.body));
    });

  fastify.put<GroupUpdateRequest>('/agent-groups/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<GroupUpdateRequest>, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.updateAgentGroup(request.params.id, request.user!.orgId, request.body));
    });

  fastify.delete<IdParam>('/agent-groups/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      await supportSettingsService.deleteAgentGroup(request.params.id, request.user!.orgId);
      return reply.status(204).send();
    });

  fastify.post<MemberRequest>('/agent-groups/:id/members', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<MemberRequest>, reply: FastifyReply) => {
      return reply.status(201).send(await supportSettingsService.addGroupMember(request.params.id, request.user!.orgId, request.body.userId));
    });

  fastify.delete<MemberRemoveRequest>('/agent-groups/:id/members/:userId', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<MemberRemoveRequest>, reply: FastifyReply) => {
      await supportSettingsService.removeGroupMember(request.params.id, request.params.userId);
      return reply.status(204).send();
    });

  // Escalation Rules
  fastify.get('/escalation-rules', { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.getEscalationRules(request.user!.orgId));
    });

  fastify.post<RuleCreateRequest>('/escalation-rules', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<RuleCreateRequest>, reply: FastifyReply) => {
      return reply.status(201).send(await supportSettingsService.createEscalationRule(request.user!.orgId, request.body));
    });

  fastify.put<RuleUpdateRequest>('/escalation-rules/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<RuleUpdateRequest>, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.updateEscalationRule(request.params.id, request.user!.orgId, request.body));
    });

  fastify.delete<IdParam>('/escalation-rules/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      await supportSettingsService.deleteEscalationRule(request.params.id, request.user!.orgId);
      return reply.status(204).send();
    });

  // Response Templates
  fastify.get('/response-templates', { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.getResponseTemplates(request.user!.orgId));
    });

  fastify.post<TemplateCreateRequest>('/response-templates', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<TemplateCreateRequest>, reply: FastifyReply) => {
      return reply.status(201).send(await supportSettingsService.createResponseTemplate(request.user!.orgId, request.body));
    });

  fastify.put<TemplateUpdateRequest>('/response-templates/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<TemplateUpdateRequest>, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.updateResponseTemplate(request.params.id, request.user!.orgId, request.body));
    });

  fastify.delete<IdParam>('/response-templates/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      await supportSettingsService.deleteResponseTemplate(request.params.id, request.user!.orgId);
      return reply.status(204).send();
    });

  // Business Hours
  fastify.get('/business-hours', { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.getBusinessHours(request.user!.orgId));
    });

  fastify.post<BhCreateRequest>('/business-hours', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<BhCreateRequest>, reply: FastifyReply) => {
      return reply.status(201).send(await supportSettingsService.createBusinessHours(request.user!.orgId, request.body));
    });

  fastify.put<BhUpdateRequest>('/business-hours/:id', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<BhUpdateRequest>, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.updateBusinessHours(request.params.id, request.user!.orgId, request.body));
    });

  // Metrics
  fastify.get('/metrics/summary', { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await supportSettingsService.getMetricsSummary(request.user!.orgId));
    });
}

// ============================================================================
// Support Knowledge Routes
// ============================================================================
export async function supportKnowledgeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/drafts', { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(await supportKnowledgeService.getDrafts(request.user!.orgId));
    });

  fastify.post<DraftPublishRequest>('/drafts/:id/publish', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<DraftPublishRequest>, reply: FastifyReply) => {
      return reply.send(await supportKnowledgeService.publishDraft(request.params.id, request.user!.orgId, request.body));
    });

  fastify.post<IdParam>('/drafts/:id/reject', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      await supportKnowledgeService.rejectDraft(request.params.id, request.user!.orgId);
      return reply.status(204).send();
    });

  fastify.post<DistillRequest>('/distill', { preHandler: [authenticate, requireModifyAccess] },
    async (request: FastifyRequest<DistillRequest>, reply: FastifyReply) => {
      return reply.send(await supportKnowledgeService.distillResolvedConversations(request.user!.orgId, { hours: request.body?.hours }));
    });

  fastify.post<GapReportRequest>('/gap-report', { preHandler: [authenticate] },
    async (request: FastifyRequest<GapReportRequest>, reply: FastifyReply) => {
      const days = Number(request.query.days) || 7;
      return reply.send(await supportKnowledgeService.generateGapReport(request.user!.orgId, days));
    });
}
