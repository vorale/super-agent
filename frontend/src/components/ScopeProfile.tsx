import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Server, Plus, Trash2, Loader2, Briefcase,
  Users, Zap, TrendingUp, BarChart3,
  CheckCircle2, AlertCircle, Clock, FileText,
  MessageSquare, Shield, Database, Settings, Save,
  Terminal, Pencil, Sparkles,
} from 'lucide-react'
import { useMCP } from '@/services'
import { useToast } from '@/components'
import { restClient } from '@/services/api/restClient'
import type { BusinessScope } from '@/services/businessScopeService'
import type { MCPServer, MCPServerConfig, Agent } from '@/types'
import type { McpServerEntry } from '@/data/mcp-servers'
import { IMChannelsPanel } from './IMChannelsPanel'
import { ScopeMemoryPanel } from './ScopeMemoryPanel'
import { DocGroupsPanel } from './DocGroupsPanel'
import { RehearsalPanel } from './RehearsalPanel'
import { MCPCatalogPanel, type CustomMcpServer } from './MCPCatalogPanel'
import { ConnectorPanel } from './ConnectorPanel'
import { SkillsPanel } from './SkillsPanel'
import {
  getAvatarDisplayUrl,
  getAvatarFallback,
  shouldShowAvatarImage,
} from '@/utils/avatarUtils'
import { translations } from '@/i18n/translations'

/** Module-level t() — no React context dependency */
function t(key: string): string {
  const lang = (typeof window !== 'undefined' && localStorage.getItem('super-agent-language')) || 'en'
  const entry = translations[key]
  if (!entry) return key
  return entry[lang as 'en' | 'cn'] ?? entry.en ?? key
}

interface ScopeProfileProps {
  scope: BusinessScope
  agents: Agent[]
  allAgents?: Agent[]
  onDeleteScope?: (scopeId: string) => void
  onAddAgent?: (agentId: string, scopeId: string) => void
  onRemoveAgent?: (agentId: string, scopeId: string) => void
}

interface ScopeMcpServer {
  id: string
  mcp_server_id: string
  name: string
  description: string | null
  host_address: string
  config: Record<string, unknown> | null
  scope_config: Record<string, unknown> | null
  status: string
  assigned_at: string
}

/* ------------------------------------------------------------------ */
/*  Task Briefing Card data                                            */
/* ------------------------------------------------------------------ */
interface TaskBriefing {
  id: string
  title: string
  summary: string
  agentName: string
  agentAvatar?: string
  timestamp: string
  status: 'completed' | 'flagged' | 'in-progress' | 'escalated'
  category: string
  icon: typeof FileText
  accentColor: string
  tags?: string[]
}

function generateFakeBriefings(agents: Agent[]): TaskBriefing[] {
  if (agents.length === 0) return []
  const briefings: Omit<TaskBriefing, 'id' | 'agentName' | 'agentAvatar'>[] = [
    {
      title: 'Q4 Financial Report Generated',
      summary: 'Compiled quarterly revenue, expenses, and profit margins across all business units. Key finding: 12% revenue growth YoY with operating margins improving by 3 percentage points. Report has been shared with the executive team for review.',
      timestamp: '25 min ago',
      status: 'completed',
      category: 'Reporting',
      icon: FileText,
      accentColor: 'border-l-emerald-500',
      tags: ['quarterly', 'revenue'],
    },
    {
      title: 'Expense Anomaly Detected',
      summary: 'Flagged unusual pattern in travel expenses for the engineering department — $47K spike compared to 3-month average. Appears related to conference season but exceeds budget threshold by 23%.',
      timestamp: '1 hr ago',
      status: 'flagged',
      category: 'Compliance',
      icon: Shield,
      accentColor: 'border-l-yellow-500',
      tags: ['anomaly', 'expenses'],
    },
    {
      title: 'Vendor Contract Review Complete',
      summary: 'Analyzed renewal terms for 3 SaaS vendors. Recommended renegotiating CloudStore contract (potential 15% savings). Two other contracts are within acceptable ranges.',
      timestamp: '2 hrs ago',
      status: 'completed',
      category: 'Procurement',
      icon: CheckCircle2,
      accentColor: 'border-l-blue-500',
      tags: ['contracts', 'savings'],
    },
    {
      title: 'Regulatory Filing Deadline Alert',
      summary: 'SEC Form 10-Q filing due in 5 business days. All required data has been collected. Pending final review from the compliance team before submission.',
      timestamp: '3 hrs ago',
      status: 'escalated',
      category: 'Regulatory',
      icon: AlertCircle,
      accentColor: 'border-l-orange-500',
      tags: ['SEC', 'deadline'],
    },
    {
      title: 'Revenue Forecast Model Updated',
      summary: 'Refreshed the 6-month rolling forecast incorporating latest sales pipeline data. Projected Q1 revenue: $4.2M (up from $3.8M previous estimate). Model confidence: 87%.',
      timestamp: '4 hrs ago',
      status: 'completed',
      category: 'Analytics',
      icon: TrendingUp,
      accentColor: 'border-l-purple-500',
      tags: ['forecast', 'revenue'],
    },
    {
      title: 'Budget Variance Analysis',
      summary: 'Marketing department exceeded Q3 budget by 8%. Primary driver: unplanned digital campaign spend. Recommended reallocation from Q4 contingency fund to cover the gap.',
      timestamp: '5 hrs ago',
      status: 'completed',
      category: 'Budgeting',
      icon: BarChart3,
      accentColor: 'border-l-cyan-500',
      tags: ['budget', 'marketing'],
    },
    {
      title: 'Customer Payment Reconciliation',
      summary: 'Reconciled 342 invoices against bank statements. Found 7 discrepancies totaling $12,400. Three are timing differences; four require follow-up with accounts receivable.',
      timestamp: '6 hrs ago',
      status: 'flagged',
      category: 'Accounting',
      icon: Database,
      accentColor: 'border-l-pink-500',
      tags: ['reconciliation', 'invoices'],
    },
    {
      title: 'Stakeholder Q&A Responses Drafted',
      summary: 'Prepared answers for 12 investor questions ahead of the upcoming earnings call. Responses cover revenue guidance, margin outlook, and strategic initiatives.',
      timestamp: 'Yesterday',
      status: 'completed',
      category: 'Communications',
      icon: MessageSquare,
      accentColor: 'border-l-indigo-500',
      tags: ['investor-relations'],
    },
  ]
  return briefings.slice(0, Math.max(4, agents.length * 2)).map((b, i) => ({
    ...b,
    id: `briefing-${i}`,
    agentName: agents[i % agents.length].displayName,
    agentAvatar: agents[i % agents.length].avatar,
  }))
}

/* ------------------------------------------------------------------ */
/*  Timestamp formatter                                                */
/* ------------------------------------------------------------------ */
function formatTimestamp(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Users; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-xl font-bold text-white leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Task Briefing Card (Pinterest-style)                               */
/* ------------------------------------------------------------------ */
const statusBadge: Record<TaskBriefing['status'], { bg: string; text: string; label: string }> = {
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: t('scopeProfile.statusCompleted') },
  flagged: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: t('scopeProfile.statusFlagged') },
  'in-progress': { bg: 'bg-blue-500/10', text: 'text-blue-400', label: t('scopeProfile.statusInProgress') },
  escalated: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: t('scopeProfile.statusEscalated') },
}

function BriefingCard({ briefing }: { briefing: TaskBriefing }) {
  const badge = statusBadge[briefing.status]
  const Icon = briefing.icon

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden border-l-[3px] ${briefing.accentColor} hover:border-gray-700 transition-colors group`}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{briefing.category}</span>
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>
        <h4 className="text-sm font-semibold text-white leading-snug group-hover:text-blue-400 transition-colors">
          {briefing.title}
        </h4>
      </div>

      {/* Summary */}
      <div className="px-4 pb-3">
        <p className="text-[12px] text-gray-400 leading-relaxed">{briefing.summary}</p>
      </div>

      {/* Tags */}
      {briefing.tags && briefing.tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {briefing.tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">#{tag}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[8px] text-white font-semibold overflow-hidden">
            {getAvatarFallback(briefing.agentName, briefing.agentAvatar || '')}
          </div>
          <span className="text-[11px] text-gray-500">{briefing.agentName}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-600">
          <Clock className="w-3 h-3" />
          {briefing.timestamp}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Compact Agent Row (for the lower section)                          */
/* ------------------------------------------------------------------ */
const statusDot: Record<string, string> = {
  active: 'bg-green-500', busy: 'bg-yellow-500', offline: 'bg-gray-500',
}

function AgentRow({ agent }: { agent: Agent }) {
  const imgUrl = getAvatarDisplayUrl(agent.avatar)
  const showImg = shouldShowAvatarImage(agent.avatar)
  const fallback = getAvatarFallback(agent.displayName, agent.avatar)
  const dot = statusDot[agent.status] || statusDot.active

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="relative flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden">
          {showImg && imgUrl ? (
            <img src={imgUrl} alt={agent.displayName} className="w-full h-full object-cover"
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.textContent = fallback }} />
          ) : fallback}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${dot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white font-medium truncate">{agent.displayName}</p>
      </div>
      <span className="text-[10px] text-gray-500">{agent.role}</span>
      <span className="text-[10px] text-gray-600 w-12 text-right">{agent.metrics?.taskCount ?? 0} {t('scopeProfile.tasks')}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export function ScopeProfile({ scope, agents, allAgents = [], onDeleteScope, onAddAgent, onRemoveAgent }: ScopeProfileProps) {
  const { success, error: showError } = useToast()
  const { servers: allServers, getServers, createServer } = useMCP()
  const navigate = useNavigate()

  const [scopeServers, setScopeServers] = useState<ScopeMcpServer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showCatalogPanel, setShowCatalogPanel] = useState(false)
  const [showConnectorPanel, setShowConnectorPanel] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [configDraft, setConfigDraft] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  /* ---------- MCP server logic ---------- */
  const loadScopeServers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await restClient.get<{ data: ScopeMcpServer[] }>(
        `/api/business-scopes/${scope.id}/mcp-servers`
      )
      setScopeServers(res.data)
    } catch { setScopeServers([]) }
    finally { setIsLoading(false) }
  }, [scope.id])

  useEffect(() => { loadScopeServers() }, [loadScopeServers])
  useEffect(() => { getServers() }, [getServers])

  const assignedIds = new Set(scopeServers.map(s => s.mcp_server_id))
  const availableServers = allServers.filter(s => !assignedIds.has(s.id))

  const handleAdd = async (server: MCPServer) => {
    setIsAdding(true)
    try {
      await restClient.post(`/api/business-scopes/${scope.id}/mcp-servers`, { mcpServerId: server.id })
      success(`Added "${server.name}" to scope`)
      setShowPicker(false)
      await loadScopeServers()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add MCP server')
    } finally { setIsAdding(false) }
  }

  const handleRemove = async (assignment: ScopeMcpServer) => {
    try {
      await restClient.delete(`/api/business-scopes/${scope.id}/mcp-servers/${assignment.id}`)
      success(`Removed "${assignment.name}" from scope`)
      await loadScopeServers()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove MCP server')
    }
  }

  /** Names of org-level MCP servers (for catalog "Installed" badges) */
  const installedServerNames = useMemo(
    () => new Set(scopeServers.map(s => s.name)),
    [scopeServers],
  )

  /** Install from catalog: create org-level server if needed, then assign to scope */
  const handleCatalogInstall = useCallback(async (entry: McpServerEntry) => {
    try {
      // Check if server already exists at org level
      let existing = allServers.find(s => s.name === entry.name)
      if (!existing) {
        // Create org-level server first
        const config: MCPServerConfig = entry.config
          ? { type: entry.config.type as MCPServerConfig['type'], command: entry.config.command, args: entry.config.args }
          : { type: 'sse', url: '' }
        const hostAddress = entry.config
          ? [entry.config.command, ...entry.config.args].join(' ')
          : ''
        existing = await createServer({
          name: entry.name,
          description: entry.description,
          hostAddress,
          config,
          oauth: { clientId: '', clientSecret: '', tokenUrl: '', scope: '' },
          headers: {},
          status: 'active',
        })
        await getServers()
      }
      // Assign to scope
      await restClient.post(`/api/business-scopes/${scope.id}/mcp-servers`, { mcpServerId: existing.id })

      // Seed default scope_config from catalog into DB
      const defaultCfg = entry.config?.defaultScopeConfig ?? null
      if (defaultCfg) {
        const res = await restClient.get<{ data: ScopeMcpServer[] }>(
          `/api/business-scopes/${scope.id}/mcp-servers`,
        )
        const assignment = res.data.find(s => s.mcp_server_id === existing!.id)
        if (assignment) {
          await restClient.put(
            `/api/business-scopes/${scope.id}/mcp-servers/${assignment.id}/config`,
            { scopeConfig: defaultCfg },
          )
        }
      }

      success(`Added "${entry.name}" to scope`)
      setShowCatalogPanel(false)
      await loadScopeServers()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to install MCP server')
    }
  }, [allServers, createServer, getServers, scope.id, loadScopeServers, success, showError])

  /** Add a custom (non-catalog) MCP server to the scope */
  const handleCustomInstall = useCallback(async (custom: CustomMcpServer) => {
    try {
      // Create org-level server
      const created = await createServer({
        name: custom.name,
        description: custom.description || 'Custom MCP server',
        hostAddress: custom.name,
        config: { type: 'stdio' } as MCPServerConfig,
        oauth: { clientId: '', clientSecret: '', tokenUrl: '', scope: '' },
        headers: {},
        status: 'active',
      })
      await getServers()

      // Assign to scope
      await restClient.post(`/api/business-scopes/${scope.id}/mcp-servers`, { mcpServerId: created.id })

      // Seed scope_config if provided
      if (custom.scopeConfig && Object.keys(custom.scopeConfig).length > 0) {
        const res = await restClient.get<{ data: ScopeMcpServer[] }>(
          `/api/business-scopes/${scope.id}/mcp-servers`,
        )
        const assignment = res.data.find(s => s.mcp_server_id === created.id)
        if (assignment) {
          await restClient.put(
            `/api/business-scopes/${scope.id}/mcp-servers/${assignment.id}/config`,
            { scopeConfig: custom.scopeConfig },
          )
        }
      }

      success(`Added custom server "${custom.name}" to scope`)
      setShowCatalogPanel(false)
      await loadScopeServers()
    } catch (err) {
      throw err // Let the panel show the error
    }
  }, [createServer, getServers, scope.id, loadScopeServers, success])

  /** Open the inline config editor for a scope MCP server */
  const handleEditConfig = useCallback((server: ScopeMcpServer) => {
    if (editingConfigId === server.id) {
      setEditingConfigId(null)
      return
    }
    setEditingConfigId(server.id)
    setConfigDraft(
      server.scope_config && Object.keys(server.scope_config).length > 0
        ? JSON.stringify(server.scope_config, null, 2)
        : '{\n  \n}',
    )
  }, [editingConfigId])

  /** Save scope-level config for an MCP server assignment */
  const handleSaveConfig = useCallback(async (assignmentId: string) => {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(configDraft)
    } catch {
      showError('Invalid JSON — please fix syntax errors')
      return
    }
    setIsSavingConfig(true)
    try {
      await restClient.put(
        `/api/business-scopes/${scope.id}/mcp-servers/${assignmentId}/config`,
        { scopeConfig: parsed },
      )
      success('Configuration saved')
      setEditingConfigId(null)
      await loadScopeServers()
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setIsSavingConfig(false)
    }
  }, [configDraft, scope.id, loadScopeServers, success, showError])

  const getTypeLabel = (config: Record<string, unknown> | null, hostAddress: string): string => {
    if (config?.type) return (config.type as string).toUpperCase()
    return (hostAddress.startsWith('http://') || hostAddress.startsWith('https://')) ? 'SSE' : 'STDIO'
  }

  /* ---------- Computed stats ---------- */
  const totalAgents = agents.length
  const activeCount = agents.filter(a => a.status === 'active').length
  const busyCount = agents.filter(a => a.status === 'busy').length
  const totalTasks = agents.reduce((sum, a) => sum + (a.metrics?.taskCount ?? 0), 0)
  const avgResponseRate = totalAgents > 0
    ? Math.round(agents.reduce((sum, a) => sum + (a.metrics?.responseRate ?? 0), 0) / totalAgents)
    : 0

  // Agents not assigned to this scope (available to add)
  const scopeAgentIds = new Set(agents.map(a => a.id))
  const unassignedAgents = allAgents.filter(a => !scopeAgentIds.has(a.id))

  const handleAddAgentToScope = async (agent: Agent) => {
    if (onAddAgent) {
      await onAddAgent(agent.id, scope.id)
      success(`Added "${agent.displayName}" to scope`)
      setShowAgentPicker(false)
    }
  }

  const handleRemoveAgentFromScope = async (agent: Agent) => {
    if (onRemoveAgent) {
      await onRemoveAgent(agent.id, scope.id)
      success(`Removed "${agent.displayName}" from scope`)
    }
  }

  const [briefings, setBriefings] = useState<TaskBriefing[]>([])
  const [briefingsLoading, setBriefingsLoading] = useState(true)

  // System prompt editing state
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState(scope.systemPrompt || '')
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)

  // Scope-level skills
  const [scopeSkills, setScopeSkills] = useState<Array<{ id: string; name: string; description: string | null; skill_type: string }>>([])
  const [skillsLoading, setSkillsLoading] = useState(true)
  const [showSkillsPanel, setShowSkillsPanel] = useState(false)

  useEffect(() => {
    setPromptDraft(scope.systemPrompt || '')
  }, [scope.systemPrompt])

  useEffect(() => {
    let cancelled = false
    async function loadScopeSkills() {
      setSkillsLoading(true)
      try {
        const res = await restClient.get<{ data: Array<{ id: string; name: string; description: string | null; skill_type: string }> }>(
          `/api/skills?business_scope_id=${scope.id}&limit=100`
        )
        if (!cancelled) setScopeSkills(res.data || [])
      } catch {
        if (!cancelled) setScopeSkills([])
      } finally {
        if (!cancelled) setSkillsLoading(false)
      }
    }
    loadScopeSkills()
    return () => { cancelled = true }
  }, [scope.id])

  const reloadScopeSkills = useCallback(async () => {
    try {
      const res = await restClient.get<{ data: Array<{ id: string; name: string; description: string | null; skill_type: string }> }>(
        `/api/skills?business_scope_id=${scope.id}&limit=100`
      )
      setScopeSkills(res.data || [])
    } catch {
      // ignore
    }
  }, [scope.id])

  const handleSavePrompt = async () => {
    setIsSavingPrompt(true)
    try {
      await restClient.put(`/api/business-scopes/${scope.id}`, { system_prompt: promptDraft })
      success('System prompt saved')
      setIsEditingPrompt(false)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save system prompt')
    } finally {
      setIsSavingPrompt(false)
    }
  }

  const totalSkills = scopeSkills.length

  useEffect(() => {
    let cancelled = false
    async function loadBriefings() {
      setBriefingsLoading(true)
      try {
        const res = await restClient.get<any[]>(
          `/api/business-scopes/${scope.id}/briefings?limit=8`
        )
        if (cancelled) return
        const iconMap: Record<string, typeof FileText> = {
          Reporting: FileText, Compliance: Shield, Analytics: TrendingUp,
          Operations: Zap, Communications: MessageSquare, Knowledge: Database,
          Procurement: CheckCircle2, Regulatory: AlertCircle, Budgeting: BarChart3,
          Accounting: Database, Activity: Zap,
        }
        const colorMap: Record<string, string> = {
          completed: 'border-l-emerald-500', flagged: 'border-l-yellow-500',
          'in-progress': 'border-l-blue-500', escalated: 'border-l-orange-500',
        }
        const transformed: TaskBriefing[] = res.map((b: any) => ({
          id: b.id,
          title: b.title,
          summary: b.summary,
          agentName: b.agent?.display_name || 'System',
          agentAvatar: b.agent?.avatar,
          timestamp: formatTimestamp(b.event_time),
          status: b.status,
          category: b.category,
          icon: iconMap[b.category] || FileText,
          accentColor: colorMap[b.status] || 'border-l-gray-500',
          tags: b.tags || [],
        }))
        setBriefings(transformed)
      } catch {
        // Fallback to fake data if API fails
        setBriefings(generateFakeBriefings(agents))
      } finally {
        if (!cancelled) setBriefingsLoading(false)
      }
    }
    loadBriefings()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- agents intentionally excluded to avoid re-fetch on poll
  }, [scope.id])

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      {/* ============================================================ */}
      {/*  Header                                                       */}
      {/* ============================================================ */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {(() => {
              const avatarUrl = getAvatarDisplayUrl(scope.avatar)
              const showImage = shouldShowAvatarImage(scope.avatar)
              if (showImage && avatarUrl) {
                return (
                  <img
                    src={avatarUrl}
                    alt={scope.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.parentElement!.textContent = scope.icon || scope.name.charAt(0)
                    }}
                  />
                )
              }
              return scope.icon
                ? <span className="text-xl">{scope.icon}</span>
                : <Briefcase className="w-6 h-6 text-white" />
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white truncate">{scope.name}</h2>
              <div className="relative">
                <button
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                >
                  {t('scopeProfile.healthCheck')}
                </button>
                <span className="absolute -top-2 -right-3 text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 whitespace-nowrap">
                  {t('scopeProfile.comingSoon')}
                </span>
              </div>
            </div>
            {scope.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{scope.description}</p>
            )}
          </div>
          {onDeleteScope && (
            <button
              onClick={() => onDeleteScope(scope.id)}
              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              title={t('scopeProfile.deleteScope')}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Inline KPI strip */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <StatCard icon={Users} label={t('scopeProfile.agents')} value={totalAgents}
            sub={`${activeCount} active · ${busyCount} busy`} color="bg-blue-600/80" />
          <StatCard icon={Zap} label={t('scopeProfile.tasksDone')} value={totalTasks.toLocaleString()}
            color="bg-purple-600/80" />
          <StatCard icon={TrendingUp} label={t('scopeProfile.responseRate')} value={`${avgResponseRate}%`}
            color="bg-emerald-600/80" />
          <StatCard icon={BarChart3} label="Skills" value={totalSkills}
            sub={`${scopeServers.length} MCP`} color="bg-amber-600/80" />
        </div>
      </div>

      <div className="px-6 py-5 space-y-6 min-w-0">
        {/* ============================================================ */}
        {/*  System Prompt                                                */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-400" />
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('scopeProfile.systemPrompt')}</h3>
            </div>
            {!isEditingPrompt && (
              <button
                onClick={() => setIsEditingPrompt(true)}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
          {isEditingPrompt ? (
            <div className="space-y-2">
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none resize-y font-mono"
                placeholder={t('scopeProfile.promptPlaceholder')}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSavePrompt}
                  disabled={isSavingPrompt}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                >
                  {isSavingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={() => { setIsEditingPrompt(false); setPromptDraft(scope.systemPrompt || '') }}
                  className="px-2.5 py-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {scope.systemPrompt ? (
                <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed break-words">{scope.systemPrompt}</p>
              ) : (
                <p className="text-xs text-gray-600 italic">{t('scopeProfile.noPrompt')}</p>
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  Model Configuration                                          */}
        {/* ============================================================ */}
        <ModelConfigSection scope={scope} onSave={async (modelId) => {
          await restClient.put(`/api/business-scopes/${scope.id}`, {
            settings: { ...(scope.settings || {}), modelId: modelId || undefined },
          })
          success('Model saved')
        }} onError={showError} />

        {/* ============================================================ */}
        {/*  Scope Skills                                                 */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Skills</h3>
              <span className="text-[10px] text-gray-600">{scopeSkills.length} {t('scopeProfile.skillsEquipped')}</span>
            </div>
            <button
              onClick={() => setShowSkillsPanel(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
          {skillsLoading ? (
            <div className="py-4 text-center text-xs text-gray-500">{t('scopeProfile.loadingSkills')}</div>
          ) : scopeSkills.length === 0 ? (
            <div className="py-4 text-center">
              <Sparkles className="w-5 h-5 text-gray-700 mx-auto mb-1" />
              <p className="text-xs text-gray-500">{t('scopeProfile.noSkillsEquipped')}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{t('scopeProfile.noSkillsHint')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {scopeSkills.map(skill => {
                // Use the first agent in the scope for workshop testing;
                // fall back to any agent in the org (skill testing doesn't depend on the specific agent)
                const workshopAgentId = agents.length > 0
                  ? agents[0].id
                  : (allAgents.length > 0 ? allAgents[0].id : null)
                return (
                  <div key={skill.id} className="flex items-start gap-2 px-2.5 py-2 bg-gray-800/50 rounded-lg min-w-0">
                    <Sparkles className="w-3 h-3 text-yellow-500/60 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <span className="text-xs text-gray-200 font-medium">{skill.name}</span>
                      {skill.description && (
                        <p className="text-[10px] text-gray-500 line-clamp-2">{skill.description}</p>
                      )}
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-500 flex-shrink-0">{skill.skill_type}</span>
                    {workshopAgentId && (
                      <button
                        onClick={() => navigate(`/agents/config/${workshopAgentId}/workshop?skillId=${skill.id}&returnTo=${encodeURIComponent(`/agents?scope=${scope.id}`)}`)}
                        className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors flex-shrink-0"
                        title={t('scopeProfile.testSkill')}
                      >
                        <Zap className="w-2.5 h-2.5" />
                        {t('scopeProfile.testSkill')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  Task Briefings — Pinterest masonry grid                     */}
        {/* ============================================================ */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('scopeProfile.whatsHappened')}</h3>
            <span className="text-[10px] text-gray-600 ml-auto">{t('scopeProfile.briefingsSubtitle')}</span>
          </div>

          {briefingsLoading ? (
            <div className="py-12 text-center bg-gray-900 border border-gray-800 rounded-xl">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('scopeProfile.loadingBriefings')}</p>
            </div>
          ) : briefings.length === 0 ? (
            <div className="py-12 text-center bg-gray-900 border border-gray-800 rounded-xl">
              <FileText className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('scopeProfile.noHistory')}</p>
            </div>
          ) : (
            <div className="columns-1 md:columns-2 gap-3 space-y-3">
              {briefings.map(b => (
                <div key={b.id} className="break-inside-avoid">
                  <BriefingCard briefing={b} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  Agent Roster (compact, lower section)                       */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-gray-500" />
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Agents</h3>
            </div>
            <div className="flex items-center gap-2">
              {onAddAgent && (
                <button
                  onClick={() => setShowAgentPicker(!showAgentPicker)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {t('scopeProfile.addAgent')}
                </button>
              )}
              <div className="flex items-center gap-2 text-[10px] text-gray-600">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{activeCount}</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />{busyCount}</span>
              </div>
            </div>
          </div>

          {/* Agent picker dropdown */}
          {showAgentPicker && (
            <div className="border-b border-gray-800 bg-gray-800/50">
              {unassignedAgents.length === 0 ? (
                <p className="p-3 text-xs text-gray-400">
                  {allAgents.length === 0 ? t('scopeProfile.noAgentsAvailable') : t('scopeProfile.allAssigned')}
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-gray-700/50">
                  {unassignedAgents.map(agent => (
                    <button key={agent.id} onClick={() => handleAddAgentToScope(agent)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-700/50 transition-colors text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-semibold">
                          {getAvatarFallback(agent.displayName, agent.avatar)}
                        </div>
                        <div>
                          <p className="text-xs text-white">{agent.displayName}</p>
                          <p className="text-[10px] text-gray-400">{agent.role}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {agents.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-500">{t('scopeProfile.noAgents')}</div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center pr-2">
                  <div className="flex-1 min-w-0">
                    <AgentRow agent={agent} />
                  </div>
                  {onRemoveAgent && (
                    <button
                      onClick={() => handleRemoveAgentFromScope(agent)}
                      className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remove from scope"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  MCP Servers                                                  */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-gray-400" />
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">MCP Servers</h3>
            </div>
            <button
              onClick={() => setShowCatalogPanel(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>

          {showPicker && (
            <div className="border-b border-gray-800 bg-gray-800/50">
              {availableServers.length === 0 ? (
                <p className="p-3 text-xs text-gray-400">
                  {allServers.length === 0 ? t('scopeProfile.noMcpConfigured') : t('scopeProfile.allMcpAssigned')}
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-gray-700/50">
                  {availableServers.map(server => (
                    <button key={server.id} onClick={() => handleAdd(server)} disabled={isAdding}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-700/50 transition-colors text-left disabled:opacity-50">
                      <div>
                        <p className="text-xs text-white">{server.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {server.config?.type === 'stdio'
                            ? `${server.config.command || ''} ${(server.config.args || []).join(' ')}`.trim()
                            : server.hostAddress}
                        </p>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-600 text-gray-300 font-mono">
                        {getTypeLabel(server.config as Record<string, unknown> | null, server.hostAddress)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            </div>
          ) : scopeServers.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-500">{t('scopeProfile.noMcpServers')}</div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {scopeServers.map(server => (
                <div key={server.id}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <button
                      onClick={() => handleEditConfig(server)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    >
                      <Server className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-white truncate">{server.name}</p>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 font-mono">
                            {getTypeLabel(server.config, server.host_address)}
                          </span>
                          {server.scope_config && Object.keys(server.scope_config).length > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400">{t('scopeProfile.configured')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleEditConfig(server)}
                        className="p-1 text-gray-600 hover:text-blue-400 transition-colors" title="Configure">
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleRemove(server)}
                        className="p-1 text-gray-600 hover:text-red-400 transition-colors" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Inline config editor */}
                  {editingConfigId === server.id && (
                    <div className="px-4 pb-3 bg-gray-800/30">
                      <label className="block text-[10px] font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                        Scope Configuration (JSON)
                      </label>
                      <textarea
                        value={configDraft}
                        onChange={e => setConfigDraft(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 text-xs bg-gray-900 border border-gray-700 rounded-lg text-white font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-colors resize-y"
                        placeholder='{ "connectionString": "postgres://..." }'
                        spellCheck={false}
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleSaveConfig(server.id)}
                          disabled={isSavingConfig}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {isSavingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingConfigId(null)}
                          className="px-2.5 py-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/*  Data Connectors                                               */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-400" />
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('connector.title')}</h3>
            </div>
            <button
              onClick={() => setShowConnectorPanel(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <Settings className="w-3 h-3" />
              {t('connector.manage')}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {t('connector.description')}
          </p>
        </div>

        <ConnectorPanel
          open={showConnectorPanel}
          onClose={() => setShowConnectorPanel(false)}
          scopeId={scope.id}
        />

        {/* ============================================================ */}
        {/*  Knowledge Base (Document Groups)                              */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <DocGroupsPanel scopeId={scope.id} scopeName={scope.name} />
        </div>

        {/* ============================================================ */}
        {/*  IM Channels                                                  */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <IMChannelsPanel scopeId={scope.id} scopeName={scope.name} />
        </div>

        {/* ============================================================ */}
        {/*  Scope Memory                                                 */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <ScopeMemoryPanel scopeId={scope.id} scopeName={scope.name} />
        </div>

        {/* ============================================================ */}
        {/*  Agent Evolution (Rehearsals & Proposals)                     */}
        {/* ============================================================ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
          <RehearsalPanel scopeId={scope.id} scopeName={scope.name} />
        </div>
      </div>

      {/* Skills Panel slide-out */}
      <SkillsPanel
        open={showSkillsPanel}
        onClose={() => setShowSkillsPanel(false)}
        scopeId={scope.id}
        onScopeSkillsChanged={reloadScopeSkills}
      />

      {/* MCP Server Catalog slide-out panel */}
      <MCPCatalogPanel
        open={showCatalogPanel}
        onClose={() => setShowCatalogPanel(false)}
        installedNames={installedServerNames}
        onInstall={handleCatalogInstall}
        onCustomInstall={handleCustomInstall}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Model Configuration Section                                        */
/* ------------------------------------------------------------------ */

function ModelConfigSection({ scope, onSave, onError }: {
  scope: { settings?: Record<string, unknown> | null }
  onSave: (modelId: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const initialModelId = (scope.settings as Record<string, unknown>)?.modelId as string || ''
  const [selectedModelId, setSelectedModelId] = useState(initialModelId)
  const [isSaving, setIsSaving] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; litellm_model: string; provider: string }>>([])
  const [isLoadingModels, setIsLoadingModels] = useState(true)

  // Sync if parent scope changes (e.g. switching between scopes)
  useEffect(() => {
    setSelectedModelId((scope.settings as Record<string, unknown>)?.modelId as string || '')
  }, [scope.settings])

  useEffect(() => {
    restClient.get<{ data: Array<{ id: string; litellm_model: string; provider: string }> }>('/api/litellm/models')
      .then(res => setModels(res.data || []))
      .catch(() => setModels([]))
      .finally(() => setIsLoadingModels(false))
  }, [])

  const handleSelect = async (litellmModel: string) => {
    const prev = selectedModelId
    setSelectedModelId(litellmModel)
    setIsSaving(true)
    try {
      await onSave(litellmModel)
    } catch (err) {
      setSelectedModelId(prev)
      onError(err instanceof Error ? err.message : 'Failed to save model')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-400" />
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Model</h3>
        </div>
        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}
      </div>
      <div className="space-y-2">
        {isLoadingModels ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading models...
          </div>
        ) : models.length === 0 ? (
          <p className="text-xs text-gray-500 px-1">No models available. Configure LITELLM_BASE_URL in backend .env.</p>
        ) : (
          <select
            value={selectedModelId}
            onChange={e => handleSelect(e.target.value)}
            disabled={isSaving}
            className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-purple-500 focus:outline-none font-mono appearance-none cursor-pointer disabled:opacity-50"
          >
            <option value="">Default (runtime setting)</option>
            {models.map(m => (
              <option key={m.litellm_model} value={m.litellm_model}>
                {m.id} — {m.provider}
              </option>
            ))}
          </select>
        )}
        <p className="text-[10px] text-gray-500">
          Default model for this scope. Changes take effect on the next conversation.
        </p>
      </div>
    </div>
  )
}
