/**
 * Support Conversation Repository
 * Data access layer for support_conversations with multi-tenancy support.
 */

import { prisma } from '../config/database.js';

export interface SupportConversationEntity {
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
  first_response_at: Date | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  tags: string[];
  metadata: Record<string, string | number | boolean | null>;
  created_at: Date;
  updated_at: Date;
}

export class SupportRepository {
  async findAll(
    organizationId: string,
    filters?: {
      status?: string;
      channelType?: string;
      assignedAgentId?: string;
      priority?: string;
      customerId?: string;
    },
    skip = 0,
    take = 20,
  ): Promise<{ data: SupportConversationEntity[]; total: number }> {
    const where: Record<string, unknown> = { organization_id: organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.channelType) where.channel_type = filters.channelType;
    if (filters?.assignedAgentId) where.assigned_agent_id = filters.assignedAgentId;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.customerId) where.customer_id = filters.customerId;

    const [data, total] = await Promise.all([
      prisma.support_conversations.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: { customer: true },
      }),
      prisma.support_conversations.count({ where }),
    ]);

    return { data: data as unknown as SupportConversationEntity[], total };
  }

  async findById(id: string, organizationId: string): Promise<SupportConversationEntity | null> {
    return prisma.support_conversations.findFirst({
      where: { id, organization_id: organizationId },
      include: { customer: true },
    }) as unknown as SupportConversationEntity | null;
  }

  async create(
    data: Omit<SupportConversationEntity, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<SupportConversationEntity> {
    return prisma.support_conversations.create({ data }) as unknown as SupportConversationEntity;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<SupportConversationEntity, 'id' | 'organization_id' | 'created_at'>>,
  ): Promise<SupportConversationEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    return prisma.support_conversations.update({
      where: { id },
      data,
    }) as unknown as SupportConversationEntity;
  }

  async findBySessionId(sessionId: string, organizationId: string): Promise<SupportConversationEntity | null> {
    return prisma.support_conversations.findFirst({
      where: { session_id: sessionId, organization_id: organizationId },
    }) as unknown as SupportConversationEntity | null;
  }

  async findRecentByOrg(
    organizationId: string,
    options: { hours?: number; status?: string; maxConfidence?: number; minSentiment?: number },
  ): Promise<SupportConversationEntity[]> {
    const where: Record<string, unknown> = { organization_id: organizationId };
    if (options.hours) {
      where.created_at = { gte: new Date(Date.now() - options.hours * 3600_000) };
    }
    if (options.status) where.status = options.status;
    if (options.maxConfidence !== undefined) {
      where.ai_confidence = { lt: options.maxConfidence };
    }

    return prisma.support_conversations.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
    }) as unknown as SupportConversationEntity[];
  }
}

export const supportRepository = new SupportRepository();
