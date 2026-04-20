/**
 * Support Knowledge Service
 *
 * Self-learning system for customer service:
 * 1. Distill resolved conversations into FAQ drafts
 * 2. Detect knowledge gaps from low-confidence conversations
 * 3. Generate knowledge gap reports
 */

import { prisma } from '../config/database.js';
import { aiService } from './ai.service.js';

// ── Types ───────────────────────────────────────────────────────

interface ExtractedFaqPair {
  question: string;
  answer: string;
  category: string;
  confidence: number;
  sourceConversationId: string;
}

interface KnowledgeGap {
  topic: string;
  frequency: number;
  avgConfidence: number;
  lastSeen: string;
  suggestedCategory: string;
  conversationIds: string[];
}

interface GapReport {
  organizationId: string;
  generatedAt: string;
  periodDays: number;
  totalGaps: number;
  gaps: KnowledgeGap[];
  summary: string;
}

// ── Prompt Templates ───────────────────────────────────────────

const EXTRACTION_PROMPT = `You are analyzing a customer service conversation. Extract FAQ-worthy question-answer pairs from it.

Rules:
- Only extract pairs where the AI provided a clear, factual answer
- Questions should be natural (how a customer would ask)
- Answers should be concise but complete
- Skip greetings, small talk, and off-topic exchanges
- If no useful Q&A pairs exist, return an empty array

Return ONLY valid JSON array:
[
  {
    "question": "The customer's question, rephrased naturally",
    "answer": "The AI's answer, concise and factual",
    "category": "one of: general, billing, technical, account, product, shipping, returns",
    "confidence": 0.0-1.0 (how confident you are this is a useful FAQ entry)
  }
]

If no useful pairs, return: []`;

const GAP_ANALYSIS_PROMPT = `You are analyzing customer service conversations that had issues (low AI confidence, multiple follow-ups, or human handoff). Identify common knowledge gaps.

Input conversations (each marked with ---):
{conversations}

Return ONLY valid JSON:
{
  "gaps": [
    {
      "topic": "Short topic description",
      "frequency": 1,
      "suggestedCategory": "billing|technical|account|product|shipping|returns|general",
      "summary": "Brief description of what knowledge is missing"
    }
  ],
  "summary": "Overall assessment: what knowledge areas need improvement, prioritized by impact."
}`;

// ── Service ─────────────────────────────────────────────────────

export class SupportKnowledgeService {

  /**
   * Distill a resolved conversation into FAQ draft pairs.
   */
  async distillConversation(conversationId: string, organizationId: string): Promise<ExtractedFaqPair[]> {
    // Load conversation messages
    const conversation = await prisma.support_conversations.findUnique({
      where: { id: conversationId, organization_id: organizationId },
    });
    if (!conversation) throw new Error('Conversation not found');

    if (!conversation.session_id) return [];

    const messages = await prisma.chat_messages.findMany({
      where: { session_id: conversation.session_id },
      orderBy: { created_at: 'asc' },
      select: { type: true, content: true, created_at: true },
    });

    if (messages.length < 2) return [];

    // Format conversation for AI
    const conversationText = messages
      .map((m) => {
        const role = m.type === 'user' ? 'Customer' : m.type === 'agent' ? 'Agent' : 'AI';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    if (conversationText.length < 100) return [];

    try {
      const raw = await aiService.chatCompletion({
        system_prompt: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: conversationText }],
        max_tokens: 2048,
      });

      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const pairs = JSON.parse(cleaned) as Array<{
        question: string;
        answer: string;
        category: string;
        confidence: number;
      }>;

      // Validate and filter
      const valid = pairs.filter(
        (p) =>
          p.question?.length >= 5 &&
          p.answer?.length >= 10 &&
          p.category &&
          p.confidence > 0
      );

      // Check for similar existing FAQs to avoid duplicates
      const existingFaqs = await prisma.faq_articles.findMany({
        where: { organization_id: organizationId, status: { in: ['published', 'draft'] } },
        select: { question: true },
      });

      const deduped = valid.filter((pair) => {
        const questionLower = pair.question.toLowerCase();
        return !existingFaqs.some(
          (faq) =>
            faq.question.toLowerCase() === questionLower ||
            (faq.question.toLowerCase().length > 10 &&
              questionLower.includes(faq.question.toLowerCase().slice(0, 15)))
        );
      });

      // Create draft FAQ articles
      for (const pair of deduped) {
        await prisma.faq_articles.create({
          data: {
            organization_id: organizationId,
            question: pair.question,
            answer: pair.answer,
            category: pair.category,
            status: 'draft',
            tags: ['auto-distilled'],
          },
        });
      }

      return deduped.map((p) => ({
        ...p,
        sourceConversationId: conversationId,
      }));
    } catch (err) {
      console.error(`[Knowledge] Distillation failed for ${conversationId}:`, err);
      return [];
    }
  }

  /**
   * Detect knowledge gaps from recent conversations.
   */
  async detectGaps(organizationId: string, options?: { days?: number }): Promise<KnowledgeGap[]> {
    const days = options?.days ?? 7;
    const since = new Date(Date.now() - days * 86400000);

    // Find conversations with low AI confidence or that required handoff
    const problemConversations = await prisma.support_conversations.findMany({
      where: {
        organization_id: organizationId,
        created_at: { gte: since },
        OR: [
          { ai_confidence: { lt: 0.5 } },
          { status: 'pending_agent' },
          { sentiment_score: { lt: -0.3 } },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    if (problemConversations.length === 0) return [];

    // Load messages for each conversation
    const conversationTexts: string[] = [];
    for (const conv of problemConversations) {
      if (!conv.session_id) continue;
      const messages = await prisma.chat_messages.findMany({
        where: { session_id: conv.session_id },
        orderBy: { created_at: 'asc' },
        select: { type: true, content: true },
        take: 20,
      });
      if (messages.length >= 2) {
        const text = messages
          .map((m) => `${m.type === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
          .join('\n');
        conversationTexts.push(text);
      }
    }

    if (conversationTexts.length === 0) return [];

    try {
      const conversationsBlock = conversationTexts
        .map((t, i) => `--- Conversation ${i + 1} ---\n${t}`)
        .join('\n\n');

      const raw = await aiService.chatCompletion({
        system_prompt: GAP_ANALYSIS_PROMPT.replace('{conversations}', conversationsBlock),
        messages: [{ role: 'user', content: `Analyze these ${conversationTexts.length} problematic conversations and identify knowledge gaps.` }],
        max_tokens: 2048,
      });

      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(cleaned) as {
        gaps: Array<{
          topic: string;
          frequency: number;
          suggestedCategory: string;
          summary: string;
        }>;
      };

      return result.gaps.map((g, i) => ({
        topic: g.topic || `Gap ${i + 1}`,
        frequency: g.frequency || 1,
        avgConfidence: 0,
        lastSeen: since.toISOString(),
        suggestedCategory: g.suggestedCategory || 'general',
        conversationIds: problemConversations
          .slice(0, 3)
          .map((c) => c.id),
      }));
    } catch (err) {
      console.error('[Knowledge] Gap detection failed:', err);
      return [];
    }
  }

  /**
   * Generate a full knowledge gap report.
   */
  async generateGapReport(organizationId: string, options?: { days?: number }): Promise<GapReport> {
    const days = options?.days ?? 7;
    const gaps = await this.detectGaps(organizationId, { days });

    // Count existing FAQs by category
    const faqStats = await prisma.faq_articles.groupBy({
      by: ['category'],
      where: { organization_id: organizationId, status: 'published' },
      _count: true,
    });

    const faqByCategory: Record<string, number> = {};
    for (const stat of faqStats) {
      faqByCategory[String(stat.category)] = stat._count;
    }

    // Generate summary
    const summary = gaps.length === 0
      ? 'No significant knowledge gaps detected in the analyzed period.'
      : `Detected ${gaps.length} knowledge gap${gaps.length > 1 ? 's' : ''} across ${new Set(gaps.map((g) => g.suggestedCategory)).size} categories. ` +
        `Top gaps: ${gaps.slice(0, 3).map((g) => `"${g.topic}" (${g.suggestedCategory})`).join(', ')}. ` +
        `Current FAQ coverage: ${Object.entries(faqByCategory).map(([cat, count]) => `${cat}: ${count}`).join(', ')}.`;

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      periodDays: days,
      totalGaps: gaps.length,
      gaps,
      summary,
    };
  }

  /**
   * Publish a draft FAQ (after human review).
   */
  async publishDraft(faqId: string, organizationId: string, updates?: { question?: string; answer?: string; category?: string }) {
    const faq = await prisma.faq_articles.findFirst({
      where: { id: faqId, organization_id: organizationId, status: 'draft' },
    });
    if (!faq) throw new Error('Draft FAQ not found');

    await prisma.faq_articles.update({
      where: { id: faqId },
      data: {
        status: 'published',
        ...(updates?.question && { question: updates.question }),
        ...(updates?.answer && { answer: updates.answer }),
        ...(updates?.category && { category: updates.category }),
        tags: Array.isArray(faq.tags) ? (faq.tags as string[]).filter((t) => t !== 'auto-distilled') : [],
      },
    });

    return prisma.faq_articles.findUnique({ where: { id: faqId } });
  }

  /**
   * Reject and delete a draft FAQ.
   */
  async rejectDraft(faqId: string, organizationId: string) {
    const faq = await prisma.faq_articles.findFirst({
      where: { id: faqId, organization_id: organizationId, status: 'draft' },
    });
    if (!faq) throw new Error('Draft FAQ not found');
    await prisma.faq_articles.delete({ where: { id: faqId } });
  }

  /**
   * Get draft FAQ articles pending review.
   */
  async getDrafts(organizationId: string) {
    return prisma.faq_articles.findMany({
      where: { organization_id: organizationId, status: 'draft' },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Trigger distillation for all recently resolved conversations.
   * Designed to be called by a scheduled job.
   */
  async distillResolvedConversations(organizationId?: string, options?: { hours?: number }): Promise<number> {
    const hours = options?.hours ?? 24;
    const since = new Date(Date.now() - hours * 3600000);

    const where: Record<string, unknown> = {
      status: 'resolved',
      resolved_at: { gte: since },
    };
    if (organizationId) where.organization_id = organizationId;

    const conversations = await prisma.support_conversations.findMany({
      where,
      select: { id: true, session_id: true },
    });

    let extracted = 0;
    for (const conv of conversations) {
      if (!conv.session_id) continue;
      try {
        const orgId = organizationId || (await prisma.support_conversations.findUnique({ where: { id: conv.id }, select: { organization_id: true } }))?.organization_id;
        if (!orgId) continue;

        const pairs = await this.distillConversation(conv.id, orgId);
        extracted += pairs.length;
      } catch {
        // Skip failed conversations
      }
    }

    return extracted;
  }
}

export const supportKnowledgeService = new SupportKnowledgeService();
