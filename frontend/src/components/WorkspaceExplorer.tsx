import { useState, useEffect, useCallback, useRef } from 'react'
import { FolderOpen, File, ChevronRight, ChevronDown, RefreshCw, FolderTree, PanelRightClose, PanelRightOpen, Zap, Bot, Rocket, Puzzle, Server } from 'lucide-react'
import { restClient } from '@/services/api/restClient'
import { SkillsPanel } from './SkillsPanel'
import { PluginsPanel } from './PluginsPanel'
import { MCPServersPanel } from './MCPServersPanel'

// Types matching backend WorkspaceFileNode
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileNode[]
}

interface WorkspaceExplorerProps {
  sessionId: string | null
  businessScopeId?: string | null
  refreshKey?: number
  /** Whether the agent is currently generating a response (enables fast polling). */
  isGenerating?: boolean
  onFileOpen?: (path: string, name: string) => void
  width: number
  onWidthChange: (width: number) => void
  minWidth?: number
  maxWidth?: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Check if a node is an agent definition file (.md inside an agents/ dir under a known config folder) */
function isAgentFile(node: FileNode): boolean {
  if (node.type !== 'file') return false
  const parts = node.path.split('/')
  // Match patterns like .claude/agents/foo.md, .agents/foo.md, .kiro/agents/foo.md, etc.
  const agentsIdx = parts.lastIndexOf('agents')
  if (agentsIdx < 0) return false
  const parent = parts[agentsIdx - 1]
  if (!parent || !parent.startsWith('.')) return false
  return node.name.endsWith('.md')
}

/** Check if a node is a skill folder (direct child of a skills/ dir under a known config folder) */
function isSkillFolder(node: FileNode): boolean {
  if (node.type !== 'directory') return false
  const parts = node.path.split('/')
  // The parent segment should be "skills" and its parent should start with "."
  if (parts.length < 3) return false
  const parentName = parts[parts.length - 2]
  const grandparentName = parts[parts.length - 3]
  return parentName === 'skills' && grandparentName?.startsWith('.')
}

/** Check if a directory is an application (contains index.html) */
function isAppFolder(node: FileNode): boolean {
  if (node.type !== 'directory' || !node.children) return false
  return node.children.some(c => c.type === 'file' && c.name === 'index.html')
}

/** Friendly display name: strip .md for agent files */
function displayName(node: FileNode): string {
  if (isAgentFile(node)) return node.name.replace(/\.md$/, '')
  return node.name
}

function FileIcon_({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  const colorMap: Record<string, string> = {
    md: 'text-blue-400',
    json: 'text-yellow-400',
    ts: 'text-blue-300',
    js: 'text-yellow-300',
    yaml: 'text-pink-400',
    yml: 'text-pink-400',
  }
  return <File className={`w-4 h-4 flex-shrink-0 ${colorMap[ext || ''] || 'text-gray-400'}`} />
}

function TreeNode({ node, onFileClick, depth = 0, expandedPaths, onToggle }: {
  node: FileNode
  onFileClick: (path: string, name: string) => void
  depth?: number
  expandedPaths: Set<string>
  onToggle: (path: string) => void
}) {
  // Hide OS metadata files
  if (node.name === '.DS_Store') return null

  if (node.type === 'directory') {
    const expanded = expandedPaths.has(node.path)
    const skill = isSkillFolder(node)
    const app = isAppFolder(node)
    return (
      <div>
        <button
          onClick={() => onToggle(node.path)}
          className="flex items-center gap-1 w-full px-2 py-1 hover:bg-gray-800 rounded text-left group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
          )}
          {app ? (
            <Rocket className="w-4 h-4 text-green-400 flex-shrink-0" />
          ) : skill ? (
            <Zap className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          ) : (
            <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          )}
          <span className="text-sm text-gray-300 truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <TreeNode key={child.path} node={child} onFileClick={onFileClick} depth={depth + 1} expandedPaths={expandedPaths} onToggle={onToggle} />
        ))}
      </div>
    )
  }

  const agent = isAgentFile(node)
  return (
    <button
      onClick={() => onFileClick(node.path, node.name)}
      className="flex items-center gap-1 w-full px-2 py-1 hover:bg-gray-800 rounded text-left group"
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {agent ? (
        <Bot className="w-4 h-4 text-purple-400 flex-shrink-0" />
      ) : (
        <FileIcon_ name={node.name} />
      )}
      <span className="text-sm text-gray-400 group-hover:text-gray-200 truncate">{displayName(node)}</span>
      {node.size !== undefined && (
        <span className="text-xs text-gray-600 ml-auto flex-shrink-0">{formatSize(node.size)}</span>
      )}
    </button>
  )
}

function DragHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = lastX.current - ev.clientX
      lastX.current = ev.clientX
      onDrag(delta)
    }
    const onMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [onDrag])

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500/70 transition-colors flex-shrink-0"
    />
  )
}

export function WorkspaceExplorer({
  sessionId, businessScopeId, refreshKey, isGenerating = false, onFileOpen, width, onWidthChange, minWidth = 200, maxWidth = 600,
}: WorkspaceExplorerProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [skillsPanelOpen, setSkillsPanelOpen] = useState(false)
  const [pluginsPanelOpen, setPluginsPanelOpen] = useState(false)
  const [mcpPanelOpen, setMcpPanelOpen] = useState(false)
  const initializedRef = useRef(false)

  const togglePath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  // Collect default expanded paths (depth < 2) for initial load only
  const collectDefaults = useCallback((nodes: FileNode[], depth = 0): string[] => {
    const paths: string[] = []
    for (const n of nodes) {
      if (n.type === 'directory' && depth < 2) {
        paths.push(n.path)
        if (n.children) paths.push(...collectDefaults(n.children, depth + 1))
      }
    }
    return paths
  }, [])

  // Track consecutive errors to implement backoff / stop polling on persistent failures
  const pollErrorCount = useRef(0)

  const loadFiles = useCallback(async (silent = false) => {
    if (!sessionId) return
    if (!silent) setLoading(true)
    try {
      const res = await restClient.get<{ files: FileNode[]; workspacePath: string | null }>(
        `/api/chat/sessions/${sessionId}/workspace`
      )
      setFiles(res.files)
      setWorkspacePath(res.workspacePath)
      pollErrorCount.current = 0 // reset on success
      // Auto-expand top 2 levels on first load only
      if (!initializedRef.current && res.files.length > 0) {
        setExpandedPaths(new Set(collectDefaults(res.files)))
        initializedRef.current = true
      }
    } catch {
      pollErrorCount.current++
      if (!silent) setFiles([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [sessionId, collectDefaults])

  useEffect(() => { void loadFiles() }, [loadFiles])

  // Poll for workspace changes while a session is active.
  // Fast (5s) during generation, slow (30s) when idle.
  // Stop polling after 5 consecutive errors to avoid hammering a dead backend.
  useEffect(() => {
    if (!sessionId) return
    const interval = isGenerating ? 5000 : 30000
    const id = setInterval(() => {
      if (pollErrorCount.current >= 5) return // back off on persistent errors
      void loadFiles(true)
    }, interval)
    return () => clearInterval(id)
  }, [sessionId, loadFiles, isGenerating])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) void loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const handleDrag = useCallback((delta: number) => {
    onWidthChange(Math.min(maxWidth, Math.max(minWidth, width + delta)))
  }, [width, onWidthChange, minWidth, maxWidth])

  const handleFileClick = useCallback((path: string, name: string) => {
    onFileOpen?.(path, name)
  }, [onFileOpen])

  // Collapsed state — thin strip with expand button
  if (collapsed) {
    return (
      <div className="flex h-full">
        <div className="flex flex-col items-center py-3 px-1 border-l border-gray-800 bg-gray-900/50 gap-1">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title="Expand workspace"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSkillsPanelOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-yellow-400 transition-colors"
            title="Skills"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPluginsPanelOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-violet-400 transition-colors"
            title="Plugins"
          >
            <Puzzle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMcpPanelOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors"
            title="MCP Servers"
          >
            <Server className="w-4 h-4" />
          </button>
        </div>
        <SkillsPanel open={skillsPanelOpen} onClose={() => setSkillsPanelOpen(false)} sessionId={sessionId} />
        <PluginsPanel open={pluginsPanelOpen} onClose={() => setPluginsPanelOpen(false)} businessScopeId={businessScopeId ?? null} />
        <MCPServersPanel open={mcpPanelOpen} onClose={() => setMcpPanelOpen(false)} sessionId={sessionId} />
      </div>
    )
  }

  // No session — show placeholder
  if (!sessionId) {
    return (
      <div className="flex h-full">
        <DragHandle onDrag={handleDrag} />
        <div style={{ width }} className="bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Workspace</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Collapse panel"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-4">
              <FolderTree className="w-10 h-10 text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Send a message to create a workspace</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Expanded state
  return (
    <div className="flex h-full">
      <DragHandle onDrag={handleDrag} />
      <div style={{ width }} className="bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Workspace</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => loadFiles()}
              disabled={loading}
              className="text-gray-500 hover:text-gray-300 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setSkillsPanelOpen(true)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-yellow-400 transition-colors"
              title="Skills"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPluginsPanelOpen(true)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-violet-400 transition-colors"
              title="Plugins"
            >
              <Puzzle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setMcpPanelOpen(true)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors"
              title="MCP Servers"
            >
              <Server className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Collapse panel"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Workspace path — hidden */}

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-500">Loading workspace...</div>
          ) : files.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-gray-500">Workspace is empty</p>
              <p className="text-xs text-gray-600 mt-1">Files will appear after the first message</p>
            </div>
          ) : (
            files.map((node) => (
              <TreeNode key={node.path} node={node} onFileClick={handleFileClick} expandedPaths={expandedPaths} onToggle={togglePath} />
            ))
          )}
        </div>
      </div>
      <SkillsPanel open={skillsPanelOpen} onClose={() => setSkillsPanelOpen(false)} sessionId={sessionId} />
      <PluginsPanel open={pluginsPanelOpen} onClose={() => setPluginsPanelOpen(false)} businessScopeId={businessScopeId ?? null} />
      <MCPServersPanel open={mcpPanelOpen} onClose={() => setMcpPanelOpen(false)} sessionId={sessionId} />
    </div>
  )
}
