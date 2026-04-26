/**
 * Execution Routes
 * REST API endpoints for Workflow Execution management.
 * 
 * Requirements:
 * - 1.1: Create execution session and return execution ID
 * - 7.1: Stop queuing new nodes for execution on abort
 * - 9.2: Return paginated list of past execution sessions
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { workflowExecutionService } from '../services/workflow-execution.service.js';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { ZodError } from 'zod';
import { workspaceManager } from '../services/workspace-manager.js';
import { config } from '../config/index.js';
import { prisma } from '../config/database.js';
import type {
  CanvasData,
  WorkflowVariableDefinition,
} from '../types/workflow-execution.js';

// ============================================================================
// Request/Response Schemas
// ============================================================================

/**
 * Schema for execute workflow request body
 */
const executeWorkflowSchema = z.object({
  canvasData: z.object({
    nodes: z.array(z.object({
      id: z.string(),
      type: z.string(),
      position: z.object({
        x: z.number(),
        y: z.number(),
      }),
      data: z.object({
        title: z.string(),
        entityId: z.string(),
      }).passthrough(),
    }).passthrough()),
    edges: z.array(z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
    }).passthrough()),
  }),
  variables: z.array(z.object({
    variableId: z.string(),
    name: z.string(),
    value: z.array(z.object({
      type: z.enum(['text', 'resource']),
      text: z.string().optional(),
      resource: z.object({
        name: z.string(),
        fileType: z.enum(['document', 'image', 'video', 'audio']),
        fileId: z.string().optional(),
        storageKey: z.string().optional(),
        entityId: z.string().optional(),
      }).optional(),
    })),
  }).passthrough()).optional(),
  startNodeIds: z.array(z.string()).optional(),
  title: z.string().optional(),
});

/**
 * Schema for pagination query parameters
 */
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const workflowIdParamSchema = z.object({
  workflowId: z.string().uuid(),
});

const executionIdParamSchema = z.object({
  executionId: z.string().uuid(),
});

// ============================================================================
// Request Types
// ============================================================================

interface ExecuteWorkflowRequest {
  Params: { workflowId: string };
  Body: {
    canvasData: CanvasData;
    variables?: WorkflowVariableDefinition[];
    startNodeIds?: string[];
    title?: string;
  };
}

interface GetExecutionRequest {
  Params: { executionId: string };
}

interface AbortExecutionRequest {
  Params: { executionId: string };
}

interface GetExecutionHistoryRequest {
  Params: { workflowId: string };
  Querystring: { page?: number; limit?: number };
}

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Route Registration
// ============================================================================

/**
 * Register execution routes on the Fastify instance.
 * All routes require authentication.
 */
export async function executionRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/workflows/:workflowId/execute
   * Start workflow execution.
   * 
   * Creates an execution session and returns an execution ID.
   * The workflow will be validated before execution starts.
   * 
   * Requirements: 1.1 - Create execution session and return execution ID
   */
  fastify.post<ExecuteWorkflowRequest>(
    '/workflows/:workflowId/execute',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Start workflow execution',
        tags: ['Executions'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['canvasData'],
          properties: {
            canvasData: {
              type: 'object',
              required: ['nodes', 'edges'],
              properties: {
                nodes: { type: 'array' },
                edges: { type: 'array' },
              },
            },
            variables: { type: 'array' },
            startNodeIds: { type: 'array', items: { type: 'string' } },
            title: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string' },
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
    async (request: FastifyRequest<ExecuteWorkflowRequest>, reply: FastifyReply) => {
      const { workflowId } = validateSchema(workflowIdParamSchema, request.params);
      const body = validateSchema(executeWorkflowSchema, request.body);

      const executionId = await workflowExecutionService.initializeWorkflowExecution(
        {
          id: request.user!.id,
          organizationId: request.user!.orgId,
        },
        workflowId,
        {
          canvasData: body.canvasData as CanvasData,
          variables: body.variables as WorkflowVariableDefinition[] | undefined,
          startNodeIds: body.startNodeIds,
          title: body.title,
        }
      );

      return reply.status(201).send({
        executionId,
        status: 'executing',
        createdAt: new Date().toISOString(),
      });
    }
  );

  /**
   * GET /api/executions/:executionId
   * Get execution status.
   * 
   * Returns the current status of an execution including all node executions.
   */
  fastify.get<GetExecutionRequest>(
    '/executions/:executionId',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get execution status',
        tags: ['Executions'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['executionId'],
          properties: {
            executionId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              workflow_id: { type: 'string' },
              status: { type: 'string' },
              title: { type: 'string', nullable: true },
              canvas_data: { type: 'object' },
              variables: { type: 'array' },
              error_message: { type: 'string', nullable: true },
              error_stack: { type: 'string', nullable: true },
              started_at: { type: 'string' },
              completed_at: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
              node_executions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    node_id: { type: 'string' },
                    node_type: { type: 'string' },
                    node_data: { type: 'object', nullable: true, additionalProperties: true },
                    status: { type: 'string' },
                    progress: { type: 'integer' },
                    input_data: { type: 'object', nullable: true, additionalProperties: true },
                    output_data: { type: 'object', nullable: true, additionalProperties: true },
                    error_message: { type: 'string', nullable: true },
                    started_at: { type: 'string', nullable: true },
                    completed_at: { type: 'string', nullable: true },
                  },
                },
              },
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
    async (request: FastifyRequest<GetExecutionRequest>, reply: FastifyReply) => {
      const { executionId } = validateSchema(executionIdParamSchema, request.params);

      const execution = await workflowExecutionService.getExecution(
        executionId,
        request.user!.orgId
      );

      // Non-admin users can only view their own executions
      const isAdmin = request.user!.role === 'owner' || request.user!.role === 'admin';
      if (!isAdmin && execution.user_id !== request.user!.id) {
        return reply.status(403).send({
          error: 'Access denied. You can only view your own executions.',
          code: 'FORBIDDEN',
          requestId: request.id,
        });
      }

      return reply.status(200).send(execution);
    }
  );

  /**
   * POST /api/executions/:executionId/abort
   * Abort a running execution.
   * 
   * Stops queuing new nodes for execution and marks the execution as aborted.
   * 
   * Requirements: 7.1 - Stop queuing new nodes for execution on abort
   */
  fastify.post<AbortExecutionRequest>(
    '/executions/:executionId/abort',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Abort a running execution',
        tags: ['Executions'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['executionId'],
          properties: {
            executionId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              abortedAt: { type: 'string' },
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
    async (request: FastifyRequest<AbortExecutionRequest>, reply: FastifyReply) => {
      const { executionId } = validateSchema(executionIdParamSchema, request.params);

      // Non-admin users can only abort their own executions
      const isAdmin = request.user!.role === 'owner' || request.user!.role === 'admin';
      if (!isAdmin) {
        const existing = await workflowExecutionService.getExecution(executionId, request.user!.orgId);
        if (existing.user_id !== request.user!.id) {
          return reply.status(403).send({
            error: 'Access denied. You can only abort your own executions.',
            code: 'FORBIDDEN',
            requestId: request.id,
          });
        }
      }

      const execution = await workflowExecutionService.abortExecution(
        executionId,
        request.user!.orgId
      );

      return reply.status(200).send({
        id: execution?.id,
        status: 'aborted',
        abortedAt: new Date().toISOString(),
      });
    }
  );

  /**
   * GET /api/workflows/:workflowId/executions
   * Get execution history for a workflow.
   * 
   * Returns a paginated list of past execution sessions.
   * 
   * Requirements: 9.2 - Return paginated list of past execution sessions
   */
  fastify.get<GetExecutionHistoryRequest>(
    '/workflows/:workflowId/executions',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get execution history for a workflow',
        tags: ['Executions'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    workflow_id: { type: 'string' },
                    status: { type: 'string' },
                    title: { type: 'string', nullable: true },
                    error_message: { type: 'string', nullable: true },
                    started_at: { type: 'string' },
                    completed_at: { type: 'string', nullable: true },
                    created_at: { type: 'string' },
                    node_executions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          node_id: { type: 'string' },
                          node_type: { type: 'string' },
                          status: { type: 'string' },
                          error_message: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
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
    async (request: FastifyRequest<GetExecutionHistoryRequest>, reply: FastifyReply) => {
      const { workflowId } = validateSchema(workflowIdParamSchema, request.params);
      const { page, limit } = validateSchema(paginationSchema, request.query);

      const isAdmin = request.user!.role === 'owner' || request.user!.role === 'admin';

      const result = await workflowExecutionService.getExecutionHistory(
        workflowId,
        request.user!.orgId,
        { page, limit, userId: isAdmin ? undefined : request.user!.id }
      );

      return reply.status(200).send(result);
    }
  );

  // ==========================================================================
  // Execution Workspace & Logs APIs
  // ==========================================================================

  /**
   * GET /api/executions/:executionId/logs
   * Get execution logs for a workflow execution.
   */
  fastify.get<{ Params: { executionId: string } }>(
    '/executions/:executionId/logs',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { executionId } = request.params;

      const execution = await prisma.workflow_executions.findFirst({
        where: { id: executionId, organization_id: request.user!.orgId },
        select: { id: true, status: true, logs: true, title: true, started_at: true, completed_at: true },
      });

      if (!execution) {
        throw AppError.notFound('Execution not found');
      }

      return reply.status(200).send({
        executionId: execution.id,
        status: execution.status,
        title: execution.title,
        startedAt: execution.started_at,
        completedAt: execution.completed_at,
        logs: execution.logs ?? [],
      });
    }
  );

  /**
   * GET /api/executions/:executionId/workspace/files
   * List workspace files for a workflow execution.
   * Uses local-first strategy with S3 fallback (same as chat workspace).
   */
  fastify.get<{ Params: { executionId: string } }>(
    '/executions/:executionId/workspace/files',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { executionId } = request.params;

      const execution = await prisma.workflow_executions.findFirst({
        where: { id: executionId, organization_id: request.user!.orgId },
        select: { workspace_session_id: true, workspace_scope_id: true, organization_id: true },
      });

      if (!execution) {
        throw AppError.notFound('Execution not found');
      }

      if (!execution.workspace_session_id || !execution.workspace_scope_id) {
        return reply.status(200).send({ files: [], message: 'No workspace associated with this execution' });
      }

      const orgId = execution.organization_id;
      const scopeId = execution.workspace_scope_id;
      const sessionId = execution.workspace_session_id;

      // Local-first, S3 fallback (same pattern as chat workspace)
      let files = await workspaceManager.listWorkspaceFiles(orgId, scopeId, sessionId);

      if (!files && config.agentRuntime === 'agentcore') {
        files = await workspaceManager.listWorkspaceFilesFromS3(orgId, scopeId, sessionId);
      }

      return reply.status(200).send({ files: files ?? [] });
    }
  );

  /**
   * GET /api/executions/:executionId/workspace/files/*
   * Read a specific workspace file for a workflow execution.
   * Uses local-first strategy with S3 fallback.
   */
  fastify.get<{ Params: { executionId: string; '*': string } }>(
    '/executions/:executionId/workspace/files/*',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { executionId } = request.params;
      const filePath = request.params['*'];

      if (!filePath) {
        throw AppError.validation('File path is required');
      }

      const execution = await prisma.workflow_executions.findFirst({
        where: { id: executionId, organization_id: request.user!.orgId },
        select: { workspace_session_id: true, workspace_scope_id: true, organization_id: true },
      });

      if (!execution) {
        throw AppError.notFound('Execution not found');
      }

      if (!execution.workspace_session_id || !execution.workspace_scope_id) {
        throw AppError.notFound('No workspace associated with this execution');
      }

      const orgId = execution.organization_id;
      const scopeId = execution.workspace_scope_id;
      const sessionId = execution.workspace_session_id;

      // Local-first, S3 fallback
      let content = await workspaceManager.readWorkspaceFile(orgId, scopeId, sessionId, filePath);

      if (content === null && config.agentRuntime === 'agentcore') {
        content = await workspaceManager.readWorkspaceFileFromS3(orgId, scopeId, sessionId, filePath);
      }

      if (content === null) {
        throw AppError.notFound('File not found');
      }

      return reply.status(200).send({ path: filePath, content });
    }
  );
}
