/**
 * Support Metrics Service
 *
 * Aggregates and reports customer service metrics.
 */

import { prisma } from '../config/database.js';

export class SupportMetricsService {

  /**
   * Aggregate daily metrics. Should be called by a scheduled job.
   */
  async aggregateDaily(date?: Date, organizationId?: string): Promise<void> {
    const targetDate = date ? new Date(date.toISOString().split('T')[0]) : new Date(new Date().toISOString().split('T')[0]);

    const orgs = organizationId
      ? [{ id: organizationId }]
      : await prisma.organizations.findMany({ select: { id: true } });

    for (const org of orgs) {
      await this.aggregateForOrg(org.id, targetDate);
    }
  }

  private async aggregateForOrg(organizationId: string, date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Conversation stats
    const [total, resolved, aiResolved, escalated, handoffs] = await Promise.all([
      prisma.support_conversations.count({
        where: { organization_id: organizationId, created_at: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.support_conversations.count({
        where: { organization_id: organizationId, status: 'resolved', resolved_at: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.support_conversations.count({
        where: { organization_id: organizationId, status: 'resolved', assigned_agent_id: null, resolved_at: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.support_conversations.count({
        where: { organization_id: organizationId, priority: { in: ['high', 'urgent'] }, created_at: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.support_conversations.count({
        where: { organization_id: organizationId, status: 'pending_agent', created_at: { gte: dayStart, lte: dayEnd } },
      }),
    ]);

    const humanResolved = resolved - aiResolved;

    // Response time
    const conversations = await prisma.support_conversations.findMany({
      where: { organization_id: organizationId, created_at: { gte: dayStart, lte: dayEnd }, first_response_at: { not: null } },
      select: { created_at: true, first_response_at: true },
    });
    const avgFirstResponse = conversations.length > 0
      ? conversations.reduce((sum, c) => sum + (c.first_response_at!.getTime() - c.created_at.getTime()) / 1000, 0) / conversations.length
      : null;

    // Resolution time
    const resolvedConvs = await prisma.support_conversations.findMany({
      where: { organization_id: organizationId, resolved_at: { gte: dayStart, lte: dayEnd } },
      select: { created_at: true, resolved_at: true },
    });
    const avgResolution = resolvedConvs.length > 0
      ? resolvedConvs.reduce((sum, c) => sum + (c.resolved_at!.getTime() - c.created_at.getTime()) / 1000, 0) / resolvedConvs.length
      : null;

    // CSAT
    const surveys = await prisma.csat_surveys.findMany({
      where: { organization_id: organizationId, submitted_at: { gte: dayStart, lte: dayEnd } },
      select: { rating: true },
    });
    const avgCsat = surveys.length > 0
      ? surveys.reduce((sum, s) => sum + s.rating, 0) / surveys.length
      : null;

    await prisma.support_metrics_daily.upsert({
      where: {
        organization_id_date_business_scope_id: {
          organization_id: organizationId,
          date,
          business_scope_id: null as any,
        },
      },
      create: {
        organization_id: organizationId,
        date,
        total_conversations: total,
        resolved_conversations: resolved,
        ai_resolved: Math.max(aiResolved, 0),
        human_resolved: Math.max(humanResolved, 0),
        avg_first_response_sec: avgFirstResponse,
        avg_resolution_sec: avgResolution,
        avg_csat_rating: avgCsat,
        csat_count: surveys.length,
        escalated_count: escalated,
        handoff_count: handoffs,
      },
      update: {
        total_conversations: total,
        resolved_conversations: resolved,
        ai_resolved: Math.max(aiResolved, 0),
        human_resolved: Math.max(humanResolved, 0),
        avg_first_response_sec: avgFirstResponse,
        avg_resolution_sec: avgResolution,
        avg_csat_rating: avgCsat,
        csat_count: surveys.length,
        escalated_count: escalated,
        handoff_count: handoffs,
      },
    });
  }

  /**
   * Get metrics for a date range.
   */
  async getMetrics(organizationId: string, options: { days?: number; startDate?: string; endDate?: string }) {
    const days = options.days ?? 30;
    const endDate = options.endDate ? new Date(options.endDate) : new Date();
    const startDate = options.startDate ? new Date(options.startDate) : new Date(Date.now() - (days - 1) * 86400000);

    const metrics = await prisma.support_metrics_daily.findMany({
      where: {
        organization_id: organizationId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });

    // Aggregate totals
    const totals = metrics.reduce((acc, m) => ({
      totalConversations: acc.totalConversations + m.total_conversations,
      resolvedConversations: acc.resolvedConversations + m.resolved_conversations,
      aiResolved: acc.aiResolved + m.ai_resolved,
      humanResolved: acc.humanResolved + m.human_resolved,
      csatCount: acc.csatCount + m.csat_count,
      escalatedCount: acc.escalatedCount + m.escalated_count,
      handoffCount: acc.handoffCount + m.handoff_count,
      csatSum: acc.csatSum + (m.avg_csat_rating ?? 0) * m.csat_count,
      frtSum: acc.frtSum + (m.avg_first_response_sec ?? 0) * m.total_conversations,
      rtSum: acc.rtSum + (m.avg_resolution_sec ?? 0) * m.resolved_conversations,
    }), {
      totalConversations: 0, resolvedConversations: 0, aiResolved: 0, humanResolved: 0,
      csatCount: 0, escalatedCount: 0, handoffCount: 0, csatSum: 0, frtSum: 0, rtSum: 0,
    });

    return {
      daily: metrics,
      summary: {
        totalConversations: totals.totalConversations,
        resolvedConversations: totals.resolvedConversations,
        aiResolutionRate: totals.resolvedConversations > 0
          ? Math.round((totals.aiResolved / totals.resolvedConversations) * 10000) / 100
          : 0,
        avgCsatRating: totals.csatCount > 0
          ? Math.round((totals.csatSum / totals.csatCount) * 100) / 100
          : null,
        avgFirstResponseSeconds: totals.totalConversations > 0
          ? Math.round(totals.frtSum / totals.totalConversations)
          : null,
        avgResolutionSeconds: totals.resolvedConversations > 0
          ? Math.round(totals.rtSum / totals.resolvedConversations)
          : null,
        escalationRate: totals.totalConversations > 0
          ? Math.round((totals.escalatedCount / totals.totalConversations) * 10000) / 100
          : 0,
        handoffRate: totals.totalConversations > 0
          ? Math.round((totals.handoffCount / totals.totalConversations) * 10000) / 100
          : 0,
      },
    };
  }
}

export const supportMetricsService = new SupportMetricsService();
