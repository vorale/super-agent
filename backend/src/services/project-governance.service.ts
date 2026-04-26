/**
 * Project Governance Service
 * AI-driven requirement analysis, conflict detection, and readiness scoring.
 *
 * This service handles the "pre-execution" intelligence layer:
 * - Issue enrichment (acceptance criteria, labels, effort, split suggestions)
 * - Cross-issue conflict/dependency/duplicate detection
 * - Readiness scoring for backlog → todo transition
 * - Triage report generation for sprint planning
 */

import { prisma } from '../config/database.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';
import { projectService } from './project.service.js';

// ============================================================================
// Types
// ============================================================================

interface EnrichmentResult {
  acceptance_criteria?: Array<{ criterion: string }>;
  suggested_labels?: string[];
  estimated_effort?: string;
  should_split?: boolean;
  split_suggestions?: Array<{ title: string; description: string }>;
  improved_description?: string | null;
}

interface ConflictRelation {
  target_issue_number: number;
  relation_type: 'conflicts_with' | 'depends_on' | 'duplicates' | 'related_to';
  confidence: number;
  reasoning: string;
}

interface TriageReport {
  summary: string;
  sprint_estimate: string;
  recommended_order: Array<{ issue_number: number; reason: string }>;
  merge_suggestions: Array<{ issue_numbers: number[]; reason: string; suggested_title: string }>;
  missing_info: Array<{ issue_number: number; what_is_missing: string }>;
  risk_flags: Array<{ issue_number: number; risk: string }>;
}

// ============================================================================
// Service
// ============================================================================

export class ProjectGovernanceService {

  // =========================================================================
  // 1. Issue Enrichment
  // =========================================================================

  /**
   * AI-analyze a single issue: generate acceptance criteria, suggest labels,
   * estimate effort, and recommend sub-task splits.
   * Runs asynchronously — does not block issue creation.
   */
  async enrichIssue(orgId: string, projectId: string, issueId: string, userId: string): Promise<void> {
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) return;

    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project?.business_scope_id) {
      console.log(`[Governance] Skipping enrichment for issue ${issueId}: no business scope`);
      return;
    }

    // Mark as analyzing
    await prisma.project_issues.update({
      where: { id: issueId },
      data: { ai_analysis_status: 'analyzing' },
    });

    try {
      const sessionId = await projectService.ensureWorkspaceSession(orgId, projectId, userId);

      // Gather context: existing issues in the project
      const existingIssues = await prisma.project_issues.findMany({
        where: { project_id: projectId, id: { not: issueId } },
        select: { issue_number: true, title: true, labels: true, estimated_effort: true, status: true },
        orderBy: { sort_order: 'asc' },
      });

      const prompt = `Analyze this project task and provide structured enrichment.
You have access to the project's business knowledge through your scope.

## Task to Analyze
**#${issue.issue_number}: ${issue.title}**
${issue.description ? `Description: ${issue.description}` : 'No description yet.'}

## Existing Project Tasks (for context)
${existingIssues.length > 0
  ? existingIssues.map(i => `- #${i.issue_number} [${i.status}] ${i.title} ${i.estimated_effort ? `(${i.estimated_effort})` : ''}`).join('\n')
  : '(none yet)'}

## Required Output (JSON only, no markdown fences)
{
  "acceptance_criteria": [
    { "criterion": "string describing a testable acceptance criterion" }
  ],
  "suggested_labels": ["label1", "label2"],
  "estimated_effort": "XS|S|M|L|XL",
  "should_split": false,
  "split_suggestions": [],
  "improved_description": null
}

Rules:
- acceptance_criteria: 2-5 testable criteria. Be specific, not vague.
- suggested_labels: 1-3 short labels relevant to the task domain.
- estimated_effort: relative sizing (XS=<1h, S=1-4h, M=4-8h, L=1-3d, XL=3d+).
- should_split: true only if the task is clearly too large for a single issue.
- split_suggestions: only if should_split is true. Each sub-task should be independently deliverable.
- improved_description: provide an improved markdown description ONLY if the original is vague or missing. Otherwise null.`;

      const { chatService } = await import('./chat.service.js');
      const result = await chatService.processMessage({
        sessionId,
        businessScopeId: project.business_scope_id,
        message: prompt,
        organizationId: orgId,
        userId,
        systemPromptOverride: 'You are a technical project manager with deep domain knowledge. Analyze tasks and provide structured JSON output only. No explanations outside the JSON.',
      });

      const analysis = this.parseJsonResponse(result.text) as EnrichmentResult | null;

      // Update issue with analysis results
      const updateData: Record<string, unknown> = {
        ai_analysis_status: 'done',
        last_analyzed_at: new Date(),
      };

      if (analysis) {
        if (analysis.acceptance_criteria?.length) {
          updateData.acceptance_criteria = analysis.acceptance_criteria.map(ac => ({
            criterion: ac.criterion,
            verified: false,
          }));
        }
        if (analysis.estimated_effort && !issue.estimated_effort) {
          updateData.estimated_effort = analysis.estimated_effort;
        }
        if (analysis.suggested_labels?.length && (!issue.labels || (issue.labels as string[]).length === 0)) {
          updateData.labels = analysis.suggested_labels;
        }
        if (analysis.improved_description && !issue.description) {
          updateData.description = analysis.improved_description;
        }

        // Post analysis as a comment
        const commentParts: string[] = ['🔍 **AI Analysis Complete**\n'];

        if (analysis.acceptance_criteria?.length) {
          commentParts.push('**Acceptance Criteria:**');
          for (const ac of analysis.acceptance_criteria) {
            commentParts.push(`- [ ] ${ac.criterion}`);
          }
        }
        if (analysis.estimated_effort) {
          commentParts.push(`\n**Estimated Effort:** ${analysis.estimated_effort}`);
        }
        if (analysis.should_split && analysis.split_suggestions?.length) {
          commentParts.push('\n⚠️ **Suggested Split:**');
          for (const s of analysis.split_suggestions) {
            commentParts.push(`- **${s.title}**: ${s.description}`);
          }
        }

        await prisma.project_issue_comments.create({
          data: {
            issue_id: issueId,
            organization_id: orgId,
            author_agent_id: project.agent_id,
            content: commentParts.join('\n'),
            comment_type: 'ai_analysis',
            metadata: { type: 'enrichment', analysis } as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await prisma.project_issues.update({ where: { id: issueId }, data: updateData });

      console.log(`[Governance] Enrichment complete for issue ${issueId}`);

      // Chain: trigger conflict detection
      await this.detectConflicts(orgId, projectId, issueId, userId);

      // Chain: compute readiness
      await this.computeReadiness(projectId, issueId);

    } catch (err) {
      console.error(`[Governance] Enrichment failed for issue ${issueId}:`, err instanceof Error ? err.message : err);
      await prisma.project_issues.update({
        where: { id: issueId },
        data: { ai_analysis_status: 'done', last_analyzed_at: new Date() },
      }).catch(() => {});
    }
  }

  // =========================================================================
  // 2. Conflict Detection
  // =========================================================================

  /**
   * Compare a target issue against all active issues in the project.
   * Detects: conflicts, dependencies, duplicates, related issues.
   */
  async detectConflicts(orgId: string, projectId: string, issueId: string, userId: string): Promise<void> {
    const issue = await prisma.project_issues.findFirst({ where: { id: issueId, project_id: projectId, organization_id: orgId } });
    if (!issue) return;

    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project?.business_scope_id) return;

    // Get all active issues (exclude self and done/cancelled)
    const activeIssues = await prisma.project_issues.findMany({
      where: {
        project_id: projectId,
        id: { not: issueId },
        status: { in: ['backlog', 'todo', 'in_progress', 'in_review'] },
      },
      select: { id: true, issue_number: true, title: true, description: true, status: true, labels: true },
    });

    if (activeIssues.length === 0) return;

    try {
      const sessionId = await projectService.ensureWorkspaceSession(orgId, projectId, userId);

      const prompt = `Analyze potential conflicts, dependencies, and duplicates between a target task and existing tasks.
Use your business domain knowledge to identify logical contradictions, not just textual similarity.

## Target Task
**#${issue.issue_number}: ${issue.title}**
${issue.description || 'No description'}

## Existing Tasks
${activeIssues.map(i => `**#${i.issue_number}: ${i.title}** [${i.status}]\n${(i.description || 'No description').substring(0, 300)}`).join('\n\n')}

## Required Output (JSON only, no markdown fences)
{
  "relations": [
    {
      "target_issue_number": 1,
      "relation_type": "conflicts_with",
      "confidence": 0.85,
      "reasoning": "one sentence explanation"
    }
  ]
}

Rules:
- Only report relations with confidence >= 0.6
- "conflicts_with": the two tasks have contradictory requirements or goals
- "depends_on": the target task requires the other task to be completed first
- "duplicates": the tasks describe essentially the same work
- "related_to": the tasks touch the same area but don't conflict
- If no meaningful relations exist, return {"relations": []}
- Be conservative. Only flag real issues, not superficial similarities.`;

      const { chatService } = await import('./chat.service.js');
      const result = await chatService.processMessage({
        sessionId,
        businessScopeId: project.business_scope_id,
        message: prompt,
        organizationId: orgId,
        userId,
        systemPromptOverride: 'You are a requirements analyst. Detect conflicts and dependencies between tasks. Output JSON only.',
      });

      const analysis = this.parseJsonResponse(result.text) as { relations?: ConflictRelation[] } | null;
      if (!analysis?.relations?.length) return;

      // Clear previous AI-generated relations for this issue
      await prisma.project_issue_relations.deleteMany({
        where: { source_issue_id: issueId, created_by_ai: true },
      });

      // Write new relations
      const issueNumberToId = new Map(activeIssues.map(i => [i.issue_number, i.id]));

      const highConflicts: Array<{ target_issue_number: number; reasoning: string; confidence: number }> = [];

      for (const rel of analysis.relations) {
        const targetId = issueNumberToId.get(rel.target_issue_number);
        if (!targetId || rel.confidence < 0.6) continue;

        await prisma.project_issue_relations.upsert({
          where: {
            unique_relation: {
              source_issue_id: issueId,
              target_issue_id: targetId,
              relation_type: rel.relation_type,
            },
          },
          create: {
            project_id: projectId,
            source_issue_id: issueId,
            target_issue_id: targetId,
            relation_type: rel.relation_type,
            confidence: rel.confidence,
            reasoning: rel.reasoning,
            status: 'pending',
            created_by_ai: true,
          },
          update: {
            confidence: rel.confidence,
            reasoning: rel.reasoning,
            status: 'pending',
          },
        });

        if (rel.relation_type === 'conflicts_with' && rel.confidence >= 0.8) {
          highConflicts.push({
            target_issue_number: rel.target_issue_number,
            reasoning: rel.reasoning,
            confidence: rel.confidence,
          });
        }
      }

      // Post a comment if high-confidence conflicts found
      if (highConflicts.length > 0) {
        const conflictLines = highConflicts.map(
          c => `- ⚠️ **Conflicts with #${c.target_issue_number}** (${Math.round(c.confidence * 100)}%): ${c.reasoning}`
        );

        await prisma.project_issue_comments.create({
          data: {
            issue_id: issueId,
            organization_id: orgId,
            author_agent_id: project.agent_id,
            content: `🚨 **Conflict Detected**\n\n${conflictLines.join('\n')}\n\nPlease review and resolve before moving to Todo.`,
            comment_type: 'ai_analysis',
            metadata: { type: 'conflict_detection', conflicts: highConflicts } as Prisma.InputJsonValue,
          },
        });
      }

      console.log(`[Governance] Conflict detection complete for issue ${issueId}: ${analysis.relations.length} relation(s) found`);

    } catch (err) {
      console.error(`[Governance] Conflict detection failed for issue ${issueId}:`, err instanceof Error ? err.message : err);
    }
  }

  // =========================================================================
  // 3. Readiness Score
  // =========================================================================

  /**
   * Compute readiness score (0-100) for an issue based on existing data.
   * Pure computation — no AI calls.
   */
  async computeReadiness(_projectId: string, issueId: string): Promise<number> {
    const issue = await prisma.project_issues.findFirst({
      where: { id: issueId },
      include: {
        relations_as_source: true,
        children: { select: { id: true } },
      },
    });
    if (!issue) return 0;

    let score = 0;
    const details: Record<string, { score: number; max: number; reason: string }> = {};

    // --- Completeness (30 points) ---
    let completeness = 0;
    if (issue.title && issue.title.length > 10) completeness += 5;
    if (issue.description && issue.description.length > 50) completeness += 10;
    if (issue.description && issue.description.length > 200) completeness += 5;
    if (issue.acceptance_criteria && (issue.acceptance_criteria as unknown[]).length > 0) completeness += 10;
    details.completeness = {
      score: completeness,
      max: 30,
      reason: completeness >= 25 ? 'Well-documented with acceptance criteria'
        : completeness >= 15 ? 'Has description but could use acceptance criteria'
        : completeness >= 5 ? 'Minimal description, needs more detail'
        : 'Missing description',
    };
    score += completeness;

    // --- Conflicts (25 points) ---
    const unresolvedConflicts = issue.relations_as_source.filter(
      r => r.relation_type === 'conflicts_with' && r.status === 'pending'
    );
    const conflictScore = unresolvedConflicts.length === 0 ? 25 : Math.max(0, 25 - unresolvedConflicts.length * 10);
    details.conflicts = {
      score: conflictScore,
      max: 25,
      reason: unresolvedConflicts.length === 0 ? 'No unresolved conflicts' : `${unresolvedConflicts.length} unresolved conflict(s)`,
    };
    score += conflictScore;

    // --- Dependencies (25 points) ---
    const dependencies = issue.relations_as_source.filter(
      r => r.relation_type === 'depends_on' && r.status !== 'dismissed'
    );
    let depScore = 25;
    if (dependencies.length > 0) {
      const depTargetIds = dependencies.map(d => d.target_issue_id);
      const depIssues = await prisma.project_issues.findMany({
        where: { id: { in: depTargetIds } },
        select: { id: true, status: true },
      });
      const unmetDeps = depIssues.filter(d => !['done', 'in_review'].includes(d.status));
      depScore = unmetDeps.length === 0 ? 25 : Math.max(0, 25 - unmetDeps.length * 12);
      details.dependencies = {
        score: depScore,
        max: 25,
        reason: unmetDeps.length === 0 ? 'All dependencies met' : `${unmetDeps.length} unmet dependency(ies)`,
      };
    } else {
      details.dependencies = { score: 25, max: 25, reason: 'No dependencies' };
    }
    score += depScore;

    // --- Executability (20 points) ---
    let execScore = 0;
    if (issue.ai_analysis_status === 'done') execScore += 10;
    if (issue.estimated_effort) execScore += 5;
    if (issue.labels && (issue.labels as string[]).length > 0) execScore += 5;
    details.executability = {
      score: execScore,
      max: 20,
      reason: execScore >= 15 ? 'Fully analyzed and categorized'
        : execScore >= 10 ? 'AI analyzed, needs effort estimate or labels'
        : 'Not yet analyzed by AI',
    };
    score += execScore;

    // Persist
    await prisma.project_issues.update({
      where: { id: issueId },
      data: {
        readiness_score: score,
        readiness_details: details as unknown as Prisma.InputJsonValue,
      },
    });

    return score;
  }

  /**
   * Batch-recompute readiness for all backlog/todo issues in a project.
   */
  async recomputeAllReadiness(projectId: string): Promise<void> {
    const issues = await prisma.project_issues.findMany({
      where: { project_id: projectId, status: { in: ['backlog', 'todo'] } },
      select: { id: true },
    });
    for (const issue of issues) {
      await this.computeReadiness(projectId, issue.id);
    }
  }

  // =========================================================================
  // 4. Triage Report
  // =========================================================================

  /**
   * Generate a project-level triage report analyzing all backlog/todo issues.
   * Provides: recommended order, merge suggestions, missing info, risk flags.
   */
  async generateTriageReport(orgId: string, projectId: string, userId: string): Promise<TriageReport> {
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project?.business_scope_id) {
      throw AppError.validation('No business scope configured for this project.');
    }

    const backlogIssues = await prisma.project_issues.findMany({
      where: { project_id: projectId, status: { in: ['backlog', 'todo'] } },
      include: { relations_as_source: true },
      orderBy: { sort_order: 'asc' },
    });

    if (backlogIssues.length === 0) {
      throw AppError.validation('No backlog or todo issues to triage.');
    }

    // Historical reference: recently completed issues
    const doneIssues = await prisma.project_issues.findMany({
      where: { project_id: projectId, status: 'done' },
      select: { title: true, estimated_effort: true, created_at: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 10,
    });

    const sessionId = await projectService.ensureWorkspaceSession(orgId, projectId, userId);

    const prompt = `You are conducting a sprint planning triage for this project.
Analyze all pending tasks and provide actionable recommendations.

## Pending Tasks (Backlog + Todo)
${backlogIssues.map(i => {
  const conflicts = i.relations_as_source.filter(r => r.relation_type === 'conflicts_with' && r.status === 'pending');
  const deps = i.relations_as_source.filter(r => r.relation_type === 'depends_on' && r.status !== 'dismissed');
  return `**#${i.issue_number}: ${i.title}** [${i.status}] Priority: ${i.priority} Effort: ${i.estimated_effort || 'unknown'} Readiness: ${i.readiness_score ?? 'N/A'}
${(i.description || 'No description').substring(0, 200)}
${conflicts.length ? `⚠️ ${conflicts.length} unresolved conflict(s)` : ''}
${deps.length ? `🔗 ${deps.length} dependency(ies)` : ''}`;
}).join('\n\n')}

## Recently Completed (for velocity reference)
${doneIssues.length > 0
  ? doneIssues.map(i => `- ${i.title} (effort: ${i.estimated_effort || 'unknown'})`).join('\n')
  : '(no completed issues yet)'}

## Required Output (JSON only, no markdown fences)
{
  "recommended_order": [
    { "issue_number": 1, "reason": "why this should be done in this order" }
  ],
  "merge_suggestions": [
    { "issue_numbers": [1, 2], "reason": "why these should be merged", "suggested_title": "merged title" }
  ],
  "missing_info": [
    { "issue_number": 1, "what_is_missing": "description of what info is needed" }
  ],
  "risk_flags": [
    { "issue_number": 1, "risk": "description of the risk" }
  ],
  "sprint_estimate": "how many of these tasks could reasonably be completed in one sprint",
  "summary": "2-3 sentence executive summary of the backlog health"
}

Rules:
- recommended_order should include ALL pending issues, sorted by suggested execution priority.
- merge_suggestions: only if two issues genuinely overlap. Don't force merges.
- missing_info: flag issues that lack enough detail for a developer to start.
- risk_flags: technical risks, scope creep, unclear requirements, etc.
- Be practical and specific. Avoid generic advice.`;

    const { chatService } = await import('./chat.service.js');
    const result = await chatService.processMessage({
      sessionId,
      businessScopeId: project.business_scope_id,
      message: prompt,
      organizationId: orgId,
      userId,
      systemPromptOverride: 'You are a senior technical project manager conducting sprint planning. Provide structured JSON analysis only.',
    });

    const report = this.parseJsonResponse(result.text) as TriageReport | null;
    if (!report) {
      throw AppError.internal('Failed to parse triage report from AI response.');
    }

    // Persist the report
    await prisma.project_triage_reports.create({
      data: {
        project_id: projectId,
        organization_id: orgId,
        report_content: report as unknown as Prisma.InputJsonValue,
        issue_count: backlogIssues.length,
        conflict_count: report.risk_flags?.length ?? 0,
        suggestion_count: (report.merge_suggestions?.length ?? 0) + (report.missing_info?.length ?? 0),
      },
    });

    return report;
  }

  // =========================================================================
  // 5. Relation Management
  // =========================================================================

  /**
   * Human reviews an AI-discovered relation: confirm or dismiss.
   */
  async reviewRelation(orgId: string, projectId: string, relationId: string, userId: string, action: 'confirmed' | 'dismissed'): Promise<void> {
    const relation = await prisma.project_issue_relations.findFirst({
      where: { id: relationId, project_id: projectId },
    });
    if (!relation) throw AppError.notFound('Relation not found');

    // Verify project belongs to org
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Relation not found');

    await prisma.project_issue_relations.update({
      where: { id: relationId },
      data: { status: action, reviewed_by: userId },
    });

    // Recompute readiness for the source issue
    await this.computeReadiness(projectId, relation.source_issue_id);
  }

  /**
   * Get all relations for an issue (both as source and target).
   */
  async getIssueRelations(orgId: string, projectId: string, issueId: string) {
    // Verify project belongs to org
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Project not found');

    return prisma.project_issue_relations.findMany({
      where: {
        project_id: projectId,
        OR: [{ source_issue_id: issueId }, { target_issue_id: issueId }],
      },
      include: {
        source_issue: { select: { id: true, issue_number: true, title: true, status: true } },
        target_issue: { select: { id: true, issue_number: true, title: true, status: true } },
      },
      orderBy: { confidence: 'desc' },
    });
  }

  /**
   * Get all relations for a project (for board-level display).
   */
  async getProjectRelations(orgId: string, projectId: string) {
    // Verify project belongs to org
    const project = await prisma.projects.findFirst({ where: { id: projectId, organization_id: orgId } });
    if (!project) throw AppError.notFound('Project not found');

    return prisma.project_issue_relations.findMany({
      where: { project_id: projectId, status: { not: 'dismissed' } },
      include: {
        source_issue: { select: { id: true, issue_number: true, title: true, status: true } },
        target_issue: { select: { id: true, issue_number: true, title: true, status: true } },
      },
      orderBy: { confidence: 'desc' },
    });
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private parseJsonResponse(text: string): Record<string, unknown> | null {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch { /* continue */ }

    // Try extracting from markdown code block
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match && match[1]) {
      try { return JSON.parse(match[1]); } catch { /* continue */ }
    }

    // Try finding first { to last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.substring(start, end + 1)); } catch { /* continue */ }
    }

    console.warn('[Governance] Failed to parse AI JSON response:', text.substring(0, 200));
    return null;
  }
}

// Singleton export
export const governanceService = new ProjectGovernanceService();
