/**
 * Business Scope Repository
 * Data access layer for Business Scope entities with multi-tenancy support.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { BaseRepository, type FindAllOptions } from './base.repository.js';
import type { BusinessScopeFilter } from '../schemas/businessScope.schema.js';

/**
 * Business Scope entity type matching the Prisma schema
 */
export interface BusinessScopeEntity {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  visibility: string;
  config_version: number;
  scope_type: string;
  avatar: string | null;
  role: string | null;
  system_prompt: string | null;
  settings: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Business Scope Repository class extending BaseRepository with business scope-specific methods.
 * Provides multi-tenancy filtering for all operations.
 */
export class BusinessScopeRepository extends BaseRepository<BusinessScopeEntity> {
  constructor() {
    super('business_scopes');
  }

  /**
   * Override findAll to exclude soft-deleted scopes.
   */
  async findAll(
    organizationId: string,
    options?: Omit<FindAllOptions<BusinessScopeEntity>, 'where'> & { where?: Partial<BusinessScopeEntity> }
  ): Promise<BusinessScopeEntity[]> {
    const { where, ...rest } = options ?? {};
    return super.findAll(organizationId, {
      ...rest,
      where: { ...where, deleted_at: null } as Partial<BusinessScopeEntity>,
    });
  }

  /**
   * Override findById to exclude soft-deleted scopes.
   */
  async findById(id: string, organizationId: string, options?: { include?: Record<string, boolean | object> }): Promise<BusinessScopeEntity | null> {
    const result = await super.findById(id, organizationId, options);
    if (result && result.deleted_at !== null) return null;
    return result;
  }

  /**
   * Override count to exclude soft-deleted scopes.
   */
  async count(organizationId: string, where?: Partial<BusinessScopeEntity>): Promise<number> {
    return super.count(organizationId, { ...where, deleted_at: null } as Partial<BusinessScopeEntity>);
  }

  /**
   * Soft-delete a business scope by setting deleted_at.
   */
  async softDelete(id: string, organizationId: string): Promise<boolean> {
    const existing = await super.findById(id, organizationId);
    if (!existing || existing.deleted_at !== null) return false;

    await this.getModel().update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return true;
  }

  /**
   * Override findFirst to exclude soft-deleted scopes.
   */
  async findFirst(
    organizationId: string,
    where: Partial<BusinessScopeEntity>,
    options?: { include?: Record<string, boolean | object> }
  ): Promise<BusinessScopeEntity | null> {
    return super.findFirst(organizationId, { ...where, deleted_at: null } as Partial<BusinessScopeEntity>, options);
  }

  /**
   * Find all business scopes with optional filters.
   * Supports filtering by name and is_default.
   *
   * @param organizationId - The organization ID to filter by
   * @param filters - Optional filters (name, is_default)
   * @param options - Optional query options (pagination, ordering)
   * @returns Array of business scopes matching the criteria
   */
  async findAllWithFilters(
    organizationId: string,
    filters?: BusinessScopeFilter,
    options?: Omit<FindAllOptions<BusinessScopeEntity>, 'where'>
  ): Promise<BusinessScopeEntity[]> {
    const where: Partial<BusinessScopeEntity> = {};

    if (filters?.is_default !== undefined) {
      where.is_default = filters.is_default;
    }

    // Name filtering will be handled with contains search if needed
    if (filters?.name) {
      where.name = filters.name;
    }

    return this.findAll(organizationId, {
      ...options,
      where,
    });
  }

  /**
   * Find business scope by name within an organization.
   * Used for checking uniqueness constraint (organization_id, name).
   *
   * @param organizationId - The organization ID to filter by
   * @param name - The business scope name to search for
   * @returns The business scope if found, null otherwise
   */
  async findByName(organizationId: string, name: string): Promise<BusinessScopeEntity | null> {
    return this.findFirst(organizationId, { name });
  }

  /**
   * Find the default business scope for an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @returns The default business scope if found, null otherwise
   */
  async findDefault(organizationId: string): Promise<BusinessScopeEntity | null> {
    return this.findFirst(organizationId, { is_default: true });
  }

  /**
   * Get business scope with associated agents included.
   *
   * @param id - The business scope ID
   * @param organizationId - The organization ID to filter by
   * @returns The business scope with agents, or null if not found
   */
  async findByIdWithAgents(
    id: string,
    organizationId: string
  ): Promise<(BusinessScopeEntity & { agents?: unknown[] }) | null> {
    return this.findById(id, organizationId, {
      include: { agents: true },
    });
  }

  /**
   * Clear the default flag from all business scopes in an organization.
   * Used when setting a new default business scope.
   *
   * @param organizationId - The organization ID
   */
  async clearDefaultFlag(organizationId: string): Promise<void> {
    await this.getModel().updateMany({
      where: {
        organization_id: organizationId,
        is_default: true,
      },
      data: {
        is_default: false,
      },
    });
  }

  /**
   * Set a business scope as the default for an organization.
   * Clears the default flag from other business scopes first.
   *
   * @param id - The business scope ID to set as default
   * @param organizationId - The organization ID
   * @returns The updated business scope, or null if not found
   */
  async setAsDefault(id: string, organizationId: string): Promise<BusinessScopeEntity | null> {
    // First clear any existing default
    await this.clearDefaultFlag(organizationId);

    // Then set the new default
    return this.update(id, organizationId, { is_default: true });
  }
}

// Export singleton instance
export const businessScopeRepository = new BusinessScopeRepository();
