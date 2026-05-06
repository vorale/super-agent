/**
 * Showcase Routes — "企业Agent大赏"
 * REST API for the Industry → Domain → Case hierarchy.
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { showcaseRepository } from '../repositories/showcase.repository.js';
import { prisma } from '../config/database.js';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config/index.js';
import { createBedrockClient } from '../services/bedrock-client.js';

const HAIKU_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const bedrockClient: BedrockRuntimeClient = createBedrockClient({ region: config.aws.region });

export async function showcaseRoutes(fastify: FastifyInstance): Promise<void> {

  // ========== Read endpoints ==========

  /** GET / — Full tree (industries → domains → cases) */
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await showcaseRepository.getFullTree(request.user!.orgId);
    return reply.send({ data });
  });

  /** GET /industries — List industries (tabs) */
  fastify.get('/industries', { preHandler: [authenticate] }, async (request, reply) => {
    const data = await showcaseRepository.getIndustries(request.user!.orgId);
    return reply.send({ data });
  });

  /** GET /industries/:industryId/domains — Domains + cases for an industry */
  fastify.get<{ Params: { industryId: string } }>(
    '/industries/:industryId/domains',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.getDomainsWithCases(
        request.user!.orgId,
        request.params.industryId,
      );
      return reply.send({ data });
    },
  );

  // ========== AI Suggest ==========

  /** POST /suggest — Generate English name and emoji icon from a Chinese domain name */
  fastify.post<{ Body: { name: string } }>(
    '/suggest',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { name } = request.body;
      if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

      try {
        const prompt = `Given the Chinese business domain name "${name}", respond with ONLY a JSON object (no markdown, no explanation):
{"name_en": "<concise English translation, 1-3 words>", "icon": "<single emoji that best represents this domain>"}`;

        const command = new InvokeModelCommand({
          modelId: HAIKU_MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 100,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const response = await bedrockClient.send(command);
        const body = JSON.parse(new TextDecoder().decode(response.body));
        const text = body.content?.[0]?.text || '{}';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(cleaned);
        return reply.send({ data: { name_en: result.name_en || '', icon: result.icon || '' } });
      } catch (err) {
        console.error('AI suggest failed:', err);
        return reply.send({ data: { name_en: '', icon: '' } });
      }
    },
  );

  // ========== Industry CRUD ==========

  /** POST /industries */
  fastify.post<{ Body: { name: string; slug: string; sort_order?: number } }>(
    '/industries',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.createIndustry({
        organization_id: request.user!.orgId,
        ...request.body,
      });
      return reply.status(201).send({ data });
    },
  );

  /** PUT /industries/:id */
  fastify.put<{ Params: { id: string }; Body: { name?: string; slug?: string; sort_order?: number; is_active?: boolean } }>(
    '/industries/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.updateIndustry(request.params.id, request.user!.orgId, request.body);
      if (!data) return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.send({ data });
    },
  );

  /** DELETE /industries/:id */
  fastify.delete<{ Params: { id: string } }>(
    '/industries/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const ok = await showcaseRepository.deleteIndustry(request.params.id, request.user!.orgId);
      if (!ok) return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.status(204).send();
    },
  );

  // ========== Domain CRUD ==========

  /** POST /domains */
  fastify.post<{ Body: { industry_id: string; name: string; name_en?: string; icon?: string; sort_order?: number } }>(
    '/domains',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.createDomain({
        organization_id: request.user!.orgId,
        ...request.body,
      });
      return reply.status(201).send({ data });
    },
  );

  /** PUT /domains/:id */
  fastify.put<{ Params: { id: string }; Body: { name?: string; name_en?: string; icon?: string; sort_order?: number } }>(
    '/domains/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.updateDomain(request.params.id, request.user!.orgId, request.body);
      if (!data) return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.send({ data });
    },
  );

  /** DELETE /domains/:id */
  fastify.delete<{ Params: { id: string } }>(
    '/domains/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const ok = await showcaseRepository.deleteDomain(request.params.id, request.user!.orgId);
      if (!ok) return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.status(204).send();
    },
  );

  // ========== Case CRUD ==========

  /** POST /cases */
  fastify.post<{ Body: { domain_id: string; title: string; description?: string; initial_prompt?: string; agent_id?: string; workflow_id?: string; scope_id?: string; run_config?: Record<string, unknown>; sort_order?: number } }>(
    '/cases',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.createCase({
        organization_id: request.user!.orgId,
        created_by: request.user!.id,
        ...request.body,
      });
      return reply.status(201).send({ data });
    },
  );

  /** PUT /cases/:id */
  fastify.put<{ Params: { id: string }; Body: { title?: string; description?: string; initial_prompt?: string; agent_id?: string; workflow_id?: string; scope_id?: string; run_config?: Record<string, unknown>; sort_order?: number; is_active?: boolean } }>(
    '/cases/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const data = await showcaseRepository.updateCase(request.params.id, request.user!.orgId, request.body);
      if (!data) return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.send({ data });
    },
  );

  /** DELETE /cases/:id */
  fastify.delete<{ Params: { id: string } }>(
    '/cases/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const ok = await showcaseRepository.deleteCase(request.params.id, request.user!.orgId);
      if (!ok) return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
      return reply.status(204).send();
    },
  );

  // ========== Publish session to showcase ==========

  /** POST /publish — Publish a chat session as a showcase case */
  fastify.post<{
    Body: {
      session_id: string;
      domain_id: string;
      title: string;
      description?: string;
      initial_prompt?: string;
    }
  }>(
    '/publish',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const orgId = request.user!.orgId;
      const { session_id, domain_id, title, description, initial_prompt } = request.body;

      // Look up the session to extract scope_id and agent_id
      const session = await prisma.chat_sessions.findFirst({
        where: { id: session_id, organization_id: orgId },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' });
      }

      const data = await showcaseRepository.createCase({
        organization_id: orgId,
        domain_id,
        title,
        description: description || null,
        initial_prompt: initial_prompt || null,
        session_id,
        scope_id: session.business_scope_id || undefined,
        agent_id: session.agent_id || undefined,
        created_by: request.user!.id,
      });

      // Also star the session for backward compatibility
      await prisma.chat_sessions.update({
        where: { id: session_id },
        data: { is_starred: true, starred_at: new Date(), starred_by: request.user!.id },
      });

      return reply.status(201).send({ data });
    },
  );
}
