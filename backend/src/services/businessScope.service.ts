/**
 * Business Scope Service
 * Business logic layer for Business Scope management.
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { Prisma } from '@prisma/client';
import {
  businessScopeRepository,
  type BusinessScopeEntity,
} from '../repositories/businessScope.repository.js';
import { agentRepository, type AgentEntity } from '../repositories/agent.repository.js';
import { skillRepository, type SkillEntity } from '../repositories/skill.repository.js';
import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type {
  CreateBusinessScopeInput,
  UpdateBusinessScopeInput,
  BusinessScopeFilter,
  GenerateAgentRolesInput,
} from '../schemas/businessScope.schema.js';

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
 * Generated agent role from AI analysis
 */
export interface GeneratedAgentRole {
  name: string;
  display_name: string;
  role: string;
  system_prompt: string;
  suggested_tools: string[];
}

/**
 * Agent with skills for AgentCore runtime
 */
export interface AgentWithSkills extends AgentEntity {
  skill_ids: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string | null;
    hash_id: string;
    s3_bucket: string;
    s3_prefix: string;
    version: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Skill for AgentCore runtime loading
 */
export interface SkillForRuntime {
  id: string;
  name: string;
  hash_id: string;
  s3_bucket: string;
  s3_prefix: string;
  version: string;
}

/**
 * Business Scope Service class providing business logic for business scope operations.
 */
export class BusinessScopeService {
  /**
   * Get all business scopes for an organization with optional filters.
   * Requirements: 11.1
   *
   * @param organizationId - The organization ID
   * @param filters - Optional filters (name, is_default)
   * @param pagination - Optional pagination options
   * @returns Paginated list of business scopes
   */
  async getBusinessScopes(
    organizationId: string,
    filters?: BusinessScopeFilter,
    pagination?: PaginationOptions
  ): Promise<PaginatedResponse<BusinessScopeEntity>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const skip = (page - 1) * limit;

    const businessScopes = await businessScopeRepository.findAllWithFilters(
      organizationId,
      filters,
      { skip, take: limit }
    );

    // Get total count for pagination
    const total = await businessScopeRepository.count(
      organizationId,
      filters as Partial<BusinessScopeEntity>
    );

    return {
      data: businessScopes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single business scope by ID with associated agents.
   * Requirements: 11.2
   *
   * @param id - The business scope ID
   * @param organizationId - The organization ID
   * @returns The business scope with agents if found
   * @throws AppError.notFound if business scope doesn't exist
   */
  async getBusinessScopeById(
    id: string,
    organizationId: string
  ): Promise<BusinessScopeEntity & { agents?: unknown[] }> {
    const businessScope = await businessScopeRepository.findByIdWithAgents(id, organizationId);

    if (!businessScope) {
      throw AppError.notFound(`Business scope with ID ${id} not found`);
    }

    return businessScope;
  }

  /**
   * Create a new business scope.
   * Requirements: 11.3
   * Handles unique constraint (organization_id, name).
   *
   * @param data - The business scope data
   * @param organizationId - The organization ID
   * @returns The created business scope
   * @throws AppError.conflict if name already exists in organization
   */
  async createBusinessScope(
    data: CreateBusinessScopeInput,
    organizationId: string
  ): Promise<BusinessScopeEntity> {
    // Check for duplicate name within organization (unique constraint)
    const existingScope = await businessScopeRepository.findByName(organizationId, data.name);
    if (existingScope) {
      throw AppError.conflict(
        `Business scope with name "${data.name}" already exists in this organization`
      );
    }

    // If this is being set as default, clear other defaults first
    if (data.is_default) {
      await businessScopeRepository.clearDefaultFlag(organizationId);
    }

    try {
      // Create the business scope
      const businessScope = await businessScopeRepository.create(
        {
          name: data.name.trim(),
          description: data.description ?? null,
          icon: data.icon ?? null,
          color: data.color ?? null,
          is_default: data.is_default ?? false,
          scope_type: data.scope_type ?? 'business',
          avatar: data.avatar ?? null,
          role: data.role ?? null,
          system_prompt: data.system_prompt ?? null,
        },
        organizationId
      );

      return businessScope;
    } catch (error) {
      // Handle Prisma unique constraint violation (race condition fallback)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict(
          `Business scope with name "${data.name}" already exists in this organization`
        );
      }
      throw error;
    }
  }

  /**
   * Update an existing business scope.
   * Requirements: 11.4
   * Handles unique constraint (organization_id, name).
   *
   * @param id - The business scope ID
   * @param data - The update data
   * @param organizationId - The organization ID
   * @returns The updated business scope
   * @throws AppError.notFound if business scope doesn't exist
   * @throws AppError.conflict if name already exists in organization
   */
  async updateBusinessScope(
    id: string,
    data: UpdateBusinessScopeInput,
    organizationId: string
  ): Promise<BusinessScopeEntity> {
    // Verify business scope exists
    const existingScope = await businessScopeRepository.findById(id, organizationId);
    if (!existingScope) {
      throw AppError.notFound(`Business scope with ID ${id} not found`);
    }

    // Check for duplicate name if name is being updated (unique constraint)
    if (data.name !== undefined && data.name !== existingScope.name) {
      const scopeWithName = await businessScopeRepository.findByName(organizationId, data.name);
      if (scopeWithName && scopeWithName.id !== id) {
        throw AppError.conflict(
          `Business scope with name "${data.name}" already exists in this organization`
        );
      }
    }

    // If this is being set as default, clear other defaults first
    if (data.is_default === true && !existingScope.is_default) {
      await businessScopeRepository.clearDefaultFlag(organizationId);
    }

    // Build update object with only provided fields
    const updateData: Partial<BusinessScopeEntity> = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.is_default !== undefined) updateData.is_default = data.is_default;
    if (data.scope_type !== undefined) updateData.scope_type = data.scope_type;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.system_prompt !== undefined) updateData.system_prompt = data.system_prompt;
    if (data.settings !== undefined) updateData.settings = data.settings;

    try {
      const updatedScope = await businessScopeRepository.update(id, organizationId, updateData);

      if (!updatedScope) {
        throw AppError.notFound(`Business scope with ID ${id} not found`);
      }

      // Bump config version so session workspaces refresh on next turn
      await this.bumpConfigVersion(id, organizationId).catch((err) => {
        console.error(`Failed to bump config_version for scope ${id}:`, err);
      });

      return updatedScope;
    } catch (error) {
      // Handle Prisma unique constraint violation (race condition fallback)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict(
          `Business scope with name "${data.name}" already exists in this organization`
        );
      }
      throw error;
    }
  }

  /**
   * Delete a business scope (soft-delete).
   * Requirements: 11.5
   *
   * @param id - The business scope ID
   * @param organizationId - The organization ID
   * @returns True if deleted successfully
   * @throws AppError.notFound if business scope doesn't exist
   */
  async deleteBusinessScope(id: string, organizationId: string): Promise<boolean> {
    const deleted = await businessScopeRepository.softDelete(id, organizationId);

    if (!deleted) {
      throw AppError.notFound(`Business scope with ID ${id} not found`);
    }

    return true;
  }

  /**
   * Generate agent roles using AI based on provided documents.
   * Requirements: 11.6
   *
   * This is a placeholder implementation that would integrate with an AI service
   * to analyze documents and suggest agent roles for the business scope.
   *
   * @param data - The generation input (document_ids, optional business_scope_id)
   * @param organizationId - The organization ID
   * @returns Array of generated agent role suggestions
   */
  async generateAgentRoles(
    data: GenerateAgentRolesInput,
    organizationId: string
  ): Promise<GeneratedAgentRole[]> {
    // Verify business scope exists if provided
    if (data.business_scope_id) {
      const businessScope = await businessScopeRepository.findById(
        data.business_scope_id,
        organizationId
      );
      if (!businessScope) {
        throw AppError.notFound(`Business scope with ID ${data.business_scope_id} not found`);
      }
    }

    // TODO: Integrate with AI service to analyze documents and generate roles
    // For now, return a placeholder response indicating the feature is available
    // but requires AI service integration

    // This would typically:
    // 1. Fetch the documents by their IDs
    // 2. Extract text content from the documents
    // 3. Send to an AI service (e.g., Claude, GPT) for analysis
    // 4. Parse the AI response into structured agent role suggestions

    return [
      {
        name: 'document-analyst',
        display_name: 'Document Analyst',
        role: 'Analyzes and extracts insights from documents',
        system_prompt:
          'You are a document analyst agent. Your role is to analyze documents and extract key insights, summaries, and actionable information.',
        suggested_tools: ['document_reader', 'text_extractor', 'summarizer'],
      },
    ];
  }

  /**
   * Get the default business scope for an organization.
   *
   * @param organizationId - The organization ID
   * @returns The default business scope if found, null otherwise
   */
  async getDefaultBusinessScope(organizationId: string): Promise<BusinessScopeEntity | null> {
    return businessScopeRepository.findDefault(organizationId);
  }

  /**
   * Set a business scope as the default for an organization.
   *
   * @param id - The business scope ID to set as default
   * @param organizationId - The organization ID
   * @returns The updated business scope
   * @throws AppError.notFound if business scope doesn't exist
   */
  async setAsDefault(id: string, organizationId: string): Promise<BusinessScopeEntity> {
    const updatedScope = await businessScopeRepository.setAsDefault(id, organizationId);

    if (!updatedScope) {
      throw AppError.notFound(`Business scope with ID ${id} not found`);
    }

    return updatedScope;
  }

  // ============================================================================
  // Config Version Management
  // ============================================================================

  /**
   * Bump the config_version for a business scope.
   * Called whenever scope definitions change (agents, skills, scope settings).
   */
  async bumpConfigVersion(scopeId: string, organizationId: string): Promise<number> {
    const updated = await prisma.business_scopes.update({
      where: { id: scopeId, organization_id: organizationId },
      data: { config_version: { increment: 1 } },
      select: { config_version: true },
    });
    return updated.config_version;
  }

  // ============================================================================
  // AgentCore Runtime Methods
  // ============================================================================

  /**
   * Get all agents in a business scope with their assigned skills.
   * Used by AgentCore runtime to build subagent definitions.
   *
   * @param businessScopeId - The business scope ID
   * @param organizationId - The organization ID
   * @returns Array of agents with their skills
   */
  async getScopeAgentsWithSkills(
    businessScopeId: string,
    organizationId: string
  ): Promise<AgentWithSkills[]> {
    // Verify business scope exists
    const scope = await businessScopeRepository.findById(businessScopeId, organizationId);
    if (!scope) {
      throw AppError.notFound(`Business scope with ID ${businessScopeId} not found`);
    }

    // Get all agents in the scope
    const agents = await agentRepository.findByBusinessScope(organizationId, businessScopeId);

    // Get skills for each agent, preferring scope-owned forks
    const agentsWithSkills: AgentWithSkills[] = [];
    
    for (const agent of agents) {
      const skills = await skillRepository.findByAgentIdWithScopeForks(organizationId, agent.id, businessScopeId);
      
      agentsWithSkills.push({
        ...agent,
        skill_ids: skills.map(s => s.id),
        skills: skills.map(s => ({
          id: s.id,
          name: s.parent_skill_id ? s.name.replace(/@scope-[a-f0-9]+$/, '') : s.name,
          description: s.description,
          hash_id: s.hash_id,
          s3_bucket: s.s3_bucket,
          s3_prefix: s.s3_prefix,
          version: s.version,
          metadata: s.metadata as Record<string, unknown> | undefined,
        })),
      });
    }

    return agentsWithSkills;
  }

  /**
   * Get all unique skills for a business scope.
   * Used by AgentCore runtime to download skills from S3.
   *
   * @param businessScopeId - The business scope ID
   * @param organizationId - The organization ID
   * @returns Array of unique skills with S3 metadata
   */
  async getScopeSkills(
    businessScopeId: string,
    organizationId: string
  ): Promise<SkillForRuntime[]> {
    // Verify business scope exists
    const scope = await businessScopeRepository.findById(businessScopeId, organizationId);
    if (!scope) {
      throw AppError.notFound(`Business scope with ID ${businessScopeId} not found`);
    }

    const skills = await skillRepository.findByBusinessScope(organizationId, businessScopeId);
    
    return skills.map(s => ({
      id: s.id,
      name: s.name,
      hash_id: s.hash_id,
      s3_bucket: s.s3_bucket,
      s3_prefix: s.s3_prefix,
      version: s.version,
    }));
  }
}

// Export singleton instance
export const businessScopeService = new BusinessScopeService();
