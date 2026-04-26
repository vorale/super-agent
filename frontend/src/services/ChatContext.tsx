import { createContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { Message, ChatContext as ChatContextData, QuickQuestion } from '@/types'
import { ChatService, ChatServiceError } from './chatService'
import { RestChatService } from './api/restChatService'
import { shouldUseRestApi } from './api/index'
import type { ChatStreamHandle } from './chatStreamService'
import { sessionStreamManager } from './SessionStreamManager'

// Storage keys
const CHAT_SESSION_STORAGE_KEY = 'super-agent-chat-session'
const CHAT_SOP_STORAGE_KEY = 'super-agent-chat-sop'
const CHAT_AGENT_STORAGE_KEY = 'super-agent-chat-agent'
const CHAT_SCOPE_STORAGE_KEY = 'super-agent-chat-scope'
const CHAT_BACKEND_SESSION_STORAGE_KEY = 'super-agent-chat-backend-session'

export interface ChatSessionState {
  sessionId: string
  activeSop: string
  selectedAgentId: string | null
  selectedBusinessScopeId: string | null
  backendSessionId: string | null
  messages: Message[]
  context: ChatContextData | null
  quickQuestions: QuickQuestion[]
  quickQuestionsLoading: boolean
  isLoading: boolean
  isSending: boolean
  error: string | null
}

export interface ChatContextType extends ChatSessionState {
  sendMessage: (content: string, mentionAgentId?: string) => Promise<Message | null>
  stopGeneration: () => void
  setActiveSop: (sopId: string) => void
  setSelectedAgent: (agentId: string | null) => void
  setSelectedBusinessScope: (scopeId: string) => void
  /** Currently selected model override (null = use scope default). */
  selectedModel: string | null
  setSelectedModel: (model: string | null) => void
  clearHistory: () => Promise<void>
  clearError: () => void
  refreshContext: () => Promise<void>
  /** Load an existing session by ID (for session history). */
  loadSession: (sessionId: string) => Promise<void>
  /** Start a fresh session (clears messages, resets backend session). */
  startNewSession: () => void
  /** Clear conversation messages but keep the session and workspace intact. */
  clearConversation: () => void
}

const defaultState: ChatSessionState = {
  sessionId: '',
  activeSop: 'default',
  selectedAgentId: null,
  selectedBusinessScopeId: null,
  backendSessionId: null,
  messages: [],
  context: null,
  quickQuestions: [],
  quickQuestionsLoading: false,
  isLoading: true,
  isSending: false,
  error: null,
}

const defaultContext: ChatContextType = {
  ...defaultState,
  sendMessage: async (_content: string, _mentionAgentId?: string) => null,
  stopGeneration: () => {},
  setActiveSop: () => {},
  setSelectedAgent: () => {},
  setSelectedBusinessScope: () => {},
  selectedModel: null,
  setSelectedModel: () => {},
  clearHistory: async () => {},
  clearError: () => {},
  refreshContext: async () => {},
  loadSession: async () => {},
  startNewSession: () => {},
  clearConversation: () => {},
}

export const ChatContext = createContext<ChatContextType>(defaultContext)

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return generateSessionId()
  const stored = localStorage.getItem(CHAT_SESSION_STORAGE_KEY)
  if (stored) return stored
  const newId = generateSessionId()
  localStorage.setItem(CHAT_SESSION_STORAGE_KEY, newId)
  return newId
}

function getStoredSop(): string {
  if (typeof window === 'undefined') return 'default'
  return localStorage.getItem(CHAT_SOP_STORAGE_KEY) || 'default'
}

function getStoredAgentId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CHAT_AGENT_STORAGE_KEY) || null
}

function getStoredScopeId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CHAT_SCOPE_STORAGE_KEY) || null
}

interface ChatProviderProps {
  children: ReactNode
  initialSessionId?: string
  initialSop?: string
  initialAgentId?: string
  initialScopeId?: string
}

export function ChatProvider({ children, initialSessionId, initialSop, initialAgentId, initialScopeId }: ChatProviderProps) {
  const [sessionId] = useState<string>(() => initialSessionId || getOrCreateSessionId())
  const [activeSop, setActiveSopState] = useState<string>(() => initialSop || getStoredSop())
  const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(() => initialAgentId || getStoredAgentId())
  const [selectedBusinessScopeId, setSelectedBusinessScopeIdState] = useState<string | null>(() => initialScopeId || getStoredScopeId())
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [context, setContext] = useState<ChatContextData | null>(null)
  const [quickQuestions, setQuickQuestions] = useState<QuickQuestion[]>([])
  const [quickQuestionsLoading, setQuickQuestionsLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backendSessionId, setBackendSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(CHAT_BACKEND_SESSION_STORAGE_KEY) || null
  })

  // Subscribe to SessionStreamManager for reactive updates
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return sessionStreamManager.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  // Derive messages and isSending from the manager for the active session
  const managerState = backendSessionId ? sessionStreamManager.getSession(backendSessionId) : null
  const messages = managerState?.messages ?? []
  const isSending = managerState?.isSending ?? false
  // Merge manager-level errors with local errors
  const managerError = managerState?.error ?? null
  const effectiveError = error || managerError

  // Set agent in REST service when it changes
  useEffect(() => {
    if (shouldUseRestApi() && selectedAgentId) {
      RestChatService.setCurrentAgent(selectedAgentId)
    }
  }, [selectedAgentId])

  // Persist agent ID to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedAgentId) {
        localStorage.setItem(CHAT_AGENT_STORAGE_KEY, selectedAgentId)
      } else {
        localStorage.removeItem(CHAT_AGENT_STORAGE_KEY)
      }
    }
  }, [selectedAgentId])

  // Persist scope ID to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedBusinessScopeId) {
        localStorage.setItem(CHAT_SCOPE_STORAGE_KEY, selectedBusinessScopeId)
      } else {
        localStorage.removeItem(CHAT_SCOPE_STORAGE_KEY)
      }
    }
  }, [selectedBusinessScopeId])

  // Persist backend session ID to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (backendSessionId) {
        localStorage.setItem(CHAT_BACKEND_SESSION_STORAGE_KEY, backendSessionId)
      } else {
        localStorage.removeItem(CHAT_BACKEND_SESSION_STORAGE_KEY)
      }
    }
  }, [backendSessionId])

  // On mount, if we have a stored backend session, load it
  useEffect(() => {
    if (backendSessionId) {
      // Load history and attempt reconnection
      (async () => {
        try {
          if (shouldUseRestApi()) {
            RestChatService.setCurrentSessionId(backendSessionId)
          }

          // If the manager already has messages for this session (e.g. from an
          // active stream that kept running while the user navigated away),
          // don't overwrite them with potentially stale backend history.
          const existingState = sessionStreamManager.getSession(backendSessionId)
          if (existingState.messages.length === 0) {
            const history = await RestChatService.getSessionHistory(backendSessionId)
            sessionStreamManager.setMessages(backendSessionId, history)
          }

          // Try to reconnect to an active stream (if the agent is still generating)
          if (!existingState.isSending) {
            const reconnected = await sessionStreamManager.reconnectStream(backendSessionId)
            if (reconnected) {
              console.log(`Reconnected to active stream for session ${backendSessionId} on mount`)
            }
          }
        } catch (err) {
          console.warn('Failed to restore session on mount:', err)
        }
      })()
    } else if (selectedBusinessScopeId && shouldUseRestApi()) {
      // Eagerly create session + provision workspace on mount when we have a
      // stored scope but no backend session yet.
      RestChatService.ensureSession(activeSop, selectedBusinessScopeId).then(newSessionId => {
        setBackendSessionId(newSessionId)
      }).catch(err => {
        console.warn('Failed to eagerly create session on mount:', err)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only on mount

  // Load initial data
  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true)
      setError(null)
      try {
        const history = await ChatService.getHistory(sessionId)
        // If we have a backend session, store in manager; otherwise just load context
        if (backendSessionId) {
          sessionStreamManager.setMessages(backendSessionId, history)
        }
        const contextData = await ChatService.getContext(activeSop)
        setContext(contextData)
      } catch (err) {
        const message = err instanceof ChatServiceError ? err.message : 'Failed to load chat data'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }
    void loadInitialData()
  }, [sessionId, activeSop])

  // Load quick questions when business scope changes
  useEffect(() => {
    async function loadQuickQuestions() {
      if (!selectedBusinessScopeId) {
        setQuickQuestions([])
        return
      }
      setQuickQuestions([]) // clear stale questions immediately
      setQuickQuestionsLoading(true)
      try {
        const questions = ChatService.getQuickQuestions
          ? await ChatService.getQuickQuestions(selectedBusinessScopeId)
          : []
        setQuickQuestions(questions)
      } catch (err) {
        console.warn('Failed to load quick questions:', err)
        setQuickQuestions([])
      } finally {
        setQuickQuestionsLoading(false)
      }
    }
    void loadQuickQuestions()
  }, [selectedBusinessScopeId])

  // Persist SOP to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHAT_SOP_STORAGE_KEY, activeSop)
    }
  }, [activeSop])

  const streamHandleRef = useRef<ChatStreamHandle | null>(null)

  useEffect(() => {
    return () => { streamHandleRef.current?.abort() }
  }, [])

  const stopGeneration = useCallback(() => {
    if (backendSessionId) {
      sessionStreamManager.stopStream(backendSessionId)
    }
  }, [backendSessionId])

  const sendMessage = useCallback(async (content: string, mentionAgentId?: string): Promise<Message | null> => {
    if (!content.trim()) {
      setError('Message cannot be empty')
      return null
    }

    if (!selectedBusinessScopeId && !selectedAgentId) {
      setError('Select a business scope or an agent to start chatting')
      return null
    }

    setError(null)

    if (shouldUseRestApi()) {
      try {
        const validSessionId = await RestChatService.ensureSession(activeSop, selectedBusinessScopeId ?? undefined)
        setBackendSessionId(validSessionId)

        sessionStreamManager.sendMessage(validSessionId, content, {
          businessScopeId: selectedBusinessScopeId || undefined,
          agentId: selectedAgentId || undefined,
          mentionAgentId: mentionAgentId || undefined,
          model: selectedModel || undefined,
          sopContext: activeSop,
        })

        return {
          id: `msg-${Date.now()}`,
          type: 'ai',
          content: '',
          timestamp: new Date(),
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create session')
        return null
      }
    }

    // Fallback: non-streaming mock path
    try {
      const aiResponse = await ChatService.sendMessage(sessionId, content, activeSop)
      const history = await ChatService.getHistory(sessionId)
      if (backendSessionId) {
        sessionStreamManager.setMessages(backendSessionId, history)
      }
      return aiResponse
    } catch (err) {
      const message = err instanceof ChatServiceError ? err.message : 'Failed to send message'
      setError(message)
      return null
    }
  }, [sessionId, activeSop, selectedAgentId, selectedBusinessScopeId, backendSessionId])

  const setActiveSop = useCallback((sopId: string) => {
    setActiveSopState(sopId)
  }, [])

  const setSelectedAgent = useCallback((agentId: string | null) => {
    setSelectedAgentIdState(agentId)
  }, [])

  const setSelectedBusinessScope = useCallback((scopeId: string) => {
    const newScopeId = scopeId || null
    setSelectedBusinessScopeIdState(newScopeId)
    // Reset agent and backend session when scope changes
    setSelectedAgentIdState(null)
    setBackendSessionId(null)
    if (shouldUseRestApi()) {
      RestChatService.resetSession()

      // Eagerly create session + provision workspace when a scope is selected,
      // so the workspace is ready by the time the user sends their first message.
      if (newScopeId) {
        console.log('[ChatContext] Eagerly creating session for scope:', newScopeId)
        RestChatService.ensureSession(activeSop, newScopeId).then(newSessionId => {
          console.log('[ChatContext] Eager session created:', newSessionId)
          setBackendSessionId(newSessionId)
        }).catch(err => {
          console.warn('Failed to eagerly create session:', err)
        })
      }
    }
  }, [activeSop])

  const clearHistory = useCallback(async () => {
    setError(null)
    try {
      await ChatService.clearHistory(sessionId)
      if (backendSessionId) {
        sessionStreamManager.setMessages(backendSessionId, [])
      }
    } catch (err) {
      const message = err instanceof ChatServiceError ? err.message : 'Failed to clear history'
      setError(message)
    }
  }, [sessionId, backendSessionId])

  const clearError = useCallback(() => {
    setError(null)
    if (backendSessionId) {
      sessionStreamManager.clearError(backendSessionId)
    }
  }, [backendSessionId])

  const refreshContext = useCallback(async () => {
    setError(null)
    try {
      const contextData = await ChatService.getContext(activeSop)
      setContext(contextData)
      // Also refresh quick questions with the current business scope
      if (selectedBusinessScopeId && ChatService.getQuickQuestions) {
        const questions = await ChatService.getQuickQuestions(selectedBusinessScopeId)
        setQuickQuestions(questions)
      }
    } catch (err) {
      const message = err instanceof ChatServiceError ? err.message : 'Failed to refresh context'
      setError(message)
    }
  }, [activeSop, selectedBusinessScopeId])

  const loadSession = useCallback(async (targetSessionId: string) => {
    setError(null)
    try {
      // Set the backend session so future messages go to this session
      setBackendSessionId(targetSessionId)
      if (shouldUseRestApi()) {
        RestChatService.setCurrentSessionId(targetSessionId)
      }

      // Check if the manager already has state for this session (e.g. active stream)
      const existingState = sessionStreamManager.getSession(targetSessionId)
      if (existingState.messages.length > 0) {
        // Manager already has messages (possibly from an active stream) — just switch view
        return
      }

      // Load the history from backend
      const history = await RestChatService.getSessionHistory(targetSessionId)
      sessionStreamManager.setMessages(targetSessionId, history)

      // Check if this session is still generating and try to reconnect
      const reconnected = await sessionStreamManager.reconnectStream(targetSessionId)
      if (reconnected) {
        console.log(`Reconnected to active stream for session ${targetSessionId}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session'
      setError(message)
    }
  }, [])

  const startNewSession = useCallback(() => {
    // Don't stop the old session's stream — let it keep running server-side.
    // Just detach the UI from it so the user sees a fresh chat.
    setBackendSessionId(null)
    setError(null)
    if (shouldUseRestApi()) {
      RestChatService.resetSession()
    }
  }, [])

  const clearConversation = useCallback(() => {
    if (backendSessionId) {
      sessionStreamManager.stopStream(backendSessionId)
      sessionStreamManager.setMessages(backendSessionId, [])
      // Clear on the backend so switching sessions doesn't reload old messages
      RestChatService.clearSessionHistory(backendSessionId).catch(err => {
        console.warn('Failed to clear session history on backend:', err)
      })
    }
    setError(null)
  }, [backendSessionId])

  const value: ChatContextType = {
    sessionId,
    activeSop,
    selectedAgentId,
    selectedBusinessScopeId,
    backendSessionId,
    messages,
    context,
    quickQuestions,
    quickQuestionsLoading,
    isLoading,
    isSending,
    error: effectiveError,
    sendMessage,
    stopGeneration,
    setActiveSop,
    setSelectedAgent,
    setSelectedBusinessScope,
    selectedModel,
    setSelectedModel,
    clearHistory,
    clearError,
    refreshContext,
    loadSession,
    startNewSession,
    clearConversation,
  }

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  )
}
