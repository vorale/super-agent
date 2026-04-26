/**
 * Channel Reply Node Executor
 * Writes AI reply to the associated Chat Session as an agent message.
 */

import type { INodeExecutor, NodeExecutionParams, NodeExecutionResult } from './types.js';
import type { CanvasNodeType } from '../../types/workflow-execution.js';
import { prisma } from '../../config/database.js';

export class ChannelReplyExecutor implements INodeExecutor {
  readonly supportedTypes: CanvasNodeType[] = ['channelReply'];

  supports(nodeType: CanvasNodeType): boolean {
    return this.supportedTypes.includes(nodeType);
  }

  async execute(params: NodeExecutionParams): Promise<NodeExecutionResult> {
    try {
      const { node, context } = params;
      const metadata = node.data.metadata as Record<string, unknown> | undefined;
      const contentRef = metadata?.contentRef as string | undefined;
      const fallbackReply = (metadata?.fallbackReply as string) ?? 'Thank you for your message. A support agent will be with you shortly.';
      const resolveOnReply = (metadata?.resolveOnReply as boolean) ?? false;

      // Resolve content reference from parent outputs
      let replyContent = '';
      if (contentRef) {
        // Parse reference like @{node_id.output.field}
        const refMatch = contentRef.match(/@\{(\w+)\.output\.(\w+)\}/);
        if (refMatch) {
          const [, nodeId, field] = refMatch;
          const nodeOutput = context.nodeOutputs.get(nodeId!) as Record<string, unknown> | undefined;
          if (nodeOutput) {
            replyContent = (nodeOutput[field!] as string) ?? '';
          }
        }
      }

      // Try to find reply content from any parent output
      if (!replyContent) {
        for (const [, output] of context.nodeOutputs) {
          const out = output as Record<string, unknown>;
          if (out?.text) { replyContent = out.text as string; break; }
          if (out?.reply) { replyContent = out.reply as string; break; }
          if (out?.bestMatch) {
            const match = out.bestMatch as Record<string, unknown>;
            replyContent = (match.answer as string) ?? '';
            break;
          }
        }
      }

      if (!replyContent) {
        replyContent = fallbackReply;
      }

      const organizationId = context.organizationId;
      const sessionId = context.variables.get('sessionId') as string | undefined;
      const conversationId = context.variables.get('conversationId') as string | undefined;

      // Write message to chat session
      if (sessionId && organizationId) {
        await prisma.chat_messages.create({
          data: {
            organization_id: organizationId,
            session_id: sessionId,
            type: 'agent',
            content: replyContent,
            metadata: { source: 'workflow', nodeId: node.id },
          },
        });

        // Optionally resolve the conversation
        if (resolveOnReply && conversationId) {
          await prisma.support_conversations.update({
            where: { id: conversationId },
            data: { status: 'resolved', resolved_at: new Date() },
          }).catch(() => {});
        }
      }

      return {
        success: true,
        output: {
          reply: replyContent,
          sent: Boolean(sessionId),
          resolved: resolveOnReply,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Channel reply failed',
      };
    }
  }
}
