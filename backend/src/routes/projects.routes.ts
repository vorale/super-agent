/**
 * Project Management Routes
 * CRUD for projects, issues, members, and comments.
 */

import { FastifyInstance } from 'fastify';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { projectService } from '../services/project.service.js';
import { governanceService } from '../services/project-governance.service.js';

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {

  // ==========================================================================
  // Projects
  // ==========================================================================

  fastify.post<{ Body: { name: string; description?: string; repo_url?: string; default_branch?: string; business_scope_id?: string } }>(
    '/',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const project = await projectService.createProject(request.user!.orgId, request.user!.id, request.body);
      return reply.status(201).send(project);
    }
  );

  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const projects = await projectService.listProjects(request.user!.orgId, request.user!.id);
    return reply.send({ data: projects });
  });

  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const project = await projectService.getProject(request.user!.orgId, request.params.id, request.user!.id);
    return reply.send(project);
  });

  fastify.put<{ Params: { id: string }; Body: { name?: string; description?: string; repo_url?: string; business_scope_id?: string; agent_id?: string } }>(
    '/:id',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      const project = await projectService.updateProject(request.user!.orgId, request.params.id, request.user!.id, request.body);
      return reply.send(project);
    }
  );

  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: [authenticate, requireModifyAccess] }, async (request, reply) => {
    await projectService.deleteProject(request.user!.orgId, request.params.id, request.user!.id);
    return reply.status(204).send();
  });

  // ==========================================================================
  // Members
  // ==========================================================================

  fastify.get<{ Params: { id: string } }>('/:id/members', { preHandler: [authenticate] }, async (request, reply) => {
    const members = await projectService.getMembers(request.user!.orgId, request.params.id, request.user!.id);
    return reply.send({ data: members });
  });

  fastify.post<{ Params: { id: string }; Body: { user_id: string; role?: string } }>(
    '/:id/members',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      await projectService.addMember(request.user!.orgId, request.params.id, request.body.user_id, request.body.role);
      return reply.status(201).send({ ok: true });
    }
  );

  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      await projectService.removeMember(request.user!.orgId, request.params.id, request.user!.id, request.params.userId);
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // Issues
  // ==========================================================================

  fastify.post<{ Params: { id: string }; Body: { title: string; description?: string; status?: string; priority?: string; labels?: string[]; assignee_user_id?: string; assignee_agent_id?: string; parent_issue_id?: string; estimated_effort?: string } }>(
    '/:id/issues',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const issue = await projectService.createIssue(request.user!.orgId, request.params.id, request.user!.id, request.body);
      return reply.status(201).send(issue);
    }
  );

  fastify.get<{ Params: { id: string }; Querystring: { status?: string; priority?: string } }>(
    '/:id/issues',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const issues = await projectService.listIssues(request.user!.orgId, request.params.id, request.user!.id, request.query);
      return reply.send({ data: issues });
    }
  );

  fastify.get<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const issue = await projectService.getIssue(request.user!.orgId, request.params.id, request.params.issueId);
      return reply.send(issue);
    }
  );

  fastify.put<{ Params: { id: string; issueId: string }; Body: Record<string, unknown> }>(
    '/:id/issues/:issueId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const issue = await projectService.updateIssue(request.user!.orgId, request.params.id, request.params.issueId, request.body);
      return reply.send(issue);
    }
  );

  fastify.patch<{ Params: { id: string; issueId: string }; Body: { status: string } }>(
    '/:id/issues/:issueId/status',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const issue = await projectService.changeIssueStatus(request.user!.orgId, request.params.id, request.params.issueId, request.body.status);
      return reply.send(issue);
    }
  );

  fastify.patch<{ Params: { id: string; issueId: string }; Body: { sort_order: number; status?: string } }>(
    '/:id/issues/:issueId/reorder',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const issue = await projectService.reorderIssue(
        request.user!.orgId, request.params.id, request.params.issueId,
        Number(request.body.sort_order), request.body.status,
      );
      return reply.send(issue);
    }
  );

  fastify.delete<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      await projectService.deleteIssue(request.user!.orgId, request.params.id, request.params.issueId);
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // Comments
  // ==========================================================================

  fastify.post<{ Params: { id: string; issueId: string }; Body: { content: string; comment_type?: string; metadata?: Record<string, unknown> } }>(
    '/:id/issues/:issueId/comments',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const comment = await projectService.addComment(request.user!.orgId, request.params.issueId, request.user!.id, request.body);
      return reply.status(201).send(comment);
    }
  );

  fastify.get<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/comments',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const comments = await projectService.listComments(request.user!.orgId, request.params.id, request.params.issueId);
      return reply.send({ data: comments });
    }
  );

  // ==========================================================================
  // Agent Execution
  // ==========================================================================

  /**
   * POST /:id/issues/:issueId/execute — Start agent execution on an issue
   */
  fastify.post<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/execute',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const result = await projectService.executeIssue(
        request.user!.orgId, request.params.id, request.params.issueId,
        request.user!.id,
      );
      return reply.status(200).send(result);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/auto-process',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const result = await projectService.autoProcessNext(
        request.user!.orgId, request.params.id, request.user!.id,
      );
      if (!result) return reply.send({ status: 'idle', message: 'No todo issues or one already in progress' });
      return reply.send({ status: 'started', ...result });
    }
  );

  /**
   * POST /:id/issues/:issueId/beautify — AI-improve the issue description
   */
  fastify.post<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/beautify',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const improved = await projectService.beautifyDescription(
        request.user!.orgId, request.params.id, request.params.issueId, request.user!.id,
      );
      return reply.send({ description: improved });
    }
  );

  // ==========================================================================
  // Project Settings
  // ==========================================================================

  /**
   * POST /:id/ensure-workspace — Ensure project workspace session exists
   */
  fastify.post<{ Params: { id: string } }>(
    '/:id/ensure-workspace',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const sessionId = await projectService.ensureWorkspaceSession(
        request.user!.orgId, request.params.id, request.user!.id,
      );
      return reply.send({ session_id: sessionId });
    }
  );

  // ==========================================================================
  // Project Settings
  // ==========================================================================

  fastify.get<{ Params: { id: string } }>('/:id/settings', { preHandler: [authenticate] }, async (request, reply) => {
    const settings = await projectService.getSettings(request.user!.orgId, request.params.id, request.user!.id);
    return reply.send(settings);
  });

  fastify.put<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/:id/settings',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      const project = await projectService.updateSettings(request.user!.orgId, request.params.id, request.user!.id, request.body);
      return reply.send(project);
    }
  );

  /**
   * POST /:id/sync-workspace — Sync workspace files from S3 back to local
   */
  fastify.post<{ Params: { id: string } }>(
    '/:id/sync-workspace',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const result = await projectService.syncWorkspaceFromS3(
          request.user!.orgId, request.params.id, request.user!.id,
        );
        return reply.send(result);
      } catch (err) {
        request.log.error({ err }, 'Workspace sync failed');
        return reply.status(500).send({
          error: err instanceof Error ? err.message : 'Sync failed',
          code: 'SYNC_FAILED',
        });
      }
    }
  );

  // ==========================================================================
  // AI Governance
  // ==========================================================================

  /**
   * POST /:id/issues/:issueId/enrich — Trigger AI enrichment for an issue
   */
  fastify.post<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/enrich',
    { preHandler: [authenticate] },
    async (request, reply) => {
      governanceService.enrichIssue(
        request.user!.orgId, request.params.id, request.params.issueId, request.user!.id,
      ).catch(err => request.log.error({ err }, 'Enrichment failed'));
      return reply.send({ status: 'started' });
    }
  );

  /**
   * GET /:id/issues/:issueId/relations — Get relations for an issue
   */
  fastify.get<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/relations',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const relations = await governanceService.getIssueRelations(request.user!.orgId, request.params.id, request.params.issueId);
      return reply.send({ data: relations });
    }
  );

  /**
   * GET /:id/relations — Get all relations for a project
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/relations',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const relations = await governanceService.getProjectRelations(request.user!.orgId, request.params.id);
      return reply.send({ data: relations });
    }
  );

  /**
   * PATCH /:id/relations/:relationId/review — Confirm or dismiss a relation
   */
  fastify.patch<{ Params: { id: string; relationId: string }; Body: { action: 'confirmed' | 'dismissed' } }>(
    '/:id/relations/:relationId/review',
    { preHandler: [authenticate] },
    async (request, reply) => {
      await governanceService.reviewRelation(request.user!.orgId, request.params.id, request.params.relationId, request.user!.id, request.body.action);
      return reply.send({ ok: true });
    }
  );

  /**
   * POST /:id/triage — Generate AI triage report
   */
  fastify.post<{ Params: { id: string } }>(
    '/:id/triage',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const report = await governanceService.generateTriageReport(
        request.user!.orgId, request.params.id, request.user!.id,
      );
      return reply.send(report);
    }
  );

  /**
   * POST /:id/issues/:issueId/reanalyze — Re-trigger enrichment for a stale issue
   */
  fastify.post<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/reanalyze',
    { preHandler: [authenticate] },
    async (request, reply) => {
      governanceService.enrichIssue(
        request.user!.orgId, request.params.id, request.params.issueId, request.user!.id,
      ).catch(err => request.log.error({ err }, 'Re-analysis failed'));
      return reply.send({ status: 'started' });
    }
  );

  /**
   * GET /:id/issues/:issueId/diff — Get code diff for an issue
   */
  fastify.get<{ Params: { id: string; issueId: string } }>(
    '/:id/issues/:issueId/diff',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const diff = await projectService.getIssueDiff(request.user!.orgId, request.params.id, request.params.issueId);
      return reply.send(diff);
    }
  );
}
