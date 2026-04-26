/**
 * REST Support Service
 * Frontend API client for the customer service module.
 */

import { restClient } from './restClient';

// ============================================================================
// Types
// ============================================================================

export interface SupportConversation {
  id: string;
  organization_id: string;
  session_id: string | null;
  channel_type: string;
  channel_id: string | null;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  customer_id: string | null;
  ai_confidence: number | null;
  sentiment_score: number | null;
  first_response_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  customer?: CustomerProfile;
  messages?: ChatMessage[];
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  source_channel: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  notes: string | null;
  recentConversations?: SupportConversation[];
}

export interface ChatMessage {
  id: string;
  session_id: string;
  type: 'user' | 'agent' | 'ai' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface FaqArticle {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[];
  view_count: number;
  status: string;
  created_at: string;
}

export interface AgentGroup {
  id: string;
  name: string;
  description: string | null;
  routing_strategy: string;
  max_concurrent: number;
  is_active: boolean;
  agent_group_members: AgentGroupMember[];
}

export interface AgentGroupMember {
  id: string;
  user_id: string;
  is_active: boolean;
  current_load: number;
  max_load: number;
}

export interface EscalationRule {
  id: string;
  name: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  agent_group_id: string | null;
}

export interface ResponseTemplate {
  id: string;
  name: string;
  content: string;
  category: string | null;
  shortcut: string | null;
  channel_types: string[];
  is_active: boolean;
}

export interface BusinessHoursConfig {
  id: string;
  name: string;
  timezone: string;
  monday_start: string | null;
  monday_end: string | null;
  tuesday_start: string | null;
  tuesday_end: string | null;
  wednesday_start: string | null;
  wednesday_end: string | null;
  thursday_start: string | null;
  thursday_end: string | null;
  friday_start: string | null;
  friday_end: string | null;
  saturday_start: string | null;
  saturday_end: string | null;
  sunday_start: string | null;
  sunday_end: string | null;
  holiday_dates: string[];
  offline_message: string | null;
  is_active: boolean;
}

export interface MetricsSummary {
  totalConversations: number;
  resolvedConversations: number;
  aiResolvedRate: number;
  avgCsatRating: number;
  csatCount: number;
  avgFirstResponseSec: number | null;
}

export interface KnowledgeGap {
  topic: string;
  frequency: number;
  suggestedCategory: string;
  summary: string;
}

export interface GapReport {
  gaps: KnowledgeGap[];
  totalProblematicConversations: number;
  existingFaqCount: number;
  generatedAt: string;
}

// ============================================================================
// Service
// ============================================================================

export const RestSupportService = {
  // Conversations
  getConversations: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return restClient.get<{ data: SupportConversation[]; total: number }>(`/api/support/conversations${query}`);
  },

  getConversation: (id: string) =>
    restClient.get<SupportConversation & { messages: ChatMessage[] }>(`/api/support/conversations/${id}`),

  createConversation: (data: { customerName: string; customerEmail?: string; message: string; channelType?: string; priority?: string }) =>
    restClient.post<{ conversation: SupportConversation; customer: CustomerProfile; sessionId: string }>('/api/support/conversations', data),

  sendMessage: (conversationId: string, content: string) =>
    restClient.post<ChatMessage>(`/api/support/conversations/${conversationId}/messages`, { content }),

  assignAgent: (conversationId: string, agentId: string) =>
    restClient.put<SupportConversation>(`/api/support/conversations/${conversationId}/assign`, { agentId }),

  resolveConversation: (conversationId: string, notes?: string) =>
    restClient.put<SupportConversation>(`/api/support/conversations/${conversationId}/resolve`, { notes }),

  closeConversation: (conversationId: string) =>
    restClient.put<SupportConversation>(`/api/support/conversations/${conversationId}/close`),

  handoffToHuman: (conversationId: string) =>
    restClient.post<SupportConversation>(`/api/support/conversations/${conversationId}/handoff`),

  // Customers
  getCustomer: (id: string) =>
    restClient.get<CustomerProfile>(`/api/support/customers/${id}`),

  // FAQ
  getFaqArticles: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return restClient.get<{ data: FaqArticle[]; total: number }>(`/api/support/faq${query}`);
  },

  createFaqArticle: (data: { question: string; answer: string; category?: string; tags?: string[]; businessScopeId?: string }) =>
    restClient.post<FaqArticle>('/api/support/faq', data),

  updateFaqArticle: (id: string, data: Partial<FaqArticle>) =>
    restClient.put<FaqArticle>(`/api/support/faq/${id}`, data),

  // Settings - Agent Groups
  getAgentGroups: () => restClient.get<AgentGroup[]>('/api/support/settings/agent-groups'),
  createAgentGroup: (data: { name: string; description?: string; routingStrategy?: string; maxConcurrent?: number }) =>
    restClient.post<AgentGroup>('/api/support/settings/agent-groups', data),
  updateAgentGroup: (id: string, data: Partial<AgentGroup>) =>
    restClient.put<AgentGroup>(`/api/support/settings/agent-groups/${id}`, data),
  deleteAgentGroup: (id: string) =>
    restClient.delete(`/api/support/settings/agent-groups/${id}`),
  addGroupMember: (groupId: string, userId: string) =>
    restClient.post(`/api/support/settings/agent-groups/${groupId}/members`, { userId }),
  removeGroupMember: (groupId: string, userId: string) =>
    restClient.delete(`/api/support/settings/agent-groups/${groupId}/members/${userId}`),

  // Settings - Escalation Rules
  getEscalationRules: () => restClient.get<EscalationRule[]>('/api/support/settings/escalation-rules'),
  createEscalationRule: (data: Partial<EscalationRule>) =>
    restClient.post<EscalationRule>('/api/support/settings/escalation-rules', data),
  updateEscalationRule: (id: string, data: Partial<EscalationRule>) =>
    restClient.put<EscalationRule>(`/api/support/settings/escalation-rules/${id}`, data),
  deleteEscalationRule: (id: string) =>
    restClient.delete(`/api/support/settings/escalation-rules/${id}`),

  // Settings - Response Templates
  getResponseTemplates: () => restClient.get<ResponseTemplate[]>('/api/support/settings/response-templates'),
  createResponseTemplate: (data: Partial<ResponseTemplate>) =>
    restClient.post<ResponseTemplate>('/api/support/settings/response-templates', data),
  updateResponseTemplate: (id: string, data: Partial<ResponseTemplate>) =>
    restClient.put<ResponseTemplate>(`/api/support/settings/response-templates/${id}`, data),
  deleteResponseTemplate: (id: string) =>
    restClient.delete(`/api/support/settings/response-templates/${id}`),

  // Settings - Business Hours
  getBusinessHours: () => restClient.get<BusinessHoursConfig[]>('/api/support/settings/business-hours'),
  createBusinessHours: (data: Partial<BusinessHoursConfig>) =>
    restClient.post<BusinessHoursConfig>('/api/support/settings/business-hours', data),
  updateBusinessHours: (id: string, data: Partial<BusinessHoursConfig>) =>
    restClient.put<BusinessHoursConfig>(`/api/support/settings/business-hours/${id}`, data),

  // Metrics
  getMetricsSummary: () => restClient.get<MetricsSummary>('/api/support/settings/metrics/summary'),

  // Knowledge
  getDrafts: () => restClient.get<FaqArticle[]>('/api/support/knowledge/drafts'),
  publishDraft: (id: string, edits?: { question?: string; answer?: string; category?: string }) =>
    restClient.post<FaqArticle>(`/api/support/knowledge/drafts/${id}/publish`, edits),
  rejectDraft: (id: string) =>
    restClient.post(`/api/support/knowledge/drafts/${id}/reject`),
  triggerDistill: (hours?: number) =>
    restClient.post<{ distilledCount: number; draftsCreated: number }>('/api/support/knowledge/distill', { hours }),
  generateGapReport: (days?: number) => {
    const query = days ? `?days=${days}` : '';
    return restClient.post<GapReport>(`/api/support/knowledge/gap-report${query}`);
  },
};
