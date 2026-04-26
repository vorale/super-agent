/**
 * Support Service
 * Core service for customer service conversations, customer profiles, and FAQ management.
 */

import { supportRepository, type SupportConversationEntity } from '../repositories/support.repository.js';
import { customerProfileRepository, type CustomerProfileEntity } from '../repositories/customer-profile.repository.js';
import { faqRepository, type FaqArticleEntity } from '../repositories/faq.repository.js';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { supportKnowledgeService } from './support-knowledge.service.js';

export class SupportService {
  // ==========================================================================
  // Conversation Management
  // ==========================================================================

  async getConversations(
    organizationId: string,
    filters?: { status?: string; channelType?: string; assignedAgentId?: string; priority?: string },
    skip = 0,
    take = 20,
  ) {
    return supportRepository.findAll(organizationId, filters, skip, take);
  }

  async getConversationById(id: string, organizationId: string) {
    const conversation = await supportRepository.findById(id, organizationId);
    if (!conversation) throw AppError.notFound(`Support conversation ${id} not found`);

    // Load messages from associated chat session
    let messages: unknown[] = [];
    if (conversation.session_id) {
      messages = await prisma.chat_messages.findMany({
        where: { session_id: conversation.session_id, organization_id: organizationId },
        orderBy: { created_at: 'asc' },
      });
    }

    return { ...conversation, messages };
  }

  async createConversation(
    organizationId: string,
    data: {
      sessionId?: string;
      channelType?: string;
      channelId?: string;
      customerId?: string;
      priority?: string;
    },
  ): Promise<SupportConversationEntity> {
    return supportRepository.create({
      organization_id: organizationId,
      session_id: data.sessionId ?? null,
      channel_type: data.channelType ?? 'web_widget',
      channel_id: data.channelId ?? null,
      status: 'open',
      priority: data.priority ?? 'medium',
      assigned_agent_id: null,
      customer_id: data.customerId ?? null,
      ai_confidence: null,
      sentiment_score: null,
      first_response_at: null,
      resolved_at: null,
      resolution_notes: null,
      tags: [] as string[],
      metadata: {} as Record<string, string | number | boolean | null>,
    });
  }

  /**
   * Create a full conversation with customer profile, chat session, and initial message.
   * Used by the workspace UI to create test/manual conversations.
   */
  async createConversationWithMessage(
    organizationId: string,
    userId: string,
    data: {
      customerName: string;
      customerEmail?: string;
      message: string;
      channelType?: string;
      priority?: string;
    },
  ) {
    // 1. Create or find customer profile
    const externalId = `manual-${Date.now()}`;
    const customer = await customerProfileRepository.upsertByExternalId(organizationId, externalId, {
      name: data.customerName,
      email: data.customerEmail,
      sourceChannel: data.channelType ?? 'web_widget',
    });

    // 2. Create a chat session
    const session = await prisma.chat_sessions.create({
      data: {
        organization_id: organizationId,
        user_id: userId,
        status: 'idle',
        context: { support: true },
      },
    });

    // 3. Create the support conversation
    const conversation = await this.createConversation(organizationId, {
      sessionId: session.id,
      channelType: data.channelType,
      customerId: customer.id,
      priority: data.priority,
    });

    // 4. Write the initial customer message
    await prisma.chat_messages.create({
      data: {
        organization_id: organizationId,
        session_id: session.id,
        type: 'user',
        content: data.message,
        metadata: { source: 'manual', customerId: customer.id },
      },
    });

    return {
      conversation,
      customer,
      sessionId: session.id,
    };
  }

  async sendMessage(
    conversationId: string,
    organizationId: string,
    userId: string,
    content: string,
  ) {
    const conversation = await supportRepository.findById(conversationId, organizationId);
    if (!conversation) throw AppError.notFound(`Conversation ${conversationId} not found`);
    if (!conversation.session_id) throw AppError.validation('Conversation has no associated chat session');

    // Write message to chat session
    const message = await prisma.chat_messages.create({
      data: {
        organization_id: organizationId,
        session_id: conversation.session_id,
        type: 'agent',
        content,
        metadata: { support_agent_id: userId },
      },
    });

    // Update conversation status if pending_agent
    if (conversation.status === 'pending_agent') {
      await supportRepository.update(conversationId, organizationId, {
        status: 'open',
        assigned_agent_id: userId,
        first_response_at: conversation.first_response_at ?? new Date(),
      });
    }

    return message;
  }

  async assignAgent(conversationId: string, organizationId: string, agentId: string) {
    const updated = await supportRepository.update(conversationId, organizationId, {
      assigned_agent_id: agentId,
    });
    if (!updated) throw AppError.notFound(`Conversation ${conversationId} not found`);
    return updated;
  }

  async resolveConversation(conversationId: string, organizationId: string, notes?: string) {
    const updated = await supportRepository.update(conversationId, organizationId, {
      status: 'resolved',
      resolved_at: new Date(),
      resolution_notes: notes ?? null,
    });
    if (!updated) throw AppError.notFound(`Conversation ${conversationId} not found`);

    // Fire-and-forget: trigger FAQ distillation for this resolved conversation
    supportKnowledgeService.distillSingleConversation(conversationId, organizationId).catch(err => {
      console.warn(`[support] FAQ distillation failed for conversation ${conversationId}:`, err instanceof Error ? err.message : err);
    });

    return updated;
  }

  async closeConversation(conversationId: string, organizationId: string) {
    const updated = await supportRepository.update(conversationId, organizationId, {
      status: 'closed',
    });
    if (!updated) throw AppError.notFound(`Conversation ${conversationId} not found`);
    return updated;
  }

  async handoffToHuman(conversationId: string, organizationId: string) {
    const updated = await supportRepository.update(conversationId, organizationId, {
      status: 'pending_agent',
    });
    if (!updated) throw AppError.notFound(`Conversation ${conversationId} not found`);
    return updated;
  }

  // ==========================================================================
  // Customer Profile Management
  // ==========================================================================

  async getCustomerById(id: string, organizationId: string) {
    const customer = await customerProfileRepository.findById(id, organizationId);
    if (!customer) throw AppError.notFound(`Customer ${id} not found`);
    const conversations = await customerProfileRepository.findRecentConversations(id, organizationId);
    return { ...customer, recentConversations: conversations };
  }

  async upsertCustomer(
    organizationId: string,
    data: { externalId: string; name: string; email?: string; sourceChannel?: string },
  ): Promise<CustomerProfileEntity> {
    return customerProfileRepository.upsertByExternalId(organizationId, data.externalId, data);
  }

  // ==========================================================================
  // FAQ Management
  // ==========================================================================

  async getFaqArticles(
    organizationId: string,
    filters?: { status?: string; category?: string; businessScopeId?: string },
  ) {
    return faqRepository.findAll(organizationId, filters);
  }

  async createFaqArticle(
    organizationId: string,
    data: { question: string; answer: string; category?: string; tags?: string[]; businessScopeId?: string },
    createdBy?: string,
  ): Promise<FaqArticleEntity> {
    return faqRepository.create({
      organization_id: organizationId,
      business_scope_id: data.businessScopeId ?? null,
      question: data.question,
      answer: data.answer,
      category: data.category ?? null,
      tags: (data.tags ?? []) as string[],
      status: 'published',
      sort_order: 0,
      created_by: createdBy ?? null,
    });
  }

  async updateFaqArticle(
    id: string,
    organizationId: string,
    data: Partial<{ question: string; answer: string; category: string; tags: string[]; status: string }>,
  ) {
    const updated = await faqRepository.update(id, organizationId, data);
    if (!updated) throw AppError.notFound(`FAQ article ${id} not found`);
    return updated;
  }
}

export const supportService = new SupportService();
