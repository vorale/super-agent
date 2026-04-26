/**
 * Workflow Execution Types
 *
 * Type definitions for workflow execution, including canvas data structures,
 * execution parameters, and validation results.
 */

// ============================================================================
// Canvas Node Types (Backend-compatible versions)
// ============================================================================

/**
 * All supported canvas node types
 */
export type CanvasNodeType =
  | 'agent'
  | 'document'
  | 'codeArtifact'
  | 'resource'
  | 'humanApproval'
  | 'start'
  | 'trigger'
  | 'action'
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'end'
  | 'group'
  | 'memo'
  | 'intentClassifier'
  | 'faqLookup'
  | 'channelReply';

/**
 * Action execution status
 */
export type ActionStatus =
  | 'init'
  | 'waiting'
  | 'executing'
  | 'finish'
  | 'failed';

/**
 * Workflow execution status
 */
export type WorkflowExecutionStatus =
  | 'init'
  | 'executing'
  | 'finish'
  | 'failed'
  | 'aborted';

/**
 * Position in canvas
 */
export interface CanvasPosition {
  x: number;
  y: number;
}

/**
 * Base data structure for canvas nodes
 */
export interface CanvasNodeData {
  title: string;
  entityId: string;
  createdAt?: string;
  contentPreview?: string;
  reasoningContent?: string;
  metadata?: Record<string, unknown>;
  targetHandle?: string;
  sourceHandle?: string;
  [key: string]: unknown;
}

/**
 * Canvas node structure
 */
export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  position: CanvasPosition;
  data: CanvasNodeData;
  className?: string;
  style?: Record<string, unknown>;
}

/**
 * Canvas edge structure
 */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  label?: string;
  data?: Record<string, unknown>;
}

/**
 * Complete canvas data
 */
export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ============================================================================
// Variable Types
// ============================================================================

/**
 * Variable value type
 */
export type VariableValueType = 'text' | 'resource';

/**
 * Variable resource type
 */
export type VariableResourceType = 'document' | 'image' | 'video' | 'audio';

/**
 * Resource value
 */
export interface ResourceValue {
  name: string;
  fileType: VariableResourceType;
  fileId?: string;
  storageKey?: string;
  entityId?: string;
}

/**
 * Variable value
 */
export interface VariableValue {
  type: VariableValueType;
  text?: string;
  resource?: ResourceValue;
}

/**
 * Workflow variable definition
 */
export interface WorkflowVariableDefinition {
  variableId: string;
  name: string;
  value: VariableValue[];
  description?: string;
  variableType?: 'string' | 'option' | 'resource';
  required?: boolean;
  isSingle?: boolean;
  options?: string[];
  resourceTypes?: VariableResourceType[];
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Trigger type for workflow execution
 */
export type WorkflowTriggerType = 'manual' | 'api' | 'webhook' | 'schedule';

/**
 * Parameters for initializing workflow execution
 */
export interface InitializeExecutionParams {
  canvasData: CanvasData;
  variables?: WorkflowVariableDefinition[];
  startNodeIds?: string[];
  title?: string;
  triggerType?: WorkflowTriggerType;
  triggerId?: string;
}

/**
 * User context for execution
 */
export interface ExecutionUser {
  id: string;
  organizationId: string;
}

/**
 * Workflow node for execution graph
 */
export interface WorkflowNode {
  nodeId: string;
  nodeType: CanvasNodeType;
  node: CanvasNode;
  entityId: string;
  title: string;
  status: ActionStatus;
  parentNodeIds: string[];
  childNodeIds: string[];
}

/**
 * Prepared node execution record
 */
export interface PreparedNodeExecution {
  node_id: string;
  node_type: string;
  node_data: CanvasNode;
  status: ActionStatus;
  progress: number;
}

/**
 * Result of preparing node executions
 */
export interface PrepareNodeExecutionsResult {
  nodeExecutions: PreparedNodeExecution[];
  startNodes: string[];
  nodeGraph: Map<string, WorkflowNode>;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Workflow validation error
 */
export interface WorkflowValidationError {
  code: string;
  message: string;
  nodeId?: string;
}

/**
 * Workflow validation result
 */
export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
  startNodes: string[];
  endNodes: string[];
  nodeCount: number;
  edgeCount: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Workflow event types
 */
export type WorkflowEventType =
  | 'workflow:started'
  | 'workflow:completed'
  | 'workflow:failed'
  | 'workflow:aborted'
  | 'node:started'
  | 'node:progress'
  | 'node:completed'
  | 'node:failed';

/**
 * Workflow event payload
 */
export interface WorkflowEvent {
  type: WorkflowEventType;
  executionId: string;
  nodeId?: string;
  data?: {
    status?: ActionStatus;
    progress?: number;
    result?: unknown;
    error?: string;
    [key: string]: unknown;
  };
  timestamp: Date;
}
