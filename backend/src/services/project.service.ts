/**
 * Project Management Service
 * CRUD for projects, issues, members, and comments.
 */

import { prisma } from '../config/database.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  repo_url?: string;
  default_branch?: string;
  business_scope_id?: string;
  agent_id?: string;
  settings?: Record<string, unknown>;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  labels?: string[];
  parent_issue_id?: string;
  estimated_effort?: string;
}

export interface CreateCommentInput {
  content: string;
  comment_type?: string;
  metadata?: Record<string, unknown>;
}

const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];

// ============================================================================
// Project Service
// ============================================================================

export class ProjectService {
  // --- Projects ---

  async createProject(orgId: string, userId: string, input: CreateProjectInput) {
    const project = await prisma.projects.create({
      data: {
        organization_id: orgId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        repo_url: input.repo_url?.trim() ?? null,
        default_branch: input.default_branch ?? 'main',
        business_scope_id: input.business_scope_id ?? null,
        agent_id: input.agent_id ?? null,
        settings: (input.settings ?? {}) as Prisma.InputJsonValue,
        created_by: userId,
      },
    });
    // Add creator as owner
    await prisma.project_members.create({
      data: { project_id: project.id, user_id: userId, role: 'owner' },
    });
    return project;
  }

  async listProjects(orgId: string, userId: string) {
    return prisma.projects.findMany({
      where: {
        organization_id: orgId,
        OR: [
          { members: { some: { user_id: userId } } },
          { created_by: userId },
        ],
      },
      include: {
        members: true,
        _count: { select: { issues: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getProject(orgId: string, projectId: string, userId: string) {
    const project = await prisma.projects.findFirst({
      where: {
        id: projectId,
        organization_id: orgId,
        OR: [
          { members: { some: { user_id: userId } } },
          { created_by: userId },
        ],
      },
      include: { members: true },
    });
    if (!project) throw AppError.notFound('Project not found');
    return project;
  }

  async updateProject(orgId: string, projectId: string, userId: string, input: Partial<CreateProjectInput>) {
    await this.getProject(orgId, projectId, userId); // access check
    return prisma.projects.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
        ...(input.repo_url !== undefined && { repo_url: input.repo_url?.trim() ?? null }),
        ...(input.default_branch !== undefined && { default_branch: input.default_branch }),
        ...(input.business_scope_id !== undefined && { business_scope_id: input.business_scope_id || null }),
        ...(input.agent_id !== undefined && { agent_id: input.agent_id || null }),
        ...(input.settings !== undefined && { settings: input.settings as Prisma.InputJsonValue }),
      },
    });
  }

  async deleteProject(orgId: string, projectId: string, userId: string) {
    const project = await this.getProject(orgId, projectId, userId);
    if ((project as Record<string, unknown>).created_by !== userId) {
      throw AppError.forbidden('Only the project owner can delete it');
    }
    await prisma.projects.delete({ where: { id: projectId } });
  }

  // --- Members ---

  async addMember(_orgId: string, projectId: string, targetUserId: string, role = 'member') {
    await prisma.project_members.upsert({
      where: { unique_project_member: { project_id: projectId, user_id: targetUserId } },
      update: { role },
      create: { project_id: projectId, user_id: targetUserId, role },
    });
  }

  async removeMember(orgId: string, projectId: string, userId: string, targetUserId: string) {
    await this.getProject(orgId, projectId, userId); // org ownership check
    await prisma.project_members.deleteMany({
      where: { project_id: projectId, user_id: targetUserId },
    });
  }

  async getMembers(orgId: string, projectId: string, userId: string) {
    await this.getProject(orgId, projectId, userId); // org ownership check
    return prisma.project_members.findMany({
      where: { project_id: projectId },
      orderBy: { joined_at: 'asc' },
    });
  }

  // --- Issues ---

  async createIssue(orgId: string, projectId: string, userId: string, input: CreateIssueInput) {
    // Auto-increment issue number per project
    const maxIssue = await prisma.project_issues.findFirst({
      where: { project_id: projectId },
      orderBy: { issue_number: 'desc' },
      select: { issue_number: true },
    });
    const nextNumber = (maxIssue?.issue_number ?? 0) + 1;

    // Compute sort_order: append to end of the target lane
    const status = input.status && VALID_STATUSES.includes(input.status) ? input.status : 'backlog';
    const maxOrder = await prisma.project_issues.findFirst({
      where: { project_id: projectId, status },
      orderBy: { sort_order: 'desc' },
      select: { sort_order: true },
    });
    const sortOrder = (maxOrder?.sort_order ?? 0) + 1;

    const issue = await prisma.project_issues.create({
      data: {
        project_id: projectId,
        organization_id: orgId,
        issue_number: nextNumber,
        title: input.title.trim(),
        description: input.description?.trim() ?? null,
        status,
        priority: input.priority && VALID_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
        labels: (input.labels ?? []) as string[],
        sort_order: sortOrder,
        parent_issue_id: input.parent_issue_id ?? null,
        estimated_effort: input.estimated_effort ?? null,
        created_by: userId,
      },
    });

    // Async: trigger AI enrichment (does not block issue creation)
    import('./project-governance.service.js').then(({ governanceService }) => {
      governanceService.enrichIssue(orgId, projectId, issue.id, userId).catch(err => {
        console.error(`[ProjectService] Auto-enrichment failed for issue ${issue.id}:`, err instanceof Error ? err.message : err);
      });
    }).catch(() => {});

    return issue;
  }

  async listIssues(orgId: string, projectId: string, userId: string, filters?: { status?: string; priority?: string }) {
    await this.getProject(orgId, projectId, userId); // org ownership check
    const where: Record<string, unknown> = { project_id: projectId };
    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;

    const issues = await prisma.project_issues.findMany({
      where,
      include: { _count: { select: { comments: true, children: true } } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    // Enrich with creator profiles
    const creatorIds = [...new Set(issues.map(i => i.created_by))];
    const profiles = creatorIds.length > 0
      ? await prisma.profiles.findMany({ where: { id: { in: creatorIds } }, select: { id: true, full_name: true, avatar_url: true, username: true } })
      : [];
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    return issues.map(issue => ({
      ...issue,
      created_by_profile: profileMap.get(issue.created_by) ?? null,
    }));
  }

  async getIssue(orgId: string, projectId: string, issueId: string) {
    const issue = await prisma.project_issues.findFirst({
      where: { id: issueId, project_id: projectId, organization_id: orgId },
      include: { comments: { orderBy: { created_at: 'asc' } }, children: true },
    });
    if (!issue) throw AppError.notFound('Issue not found');
    return issue;
  }

  async updateIssue(orgId: string, projectId: string, issueId: string, input: Partial<CreateIssueInput>) {
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) throw AppError.notFound('Issue not found');

    // Mark analysis as stale if description changed significantly
    const descriptionChanged = input.description !== undefined && input.description !== issue.description;

    const updated = await prisma.project_issues.update({
      where: { id: issueId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() ?? null }),
        ...(input.priority !== undefined && VALID_PRIORITIES.includes(input.priority!) && { priority: input.priority }),
        ...(input.labels !== undefined && { labels: input.labels as string[] }),
        ...(input.estimated_effort !== undefined && { estimated_effort: input.estimated_effort ?? null }),
        ...(descriptionChanged && { ai_analysis_status: 'stale' }),
      },
    });

    return updated;
  }

  async changeIssueStatus(orgId: string, projectId: string, issueId: string, newStatus: string) {
    if (!VALID_STATUSES.includes(newStatus)) {
      throw AppError.validation(`Invalid status: ${newStatus}`);
    }
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) throw AppError.notFound('Issue not found');

    return prisma.project_issues.update({
      where: { id: issueId },
      data: { status: newStatus },
    });
  }

  async reorderIssue(orgId: string, projectId: string, issueId: string, newSortOrder: number, newStatus?: string) {
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) throw AppError.notFound('Issue not found');

    const data: Record<string, unknown> = { sort_order: newSortOrder };
    if (newStatus && VALID_STATUSES.includes(newStatus)) data.status = newStatus;

    return prisma.project_issues.update({ where: { id: issueId }, data });
  }

  async deleteIssue(orgId: string, projectId: string, issueId: string) {
    await prisma.project_issues.deleteMany({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
  }

  // --- Comments ---

  async addComment(orgId: string, issueId: string, userId: string, input: CreateCommentInput) {
    return prisma.project_issue_comments.create({
      data: {
        issue_id: issueId,
        organization_id: orgId,
        author_user_id: userId,
        content: input.content,
        comment_type: input.comment_type ?? 'discussion',
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async listComments(orgId: string, projectId: string, issueId: string) {
    // Verify issue belongs to org via project
    await this.getIssue(orgId, projectId, issueId);
    return prisma.project_issue_comments.findMany({
      where: { issue_id: issueId, organization_id: orgId },
      orderBy: { created_at: 'asc' },
    });
  }

  // --- Agent Execution ---

  /**
   * Track which issues are currently being executed to prevent double-execution.
   */
  private executingIssues = new Set<string>();

  async executeIssue(orgId: string, projectId: string, issueId: string, userId: string) {
    // Prevent double-execution of the same issue
    if (this.executingIssues.has(issueId)) {
      console.log(`[ProjectService] Issue ${issueId} is already being executed, skipping`);
      const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
      return { issue, session_id: issue?.workspace_session_id, branch_name: issue?.branch_name };
    }

    console.log(`[ProjectService] executeIssue called: projectId=${projectId}, issueId=${issueId}, userId=${userId}`);
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) throw AppError.notFound('Issue not found');

    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Project not found');

    console.log(`[ProjectService] Project agent_id=${project.agent_id}, business_scope_id=${project.business_scope_id}`);

    // Early check: business_scope_id is required for agent execution
    if (!project.business_scope_id) {
      console.log(`[ProjectService] No business scope configured for project ${projectId}. Cannot execute.`);
      throw AppError.validation('No business scope configured for this project. Go to Project Settings to assign a scope before executing tasks.');
    }

    // Ensure project workspace exists
    const sessionId = await this.ensureWorkspaceSession(orgId, projectId, userId);
    console.log(`[ProjectService] Workspace session: ${sessionId}`);

    const slug = issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
    const branchName = `issue/${issue.issue_number}/${slug}`;

    const updated = await prisma.project_issues.update({
      where: { id: issueId },
      data: {
        status: 'in_progress',
        branch_name: branchName,
        workspace_session_id: sessionId,
      },
    });

    await prisma.project_issue_comments.create({
      data: {
        issue_id: issueId,
        organization_id: orgId,
        author_user_id: userId,
        content: `Agent execution started. Branch: \`${branchName}\``,
        comment_type: 'status_change',
        metadata: { branch_name: branchName, session_id: sessionId } as Prisma.InputJsonValue,
      },
    });

    // Actually send the task to the agent via the workspace session
    const taskMessage = [
      `You are a software developer working on a project.`,
      `Your workspace is ready for coding. You have full access to create files, run commands, and build software.`,
      ``,
      `## Task`,
      `**Issue #${issue.issue_number}: ${issue.title}**`,
      issue.description ? `\n### Description\n${issue.description}` : '',
      ``,
      `## Instructions`,
      `1. All source code MUST be created inside the \`app/\` directory. Create it if it doesn't exist.`,
      `2. Do NOT place source files in the workspace root — the root is reserved for system files (.claude/, documents/, memories/).`,
      `3. Inside \`app/\`, organize files with a clear structure (e.g., \`app/src/\`, \`app/public/\`, \`app/package.json\`).`,
      `4. Make sure the code is functional and well-structured.`,
      `5. After writing the code, briefly summarize what you created.`,
      project.repo_url ? `\nRepository: ${project.repo_url}` : '',
      `\nBranch: \`${branchName}\``,
    ].filter(Boolean).join('\n');

    // System prompt override: tell the agent it's a software developer, not a business consultant
    const devSystemPrompt = [
      `You are a senior software developer. Your job is to implement coding tasks by writing real, functional code.`,
      `You are working in a project workspace. Use your tools to create files, write code, and run commands.`,
      `IMPORTANT: All source code files MUST go inside the \`app/\` directory. Never create source files in the workspace root.`,
      `The workspace root contains system directories (.claude/, documents/, memories/) — do not mix application code with them.`,
      `Do NOT refuse to write code. Do NOT say the workspace is misconfigured. Just implement the task.`,
      `Focus on writing clean, working code. Create all necessary files inside \`app/\`.`,
      project.repo_url ? `The project repository is: ${project.repo_url}` : '',
      project.default_branch ? `Default branch: ${project.default_branch}` : '',
    ].filter(Boolean).join('\n');

    // Persist the task message to the workspace session so the console shows it
    const { chatMessageRepository } = await import('../repositories/chat.repository.js');
    await chatMessageRepository.create({
      session_id: sessionId,
      type: 'user',
      content: taskMessage,
      agent_id: null,
      mention_agent_id: null,
      metadata: { source: 'project_execute', issue_id: issueId },
    }, orgId);

    console.log(`[ProjectService] Task message persisted to session. Checking agent config...`);
    console.log(`[ProjectService] Sending task to agent via chatService.processMessage. scopeId=${project.business_scope_id}, agentId=${project.agent_id}`);
    this.executingIssues.add(issueId);
    const { chatService } = await import('./chat.service.js');
    chatService.processMessage({
      sessionId,
      businessScopeId: project.business_scope_id,
      message: taskMessage,
      organizationId: orgId,
      userId,
      systemPromptOverride: devSystemPrompt,
    }).then(async (result) => {
        console.log(`[ProjectService] Agent responded for issue ${issueId}. Response length: ${result.text.length}`);
        // Persist agent response
        await chatMessageRepository.create({
          session_id: sessionId,
          type: 'ai',
          content: result.text,
          agent_id: project.agent_id ?? null,
          mention_agent_id: null,
          metadata: { source: 'project_agent_response', issue_id: issueId },
        }, orgId).catch(() => {});

        // Auto-transition: move issue to in_review when agent completes
        await this.completeIssueExecution(orgId, projectId, issueId, 'in_review', userId);
      }).catch(async (err) => {
        console.error(`[ProjectService] Agent execution FAILED for issue ${issueId}:`, err.message || err);
        await chatMessageRepository.create({
          session_id: sessionId,
          type: 'ai',
          content: `Agent execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          agent_id: null,
          mention_agent_id: null,
          metadata: { source: 'project_agent_error', issue_id: issueId },
        }, orgId).catch(() => {});

        // On failure, move back to todo so auto-process can retry or user can intervene
        await this.completeIssueExecution(orgId, projectId, issueId, 'todo', userId);
      }).finally(() => {
        this.executingIssues.delete(issueId);
      });

    return { issue: updated, session_id: sessionId, branch_name: branchName };
  }

  /**
   * Complete an issue execution: update status, add comment, and trigger next auto-process.
   */
  private async completeIssueExecution(
    orgId: string, projectId: string, issueId: string,
    newStatus: 'in_review' | 'done' | 'todo', userId: string,
  ) {
    try {
      await prisma.project_issues.update({
        where: { id: issueId },
        data: { status: newStatus },
      });

      // Sync workspace files from S3 after agent completes
      try {
        await this.syncWorkspaceFromS3(orgId, projectId, userId);
      } catch (err) {
        console.warn(`[ProjectService] Post-execution workspace sync failed:`, err instanceof Error ? err.message : err);
      }

      // Fetch and store diff from S3 (uploaded by AgentCore's Stop hook)
      try {
        await this.fetchAndStoreDiff(orgId, projectId, issueId);
      } catch (err) {
        console.warn(`[ProjectService] Diff fetch failed:`, err instanceof Error ? err.message : err);
      }

      const statusLabel = newStatus === 'in_review' ? 'In Review' : newStatus === 'done' ? 'Done' : 'Todo';
      await prisma.project_issue_comments.create({
        data: {
          issue_id: issueId,
          organization_id: orgId,
          author_user_id: userId,
          content: `Agent execution completed. Issue moved to **${statusLabel}**.`,
          comment_type: 'status_change',
          metadata: { new_status: newStatus } as Prisma.InputJsonValue,
        },
      });

      console.log(`[ProjectService] Issue ${issueId} moved to ${newStatus}`);

      // Check if auto-process is enabled and trigger next task
      const project = await prisma.projects.findFirst({ where: { id: projectId } });
      if (project) {
        const settings = (project.settings as Record<string, unknown>) ?? {};
        if (settings.auto_process) {
          console.log(`[ProjectService] Auto-process enabled, checking for next todo...`);
          // Small delay to avoid race conditions
          setTimeout(() => {
            this.autoProcessNext(orgId, projectId, userId).catch(err => {
              console.error(`[ProjectService] Auto-process next failed:`, err.message || err);
            });
          }, 2000);
        }
      }
    } catch (err) {
      console.error(`[ProjectService] Failed to complete issue execution:`, err);
    }
  }

  async autoProcessNext(orgId: string, projectId: string, userId: string) {
    // Check if any issue is currently being executed (in-memory guard)
    const inProgress = await prisma.project_issues.findFirst({
      where: { project_id: projectId, status: 'in_progress' },
    });

    // If there's an in_progress issue but it's not actively being executed,
    // it might be stuck. Check if it's been in_progress for too long (> 10 min).
    if (inProgress) {
      const isActivelyExecuting = this.executingIssues.has(inProgress.id);
      const stuckThresholdMs = 10 * 60 * 1000; // 10 minutes
      const elapsed = Date.now() - new Date(inProgress.updated_at).getTime();

      if (!isActivelyExecuting && elapsed > stuckThresholdMs) {
        console.log(`[ProjectService] Issue ${inProgress.id} appears stuck (in_progress for ${Math.round(elapsed / 60000)}min, not actively executing). Moving back to todo.`);
        await prisma.project_issues.update({
          where: { id: inProgress.id },
          data: { status: 'todo' },
        });
        await prisma.project_issue_comments.create({
          data: {
            issue_id: inProgress.id,
            organization_id: orgId,
            author_user_id: userId,
            content: `Issue was stuck in "In Progress" for ${Math.round(elapsed / 60000)} minutes without active execution. Moved back to Todo for retry.`,
            comment_type: 'status_change',
            metadata: { reason: 'stuck_recovery' } as Prisma.InputJsonValue,
          },
        });
        // Fall through to pick up the next todo
      } else {
        return null; // Still actively executing, wait
      }
    }

    const nextTodo = await prisma.project_issues.findFirst({
      where: { project_id: projectId, status: 'todo' },
      orderBy: { sort_order: 'asc' },
    });
    if (!nextTodo) return null;

    return this.executeIssue(orgId, projectId, nextTodo.id, userId);
  }

  async updateSettings(orgId: string, projectId: string, userId: string, settings: Record<string, unknown>) {
    await this.getProject(orgId, projectId, userId);
    return prisma.projects.update({
      where: { id: projectId },
      data: { settings: settings as Prisma.InputJsonValue },
    });
  }

  async getSettings(orgId: string, projectId: string, userId: string): Promise<Record<string, unknown>> {
    const project = await this.getProject(orgId, projectId, userId);
    return (project as Record<string, unknown>).settings as Record<string, unknown> ?? {};
  }

  /**
   * Ensure the project has a workspace session. Creates one if it doesn't exist.
   * This session is the persistent workspace for the project's agent.
   */
  async ensureWorkspaceSession(orgId: string, projectId: string, userId: string): Promise<string> {
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Project not found');

    if (project.workspace_session_id) {
      // Validate the existing session still exists
      const existingSession = await prisma.chat_sessions.findFirst({
        where: { id: project.workspace_session_id },
      });

      if (existingSession) {
        // Ensure the session has the correct business_scope_id
        if (project.business_scope_id && existingSession.business_scope_id !== project.business_scope_id) {
          await prisma.chat_sessions.update({
            where: { id: project.workspace_session_id },
            data: { business_scope_id: project.business_scope_id },
          }).catch(() => {});
        }
        return project.workspace_session_id;
      }

      // Session was deleted — fall through to create a new one
      console.log(`[ProjectService] Workspace session ${project.workspace_session_id} no longer exists, creating new one`);
    }

    // Create a persistent workspace session for this project
    const session = await prisma.chat_sessions.create({
      data: {
        organization_id: orgId,
        user_id: userId,
        business_scope_id: project.business_scope_id ?? null,
        agent_id: project.agent_id,
        title: `Project: ${project.name}`,
        status: 'idle',
        room_mode: 'single',
        routing_strategy: 'auto',
        context: {
          project_id: projectId,
          repo_url: project.repo_url,
          default_branch: project.default_branch,
        },
      },
    });

    await prisma.projects.update({
      where: { id: projectId },
      data: { workspace_session_id: session.id },
    });

    return session.id;
  }

  /**
   * Use the project's workspace agent to beautify/expand an issue description.
   * Sends a message through the project's chat session so the agent has full context.
   */
  async beautifyDescription(orgId: string, projectId: string, issueId: string, userId: string): Promise<string> {
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) throw AppError.notFound('Issue not found');

    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Project not found');

    // Ensure workspace session exists
    const sessionId = await this.ensureWorkspaceSession(orgId, projectId, userId);

    // Use the chat service to send a message through the workspace agent
    const { chatService } = await import('./chat.service.js');

    const hasDescription = !!issue.description?.trim();

    const message = hasDescription
      ? `Improve the following task description. Make it clear, well-structured, and actionable for a developer. Include acceptance criteria if appropriate. Return ONLY the improved description in Markdown, no preamble or explanation.

Title: ${issue.title}
Current description:
${issue.description}
${project.repo_url ? `Repository: ${project.repo_url}` : ''}`
      : `Generate a clear, well-structured task description for a developer based on the following title. Include a brief overview, key requirements, and acceptance criteria. Return ONLY the description in Markdown, no preamble or explanation.

Title: ${issue.title}
${project.repo_url ? `Repository: ${project.repo_url}` : ''}`;

    if (!project.business_scope_id) {
      throw AppError.validation('No business scope configured for this project. Assign a scope in project settings to enable AI features.');
    }

    const result = await chatService.processMessage({
      sessionId,
      businessScopeId: project.business_scope_id,
      message,
      organizationId: orgId,
      userId,
      systemPromptOverride: 'You are a technical project manager. Your job is to write clear, actionable task descriptions for software developers. Return only the improved description in Markdown. Do NOT use any tools — just respond with text.',
    });

    const improved = result.text;

    // Guard against empty/placeholder responses
    if (!improved || improved === '(No response)' || improved.trim().length < 10) {
      throw AppError.internal('AI did not return a valid description. Please try again.');
    }

    // Save the improved description
    await prisma.project_issues.update({
      where: { id: issueId },
      data: { description: improved },
    });

    return improved;
  }

  /**
   * Sync workspace files from S3 back to local filesystem.
   * Useful after AgentCore container has written files that need to be visible locally.
   */
  async syncWorkspaceFromS3(orgId: string, projectId: string, userId: string): Promise<{ synced: number; path: string }> {
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Project not found');
    if (!project.workspace_session_id) throw AppError.validation('No workspace session exists for this project');
    if (!project.business_scope_id) throw AppError.validation('No business scope configured');

    const { workspaceManager } = await import('./workspace-manager.js');
    const { config: appConfig } = await import('../config/index.js');

    const localPath = workspaceManager.getSessionWorkspacePath(orgId, project.business_scope_id, project.workspace_session_id);
    const s3Bucket = appConfig.agentcore.workspaceS3Bucket;
    const s3Prefix = `${orgId}/${project.business_scope_id}/${project.workspace_session_id}/`;

    // Use the S3 client from workspace manager to download files
    const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { mkdir, writeFile: fsWriteFile } = await import('fs/promises');
    const { join, dirname } = await import('path');
    const { pipeline } = await import('stream/promises');
    const { createWriteStream } = await import('fs');

    const s3Client = new S3Client({ region: appConfig.agentcore.region || 'us-east-1' });
    let downloaded = 0;
    let continuationToken: string | undefined;

    do {
      const result = await s3Client.send(new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: s3Prefix,
        ContinuationToken: continuationToken,
      }));

      for (const obj of result.Contents ?? []) {
        if (!obj.Key) continue;
        const relativePath = obj.Key.slice(s3Prefix.length);
        if (!relativePath || relativePath.endsWith('/')) continue;
        // Skip node_modules and .git
        if (relativePath.includes('node_modules/') || relativePath.includes('.git/')) continue;

        const localFilePath = join(localPath, relativePath);
        try {
          await mkdir(dirname(localFilePath), { recursive: true });
          const response = await s3Client.send(new GetObjectCommand({
            Bucket: s3Bucket,
            Key: obj.Key,
          }));
          if (response.Body) {
            await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(localFilePath));
            downloaded++;
          }
        } catch (err) {
          console.warn(`[ProjectService] syncBack failed for ${relativePath}:`, err instanceof Error ? err.message : err);
        }
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    console.log(`[ProjectService] Synced ${downloaded} files from S3 to ${localPath}`);
    return { synced: downloaded, path: localPath };
  }

  /**
   * Fetch __diff__.json from S3 (uploaded by AgentCore after execution)
   * and store the diff data on the issue record.
   */
  private async fetchAndStoreDiff(orgId: string, projectId: string, issueId: string): Promise<void> {
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project?.workspace_session_id || !project.business_scope_id) return;

    const { config: appConfig } = await import('../config/index.js');
    const { S3Client, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    const s3Client = new S3Client({ region: appConfig.agentcore.region || 'us-east-1' });
    const s3Bucket = appConfig.agentcore.workspaceS3Bucket;
    const s3Prefix = `${orgId}/${project.business_scope_id}/${project.workspace_session_id}/`;
    const diffKey = `${s3Prefix}__diff__.json`;

    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: s3Bucket,
        Key: diffKey,
      }));

      if (!response.Body) return;

      const bodyStr = await response.Body.transformToString('utf-8');
      const diffData = JSON.parse(bodyStr) as {
        diff_stat: Record<string, unknown>;
        diff_patch: string;
        created_at: string;
      };

      // Store on the issue
      await prisma.project_issues.update({
        where: { id: issueId },
        data: {
          diff_stat: diffData.diff_stat as Prisma.InputJsonValue,
          diff_patch: diffData.diff_patch,
          diff_created_at: new Date(diffData.created_at),
        },
      });

      console.log(`[ProjectService] Stored diff for issue ${issueId}: ${(diffData.diff_stat as Record<string, unknown>).files_changed} files changed`);

      // Clean up the diff file from S3
      await s3Client.send(new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: diffKey,
      })).catch(() => {});

    } catch (err) {
      // NoSuchKey is expected if agent didn't produce any changes
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!errMsg.includes('NoSuchKey') && !errMsg.includes('AccessDenied')) {
        console.warn(`[ProjectService] Failed to fetch diff from S3:`, errMsg);
      }
    }
  }

  /**
   * Get the diff data for an issue (for frontend display).
   */
  async getIssueDiff(orgId: string, projectId: string, issueId: string): Promise<{
    diff_stat: Record<string, unknown> | null;
    diff_patch: string | null;
    diff_created_at: Date | null;
  }> {
    const issue = await prisma.project_issues.findFirst({
      where: { id: issueId, project_id: projectId, organization_id: orgId },
      select: { diff_stat: true, diff_patch: true, diff_created_at: true },
    });
    if (!issue) throw AppError.notFound('Issue not found');
    return {
      diff_stat: issue.diff_stat as Record<string, unknown> | null,
      diff_patch: issue.diff_patch,
      diff_created_at: issue.diff_created_at,
    };
  }
}

export const projectService = new ProjectService();
