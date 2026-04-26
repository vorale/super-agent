import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Users, Loader2, Plus } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAgents } from '@/services'
import { useBusinessScopes } from '@/services/useBusinessScopes'
import { AgentList, AgentProfile, ScopeProfile } from '@/components'
import type { Agent, AgentStatus } from '@/types'
import { restClient } from '@/services/api/restClient'

export function Agents() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { agents, isLoading, error, getAgentById, updateAgent, deleteAgent, bindAgentToScope, unbindAgentFromScope } = useAgents({ pollInterval: 5000 })
  const { businessScopes, deleteBusinessScope, refetch: refetchScopes } = useBusinessScopes()

  // Get agent ID and scope ID from URL params
  const selectedAgentId = useMemo(() => searchParams.get('id'), [searchParams])
  const selectedScopeId = useMemo(() => searchParams.get('scope'), [searchParams])

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [isLoadingAgent, setIsLoadingAgent] = useState(false)

  // Scope member agents loaded via API (M:N relationship)
  const [scopeAgents, setScopeAgents] = useState<Agent[]>([])
  const [isScopeAgentsLoading, setIsScopeAgentsLoading] = useState(false)

  // Load scope member agents from the backend
  const loadScopeAgents = useCallback(async (scopeId: string) => {
    setIsScopeAgentsLoading(true)
    try {
      const response = await restClient.get<Agent[]>(
        `/api/business-scopes/${scopeId}/agents`
      )
      // The backend returns agents in API format; map them to match our Agent type
      const mapped = (Array.isArray(response) ? response : []).map((a: any) => ({
        id: a.id,
        name: a.name,
        displayName: a.display_name ?? a.displayName ?? a.name,
        role: a.role || '',
        department: (a.business_scope_id || '__independent__') as Agent['department'],
        avatar: a.avatar || (a.display_name ?? a.name ?? '').charAt(0).toUpperCase(),
        status: a.status as Agent['status'],
        metrics: a.metrics ?? { taskCount: 0, responseRate: 0, avgResponseTime: '0s' },
        tools: a.tools ?? [],
        scope: a.scope ?? [],
        systemPrompt: a.system_prompt ?? a.systemPrompt ?? '',
        modelConfig: a.model_config ?? a.modelConfig ?? { provider: 'Bedrock', modelId: 'claude-3-sonnet', agentType: 'Worker' },
        businessScopeId: a.business_scope_id ?? a.businessScopeId,
      }))
      setScopeAgents(mapped)
    } catch {
      setScopeAgents([])
    } finally {
      setIsScopeAgentsLoading(false)
    }
  }, [])

  // Reload scope agents when selectedScopeId changes
  useEffect(() => {
    if (selectedScopeId) {
      loadScopeAgents(selectedScopeId)
    } else {
      setScopeAgents([])
    }
  }, [selectedScopeId, loadScopeAgents])

  // Load selected agent details
  useEffect(() => {
    let isMounted = true
    async function loadAgent() {
      if (!selectedAgentId) { setSelectedAgent(null); return }
      setIsLoadingAgent(true)
      const agent = await getAgentById(selectedAgentId)
      if (isMounted) { setSelectedAgent(agent); setIsLoadingAgent(false) }
    }
    loadAgent()
    return () => { isMounted = false }
  }, [selectedAgentId, getAgentById])

  const handleSelectAgent = (agentId: string) => {
    navigate(`/agents?id=${agentId}`, { replace: true })
  }

  const handleSelectScope = (scopeId: string) => {
    navigate(`/agents?scope=${scopeId}`, { replace: true })
  }

  const handleConfigureAgent = (agentId: string) => {
    navigate(`/agents/config/${agentId}`)
  }

  const handleRemoveAgent = async (agentId: string) => {
    if (window.confirm(t('agents.confirmRemove'))) {
      const success = await deleteAgent(agentId)
      if (success) { setSelectedAgent(null); navigate('/agents', { replace: true }) }
    }
  }

  const handleDeleteScope = async (scopeId: string) => {
    if (!window.confirm('Are you sure you want to delete this business scope? Agents will be unlinked but not deleted.')) return
    const success = await deleteBusinessScope(scopeId)
    if (success) {
      navigate('/agents', { replace: true })
    }
  }

  const handleAddAgentToScope = async (agentId: string, scopeId: string) => {
    const success = await bindAgentToScope(agentId, scopeId)
    if (success && selectedScopeId) {
      await loadScopeAgents(selectedScopeId)
    }
  }

  const handleRemoveAgentFromScope = async (agentId: string, scopeId: string) => {
    const success = await unbindAgentFromScope(agentId, scopeId)
    if (success && selectedScopeId) {
      await loadScopeAgents(selectedScopeId)
    }
  }

  const handleToggleAgentStatus = async (agentId: string, newStatus: AgentStatus) => {
    const updated = await updateAgent(agentId, { status: newStatus })
    if (updated) setSelectedAgent(updated)
  }

  // Find selected scope
  const selectedScope = selectedScopeId
    ? businessScopes.find(s => s.id === selectedScopeId) ?? null
    : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors">
          {t('common.retry')}
        </button>
      </div>
    )
  }

  // Determine what to show in the right panel
  const showAgent = selectedAgentId && selectedAgent && !selectedScopeId
  const showScope = selectedScopeId && selectedScope && !selectedAgentId

  return (
    <div className="flex h-full">
      {/* Left Panel - Agent List */}
      <div className="w-72 border-r border-gray-800 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {agents.length} {t('common.allAgents').toLowerCase()}
            </p>
            <button
              onClick={() => navigate('/create-business-scope')}
              className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors"
              title="Create a new team (business scope)"
            >
              <Plus size={14} />
              <span>{t('agents.createTeam')}</span>
            </button>
            <button
              onClick={() => navigate('/create-digital-twin')}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
              title="Create a digital twin of yourself"
            >
              <Plus size={14} />
              <span>{t('agents.createAgent')}</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <AgentList
            agents={agents}
            selectedAgentId={selectedAgentId}
            selectedScopeId={selectedScopeId}
            onSelectAgent={handleSelectAgent}
            onSelectScope={handleSelectScope}
          />
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 min-w-0 bg-gray-950 overflow-hidden">
        {isLoadingAgent ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : showAgent ? (
          <AgentProfile
            agent={selectedAgent}
            onConfigure={handleConfigureAgent}
            onRemove={handleRemoveAgent}
            onToggleStatus={handleToggleAgentStatus}
          />
        ) : showScope ? (
          <ScopeProfile
            scope={selectedScope}
            agents={scopeAgents}
            allAgents={agents}
            onDeleteScope={handleDeleteScope}
            onAddAgent={handleAddAgentToScope}
            onRemoveAgent={handleRemoveAgentFromScope}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-400 mb-2">
              {t('agents.profile')}
            </h3>
            <p className="text-sm text-gray-500 max-w-xs">
              {t('agents.selectPrompt')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
