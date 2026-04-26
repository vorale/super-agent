/**
 * Chat Stream Service
 *
 * SSE client service for streaming chat responses from the Claude Agent SDK backend.
 * Handles new event types: session_start, assistant (with content blocks), result,
 * heartbeat, and error.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 *
 * @module services/chatStreamService
 */

import { getAuthToken } from './api/restClient';

// ============================================================================
// Types
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Content block types matching the backend SSE protocol.
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | null;
  is_error: boolean;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;

/**
 * SSE event types emitted by the backend.
 */
export interface SessionStartEvent {
  type: 'session_start';
  session_id: string;
}

export interface AssistantEvent {
  type: 'assistant';
  content: ContentBlock[];
  model?: string;
  speakerAgentName?: string;
  speakerAgentAvatar?: string | null;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_cost_usd?: number;
}

export interface ResultEvent {
  type: 'result';
  session_id: string;
  duration_ms?: number;
  num_turns?: number;
  model?: string;
  token_usage?: TokenUsage;
}

export interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp?: number;
}

export interface ErrorEvent {
  type: 'error';
  code?: string;
  message?: string;
  suggested_action?: string;
}

export interface DoneEvent {
  type: 'done';
}

export interface PreviewReadyEvent {
  type: 'preview_ready';
  app_id: string;
  url: string;
  name?: string;
}

export type ChatStreamEvent =
  | SessionStartEvent
  | AssistantEvent
  | ResultEvent
  | HeartbeatEvent
  | ErrorEvent
  | DoneEvent
  | PreviewReadyEvent;

/**
 * Callbacks for consuming chat stream events.
 */
export interface ChatStreamCallbacks {
  onSessionStart?: (event: SessionStartEvent) => void;
  onAssistant?: (event: AssistantEvent) => void;
  onResult?: (event: ResultEvent) => void;
  onHeartbeat?: (event: HeartbeatEvent) => void;
  onError?: (event: ErrorEvent) => void;
  onPreviewReady?: (event: PreviewReadyEvent) => void;
  onDone?: () => void;
}

/**
 * Options for the streamChat function.
 * businessScopeId is the primary entry point; agentId is optional.
 */
export interface StreamChatOptions {
  businessScopeId?: string;
  agentId?: string;
  mentionAgentId?: string;
  message: string;
  sessionId?: string;
  model?: string;
  context?: Record<string, unknown>;
}

/**
 * Return value from streamChat — provides an abort function and the session ID promise.
 */
export interface ChatStreamHandle {
  /** Abort the stream. */
  abort: () => void;
  /** Resolves with the session_id once the session_start event is received. */
  sessionId: Promise<string>;
}

// ============================================================================
// SSE Parsing
// ============================================================================

/**
 * Represents a single parsed SSE frame with optional event name and data.
 */
export interface SSEFrame {
  event?: string;
  data: string;
}

/**
 * Parses raw SSE text into an array of SSEFrame objects.
 *
 * SSE frames are separated by double newlines. Each frame may contain:
 * - `event: <name>` — the event type
 * - `data: <payload>` — the data payload (may span multiple lines)
 *
 * Lines starting with `:` are comments and are ignored.
 */
export function parseSSEFrames(raw: string): SSEFrame[] {
  const frames: SSEFrame[] = [];
  // Split on double newlines to get individual frames
  const blocks = raw.split(/\n\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let event: string | undefined;
    const dataLines: string[] = [];

    const lines = trimmed.split('\n');
    for (const line of lines) {
      // Ignore comment lines
      if (line.startsWith(':')) continue;

      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length > 0) {
      frames.push({ event, data: dataLines.join('\n') });
    }
  }

  return frames;
}

/**
 * Parses a single SSE data payload string into a ChatStreamEvent.
 *
 * Handles:
 * - `[DONE]` sentinel → DoneEvent
 * - `session_start` event name → SessionStartEvent (from the `event:` field)
 * - JSON payloads with a `type` field → typed events
 * - JSON payloads without a `type` field but with `session_id` → SessionStartEvent
 *
 * @param data - The raw data string from the SSE `data:` field
 * @param eventName - Optional event name from the SSE `event:` field
 * @returns The parsed ChatStreamEvent, or null if the frame cannot be parsed
 */
export function parseSSEData(data: string, eventName?: string): ChatStreamEvent | null {
  // Handle [DONE] sentinel
  if (data.trim() === '[DONE]') {
    return { type: 'done' };
  }

  try {
    const parsed = JSON.parse(data);

    // If the SSE frame has an explicit `event:` field, use it to determine type
    if (eventName === 'session_start' || eventName === 'session') {
      return {
        type: 'session_start',
        session_id: parsed.session_id ?? '',
      } satisfies SessionStartEvent;
    }

    if (eventName === 'heartbeat') {
      return {
        type: 'heartbeat',
        timestamp: parsed.timestamp,
      } satisfies HeartbeatEvent;
    }

    if (eventName === 'error') {
      return {
        type: 'error',
        code: parsed.code,
        message: parsed.message ?? parsed.error,
        suggested_action: parsed.suggested_action,
      } satisfies ErrorEvent;
    }

    // For data-only frames (no event: field), use the `type` field in the JSON
    if (parsed.type) {
      switch (parsed.type) {
        case 'session_start':
          return {
            type: 'session_start',
            session_id: parsed.session_id ?? '',
          } satisfies SessionStartEvent;

        case 'assistant':
          return {
            type: 'assistant',
            content: Array.isArray(parsed.content) ? parsed.content : [],
            model: parsed.model,
            speakerAgentName: parsed.speakerAgentName,
            speakerAgentAvatar: parsed.speakerAgentAvatar,
          } satisfies AssistantEvent;

        case 'result':
          return {
            type: 'result',
            session_id: parsed.session_id ?? '',
            duration_ms: parsed.duration_ms,
            num_turns: parsed.num_turns,
            model: parsed.model,
            token_usage: parsed.token_usage,
          } satisfies ResultEvent;

        case 'heartbeat':
          return {
            type: 'heartbeat',
            timestamp: parsed.timestamp,
          } satisfies HeartbeatEvent;

        case 'error':
          return {
            type: 'error',
            code: parsed.code,
            message: parsed.message ?? parsed.error,
            suggested_action: parsed.suggested_action,
          } satisfies ErrorEvent;

        case 'preview_ready':
          return {
            type: 'preview_ready',
            app_id: parsed.appId ?? parsed.app_id ?? '',
            url: parsed.url ?? '',
            name: parsed.appName ?? parsed.name,
          } satisfies PreviewReadyEvent;

        default:
          // Unknown type — return null
          return null;
      }
    }

    // Fallback: if the JSON has session_id but no type, treat as session_start
    if (parsed.session_id && !parsed.type) {
      return {
        type: 'session_start',
        session_id: parsed.session_id,
      } satisfies SessionStartEvent;
    }

    return null;
  } catch {
    // Non-JSON data — ignore
    return null;
  }
}

// ============================================================================
// Stream Chat
// ============================================================================

/**
 * Streams a chat message to the backend via SSE POST and invokes callbacks
 * for each event type.
 *
 * The function:
 * 1. POSTs to `/api/chat/stream` with the agent ID, message, and optional session ID
 * 2. Reads the SSE response stream
 * 3. Parses each SSE frame into typed events
 * 4. Invokes the appropriate callback for each event
 * 5. Stores the session_id from session_start for subsequent requests
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 *
 * @param options - Stream options (agentId, message, sessionId?, context?)
 * @param callbacks - Event callbacks for the UI to consume
 * @returns A ChatStreamHandle with abort() and sessionId promise
 */
export function streamChat(
  options: StreamChatOptions,
  callbacks: ChatStreamCallbacks
): ChatStreamHandle {
  const abortController = new AbortController();

  let resolveSessionId: (id: string) => void;
  let rejectSessionId: (err: Error) => void;
  const sessionIdPromise = new Promise<string>((resolve, reject) => {
    resolveSessionId = resolve;
    rejectSessionId = reject;
  });

  // Start the async streaming in the background
  (async () => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const body: Record<string, unknown> = {
        message: options.message,
      };
      if (options.businessScopeId) {
        body.business_scope_id = options.businessScopeId;
      }
      if (options.agentId) {
        body.agent_id = options.agentId;
      }
      if (options.mentionAgentId) {
        body.mention_agent_id = options.mentionAgentId;
      }
      if (options.sessionId) {
        body.session_id = options.sessionId;
      }
      if (options.context) {
        body.context = options.context;
      }
      if (options.model) {
        body.model = options.model;
      }

      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = errorBody.error || `Request failed with status ${response.status}`;
        callbacks.onError?.({
          type: 'error',
          code: 'HTTP_ERROR',
          message: errorMessage,
          suggested_action: 'Please try again',
        });
        rejectSessionId!(new Error(errorMessage));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const err = new Error('No response body');
        callbacks.onError?.({
          type: 'error',
          code: 'NO_RESPONSE_BODY',
          message: 'No response body received',
          suggested_action: 'Please try again',
        });
        rejectSessionId!(err);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let sessionIdResolved = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE frames (separated by double newlines)
          // We look for complete frames while keeping incomplete data in the buffer
          const lastDoubleNewline = buffer.lastIndexOf('\n\n');
          if (lastDoubleNewline === -1) continue;

          const complete = buffer.slice(0, lastDoubleNewline + 2);
          buffer = buffer.slice(lastDoubleNewline + 2);

          const frames = parseSSEFrames(complete);

          for (const frame of frames) {
            const event = parseSSEData(frame.data, frame.event);
            if (!event) continue;

            switch (event.type) {
              case 'session_start':
                // Requirement 9.4: Store session_id from session_start event
                if (!sessionIdResolved && event.session_id) {
                  sessionIdResolved = true;
                  resolveSessionId!(event.session_id);
                }
                callbacks.onSessionStart?.(event);
                break;

              case 'assistant':
                // Requirements 9.1, 9.2, 9.3: Forward content blocks to UI
                callbacks.onAssistant?.(event);
                break;

              case 'result':
                // Requirement 9.7: Mark conversation turn as complete
                callbacks.onResult?.(event);
                break;

              case 'heartbeat':
                // Requirement 9.5: Treat as keep-alive, no UI update
                callbacks.onHeartbeat?.(event);
                break;

              case 'error':
                // Requirement 9.6: Surface error message and suggested action
                callbacks.onError?.(event);
                break;

              case 'preview_ready':
                callbacks.onPreviewReady?.(event);
                break;

              case 'done':
                callbacks.onDone?.();
                break;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        const frames = parseSSEFrames(buffer);
        for (const frame of frames) {
          const event = parseSSEData(frame.data, frame.event);
          if (!event) continue;

          switch (event.type) {
            case 'session_start':
              if (!sessionIdResolved && event.session_id) {
                sessionIdResolved = true;
                resolveSessionId!(event.session_id);
              }
              callbacks.onSessionStart?.(event);
              break;
            case 'assistant':
              callbacks.onAssistant?.(event);
              break;
            case 'result':
              callbacks.onResult?.(event);
              break;
            case 'heartbeat':
              callbacks.onHeartbeat?.(event);
              break;
            case 'error':
              callbacks.onError?.(event);
              break;
            case 'preview_ready':
              callbacks.onPreviewReady?.(event);
              break;
            case 'done':
              callbacks.onDone?.();
              break;
          }
        }
      }

      // If session ID was never resolved, reject the promise
      if (!sessionIdResolved) {
        rejectSessionId!(new Error('No session_start event received'));
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Stream was intentionally aborted — not an error
        rejectSessionId!(new Error('Stream aborted'));
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error';
      callbacks.onError?.({
        type: 'error',
        code: 'STREAM_ERROR',
        message: errorMessage,
        suggested_action: 'Please check your connection and try again',
      });
      rejectSessionId!(new Error(errorMessage));
    }
  })();

  return {
    abort: () => abortController.abort(),
    sessionId: sessionIdPromise,
  };
}

// ============================================================================
// Session ID Management
// ============================================================================

const CHAT_STREAM_SESSION_KEY = 'super-agent-chat-stream-session';

/**
 * Stores the session ID for subsequent requests.
 * Requirement 9.4: Store session_id from session_start event.
 */
export function storeSessionId(sessionId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CHAT_STREAM_SESSION_KEY, sessionId);
  }
}

/**
 * Retrieves the stored session ID.
 */
export function getStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CHAT_STREAM_SESSION_KEY);
}

/**
 * Clears the stored session ID.
 */
export function clearStoredSessionId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CHAT_STREAM_SESSION_KEY);
  }
}
