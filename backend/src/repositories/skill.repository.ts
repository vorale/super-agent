/**
 * Skill Repository
 * Data access layer for Skills with S3 metadata storage.
 */

import { prisma } from '../config/database.js';

/**
 * Skill entity type matching the Prisma schema
 */
export interface SkillEntity {
  id: string;
  organization_id: string;
  business_scope_id: string | null;
  parent_skill_id: string | null;
  owner_scope_id: string | null;
  name: string;
  display_name: string;
  description: string | null;
  hash_id: string;
  s3_bucket: string;
  s3_prefix: string;
  version: string;
  status: string;
  skill_type: string;
  tags: unknown;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
}

/**
 * Agent Skill junction entity
 */
export interface AgentSkillEntity {
  id: string;
  agent_id: string;
  skill_id: string;
  assigned_at: Date;
  assigned_by: string | null;
}

/**
 * Skill Repository class
 * Note: Skills table is multi-tenant but uses direct Prisma access
 * since it's a new table not in the original TenantModel type.
 */
export class SkillRepository {
  /**
   * Find all skills for an organization
   */
  async findAll(organizationId: string): Promise<SkillEntity[]> {
    return prisma.skills.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
    }) as Promise<SkillEntity[]>;
  }

  /**
   * Find skill by ID
   */
  async findById(id: string, organizationId: string): Promise<SkillEntity | null> {
    return prisma.skills.findFirst({
      where: { id, organization_id: organizationId },
    }) as Promise<SkillEntity | null>;
  }

  /**
   * Find skill by hash_id
   */
  async findByHashId(organizationId: string, hashId: string): Promise<SkillEntity | null> {
    return prisma.skills.findFirst({
      where: { organization_id: organizationId, hash_id: hashId },
    }) as Promise<SkillEntity | null>;
  }

  /**
   * Find skill by name
   */
  async findByName(organizationId: string, name: string): Promise<SkillEntity | null> {
    return prisma.skills.findFirst({
      where: { organization_id: organizationId, name },
    }) as Promise<SkillEntity | null>;
  }

  /**
   * Find all active skills
   */
  async findActiveSkills(organizationId: string): Promise<SkillEntity[]> {
    return prisma.skills.findMany({
      where: { organization_id: organizationId, status: 'active' },
      orderBy: { name: 'asc' },
    }) as Promise<SkillEntity[]>;
  }

  /**
   * Find skills by IDs
   */
  async findByIds(organizationId: string, skillIds: string[]): Promise<SkillEntity[]> {
    return prisma.skills.findMany({
      where: {
        organization_id: organizationId,
        id: { in: skillIds },
      },
    }) as Promise<SkillEntity[]>;
  }

  /**
   * Create a new skill
   */
  async create(
    organizationId: string,
    data: Omit<SkillEntity, 'id' | 'organization_id' | 'created_at' | 'updated_at'>
  ): Promise<SkillEntity> {
    return prisma.skills.create({
      data: {
        ...data,
        organization_id: organizationId,
      },
    }) as Promise<SkillEntity>;
  }

  /**
   * Update a skill
   */
  async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<SkillEntity, 'id' | 'organization_id' | 'created_at'>>
  ): Promise<SkillEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;

    return prisma.skills.update({
      where: { id },
      data,
    }) as Promise<SkillEntity>;
  }

  /**
   * Delete a skill
   */
  async delete(id: string, organizationId: string): Promise<boolean> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return false;

    await prisma.skills.delete({ where: { id } });
    return true;
  }

  /**
   * Get skills assigned to an agent
   */
  async findByAgentId(organizationId: string, agentId: string): Promise<SkillEntity[]> {
    const agentSkills = await prisma.agent_skills.findMany({
      where: { agent_id: agentId },
      include: { skill: true },
    });
    
    // Filter by organization for security
    return agentSkills
      .map((as) => as.skill as SkillEntity)
      .filter((s) => s.organization_id === organizationId);
  }

  /**
   * Get all unique skills for a business scope (across all agents)
   */
  async findByBusinessScope(organizationId: string, businessScopeId: string): Promise<SkillEntity[]> {
    // Get all agents in the business scope
    const agents = await prisma.agents.findMany({
      where: {
        organization_id: organizationId,
        business_scope_id: businessScopeId,
      },
      select: { id: true },
    });
    
    if (agents.length === 0) return [];
    
    const agentIds = agents.map((a) => a.id);
    
    // Get unique skills across all agents
    const agentSkills = await prisma.agent_skills.findMany({
      where: { agent_id: { in: agentIds } },
      include: { skill: true },
      distinct: ['skill_id'],
    });
    
    return agentSkills
      .map((as) => as.skill as SkillEntity)
      .filter((s) => s.organization_id === organizationId && s.status === 'active');
  }

  /**
   * Assign skill to agent
   */
  async assignToAgent(
    agentId: string,
    skillId: string,
    assignedBy?: string
  ): Promise<AgentSkillEntity> {
    return prisma.agent_skills.create({
      data: {
        agent_id: agentId,
        skill_id: skillId,
        assigned_by: assignedBy,
      },
    }) as Promise<AgentSkillEntity>;
  }

  /**
   * Remove skill from agent
   */
  async removeFromAgent(agentId: string, skillId: string): Promise<void> {
    await prisma.agent_skills.deleteMany({
      where: {
        agent_id: agentId,
        skill_id: skillId,
      },
    });
  }

  /**
   * Bulk assign skills to agent
   */
  async bulkAssignToAgent(
    agentId: string,
    skillIds: string[],
    assignedBy?: string
  ): Promise<number> {
    const result = await prisma.agent_skills.createMany({
      data: skillIds.map(skillId => ({
        agent_id: agentId,
        skill_id: skillId,
        assigned_by: assignedBy,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * Replace all skills for an agent
   */
  async replaceAgentSkills(
    agentId: string,
    skillIds: string[],
    assignedBy?: string
  ): Promise<void> {
    await prisma.$transaction([
      // Remove existing
      prisma.agent_skills.deleteMany({
        where: { agent_id: agentId },
      }),
      // Add new
      prisma.agent_skills.createMany({
        data: skillIds.map(skillId => ({
          agent_id: agentId,
          skill_id: skillId,
          assigned_by: assignedBy,
        })),
      }),
    ]);
  }

  /**
   * Find scope-level skills (skills directly attached to a business scope, not via agents)
   */
  async findScopeLevelSkills(organizationId: string, businessScopeId: string): Promise<SkillEntity[]> {
    return prisma.skills.findMany({
      where: {
        organization_id: organizationId,
        business_scope_id: businessScopeId,
        status: 'active',
      },
      orderBy: { name: 'asc' },
    }) as Promise<SkillEntity[]>;
  }

  /**
   * Find an existing fork of a skill for a specific scope.
   */
  async findScopeFork(organizationId: string, parentSkillId: string, ownerScopeId: string): Promise<SkillEntity | null> {
    return prisma.skills.findFirst({
      where: {
        organization_id: organizationId,
        parent_skill_id: parentSkillId,
        owner_scope_id: ownerScopeId,
        status: 'active',
      },
    }) as Promise<SkillEntity | null>;
  }

  /**
   * Get skills assigned to an agent, preferring scope-owned forks when available.
   * For each skill, checks if a fork exists for the given scope and returns the fork instead.
   */
  async findByAgentIdWithScopeForks(organizationId: string, agentId: string, scopeId: string): Promise<SkillEntity[]> {
    const baseSkills = await this.findByAgentId(organizationId, agentId);
    if (!scopeId) return baseSkills;

    const result: SkillEntity[] = [];
    for (const skill of baseSkills) {
      const fork = await this.findScopeFork(organizationId, skill.id, scopeId);
      result.push(fork || skill);
    }
    return result;
  }

  /**
   * Find scope-level skills by type (e.g. 'api_integration')
   */
  async findScopeLevelSkillsByType(organizationId: string, businessScopeId: string, skillType: string): Promise<SkillEntity[]> {
    return prisma.skills.findMany({
      where: {
        organization_id: organizationId,
        business_scope_id: businessScopeId,
        skill_type: skillType,
        status: 'active',
      },
      orderBy: { name: 'asc' },
    }) as Promise<SkillEntity[]>;
  }
}

// Export singleton instance
export const skillRepository = new SkillRepository();
