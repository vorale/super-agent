import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Zap, FileText, Clock, Star, Plus, Trash2, X,
  ToggleLeft, ToggleRight, Save, ChevronDown, AlertTriangle
} from 'lucide-react'
import { useTranslation } from '@/i18n'
import { apiClient } from '@/services/api'

// =============================================================================
// Types
// =============================================================================

type TabId = 'escalation' | 'templates' | 'hours' | 'csat'

interface Condition {
  id: string
  type: 'ai_confidence' | 'sentiment_score' | 'message_count' | 'wait_time' | 'keywords'
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'contains'
  value: string
}

interface Action {
  id: string
  type: 'set_priority' | 'notify' | 'transfer_to_group'
  value: string
}

interface EscalationRule {
  id: string
  name: string
  conditions: Condition[]
  actions: Action[]
  priority: number
  logic: 'AND' | 'OR'
  active: boolean
}

interface ResponseTemplate {
  id: string
  name: string
  content: string
  category: string
  shortcut: string
}

interface DaySchedule {
  enabled: boolean
  start: string
  end: string
}

interface BusinessHours {
  timezone: string
  schedule: Record<string, DaySchedule>
  holidays: string[]
  offline_message: string
}

interface SurveyStats {
  total_surveys: number
  average_rating: number
  rating_distribution: Record<number, number>
}

interface Survey {
  id: string
  conversation_id: string
  customer_name: string
  rating: number
  comment: string | null
  created_at: string
}

// =============================================================================
// Constants
// =============================================================================

const conditionTypes: Record<string, string> = {
  ai_confidence: 'AI Confidence',
  sentiment_score: 'Sentiment Score',
  message_count: 'Message Count',
  wait_time: 'Wait Time (min)',
  keywords: 'Keywords',
}

const operatorLabels: Record<string, string> = {
  lt: '< (less than)',
  lte: '<= (less or equal)',
  gt: '> (greater than)',
  gte: '>= (greater or equal)',
  eq: '= (equals)',
  contains: 'contains',
}

const actionTypes: Record<string, string> = {
  set_priority: 'Set Priority',
  notify: 'Notify Agent',
  transfer_to_group: 'Transfer to Group',
}

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'escalation', label: 'Escalation Rules', icon: <Zap className="w-4 h-4" /> },
  { id: 'templates', label: 'Response Templates', icon: <FileText className="w-4 h-4" /> },
  { id: 'hours', label: 'Business Hours', icon: <Clock className="w-4 h-4" /> },
  { id: 'csat', label: 'CSAT Settings', icon: <Star className="w-4 h-4" /> },
]

const commonTimezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]

// =============================================================================
// Helpers
// =============================================================================

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function summaryConditions(conditions: Condition[]): string {
  return conditions
    .map((c) => `${conditionTypes[c.type] || c.type} ${operatorLabels[c.operator]} ${c.value}`)
    .join(', ')
}

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sizeClass} ${
            i <= Math.round(rating)
              ? 'fill-yellow-400 text-yellow-400'
              : 'fill-gray-700 text-gray-600'
          }`}
        />
      ))}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function SupportSettings() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('escalation')

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <h1 className="text-lg font-semibold flex items-center gap-2 text-white">
          <Settings className="w-5 h-5 text-blue-400" />
          Customer Service Settings
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'escalation' && <EscalationRulesTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'hours' && <BusinessHoursTab />}
        {activeTab === 'csat' && <CsatTab />}
      </div>
    </div>
  )
}

// =============================================================================
// Tab 1: Escalation Rules
// =============================================================================

function EscalationRulesTab() {
  const [rules, setRules] = useState<EscalationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPriority, setFormPriority] = useState(1)
  const [formLogic, setFormLogic] = useState<'AND' | 'OR'>('AND')
  const [formConditions, setFormConditions] = useState<Condition[]>([])
  const [formActions, setFormActions] = useState<Action[]>([])

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/support/escalation-rules')
      setRules(res.data.rules || [])
    } catch (err) {
      console.error('Failed to load escalation rules:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const openCreateModal = () => {
    setFormName('')
    setFormPriority(1)
    setFormLogic('AND')
    setFormConditions([])
    setFormActions([])
    setShowModal(true)
  }

  const addCondition = () => {
    setFormConditions((prev) => [
      ...prev,
      { id: uid(), type: 'ai_confidence', operator: 'lt', value: '' },
    ])
  }

  const updateCondition = (id: string, field: keyof Condition, value: string) => {
    setFormConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  const removeCondition = (id: string) => {
    setFormConditions((prev) => prev.filter((c) => c.id !== id))
  }

  const addAction = () => {
    setFormActions((prev) => [
      ...prev,
      { id: uid(), type: 'set_priority', value: '' },
    ])
  }

  const updateAction = (id: string, field: keyof Action, value: string) => {
    setFormActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    )
  }

  const removeAction = (id: string) => {
    setFormActions((prev) => prev.filter((a) => a.id !== id))
  }

  const handleCreate = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const res = await apiClient.post('/support/escalation-rules', {
        name: formName,
        conditions: formConditions.map(({ id: _id, ...rest }) => rest),
        actions: formActions.map(({ id: _id, ...rest }) => rest),
        priority: formPriority,
        logic: formLogic,
      })
      setRules((prev) => [...prev, res.data.rule])
      setShowModal(false)
    } catch (err) {
      console.error('Failed to create rule:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this escalation rule?')) return
    try {
      await apiClient.delete(`/support/escalation-rules/${ruleId}`)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
    } catch (err) {
      console.error('Failed to delete rule:', err)
    }
  }

  const handleToggleActive = async (rule: EscalationRule) => {
    try {
      await apiClient.put(`/support/escalation-rules/${rule.id}`, {
        active: !rule.active,
      })
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
      )
    } catch (err) {
      console.error('Failed to toggle rule:', err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-white">Escalation Rules</h2>
          <p className="text-sm text-gray-500 mt-1">Automatically escalate conversations based on conditions</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          No escalation rules configured
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`border rounded-lg p-4 transition-colors ${
                rule.active ? 'border-gray-700 bg-gray-900' : 'border-gray-800 bg-gray-900/50 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-medium text-white">{rule.name}</h3>
                  <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                    Priority: {rule.priority}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                    {rule.logic}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleActive(rule)} className="p-1 hover:bg-gray-800 rounded transition-colors">
                    {rule.active ? (
                      <ToggleRight className="w-6 h-6 text-blue-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-600" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {rule.conditions.length > 0
                  ? `If ${summaryConditions(rule.conditions)} then ${rule.actions.map((a) => `${actionTypes[a.type]}${a.value ? `: ${a.value}` : ''}`).join(', ')}`
                  : 'No conditions configured'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">New Escalation Rule</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-800 rounded transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Low AI confidence alert"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Priority + Logic */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Priority</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formPriority}
                    onChange={(e) => setFormPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Logic</label>
                  <div className="flex rounded-lg border border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setFormLogic('AND')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        formLogic === 'AND' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      AND
                    </button>
                    <button
                      onClick={() => setFormLogic('OR')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        formLogic === 'OR' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      OR
                    </button>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-400">Conditions</label>
                  <button
                    onClick={addCondition}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-3 h-3" /> Add Condition
                  </button>
                </div>
                {formConditions.length === 0 && (
                  <p className="text-xs text-gray-600 py-2">No conditions added</p>
                )}
                <div className="space-y-2">
                  {formConditions.map((cond) => (
                    <div key={cond.id} className="flex items-center gap-2">
                      <select
                        value={cond.type}
                        onChange={(e) => updateCondition(cond.id, 'type', e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {Object.entries(conditionTypes).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(cond.id, 'operator', e.target.value)}
                        className="w-32 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {Object.entries(operatorLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={cond.value}
                        onChange={(e) => updateCondition(cond.id, 'value', e.target.value)}
                        placeholder="Value"
                        className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => removeCondition(cond.id)}
                        className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-400">Actions</label>
                  <button
                    onClick={addAction}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-3 h-3" /> Add Action
                  </button>
                </div>
                {formActions.length === 0 && (
                  <p className="text-xs text-gray-600 py-2">No actions added</p>
                )}
                <div className="space-y-2">
                  {formActions.map((act) => (
                    <div key={act.id} className="flex items-center gap-2">
                      <select
                        value={act.type}
                        onChange={(e) => updateAction(act.id, 'type', e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {Object.entries(actionTypes).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={act.value}
                        onChange={(e) => updateAction(act.id, 'value', e.target.value)}
                        placeholder="Value"
                        className="w-32 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => removeAction(act.id)}
                        className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Tab 2: Response Templates
// =============================================================================

function TemplatesTab() {
  const [templates, setTemplates] = useState<ResponseTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('general')
  const [formShortcut, setFormShortcut] = useState('')

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/support/templates')
      setTemplates(res.data.templates || [])
    } catch (err) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const openCreateForm = () => {
    setFormName('')
    setFormContent('')
    setFormCategory('general')
    setFormShortcut('')
    setShowForm(true)
  }

  const handleCreate = async () => {
    if (!formName.trim() || !formContent.trim()) return
    setSaving(true)
    try {
      const res = await apiClient.post('/support/templates', {
        name: formName,
        content: formContent,
        category: formCategory,
        shortcut: formShortcut,
      })
      setTemplates((prev) => [...prev, res.data.template])
      setShowForm(false)
    } catch (err) {
      console.error('Failed to create template:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return
    try {
      await apiClient.delete(`/support/templates/${id}`)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
  }

  // Group templates by category
  const grouped = templates.reduce<Record<string, ResponseTemplate[]>>((acc, tpl) => {
    const cat = tpl.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tpl)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-white">Response Templates</h2>
          <p className="text-sm text-gray-500 mt-1">Predefined replies for common scenarios</p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-700" />
          No templates created yet
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, tpls]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {tpls.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="border border-gray-800 rounded-lg p-4 bg-gray-900 hover:bg-gray-900/80 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-white">{tpl.name}</h4>
                        {tpl.shortcut && (
                          <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-xs border border-gray-700">
                            /{tpl.shortcut}
                          </kbd>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(tpl.id)}
                        className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{tpl.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">New Template</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-800 rounded transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Greeting message"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Content</label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Template content..."
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g., general, billing, support"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Shortcut</label>
                  <input
                    type="text"
                    value={formShortcut}
                    onChange={(e) => setFormShortcut(e.target.value)}
                    placeholder="e.g., greet"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-800">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formName.trim() || !formContent.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Tab 3: Business Hours
// =============================================================================

function BusinessHoursTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>({})
  const [holidays, setHolidays] = useState<string[]>([])
  const [holidayInput, setHolidayInput] = useState('')
  const [offlineMessage, setOfflineMessage] = useState('')

  const defaultSchedule: Record<string, DaySchedule> = {}
  dayKeys.forEach((key) => {
    defaultSchedule[key] = { enabled: key !== 'sat' && key !== 'sun', start: '09:00', end: '17:00' }
  })

  const loadHours = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/support/business-hours')
      const data: BusinessHours = res.data.business_hours || res.data
      setTimezone(data.timezone || 'UTC')
      setSchedule(data.schedule && Object.keys(data.schedule).length > 0 ? data.schedule : defaultSchedule)
      setHolidays(data.holidays || [])
      setOfflineMessage(data.offline_message || '')
    } catch (err) {
      console.error('Failed to load business hours:', err)
      setSchedule(defaultSchedule)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHours()
  }, [loadHours])

  const updateDay = (key: string, field: keyof DaySchedule, value: string | boolean) => {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  const addHoliday = () => {
    if (!holidayInput.trim()) return
    if (holidays.includes(holidayInput)) return
    setHolidays((prev) => [...prev, holidayInput])
    setHolidayInput('')
  }

  const removeHoliday = (date: string) => {
    setHolidays((prev) => prev.filter((h) => h !== date))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiClient.post('/support/business-hours', {
        timezone,
        schedule,
        holidays,
        offline_message: offlineMessage,
      })
    } catch (err) {
      console.error('Failed to save business hours:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500 text-sm">Loading business hours...</div>
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-white">Business Hours</h2>
          <p className="text-sm text-gray-500 mt-1">Configure your availability and offline messaging</p>
        </div>
      </div>

      {/* Timezone */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-1">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
        >
          {commonTimezones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Weekly Schedule */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-3">Weekly Schedule</label>
        <div className="space-y-2">
          {dayKeys.map((key, i) => {
            const day = schedule[key] || { enabled: false, start: '09:00', end: '17:00' }
            return (
              <div key={key} className="flex items-center gap-3 border border-gray-800 rounded-lg p-3 bg-gray-900">
                <label className="flex items-center gap-2 w-32 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(key, 'enabled', e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-white">{dayNames[i]}</span>
                </label>
                {day.enabled && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={day.start}
                      onChange={(e) => updateDay(key, 'start', e.target.value)}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-gray-500">to</span>
                    <input
                      type="time"
                      value={day.end}
                      onChange={(e) => updateDay(key, 'end', e.target.value)}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Holidays */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">Holidays</label>
        <div className="flex gap-2 mb-2">
          <input
            type="date"
            value={holidayInput}
            onChange={(e) => setHolidayInput(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addHoliday}
            className="px-3 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
          >
            Add
          </button>
        </div>
        {holidays.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {holidays.map((date) => (
              <span
                key={date}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300"
              >
                {date}
                <button
                  onClick={() => removeHoliday(date)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Offline Message */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-1">Offline Message</label>
        <textarea
          value={offlineMessage}
          onChange={(e) => setOfflineMessage(e.target.value)}
          placeholder="Message displayed when outside business hours..."
          rows={3}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Tab 4: CSAT Settings
// =============================================================================

function CsatTab() {
  const [stats, setStats] = useState<SurveyStats | null>(null)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, surveysRes] = await Promise.all([
        apiClient.get('/support/surveys/stats'),
        apiClient.get('/support/surveys'),
      ])
      setStats(statsRes.data.stats || statsRes.data)
      setSurveys(surveysRes.data.surveys || [])
    } catch (err) {
      console.error('Failed to load CSAT data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return <div className="text-center py-12 text-gray-500 text-sm">Loading CSAT data...</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-base font-semibold text-white">CSAT Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Customer satisfaction survey results and analytics</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
            <p className="text-xs text-gray-500 mb-1">Total Surveys</p>
            <p className="text-2xl font-bold text-white">{stats.total_surveys}</p>
          </div>
          <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
            <p className="text-xs text-gray-500 mb-1">Average Rating</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold text-white">{stats.average_rating.toFixed(1)}</p>
              <StarRating rating={stats.average_rating} />
            </div>
          </div>
          <div className="border border-gray-800 rounded-lg p-4 bg-gray-900">
            <p className="text-xs text-gray-500 mb-2">Rating Distribution</p>
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((r) => {
                const count = stats.rating_distribution?.[r] || 0
                const pct = stats.total_surveys > 0 ? (count / stats.total_surveys) * 100 : 0
                return (
                  <div key={r} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-3">{r}</span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recent Surveys */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Recent Surveys</h3>
        {surveys.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <Star className="w-10 h-10 mx-auto mb-3 text-gray-700" />
            No survey responses yet
          </div>
        ) : (
          <div className="space-y-2">
            {surveys.map((survey) => (
              <div
                key={survey.id}
                className="border border-gray-800 rounded-lg p-4 bg-gray-900"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{survey.customer_name || 'Anonymous'}</span>
                    <span className="text-xs text-gray-500">{formatDate(survey.created_at)}</span>
                  </div>
                  <StarRating rating={survey.rating} size="sm" />
                </div>
                {survey.comment && (
                  <p className="text-xs text-gray-400">{survey.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
