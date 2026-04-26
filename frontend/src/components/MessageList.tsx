import { useRef, useEffect, useMemo } from 'react'
import { User } from 'lucide-react'
import type { Message } from '@/types'
import type { ContentBlock } from '@/services/chatStreamService'
import { ChatMessage } from './chat/ChatMessage'
import { useTranslation } from '@/i18n'

interface MessageListProps {
  messages: Message[]
  isTyping?: boolean
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Attempts to parse AI message content as an array of content blocks.
 * Returns the parsed blocks if valid, or null if it's plain text.
 */
function tryParseContentBlocks(content: string): ContentBlock[] | null {
  if (!content.startsWith('[')) return null
  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) return null
    // Validate that at least the first element looks like a content block
    if (parsed.length > 0 && typeof parsed[0]?.type === 'string') {
      return parsed as ContentBlock[]
    }
    return null
  } catch {
    return null
  }
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex gap-3 flex-row-reverse">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-600/15 border border-blue-500/25">
        <User className="w-4 h-4 text-blue-400" />
      </div>
      <div className="flex flex-col max-w-[70%] items-end">
        <div className="px-4 py-2 rounded-2xl bg-blue-600/15 border border-blue-500/20 text-white rounded-br-md">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <span className="text-xs text-gray-500 mt-1 px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function TokenUsageBadge({ message }: { message: Message }) {
  const { tokenUsage, model } = message
  if (!tokenUsage && !model) return null

  const parts: string[] = []
  if (model) {
    // Show short model name: "claude-sonnet-4-20250514" → "sonnet-4"
    const short = model
      .replace(/^claude-/, '')
      .replace(/-\d{8}$/, '')
    parts.push(short)
  }
  if (tokenUsage) {
    const input = tokenUsage.input_tokens ?? 0
    const output = tokenUsage.output_tokens ?? 0
    parts.push(`↑${formatTokenCount(input)} ↓${formatTokenCount(output)}`)
    if (tokenUsage.cache_read_input_tokens && tokenUsage.cache_read_input_tokens > 0) {
      parts.push(`cache ${formatTokenCount(tokenUsage.cache_read_input_tokens)}`)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-600 ml-11 mt-0.5 select-none">
      {parts.join(' · ')}
    </span>
  )
}

function AIBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const contentBlocks = useMemo(
    () => tryParseContentBlocks(message.content),
    [message.content]
  )

  // While streaming, content starts empty — show typing dots
  if (!message.content) {
    return (
      <div className="flex flex-col items-start">
        <TypingIndicator />
        <span className="text-xs text-gray-500 mt-1 px-1 ml-11">
          {formatTime(message.timestamp)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start">
      {contentBlocks ? (
        // Rich rendering with content blocks (text, tool_use, tool_result)
        <div className="max-w-[85%]">
          <ChatMessage
            content={contentBlocks}
            isStreaming={isStreaming}
            speakerAgentName={message.speakerAgentName}
            speakerAgentAvatar={message.speakerAgentAvatar}
          />
        </div>
      ) : (
        // Fallback: plain text rendering
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-600">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <div className="flex flex-col max-w-[70%] items-start">
            <div className="px-4 py-2 rounded-2xl bg-gray-800 text-gray-100 rounded-bl-md">
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        </div>
      )}
      <span className="text-xs text-gray-500 mt-1 px-1 ml-11">
        {formatTime(message.timestamp)}
      </span>
      {!isStreaming && <TokenUsageBadge message={message} />}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
      </div>
      <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export function MessageList({ messages, isTyping = false }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  if (messages.length === 0 && !isTyping) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>{t('chat.emptyState')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, idx) => (
        message.type === 'user'
          ? <UserBubble key={message.id} message={message} />
          : <AIBubble
              key={message.id}
              message={message}
              isStreaming={isTyping && idx === messages.length - 1}
            />
      ))}
      {isTyping && !messages.some(m => m.type === 'ai' && !m.content) && <TypingIndicator />}
      <div ref={messagesEndRef} />
    </div>
  )
}
