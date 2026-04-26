/**
 * Support Workspace Page
 * Three-column layout: conversation list, conversation detail, customer info panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headphones, Send, UserCheck, CheckCircle, XCircle, ArrowRightLeft, RefreshCw, MessageSquare, Clock, AlertTriangle, UserPlus, Plus, Settings, BarChart3, BookOpen } from 'lucide-react'
import { RestSupportService, type SupportConversation, type ChatMessage, type CustomerProfile } from '@/services/api/restSupportService'
import { useTranslation } from '@/i18n'

type StatusFilter = 'all' | 'open' | 'pending_agent' | 'resolved'

/** Helper: get the last message content from a conversation's metadata or return empty */
function getLastMessagePreview(conv: SupportConversation): string {
  const meta = conv.metadata as Record<string, unknown> | undefined
  if (meta?.lastMessage) return String(meta.lastMessage).substring(0, 60)
  return ''
}

const statusColors: Record<string, string> = {
  open: 'bg-green-500/20 text-green-400',
  pending_agent: 'bg-yellow-500/20 text-yellow-400',
  resolved: 'bg-blue-500/20 text-blue-400',
  closed: 'bg-gray-500/20 text-gray-400',
}

const priorityColors: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-blue-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
}

export function SupportWorkspace() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<SupportConversation[]>([])
  const [selectedConv, setSelectedConv] = useState<(SupportConversation & { messages: ChatMessage[] }) | null>(null)
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [replyText, setReplyText] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignAgentId, setAssignAgentId] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ customerName: '', customerEmail: '', message: '', priority: 'medium' })
  const [creating, setCreating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      const result = await RestSupportService.getConversations(params)
      setConversations(result.data)
    } catch (err) {
      console.error('Failed to load conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadConversations()
    const interval = setInterval(loadConversations, 10_000)
    return () => clearInterval(interval)
  }, [loadConversations])

  const selectConversation = async (conv: SupportConversation) => {
    try {
      const detail = await RestSupportService.getConversation(conv.id)
      setSelectedConv(detail)
      if (detail.customer_id) {
        const cust = await RestSupportService.getCustomer(detail.customer_id)
        setCustomer(cust)
      } else {
        setCustomer(null)
      }
    } catch (err) {
      console.error('Failed to load conversation detail:', err)
    }
  }

  const handleSendReply = async () => {
    if (!selectedConv || !replyText.trim()) return
    try {
      await RestSupportService.sendMessage(selectedConv.id, replyText)
      setReplyText('')
      const detail = await RestSupportService.getConversation(selectedConv.id)
      setSelectedConv(detail)
    } catch (err) {
      console.error('Failed to send reply:', err)
    }
  }

  const handleResolve = async () => {
    if (!selectedConv) return
    await RestSupportService.resolveConversation(selectedConv.id)
    loadConversations()
    const detail = await RestSupportService.getConversation(selectedConv.id)
    setSelectedConv(detail)
  }

  const handleClose = async () => {
    if (!selectedConv) return
    await RestSupportService.closeConversation(selectedConv.id)
    loadConversations()
    setSelectedConv(null)
  }

  const handleHandoff = async () => {
    if (!selectedConv) return
    await RestSupportService.handoffToHuman(selectedConv.id)
    loadConversations()
    const detail = await RestSupportService.getConversation(selectedConv.id)
    setSelectedConv(detail)
  }

  const handleAssign = async () => {
    if (!selectedConv || !assignAgentId.trim()) return
    try {
      await RestSupportService.assignAgent(selectedConv.id, assignAgentId.trim())
      setShowAssignModal(false)
      setAssignAgentId('')
      loadConversations()
      const detail = await RestSupportService.getConversation(selectedConv.id)
      setSelectedConv(detail)
    } catch (err) {
      console.error('Failed to assign agent:', err)
    }
  }

  const handleCreateConversation = async () => {
    if (!createForm.customerName.trim() || !createForm.message.trim()) return
    setCreating(true)
    try {
      const result = await RestSupportService.createConversation({
        customerName: createForm.customerName,
        customerEmail: createForm.customerEmail || undefined,
        message: createForm.message,
        priority: createForm.priority,
      })
      setShowCreateModal(false)
      setCreateForm({ customerName: '', customerEmail: '', message: '', priority: 'medium' })
      await loadConversations()
      // Auto-select the new conversation
      const detail = await RestSupportService.getConversation(result.conversation.id)
      setSelectedConv(detail)
      if (result.customer) setCustomer(result.customer)
    } catch (err) {
      console.error('Failed to create conversation:', err)
    } finally {
      setCreating(false)
    }
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('support.conversations') },
    { key: 'open', label: 'Open' },
    { key: 'pending_agent', label: t('support.handoff') },
    { key: 'resolved', label: t('support.resolve') },
  ]

  return (
    <div className="flex h-full">
      {/* Left: Conversation List */}
      <div className="w-80 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Headphones className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">{t('support.workspace')}</h2>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              title="New Conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-navigation */}
          <div className="flex gap-1 mb-3">
            <button onClick={() => navigate('/support/settings')} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors">
              <Settings className="w-3 h-3" /> {t('support.settings')}
            </button>
            <button onClick={() => navigate('/support/analytics')} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors">
              <BarChart3 className="w-3 h-3" /> {t('support.analytics')}
            </button>
            <button onClick={() => navigate('/support/knowledge')} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors">
              <BookOpen className="w-3 h-3" /> {t('support.knowledge')}
            </button>
          </div>

          <div className="flex gap-1 flex-wrap">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  statusFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No conversations</div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`w-full p-3 text-left border-b border-white/5 hover:bg-white/5 transition-colors ${
                  selectedConv?.id === conv.id ? 'bg-white/10' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">
                    {conv.customer?.name ?? 'Unknown Customer'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[conv.status] ?? ''}`}>
                    {conv.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 truncate">{conv.channel_type}</span>
                  <span className={`text-xs ${priorityColors[conv.priority] ?? ''}`}>{conv.priority}</span>
                </div>
                {getLastMessagePreview(conv) && (
                  <div className="text-xs text-gray-500 mt-1 truncate italic">
                    {getLastMessagePreview(conv)}
                  </div>
                )}
                <div className="text-xs text-gray-600 mt-0.5">
                  {new Date(conv.created_at).toLocaleString()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Center: Conversation Detail */}
      <div className="flex-1 flex flex-col">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="font-medium">{customer?.name ?? 'Customer'}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${statusColors[selectedConv.status] ?? ''}`}>
                  {selectedConv.status}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAssignModal(true)} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={t('support.assign')}>
                  <UserPlus className="w-4 h-4 text-blue-400" />
                </button>
                <button onClick={handleHandoff} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={t('support.handoff')}>
                  <ArrowRightLeft className="w-4 h-4 text-yellow-400" />
                </button>
                <button onClick={handleResolve} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={t('support.resolve')}>
                  <CheckCircle className="w-4 h-4 text-green-400" />
                </button>
                <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={t('support.close')}>
                  <XCircle className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(selectedConv.messages ?? []).map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.type === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${
                    msg.type === 'user'
                      ? 'bg-white/10 text-gray-200'
                      : 'bg-blue-600/20 text-blue-200'
                  }`}>
                    <div className="text-xs text-gray-500 mb-1">{msg.type === 'user' ? 'Customer' : 'Agent'}</div>
                    {msg.content}
                    <div className="text-xs text-gray-600 mt-1">{new Date(msg.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendReply()}
                  placeholder="Type a reply..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a conversation to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Right: Customer Info Panel */}
      <div className="w-72 border-l border-white/10 p-4 overflow-y-auto">
        {customer ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-medium">{customer.name}</h3>
                {customer.email && <p className="text-xs text-gray-400">{customer.email}</p>}
              </div>
            </div>

            {customer.phone && (
              <div className="mb-3">
                <span className="text-xs text-gray-500">Phone</span>
                <p className="text-sm">{customer.phone}</p>
              </div>
            )}

            {customer.tags && customer.tags.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500">Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {customer.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white/10 rounded text-xs">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {customer.notes && (
              <div className="mb-3">
                <span className="text-xs text-gray-500">Notes</span>
                <p className="text-sm text-gray-300">{customer.notes}</p>
              </div>
            )}

            {customer.recentConversations && customer.recentConversations.length > 0 && (
              <div>
                <span className="text-xs text-gray-500">Recent Conversations</span>
                <div className="mt-1 space-y-1">
                  {customer.recentConversations.slice(0, 5).map(c => (
                    <div key={c.id} className="p-2 bg-white/5 rounded text-xs">
                      <div className="flex justify-between">
                        <span className={statusColors[c.status]}>{c.status}</span>
                        <span className="text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No customer selected</p>
          </div>
        )}
      </div>

      {/* Assign Agent Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAssignModal(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-96 border border-white/10" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{t('support.assign')}</h3>
            <label className="block text-sm text-gray-400 mb-2">Agent User ID</label>
            <input
              type="text"
              value={assignAgentId}
              onChange={e => setAssignAgentId(e.target.value)}
              placeholder="Enter agent user ID (UUID)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignAgentId.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
              >
                {t('support.assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Conversation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[440px] border border-white/10" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Conversation</h3>

            <div className="mb-3">
              <label className="block text-sm text-gray-400 mb-1">Customer Name *</label>
              <input
                type="text"
                value={createForm.customerName}
                onChange={e => setCreateForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="e.g. John Doe"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm text-gray-400 mb-1">Customer Email</label>
              <input
                type="email"
                value={createForm.customerEmail}
                onChange={e => setCreateForm(f => ({ ...f, customerEmail: e.target.value }))}
                placeholder="john@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm text-gray-400 mb-1">Initial Message *</label>
              <textarea
                value={createForm.message}
                onChange={e => setCreateForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Customer's first message..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 h-20"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Priority</label>
              <select
                value={createForm.priority}
                onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreateConversation}
                disabled={!createForm.customerName.trim() || !createForm.message.trim() || creating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
