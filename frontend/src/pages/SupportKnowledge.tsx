import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen, FileText, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Sparkles, Search, Brain, BarChart3,
  ArrowRight, Lightbulb, Tag, Clock, AlertTriangle, Loader2,
  MessageSquare
} from 'lucide-react'
import { useTranslation } from '@/i18n'
import { apiClient } from '@/services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FAQDraft {
  id: string
  question: string
  answer: string
  category: string
  tags: string[]
  created_at: string
}

interface KnowledgeGap {
  topic: string
  frequency: number
  avgConfidence: number
  suggestedCategory: string
  conversationIds: string[]
}

interface GapReport {
  generatedAt: string
  periodDays: number
  totalGaps: number
  summary: string
  gaps: KnowledgeGap[]
}

type TabId = 'drafts' | 'gaps' | 'autolearn'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 70 ? 'bg-green-500' :
    pct >= 40 ? 'bg-yellow-500' :
    'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast helper (simple inline toast)
// ---------------------------------------------------------------------------

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const ToastUI = toast ? (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 transition-all animate-in slide-in-from-bottom-2 ${
      toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {toast.message}
    </div>
  ) : null

  return { showToast, ToastUI }
}

// ---------------------------------------------------------------------------
// Tab 1: FAQ Drafts
// ---------------------------------------------------------------------------

function DraftsTab() {
  const { t } = useTranslation()
  const { showToast, ToastUI } = useToast()

  const [drafts, setDrafts] = useState<FAQDraft[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQuestion, setEditQuestion] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editCategory, setEditCategory] = useState('')

  // Distill conversation
  const [distillId, setDistillId] = useState('')
  const [isDistilling, setIsDistilling] = useState(false)
  const [isDistillingAll, setIsDistillingAll] = useState(false)

  // Publish / reject loading states
  const [actionLoading, setActionLoading] = useState<Record<string, 'publish' | 'reject' | null>>({})

  const loadDrafts = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiClient.get('/api/support/knowledge/drafts')
      setDrafts(res.data.drafts || [])
    } catch (err) {
      console.error('Failed to load drafts:', err)
      showToast('Failed to load drafts', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadDrafts() }, [loadDrafts])

  const handleExpand = (draft: FAQDraft) => {
    if (expandedId === draft.id) {
      setExpandedId(null)
      setEditingId(null)
    } else {
      setExpandedId(draft.id)
      setEditingId(null)
    }
  }

  const handleEdit = (draft: FAQDraft) => {
    setEditingId(draft.id)
    setEditQuestion(draft.question)
    setEditAnswer(draft.answer)
    setEditCategory(draft.category)
  }

  const handleSaveEdit = async (draftId: string) => {
    // Save is done through publish — just update local state for display
    setDrafts(prev =>
      prev.map(d =>
        d.id === draftId
          ? { ...d, question: editQuestion, answer: editAnswer, category: editCategory }
          : d
      )
    )
    setEditingId(null)
    showToast('Draft updated locally')
  }

  const handlePublish = async (draftId: string) => {
    setActionLoading(prev => ({ ...prev, [draftId]: 'publish' }))
    try {
      await apiClient.post(`/api/support/knowledge/drafts/${draftId}/publish`, {})
      setDrafts(prev => prev.filter(d => d.id !== draftId))
      showToast('FAQ published successfully')
    } catch (err) {
      console.error('Failed to publish draft:', err)
      showToast('Failed to publish draft', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [draftId]: null }))
    }
  }

  const handleReject = async (draftId: string) => {
    setActionLoading(prev => ({ ...prev, [draftId]: 'reject' }))
    try {
      await apiClient.delete(`/api/support/knowledge/drafts/${draftId}`)
      setDrafts(prev => prev.filter(d => d.id !== draftId))
      showToast('Draft rejected')
    } catch (err) {
      console.error('Failed to reject draft:', err)
      showToast('Failed to reject draft', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [draftId]: null }))
    }
  }

  const handleDistillAll = async () => {
    setIsDistillingAll(true)
    try {
      const res = await apiClient.post('/api/support/knowledge/distill-all', {})
      const count = res.data?.count ?? res.data?.drafts?.length ?? 0
      showToast(`Distilled ${count} new FAQ draft${count !== 1 ? 's' : ''}`)
      loadDrafts()
    } catch (err) {
      console.error('Failed to distill all:', err)
      showToast('Failed to distill conversations', 'error')
    } finally {
      setIsDistillingAll(false)
    }
  }

  const handleDistillConversation = async () => {
    const id = distillId.trim()
    if (!id) return
    setIsDistilling(true)
    try {
      await apiClient.post('/api/support/knowledge/distill', { conversationId: id })
      showToast('Conversation distilled into draft')
      setDistillId('')
      loadDrafts()
    } catch (err) {
      console.error('Failed to distill conversation:', err)
      showToast('Failed to distill conversation', 'error')
    } finally {
      setIsDistilling(false)
    }
  }

  const categoryColors: Record<string, string> = {
    general: 'bg-gray-500/20 text-gray-300',
    billing: 'bg-yellow-500/20 text-yellow-400',
    technical: 'bg-blue-500/20 text-blue-400',
    account: 'bg-purple-500/20 text-purple-400',
    feature: 'bg-green-500/20 text-green-400',
  }

  return (
    <div className="space-y-4">
      {ToastUI}

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <button
          onClick={handleDistillAll}
          disabled={isDistillingAll}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isDistillingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Distill All
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
          <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Conversation ID..."
            value={distillId}
            onChange={(e) => setDistillId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDistillConversation()}
            className="flex-1 min-w-0 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleDistillConversation}
            disabled={isDistilling || !distillId.trim()}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isDistilling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Distill'}
          </button>
        </div>

        <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-400 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
          {drafts.length} draft{drafts.length !== 1 ? 's' : ''} pending
        </span>
      </div>

      {/* Draft list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading drafts...
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          <div className="text-center">
            <FileText className="w-10 h-10 mx-auto mb-2 text-gray-700" />
            <p>No pending drafts</p>
            <p className="text-xs text-gray-600 mt-1">Use "Distill All" to extract FAQ drafts from conversations</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => {
            const isExpanded = expandedId === draft.id
            const isEditing = editingId === draft.id
            const isLoadingAction = actionLoading[draft.id]

            return (
              <div
                key={draft.id}
                className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => handleExpand(draft)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {isEditing ? editQuestion : draft.question}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                        categoryColors[draft.category.toLowerCase()] || 'bg-gray-700 text-gray-300'
                      }`}>
                        {draft.category || 'Uncategorized'}
                      </span>
                      {draft.tags.length > 0 && (
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {draft.tags.slice(0, 3).join(', ')}
                          {draft.tags.length > 3 && ` +${draft.tags.length - 3}`}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(draft.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-gray-800">
                    <div className="pt-3">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Question</label>
                            <input
                              type="text"
                              value={editQuestion}
                              onChange={(e) => setEditQuestion(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Answer</label>
                            <textarea
                              value={editAnswer}
                              onChange={(e) => setEditAnswer(e.target.value)}
                              rows={5}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">Category</label>
                            <input
                              type="text"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(draft.id) }}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-medium transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium text-gray-400 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap mb-3">
                          {draft.answer}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                        {!isEditing && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(draft) }}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium text-gray-300 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePublish(draft.id) }}
                          disabled={isLoadingAction === 'publish'}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          {isLoadingAction === 'publish' ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          Publish
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReject(draft.id) }}
                          disabled={isLoadingAction === 'reject'}
                          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          {isLoadingAction === 'reject' ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2: Knowledge Gap Report
// ---------------------------------------------------------------------------

function GapReportTab() {
  const { t } = useTranslation()
  const { showToast, ToastUI } = useToast()

  const [period, setPeriod] = useState(7)
  const [report, setReport] = useState<GapReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadReport = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiClient.get(`/api/support/knowledge/gap-report?days=${period}`)
      setReport(res.data)
    } catch (err) {
      console.error('Failed to load gap report:', err)
      showToast('Failed to load gap report', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [period, showToast])

  useEffect(() => { loadReport() }, [loadReport])

  const periods = [
    { value: 7, label: '7 Days' },
    { value: 14, label: '14 Days' },
    { value: 30, label: '30 Days' },
  ]

  return (
    <div className="space-y-4">
      {ToastUI}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                period === p.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={loadReport}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading gap report...
        </div>
      ) : !report ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          <div className="text-center">
            <BarChart3 className="w-10 h-10 mx-auto mb-2 text-gray-700" />
            <p>No gap report available</p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  Knowledge Gap Report
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generated {formatDate(report.generatedAt)} &middot; Last {report.periodDays} days
                </p>
              </div>
              <span className="px-2.5 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full">
                {report.totalGaps} gap{report.totalGaps !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{report.summary}</p>
          </div>

          {/* Gap list */}
          {report.gaps.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-700" />
              No knowledge gaps detected in this period.
            </div>
          ) : (
            <div className="space-y-2">
              {report.gaps.map((gap, idx) => (
                <div key={idx} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white">{gap.topic}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-medium rounded">
                          {gap.suggestedCategory}
                        </span>
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-medium rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {gap.frequency}x asked
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {gap.conversationIds.length} conversation{gap.conversationIds.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Avg. AI Confidence</p>
                    <ConfidenceBar value={gap.avgConfidence} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3: Auto-Learning Status
// ---------------------------------------------------------------------------

function AutoLearnTab() {
  const { t } = useTranslation()

  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [gapSummary, setGapSummary] = useState<string | null>(null)

  useEffect(() => {
    apiClient.get('/api/support/knowledge/drafts')
      .then((res) => {
        const drafts = res.data.drafts || []
        setDraftCount(drafts.length)
      })
      .catch(() => { /* silent */ })

    apiClient.get('/api/support/knowledge/gap-report?days=7')
      .then((res) => {
        setGapSummary(res.data?.summary || null)
      })
      .catch(() => { /* silent */ })
  }, [])

  const steps = [
    {
      icon: <MessageSquare className="w-5 h-5" />,
      title: 'Conversations Analyzed',
      description: 'AI conversations are automatically analyzed for recurring questions and knowledge patterns.',
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: 'FAQ Drafts Generated',
      description: 'Common questions are distilled into draft FAQ articles with suggested answers.',
      color: 'from-purple-500 to-purple-600',
    },
    {
      icon: <BookOpen className="w-5 h-5" />,
      title: 'Knowledge Base Enriched',
      description: 'After human review, approved drafts are published to the AI knowledge base.',
      color: 'from-green-500 to-green-600',
    },
  ]

  const tips = [
    {
      icon: <Clock className="w-4 h-4 text-blue-400" />,
      text: 'Run "Distill All" regularly to capture new patterns from recent conversations.',
    },
    {
      icon: <Tag className="w-4 h-4 text-purple-400" />,
      text: 'Assign clear categories to drafts so the AI can route answers accurately.',
    },
    {
      icon: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
      text: 'Check the Knowledge Gap Report weekly to identify topics needing FAQ coverage.',
    },
    {
      icon: <CheckCircle className="w-4 h-4 text-green-400" />,
      text: 'Review and publish drafts promptly to improve AI response quality.',
    },
  ]

  return (
    <div className="space-y-6">
      {/* How it works */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          How Auto-Learning Works
        </h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          {steps.map((step, idx) => (
            <div key={idx} className="flex-1">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center text-white mb-3`}>
                  {step.icon}
                </div>
                <h4 className="text-sm font-medium text-white mb-1">{step.title}</h4>
                <p className="text-xs text-gray-400 leading-relaxed">{step.description}</p>
              </div>
              {idx < steps.length - 1 && (
                <div className="hidden sm:flex items-center justify-center -mx-2 mt-4">
                  <ArrowRight className="w-5 h-5 text-gray-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Pending Drafts
          </h4>
          <p className="text-2xl font-semibold text-white">
            {draftCount !== null ? draftCount : '--'}
          </p>
          <p className="text-xs text-gray-500 mt-1">FAQ articles awaiting review</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h4 className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Latest Gap Report
          </h4>
          <p className="text-sm text-gray-300 leading-relaxed mt-2">
            {gapSummary || 'No recent gap report available.'}
          </p>
        </div>
      </div>

      {/* Tips */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-400" />
          Tips for Improving AI Knowledge
        </h3>
        <div className="space-y-2">
          {tips.map((tip, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3"
            >
              <div className="flex-shrink-0 mt-0.5">{tip.icon}</div>
              <p className="text-xs text-gray-300 leading-relaxed">{tip.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'drafts', label: 'FAQ Drafts', icon: <FileText className="w-4 h-4" /> },
  { id: 'gaps', label: 'Gap Report', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'autolearn', label: 'Auto-Learning', icon: <Brain className="w-4 h-4" /> },
]

export function SupportKnowledge() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('drafts')

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-400" />
              Knowledge Management
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Review AI-generated FAQ drafts, identify knowledge gaps, and enrich the knowledge base
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-white border border-gray-700'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
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
        {activeTab === 'drafts' && <DraftsTab />}
        {activeTab === 'gaps' && <GapReportTab />}
        {activeTab === 'autolearn' && <AutoLearnTab />}
      </div>
    </div>
  )
}
