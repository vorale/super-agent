/**
 * Organization Service
 * Business logic layer for Organization and Membership management.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import {
  organizationRepository,
  type OrganizationEntity,
} from '../repositories/organization.repository.js';
import {
  membershipRepository,
  type MembershipEntity,
} from '../repositories/membership.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from '../schemas/organization.schema.js';
import type {
  InviteMemberInput,
  UpdateMembershipInput,
  MembershipFilter,
} from '../schemas/membership.schema.js';

/**
 * Pagination options for list queries
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Organization Service class providing business logic for organization operations.
 */
export class OrganizationService {
  // ============================================================================
  // Organization Operations
  // ============================================================================

  /**
   * Get an organization by ID.
   * Users can only access their own organization.
   *
   * @param id - The organization ID
   * @param userOrgId - The user's organization ID (for access control)
   * @returns The organization if found and accessible
   * @throws AppError.forbidden if user doesn't belong to the organization
   * @throws AppError.notFound if organization doesn't exist
   */
  async getOrganizationById(id: string, userOrgId: string): Promise<OrganizationEntity> {
    // Users can only access their own organization
    if (id !== userOrgId) {
      throw AppError.forbidden('You can only access your own organization');
    }

    const organization = await organizationRepository.findById(id);

    if (!organization) {
      throw AppError.notFound(`Organization with ID ${id} not found`);
    }

    return organization;
  }

  /**
   * Get the current user's organization.
   *
   * @param userOrgId - The user's organization ID
   * @returns The organization
   * @throws AppError.notFound if organization doesn't exist
   */
  async getCurrentOrganization(userOrgId: string): Promise<OrganizationEntity> {
    const organization = await organizationRepository.findById(userOrgId);

    if (!organization) {
      throw AppError.notFound('Organization not found');
    }

    return organization;
  }

  /**
   * Create a new organization.
   * Also creates the owner membership for the creating user.
   *
   * @param data - The organization data
   * @param userId - The ID of the user creating the organization
   * @returns The created organization
   * @throws AppError.conflict if slug is already taken
   */
  async createOrganization(
    data: CreateOrganizationInput,
    userId: string
  ): Promise<OrganizationEntity> {
    // Check if slug is already taken
    const slugTaken = await organizationRepository.isSlugTaken(data.slug);
    if (slugTaken) {
      throw AppError.conflict(`Organization slug "${data.slug}" is already taken`);
    }

    // Create the organization
    const organization = await organizationRepository.create({
      name: data.name,
      slug: data.slug,
      plan_type: data.plan_type ?? 'free',
      settings: data.settings ?? {},
    });

    // Create owner membership for the creating user
    await membershipRepository.create(
      {
        user_id: userId,
        role: 'owner',
        status: 'active',
        invited_email: null,
      },
      organization.id
    );

    return organization;
  }

  /**
   * Update an organization.
   * Only owners and admins can update organizations.
   *
   * @param id - The organization ID
   * @param data - The update data
   * @param userOrgId - The user's organization ID
   * @returns The updated organization
   * @throws AppError.forbidden if user doesn't belong to the organization
   * @throws AppError.notFound if organization doesn't exist
   * @throws AppError.conflict if new slug is already taken
   */
  async updateOrganization(
    id: string,
    data: UpdateOrganizationInput,
    userOrgId: string
  ): Promise<OrganizationEntity> {
    // Users can only update their own organization
    if (id !== userOrgId) {
      throw AppError.forbidden('You can only update your own organization');
    }

    // Verify organization exists
    const existing = await organizationRepository.findById(id);
    if (!existing) {
      throw AppError.notFound(`Organization with ID ${id} not found`);
    }

    // Check slug uniqueness if being updated
    if (data.slug && data.slug !== existing.slug) {
      const slugTaken = await organizationRepository.isSlugTaken(data.slug, id);
      if (slugTaken) {
        throw AppError.conflict(`Organization slug "${data.slug}" is already taken`);
      }
    }

    const updated = await organizationRepository.update(id, data);

    if (!updated) {
      throw AppError.notFound(`Organization with ID ${id} not found`);
    }

    return updated;
  }

  /**
   * Delete an organization.
   * Only owners can delete organizations.
   * This will cascade delete all related entities.
   *
   * @param id - The organization ID
   * @param userOrgId - The user's organization ID
   * @returns True if deleted successfully
   * @throws AppError.forbidden if user doesn't belong to the organization
   * @throws AppError.notFound if organization doesn't exist
   */
  async deleteOrganization(id: string, userOrgId: string): Promise<boolean> {
    // Users can only delete their own organization
    if (id !== userOrgId) {
      throw AppError.forbidden('You can only delete your own organization');
    }

    const deleted = await organizationRepository.delete(id);

    if (!deleted) {
      throw AppError.notFound(`Organization with ID ${id} not found`);
    }

    return true;
  }

  // ============================================================================
  // Membership Operations
  // ============================================================================

  /**
   * Get all members of an organization.
   *
   * @param organizationId - The organization ID
   * @param filters - Optional filters (role, status)
   * @param pagination - Optional pagination options
   * @returns Paginated list of memberships
   */
  async getMembers(
    organizationId: string,
    filters?: MembershipFilter,
    pagination?: PaginationOptions
  ): Promise<PaginatedResponse<MembershipEntity>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 0;
    const noPagination = limit === 0;
    const skip = noPagination ? 0 : (page - 1) * limit;

    const members = await membershipRepository.findAllWithFilters(organizationId, filters, noPagination ? {} : {
      skip,
      take: limit,
    });

    const total = await membershipRepository.count(
      organizationId,
      filters as Partial<MembershipEntity>
    );

    // Enrich with profile data (name, email)
    const { prisma } = await import('../config/database.js');
    const userIds = members.map((m) => m.user_id).filter(Boolean);
    const profiles = userIds.length
      ? await prisma.profiles.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, full_name: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const enrichedMembers = members.map((m) => {
      const profile = profileMap.get(m.user_id);
      return {
        ...m,
        email: profile?.username ?? m.invited_email ?? null,
        name: profile?.full_name ?? null,
      };
    });

    return {
      data: enrichedMembers,
      pagination: {
        page,
        limit: noPagination ? total : limit,
        total,
        totalPages: noPagination ? 1 : Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single membership by ID.
   *
   * @param id - The membership ID
   * @param organizationId - The organization ID
   * @returns The membership if found
   * @throws AppError.notFound if membership doesn't exist
   */
  async getMemberById(id: string, organizationId: string): Promise<MembershipEntity> {
    const membership = await membershipRepository.findById(id, organizationId);

    if (!membership) {
      throw AppError.notFound(`Membership with ID ${id} not found`);
    }

    return membership;
  }

  /**
   * Invite a new member to the organization.
   * Creates a pending membership with the invited email.
   *
   * @param data - The invitation data (email, role)
   * @param organizationId - The organization ID
   * @returns The created membership
   * @throws AppError.conflict if email is already invited or member exists
   */
  async inviteMember(data: InviteMemberInput, organizationId: string): Promise<MembershipEntity> {
    // Check if email is already invited
    const existingInvite = await membershipRepository.findByInvitedEmail(
      organizationId,
      data.invited_email
    );

    if (existingInvite) {
      if (existingInvite.status === 'pending') {
        throw AppError.conflict(`An invitation has already been sent to ${data.invited_email}`);
      }
      if (existingInvite.status === 'active') {
        throw AppError.conflict(`${data.invited_email} is already a member of this organization`);
      }
    }

    // Cannot invite as owner - there can only be one owner
    if (data.role === 'owner') {
      throw AppError.validation('Cannot invite a member as owner');
    }

    // Create pending membership
    const membership = await membershipRepository.create(
      {
        user_id: '00000000-0000-0000-0000-000000000000', // Placeholder until user accepts
        role: data.role ?? 'member',
        status: 'pending',
        invited_email: data.invited_email,
      },
      organizationId
    );

    return membership;
  }

  /**
   * Update a membership (role or status).
   *
   * @param id - The membership ID
   * @param data - The update data
   * @param organizationId - The organization ID
   * @param currentUserId - The current user's ID (to prevent self-demotion)
   * @returns The updated membership
   * @throws AppError.notFound if membership doesn't exist
   * @throws AppError.validation if trying to change owner role
   */
  async updateMembership(
    id: string,
    data: UpdateMembershipInput,
    organizationId: string,
    currentUserId: string
  ): Promise<MembershipEntity> {
    const existing = await membershipRepository.findById(id, organizationId);

    if (!existing) {
      throw AppError.notFound(`Membership with ID ${id} not found`);
    }

    // Cannot change owner's role
    if (existing.role === 'owner' && data.role && data.role !== 'owner') {
      throw AppError.validation("Cannot change the owner's role");
    }

    // Cannot promote to owner
    if (data.role === 'owner') {
      throw AppError.validation('Cannot promote a member to owner');
    }

    // Prevent users from demoting themselves
    if (existing.user_id === currentUserId && data.role) {
      const currentMembership = await membershipRepository.findByUserId(
        organizationId,
        currentUserId
      );
      if (currentMembership && this.isRoleDemotion(currentMembership.role, data.role)) {
        throw AppError.validation('You cannot demote yourself');
      }
    }

    const updated = await membershipRepository.update(id, organizationId, data);

    if (!updated) {
      throw AppError.notFound(`Membership with ID ${id} not found`);
    }

    // Enrich with profile data so the frontend receives name/email immediately
    if (updated.user_id) {
      const { prisma } = await import('../config/database.js');
      const profile = await prisma.profiles.findUnique({
        where: { id: updated.user_id },
        select: { username: true, full_name: true },
      });
      if (profile) {
        return {
          ...updated,
          email: profile.username ?? (updated as any).invited_email ?? null,
          name: profile.full_name ?? null,
        };
      }
    }

    return updated;
  }

  /**
   * Remove a member from the organization.
   *
   * @param id - The membership ID
   * @param organizationId - The organization ID
   * @param currentUserId - The current user's ID
   * @returns True if removed successfully
   * @throws AppError.notFound if membership doesn't exist
   * @throws AppError.validation if trying to remove the owner
   */
  async removeMember(id: string, organizationId: string, currentUserId: string): Promise<boolean> {
    const membership = await membershipRepository.findById(id, organizationId);

    if (!membership) {
      throw AppError.notFound(`Membership with ID ${id} not found`);
    }

    // Cannot remove the owner
    if (membership.role === 'owner') {
      throw AppError.validation('Cannot remove the organization owner');
    }

    // Cannot remove yourself (use leave instead)
    if (membership.user_id === currentUserId) {
      throw AppError.validation('You cannot remove yourself. Use leave organization instead.');
    }

    const deleted = await membershipRepository.delete(id, organizationId);

    if (!deleted) {
      throw AppError.notFound(`Membership with ID ${id} not found`);
    }

    return true;
  }

  /**
   * Leave an organization (for non-owners).
   *
   * @param organizationId - The organization ID
   * @param userId - The user's ID
   * @returns True if left successfully
   * @throws AppError.validation if user is the owner
   */
  async leaveOrganization(organizationId: string, userId: string): Promise<boolean> {
    const membership = await membershipRepository.findByUserId(organizationId, userId);

    if (!membership) {
      throw AppError.notFound('You are not a member of this organization');
    }

    // Owner cannot leave - must transfer ownership first
    if (membership.role === 'owner') {
      throw AppError.validation('Organization owner cannot leave. Transfer ownership first.');
    }

    await membershipRepository.delete(membership.id, organizationId);

    return true;
  }

  /**
   * Transfer organization ownership to another member.
   *
   * @param organizationId - The organization ID
   * @param newOwnerId - The membership ID of the new owner
   * @param currentUserId - The current owner's user ID
   * @returns The updated memberships
   * @throws AppError.validation if current user is not the owner
   */
  async transferOwnership(
    organizationId: string,
    newOwnerId: string,
    currentUserId: string
  ): Promise<{ oldOwner: MembershipEntity; newOwner: MembershipEntity }> {
    // Get current owner
    const currentOwner = await membershipRepository.findByUserId(organizationId, currentUserId);

    if (!currentOwner || currentOwner.role !== 'owner') {
      throw AppError.forbidden('Only the owner can transfer ownership');
    }

    // Get new owner membership
    const newOwnerMembership = await membershipRepository.findById(newOwnerId, organizationId);

    if (!newOwnerMembership) {
      throw AppError.notFound('New owner membership not found');
    }

    if (newOwnerMembership.status !== 'active') {
      throw AppError.validation('New owner must be an active member');
    }

    // Update roles
    const updatedOldOwner = await membershipRepository.updateRole(
      currentOwner.id,
      organizationId,
      'admin'
    );

    const updatedNewOwner = await membershipRepository.updateRole(
      newOwnerId,
      organizationId,
      'owner'
    );

    if (!updatedOldOwner || !updatedNewOwner) {
      throw AppError.internal('Failed to transfer ownership');
    }

    return {
      oldOwner: updatedOldOwner,
      newOwner: updatedNewOwner,
    };
  }

  /**
   * Accept an invitation (activate pending membership).
   *
   * @param inviteId - The membership ID (invitation)
   * @param userId - The user accepting the invitation
   * @param email - The user's email (must match invited_email)
   * @returns The activated membership
   */
  async acceptInvitation(
    inviteId: string,
    userId: string,
    email: string
  ): Promise<MembershipEntity> {
    // Find the invitation - we need to search across all orgs
    // This is a special case where we don't filter by org
    const invitation = await this.findInvitationByIdAndEmail(inviteId, email);

    if (!invitation) {
      throw AppError.notFound('Invitation not found or email does not match');
    }

    if (invitation.status !== 'pending') {
      throw AppError.validation('This invitation has already been processed');
    }

    // Activate the membership
    const activated = await membershipRepository.activate(
      inviteId,
      invitation.organization_id,
      userId
    );

    if (!activated) {
      throw AppError.internal('Failed to accept invitation');
    }

    return activated;
  }

  /**
   * Cancel a pending invitation.
   *
   * @param id - The membership ID
   * @param organizationId - The organization ID
   * @returns True if cancelled successfully
   */
  async cancelInvitation(id: string, organizationId: string): Promise<boolean> {
    const membership = await membershipRepository.findById(id, organizationId);

    if (!membership) {
      throw AppError.notFound(`Invitation with ID ${id} not found`);
    }

    if (membership.status !== 'pending') {
      throw AppError.validation('Can only cancel pending invitations');
    }

    return membershipRepository.delete(id, organizationId);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if a role change is a demotion.
   */
  private isRoleDemotion(
    currentRole: MembershipEntity['role'],
    newRole: MembershipEntity['role']
  ): boolean {
    const roleHierarchy: Record<MembershipEntity['role'], number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    };

    return roleHierarchy[newRole] < roleHierarchy[currentRole];
  }

  /**
   * Find an invitation by ID and email.
   * This is a special method that doesn't filter by organization.
   */
  private async findInvitationByIdAndEmail(
    id: string,
    email: string
  ): Promise<MembershipEntity | null> {
    // We need direct Prisma access for this cross-org query
    const { prisma } = await import('../config/database.js');

    return prisma.memberships.findFirst({
      where: {
        id,
        invited_email: email,
        status: 'pending',
      },
    }) as Promise<MembershipEntity | null>;
  }
}

// Export singleton instance
export const organizationService = new OrganizationService();
