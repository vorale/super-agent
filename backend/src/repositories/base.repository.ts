import { prisma, type PrismaClient } from '../config/database.js';

/**
 * Type representing models that have organization_id for multi-tenancy.
 * These are all tenant-specific tables that require organization filtering.
 */
export type TenantModel =
  | 'agents'
  | 'tasks'
  | 'workflows'
  | 'documents'
  | 'mcp_servers'
  | 'chat_sessions'
  | 'chat_messages'
  | 'business_scopes'
  | 'memberships'
  | 'support_conversations'
  | 'customer_profiles'
  | 'faq_articles';

/**
 * Base interface for entities with organization_id (multi-tenant entities).
 */
export interface TenantEntity {
  id: string;
  organization_id: string;
  created_at: Date;
  updated_at?: Date;
}

/**
 * Options for findAll queries.
 */
export interface FindAllOptions<T> {
  where?: Partial<T>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  skip?: number;
  take?: number;
  include?: Record<string, boolean | object>;
}

/**
 * Options for findById queries.
 */
export interface FindByIdOptions {
  include?: Record<string, boolean | object>;
}

/**
 * Result type for paginated queries.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}

/**
 * Base repository class with multi-tenancy filtering.
 * All queries automatically filter by organization_id to ensure tenant isolation.
 *
 * @template T - The entity type this repository manages
 *
 * Requirements: 3.4 - WHEN querying data, THE Backend_Service SHALL always filter
 * by org_id to ensure tenant isolation
 */
export abstract class BaseRepository<T extends TenantEntity> {
  protected prisma: PrismaClient;
  protected modelName: TenantModel;

  constructor(modelName: TenantModel) {
    this.prisma = prisma;
    this.modelName = modelName;
  }

  /**
   * Get the Prisma model delegate for this repository.
   * Uses type assertion since Prisma's dynamic model access isn't fully typed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getModel(): any {
    return (this.prisma as unknown as Record<string, unknown>)[this.modelName];
  }

  /**
   * Find all entities belonging to an organization.
   * Always filters by organization_id to ensure multi-tenancy isolation.
   *
   * @param organizationId - The organization ID to filter by
   * @param options - Optional query options (where, orderBy, pagination, include)
   * @returns Array of entities belonging to the organization
   */
  async findAll(organizationId: string, options?: FindAllOptions<T>): Promise<T[]> {
    const { where, orderBy, skip, take, include } = options ?? {};

    return this.getModel().findMany({
      where: {
        organization_id: organizationId,
        ...where,
      },
      orderBy: orderBy ?? { created_at: 'desc' },
      skip,
      take,
      include,
    });
  }

  /**
   * Find all entities with pagination and total count.
   * Always filters by organization_id to ensure multi-tenancy isolation.
   *
   * @param organizationId - The organization ID to filter by
   * @param options - Optional query options (where, orderBy, pagination, include)
   * @returns Paginated result with data and total count
   */
  async findAllPaginated(
    organizationId: string,
    options?: FindAllOptions<T>
  ): Promise<PaginatedResult<T>> {
    const { where, orderBy, skip = 0, take = 20, include } = options ?? {};

    const whereClause = {
      organization_id: organizationId,
      ...where,
    };

    const [data, total] = await Promise.all([
      this.getModel().findMany({
        where: whereClause,
        orderBy: orderBy ?? { created_at: 'desc' },
        skip,
        take,
        include,
      }),
      this.getModel().count({ where: whereClause }),
    ]);

    return { data, total, skip, take };
  }

  /**
   * Find a single entity by ID within an organization.
   * Returns null if not found or if the entity belongs to a different organization.
   *
   * @param id - The entity ID
   * @param organizationId - The organization ID to filter by
   * @param options - Optional query options (include)
   * @returns The entity if found and belongs to the organization, null otherwise
   */
  async findById(id: string, organizationId: string, options?: FindByIdOptions): Promise<T | null> {
    return this.getModel().findFirst({
      where: {
        id,
        organization_id: organizationId,
      },
      include: options?.include,
    });
  }

  /**
   * Create a new entity within an organization.
   * Automatically sets the organization_id on the created entity.
   *
   * @param data - The entity data (without id and organization_id)
   * @param organizationId - The organization ID to associate with the entity
   * @returns The created entity
   */
  async create(
    data: Omit<T, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
    organizationId: string
  ): Promise<T> {
    return this.getModel().create({
      data: {
        ...data,
        organization_id: organizationId,
      },
    });
  }

  /**
   * Update an entity by ID within an organization.
   * Only updates if the entity belongs to the specified organization.
   *
   * @param id - The entity ID
   * @param organizationId - The organization ID to filter by
   * @param data - The data to update
   * @returns The updated entity, or null if not found
   */
  async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<T, 'id' | 'organization_id' | 'created_at'>>
  ): Promise<T | null> {
    // First verify the entity exists and belongs to the organization
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      return null;
    }

    return this.getModel().update({
      where: { id },
      data,
    });
  }

  /**
   * Delete an entity by ID within an organization.
   * Only deletes if the entity belongs to the specified organization.
   *
   * @param id - The entity ID
   * @param organizationId - The organization ID to filter by
   * @returns True if deleted, false if not found
   */
  async delete(id: string, organizationId: string): Promise<boolean> {
    // First verify the entity exists and belongs to the organization
    const existing = await this.findById(id, organizationId);
    if (!existing) {
      return false;
    }

    await this.getModel().delete({
      where: { id },
    });

    return true;
  }

  /**
   * Check if an entity exists within an organization.
   *
   * @param id - The entity ID
   * @param organizationId - The organization ID to filter by
   * @returns True if the entity exists and belongs to the organization
   */
  async exists(id: string, organizationId: string): Promise<boolean> {
    const count = await this.getModel().count({
      where: {
        id,
        organization_id: organizationId,
      },
    });
    return count > 0;
  }

  /**
   * Count entities within an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @param where - Optional additional filter conditions
   * @returns The count of matching entities
   */
  async count(organizationId: string, where?: Partial<T>): Promise<number> {
    return this.getModel().count({
      where: {
        organization_id: organizationId,
        ...where,
      },
    });
  }

  /**
   * Find the first entity matching the criteria within an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @param where - Filter conditions
   * @param options - Optional query options (include)
   * @returns The first matching entity, or null if not found
   */
  async findFirst(
    organizationId: string,
    where: Partial<T>,
    options?: FindByIdOptions
  ): Promise<T | null> {
    return this.getModel().findFirst({
      where: {
        organization_id: organizationId,
        ...where,
      },
      include: options?.include,
    });
  }
}
