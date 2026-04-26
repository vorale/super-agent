/**
 * Support Metrics Service
 * Aggregates daily metrics into the support_metrics_daily table.
 */

import { prisma } from '../config/database.js';

export class SupportMetricsService {
  /**
   * Aggregate metrics for a specific date and organization.
   * Upserts into support_metrics_daily.
   */
  async aggregateDaily(organizationId: string, date: Date, businessScopeId?: string): Promise<void> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      organization_id: organizationId,
      created_at: { gte: dayStart, lte: dayEnd },
    };

    const [total, resolved, aiResolved, humanResolved, escalated, handoff] = await Promise.all([
      prisma.support_conversations.count({ where }),
      prisma.support_conversations.count({ where: { ...where, status: 'resolved' } }),
      prisma.support_conversations.count({ where: { ...where, status: 'resolved', assigned_agent_id: null } }),
      prisma.support_conversations.count({ where: { ...where, status: 'resolved', assigned_agent_id: { not: null } } }),
      prisma.support_conversations.count({ where: { ...where, priority: 'urgent' } }),
      prisma.support_conversations.count({ where: { ...where, status: 'pending_agent' } }),
    ]);

    const csatData = await prisma.csat_surveys.aggregate({
      where: { organization_id: organizationId, submitted_at: { gte: dayStart, lte: dayEnd } },
      _avg: { rating: true },
      _count: true,
    });

    // Calculate average first response and resolution times via raw query
    const timingResult = await prisma.$queryRawUnsafe<[{
      avg_first_response: number | null;
      avg_resolution: number | null;
    }]>(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) as avg_first_response,
         AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution
       FROM support_conversations
       WHERE organization_id = $1
         AND created_at >= $2 AND created_at <= $3
         AND status = 'resolved'`,
      organizationId, dayStart, dayEnd,
    ).catch(() => [{ avg_first_response: null, avg_resolution: null }]);

    const dateOnly = dayStart.toISOString().split('T')[0]!;

    // Upsert
    const existing = await prisma.support_metrics_daily.findFirst({
      where: {
        organization_id: organizationId,
        date: new Date(dateOnly),
        business_scope_id: businessScopeId ?? null,
      },
    });

    const data = {
      total_conversations: total,
      resolved_conversations: resolved,
      ai_resolved: aiResolved,
      human_resolved: humanResolved,
      avg_first_response_sec: timingResult[0]?.avg_first_response ?? null,
      avg_resolution_sec: timingResult[0]?.avg_resolution ?? null,
      avg_csat_rating: csatData._avg.rating ?? null,
      csat_count: csatData._count,
      escalated_count: escalated,
      handoff_count: handoff,
    };

    if (existing) {
      await prisma.support_metrics_daily.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.support_metrics_daily.create({
        data: {
          organization_id: organizationId,
          business_scope_id: businessScopeId ?? null,
          date: new Date(dateOnly),
          ...data,
        },
      });
    }
  }

  /**
   * Aggregate metrics for yesterday (convenience method for cron jobs).
   */
  async aggregateYesterday(organizationId: string): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await this.aggregateDaily(organizationId, yesterday);
  }
}

export const supportMetricsService = new SupportMetricsService();
