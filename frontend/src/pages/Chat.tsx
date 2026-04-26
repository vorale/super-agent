import { useState, useCallback, useEffect, useRef, useContext, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, ChevronDown, AlertCircle, X, Bot, Layers, MessageSquare, File as FileIcon, Save, Eye, Pencil, Square, Paperclip, Upload, Trash2, Globe, Rocket, RefreshCw, ExternalLink, Brain, Download, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { useTranslation } from '@/i18n'
import { MessageList, QuickQuestions, WorkspaceExplorer, useToast } from '@/components'
import type { FileNode } from '@/components/WorkspaceExplorer'
import { SessionHistoryPanel } from '@/components/chat/SessionHistoryPanel'
import { SaveToMemoryModal } from '@/components/chat/SaveToMemoryModal'
import { WorkspaceActions } from '@/components/WorkspaceActions'
import { ChatProvider, ChatContext } from '@/services/ChatContext'
import { AgentService } from '@/services/agentService'
import { BusinessScopeService, type BusinessScope } from '@/services/businessScopeService'
import { RestChatRoomService } from '@/services/api/restChatRoomService'
import type { QuickQuestion, Agent } from '@/types'
import { getAvatarDisplayUrl, getAvatarFallback, shouldShowAvatarImage } from '@/utils/avatarUtils'
import { restClient } from '@/services/api/restClient'
import { AgentMentionPopup, type AgentMentionPopupHandle, type MentionAgent } from '@/components/chat/AgentMentionPopup'

// ============================================================================
// File Tab types & viewer
// ============================================================================

interface FileTab {
  id: string       // unique key (path)
  name: string     // display name
  path: string     // workspace-relative path or published app URL
  kind?: 'file' | 'preview' | 'published-preview'
}

const PREVIEWABLE_EXTENSIONS = new Set(['md', 'markdown', 'html', 'htm'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'])
const PDF_EXTENSIONS = new Set(['pdf'])
const EXCEL_EXTENSIONS = new Set(['xlsx', 'xls', 'xlsb'])
const OFFICE_DOC_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx'])
/** Binary file extensions that must NOT be read as UTF-8 text */
const BINARY_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS, ...PDF_EXTENSIONS, ...EXCEL_EXTENSIONS,
  'doc', 'docx', 'ppt', 'pptx', 'zip', 'gz', 'tar', 'rar', '7z',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'woff', 'woff2', 'ttf', 'otf', 'eot',
])

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

/** Map common file extensions to highlight.js language identifiers */
const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  py: 'python', pyw: 'python',
  rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', kts: 'kotlin',
  cs: 'csharp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  swift: 'swift', m: 'objectivec', mm: 'objectivec',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini',
  xml: 'xml', html: 'xml', htm: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', less: 'less', sass: 'scss',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  md: 'markdown', markdown: 'markdown',
  dockerfile: 'dockerfile', docker: 'dockerfile',
  makefile: 'makefile', cmake: 'cmake',
  lua: 'lua', r: 'r', php: 'php', pl: 'perl', pm: 'perl',
  ex: 'elixir', exs: 'elixir', erl: 'erlang',
  hs: 'haskell', scala: 'scala', clj: 'clojure',
  prisma: 'prisma', proto: 'protobuf', tf: 'hcl',
  vue: 'xml', svelte: 'xml',
}

function getLanguageForExt(ext: string): string | undefined {
  return EXT_TO_LANG[ext]
}

/** Highlight code content using highlight.js. Returns HTML string. */
function useHighlightedCode(code: string | null, ext: string): string {
  return useMemo(() => {
    if (!code) return ''
    const lang = getLanguageForExt(ext)
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      // Auto-detect as fallback
      return hljs.highlightAuto(code).value
    } catch {
      return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [code, ext])
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-invert max-w-none text-sm text-gray-300 leading-relaxed
      [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-6 [&_h1]:mb-3
      [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-5 [&_h2]:mb-2
      [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-4 [&_h3]:mb-2
      [&_strong]:text-white [&_strong]:font-semibold
      [&_a]:text-blue-400 [&_a]:underline
      [&_hr]:border-gray-700 [&_hr]:my-4
      [&_li]:text-gray-300
      [&_code]:bg-gray-800 [&_code]:text-green-400 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
      [&_pre]:bg-gray-900 [&_pre]:border [&_pre]:border-gray-700 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:my-3 [&_pre]:overflow-x-auto
      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-300
      [&_table]:border-collapse [&_table]:border [&_table]:border-gray-600 [&_table]:my-3 [&_table]:text-sm [&_table]:w-full
      [&_th]:border [&_th]:border-gray-600 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-white [&_th]:bg-gray-800
      [&_td]:border [&_td]:border-gray-700 [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-gray-300
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      className="w-full h-full border-0 bg-white rounded"
      sandbox="allow-scripts"
      title="HTML Preview"
    />
  )
}

function FileViewerTab({ path, sessionId }: { path: string; sessionId: string }) {
  const { t } = useTranslation()
  const [content, setContent] = useState<string | null>(null)
  const [editContent, setEditContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit' | 'preview'>('view')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [binaryBlob, setBinaryBlob] = useState<Blob | null>(null)
  const [excelData, setExcelData] = useState<{ sheetNames: string[]; sheets: Record<string, string[][]> } | null>(null)
  const [activeSheet, setActiveSheet] = useState<string>('')
  const ext = getFileExtension(path)
  const canPreview = PREVIEWABLE_EXTENSIONS.has(ext)
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const isPdf = PDF_EXTENSIONS.has(ext)
  const isExcel = EXCEL_EXTENSIONS.has(ext)
  const isOfficeDoc = OFFICE_DOC_EXTENSIONS.has(ext)
  const isBinary = BINARY_EXTENSIONS.has(ext)
  const highlightedHtml = useHighlightedCode(content, ext)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    if (isBinary) {
      // Fetch binary files (images, xlsx, etc.) as blob via the raw endpoint
      const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
      const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
      fetch(`${baseUrl}/api/chat/sessions/${sessionId}/workspace/file/raw?path=${encodeURIComponent(path)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load file')
          return res.blob()
        })
        .then(async (blob) => {
          if (cancelled) return
          if (isImage) {
            setImageUrl(URL.createObjectURL(blob))
          } else if (isExcel) {
            // Parse Excel file using SheetJS
            try {
              const XLSX = await import('xlsx')
              const arrayBuffer = await blob.arrayBuffer()
              const workbook = XLSX.read(arrayBuffer, { type: 'array' })
              const sheets: Record<string, string[][]> = {}
              for (const name of workbook.SheetNames) {
                sheets[name] = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name]!, { header: 1 })
              }
              setExcelData({ sheetNames: workbook.SheetNames, sheets })
              setActiveSheet(workbook.SheetNames[0] ?? '')
            } catch {
              setContent(t('chat.failedToParseExcel'))
            }
          }
          setBinaryBlob(blob)
        })
        .catch(() => {
          if (!cancelled) setContent(t('chat.failedToLoadFile'))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => { cancelled = true }
    }

    restClient.get<{ content: string }>(
      `/api/chat/sessions/${sessionId}/workspace/file?path=${encodeURIComponent(path)}`
    ).then(res => {
      if (!cancelled) {
        setContent(res.content)
        setEditContent(res.content)
        setDirty(false)
      }
    }).catch(() => {
      if (!cancelled) setContent(t('chat.failedToLoadFile'))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [path, sessionId])

  // Clean up image object URL on unmount or path change
  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }
  }, [imageUrl])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await restClient.put(`/api/chat/sessions/${sessionId}/workspace/file`, {
        path,
        content: editContent,
      })
      setContent(editContent)
      setDirty(false)
    } catch {
      // Could show a toast, but for now just stop the spinner
    } finally {
      setSaving(false)
    }
  }, [sessionId, path, editContent])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  const handleDownload = useCallback(() => {
    const fileName = path.split('/').pop() ?? 'file'
    if (isBinary && binaryBlob) {
      // Download binary files from the original blob to avoid corruption
      const url = URL.createObjectURL(binaryBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } else if (content !== null) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [path, isBinary, binaryBlob, content])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">{t('chat.loading')}</div>
  }

  // Image files — render as image, no edit/preview toolbar
  if (isImage) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 text-xs">
          <div className="flex-1" />
          <button
            onClick={handleDownload}
            disabled={!imageUrl}
            className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            <Download className="w-3 h-3" /> {t('chat.download')}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto p-4">
          {imageUrl ? (
            <img src={imageUrl} alt={path} className="max-w-full max-h-full object-contain rounded" />
          ) : (
            <span className="text-gray-500">{t('chat.failedToLoadImage')}</span>
          )}
        </div>
      </div>
    )
  }

  // PDF files — render in browser's native PDF viewer via iframe
  if (isPdf) {
    const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
    const pdfUrl = `${baseUrl}/api/chat/sessions/${sessionId}/workspace/file/raw?path=${encodeURIComponent(path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        <iframe src={pdfUrl} className="flex-1 w-full border-0" title={path} />
      </div>
    )
  }

  // Excel files — render as table with sheet tabs
  if (isExcel) {
    const rows = excelData && activeSheet ? excelData.sheets[activeSheet] ?? [] : []
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 text-xs">
          {excelData && excelData.sheetNames.length > 1 && excelData.sheetNames.map(name => (
            <button
              key={name}
              onClick={() => setActiveSheet(name)}
              className={`px-2 py-1 rounded transition-colors ${activeSheet === name ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {name}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleDownload}
            disabled={!binaryBlob}
            className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            <Download className="w-3 h-3" /> {t('chat.download')}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {excelData ? (
            <table className="w-full text-sm border-collapse">
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? 'bg-gray-800 sticky top-0' : 'hover:bg-gray-900/50'}>
                    {(row as unknown[]).map((cell, ci) => {
                      const Tag = ri === 0 ? 'th' : 'td'
                      return (
                        <Tag
                          key={ci}
                          className={`border border-gray-700 px-3 py-1.5 text-left whitespace-nowrap ${
                            ri === 0 ? 'text-white font-medium' : 'text-gray-300'
                          }`}
                        >
                          {cell != null ? String(cell) : ''}
                        </Tag>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              {content ?? t('chat.failedToParseExcel')}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Office documents (docx, pptx, etc.) — preview as PDF via server-side LibreOffice conversion, download original
  if (isOfficeDoc) {
    const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
    const pdfPreviewUrl = `${baseUrl}/api/chat/sessions/${sessionId}/workspace/file/pdf-preview?path=${encodeURIComponent(path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 text-xs">
          <div className="flex-1" />
          <button
            onClick={handleDownload}
            disabled={!binaryBlob}
            className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            <Download className="w-3 h-3" /> {t('chat.download')}
          </button>
        </div>
        <iframe src={pdfPreviewUrl} className="flex-1 w-full border-0" title={path} />
      </div>
    )
  }

  // Other binary files — download only, no preview
  if (isBinary) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-gray-950">
        <FileIcon className="w-12 h-12 text-gray-600" />
        <p className="text-gray-400 text-sm">{t('chat.cannotPreview')}</p>
        <button
          onClick={handleDownload}
          disabled={!binaryBlob}
          className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
        >
          <Download className="w-4 h-4" /> {t('chat.download')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 text-xs">
        <button
          onClick={() => setMode('view')}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${mode === 'view' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Eye className="w-3 h-3" /> {t('chat.view')}
        </button>
        <button
          onClick={() => { setMode('edit'); setEditContent(dirty ? editContent : content ?? '') }}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${mode === 'edit' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Pencil className="w-3 h-3" /> {t('chat.edit')}
        </button>
        {canPreview && (
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${mode === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            <Eye className="w-3 h-3" /> {t('chat.preview')}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={handleDownload}
          disabled={content === null}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          <Download className="w-3 h-3" /> {t('chat.download')}
        </button>
        {mode === 'edit' && (
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              dirty ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-gray-500 cursor-default'
            }`}
          >
            <Save className="w-3 h-3" />
            {saving ? t('chat.saving') : dirty ? t('chat.save') : t('chat.saved')}
          </button>
        )}
      </div>

      {/* Content area */}
      {mode === 'edit' ? (
        <textarea
          value={editContent}
          onChange={e => { setEditContent(e.target.value); setDirty(e.target.value !== content) }}
          onKeyDown={handleKeyDown}
          className="flex-1 w-full p-4 bg-gray-950 text-sm text-gray-300 font-mono leading-relaxed resize-none outline-none border-none"
          spellCheck={false}
        />
      ) : mode === 'preview' && canPreview ? (
        <div className="flex-1 overflow-auto p-4">
          {ext === 'html' || ext === 'htm' ? (
            <HtmlPreview content={dirty ? editContent : content ?? ''} />
          ) : (
            <MarkdownPreview content={dirty ? editContent : content ?? ''} />
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <pre className="hljs text-sm font-mono leading-relaxed p-4 m-0"><code dangerouslySetInnerHTML={{ __html: highlightedHtml }} /></pre>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// App Preview Tab — live iframe preview of generated apps
// ============================================================================

const PREVIEWABLE_APP_FILES = new Set(['index.html', 'index.htm', 'app.html'])

function isPreviewableFile(name: string): boolean {
  const lower = name.toLowerCase()
  return PREVIEWABLE_APP_FILES.has(lower) || lower.endsWith('.html') || lower.endsWith('.htm')
}

function AppPreviewTab({ path, sessionId }: { path: string; sessionId: string }) {
  const { t } = useTranslation()
  const [refreshCount, setRefreshCount] = useState(0)
  const [status, setStatus] = useState<'starting' | 'running' | 'error'>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

  // Determine if this is a Vite/React app (has package.json sibling) or plain HTML
  // For now, always try dev server first; fall back to raw file serving
  const [useDevServer, setUseDevServer] = useState(true)

  // Start dev server on mount
  useEffect(() => {
    if (!useDevServer) {
      setStatus('running')
      return
    }
    let cancelled = false
    setStatus('starting')
    restClient.post<{ port: number; status: string }>(
      `/api/chat/sessions/${sessionId}/preview/start`, {}
    ).then(() => {
      if (!cancelled) setStatus('running')
    }).catch((err) => {
      if (cancelled) return
      // If no package.json, fall back to raw file serving
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('package.json')) {
        setUseDevServer(false)
        setStatus('running')
      } else {
        setStatus('error')
        setErrorMsg(msg)
      }
    })
    return () => { cancelled = true }
  }, [sessionId, useDevServer])

  const previewUrl = useDevServer
    ? `${baseUrl}/api/chat/sessions/${sessionId}/preview/?token=${encodeURIComponent(token || '')}&_r=${refreshCount}`
    : `${baseUrl}/api/chat/sessions/${sessionId}/workspace/file/raw?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token || '')}&_r=${refreshCount}`

  const handleDownload = useCallback(() => {
    const fileName = path.split('/').pop() ?? 'file.html'
    const downloadUrl = `${baseUrl}/api/chat/sessions/${sessionId}/workspace/file/raw?path=${encodeURIComponent(path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
    fetch(downloadUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Download failed')
        return res.blob()
      })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(err => console.error('Download failed:', err))
  }, [path, sessionId, baseUrl, token])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 text-xs">
        <Globe className="w-3.5 h-3.5 text-green-400" />
        <span className="text-gray-300 font-medium">{t('chat.appPreview')}</span>
        {useDevServer && (
          <span className="px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 text-[10px] font-medium">DEV</span>
        )}
        <span className="text-gray-600 truncate max-w-[200px]">{path}</span>
        <div className="flex-1" />
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('chat.downloadFile')}
        >
          <Download className="w-3 h-3" />
          {t('chat.download')}
        </button>
        <button
          onClick={() => setRefreshCount(c => c + 1)}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('chat.refreshPreview')}
        >
          <RefreshCw className="w-3 h-3" />
          {t('chat.refresh')}
        </button>
      </div>

      {/* Content */}
      {status === 'starting' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-sm">{t('chat.startingDevServer')}</span>
          <span className="text-xs text-gray-600">{t('chat.runningNpmInstall')}</span>
        </div>
      ) : status === 'error' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-red-400">
          <AlertCircle className="w-6 h-6" />
          <span className="text-sm">{t('chat.failedToStartPreview')}</span>
          <span className="text-xs text-gray-500 max-w-md text-center">{errorMsg}</span>
        </div>
      ) : (
        <iframe
          key={refreshCount}
          src={previewUrl}
          className="flex-1 w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title={t('chat.appPreview')}
        />
      )}
    </div>
  )
}

// ============================================================================
// Published App Preview Tab — iframe preview of a published/preview app
// ============================================================================

function PublishedAppPreviewTab({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation()
  const [refreshCount, setRefreshCount] = useState(0)
  const token = localStorage.getItem('local_auth_token') || localStorage.getItem('cognito_id_token')
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
  const fullUrl = `${baseUrl}${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}&_r=${refreshCount}`

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 text-xs">
        <Eye className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-gray-300 font-medium">{t('chat.preview')}: {name}</span>
        <div className="flex-1" />
        <button
          onClick={() => setRefreshCount(c => c + 1)}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('chat.refreshPreview')}
        >
          <RefreshCw className="w-3 h-3" />
          {t('chat.refresh')}
        </button>
        <button
          onClick={() => window.open(fullUrl, '_blank')}
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title={t('chat.openInNewTab')}
        >
          <ExternalLink className="w-3 h-3" />
          {t('chat.popOut')}
        </button>
      </div>
      <iframe
        key={refreshCount}
        src={fullUrl}
        className="flex-1 w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={`${t('chat.preview')}: ${name}`}
      />
    </div>
  )
}

// ============================================================================
// Unified Chat Selector — single dropdown for scopes + independent agents
// ============================================================================

interface UnifiedChatSelectorProps {
  selectedScopeId: string | null
  selectedAgentId: string | null
  onSelectScope: (scopeId: string) => void
  onSelectIndependentAgent: (agentId: string) => void
}

function UnifiedChatSelector({ selectedScopeId, selectedAgentId, onSelectScope, onSelectIndependentAgent }: UnifiedChatSelectorProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [scopes, setScopes] = useState<BusinessScope[]>([])
  const [independentAgents, setIndependentAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const [scopeList, allAgents] = await Promise.all([
          BusinessScopeService.getBusinessScopes(),
          AgentService.getAgents(),
        ])
        setScopes(scopeList)
        setIndependentAgents(allAgents.filter(a => !a.businessScopeId))

        // Auto-select default scope if nothing is selected
        if (!selectedScopeId && !selectedAgentId && scopeList.length > 0) {
          const defaultScope = scopeList.find(s => s.isDefault) || scopeList[0]
          onSelectScope(defaultScope.id)
        }
      } catch (err) {
        console.error('Failed to load scopes/agents:', err)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedScope = scopes.find(s => s.id === selectedScopeId)
  const selectedIndependentAgent = independentAgents.find(a => a.id === selectedAgentId)

  // Determine display label
  let displayLabel = t('chat.selectScopeOrAgent')
  let displayIcon: React.ReactNode = <Layers className="w-4 h-4 text-gray-400" />
  if (selectedScope) {
    displayLabel = `${selectedScope.icon || ''} ${selectedScope.name}`.trim()
    displayIcon = <Layers className="w-4 h-4 text-blue-400" />
  } else if (selectedIndependentAgent) {
    displayLabel = selectedIndependentAgent.displayName
    displayIcon = <Bot className="w-4 h-4 text-green-400" />
  }

  const lowerSearch = search.toLowerCase()
  const filteredScopes = scopes.filter(s =>
    s.name.toLowerCase().includes(lowerSearch) ||
    (s.description || '').toLowerCase().includes(lowerSearch)
  )
  const filteredAgents = independentAgents.filter(a =>
    a.displayName.toLowerCase().includes(lowerSearch) ||
    (a.role || '').toLowerCase().includes(lowerSearch) ||
    a.name.toLowerCase().includes(lowerSearch)
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm">
        <span className="text-gray-400">{t('chat.loading')}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-sm min-w-[200px]"
      >
        {displayIcon}
        <span className="text-white font-medium truncate max-w-[200px]">{displayLabel}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ml-auto ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-700">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('chat.searchScopesAgents')}
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* Business Scopes */}
            {filteredScopes.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider">
                  {t('chat.businessScopes')}
                </div>
                {filteredScopes.map(scope => (
                  <button
                    key={scope.id}
                    onClick={() => { onSelectScope(scope.id); setIsOpen(false); setSearch('') }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors ${
                      scope.id === selectedScopeId ? 'bg-blue-600/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ backgroundColor: scope.color || '#4B5563' }}
                      >
                        {scope.icon || scope.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${scope.id === selectedScopeId ? 'text-blue-400' : 'text-white'}`}>
                          {scope.name}
                        </div>
                        {scope.description && (
                          <div className="text-xs text-gray-400 truncate">{scope.description}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Independent Agents */}
            {filteredAgents.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider border-t border-gray-700">
                  {t('chat.independentAgents')}
                </div>
                {filteredAgents.map(agent => {
                  const avatarUrl = getAvatarDisplayUrl(agent.avatar)
                  const fallbackChar = getAvatarFallback(agent.displayName, agent.avatar)
                  const showImage = shouldShowAvatarImage(agent.avatar)
                  return (
                    <button
                      key={agent.id}
                      onClick={() => { onSelectIndependentAgent(agent.id); setIsOpen(false); setSearch('') }}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors ${
                        agent.id === selectedAgentId && !selectedScopeId ? 'bg-blue-600/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium overflow-hidden flex-shrink-0 ${
                          agent.status === 'active' ? 'bg-green-600' : 'bg-gray-600'
                        }`}>
                          {showImage && avatarUrl ? (
                            <img src={avatarUrl} alt={agent.displayName} className="w-full h-full object-cover" />
                          ) : (
                            fallbackChar
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${
                            agent.id === selectedAgentId && !selectedScopeId ? 'text-blue-400' : 'text-white'
                          }`}>
                            {agent.displayName}
                          </div>
                          <div className="text-xs text-gray-400 truncate">{agent.role}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </>
            )}

            {filteredScopes.length === 0 && filteredAgents.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">{t('chat.noResultsFound')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Business Scope Selector (kept for backward compat, no longer used in header)
// ============================================================================

interface BusinessScopeSelectorProps {
  selectedScopeId: string | null
  onScopeChange: (scopeId: string) => void
}

function BusinessScopeSelector({ selectedScopeId, onScopeChange }: BusinessScopeSelectorProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [scopes, setScopes] = useState<BusinessScope[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadScopes() {
      try {
        const scopeList = await BusinessScopeService.getBusinessScopes()
        setScopes(scopeList)
        if (scopeList.length > 0) {
          // If no scope selected, or the stored scope no longer exists, pick a default
          const storedScopeExists = selectedScopeId && scopeList.some(s => s.id === selectedScopeId)
          if (!storedScopeExists) {
            const defaultScope = scopeList.find(s => s.isDefault) || scopeList[0]
            onScopeChange(defaultScope.id)
          }
        }
      } catch (err) {
        console.error('Failed to load business scopes:', err)
      } finally {
        setIsLoading(false)
      }
    }
    void loadScopes()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedScope = scopes.find(s => s.id === selectedScopeId)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (scopeId: string) => {
    onScopeChange(scopeId)
    setIsOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm">
        <span className="text-gray-400">{t('chat.loadingScopesEllipsis')}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg 
                   hover:border-gray-600 transition-colors text-sm"
      >
        <Layers className="w-4 h-4 text-gray-400" />
        <span className="text-gray-400">Scope:</span>
        <span className="text-white font-medium">
          {selectedScope ? `${selectedScope.icon || ''} ${selectedScope.name}`.trim() : t('chat.selectScopeLabel')}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden max-h-80 overflow-y-auto">
          {scopes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">{t('chat.noScopesAvailableMsg')}</div>
          ) : (
            scopes.map((scope) => (
              <button
                key={scope.id}
                onClick={() => handleSelect(scope.id)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors
                  ${scope.id === selectedScopeId ? 'bg-blue-600/20' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                    style={{ backgroundColor: scope.color || '#4B5563' }}
                  >
                    {scope.icon || scope.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate
                      ${scope.id === selectedScopeId ? 'text-blue-400' : 'text-white'}`}>
                      {scope.name}
                    </div>
                    {scope.description && (
                      <div className="text-xs text-gray-400 truncate">{scope.description}</div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Agent Selector (optional — filters by selected scope)
// ============================================================================

interface AgentSelectorProps {
  selectedAgentId: string | null
  selectedScopeId: string | null
  onAgentChange: (agentId: string | null) => void
}

function AgentSelector({ selectedAgentId, selectedScopeId, onAgentChange }: AgentSelectorProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [scopeAgents, setScopeAgents] = useState<Agent[]>([])
  const [independentAgents, setIndependentAgents] = useState<Agent[]>([])
  const [isLoadingAgents, setIsLoadingAgents] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadAgents() {
      setIsLoadingAgents(true)
      try {
        const allAgents = await AgentService.getAgents()
        // Scope agents: those belonging to the selected scope
        if (selectedScopeId) {
          const scoped = AgentService.getAgentsByBusinessScope
            ? await AgentService.getAgentsByBusinessScope(selectedScopeId)
            : allAgents.filter(a => a.businessScopeId === selectedScopeId)
          setScopeAgents(scoped)
        } else {
          setScopeAgents([])
        }
        // Independent agents: those without a scope
        setIndependentAgents(allAgents.filter(a => !a.businessScopeId))
      } catch (err) {
        console.error('Failed to load agents:', err)
        setScopeAgents([])
        setIndependentAgents([])
      } finally {
        setIsLoadingAgents(false)
      }
    }
    void loadAgents()
  }, [selectedScopeId])

  const allAgents = [...scopeAgents, ...independentAgents]

  useEffect(() => {
    if (selectedAgentId && allAgents.length > 0 && !allAgents.find(a => a.id === selectedAgentId)) {
      onAgentChange(null)
    }
  }, [allAgents, selectedAgentId, onAgentChange])

  const selectedAgent = allAgents.find(a => a.id === selectedAgentId)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (agentId: string | null) => {
    onAgentChange(agentId)
    setIsOpen(false)
  }

  if (isLoadingAgents) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm">
        <span className="text-gray-400">{t('chat.loadingAgents')}</span>
      </div>
    )
  }
  if (allAgents.length === 0) return null

  const renderAgentItem = (agent: Agent) => {
    const avatarUrl = getAvatarDisplayUrl(agent.avatar)
    const fallbackChar = getAvatarFallback(agent.displayName, agent.avatar)
    const showImage = shouldShowAvatarImage(agent.avatar)
    return (
      <button
        key={agent.id}
        onClick={() => handleSelect(agent.id)}
        className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors
          ${agent.id === selectedAgentId ? 'bg-blue-600/20' : ''}`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium overflow-hidden
            ${agent.status === 'active' ? 'bg-green-600' : 
              agent.status === 'busy' ? 'bg-yellow-600' : 'bg-gray-600'}`}>
            {showImage && avatarUrl ? (
              <img src={avatarUrl} alt={agent.displayName} className="w-full h-full object-cover" />
            ) : (
              fallbackChar
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium truncate
              ${agent.id === selectedAgentId ? 'text-blue-400' : 'text-white'}`}>
              {agent.displayName}
            </div>
            <div className="text-xs text-gray-400 truncate">{agent.role}</div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg 
                   hover:border-gray-600 transition-colors text-sm"
      >
        <Bot className="w-4 h-4 text-gray-400" />
        <span className="text-gray-400">Agent:</span>
        <span className="text-white font-medium">
          {selectedAgent?.displayName || (selectedScopeId ? t('chat.autoAllAgents') : t('chat.selectAgent'))}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden max-h-96 overflow-y-auto">
          {/* Auto option (only when scope is selected) */}
          {selectedScopeId && (
            <button
              onClick={() => handleSelect(null)}
              className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors
                ${!selectedAgentId ? 'bg-blue-600/20' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-600">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${!selectedAgentId ? 'text-blue-400' : 'text-white'}`}>
                    {t('chat.autoAllAgents')}
                  </div>
                  <div className="text-xs text-gray-400">{t('chat.autoAllAgentsHint')}</div>
                </div>
              </div>
            </button>
          )}

          {/* Scope agents */}
          {scopeAgents.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider border-t border-gray-700">
                {t('chat.scopeAgents')}
              </div>
              {scopeAgents.map(renderAgentItem)}
            </>
          )}

          {/* Independent agents */}
          {independentAgents.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider border-t border-gray-700">
                {t('chat.independentAgents')}
              </div>
              {independentAgents.map(renderAgentItem)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Message Input
// ============================================================================

// ============================================================================
// Upload Modal
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadModal({ open, onClose, onConfirm }: {
  open: boolean
  onClose: () => void
  onConfirm: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([])

  const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

  // Reset files when modal opens
  useEffect(() => { if (open) { setFiles([]); setRejectedFiles([]) } }, [open])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles)
    const accepted: File[] = []
    const rejected: string[] = []
    for (const f of arr) {
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(`${f.name} (${formatFileSize(f.size)})`)
      } else {
        accepted.push(f)
      }
    }
    if (rejected.length > 0) {
      setRejectedFiles(rejected)
    }
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      const unique = accepted.filter(f => !existing.has(f.name + f.size))
      return [...prev, ...unique]
    })
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-400" />
            {t('chat.uploadToWorkspaceTitle')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drop zone */}
        <div className="p-5">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = '' } }}
            />
            <Paperclip className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {t('chat.dragDropFiles')} <span className="text-blue-400">{t('chat.clickToBrowse')}</span>
            </p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-1 max-h-48 overflow-y-auto">
              {files.map((file, i) => (
                <div key={file.name + i} className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-300 truncate">{file.name}</span>
                    <span className="text-xs text-gray-600 flex-shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 ml-2">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Rejected files warning */}
          {rejectedFiles.length > 0 && (
            <div className="mt-3 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg">
              <p className="text-xs text-red-400 font-medium mb-1">{t('chat.fileTooLarge')}</p>
              {rejectedFiles.map((name, i) => (
                <p key={i} className="text-xs text-red-400/70 truncate">{name}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
            {t('chat.cancel')}
          </button>
          <button
            onClick={() => { onConfirm(files); onClose() }}
            disabled={files.length === 0}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('chat.upload')} {files.length > 0 ? `(${files.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Message Input
// ============================================================================

interface MessageInputProps {
  onSend: (message: string, mentionAgentId?: string) => void
  onStop: () => void
  onUpload: (files: File[]) => void
  sessionId: string | null
  businessScopeId: string | null
  disabled?: boolean
  isSending?: boolean
  selectedModel: string | null
  onModelChange: (model: string | null) => void
  scopeDefaultModel?: string | null
}

/** Flatten a FileNode tree into a list of file paths. */
function flattenFiles(nodes: FileNode[], prefix = ''): string[] {
  const result: string[] = []
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name
    if (n.type === 'file') result.push(p)
    if (n.children) result.push(...flattenFiles(n.children, p))
  }
  return result
}

function MessageInput({ onSend, onStop, onUpload, sessionId, businessScopeId, disabled = false, isSending = false, selectedModel, onModelChange, scopeDefaultModel }: MessageInputProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Model selector state
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; litellm_model: string; provider: string }>>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)

  // File autocomplete state
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [acVisible, setAcVisible] = useState(false)
  const [acQuery, setAcQuery] = useState('')
  const [acIndex, setAcIndex] = useState(0)
  const [atStart, setAtStart] = useState(-1) // cursor position of the '@'
  const acRef = useRef<HTMLDivElement>(null)

  // Agent @mention state
  const [mentionVisible, setMentionVisible] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionAtStart, setMentionAtStart] = useState(-1)
  const [mentionedAgent, setMentionedAgent] = useState<MentionAgent | null>(null)
  const mentionPopupRef = useRef<AgentMentionPopupHandle>(null)

  // Fetch workspace files when sessionId changes
  useEffect(() => {
    if (!sessionId) { setAllFiles([]); return }
    restClient.get<{ files: FileNode[] }>(`/api/chat/sessions/${sessionId}/workspace`)
      .then(res => setAllFiles(flattenFiles(res.files)))
      .catch(() => setAllFiles([]))
  }, [sessionId])

  // Fetch available models from LiteLLM
  useEffect(() => {
    if (!showModelPicker || availableModels.length > 0) return
    setModelsLoading(true)
    restClient.get<{ data: Array<{ id: string; litellm_model: string; provider: string }> }>('/api/litellm/models')
      .then(res => setAvailableModels(res.data || []))
      .catch(() => setAvailableModels([]))
      .finally(() => setModelsLoading(false))
  }, [showModelPicker, availableModels.length])

  // Close model picker on click outside
  useEffect(() => {
    if (!showModelPicker) return
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelPicker])

  const filtered = acVisible
    ? allFiles.filter(f => f.toLowerCase().includes(acQuery.toLowerCase())).slice(0, 12)
    : []

  const dismissAc = useCallback(() => {
    setAcVisible(false)
    setAcQuery('')
    setAtStart(-1)
    setAcIndex(0)
  }, [])

  const dismissMention = useCallback(() => {
    setMentionVisible(false)
    setMentionQuery('')
    setMentionAtStart(-1)
  }, [])

  const selectFile = useCallback((filePath: string) => {
    // Replace @query with @filePath
    const before = input.slice(0, atStart)
    const afterCursor = input.slice(atStart).replace(/^@\S*/, '')
    const newInput = `${before}@${filePath}${afterCursor ? afterCursor : ' '}`
    setInput(newInput)
    dismissAc()
    // Refocus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const pos = before.length + 1 + filePath.length + 1
        inputRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }, [input, atStart, dismissAc])

  const selectMentionAgent = useCallback((agent: MentionAgent) => {
    // Replace the @query text with @DisplayName and store the agent
    const before = input.slice(0, mentionAtStart)
    const cursor = inputRef.current?.selectionStart ?? input.length
    const after = input.slice(cursor)
    const newInput = `${before}@${agent.displayName} ${after}`
    setInput(newInput)
    setMentionedAgent(agent)
    dismissMention()
    // Refocus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const pos = before.length + 1 + agent.displayName.length + 1
        inputRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }, [input, mentionAtStart, dismissMention])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    const cursor = e.target.selectionStart ?? val.length
    // Walk backwards from cursor to find '@'
    let foundAt = -1
    for (let i = cursor - 1; i >= 0; i--) {
      if (val[i] === ' ' || val[i] === '\n') break
      if (val[i] === '@') { foundAt = i; break }
    }

    if (foundAt >= 0) {
      const query = val.slice(foundAt + 1, cursor)
      // Determine if this is a file @ or agent @mention
      // Agent @mention: triggered when @ is at position 0 or preceded by space/newline,
      // and we have a business scope selected. File @ takes priority if workspace has files.
      const isStartOfToken = foundAt === 0 || val[foundAt - 1] === ' ' || val[foundAt - 1] === '\n'

      if (isStartOfToken && businessScopeId) {
        // Show agent mention popup
        setMentionAtStart(foundAt)
        setMentionQuery(query)
        setMentionVisible(true)
        // Hide file autocomplete
        dismissAc()
      } else if (allFiles.length > 0) {
        // Show file autocomplete
        setAtStart(foundAt)
        setAcQuery(query)
        setAcVisible(true)
        setAcIndex(0)
        dismissMention()
      } else {
        dismissAc()
        dismissMention()
      }
    } else {
      dismissAc()
      dismissMention()
    }

    // If user deletes the @mention text, clear the mentioned agent
    if (mentionedAgent && !val.includes(`@${mentionedAgent.displayName}`)) {
      setMentionedAgent(null)
    }
  }, [allFiles, businessScopeId, mentionedAgent, dismissAc, dismissMention])

  const handleSubmit = useCallback(() => {
    if (input.trim() && !disabled) {
      onSend(input.trim(), mentionedAgent?.id)
      setInput('')
      setMentionedAgent(null)
      dismissAc()
      dismissMention()
    }
  }, [input, disabled, onSend, mentionedAgent, dismissAc, dismissMention])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Agent mention popup keyboard navigation
    if (mentionVisible && mentionPopupRef.current?.hasItems) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        mentionPopupRef.current.moveDown()
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        mentionPopupRef.current.moveUp()
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const agent = mentionPopupRef.current.confirm()
        if (agent) selectMentionAgent(agent)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissMention()
        return
      }
    }

    // File autocomplete keyboard navigation
    if (acVisible && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcIndex(i => (i + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcIndex(i => (i - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectFile(filtered[acIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissAc()
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Scroll active item into view
  useEffect(() => {
    if (acRef.current) {
      const active = acRef.current.children[acIndex] as HTMLElement | undefined
      active?.scrollIntoView({ block: 'nearest' })
    }
  }, [acIndex])

  return (
    <>
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onConfirm={onUpload} />
      <div className="relative flex flex-col border-t border-gray-800 bg-gray-900">
        {/* Mentioned agent pill — shown above the input when an agent is @mentioned */}
        {mentionedAgent && (
          <div className="flex items-center gap-2 px-4 pt-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
              <Bot className="w-3 h-3" />
              @{mentionedAgent.displayName}
              <button
                onClick={() => setMentionedAgent(null)}
                className="hover:text-white ml-0.5 transition-colors"
                title={t('chat.removeMention')}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
            <span className="text-xs text-gray-500">{t('chat.mentionRouteHint')}</span>
          </div>
        )}

        <div className="relative flex items-end gap-2 p-4">
          {/* Agent mention popup */}
          {mentionVisible && businessScopeId && (
            <AgentMentionPopup
              ref={mentionPopupRef}
              scopeId={businessScopeId}
              query={mentionQuery}
              onSelect={selectMentionAgent}
            />
          )}

          {/* File autocomplete dropdown */}
          {acVisible && filtered.length > 0 && (
            <div
              ref={acRef}
              className="absolute bottom-full left-16 right-16 mb-1 max-h-56 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50"
            >
              {filtered.map((f, i) => (
                <button
                  key={f}
                  onMouseDown={(e) => { e.preventDefault(); selectFile(f) }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm transition-colors ${
                    i === acIndex ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <FileIcon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowUpload(true)}
            disabled={isSending}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('chat.uploadToWorkspace')}
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Model selector — hidden for now (session-level model switching not yet supported) */}
          {/* TODO: Re-enable when AgentCore supports per-invocation model override */}

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => { dismissAc(); dismissMention() }, 150)}
            placeholder={businessScopeId ? t('chat.placeholderWithMention') : t('chat.placeholder')}
            disabled={disabled}
            rows={1}
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg resize-none
                       text-white placeholder-gray-500 focus:outline-none focus:border-blue-500
                       disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isSending ? (
            <button
              onClick={onStop}
              className="p-2 bg-red-600 border border-red-600 rounded-lg hover:bg-red-500 hover:border-red-500 transition-colors"
              title={t('chat.stopGeneration')}
            >
              <Square className="w-5 h-5 text-white fill-white" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={disabled || !input.trim()}
              className="p-2 bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-500 hover:border-blue-500 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ============================================================================
// Chat Interface Content
// ============================================================================

function ChatInterfaceContent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const {
    messages,
    quickQuestions,
    quickQuestionsLoading,
    selectedAgentId,
    selectedBusinessScopeId,
    backendSessionId,
    isLoading,
    isSending,
    error,
    sendMessage,
    stopGeneration,
    setSelectedAgent,
    setSelectedBusinessScope,
    clearError,
    loadSession,
    startNewSession,
    clearConversation,
    selectedModel,
    setSelectedModel,
  } = useContext(ChatContext)

  // Fetch scope's default model when scope changes
  const [scopeDefaultModel, setScopeDefaultModel] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedBusinessScopeId) { setScopeDefaultModel(null); return }
    restClient.get<any>(`/api/business-scopes/${selectedBusinessScopeId}`)
      .then(res => {
        const modelId = res?.settings?.modelId as string | undefined
        setScopeDefaultModel(modelId || null)
      })
      .catch(() => setScopeDefaultModel(null))
  }, [selectedBusinessScopeId])

  // Auto-send initial prompt from showcase "Run" button
  const autoPromptSent = useRef(false)
  useEffect(() => {
    if (autoPromptSent.current) return
    const params = new URLSearchParams(window.location.search)
    const prompt = params.get('prompt')
    // Send when: we have a prompt, loading is done, not already sending,
    // and no existing backend session (fresh state from showcase).
    if (prompt && !isLoading && !isSending && !backendSessionId) {
      autoPromptSent.current = true
      // Clean the URL so refreshing doesn't re-send
      const cleanParams = new URLSearchParams(window.location.search)
      cleanParams.delete('prompt')
      cleanParams.delete('showcase_case_id')
      const cleanUrl = cleanParams.toString() ? `${window.location.pathname}?${cleanParams}` : window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
      sendMessage(prompt)
    }
  }, [isLoading, isSending, backendSessionId, sendMessage])

  // Track workspace + session refresh — increment after each completed response
  const [wsRefreshKey, setWsRefreshKey] = useState(0)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)
  const prevSending = useRef(isSending)
  useEffect(() => {
    if (prevSending.current && !isSending) {
      setWsRefreshKey(k => k + 1)
      setSessionRefreshKey(k => k + 1)
    }
    prevSending.current = isSending
  }, [isSending])

  // Also refresh session list when a new backend session is created
  const prevBackendSessionId = useRef(backendSessionId)
  useEffect(() => {
    if (backendSessionId && backendSessionId !== prevBackendSessionId.current) {
      setSessionRefreshKey(k => k + 1)
    }
    prevBackendSessionId.current = backendSessionId
  }, [backendSessionId])

  // Resizable workspace panel
  const [panelWidth, setPanelWidth] = useState(288) // 18rem ≈ 288px

  // Tab state: 'chat' is always present, file tabs are added dynamically
  const [fileTabs, setFileTabs] = useState<FileTab[]>([])
  const [activeTab, setActiveTab] = useState<string>('chat')
  const [showSaveMemory, setShowSaveMemory] = useState(false)
  const [showCreateRoom, setShowCreateRoom] = useState(false)

  const handleFileOpen = useCallback((path: string, name: string) => {
    const preview = isPreviewableFile(name)
    const tabId = preview ? `preview:${path}` : path
    // If tab already open, just activate it
    if (fileTabs.some(t => t.id === tabId)) {
      setActiveTab(tabId)
      return
    }
    setFileTabs(prev => [...prev, {
      id: tabId,
      name,
      path,
      kind: preview ? 'preview' : 'file',
    }])
    setActiveTab(tabId)
  }, [fileTabs])

  const handleCloseTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFileTabs(prev => prev.filter(t => t.id !== tabId))
    // If closing the active tab, switch to chat
    if (activeTab === tabId) setActiveTab('chat')
  }, [activeTab])

  // -----------------------------------------------------------------------
  // Keyboard shortcut to close in-app tabs.
  //
  // Cmd+W and Cmd+Shift+W are native Chrome shortcuts (close tab / close
  // window) that cannot be intercepted by web pages.  We use Alt+W instead,
  // which is free on both macOS and Windows/Linux.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Alt+W — close active in-app tab
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'w') {
        if (fileTabs.length === 0) return
        e.preventDefault()
        if (activeTab !== 'chat') {
          setFileTabs(prev => prev.filter(t => t.id !== activeTab))
          setActiveTab('chat')
        } else {
          setFileTabs(prev => prev.slice(0, -1))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fileTabs, activeTab])

  // Listen for preview_ready events from the SSE stream to open an in-app preview tab
  useEffect(() => {
    const onPreviewReady = (e: Event) => {
      const { url, name, appId } = (e as CustomEvent).detail
      const tabId = `published-preview:${appId}`
      setFileTabs(prev => {
        const existing = prev.find(t => t.id === tabId)
        if (existing) return prev // already open, just activate
        return [...prev, { id: tabId, name: name || 'Preview', path: url, kind: 'published-preview' as const }]
      })
      setActiveTab(tabId)
    }
    window.addEventListener('preview-ready', onPreviewReady)
    return () => window.removeEventListener('preview-ready', onPreviewReady)
  }, [])

  const handleSelectSession = useCallback((sessionId: string) => {
    setFileTabs([])
    setActiveTab('chat')
    loadSession(sessionId)
  }, [loadSession])

  const handleNewSession = useCallback(() => {
    setFileTabs([])
    setActiveTab('chat')
    startNewSession()
    // Bump session list refresh so the sidebar updates
    setSessionRefreshKey(k => k + 1)
  }, [startNewSession])

  const handleSendMessage = useCallback(async (content: string, mentionAgentId?: string) => {
    // Switch to chat tab when sending a message
    setActiveTab('chat')
    await sendMessage(content, mentionAgentId)
  }, [sendMessage])

  const handleUploadFile = useCallback(async (files: File[]) => {
    if (!backendSessionId || files.length === 0) return

    const { success: showSuccess, error: showError } = toastRef.current

    let successCount = 0
    let failCount = 0

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file, file.name)

        const token = (await import('@/services/auth')).getValidToken
          ? await (await import('@/services/auth')).getValidToken()
          : null
        const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

        const response = await fetch(
          `${baseUrl}/api/chat/sessions/${backendSessionId}/workspace/upload-file`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          },
        )

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${response.status}`)
        }

        successCount++
      } catch (err) {
        failCount++
        console.error('Upload failed:', file.name, err)
      }
    }

    if (successCount > 0) {
      showSuccess(`${successCount} file(s) uploaded`)
    }
    if (failCount > 0) {
      showError(`${failCount} file(s) failed to upload`)
    }

    setWsRefreshKey(k => k + 1)
  }, [backendSessionId])

  const handleQuickQuestionClick = useCallback((question: QuickQuestion) => {
    handleSendMessage(question.text)
  }, [handleSendMessage])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">{t('common.loading')}</div>
      </div>
    )
  }

  const noSelection = !selectedBusinessScopeId && !selectedAgentId
  const hasTabs = fileTabs.length > 0

  return (
    <div className="flex h-full">
      {/* Session history panel (left) */}
      <SessionHistoryPanel
        businessScopeId={selectedBusinessScopeId}
        activeSessionId={backendSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        refreshKey={sessionRefreshKey}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with unified selector */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <UnifiedChatSelector
              selectedScopeId={selectedBusinessScopeId}
              selectedAgentId={selectedAgentId}
              onSelectScope={(scopeId) => {
                setSelectedBusinessScope(scopeId)
                setSelectedAgent(null)
              }}
              onSelectIndependentAgent={(agentId) => {
                // Clear scope when selecting an independent agent
                setSelectedBusinessScope('')
                setSelectedAgent(agentId)
              }}
            />
            <button
              onClick={() => setShowCreateRoom(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-colors text-sm text-purple-300"
              title={t('chat.groupChatHint')}
            >
              <Users className="w-4 h-4" />
              <span>{t('chat.groupChat')}</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {backendSessionId && selectedBusinessScopeId && (
              <button
                onClick={() => setShowSaveMemory(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                title={t('chat.saveToMemoryHint')}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>{t('chat.saveToMemory')}</span>
              </button>
            )}
            <button
              onClick={clearConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title={t('chat.clearConversation')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('chat.clear')}</span>
            </button>
          </div>
        </div>

        {/* Tab bar — only shown when file tabs are open */}
        {hasTabs && (
          <div className="flex items-center border-b border-gray-800 bg-gray-900/50 overflow-x-auto">
            {/* Chat tab (always first) */}
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-r border-gray-800 flex-shrink-0 transition-colors ${
                activeTab === 'chat'
                  ? 'bg-gray-800 text-white border-b-2 border-b-blue-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
            {/* File tabs */}
            {fileTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-r border-gray-800 flex-shrink-0 transition-colors group ${
                  activeTab === tab.id
                    ? 'bg-gray-800 text-white border-b-2 border-b-blue-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {tab.kind === 'preview' ? (
                  <Globe className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <FileIcon className="w-3.5 h-3.5 text-blue-400" />
                )}
                <span className="max-w-[120px] truncate">{tab.name}</span>
                <span
                  role="button"
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="ml-1 rounded hover:bg-gray-600 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title={`${t('chat.closeTab')} (⌥W)`}
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mx-4 mt-4 flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400 flex-1">{error}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'chat' ? (
          noSelection ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">
                  {t('chat.startConversation')}
                </h2>
                <p className="text-gray-400 max-w-md">
                  {t('chat.startConversationHint')}
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.length === 0 && !isSending ? (
                <QuickQuestions
                  questions={quickQuestions}
                  onQuestionClick={handleQuickQuestionClick}
                  isLoading={quickQuestionsLoading}
                />
              ) : (
                <MessageList messages={messages} isTyping={isSending} />
              )}
              <WorkspaceActions
                sessionId={backendSessionId}
                refreshKey={wsRefreshKey}
                onSendMessage={handleSendMessage}
              />
              <MessageInput onSend={handleSendMessage} onStop={stopGeneration} onUpload={handleUploadFile} sessionId={backendSessionId} businessScopeId={selectedBusinessScopeId} disabled={isSending} isSending={isSending} selectedModel={selectedModel} onModelChange={setSelectedModel} scopeDefaultModel={scopeDefaultModel} />
            </>
          )
        ) : (
          /* File viewer or app preview tab */
          backendSessionId ? (() => {
            const tab = fileTabs.find(t => t.id === activeTab)
            if (!tab) return null
            if (tab.kind === 'published-preview')
              return <PublishedAppPreviewTab url={tab.path} name={tab.name} />
            return tab.kind === 'preview'
              ? <AppPreviewTab path={tab.path} sessionId={backendSessionId} />
              : <FileViewerTab path={tab.path} sessionId={backendSessionId} />
          })() : null
        )}
      </div>

      {/* Resizable workspace panel */}
      <WorkspaceExplorer
        sessionId={backendSessionId}
        businessScopeId={selectedBusinessScopeId}
        refreshKey={wsRefreshKey}
        isGenerating={isSending}
        onFileOpen={handleFileOpen}
        width={panelWidth}
        onWidthChange={setPanelWidth}
      />

      {/* Save to Memory modal */}
      {showSaveMemory && backendSessionId && selectedBusinessScopeId && (
        <SaveToMemoryModal
          scopeId={selectedBusinessScopeId}
          sessionId={backendSessionId}
          onClose={() => setShowSaveMemory(false)}
        />
      )}

      {/* Create Group Chat Room dialog */}
      {showCreateRoom && (
        <CreateRoomQuickDialog
          selectedScopeId={selectedBusinessScopeId}
          onClose={() => setShowCreateRoom(false)}
          onCreated={(roomId) => {
            setShowCreateRoom(false)
            navigate(`/chat/room/${roomId}`)
          }}
        />
      )}
    </div>
  )
}

export function Chat() {
  // Read URL params so showcase "Run" and other deep-links work
  const params = new URLSearchParams(window.location.search)
  const urlScope = params.get('scope') || undefined
  const urlAgent = params.get('agent') || undefined
  const urlSession = params.get('session') || undefined
  const urlPrompt = params.get('prompt') || undefined

  // If coming from showcase with a prompt, force a fresh session by NOT passing
  // an initialSessionId — and clear the stored session so ChatProvider doesn't
  // restore the old one.
  if (urlPrompt && !urlSession) {
    localStorage.removeItem('super-agent-chat-backend-session')
  }

  return (
    <ChatProvider
      initialSessionId={urlSession}
      initialScopeId={urlScope}
      initialAgentId={urlAgent}
    >
      <div className="h-full">
        <ChatInterfaceContent />
      </div>
    </ChatProvider>
  )
}

// ============================================================================
// Quick Create Room Dialog (inline in Chat page)
// ============================================================================

function CreateRoomQuickDialog({ selectedScopeId, onClose, onCreated }: {
  selectedScopeId: string | null;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const { t } = useTranslation()
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateFromScope = async () => {
    if (!selectedScopeId) return
    setIsCreating(true)
    try {
      const room = await RestChatRoomService.createRoomFromScope(selectedScopeId)
      onCreated(room.id)
    } catch (err) {
      console.error('Failed to create room:', err)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white mb-4">{t('chat.createGroupChatRoom')}</h3>
        <p className="text-sm text-gray-400 mb-6">
          {t('chat.createGroupChatDesc')}
        </p>

        {selectedScopeId ? (
          <button
            onClick={handleCreateFromScope}
            disabled={isCreating}
            className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {isCreating ? t('chat.creating') : t('chat.createFromScope')}
          </button>
        ) : (
          <p className="text-sm text-yellow-400">{t('chat.selectScopeFirst')}</p>
        )}

        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          {t('chat.cancel')}
        </button>
      </div>
    </div>
  )
}
