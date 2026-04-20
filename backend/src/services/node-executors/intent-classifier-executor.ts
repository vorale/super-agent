/**
 * Intent Classifier Node Executor
 *
 * Classifies incoming customer message intent using LLM.
 * Outputs structured intent label, confidence score, and suggested action.
 */

import { BaseNodeExecutor } from './base-executor.js';
import type { NodeExecutionParams, NodeExecutionResult } from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';
import { aiService } from '../ai.service.js';

interface IntentClassifierMeta {
  /** Custom intent categories (default: general, complaint, inquiry, technical, billing, feedback) */
  categories?: string[];
  /** System prompt override */
  systemPrompt?: string;
  /** Input message reference (e.g. "@{start.output.message}") */
  messageRef?: string;
}

interface ClassifiedIntent {
  intent: string;
  confidence: number;
  subIntent?: string;
  keywords: string[];
  suggestedAction: 'ai_reply' | 'faq_lookup' | 'human_handoff' | 'skill_route';
  reasoning: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are an intent classifier for a customer service system. Analyze the customer's message and classify it.

Return ONLY valid JSON with this exact structure:
{
  "intent": "<primary intent category>",
  "confidence": <0.0-1.0 confidence score>,
  "subIntent": "<optional more specific intent>",
  "keywords": ["<key terms extracted>"],
  "suggestedAction": "<one of: ai_reply, faq_lookup, human_handoff, skill_route>",
  "reasoning": "<brief explanation>"
}

Rules for suggestedAction:
- "ai_reply": Simple questions the AI can answer directly
- "faq_lookup": Questions that match known FAQ topics
- "human_handoff": Complaints, complex issues, or emotional messages
- "skill_route": Issues requiring specific expertise (billing, technical, etc.)`;

export class IntentClassifierNodeExecutor extends BaseNodeExecutor {
  readonly supportedTypes: CanvasNodeType[] = ['intentClassifier'];

  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    const { node, context } = params;
    const metadata = this.getMetadata<IntentClassifierMeta>(params);

    // Resolve the input message
    let message: string | undefined;
    if (metadata?.messageRef) {
      const resolved = this.resolveReference(metadata.messageRef, context);
      message = typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    }

    // Also check nodeOutputs for common keys
    if (!message) {
      const startOutput = context.nodeOutputs.get('start') as Record<string, unknown> | undefined;
      message = (startOutput?.message as string) || (startOutput?.text as string) || '';
    }

    if (!message) {
      return this.failure('No input message found for intent classification');
    }

    const categories = metadata?.categories?.length
      ? metadata.categories
      : ['general', 'complaint', 'inquiry', 'technical', 'billing', 'feedback'];

    const systemPrompt = metadata?.systemPrompt
      ? this.substituteVariables(metadata.systemPrompt, context)
      : `${DEFAULT_SYSTEM_PROMPT}\n\nAvailable intent categories: ${categories.join(', ')}`;

    try {
      const raw = await aiService.chatCompletion({
        system_prompt: systemPrompt,
        messages: [{ role: 'user', content: message }],
        max_tokens: 512,
      });

      // Parse LLM response as JSON
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed: ClassifiedIntent = JSON.parse(cleaned);

      // Validate confidence is in range
      parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

      return this.success({
        type: 'intentClassifier',
        title: node.data.title,
        ...parsed,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Classification failed';
      return this.failure(`Intent classification failed: ${errorMsg}`);
    }
  }
}
