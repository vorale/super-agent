/**
 * Chat Room Member Repository
 * Manages agent membership in chat rooms (group mode sessions).
 */

import { prisma } from '../config/database.js';

export interface ChatRoomMemberEntity {
  id: string;
  session_id: string;
  agent_id: string;
  role: 'primary' | 'member';
  is_active: boolean;
  added_by: string | null;
  source_scope_id: string | null;
  joined_at: Date;
}

export interface ChatRoomMemberWithAgent extends ChatRoomMemberEntity {
  agent: {
    id: string;
    name: string;
    display_name: string;
    role: string | null;
    avatar: string | null;
    system_prompt: string | null;
    status: string;
    business_scope_id: string | null;
  };
}

export class ChatRoomMemberRepository {
  async findBySession(sessionId: string, activeOnly = true): Promise<ChatRoomMemberWithAgent[]> {
    const where: Record<string, unknown> = { session_id: sessionId };
    if (activeOnly) where.is_active = true;

    return prisma.chat_room_members.findMany({
      where,
      include: {
        agent: {
          select: {
            id: true, name: true, display_name: true,
            role: true, avatar: true, system_prompt: true, status: true,
            business_scope_id: true,
          },
        },
      },
      orderBy: [{ joined_at: 'asc' }],
    }) as unknown as Promise<ChatRoomMemberWithAgent[]>;
  }

  async addMember(
    sessionId: string,
    agentId: string,
    role: 'primary' | 'member' = 'member',
    addedBy?: string,
    sourceScopeId?: string,
  ): Promise<ChatRoomMemberEntity> {
    return prisma.chat_room_members.upsert({
      where: { unique_room_member: { session_id: sessionId, agent_id: agentId } },
      update: { is_active: true },
      create: {
        session_id: sessionId,
        agent_id: agentId,
        role: 'member',
        added_by: addedBy ?? null,
        source_scope_id: sourceScopeId ?? null,
      },
    }) as unknown as Promise<ChatRoomMemberEntity>;
  }

  async removeMember(sessionId: string, agentId: string): Promise<void> {
    await prisma.chat_room_members.updateMany({
      where: { session_id: sessionId, agent_id: agentId },
      data: { is_active: false },
    });
  }

  async isMember(sessionId: string, agentId: string): Promise<boolean> {
    const count = await prisma.chat_room_members.count({
      where: { session_id: sessionId, agent_id: agentId, is_active: true },
    });
    return count > 0;
  }

  async countActive(sessionId: string): Promise<number> {
    return prisma.chat_room_members.count({
      where: { session_id: sessionId, is_active: true },
    });
  }
}

export const chatRoomMemberRepository = new ChatRoomMemberRepository();
