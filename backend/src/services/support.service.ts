import { prisma } from '../config/database.js';
import {
  supportConversationRepository,
  type SupportConversationEntity,
  type ConversationStatus,
  type ConversationPriority,
  type ChannelType,
} from '../repositories/support.repository.js';
import {
  customerProfileRepository,
  type CustomerProfileEntity,
} from '../repositories/customer-profile.repository.js';

export interface CreateConversationInput {
  organizationId: string;
  sessionId?: string;
  channelType: ChannelType;
  channelId?: string;
  customerId?: string;
  priority?: ConversationPriority;
}

export interface CreateOrUpdateCustomerInput {
  organizationId: string;
  externalId?: string;
  name: string;
  email?: string;
  phone?: string;
  sourceChannel?: string;
}

class SupportService {
  // ── Conversations ──────────────────────────────────────────

  async createConversation(input: CreateConversationInput): Promise<SupportConversationEntity> {
    return supportConversationRepository.create({
      organization_id: input.organizationId,
      session_id: input.sessionId ?? null,
      channel_type: input.channelType,
      channel_id: input.channelId ?? null,
      status: 'open',
      priority: input.priority ?? 'medium',
      customer_id: input.customerId ?? null,
    } as unknown as SupportConversationEntity);
  }

  async getConversation(id: string, organizationId: string): Promise<SupportConversationEntity | null> {
    return supportConversationRepository.findById(id, organizationId);
  }

  async listConversations(
    organizationId: string,
    filters?: {
      status?: ConversationStatus;
      channelType?: ChannelType;
      assignedAgentId?: string;
      priority?: ConversationPriority;
    },
    options?: { skip?: number; take?: number; orderBy?: Record<string, 'asc' | 'desc'> },
  ): Promise<SupportConversationEntity[]> {
    const where: Partial<SupportConversationEntity> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.channelType) where.channel_type = filters.channelType;
    if (filters?.assignedAgentId) where.assigned_agent_id = filters.assignedAgentId;
    if (filters?.priority) where.priority = filters.priority;

    return supportConversationRepository.findAll(organizationId, {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: options?.orderBy ?? { created_at: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  async assignAgent(conversationId: string, organizationId: string, agentId: string): Promise<SupportConversationEntity> {
    await supportConversationRepository.update(conversationId, organizationId, {
      assigned_agent_id: agentId,
      status: 'open',
    } as unknown as Partial<SupportConversationEntity>);
    return supportConversationRepository.findById(conversationId, organizationId) as Promise<SupportConversationEntity>;
  }

  async resolveConversation(conversationId: string, organizationId: string, notes?: string): Promise<SupportConversationEntity> {
    await supportConversationRepository.update(conversationId, organizationId, {
      status: 'resolved',
      resolved_at: new Date(),
      resolution_notes: notes ?? null,
    } as unknown as Partial<SupportConversationEntity>);
    return supportConversationRepository.findById(conversationId, organizationId) as Promise<SupportConversationEntity>;
  }

  async closeConversation(conversationId: string, organizationId: string): Promise<SupportConversationEntity> {
    await supportConversationRepository.update(conversationId, organizationId, {
      status: 'closed',
    } as unknown as Partial<SupportConversationEntity>);
    return supportConversationRepository.findById(conversationId, organizationId) as Promise<SupportConversationEntity>;
  }

  async requestHumanHandoff(conversationId: string, organizationId: string): Promise<SupportConversationEntity> {
    await supportConversationRepository.update(conversationId, organizationId, {
      status: 'pending_agent',
    } as unknown as Partial<SupportConversationEntity>);
    return supportConversationRepository.findById(conversationId, organizationId) as Promise<SupportConversationEntity>;
  }

  async updateConfidence(conversationId: string, organizationId: string, confidence: number): Promise<void> {
    await supportConversationRepository.update(conversationId, organizationId, {
      ai_confidence: confidence,
    } as unknown as Partial<SupportConversationEntity>);
  }

  // ── Customer Profiles ──────────────────────────────────────

  async createOrUpdateCustomer(input: CreateOrUpdateCustomerInput): Promise<CustomerProfileEntity> {
    // Try to find existing customer by external_id or email
    let existing: CustomerProfileEntity | null = null;
    if (input.externalId) {
      existing = await customerProfileRepository.findByExternalId(input.organizationId, input.externalId);
    }
    if (!existing && input.email) {
      existing = await customerProfileRepository.findByEmail(input.organizationId, input.email);
    }

    if (existing) {
      await customerProfileRepository.update(existing.id, input.organizationId, {
        name: input.name,
        email: input.email ?? existing.email,
        phone: input.phone ?? existing.phone,
        source_channel: input.sourceChannel ?? existing.source_channel,
      } as unknown as Partial<CustomerProfileEntity>);
      return customerProfileRepository.findById(existing.id, input.organizationId) as Promise<CustomerProfileEntity>;
    }

    return customerProfileRepository.create({
      organization_id: input.organizationId,
      external_id: input.externalId ?? null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source_channel: input.sourceChannel ?? null,
    } as unknown as CustomerProfileEntity);
  }

  async getCustomerProfile(id: string, organizationId: string): Promise<CustomerProfileEntity | null> {
    return customerProfileRepository.findById(id, organizationId);
  }

  async getCustomerConversations(customerId: string, organizationId: string): Promise<SupportConversationEntity[]> {
    return supportConversationRepository.findByCustomer(organizationId, customerId, {
      orderBy: { created_at: 'desc' },
      take: 20,
    });
  }
}

export const supportService = new SupportService();
