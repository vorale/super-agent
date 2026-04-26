/**
 * SkillsPanel
 *
 * Slide-out panel for managing skills:
 * - Installed: skills present in the current session workspace (with publish action)
 * - Enterprise: internal org catalog (browse, install, vote)
 * - External: search results from the skills.sh marketplace (with import-to-enterprise)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  X, Package, Loader2, Download, Zap, Search,
  AlertCircle, Check, FileText, ThumbsUp, ThumbsDown,
  Upload, Building2, Globe, Trash2,
} from 'lucide-react'
import { restClient } from '@/services/api/restClient'
import { RestUserGroupService, type UserGroup } from '@/services/api/restUserGroupService'
import { useTranslation } from '@/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceSkill {
  name: string
  hasSkillMd: boolean
  description: string | null
}

interface MarketplaceSkill {
  owner: string
  name: string
  installRef: string
  url: string
  description: string | null
}

interface EnterpriseSkill {
  id: string
  skillId: string
  name: string
  displayName: string
  description: string | null
  version: string
  category: string | null
  source: string
  sourceRef: string | null
  installCount: number
  voteScore: number
  publishedBy: string
  publishedAt: string
}

interface SkillsPanelProps {
  open: boolean
  onClose: () => void
  sessionId?: string | null
  /** When provided, the panel operates in scope-binding mode instead of workspace mode */
  scopeId?: string | null
  /** Called after a skill is bound/unbound in scope mode so the parent can refresh */
  onScopeSkillsChanged?: () => void
}

type Tab = 'installed' | 'enterprise' | 'external'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
        active
          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkillsPanel({ open, onClose, sessionId, scopeId, onScopeSkillsChanged }: SkillsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('installed')
  const { t } = useTranslation()

  // Determine mode
  const isScopeMode = !!scopeId

  // Installed (workspace) skills — used in session mode
  const [installedSkills, setInstalledSkills] = useState<WorkspaceSkill[]>([])
  const [loadingInstalled, setLoadingInstalled] = useState(false)

  // Scope-level skills — used in scope mode
  const [scopeSkills, setScopeSkills] = useState<Array<{ id: string; name: string; display_name: string; description: string | null; skill_type: string }>>([])
  const [loadingScopeSkills, setLoadingScopeSkills] = useState(false)

  // Enterprise catalog
  const [enterpriseSkills, setEnterpriseSkills] = useState<EnterpriseSkill[]>([])
  const [enterpriseQuery, setEnterpriseQuery] = useState('')
  const [enterpriseCategory, setEnterpriseCategory] = useState('')
  const [enterpriseSort, setEnterpriseSort] = useState<'popular' | 'recent' | 'top-rated'>('popular')
  const [categories, setCategories] = useState<string[]>([])
  const [loadingEnterprise, setLoadingEnterprise] = useState(false)
  const [installingEntId, setInstallingEntId] = useState<string | null>(null)
  const [votingId, setVotingId] = useState<string | null>(null)

  // External marketplace
  const [searchQuery, setSearchQuery] = useState('')
  const [marketResults, setMarketResults] = useState<MarketplaceSkill[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [installingRef, setInstallingRef] = useState<string | null>(null)
  const [importingRef, setImportingRef] = useState<string | null>(null)
  const [featuredSkills, setFeaturedSkills] = useState<MarketplaceSkill[]>([])
  const [loadingFeatured, setLoadingFeatured] = useState(false)

  // Publishing
  const [publishingSkill, setPublishingSkill] = useState<string | null>(null)
  const [confirmingPublish, setConfirmingPublish] = useState(false)
  const [publishCategory, setPublishCategory] = useState('')
  const [publishGroupIds, setPublishGroupIds] = useState<string[]>([])

  // User groups (for publish-to-group selection)
  const [userGroups, setUserGroups] = useState<UserGroup[]>([])

  const [error, setError] = useState<string | null>(null)

  // Deleting
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null)

  // ── Load installed skills (session workspace mode) ──
  const loadInstalled = useCallback(async () => {
    if (!sessionId) return
    setLoadingInstalled(true)
    setError(null)
    try {
      const res = await restClient.get<{ data: WorkspaceSkill[] }>(
        `/api/chat/sessions/${sessionId}/workspace/skills`,
      )
      setInstalledSkills(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace skills')
    } finally {
      setLoadingInstalled(false)
    }
  }, [sessionId])

  // ── Load scope-level skills (scope binding mode) ──
  const loadScopeSkills = useCallback(async () => {
    if (!scopeId) return
    setLoadingScopeSkills(true)
    setError(null)
    try {
      const res = await restClient.get<{ data: Array<{ id: string; name: string; display_name: string; description: string | null; skill_type: string }> }>(
        `/api/skills?business_scope_id=${scopeId}&limit=100`,
      )
      setScopeSkills(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scope skills')
    } finally {
      setLoadingScopeSkills(false)
    }
  }, [scopeId])

  // ── Load enterprise catalog ──
  const loadEnterprise = useCallback(async () => {
    setLoadingEnterprise(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (enterpriseQuery) params.set('q', enterpriseQuery)
      if (enterpriseCategory) params.set('category', enterpriseCategory)
      params.set('sort', enterpriseSort)
      const res = await restClient.get<{ items: EnterpriseSkill[]; total: number }>(
        `/api/skills/enterprise?${params.toString()}`,
      )
      setEnterpriseSkills(res.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load enterprise skills')
    } finally {
      setLoadingEnterprise(false)
    }
  }, [enterpriseQuery, enterpriseCategory, enterpriseSort])

  const loadCategories = useCallback(async () => {
    try {
      const res = await restClient.get<{ data: string[] }>('/api/skills/enterprise/categories')
      setCategories(res.data)
    } catch { /* ignore */ }
  }, [])

  const loadFeatured = useCallback(async () => {
    if (featuredSkills.length > 0) return // already loaded
    setLoadingFeatured(true)
    try {
      const res = await restClient.get<{ data: MarketplaceSkill[] }>('/api/skills/marketplace/featured')
      setFeaturedSkills(res.data)
    } catch { /* ignore — empty state is fine */ }
    finally { setLoadingFeatured(false) }
  }, [featuredSkills.length])

  const loadUserGroups = useCallback(async () => {
    try {
      const groups = await RestUserGroupService.listGroups()
      setUserGroups(groups)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (open) {
      if (isScopeMode) {
        void loadScopeSkills()
      } else {
        void loadInstalled()
      }
      void loadEnterprise()
      void loadCategories()
      void loadFeatured()
      void loadUserGroups()
    }
  }, [open, isScopeMode, loadInstalled, loadScopeSkills, loadEnterprise, loadCategories, loadFeatured, loadUserGroups])

  // ── External marketplace search ──
  const handleExternalSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setError(null)
    setMarketResults([])
    try {
      const res = await restClient.get<{ data: MarketplaceSkill[] }>(
        `/api/skills/marketplace/search?q=${encodeURIComponent(searchQuery.trim())}`,
      )
      setMarketResults(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  // ── Install from external marketplace ──
  const handleExternalInstall = useCallback(async (installRef: string) => {
    setInstallingRef(installRef)
    setError(null)
    try {
      const res = await restClient.post<{ data: { skillId: string; name: string } }>('/api/skills/marketplace/install', { installRef, sessionId: isScopeMode ? undefined : sessionId })
      if (isScopeMode && scopeId && res.data?.skillId) {
        // Bind the newly installed skill to the scope
        await restClient.post(`/api/business-scopes/${scopeId}/skills/${res.data.skillId}`, {})
        await loadScopeSkills()
        onScopeSkillsChanged?.()
      } else {
        await loadInstalled()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstallingRef(null)
    }
  }, [isScopeMode, scopeId, loadInstalled, loadScopeSkills, sessionId, onScopeSkillsChanged])

  // ── Import from external → enterprise ──
  const handleImportToEnterprise = useCallback(async (installRef: string) => {
    setImportingRef(installRef)
    setError(null)
    try {
      await restClient.post('/api/skills/enterprise/import', { installRef })
      await loadEnterprise()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingRef(null)
    }
  }, [loadEnterprise])

  // ── Install from enterprise → workspace or scope ──
  const handleEnterpriseInstall = useCallback(async (id: string) => {
    setInstallingEntId(id)
    setError(null)
    try {
      if (isScopeMode && scopeId) {
        // In scope mode: find the skill's underlying skillId and bind to scope
        const skill = enterpriseSkills.find(s => s.id === id)
        if (skill?.skillId) {
          await restClient.post(`/api/business-scopes/${scopeId}/skills/${skill.skillId}`, {})
        }
        await loadScopeSkills()
        onScopeSkillsChanged?.()
      } else {
        if (!sessionId) return
        await restClient.post(`/api/skills/enterprise/${id}/install`, { sessionId })
        await loadInstalled()
      }
      await loadEnterprise() // refresh install counts
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstallingEntId(null)
    }
  }, [isScopeMode, scopeId, sessionId, enterpriseSkills, loadInstalled, loadScopeSkills, loadEnterprise, onScopeSkillsChanged])

  // ── Vote ──
  const handleVote = useCallback(async (id: string, vote: 1 | -1) => {
    setVotingId(id)
    try {
      const res = await restClient.post<{ data: { voteScore: number } }>(
        `/api/skills/enterprise/${id}/vote`,
        { vote },
      )
      setEnterpriseSkills(prev =>
        prev.map(s => s.id === id ? { ...s, voteScore: res.data.voteScore } : s),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote failed')
    } finally {
      setVotingId(null)
    }
  }, [])

  // ── Publish from workspace ──
  const handlePublishStart = useCallback((skillName: string) => {
    setPublishingSkill(skillName)
    setPublishCategory('')
    setPublishGroupIds([])
    setError(null)
  }, [])

  const handlePublishConfirm = useCallback(async (skillName: string) => {
    if (!sessionId) return
    setError(null)
    setConfirmingPublish(true)
    try {
      await restClient.post(
        `/api/chat/sessions/${sessionId}/skills/${encodeURIComponent(skillName)}/publish`,
        {
          category: publishCategory || undefined,
          group_ids: publishGroupIds.length > 0 ? publishGroupIds : undefined,
        },
      )
      setPublishingSkill(null)
      setPublishCategory('')
      setPublishGroupIds([])
      setConfirmingPublish(false)
      await loadEnterprise()
      setActiveTab('enterprise')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
      setConfirmingPublish(false)
    }
  }, [sessionId, publishCategory, publishGroupIds, loadEnterprise])

  // ── Delete from workspace or unbind from scope ──
  const handleDelete = useCallback(async (skillName: string) => {
    if (isScopeMode && scopeId) {
      // In scope mode: unbind skill from scope
      const skill = scopeSkills.find(s => s.name === skillName)
      if (!skill) return
      setDeletingSkill(skillName)
      setError(null)
      try {
        await restClient.delete(`/api/business-scopes/${scopeId}/skills/${skill.id}`)
        await loadScopeSkills()
        onScopeSkillsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove skill from scope')
      } finally {
        setDeletingSkill(null)
      }
    } else {
      if (!sessionId) return
      setDeletingSkill(skillName)
      setError(null)
      try {
        await restClient.delete(
          `/api/chat/sessions/${sessionId}/workspace/skills/${encodeURIComponent(skillName)}`,
        )
        await loadInstalled()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed')
      } finally {
        setDeletingSkill(null)
      }
    }
  }, [isScopeMode, scopeId, scopeSkills, sessionId, loadInstalled, loadScopeSkills, onScopeSkillsChanged])

  const installedNames = new Set(
    isScopeMode
      ? scopeSkills.map(s => s.name)
      : installedSkills.map(s => s.name)
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-[460px] max-w-full h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <span className="text-sm font-semibold text-white">{t('skills.title')}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-800">
          <TabButton active={activeTab === 'installed'} onClick={() => setActiveTab('installed')}
            icon={<Zap className="w-3 h-3" />} label={`${t('skills.tabInstalled')} (${isScopeMode ? scopeSkills.length : installedSkills.length})`} />
          <TabButton active={activeTab === 'enterprise'} onClick={() => setActiveTab('enterprise')}
            icon={<Building2 className="w-3 h-3" />} label={t('skills.tabInternal')} />
          <TabButton active={activeTab === 'external'} onClick={() => setActiveTab('external')}
            icon={<Globe className="w-3 h-3" />} label={t('skills.tabExternal')} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-3 mt-2 px-3 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 truncate">{error}</span>
            <button onClick={() => setError(null)}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'installed' && (
            isScopeMode ? (
              <ScopeInstalledTab
                skills={scopeSkills}
                loading={loadingScopeSkills}
                onDelete={handleDelete}
                deletingSkill={deletingSkill}
              />
            ) : (
              <InstalledTab
                skills={installedSkills}
                loading={loadingInstalled}
                sessionId={sessionId ?? null}
                publishingSkill={publishingSkill}
                confirmingPublish={confirmingPublish}
                publishCategory={publishCategory}
                publishGroupIds={publishGroupIds}
                userGroups={userGroups}
                onPublishCategoryChange={setPublishCategory}
                onPublishGroupIdsChange={setPublishGroupIds}
                onPublishStart={handlePublishStart}
                onPublishConfirm={handlePublishConfirm}
                onDelete={handleDelete}
                deletingSkill={deletingSkill}
              />
            )
          )}
          {activeTab === 'enterprise' && (
            <EnterpriseTab
              skills={enterpriseSkills}
              loading={loadingEnterprise}
              categories={categories}
              query={enterpriseQuery}
              category={enterpriseCategory}
              sort={enterpriseSort}
              installedNames={installedNames}
              installingId={installingEntId}
              votingId={votingId}
              sessionId={sessionId ?? null}
              canInstall={isScopeMode || !!sessionId}
              onQueryChange={setEnterpriseQuery}
              onCategoryChange={setEnterpriseCategory}
              onSortChange={setEnterpriseSort}
              onSearch={loadEnterprise}
              onInstall={handleEnterpriseInstall}
              onVote={handleVote}
            />
          )}
          {activeTab === 'external' && (
            <ExternalTab
              results={marketResults}
              searching={isSearching}
              query={searchQuery}
              installedNames={installedNames}
              installingRef={installingRef}
              importingRef={importingRef}
              featuredSkills={featuredSkills}
              loadingFeatured={loadingFeatured}
              onQueryChange={setSearchQuery}
              onSearch={handleExternalSearch}
              onInstall={handleExternalInstall}
              onImport={handleImportToEnterprise}
            />
          )}
        </div>
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Scope Installed Tab (for scope binding mode)
// ---------------------------------------------------------------------------

function ScopeInstalledTab({ skills, loading, onDelete, deletingSkill }: {
  skills: Array<{ id: string; name: string; display_name: string; description: string | null; skill_type: string }>
  loading: boolean
  onDelete: (name: string) => void
  deletingSkill: string | null
}) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
      </div>
    )
  }
  if (skills.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-8 h-8 text-gray-700 mx-auto mb-1" />
        <p className="text-xs text-gray-500">{t('skills.noSkills')}</p>
        <p className="text-[10px] text-gray-600 mt-1">{t('scopeProfile.noSkillsHint')}</p>
      </div>
    )
  }
  return (
    <div className="px-4 py-3 space-y-1.5">
      {skills.map(skill => (
        <div key={skill.id} className="px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white block truncate">{skill.display_name || skill.name}</span>
              {skill.description && <span className="text-xs text-gray-500 block truncate">{skill.description}</span>}
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-500 flex-shrink-0">{skill.skill_type}</span>
            <button
              onClick={() => onDelete(skill.name)}
              disabled={deletingSkill === skill.name}
              className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
              title="Remove from scope"
            >
              {deletingSkill === skill.name ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Installed Tab
// ---------------------------------------------------------------------------

function InstalledTab({ skills, loading, sessionId, publishingSkill, confirmingPublish, publishCategory, publishGroupIds, userGroups, onPublishCategoryChange, onPublishGroupIdsChange, onPublishStart, onPublishConfirm, onDelete, deletingSkill }: {
  skills: WorkspaceSkill[]
  loading: boolean
  sessionId: string | null
  publishingSkill: string | null
  confirmingPublish: boolean
  publishCategory: string
  publishGroupIds: string[]
  userGroups: UserGroup[]
  onPublishCategoryChange: (v: string) => void
  onPublishGroupIdsChange: (v: string[]) => void
  onPublishStart: (name: string) => void
  onPublishConfirm: (name: string) => void
  onDelete: (name: string) => void
  deletingSkill: string | null
}) {
  const { t } = useTranslation()
  if (!sessionId) {
    return (
      <div className="text-center py-8">
        <Package className="w-8 h-8 text-gray-700 mx-auto mb-1" />
        <p className="text-xs text-gray-500">{t('skills.noSession')}</p>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
      </div>
    )
  }
  if (skills.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-8 h-8 text-gray-700 mx-auto mb-1" />
        <p className="text-xs text-gray-500">{t('skills.noSkills')}</p>
      </div>
    )
  }
  return (
    <div className="px-4 py-3 space-y-1.5">
      {skills.map(skill => (
        <div key={skill.name} className="px-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white block truncate">{skill.name}</span>
              {skill.description && <span className="text-xs text-gray-500 block truncate">{skill.description}</span>}
            </div>
            {skill.hasSkillMd && <FileText className="w-3 h-3 text-gray-600 flex-shrink-0" />}
            <button
              onClick={() => onDelete(skill.name)}
              disabled={deletingSkill === skill.name}
              className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
              title="Delete skill"
            >
              {deletingSkill === skill.name ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          {/* Publish action */}
          {publishingSkill === skill.name ? (
            <div className="mt-2 space-y-2">
              <input
                value={publishCategory}
                onChange={e => onPublishCategoryChange(e.target.value)}
                placeholder={t('skills.categoryOptional')}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              {/* User group multi-select */}
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">{t('skills.publishToGroups')}</label>
                {userGroups.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {userGroups.map(g => {
                      const selected = publishGroupIds.includes(g.id)
                      return (
                        <button
                          key={g.id}
                          onClick={() => {
                            onPublishGroupIdsChange(
                              selected
                                ? publishGroupIds.filter(id => id !== g.id)
                                : [...publishGroupIds, g.id]
                            )
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            selected
                              ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                              : 'bg-gray-700 text-gray-400 border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          {g.name}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-500">{t('skills.noGroupsHint')}</p>
                )}
                {publishGroupIds.length === 0 && (
                  <p className="text-[10px] text-yellow-400/80 mt-1">{t('skills.noGroupsWarning')}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPublishConfirm(skill.name)}
                  disabled={confirmingPublish}
                  className="px-2 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                >
                  {confirmingPublish ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {confirmingPublish ? t('skills.publishing') : t('skills.confirm')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onPublishStart(skill.name)}
              className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Upload className="w-3 h-3" />
              {t('skills.publishToInternal')}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enterprise Tab
// ---------------------------------------------------------------------------

function EnterpriseTab({ skills, loading, categories, query, category, sort, installedNames, installingId, votingId, sessionId, canInstall, onQueryChange, onCategoryChange, onSortChange, onSearch, onInstall, onVote }: {
  skills: EnterpriseSkill[]
  loading: boolean
  categories: string[]
  query: string
  category: string
  sort: 'popular' | 'recent' | 'top-rated'
  installedNames: Set<string>
  installingId: string | null
  votingId: string | null
  sessionId: string | null
  canInstall: boolean
  onQueryChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onSortChange: (v: 'popular' | 'recent' | 'top-rated') => void
  onSearch: () => void
  onInstall: (id: string) => void
  onVote: (id: string, vote: 1 | -1) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="px-4 py-3">
      {/* Search + filters */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            placeholder={t('skills.searchInternal')}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={onSearch} disabled={loading}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-xs rounded-lg transition-colors">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex gap-2 mb-3">
        <select
          value={category}
          onChange={e => { onCategoryChange(e.target.value); setTimeout(onSearch, 0) }}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">{t('skills.allCategories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={sort}
          onChange={e => { onSortChange(e.target.value as typeof sort); setTimeout(onSearch, 0) }}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="popular">{t('skills.popular')}</option>
          <option value="top-rated">{t('skills.topRated')}</option>
          <option value="recent">{t('skills.recent')}</option>
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8">
          <Building2 className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">{t('skills.noInternal')}</p>
          <p className="text-[10px] text-gray-600 mt-1">{t('skills.noInternalHint')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills.map(skill => {
            const alreadyInstalled = installedNames.has(skill.name)
            return (
              <div key={skill.id} className="px-3 py-2.5 bg-gray-800/30 border border-gray-700/30 rounded-lg hover:border-gray-600/50 transition-colors">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white block truncate">{skill.displayName}</span>
                    {skill.description && <span className="text-xs text-gray-500 block mt-0.5 line-clamp-2">{skill.description}</span>}
                    <div className="flex items-center gap-3 mt-1.5">
                      {skill.category && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">{skill.category}</span>
                      )}
                      <span className="text-[10px] text-gray-600">{skill.installCount} {t('skills.installs')}</span>
                      <span className={`text-[10px] ${skill.source === 'skills.sh' ? 'text-purple-400' : 'text-green-400'}`}>
                        {skill.source === 'skills.sh' ? '⬡ skills.sh' : '● internal'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {/* Vote buttons */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => onVote(skill.id, 1)} disabled={votingId === skill.id}
                        className="p-0.5 text-gray-500 hover:text-green-400 transition-colors disabled:opacity-50">
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <span className={`text-xs min-w-[20px] text-center ${skill.voteScore > 0 ? 'text-green-400' : skill.voteScore < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {skill.voteScore}
                      </span>
                      <button onClick={() => onVote(skill.id, -1)} disabled={votingId === skill.id}
                        className="p-0.5 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50">
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Install button */}
                    {alreadyInstalled ? (
                      <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <Check className="w-3 h-3" /> {t('skills.installed')}
                      </span>
                    ) : canInstall ? (
                      <button onClick={() => onInstall(skill.id)} disabled={installingId === skill.id}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded transition-colors">
                        {installingId === skill.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        {t('skills.install')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// External Tab
// ---------------------------------------------------------------------------

function ExternalTab({ results, searching, query, installedNames, installingRef, importingRef, featuredSkills, loadingFeatured, onQueryChange, onSearch, onInstall, onImport }: {
  results: MarketplaceSkill[]
  searching: boolean
  query: string
  installedNames: Set<string>
  installingRef: string | null
  importingRef: string | null
  featuredSkills: MarketplaceSkill[]
  loadingFeatured: boolean
  onQueryChange: (v: string) => void
  onSearch: () => void
  onInstall: (ref: string) => void
  onImport: (ref: string) => void
}) {
  const { t } = useTranslation()
  // Show search results if available, otherwise show featured
  const displaySkills = results.length > 0 ? results : (!query && !searching ? featuredSkills : [])
  const showFeaturedLabel = results.length === 0 && !query && !searching && featuredSkills.length > 0

  return (
    <div className="px-4 py-3">
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            placeholder={t('skills.searchMarketplace')}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={onSearch} disabled={searching || !query.trim()}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded-lg transition-colors">
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        </button>
      </div>

      {searching ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <span className="ml-2 text-xs text-gray-400">{t('skills.searchingMarketplace')}</span>
        </div>
      ) : displaySkills.length > 0 ? (
        <div>
          {showFeaturedLabel && (
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-gray-400">{t('skills.popularOnSkillsSh')}</span>
            </div>
          )}
          <div className="space-y-1.5">
            {displaySkills.map(skill => {
              const alreadyInstalled = installedNames.has(skill.name)
              return (
                <div key={skill.installRef} className="px-3 py-2.5 bg-gray-800/30 border border-gray-700/30 rounded-lg hover:border-gray-600/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <Package className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white block truncate">{skill.name}</span>
                      <span className="text-[10px] text-gray-600 font-mono">{skill.owner}</span>
                      {skill.description && <span className="text-xs text-gray-500 block mt-0.5 line-clamp-2">{skill.description}</span>}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                      {alreadyInstalled ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <Check className="w-3 h-3" /> {t('skills.installed')}
                        </span>
                      ) : (
                        <button onClick={() => onInstall(skill.installRef)} disabled={installingRef === skill.installRef}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-md transition-colors">
                          {installingRef === skill.installRef ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          {t('skills.install')}
                        </button>
                      )}
                      <button onClick={() => onImport(skill.installRef)} disabled={importingRef === skill.installRef}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-500/50 rounded-md transition-colors disabled:opacity-50">
                        {importingRef === skill.installRef ? <Loader2 className="w-3 h-3 animate-spin" /> : <Building2 className="w-3 h-3" />}
                        {t('skills.importToInternal')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : loadingFeatured ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <span className="ml-2 text-xs text-gray-400">{t('skills.loadingPopular')}</span>
        </div>
      ) : query && !searching ? (
        <div className="text-center py-8 text-gray-500">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">{t('skills.noResults').replace('{q}', query)}</p>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">{t('skills.searchPrompt')}</p>
          <p className="text-[10px] mt-1 text-gray-600">{t('skills.searchPromptHint')}</p>
        </div>
      )}
    </div>
  )
}
