/**
 * Shared types for the AgentCore container runner.
 */

// ---------------------------------------------------------------------------
// Inbound payload (from Super Agent backend via invoke_agent_runtime)
// ---------------------------------------------------------------------------

export interface AgentPayload {
  prompt: string;
  session_id?: string;
  chat_session_id?: string;
  scope_id?: string;
  org_id?: string;
  agent_id?: string;
  system_prompt?: string;
  /** Model identifier to use for this invocation (overrides ANTHROPIC_MODEL env var). */
  model?: string;
  mcp_servers?: Record<string, unknown>;
  allowed_tools?: string[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** S3 bucket where the backend uploaded the full workspace */
  workspace_s3_bucket?: string;
  /** S3 prefix — workspace files are at s3://{bucket}/{prefix}{relativePath} */
  workspace_s3_prefix?: string;
}

// ---------------------------------------------------------------------------
// Outbound events (SSE data: lines back to the caller)
// ---------------------------------------------------------------------------

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  total_cost_usd: number;
}

export interface AgentEvent {
  type: 'session_start' | 'assistant' | 'result' | 'error';
  session_id?: string;
  content?: ContentBlock[];
  model?: string;
  code?: string;
  message?: string;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
  token_usage?: TokenUsage;
}
