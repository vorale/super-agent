import { useState, useCallback, useRef, useSyncExternalStore, useEffect } from 'react'
import type { Agent, Department } from '@/types'
import { AgentService, AgentServiceError } from './agentService'
import { getAuthToken } from './api/restClient'
import { shouldUseRestApi } from './api/index'

export interface UseAgentsState {
  agents: Agent[]
  isLoading: boolean
  error: string | null
}

export interface UseAgentsReturn extends UseAgentsState {
  refetch: () => Promise<void>
  getAgentById: (id: string) => Promise<Agent | null>
  updateAgent: (id: string, data: Partial<Agent>) => Promise<Agent | null>
  deleteAgent: (id: string) => Promise<boolean>
  getAgentsByDepartment: (department: Department) => Promise<Agent[]>
  bindAgentToScope: (agentId: string, businessScopeId: string) => Promise<boolean>
  unbindAgentFromScope: (agentId: string, businessScopeId: string) => Promise<boolean>
  clearError: () => void
}

// Simple external store for agents data
let agentsCache: UseAgentsState = {
  agents: [],
  isLoading: true,
  error: null,
}
const listeners: Set<() => void> = new Set()
let initialFetchStarted = false

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot() {
  return agentsCache
}

function setAgentsState(newState: Partial<UseAgentsState>) {
  agentsCache = { ...agentsCache, ...newState }
  listeners.forEach(listener => listener())
}

async function fetchAgentsFromService(silent = false) {
  if (!silent) {
    setAgentsState({ isLoading: true, error: null })
  }
  try {
    const agents = await AgentService.getAgents()
    setAgentsState({ agents, isLoading: false, error: null })
  } catch (err) {
    const message = err instanceof AgentServiceError ? err.message : 'Failed to fetch agents'
    if (!silent) {
      setAgentsState({ isLoading: false, error: message })
    }
  }
}

// Start initial fetch immediately (outside of React lifecycle)
// Only if not using REST API or if auth token is already available
if (!initialFetchStarted) {
  initialFetchStarted = true
  // For REST API, only fetch if we have a token (user is logged in)
  // For mock, fetch immediately
  if (!shouldUseRestApi() || getAuthToken()) {
    void fetchAgentsFromService()
  }
}

export function useAgents(options?: { pollInterval?: number }): UseAgentsReturn {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  
  // Track if component is mounted for async operations
  const isMountedRef = useRef(true)
  
  // Use local state for operations that need component-level tracking
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    
    // For REST API, fetch data when component mounts (user should be logged in by now)
    if (shouldUseRestApi() && getAuthToken() && state.agents.length === 0 && !state.isLoading) {
      void fetchAgentsFromService()
    }
    
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Polling for live status updates
  useEffect(() => {
    const interval = options?.pollInterval
    if (!interval || interval <= 0) return

    const timer = setInterval(() => {
      void fetchAgentsFromService(true)
    }, interval)

    return () => clearInterval(timer)
  }, [options?.pollInterval])

  const refetch = useCallback(async () => {
    await fetchAgentsFromService()
  }, [])

  const getAgentById = useCallback(async (id: string): Promise<Agent | null> => {
    try {
      return await AgentService.getAgentById(id)
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : 'Failed to fetch agent'
      if (isMountedRef.current) {
        setLocalError(message)
      }
      return null
    }
  }, [])

  const updateAgent = useCallback(async (id: string, data: Partial<Agent>): Promise<Agent | null> => {
    try {
      const updated = await AgentService.updateAgent(id, data)
      // Update the external store with the updated agent
      setAgentsState({
        agents: agentsCache.agents.map(a => (a.id === id ? updated : a)),
        error: null,
      })
      return updated
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : 'Failed to update agent'
      if (isMountedRef.current) {
        setLocalError(message)
      }
      return null
    }
  }, [])

  const deleteAgent = useCallback(async (id: string): Promise<boolean> => {
    try {
      await AgentService.deleteAgent!(id)
      // Remove from the external store
      setAgentsState({
        agents: agentsCache.agents.filter(a => a.id !== id),
        error: null,
      })
      return true
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : 'Failed to delete agent'
      if (isMountedRef.current) {
        setLocalError(message)
      }
      return false
    }
  }, [])

  const getAgentsByDepartment = useCallback(async (department: Department): Promise<Agent[]> => {
    try {
      return await AgentService.getAgentsByDepartment(department)
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : 'Failed to fetch agents by department'
      if (isMountedRef.current) {
        setLocalError(message)
      }
      return []
    }
  }, [])

  const clearError = useCallback(() => {
    setLocalError(null)
    setAgentsState({ error: null })
  }, [])

  const bindAgentToScope = useCallback(async (agentId: string, businessScopeId: string): Promise<boolean> => {
    try {
      if (AgentService.bindAgentToScope) {
        await AgentService.bindAgentToScope(agentId, businessScopeId)
      }
      return true
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : 'Failed to bind agent to scope'
      if (isMountedRef.current) {
        setLocalError(message)
      }
      return false
    }
  }, [])

  const unbindAgentFromScope = useCallback(async (agentId: string, businessScopeId: string): Promise<boolean> => {
    try {
      if (AgentService.unbindAgentFromScope) {
        await AgentService.unbindAgentFromScope(agentId, businessScopeId)
      }
      return true
    } catch (err) {
      const message = err instanceof AgentServiceError ? err.message : 'Failed to unbind agent from scope'
      if (isMountedRef.current) {
        setLocalError(message)
      }
      return false
    }
  }, [])

  return {
    agents: state.agents,
    isLoading: state.isLoading,
    error: state.error || localError,
    refetch,
    getAgentById,
    updateAgent,
    deleteAgent,
    getAgentsByDepartment,
    bindAgentToScope,
    unbindAgentFromScope,
    clearError,
  }
}

// Export for testing purposes
export function resetAgentsStore() {
  agentsCache = {
    agents: [],
    isLoading: true,
    error: null,
  }
  initialFetchStarted = false
}
