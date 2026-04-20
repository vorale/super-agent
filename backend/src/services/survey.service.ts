/**
 * Survey Service
 *
 * Manages CSAT (Customer Satisfaction) surveys.
 */

import { prisma } from '../config/database.js';

export class SurveyService {

  /**
   * Submit a CSAT survey for a conversation.
   */
  async submitSurvey(data: {
    organizationId: string;
    conversationId: string;
    customerId?: string;
    rating: number;
    comment?: string;
    channelType?: string;
  }) {
    if (data.rating < 1 || data.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Check for existing survey on this conversation
    const existing = await prisma.csat_surveys.findFirst({
      where: { conversation_id: data.conversationId },
    });
    if (existing) {
      // Update existing survey
      return prisma.csat_surveys.update({
        where: { id: existing.id },
        data: {
          rating: data.rating,
          comment: data.comment,
          submitted_at: new Date(),
        },
      });
    }

    return prisma.csat_surveys.create({
      data: {
        organization_id: data.organizationId,
        conversation_id: data.conversationId,
        customer_id: data.customerId ?? null,
        rating: data.rating,
        comment: data.comment,
        channel_type: data.channelType ?? null,
      },
    });
  }

  /**
   * Get CSAT stats for an organization.
   */
  async getStats(organizationId: string, options?: { days?: number }) {
    const since = options?.days
      ? new Date(Date.now() - options.days * 86400000)
      : undefined;

    const where: Record<string, unknown> = { organization_id: organizationId };
    if (since) where.submitted_at = { gte: since };

    const surveys = await prisma.csat_surveys.findMany({
      where,
      select: { rating: true, submitted_at: true },
    });

    if (surveys.length === 0) {
      return { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    }

    const sum = surveys.reduce((a, s) => a + s.rating, 0);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of surveys) distribution[s.rating] = (distribution[s.rating] || 0) + 1;

    return {
      total: surveys.length,
      average: Math.round((sum / surveys.length) * 100) / 100,
      distribution,
    };
  }

  /**
   * Get recent surveys with conversation info.
   */
  async listRecent(organizationId: string, options?: { limit?: number; offset?: number }) {
    return prisma.csat_surveys.findMany({
      where: { organization_id: organizationId },
      orderBy: { submitted_at: 'desc' },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
      include: {
        conversation: { select: { id: true, status: true } },
      },
    });
  }
}

export const surveyService = new SurveyService();
