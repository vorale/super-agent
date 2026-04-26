/**
 * Skill Service
 * Manages Claude Skills stored in S3 with metadata in PostgreSQL.
 */

import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { skillRepository, type SkillEntity } from '../repositories/skill.repository.js';
import { agentRepository } from '../repositories/agent.repository.js';
import { businessScopeRepository } from '../repositories/businessScope.repository.js';
import { businessScopeService } from './businessScope.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

export interface CreateSkillInput {
  name: string;
  display_name: string;
  description?: string;
  version?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SkillSummary {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  version: string;
  status: string;
  hash_id: string;
  s3_prefix: string;
}

export interface SkillForRuntime {
  id: string;
  name: string;
  hash_id: string;
  s3_bucket: string;
  s3_prefix: string;
  version: string;
}

const SKILLS_BUCKET = config.s3.skillsBucket;
const s3Client = new S3Client({ region: config.aws.region });

function generateHashId(organizationId: string, name: string): string {
  const hash = createHash('sha256');
  hash.update(`${organizationId}:${name}:${Date.now()}`);
  return hash.digest('hex').substring(0, 16);
}

export class SkillService {
  async listSkills(organizationId: string): Promise<SkillSummary[]> {
    const skills = await skillRepository.findActiveSkills(organizationId);
    return skills.map(s => ({
      id: s.id, name: s.name, display_name: s.display_name,
      description: s.description, version: s.version, status: s.status,
      hash_id: s.hash_id, s3_prefix: s.s3_prefix,
    }));
  }

  async getSkill(organizationId: string, skillId: string): Promise<SkillEntity | null> {
    return skillRepository.findById(skillId, organizationId);
  }

  async getSkills(organizationId: string, skillIds: string[]): Promise<SkillEntity[]> {
    return skillRepository.findByIds(organizationId, skillIds);
  }

  async createSkill(organizationId: string, input: CreateSkillInput): Promise<SkillEntity> {
    const hashId = generateHashId(organizationId, input.name);
    return skillRepository.create(organizationId, {
      name: input.name, display_name: input.display_name,
      description: input.description || null, hash_id: hashId,
      s3_bucket: SKILLS_BUCKET, s3_prefix: `skills/${hashId}/`,
      version: input.version || '1.0.0', status: 'active',
      tags: input.tags || [], metadata: input.metadata || {},
    });
  }

  async updateSkill(organizationId: string, skillId: string, updates: Partial<CreateSkillInput>): Promise<SkillEntity | null> {
    const data: Record<string, unknown> = {};
    if (updates.display_name) data.display_name = updates.display_name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.version) data.version = updates.version;
    if (updates.tags) data.tags = updates.tags;
    if (updates.metadata) data.metadata = updates.metadata;
    return skillRepository.update(skillId, organizationId, data);
  }

  async archiveSkill(organizationId: string, skillId: string): Promise<SkillEntity | null> {
    return skillRepository.update(skillId, organizationId, { status: 'archived' });
  }

  async deleteSkill(organizationId: string, skillId: string): Promise<boolean> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) return false;
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: skill.s3_bucket, Key: `${skill.s3_prefix}skill.zip` }));
    } catch (err) { console.warn(`Failed to delete S3 object for skill ${skillId}:`, err); }
    return skillRepository.delete(skillId, organizationId);
  }

  async getUploadUrl(organizationId: string, skillId: string): Promise<string | null> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) return null;
    return getSignedUrl(s3Client, new PutObjectCommand({ Bucket: skill.s3_bucket, Key: `${skill.s3_prefix}skill.zip`, ContentType: 'application/zip' }), { expiresIn: 3600 });
  }

  async getDownloadUrl(organizationId: string, skillId: string): Promise<string | null> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) return null;
    return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: skill.s3_bucket, Key: `${skill.s3_prefix}skill.zip` }), { expiresIn: 3600 });
  }

  async getAgentSkills(organizationId: string, agentId: string): Promise<SkillEntity[]> {
    return skillRepository.findByAgentId(organizationId, agentId);
  }

  async assignSkillToAgent(organizationId: string, agentId: string, skillId: string, assignedBy?: string): Promise<void> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    await skillRepository.assignToAgent(agentId, skillId, assignedBy);
    await this.bumpScopeForAgent(organizationId, agentId);
  }

  async removeSkillFromAgent(_organizationId: string, agentId: string, skillId: string): Promise<void> {
    await skillRepository.removeFromAgent(agentId, skillId);
    await this.bumpScopeForAgent(_organizationId, agentId);
  }

  async setAgentSkills(organizationId: string, agentId: string, skillIds: string[], assignedBy?: string): Promise<void> {
    const skills = await skillRepository.findByIds(organizationId, skillIds);
    if (skills.length !== skillIds.length) throw new Error('One or more skills not found');
    await skillRepository.replaceAgentSkills(agentId, skillIds, assignedBy);
    await this.bumpScopeForAgent(organizationId, agentId);
  }

  /**
   * Bump config version for the business scope an agent belongs to.
   */
  private async bumpScopeForAgent(organizationId: string, agentId: string): Promise<void> {
    try {
      const agent = await agentRepository.findById(agentId, organizationId);
      if (agent?.business_scope_id) {
        await businessScopeService.bumpConfigVersion(agent.business_scope_id, organizationId);
      }
    } catch (err) {
      console.error(`Failed to bump config_version for agent ${agentId}'s scope:`, err);
    }
  }

  async getScopeSkills(organizationId: string, businessScopeId: string): Promise<SkillForRuntime[]> {
    const skills = await skillRepository.findByBusinessScope(organizationId, businessScopeId);
    return skills.map(s => ({ id: s.id, name: s.name, hash_id: s.hash_id, s3_bucket: s.s3_bucket, s3_prefix: s.s3_prefix, version: s.version }));
  }

  async skillExists(organizationId: string, skillId: string): Promise<boolean> {
    return (await skillRepository.findById(skillId, organizationId)) !== null;
  }

  async findByName(organizationId: string, name: string): Promise<SkillEntity | null> {
    return skillRepository.findByName(organizationId, name);
  }

  /**
   * Create a scope-level skill (attached to business scope, not to any agent).
   */
  async createScopeLevelSkill(
    organizationId: string,
    businessScopeId: string,
    input: CreateSkillInput & { skillType?: string },
  ): Promise<SkillEntity> {
    const hashId = generateHashId(organizationId, input.name);
    const skill = await skillRepository.create(organizationId, {
      name: input.name,
      display_name: input.display_name,
      description: input.description || null,
      hash_id: hashId,
      s3_bucket: SKILLS_BUCKET,
      s3_prefix: `skills/${hashId}/`,
      version: input.version || '1.0.0',
      status: 'active',
      skill_type: input.skillType || 'general',
      tags: input.tags || [],
      metadata: input.metadata || {},
    });

    // Set business_scope_id (Prisma create doesn't include it in the spread above)
    const updated = await skillRepository.update(skill.id, organizationId, {
      business_scope_id: businessScopeId,
    } as Partial<SkillEntity>);

    // Bump scope config version so active sessions pick up the new skill
    await businessScopeService.bumpConfigVersion(businessScopeId, organizationId);

    return updated || skill;
  }

  /**
   * Get all scope-level skills for a business scope.
   */
  async getScopeLevelSkills(organizationId: string, businessScopeId: string): Promise<SkillEntity[]> {
    return skillRepository.findScopeLevelSkills(organizationId, businessScopeId);
  }

  /**
   * Get all skills from all agents in a business scope (via agent_skills).
   * Returns deduplicated skill entities.
   */
  async getAllAgentSkillsForScope(organizationId: string, businessScopeId: string): Promise<SkillEntity[]> {
    const agents = await agentRepository.findByBusinessScope(organizationId, businessScopeId);
    const skillMap = new Map<string, SkillEntity>();
    for (const agent of agents) {
      const skills = await skillRepository.findByAgentId(organizationId, agent.id);
      for (const s of skills) {
        if (!skillMap.has(s.id)) skillMap.set(s.id, s);
      }
    }
    return Array.from(skillMap.values());
  }

  /**
   * Get scope-level API integration skills for a business scope.
   */
  async getScopeIntegrations(organizationId: string, businessScopeId: string): Promise<SkillEntity[]> {
    return skillRepository.findScopeLevelSkillsByType(organizationId, businessScopeId, 'api_integration');
  }

  /**
   * Delete a scope-level skill.
   */
  async deleteScopeLevelSkill(organizationId: string, skillId: string): Promise<boolean> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill || !skill.business_scope_id) return false;

    const scopeId = skill.business_scope_id;
    const deleted = await this.deleteSkill(organizationId, skillId);
    if (deleted) {
      await businessScopeService.bumpConfigVersion(scopeId, organizationId);
    }
    return deleted;
  }

  /**
   * Bind an existing skill to a business scope.
   * Sets the skill's business_scope_id to the given scope.
   */
  async bindSkillToScope(organizationId: string, skillId: string, businessScopeId: string): Promise<void> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) throw AppError.notFound(`Skill with ID ${skillId} not found`);

    const scope = await businessScopeRepository.findById(businessScopeId, organizationId);
    if (!scope) throw AppError.notFound(`Business scope with ID ${businessScopeId} not found`);

    await skillRepository.update(skillId, organizationId, { business_scope_id: businessScopeId });
    await businessScopeService.bumpConfigVersion(businessScopeId, organizationId);
  }

  /**
   * Unbind a skill from a business scope.
   * Clears the skill's business_scope_id without deleting the skill.
   */
  async unbindSkillFromScope(organizationId: string, skillId: string, businessScopeId: string): Promise<void> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) throw AppError.notFound(`Skill with ID ${skillId} not found`);
    if (skill.business_scope_id !== businessScopeId) return; // not bound to this scope

    await skillRepository.update(skillId, organizationId, { business_scope_id: null });
    await businessScopeService.bumpConfigVersion(businessScopeId, organizationId);
  }

  /**
   * Update the SKILL.md content for a skill.
   * Writes to the local file path stored in metadata.localPath.
   */
  async updateSkillContent(organizationId: string, skillId: string, content: string): Promise<boolean> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) return false;

    const metadata = skill.metadata as Record<string, unknown> | null;
    const localPath = metadata?.localPath as string | undefined;

    if (!localPath) {
      // No local path - create one in data/skills/{hash_id}/
      const skillDir = join(process.cwd(), 'data', 'skills', skill.hash_id);
      await mkdir(skillDir, { recursive: true });
      const skillMdPath = join(skillDir, 'SKILL.md');
      await writeFile(skillMdPath, content, 'utf-8');
      
      // Update metadata with the new local path
      const newMetadata = { ...metadata, localPath: skillDir };
      await skillRepository.update(skillId, organizationId, { metadata: newMetadata });
      return true;
    }

    // Write to existing local path
    const skillMdPath = join(localPath, 'SKILL.md');
    await mkdir(dirname(skillMdPath), { recursive: true });
    await writeFile(skillMdPath, content, 'utf-8');
    return true;
  }

  /**
   * Fork-on-write: update skill content scoped to a specific business scope.
   *
   * If the skill already belongs to this scope (owner_scope_id matches), update in place.
   * If the skill is a shared/original skill, fork it first, then update the fork.
   *
   * Returns the (possibly new) skill ID.
   */
  async updateSkillContentForScope(
    organizationId: string,
    skillId: string,
    scopeId: string,
    content: string,
  ): Promise<{ skillId: string; forked: boolean }> {
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) throw AppError.notFound(`Skill with ID ${skillId} not found`);

    // If this skill already belongs to this scope, update in place
    if (skill.owner_scope_id === scopeId) {
      await this.updateSkillContent(organizationId, skillId, content);
      return { skillId, forked: false };
    }

    // Check if a fork already exists for this scope
    const existingFork = await skillRepository.findScopeFork(organizationId, skillId, scopeId);
    if (existingFork) {
      await this.updateSkillContent(organizationId, existingFork.id, content);
      return { skillId: existingFork.id, forked: false };
    }

    // Fork: create a new skill record as a private copy for this scope
    const fork = await this.forkSkillForScope(organizationId, skill, scopeId);

    // Write content to the fork
    await this.updateSkillContent(organizationId, fork.id, content);

    return { skillId: fork.id, forked: true };
  }

  /**
   * Create a private fork of a skill for a specific scope.
   *
   * The fork gets:
   * - A unique name (original-name@scope-{short-id})
   * - parent_skill_id pointing to the original
   * - owner_scope_id set to the target scope
   * - Its own hash_id, local file path, and S3 prefix
   * - A copy of the original skill's content files
   */
  async forkSkillForScope(
    organizationId: string,
    originalSkill: SkillEntity,
    scopeId: string,
  ): Promise<SkillEntity> {
    const shortScopeId = scopeId.substring(0, 8);
    const forkName = `${originalSkill.name}@scope-${shortScopeId}`;
    const forkHashId = generateHashId(organizationId, forkName);

    // Create the fork record
    const fork = await skillRepository.create(organizationId, {
      name: forkName,
      display_name: originalSkill.display_name,
      description: originalSkill.description,
      hash_id: forkHashId,
      s3_bucket: originalSkill.s3_bucket,
      s3_prefix: `skills/${forkHashId}/`,
      version: originalSkill.version,
      status: 'active',
      skill_type: originalSkill.skill_type,
      tags: originalSkill.tags as string[],
      metadata: {
        ...(originalSkill.metadata as Record<string, unknown> || {}),
        forkedFrom: originalSkill.id,
        forkedAt: new Date().toISOString(),
      },
    } as any);

    // Set parent_skill_id and owner_scope_id
    await skillRepository.update(fork.id, organizationId, {
      parent_skill_id: originalSkill.id,
      owner_scope_id: scopeId,
      business_scope_id: scopeId,
    } as Partial<SkillEntity>);

    // Copy the original skill's content files to the fork's directory
    const originalMetadata = originalSkill.metadata as Record<string, unknown> | null;
    const originalLocalPath = originalMetadata?.localPath as string | undefined;
    if (originalLocalPath) {
      const forkDir = join(process.cwd(), 'data', 'skills', forkHashId);
      await mkdir(forkDir, { recursive: true });
      try {
        const { cp } = await import('fs/promises');
        await cp(originalLocalPath, forkDir, { recursive: true });
      } catch {
        // If copy fails, the fork starts empty — content will be written by the caller
      }
      // Update fork metadata with its own local path
      await skillRepository.update(fork.id, organizationId, {
        metadata: {
          ...(fork.metadata as Record<string, unknown> || {}),
          localPath: forkDir,
          forkedFrom: originalSkill.id,
          forkedAt: new Date().toISOString(),
        },
      });
    }

    return (await skillRepository.findById(fork.id, organizationId))!;
  }
}


export const skillService = new SkillService();
