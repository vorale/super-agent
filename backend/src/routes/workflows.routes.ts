/**
 * Workflow Routes
 * REST API endpoints for Workflow management.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { workflowService, type GeneratedWorkflowPlan, type WorkflowPatch } from '../services/workflow.service.js';
import { workflowGeneratorService } from '../services/workflow-generator.service.js';
import { workflowExecutorV2, type WorkflowV2Plan, type WorkflowProgressEvent } from '../services/workflow-executor-v2.js';
import { agentService } from '../services/agent.service.js';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import type { ConversationEvent } from '../services/claude-agent.service.js';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  importWorkflowSchema,
  workflowFilterSchema,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
  type ImportWorkflowInput,
  type WorkflowFilter,
} from '../schemas/workflow.schema.js';
import { paginationSchema, idParamSchema } from '../schemas/common.schema.js';
import { ZodError } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

function formatSSEEvent(payload: { event?: string; data: string }): string {
  let result = '';
  if (payload.event) result += `event: ${payload.event}\n`;
  result += `data: ${payload.data}\n\n`;
  return result;
}

/**
 * Request types for route handlers
 */
interface GetWorkflowsRequest {
  Querystring: WorkflowFilter & { page?: number; limit?: number };
}

interface GetWorkflowByIdRequest {
  Params: { id: string };
}

interface CreateWorkflowRequest {
  Body: CreateWorkflowInput;
}

interface UpdateWorkflowRequest {
  Params: { id: string };
  Body: UpdateWorkflowInput;
}

interface DeleteWorkflowRequest {
  Params: { id: string };
}

interface ImportWorkflowRequest {
  Body: ImportWorkflowInput;
}

/**
 * Parse and validate Zod schema, throwing AppError on failure
 */
function validateSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw AppError.validation('Validation failed', error.issues);
    }
    throw error;
  }
}

/**
 * Register workflow routes on the Fastify instance.
 * All routes require authentication and filter by organization_id.
 */
export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/workflows
   * Get all workflows for the authenticated user's organization.
   * Supports filtering by business_scope_id and is_official.
   * Requirements: 6.1
   */
  fastify.get<GetWorkflowsRequest>(
    '/',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all workflows for the organization',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            business_scope_id: { type: 'string', format: 'uuid' },
            is_official: { type: 'boolean' },
            name: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetWorkflowsRequest>, reply: FastifyReply) => {
      const { page, limit, ...filterParams } = request.query;

      // Validate filters
      const filters = validateSchema(workflowFilterSchema, filterParams);
      const pagination = validateSchema(paginationSchema, { page, limit });

      const result = await workflowService.getWorkflows(request.user!.orgId, filters, pagination);

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/workflows/:id
   * Get a single workflow by ID including steps.
   * Requirements: 6.2
   */
  fastify.get<GetWorkflowByIdRequest>(
    '/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get a workflow by ID',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              business_scope_id: { type: 'string', nullable: true },
              name: { type: 'string' },
              version: { type: 'string' },
              is_official: { type: 'boolean' },
              parent_version: { type: 'string', nullable: true },
              nodes: { type: 'array' },
              connections: { type: 'array' },
              created_by: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetWorkflowByIdRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      const workflow = await workflowService.getWorkflowById(id, request.user!.orgId);

      return reply.status(200).send(workflow);
    }
  );

  /**
   * POST /api/workflows
   * Create a new workflow.
   * Requirements: 6.3
   */
  fastify.post<CreateWorkflowRequest>(
    '/',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Create a new workflow',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            version: { type: 'string', minLength: 1, maxLength: 50 },
            business_scope_id: { type: 'string', format: 'uuid', nullable: true },
            is_official: { type: 'boolean', default: false },
            parent_version: { type: 'string', maxLength: 50, nullable: true },
            nodes: { type: 'array', default: [] },
            connections: { type: 'array', default: [] },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              business_scope_id: { type: 'string', nullable: true },
              name: { type: 'string' },
              version: { type: 'string' },
              is_official: { type: 'boolean' },
              parent_version: { type: 'string', nullable: true },
              nodes: { type: 'array' },
              connections: { type: 'array' },
              created_by: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              details: { type: 'array' },
              requestId: { type: 'string' },
            },
          },
          409: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<CreateWorkflowRequest>, reply: FastifyReply) => {
      const data = validateSchema(createWorkflowSchema, request.body);

      const workflow = await workflowService.createWorkflow(
        data,
        request.user!.orgId,
        request.user!.id
      );

      return reply.status(201).send(workflow);
    }
  );

  /**
   * PUT /api/workflows/:id
   * Update an existing workflow.
   * Requirements: 6.4
   */
  fastify.put<UpdateWorkflowRequest>(
    '/:id',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Update a workflow',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            version: { type: 'string', minLength: 1, maxLength: 50 },
            business_scope_id: { type: 'string', format: 'uuid', nullable: true },
            is_official: { type: 'boolean' },
            parent_version: { type: 'string', maxLength: 50, nullable: true },
            nodes: { type: 'array' },
            connections: { type: 'array' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              business_scope_id: { type: 'string', nullable: true },
              name: { type: 'string' },
              version: { type: 'string' },
              is_official: { type: 'boolean' },
              parent_version: { type: 'string', nullable: true },
              nodes: { type: 'array' },
              connections: { type: 'array' },
              created_by: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<UpdateWorkflowRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const data = validateSchema(updateWorkflowSchema, request.body);

      const workflow = await workflowService.updateWorkflow(id, data, request.user!.orgId);

      return reply.status(200).send(workflow);
    }
  );

  /**
   * DELETE /api/workflows/:id
   * Delete a workflow (soft-delete).
   * Requirements: 6.5
   */
  fastify.delete<DeleteWorkflowRequest>(
    '/:id',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Delete a workflow',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'Workflow deleted successfully',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<DeleteWorkflowRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      await workflowService.deleteWorkflow(id, request.user!.orgId);

      return reply.status(204).send();
    }
  );

  /**
   * POST /api/workflows/import
   * Import a workflow from JSON/YAML.
   * Requirements: 6.6
   */
  fastify.post<ImportWorkflowRequest>(
    '/import',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Import a workflow from JSON/YAML',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'version', 'nodes', 'connections'],
          properties: {
            name: { type: 'string', minLength: 1 },
            version: { type: 'string', minLength: 1 },
            nodes: { type: 'array' },
            connections: { type: 'array' },
            business_scope_id: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              name: { type: 'string' },
              version: { type: 'string' },
              is_official: { type: 'boolean' },
              nodes: { type: 'array' },
              connections: { type: 'array' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              details: { type: 'array' },
              requestId: { type: 'string' },
            },
          },
          409: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<ImportWorkflowRequest>, reply: FastifyReply) => {
      const data = validateSchema(importWorkflowSchema, request.body);

      const workflow = await workflowService.importWorkflow(
        data,
        request.user!.orgId,
        request.user!.id
      );

      return reply.status(201).send(workflow);
    }
  );

  /**
   * POST /api/workflows/generate
   * Stream AI-generated workflow plan via SSE using Claude Agent SDK.
   */
  fastify.post<{
    Body: {
      description: string;
      businessScopeId?: string;
      availableAgents?: Array<{ id: string; name: string; role: string }>;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
  }>(
    '/generate',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Generate a workflow plan from natural language (SSE stream)',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['description'],
          properties: {
            description: { type: 'string', minLength: 1 },
            businessScopeId: { type: 'string', format: 'uuid' },
            availableAgents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  role: { type: 'string' },
                },
              },
            },
            history: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { description, businessScopeId, availableAgents, history } = request.body;

      if (!description || description.trim() === '') {
        return reply.status(400).send({ error: 'Description is required', code: 'MISSING_DESCRIPTION' });
      }

      // Load agents from business scope if provided, otherwise use the ones from the request
      let scopeAgents: Array<{ id: string; name: string; role: string; skills?: string[] }> = (availableAgents || []).map(a => ({ ...a, skills: undefined }));
      if (businessScopeId) {
        try {
          const { skillService } = await import('../services/skill.service.js');
          const agents = await agentService.getAgentsByBusinessScope(request.user!.orgId, businessScopeId);
          scopeAgents = await Promise.all(agents.map(async (a) => {
            // Load skill names for each agent
            let skillNames: string[] = [];
            try {
              const skills = await skillService.getAgentSkills(request.user!.orgId, a.id);
              skillNames = skills.map(s => s.name);
            } catch { /* non-critical */ }
            return {
              id: a.id,
              name: a.display_name || a.name,
              role: a.role || '',
              skills: skillNames.length > 0 ? skillNames : undefined,
            };
          }));
        } catch (err) {
          console.warn(`Failed to load agents for scope ${businessScopeId}:`, err);
          // Fall back to provided agents
        }
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });

      let clientDisconnected = false;
      reply.raw.on('close', () => { clientDisconnected = true; });

      const heartbeat = setInterval(() => {
        if (!clientDisconnected) {
          try { reply.raw.write(formatSSEEvent({ data: JSON.stringify({ type: 'heartbeat' }) })); }
          catch { /* disconnected */ }
        }
      }, 15_000);

      try {
        const generator = workflowGeneratorService.generate(
          description.trim(),
          scopeAgents,
          history,
        );

        // Collect assistant text blocks to validate JSON at the end
        const assistantTextBlocks: string[] = [];

        for await (const event of generator) {
          if (clientDisconnected) break;

          const sseData: Record<string, unknown> = { type: event.type };

          if (event.type === 'session_start') {
            sseData.sessionId = event.sessionId;
          } else if (event.type === 'assistant' || event.type === 'result') {
            sseData.content = (event as ConversationEvent & { content?: unknown }).content;
            // Collect text from assistant events for post-stream validation
            if (event.type === 'assistant') {
              const content = (event as ConversationEvent & { content?: Array<{ type: string; text?: string }> }).content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && block.text) {
                    assistantTextBlocks.push(block.text);
                  }
                }
              }
            }
          } else if (event.type === 'error') {
            sseData.code = (event as ConversationEvent & { code?: string }).code;
            sseData.message = (event as ConversationEvent & { message?: string }).message;
          }

          reply.raw.write(formatSSEEvent({ data: JSON.stringify(sseData) }));
        }

        // Post-stream validation: try to parse the accumulated text as a workflow plan.
        // If successful, send a validated_plan event with clean, parseable JSON.
        if (assistantTextBlocks.length > 0 && !clientDisconnected) {
          try {
            const plan = workflowGeneratorService.parseGeneratedPlan(
              assistantTextBlocks.map(t => ({ type: 'text', text: t }))
            );
            reply.raw.write(formatSSEEvent({
              data: JSON.stringify({ type: 'validated_plan', plan }),
            }));
          } catch {
            // Not a valid plan (could be a conversational reply) — skip
          }
        }
      } catch (error) {
        if (!clientDisconnected) {
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({
              type: 'error',
              code: 'GENERATION_ERROR',
              message: error instanceof Error ? error.message : 'Workflow generation failed',
            }),
          }));
        }
      } finally {
        clearInterval(heartbeat);
        if (!clientDisconnected) {
          try {
            reply.raw.write(formatSSEEvent({ data: '[DONE]' }));
            reply.raw.end();
          } catch { /* disconnected */ }
        }
      }
    }
  );

  /**
   * POST /api/workflows/:id/patch
   * Stream patch operations for a workflow modification via SSE using Claude Agent SDK.
   */
  fastify.post<{
    Params: { id: string };
    Body: { instruction: string };
  }>(
    '/:id/patch',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Generate patch operations for workflow modification (SSE stream)',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['instruction'],
          properties: {
            instruction: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { instruction } = request.body;

      if (!instruction || instruction.trim() === '') {
        return reply.status(400).send({ error: 'Instruction is required', code: 'MISSING_INSTRUCTION' });
      }

      // Get the current workflow to build the plan
      const workflow = await workflowService.getWorkflowById(id, request.user!.orgId);
      const currentPlan = {
        title: workflow.name,
        tasks: workflow.nodes,
        variables: [],
      };

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });

      let clientDisconnected = false;
      reply.raw.on('close', () => { clientDisconnected = true; });

      const heartbeat = setInterval(() => {
        if (!clientDisconnected) {
          try { reply.raw.write(formatSSEEvent({ data: JSON.stringify({ type: 'heartbeat' }) })); }
          catch { /* disconnected */ }
        }
      }, 15_000);

      try {
        const generator = workflowGeneratorService.generatePatches(
          currentPlan,
          instruction.trim(),
        );

        for await (const event of generator) {
          if (clientDisconnected) break;

          const sseData: Record<string, unknown> = { type: event.type };

          if (event.type === 'session_start') {
            sseData.sessionId = event.sessionId;
          } else if (event.type === 'assistant' || event.type === 'result') {
            sseData.content = (event as ConversationEvent & { content?: unknown }).content;
          } else if (event.type === 'error') {
            sseData.code = (event as ConversationEvent & { code?: string }).code;
            sseData.message = (event as ConversationEvent & { message?: string }).message;
          }

          reply.raw.write(formatSSEEvent({ data: JSON.stringify(sseData) }));
        }
      } catch (error) {
        if (!clientDisconnected) {
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({
              type: 'error',
              code: 'PATCH_GENERATION_ERROR',
              message: error instanceof Error ? error.message : 'Patch generation failed',
            }),
          }));
        }
      } finally {
        clearInterval(heartbeat);
        if (!clientDisconnected) {
          try {
            reply.raw.write(formatSSEEvent({ data: '[DONE]' }));
            reply.raw.end();
          } catch { /* disconnected */ }
        }
      }
    }
  );

  /**
   * POST /api/workflows/modify
   * Stream patch operations from a workflow plan and modification request via SSE.
   */
  fastify.post<{
    Body: {
      currentPlan: {
        title: string;
        description?: string;
        tasks: Array<{
          id: string;
          title: string;
          type: string;
          prompt?: string;
          dependentTasks?: string[];
          agentId?: string;
        }>;
        variables: Array<{
          variableId: string;
          variableType: string;
          name: string;
          description?: string;
          required?: boolean;
          value?: unknown[];
        }>;
      };
      modificationRequest: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
  }>(
    '/modify',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Generate patch operations from a workflow plan and modification request (SSE stream)',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['currentPlan', 'modificationRequest'],
          properties: {
            currentPlan: {
              type: 'object',
              required: ['title', 'tasks', 'variables'],
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                tasks: { type: 'array' },
                variables: { type: 'array' },
              },
            },
            modificationRequest: { type: 'string', minLength: 1 },
            history: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { currentPlan, modificationRequest, history } = request.body;

      if (!modificationRequest || modificationRequest.trim() === '') {
        return reply.status(400).send({ error: 'Modification request is required', code: 'MISSING_MODIFICATION' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });

      let clientDisconnected = false;
      reply.raw.on('close', () => { clientDisconnected = true; });

      const heartbeat = setInterval(() => {
        if (!clientDisconnected) {
          try { reply.raw.write(formatSSEEvent({ data: JSON.stringify({ type: 'heartbeat' }) })); }
          catch { /* disconnected */ }
        }
      }, 15_000);

      try {
        const generator = workflowGeneratorService.generatePatches(
          currentPlan,
          modificationRequest.trim(),
          history,
        );

        for await (const event of generator) {
          if (clientDisconnected) break;

          const sseData: Record<string, unknown> = { type: event.type };

          if (event.type === 'session_start') {
            sseData.sessionId = event.sessionId;
          } else if (event.type === 'assistant' || event.type === 'result') {
            sseData.content = (event as ConversationEvent & { content?: unknown }).content;
          } else if (event.type === 'error') {
            sseData.code = (event as ConversationEvent & { code?: string }).code;
            sseData.message = (event as ConversationEvent & { message?: string }).message;
          }

          reply.raw.write(formatSSEEvent({ data: JSON.stringify(sseData) }));
        }
      } catch (error) {
        if (!clientDisconnected) {
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({
              type: 'error',
              code: 'PATCH_GENERATION_ERROR',
              message: error instanceof Error ? error.message : 'Patch generation failed',
            }),
          }));
        }
      } finally {
        clearInterval(heartbeat);
        if (!clientDisconnected) {
          try {
            reply.raw.write(formatSSEEvent({ data: '[DONE]' }));
            reply.raw.end();
          } catch { /* disconnected */ }
        }
      }
    }
  );

  /**
   * POST /api/workflows/:id/execute-v2
   * Execute a workflow using the V2 unified agent execution model.
   * Streams progress events via SSE.
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      businessScopeId: string;
      variables?: Array<{ variableId: string; name: string; value: string; description?: string }>;
    };
  }>(
    '/:id/execute-v2',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Execute workflow via unified agent execution (SSE stream)',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['businessScopeId'],
          properties: {
            businessScopeId: { type: 'string', format: 'uuid' },
            variables: { type: 'array' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { businessScopeId, variables } = request.body;

      // Load workflow
      const workflow = await workflowService.getWorkflowById(id, request.user!.orgId);
      const nodes = workflow.nodes as Array<{
        id: string; title?: string; label?: string; type: string; prompt?: string;
        dependentTasks?: string[]; agentId?: string;
        metadata?: Record<string, unknown>;
      }>;

      // Build V2 plan from stored workflow data — filter out start/end/trigger nodes
      const PASSTHROUGH_TYPES = new Set(['trigger', 'start', 'end']);
      const plan: WorkflowV2Plan = {
        title: workflow.name,
        nodes: nodes
          .filter(n => !PASSTHROUGH_TYPES.has(n.type))
          .map(n => ({
            id: n.id,
            title: n.title || n.label || n.id,
            type: (n.type as WorkflowV2Plan['nodes'][0]['type']) || 'agent',
            prompt: n.prompt || (n.metadata?.prompt as string) || n.title || n.label || n.id,
            dependentTasks: n.dependentTasks || (n.metadata?.dependentTasks as string[]),
            agentId: n.agentId || (n.metadata?.agentId as string),
            checkpointConfig: n.metadata?.checkpointConfig as Record<string, unknown> | undefined,
          })),
        edges: ((workflow.connections || []) as Array<{ source?: string; target?: string; from?: string; to?: string }>).map(c => ({
          source: c.source || c.from || '',
          target: c.target || c.to || '',
        })),
        variables: variables || [],
      };

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });

      let clientDisconnected = false;
      reply.raw.on('close', () => { clientDisconnected = true; });

      const heartbeat = setInterval(() => {
        if (!clientDisconnected) {
          try { reply.raw.write(formatSSEEvent({ data: JSON.stringify({ type: 'heartbeat' }) })); }
          catch { /* disconnected */ }
        }
      }, 15_000);

      try {
        const generator = workflowExecutorV2.execute(
          plan,
          request.user!.orgId,
          businessScopeId,
          request.user!.id,
          { workflowId: id },
        );

        for await (const event of generator) {
          if (clientDisconnected) break;
          reply.raw.write(formatSSEEvent({ data: JSON.stringify(event) }));
        }

        // If client disconnected mid-execution, force-return the generator
        // to release resources (AgentCore session, workspace locks, etc.)
        if (clientDisconnected) {
          generator.return(undefined as any).catch(() => {});
        }
      } catch (error) {
        if (!clientDisconnected) {
          reply.raw.write(formatSSEEvent({
            data: JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : 'Workflow execution failed',
            }),
          }));
        }
      } finally {
        clearInterval(heartbeat);
        if (!clientDisconnected) {
          try {
            reply.raw.write(formatSSEEvent({ data: '[DONE]' }));
            reply.raw.end();
          } catch { /* disconnected */ }
        }
      }
    }
  );

}
