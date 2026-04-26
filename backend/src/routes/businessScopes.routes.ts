/**
 * Business Scope Routes
 * REST API endpoints for Business Scope management.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { businessScopeService } from '../services/businessScope.service.js';
import { aiService } from '../services/ai.service.js';
import { authenticate, requireModifyAccess } from '../middleware/auth.js';
import { requireScopeAccess } from '../middleware/scopeAccess.js';
import { scopeAccessService } from '../services/scopeAccess.service.js';
import {
  createBusinessScopeSchema,
  updateBusinessScopeSchema,
  businessScopeFilterSchema,
  generateAgentRolesSchema,
  suggestAgentRolesSchema,
  type CreateBusinessScopeInput,
  type UpdateBusinessScopeInput,
  type BusinessScopeFilter,
  type GenerateAgentRolesInput,
  type SuggestAgentRolesInput,
} from '../schemas/businessScope.schema.js';
import { paginationSchema, idParamSchema } from '../schemas/common.schema.js';
import { ZodError } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';

/**
 * Request types for route handlers
 */
interface GetBusinessScopesRequest {
  Querystring: BusinessScopeFilter & { page?: number; limit?: number };
}

interface SuggestAgentRolesRequest {
  Body: SuggestAgentRolesInput;
}

interface GetBusinessScopeByIdRequest {
  Params: { id: string };
}

interface CreateBusinessScopeRequest {
  Body: CreateBusinessScopeInput;
}

interface UpdateBusinessScopeRequest {
  Params: { id: string };
  Body: UpdateBusinessScopeInput;
}

interface DeleteBusinessScopeRequest {
  Params: { id: string };
}

interface GenerateAgentRolesRequest {
  Body: GenerateAgentRolesInput;
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
 * Register business scope routes on the Fastify instance.
 * All routes require authentication and filter by organization_id.
 */
export async function businessScopeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/business-scopes
   * Get all business scopes for the authenticated user's organization.
   * Supports filtering by name and is_default.
   * Requirements: 11.1
   */
  fastify.get<GetBusinessScopesRequest>(
    '/',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all business scopes for the organization',
        tags: ['Business Scopes'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            is_default: { type: 'boolean' },
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
    async (request: FastifyRequest<GetBusinessScopesRequest>, reply: FastifyReply) => {
      const { page, limit, ...filterParams } = request.query;

      // Validate filters
      const filters = validateSchema(businessScopeFilterSchema, filterParams);
      const pagination = validateSchema(paginationSchema, { page, limit });

      const result = await businessScopeService.getBusinessScopes(
        request.user!.orgId,
        filters,
        pagination
      );

      // Filter scopes by user access
      const accessibleIds = await scopeAccessService.getAccessibleScopeIds(request.user!);
      if (accessibleIds !== 'all') {
        const idSet = new Set(accessibleIds);
        result.data = result.data.filter((s: { id: string }) => idSet.has(s.id));
        result.pagination.total = result.data.length;
        result.pagination.totalPages = Math.ceil(result.data.length / (pagination.limit ?? 20));
      }

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/business-scopes/:id
   * Get a single business scope by ID with associated agents.
   * Requirements: 11.2
   */
  fastify.get<GetBusinessScopeByIdRequest>(
    '/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get a business scope by ID with associated agents',
        tags: ['Business Scopes'],
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
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              icon: { type: 'string', nullable: true },
              color: { type: 'string', nullable: true },
              is_default: { type: 'boolean' },
              scope_type: { type: 'string' },
              avatar: { type: 'string', nullable: true },
              role: { type: 'string', nullable: true },
              system_prompt: { type: 'string', nullable: true },
              settings: { type: 'object', nullable: true, additionalProperties: true },
              config_version: { type: 'integer' },
              agents: { type: 'array' },
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
    async (request: FastifyRequest<GetBusinessScopeByIdRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      // Enforce scope-level access
      await scopeAccessService.requireAccess(request.user!, id, 'viewer');

      const businessScope = await businessScopeService.getBusinessScopeById(
        id,
        request.user!.orgId
      );

      return reply.status(200).send(businessScope);
    }
  );

  /**
   * POST /api/business-scopes
   * Create a new business scope.
   * Requirements: 11.3
   */
  fastify.post<CreateBusinessScopeRequest>(
    '/',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Create a new business scope',
        tags: ['Business Scopes'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 1000, nullable: true },
            icon: { type: 'string', maxLength: 100, nullable: true },
            color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', nullable: true },
            is_default: { type: 'boolean', default: false },
            scope_type: { type: 'string', enum: ['business', 'digital_twin'], default: 'business' },
            avatar: { type: 'string', maxLength: 1024, nullable: true },
            role: { type: 'string', maxLength: 255, nullable: true },
            system_prompt: { type: 'string', nullable: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              icon: { type: 'string', nullable: true },
              color: { type: 'string', nullable: true },
              is_default: { type: 'boolean' },
              scope_type: { type: 'string' },
              avatar: { type: 'string', nullable: true },
              role: { type: 'string', nullable: true },
              system_prompt: { type: 'string', nullable: true },
              settings: { type: 'object', nullable: true, additionalProperties: true },
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
    async (request: FastifyRequest<CreateBusinessScopeRequest>, reply: FastifyReply) => {
      const data = validateSchema(createBusinessScopeSchema, request.body);

      const businessScope = await businessScopeService.createBusinessScope(
        data,
        request.user!.orgId
      );

      return reply.status(201).send(businessScope);
    }
  );

  /**
   * PUT /api/business-scopes/:id
   * Update an existing business scope.
   * Requirements: 11.4
   */
  fastify.put<UpdateBusinessScopeRequest>(
    '/:id',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Update a business scope',
        tags: ['Business Scopes'],
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
            description: { type: 'string', maxLength: 1000, nullable: true },
            icon: { type: 'string', maxLength: 100, nullable: true },
            color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', nullable: true },
            is_default: { type: 'boolean' },
            scope_type: { type: 'string', enum: ['business', 'digital_twin'] },
            avatar: { type: 'string', maxLength: 1024, nullable: true },
            role: { type: 'string', maxLength: 255, nullable: true },
            system_prompt: { type: 'string', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              icon: { type: 'string', nullable: true },
              color: { type: 'string', nullable: true },
              is_default: { type: 'boolean' },
              scope_type: { type: 'string' },
              avatar: { type: 'string', nullable: true },
              role: { type: 'string', nullable: true },
              system_prompt: { type: 'string', nullable: true },
              settings: { type: 'object', nullable: true, additionalProperties: true },
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
    async (request: FastifyRequest<UpdateBusinessScopeRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const data = validateSchema(updateBusinessScopeSchema, request.body);

      // Require scope admin or member access to update
      await scopeAccessService.requireAccess(request.user!, id, 'member');

      const businessScope = await businessScopeService.updateBusinessScope(
        id,
        data,
        request.user!.orgId
      );

      return reply.status(200).send(businessScope);
    }
  );

  /**
   * DELETE /api/business-scopes/:id
   * Delete a business scope (soft-delete).
   * Requirements: 11.5
   */
  fastify.delete<DeleteBusinessScopeRequest>(
    '/:id',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Delete a business scope',
        tags: ['Business Scopes'],
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
            description: 'Business scope deleted successfully',
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
    async (request: FastifyRequest<DeleteBusinessScopeRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);

      // Require scope admin access to delete
      await scopeAccessService.requireAccess(request.user!, id, 'admin');

      await businessScopeService.deleteBusinessScope(id, request.user!.orgId);

      return reply.status(204).send();
    }
  );

  /**
   * POST /api/business-scopes/generate
   * Generate agent roles using AI based on provided documents.
   * Requirements: 11.6
   */
  fastify.post<GenerateAgentRolesRequest>(
    '/generate',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Generate agent roles using AI based on provided documents',
        tags: ['Business Scopes'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['document_ids'],
          properties: {
            document_ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
            },
            business_scope_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              roles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    display_name: { type: 'string' },
                    role: { type: 'string' },
                    system_prompt: { type: 'string' },
                    suggested_tools: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
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
    async (request: FastifyRequest<GenerateAgentRolesRequest>, reply: FastifyReply) => {
      const data = validateSchema(generateAgentRolesSchema, request.body);

      const roles = await businessScopeService.generateAgentRoles(data, request.user!.orgId);

      return reply.status(200).send({ roles });
    }
  );

  /**
   * POST /api/business-scopes/suggest-agents
   * Suggest agent roles using AI based on business scope name.
   * This is a PROPOSAL endpoint - it does NOT persist anything.
   * Used by the frontend to show suggested agents before user confirms.
   */
  fastify.post<SuggestAgentRolesRequest>(
    '/suggest-agents',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Suggest agent roles using AI (no persistence, just proposals)',
        tags: ['Business Scopes'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['business_scope_name'],
          properties: {
            business_scope_name: { type: 'string', minLength: 1, maxLength: 255 },
            business_scope_description: { type: 'string', maxLength: 1000 },
            document_contents: {
              type: 'array',
              items: { type: 'string' },
            },
            agent_count: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              suggested_agents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    display_name: { type: 'string' },
                    role: { type: 'string' },
                    description: { type: 'string' },
                    responsibilities: { type: 'array', items: { type: 'string' } },
                    capabilities: { type: 'array', items: { type: 'string' } },
                    system_prompt: { type: 'string' },
                    suggested_tools: { 
                      type: 'array', 
                      items: { 
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          display_name: { type: 'string' },
                          description: { type: 'string' },
                          skill_md: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
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
        },
      },
    },
    async (request: FastifyRequest<SuggestAgentRolesRequest>, reply: FastifyReply) => {
      try {
        const data = validateSchema(suggestAgentRolesSchema, request.body);

        const suggestedAgents = await aiService.suggestAgentRoles({
          business_scope_name: data.business_scope_name,
          business_scope_description: data.business_scope_description,
          document_contents: data.document_contents,
          agent_count: data.agent_count,
        });

        return reply.status(200).send({ suggested_agents: suggestedAgents });
      } catch (error) {
        request.log.error({ error, body: request.body }, 'Failed to suggest agent roles');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to generate agent suggestions',
          code: 'AI_GENERATION_ERROR',
          requestId: request.id,
        });
      }
    }
  );

  // ============================================================================
  // AgentCore Runtime Endpoints
  // ============================================================================

  /**
   * GET /api/business-scopes/:id/agents
   * Get all agents in a business scope with their assigned skills.
   * Used by AgentCore runtime to build subagent definitions.
   */
  fastify.get<GetBusinessScopeByIdRequest>(
    '/:id/agents',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all agents in a business scope with their skills (for AgentCore runtime)',
        tags: ['Business Scopes', 'AgentCore'],
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
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                display_name: { type: 'string' },
                role: { type: 'string', nullable: true },
                system_prompt: { type: 'string', nullable: true },
                tools: { type: 'array' },
                skill_ids: { type: 'array', items: { type: 'string' } },
                skills: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      hash_id: { type: 'string' },
                      s3_bucket: { type: 'string' },
                      s3_prefix: { type: 'string' },
                      version: { type: 'string' },
                    },
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
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetBusinessScopeByIdRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      await scopeAccessService.requireAccess(request.user!, id, 'viewer');
      const agents = await businessScopeService.getScopeAgentsWithSkills(id, request.user!.orgId);
      return reply.status(200).send(agents);
    }
  );

  /**
   * GET /api/business-scopes/:id/skills
   * Get all unique skills for a business scope.
   * Used by AgentCore runtime to download skills from S3.
   */
  fastify.get<GetBusinessScopeByIdRequest>(
    '/:id/skills',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all unique skills for a business scope (for AgentCore runtime)',
        tags: ['Business Scopes', 'AgentCore'],
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
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                hash_id: { type: 'string' },
                s3_bucket: { type: 'string' },
                s3_prefix: { type: 'string' },
                version: { type: 'string' },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetBusinessScopeByIdRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      await scopeAccessService.requireAccess(request.user!, id, 'viewer');
      const skills = await businessScopeService.getScopeSkills(id, request.user!.orgId);
      return reply.status(200).send(skills);
    }
  );

  /**
   * POST /api/business-scopes/:id/skills/:skillId
   * Bind an existing skill to a business scope.
   */
  fastify.post<{ Params: { id: string; skillId: string } }>(
    '/:id/skills/:skillId',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Bind an existing skill to a business scope',
        tags: ['Business Scopes'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'skillId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            skillId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: { description: 'Skill bound to scope successfully' },
        },
      },
    },
    async (request, reply) => {
      const { id, skillId } = request.params;
      const { skillService } = await import('../services/skill.service.js');
      await skillService.bindSkillToScope(request.user!.orgId, skillId, id);
      return reply.status(204).send();
    }
  );

  /**
   * DELETE /api/business-scopes/:id/skills/:skillId
   * Unbind a skill from a business scope (does not delete the skill).
   */
  fastify.delete<{ Params: { id: string; skillId: string } }>(
    '/:id/skills/:skillId',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        description: 'Unbind a skill from a business scope',
        tags: ['Business Scopes'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id', 'skillId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            skillId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          204: { description: 'Skill unbound from scope successfully' },
        },
      },
    },
    async (request, reply) => {
      const { id, skillId } = request.params;
      const { skillService } = await import('../services/skill.service.js');
      await skillService.unbindSkillFromScope(request.user!.orgId, skillId, id);
      return reply.status(204).send();
    }
  );

  // ==========================================================================
  // Scope Plugin Management
  // ==========================================================================

  /**
   * GET /api/business-scopes/:id/plugins
   * List plugins attached to a business scope.
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/plugins',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const orgId = request.user!.orgId;
      const rows = await prisma.$queryRaw<Array<{ id: string; name: string; git_url: string; ref: string; assigned_at: Date }>>`
        SELECT sp.id, sp.name, sp.git_url, sp.ref, sp.assigned_at
        FROM scope_plugins sp
        WHERE sp.business_scope_id = ${id}::uuid
        ORDER BY sp.assigned_at DESC
      `;
      return reply.status(200).send({ data: rows });
    },
  );

  /**
   * POST /api/business-scopes/:id/plugins
   * Add a plugin to a business scope.
   */
  fastify.post<{ Params: { id: string }; Body: { name: string; gitUrl: string; ref?: string } }>(
    '/:id/plugins',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'gitUrl'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            gitUrl: { type: 'string', minLength: 1 },
            ref: { type: 'string', default: 'main' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const orgId = request.user!.orgId;
      const { name, gitUrl, ref } = request.body;

      // Verify scope belongs to org
      const scope = await businessScopeService.getBusinessScopeById(id, orgId);
      if (!scope) throw AppError.notFound('Business scope not found');

      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO scope_plugins (id, business_scope_id, name, git_url, ref, assigned_by)
        VALUES (gen_random_uuid(), ${id}::uuid, ${name}, ${gitUrl}, ${ref ?? 'main'}, ${request.user!.id}::uuid)
        ON CONFLICT (business_scope_id, name) DO UPDATE SET git_url = ${gitUrl}, ref = ${ref ?? 'main'}
        RETURNING id
      `;

      // Bump config_version so active sessions pick up the change
      await prisma.$executeRaw`
        UPDATE business_scopes SET config_version = config_version + 1, updated_at = NOW()
        WHERE id = ${id}::uuid AND organization_id = ${orgId}::uuid
      `;

      return reply.status(201).send({ id: rows[0]?.id, name, gitUrl, ref: ref ?? 'main' });
    },
  );

  /**
   * DELETE /api/business-scopes/:id/plugins/:pluginId
   * Remove a plugin from a business scope and clean up cloned directories.
   */
  fastify.delete<{ Params: { id: string; pluginId: string } }>(
    '/:id/plugins/:pluginId',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      const scopeId = request.params.id;
      const pluginId = request.params.pluginId;
      const orgId = request.user!.orgId;

      // Look up plugin name before deleting so we can remove the cloned directory
      const [plugin] = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM scope_plugins WHERE id = ${pluginId}::uuid AND business_scope_id = ${scopeId}::uuid
      `;

      await prisma.$executeRaw`
        DELETE FROM scope_plugins WHERE id = ${pluginId}::uuid AND business_scope_id = ${scopeId}::uuid
      `;

      // Remove cloned plugin directories from all session workspaces under this scope
      if (plugin) {
        const { rm, readdir, access } = await import('fs/promises');
        const { join } = await import('path');
        const { config } = await import('../config/index.js');
        const sessionsDir = join(config.claude.workspaceBaseDir, orgId, scopeId, 'sessions');
        try {
          await access(sessionsDir);
          const sessions = await readdir(sessionsDir, { withFileTypes: true });
          for (const sess of sessions) {
            if (!sess.isDirectory()) continue;
            const pluginDir = join(sessionsDir, sess.name, '.claude', 'plugins', plugin.name);
            await rm(pluginDir, { recursive: true, force: true }).catch(() => {});
          }
        } catch {
          // sessions dir may not exist yet — that's fine
        }
      }

      // Bump config_version
      await prisma.$executeRaw`
        UPDATE business_scopes SET config_version = config_version + 1, updated_at = NOW()
        WHERE id = ${scopeId}::uuid AND organization_id = ${orgId}::uuid
      `;

      return reply.status(204).send();
    },
  );

  // ==========================================================================
  // Scope MCP Server Management
  // ==========================================================================

  /**
   * GET /api/business-scopes/:id/mcp-servers
   * List MCP servers attached to a business scope.
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/mcp-servers',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const rows = await prisma.$queryRaw<Array<{
        id: string; mcp_server_id: string; name: string; description: string | null;
        host_address: string; config: Record<string, unknown> | null; status: string; assigned_at: Date;
        scope_config: Record<string, unknown> | null;
      }>>`
        SELECT sms.id, sms.mcp_server_id, ms.name, ms.description, ms.host_address, ms.config, ms.status, sms.assigned_at, sms.scope_config
        FROM scope_mcp_servers sms
        JOIN mcp_servers ms ON ms.id = sms.mcp_server_id
        WHERE sms.business_scope_id = ${id}::uuid
        ORDER BY sms.assigned_at DESC
      `;
      return reply.status(200).send({ data: rows });
    },
  );

  /**
   * POST /api/business-scopes/:id/mcp-servers
   * Attach an MCP server to a business scope.
   */
  fastify.post<{ Params: { id: string }; Body: { mcpServerId: string } }>(
    '/:id/mcp-servers',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        body: {
          type: 'object',
          required: ['mcpServerId'],
          properties: {
            mcpServerId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const orgId = request.user!.orgId;
      const { mcpServerId } = request.body;

      // Verify scope belongs to org
      const scope = await businessScopeService.getBusinessScopeById(id, orgId);
      if (!scope) throw AppError.notFound('Business scope not found');

      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO scope_mcp_servers (id, business_scope_id, mcp_server_id, assigned_by)
        VALUES (gen_random_uuid(), ${id}::uuid, ${mcpServerId}::uuid, ${request.user!.id}::uuid)
        ON CONFLICT (business_scope_id, mcp_server_id) DO NOTHING
        RETURNING id
      `;

      // Bump config_version so active sessions pick up the change
      await prisma.$executeRaw`
        UPDATE business_scopes SET config_version = config_version + 1, updated_at = NOW()
        WHERE id = ${id}::uuid AND organization_id = ${orgId}::uuid
      `;

      return reply.status(201).send({ id: rows[0]?.id ?? null, mcpServerId });
    },
  );

  /**
   * DELETE /api/business-scopes/:id/mcp-servers/:assignmentId
   * Remove an MCP server from a business scope.
   */
  fastify.delete<{ Params: { id: string; assignmentId: string } }>(
    '/:id/mcp-servers/:assignmentId',
    { preHandler: [authenticate, requireModifyAccess] },
    async (request, reply) => {
      const scopeId = request.params.id;
      const assignmentId = request.params.assignmentId;
      const orgId = request.user!.orgId;

      await prisma.$executeRaw`
        DELETE FROM scope_mcp_servers WHERE id = ${assignmentId}::uuid AND business_scope_id = ${scopeId}::uuid
      `;

      // Bump config_version
      await prisma.$executeRaw`
        UPDATE business_scopes SET config_version = config_version + 1, updated_at = NOW()
        WHERE id = ${scopeId}::uuid AND organization_id = ${orgId}::uuid
      `;

      return reply.status(204).send();
    },
  );

  /**
   * PUT /api/business-scopes/:id/mcp-servers/:assignmentId/config
   * Update the scope-level configuration for an assigned MCP server.
   * This stores per-scope overrides (connection strings, env vars, etc.)
   * separate from the global MCP server definition.
   */
  fastify.put<{ Params: { id: string; assignmentId: string }; Body: { scopeConfig: Record<string, unknown> } }>(
    '/:id/mcp-servers/:assignmentId/config',
    {
      preHandler: [authenticate, requireModifyAccess],
      schema: {
        body: {
          type: 'object',
          required: ['scopeConfig'],
          properties: {
            scopeConfig: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const scopeId = request.params.id;
      const assignmentId = request.params.assignmentId;
      const orgId = request.user!.orgId;
      const { scopeConfig } = request.body;

      // Verify scope belongs to org
      const scope = await businessScopeService.getBusinessScopeById(scopeId, orgId);
      if (!scope) throw AppError.notFound('Business scope not found');

      const configJson = JSON.stringify(scopeConfig);
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE scope_mcp_servers
        SET scope_config = ${configJson}::jsonb
        WHERE id = ${assignmentId}::uuid AND business_scope_id = ${scopeId}::uuid
        RETURNING id
      `;

      if (!rows.length) throw AppError.notFound('MCP server assignment not found');

      // Bump config_version
      await prisma.$executeRaw`
        UPDATE business_scopes SET config_version = config_version + 1, updated_at = NOW()
        WHERE id = ${scopeId}::uuid AND organization_id = ${orgId}::uuid
      `;

      return reply.status(200).send({ id: assignmentId, scopeConfig });
    },
  );
}
