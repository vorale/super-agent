/**
 * Skill Marketplace Routes
 * REST API endpoints for browsing and installing skills from skills.sh marketplace.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { skillMarketplaceService } from '../services/skill-marketplace.service.js';
import { chatService } from '../services/chat.service.js';
import { workspaceManager } from '../services/workspace-manager.js';
import { authenticate } from '../middleware/auth.js';

interface SearchQuery { Querystring: { q: string } }
interface DetailQuery { Querystring: { ref: string } }
interface InstallBody {
  Body: {
    installRef: string;
    displayName?: string;
    description?: string;
    tags?: string[];
    assignToAgentId?: string;
    sessionId?: string;
  };
}

interface ProbeGitHubBody {
  Body: { url: string };
}

interface ImportGitHubBody {
  Body: {
    url: string;
    skillName: string;
    installRef: string;
    displayName?: string;
    description?: string;
    sessionId?: string;
  };
}

export async function skillMarketplaceRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/skills/marketplace/featured — popular/featured skills (no query needed)
  fastify.get('/featured', { preHandler: [authenticate] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const results = await skillMarketplaceService.featured();
      return reply.status(200).send({ data: results });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to load featured skills', code: 'FEATURED_FAILED' });
    }
  });

  // GET /api/skills/marketplace/search?q=...
  fastify.get<SearchQuery>('/search', { preHandler: [authenticate] }, async (request: FastifyRequest<SearchQuery>, reply: FastifyReply) => {
    const query = request.query.q;
    if (!query || query.trim().length === 0) {
      return reply.status(400).send({ error: 'Query parameter "q" is required', code: 'MISSING_QUERY' });
    }
    const results = await skillMarketplaceService.search(query.trim());
    return reply.status(200).send({ data: results });
  });

  // GET /api/skills/marketplace/detail?ref=...
  fastify.get<DetailQuery>('/detail', { preHandler: [authenticate] }, async (request: FastifyRequest<DetailQuery>, reply: FastifyReply) => {
    const installRef = request.query.ref;
    if (!installRef || installRef.trim().length === 0) {
      return reply.status(400).send({ error: 'Query parameter "ref" is required', code: 'MISSING_REF' });
    }
    const detail = await skillMarketplaceService.getDetail(installRef.trim());
    if (!detail) {
      return reply.status(404).send({ error: `Skill not found: ${installRef}`, code: 'SKILL_NOT_FOUND' });
    }
    return reply.status(200).send({ data: detail });
  });

  // POST /api/skills/marketplace/install
  fastify.post<InstallBody>('/install', { preHandler: [authenticate] }, async (request: FastifyRequest<InstallBody>, reply: FastifyReply) => {
    const { installRef, displayName, description, tags, assignToAgentId, sessionId } = request.body;
    if (!installRef || installRef.trim().length === 0) {
      return reply.status(400).send({ error: 'installRef is required', code: 'MISSING_INSTALL_REF' });
    }

    let result;
    try {
      result = await skillMarketplaceService.install({
        organizationId: request.user!.orgId,
        installRef: installRef.trim(),
        displayName,
        description,
        tags,
        assignToAgentId,
        userId: request.user!.id,
      });
    } catch (err) {
      request.log.error({ err, installRef }, 'Skill marketplace install failed');
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Failed to install skill',
        code: 'INSTALL_FAILED',
      });
    }

    // Copy skill into session workspace so it appears in the installed list
    if (sessionId) {
      try {
        const session = await chatService.getSessionById(sessionId, request.user!.orgId);
        if (session.business_scope_id) {
          await workspaceManager.installSkillToWorkspace(
            request.user!.orgId,
            session.business_scope_id,
            sessionId,
            result.name,
            result.localPath,
          );

          // In agentcore mode, also write skill files directly to the container
          const { config: appConfig } = await import('../config/index.js');
          if (appConfig.agentRuntime === 'agentcore') {
            try {
              const { agentCoreCommandService } = await import('../services/agentcore-command.service.js');
              const { readdir, readFile, stat } = await import('fs/promises');
              const { join } = await import('path');

              // Recursively write all skill files to the container
              const writeSkillFiles = async (srcDir: string, destPrefix: string): Promise<void> => {
                const entries = await readdir(srcDir, { withFileTypes: true });
                for (const entry of entries) {
                  const srcPath = join(srcDir, entry.name);
                  const destPath = `${destPrefix}/${entry.name}`;
                  if (entry.isDirectory()) {
                    await writeSkillFiles(srcPath, destPath);
                  } else {
                    const content = await readFile(srcPath, 'utf-8');
                    await agentCoreCommandService.writeFile(sessionId, destPath, content);
                  }
                }
              };

              await agentCoreCommandService.runCommand(sessionId,
                `mkdir -p /workspace/.claude/skills/${result.name}`
              );
              await writeSkillFiles(result.localPath, `.claude/skills/${result.name}`);
              request.log.info({ skillName: result.name, sessionId }, 'Skill synced to AgentCore container');
            } catch (cmdErr) {
              request.log.warn({ err: cmdErr, skillName: result.name }, 'Failed to sync skill to container (will sync on next invoke)');
            }

            // Also upload skill files to S3 so the workspace file tree (which
            // falls back to S3 when the container is unreachable) can see them.
            try {
              const { readdir, readFile, stat } = await import('fs/promises');
              const { join } = await import('path');
              const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
              const s3 = new S3Client({ region: appConfig.aws.region });
              const s3Bucket = appConfig.agentcore.workspaceS3Bucket;
              const s3Prefix = `${request.user!.orgId}/${session.business_scope_id}/${sessionId}/`;

              const uploadSkillFiles = async (srcDir: string, destPrefix: string): Promise<void> => {
                const entries = await readdir(srcDir, { withFileTypes: true });
                for (const entry of entries) {
                  const srcPath = join(srcDir, entry.name);
                  const destKey = `${destPrefix}/${entry.name}`;
                  if (entry.isDirectory()) {
                    await uploadSkillFiles(srcPath, destKey);
                  } else {
                    const content = await readFile(srcPath);
                    await s3.send(new PutObjectCommand({
                      Bucket: s3Bucket,
                      Key: destKey,
                      Body: content,
                      ContentLength: content.length,
                    }));
                  }
                }
              };

              await uploadSkillFiles(
                result.localPath,
                `${s3Prefix}.claude/skills/${result.name}`,
              );
              request.log.info({ skillName: result.name, sessionId }, 'Skill synced to S3');
            } catch (s3Err) {
              request.log.warn({ err: s3Err, skillName: result.name }, 'Failed to sync skill to S3');
            }
          }
        }
      } catch (err) {
        request.log.error({ err, sessionId, skillName: result.name }, 'Failed to copy skill to session workspace');
      }
    }

    return reply.status(201).send({ data: result });
  });

  // POST /api/skills/marketplace/probe-github — check a GitHub URL for SKILL.md files
  fastify.post<ProbeGitHubBody>('/probe-github', { preHandler: [authenticate] }, async (request: FastifyRequest<ProbeGitHubBody>, reply: FastifyReply) => {
    const { url } = request.body;
    if (!url || !url.trim()) {
      return reply.status(400).send({ error: 'url is required', code: 'MISSING_URL' });
    }

    try {
      const result = await skillMarketplaceService.probeGitHubUrl(url.trim());
      return reply.status(200).send({ data: result });
    } catch (err) {
      request.log.error({ err, url }, 'GitHub probe failed');
      return reply.status(500).send({ error: 'Failed to probe GitHub URL', code: 'PROBE_FAILED' });
    }
  });

  // POST /api/skills/marketplace/import-github — install a skill discovered via probe
  fastify.post<ImportGitHubBody>('/import-github', { preHandler: [authenticate] }, async (request: FastifyRequest<ImportGitHubBody>, reply: FastifyReply) => {
    const { url, skillName, installRef, displayName, description, sessionId } = request.body;
    if (!installRef || !installRef.trim()) {
      return reply.status(400).send({ error: 'installRef is required', code: 'MISSING_INSTALL_REF' });
    }

    let result;
    try {
      result = await skillMarketplaceService.install({
        organizationId: request.user!.orgId,
        installRef: installRef.trim(),
        displayName: displayName || skillName,
        description,
        tags: ['github-import'],
        userId: request.user!.id,
      });
    } catch (err) {
      request.log.error({ err, installRef, url }, 'GitHub skill import failed');
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Failed to import skill from GitHub',
        code: 'IMPORT_FAILED',
      });
    }

    return reply.status(201).send({ data: result });
  });

  // POST /api/skills/marketplace/upload-zip — upload a zip containing SKILL.md files
  fastify.post('/upload-zip', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded', code: 'MISSING_FILE' });
    }

    const fileName = file.filename || 'upload.zip';
    const ext = fileName.toLowerCase();
    if (!ext.endsWith('.zip') && !ext.endsWith('.tar.gz') && !ext.endsWith('.tgz')) {
      return reply.status(400).send({ error: 'Only .zip, .tar.gz, and .tgz files are supported', code: 'INVALID_FILE_TYPE' });
    }

    try {
      // Consume the file stream into a buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer);
      }
      const zipBuffer = Buffer.concat(chunks);

      const result = await skillMarketplaceService.installFromZip({
        organizationId: request.user!.orgId,
        zipBuffer,
        fileName,
        userId: request.user!.id,
      });

      return reply.status(201).send({ data: result });
    } catch (err) {
      request.log.error({ err, fileName }, 'Zip skill upload failed');
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Failed to process uploaded archive',
        code: 'UPLOAD_FAILED',
      });
    }
  });
}
