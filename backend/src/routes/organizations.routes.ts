/**
 * Organization Routes
 * REST API endpoints for Organization and Membership management.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { organizationService } from '../services/organization.service.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { config } from '../config/index.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from '../schemas/organization.schema.js';
import {
  inviteMemberSchema,
  updateMembershipSchema,
  membershipFilterSchema,
  type InviteMemberInput,
  type UpdateMembershipInput,
  type MembershipFilter,
} from '../schemas/membership.schema.js';
import { paginationSchema, idParamSchema } from '../schemas/common.schema.js';
import { ZodError } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Request types for route handlers
 */
interface GetOrganizationRequest {
  Params: { id: string };
}

interface CreateOrganizationRequest {
  Body: CreateOrganizationInput;
}

interface UpdateOrganizationRequest {
  Params: { id: string };
  Body: UpdateOrganizationInput;
}

interface DeleteOrganizationRequest {
  Params: { id: string };
}

interface GetMembersRequest {
  Querystring: MembershipFilter & { page?: number; limit?: number };
}

interface GetMemberByIdRequest {
  Params: { id: string };
}

interface InviteMemberRequest {
  Body: InviteMemberInput;
}

interface UpdateMembershipRequest {
  Params: { id: string };
  Body: UpdateMembershipInput;
}

interface RemoveMemberRequest {
  Params: { id: string };
}

interface TransferOwnershipRequest {
  Body: { new_owner_id: string };
}

interface AcceptInvitationRequest {
  Params: { id: string };
}

interface CancelInvitationRequest {
  Params: { id: string };
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
 * Register organization routes on the Fastify instance.
 */
export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  // ============================================================================
  // Organization Endpoints
  // ============================================================================

  /**
   * GET /api/organizations/current
   * Get the current user's organization.
   */
  fastify.get(
    '/current',
    {
      preHandler: [authenticate],
      schema: {
        description: "Get the current user's organization",
        tags: ['Organizations'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              plan_type: { type: 'string' },
              settings: { type: 'object' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const organization = await organizationService.getCurrentOrganization(request.user!.orgId);
      return reply.status(200).send(organization);
    }
  );

  /**
   * GET /api/organizations/:id
   * Get an organization by ID.
   */
  fastify.get<GetOrganizationRequest>(
    '/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get an organization by ID',
        tags: ['Organizations'],
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
              name: { type: 'string' },
              slug: { type: 'string' },
              plan_type: { type: 'string' },
              settings: { type: 'object' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          403: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
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
    async (request: FastifyRequest<GetOrganizationRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const organization = await organizationService.getOrganizationById(id, request.user!.orgId);
      return reply.status(200).send(organization);
    }
  );

  /**
   * POST /api/organizations
   * Create a new organization.
   */
  fastify.post<CreateOrganizationRequest>(
    '/',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Create a new organization',
        tags: ['Organizations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'slug'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            slug: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
            },
            plan_type: { type: 'string', enum: ['free', 'pro', 'enterprise'], default: 'free' },
            settings: { type: 'object', default: {} },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              plan_type: { type: 'string' },
              settings: { type: 'object' },
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
    async (request: FastifyRequest<CreateOrganizationRequest>, reply: FastifyReply) => {
      const data = validateSchema(createOrganizationSchema, request.body);
      const organization = await organizationService.createOrganization(data, request.user!.id);
      return reply.status(201).send(organization);
    }
  );

  /**
   * PUT /api/organizations/:id
   * Update an organization.
   */
  fastify.put<UpdateOrganizationRequest>(
    '/:id',
    {
      preHandler: [authenticate, requireRole('owner', 'admin')],
      schema: {
        description: 'Update an organization',
        tags: ['Organizations'],
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
            slug: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
            },
            plan_type: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
            settings: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              plan_type: { type: 'string' },
              settings: { type: 'object' },
              updated_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<UpdateOrganizationRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const data = validateSchema(updateOrganizationSchema, request.body);
      const organization = await organizationService.updateOrganization(
        id,
        data,
        request.user!.orgId
      );
      return reply.status(200).send(organization);
    }
  );

  /**
   * DELETE /api/organizations/:id
   * Delete an organization.
   */
  fastify.delete<DeleteOrganizationRequest>(
    '/:id',
    {
      preHandler: [authenticate, requireRole('owner')],
      schema: {
        description: 'Delete an organization',
        tags: ['Organizations'],
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
            description: 'Organization deleted successfully',
          },
        },
      },
    },
    async (request: FastifyRequest<DeleteOrganizationRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      await organizationService.deleteOrganization(id, request.user!.orgId);
      return reply.status(204).send();
    }
  );

  // ============================================================================
  // Membership Endpoints
  // ============================================================================

  /**
   * GET /api/organizations/members
   * Get all members of the current organization.
   */
  fastify.get<GetMembersRequest>(
    '/members',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all members of the organization',
        tags: ['Memberships'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['owner', 'admin', 'member', 'viewer'] },
            status: { type: 'string', enum: ['pending', 'active', 'inactive'] },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 0, default: 0 },
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
    async (request: FastifyRequest<GetMembersRequest>, reply: FastifyReply) => {
      const { page, limit, ...filterParams } = request.query;
      const filters = validateSchema(membershipFilterSchema, filterParams);
      const pagination = validateSchema(paginationSchema, { page, limit });

      const result = await organizationService.getMembers(request.user!.orgId, filters, pagination);

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/organizations/members/:id
   * Get a single member by ID.
   */
  fastify.get<GetMemberByIdRequest>(
    '/members/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get a member by ID',
        tags: ['Memberships'],
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
              user_id: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              invited_email: { type: 'string', nullable: true },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<GetMemberByIdRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const membership = await organizationService.getMemberById(id, request.user!.orgId);
      return reply.status(200).send(membership);
    }
  );

  /**
   * POST /api/organizations/members/invite
   * Invite a new member to the organization.
   */
  fastify.post<InviteMemberRequest>(
    '/members/invite',
    {
      preHandler: [authenticate, requireRole('owner', 'admin')],
      schema: {
        description: 'Invite a new member to the organization',
        tags: ['Memberships'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['invited_email'],
          properties: {
            invited_email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'member', 'viewer'], default: 'member' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              invited_email: { type: 'string' },
              created_at: { type: 'string' },
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
    async (request: FastifyRequest<InviteMemberRequest>, reply: FastifyReply) => {
      const data = validateSchema(inviteMemberSchema, request.body);
      const membership = await organizationService.inviteMember(data, request.user!.orgId);

      // Generate invite token and send email
      const crypto = await import('crypto');
      const { prisma } = await import('../config/database.js');
      const { sendInviteEmail, isEmailConfigured } = await import('../services/email.service.js');

      const inviteToken = crypto.randomBytes(32).toString('hex');
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await prisma.memberships.update({
        where: { id: membership.id },
        data: { invite_token: inviteToken, invite_expires_at: inviteExpiresAt },
      });

      // Send email if SMTP is configured
      if (isEmailConfigured()) {
        try {
          const org = await prisma.organizations.findUnique({ where: { id: request.user!.orgId } });
          const inviterProfile = await prisma.profiles.findUnique({ where: { id: request.user!.id } });
          await sendInviteEmail({
            to: data.invited_email,
            inviterName: inviterProfile?.full_name || request.user!.email || 'A team member',
            organizationName: org?.name || 'your organization',
            inviteToken,
            role: data.role || 'member',
          });
        } catch (emailErr) {
          request.log.error({ err: emailErr }, 'Failed to send invite email');
          // Don't fail the invite — the membership is created, admin can share the link manually
        }
      } else {
        request.log.warn('SMTP not configured — invite created but no email sent');
      }

      return reply.status(201).send(membership);
    }
  );

  /**
   * PUT /api/organizations/members/:id
   * Update a membership (role or status).
   */
  fastify.put<UpdateMembershipRequest>(
    '/members/:id',
    {
      preHandler: [authenticate, requireRole('owner', 'admin')],
      schema: {
        description: 'Update a membership',
        tags: ['Memberships'],
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
            role: { type: 'string', enum: ['admin', 'member', 'viewer'] },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              organization_id: { type: 'string' },
              user_id: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
              updated_at: { type: 'string' },
              email: { type: 'string', nullable: true },
              name: { type: 'string', nullable: true },
              invited_email: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<UpdateMembershipRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const data = validateSchema(updateMembershipSchema, request.body);
      const membership = await organizationService.updateMembership(
        id,
        data,
        request.user!.orgId,
        request.user!.id
      );
      return reply.status(200).send(membership);
    }
  );

  /**
   * DELETE /api/organizations/members/:id
   * Remove a member from the organization.
   */
  fastify.delete<RemoveMemberRequest>(
    '/members/:id',
    {
      preHandler: [authenticate, requireRole('owner', 'admin')],
      schema: {
        description: 'Remove a member from the organization',
        tags: ['Memberships'],
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
            description: 'Member removed successfully',
          },
        },
      },
    },
    async (request: FastifyRequest<RemoveMemberRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      await organizationService.removeMember(id, request.user!.orgId, request.user!.id);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/organizations/leave
   * Leave the current organization.
   */
  fastify.post(
    '/leave',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Leave the current organization',
        tags: ['Memberships'],
        security: [{ bearerAuth: [] }],
        response: {
          204: {
            type: 'null',
            description: 'Left organization successfully',
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await organizationService.leaveOrganization(request.user!.orgId, request.user!.id);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/organizations/transfer-ownership
   * Transfer organization ownership to another member.
   */
  fastify.post<TransferOwnershipRequest>(
    '/transfer-ownership',
    {
      preHandler: [authenticate, requireRole('owner')],
      schema: {
        description: 'Transfer organization ownership',
        tags: ['Organizations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['new_owner_id'],
          properties: {
            new_owner_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              old_owner: { type: 'object' },
              new_owner: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<TransferOwnershipRequest>, reply: FastifyReply) => {
      const { new_owner_id } = request.body;
      const result = await organizationService.transferOwnership(
        request.user!.orgId,
        new_owner_id,
        request.user!.id
      );
      return reply.status(200).send({
        old_owner: result.oldOwner,
        new_owner: result.newOwner,
      });
    }
  );

  /**
   * POST /api/organizations/invitations/:id/accept
   * Accept an invitation to join an organization.
   */
  fastify.post<AcceptInvitationRequest>(
    '/invitations/:id/accept',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Accept an invitation to join an organization',
        tags: ['Memberships'],
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
              user_id: { type: 'string' },
              role: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<AcceptInvitationRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      const membership = await organizationService.acceptInvitation(
        id,
        request.user!.id,
        request.user!.email
      );
      return reply.status(200).send(membership);
    }
  );

  /**
   * DELETE /api/organizations/invitations/:id
   * Cancel a pending invitation.
   */
  fastify.delete<CancelInvitationRequest>(
    '/invitations/:id',
    {
      preHandler: [authenticate, requireRole('owner', 'admin')],
      schema: {
        description: 'Cancel a pending invitation',
        tags: ['Memberships'],
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
            description: 'Invitation cancelled successfully',
          },
        },
      },
    },
    async (request: FastifyRequest<CancelInvitationRequest>, reply: FastifyReply) => {
      const { id } = validateSchema(idParamSchema, request.params);
      await organizationService.cancelInvitation(id, request.user!.orgId);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/organizations/members/provision
   * Admin-only: create a user with credentials.
   * In cognito mode, creates via Cognito Admin API.
   * In local mode, creates directly in DB with password hash.
   */
  fastify.post<{ Body: { username: string; password: string; role: string; fullName?: string } }>(
    '/members/provision',
    {
      preHandler: [authenticate, requireRole('owner', 'admin')],
      schema: {
        description: 'Provision a new user with username/password',
        tags: ['Memberships'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['username', 'password', 'role'],
          properties: {
            username: { type: 'string', minLength: 3 },
            password: { type: 'string', minLength: 8 },
            role: { type: 'string', enum: ['owner', 'admin', 'member', 'viewer'] },
            fullName: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password, role, fullName } = request.body;
      const { prisma } = await import('../config/database.js');

      // Check if username already exists
      const existing = await prisma.profiles.findUnique({ where: { username } });
      if (existing) {
        return reply.status(409).send({ error: 'Username already exists' });
      }

      if (config.authMode === 'local') {
        // Local mode: create directly in DB with bcrypt hash
        const bcrypt = await import('bcryptjs');
        const { v4: uuidv4 } = await import('uuid');
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        const profile = await prisma.profiles.create({
          data: {
            id: userId,
            username,
            full_name: fullName || username,
            password_hash: passwordHash,
          },
        });

        const membership = await prisma.memberships.create({
          data: {
            user_id: userId,
            organization_id: request.user!.orgId,
            role,
            status: 'active',
            invited_email: username,
          },
        });

        return reply.status(201).send({
          userId,
          username,
          role,
          membershipId: membership.id,
        });
      } else {
        // Cognito mode: create via Cognito Admin API
        const { adminCreateUser, adminDeleteUser } = await import('../services/cognito-admin.service.js');

        const { sub } = await adminCreateUser(username, password, request.user!.orgId, role);

        try {
          await prisma.profiles.create({
            data: {
              id: sub,
              username,
              full_name: fullName || username,
            },
          });

          const membership = await prisma.memberships.create({
            data: {
              user_id: sub,
              organization_id: request.user!.orgId,
              role,
              status: 'active',
              invited_email: username,
            },
          });

          return reply.status(201).send({
            userId: sub,
            username,
            role,
            membershipId: membership.id,
          });
        } catch (err) {
          await adminDeleteUser(username).catch(() => {});
          throw err;
        }
      }
    }
  );
}
