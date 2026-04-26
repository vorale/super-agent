/**
 * Route Registration Module
 *
 * Centralizes all route registration for the Super Agent Backend.
 * This module is responsible for:
 * - Registering all API routes with appropriate prefixes
 * - Organizing routes by resource type
 * - Ensuring consistent URL structure across the API
 *
 * Route Structure:
 * - /health/*           - Health check endpoints (no authentication required)
 * - /api/agents/*       - Agent management (Requirements: 4.1-4.8)
 * - /api/tasks/*        - Task management (Requirements: 5.1-5.7)
 * - /api/workflows/*    - Workflow management (Requirements: 6.1-6.6)
 * - /api/documents/*    - Document management (Requirements: 7.1-7.6)
 * - /api/files/*        - File storage (Requirements: 12.1-12.4)
 * - /api/chat/*         - Chat and streaming (Requirements: 8.1-8.7)
 * - /api/mcp/*          - MCP server configuration (Requirements: 9.1-9.5)
 * - /api/organizations/* - Organization and membership management (Requirements: 10.1-10.5)
 * - /api/business-scopes/* - Business scope management (Requirements: 11.1-11.6)
 *
 * Authentication:
 * - All /api/* routes require JWT authentication (except health checks)
 * - Authentication is applied at the individual route level via preHandler hooks
 * - Role-based access control is enforced for modification operations
 *
 * @module routes
 */

import { FastifyInstance } from 'fastify';
import { agentRoutes } from './agents.routes.js';
import { taskRoutes } from './tasks.routes.js';
import { workflowRoutes } from './workflows.routes.js';
import { checkpointRoutes } from './checkpoint.routes.js';
import { executionRoutes } from './execution.routes.js';
import { documentRoutes } from './documents.routes.js';
import { fileRoutes } from './files.routes.js';
import { chatRoutes } from './chat.routes.js';
import { chatRoomRoutes } from './chatRooms.routes.js';
import { projectRoutes } from './projects.routes.js';
import { mcpRoutes } from './mcp.routes.js';
import { organizationRoutes } from './organizations.routes.js';
import { businessScopeRoutes } from './businessScopes.routes.js';
import { scopeGeneratorRoutes } from './scope-generator.routes.js';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { skillsRoutes } from './skills.routes.js';
import { skillMarketplaceRoutes } from './skill-marketplace.routes.js';
import { avatarRoutes } from './avatarRoutes.js';
import { workshopRoutes } from './workshop.routes.js';
import { openapiRoutes } from './openapi.routes.js';
import { apiKeysRoutes } from './apiKeys.routes.js';
import { webhooksRoutes } from './webhooks.routes.js';
import { schedulesRoutes } from './schedules.routes.js';
import { integrationRoutes } from './integrations.routes.js';
import { appsRoutes } from './apps.routes.js';
import { appDataRoutes } from './appData.routes.js';
import { enterpriseSkillsRoutes, enterpriseSkillPublishRoutes } from './enterprise-skills.routes.js';
import { imChannelAdminRoutes, imWebhookRoutes } from './im.routes.js';
import { scopeMemoryRoutes } from './scope-memory.routes.js';
import { briefingRoutes } from './briefing.routes.js';
import { scopeMembershipRoutes } from './scopeMemberships.routes.js';
import { documentGroupRoutes, scopeDocGroupRoutes } from './document-groups.routes.js';
import { rehearsalRoutes } from './rehearsal.routes.js';
import { ragRoutes } from './rag.routes.js';
import { userGroupRoutes } from './userGroups.routes.js';
import { tokenUsageRoutes } from './token-usage.routes.js';
import { showcaseRoutes } from './showcase.routes.js';
import { llmProxyRoutes } from './llm-proxy.routes.js';
import { connectorRoutes } from './connectors.routes.js';
import { supportRoutes, supportSettingsRoutes, supportKnowledgeRoutes } from './support.routes.js';
import { widgetRoutes } from './widget.routes.js';
import { litellmRoutes } from './litellm.routes.js';

/**
 * Register all API routes on the Fastify instance.
 *
 * Routes are organized by resource type and prefixed appropriately:
 * - Health routes: /health (no /api prefix for load balancer health checks)
 * - All other routes: /api/{resource}
 *
 * Each route module is responsible for:
 * - Applying authentication middleware to protected endpoints
 * - Applying role-based access control for modification operations
 * - Defining OpenAPI schemas for documentation
 * - Validating request data using Zod schemas
 *
 * @param fastify - The Fastify instance to register routes on
 * @returns Promise that resolves when all routes are registered
 *
 * @example
 * ```typescript
 * import { buildApp } from './app';
 *
 * const app = await buildApp();
 * // Routes are automatically registered via registerRoutes()
 * ```
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // ============================================================================
  // Health Check Routes (No Authentication Required)
  // Requirements: 13.1, 13.2
  // ============================================================================
  // Health routes are registered without /api prefix for load balancer compatibility
  await fastify.register(healthRoutes, { prefix: '/health' });

  // ============================================================================
  // Authentication Routes (No Authentication Required)
  // ============================================================================
  await fastify.register(authRoutes, { prefix: '/api/auth' });

  // ============================================================================
  // Protected API Routes (Authentication Required)
  // All routes below require valid JWT authentication
  // ============================================================================

  // Agent Management Routes
  // Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
  await fastify.register(agentRoutes, { prefix: '/api/agents' });

  // Task Management Routes
  // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
  await fastify.register(taskRoutes, { prefix: '/api/tasks' });

  // Workflow Management Routes
  // Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
  await fastify.register(workflowRoutes, { prefix: '/api/workflows' });

  // Workflow Checkpoint Routes (async pause/resume)
  await fastify.register(checkpointRoutes, { prefix: '/api/workflows' });

  // Workflow Execution Routes
  // Requirements: 1.1, 7.1, 9.2 (Real Workflow Execution spec)
  await fastify.register(executionRoutes, { prefix: '/api' });

  // Document Management Routes
  // Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
  await fastify.register(documentRoutes, { prefix: '/api/documents' });

  // File Storage Routes
  // Requirements: 12.1, 12.2, 12.3, 12.4
  await fastify.register(fileRoutes, { prefix: '/api/files' });

  // Chat and Streaming Routes
  // Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
  await fastify.register(chatRoutes, { prefix: '/api/chat' });

  // Chat Room Routes (group chat with multiple agents)
  await fastify.register(chatRoomRoutes, { prefix: '/api/chat/rooms' });

  // Project Management Routes (kanban board)
  await fastify.register(projectRoutes, { prefix: '/api/projects' });

  // Enterprise skill publish-from-workspace (under /api/chat)
  await fastify.register(enterpriseSkillPublishRoutes, { prefix: '/api/chat' });

  // MCP Server Configuration Routes
  // Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
  await fastify.register(mcpRoutes, { prefix: '/api/mcp' });

  // Organization and Membership Management Routes
  // Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
  await fastify.register(organizationRoutes, { prefix: '/api/organizations' });

  // Business Scope Management Routes
  // Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
  await fastify.register(businessScopeRoutes, { prefix: '/api/business-scopes' });

  // AI Scope Generator Routes
  await fastify.register(scopeGeneratorRoutes, { prefix: '/api/scope-generator' });

  // Skill Marketplace Routes (search, detail, install from skills.sh)
  await fastify.register(skillMarketplaceRoutes, { prefix: '/api/skills/marketplace' });

  // Enterprise Skills Marketplace Routes (internal catalog)
  await fastify.register(enterpriseSkillsRoutes, { prefix: '/api/skills/enterprise' });

  // Skills Management Routes (register AFTER more-specific /skills/* sub-routes
  // so that /:id doesn't swallow /enterprise and /marketplace)
  await fastify.register(skillsRoutes, { prefix: '/api/skills' });

  // Avatar Generation Routes
  await fastify.register(avatarRoutes, { prefix: '/api' });

  // Skill Workshop Routes (equip/unequip/test skills on agents)
  await fastify.register(workshopRoutes, { prefix: '/api/agents' });

  // ============================================================================
  // API Keys, Webhooks, and Schedules (New Features)
  // ============================================================================

  // API Keys Management Routes
  await fastify.register(apiKeysRoutes, { prefix: '/api' });

  // Webhook Management and Trigger Routes
  await fastify.register(webhooksRoutes, { prefix: '/api' });

  // Schedule Management Routes
  await fastify.register(schedulesRoutes, { prefix: '/api' });

  // Integration Routes (scope-level API skills from uploaded specs)
  await fastify.register(integrationRoutes, { prefix: '/api/business-scopes' });

  // IM Channel Admin Routes (manage channel bindings per scope)
  await fastify.register(imChannelAdminRoutes, { prefix: '/api/business-scopes' });

  // Scope Memory Routes (persistent knowledge per scope)
  await fastify.register(scopeMemoryRoutes, { prefix: '/api/business-scopes' });

  // Scope Membership Routes (scope-level access control)
  await fastify.register(scopeMembershipRoutes, { prefix: '/api/business-scopes' });

  // Document Group Routes (RAG knowledge base)
  await fastify.register(documentGroupRoutes, { prefix: '/api/document-groups' });
  await fastify.register(scopeDocGroupRoutes, { prefix: '/api/business-scopes' });

  // Scope Briefings Routes (AI-generated insights)
  await fastify.register(briefingRoutes);

  // Rehearsal & Evolution Proposal Routes (agent self-evolution)
  await fastify.register(rehearsalRoutes, { prefix: '/api/business-scopes' });

  // RAG Routes (semantic document search)
  await fastify.register(ragRoutes, { prefix: '/api/rag' });

  // User Group Routes (RBAC for skills and MCP servers)
  await fastify.register(userGroupRoutes, { prefix: '/api/user-groups' });

  // Token Usage Routes (per-user token consumption monitoring)
  await fastify.register(tokenUsageRoutes, { prefix: '/api/token-usage' });

  // Showcase Routes (企业Agent大赏)
  await fastify.register(showcaseRoutes, { prefix: '/api/showcase' });

  // IM Webhook Routes (receive messages from Slack, Discord, etc. — no JWT auth)
  await fastify.register(imWebhookRoutes, { prefix: '/api/im' });

  // Published Apps / Marketplace Routes
  await fastify.register(appsRoutes, { prefix: '/api/apps' });
  await fastify.register(appDataRoutes, { prefix: '/api/apps' });

  // Data Connector Routes (credentials, connectors, scope bindings)
  await fastify.register(connectorRoutes, { prefix: '/api/data-connectors' });

  // ============================================================================
  // Customer Service Module Routes
  // ============================================================================

  // Support Workspace Routes (conversations, customers, FAQ)
  await fastify.register(supportRoutes, { prefix: '/api/support' });

  // Support Settings Routes (agent groups, escalation rules, templates, business hours)
  await fastify.register(supportSettingsRoutes, { prefix: '/api/support/settings' });

  // Support Knowledge Routes (drafts, distillation, gap reports)
  await fastify.register(supportKnowledgeRoutes, { prefix: '/api/support/knowledge' });

  // Widget External API (API Key authentication, no JWT)
  await fastify.register(widgetRoutes, { prefix: '/api/v1/widget' });

  // LiteLLM Model Proxy
  await fastify.register(litellmRoutes, { prefix: '/api/litellm' });

  // ============================================================================
  // LLM Proxy Routes (OpenAI-compatible, API Key Authentication)
  // ============================================================================

  // /v1/chat/completions and /v1/models — drop-in for OpenAI SDK base_url
  await fastify.register(llmProxyRoutes);

  // ============================================================================
  // Public OpenAPI Routes (API Key Authentication)
  // ============================================================================

  // OpenAPI Routes for programmatic workflow access
  await fastify.register(openapiRoutes);
}

// Re-export individual route modules for testing purposes
export {
  agentRoutes,
  taskRoutes,
  workflowRoutes,
  executionRoutes,
  documentRoutes,
  fileRoutes,
  chatRoutes,
  chatRoomRoutes,
  mcpRoutes,
  organizationRoutes,
  businessScopeRoutes,
  scopeGeneratorRoutes,
  healthRoutes,
  authRoutes,
  skillsRoutes,
  skillMarketplaceRoutes,
  enterpriseSkillsRoutes,
  avatarRoutes,
  workshopRoutes,
  openapiRoutes,
  apiKeysRoutes,
  webhooksRoutes,
  schedulesRoutes,
  integrationRoutes,
  imChannelAdminRoutes,
  imWebhookRoutes,
  scopeMemoryRoutes,
  supportRoutes,
  supportSettingsRoutes,
  supportKnowledgeRoutes,
  widgetRoutes,
};
