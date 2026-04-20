/**
 * FAQ Lookup Node Executor
 *
 * Searches FAQ/knowledge base for relevant articles matching the customer query.
 * Uses keyword matching and optionally RAG semantic search.
 */

import { BaseNodeExecutor } from './base-executor.js';
import type { NodeExecutionParams, NodeExecutionResult } from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';
import { prisma } from '../../config/database.js';

interface FaqLookupMeta {
  /** Query reference (e.g. "@{start.output.message}") */
  queryRef?: string;
  /** Maximum results to return */
  maxResults?: number;
  /** Category filter */
  category?: string;
  /** Minimum similarity threshold (0-1) */
  minScore?: number;
}

interface FaqResult {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  score: number;
  matchType: 'keyword' | 'semantic';
}

export class FaqLookupNodeExecutor extends BaseNodeExecutor {
  readonly supportedTypes: CanvasNodeType[] = ['faqLookup'];

  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    const { node, context } = params;
    const metadata = this.getMetadata<FaqLookupMeta>(params);

    // Resolve query
    let query: string | undefined;
    if (metadata?.queryRef) {
      const resolved = this.resolveReference(metadata.queryRef, context);
      query = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    }
    if (!query) {
      const startOutput = context.nodeOutputs.get('start') as Record<string, unknown> | undefined;
      query = (startOutput?.message as string) || (startOutput?.text as string) || '';
    }

    if (!query?.trim()) {
      return this.failure('No query provided for FAQ lookup');
    }

    const organizationId = context.organizationId;
    if (!organizationId) {
      return this.failure('No organization context for FAQ lookup');
    }

    const maxResults = metadata?.maxResults ?? 5;
    const minScore = metadata?.minScore ?? 0.1;
    const category = metadata?.category
      ? this.substituteVariables(metadata.category, context)
      : undefined;

    try {
      // Fetch published FAQ articles for the organization
      const where: Record<string, unknown> = {
        organization_id: organizationId,
        status: 'published',
      };
      if (category) {
        where.category = category;
      }

      const articles = await prisma.faq_articles.findMany({
        where,
        orderBy: { view_count: 'desc' },
        take: 100, // Fetch a reasonable batch for scoring
      });

      // Score and rank articles by keyword match
      const queryLower = query.toLowerCase();
      const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 1);

      const results: FaqResult[] = articles
        .map((article) => {
          const questionLower = article.question.toLowerCase();
          const answerLower = article.answer.toLowerCase();
          const tags = Array.isArray(article.tags)
            ? (article.tags as string[]).map((t) => t.toLowerCase())
            : [];

          let score = 0;

          // Exact question match
          if (questionLower.includes(queryLower)) {
            score += 0.5;
          }

          // Term overlap scoring
          const matchedTerms = queryTerms.filter(
            (term) =>
              questionLower.includes(term) ||
              answerLower.includes(term) ||
              tags.some((tag) => tag.includes(term))
          );
          score += (matchedTerms.length / Math.max(queryTerms.length, 1)) * 0.3;

          // Tag bonus
          const tagMatches = tags.filter((tag) =>
            queryTerms.some((term) => tag.includes(term) || term.includes(tag))
          ).length;
          score += tagMatches * 0.1;

          // Popularity bonus (normalized)
          score += Math.min(article.view_count / 1000, 0.1);

          return {
            id: article.id,
            question: article.question,
            answer: article.answer,
            category: article.category,
            score: Math.min(score, 1),
            matchType: 'keyword' as const,
          };
        })
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      // Increment view count for matched articles
      if (results.length > 0) {
        await prisma.faq_articles.updateMany({
          where: { id: { in: results.map((r) => r.id) } },
          data: { view_count: { increment: 1 } },
        });
      }

      return this.success({
        type: 'faqLookup',
        title: node.data.title,
        query,
        results,
        totalResults: results.length,
        hasMatch: results.length > 0 && (results[0]?.score ?? 0) >= 0.3,
        bestMatch: results[0] ?? null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'FAQ lookup failed';
      return this.failure(`FAQ lookup failed: ${errorMsg}`);
    }
  }
}
