/**
 * REST Chat Service
 * 
 * Implements the chat service interface using the REST API backend.
 * Supports SSE streaming for real-time AI responses.
 */

import { restClient, getAuthToken } from './restClient';
import type { Message, ChatContext, ContextMemory, UseCase, RelatedLink, QuickQuestion } from '@/types';
import { ServiceError } from '@/utils/errorHandling';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * API response type for chat sessions
 */
interface ApiChatSession {
  id: string;
  organization_id: string;
  user_id: string;
  agent_id?: string;
  business_scope_id?: string | null;
  claude_session_id?: string | null;
  title?: string | null;
  status?: string;
  sop_context: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * API response type for chat messages
 */
interface ApiChatMessage {
  id: string;
  organization_id: string;
  session_id: string;
  type: string;
  content: string;
  created_at: string;
}

// Store current session and agent
let currentSessionId: string | null = null;
let currentAgentId: string | null = null;

/**
 * Maps API chat message to application Message type
 */
function mapApiMessageToMessage(apiMessage: ApiChatMessage): Message {
  return {
    id: apiMessage.id,
    type: apiMessage.type as 'user' | 'ai',
    content: apiMessage.content,
    timestamp: new Date(apiMessage.created_at),
  };
}

/**
 * Parses context JSON to ChatContext type
 */
function parseContext(context: unknown): ChatContext {
  const defaultContext: ChatContext = {
    memories: [],
    useCases: [],
    relatedLinks: [],
  };

  if (typeof context !== 'object' || context === null) {
    return defaultContext;
  }

  const ctx = context as Record<string, unknown>;

  return {
    memories: parseMemories(ctx.memories),
    useCases: parseUseCases(ctx.useCases),
    relatedLinks: parseRelatedLinks(ctx.relatedLinks),
  };
}

function parseMemories(memories: unknown): ContextMemory[] {
  if (!Array.isArray(memories)) return [];
  return memories
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m, index) => ({
      id: typeof m.id === 'string' ? m.id : `mem-${index}`,
      content: typeof m.content === 'string' ? m.content : '',
    }));
}

function parseUseCases(useCases: unknown): UseCase[] {
  if (!Array.isArray(useCases)) return [];
  return useCases
    .filter((u): u is Record<string, unknown> => typeof u === 'object' && u !== null)
    .map((u, index) => ({
      id: typeof u.id === 'string' ? u.id : `uc-${index}`,
      title: typeof u.title === 'string' ? u.title : '',
      description: typeof u.description === 'string' ? u.description : '',
    }));
}

function parseRelatedLinks(links: unknown): RelatedLink[] {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
    .map((l, index) => ({
      id: typeof l.id === 'string' ? l.id : `link-${index}`,
      title: typeof l.title === 'string' ? l.title : '',
      url: typeof l.url === 'string' ? l.url : '',
    }));
}

/**
 * REST implementation of the Chat Service with SSE streaming support
 */
export const RestChatService = {
  /**
   * Sets the current agent for chat
   */
  setCurrentAgent(agentId: string): void {
    currentAgentId = agentId;
    // Reset session when agent changes
    currentSessionId = null;
  },

  /**
   * Gets the current agent ID
   */
  getCurrentAgentId(): string | null {
    return currentAgentId;
  },

  /**
   * Ensures a session exists, creates one if needed
   */
  async ensureSession(sopContext?: string, businessScopeId?: string): Promise<string> {
    if (currentSessionId) {
      return currentSessionId;
    }

    const session = await this.createSession(sopContext, businessScopeId);
    currentSessionId = session.id;
    return session.id;
  },

  /**
   * Sends a message and receives AI response via SSE streaming
   */
  async sendMessage(sessionId: string, content: string, sopContext: string): Promise<Message> {
    if (!content.trim()) {
      throw new ServiceError('Message content cannot be empty', 'VALIDATION_ERROR');
    }

    if (!currentAgentId) {
      throw new ServiceError('No agent selected. Please select an agent to chat with.', 'VALIDATION_ERROR');
    }

    try {
      // Ensure we have a valid session
      const validSessionId = await this.ensureSession(sopContext);

      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Use streaming endpoint
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent_id: currentAgentId,
          session_id: validSessionId,
          message: content.trim(),
          context: { sop_context: sopContext },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new ServiceError(
          errorBody.error || `Request failed with status ${response.status}`,
          'SERVER_ERROR',
          response.status
        );
      }

      // Read the full SSE response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new ServiceError('No response body', 'UNKNOWN');
      }

      const decoder = new TextDecoder();
      const allContentBlocks: Array<{ type: string; [key: string]: unknown }> = [];
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(data);
                // Handle assistant events with content block arrays
                if (parsed.type === 'assistant' && Array.isArray(parsed.content)) {
                  allContentBlocks.push(...parsed.content);
                }
              } catch {
                // Ignore non-JSON data
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Build the response content:
      // Store as JSON content blocks so MessageList can render them richly
      let responseContent: string;
      if (allContentBlocks.length > 0) {
        responseContent = JSON.stringify(allContentBlocks);
      } else {
        responseContent = 'No response received';
      }

      // Return the AI response as a message
      return {
        id: `msg-${Date.now()}`,
        type: 'ai',
        content: responseContent,
        timestamp: new Date(),
      };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to send message', 'UNKNOWN');
    }
  },

  /**
   * Retrieves chat history for a session
   */
  async getHistory(_sessionId: string): Promise<Message[]> {
    try {
      // Use the current session (backend-created UUID)
      const validSessionId = currentSessionId;
      
      // If no valid UUID session, return empty
      if (!validSessionId || !validSessionId.match(/^[0-9a-f-]{36}$/i)) {
        return [];
      }

      const response = await restClient.get<ApiChatMessage[]>(
        `/api/chat/history/${validSessionId}`
      );
      if (!Array.isArray(response)) {
        console.warn('[getHistory] Expected array, got:', typeof response, response);
        return [];
      }
      return response.map(mapApiMessageToMessage);
    } catch (error) {
      // Return empty array if session not found
      if (error instanceof ServiceError && error.code === 'NOT_FOUND') {
        return [];
      }
      // For other errors, also return empty to not break the UI
      console.warn('Failed to fetch chat history:', error);
      return [];
    }
  },

  /**
   * Clears chat history for a session
   */
  async clearHistory(sessionId: string): Promise<void> {
    try {
      const validSessionId = currentSessionId || sessionId;
      
      if (!validSessionId || !validSessionId.match(/^[0-9a-f-]{36}$/i)) {
        return;
      }

      await restClient.delete(`/api/chat/sessions/${validSessionId}`);
      currentSessionId = null;
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'NOT_FOUND') {
        currentSessionId = null;
        return;
      }
      throw new ServiceError('Failed to clear chat history', 'UNKNOWN');
    }
  },

  /**
   * Retrieves context information for an SOP
   */
  async getContext(sopContext: string): Promise<ChatContext> {
    try {
      const response = await restClient.get<ApiChatSession>(
        `/api/chat/context/${sopContext}`
      );
      return parseContext(response.context);
    } catch (error) {
      // Return default context if not found
      return { memories: [], useCases: [], relatedLinks: [] };
    }
  },

  /**
   * Gets LLM-generated quick questions for a business scope
   */
  async getQuickQuestions(businessScopeId: string): Promise<QuickQuestion[]> {
    try {
      const body: Record<string, unknown> = {};
      if (businessScopeId) {
        body.business_scope_id = businessScopeId;
      }
      console.log('[quick-questions] Requesting with body:', body);

      const questions = await restClient.post<QuickQuestion[]>('/api/chat/quick-questions', body);
      console.log('[quick-questions] Got response:', questions?.length, 'questions');
      return questions;
    } catch (error) {
      console.error('[quick-questions] API call failed:', error);
      return [
        { id: 'qq-1', icon: '❓', category: 'General', text: 'What can you help me with?' },
        { id: 'qq-2', icon: '📝', category: 'General', text: 'How do I get started?' },
      ];
    }
  },

  /**
   * Creates a new chat session
   */
  async createSession(sopContext?: string, businessScopeId?: string): Promise<ApiChatSession> {
    try {
      const body = {
        sop_context: sopContext || null,
        business_scope_id: businessScopeId || null,
        provision_workspace: !!businessScopeId,
      };
      console.log('[RestChatService] createSession body:', JSON.stringify(body));
      const response = await restClient.post<ApiChatSession>('/api/chat/sessions', body);
      console.log('[RestChatService] createSession response id:', response.id, 'scope:', response.business_scope_id);
      return response;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to create chat session', 'UNKNOWN');
    }
  },

  /**
   * Gets all sessions for the current user, optionally filtered by scope
   */
  async getSessions(businessScopeId?: string): Promise<ApiChatSession[]> {
    try {
      const qs = businessScopeId ? `?business_scope_id=${businessScopeId}` : '';
      const response = await restClient.get<ApiChatSession[]>(`/api/chat/sessions${qs}`);
      if (!Array.isArray(response)) {
        console.warn('[getSessions] Expected array, got:', typeof response, response);
        return [];
      }
      return response;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to fetch chat sessions', 'UNKNOWN');
    }
  },

  /**
   * Gets chat history for a specific session by its backend ID
   */
  async getSessionHistory(sessionId: string): Promise<Message[]> {
    try {
      const response = await restClient.get<ApiChatMessage[]>(
        `/api/chat/history/${sessionId}`
      );
      if (!Array.isArray(response)) {
        console.warn('[getSessionHistory] Expected array, got:', typeof response, response);
        return [];
      }
      return response.map(mapApiMessageToMessage);
    } catch (error) {
      console.warn('Failed to fetch session history:', error);
      return [];
    }
  },

  /**
   * Clears chat history for a session (deletes messages but keeps the session).
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    await restClient.delete(`/api/chat/history/${sessionId}`);
  },

  /**
   * Sets the current session ID directly (for loading existing sessions)
   */
  setCurrentSessionId(sessionId: string): void {
    currentSessionId = sessionId;
  },

  /**
   * Resets the current session
   */
  resetSession(): void {
    currentSessionId = null;
  },

  /**
   * Gets the current backend session ID (UUID).
   */
  getCurrentSessionId(): string | null {
    return currentSessionId;
  },
};

export default RestChatService;
