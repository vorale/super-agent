/**
 * Workflow Workspace Provisioning
 *
 * Shared utility for loading scope data, agents, skills, and provisioning
 * a workspace for workflow execution. Used by WorkflowExecutorV2.
 */

import { workspaceManager, type ScopeForWorkspace, type SkillForWorkspace } from './workspace-manager.js';
import { businessScopeService } from './businessScope.service.js';
import { skillService } from './skill.service.js';
import { agentRepository } from '../repositories/agent.repository.js';
import { skillRepository } from '../repositories/skill.repository.js';

export interface WorkflowWorkspaceResult {
  workspacePath: string;
  /** The session ID used for workspace provisioning (for S3 sync and later retrieval) */
  sessionId: string;
  /** The scope ID used for workspace path construction */
  scopeId: string;
  agents: Array<{ id: string; name: string; displayName: string; role: string | null }>;
  skills: SkillForWorkspace[];
  scopeSkillNames: string[];
}

/**
 * Provision a workspace for workflow execution.
 *
 * Loads scope data, agents with their skills, scope-level skills,
 * and creates a session workspace with all resources available.
 *
 * @param organizationId - Organization ID
 * @param scopeId - Business scope ID
 * @param sessionId - Optional session ID for workspace. If provided, the workspace
 *   can be retrieved later (e.g. using executionId). Defaults to a random UUID.
 */
export async function provisionWorkflowWorkspace(
  organizationId: string,
  scopeId: string,
  sessionId?: string,
): Promise<WorkflowWorkspaceResult> {
  // Load scope
  const scope = await businessScopeService.getBusinessScopeById(scopeId, organizationId);
  if (!scope) throw new Error('Business scope not found');

  // Load agents with skills
  const agents = await agentRepository.findByBusinessScope(organizationId, scopeId);
  const agentSkillsMap = new Map<string, string[]>();
  for (const agent of agents) {
    const agentSkills = await skillRepository.findByAgentId(organizationId, agent.id);
    agentSkillsMap.set(agent.id, agentSkills.map(s => s.name));
  }

  // Load scope-level skills
  const scopeLevelSkills = await skillService.getScopeLevelSkills(organizationId, scopeId);

  // Build combined skills list
  const skillMap = new Map<string, SkillForWorkspace>();
  for (const agent of agents) {
    const agentSkills = await skillRepository.findByAgentId(organizationId, agent.id);
    for (const s of agentSkills) {
      if (!skillMap.has(s.id)) {
        const meta = s.metadata as Record<string, unknown> | null;
        skillMap.set(s.id, {
          id: s.id, name: s.name, hashId: s.hash_id,
          s3Bucket: s.s3_bucket, s3Prefix: s.s3_prefix,
          localPath: meta?.localPath as string | undefined,
        });
      }
    }
  }
  for (const s of scopeLevelSkills) {
    if (!skillMap.has(s.id)) {
      const meta = s.metadata as Record<string, unknown> | null;
      skillMap.set(s.id, {
        id: s.id, name: s.name, hashId: s.hash_id,
        s3Bucket: s.s3_bucket, s3Prefix: s.s3_prefix,
        localPath: meta?.localPath as string | undefined,
      });
    }
  }

  // Provision workspace — use provided sessionId or generate a random one
  const effectiveSessionId = sessionId ?? crypto.randomUUID();
  const scopeForWorkspace: ScopeForWorkspace = {
    id: scope.id,
    name: scope.name,
    description: scope.description,
    configVersion: scope.config_version ?? 1,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      displayName: a.display_name,
      role: a.role,
      systemPrompt: a.system_prompt,
      skillNames: agentSkillsMap.get(a.id) || [],
    })),
    skills: Array.from(skillMap.values()),
    mcpServers: [],
    plugins: [],
  };

  const { workspacePath } = await workspaceManager.ensureSessionWorkspace(
    organizationId, effectiveSessionId, scopeForWorkspace, null,
  );

  return {
    workspacePath,
    sessionId: effectiveSessionId,
    scopeId: scope.id,
    agents: agents.map(a => ({ id: a.id, name: a.name, displayName: a.display_name, role: a.role })),
    skills: Array.from(skillMap.values()),
    scopeSkillNames: scopeLevelSkills.map(s => s.name),
  };
}
