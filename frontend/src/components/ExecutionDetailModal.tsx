/**
 * Execution Detail Modal
 *
 * Shows full execution log with node-by-node status, outputs, errors,
 * execution logs timeline, and workspace file browser.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle,
  ChevronDown, ChevronRight, FileText, FolderOpen, ScrollText,
  LayoutList, File, Folder,
} from 'lucide-react';
import { getAuthToken } from '@/services/api/restClient';
import { useTranslation } from '@/i18n';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// ============================================================================
// Types
// ============================================================================

interface NodeExecution {
  id: string;
  node_id: string;
  node_type: string;
  node_data: { title?: string; prompt?: string } | null;
  status: string;
  progress: number;
  output_data: Record<string, unknown> | string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface ExecutionDetail {
  id: string;
  workflow_id: string;
  status: string;
  title: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  variables: Array<{ name?: string; value?: string }>;
  canvas_data: { nodes?: Array<{ id: string }> };
  node_executions: NodeExecution[];
}

interface LogEntry {
  type: string;
  content?: string;
  taskId?: string;
  taskTitle?: string;
  message?: string;
  timestamp: string;
}

interface WorkspaceFileNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  children?: WorkspaceFileNode[];
}

interface Props {
  executionId: string;
  onClose: () => void;
}

type TabId = 'nodes' | 'logs' | 'workspace';

// ============================================================================
// Shared UI Components
// ============================================================================

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'finish':
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400" />;
    case 'executing':
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    default:
      return <Clock className="w-4 h-4 text-gray-500" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    finish: 'bg-green-500/20 text-green-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    executing: 'bg-blue-500/20 text-blue-400',
    running: 'bg-blue-500/20 text-blue-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    init: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || colors.init}`}>
      {status}
    </span>
  );
}

// ============================================================================
// Tab: Nodes
// ============================================================================

function NodeRow({ node }: { node: NodeExecution }) {
  const [expanded, setExpanded] = useState(node.status === 'failed');
  const { t } = useTranslation();
  const title = node.node_data?.title || node.node_id;
  const hasDetails = node.output_data || node.error_message;

  return (
    <div className="border border-gray-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          hasDetails ? 'hover:bg-gray-800/50 cursor-pointer' : 'cursor-default'
        }`}
      >
        <StatusIcon status={node.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium truncate">{title}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">[{node.node_type}]</span>
          </div>
          {node.started_at && (
            <div className="text-xs text-gray-500 mt-0.5">
              {new Date(node.started_at).toLocaleTimeString()}
              {node.completed_at && ` - ${new Date(node.completed_at).toLocaleTimeString()}`}
            </div>
          )}
        </div>
        <StatusBadge status={node.status} />
        {hasDetails && (
          expanded
            ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-4 pb-3 space-y-2 border-t border-gray-700/50">
          {node.error_message && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-medium text-red-400">Error</span>
              </div>
              <pre className="text-xs text-red-300 whitespace-pre-wrap break-words font-mono">
                {node.error_message}
              </pre>
            </div>
          )}
          {node.output_data && (
            <div className="mt-2 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
              <div className="text-xs font-medium text-gray-400 mb-1">{t('execution.output')}</div>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                {typeof node.output_data === 'string'
                  ? node.output_data
                  : JSON.stringify(node.output_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodesTab({ detail }: { detail: ExecutionDetail }) {
  const { t } = useTranslation();

  const completedCount = detail.node_executions.filter(
    n => n.status === 'finish' || n.status === 'completed'
  ).length;
  const failedCount = detail.node_executions.filter(n => n.status === 'failed').length;
  const totalCount = detail.node_executions.length;

  const sortedNodes = (() => {
    const planNodeIds = (detail.canvas_data?.nodes || []).map((n: { id: string }) => n.id);
    if (planNodeIds.length === 0) return detail.node_executions;
    const orderMap = new Map(planNodeIds.map((id: string, i: number) => [id, i]));
    return [...detail.node_executions].sort((a, b) => {
      const aIdx = orderMap.get(a.node_id) ?? 999;
      const bIdx = orderMap.get(b.node_id) ?? 999;
      return aIdx - bIdx;
    });
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-green-400">{t('execution.completed').replace('{n}', String(completedCount))}</span>
        {failedCount > 0 && <span className="text-red-400">{t('execution.failed').replace('{n}', String(failedCount))}</span>}
        <span className="text-gray-500">{t('execution.totalNodes').replace('{n}', String(totalCount))}</span>
      </div>

      {detail.error_message && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">{t('execution.error')}</span>
          </div>
          <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">{detail.error_message}</pre>
        </div>
      )}

      {detail.variables && detail.variables.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('execution.inputVariables')}</h3>
          <div className="flex flex-wrap gap-2">
            {detail.variables.map((v, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300">
                {v.name}: {v.value || '(empty)'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('execution.nodeLog')}</h3>
        <div className="space-y-2">
          {sortedNodes.map((node) => (
            <NodeRow key={node.id} node={node} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Logs
// ============================================================================

function LogsTab({ executionId }: { executionId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    fetch(`${API_BASE_URL}/api/executions/${executionId}/logs`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load logs: ${res.status}`);
        return res.json();
      })
      .then((data) => { setLogs(data.logs ?? []); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [executionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-400">Loading logs...</span>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>;
  }

  if (logs.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">No execution logs available</p>;
  }

  const logTypeColors: Record<string, string> = {
    step_start: 'text-blue-400',
    step_complete: 'text-green-400',
    step_failed: 'text-red-400',
    error: 'text-red-400',
    log: 'text-gray-400',
    done: 'text-green-400',
  };

  const logTypeIcons: Record<string, string> = {
    step_start: '▶',
    step_complete: '✓',
    step_failed: '✗',
    error: '⚠',
    log: '·',
    done: '●',
  };

  return (
    <div className="space-y-1 font-mono text-xs">
      {logs.map((entry, i) => (
        <div key={i} className="flex gap-2 py-1 px-2 hover:bg-gray-800/50 rounded">
          <span className="text-gray-600 flex-shrink-0 w-20">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
          <span className={`flex-shrink-0 w-4 text-center ${logTypeColors[entry.type] || 'text-gray-500'}`}>
            {logTypeIcons[entry.type] || '·'}
          </span>
          <span className={logTypeColors[entry.type] || 'text-gray-400'}>
            {entry.type === 'step_start' && (
              <span>Started: <span className="text-white">{entry.taskTitle || entry.taskId}</span></span>
            )}
            {entry.type === 'step_complete' && (
              <span>Completed: <span className="text-white">{entry.taskTitle || entry.taskId}</span></span>
            )}
            {entry.type === 'step_failed' && (
              <span>Failed: <span className="text-white">{entry.taskTitle || entry.taskId}</span>{entry.message && ` — ${entry.message}`}</span>
            )}
            {entry.type === 'error' && (
              <span>{entry.content || entry.message || 'Unknown error'}</span>
            )}
            {entry.type === 'log' && (
              <span className="text-gray-400 whitespace-pre-wrap break-words">{entry.content?.slice(0, 500)}</span>
            )}
            {entry.type === 'done' && <span>Execution completed</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Tab: Workspace
// ============================================================================

function FileTreeNode({ node, depth, onSelect }: {
  node: WorkspaceFileNode;
  depth: number;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === 'directory';
  const indent = depth * 16;

  // Skip hidden config directories at root level
  if (depth === 0 && node.name.startsWith('.')) return null;

  return (
    <>
      <button
        className="w-full flex items-center gap-2 py-1 px-2 hover:bg-gray-800/50 rounded text-left text-xs"
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else onSelect(node.name);
        }}
      >
        {isDir ? (
          expanded ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
        ) : (
          <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        )}
        <span className={isDir ? 'text-yellow-200' : 'text-gray-300'}>{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span className="text-gray-600 ml-auto flex-shrink-0">
            {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}KB`}
          </span>
        )}
      </button>
      {isDir && expanded && node.children?.map((child, i) => (
        <FileTreeNode
          key={`${child.name}-${i}`}
          node={child}
          depth={depth + 1}
          onSelect={(childPath) => onSelect(`${node.name}/${childPath}`)}
        />
      ))}
    </>
  );
}

function WorkspaceTab({ executionId }: { executionId: string }) {
  const [files, setFiles] = useState<WorkspaceFileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    fetch(`${API_BASE_URL}/api/executions/${executionId}/workspace/files`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load workspace: ${res.status}`);
        return res.json();
      })
      .then((data) => { setFiles(data.files ?? []); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [executionId]);

  const handleSelectFile = useCallback(async (path: string) => {
    setSelectedFile(path);
    setFileLoading(true);
    setFileContent(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/api/executions/${executionId}/workspace/files/${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to load file: ${res.status}`);
      const data = await res.json();
      setFileContent(data.content);
    } catch (err) {
      setFileContent(`Error: ${err instanceof Error ? err.message : 'Failed to load file'}`);
    } finally {
      setFileLoading(false);
    }
  }, [executionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-400">Loading workspace...</span>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>;
  }

  if (files.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-8">No workspace files available</p>;
  }

  return (
    <div className="flex gap-3 h-[400px]">
      {/* File tree */}
      <div className="w-56 flex-shrink-0 overflow-y-auto border border-gray-700/50 rounded-lg bg-gray-800/30 py-1">
        {files.map((node, i) => (
          <FileTreeNode
            key={`${node.name}-${i}`}
            node={node}
            depth={0}
            onSelect={handleSelectFile}
          />
        ))}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden border border-gray-700/50 rounded-lg bg-gray-800/30 flex flex-col">
        {selectedFile ? (
          <>
            <div className="px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
              <File className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-300 truncate">{selectedFile}</span>
            </div>
            <div className="flex-1 overflow-auto p-3">
              {fileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                </div>
              ) : (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono">
                  {fileContent}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            Select a file to view its content
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Modal
// ============================================================================

export function ExecutionDetailModal({ executionId, onClose }: Props) {
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('nodes');
  const { t } = useTranslation();

  useEffect(() => {
    const token = getAuthToken();
    fetch(`${API_BASE_URL}/api/executions/${executionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        return res.json();
      })
      .then((data) => { setDetail(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [executionId]);

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'nodes', label: t('execution.nodeLog'), icon: <LayoutList className="w-3.5 h-3.5" /> },
    { id: 'logs', label: t('execution.logs') || 'Logs', icon: <ScrollText className="w-3.5 h-3.5" /> },
    { id: 'workspace', label: t('execution.workspace') || 'Workspace', icon: <FolderOpen className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {detail?.title || t('execution.title')}
            </h2>
            {detail && (
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={detail.status} />
                <span className="text-xs text-gray-400">
                  {new Date(detail.started_at).toLocaleString()}
                </span>
                {detail.completed_at && (
                  <span className="text-xs text-gray-500">
                    {t('execution.duration').replace('{n}', String(Math.round((new Date(detail.completed_at).getTime() - new Date(detail.started_at).getTime()) / 1000)))}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="ml-2 text-sm text-gray-400">{t('execution.loading')}</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {detail && activeTab === 'nodes' && <NodesTab detail={detail} />}
          {activeTab === 'logs' && <LogsTab executionId={executionId} />}
          {activeTab === 'workspace' && <WorkspaceTab executionId={executionId} />}
        </div>
      </div>
    </div>
  );
}
