/**
 * Chat Repository
 * Data access layer for ChatSession and ChatMessage entities with multi-tenancy support.
 * Requirements: 8.1, 8.4, 8.5, 8.6, 8.7
 */

import { BaseRepository, type FindAllOptions } from './base.repository.js';
import { prisma } from '../config/database.js';

/**
 * ChatSession entity type matching the Prisma schema
 */
export type SessionStatus = 'idle' | 'generating' | 'error';

export type SessionSource = 'web' | 'im';

export interface ChatSessionEntity {
  id: string;
  organization_id: string;
  user_id: string;
  business_scope_id: string | null;
  agent_id: string | null;
  claude_session_id: string | null;
  title: string | null;
  status: SessionStatus;
  source: SessionSource;
  sop_context: string | null;
  context: Record<string, unknown>;
  room_mode: 'single' | 'group';
  routing_strategy: 'auto' | 'mention' | 'round_robin';
  is_starred: boolean;
  starred_at: Date | null;
  starred_by: string | null;
  star_category: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * ChatMessage entity type matching the Prisma schema
 */
export interface ChatMessageEntity {
  id: string;
  organization_id: string;
  session_id: string;
  type: 'user' | 'agent' | 'ai' | 'system';
  content: string;
  agent_id: string | null;
  mention_agent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/**
 * ChatSession Repository class extending BaseRepository with session-specific methods.
 * Provides multi-tenancy filtering for all operations.
 */
export class ChatSessionRepository extends BaseRepository<ChatSessionEntity> {
  constructor() {
    super('chat_sessions');
  }

  /**
   * Find all sessions for a specific user within an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @param userId - The user ID to filter by
   * @param options - Optional query options (pagination, ordering)
   * @returns Array of chat sessions for the user
   */
  async findByUser(
    organizationId: string,
    userId: string,
    options?: Omit<FindAllOptions<ChatSessionEntity>, 'where'>
  ): Promise<ChatSessionEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { user_id: userId },
    });
  }

  /**
   * Find session by SOP context within an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @param sopContext - The SOP context to search for
   * @returns The session if found, null otherwise
   */
  async findBySopContext(
    organizationId: string,
    sopContext: string
  ): Promise<ChatSessionEntity | null> {
    return this.findFirst(organizationId, { sop_context: sopContext });
  }

  /**
   * Create a new chat session for a user.
   *
   * @param data - The session data
   * @param organizationId - The organization ID
   * @param userId - The user ID
   * @returns The created session
   */
  async createForUser(
    data: Omit<
      ChatSessionEntity,
      'id' | 'organization_id' | 'user_id' | 'created_at' | 'updated_at'
    >,
    organizationId: string,
    userId: string
  ): Promise<ChatSessionEntity> {
    return this.getModel().create({
      data: {
        ...data,
        organization_id: organizationId,
        user_id: userId,
      },
    });
  }

  /**
   * Get session with messages included.
   *
   * @param id - The session ID
   * @param organizationId - The organization ID to filter by
   * @returns The session with messages, or null if not found
   */
  async findByIdWithMessages(
    id: string,
    organizationId: string
  ): Promise<(ChatSessionEntity & { chat_messages: ChatMessageEntity[] }) | null> {
    return this.findById(id, organizationId, {
      include: { chat_messages: { orderBy: { created_at: 'asc' } } },
    }) as Promise<(ChatSessionEntity & { chat_messages: ChatMessageEntity[] }) | null>;
  }

  /**
   * Find all sessions for a business scope within an organization.
   */
  async findByBusinessScope(
    organizationId: string,
    businessScopeId: string,
    userId?: string,
  ): Promise<ChatSessionEntity[]> {
    const where: Record<string, unknown> = { business_scope_id: businessScopeId };
    if (userId) where.user_id = userId;
    return this.findAll(organizationId, {
      where: where as Partial<ChatSessionEntity>,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Update the Claude SDK session ID on a chat session.
   */
  async updateClaudeSessionId(
    id: string,
    organizationId: string,
    claudeSessionId: string,
  ): Promise<void> {
    await this.update(id, organizationId, { claude_session_id: claudeSessionId } as Partial<ChatSessionEntity>);
  }

  /**
   * Update the status of a chat session.
   */
  async updateStatus(
    id: string,
    organizationId: string,
    status: SessionStatus,
  ): Promise<void> {
    await this.update(id, organizationId, { status } as Partial<ChatSessionEntity>);
  }

  /**
   * Star (favorite) a chat session.
   */
  async star(id: string, organizationId: string, userId: string, category?: string): Promise<ChatSessionEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    return this.getModel().update({
      where: { id },
      data: { is_starred: true, starred_at: new Date(), starred_by: userId, star_category: category ?? null },
    });
  }

  /**
   * Unstar a chat session.
   */
  async unstar(id: string, organizationId: string): Promise<ChatSessionEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    return this.getModel().update({
      where: { id },
      data: { is_starred: false, starred_at: null, starred_by: null, star_category: null },
    });
  }

  /**
   * Update the star category on an already-starred session.
   */
  async updateStarCategory(id: string, organizationId: string, category: string | null): Promise<ChatSessionEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    return this.getModel().update({
      where: { id },
      data: { star_category: category },
    });
  }

  /**
   * Find all starred sessions for an organization.
   * Optionally filter by scope or user.
   */
  async findStarred(
    organizationId: string,
    filters?: { scopeId?: string; userId?: string },
  ): Promise<(ChatSessionEntity & { business_scope?: { id: string; name: string; icon: string | null } | null })[]> {
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      is_starred: true,
    };
    if (filters?.scopeId) where.business_scope_id = filters.scopeId;
    if (filters?.userId) where.starred_by = filters.userId;

    return prisma.chat_sessions.findMany({
      where,
      include: {
        business_scope: { select: { id: true, name: true, icon: true } },
      },
      orderBy: { starred_at: 'desc' },
    }) as any;
  }
}

/**
 * ChatMessage Repository class for message-specific operations.
 * Note: Messages don't extend BaseRepository directly since they have
 * a different structure (no updated_at field).
 */
export class ChatMessageRepository {
  /**
   * Find all messages for a session within an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @param sessionId - The session ID to filter by
   * @param options - Optional query options (limit, before cursor)
   * @returns Array of chat messages
   */
  async findBySession(
    organizationId: string,
    sessionId: string,
    options?: { limit?: number; before?: Date }
  ): Promise<ChatMessageEntity[]> {
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      session_id: sessionId,
    };

    if (options?.before) {
      where.created_at = { lt: options.before };
    }

    return prisma.chat_messages.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: options?.limit ?? 50,
    }) as Promise<ChatMessageEntity[]>;
  }

  /**
   * Find a message by ID within an organization.
   *
   * @param id - The message ID
   * @param organizationId - The organization ID to filter by
   * @returns The message if found, null otherwise
   */
  async findById(id: string, organizationId: string): Promise<ChatMessageEntity | null> {
    return prisma.chat_messages.findFirst({
      where: {
        id,
        organization_id: organizationId,
      },
    }) as Promise<ChatMessageEntity | null>;
  }

  /**
   * Create a new chat message.
   *
   * @param data - The message data
   * @param organizationId - The organization ID
   * @returns The created message
   */
  async create(
    data: Omit<ChatMessageEntity, 'id' | 'organization_id' | 'created_at'>,
    organizationId: string
  ): Promise<ChatMessageEntity> {
    return prisma.chat_messages.create({
      data: {
        session_id: data.session_id,
        type: data.type,
        content: data.content,
        agent_id: data.agent_id ?? undefined,
        mention_agent_id: data.mention_agent_id ?? undefined,
        metadata: (data.metadata ?? {}) as Record<string, unknown> & { [key: string]: unknown },
        organization_id: organizationId,
      },
    }) as unknown as Promise<ChatMessageEntity>;
  }

  /**
   * Delete all messages for a session within an organization.
   *
   * @param organizationId - The organization ID to filter by
   * @param sessionId - The session ID
   * @returns The count of deleted messages
   */
  async deleteBySession(organizationId: string, sessionId: string): Promise<number> {
    const result = await prisma.chat_messages.deleteMany({
      where: {
        organization_id: organizationId,
        session_id: sessionId,
      },
    });
    return result.count;
  }

  /**
   * Count messages in a session.
   *
   * @param organizationId - The organization ID to filter by
   * @param sessionId - The session ID
   * @returns The count of messages
   */
  async countBySession(organizationId: string, sessionId: string): Promise<number> {
    return prisma.chat_messages.count({
      where: {
        organization_id: organizationId,
        session_id: sessionId,
      },
    });
  }

  /**
   * Get the latest message in a session.
   *
   * @param organizationId - The organization ID to filter by
   * @param sessionId - The session ID
   * @returns The latest message, or null if none exist
   */
  async findLatestBySession(
    organizationId: string,
    sessionId: string
  ): Promise<ChatMessageEntity | null> {
    return prisma.chat_messages.findFirst({
      where: {
        organization_id: organizationId,
        session_id: sessionId,
      },
      orderBy: { created_at: 'desc' },
    }) as Promise<ChatMessageEntity | null>;
  }
}

// Export singleton instances
export const chatSessionRepository = new ChatSessionRepository();
export const chatMessageRepository = new ChatMessageRepository();
