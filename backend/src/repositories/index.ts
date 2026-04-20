/**
 * Repository exports
 *
 * This module exports all repository classes and types for data access.
 * All repositories extend BaseRepository which provides multi-tenancy filtering.
 */

export {
  BaseRepository,
  type TenantModel,
  type TenantEntity,
  type FindAllOptions,
  type FindByIdOptions,
  type PaginatedResult,
} from './base.repository.js';

export { AgentRepository, agentRepository, type AgentEntity } from './agent.repository.js';

export {
  WorkflowRepository,
  workflowRepository,
  type WorkflowEntity,
} from './workflow.repository.js';

export {
  DocumentRepository,
  documentRepository,
  type DocumentEntity,
} from './document.repository.js';

export {
  McpServerRepository,
  mcpServerRepository,
  type McpServerEntity,
} from './mcp.repository.js';

export {
  OrganizationRepository,
  organizationRepository,
  type OrganizationEntity,
} from './organization.repository.js';

export {
  MembershipRepository,
  membershipRepository,
  type MembershipEntity,
} from './membership.repository.js';

export {
  BusinessScopeRepository,
  businessScopeRepository,
  type BusinessScopeEntity,
} from './businessScope.repository.js';

export {
  WorkflowExecutionRepository,
  workflowExecutionRepository,
  type WorkflowExecutionEntity,
  type NodeExecutionEntity,
  type CreateExecutionInput,
} from './workflow-execution.repository.js';

export {
  SkillRepository,
  skillRepository,
  type SkillEntity,
  type AgentSkillEntity,
} from './skill.repository.js';

export {
  SupportConversationRepository,
  supportConversationRepository,
  type SupportConversationEntity,
  type ConversationStatus,
  type ConversationPriority,
  type ChannelType,
} from './support.repository.js';

export {
  CustomerProfileRepository,
  customerProfileRepository,
  type CustomerProfileEntity,
} from './customer-profile.repository.js';

export {
  FaqArticleRepository,
  faqArticleRepository,
  type FaqArticleEntity,
  type FaqStatus,
} from './faq.repository.js';
