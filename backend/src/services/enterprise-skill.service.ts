/**
 * Enterprise Skill Marketplace Service
 *
 * Manages the internal enterprise skill catalog: browse, publish,
 * import from skills.sh, install to workspace, and vote.
 */

import { readFile, mkdir, cp, access } from 'fs/promises';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import {
  enterpriseSkillRepository,
  type EnterpriseSkillWithDetails,
  type SortOption,
} from '../repositories/enterprise-skill.repository.js';
import { skillService } from './skill.service.js';
import { skillMarketplaceService } from './skill-marketplace.service.js';
import { workspaceManager } from './workspace-manager.js';
import { chatService } from './chat.service.js';
import { AppError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowseOptions {
  query?: string;
  category?: string;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

export interface BrowseResult {
  items: EnterpriseSkillListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface EnterpriseSkillListItem {
  id: string;
  skillId: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
  category: string | null;
  source: string;
  sourceRef: string | null;
  installCount: number;
  voteScore: number;
  publishedBy: string;
  publishedAt: string;
}

export interface PublishOptions {
  skillId: string;
  userId: string;
  category?: string;
  visibility?: string;
}

export interface ImportOptions {
  installRef: string;
  userId: string;
  category?: string;
}

export interface PublishFromWorkspaceOptions {
  sessionId: string;
  skillName: string;
  userId: string;
  displayName?: string;
  description?: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toListItem(entry: EnterpriseSkillWithDetails): EnterpriseSkillListItem {
  return {
    id: entry.id,
    skillId: entry.skill_id,
    name: entry.skill.name,
    displayName: entry.skill.display_name,
    description: entry.skill.description,
    version: entry.skill.version,
    category: entry.category,
    source: entry.source,
    sourceRef: entry.source_ref,
    installCount: entry.install_count,
    voteScore: entry.vote_score,
    publishedBy: entry.published_by,
    publishedAt: entry.published_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EnterpriseSkillService {
  /**
   * Browse the enterprise skill catalog.
   * Org owners/admins see everything. Regular users only see skills
   * that are either published to their groups or have no group restrictions.
   */
  async browse(organizationId: string, options: BrowseOptions = {}, user?: { id: string; role: string }): Promise<BrowseResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const { items, total } = await enterpriseSkillRepository.browse(organizationId, {
      ...options,
      page,
      limit,
    });

    let filtered = items.map(toListItem);

    // Apply group-based filtering for non-admin users
    if (user && user.role !== 'owner' && user.role !== 'admin') {
      const { userGroupRepository } = await import('../repositories/userGroup.repository.js');
      const accessibleSkillIds = await userGroupRepository.getAccessibleSkillIds(organizationId, user.id);
      const accessibleSet = new Set(accessibleSkillIds);

      // Also include skills with no group restrictions (published to everyone)
      const { prisma } = await import('../config/database.js');
      const skillsWithGroups = await prisma.skill_group_access.findMany({
        select: { skill_id: true },
        distinct: ['skill_id'],
      });
      const restrictedSkillIds = new Set(skillsWithGroups.map(s => s.skill_id));

      filtered = filtered.filter(s =>
        accessibleSet.has(s.skillId) || !restrictedSkillIds.has(s.skillId)
      );
    }

    return {
      items: filtered,
      total: filtered.length,
      page,
      limit,
    };
  }

  /**
   * Get distinct categories.
   */
  async getCategories(organizationId: string): Promise<string[]> {
    return enterpriseSkillRepository.getCategories(organizationId);
  }

  /**
   * Publish an existing org skill to the enterprise catalog.
   */
  async publish(organizationId: string, options: PublishOptions): Promise<EnterpriseSkillListItem> {
    const skill = await skillService.getSkill(organizationId, options.skillId);
    if (!skill) throw AppError.notFound(`Skill ${options.skillId} not found`);

    // Check if already published
    const existing = await enterpriseSkillRepository.findBySkillId(options.skillId, organizationId);
    if (existing) throw AppError.validation('Skill is already published to the enterprise catalog');

    const entry = await enterpriseSkillRepository.publish(organizationId, {
      skillId: options.skillId,
      publishedBy: options.userId,
      category: options.category,
      visibility: options.visibility,
    });

    // Re-fetch with skill details
    const full = await enterpriseSkillRepository.findById(entry.id, organizationId);
    return toListItem(full!);
  }

  /**
   * Import a skill from skills.sh and auto-publish to enterprise catalog.
   */
  async importFromExternal(
    organizationId: string,
    options: ImportOptions,
  ): Promise<EnterpriseSkillListItem> {
    // Install from skills.sh (reuses existing marketplace service)
    const installed = await skillMarketplaceService.install({
      organizationId,
      installRef: options.installRef,
      userId: options.userId,
    });

    // Publish to enterprise catalog
    const entry = await enterpriseSkillRepository.publish(organizationId, {
      skillId: installed.skillId,
      publishedBy: options.userId,
      category: options.category,
      source: 'skills.sh',
      sourceRef: options.installRef,
    });

    const full = await enterpriseSkillRepository.findById(entry.id, organizationId);
    return toListItem(full!);
  }

  /**
   * Install an enterprise skill into a session workspace.
   */
  async installToWorkspace(
    organizationId: string,
    marketplaceId: string,
    sessionId: string,
  ): Promise<void> {
    const entry = await enterpriseSkillRepository.findById(marketplaceId, organizationId);
    if (!entry) throw AppError.notFound('Enterprise skill not found');

    const session = await chatService.getSessionById(sessionId, organizationId);
    if (!session.business_scope_id) {
      throw AppError.validation('Session has no business scope — cannot install skill');
    }

    const metadata = entry.skill.metadata as Record<string, unknown> | null;
    const localPath = metadata?.localPath as string | undefined;

    // Try local path first, fall back to S3 download if path is missing or inaccessible
    let installed = false;
    if (localPath) {
      try {
        await access(localPath);
        await workspaceManager.installSkillToWorkspace(
          organizationId,
          session.business_scope_id,
          sessionId,
          entry.skill.name,
          localPath,
        );
        installed = true;
      } catch {
        // localPath not accessible (e.g. deployed to a different server), fall through to S3
      }
    }

    if (!installed) {
      // Download from S3 into workspace
      const skillsDir = join(
        workspaceManager.getSessionWorkspacePath(organizationId, session.business_scope_id, sessionId),
        '.claude',
        'skills',
      );
      await workspaceManager.downloadSkill(
        {
          id: entry.skill.id,
          name: entry.skill.name,
          hashId: entry.skill.hash_id,
          s3Bucket: entry.skill.s3_bucket,
          s3Prefix: entry.skill.s3_prefix,
          localPath: undefined,
        },
        skillsDir,
      );
    }

    await enterpriseSkillRepository.incrementInstallCount(marketplaceId);

    // In agentcore mode, sync the installed skill to S3 and the container
    // so the workspace file tree can see it immediately.
    const { config: appConfig } = await import('../config/index.js');
    if (appConfig.agentRuntime === 'agentcore') {
      const skillSourceDir = join(
        workspaceManager.getSessionWorkspacePath(organizationId, session.business_scope_id, sessionId),
        '.claude', 'skills', entry.skill.name,
      );

      // Sync to S3
      try {
        const { readdir, readFile: readFileAsync, stat } = await import('fs/promises');
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({ region: appConfig.aws.region });
        const s3Bucket = appConfig.agentcore.workspaceS3Bucket;
        const s3Prefix = `${organizationId}/${session.business_scope_id}/${sessionId}/`;

        const uploadSkillFiles = async (srcDir: string, destPrefix: string): Promise<void> => {
          const entries = await readdir(srcDir, { withFileTypes: true });
          for (const e of entries) {
            const srcPath = join(srcDir, e.name);
            const destKey = `${destPrefix}/${e.name}`;
            if (e.isDirectory()) {
              await uploadSkillFiles(srcPath, destKey);
            } else {
              const content = await readFileAsync(srcPath);
              await s3.send(new PutObjectCommand({
                Bucket: s3Bucket,
                Key: destKey,
                Body: content,
                ContentLength: content.length,
              }));
            }
          }
        };

        await uploadSkillFiles(skillSourceDir, `${s3Prefix}.claude/skills/${entry.skill.name}`);
      } catch (err) {
        console.warn(`[enterprise-skill] Failed to sync skill "${entry.skill.name}" to S3:`, err);
      }

      // Sync to container
      try {
        const { agentCoreCommandService } = await import('./agentcore-command.service.js');
        const { readdir, readFile: readFileAsync } = await import('fs/promises');

        const writeSkillFiles = async (srcDir: string, destPrefix: string): Promise<void> => {
          const entries = await readdir(srcDir, { withFileTypes: true });
          for (const e of entries) {
            const srcPath = join(srcDir, e.name);
            const destPath = `${destPrefix}/${e.name}`;
            if (e.isDirectory()) {
              await writeSkillFiles(srcPath, destPath);
            } else {
              const content = await readFileAsync(srcPath, 'utf-8');
              await agentCoreCommandService.writeFile(sessionId, destPath, content);
            }
          }
        };

        await agentCoreCommandService.runCommand(sessionId, `mkdir -p /workspace/.claude/skills/${entry.skill.name}`);
        await writeSkillFiles(skillSourceDir, `.claude/skills/${entry.skill.name}`);
      } catch (err) {
        console.warn(`[enterprise-skill] Failed to sync skill "${entry.skill.name}" to container:`, err);
      }
    }
  }

  /**
   * Vote on an enterprise skill.
   */
  async vote(
    organizationId: string,
    marketplaceId: string,
    userId: string,
    vote: 1 | -1,
  ): Promise<{ voteScore: number }> {
    const entry = await enterpriseSkillRepository.findById(marketplaceId, organizationId);
    if (!entry) throw AppError.notFound('Enterprise skill not found');
    return enterpriseSkillRepository.upsertVote(marketplaceId, userId, vote);
  }

  /**
   * Publish a skill created in a chat session workspace to the enterprise catalog.
   */
  async publishFromWorkspace(
    organizationId: string,
    options: PublishFromWorkspaceOptions,
  ): Promise<EnterpriseSkillListItem> {
    const session = await chatService.getSessionById(options.sessionId, organizationId);
    if (!session.business_scope_id) {
      throw AppError.validation('Session has no business scope');
    }

    // Read skill files from workspace
    const workspacePath = workspaceManager.getSessionWorkspacePath(
      organizationId,
      session.business_scope_id,
      options.sessionId,
    );
    const skillSourceDir = join(workspacePath, '.claude', 'skills', options.skillName);

    let skillMdContent: string | null = null;
    try {
      skillMdContent = await readFile(join(skillSourceDir, 'SKILL.md'), 'utf-8');
    } catch {
      throw AppError.notFound(`Skill "${options.skillName}" not found in session workspace`);
    }

    // Extract description from SKILL.md if not provided
    let description = options.description ?? null;
    if (!description && skillMdContent) {
      const match = skillMdContent.match(/^description:\s*(.+)$/m);
      if (match?.[1]) description = match[1].trim();
    }

    const displayName = options.displayName ?? options.skillName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const hashId = createHash('sha256')
      .update(`${organizationId}:workspace:${options.skillName}:${Date.now()}`)
      .digest('hex')
      .substring(0, 16);

    // Copy skill files to permanent storage
    const permanentDir = resolve(process.cwd(), 'data', 'skills', hashId);
    await mkdir(permanentDir, { recursive: true });
    await cp(skillSourceDir, permanentDir, { recursive: true });

    // Create or update skill DB record
    let skill: any;
    const existingSkill = await skillService.findByName(organizationId, options.skillName);
    if (existingSkill) {
      // Update existing skill with new content
      skill = await skillService.updateSkill(organizationId, existingSkill.id, {
        display_name: displayName,
        description: description ?? existingSkill.description ?? `Published from chat session`,
        version: existingSkill.version ?? '1.0.0',
        metadata: {
          ...(existingSkill.metadata as Record<string, unknown> ?? {}),
          source: 'workspace',
          sessionId: options.sessionId,
          localPath: permanentDir,
          publishedAt: new Date().toISOString(),
        },
      });
    } else {
      skill = await skillService.createSkill(organizationId, {
        name: options.skillName,
        display_name: displayName,
        description: description ?? `Published from chat session`,
        version: '1.0.0',
        tags: ['workspace-published'],
        metadata: {
          source: 'workspace',
          sessionId: options.sessionId,
          localPath: permanentDir,
          publishedAt: new Date().toISOString(),
        },
      });
    }

    // Publish to enterprise catalog (or return existing entry if already published)
    const existingEntry = await enterpriseSkillRepository.findBySkillId(skill.id, organizationId);
    if (existingEntry) {
      const full = await enterpriseSkillRepository.findById(existingEntry.id, organizationId);
      return toListItem(full!);
    }

    const entry = await enterpriseSkillRepository.publish(organizationId, {
      skillId: skill.id,
      publishedBy: options.userId,
      category: options.category,
      source: 'internal',
    });

    const full = await enterpriseSkillRepository.findById(entry.id, organizationId);
    return toListItem(full!);
  }
}

export const enterpriseSkillService = new EnterpriseSkillService();
