/**
 * Support Workflow Service
 *
 * Provides the customer service workflow template and helpers to execute
 * it for incoming widget/support messages.
 *
 * The workflow flow:
 *   Start → IntentClassifier → Condition(confidence)
 *     ├─ high → FaqLookup → Agent(reply) → ChannelReply → End
 *     └─ low  → SentimentAnalyzer → Condition(negative?)
 *       ├─ yes → HumanApproval (handoff) → End
 *       └─ no  → Agent(reply) → ChannelReply → End
 */

import { prisma } from '../config/database.js';
import { workflowExecutionService } from './workflow-execution.service.js';

// ── Workflow Template Definition ──────────────────────────────────

const SUPPORT_WORKFLOW_TEMPLATE = {
  name: 'Customer Service - AI First',
  version: '1.0.0',
  is_official: true,
  description: 'AI-first customer service workflow with intent classification, FAQ lookup, and human handoff',
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 50, y: 250 },
      data: {
        title: 'Message Input',
        metadata: {
          variables: [
            { name: 'message', type: 'string', description: 'Customer message' },
            { name: 'sessionId', type: 'string', description: 'Chat session ID' },
            { name: 'conversationId', type: 'string', description: 'Support conversation ID' },
            { name: 'channelType', type: 'string', description: 'Channel type' },
          ],
        },
      },
    },
    {
      id: 'classify_intent',
      type: 'intentClassifier',
      position: { x: 250, y: 250 },
      data: {
        title: 'Classify Intent',
        metadata: {
          messageRef: 'start.output.message',
          categories: [
            'general_inquiry',
            'product_question',
            'technical_issue',
            'billing',
            'complaint',
            'feedback',
            'order_status',
            'refund_return',
          ],
        },
      },
    },
    {
      id: 'check_confidence',
      type: 'condition',
      position: { x: 450, y: 250 },
      data: {
        title: 'Confidence Check',
        metadata: {
          rules: [
            {
              field: 'classify_intent.output.confidence',
              operator: 'greater_than',
              value: 0.6,
            },
          ],
          logic: 'and',
        },
      },
    },
    {
      id: 'lookup_faq',
      type: 'faqLookup',
      position: { x: 650, y: 150 },
      data: {
        title: 'Search FAQ',
        metadata: {
          queryRef: 'start.output.message',
          maxResults: 3,
          minScore: 0.2,
        },
      },
    },
    {
      id: 'ai_reply_high',
      type: 'agent',
      position: { x: 850, y: 150 },
      data: {
        title: 'AI Reply (Confident)',
        metadata: {
          prompt: `You are a customer service AI assistant. Answer the customer's question based on the conversation context.

Customer message: {{message}}

Intent: @{classify_intent.output.intent} (confidence: @{classify_intent.output.confidence})

FAQ matches found:
{{faqContext}}

If FAQ matches are relevant, incorporate them into your response. If not, answer based on your knowledge.
Keep the response concise and helpful. Reply in the same language as the customer's message.`,
          messageRef: 'start.output.message',
          contextRefs: ['classify_intent.output', 'lookup_faq.output'],
        },
      },
    },
    {
      id: 'send_reply_high',
      type: 'channelReply',
      position: { x: 1050, y: 150 },
      data: {
        title: 'Send Reply',
        metadata: {
          replyRef: 'ai_reply_high.output.text',
        },
      },
    },
    {
      id: 'analyze_sentiment',
      type: 'agent',
      position: { x: 650, y: 350 },
      data: {
        title: 'Analyze Sentiment',
        metadata: {
          prompt: `Analyze the sentiment of this customer message. Return ONLY valid JSON:
{"sentiment": "positive|neutral|negative", "score": <-1.0 to 1.0>, "urgency": "low|medium|high", "reason": "brief reason"}

Customer message: {{message}}
Classified intent: @{classify_intent.output.intent}`,
          messageRef: 'start.output.message',
          maxTokens: 256,
        },
      },
    },
    {
      id: 'check_sentiment',
      type: 'condition',
      position: { x: 850, y: 350 },
      data: {
        title: 'Sentiment Check',
        metadata: {
          rules: [
            {
              field: 'analyze_sentiment.output.urgency',
              operator: 'equals',
              value: 'high',
            },
          ],
          logic: 'or',
          fallbackRules: [
            {
              field: 'classify_intent.output.suggestedAction',
              operator: 'equals',
              value: 'human_handoff',
            },
          ],
        },
      },
    },
    {
      id: 'human_handoff',
      type: 'humanApproval',
      position: { x: 1050, y: 450 },
      data: {
        title: 'Transfer to Human Agent',
        metadata: {
          instructions: 'Customer needs human assistance. Review the conversation and respond.',
          timeoutSeconds: 300,
        },
      },
    },
    {
      id: 'ai_reply_low',
      type: 'agent',
      position: { x: 1050, y: 300 },
      data: {
        title: 'AI Reply (Uncertain)',
        metadata: {
          prompt: `You are a customer service AI assistant. The system is not fully confident about the customer's intent. Provide a helpful but cautious response, and suggest the customer can be connected to a human agent if needed.

Customer message: {{message}}

Intent: @{classify_intent.output.intent} (confidence: @{classify_intent.output.confidence})
Sentiment: @{analyze_sentiment.output.sentiment}

Keep the response concise. Reply in the same language as the customer's message.`,
          messageRef: 'start.output.message',
        },
      },
    },
    {
      id: 'send_reply_low',
      type: 'channelReply',
      position: { x: 1250, y: 300 },
      data: {
        title: 'Send Reply (Low Confidence)',
        metadata: {
          replyRef: 'ai_reply_low.output.text',
        },
      },
    },
    {
      id: 'end',
      type: 'end',
      position: { x: 1250, y: 150 },
      data: {
        title: 'Complete',
      },
    },
  ],
  connections: [
    { id: 'e1', source: 'start', target: 'classify_intent', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e2', source: 'classify_intent', target: 'check_confidence', sourceHandle: 'output', targetHandle: 'input' },
    // High confidence branch
    { id: 'e3', source: 'check_confidence', target: 'lookup_faq', sourceHandle: 'true', targetHandle: 'input' },
    { id: 'e4', source: 'lookup_faq', target: 'ai_reply_high', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e5', source: 'ai_reply_high', target: 'send_reply_high', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e6', source: 'send_reply_high', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
    // Low confidence branch
    { id: 'e7', source: 'check_confidence', target: 'analyze_sentiment', sourceHandle: 'false', targetHandle: 'input' },
    { id: 'e8', source: 'analyze_sentiment', target: 'check_sentiment', sourceHandle: 'output', targetHandle: 'input' },
    // Negative sentiment → human handoff
    { id: 'e9', source: 'check_sentiment', target: 'human_handoff', sourceHandle: 'true', targetHandle: 'input' },
    // Neutral/positive → AI reply
    { id: 'e10', source: 'check_sentiment', target: 'ai_reply_low', sourceHandle: 'false', targetHandle: 'input' },
    { id: 'e11', source: 'ai_reply_low', target: 'send_reply_low', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e12', source: 'send_reply_low', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e13', source: 'human_handoff', target: 'end', sourceHandle: 'output', targetHandle: 'input' },
  ],
} as const;

// ── Service ────────────────────────────────────────────────────────

export class SupportWorkflowService {

  /**
   * Get or create the support workflow for an organization.
   * If no workflow exists, creates one from the template.
   */
  async getOrCreateWorkflow(organizationId: string, businessScopeId?: string): Promise<string> {
    // Look for existing support workflow
    const existing = await prisma.workflows.findFirst({
      where: {
        organization_id: organizationId,
        name: SUPPORT_WORKFLOW_TEMPLATE.name,
        business_scope_id: businessScopeId ?? null,
      },
    });

    if (existing) {
      return existing.id;
    }

    // Create from template
    const workflow = await prisma.workflows.create({
      data: {
        organization_id: organizationId,
        business_scope_id: businessScopeId ?? null,
        name: SUPPORT_WORKFLOW_TEMPLATE.name,
        version: SUPPORT_WORKFLOW_TEMPLATE.version,
        is_official: SUPPORT_WORKFLOW_TEMPLATE.is_official,
        nodes: SUPPORT_WORKFLOW_TEMPLATE.nodes as any,
        connections: SUPPORT_WORKFLOW_TEMPLATE.connections as any,
      },
    });

    return workflow.id;
  }

  /**
   * Execute the support workflow for an incoming customer message.
   * Returns the workflow execution ID.
   */
  async executeForMessage(params: {
    organizationId: string;
    businessScopeId?: string;
    userId: string;
    message: string;
    sessionId: string;
    conversationId: string;
    channelType?: string;
  }): Promise<string> {
    const {
      organizationId,
      businessScopeId,
      userId,
      message,
      sessionId,
      conversationId,
      channelType = 'web_widget',
    } = params;

    const workflowId = await this.getOrCreateWorkflow(organizationId, businessScopeId);

    const executionId = await workflowExecutionService.initializeWorkflowExecution(
      { id: userId, organizationId },
      workflowId,
      {
        canvasData: {
          nodes: SUPPORT_WORKFLOW_TEMPLATE.nodes as any,
          edges: SUPPORT_WORKFLOW_TEMPLATE.connections as any,
        },
        variables: [
          { variableId: 'message', name: 'message', value: [{ type: 'text', text: message }] },
          { variableId: 'sessionId', name: 'sessionId', value: [{ type: 'text', text: sessionId }] },
          { variableId: 'conversationId', name: 'conversationId', value: [{ type: 'text', text: conversationId }] },
          { variableId: 'channelType', name: 'channelType', value: [{ type: 'text', text: channelType }] },
        ],
        title: `Customer Service: ${message.slice(0, 50)}`,
      },
    );

    return executionId;
  }

  /**
   * Get the workflow template definition (for display in UI).
   */
  getTemplate() {
    return SUPPORT_WORKFLOW_TEMPLATE;
  }
}

export const supportWorkflowService = new SupportWorkflowService();
