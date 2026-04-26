/**
 * SessionStreamManager
 * Manages multiple concurrent chat session states so that switching sessions
 * doesn't interrupt active streams. Each session has its own messages,
 * stream handle, and sending status.
 */

import type { Message } from '@/types'
import type { ContentBlock } from '@/services/chatStreamService'
import { streamChat, type ChatStreamHandle } from '@/services/chatStreamService'
import { restClient } from '@/services/api/restClient'

export interface SessionState {
  sessionId: string
  messages: Message[]
  isSending: boolean
  streamHandle: ChatStreamHandle | null
  error: string | null
}

type Listener = () => void

class SessionStreamManager {
  private sessions = new Map<string, SessionState>()
  private listeners = new Set<Listener>()

  /**
   * Subscribe to state changes.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  /**
   * Get or create a session state entry.
   */
  getSession(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId)
    if (!state) {
      state = {
        sessionId,
        messages: [],
        isSending: false,
        streamHandle: null,
        error: null,
      }
      this.sessions.set(sessionId, state)
    }
    return state
  }

  /**
   * Check if a session has an active stream.
   */
  isSending(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isSending ?? false
  }

  /**
   * Set messages for a session (e.g. when loading history).
   */
  setMessages(sessionId: string, messages: Message[]): void {
    const state = this.getSession(sessionId)
    state.messages = messages
    this.notify()
  }

  /**
   * Update a specific message in a session by ID.
   */
  updateMessage(sessionId: string, messageId: string, content: string, speakerAgentName?: string, speakerAgentAvatar?: string | null): void {
    const state = this.sessions.get(sessionId)
    if (!state) return
    state.messages = state.messages.map(m =>
      m.id === messageId ? { ...m, content, ...(speakerAgentName !== undefined ? { speakerAgentName, speakerAgentAvatar } : {}) } : m
    )
    this.notify()
  }

  /**
   * Send a message in a session, starting a stream.
   */
  sendMessage(
    sessionId: string,
    content: string,
    options: {
      businessScopeId: string
      agentId?: string
      mentionAgentId?: string
      model?: string
      sopContext: string
    }
  ): void {
    const state = this.getSession(sessionId)

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
    }

    const aiMessageId = `ai-${Date.now()}`
    const aiMessage: Message = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
    }

    state.messages = [...state.messages, userMessage, aiMessage]
    state.isSending = true
    state.error = null
    this.notify()

    const allBlocks: ContentBlock[] = []
    let lastModel: string | undefined

    const handle = streamChat(
      {
        businessScopeId: options.businessScopeId,
        agentId: options.agentId,
        mentionAgentId: options.mentionAgentId,
        message: content.trim(),
        sessionId,
        model: options.model,
        context: { sop_context: options.sopContext },
      },
      {
        onAssistant: (event) => {
          allBlocks.push(...event.content)
          if (event.model) lastModel = event.model
          const serialized = JSON.stringify(allBlocks)
          this.updateMessage(sessionId, aiMessageId, serialized, event.speakerAgentName, event.speakerAgentAvatar)
        },
        onResult: (event) => {
          // result event = AI response complete. Stop loading immediately
          // instead of waiting for [DONE] (which can be delayed by container cleanup).
          const s = this.sessions.get(sessionId)
          if (s) {
            s.isSending = false
            const model = lastModel || event.model
            s.messages = s.messages.map(m =>
              m.id === aiMessageId ? { ...m, model, tokenUsage: event.token_usage } : m
            )
            this.notify()
          }
        },
        onError: (event) => {
          const s = this.sessions.get(sessionId)
          if (s) {
            s.error = event.message || 'Stream error'
            // If the session/scope was not found (stale localStorage), clear the error
            // message so the UI can prompt the user to re-select a scope
            if (event.code === 'HTTP_ERROR' && event.message?.includes('not found')) {
              s.error = 'Session expired. Please start a new conversation.'
            }
            this.notify()
          }
        },
        onPreviewReady: (event) => {
          // Dispatch a custom event so Chat.tsx can open an in-app preview tab
          window.dispatchEvent(new CustomEvent('preview-ready', {
            detail: { url: event.url, name: event.name || 'Preview', appId: event.app_id },
          }))
        },
        onDone: () => {
          const s = this.sessions.get(sessionId)
          if (s) {
            s.streamHandle = null
            // isSending may already be false (set by onResult). This is a fallback.
            s.isSending = false
            if (allBlocks.length === 0) {
              this.updateMessage(sessionId, aiMessageId, 'No response received')
            }
            this.notify()
          }
        },
      },
    )

    state.streamHandle = handle
    this.notify()
  }

  /**
   * Stop the active stream for a session.
   */
  stopStream(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return
    state.streamHandle?.abort()
    state.streamHandle = null
    state.isSending = false
    this.notify()
  }

  /**
   * Try to reconnect to an active backend stream for a session.
   * Returns true if reconnection was started, false if no active stream.
   */
  async reconnectStream(sessionId: string): Promise<boolean> {
    try {
      const statusResp = await restClient.get<{ status: string; streamAvailable: boolean }>(
        `/api/chat/sessions/${sessionId}/status`
      )

      if (statusResp.status !== 'generating' || !statusResp.streamAvailable) {
        // Session might have just finished — reload history to get the final response
        if (statusResp.status === 'idle') {
          try {
            const { RestChatService } = await import('@/services/api/restChatService')
            const history = await RestChatService.getSessionHistory(sessionId)
            this.setMessages(sessionId, history)
          } catch { /* ignore */ }
        }
        return false
      }

      const state = this.getSession(sessionId)
      state.isSending = true
      state.error = null

      // Add a placeholder AI message for the ongoing stream
      const aiMessageId = `ai-reconnect-${Date.now()}`
      const aiMessage: Message = {
        id: aiMessageId,
        type: 'ai',
        content: '',
        timestamp: new Date(),
      }
      state.messages = [...state.messages, aiMessage]
      this.notify()

      // Connect to the reconnect SSE endpoint
      const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
      const response = await fetch(`${baseUrl}/api/chat/sessions/${sessionId}/stream`, {
        headers,
      })

      if (!response.ok) {
        state.isSending = false
        this.notify()
        return false
      }

      const reader = response.body?.getReader()
      if (!reader) {
        state.isSending = false
        this.notify()
        return false
      }

      const allBlocks: ContentBlock[] = []
      const decoder = new TextDecoder()
      let buffer = ''

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') {
                  const s = this.sessions.get(sessionId)
                  if (s) {
                    s.isSending = false
                    s.streamHandle = null
                    this.notify()
                  }
                  // Reload full history from backend to get properly persisted messages
                  try {
                    const { RestChatService } = await import('@/services/api/restChatService')
                    const history = await RestChatService.getSessionHistory(sessionId)
                    this.setMessages(sessionId, history)
                  } catch { /* ignore */ }
                  return
                }
                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'assistant' && Array.isArray(parsed.content)) {
                    allBlocks.push(...parsed.content)
                    this.updateMessage(sessionId, aiMessageId, JSON.stringify(allBlocks), parsed.speakerAgentName, parsed.speakerAgentAvatar)
                  } else if (parsed.type === 'preview_ready' && parsed.url) {
                    window.dispatchEvent(new CustomEvent('preview-ready', {
                      detail: { url: parsed.url, name: parsed.appName || 'Preview', appId: parsed.appId },
                    }))
                  }
                } catch { /* ignore non-JSON */ }
              }
            }
          }
        } finally {
          reader.releaseLock()
          const s = this.sessions.get(sessionId)
          if (s) {
            s.isSending = false
            s.streamHandle = null
            this.notify()
          }
        }
      }

      // Run in background
      processStream().catch(console.error)
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove a session from the manager.
   */
  removeSession(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state?.streamHandle) {
      state.streamHandle.abort()
    }
    this.sessions.delete(sessionId)
  }

  /**
   * Clear error for a session.
   */
  clearError(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      state.error = null
      this.notify()
    }
  }
}

// Singleton
export const sessionStreamManager = new SessionStreamManager()
