/**
 * Support Settings Page
 * Four tabs with full CRUD: Agent Groups, Escalation Rules, Response Templates, Business Hours.
 */

import { useState, useEffect } from 'react'
import { Settings, Users, AlertTriangle, MessageSquare, Clock, Plus, Trash2, Edit, X } from 'lucide-react'
import { RestSupportService, type AgentGroup, type EscalationRule, type ResponseTemplate, type BusinessHoursConfig } from '@/services/api/restSupportService'
import { useTranslation } from '@/i18n'

type Tab = 'groups' | 'escalation' | 'templates' | 'hours'

// ============================================================================
// Generic Modal Component
// ============================================================================
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-[520px] max-h-[80vh] overflow-y-auto border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
const btnPrimary = "px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
const btnDanger = "px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"

export function SupportSettings() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('groups')
  const [agentGroups, setAgentGroups] = useState<AgentGroup[]>([])
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>([])
  const [templates, setTemplates] = useState<ResponseTemplate[]>([])
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modal, setModal] = useState<{ type: 'create' | 'edit'; data?: any } | null>(null)

  useEffect(() => { loadData() }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      switch (activeTab) {
        case 'groups': setAgentGroups(await RestSupportService.getAgentGroups()); break
        case 'escalation': setEscalationRules(await RestSupportService.getEscalationRules()); break
        case 'templates': setTemplates(await RestSupportService.getResponseTemplates()); break
        case 'hours': setBusinessHours(await RestSupportService.getBusinessHours()); break
      }
    } catch (err) { console.error('Failed to load settings:', err) }
    finally { setLoading(false) }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'groups', label: t('support.agentGroups'), icon: <Users className="w-4 h-4" /> },
    { key: 'escalation', label: t('support.escalationRules'), icon: <AlertTriangle className="w-4 h-4" /> },
    { key: 'templates', label: t('support.responseTemplates'), icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'hours', label: t('support.businessHours'), icon: <Clock className="w-4 h-4" /> },
  ]

  // ========================================================================
  // Agent Group CRUD
  // ========================================================================
  const handleCreateGroup = async (form: { name: string; description: string; routingStrategy: string; maxConcurrent: number }) => {
    await RestSupportService.createAgentGroup(form)
    setModal(null); loadData()
  }
  const handleUpdateGroup = async (id: string, form: Record<string, unknown>) => {
    await RestSupportService.updateAgentGroup(id, form as any)
    setModal(null); loadData()
  }
  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this agent group?')) return
    await RestSupportService.deleteAgentGroup(id); loadData()
  }

  // ========================================================================
  // Escalation Rule CRUD
  // ========================================================================
  const handleCreateRule = async (form: { name: string; priority: number; conditions: string; actions: string }) => {
    await RestSupportService.createEscalationRule({
      name: form.name, priority: form.priority,
      conditions: safeJsonParse(form.conditions), actions: safeJsonParse(form.actions),
    })
    setModal(null); loadData()
  }
  const handleUpdateRule = async (id: string, form: Record<string, unknown>) => {
    await RestSupportService.updateEscalationRule(id, form as any)
    setModal(null); loadData()
  }
  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this escalation rule?')) return
    await RestSupportService.deleteEscalationRule(id); loadData()
  }

  // ========================================================================
  // Response Template CRUD
  // ========================================================================
  const handleCreateTemplate = async (form: { name: string; content: string; category: string; shortcut: string }) => {
    await RestSupportService.createResponseTemplate(form)
    setModal(null); loadData()
  }
  const handleUpdateTemplate = async (id: string, form: Record<string, unknown>) => {
    await RestSupportService.updateResponseTemplate(id, form as any)
    setModal(null); loadData()
  }
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return
    await RestSupportService.deleteResponseTemplate(id); loadData()
  }

  // ========================================================================
  // Business Hours CRUD
  // ========================================================================
  const handleCreateHours = async (form: Record<string, unknown>) => {
    await RestSupportService.createBusinessHours(form as any)
    setModal(null); loadData()
  }
  const handleUpdateHours = async (id: string, form: Record<string, unknown>) => {
    await RestSupportService.updateBusinessHours(id, form as any)
    setModal(null); loadData()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold">{t('support.settings')}</h1>
        </div>
        <button onClick={() => setModal({ type: 'create' })} className={`${btnPrimary} flex items-center gap-2`}>
          <Plus className="w-4 h-4" /> Create
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-1">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setModal(null) }}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${
              activeTab === tab.key ? 'bg-white/10 text-white border-b-2 border-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}>{tab.icon}{tab.label}</button>
        ))}
      </div>

      {loading ? <div className="text-center text-gray-500 py-12">Loading...</div> : (
        <>
          {/* ============ Agent Groups ============ */}
          {activeTab === 'groups' && (
            <div className="space-y-4">
              {agentGroups.map(group => (
                <div key={group.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{group.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">{group.routing_strategy}</span>
                      <span className={`text-xs px-2 py-1 rounded ${group.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {group.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <button onClick={() => setModal({ type: 'edit', data: group })} className="p-1 hover:bg-white/10 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => handleDeleteGroup(group.id)} className="p-1 hover:bg-white/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  {group.description && <p className="text-sm text-gray-400 mb-2">{group.description}</p>}
                  <div className="text-xs text-gray-500">{group.agent_group_members.length} members · Max concurrent: {group.max_concurrent}</div>
                </div>
              ))}
              {agentGroups.length === 0 && <div className="text-center text-gray-500 py-8">No agent groups configured</div>}
            </div>
          )}

          {/* ============ Escalation Rules ============ */}
          {activeTab === 'escalation' && (
            <div className="space-y-4">
              {escalationRules.map(rule => (
                <div key={rule.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{rule.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Priority: {rule.priority}</span>
                      <button onClick={() => setModal({ type: 'edit', data: rule })} className="p-1 hover:bg-white/10 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => handleDeleteRule(rule.id)} className="p-1 hover:bg-white/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">Conditions: {JSON.stringify(rule.conditions)} · Actions: {JSON.stringify(rule.actions)}</div>
                </div>
              ))}
              {escalationRules.length === 0 && <div className="text-center text-gray-500 py-8">No escalation rules configured</div>}
            </div>
          )}

          {/* ============ Response Templates ============ */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{tmpl.name}</h3>
                      {tmpl.shortcut && <code className="text-xs bg-white/10 px-2 py-0.5 rounded">{tmpl.shortcut}</code>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModal({ type: 'edit', data: tmpl })} className="p-1 hover:bg-white/10 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => handleDeleteTemplate(tmpl.id)} className="p-1 hover:bg-white/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300">{tmpl.content}</p>
                  {tmpl.category && <span className="text-xs text-gray-500 mt-1 inline-block">{tmpl.category}</span>}
                </div>
              ))}
              {templates.length === 0 && <div className="text-center text-gray-500 py-8">No response templates configured</div>}
            </div>
          )}

          {/* ============ Business Hours ============ */}
          {activeTab === 'hours' && (
            <div className="space-y-4">
              {businessHours.map(bh => (
                <div key={bh.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">{bh.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{bh.timezone}</span>
                      <button onClick={() => setModal({ type: 'edit', data: bh })} className="p-1 hover:bg-white/10 rounded"><Edit className="w-3.5 h-3.5 text-gray-400" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-2 text-xs">
                    {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const).map(day => {
                      const s = bh[`${day}_start` as keyof BusinessHoursConfig] as string | null
                      const e = bh[`${day}_end` as keyof BusinessHoursConfig] as string | null
                      return (<div key={day} className="text-center"><div className="text-gray-500 capitalize mb-1">{day.slice(0,3)}</div><div className={s ? 'text-green-400' : 'text-gray-600'}>{s && e ? `${s}-${e}` : 'Off'}</div></div>)
                    })}
                  </div>
                  {bh.offline_message && <p className="text-xs text-gray-500 mt-2">Offline: {bh.offline_message}</p>}
                </div>
              ))}
              {businessHours.length === 0 && <div className="text-center text-gray-500 py-8">No business hours configured</div>}
            </div>
          )}
        </>
      )}

      {/* ============ Create/Edit Modals ============ */}
      {modal && activeTab === 'groups' && (
        <AgentGroupForm
          initial={modal.type === 'edit' ? modal.data : undefined}
          onSubmit={modal.type === 'edit' ? (f) => handleUpdateGroup(modal.data.id, f) : handleCreateGroup}
          onClose={() => setModal(null)}
        />
      )}
      {modal && activeTab === 'escalation' && (
        <EscalationRuleForm
          initial={modal.type === 'edit' ? modal.data : undefined}
          onSubmit={modal.type === 'edit' ? (f) => handleUpdateRule(modal.data.id, f) : handleCreateRule}
          onClose={() => setModal(null)}
        />
      )}
      {modal && activeTab === 'templates' && (
        <ResponseTemplateForm
          initial={modal.type === 'edit' ? modal.data : undefined}
          onSubmit={modal.type === 'edit' ? (f) => handleUpdateTemplate(modal.data.id, f) : handleCreateTemplate}
          onClose={() => setModal(null)}
        />
      )}
      {modal && activeTab === 'hours' && (
        <BusinessHoursForm
          initial={modal.type === 'edit' ? modal.data : undefined}
          onSubmit={modal.type === 'edit' ? (f) => handleUpdateHours(modal.data.id, f) : handleCreateHours}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Form Components
// ============================================================================

function AgentGroupForm({ initial, onSubmit, onClose }: {
  initial?: AgentGroup; onSubmit: (f: any) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [routingStrategy, setRoutingStrategy] = useState(initial?.routing_strategy ?? 'round_robin')
  const [maxConcurrent, setMaxConcurrent] = useState(initial?.max_concurrent ?? 5)

  return (
    <Modal title={initial ? 'Edit Agent Group' : 'Create Agent Group'} onClose={onClose}>
      <FormField label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tier 1 Support" /></FormField>
      <FormField label="Description"><input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" /></FormField>
      <FormField label="Routing Strategy">
        <select className={inputCls} value={routingStrategy} onChange={e => setRoutingStrategy(e.target.value)}>
          <option value="round_robin">Round Robin</option>
          <option value="least_busy">Least Busy</option>
          <option value="manual">Manual</option>
        </select>
      </FormField>
      <FormField label="Max Concurrent"><input type="number" className={inputCls} value={maxConcurrent} onChange={e => setMaxConcurrent(Number(e.target.value))} min={1} max={50} /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
        <button onClick={() => onSubmit({ name, description, routing_strategy: routingStrategy, max_concurrent: maxConcurrent })} disabled={!name.trim()} className={btnPrimary}>
          {initial ? 'Update' : 'Create'}
        </button>
      </div>
    </Modal>
  )
}

function EscalationRuleForm({ initial, onSubmit, onClose }: {
  initial?: EscalationRule; onSubmit: (f: any) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [priority, setPriority] = useState(initial?.priority ?? 0)
  const [conditions, setConditions] = useState(initial ? JSON.stringify(initial.conditions, null, 2) : '{}')
  const [actions, setActions] = useState(initial ? JSON.stringify(initial.actions, null, 2) : '{}')

  return (
    <Modal title={initial ? 'Edit Escalation Rule' : 'Create Escalation Rule'} onClose={onClose}>
      <FormField label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Long Wait Time" /></FormField>
      <FormField label="Priority"><input type="number" className={inputCls} value={priority} onChange={e => setPriority(Number(e.target.value))} /></FormField>
      <FormField label="Conditions (JSON)"><textarea className={`${inputCls} h-24 font-mono text-xs`} value={conditions} onChange={e => setConditions(e.target.value)} /></FormField>
      <FormField label="Actions (JSON)"><textarea className={`${inputCls} h-24 font-mono text-xs`} value={actions} onChange={e => setActions(e.target.value)} /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
        <button onClick={() => onSubmit({ name, priority, conditions, actions })} disabled={!name.trim()} className={btnPrimary}>
          {initial ? 'Update' : 'Create'}
        </button>
      </div>
    </Modal>
  )
}

function ResponseTemplateForm({ initial, onSubmit, onClose }: {
  initial?: ResponseTemplate; onSubmit: (f: any) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? '')

  return (
    <Modal title={initial ? 'Edit Template' : 'Create Template'} onClose={onClose}>
      <FormField label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Greeting" /></FormField>
      <FormField label="Content"><textarea className={`${inputCls} h-24`} value={content} onChange={e => setContent(e.target.value)} placeholder="Template content..." /></FormField>
      <FormField label="Category"><input className={inputCls} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. greeting, closing" /></FormField>
      <FormField label="Shortcut"><input className={inputCls} value={shortcut} onChange={e => setShortcut(e.target.value)} placeholder="e.g. /greet" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
        <button onClick={() => onSubmit({ name, content, category, shortcut })} disabled={!name.trim() || !content.trim()} className={btnPrimary}>
          {initial ? 'Update' : 'Create'}
        </button>
      </div>
    </Modal>
  )
}

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const

function BusinessHoursForm({ initial, onSubmit, onClose }: {
  initial?: BusinessHoursConfig; onSubmit: (f: any) => void; onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [timezone, setTimezone] = useState(initial?.timezone ?? 'Asia/Shanghai')
  const [offlineMessage, setOfflineMessage] = useState(initial?.offline_message ?? '')
  const [schedule, setSchedule] = useState<Record<string, { start: string; end: string }>>(() => {
    const s: Record<string, { start: string; end: string }> = {}
    for (const d of DAYS) {
      s[d] = {
        start: (initial?.[`${d}_start` as keyof BusinessHoursConfig] as string) ?? '',
        end: (initial?.[`${d}_end` as keyof BusinessHoursConfig] as string) ?? '',
      }
    }
    return s
  })

  const handleSubmit = () => {
    const data: Record<string, unknown> = { name, timezone, offline_message: offlineMessage || null }
    for (const d of DAYS) {
      data[`${d}_start`] = schedule[d]!.start || null
      data[`${d}_end`] = schedule[d]!.end || null
    }
    onSubmit(data)
  }

  return (
    <Modal title={initial ? 'Edit Business Hours' : 'Create Business Hours'} onClose={onClose}>
      <FormField label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Default Hours" /></FormField>
      <FormField label="Timezone"><input className={inputCls} value={timezone} onChange={e => setTimezone(e.target.value)} /></FormField>
      <div className="mb-3">
        <label className="block text-sm text-gray-400 mb-2">Weekly Schedule</label>
        <div className="space-y-2">
          {DAYS.map(day => (
            <div key={day} className="flex items-center gap-2">
              <span className="w-12 text-xs text-gray-400 capitalize">{day.slice(0,3)}</span>
              <input type="text" className={`${inputCls} w-20 text-center`} value={schedule[day]!.start} onChange={e => setSchedule(s => ({ ...s, [day]: { ...s[day]!, start: e.target.value } }))} placeholder="09:00" />
              <span className="text-gray-500">—</span>
              <input type="text" className={`${inputCls} w-20 text-center`} value={schedule[day]!.end} onChange={e => setSchedule(s => ({ ...s, [day]: { ...s[day]!, end: e.target.value } }))} placeholder="18:00" />
            </div>
          ))}
        </div>
      </div>
      <FormField label="Offline Message"><textarea className={`${inputCls} h-16`} value={offlineMessage} onChange={e => setOfflineMessage(e.target.value)} placeholder="Message shown outside business hours" /></FormField>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
        <button onClick={handleSubmit} disabled={!name.trim()} className={btnPrimary}>{initial ? 'Update' : 'Create'}</button>
      </div>
    </Modal>
  )
}

function safeJsonParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str) } catch { return {} }
}
