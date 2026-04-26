/**
 * Survey Service
 * Manages CSAT satisfaction surveys for support conversations.
 */

import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export interface SubmitSurveyInput {
  conversationId: string;
  customerId?: string;
  rating: number;
  comment?: string;
  channelType?: string;
}

export class SurveyService {
  /**
   * Submit a CSAT survey for a conversation.
   */
  async submitSurvey(organizationId: string, input: SubmitSurveyInput) {
    // Validate rating
    if (input.rating < 1 || input.rating > 5) {
      throw AppError.validation('Rating must be between 1 and 5');
    }

    // Verify conversation exists
    const conversation = await prisma.support_conversations.findFirst({
      where: { id: input.conversationId, organization_id: organizationId },
    });
    if (!conversation) {
      throw AppError.notFound(`Conversation ${input.conversationId} not found`);
    }

    // Check for duplicate survey
    const existing = await prisma.csat_surveys.findFirst({
      where: { conversation_id: input.conversationId, organization_id: organizationId },
    });
    if (existing) {
      throw AppError.validation('Survey already submitted for this conversation');
    }

    return prisma.csat_surveys.create({
      data: {
        organization_id: organizationId,
        conversation_id: input.conversationId,
        customer_id: input.customerId ?? conversation.customer_id,
        rating: input.rating,
        comment: input.comment ?? null,
        channel_type: input.channelType ?? conversation.channel_type,
      },
    });
  }

  /**
   * Get surveys for a conversation.
   */
  async getSurveyByConversation(conversationId: string, organizationId: string) {
    return prisma.csat_surveys.findFirst({
      where: { conversation_id: conversationId, organization_id: organizationId },
    });
  }

  /**
   * Get recent surveys for the organization.
   */
  async getRecentSurveys(organizationId: string, limit = 50) {
    return prisma.csat_surveys.findMany({
      where: { organization_id: organizationId },
      orderBy: { submitted_at: 'desc' },
      take: limit,
    });
  }
}

export const surveyService = new SurveyService();
