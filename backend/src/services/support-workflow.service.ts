/**
 * Support Workflow Service
 * Manages the customer service AI-first workflow template and execution triggers.
 */

import { prisma } from '../config/database.js';
import { supportRepository } from '../repositories/support.repository.js';

const CS_WORKFLOW_NAME = 'Customer Service - AI First';

export class SupportWorkflowService {
  /**
   * Ensure the CS workflow template exists for the organization.
   * Creates it on first use.
   */
  async ensureWorkflowTemplate(organizationId: string, businessScopeId?: string): Promise<string> {
    const existing = await prisma.workflows.findFirst({
      where: { organization_id: organizationId, name: CS_WORKFLOW_NAME },
    });

    if (existing) return existing.id;

    // Create the AI-first customer service workflow DAG
    const nodes = [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { title: 'Message Input', entityId: '' } },
      { id: 'intent', type: 'intentClassifier', position: { x: 200, y: 0 }, data: { title: 'Intent Classifier', entityId: '', metadata: { confidenceThreshold: 0.6 } } },
      { id: 'cond_confidence', type: 'condition', position: { x: 400, y: 0 }, data: { title: 'Confidence > 0.6?', entityId: '', metadata: { rules: [{ field: '@{intent.output.confidence}', operator: 'greater_than', value: 0.6 }] } } },
      { id: 'faq_lookup', type: 'faqLookup', position: { x: 600, y: -100 }, data: { title: 'FAQ Lookup', entityId: '', metadata: { maxResults: 5, minScore: 0.1 } } },
      { id: 'ai_reply_high', type: 'agent', position: { x: 800, y: -100 }, data: { title: 'AI Reply (High Confidence)', entityId: '' } },
      { id: 'channel_reply_high', type: 'channelReply', position: { x: 1000, y: -100 }, data: { title: 'Send Reply', entityId: '', metadata: { contentRef: '@{ai_reply_high.output.text}', resolveOnReply: true } } },
      { id: 'sentiment', type: 'agent', position: { x: 600, y: 100 }, data: { title: 'Sentiment Analysis', entityId: '' } },
      { id: 'cond_urgent', type: 'condition', position: { x: 800, y: 100 }, data: { title: 'Urgent/Negative?', entityId: '', metadata: { rules: [{ field: '@{sentiment.output.sentiment}', operator: 'less_than', value: -0.3 }] } } },
      { id: 'human_handoff', type: 'humanApproval', position: { x: 1000, y: 50 }, data: { title: 'Transfer to Human', entityId: '' } },
      { id: 'ai_reply_low', type: 'agent', position: { x: 1000, y: 150 }, data: { title: 'AI Reply (Low Confidence)', entityId: '' } },
      { id: 'channel_reply_low', type: 'channelReply', position: { x: 1200, y: 150 }, data: { title: 'Send Reply', entityId: '', metadata: { contentRef: '@{ai_reply_low.output.text}' } } },
      { id: 'end', type: 'end', position: { x: 1400, y: 0 }, data: { title: 'End', entityId: '' } },
    ];

    const connections = [
      { id: 'e1', source: 'start', target: 'intent' },
      { id: 'e2', source: 'intent', target: 'cond_confidence' },
      { id: 'e3', source: 'cond_confidence', target: 'faq_lookup', sourceHandle: 'yes' },
      { id: 'e4', source: 'faq_lookup', target: 'ai_reply_high' },
      { id: 'e5', source: 'ai_reply_high', target: 'channel_reply_high' },
      { id: 'e6', source: 'channel_reply_high', target: 'end' },
      { id: 'e7', source: 'cond_confidence', target: 'sentiment', sourceHandle: 'no' },
      { id: 'e8', source: 'sentiment', target: 'cond_urgent' },
      { id: 'e9', source: 'cond_urgent', target: 'human_handoff', sourceHandle: 'yes' },
      { id: 'e10', source: 'human_handoff', target: 'end' },
      { id: 'e11', source: 'cond_urgent', target: 'ai_reply_low', sourceHandle: 'no' },
      { id: 'e12', source: 'ai_reply_low', target: 'channel_reply_low' },
      { id: 'e13', source: 'channel_reply_low', target: 'end' },
    ];

    const workflow = await prisma.workflows.create({
      data: {
        organization_id: organizationId,
        business_scope_id: businessScopeId ?? null,
        name: CS_WORKFLOW_NAME,
        version: '1.0.0',
        is_official: true,
        nodes,
        connections,
      },
    });

    return workflow.id;
  }

  /**
   * Execute the CS workflow for an incoming customer message.
   */
  async executeForMessage(
    organizationId: string,
    params: {
      message: string;
      sessionId: string;
      conversationId: string;
      businessScopeId?: string;
    },
  ): Promise<{ reply?: string; handoff?: boolean }> {
    // For now, return a simple AI-first response flow
    // The full workflow execution integration will use workflowExecutionService
    const workflowId = await this.ensureWorkflowTemplate(organizationId, params.businessScopeId);

    // Update conversation metadata with workflow reference
    await supportRepository.update(params.conversationId, organizationId, {
      metadata: { workflowId, lastMessage: params.message },
    });

    // Placeholder: in production this triggers the full workflow engine
    return { reply: undefined, handoff: false };
  }
}

export const supportWorkflowService = new SupportWorkflowService();
