/**
 * Agent Service
 * 
 * This module provides the unified agent service that automatically switches
 * between mock and REST API implementations based on environment configuration.
 * 
 * Requirements: 3.3, 3.7, 11.6
 */

import type { Agent, Department } from '@/types';
import { getServiceConfig } from './api/createService';
import { RestAgentService } from './api/restAgentService';
import { shouldUseRestApi } from './api/index';

// Re-export error types for backward compatibility
export type AgentServiceErrorCode = 'NOT_FOUND' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN';

export class AgentServiceError extends Error {
  code: AgentServiceErrorCode;

  constructor(message: string, code: AgentServiceErrorCode) {
    super(message);
    this.name = 'AgentServiceError';
    this.code = code;
  }
}

// Simulated network delay for realistic behavior in mock mode
const SIMULATED_DELAY = 300;

// Mock data for development
const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'hr-assistant',
    displayName: 'HR Assistant',
    role: 'Recruitment Specialist',
    department: 'hr',
    avatar: 'H',
    status: 'active',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-1', name: 'resume-parser', skillMd: '# Resume Parser\n\nExtracts information from resumes.\n\n## Usage\n- Upload resume file\n- Extract candidate details\n- Output structured data' },
      { id: 'tool-2', name: 'calendar-integration', skillMd: '# Calendar Integration\n\nSchedules interviews.\n\n## Usage\n- Check availability\n- Create meeting invites\n- Send notifications' },
    ],
    scope: ['Recruitment', 'Onboarding', 'Employee Records'],
    systemPrompt: 'You are an HR assistant specialized in recruitment and onboarding processes.',
    modelConfig: { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' },
  },
  {
    id: 'agent-2',
    name: 'onboarding-bot',
    displayName: 'Onboarding Bot',
    role: 'Employee Onboarding',
    department: 'hr',
    avatar: 'O',
    status: 'busy',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-3', name: 'document-generator', skillMd: '# Document Generator\n\nCreates onboarding documents.\n\n## Usage\n- Generate offer letters\n- Create policy documents\n- Prepare training materials' },
    ],
    scope: ['Onboarding', 'Training', 'Policy Distribution'],
    systemPrompt: 'You are an onboarding specialist helping new employees get started.',
    modelConfig: { provider: 'OpenAI', modelId: 'gpt-4', agentType: 'Worker' },
  },
  {
    id: 'agent-3',
    name: 'it-support',
    displayName: 'IT Support Agent',
    role: 'Technical Support',
    department: 'it',
    avatar: 'I',
    status: 'active',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-4', name: 'ticket-system', skillMd: '# Ticket System\n\nManages support tickets.\n\n## Usage\n- Create tickets\n- Track status\n- Assign to technicians' },
      { id: 'tool-5', name: 'remote-access', skillMd: '# Remote Access\n\nProvides remote assistance.\n\n## Usage\n- Connect to user machines\n- Troubleshoot issues\n- Install software' },
    ],
    scope: ['Troubleshooting', 'System Access', 'Password Reset'],
    systemPrompt: 'You are an IT support agent helping users with technical issues.',
    modelConfig: { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' },
  },
  {
    id: 'agent-4',
    name: 'devops-bot',
    displayName: 'DevOps Bot',
    role: 'Deployment Automation',
    department: 'it',
    avatar: 'D',
    status: 'active',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-6', name: 'cicd-pipeline', skillMd: '# CI/CD Pipeline\n\nManages deployment pipelines.\n\n## Usage\n- Trigger builds\n- Run tests\n- Deploy to environments' },
      { id: 'tool-7', name: 'infrastructure-manager', skillMd: '# Infrastructure Manager\n\nProvisions cloud resources.\n\n## Usage\n- Create EC2 instances\n- Configure networking\n- Manage storage' },
    ],
    scope: ['CI/CD', 'Infrastructure', 'Monitoring'],
    systemPrompt: 'You are a DevOps automation bot managing deployments and infrastructure.',
    modelConfig: { provider: 'Azure', modelId: 'gpt-4', agentType: 'Orchestrator' },
  },
  {
    id: 'agent-5',
    name: 'marketing-assistant',
    displayName: 'Marketing Assistant',
    role: 'Content Creator',
    department: 'marketing',
    avatar: 'M',
    status: 'active',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-8', name: 'content-generator', skillMd: '# Content Generator\n\nCreates marketing content.\n\n## Usage\n- Generate blog posts\n- Create ad copy\n- Write email campaigns' },
      { id: 'tool-9', name: 'social-media-manager', skillMd: '# Social Media Manager\n\nSchedules social posts.\n\n## Usage\n- Schedule posts\n- Track engagement\n- Analyze performance' },
    ],
    scope: ['Content', 'Social Media', 'Campaign Management'],
    systemPrompt: 'You are a marketing assistant helping create and manage content.',
    modelConfig: { provider: 'OpenAI', modelId: 'gpt-4', agentType: 'Worker' },
  },
  {
    id: 'agent-6',
    name: 'sales-bot',
    displayName: 'Sales Bot',
    role: 'Lead Qualification',
    department: 'sales',
    avatar: 'S',
    status: 'offline',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-10', name: 'crm-integration', skillMd: '# CRM Integration\n\nManages customer data.\n\n## Usage\n- Update contacts\n- Track interactions\n- Manage deals' },
      { id: 'tool-11', name: 'lead-scorer', skillMd: '# Lead Scorer\n\nQualifies leads automatically.\n\n## Usage\n- Score leads\n- Prioritize outreach\n- Identify hot prospects' },
    ],
    scope: ['Lead Gen', 'CRM', 'Sales Pipeline'],
    systemPrompt: 'You are a sales bot helping qualify leads and manage the sales pipeline.',
    modelConfig: { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' },
  },
  {
    id: 'agent-7',
    name: 'support-agent',
    displayName: 'Support Agent',
    role: 'Customer Support',
    department: 'support',
    avatar: 'C',
    status: 'active',
    metrics: { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
    tools: [
      { id: 'tool-12', name: 'knowledge-base', skillMd: '# Knowledge Base\n\nSearches support articles.\n\n## Usage\n- Search articles\n- Find solutions\n- Suggest relevant docs' },
      { id: 'tool-13', name: 'ticket-manager', skillMd: '# Ticket Manager\n\nHandles support tickets.\n\n## Usage\n- Create tickets\n- Update status\n- Escalate issues' },
    ],
    scope: ['Tickets', 'FAQ', 'Customer Communication'],
    systemPrompt: 'You are a customer support agent helping resolve customer issues.',
    modelConfig: { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' },
  },
];

// In-memory store for mock data (simulates backend persistence)
let agentStore: Agent[] = [...mockAgents];

// Helper to simulate async operations
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock implementation of the Agent Service
 * Used in development mode when VITE_USE_MOCK=true
 */
export const MockAgentService = {
  /**
   * Retrieves all agents from the system
   */
  async getAgents(): Promise<Agent[]> {
    await delay(SIMULATED_DELAY);
    return [...agentStore];
  },

  /**
   * Retrieves a single agent by ID
   * @throws AgentServiceError if agent not found
   */
  async getAgentById(id: string): Promise<Agent> {
    await delay(SIMULATED_DELAY);
    const agent = agentStore.find(a => a.id === id);
    if (!agent) {
      throw new AgentServiceError(`Agent with id "${id}" not found`, 'NOT_FOUND');
    }
    return { ...agent };
  },

  /**
   * Creates a new agent
   * @throws AgentServiceError if validation fails
   */
  async createAgent(data: Partial<Agent>): Promise<Agent> {
    await delay(SIMULATED_DELAY);

    // Validate required fields
    if (!data.name || data.name.trim() === '') {
      throw new AgentServiceError('Agent name is required', 'VALIDATION_ERROR');
    }
    if (!data.displayName || data.displayName.trim() === '') {
      throw new AgentServiceError('Agent display name is required', 'VALIDATION_ERROR');
    }

    // Check for duplicate name
    const existingAgent = agentStore.find(a => a.name === data.name);
    if (existingAgent) {
      throw new AgentServiceError(`Agent with name "${data.name}" already exists`, 'VALIDATION_ERROR');
    }

    const newAgent: Agent = {
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: data.name.trim(),
      displayName: data.displayName.trim(),
      role: data.role || '',
      department: data.department || 'it',
      avatar: data.avatar || data.displayName.charAt(0).toUpperCase(),
      status: data.status || 'active',
      metrics: data.metrics || { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
      tools: data.tools || [],
      scope: data.scope || [],
      systemPrompt: data.systemPrompt || '',
      modelConfig: data.modelConfig || { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' },
      businessScopeId: data.businessScopeId,
    };

    agentStore.push(newAgent);
    return { ...newAgent };
  },

  /**
   * Updates an agent's configuration
   * @throws AgentServiceError if agent not found or validation fails
   */
  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    await delay(SIMULATED_DELAY);
    const index = agentStore.findIndex(a => a.id === id);
    if (index === -1) {
      throw new AgentServiceError(`Agent with id "${id}" not found`, 'NOT_FOUND');
    }

    // Validate required fields if provided
    if (data.name !== undefined && data.name.trim() === '') {
      throw new AgentServiceError('Agent name cannot be empty', 'VALIDATION_ERROR');
    }
    if (data.displayName !== undefined && data.displayName.trim() === '') {
      throw new AgentServiceError('Agent display name cannot be empty', 'VALIDATION_ERROR');
    }

    // Update the agent
    const updatedAgent: Agent = {
      ...agentStore[index],
      ...data,
      id: agentStore[index].id, // Prevent ID modification
    };
    agentStore[index] = updatedAgent;

    return { ...updatedAgent };
  },

  /**
   * Deletes an agent
   * @throws AgentServiceError if agent not found
   */
  async deleteAgent(id: string): Promise<void> {
    await delay(SIMULATED_DELAY);
    const index = agentStore.findIndex(a => a.id === id);
    if (index === -1) {
      throw new AgentServiceError(`Agent with id "${id}" not found`, 'NOT_FOUND');
    }
    agentStore.splice(index, 1);
  },

  /**
   * Retrieves agents filtered by department
   */
  async getAgentsByDepartment(department: Department): Promise<Agent[]> {
    await delay(SIMULATED_DELAY);
    return agentStore.filter(a => a.department === department).map(a => ({ ...a }));
  },

  /**
   * Retrieves agents filtered by business scope
   */
  async getAgentsByBusinessScope(businessScopeId: string): Promise<Agent[]> {
    await delay(SIMULATED_DELAY);
    return agentStore.filter(a => a.businessScopeId === businessScopeId).map(a => ({ ...a }));
  },

  /**
   * Resets the agent store to initial mock data (useful for testing)
   */
  resetStore(): void {
    agentStore = [...mockAgents];
  },

  /**
   * Gets the initial mock agents (useful for testing)
   */
  getMockAgents(): Agent[] {
    return [...mockAgents];
  },
};

/**
 * Agent Service Interface
 * Defines the contract that both mock and Supabase implementations must follow
 */
export interface IAgentService {
  getAgents(): Promise<Agent[]>;
  getAgentById(id: string): Promise<Agent>;
  createAgent(data: Partial<Agent>): Promise<Agent>;
  updateAgent(id: string, data: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
  getAgentsByDepartment(department: Department): Promise<Agent[]>;
  getAgentsByBusinessScope?(businessScopeId: string): Promise<Agent[]>;
  bindAgentToScope?(agentId: string, businessScopeId: string): Promise<void>;
  unbindAgentFromScope?(agentId: string, businessScopeId: string): Promise<void>;
  getAgentScopes?(agentId: string): Promise<Array<{ id: string; agent_id: string; business_scope_id: string; is_primary: boolean; assigned_at: string }>>;
  resetStore?(): void;
  getMockAgents?(): Agent[];
}

/**
 * Unified Agent Service
 * 
 * Automatically switches between mock and REST API implementations
 * based on environment variables:
 * 
 * - When VITE_USE_MOCK=true: Uses MockAgentService
 * - Otherwise: Uses RestAgentService (REST API backend)
 * 
 * Requirements: 11.6
 */
function selectAgentService(): IAgentService {
  // First check if REST API mode is enabled
  if (shouldUseRestApi()) {
    return RestAgentService;
  }
  
  // Otherwise use mock
  const config = getServiceConfig();
  return config.useMock ? MockAgentService : RestAgentService;
}

export const AgentService = selectAgentService();

export default AgentService;
