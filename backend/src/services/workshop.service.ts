/**
 * Workshop Service
 *
 * Manages the Skill Workshop — a live testing environment where users
 * can temporarily equip/unequip skills on an agent and test them via chat.
 *
 * Workshop sessions are ephemeral (in-memory). Equipped skills are only
 * persisted to the agent when the user explicitly saves.
 */

import { skillRepository } from '../repositories/skill.repository.js';
import { agentRepository } from '../repositories/agent.repository.js';
import { skillMarketplaceService, type MarketplaceSkillResult } from './skill-marketplace.service.js';
import { skillService, type CreateSkillInput } from './skill.service.js';
import { workspaceManager } from './workspace-manager.js';
import { AppError } from '../middleware/errorHandler.js';
import type { SkillForWorkspace } from './workspace-manager.js';
import { readdir, readFile, access } from 'fs/promises';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkshopSession {
  agentId: string;
  organizationId: string;
  /** Skill IDs currently equipped in this workshop session */
  equippedSkillIds: Set<string>;
  /** Timestamp of last activity */
  lastActivity: number;
}

export interface EquippedSkillInfo {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  version: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WorkshopService {
  /** In-memory workshop sessions keyed by `{orgId}:{agentId}` */
  private sessions = new Map<string, WorkshopSession>();

  private sessionKey(orgId: string, agentId: string): string {
    return `${orgId}:${agentId}`;
  }

  /**
   * Get or create a workshop session for an agent.
   * Initializes with the agent's currently persisted skills.
   */
  async getOrCreateSession(
    organizationId: string,
    agentId: string,
  ): Promise<WorkshopSession> {
    const key = this.sessionKey(organizationId, agentId);
    let session = this.sessions.get(key);

    if (!session) {
      // Verify agent exists
      const agent = await agentRepository.findById(agentId, organizationId);
      if (!agent) throw AppError.notFound(`Agent ${agentId} not found`);

      // Load currently assigned skills
      const assignedSkills = await skillRepository.findByAgentId(organizationId, agentId);

      session = {
        agentId,
        organizationId,
        equippedSkillIds: new Set(assignedSkills.map(s => s.id)),
        lastActivity: Date.now(),
      };
      this.sessions.set(key, session);
    }

    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Equip a skill to the workshop session (temporary, not persisted).
   */
  async equipSkill(
    organizationId: string,
    agentId: string,
    skillId: string,
  ): Promise<EquippedSkillInfo> {
    const session = await this.getOrCreateSession(organizationId, agentId);

    // Verify skill exists
    const skill = await skillRepository.findById(skillId, organizationId);
    if (!skill) throw AppError.notFound(`Skill ${skillId} not found`);

    session.equippedSkillIds.add(skillId);
    session.lastActivity = Date.now();

    return {
      id: skill.id,
      name: skill.name,
      displayName: skill.display_name,
      description: skill.description,
      version: skill.version,
    };
  }

  /**
   * Unequip a skill from the workshop session.
   */
  async unequipSkill(
    organizationId: string,
    agentId: string,
    skillId: string,
  ): Promise<void> {
    const session = await this.getOrCreateSession(organizationId, agentId);
    session.equippedSkillIds.delete(skillId);
    session.lastActivity = Date.now();
  }

  /**
   * Get all currently equipped skills for the workshop session.
   */
  async getEquippedSkills(
    organizationId: string,
    agentId: string,
  ): Promise<EquippedSkillInfo[]> {
    const session = await this.getOrCreateSession(organizationId, agentId);
    const skillIds = Array.from(session.equippedSkillIds);

    if (skillIds.length === 0) return [];

    const skills = await skillRepository.findByIds(organizationId, skillIds);
    return skills.map(s => ({
      id: s.id,
      name: s.name,
      displayName: s.display_name,
      description: s.description,
      version: s.version,
    }));
  }

  /**
   * Get skills as SkillForWorkspace[] for use with chat streaming.
   * This is what gets passed to chatService.streamChat as skillsOverride.
   */
  async getEquippedSkillsForWorkspace(
    organizationId: string,
    agentId: string,
  ): Promise<SkillForWorkspace[]> {
    const session = await this.getOrCreateSession(organizationId, agentId);
    const skillIds = Array.from(session.equippedSkillIds);

    if (skillIds.length === 0) return [];

    const skills = await skillRepository.findByIds(organizationId, skillIds);
    return skills.map(s => ({
      id: s.id,
      name: s.name,
      hashId: s.hash_id,
      s3Bucket: s.s3_bucket,
      s3Prefix: s.s3_prefix,
      localPath: (s.metadata as Record<string, unknown>)?.localPath as string | undefined,
    }));
  }

  /**
   * Get skill suggestions based on the agent's role.
   * Searches the marketplace using the agent's role as query.
   */
  async getSuggestions(
    organizationId: string,
    agentId: string,
  ): Promise<MarketplaceSkillResult[]> {
    const agent = await agentRepository.findById(agentId, organizationId);
    if (!agent) throw AppError.notFound(`Agent ${agentId} not found`);

    // Build search query from agent role and display name
    const query = agent.role || agent.display_name || agent.name;

    try {
      return await skillMarketplaceService.search(query);
    } catch {
      // Marketplace search can fail (CLI not available, etc.)
      return [];
    }
  }

  /**
   * Save the current workshop equipped skills to the agent permanently.
   * Replaces all agent skills with the workshop set.
   */
  async saveEquippedSkills(
    organizationId: string,
    agentId: string,
    userId?: string,
  ): Promise<{ savedCount: number }> {
    const session = await this.getOrCreateSession(organizationId, agentId);
    const skillIds = Array.from(session.equippedSkillIds);

    await skillRepository.replaceAgentSkills(agentId, skillIds, userId);

    return { savedCount: skillIds.length };
  }

  /**
   * Close a workshop session (cleanup).
   */
  closeSession(organizationId: string, agentId: string): void {
    const key = this.sessionKey(organizationId, agentId);
    this.sessions.delete(key);
  }

  /**
   * Reset the workshop session to an empty state (no equipped skills).
   * Used by single-skill test mode to start clean.
   */
  async resetSession(organizationId: string, agentId: string): Promise<void> {
    const agent = await agentRepository.findById(agentId, organizationId);
    if (!agent) throw AppError.notFound(`Agent ${agentId} not found`);

    const key = this.sessionKey(organizationId, agentId);
    const session: WorkshopSession = {
      agentId,
      organizationId,
      equippedSkillIds: new Set(),
      lastActivity: Date.now(),
    };
    this.sessions.set(key, session);
  }

  /**
   * Get all installed skills for the organization (for the "equip from installed" list).
   */
  async getInstalledSkills(organizationId: string): Promise<EquippedSkillInfo[]> {
    const skills = await skillRepository.findActiveSkills(organizationId);
    return skills.map(s => ({
      id: s.id,
      name: s.name,
      displayName: s.display_name,
      description: s.description,
      version: s.version,
    }));
  }

  /**
   * Consolidate workshop results into persisted skills.
   *
   * Scans the agent's workspace for skill folders created by skill-creator
   * during the chat session. Any new skills (not builtins, not already in DB)
   * are persisted and returned so the frontend can equip them.
   *
   * Returns `{ created, needsSkillCreator }`:
   * - `created`: skills that were saved from the workspace
   * - `needsSkillCreator`: true if no new skills were found (caller should
   *   trigger skill-creator via chat instead)
   */
  async consolidateChat(
    organizationId: string,
    agentId: string,
  ): Promise<{ created: EquippedSkillInfo[]; needsSkillCreator: boolean }> {
    const agent = await agentRepository.findById(agentId, organizationId);
    if (!agent) throw AppError.notFound(`Agent ${agentId} not found`);

    // Discover skill folders created by skill-creator.
    // The skill-creator writes new skills to the workspace root (e.g. workspace/my-skill/),
    // NOT to .claude/skills/ which is reserved for pre-installed skills.
    const workspacePath = workspaceManager.getWorkspacePath(agentId);
    const skillsDir = workspaceManager.getSkillsDir(agentId);

    // Collect candidate directories: workspace root dirs that contain a SKILL.md
    const diskSkillDirs = new Map<string, string>(); // name -> full path
    try {
      const entries = await readdir(workspacePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Skip hidden dirs (.claude, .git, etc.) and known non-skill dirs
        if (entry.name.startsWith('.')) continue;
        const skillMdPath = join(workspacePath, entry.name, 'SKILL.md');
        try {
          await access(skillMdPath);
          diskSkillDirs.set(entry.name, join(workspacePath, entry.name));
        } catch { /* no SKILL.md — not a skill */ }
      }
    } catch {
      return { created: [], needsSkillCreator: true };
    }

    // Also check .claude/skills/ for any skills created there directly
    try {
      await access(skillsDir);
      const entries = await readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!diskSkillDirs.has(entry.name)) {
          diskSkillDirs.set(entry.name, join(skillsDir, entry.name));
        }
      }
    } catch { /* no .claude/skills dir */ }

    const diskSkillNames = Array.from(diskSkillDirs.keys());

    // Determine which are "new" — exclude builtins and already-persisted skills
    const builtinNames = new Set(['skill-creator', 'app-publisher']);
    const existingSkills = await skillRepository.findActiveSkills(organizationId);
    const existingNames = new Set(existingSkills.map(s => s.name));

    // Also exclude skills that were already equipped in the workshop session
    // (downloaded to the workspace before the chat started — not created by skill-creator)
    const session = this.sessions.get(this.sessionKey(organizationId, agentId));
    const sessionSkillIds = session ? Array.from(session.equippedSkillIds) : [];
    const sessionSkills = sessionSkillIds.length > 0
      ? await skillRepository.findByIds(organizationId, sessionSkillIds)
      : [];
    const preExistingWorkspaceNames = new Set(sessionSkills.map(s => s.name));

    const newSkillNames = diskSkillNames.filter(
      name => !builtinNames.has(name) && !existingNames.has(name) && !preExistingWorkspaceNames.has(name),
    );

    if (newSkillNames.length === 0) {
      return { created: [], needsSkillCreator: true };
    }

    // Persist each new skill
    const created: EquippedSkillInfo[] = [];
    for (const name of newSkillNames) {
      const skillDir = diskSkillDirs.get(name) ?? join(skillsDir, name);

      // Read SKILL.md for metadata
      let description: string | null = null;
      let displayName = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      try {
        const content = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
        const descMatch = content.match(/^description:\s*(.+)$/m);
        if (descMatch?.[1]) description = descMatch[1].trim();
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        if (nameMatch?.[1]) displayName = nameMatch[1].trim().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      } catch { /* no SKILL.md or parse error */ }

      const skill = await skillService.createSkill(organizationId, {
        name,
        display_name: displayName,
        description: description || `Skill created in workshop for ${agent.display_name || agent.name}`,
        tags: ['workshop', 'consolidated'],
        metadata: { source: 'workshop-consolidation', agentId, localPath: skillDir },
      });

      created.push({
        id: skill.id,
        name: skill.name,
        displayName: skill.display_name,
        description: skill.description,
        version: skill.version,
      });
    }

    return { created, needsSkillCreator: false };
  }
}

export const workshopService = new WorkshopService();
