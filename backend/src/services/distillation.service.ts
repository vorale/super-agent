/**
 * Distillation Service (v2 — BullMQ + cursor-based dedup)
 *
 * Analyzes completed conversations and automatically extracts memories
 * (patterns, lessons, gaps) into scope_memories.
 *
 * Changes from v1:
 *   - Replaced in-memory cooldown with BullMQ queue for reliable delivery
 *   - Removed 5-minute cooldown — every conversation turn gets enqueued
 *   - Added cursor tracking (Redis key per scope) so each job only processes
 *     messages created after the last successful distillation
 *   - Jobs are deduplicated by scope+session to avoid redundant processing
 *   - Failed jobs retry with exponential backoff (3 attempts)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config/index.js';
import { createBedrockClient } from './bedrock-client.js';
import { redisConnection } from '../config/queue.js';
import { scopeMemoryRepository } from '../repositories/scope-memory.repository.js';
import { redisService } from './redis.service.js';
import type { ContentBlock } from './claude-agent.service.js';

const DISTILLATION_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const QUEUE_NAME = 'distillation';
const CURSOR_PREFIX = 'distill:cursor:'; // Redis key: distill:cursor:{scopeId}

const bedrockClient: BedrockRuntimeClient = createBedrockClient({ region: config.aws.region });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DistillationInput {
  organizationId: string;
  scopeId: string;
  sessionId: string;
  agentId: string;
  contentBlocks: ContentBlock[];
  userMessage: string;
}

/** Job payload stored in BullMQ */
interface DistillationJobData {
  organizationId: string;
  scopeId: string;
  sessionId: string;
  agentId: string;
  userMessage: string;
  contentBlocks: ContentBlock[];
  enqueuedAt: string; // ISO timestamp — used as cursor watermark
}

interface ExtractedMemory {
  title: string;
  content: string;
  category: 'pattern' | 'lesson' | 'gap';
  tags: string[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const DISTILLATION_SYSTEM_PROMPT = `You are a conversation analyst for an AI agent platform. Your job is to analyze a completed agent conversation and extract valuable memories that will help the agent improve over time.

Analyze the conversation from three dimensions:

1. **pattern**: Recurring user needs or effective solution paths the agent used.
   - Only extract if the pattern is reusable and non-obvious.
2. **lesson**: Mistakes, corrections, or improvements discovered during the conversation.
   - Include cases where the user corrected the agent, or the agent had to retry.
   - IMPORTANT: User identity info (name, preferences, habits) counts as a lesson if the agent didn't know it before.
3. **gap**: Capabilities the agent lacked — questions it couldn't answer, tools it didn't have, or tasks it failed.
   - Only flag genuine capability gaps, not normal conversation flow.

Rules:
- Extract user preferences (food, hobbies, communication style, name corrections) as "lesson" — these are high-value for personalization.
- Each memory should be concise: title ≤ 60 chars, content ≤ 300 chars.
- Tags should be lowercase, kebab-case, 1-4 tags per memory.
- Maximum 3 memories per conversation.
- Write in the same language as the conversation.
- If the conversation is purely routine (greetings, simple Q&A with no personal info), return [].

Output ONLY a JSON array (no markdown fences, no explanation):
[{"title":"...","content":"...","category":"pattern|lesson|gap","tags":["..."]}]

If nothing is worth extracting, output: []`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DistillationService {
  private queue: Queue<DistillationJobData> | null = null;
  private worker: Worker<DistillationJobData> | null = null;

  /**
   * Initialize the BullMQ queue and worker.
   * Call once during app startup (after Redis is ready).
   */
  async initialize(): Promise<void> {
    await this.initializeQueue();

    this.worker = new Worker<DistillationJobData>(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: redisConnection,
        concurrency: 2,
        limiter: { max: 5, duration: 60_000 },
      },
    );

    this.worker.on('failed', (job, err) => {
      console.error(
        `[distillation] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
        err.message,
      );
    });

    this.worker.on('completed', (job) => {
      console.log(`[distillation] Job ${job.id} completed`);
    });

    console.log('[distillation] Queue and worker initialized');
  }

  /**
   * Initialize only the BullMQ queue (no worker).
   * Used by the api role — it needs to enqueue jobs but not process them.
   */
  async initializeQueue(): Promise<void> {
    if (this.queue) return;
    this.queue = new Queue<DistillationJobData>(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500, age: 24 * 60 * 60 },
        removeOnFail: { count: 1000, age: 7 * 24 * 60 * 60 },
      },
    });
    console.log('[distillation] Queue initialized (no worker)');
  }

  /**
   * Enqueue a conversation for distillation.
   * No cooldown — every turn gets a chance. Dedup by jobId.
   */
  async enqueue(input: DistillationInput): Promise<void> {
    if (!this.queue) {
      console.warn('[distillation] Queue not initialized, skipping');
      return;
    }

    const now = new Date().toISOString();

    // JobId = scope + session + timestamp (truncated to minute)
    // This deduplicates rapid-fire messages within the same minute
    // while still allowing each distinct conversation turn to be processed
    const minuteKey = now.slice(0, 16).replace(/:/g, ''); // "2026-04-11T1234"
    const jobId = `${input.scopeId}_${input.sessionId}_${minuteKey}`;

    try {
      const job = await this.queue.add('distill', {
        organizationId: input.organizationId,
        scopeId: input.scopeId,
        sessionId: input.sessionId,
        agentId: input.agentId,
        userMessage: input.userMessage,
        contentBlocks: input.contentBlocks,
        enqueuedAt: now,
      }, {
        jobId,
      });
      console.log(`[distillation] Job enqueued: ${job.id}`);
    } catch (err) {
      console.error(`[distillation] Failed to enqueue job ${jobId}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Process a single distillation job.
   */
  private async processJob(job: Job<DistillationJobData>): Promise<void> {
    const { organizationId, scopeId, sessionId, agentId, userMessage, contentBlocks, enqueuedAt } = job.data;

    // --- Cursor check: skip if this turn was already processed ---
    const cursorKey = `${CURSOR_PREFIX}${scopeId}`;
    const lastCursor = await redisService.get(cursorKey);
    if (lastCursor && enqueuedAt <= lastCursor) {
      // This conversation turn (or an earlier one) was already distilled
      return;
    }

    // --- Format and filter ---
    const conversationText = this.formatConversation(userMessage, contentBlocks);
    if (conversationText.length < 200) {
      // Still advance cursor even for short conversations
      // so we don't re-process them on the next job
      await redisService.set(cursorKey, enqueuedAt);
      return;
    }

    // --- Call LLM ---
    console.log(`[distillation] Calling LLM with ${conversationText.length} chars`);
    const memories = await this.callLLM(conversationText);
    console.log(`[distillation] LLM returned ${memories.length} memories`);

    // --- Advance cursor regardless of whether memories were extracted ---
    await redisService.set(cursorKey, enqueuedAt);

    if (memories.length === 0) return;

    // --- Deduplicate against existing memories ---
    const existing = await scopeMemoryRepository.findByScope(
      organizationId,
      scopeId,
      { limit: 50 },
    );
    const existingTitles = new Set(existing.map(m => m.title.toLowerCase()));

    for (const memory of memories) {
      if (existingTitles.has(memory.title.toLowerCase())) continue;

      await scopeMemoryRepository.create({
        organization_id: organizationId,
        business_scope_id: scopeId,
        session_id: sessionId,
        title: memory.title,
        content: memory.content,
        category: memory.category,
        tags: [...memory.tags, 'auto-distilled'],
        is_pinned: false,
        created_by: null,
      });

      this.syncToVectorMemory(memory, { organizationId, scopeId, agentId }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // LLM + parsing (unchanged from v1)
  // ---------------------------------------------------------------------------

  private formatConversation(userMessage: string, contentBlocks: ContentBlock[]): string {
    const parts: string[] = [`User: ${userMessage}`];

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        parts.push(`Agent: ${block.text}`);
      } else if (block.type === 'tool_use') {
        parts.push(`Agent [tool: ${block.name}]: ${JSON.stringify(block.input).slice(0, 500)}`);
      } else if (block.type === 'tool_result') {
        const preview = (block.content ?? '').slice(0, 300);
        parts.push(`Tool result: ${preview}`);
      }
    }

    const full = parts.join('\n');
    return full.length > 8000 ? full.slice(0, 8000) + '\n[...truncated]' : full;
  }

  private async callLLM(conversationText: string): Promise<ExtractedMemory[]> {
    const command = new InvokeModelCommand({
      modelId: DISTILLATION_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        temperature: 0.3,
        system: DISTILLATION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Analyze this conversation:\n\n${conversationText}` },
        ],
      }),
    });

    const response = await bedrockClient.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    const text: string = body?.content?.[0]?.text ?? '[]';
    console.log(`[distillation] LLM raw response: ${text.slice(0, 500)}`);
    return this.parseResponse(text);
  }

  private parseResponse(text: string): ExtractedMemory[] {
    try {
      let json = text.trim();
      const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) json = fenceMatch[1]!.trim();

      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];

      const validCategories = new Set(['pattern', 'lesson', 'gap']);
      return parsed
        .filter(
          (m: unknown): m is ExtractedMemory =>
            typeof m === 'object' &&
            m !== null &&
            typeof (m as ExtractedMemory).title === 'string' &&
            typeof (m as ExtractedMemory).content === 'string' &&
            validCategories.has((m as ExtractedMemory).category) &&
            Array.isArray((m as ExtractedMemory).tags),
        )
        .slice(0, 3)
        .map(m => ({
          title: m.title.slice(0, 100),
          content: m.content.slice(0, 500),
          category: m.category,
          tags: m.tags.filter((t: unknown) => typeof t === 'string').slice(0, 5),
        }));
    } catch {
      console.error('[distillation] Failed to parse LLM response:', text.slice(0, 200));
      return [];
    }
  }

  private async syncToVectorMemory(
    memory: ExtractedMemory,
    ctx: { organizationId: string; scopeId: string; agentId: string },
  ): Promise<void> {
    const { isVectorMemoryEnabled, getVectorProvider } = await import('./memory-provider.js');
    if (!isVectorMemoryEnabled()) return;
    const provider = getVectorProvider();
    if (!provider) return;
    await provider.add(
      { title: memory.title, content: memory.content, category: memory.category, tags: [...memory.tags, 'auto-distilled'], is_pinned: false },
      ctx,
    );
  }

  /**
   * Graceful shutdown — close queue and worker.
   */
  async shutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    console.log('[distillation] Queue and worker shut down');
  }
}

export const distillationService = new DistillationService();
