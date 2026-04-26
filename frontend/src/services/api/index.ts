/**
 * API Layer Module
 * 
 * This module exports REST API clients and services.
 * The platform uses REST API backend (backend) for all data operations.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7
 */

// =============================================================================
// Import REST API Services for unified exports
// =============================================================================
import { RestAgentService } from './restAgentService';
import { RestWorkflowService } from './restWorkflowService';
import { RestTaskService } from './restTaskService';
import { RestDocumentService } from './restDocumentService';
import { RestMCPService } from './restMCPService';
import { RestChatService } from './restChatService';
import { RestOrganizationService } from './restOrganizationService';
import { RestBusinessScopeService } from './restBusinessScopeService';

// =============================================================================
// Service factory pattern (Requirements: 11.3, 11.4, 11.5)
// =============================================================================
export {
  createService,
  getServiceConfig,
  shouldUseMock,
} from './createService';
export type { ServiceConfig, ServiceImplementation } from './createService';

// =============================================================================
// REST API Client
// =============================================================================
export {
  restClient,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  isRestApiConfigured,
  getRestApiConfig,
} from './restClient';

// =============================================================================
// Authentication Service
// =============================================================================
export { AuthService } from './authService';
export type { User as AuthUser } from './authService';

// =============================================================================
// REST API Service Implementations (re-export)
// =============================================================================
export { RestAgentService } from './restAgentService';
export { RestWorkflowService } from './restWorkflowService';
export { RestTaskService } from './restTaskService';
export { RestDocumentService } from './restDocumentService';
export { RestMCPService } from './restMCPService';
export { RestChatService } from './restChatService';
export { RestOrganizationService } from './restOrganizationService';
export { RestBusinessScopeService } from './restBusinessScopeService';
export type {
  BusinessScope as RestBusinessScopeType,
  CreateBusinessScopeInput as RestCreateBusinessScopeInput,
  UpdateBusinessScopeInput as RestUpdateBusinessScopeInput,
} from './restBusinessScopeService';
export type {
  Organization as RestOrgType,
  Membership as RestMembership,
  CreateOrganizationInput as RestCreateOrganizationInput,
  InviteUserInput as RestInviteUserInput,
} from './restOrganizationService';

// Workflow Integration Services (API Keys, Webhooks, Schedules)
export { RestApiKeyService } from './restApiKeyService';
export type {
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from './restApiKeyService';

export { RestWebhookService } from './restWebhookService';
export type {
  Webhook,
  WebhookCallRecord,
  CreateWebhookRequest,
  CreateWebhookResponse,
  UpdateWebhookRequest,
} from './restWebhookService';

export { RestScheduleService } from './restScheduleService';
export type {
  Schedule,
  ScheduleRecord,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from './restScheduleService';

export { RestSupportService } from './restSupportService';
export type {
  SupportConversation,
  CustomerProfile,
  FaqArticle,
  AgentGroup,
  EscalationRule,
  ResponseTemplate,
  BusinessHoursConfig,
  MetricsSummary,
  KnowledgeGap,
  GapReport,
} from './restSupportService';

// =============================================================================
// API Mode Detection
// =============================================================================

/**
 * API mode configuration
 * Currently only REST API is supported
 */
export type ApiMode = 'rest' | 'mock';

export function getApiMode(): ApiMode {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  return useMock ? 'mock' : 'rest';
}

export function shouldUseRestApi(): boolean {
  return getApiMode() === 'rest';
}

// =============================================================================
// Unified Service Exports (REST API only)
// =============================================================================
export const AgentService = RestAgentService;
export const WorkflowService = RestWorkflowService;
export const TaskService = RestTaskService;
export const DocumentService = RestDocumentService;
export const MCPService = RestMCPService;
export const ChatService = RestChatService;
export const OrganizationService = RestOrganizationService;
export const BusinessScopeService = RestBusinessScopeService;
