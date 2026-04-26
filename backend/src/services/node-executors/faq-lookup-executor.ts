/**
 * FAQ Lookup Node Executor
 * Searches FAQ articles using keyword matching and scoring.
 */

import type { INodeExecutor, NodeExecutionParams, NodeExecutionResult } from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';
import { faqRepository } from '../../repositories/faq.repository.js';

export class FaqLookupExecutor implements INodeExecutor {
  readonly supportedTypes: CanvasNodeType[] = ['faqLookup'];

  supports(nodeType: CanvasNodeType): boolean {
    return this.supportedTypes.includes(nodeType);
  }

  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    try {
      const { node, context } = params;
      const metadata = node.data.metadata as Record<string, unknown> | undefined;
      const maxResults = (metadata?.maxResults as number) ?? 5;
      const minScore = (metadata?.minScore as number) ?? 0.1;
      const categoryFilter = metadata?.category as string | undefined;

      // Get query from parent node outputs
      let query = '';
      for (const [, output] of context.nodeOutputs) {
        const out = output as Record<string, unknown>;
        if (out?.intent) {
          query = (out.keywords as string[])?.join(' ') ?? '';
        }
        if (out?.text) query = out.text as string;
        if (out?.message) query = out.message as string;
      }

      if (!query) {
        query = (context.variables.get('message') as string) ?? '';
      }

      const organizationId = context.organizationId;
      if (!organizationId) {
        return { success: false, error: 'Organization ID not available in context' };
      }

      // Get published FAQs
      const articles = await faqRepository.findPublished(organizationId, undefined, categoryFilter);

      // Score and rank
      const scored = articles
        .map(article => ({
          id: article.id,
          question: article.question,
          answer: article.answer,
          category: article.category,
          score: this.scoreMatch(query, article),
        }))
        .filter(m => m.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      // Increment view counts for matched articles
      for (const match of scored) {
        await faqRepository.incrementViewCount(match.id).catch(() => {});
      }

      const bestMatch = scored.length > 0 ? scored[0] : null;

      return {
        success: true,
        output: {
          query,
          results: scored,
          totalResults: scored.length,
          hasMatch: scored.length > 0,
          bestMatch,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'FAQ lookup failed',
      };
    }
  }

  private scoreMatch(query: string, article: { question: string; answer: string; tags: unknown; view_count: number }): number {
    const queryLower = query.toLowerCase();
    const questionLower = article.question.toLowerCase();
    const answerLower = article.answer.toLowerCase();
    let score = 0;

    // Exact match bonus
    if (questionLower.includes(queryLower) || queryLower.includes(questionLower)) {
      score += 0.5;
    }

    // Word overlap
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const questionWords = new Set(questionLower.split(/\s+/));
    const answerWords = new Set(answerLower.split(/\s+/));

    let overlap = 0;
    for (const word of queryWords) {
      if (questionWords.has(word) || answerWords.has(word)) overlap++;
    }
    if (queryWords.length > 0) {
      score += (overlap / queryWords.length) * 0.3;
    }

    // Tag match
    const tags = (article.tags as string[]) ?? [];
    for (const tag of tags) {
      if (queryLower.includes(tag.toLowerCase())) score += 0.1;
    }

    // Popularity bonus (normalized)
    if (article.view_count > 0) {
      score += Math.min(article.view_count / 100, 0.1);
    }

    return Math.min(score, 1.0);
  }
}
