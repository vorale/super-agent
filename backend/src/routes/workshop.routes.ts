/**
 * Workshop Routes
 *
 * Skill Workshop endpoints for live agent skill testing.
 *
 * POST   /api/agents/:agentId/workshop/equip       — Equip a skill
 * DELETE /api/agents/:agentId/workshop/unequip/:skillId — Unequip a skill
 * GET    /api/agents/:agentId/workshop/equipped     — List equipped skills
 * GET    /api/agents/:agentId/workshop/suggestions  — Get skill suggestions
 * GET    /api/agents/:agentId/workshop/installed     — List all installed skills
 * POST   /api/agents/:agentId/workshop/save         — Persist equipped skills
 * POST   /api/agents/:agentId/workshop/chat         — Chat with equipped skills (SSE)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { workshopService } from '../services/workshop.service.js';
import { chatService } from '../services/chat.service.js';
import { authenticate } from '../middleware/auth.js';

interface AgentParams {
  Params: { agentId: string };
}

interface EquipBody {
  Params: { agentId: string };
  Body: { skillId: string };
}

interface UnequipParams {
  Params: { agentId: string; skillId: string };
}

interface ChatBody {
  Params: { agentId: string };
  Body: {
    message: string;
    sessionId?: string;
    businessScopeId?: string;
    systemPromptOverride?: string;
  };
}

interface ConsolidateBody {
  Params: { agentId: string };
}

export async function workshopRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /equipped — List currently equipped skills in the workshop session
   */
  fastify.get<AgentParams>(
    '/:agentId/workshop/equipped',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<AgentParams>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const { agentId } = request.params;

      const skills = await workshopService.getEquippedSkills(orgId, agentId);
      return reply.send({ data: skills });
    },
  );

  /**
   * POST /equip — Equip a skill to the workshop session
   */
  fastify.post<EquipBody>(
    '/:agentId/workshop/equip',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<EquipBody>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const { agentId } = request.params;
      const { skillId } = request.body;

      if (!skillId) {
        return reply.status(400).send({ error: 'skillId is required' });
      }

      const skill = await workshopService.equipSkill(orgId, agentId, skillId);
      return reply.send({ data: skill });
    },
  );

  /**
   * DELETE /unequip/:skillId — Unequip a skill from the workshop session
   */
  fastify.delete<UnequipParams>(
    '/:agentId/workshop/unequip/:skillId',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<UnequipParams>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const { agentId, skillId } = request.params;

      await workshopService.unequipSkill(orgId, agentId, skillId);
      return reply.status(204).send();
    },
  );

  /**
   * GET /suggestions — Get marketplace skill suggestions based on agent role
   */
  fastify.get<AgentParams>(
    '/:agentId/workshop/suggestions',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<AgentParams>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const { agentId } = request.params;

      const suggestions = await workshopService.getSuggestions(orgId, agentId);
      return reply.send({ data: suggestions });
    },
  );

  /**
   * GET /installed — List all installed skills in the organization
   */
  fastify.get<AgentParams>(
    '/:agentId/workshop/installed',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<AgentParams>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;

      const skills = await workshopService.getInstalledSkills(orgId);
      return reply.send({ data: skills });
    },
  );

  /**
   * POST /reset — Reset the workshop session to an empty state (no equipped skills)
   */
  fastify.post<AgentParams>(
    '/:agentId/workshop/reset',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<AgentParams>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const { agentId } = request.params;

      await workshopService.resetSession(orgId, agentId);
      return reply.status(204).send();
    },
  );

  /**
   * POST /save — Persist the workshop equipped skills to the agent
   */
  fastify.post<AgentParams>(
    '/:agentId/workshop/save',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<AgentParams>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const userId = request.user!.id;
      const { agentId } = request.params;

      const result = await workshopService.saveEquippedSkills(orgId, agentId, userId);
      return reply.send({ data: result });
    },
  );

  /**
   * POST /chat — Chat with the agent using currently equipped workshop skills (SSE)
   */
  fastify.post<ChatBody>(
    '/:agentId/workshop/chat',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<ChatBody>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const userId = request.user!.id;
      const { agentId } = request.params;
      const { message, sessionId, businessScopeId, systemPromptOverride } = request.body;

      if (!message?.trim()) {
        return reply.status(400).send({ error: 'message is required' });
      }

      // Get the workshop's equipped skills to override the default set
      const workshopSkills = await workshopService.getEquippedSkillsForWorkspace(orgId, agentId);

      // Stream chat with the workshop skill override
      await chatService.streamChat(
        reply,
        orgId,
        userId,
        {
          agentId,
          businessScopeId,
          sessionId,
          message: message.trim(),
        },
        workshopSkills,
        systemPromptOverride,
      );
    },
  );

  /**
   * POST /consolidate — Consolidate workspace skills created by skill-creator
   */
  fastify.post<ConsolidateBody>(
    '/:agentId/workshop/consolidate',
    { preHandler: [authenticate] },
    async (request: FastifyRequest<ConsolidateBody>, reply: FastifyReply) => {
      const orgId = request.user!.orgId;
      const { agentId } = request.params;

      const result = await workshopService.consolidateChat(orgId, agentId);
      return reply.status(200).send({ data: result });
    },
  );
}
