/**
 * Zod validation schemas for Chat entities (ChatSession and ChatMessage)
 */
import { z } from 'zod';
import { uuidSchema } from './common.schema.js';

/**
 * Chat message type enum values
 */
export const chatMessageTypeValues = ['user', 'ai'] as const;
export const chatMessageTypeSchema = z.enum(chatMessageTypeValues);

// ============================================================================
// Chat Session Schemas
// ============================================================================

/**
 * Schema for creating a new chat session
 */
export const createChatSessionSchema = z.object({
  business_scope_id: uuidSchema.optional().nullable(),
  agent_id: uuidSchema.optional().nullable(),
  sop_context: z.string().optional().nullable(),
  context: z.record(z.string(), z.unknown()).default({}),
  provision_workspace: z.boolean().optional(),
});

/**
 * Schema for updating a chat session
 */
export const updateChatSessionSchema = z.object({
  title: z.string().optional().nullable(),
  sop_context: z.string().optional().nullable(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for chat session response
 */
export const chatSessionResponseSchema = z.object({
  id: uuidSchema,
  organization_id: uuidSchema,
  user_id: uuidSchema,
  sop_context: z.string().nullable(),
  context: z.record(z.string(), z.unknown()),
  created_at: z.date(),
  updated_at: z.date(),
});

// ============================================================================
// Chat Message Schemas
// ============================================================================

/**
 * Schema for creating a new chat message
 */
export const createChatMessageSchema = z.object({
  session_id: uuidSchema,
  type: chatMessageTypeSchema,
  content: z.string().min(1, 'Message content is required'),
});

/**
 * Schema for chat message response
 */
export const chatMessageResponseSchema = z.object({
  id: uuidSchema,
  organization_id: uuidSchema,
  session_id: uuidSchema,
  type: chatMessageTypeSchema,
  content: z.string(),
  created_at: z.date(),
});

// ============================================================================
// Chat Stream Schemas
// ============================================================================

/**
 * Schema for initiating a chat stream
 */
export const chatStreamRequestSchema = z.object({
  agent_id: uuidSchema.optional(),
  business_scope_id: uuidSchema.optional(),
  mention_agent_id: uuidSchema.optional(),
  session_id: uuidSchema.optional(),
  message: z.string().min(1, 'Message is required'),
  model: z.string().max(200).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for chat history query parameters
 */
export const chatHistoryQuerySchema = z.object({
  session_id: uuidSchema,
  limit: z.coerce.number().int().positive().max(100).default(50),
  before: z.string().datetime().optional(),
});

// Type exports
export type ChatMessageType = z.infer<typeof chatMessageTypeSchema>;
export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;
export type UpdateChatSessionInput = z.infer<typeof updateChatSessionSchema>;
export type ChatSessionResponse = z.infer<typeof chatSessionResponseSchema>;
export type CreateChatMessageInput = z.infer<typeof createChatMessageSchema>;
export type ChatMessageResponse = z.infer<typeof chatMessageResponseSchema>;
export type ChatStreamRequest = z.infer<typeof chatStreamRequestSchema>;
export type ChatHistoryQuery = z.infer<typeof chatHistoryQuerySchema>;
