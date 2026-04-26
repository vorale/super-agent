/**
 * Agent Scope Service
 * Manages M:N relationships between agents and business scopes.
 */

import { agentScopeAssignmentRepository, type AgentScopeAssignmentEntity } from '../repositories/agent-scope-assignment.repository.js';
import { agentRepository } from '../repositories/agent.repository.js';
import { businessScopeRepository } from '../repositories/businessScope.repository.js';
import { AppError } from '../middleware/errorHandler.js';

export class AgentScopeService {
  async bindAgentToScope(
    organizationId: string,
    agentId: string,
    businessScopeId: string,
    isPrimary = false,
    assignedBy?: string,
  ): Promise<AgentScopeAssignmentEntity> {
    // Validate agent exists and belongs to org
    const agent = await agentRepository.findById(agentId, organizationId);
    if (!agent) throw AppError.notFound(`Agent with ID ${agentId} not found`);

    // Validate scope exists and belongs to org
    const scope = await businessScopeRepository.findById(businessScopeId, organizationId);
    if (!scope) throw AppError.notFound(`Business scope with ID ${businessScopeId} not found`);

    return agentScopeAssignmentRepository.assign(agentId, businessScopeId, isPrimary, assignedBy);
  }

  async unbindAgentFromScope(
    organizationId: string,
    agentId: string,
    businessScopeId: string,
  ): Promise<boolean> {
    const agent = await agentRepository.findById(agentId, organizationId);
    if (!agent) throw AppError.notFound(`Agent with ID ${agentId} not found`);

    return agentScopeAssignmentRepository.unassign(agentId, businessScopeId);
  }

  async getAgentScopes(
    organizationId: string,
    agentId: string,
  ): Promise<AgentScopeAssignmentEntity[]> {
    const agent = await agentRepository.findById(agentId, organizationId);
    if (!agent) throw AppError.notFound(`Agent with ID ${agentId} not found`);

    return agentScopeAssignmentRepository.findByAgent(agentId);
  }

  async getScopeAgentAssignments(organizationId: string, businessScopeId: string): Promise<AgentScopeAssignmentEntity[]> {
    // Validate scope belongs to org
    const scope = await businessScopeRepository.findById(businessScopeId, organizationId);
    if (!scope) throw AppError.notFound(`Business scope with ID ${businessScopeId} not found`);

    return agentScopeAssignmentRepository.findByScope(businessScopeId);
  }
}

export const agentScopeService = new AgentScopeService();
