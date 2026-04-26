import { Users, Monitor, Megaphone, DollarSign, Headphones, Briefcase, Settings, TrendingUp, Search, User } from 'lucide-react'
import { useState } from 'react'
import type { Agent, AgentStatus } from '@/types'
import { useTranslation } from '@/i18n'
import { useBusinessScopes } from '@/services/useBusinessScopes'
import { getAvatarDisplayUrl, getAvatarFallback, shouldShowAvatarImage } from '@/utils/avatarUtils'

interface AgentListProps {
  agents: Agent[]
  selectedAgentId: string | null
  selectedScopeId: string | null
  onSelectAgent: (agentId: string) => void
  onSelectScope: (scopeId: string) => void
}

// Icon mapping for business scope icons
const iconMap: Record<string, React.ReactNode> = {
  users: <Users className="w-4 h-4 text-white" />,
  monitor: <Monitor className="w-4 h-4 text-white" />,
  megaphone: <Megaphone className="w-4 h-4 text-white" />,
  'dollar-sign': <DollarSign className="w-4 h-4 text-white" />,
  headphones: <Headphones className="w-4 h-4 text-white" />,
  briefcase: <Briefcase className="w-4 h-4 text-white" />,
  settings: <Settings className="w-4 h-4 text-white" />,
  'trending-up': <TrendingUp className="w-4 h-4 text-white" />,
}

// Color mapping for business scope colors
const colorMap: Record<string, string> = {
  blue: 'bg-blue-600',
  green: 'bg-green-600',
  purple: 'bg-purple-600',
  orange: 'bg-orange-600',
  pink: 'bg-pink-600',
  emerald: 'bg-emerald-600',
  slate: 'bg-slate-600',
  red: 'bg-red-600',
}

const statusColors: Record<AgentStatus, { dot: string }> = {
  active: { dot: 'bg-green-500' },
  busy: { dot: 'bg-blue-500' },
  offline: { dot: 'bg-gray-500' },
}

export function AgentList({ agents, selectedAgentId, selectedScopeId, onSelectAgent, onSelectScope }: AgentListProps) {
  const { t } = useTranslation()
  const { businessScopes } = useBusinessScopes()
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()

  // Filter agents by search query (name, role, displayName)
  const filteredAgents = query
    ? agents.filter(a =>
        a.displayName.toLowerCase().includes(query) ||
        (a.role ?? '').toLowerCase().includes(query) ||
        a.name.toLowerCase().includes(query)
      )
    : agents

  // Group agents by their department (which is actually business_scope_id from Supabase)
  const agentsByScope = filteredAgents.reduce<Record<string, Agent[]>>((acc, agent) => {
    const scopeId = agent.department // department field holds business_scope_id
    if (!acc[scopeId]) {
      acc[scopeId] = []
    }
    acc[scopeId].push(agent)
    return acc
  }, {})

  // Get scope info for display
  const getScopeInfo = (scopeId: string) => {
    const scope = businessScopes.find(s => s.id === scopeId)
    if (scope) {
      return {
        name: scope.name,
        icon: (scope.icon && iconMap[scope.icon]) || <Briefcase className="w-4 h-4 text-white" />,
        color: (scope.color && colorMap[scope.color]) || 'bg-gray-600',
      }
    }
    // Fallback for legacy department strings
    const legacyMap: Record<string, { name: string; icon: React.ReactNode; color: string }> = {
      hr: { name: t('department.hr'), icon: <Users className="w-4 h-4 text-white" />, color: 'bg-purple-600' },
      it: { name: t('department.it'), icon: <Monitor className="w-4 h-4 text-white" />, color: 'bg-blue-600' },
      marketing: { name: t('department.marketing'), icon: <Megaphone className="w-4 h-4 text-white" />, color: 'bg-pink-600' },
      sales: { name: t('department.sales'), icon: <DollarSign className="w-4 h-4 text-white" />, color: 'bg-green-600' },
      support: { name: t('department.support'), icon: <Headphones className="w-4 h-4 text-white" />, color: 'bg-orange-600' },
    }
    return legacyMap[scopeId] || { name: scopeId, icon: <Briefcase className="w-4 h-4 text-white" />, color: 'bg-gray-600' }
  }

  // Get all unique scope IDs from agents, with __independent__ last
  // Also include scopes that have zero agents (e.g. digital twins)
  const agentScopeIds = new Set(Object.keys(agentsByScope))
  const digitalTwinIds = new Set(businessScopes.filter(s => s.scopeType === 'digital_twin').map(s => s.id))

  const allScopeIds = [
    // Business scopes that have agents (non-digital-twin)
    ...Object.keys(agentsByScope).filter(id => id !== '__independent__' && !digitalTwinIds.has(id)),
    // Business scopes with zero agents (non-digital-twin)
    ...businessScopes.filter(s => !agentScopeIds.has(s.id) && s.scopeType !== 'digital_twin').map(s => s.id),
    // Digital twin scopes (with or without agents)
    ...businessScopes.filter(s => s.scopeType === 'digital_twin').map(s => s.id),
    // Independent agents last
    ...(agentsByScope['__independent__'] ? ['__independent__'] : []),
  ]
  // When searching, also include scopes whose name matches (even if no agent matches)
  const filteredScopeIds = query
    ? allScopeIds.filter(id => {
        // Keep if scope has matching agents
        if ((agentsByScope[id] || []).length > 0) return true
        // Keep if scope name matches
        const scope = businessScopes.find(s => s.id === id)
        if (scope && scope.name.toLowerCase().includes(query)) return true
        return false
      })
    : allScopeIds
  const scopeIds = filteredScopeIds

  // Separate scope IDs into categories for structured rendering
  const businessScopeIds = scopeIds.filter(id => {
    if (id === '__independent__') return false
    const s = businessScopes.find(bs => bs.id === id)
    return s ? s.scopeType !== 'digital_twin' : true // legacy departments go here too
  })
  const digitalTwinScopeIds = scopeIds.filter(id => {
    const s = businessScopes.find(bs => bs.id === id)
    return s?.scopeType === 'digital_twin'
  })
  const hasIndependent = scopeIds.includes('__independent__')

  // Shared renderer for a single agent card
  const renderAgentCard = (agent: Agent) => {
    const isSelected = agent.id === selectedAgentId
    const statusStyle = statusColors[agent.status] || statusColors.active

    return (
      <button
        key={agent.id}
        onClick={() => onSelectAgent(agent.id)}
        className={`
          w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all
          ${isSelected
            ? 'bg-blue-600/20 border border-blue-500/50'
            : 'hover:bg-gray-800 border border-transparent'
          }
        `}
      >
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden">
            {(() => {
              const avatarUrl = getAvatarDisplayUrl(agent.avatar)
              const avatarFallback = getAvatarFallback(agent.displayName, agent.avatar)
              const showImage = shouldShowAvatarImage(agent.avatar)
              if (showImage && avatarUrl) {
                return (
                  <img
                    src={avatarUrl}
                    alt={agent.displayName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.parentElement!.textContent = avatarFallback
                    }}
                  />
                )
              }
              return avatarFallback
            })()}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${statusStyle.dot} border-2 border-gray-900`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>
            {agent.displayName}
          </p>
          <p className="text-xs text-gray-400 truncate">{agent.role}</p>
        </div>
      </button>
    )
  }

  // Shared renderer for a digital twin card (scope-level, clickable to scope detail)
  const renderDigitalTwinCard = (scopeId: string) => {
    const scope = businessScopes.find(s => s.id === scopeId)
    if (!scope) return null
    const isSelected = selectedScopeId === scopeId && !selectedAgentId
    const avatarUrl = getAvatarDisplayUrl(scope.avatar ?? null)
    const avatarFallback = getAvatarFallback(scope.name, scope.avatar)
    const showImage = shouldShowAvatarImage(scope.avatar ?? null)

    return (
      <div key={scopeId} className="px-2 mb-1">
        <button
          onClick={() => onSelectScope(scopeId)}
          className={`
            w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all
            ${isSelected
              ? 'bg-blue-600/20 border border-blue-500/50'
              : 'hover:bg-gray-800 border border-transparent'
            }
          `}
        >
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium overflow-hidden">
              {showImage && avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={scope.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.parentElement!.textContent = avatarFallback
                  }}
                />
              ) : avatarFallback}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-gray-900" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>
              {scope.name}
            </p>
            <p className="text-xs text-gray-400 truncate">{scope.role || t('agentList.digitalTwin')}</p>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-2 py-2 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('agentList.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* ── Business Scopes ── */}
        {businessScopeIds.map((scopeId) => {
          const scopeAgents = agentsByScope[scopeId] || []
          const scope = businessScopes.find(s => s.id === scopeId)
          const isRealScope = !!scope
          if (scopeAgents.length === 0 && !isRealScope) return null

          const scopeInfo = getScopeInfo(scopeId)

          return (
            <div key={scopeId} className="mb-4">
              {/* Scope Header — clickable with "View" badge */}
              <div
                onClick={() => onSelectScope(scopeId)}
                className={`flex items-center gap-2 px-3 py-2 sticky top-0 z-10 w-full text-left transition-colors rounded cursor-pointer ${
                  selectedScopeId === scopeId && !selectedAgentId
                    ? 'bg-blue-600/20 border border-blue-500/50'
                    : 'bg-gray-900 hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className={`w-6 h-6 rounded ${scopeInfo.color} flex items-center justify-center flex-shrink-0`}>
                  {scopeInfo.icon}
                </div>
                <span className="text-gray-300 text-sm font-medium truncate">
                  {scopeInfo.name}
                </span>
                <span className="text-gray-500 text-xs flex-shrink-0">({scopeAgents.length})</span>
                <span className="ml-auto flex-shrink-0 text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                  {t('agentList.viewScope')}
                </span>
              </div>

              {/* Agent Items */}
              <div className="space-y-1 px-2">
                {scopeAgents.map(renderAgentCard)}
              </div>
            </div>
          )
        })}

        {/* ── Digital Twins ── */}
        {digitalTwinScopeIds.length > 0 && (
          <div className="mb-4">
            {/* Section header — label only, no "View" button */}
            <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10 bg-gray-900">
              <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="text-gray-300 text-sm font-medium">
                {t('agentList.digitalTwins')}
              </span>
              <span className="text-gray-500 text-xs">({digitalTwinScopeIds.length})</span>
            </div>
            {digitalTwinScopeIds.map(renderDigitalTwinCard)}
          </div>
        )}

        {/* ── Independent Agents ── */}
        {hasIndependent && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10 bg-gray-900">
              <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <span className="text-gray-300 text-sm font-medium">
                {t('agentList.independent')}
              </span>
              <span className="text-gray-500 text-xs">({(agentsByScope['__independent__'] || []).length})</span>
            </div>
            <div className="space-y-1 px-2">
              {(agentsByScope['__independent__'] || []).map(renderAgentCard)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
