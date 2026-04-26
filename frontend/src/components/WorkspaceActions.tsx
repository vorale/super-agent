/**
 * WorkspaceActions
 *
 * Dynamic action bar that appears above the chat input when the agent
 * has built an app (detected by scanning the workspace for index.html).
 * Shows contextual actions: Preview, Publish / Update, Open.
 *
 * Preview and Publish call the backend API directly — no agent round-trip
 * needed. The backend already has the workspace files synced locally and
 * handles entry-point detection, bundle copying, and DB registration.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Rocket, Eye, Loader2, X, RefreshCw, ExternalLink, Pencil, Check } from 'lucide-react'
import { restClient } from '@/services/api/restClient'

interface DetectedApp {
  folder: string
  entryPoint: string
  hasPackageJson: boolean
  name: string | null
  publishedAppId: string | null
  publishedAt: string | null
  publishedVersion: string | null
  previewAppId: string | null
}

/** Response from POST /api/apps/publish-from-workspace */
interface PublishResponse {
  id: string
  name: string
  version: string
  access_url: string
  upgraded?: boolean
  previous_version?: string
}

interface WorkspaceActionsProps {
  sessionId: string | null
  refreshKey: number
  /** @deprecated No longer used — preview/publish call the API directly. Kept for call-site compat. */
  onSendMessage?: (message: string) => void
}

export function WorkspaceActions({ sessionId, refreshKey }: WorkspaceActionsProps) {
  const [apps, setApps] = useState<DetectedApp[]>([])
  const [publishing, setPublishing] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Per-app custom names (folder → user-edited name)
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  // Which app folder is currently being edited
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!sessionId) { setApps([]); return }
    setDismissed(false)

    restClient.get<{ apps: DetectedApp[] }>(`/api/chat/sessions/${sessionId}/workspace/detect-apps`)
      .then(res => setApps(res.apps))
      .catch(() => setApps([]))
  }, [sessionId, refreshKey])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingFolder && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingFolder])

  /** Get the display name for an app, respecting user edits. */
  const getAppName = useCallback((app: DetectedApp) => {
    return customNames[app.folder] || app.name || (app.folder === '.' ? 'Root app' : app.folder)
  }, [customNames])

  const startEditing = useCallback((app: DetectedApp) => {
    setEditingFolder(app.folder)
    setEditValue(getAppName(app))
  }, [getAppName])

  const confirmEdit = useCallback(() => {
    if (editingFolder && editValue.trim()) {
      setCustomNames(prev => ({ ...prev, [editingFolder]: editValue.trim() }))
    }
    setEditingFolder(null)
    setEditValue('')
  }, [editingFolder, editValue])

  const cancelEdit = useCallback(() => {
    setEditingFolder(null)
    setEditValue('')
  }, [])

  /**
   * Publish or preview an app by calling the backend API directly.
   * No agent round-trip — the backend reads from the local workspace.
   */
  const publishApp = useCallback(async (app: DetectedApp, status: 'preview' | 'published') => {
    if (!sessionId) return

    const name = customNames[app.folder] || app.name || app.folder || 'my-app'
    const folderPath = app.folder === '.' ? '.' : app.folder

    try {
      const res = await restClient.post<PublishResponse>('/api/apps/publish-from-workspace', {
        session_id: sessionId,
        folder_path: folderPath,
        name,
        status,
      })

      if (status === 'preview') {
        // Open preview tab directly — no need to wait for SSE
        window.dispatchEvent(new CustomEvent('preview-ready', {
          detail: { url: res.access_url, name: res.name || name, appId: res.id },
        }))
      }

      // Refresh app list to pick up new published/preview state
      restClient.get<{ apps: DetectedApp[] }>(`/api/chat/sessions/${sessionId}/workspace/detect-apps`)
        .then(r => setApps(r.apps))
        .catch(() => {})

      return res
    } catch (err) {
      console.error(`[WorkspaceActions] ${status} failed:`, err)
      throw err
    }
  }, [sessionId, customNames])

  const handlePreview = useCallback(async (app: DetectedApp) => {
    setPreviewing(app.folder)
    try {
      await publishApp(app, 'preview')
    } finally {
      setPreviewing(null)
    }
  }, [publishApp])

  const handlePublish = useCallback(async (app: DetectedApp) => {
    setPublishing(app.folder)
    try {
      await publishApp(app, 'published')
    } finally {
      setPublishing(null)
    }
  }, [publishApp])

  const handleOpenPublished = useCallback((app: DetectedApp) => {
    if (!app.publishedAppId) return
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
    const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
    const url = `${baseUrl}/api/apps/${app.publishedAppId}/static/index.html${token ? `?token=${encodeURIComponent(token)}` : ''}`
    window.open(url, '_blank')
  }, [])

  if (!apps.length || dismissed) return null

  return (
    <div className="mx-4 mb-2">
      <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium text-purple-300">
              {apps.length === 1 ? 'App detected' : `${apps.length} apps detected`}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-0.5 rounded text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {apps.map(app => {
            const label = getAppName(app)
            const isPublishing = publishing === app.folder
            const isPreviewing = previewing === app.folder
            const isPublished = !!app.publishedAppId
            const isEditing = editingFolder === app.folder

            return (
              <div key={app.folder} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        onBlur={confirmEdit}
                        className="flex-1 min-w-0 bg-gray-800 border border-purple-500/40 rounded px-1.5 py-0.5 text-sm text-white outline-none focus:border-purple-400"
                      />
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={confirmEdit}
                        className="p-0.5 text-green-400 hover:text-green-300 transition-colors"
                        title="Confirm"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-white truncate">{label}</span>
                      <button
                        onClick={() => startEditing(app)}
                        className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                        title="Edit app name"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  {!isEditing && isPublished && app.publishedVersion && (
                    <span className="text-[10px] text-green-400/70 bg-green-500/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      v{app.publishedVersion}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Preview button */}
                  <button
                    onClick={() => handlePreview(app)}
                    disabled={isPreviewing || isEditing}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50"
                  >
                    {isPreviewing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    {isPreviewing ? 'Loading...' : 'Preview'}
                  </button>

                  {/* Open published app in new tab */}
                  {isPublished && (
                    <button
                      onClick={() => handleOpenPublished(app)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-500/30 transition-colors"
                      title="Open published app"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </button>
                  )}

                  {/* Publish / Update button */}
                  <button
                    onClick={() => handlePublish(app)}
                    disabled={isPublishing || isEditing}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      isPublished
                        ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30'
                        : 'bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50'
                    }`}
                  >
                    {isPublishing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isPublished ? (
                      <RefreshCw className="w-3 h-3" />
                    ) : (
                      <Rocket className="w-3 h-3" />
                    )}
                    {isPublishing ? 'Publishing...' : isPublished ? 'Update' : 'Publish'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
