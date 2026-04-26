/**
 * REST Business Scope Service
 * 
 * Implements the business scope service interface using the REST API backend.
 * Replaces Supabase direct access with HTTP calls to backend.
 */

import { restClient } from './restClient';
import { ServiceError } from '@/utils/errorHandling';

/**
 * API response type for business scopes (snake_case from backend)
 */
interface ApiBusinessScope {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  visibility: string;
  created_at: string;
  updated_at: string;
  scope_type?: string;
  avatar?: string | null;
  role?: string | null;
  system_prompt?: string | null;
  settings?: Record<string, unknown> | null;
}

/**
 * API response type for suggested tool (snake_case from backend)
 */
interface ApiSuggestedTool {
  name: string;
  display_name: string;
  description: string;
  skill_md: string;
}

/**
 * API response type for suggested agents (snake_case from backend)
 */
interface ApiSuggestedAgent {
  name: string;
  display_name: string;
  role: string;
  description: string;
  responsibilities: string[];
  capabilities: string[];
  system_prompt: string;
  suggested_tools: ApiSuggestedTool[];
}

/**
 * Application-level BusinessScope type
 */
export interface BusinessScope {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  visibility: 'open' | 'restricted';
  createdAt: Date;
  updatedAt: Date;
  scopeType?: string;
  avatar?: string | null;
  role?: string | null;
  systemPrompt?: string | null;
}

/**
 * Application-level SuggestedTool type
 */
export interface SuggestedTool {
  name: string;
  displayName: string;
  description: string;
  skillMd: string;
}

/**
 * Application-level SuggestedAgent type (proposal, not persisted)
 */
export interface SuggestedAgent {
  name: string;
  displayName: string;
  role: string;
  description: string;
  responsibilities: string[];
  capabilities: string[];
  systemPrompt: string;
  suggestedTools: SuggestedTool[];
}

/**
 * Input type for creating a new business scope
 */
export interface CreateBusinessScopeInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

/**
 * Input type for updating a business scope
 */
export interface UpdateBusinessScopeInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

/**
 * Maps API business scope response to application BusinessScope type
 */
function mapApiBusinessScopeToBusinessScope(apiScope: ApiBusinessScope): BusinessScope {
  return {
    id: apiScope.id,
    organizationId: apiScope.organization_id,
    name: apiScope.name,
    description: apiScope.description,
    icon: apiScope.icon,
    color: apiScope.color,
    isDefault: apiScope.is_default,
    visibility: (apiScope.visibility as 'open' | 'restricted') || 'open',
    createdAt: new Date(apiScope.created_at),
    updatedAt: new Date(apiScope.updated_at),
    scopeType: apiScope.scope_type,
    avatar: apiScope.avatar,
    role: apiScope.role,
    systemPrompt: apiScope.system_prompt,
    settings: apiScope.settings,
  };
}

/**
 * Maps API suggested agent to application SuggestedAgent type
 */
function mapApiSuggestedAgentToSuggestedAgent(apiAgent: ApiSuggestedAgent): SuggestedAgent {
  return {
    name: apiAgent.name,
    displayName: apiAgent.display_name,
    role: apiAgent.role,
    description: apiAgent.description,
    responsibilities: apiAgent.responsibilities || [],
    capabilities: apiAgent.capabilities || [],
    systemPrompt: apiAgent.system_prompt,
    suggestedTools: (apiAgent.suggested_tools || []).map(tool => ({
      name: tool.name,
      displayName: tool.display_name,
      description: tool.description,
      skillMd: tool.skill_md,
    })),
  };
}

/**
 * Maps CreateBusinessScopeInput to API request format
 */
function mapCreateInputToApiRequest(input: CreateBusinessScopeInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    is_default: input.isDefault ?? false,
  };
}

/**
 * Maps UpdateBusinessScopeInput to API request format
 */
function mapUpdateInputToApiRequest(input: UpdateBusinessScopeInput): Record<string, unknown> {
  const request: Record<string, unknown> = {};
  
  if (input.name !== undefined) request.name = input.name;
  if (input.description !== undefined) request.description = input.description;
  if (input.icon !== undefined) request.icon = input.icon;
  if (input.color !== undefined) request.color = input.color;
  if (input.isDefault !== undefined) request.is_default = input.isDefault;
  
  return request;
}

/**
 * REST implementation of the Business Scope Service
 */
export const RestBusinessScopeService = {
  /**
   * Retrieves all business scopes from the API
   */
  async getBusinessScopes(): Promise<BusinessScope[]> {
    try {
      const response = await restClient.get<{
        data: ApiBusinessScope[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>('/api/business-scopes?limit=100');
      return response.data.map(mapApiBusinessScopeToBusinessScope);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to fetch business scopes', 'UNKNOWN');
    }
  },

  /**
   * Retrieves a single business scope by ID
   */
  async getBusinessScopeById(id: string): Promise<BusinessScope> {
    try {
      const response = await restClient.get<ApiBusinessScope>(`/api/business-scopes/${id}`);
      return mapApiBusinessScopeToBusinessScope(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to fetch business scope with id "${id}"`, 'UNKNOWN');
    }
  },

  /**
   * Creates a new business scope
   */
  async createBusinessScope(input: CreateBusinessScopeInput): Promise<BusinessScope> {
    try {
      if (!input.name || input.name.trim() === '') {
        throw new ServiceError('Business scope name cannot be empty', 'VALIDATION_ERROR');
      }

      const requestData = mapCreateInputToApiRequest({
        ...input,
        name: input.name.trim(),
      });

      const response = await restClient.post<ApiBusinessScope>('/api/business-scopes', requestData);
      return mapApiBusinessScopeToBusinessScope(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to create business scope', 'UNKNOWN');
    }
  },

  /**
   * Updates an existing business scope
   */
  async updateBusinessScope(id: string, input: UpdateBusinessScopeInput): Promise<BusinessScope> {
    try {
      if (input.name !== undefined && input.name.trim() === '') {
        throw new ServiceError('Business scope name cannot be empty', 'VALIDATION_ERROR');
      }

      const requestData = mapUpdateInputToApiRequest({
        ...input,
        name: input.name?.trim(),
      });

      const response = await restClient.put<ApiBusinessScope>(`/api/business-scopes/${id}`, requestData);
      return mapApiBusinessScopeToBusinessScope(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to update business scope with id "${id}"`, 'UNKNOWN');
    }
  },

  /**
   * Deletes a business scope
   */
  async deleteBusinessScope(id: string): Promise<void> {
    try {
      await restClient.delete(`/api/business-scopes/${id}`);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to delete business scope with id "${id}"`, 'UNKNOWN');
    }
  },

  /**
   * Retrieves default business scopes
   */
  async getDefaultBusinessScopes(): Promise<BusinessScope[]> {
    try {
      const response = await restClient.get<{
        data: ApiBusinessScope[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>('/api/business-scopes?is_default=true');
      return response.data.map(mapApiBusinessScopeToBusinessScope);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to fetch default business scopes', 'UNKNOWN');
    }
  },

  /**
   * Generates AI roles for a business scope
   */
  async generateRoles(businessScopeId: string, description: string): Promise<unknown[]> {
    try {
      const response = await restClient.post<{ roles: unknown[] }>(
        '/api/business-scopes/generate',
        { business_scope_id: businessScopeId, description }
      );
      return response.roles;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to generate roles', 'UNKNOWN');
    }
  },

  /**
   * Suggests agent roles using AI (no persistence, just proposals)
   * This is used by the business scope creator modal to show suggested agents
   */
  async suggestAgents(input: {
    businessScopeName: string;
    businessScopeDescription?: string;
    documentContents?: string[];
    agentCount?: number;
  }): Promise<SuggestedAgent[]> {
    try {
      const response = await restClient.post<{ suggested_agents: ApiSuggestedAgent[] }>(
        '/api/business-scopes/suggest-agents',
        {
          business_scope_name: input.businessScopeName,
          business_scope_description: input.businessScopeDescription,
          document_contents: input.documentContents,
          agent_count: input.agentCount || 5,
        }
      );
      return response.suggested_agents.map(mapApiSuggestedAgentToSuggestedAgent);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to suggest agents', 'UNKNOWN');
    }
  },

  /**
   * Subscribes to real-time business scope changes (no-op for REST)
   */
  subscribeToChanges(callback: (payload: { eventType: string; new?: BusinessScope; old?: BusinessScope }) => void) {
    console.warn('REST API does not support real-time subscriptions. Consider using polling.');
    return () => {};
  },
};

export default RestBusinessScopeService;
