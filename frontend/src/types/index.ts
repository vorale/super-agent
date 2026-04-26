// Canvas Types (Refly-inspired workflow canvas)
export * from './canvas'

// Navigation Types
export type NavigationPage = 'dashboard' | 'chat' | 'workflow' | 'agents' | 'projects' | 'tools' | 'apps' | 'starred' | 'support'

export interface NavItem {
  id: NavigationPage
  icon: string
  tooltip: string
  path: string
}

// Department Types
export type Department = 'hr' | 'it' | 'marketing' | 'sales' | 'support'

// Agent Types
export type AgentStatus = 'active' | 'busy' | 'offline'

export interface AgentMetrics {
  taskCount: number
  responseRate: number
  avgResponseTime: string
  subagentInvocations?: number
  toolCalls?: number
}

export interface ModelConfig {
  provider: 'Bedrock' | 'OpenAI' | 'Azure' | 'LiteLLM'
  modelId: string
  agentType: 'Orchestrator' | 'Worker' | 'Supervisor'
}

export interface Tool {
  id: string
  name: string
  skillMd: string  // skill.md content - instructions for this skill
}

export interface Agent {
  id: string
  name: string
  displayName: string
  role: string
  department: Department
  avatar: string
  status: AgentStatus
  metrics: AgentMetrics
  tools: Tool[]
  scope: string[]
  systemPrompt: string
  modelConfig: ModelConfig
  businessScopeId?: string  // Link to business scope
}

export interface AgentSummary {
  id: string
  name: string
  role: string
  avatar: string
}

// Dashboard Types
export interface SystemStats {
  totalActiveAgents: number
  tasksAutomated: number
  slaCompliance: number
  activeTaskCount: number
}

export interface DepartmentSection {
  id: string
  name: string
  icon: string
  color: string
  agents: Agent[]
}


// Chat Types
export interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: Date
  /** Sub-agent speaker identity — set when the message originates from a sub-agent */
  speakerAgentName?: string
  speakerAgentAvatar?: string | null
  /** Model ID used for this response (e.g. claude-sonnet-4-20250514) */
  model?: string
  /** Token usage stats from the result event */
  tokenUsage?: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
    total_cost_usd?: number
  }
}

export interface ContextMemory {
  id: string
  content: string
}

export interface UseCase {
  id: string
  title: string
  description: string
}

export interface RelatedLink {
  id: string
  title: string
  url: string
}

export interface ChatContext {
  memories: ContextMemory[]
  useCases: UseCase[]
  relatedLinks: RelatedLink[]
}

export interface QuickQuestion {
  id: string
  icon: string
  category: string
  text: string
}

// Workflow Types
export type WorkflowCategory = 'hr' | 'deployment' | 'marketing' | 'support'
export type NodeType = 'trigger' | 'agent' | 'human' | 'action' | 'condition' | 'document' | 'codeArtifact' | 'resource' | 'loop' | 'parallel' | 'start' | 'end'

export interface Position {
  x: number
  y: number
}

export interface WorkflowNode {
  id: string
  type: NodeType
  label: string
  description: string
  position: Position
  icon: string
  agentId?: string
  actionType?: string
  metadata?: Record<string, unknown>
}

export interface Connection {
  id: string
  from: string
  to: string
  sourceHandle?: string
  targetHandle?: string
  animated?: boolean
}

export interface Workflow {
  id: string
  name: string
  category: WorkflowCategory
  businessScopeId?: string  // UUID linking to business scope
  version: string
  isOfficial: boolean
  parentVersion?: string
  nodes: WorkflowNode[]
  connections: Connection[]
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

export interface WorkflowImportResult {
  detectedAgents: string[]
  detectedFlow: string[]
  suggestedWorkflow: Workflow
}

// Task Types
export type TaskStatus = 'complete' | 'running' | 'failed'

export interface Task {
  id: string
  agent: AgentSummary
  description: string
  workflow: string
  status: TaskStatus
  timestamp: Date
}

export interface DateRange {
  start: Date
  end: Date
}

export interface TaskFilters {
  agentId?: string
  status?: TaskStatus
  dateRange?: DateRange
}


// Tools & Capabilities Types
export interface Capability {
  id: string
  category: string
  name: string
  description: string
  toolIdentifier: string
  icon: string
  color: string
}

// MCP Server Types
export interface OAuthConfig {
  clientId: string
  clientSecret: string
  tokenUrl: string
  scope?: string
}

export type MCPServerStatus = 'active' | 'inactive' | 'error'

export interface MCPServerConfig {
  type: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export interface MCPServer {
  id: string
  name: string
  description: string
  hostAddress: string
  oauth?: OAuthConfig
  headers?: Record<string, string>
  config?: MCPServerConfig | null
  status: MCPServerStatus
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  latency?: number
}

// Knowledge Base Types
export type DocumentFileType = 'PDF' | 'TXT' | 'MD' | 'DOCX'
export type DocumentStatus = 'indexed' | 'processing' | 'error'
export type VectorDatabase = 'aurora' | 'opensearch' | 'pgvector'

export interface KnowledgeDocument {
  id: string
  title: string
  category: string
  fileName: string
  fileType: DocumentFileType
  uploadTime: Date
  status: DocumentStatus
}

export interface DocumentUpload {
  title: string
  category: string
  file: File
}

export interface KnowledgeBaseConfig {
  name: string
  componentType: 'bedrock' | 'other'
  componentId: string
  vectorDatabase: VectorDatabase
  databaseEndpoint: string
  storageUri: string
}

// Infrastructure Types
export type Framework = 'supabase' | 'railway' | 'vercel'
export type Database = 'aurora' | 'pgvector' | 'neon'

export interface InfrastructureConfig {
  framework: Framework
  database: Database
}

// Translation Types
export type Language = 'en' | 'cn'

export interface TranslationData {
  [key: string]: {
    en: string
    cn: string
  }
}

export interface TranslationContextType {
  currentLanguage: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

// Admin Menu Types
export interface MenuItem {
  id: string
  icon: string
  label: string
  path?: string
  action?: () => void
}
