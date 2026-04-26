/**
 * WorkflowEditor - New workflow editor page using Refly-inspired canvas
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  ChevronDown, 
  Check, 
  Loader2, 
  Upload, 
  Plus, 
  X,
  Play,
  Square,
  Save,
  History,
  Trash2,
  Webhook,
  Calendar,
  Sparkles,
  PanelLeftOpen,
  PanelLeftClose,
  Pencil,
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkflows, useWorkflowExecution } from '@/services';
import { useBusinessScopes } from '@/services/useBusinessScopes';
import { useAgents } from '@/services/useAgents';
import { Canvas } from '@/components/canvas';
import { NodeEditorPanel } from '@/components/canvas/NodeEditorPanel';
import { WorkflowCopilot } from '@/components/WorkflowCopilot';
import type { WorkflowCopilotHandle } from '@/components/WorkflowCopilot';
import { WorkflowImporter } from '@/components/WorkflowImporter';
import { WebhookPanel } from '@/components/WebhookPanel';
import { SchedulePanel } from '@/components/SchedulePanel';
import type { CanvasNode, CanvasEdge, CanvasData, CanvasNodeType } from '@/types/canvas';
import type { NodeExecutionState } from '@/services/useWorkflowExecution';
import type { Workflow as WorkflowType, WorkflowImportResult } from '@/types';
import type { WorkflowVariable } from '@/types/workflow-plan';
import { createCanvasNode } from '@/lib/canvas/nodes';
import { getAuthToken } from '@/services/api/restClient';
import { ExecutionDetailModal } from '@/components/ExecutionDetailModal';
import { BusinessScopeDropdown } from '@/components/BusinessScopeDropdown';
import { RunWorkflowModal } from '@/components/RunWorkflowModal';

// Convert legacy workflow to canvas data
function workflowToCanvasData(workflow: WorkflowType): CanvasData {
  console.log('📥 Loading workflow to canvas:', {
    workflowId: workflow.id,
    workflowName: workflow.name,
    nodesCount: workflow.nodes?.length,
    connectionsCount: workflow.connections?.length,
    nodes: workflow.nodes,
  });
  
  const nodes: CanvasNode[] = (workflow.nodes || []).map((node) => ({
    id: node.id,
    type: mapLegacyNodeType(node.type),
    position: { x: node.position?.x || 0, y: node.position?.y || 0 },
    data: {
      title: node.label,
      entityId: node.id,
      contentPreview: node.description,
      metadata: node.metadata || {
        agentId: node.agentId,
        actionType: node.actionType,
      },
    },
  }));

  const edges: CanvasEdge[] = (workflow.connections || []).map((conn) => ({
    id: conn.id,
    source: conn.from,
    target: conn.to,
    sourceHandle: conn.sourceHandle,
    targetHandle: conn.targetHandle,
    type: 'custom',
    animated: conn.animated,
  }));

  console.log('📥 Converted to canvas data:', { nodes: nodes.length, edges: edges.length });
  return { nodes, edges };
}

// Map legacy node types to new canvas node types
function mapLegacyNodeType(type: string): CanvasNodeType {
  const mapping: Record<string, CanvasNodeType> = {
    trigger: 'start',
    agent: 'agent',
    human: 'humanApproval',
    action: 'action',
    condition: 'condition',
    document: 'document',
    codeArtifact: 'codeArtifact',
    resource: 'resource',
    loop: 'loop',
    parallel: 'parallel',
    start: 'start',
    end: 'end',
  };
  return mapping[type] || 'action';
}

// Convert canvas data back to legacy workflow format
function canvasDataToWorkflow(
  canvasData: CanvasData, 
  _workflow: WorkflowType
): Partial<WorkflowType> {
  const nodes = canvasData.nodes.map((node) => ({
    id: node.id,
    type: mapCanvasNodeTypeToLegacy(node.type as CanvasNodeType) as import('@/types').NodeType,
    label: node.data.title,
    description: node.data.contentPreview || '',
    position: { x: node.position.x, y: node.position.y },
    icon: getIconForNodeType(node.type as CanvasNodeType),
    agentId: (node.data.metadata as any)?.agentId,
    actionType: (node.data.metadata as any)?.actionType,
    metadata: node.data.metadata as Record<string, unknown> | undefined,
  }));

  const connections = canvasData.edges.map((edge) => ({
    id: edge.id,
    from: edge.source,
    to: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: edge.animated,
  }));

  return { nodes, connections };
}

function mapCanvasNodeTypeToLegacy(type: CanvasNodeType): import('@/types').NodeType {
  const mapping: Record<CanvasNodeType, import('@/types').NodeType> = {
    start: 'trigger',
    agent: 'agent',
    humanApproval: 'human',
    action: 'action',
    end: 'end',
    trigger: 'trigger',
    condition: 'condition',
    document: 'document',
    codeArtifact: 'codeArtifact',
    resource: 'resource',
    loop: 'loop',
    parallel: 'parallel',
    group: 'action',
    memo: 'action',
  };
  return mapping[type] || 'action';
}

function getIconForNodeType(type: CanvasNodeType): string {
  const icons: Record<CanvasNodeType, string> = {
    start: 'Play',
    agent: 'Bot',
    humanApproval: 'User',
    action: 'Zap',
    end: 'CheckCircle',
    trigger: 'Play',
    condition: 'GitBranch',
    document: 'FileText',
    codeArtifact: 'Code',
    resource: 'File',
    loop: 'Repeat',
    parallel: 'GitMerge',
    group: 'Square',
    memo: 'StickyNote',
  };
  return icons[type] || 'Zap';
}

export function WorkflowEditor() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { 
    workflows, 
    isLoading: workflowsLoading, 
    error, 
    updateWorkflow, 
    createWorkflow, 
    deleteWorkflow,
    applyNaturalLanguageChanges,
    importFromImage,
  } = useWorkflows();
  const { businessScopes, isLoading: scopesLoading } = useBusinessScopes();
  const { agents } = useAgents();
  const {
    execution,
    isExecuting,
    nodeStates,
    error: executionError,
    execute,
    abort,
    loadHistory,
    history,
  } = useWorkflowExecution();
  
  const [activeScopeId, setActiveScopeId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    searchParams.get('id')
  );
  const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const [showWebhookPanel, setShowWebhookPanel] = useState(false);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [workflowListCollapsed, setWorkflowListCollapsed] = useState(false);

  const [showCopilotPanel, setShowCopilotPanel] = useState(true);
  const [copilotSuccess, setCopilotSuccess] = useState<string | null>(null);

  // Inline rename state
  const [isRenamingHeader, setIsRenamingHeader] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renamingSidebarName, setRenamingSidebarName] = useState<string | null>(null);
  const [sidebarRenameValue, setSidebarRenameValue] = useState('');
  const sidebarRenameInputRef = useRef<HTMLInputElement>(null);
  const [deletingSidebarName, setDeletingSidebarName] = useState<string | null>(null);

  const copilotRef = useRef<WorkflowCopilotHandle>(null);
  const isLoading = workflowsLoading || scopesLoading;

  // Set default active scope when scopes load
  useEffect(() => {
    if (!activeScopeId && businessScopes.length > 0) {
      setActiveScopeId(businessScopes[0].id);
    }
  }, [activeScopeId, businessScopes]);

  // Helper to find scope for a workflow
  const findScopeForWorkflow = useCallback((workflow: WorkflowType) => {
    if (workflow.businessScopeId) {
      const byId = businessScopes.find(s => s.id === workflow.businessScopeId);
      if (byId) return byId;
    }
    
    const category = workflow.category;
    const legacyNameMap: Record<string, string> = {
      'hr': 'Human Resources',
      'deployment': 'Information Technology',
      'marketing': 'Marketing',
      'support': 'Customer Support',
    };
    const scopeName = legacyNameMap[category] || category;
    return businessScopes.find(s => s.name.toLowerCase() === scopeName.toLowerCase());
  }, [businessScopes]);

  // Filter workflows by active scope
  const scopeWorkflows = useMemo(() => {
    if (!activeScopeId) return [];
    return workflows.filter((w: WorkflowType) => {
      const scope = findScopeForWorkflow(w);
      return scope?.id === activeScopeId;
    });
  }, [workflows, activeScopeId, findScopeForWorkflow]);

  // Get unique workflow names in the scope
  const workflowNames = useMemo(() => {
    const names = new Set(scopeWorkflows.map((w: WorkflowType) => w.name));
    return Array.from(names);
  }, [scopeWorkflows]);

  // Get the currently selected workflow
  const selectedWorkflow = useMemo(() => {
    if (selectedWorkflowId) {
      const found = workflows.find((w: WorkflowType) => w.id === selectedWorkflowId);
      if (found) return found;
    }
    return scopeWorkflows[0];
  }, [selectedWorkflowId, workflows, scopeWorkflows]);

  // Canvas state
  const [canvasData, setCanvasData] = useState<CanvasData>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync canvas data when workflow changes - use workflow data directly
  useEffect(() => {
    if (selectedWorkflow) {
      console.log('🔄 Syncing canvas from selectedWorkflow:', {
        id: selectedWorkflow.id,
        nodes: selectedWorkflow.nodes?.length,
        connections: selectedWorkflow.connections?.length,
      });
      const data = workflowToCanvasData(selectedWorkflow);
      console.log('🔄 Setting canvasData:', { nodes: data.nodes.length, edges: data.edges.length });
      setCanvasData(data);
      setIsDirty(false);
      setSelectedNodeId(null);
    }
  }, [selectedWorkflow]);

  // Auto-select first workflow when scope changes
  useEffect(() => {
    if (scopeWorkflows.length > 0 && !selectedWorkflowId) {
      setSelectedWorkflowId(scopeWorkflows[0].id);
    }
  }, [scopeWorkflows, selectedWorkflowId]);

  // Get all versions of the selected workflow
  const workflowVersions = useMemo(() => {
    if (!selectedWorkflow) return [];
    return scopeWorkflows
      .filter((w: WorkflowType) => w.name === selectedWorkflow.name)
      .sort((a: WorkflowType, b: WorkflowType) => b.version.localeCompare(a.version));
  }, [selectedWorkflow, scopeWorkflows]);

  // Get selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return canvasData.nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId, canvasData.nodes]);

  // Handle scope tab change
  const handleScopeChange = useCallback((scopeId: string) => {
    setActiveScopeId(scopeId);
    setSelectedWorkflowId(null);
    setIsVersionDropdownOpen(false);
  }, []);

  // Handle workflow selection from name list
  const handleWorkflowNameSelect = useCallback((name: string) => {
    const workflow = scopeWorkflows.find((w: WorkflowType) => w.name === name && w.isOfficial)
      || scopeWorkflows.find((w: WorkflowType) => w.name === name);
    if (workflow) {
      setSelectedWorkflowId(workflow.id);
    }
  }, [scopeWorkflows]);

  // Handle version selection
  const handleVersionSelect = useCallback((workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    setIsVersionDropdownOpen(false);
  }, []);

  // Handle canvas data change
  const handleCanvasChange = useCallback((data: CanvasData) => {
    setCanvasData(data);
    setIsDirty(true);
  }, []);

  // Handle node selection
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Handle node update from editor panel
  const handleNodeUpdate = useCallback((nodeId: string, updates: Partial<CanvasNode['data']>) => {
    setCanvasData(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === nodeId 
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      ),
    }));
    setIsDirty(true);
  }, []);

  // Handle node delete
  const handleNodeDelete = useCallback((nodeId: string) => {
    setCanvasData(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }));
    setSelectedNodeId(null);
    setIsDirty(true);
  }, []);

  // Handle add node
  const handleAddNode = useCallback((type: CanvasNodeType) => {
    const position = {
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
    };
    const newNode = createCanvasNode(type, position);
    
    setCanvasData(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newNode.id);
    setIsDirty(true);
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!selectedWorkflow || !isDirty) return;
    
    const updates = canvasDataToWorkflow(canvasData, selectedWorkflow);
    console.log('💾 Saving workflow:', {
      workflowId: selectedWorkflow.id,
      canvasNodes: canvasData.nodes.length,
      canvasEdges: canvasData.edges.length,
      convertedNodes: updates.nodes?.length,
      convertedConnections: updates.connections?.length,
      updates,
    });
    await updateWorkflow(selectedWorkflow.id, updates);
    setIsDirty(false);
  }, [selectedWorkflow, canvasData, isDirty, updateWorkflow]);

  // Handle run workflow — stream V2 execution into copilot chat
  const [isRunningV2, setIsRunningV2] = useState(false);
  const [v2NodeStates, setV2NodeStates] = useState<Map<string, NodeExecutionState>>(new Map());
  const [showRunModal, setShowRunModal] = useState(false);
  const v2AbortControllerRef = useRef<AbortController | null>(null);
  
  // Get input variables from start node
  const getStartNodeVariables = useCallback(() => {
    const startNode = canvasData.nodes.find(n => n.type === 'start');
    const meta = startNode?.data?.metadata as { inputVariables?: Array<Record<string, unknown>> } | undefined;
    return (meta?.inputVariables || []) as import('@/types/canvas/metadata').WorkflowVariableDefinition[];
  }, [canvasData]);

  const handleRunClick = useCallback(() => {
    if (!selectedWorkflow || isRunningV2 || !activeScopeId) return;
    const vars = getStartNodeVariables();
    if (vars.length > 0) {
      setShowRunModal(true);
    } else {
      // No variables — run immediately
      executeWorkflow([]);
    }
  }, [selectedWorkflow, isRunningV2, activeScopeId, getStartNodeVariables]);

  const executeWorkflow = useCallback(async (runtimeVariables: import('@/types/canvas/metadata').WorkflowVariableDefinition[]) => {
    if (!selectedWorkflow || isRunningV2 || !activeScopeId) return;
    setShowRunModal(false);
    
    // Open copilot panel and start execution message
    setShowCopilotPanel(true);
    setIsRunningV2(true);
    // Clear previous execution states
    setV2NodeStates(new Map());
    const msgId = copilotRef.current?.startExecution();
    if (!msgId) { setIsRunningV2(false); return; }

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
    const token = getAuthToken();
    const abortController = new AbortController();
    v2AbortControllerRef.current = abortController;
    try {
      const response = await fetch(`${API_BASE_URL}/api/workflows/${selectedWorkflow.id}/execute-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: abortController.signal,
        body: JSON.stringify({
          businessScopeId: activeScopeId,
          variables: runtimeVariables.map(v => ({
            variableId: v.variableId,
            name: v.name,
            value: Array.isArray(v.value) ? v.value.map(val => typeof val === 'string' ? val : (val as { text?: string })?.text || '').join(', ') : '',
            description: v.description,
            required: v.required ?? false,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Execution failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.type === 'heartbeat') continue;
            copilotRef.current?.pushExecutionEvent(msgId, event);

            // Update canvas node execution states
            if (event.type === 'step_start' && event.taskId) {
              setV2NodeStates(prev => {
                const next = new Map(prev);
                next.set(event.taskId, {
                  nodeId: event.taskId,
                  status: 'executing',
                  progress: 0,
                  startedAt: new Date(),
                });
                return next;
              });
            } else if (event.type === 'step_complete' && event.taskId) {
              setV2NodeStates(prev => {
                const next = new Map(prev);
                const current = next.get(event.taskId);
                next.set(event.taskId, {
                  nodeId: event.taskId,
                  status: 'finish',
                  progress: 100,
                  startedAt: current?.startedAt,
                  completedAt: new Date(),
                });
                return next;
              });
            } else if (event.type === 'step_failed' && event.taskId) {
              setV2NodeStates(prev => {
                const next = new Map(prev);
                const current = next.get(event.taskId);
                next.set(event.taskId, {
                  nodeId: event.taskId,
                  status: 'failed',
                  progress: 100,
                  error: event.message,
                  startedAt: current?.startedAt,
                  completedAt: new Date(),
                });
                return next;
              });
            }

            if (event.type === 'done') {
              copilotRef.current?.finishExecution(msgId, true);
            }
          } catch {
            // skip unparseable
          }
        }
      }

      // If we didn't get a 'done' event, finish anyway
      copilotRef.current?.finishExecution(msgId, true);
    } catch (err) {
      // Don't show error for user-initiated abort
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('V2 execution aborted by user');
        copilotRef.current?.finishExecution(msgId, false, 'Execution stopped by user');
      } else {
        console.error('V2 execution error:', err);
        copilotRef.current?.finishExecution(msgId, false, err instanceof Error ? err.message : 'Execution failed');
      }
    } finally {
      v2AbortControllerRef.current = null;
      setIsRunningV2(false);
      // Refresh execution history after run completes
      // Delay slightly to ensure the backend has finished writing the final status
      if (selectedWorkflow?.id) {
        setTimeout(() => loadHistory(selectedWorkflow.id), 1000);
      }
    }
  }, [selectedWorkflow, isRunningV2, activeScopeId]);

  // Handle abort workflow
  const handleAbortWorkflow = useCallback(async () => {
    // Abort the V2 SSE fetch connection
    if (v2AbortControllerRef.current) {
      v2AbortControllerRef.current.abort();
      v2AbortControllerRef.current = null;
    }
    // Also try the V1 abort path (for non-V2 executions)
    await abort();
  }, [abort]);

  // Load execution history when workflow changes
  useEffect(() => {
    if (selectedWorkflow?.id) {
      loadHistory(selectedWorkflow.id);
    }
  }, [selectedWorkflow?.id, loadHistory]);

  // Handle AI Copilot changes
  const handleCopilotApplyChanges = useCallback(async (instruction: string) => {
    if (!selectedWorkflow) return false;

    const result = await applyNaturalLanguageChanges(selectedWorkflow.id, instruction);
    if (result) {
      setCopilotSuccess(t('workflow.copilot.success'));
      setTimeout(() => setCopilotSuccess(null), 3000);
      return true;
    }
    return false;
  }, [selectedWorkflow, applyNaturalLanguageChanges, t]);

  // Handle workflow generation from copilot
  const handleGenerateWorkflow = useCallback(async (newCanvasData: CanvasData, title: string, _variables?: WorkflowVariable[]) => {
    setCanvasData(newCanvasData);
    setCopilotSuccess(`Generated workflow: ${title}`);
    setTimeout(() => setCopilotSuccess(null), 3000);

    // Auto-save: if we have a selected workflow, save immediately.
    // If no workflow exists yet, create one first.
    if (selectedWorkflow) {
      const updates = canvasDataToWorkflow(newCanvasData, selectedWorkflow);
      await updateWorkflow(selectedWorkflow.id, { ...updates, name: title });
      setIsDirty(false);
    } else if (activeScopeId) {
      const workflowData = canvasDataToWorkflow(newCanvasData, {
        name: title,
        category: 'hr',
        version: 'v1.0',
        isOfficial: false,
        nodes: [],
        connections: [],
      } as WorkflowType);
      const created = await createWorkflow({
        name: title,
        category: 'hr',
        businessScopeId: activeScopeId,
        version: 'v1.0',
        isOfficial: false,
        nodes: workflowData.nodes ?? [],
        connections: workflowData.connections ?? [],
        createdBy: 'copilot',
      });
      if (created) {
        setSelectedWorkflowId(created.id);
        setIsDirty(false);
      }
    }
  }, [selectedWorkflow, activeScopeId, updateWorkflow, createWorkflow]);

  // Handle workflow import
  const handleImportFromImage = useCallback(async (file: File): Promise<WorkflowImportResult | null> => {
    return await importFromImage(file);
  }, [importFromImage]);

  const handleAcceptImport = useCallback(async (result: WorkflowImportResult) => {
    const created = await createWorkflow({
      name: result.suggestedWorkflow.name,
      category: result.suggestedWorkflow.category,
      version: result.suggestedWorkflow.version,
      isOfficial: false,
      nodes: result.suggestedWorkflow.nodes,
      connections: result.suggestedWorkflow.connections,
      createdBy: 'import',
    });

    if (created) {
      const scope = findScopeForWorkflow(created);
      if (scope) {
        setActiveScopeId(scope.id);
      }
      setSelectedWorkflowId(created.id);
      setShowImporter(false);
    }
  }, [createWorkflow, findScopeForWorkflow]);

  // Handle create new workflow
  const handleCreateWorkflow = useCallback(async (name: string) => {
    if (!activeScopeId) return;

    const created = await createWorkflow({
      name,
      category: 'hr',
      businessScopeId: activeScopeId,
      version: 'v1.0',
      isOfficial: false,
      nodes: [],
      connections: [],
      createdBy: 'user',
    });

    if (created) {
      setSelectedWorkflowId(created.id);
      setShowCreateModal(false);
    }
  }, [activeScopeId, createWorkflow]);

  // Handle delete workflow
  const handleDeleteWorkflow = useCallback(async () => {
    if (!selectedWorkflow) return;
    
    const success = await deleteWorkflow(selectedWorkflow.id);
    if (success) {
      setSelectedWorkflowId(null);
      setShowDeleteConfirm(false);
      setCanvasData({ nodes: [], edges: [] });
    }
  }, [selectedWorkflow, deleteWorkflow]);

  // Handle rename workflow (header)
  const startHeaderRename = useCallback(() => {
    if (!selectedWorkflow) return;
    setRenameValue(selectedWorkflow.name);
    setIsRenamingHeader(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, [selectedWorkflow]);

  const commitHeaderRename = useCallback(async () => {
    if (!selectedWorkflow || !renameValue.trim() || renameValue.trim() === selectedWorkflow.name) {
      setIsRenamingHeader(false);
      return;
    }
    await updateWorkflow(selectedWorkflow.id, { name: renameValue.trim() });
    setIsRenamingHeader(false);
  }, [selectedWorkflow, renameValue, updateWorkflow]);

  // Handle rename workflow (sidebar)
  const startSidebarRename = useCallback((name: string) => {
    setRenamingSidebarName(name);
    setSidebarRenameValue(name);
    setTimeout(() => sidebarRenameInputRef.current?.select(), 0);
  }, []);

  const commitSidebarRename = useCallback(async () => {
    if (!renamingSidebarName || !sidebarRenameValue.trim() || sidebarRenameValue.trim() === renamingSidebarName) {
      setRenamingSidebarName(null);
      return;
    }
    // Rename all versions with this name in the current scope
    const workflowsToRename = scopeWorkflows.filter((w: WorkflowType) => w.name === renamingSidebarName);
    for (const wf of workflowsToRename) {
      await updateWorkflow(wf.id, { name: sidebarRenameValue.trim() });
    }
    setRenamingSidebarName(null);
  }, [renamingSidebarName, sidebarRenameValue, scopeWorkflows, updateWorkflow]);

  // Handle delete workflow from sidebar (delete all versions with this name)
  const handleSidebarDelete = useCallback(async () => {
    if (!deletingSidebarName) return;
    const workflowsToDelete = scopeWorkflows.filter((w: WorkflowType) => w.name === deletingSidebarName);
    for (const wf of workflowsToDelete) {
      await deleteWorkflow(wf.id);
    }
    // If the currently selected workflow was deleted, clear selection
    if (selectedWorkflow && selectedWorkflow.name === deletingSidebarName) {
      setSelectedWorkflowId(null);
      setCanvasData({ nodes: [], edges: [] });
    }
    setDeletingSidebarName(null);
  }, [deletingSidebarName, scopeWorkflows, deleteWorkflow, selectedWorkflow]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        {/* Business Scope Selector (dropdown) */}
        <BusinessScopeDropdown
          scopes={businessScopes}
          activeScopeId={activeScopeId}
          onScopeChange={handleScopeChange}
          placeholder="Select scope"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Workflow List Sidebar */}
        {workflowListCollapsed ? (
          <div className="flex flex-col items-center py-3 px-1 border-r border-gray-800 bg-gray-900/50">
            <button
              onClick={() => setWorkflowListCollapsed(false)}
              className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Expand workflow list"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-48 border-r border-gray-800 p-4 overflow-y-auto flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400">{t('workflowEditor.workflows')}</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-blue-400 transition-colors"
                  title={t('workflow.create')}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setWorkflowListCollapsed(true)}
                  className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
                  title="Collapse panel"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {workflowNames.length > 0 ? (
                workflowNames.map((name: string) => {
                  const isSelected = selectedWorkflow?.name === name;
                  const isRenaming = renamingSidebarName === name;

                  return (
                    <div
                      key={name}
                      onClick={() => !isRenaming && handleWorkflowNameSelect(name)}
                      className={`
                        w-full text-left px-3 py-2 rounded-md transition-all text-sm group cursor-pointer flex items-center gap-1
                        ${isSelected 
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }
                      `}
                    >
                      {isRenaming ? (
                        <input
                          ref={sidebarRenameInputRef}
                          type="text"
                          value={sidebarRenameValue}
                          onChange={(e) => setSidebarRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={commitSidebarRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitSidebarRename();
                            if (e.key === 'Escape') setRenamingSidebarName(null);
                          }}
                          className="w-full px-1 py-0.5 rounded text-sm text-white bg-gray-900 border border-blue-500 outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className="flex-1 truncate">{name}</span>
                          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startSidebarRename(name);
                              }}
                              className="p-0.5 rounded text-gray-500 hover:text-white transition-colors"
                              title="Rename"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingSidebarName(name);
                              }}
                              className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500 px-3 py-2">
                  {t('workflowEditor.noWorkflows')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedWorkflow ? (
            <>
              {/* Workflow Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {isRenamingHeader ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitHeaderRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitHeaderRename();
                        if (e.key === 'Escape') setIsRenamingHeader(false);
                      }}
                      className="text-lg font-semibold text-white bg-gray-800 border border-blue-500 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <h2
                      className="text-lg font-semibold text-white cursor-pointer hover:text-blue-400 transition-colors group flex items-center gap-1.5"
                      onClick={startHeaderRename}
                      title={t('workflowEditor.clickToRename')}
                    >
                      {selectedWorkflow.name}
                      <Pencil className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h2>
                  )}
                  
                  {/* Version Selector */}
                  <div className="relative">
                    <button
                      onClick={() => setIsVersionDropdownOpen(!isVersionDropdownOpen)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-md text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      <span>{t('workflow.version')}: {selectedWorkflow.version}</span>
                      {selectedWorkflow.isOfficial && (
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                          {t('workflow.official')}
                        </span>
                      )}
                      <ChevronDown className={`w-4 h-4 transition-transform ${isVersionDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isVersionDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-1">
                        {workflowVersions.map((version: WorkflowType) => (
                          <button
                            key={version.id}
                            onClick={() => handleVersionSelect(version.id)}
                            className={`
                              w-full flex items-center justify-between px-3 py-2 text-sm transition-colors
                              ${version.id === selectedWorkflow.id 
                                ? 'bg-blue-600/20 text-blue-400' 
                                : 'text-gray-300 hover:bg-gray-700'
                              }
                            `}
                          >
                            <span className="flex items-center gap-2">
                              {version.version}
                              {version.isOfficial && (
                                <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                                  {t('workflow.official')}
                                </span>
                              )}
                            </span>
                            {version.id === selectedWorkflow.id && (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {isDirty && (
                    <span className="text-xs text-yellow-400">{t('workflowEditor.unsavedChanges')}</span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                      showHistoryPanel 
                        ? 'bg-blue-600/20 text-blue-400' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                    title={t('workflowEditor.executionHistory')}
                  >
                    <History className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setShowWebhookPanel(!showWebhookPanel)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                      showWebhookPanel 
                        ? 'bg-orange-600/20 text-orange-400' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                    title="Webhooks"
                  >
                    <Webhook className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowSchedulePanel(!showSchedulePanel)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                      showSchedulePanel 
                        ? 'bg-cyan-600/20 text-cyan-400' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                    title="Schedules"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setShowCopilotPanel(!showCopilotPanel)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                      showCopilotPanel 
                        ? 'bg-purple-600/20 text-purple-400' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                    title="AI Copilot"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-red-600/20 hover:text-red-400 text-gray-300 rounded-md transition-colors text-sm"
                    title={t('workflowEditor.deleteWorkflow')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || isRunningV2}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded-md transition-colors text-sm"
                  >
                    <Save className="w-4 h-4" />
                    {t('workflowEditor.save')}
                  </button>
                  {isRunningV2 ? (
                    <button
                      onClick={handleAbortWorkflow}
                      className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors text-sm font-medium"
                    >
                      <Square className="w-4 h-4" />
                      {t('workflowEditor.stop')}
                    </button>
                  ) : (
                    <button
                      onClick={handleRunClick}
                      disabled={canvasData.nodes.length === 0}
                      className="flex items-center gap-2 px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors text-sm font-medium"
                    >
                      <Play className="w-4 h-4" />
                      {t('workflowEditor.run')}
                    </button>
                  )}
                </div>
              </div>

              {/* Canvas + Editor Panel */}
              <div className="flex-1 flex overflow-hidden">
                {/* Canvas */}
                <div className="flex-1 relative">
                  {copilotSuccess && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
                      {copilotSuccess}
                    </div>
                  )}

                  {executionError && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      {executionError}
                    </div>
                  )}

                  {isRunningV2 && (
                    <div className="absolute top-4 right-4 z-10 px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('workflowEditor.executing')}
                    </div>
                  )}

                  <Canvas
                    key={selectedWorkflow.id}
                    initialData={canvasData}
                    onChange={handleCanvasChange}
                    onNodeSelect={handleNodeSelect}
                    onNodeDoubleClick={(nodeId: string) => setSelectedNodeId(nodeId)}
                    onAddNode={handleAddNode}
                    nodeExecutionStates={v2NodeStates.size > 0 ? v2NodeStates : nodeStates}
                  />
                </div>

                {/* Node Editor Panel */}
                {selectedNodeId && (
                  <NodeEditorPanel
                    node={selectedNode}
                    agents={agents}
                    onUpdate={handleNodeUpdate}
                    onDelete={handleNodeDelete}
                    onClose={() => setSelectedNodeId(null)}
                  />
                )}

                {/* Execution History Panel */}
                {showHistoryPanel && (
                  <div className="w-80 border-l border-gray-800 bg-gray-900/95 overflow-y-auto">
                    <div className="p-4 border-b border-gray-800">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-white">{t('workflowEditor.executionHistory')}</h3>
                        <button
                          onClick={() => setShowHistoryPanel(false)}
                          className="p-1 hover:bg-gray-800 rounded"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div className="p-2 space-y-2">
                      {history.length > 0 ? (
                        history.map((exec) => (
                          <div
                            key={exec.executionId}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              exec.status === 'finish'
                                ? 'border-green-500/30 bg-green-500/10 hover:bg-green-500/15'
                                : exec.status === 'failed'
                                ? 'border-red-500/30 bg-red-500/10 hover:bg-red-500/15'
                                : exec.status === 'executing'
                                ? 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/15'
                                : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800/70'
                            }`}
                            onClick={() => setSelectedExecutionId(exec.executionId)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-white">
                                {exec.title || 'Execution'}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                exec.status === 'finish'
                                  ? 'bg-green-500/20 text-green-400'
                                  : exec.status === 'failed'
                                  ? 'bg-red-500/20 text-red-400'
                                  : exec.status === 'executing'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {exec.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400">
                              {exec.createdAt && new Date(exec.createdAt).toLocaleString()}
                            </div>
                            {exec.nodeExecutions && (
                              <div className="mt-2 text-xs text-gray-500">
                                {exec.nodeExecutions.filter(n => n.status === 'finish' || n.status === 'completed').length}/
                                {exec.nodeExecutions.length} nodes completed
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">
                          No execution history
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Webhook Panel */}
                {showWebhookPanel && selectedWorkflow && (
                  <WebhookPanel
                    workflowId={selectedWorkflow.id}
                    onClose={() => setShowWebhookPanel(false)}
                  />
                )}

                {/* Schedule Panel */}
                {showSchedulePanel && selectedWorkflow && (
                  <SchedulePanel
                    workflowId={selectedWorkflow.id}
                    onClose={() => setShowSchedulePanel(false)}
                  />
                )}

                {/* AI Copilot Panel */}
                {showCopilotPanel && (
                  <div className="w-96 border-l border-gray-800 bg-gray-900/95 flex flex-col">
                    <div className="p-4 border-b border-gray-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                          <h3 className="text-sm font-medium text-white">AI Copilot</h3>
                        </div>
                        <button
                          onClick={() => setShowCopilotPanel(false)}
                          className="p-1 hover:bg-gray-800 rounded"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 p-4 min-h-0">
                      <WorkflowCopilot
                        ref={copilotRef}
                        workflowId={selectedWorkflow.id}
                        workflowName={selectedWorkflow.name}
                        canvasData={canvasData}
                        availableAgents={agents.filter(a => a.businessScopeId === activeScopeId)}
                        businessScopeId={activeScopeId ?? undefined}
                        onApplyChanges={handleCopilotApplyChanges}
                        onGenerateWorkflow={handleGenerateWorkflow}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p>{t('workflowEditor.selectWorkflow')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showImporter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg">
            <WorkflowImporter
              onImport={handleImportFromImage}
              onAcceptImport={handleAcceptImport}
              onCancel={() => setShowImporter(false)}
            />
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateWorkflow}
        />
      )}

      {showDeleteConfirm && selectedWorkflow && (
        <DeleteConfirmModal
          workflowName={selectedWorkflow.name}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteWorkflow}
        />
      )}

      {deletingSidebarName && (
        <DeleteConfirmModal
          workflowName={deletingSidebarName}
          onClose={() => setDeletingSidebarName(null)}
          onConfirm={handleSidebarDelete}
        />
      )}

      {selectedExecutionId && (
        <ExecutionDetailModal
          executionId={selectedExecutionId}
          onClose={() => setSelectedExecutionId(null)}
        />
      )}

      {showRunModal && selectedWorkflow && (
        <RunWorkflowModal
          workflowName={selectedWorkflow.name}
          workflowId={selectedWorkflow.id}
          variables={getStartNodeVariables()}
          onRun={executeWorkflow}
          onClose={() => setShowRunModal(false)}
        />
      )}
    </div>
  );
}

interface CreateWorkflowModalProps {
  onClose: () => void;
  onCreate: (name: string) => void;
}

function CreateWorkflowModal({ onClose, onCreate }: CreateWorkflowModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">{t('workflow.createNew')}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('workflow.workflowName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Employee Onboarding"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              autoFocus
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg transition-colors"
            >
              {t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteConfirmModalProps {
  workflowName: string;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ workflowName, onClose, onConfirm }: DeleteConfirmModalProps) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">{t('workflow.deleteWorkflow')}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <p className="text-gray-300">
            {t('workflow.deleteConfirmMessage')} <span className="font-semibold text-white">"{workflowName}"</span>{t('workflow.deleteConfirmSuffix')}
          </p>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
