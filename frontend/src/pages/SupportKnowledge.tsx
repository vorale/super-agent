/**
 * Support Knowledge Page
 * Three tabs: FAQ Drafts, Knowledge Gaps, Auto-learn.
 */

import { useState, useEffect } from 'react'
import { BookOpen, FileText, AlertCircle, Zap, Check, X, RefreshCw, Edit } from 'lucide-react'
import { RestSupportService, type FaqArticle, type GapReport } from '@/services/api/restSupportService'
import { useTranslation } from '@/i18n'

type Tab = 'drafts' | 'gaps' | 'autolearn'

/** Draft edit state for inline editing before publish */
interface DraftEdit {
  id: string
  question: string
  answer: string
  category: string
}

export function SupportKnowledge() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('drafts')
  const [drafts, setDrafts] = useState<FaqArticle[]>([])
  const [gapReport, setGapReport] = useState<GapReport | null>(null)
  const [distillResult, setDistillResult] = useState<{ distilledCount: number; draftsCreated: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingDraft, setEditingDraft] = useState<DraftEdit | null>(null)

  useEffect(() => {
    if (activeTab === 'drafts') loadDrafts()
  }, [activeTab])

  const loadDrafts = async () => {
    setLoading(true)
    try {
      setDrafts(await RestSupportService.getDrafts())
    } catch (err) {
      console.error('Failed to load drafts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePublish = async (id: string) => {
    try {
      const edits = editingDraft?.id === id
        ? { question: editingDraft.question, answer: editingDraft.answer, category: editingDraft.category }
        : undefined
      await RestSupportService.publishDraft(id, edits)
      setEditingDraft(null)
      loadDrafts()
    } catch (err) {
      console.error('Failed to publish draft:', err)
    }
  }

  const startEditDraft = (draft: FaqArticle) => {
    setEditingDraft({ id: draft.id, question: draft.question, answer: draft.answer, category: draft.category ?? '' })
  }

  const handleReject = async (id: string) => {
    try {
      await RestSupportService.rejectDraft(id)
      loadDrafts()
    } catch (err) {
      console.error('Failed to reject draft:', err)
    }
  }

  const handleGenerateGapReport = async () => {
    setLoading(true)
    try {
      const report = await RestSupportService.generateGapReport(7)
      setGapReport(report)
    } catch (err) {
      console.error('Failed to generate gap report:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerDistill = async () => {
    setLoading(true)
    try {
      const result = await RestSupportService.triggerDistill(24)
      setDistillResult(result)
    } catch (err) {
      console.error('Failed to trigger distillation:', err)
    } finally {
      setLoading(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'drafts', label: t('support.drafts'), icon: <FileText className="w-4 h-4" /> },
    { key: 'gaps', label: t('support.gaps'), icon: <AlertCircle className="w-4 h-4" /> },
    { key: 'autolearn', label: t('support.autoLearn'), icon: <Zap className="w-4 h-4" /> },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold">{t('support.knowledge')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white/10 text-white border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Drafts Tab */}
      {activeTab === 'drafts' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading drafts...</div>
          ) : drafts.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No FAQ drafts pending review</div>
          ) : (
            drafts.map(draft => (
              <div key={draft.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                {editingDraft?.id === draft.id ? (
                  /* Editing mode */
                  <div>
                    <div className="mb-2">
                      <label className="text-xs text-gray-500">Question</label>
                      <input
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white mt-1"
                        value={editingDraft.question}
                        onChange={e => setEditingDraft({ ...editingDraft, question: e.target.value })}
                      />
                    </div>
                    <div className="mb-2">
                      <label className="text-xs text-gray-500">Answer</label>
                      <textarea
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white mt-1 h-20"
                        value={editingDraft.answer}
                        onChange={e => setEditingDraft({ ...editingDraft, answer: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-gray-500">Category</label>
                      <input
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white mt-1"
                        value={editingDraft.category}
                        onChange={e => setEditingDraft({ ...editingDraft, category: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handlePublish(draft.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs text-white">
                        Publish with Edits
                      </button>
                      <button onClick={() => setEditingDraft(null)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs text-gray-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-medium text-blue-300 mb-1">Q: {draft.question}</h3>
                        <p className="text-sm text-gray-300">A: {draft.answer}</p>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <button onClick={() => startEditDraft(draft)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors" title="Edit before publish">
                          <Edit className="w-4 h-4 text-gray-400" />
                        </button>
                        <button onClick={() => handlePublish(draft.id)} className="p-2 bg-green-600/20 hover:bg-green-600/30 rounded-lg transition-colors" title="Publish as-is">
                          <Check className="w-4 h-4 text-green-400" />
                        </button>
                        <button onClick={() => handleReject(draft.id)} className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg transition-colors" title="Reject">
                          <X className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      {draft.category && <span className="px-2 py-0.5 bg-white/10 rounded">{draft.category}</span>}
                      {draft.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white/5 rounded">{tag}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Gaps Tab */}
      {activeTab === 'gaps' && (
        <div>
          <button
            onClick={handleGenerateGapReport}
            disabled={loading}
            className="mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Generate Gap Report (Last 7 days)
          </button>

          {gapReport && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                  <div className="text-2xl font-bold">{gapReport.totalProblematicConversations}</div>
                  <div className="text-xs text-gray-500">Problematic Conversations</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                  <div className="text-2xl font-bold">{gapReport.existingFaqCount}</div>
                  <div className="text-xs text-gray-500">Existing FAQs</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                  <div className="text-2xl font-bold">{gapReport.gaps.length}</div>
                  <div className="text-xs text-gray-500">Knowledge Gaps</div>
                </div>
              </div>

              <div className="space-y-3">
                {gapReport.gaps.map((gap, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium truncate">{gap.topic}</h4>
                      <span className="text-xs text-orange-400">×{gap.frequency}</span>
                    </div>
                    <p className="text-xs text-gray-400">{gap.summary}</p>
                    <span className="text-xs text-gray-500 mt-1 inline-block">Suggested: {gap.suggestedCategory}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-learn Tab */}
      {activeTab === 'autolearn' && (
        <div>
          <button
            onClick={handleTriggerDistill}
            disabled={loading}
            className="mb-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <Zap className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Trigger FAQ Distillation (Last 24h)
          </button>

          {distillResult && (
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="font-medium mb-2">Distillation Complete</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold text-blue-400">{distillResult.distilledCount}</div>
                  <div className="text-xs text-gray-500">Conversations Processed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{distillResult.draftsCreated}</div>
                  <div className="text-xs text-gray-500">New Drafts Created</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
