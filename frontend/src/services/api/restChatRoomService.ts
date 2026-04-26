/**
 * REST Chat Room Service
 * Frontend API client for group chat room management.
 */

import { restClient } from './restClient';

// ============================================================================
// Types
// ============================================================================

export interface RoomMember {
  id: string;
  session_id: string;
  agent_id: string;
  role: 'primary' | 'member';
  is_active: boolean;
  source_scope_id: string | null;
  joined_at: string;
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

export interface ChatRoom {
  id: string;
  organization_id: string;
  user_id: string;
  business_scope_id: string | null;
  title: string | null;
  status: string;
  room_mode: 'single' | 'group';
  routing_strategy: 'auto';
  created_at: string;
  updated_at: string;
  members: RoomMember[];
}

export interface RouteDecision {
  targetAgentId: string;
  targetAgentName: string;
  confidence: number;
  reasoning: string;
  routedBy: 'mention' | 'context' | 'auto' | 'uncertain';
}

export interface RoomMessage {
  id: string;
  session_id: string;
  type: 'user' | 'agent' | 'ai' | 'system';
  content: string;
  agent_id: string | null;
  mention_agent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SuggestedAgent {
  name: string;
  display_name: string;
  role: string;
  description: string;
  responsibilities: string[];
  capabilities: string[];
  system_prompt: string;
  suggested_tools: Array<{ name: string; display_name: string; description: string; skill_md: string }>;
}

// ============================================================================
// Service
// ============================================================================

export const RestChatRoomService = {
  // Room lifecycle
  async createRoom(options: {
    title?: string;
    business_scope_id?: string;
    agent_ids: string[];
  }): Promise<ChatRoom> {
    return restClient.post<ChatRoom>('/api/chat/rooms', options);
  },

  async createRoomFromScope(businessScopeId: string): Promise<ChatRoom> {
    return restClient.post<ChatRoom>('/api/chat/rooms/from-scope', { business_scope_id: businessScopeId });
  },

  async createCrossScopeRoom(options: {
    title?: string;
    primary_scope_id?: string;
    members: Array<{ agent_id: string; scope_id: string }>;
  }): Promise<ChatRoom> {
    return restClient.post<ChatRoom>('/api/chat/rooms/cross-scope', options);
  },

  async getRoom(roomId: string): Promise<ChatRoom> {
    return restClient.get<ChatRoom>(`/api/chat/rooms/${roomId}`);
  },

  async deleteRoom(roomId: string): Promise<void> {
    await restClient.delete(`/api/chat/rooms/${roomId}`);
  },

  // Member management
  async getMembers(roomId: string): Promise<RoomMember[]> {
    const res = await restClient.get<{ members: RoomMember[] }>(`/api/chat/rooms/${roomId}/members`);
    return res.members;
  },

  async addMember(roomId: string, agentId: string, sourceScopeId?: string): Promise<void> {
    await restClient.post(`/api/chat/rooms/${roomId}/members`, {
      agent_id: agentId,
      source_scope_id: sourceScopeId,
    });
  },

  async removeMember(roomId: string, agentId: string): Promise<void> {
    await restClient.delete(`/api/chat/rooms/${roomId}/members/${agentId}`);
  },

  // Messaging
  async sendMessage(roomId: string, content: string, mentionAgentId?: string): Promise<{ route: RouteDecision; response?: string; error?: string }> {
    return restClient.post<{ route: RouteDecision; response?: string; error?: string }>(`/api/chat/rooms/${roomId}/messages`, {
      content,
      mention_agent_id: mentionAgentId,
    });
  },

  async getMessages(roomId: string, limit?: number, before?: string): Promise<RoomMessage[]> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (before) params.set('before', before);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await restClient.get<{ messages: RoomMessage[] }>(`/api/chat/rooms/${roomId}/messages${query}`);
    return res.messages;
  },

  // In-room agent creation
  async suggestAgent(roomId: string, description: string): Promise<{
    suggested_agent: SuggestedAgent;
    follow_up_questions: string[];
    confidence: number;
  }> {
    return restClient.post(`/api/chat/rooms/${roomId}/create-agent`, { description });
  },

  async confirmCreateAgent(roomId: string, agentDef: {
    name: string;
    display_name: string;
    role?: string;
    system_prompt?: string;
    tools?: unknown[];
  }): Promise<{ agent: Record<string, unknown> }> {
    return restClient.post(`/api/chat/rooms/${roomId}/create-agent/confirm`, agentDef);
  },
};
