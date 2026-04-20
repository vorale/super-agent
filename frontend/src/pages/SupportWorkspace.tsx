import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare, User, Search, Send, Clock, CheckCircle, XCircle,
  Bot, ArrowDown, MoreVertical, Tag, FileText, StickyNote
} from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/services/AuthContext'
import { restClient } from '@/services/api'

type ConversationStatus = 'open' | 'pending_customer' | 'pending_agent' | 'resolved' | 'closed'
type ConversationPriority = 'low' | 'medium' | 'high' | 'urgent'
type ChannelType = 'web_widget' | 'slack' | 'dingtalk' | 'feishu' | 'wechat' | 'email' | 'phone'

interface Conversation {
  id: string
  channel_type: ChannelType
  status: ConversationStatus
  priority: ConversationPriority
  assigned_agent_id: string | null
  customer_id: string | null
  customer_name?: string
  last_message?: string
  created_at: string
  updated_at: string
}

interface ChatMessage {
  id: string
  type: 'user' | 'ai' | 'agent' | 'system'
  content: string
  agentId?: string
  createdAt: string
  metadata?: Record<string, unknown>
}

interface CustomerProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url?: string | null
  source_channel: string | null
  tags: string[]
  custom_fields: Record<string, unknown>
  notes: string | null
  created_at: string
}

const statusConfig: Record<ConversationStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-500/20 text-blue-400' },
  pending_customer: { label: 'Waiting', color: 'bg-yellow-500/20 text-yellow-400' },
  pending_agent: { label: 'Waiting Agent', color: 'bg-orange-500/20 text-orange-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/20 text-green-400' },
  closed: { label: 'Closed', color: 'bg-gray-500/20 text-gray-400' },
}

const priorityConfig: Record<ConversationPriority, { label: string; color: string; dot: string }> = {
  low: { label: 'Low', color: 'text-gray-400', dot: 'bg-gray-400' },
  medium: { label: 'Medium', color: 'text-blue-400', dot: 'bg-blue-400' },
  high: { label: 'High', color: 'text-orange-400', dot: 'bg-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-400', dot: 'bg-red-400' },
}

const channelConfig: Record<ChannelType, { icon: string; label: string }> = {
  web_widget: { icon: '🌐', label: 'Widget' },
  slack: { icon: '💬', label: 'Slack' },
  dingtalk: { icon: '🔵', label: 'DingTalk' },
  feishu: { icon: '🐦', label: 'Feishu' },
  wechat: { icon: '💚', label: 'WeChat' },
  email: { icon: '📧', label: 'Email' },
  phone: { icon: '📞', label: 'Phone' },
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.type === 'user'
  const isAgent = msg.type === 'agent'
  const isSystem = msg.type === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${
        isUser
          ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
          : isAgent
            ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
            : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : isAgent ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : isAgent
              ? 'bg-green-900/30 text-gray-200 border border-green-800/30 rounded-bl-md'
              : 'bg-gray-800 text-gray-200 rounded-bl-md'
        }`}>
          {msg.content}
        </div>
        <span className="text-[10px] text-gray-600 mt-1 px-1">
          {formatTime(msg.createdAt)}
          {isAgent && <span className="text-green-500/60 ml-1">Agent</span>}
        </span>
      </div>
    </div>
  )
}

export function SupportWorkspace() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [filterStatus, setFilterStatus] = useState<ConversationStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showActions, setShowActions] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterStatus !== 'all') params.status = filterStatus
      const query = new URLSearchParams(params).toString()
      const res = await restClient.get(`/api/support/conversations${query ? `?${query}` : ''}`)
      setConversations(res.data.conversations || [])
    } catch (err) {
      console.error('Failed to load conversations:', err)
    } finally {
      setIsLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Auto-refresh conversations every 15s
  useEffect(() => {
    const interval = setInterval(loadConversations, 15000)
    return () => clearInterval(interval)
  }, [loadConversations])

  // Auto-refresh messages for selected conversation every 10s
  useEffect(() => {
    if (!selectedConversation || selectedConversation.status !== 'open') return
    const interval = setInterval(async () => {
      try {
        const res = await restClient.get(`/api/support/conversations/${selectedConversation.id}`)
        setMessages(res.data.messages || [])
      } catch { /* silent */ }
    }, 10000)
    return () => clearInterval(interval)
  }, [selectedConversation?.id, selectedConversation?.status])

  const loadConversationDetail = useCallback(async (conv: Conversation) => {
    setSelectedConversation(conv)
    setIsLoadingMessages(true)
    setMessages([])
    setMessageInput('')
    setShowActions(null)

    try {
      const res = await restClient.get(`/api/support/conversations/${conv.id}`)
      setMessages(res.data.messages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setIsLoadingMessages(false)
    }

    if (conv.customer_id) {
      try {
        const res = await restClient.get(`/api/support/customers/${conv.customer_id}`)
        setCustomerProfile(res.data.customer)
      } catch {
        setCustomerProfile(null)
      }
    } else {
      setCustomerProfile(null)
    }
  }, [])

  useEffect(() => {
    if (selectedConversation?.customer_id) {
      restClient.get(`/api/support/customers/${selectedConversation.customer_id}`)
        .then(res => setCustomerProfile(res.data.customer))
        .catch(() => setCustomerProfile(null))
    } else {
      setCustomerProfile(null)
    }
  }, [selectedConversation?.customer_id])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!isLoadingMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoadingMessages])

  // Track scroll position for "scroll to bottom" button
  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setShowScrollBtn(!nearBottom)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSend = async () => {
    const text = messageInput.trim()
    if (!text || !selectedConversation || isSending) return

    setIsSending(true)
    setMessageInput('')
    try {
      await restClient.post(`/api/support/conversations/${selectedConversation.id}/messages`, { message: text })
      // Reload messages
      const res = await restClient.get(`/api/support/conversations/${selectedConversation.id}`)
      setMessages(res.data.messages || [])
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessageInput(text) // Restore on failure
    } finally {
      setIsSending(false)
    }
  }

  const handleAssignToMe = async () => {
    if (!selectedConversation || !user?.id) return
    try {
      await restClient.put(`/api/support/conversations/${selectedConversation.id}/assign`, { agentId: user.id })
      const updated = { ...selectedConversation, assigned_agent_id: user.id }
      setSelectedConversation(updated)
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      console.error('Failed to assign:', err)
    }
  }

  const handleResolve = async () => {
    if (!selectedConversation) return
    try {
      await restClient.put(`/api/support/conversations/${selectedConversation.id}/resolve`, {})
      const updated = { ...selectedConversation, status: 'resolved' as ConversationStatus }
      setSelectedConversation(updated)
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      console.error('Failed to resolve:', err)
    }
  }

  const handleClose = async () => {
    if (!selectedConversation) return
    try {
      await restClient.put(`/api/support/conversations/${selectedConversation.id}/close`, {})
      const updated = { ...selectedConversation, status: 'closed' as ConversationStatus }
      setSelectedConversation(updated)
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      console.error('Failed to close:', err)
    }
  }

  const handleHandoff = async () => {
    if (!selectedConversation) return
    try {
      await restClient.post(`/api/support/conversations/${selectedConversation.id}/handoff`, {})
      const updated = { ...selectedConversation, status: 'pending_agent' as ConversationStatus }
      setSelectedConversation(updated)
      setConversations(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (err) {
      console.error('Failed to request handoff:', err)
    }
    setShowActions(null)
  }

  const filteredConversations = conversations.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return c.customer_name?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.last_message?.toLowerCase().includes(q)
    }
    return true
  })

  const statusFilters: Array<{ value: ConversationStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'pending_agent', label: 'Waiting Agent' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
  ]

  return (
    <div className="h-full flex bg-gray-950">
      {/* Left Panel — Conversation List */}
      <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            Inbox
            {conversations.filter(c => c.status === 'open').length > 0 && (
              <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                {conversations.filter(c => c.status === 'open').length}
              </span>
            )}
          </h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setFilterStatus(filter.value)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  filterStatus === filter.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No conversations</div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversationDetail(conv)}
                className={`w-full p-3 border-b border-gray-800 text-left transition-colors ${
                  selectedConversation?.id === conv.id
                    ? 'bg-blue-600/10 border-l-2 border-l-blue-400'
                    : 'hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{conv.customer_name || 'Unknown Customer'}</span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    {channelConfig[conv.channel_type]?.icon} {formatTime(conv.updated_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${statusConfig[conv.status].color}`}>
                    {statusConfig[conv.status].label}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium">
                    <span className={`w-1.5 h-1.5 rounded-full ${priorityConfig[conv.priority].dot}`} />
                    <span className={priorityConfig[conv.priority].color}>{priorityConfig[conv.priority].label}</span>
                  </span>
                </div>
                {conv.last_message && (
                  <p className="text-xs text-gray-500 truncate">{conv.last_message}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Center Panel — Conversation Detail */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl flex-shrink-0">{channelConfig[selectedConversation.channel_type]?.icon}</span>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{selectedConversation.customer_name || 'Unknown Customer'}</h3>
                  <p className="text-xs text-gray-500">{channelConfig[selectedConversation.channel_type]?.label} &middot; {formatTime(selectedConversation.created_at)}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded flex-shrink-0 ${statusConfig[selectedConversation.status].color}`}>
                  {statusConfig[selectedConversation.status].label}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!selectedConversation.assigned_agent_id && selectedConversation.status === 'open' && (
                  <button onClick={handleAssignToMe} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors">
                    Assign to Me
                  </button>
                )}
                {selectedConversation.status === 'open' && (
                  <>
                    <button onClick={handleResolve} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Resolve
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowActions(showActions === 'header' ? null : 'header')} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                      {showActions === 'header' && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-10">
                          <button onClick={handleHandoff} className="w-full px-3 py-2 text-left text-xs hover:bg-gray-700 flex items-center gap-2">
                            <User className="w-3 h-3" /> Request Handoff
                          </button>
                          <button onClick={handleClose} className="w-full px-3 py-2 text-left text-xs hover:bg-gray-700 flex items-center gap-2 text-gray-400">
                            <XCircle className="w-3 h-3" /> Close
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {selectedConversation.status === 'pending_agent' && (
                  <span className="text-xs text-orange-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-pulse" /> Waiting for agent
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3 relative"
            >
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  <div className="text-center">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 text-gray-700" />
                    <p>No messages yet</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
              )}
              <div ref={messagesEndRef} />
              {showScrollBtn && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 p-2 bg-gray-800 border border-gray-700 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
                >
                  <ArrowDown className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-800 bg-gray-900">
              <div className="flex items-end gap-2">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={selectedConversation.status === 'open' ? 'Type a reply...' : 'This conversation is no longer active'}
                  disabled={selectedConversation.status !== 'open' || isSending}
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-50 max-h-32"
                  style={{ minHeight: '40px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageInput.trim() || isSending || selectedConversation.status !== 'open'}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-700" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">Choose a conversation from the inbox to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel — Customer Profile */}
      {selectedConversation && (
        <div className="w-72 border-l border-gray-800 bg-gray-900 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" /> Customer
            </h3>
            {customerProfile ? (
              <div className="space-y-4">
                {/* Avatar + Name */}
                <div className="flex items-center gap-3">
                  {customerProfile.avatar_url ? (
                    <img src={customerProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                      {customerProfile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{customerProfile.name}</p>
                    <p className="text-xs text-gray-500">{customerProfile.source_channel || 'Unknown source'}</p>
                  </div>
                </div>

                {/* Contact */}
                <div className="space-y-2 text-sm">
                  {customerProfile.email && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <span className="text-gray-500 text-xs">Email</span>
                      <span className="truncate">{customerProfile.email}</span>
                    </div>
                  )}
                  {customerProfile.phone && (
                    <div className="flex items-center gap-2 text-gray-300">
                      <span className="text-gray-500 text-xs">Phone</span>
                      <span>{customerProfile.phone}</span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {customerProfile.tags && customerProfile.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {customerProfile.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded text-xs">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Fields */}
                {customerProfile.custom_fields && Object.keys(customerProfile.custom_fields).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><FileText className="w-3 h-3" /> Fields</p>
                    <div className="space-y-1">
                      {Object.entries(customerProfile.custom_fields).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-gray-500">{key}</span>
                          <span className="text-gray-300">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {customerProfile.notes && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Notes</p>
                    <div className="p-3 bg-gray-800 rounded-lg text-sm text-gray-300">{customerProfile.notes}</div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No customer profile available</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
