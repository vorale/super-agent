/**
 * Skills Routes
 * REST API endpoints for Claude Skills management with S3 storage.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { skillService } from '../services/skill.service.js';
import { authenticate } from '../middleware/auth.js';

interface GetSkillRequest { Params: { id: string }; }
interface CreateSkillRequest {
  Body: { name: string; display_name: string; description?: string; version?: string; tags?: string[]; metadata?: Record<string, unknown>; };
}
interface UpdateSkillRequest { Params: { id: string }; Body: { display_name?: string; description?: string; version?: string; tags?: string[]; metadata?: Record<string, unknown>; }; }
interface GetMultipleSkillsRequest { Body: { skill_ids: string[] }; }
interface AgentSkillRequest { Params: { agentId: string; skillId: string }; }
interface SetAgentSkillsRequest { Params: { agentId: string }; Body: { skill_ids: string[] }; }

export async function skillsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/skills - List all skills (optionally filtered by business_scope_id)
  fastify.get<{ Querystring: { business_scope_id?: string } }>('/', { preHandler: [authenticate] }, async (request: FastifyRequest<{ Querystring: { business_scope_id?: string } }>, reply: FastifyReply) => {
    const scopeId = request.query.business_scope_id;
    if (scopeId) {
      // Return all skills related to this scope:
      // 1. Scope-level skills (skills.business_scope_id = scopeId)
      // 2. Agent-level skills (via agent_skills for agents in this scope)
      const [scopeSkills, agentSkills] = await Promise.all([
        skillService.getScopeLevelSkills(request.user!.orgId, scopeId),
        skillService.getAllAgentSkillsForScope(request.user!.orgId, scopeId),
      ]);
      // Deduplicate by skill ID
      const seen = new Set<string>();
      const all = [];
      for (const s of [...scopeSkills, ...agentSkills]) {
        if (!seen.has(s.id)) { seen.add(s.id); all.push(s); }
      }
      return reply.status(200).send({ data: all });
    }
    const skills = await skillService.listSkills(request.user!.orgId);
    return reply.status(200).send({ data: skills });
  });

  // GET /api/skills/:id - Get skill by ID
  fastify.get<GetSkillRequest>('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest<GetSkillRequest>, reply: FastifyReply) => {
    const skill = await skillService.getSkill(request.user!.orgId, request.params.id);
    if (!skill) return reply.status(404).send({ error: `Skill not found: ${request.params.id}`, code: 'SKILL_NOT_FOUND' });
    return reply.status(200).send({ data: skill });
  });

  // POST /api/skills - Create skill
  fastify.post<CreateSkillRequest>('/', { preHandler: [authenticate] }, async (request: FastifyRequest<CreateSkillRequest>, reply: FastifyReply) => {
    const skill = await skillService.createSkill(request.user!.orgId, request.body);
    return reply.status(201).send({ data: skill });
  });

  // PATCH /api/skills/:id - Update skill
  fastify.patch<UpdateSkillRequest>('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest<UpdateSkillRequest>, reply: FastifyReply) => {
    const skill = await skillService.updateSkill(request.user!.orgId, request.params.id, request.body);
    if (!skill) return reply.status(404).send({ error: `Skill not found: ${request.params.id}`, code: 'SKILL_NOT_FOUND' });
    return reply.status(200).send({ data: skill });
  });

  // DELETE /api/skills/:id - Delete skill
  fastify.delete<GetSkillRequest>('/:id', { preHandler: [authenticate] }, async (request: FastifyRequest<GetSkillRequest>, reply: FastifyReply) => {
    const deleted = await skillService.deleteSkill(request.user!.orgId, request.params.id);
    if (!deleted) return reply.status(404).send({ error: `Skill not found: ${request.params.id}`, code: 'SKILL_NOT_FOUND' });
    return reply.status(204).send();
  });

  // POST /api/skills/batch - Get multiple skills
  fastify.post<GetMultipleSkillsRequest>('/batch', { preHandler: [authenticate] }, async (request: FastifyRequest<GetMultipleSkillsRequest>, reply: FastifyReply) => {
    const skills = await skillService.getSkills(request.user!.orgId, request.body.skill_ids);
    return reply.status(200).send({ data: skills });
  });

  // GET /api/skills/:id/upload-url - Get presigned upload URL
  fastify.get<GetSkillRequest>('/:id/upload-url', { preHandler: [authenticate] }, async (request: FastifyRequest<GetSkillRequest>, reply: FastifyReply) => {
    const url = await skillService.getUploadUrl(request.user!.orgId, request.params.id);
    if (!url) return reply.status(404).send({ error: `Skill not found: ${request.params.id}`, code: 'SKILL_NOT_FOUND' });
    return reply.status(200).send({ upload_url: url });
  });

  // GET /api/skills/:id/download-url - Get presigned download URL
  fastify.get<GetSkillRequest>('/:id/download-url', { preHandler: [authenticate] }, async (request: FastifyRequest<GetSkillRequest>, reply: FastifyReply) => {
    const url = await skillService.getDownloadUrl(request.user!.orgId, request.params.id);
    if (!url) return reply.status(404).send({ error: `Skill not found: ${request.params.id}`, code: 'SKILL_NOT_FOUND' });
    return reply.status(200).send({ download_url: url });
  });

  // GET /api/skills/agent/:agentId - Get skills for agent
  fastify.get<{ Params: { agentId: string } }>('/agent/:agentId', { preHandler: [authenticate] }, async (request, reply) => {
    const skills = await skillService.getAgentSkills(request.user!.orgId, request.params.agentId);
    return reply.status(200).send({ data: skills });
  });

  // PUT /api/skills/agent/:agentId - Set all skills for agent
  fastify.put<SetAgentSkillsRequest>('/agent/:agentId', { preHandler: [authenticate] }, async (request: FastifyRequest<SetAgentSkillsRequest>, reply: FastifyReply) => {
    await skillService.setAgentSkills(request.user!.orgId, request.params.agentId, request.body.skill_ids, request.user!.id);
    return reply.status(200).send({ success: true });
  });

  // POST /api/skills/agent/:agentId/:skillId - Assign skill to agent
  fastify.post<AgentSkillRequest>('/agent/:agentId/:skillId', { preHandler: [authenticate] }, async (request: FastifyRequest<AgentSkillRequest>, reply: FastifyReply) => {
    await skillService.assignSkillToAgent(request.user!.orgId, request.params.agentId, request.params.skillId, request.user!.id);
    return reply.status(201).send({ success: true });
  });

  // DELETE /api/skills/agent/:agentId/:skillId - Remove skill from agent
  fastify.delete<AgentSkillRequest>('/agent/:agentId/:skillId', { preHandler: [authenticate] }, async (request: FastifyRequest<AgentSkillRequest>, reply: FastifyReply) => {
    await skillService.removeSkillFromAgent(request.user!.orgId, request.params.agentId, request.params.skillId);
    return reply.status(204).send();
  });

  // PUT /api/skills/:id/content - Update SKILL.md content
  fastify.put<{ Params: { id: string }; Body: { content: string } }>(
    '/:id/content',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { content } = request.body;
      if (!content || typeof content !== 'string') {
        return reply.status(400).send({ error: 'content is required', code: 'VALIDATION_ERROR' });
      }
      const success = await skillService.updateSkillContent(request.user!.orgId, request.params.id, content);
      if (!success) {
        return reply.status(404).send({ error: `Skill not found: ${request.params.id}`, code: 'SKILL_NOT_FOUND' });
      }
      return reply.status(200).send({ success: true });
    }
  );

  // PUT /api/skills/:id/content/scoped - Update SKILL.md content with fork-on-write for a scope
  fastify.put<{ Params: { id: string }; Body: { content: string; scope_id: string } }>(
    '/:id/content/scoped',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { content, scope_id } = request.body;
      if (!content || typeof content !== 'string') {
        return reply.status(400).send({ error: 'content is required', code: 'VALIDATION_ERROR' });
      }
      if (!scope_id || typeof scope_id !== 'string') {
        return reply.status(400).send({ error: 'scope_id is required', code: 'VALIDATION_ERROR' });
      }
      const result = await skillService.updateSkillContentForScope(
        request.user!.orgId, request.params.id, scope_id, content,
      );
      return reply.status(200).send({ success: true, skillId: result.skillId, forked: result.forked });
    }
  );
}
