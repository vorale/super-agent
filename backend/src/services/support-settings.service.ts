/**
 * Support Settings Service
 * Manages agent groups, escalation rules, response templates, and business hours.
 */

import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export class SupportSettingsService {
  // ==========================================================================
  // Agent Groups
  // ==========================================================================

  async getAgentGroups(organizationId: string) {
    return prisma.agent_groups.findMany({
      where: { organization_id: organizationId },
      include: { agent_group_members: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async createAgentGroup(organizationId: string, data: {
    name: string; description?: string; routingStrategy?: string;
    maxConcurrent?: number; businessScopeId?: string;
  }) {
    return prisma.agent_groups.create({
      data: {
        organization_id: organizationId,
        business_scope_id: data.businessScopeId ?? null,
        name: data.name,
        description: data.description ?? null,
        routing_strategy: data.routingStrategy ?? 'round_robin',
        max_concurrent: data.maxConcurrent ?? 5,
      },
      include: { agent_group_members: true },
    });
  }

  async updateAgentGroup(id: string, organizationId: string, data: Record<string, unknown>) {
    const existing = await prisma.agent_groups.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Agent group ${id} not found`);
    return prisma.agent_groups.update({ where: { id }, data, include: { agent_group_members: true } });
  }

  async deleteAgentGroup(id: string, organizationId: string) {
    const existing = await prisma.agent_groups.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Agent group ${id} not found`);
    await prisma.agent_groups.delete({ where: { id } });
  }

  async addGroupMember(groupId: string, organizationId: string, userId: string) {
    const group = await prisma.agent_groups.findFirst({ where: { id: groupId, organization_id: organizationId } });
    if (!group) throw AppError.notFound(`Agent group ${groupId} not found`);
    return prisma.agent_group_members.create({
      data: { agent_group_id: groupId, user_id: userId },
    });
  }

  async removeGroupMember(groupId: string, userId: string) {
    await prisma.agent_group_members.deleteMany({
      where: { agent_group_id: groupId, user_id: userId },
    });
  }

  // ==========================================================================
  // Escalation Rules
  // ==========================================================================

  async getEscalationRules(organizationId: string) {
    return prisma.escalation_rules.findMany({
      where: { organization_id: organizationId },
      orderBy: { priority: 'desc' },
    });
  }

  async createEscalationRule(organizationId: string, data: {
    name: string; conditions?: unknown; actions?: unknown;
    priority?: number; agentGroupId?: string; businessScopeId?: string;
  }) {
    return prisma.escalation_rules.create({
      data: {
        organization_id: organizationId,
        business_scope_id: data.businessScopeId ?? null,
        name: data.name,
        conditions: (data.conditions ?? {}) as object,
        actions: (data.actions ?? {}) as object,
        priority: data.priority ?? 0,
        agent_group_id: data.agentGroupId ?? null,
      },
    });
  }

  async updateEscalationRule(id: string, organizationId: string, data: Record<string, unknown>) {
    const existing = await prisma.escalation_rules.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Escalation rule ${id} not found`);
    return prisma.escalation_rules.update({ where: { id }, data });
  }

  async deleteEscalationRule(id: string, organizationId: string) {
    const existing = await prisma.escalation_rules.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Escalation rule ${id} not found`);
    await prisma.escalation_rules.delete({ where: { id } });
  }

  // ==========================================================================
  // Response Templates
  // ==========================================================================

  async getResponseTemplates(organizationId: string) {
    return prisma.response_templates.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createResponseTemplate(organizationId: string, data: {
    name: string; content: string; category?: string;
    shortcut?: string; channelTypes?: unknown; businessScopeId?: string;
  }) {
    return prisma.response_templates.create({
      data: {
        organization_id: organizationId,
        business_scope_id: data.businessScopeId ?? null,
        name: data.name,
        content: data.content,
        category: data.category ?? null,
        shortcut: data.shortcut ?? null,
        channel_types: (data.channelTypes ?? []) as object,
      },
    });
  }

  async updateResponseTemplate(id: string, organizationId: string, data: Record<string, unknown>) {
    const existing = await prisma.response_templates.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Response template ${id} not found`);
    return prisma.response_templates.update({ where: { id }, data });
  }

  async deleteResponseTemplate(id: string, organizationId: string) {
    const existing = await prisma.response_templates.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Response template ${id} not found`);
    await prisma.response_templates.delete({ where: { id } });
  }

  // ==========================================================================
  // Business Hours
  // ==========================================================================

  async getBusinessHours(organizationId: string) {
    return prisma.business_hours.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createBusinessHours(organizationId: string, data: Record<string, unknown>) {
    return prisma.business_hours.create({
      data: { organization_id: organizationId, ...data } as any,
    });
  }

  async updateBusinessHours(id: string, organizationId: string, data: Record<string, unknown>) {
    const existing = await prisma.business_hours.findFirst({ where: { id, organization_id: organizationId } });
    if (!existing) throw AppError.notFound(`Business hours ${id} not found`);
    return prisma.business_hours.update({ where: { id }, data: data as any });
  }

  // ==========================================================================
  // Metrics Summary
  // ==========================================================================

  async getMetricsSummary(organizationId: string) {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600_000);

    const [totalConversations, resolvedConversations, aiResolved, avgCsat, avgFirstResponse] = await Promise.all([
      prisma.support_conversations.count({
        where: { organization_id: organizationId, created_at: { gte: thirtyDaysAgo } },
      }),
      prisma.support_conversations.count({
        where: { organization_id: organizationId, status: 'resolved', created_at: { gte: thirtyDaysAgo } },
      }),
      prisma.support_conversations.count({
        where: {
          organization_id: organizationId,
          status: 'resolved',
          assigned_agent_id: null,
          created_at: { gte: thirtyDaysAgo },
        },
      }),
      prisma.csat_surveys.aggregate({
        where: { organization_id: organizationId, submitted_at: { gte: thirtyDaysAgo } },
        _avg: { rating: true },
        _count: true,
      }),
      // Calculate average first response time in seconds
      prisma.$queryRawUnsafe<[{ avg_seconds: number | null }]>(
        `SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) as avg_seconds
         FROM support_conversations
         WHERE organization_id = $1
           AND first_response_at IS NOT NULL
           AND created_at >= $2`,
        organizationId,
        thirtyDaysAgo,
      ).catch(() => [{ avg_seconds: null }]),
    ]);

    return {
      totalConversations,
      resolvedConversations,
      aiResolvedRate: totalConversations > 0 ? aiResolved / totalConversations : 0,
      avgCsatRating: avgCsat._avg.rating ?? 0,
      csatCount: avgCsat._count,
      avgFirstResponseSec: avgFirstResponse[0]?.avg_seconds ?? null,
    };
  }
}

export const supportSettingsService = new SupportSettingsService();
