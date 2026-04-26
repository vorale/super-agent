import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeftOpen, Clock, Loader2, Star, Pencil, Check, X } from 'lucide-react'
import { RestChatService } from '@/services/api/restChatService'
import { restClient } from '@/services/api/restClient'
import { sessionStreamManager } from '@/services/SessionStreamManager'
import { PublishToShowcaseModal } from './PublishToShowcaseModal'

interface SessionItem {
  id: string
  title: string | null
  status: string
  is_starred: boolean
  created_at: string
  updated_at: string
}

interface SessionHistoryPanelProps {
  businessScopeId: string | null
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  refreshKey?: number
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function SessionHistoryPanel({
  businessScopeId,
  activeSessionId,
  onSelectSession,
  onNewSession,
  refreshKey = 0,
}: SessionHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(false)
  const hasAutoSelected = useRef(false)

  const loadSessions = useCallback(async () => {
    if (!businessScopeId) {
      setSessions([])
      return
    }
    setLoading(true)
    try {
      const result = await RestChatService.getSessions(businessScopeId)
      const sorted = result
        .map(s => ({
          id: s.id,
          title: s.title ?? null,
          status: s.status ?? 'idle',
          is_starred: !!(s as any).is_starred,
          created_at: s.created_at,
          updated_at: s.updated_at,
        }))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setSessions(sorted)

      // Auto-select a generating session only on initial mount (not after user clicks "New chat")
      if (!activeSessionId && !hasAutoSelected.current) {
        hasAutoSelected.current = true
        const generating = sorted.find(s => s.status === 'generating')
        if (generating) {
          onSelectSession(generating.id)
        }
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [businessScopeId, activeSessionId, onSelectSession])

  useEffect(() => { void loadSessions() }, [loadSessions, refreshKey])

  const handleDelete = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await RestChatService.clearHistory(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (activeSessionId === sessionId) onNewSession()
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }, [activeSessionId, onNewSession])

  const handleToggleStar = useCallback(async (sessionId: string, isStarred: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    if (isStarred) {
      // Unstar directly
      try {
        await restClient.put(`/api/chat/sessions/${sessionId}/unstar`, {})
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_starred: false } : s))
      } catch (err) {
        console.error('Failed to unstar:', err)
      }
    } else {
      // Open publish modal
      const session = sessions.find(s => s.id === sessionId)
      setPublishTarget({ id: sessionId, title: session?.title || null })
    }
  }, [sessions])

  // Publish to showcase modal state
  const [publishTarget, setPublishTarget] = useState<{ id: string; title: string | null } | null>(null)

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const handleStartRename = useCallback((sessionId: string, currentTitle: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(sessionId)
    setEditTitle(currentTitle || '')
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [])

  const handleSaveRename = useCallback(async () => {
    if (!editingId) return
    const trimmed = editTitle.trim()
    if (trimmed) {
      try {
        await restClient.put(`/api/chat/sessions/${editingId}`, { title: trimmed })
        setSessions(prev => prev.map(s => s.id === editingId ? { ...s, title: trimmed } : s))
      } catch (err) {
        console.error('Failed to rename session:', err)
      }
    }
    setEditingId(null)
  }, [editingId, editTitle])

  const handleCancelRename = useCallback(() => {
    setEditingId(null)
  }, [])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1 border-r border-gray-800 bg-gray-900/50">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          title="Expand session history"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-60 flex flex-col border-r border-gray-800 bg-gray-900/50 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        <span className="text-sm font-medium text-gray-300">Sessions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title="Collapse panel"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {!businessScopeId ? (
          <div className="px-3 py-4 text-xs text-gray-500 text-center">Select a scope to see sessions</div>
        ) : loading ? (
          <div className="px-3 py-4 text-xs text-gray-500 text-center">Loading...</div>
        ) : (
          <>
            {/* Show "New Chat" placeholder when no session is active */}
            {!activeSessionId && (
              <div
                className="w-full text-left px-3 py-2.5 border-b border-gray-800/50 bg-gray-800 cursor-default"
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">New Chat</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-gray-600" />
                      <span className="text-xs text-gray-500">just now</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {sessions.length === 0 && activeSessionId ? (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No sessions yet</div>
            ) : (
              sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectSession(session.id) }}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/70 transition-colors group cursor-pointer ${
                activeSessionId === session.id ? 'bg-gray-800' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                {(() => {
                  // For the active session, trust the frontend stream state (more up-to-date than DB status).
                  // For other sessions, fall back to the backend status field.
                  const isActive = activeSessionId === session.id
                  const spinning = isActive
                    ? sessionStreamManager.isSending(session.id)
                    : (sessionStreamManager.isSending(session.id) || session.status === 'generating')
                  return spinning ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0 animate-spin" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                  )
                })()}
                <div className="flex-1 min-w-0">
                  {editingId === session.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveRename()
                          if (e.key === 'Escape') handleCancelRename()
                        }}
                        onBlur={handleSaveRename}
                        className="w-full px-1 py-0.5 bg-gray-900 border border-blue-500 rounded text-sm text-white focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div
                      className="text-sm text-gray-200 truncate"
                      onDoubleClick={(e) => handleStartRename(session.id, session.title, e)}
                      title="Double-click to rename"
                    >
                      {session.title || 'Untitled chat'}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-gray-600" />
                    <span className="text-xs text-gray-500">{formatRelativeTime(session.updated_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {editingId !== session.id && (
                    <button
                      onClick={(e) => handleStartRename(session.id, session.title, e)}
                      className="p-1 rounded text-gray-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleToggleStar(session.id, session.is_starred, e)}
                    className={`p-1 rounded transition-all ${
                      session.is_starred
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                    }`}
                    title={session.is_starred ? 'Unstar' : 'Star'}
                  >
                    <Star className="w-3.5 h-3.5" fill={session.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(session.id, e)}
                    className="p-1 rounded hover:bg-gray-600 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
            )}
          </>
        )}
      </div>

      {/* Publish to Showcase Modal */}
      {publishTarget && (
        <PublishToShowcaseModal
          sessionId={publishTarget.id}
          sessionTitle={publishTarget.title}
          onClose={() => setPublishTarget(null)}
          onPublished={() => {
            setSessions(prev => prev.map(s => s.id === publishTarget.id ? { ...s, is_starred: true } : s))
            setPublishTarget(null)
          }}
          onStarOnly={() => {
            setSessions(prev => prev.map(s => s.id === publishTarget.id ? { ...s, is_starred: true } : s))
            setPublishTarget(null)
          }}
        />
      )}
    </div>
  )
}
