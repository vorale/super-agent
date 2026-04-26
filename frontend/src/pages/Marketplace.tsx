import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Grid3X3, List, Rocket, Globe, Star, TrendingUp, Clock, ArrowUpDown, Heart, Trash2 } from 'lucide-react'
import { restClient } from '@/services/api/restClient'
import { useFavorites } from '@/hooks/useFavorites'
import { useTranslation } from '@/i18n'

// ============================================================================
// Types
// ============================================================================

interface PublishedApp {
  id: string
  name: string
  description: string | null
  icon: string
  category: string
  version: string
  status: string
  published_at: string
  metadata: Record<string, unknown>
  // Phase 4 enrichments
  avg_rating?: number
  rating_count?: number
  launch_count?: number
  author_name?: string
  tags?: string[]
  screenshots?: string[]
  _sample?: boolean
}

// ============================================================================
// Hardcoded sample apps
// ============================================================================

const SAMPLE_APPS: PublishedApp[] = [
  {
    id: 'sample-expense-tracker',
    name: 'Expense Tracker',
    description: 'Track team expenses with approval workflows, receipt uploads, and CSV export. Built with React + Tailwind.',
    icon: '📊',
    category: 'tool',
    version: '1.2.0',
    status: 'published',
    published_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 4.2,
    rating_count: 12,
    launch_count: 142,
    author_name: 'Alex V.',
    tags: ['expense', 'finance', 'approval'],
    _sample: true,
  },
  {
    id: 'sample-standup-timer',
    name: 'Standup Timer',
    description: 'Configurable per-person countdown timer for daily standups. Tracks speaking time and sends summary to Slack.',
    icon: '⏱️',
    category: 'tool',
    version: '2.0.1',
    status: 'published',
    published_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 4.8,
    rating_count: 24,
    launch_count: 89,
    author_name: 'Sarah J.',
    tags: ['standup', 'timer', 'agile'],
    _sample: true,
  },
  {
    id: 'sample-snake-game',
    name: 'Snake Game',
    description: 'Classic snake game with leaderboard. Built during a Friday hackathon. Surprisingly addictive.',
    icon: '🐍',
    category: 'game',
    version: '1.0.0',
    status: 'published',
    published_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 3.8,
    rating_count: 31,
    launch_count: 203,
    author_name: 'Mike T.',
    tags: ['game', 'fun', 'hackathon'],
    _sample: true,
  },
  {
    id: 'sample-sales-dashboard',
    name: 'Sales Pipeline',
    description: 'Real-time sales pipeline dashboard with funnel visualization, deal tracking, and weekly forecast charts.',
    icon: '💰',
    category: 'dashboard',
    version: '3.1.0',
    status: 'published',
    published_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 4.5,
    rating_count: 18,
    launch_count: 67,
    author_name: 'Lisa M.',
    tags: ['sales', 'pipeline', 'analytics'],
    _sample: true,
  },
  {
    id: 'sample-onboarding-form',
    name: 'Employee Onboarding',
    description: 'Multi-step onboarding form for new hires. Collects personal info, equipment preferences, and team assignments.',
    icon: '📋',
    category: 'form',
    version: '1.1.0',
    status: 'published',
    published_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 4.0,
    rating_count: 8,
    launch_count: 34,
    author_name: 'Jenny K.',
    tags: ['hr', 'onboarding', 'form'],
    _sample: true,
  },
  {
    id: 'sample-incident-tracker',
    name: 'Incident Commander',
    description: 'Track production incidents with severity levels, timeline, and post-mortem templates. Integrates with PagerDuty.',
    icon: '🚨',
    category: 'tool',
    version: '2.3.0',
    status: 'published',
    published_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 4.7,
    rating_count: 15,
    launch_count: 56,
    author_name: 'Marcus O.',
    tags: ['incident', 'ops', 'sre'],
    _sample: true,
  },
  {
    id: 'sample-retro-board',
    name: 'Retro Board',
    description: 'Collaborative retrospective board with columns for what went well, what to improve, and action items. Real-time sync.',
    icon: '🔄',
    category: 'tool',
    version: '1.0.2',
    status: 'published',
    published_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 4.4,
    rating_count: 20,
    launch_count: 112,
    author_name: 'David C.',
    tags: ['retro', 'agile', 'collaboration'],
    _sample: true,
  },
  {
    id: 'sample-inventory-tool',
    name: 'Inventory Scanner',
    description: 'Barcode scanning inventory management tool. Track stock levels, set reorder alerts, and generate reports.',
    icon: '📦',
    category: 'utility',
    version: '1.4.0',
    status: 'published',
    published_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    metadata: {},
    avg_rating: 3.9,
    rating_count: 6,
    launch_count: 28,
    author_name: 'Elena R.',
    tags: ['inventory', 'warehouse', 'scanning'],
    _sample: true,
  },
]

// ============================================================================
// Helpers
// ============================================================================

const CATEGORIES = ['all', 'tool', 'dashboard', 'form', 'game', 'utility', 'other']
type SortOption = 'popular' | 'newest' | 'rating' | 'name'

function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-3 h-3 ${i <= full ? 'text-yellow-400 fill-yellow-400' : i === full + 1 && half ? 'text-yellow-400 fill-yellow-400/50' : 'text-gray-600'}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-gray-500">{rating.toFixed(1)}</span>
      <span className="text-[10px] text-gray-600">({count})</span>
    </div>
  )
}

// ============================================================================
// App Card
// ============================================================================

function AppCard({ app, onClick, isFav, onToggleFav, onDelete }: { app: PublishedApp; onClick: () => void; isFav: boolean; onToggleFav: () => void; onDelete?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-purple-500/50 hover:bg-gray-800/80 transition-all cursor-pointer group relative"
    >
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {!app._sample && onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded-lg hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete app"
          >
            <Trash2 className="w-4 h-4 text-gray-600 hover:text-red-400" />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onToggleFav() }}
          className="p-1 rounded-lg hover:bg-gray-700 transition-colors"
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'text-red-400 fill-red-400' : 'text-gray-600 group-hover:text-gray-400'}`} />
        </button>
      </div>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
          {app.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate">{app.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 capitalize">{app.category}</span>
            <span className="text-[10px] text-gray-600">v{app.version}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-400 line-clamp-2 mb-3">{app.description || 'No description'}</p>

      {/* Rating + stats */}
      <div className="flex items-center justify-between mb-3">
        {app.avg_rating ? (
          <StarRating rating={app.avg_rating} count={app.rating_count || 0} />
        ) : (
          <span className="text-[10px] text-gray-600">No ratings yet</span>
        )}
        {app.launch_count != null && (
          <span className="text-[10px] text-gray-500">{app.launch_count} runs</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {app.author_name && <span className="text-[10px] text-gray-600">by {app.author_name}</span>}
          {app._sample && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-600/20 text-yellow-500">SAMPLE</span>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onClick() }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-500 transition-colors"
        >
          <Globe className="w-3 h-3" />
          Run
        </button>
      </div>
    </div>
  )
}

function AppListRow({ app, onClick, isFav, onToggleFav, onDelete }: { app: PublishedApp; onClick: () => void; isFav: boolean; onToggleFav: () => void; onDelete?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 hover:border-purple-500/50 transition-all cursor-pointer group"
    >
      <button onClick={e => { e.stopPropagation(); onToggleFav() }} className="p-0.5">
        <Heart className={`w-3.5 h-3.5 ${isFav ? 'text-red-400 fill-red-400' : 'text-gray-600 hover:text-gray-400'}`} />
      </button>
      <span className="text-2xl">{app.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium">{app.name}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400 capitalize">{app.category}</span>
          {app._sample && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-600/20 text-yellow-500">SAMPLE</span>}
        </div>
        <p className="text-sm text-gray-500 truncate">{app.description || 'No description'}</p>
      </div>
      {app.avg_rating ? <StarRating rating={app.avg_rating} count={app.rating_count || 0} /> : null}
      {app.launch_count != null && <span className="text-xs text-gray-600">{app.launch_count} runs</span>}
      <span className="text-xs text-gray-600">v{app.version}</span>
      {!app._sample && onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete app"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={e => { e.stopPropagation(); onClick() }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-500 transition-colors"
      >
        <Globe className="w-3 h-3" />
        Run
      </button>
    </div>
  )
}

// ============================================================================
// Marketplace
// ============================================================================

export function Marketplace() {
  const navigate = useNavigate()
  const { favorites, toggle: toggleFav } = useFavorites()
  const { t } = useTranslation()
  const [apiApps, setApiApps] = useState<PublishedApp[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<SortOption>('popular')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [deleteTarget, setDeleteTarget] = useState<PublishedApp | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadApps = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (category !== 'all') params.set('category', category)
      const res = await restClient.get<{ data: PublishedApp[] }>(`/api/apps?${params}`)
      setApiApps(res.data)
    } catch {
      setApiApps([])
    } finally {
      setLoading(false)
    }
  }, [search, category])

  useEffect(() => { loadApps() }, [loadApps])

  // Merge API apps with samples
  const allApps = useMemo(() => {
    const merged = [...apiApps, ...SAMPLE_APPS]
    // Filter by category
    let filtered = category === 'all' ? merged : merged.filter(a => a.category === category)
    // Filter by search
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.tags || []).some(t => t.includes(q))
      )
    }
    // Sort
    filtered.sort((a, b) => {
      switch (sort) {
        case 'popular': return (b.launch_count || 0) - (a.launch_count || 0)
        case 'newest': return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
        case 'rating': return (b.avg_rating || 0) - (a.avg_rating || 0)
        case 'name': return a.name.localeCompare(b.name)
        default: return 0
      }
    })
    return filtered
  }, [apiApps, category, search, sort])

  // Trending = top 4 by launch count
  const trending = useMemo(() =>
    [...apiApps, ...SAMPLE_APPS]
      .sort((a, b) => (b.launch_count || 0) - (a.launch_count || 0))
      .slice(0, 4),
    [apiApps]
  )

  // Recently used (simulated — last 3 by newest)
  const recentlyUsed = useMemo(() =>
    [...apiApps, ...SAMPLE_APPS]
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 3),
    [apiApps]
  )

  // Favorite apps
  const favoriteApps = useMemo(() =>
    [...apiApps, ...SAMPLE_APPS].filter(a => favorites.has(a.id)),
    [apiApps, favorites]
  )

  const handleAppClick = (app: PublishedApp) => {
    navigate(`/apps/${app.id}`)
  }

  const handleDeleteApp = useCallback(async () => {
    if (!deleteTarget || deleteTarget._sample) return
    setDeleting(true)
    try {
      await restClient.delete(`/api/apps/${deleteTarget.id}`)
      setDeleteTarget(null)
      loadApps()
    } catch {
      // stay on dialog so user sees it failed
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, loadApps])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Rocket className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">{t('marketplace.title')}</h1>
            <span className="text-sm text-gray-500">{allApps.length} {t('marketplace.apps')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('grid')}
              className={`p-2 rounded-lg transition-colors ${view === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search + Filters + Sort */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('marketplace.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  category === cat ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
            {(['popular', 'newest', 'rating', 'name'] as SortOption[]).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors capitalize ${
                  sort === s ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500">{t('marketplace.loading')}</div>
        ) : (
          <>
            {/* Trending section */}
            {!search && category === 'all' && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-orange-400" />
                  <h2 className="text-sm font-semibold text-white">{t('marketplace.trending')}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {trending.map(app => (
                    <div
                      key={`t-${app.id}`}
                      onClick={() => handleAppClick(app)}
                      className="flex items-center gap-3 bg-gradient-to-r from-gray-800 to-gray-800/50 border border-gray-700 rounded-lg px-3 py-2.5 hover:border-orange-500/30 transition-all cursor-pointer"
                    >
                      <span className="text-xl">{app.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm text-white font-medium truncate">{app.name}</h3>
                        <div className="flex items-center gap-2">
                          {app.avg_rating && (
                            <span className="text-[10px] text-yellow-400">★ {app.avg_rating.toFixed(1)}</span>
                          )}
                          <span className="text-[10px] text-gray-500">{app.launch_count} runs</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recently used section */}
            {!search && category === 'all' && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <h2 className="text-sm font-semibold text-white">{t('marketplace.recentlyUsed')}</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {recentlyUsed.map(app => (
                    <div
                      key={`r-${app.id}`}
                      onClick={() => handleAppClick(app)}
                      className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 hover:border-blue-500/30 transition-all cursor-pointer flex-shrink-0 min-w-[200px]"
                    >
                      <span className="text-xl">{app.icon}</span>
                      <div className="min-w-0">
                        <h3 className="text-sm text-white font-medium truncate">{app.name}</h3>
                        <span className="text-[10px] text-gray-500">v{app.version}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Favorites section */}
            {!search && category === 'all' && favoriteApps.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-4 h-4 text-red-400 fill-red-400" />
                  <h2 className="text-sm font-semibold text-white">{t('marketplace.favorites')}</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {favoriteApps.map(app => (
                    <div
                      key={`f-${app.id}`}
                      onClick={() => handleAppClick(app)}
                      className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 hover:border-red-500/30 transition-all cursor-pointer flex-shrink-0 min-w-[200px]"
                    >
                      <span className="text-xl">{app.icon}</span>
                      <div className="min-w-0">
                        <h3 className="text-sm text-white font-medium truncate">{app.name}</h3>
                        <span className="text-[10px] text-gray-500">v{app.version}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* All apps */}
            <section>
              {(!search && category === 'all') && (
                <h2 className="text-sm font-semibold text-white mb-3">{t('marketplace.allApps')}</h2>
              )}
              {allApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <Search className="w-8 h-8 text-gray-700" />
                  <p className="text-gray-500 text-sm">{t('marketplace.noResults')}</p>
                </div>
              ) : view === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {allApps.map(app => (
                    <AppCard key={app.id} app={app} onClick={() => handleAppClick(app)} isFav={favorites.has(app.id)} onToggleFav={() => toggleFav(app.id)} onDelete={!app._sample ? () => setDeleteTarget(app) : undefined} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {allApps.map(app => (
                    <AppListRow key={app.id} app={app} onClick={() => handleAppClick(app)} isFav={favorites.has(app.id)} onToggleFav={() => toggleFav(app.id)} onDelete={!app._sample ? () => setDeleteTarget(app) : undefined} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Delete App</h3>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              Are you sure you want to permanently delete <span className="text-white">{deleteTarget.icon} {deleteTarget.name}</span>?
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteApp}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
