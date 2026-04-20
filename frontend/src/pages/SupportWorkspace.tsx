import { useState, useEffect } from 'react'
import {
  MessageSquare, User, Filter, Search, ArrowLeft, Send, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown
} from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useAuth } from '@/services/AuthContext'
import { apiClient } from '@/services/api'

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

interface CustomerProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  source_channel: string | null
  tags: string[]
  notes: string | null
  created_at: string
}

const statusConfig: Record<ConversationStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-500/20 text-blue-400' },
  pending_customer: { label: 'Waiting Customer', color: 'bg-yellow-500/20 text-yellow-400' },
  pending_agent: { label: 'Waiting Agent', color: 'bg-orange-500/20 text-orange-400' },
  resolved: { label: 'Resolved', color: 'bg-green-500/20 text-green-400' },
  closed: { label: 'Closed', color: 'bg-gray-500/20 text-gray-400' },
}

const priorityConfig: Record<ConversationPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'text-gray-400' },
  medium: { label: 'Medium', color: 'text-blue-400' },
  high: { label: 'High', color: 'text-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-400' },
}

const channelIcons: Record<ChannelType, string> = {
  web_widget: '🌐',
  slack: '💬',
  dingtalk: '🔵',
  feishu: '🐦',
  wechat: '💚',
  email: '📧',
  phone: '📞',
}

export function SupportWorkspace() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ConversationStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [messageInput, setMessageInput] = useState('')

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (selectedConversation?.customer_id) {
      loadCustomerProfile(selectedConversation.customer_id)
    } else {
      setCustomerProfile(null)
    }
  }, [selectedConversation])

  const loadConversations = async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterStatus !== 'all') params.status = filterStatus
      const query = new URLSearchParams(params).toString()
      const res = await apiClient.get(`/support/conversations${query ? `?${query}` : ''}`)
      setConversations(res.data.conversations || [])
    } catch (err) {
      console.error('Failed to load conversations:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadCustomerProfile = async (customerId: string) => {
    try {
      const res = await apiClient.get(`/support/customers/${customerId}`)
      setCustomerProfile(res.data.customer)
    } catch (err) {
      console.error('Failed to load customer profile:', err)
    }
  }

  const handleAssignToMe = async () => {
    if (!selectedConversation || !user?.id) return
    try {
      await apiClient.put(`/support/conversations/${selectedConversation.id}/assign`, {
        agentId: user.id,
      })
      loadConversations()
      setSelectedConversation({ ...selectedConversation, assigned_agent_id: user.id })
    } catch (err) {
      console.error('Failed to assign:', err)
    }
  }

  const handleResolve = async () => {
    if (!selectedConversation) return
    try {
      await apiClient.put(`/support/conversations/${selectedConversation.id}/resolve`, {})
      loadConversations()
      setSelectedConversation({ ...selectedConversation, status: 'resolved' })
    } catch (err) {
      console.error('Failed to resolve:', err)
    }
  }

  const filteredConversations = conversations.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        c.customer_name?.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q)
      )
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
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            Inbox
          </h2>
          {/* Search */}
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
          {/* Status Filters */}
          <div className="flex gap-1 flex-wrap">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setFilterStatus(filter.value)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  filterStatus === filter.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">No conversations</div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`w-full p-3 border-b border-gray-800 text-left transition-colors ${
                  selectedConversation?.id === conv.id
                    ? 'bg-blue-600/10 border-l-2 border-l-blue-400'
                    : 'hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{conv.customer_name || 'Unknown Customer'}</span>
                  <span className="text-xs text-gray-500">
                    {channelIcons[conv.channel_type]} {new Date(conv.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${statusConfig[conv.status].color}`}>
                    {statusConfig[conv.status].label}
                  </span>
                  <span className={`text-[10px] font-medium ${priorityConfig[conv.priority].color}`}>
                    {conv.priority}
                  </span>
                </div>
                {conv.last_message && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{conv.last_message}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Center Panel — Conversation Detail */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900">
              <div className="flex items-center gap-3">
                <span className="text-xl">{channelIcons[selectedConversation.channel_type]}</span>
                <div>
                  <h3 className="font-medium">{selectedConversation.customer_name || 'Unknown Customer'}</h3>
                  <p className="text-xs text-gray-500">ID: {selectedConversation.id.substring(0, 8)}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusConfig[selectedConversation.status].color}`}>
                  {statusConfig[selectedConversation.status].label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!selectedConversation.assigned_agent_id && selectedConversation.status === 'open' && (
                  <button
                    onClick={handleAssignToMe}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    Assign to Me
                  </button>
                )}
                {selectedConversation.status === 'open' && (
                  <button
                    onClick={handleResolve}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Resolve
                  </button>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                  <p>Conversation messages will appear here</p>
                  <p className="text-xs mt-1 text-gray-600">Full chat integration coming soon</p>
                </div>
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-800 bg-gray-900">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a reply..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && messageInput.trim() && setMessageInput('')}
                  className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  disabled={!messageInput.trim()}
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
        <div className="w-72 border-l border-gray-800 bg-gray-900 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Info
            </h3>
            {customerProfile ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                    {customerProfile.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{customerProfile.name}</p>
                    <p className="text-xs text-gray-500">{customerProfile.source_channel || 'Unknown source'}</p>
                  </div>
                </div>
                {customerProfile.email && (
                  <div className="text-sm">
                    <span className="text-gray-500">Email:</span>{' '}
                    <span>{customerProfile.email}</span>
                  </div>
                )}
                {customerProfile.phone && (
                  <div className="text-sm">
                    <span className="text-gray-500">Phone:</span>{' '}
                    <span>{customerProfile.phone}</span>
                  </div>
                )}
                {customerProfile.tags && customerProfile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {customerProfile.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {customerProfile.notes && (
                  <div className="mt-3 p-3 bg-gray-800 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Notes</p>
                    <p className="text-sm text-gray-300">{customerProfile.notes}</p>
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
