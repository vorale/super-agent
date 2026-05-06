/**
 * LLM Proxy Service
 *
 * Core service that handles OpenAI-compatible chat completions by proxying
 * requests to AWS Bedrock. Integrates with the platform's API key auth
 * and token usage tracking.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { randomUUID } from 'crypto';
import { config } from '../../config/index.js';
import { createBedrockClient } from '../bedrock-client.js';
import { OpenAIToBedrockConverter } from './openai-to-bedrock.js';
import { BedrockToOpenAIConverter } from './bedrock-to-openai.js';
import { recordTokenUsage } from '../token-usage.service.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from './types.js';
import { DEFAULT_MODEL_MAPPING as MODEL_MAP, MODEL_CATALOG } from './types.js';

// ============================================================================
// Bedrock Client (singleton)
// ============================================================================

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) return bedrockClient;
  bedrockClient = createBedrockClient({ region: config.aws.region, maxAttempts: 3 });
  return bedrockClient;
}

// ============================================================================
// Service
// ============================================================================

export interface LLMProxyResult {
  response: ChatCompletionResponse;
  cacheUsage: Record<string, number>;
}

export class LLMProxyService {
  private converter = new OpenAIToBedrockConverter();
  private responseConverter = new BedrockToOpenAIConverter();

  /**
   * Non-streaming chat completion.
   */
  async chatCompletion(
    request: ChatCompletionRequest,
    requestId?: string,
    cacheTtl?: string | null,
  ): Promise<LLMProxyResult> {
    const id = requestId ?? `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const client = getBedrockClient();

    const bedrockRequest = this.converter.convertRequest(request, cacheTtl);
    const modelId = bedrockRequest.modelId as string;
    delete bedrockRequest.modelId;

    const command = new ConverseCommand({ modelId, ...bedrockRequest } as any);
    const bedrockResponse = await client.send(command);

    const cacheUsage = this.responseConverter.extractCacheUsage(bedrockResponse as any);
    const response = this.responseConverter.convertResponse(
      bedrockResponse as any,
      request.model,
      id,
      cacheTtl,
    );

    return { response, cacheUsage };
  }

  /**
   * Streaming chat completion — yields SSE strings.
   */
  async *chatCompletionStream(
    request: ChatCompletionRequest,
    requestId?: string,
    cacheTtl?: string | null,
  ): AsyncGenerator<string> {
    const id = requestId ?? `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const client = getBedrockClient();
    const includeUsage = request.stream_options?.include_usage;

    const bedrockRequest = this.converter.convertRequest(request, cacheTtl);
    const modelId = bedrockRequest.modelId as string;
    delete bedrockRequest.modelId;

    const command = new ConverseStreamCommand({ modelId, ...bedrockRequest } as any);
    const bedrockResponse = await client.send(command);

    let currentIndex = 0;
    let usageData: Record<string, number> | null = null;
    const converter = new BedrockToOpenAIConverter();

    const stream = bedrockResponse.stream;
    if (!stream) {
      yield 'data: [DONE]\n\n';
      return;
    }

    for await (const event of stream) {
      // Extract usage from metadata events
      const extracted = converter.extractStreamUsage(event as any);
      if (extracted) usageData = extracted;

      const sseEvents = converter.convertStreamEvent(event as any, request.model, id, currentIndex);
      for (const sse of sseEvents) {
        yield sse;
      }

      if ('contentBlockStart' in event) currentIndex++;
    }

    // Emit usage chunk if requested
    if (includeUsage && usageData) {
      yield converter.buildUsageChunk(id, request.model, usageData, cacheTtl);
    }

    yield 'data: [DONE]\n\n';

    // Emit internal usage marker for tracking
    if (usageData) {
      yield `__usage__:${JSON.stringify(usageData)}`;
    }
  }

  /**
   * List available models with capability info.
   */
  listModels(): Record<string, unknown>[] {
    return MODEL_CATALOG.map((m) => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: m.provider,
      display_name: m.displayName,
      capabilities: m.capabilities,
      protocols: m.protocols,
    }));
  }
}

// ============================================================================
// Token Usage Recording Helper
// ============================================================================

export async function recordLLMProxyUsage(params: {
  organizationId: string;
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
}): Promise<void> {
  try {
    await recordTokenUsage({
      organizationId: params.organizationId,
      userId: params.userId,
      source: 'chat' as const,
      model: params.model,
      tokenUsage: {
        inputTokens: params.promptTokens,
        outputTokens: params.completionTokens,
        cacheReadInputTokens: params.cachedTokens ?? 0,
        cacheCreationInputTokens: params.cacheWriteTokens ?? 0,
        totalCostUsd: 0, // TODO: add pricing calculation
      },
    });
  } catch (err) {
    console.error('[llm-proxy] Failed to record usage:', err);
  }
}
