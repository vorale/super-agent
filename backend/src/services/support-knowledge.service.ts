/**
 * Support Knowledge Service
 * FAQ distillation from resolved conversations and knowledge gap detection.
 */

import { prisma } from '../config/database.js';
import { faqRepository, type FaqArticleEntity } from '../repositories/faq.repository.js';
import { supportRepository } from '../repositories/support.repository.js';

export interface KnowledgeGap {
  topic: string;
  frequency: number;
  suggestedCategory: string;
  summary: string;
}

export interface GapReport {
  gaps: KnowledgeGap[];
  totalProblematicConversations: number;
  existingFaqCount: number;
  generatedAt: Date;
}

export class SupportKnowledgeService {
  async getDrafts(organizationId: string): Promise<FaqArticleEntity[]> {
    return faqRepository.findDrafts(organizationId);
  }

  /**
   * Distill a single resolved conversation into a draft FAQ article.
   * Called automatically when a conversation is resolved.
   */
  async distillSingleConversation(conversationId: string, organizationId: string): Promise<void> {
    const conv = await supportRepository.findById(conversationId, organizationId);
    if (!conv?.session_id) return;

    const messages = await prisma.chat_messages.findMany({
      where: { session_id: conv.session_id, organization_id: organizationId },
      orderBy: { created_at: 'asc' },
      take: 30,
    });

    if (messages.length < 2) return;

    const userMessages = messages.filter(m => m.type === 'user');
    const agentMessages = messages.filter(m => m.type === 'agent' || m.type === 'ai');

    if (userMessages.length === 0 || agentMessages.length === 0) return;

    const question = userMessages[0]!.content;
    const answer = agentMessages[agentMessages.length - 1]!.content;

    // Skip very short or trivial exchanges
    if (question.length < 10 || answer.length < 10) return;

    // Check for duplicates
    const existing = await prisma.faq_articles.findFirst({
      where: {
        organization_id: organizationId,
        question: { contains: question.substring(0, 50) },
      },
    });

    if (!existing) {
      await faqRepository.create({
        organization_id: organizationId,
        business_scope_id: null,
        question,
        answer,
        category: 'general',
        tags: ['auto-distilled'] as string[],
        status: 'draft',
        sort_order: 0,
        created_by: null,
      });
    }
  }

  async publishDraft(
    id: string,
    organizationId: string,
    edits?: { question?: string; answer?: string; category?: string },
  ): Promise<FaqArticleEntity> {
    const draft = await faqRepository.findById(id, organizationId);
    if (!draft) throw new Error(`Draft ${id} not found`);
    if (draft.status !== 'draft') throw new Error('Article is not a draft');

    const updateData: Record<string, unknown> = { status: 'published' };
    if (edits?.question) updateData.question = edits.question;
    if (edits?.answer) updateData.answer = edits.answer;
    if (edits?.category) updateData.category = edits.category;

    const updated = await faqRepository.update(id, organizationId, updateData);
    return updated!;
  }

  async rejectDraft(id: string, organizationId: string): Promise<boolean> {
    return faqRepository.delete(id, organizationId);
  }

  async distillResolvedConversations(
    organizationId: string,
    options: { hours?: number } = {},
  ): Promise<{ distilledCount: number; draftsCreated: number }> {
    const hours = options.hours ?? 24;
    const conversations = await supportRepository.findRecentByOrg(organizationId, {
      hours,
      status: 'resolved',
    });

    let draftsCreated = 0;

    for (const conv of conversations) {
      if (!conv.session_id) continue;

      const messages = await prisma.chat_messages.findMany({
        where: { session_id: conv.session_id, organization_id: organizationId },
        orderBy: { created_at: 'asc' },
        take: 30,
      });

      if (messages.length < 2) continue;

      // Extract Q&A pairs from conversation
      const userMessages = messages.filter(m => m.type === 'user');
      const agentMessages = messages.filter(m => m.type === 'agent' || m.type === 'ai');

      if (userMessages.length > 0 && agentMessages.length > 0) {
        const question = userMessages[0]!.content;
        const answer = agentMessages[agentMessages.length - 1]!.content;

        // Check for duplicates
        const existing = await prisma.faq_articles.findFirst({
          where: {
            organization_id: organizationId,
            question: { contains: question.substring(0, 50) },
          },
        });

        if (!existing) {
          await faqRepository.create({
            organization_id: organizationId,
            business_scope_id: null,
            question,
            answer,
            category: 'general',
            tags: ['auto-distilled'] as string[],
            status: 'draft',
            sort_order: 0,
            created_by: null,
          });
          draftsCreated++;
        }
      }
    }

    return { distilledCount: conversations.length, draftsCreated };
  }

  async generateGapReport(
    organizationId: string,
    days = 7,
  ): Promise<GapReport> {
    const hours = days * 24;

    // Find problematic conversations
    const problematic = await supportRepository.findRecentByOrg(organizationId, {
      hours,
      maxConfidence: 0.5,
    });

    const pendingAgent = await supportRepository.findRecentByOrg(organizationId, {
      hours,
      status: 'pending_agent',
    });

    const allProblematic = [...problematic, ...pendingAgent];
    const uniqueIds = new Set(allProblematic.map(c => c.id));

    // Count existing FAQs
    const { total: existingFaqCount } = await faqRepository.findAll(organizationId, { status: 'published' });

    // Simple gap analysis based on conversation patterns
    const gapMap = new Map<string, { count: number; messages: string[] }>();

    for (const conv of allProblematic) {
      if (!conv.session_id) continue;
      const messages = await prisma.chat_messages.findMany({
        where: { session_id: conv.session_id, type: 'user' },
        orderBy: { created_at: 'asc' },
        take: 5,
      });

      for (const msg of messages) {
        const topic = msg.content.substring(0, 100);
        const entry = gapMap.get(topic) ?? { count: 0, messages: [] };
        entry.count++;
        entry.messages.push(msg.content);
        gapMap.set(topic, entry);
      }
    }

    const gaps: KnowledgeGap[] = Array.from(gapMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([topic, data]) => ({
        topic,
        frequency: data.count,
        suggestedCategory: 'general',
        summary: `Appeared in ${data.count} problematic conversations`,
      }));

    return {
      gaps,
      totalProblematicConversations: uniqueIds.size,
      existingFaqCount,
      generatedAt: new Date(),
    };
  }
}

export const supportKnowledgeService = new SupportKnowledgeService();
