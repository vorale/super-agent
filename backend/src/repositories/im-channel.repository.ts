/**
 * IM Channel Repository
 * Data access for IM channel bindings and thread-session mappings.
 */

import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';

export interface IMChannelBindingEntity {
  id: string;
  organization_id: string;
  business_scope_id: string;
  channel_type: string;
  channel_id: string;
  channel_name: string | null;
  bot_token_enc: string | null;
  webhook_url: string | null;
  config: Record<string, unknown>;
  is_enabled: boolean;
  sticky_session_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface IMThreadSessionEntity {
  id: string;
  binding_id: string;
  thread_id: string;
  session_id: string;
  im_user_id: string | null;
  created_at: Date;
}

export class IMChannelRepository {
  async findByChannelTypeAndId(
    channelType: string,
    channelId: string,
  ): Promise<IMChannelBindingEntity | null> {
    return prisma.im_channel_bindings.findFirst({
      where: { channel_type: channelType, channel_id: channelId, is_enabled: true },
    }) as Promise<IMChannelBindingEntity | null>;
  }

  async findByScope(
    organizationId: string,
    businessScopeId: string,
  ): Promise<IMChannelBindingEntity[]> {
    return prisma.im_channel_bindings.findMany({
      where: { organization_id: organizationId, business_scope_id: businessScopeId },
      orderBy: { created_at: 'desc' },
    }) as Promise<IMChannelBindingEntity[]>;
  }

  async findById(
    id: string,
    organizationId?: string,
  ): Promise<IMChannelBindingEntity | null> {
    const where: Record<string, unknown> = { id };
    if (organizationId) where.organization_id = organizationId;
    return prisma.im_channel_bindings.findFirst({
      where,
    }) as Promise<IMChannelBindingEntity | null>;
  }

  async create(
    data: Omit<IMChannelBindingEntity, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<IMChannelBindingEntity> {
    const createData: Prisma.im_channel_bindingsUncheckedCreateInput = {
      organization_id: data.organization_id,
      business_scope_id: data.business_scope_id,
      channel_type: data.channel_type,
      channel_id: data.channel_id,
      channel_name: data.channel_name,
      bot_token_enc: data.bot_token_enc,
      webhook_url: data.webhook_url,
      config: data.config as Prisma.InputJsonValue,
      is_enabled: data.is_enabled,
      created_by: data.created_by,
    };
    return prisma.im_channel_bindings.create({ data: createData }) as Promise<IMChannelBindingEntity>;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<Pick<IMChannelBindingEntity, 'channel_name' | 'bot_token_enc' | 'webhook_url' | 'config' | 'is_enabled'>>,
  ): Promise<IMChannelBindingEntity | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    const updateData: Prisma.im_channel_bindingsUncheckedUpdateInput = {};
    if (data.channel_name !== undefined) updateData.channel_name = data.channel_name;
    if (data.bot_token_enc !== undefined) updateData.bot_token_enc = data.bot_token_enc;
    if (data.webhook_url !== undefined) updateData.webhook_url = data.webhook_url;
    if (data.config !== undefined) updateData.config = data.config as Prisma.InputJsonValue;
    if (data.is_enabled !== undefined) updateData.is_enabled = data.is_enabled;
    return prisma.im_channel_bindings.update({
      where: { id },
      data: updateData,
    }) as Promise<IMChannelBindingEntity>;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return false;
    await prisma.im_channel_bindings.delete({ where: { id } });
    return true;
  }

  /**
   * Update the sticky session ID for a binding.
   * Used by IM sticky session logic to persist the "main" session reference.
   */
  async updateStickySession(
    bindingId: string,
    stickySessionId: string | null,
  ): Promise<void> {
    await prisma.im_channel_bindings.update({
      where: { id: bindingId },
      data: { sticky_session_id: stickySessionId },
    });
  }
}

export class IMThreadSessionRepository {
  async findByThread(
    bindingId: string,
    threadId: string,
  ): Promise<IMThreadSessionEntity | null> {
    return prisma.im_thread_sessions.findFirst({
      where: { binding_id: bindingId, thread_id: threadId },
    }) as Promise<IMThreadSessionEntity | null>;
  }

  async create(
    data: Omit<IMThreadSessionEntity, 'id' | 'created_at'>,
  ): Promise<IMThreadSessionEntity> {
    return prisma.im_thread_sessions.create({ data }) as Promise<IMThreadSessionEntity>;
  }

  /**
   * Upsert a thread→session mapping.
   * If the (binding_id, thread_id) pair already exists, update the session_id.
   * Otherwise, create a new mapping.
   */
  async upsert(
    data: Omit<IMThreadSessionEntity, 'id' | 'created_at'>,
  ): Promise<IMThreadSessionEntity> {
    return prisma.im_thread_sessions.upsert({
      where: {
        unique_thread_per_binding: {
          binding_id: data.binding_id,
          thread_id: data.thread_id,
        },
      },
      update: {
        session_id: data.session_id,
        im_user_id: data.im_user_id,
      },
      create: data,
    }) as Promise<IMThreadSessionEntity>;
  }
}

export const imChannelRepository = new IMChannelRepository();
export const imThreadSessionRepository = new IMThreadSessionRepository();
