/**
 * LiteLLM Routes
 *
 * Proxy endpoint for fetching available models from a LiteLLM instance.
 * Credentials are stored server-side (LITELLM_BASE_URL + LITELLM_API_KEY).
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config/index.js';

export async function litellmRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/litellm/models — List available models from LiteLLM proxy.
   * Returns both the public model name (for display) and the LiteLLM
   * model identifier (for passing to Claude Code SDK).
   */
  fastify.get(
    '/models',
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const baseUrl = config.litellm.baseUrl;
      const apiKey = config.litellm.apiKey;

      if (!baseUrl) {
        return reply.status(200).send({ data: [] });
      }

      try {
        const url = `${baseUrl.replace(/\/+$/, '')}/model/info`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (!resp.ok) {
          console.error(`[litellm] /model/info failed: ${resp.status} ${await resp.text()}`);
          return reply.status(200).send({ data: [] });
        }

        const body = (await resp.json()) as {
          data?: Array<{
            model_name: string;
            litellm_params?: { model?: string };
            model_info?: { litellm_provider?: string };
          }>;
        };

        const models = (body.data ?? []).map(m => ({
          id: m.model_name,
          litellm_model: m.litellm_params?.model ?? m.model_name,
          provider: m.model_info?.litellm_provider ?? 'unknown',
        }));

        return reply.status(200).send({ data: models });
      } catch (err) {
        console.error('[litellm] Failed to fetch models:', err instanceof Error ? err.message : err);
        return reply.status(200).send({ data: [] });
      }
    },
  );
}
