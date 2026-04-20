/**
 * Channel Reply Node Executor
 *
 * Sends a reply message through the appropriate channel (widget, IM, email, etc.).
 * Reads the reply content from a reference (e.g. AI node output) and delivers it
 * to the customer via the channel specified in the workflow context.
 */

import { BaseNodeExecutor } from './base-executor.js';
import type { NodeExecutionParams, NodeExecutionResult } from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';
import { chatService } from '../chat.service.js';
import { supportService } from '../support.service.js';

interface ChannelReplyMeta {
  /** Reference to the reply content (e.g. "@{agent.output.text}") */
  replyRef?: string;
  /** Fallback reply if reference resolves to empty */
  fallbackReply?: string;
  /** Force a specific channel type (overrides context) */
  channelType?: 'web_widget' | 'im' | 'email';
  /** Whether to mark the conversation as resolved after reply */
  resolveOnReply?: boolean;
}

export class ChannelReplyNodeExecutor extends BaseNodeExecutor {
  readonly supportedTypes: CanvasNodeType[] = ['channelReply'];

  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    const { node, context } = params;
    const metadata = this.getMetadata<ChannelReplyMeta>(params);

    // Resolve reply content
    let reply: string | undefined;
    if (metadata?.replyRef) {
      const resolved = this.resolveReference(metadata.replyRef, context);
      if (typeof resolved === 'string') {
        reply = resolved;
      } else if (typeof resolved === 'object' && resolved !== null) {
        const obj = resolved as Record<string, unknown>;
        reply = (obj.text as string) || (obj.response as string) || (obj.content as string) || '';
      }
    }

    if (!reply?.trim()) {
      reply = metadata?.fallbackReply
        ? this.substituteVariables(metadata.fallbackReply, context)
        : undefined;
    }

    if (!reply?.trim()) {
      return this.failure('No reply content found. Set replyRef or fallbackReply.');
    }

    const organizationId = context.organizationId;
    if (!organizationId) {
      return this.failure('No organization context for channel reply');
    }

    const sessionId = context.variables.get('sessionId') as string | undefined;
    const conversationId = context.variables.get('conversationId') as string | undefined;
    const channelType = metadata?.channelType || (context.variables.get('channelType') as string) || 'web_widget';

    try {
      if (sessionId) {
        await chatService.addMessage(
          organizationId,
          sessionId,
          'agent',
          reply,
          { metadata: { source: 'workflow', workflowExecutionId: context.executionId } },
        );
      }

      if (conversationId && metadata?.resolveOnReply) {
        await supportService.resolveConversation(conversationId, organizationId);
      }

      return this.success({
        type: 'channelReply',
        title: node.data.title,
        reply,
        channelType,
        sessionId: sessionId || null,
        conversationId: conversationId || null,
        delivered: true,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Reply delivery failed';
      return this.success({
        type: 'channelReply',
        title: node.data.title,
        reply,
        channelType,
        sessionId: sessionId || null,
        conversationId: conversationId || null,
        delivered: false,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
