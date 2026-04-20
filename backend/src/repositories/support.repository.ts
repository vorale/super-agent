import { BaseRepository, type FindAllOptions } from './base.repository.js';

export type ConversationStatus = 'open' | 'pending_customer' | 'pending_agent' | 'resolved' | 'closed';
export type ConversationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ChannelType = 'web_widget' | 'slack' | 'dingtalk' | 'feishu' | 'wechat' | 'email' | 'phone';

export interface SupportConversationEntity {
  id: string;
  organization_id: string;
  session_id: string | null;
  channel_type: ChannelType;
  channel_id: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  assigned_agent_id: string | null;
  customer_id: string | null;
  ai_confidence: number | null;
  sentiment_score: number | null;
  first_response_at: Date | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  tags: unknown[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export class SupportConversationRepository extends BaseRepository<SupportConversationEntity> {
  constructor() {
    super('support_conversations');
  }

  async findByStatus(
    organizationId: string,
    status: ConversationStatus,
    options?: Omit<FindAllOptions<SupportConversationEntity>, 'where'>
  ): Promise<SupportConversationEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { status },
    });
  }

  async findByAgent(
    organizationId: string,
    agentId: string,
    options?: Omit<FindAllOptions<SupportConversationEntity>, 'where'>
  ): Promise<SupportConversationEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { assigned_agent_id: agentId },
    });
  }

  async findByCustomer(
    organizationId: string,
    customerId: string,
    options?: Omit<FindAllOptions<SupportConversationEntity>, 'where'>
  ): Promise<SupportConversationEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { customer_id: customerId },
    });
  }

  async findByChannel(
    organizationId: string,
    channelType: ChannelType,
    options?: Omit<FindAllOptions<SupportConversationEntity>, 'where'>
  ): Promise<SupportConversationEntity[]> {
    return this.findAll(organizationId, {
      ...options,
      where: { channel_type: channelType },
    });
  }
}

export const supportConversationRepository = new SupportConversationRepository();
