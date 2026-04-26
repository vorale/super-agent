/**
 * Intent Classifier Node Executor
 * Classifies customer message intent using LLM.
 */

import type { INodeExecutor, NodeExecutionParams, NodeExecutionResult } from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';

const DEFAULT_INTENTS = ['general', 'complaint', 'inquiry', 'technical', 'billing', 'feedback'];

export class IntentClassifierExecutor implements INodeExecutor {
  readonly supportedTypes: CanvasNodeType[] = ['intentClassifier'];

  supports(nodeType: CanvasNodeType): boolean {
    return this.supportedTypes.includes(nodeType);
  }

  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    try {
      const { node, context } = params;
      const metadata = node.data.metadata as Record<string, unknown> | undefined;

      // Get input message from parent node outputs
      let message = '';
      for (const [, output] of context.nodeOutputs) {
        const out = output as Record<string, unknown>;
        if (out?.text) { message = out.text as string; break; }
        if (out?.message) { message = out.message as string; break; }
      }

      if (!message) {
        // Try variables
        message = (context.variables.get('message') as string) ?? '';
      }

      const intents = (metadata?.intents as string[]) ?? DEFAULT_INTENTS;
      const confidenceThreshold = (metadata?.confidenceThreshold as number) ?? 0.6;

      // Simple keyword-based classification (production would use LLM)
      const result = this.classifyIntent(message, intents);

      return {
        success: true,
        output: {
          intent: result.intent,
          confidence: result.confidence,
          keywords: result.keywords,
          suggestedAction: result.confidence >= confidenceThreshold ? 'faq_lookup' : 'human_handoff',
          reasoning: `Classified as ${result.intent} with confidence ${result.confidence.toFixed(2)}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Intent classification failed',
      };
    }
  }

  private classifyIntent(message: string, intents: string[]): {
    intent: string; confidence: number; keywords: string[];
  } {
    const lower = message.toLowerCase();
    const keywordMap: Record<string, string[]> = {
      billing: ['bill', 'payment', 'charge', 'invoice', 'refund', 'price', 'cost', 'subscription'],
      technical: ['error', 'bug', 'crash', 'not working', 'broken', 'issue', 'problem', 'fix'],
      complaint: ['terrible', 'awful', 'worst', 'angry', 'frustrated', 'unacceptable', 'disappointed'],
      inquiry: ['how', 'what', 'when', 'where', 'can i', 'is it possible', 'help me'],
      feedback: ['suggest', 'feedback', 'improve', 'feature', 'wish', 'would be nice'],
    };

    let bestIntent = 'general';
    let bestScore = 0;
    const foundKeywords: string[] = [];

    for (const [intent, keywords] of Object.entries(keywordMap)) {
      if (!intents.includes(intent)) continue;
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          score += 1;
          foundKeywords.push(kw);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    const confidence = Math.min(0.3 + bestScore * 0.2, 0.95);

    return { intent: bestIntent, confidence, keywords: foundKeywords };
  }
}
