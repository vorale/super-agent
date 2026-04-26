/**
 * REST Agent Service
 * 
 * Implements the agent service interface using the REST API backend.
 * Replaces Supabase direct access with HTTP calls to backend.
 */

import { restClient } from './restClient';
import type { Agent, AgentMetrics, ModelConfig, Tool, Department } from '@/types';
import { ServiceError } from '@/utils/errorHandling';

/**
 * API response type for agents (snake_case from backend)
 */
interface ApiAgent {
  id: string;
  organization_id: string;
  business_scope_id: string | null;
  name: string;
  display_name: string;
  role: string | null;
  avatar: string | null;
  status: string;
  metrics: Record<string, unknown>;
  tools: unknown[];
  scope: unknown[];
  system_prompt: string | null;
  model_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Maps API agent response to application Agent type
 */
function mapApiAgentToAgent(apiAgent: ApiAgent): Agent {
  return {
    id: apiAgent.id,
    name: apiAgent.name,
    displayName: apiAgent.display_name,
    role: apiAgent.role || '',
    department: mapBusinessScopeToDepartment(apiAgent.business_scope_id),
    avatar: apiAgent.avatar || apiAgent.display_name.charAt(0).toUpperCase(),
    status: apiAgent.status as Agent['status'],
    metrics: parseMetrics(apiAgent.metrics),
    tools: parseTools(apiAgent.tools),
    scope: parseScope(apiAgent.scope),
    systemPrompt: apiAgent.system_prompt || '',
    modelConfig: parseModelConfig(apiAgent.model_config),
    businessScopeId: apiAgent.business_scope_id || undefined,
  };
}

/**
 * Maps application Agent to API request format
 */
function mapAgentToApiRequest(agent: Partial<Agent>): Record<string, unknown> {
  const request: Record<string, unknown> = {};
  
  if (agent.name !== undefined) request.name = agent.name;
  if (agent.displayName !== undefined) request.display_name = agent.displayName;
  if (agent.role !== undefined) request.role = agent.role;
  if (agent.avatar !== undefined) request.avatar = agent.avatar;
  if (agent.status !== undefined) request.status = agent.status;
  if (agent.metrics !== undefined) request.metrics = agent.metrics;
  if (agent.tools !== undefined) request.tools = agent.tools;
  if (agent.scope !== undefined) request.scope = agent.scope;
  if (agent.systemPrompt !== undefined) request.system_prompt = agent.systemPrompt;
  if (agent.modelConfig !== undefined) request.model_config = agent.modelConfig;
  if ('businessScopeId' in agent) request.business_scope_id = agent.businessScopeId || null;
  
  return request;
}

function mapBusinessScopeToDepartment(businessScopeId: string | null): Department {
  return (businessScopeId || '__independent__') as Department;
}

function parseMetrics(metrics: unknown): AgentMetrics {
  if (typeof metrics === 'object' && metrics !== null) {
    const m = metrics as Record<string, unknown>;
    return {
      taskCount: typeof m.taskCount === 'number' ? m.taskCount : 0,
      responseRate: typeof m.responseRate === 'number' ? m.responseRate : 0,
      avgResponseTime: typeof m.avgResponseTime === 'string' ? m.avgResponseTime : '0s',
      subagentInvocations: typeof m.subagentInvocations === 'number' ? m.subagentInvocations : undefined,
      toolCalls: typeof m.toolCalls === 'number' ? m.toolCalls : undefined,
    };
  }
  return { taskCount: 0, responseRate: 0, avgResponseTime: '0s' };
}

function parseTools(tools: unknown): Tool[] {
  if (Array.isArray(tools)) {
    return tools.map((t, index) => ({
      id: typeof t.id === 'string' ? t.id : `tool-${index}`,
      name: typeof t.name === 'string' ? t.name : 'Unknown Tool',
      skillMd: typeof t.skillMd === 'string' ? t.skillMd : (typeof t.skill_md === 'string' ? t.skill_md : ''),
    }));
  }
  return [];
}

function parseScope(scope: unknown): string[] {
  if (Array.isArray(scope)) {
    return scope.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function parseModelConfig(config: unknown): ModelConfig {
  if (typeof config === 'object' && config !== null) {
    const c = config as Record<string, unknown>;
    return {
      provider: isValidProvider(c.provider) ? c.provider : 'Bedrock',
      modelId: typeof c.modelId === 'string' ? c.modelId : 'claude-3-sonnet',
      agentType: isValidAgentType(c.agentType) ? c.agentType : 'Worker',
    };
  }
  return { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' };
}

function isValidProvider(value: unknown): value is 'Bedrock' | 'OpenAI' | 'Azure' | 'LiteLLM' {
  return value === 'Bedrock' || value === 'OpenAI' || value === 'Azure' || value === 'LiteLLM';
}

function isValidAgentType(value: unknown): value is 'Orchestrator' | 'Worker' | 'Supervisor' {
  return value === 'Orchestrator' || value === 'Worker' || value === 'Supervisor';
}

/**
 * REST implementation of the Agent Service
 */
export const RestAgentService = {
  /**
   * Retrieves all agents from the API
   */
  async getAgents(): Promise<Agent[]> {
      try {
        const allAgents: Agent[] = [];
        let page = 1;
        let totalPages = 1;

        do {
          const response = await restClient.get<{
            data: ApiAgent[];
            pagination: { page: number; limit: number; total: number; totalPages: number };
          }>(`/api/agents?page=${page}&limit=100`);

          allAgents.push(...response.data.map(mapApiAgentToAgent));
          totalPages = response.pagination.totalPages;
          page++;
        } while (page <= totalPages);

        return allAgents;
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError('Failed to fetch agents', 'UNKNOWN');
      }
    },

  /**
   * Retrieves a single agent by ID
   */
  async getAgentById(id: string): Promise<Agent> {
    try {
      const response = await restClient.get<ApiAgent>(`/api/agents/${id}`);
      return mapApiAgentToAgent(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to fetch agent with id "${id}"`, 'UNKNOWN');
    }
  },

  /**
   * Creates a new agent
   */
  async createAgent(data: Partial<Agent>): Promise<Agent> {
    try {
      if (!data.name || data.name.trim() === '') {
        throw new ServiceError('Agent name is required', 'VALIDATION_ERROR');
      }
      if (!data.displayName || data.displayName.trim() === '') {
        throw new ServiceError('Agent display name is required', 'VALIDATION_ERROR');
      }

      const requestData = mapAgentToApiRequest(data);
      const response = await restClient.post<ApiAgent>('/api/agents', requestData);
      return mapApiAgentToAgent(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to create agent', 'UNKNOWN');
    }
  },

  /**
   * Updates an agent's configuration
   */
  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    try {
      if (data.name !== undefined && data.name.trim() === '') {
        throw new ServiceError('Agent name cannot be empty', 'VALIDATION_ERROR');
      }
      if (data.displayName !== undefined && data.displayName.trim() === '') {
        throw new ServiceError('Agent display name cannot be empty', 'VALIDATION_ERROR');
      }

      const requestData = mapAgentToApiRequest(data);
      const response = await restClient.put<ApiAgent>(`/api/agents/${id}`, requestData);
      return mapApiAgentToAgent(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to update agent with id "${id}"`, 'UNKNOWN');
    }
  },

  /**
   * Deletes an agent
   */
  async deleteAgent(id: string): Promise<void> {
    try {
      await restClient.delete(`/api/agents/${id}`);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to delete agent with id "${id}"`, 'UNKNOWN');
    }
  },

  /**
   * Retrieves agents filtered by business scope
   */
  async getAgentsByBusinessScope(businessScopeId: string): Promise<Agent[]> {
    try {
      const response = await restClient.get<{
        data: ApiAgent[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(
        `/api/agents?business_scope_id=${encodeURIComponent(businessScopeId)}`
      );
      return response.data.map(mapApiAgentToAgent);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to fetch agents for business scope "${businessScopeId}"`, 'UNKNOWN');
    }
  },

  /**
   * Retrieves agents filtered by department (backward compatibility)
   */
  async getAgentsByDepartment(department: Department): Promise<Agent[]> {
    const agents = await this.getAgents();
    return agents.filter(a => a.department === department);
  },

  /**
   * Retrieves agents filtered by status
   */
  async getAgentsByStatus(status: string): Promise<Agent[]> {
    try {
      const response = await restClient.get<{
        data: ApiAgent[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(
        `/api/agents?status=${encodeURIComponent(status)}`
      );
      return response.data.map(mapApiAgentToAgent);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to fetch agents with status "${status}"`, 'UNKNOWN');
    }
  },

  /**
   * Binds an agent to a business scope (M:N relationship).
   * This adds the agent to the scope without removing it from other scopes.
   */
  async bindAgentToScope(agentId: string, businessScopeId: string): Promise<void> {
    try {
      await restClient.post(`/api/agents/${agentId}/scopes`, {
        business_scope_id: businessScopeId,
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to bind agent "${agentId}" to scope "${businessScopeId}"`, 'UNKNOWN');
    }
  },

  /**
   * Unbinds an agent from a business scope (M:N relationship).
   * This removes the agent from the scope without affecting other scope memberships.
   */
  async unbindAgentFromScope(agentId: string, businessScopeId: string): Promise<void> {
    try {
      await restClient.delete(`/api/agents/${agentId}/scopes/${businessScopeId}`);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to unbind agent "${agentId}" from scope "${businessScopeId}"`, 'UNKNOWN');
    }
  },

  /**
   * Gets all scope assignments for an agent.
   */
  async getAgentScopes(agentId: string): Promise<Array<{ id: string; agent_id: string; business_scope_id: string; is_primary: boolean; assigned_at: string }>> {
    try {
      const response = await restClient.get<{ scopes: Array<{ id: string; agent_id: string; business_scope_id: string; is_primary: boolean; assigned_at: string }> }>(
        `/api/agents/${agentId}/scopes`
      );
      return response.scopes;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(`Failed to get scopes for agent "${agentId}"`, 'UNKNOWN');
    }
  },

  /**
   * Subscribes to real-time agent changes
   * Note: REST API doesn't support real-time subscriptions natively.
   * This is a no-op that returns an empty unsubscribe function.
   * For real-time updates, consider using WebSocket or polling.
   */
  subscribeToChanges(callback: (payload: { eventType: string; new?: Agent; old?: Agent }) => void) {
    console.warn('REST API does not support real-time subscriptions. Consider using polling.');
    return () => {};
  },
};

export default RestAgentService;
