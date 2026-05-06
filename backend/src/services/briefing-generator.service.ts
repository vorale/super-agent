import { prisma } from '../config/database.js';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config/index.js';
import { createBedrockClient } from './bedrock-client.js';

const HAIKU_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const bedrockClient: BedrockRuntimeClient = createBedrockClient({ region: config.aws.region });

interface BriefingData {
  organization_id: string;
  title: string;
  summary: string;
  category: string;
  status: 'completed' | 'flagged' | 'in-progress' | 'escalated';
  source_type: string;
  source_id: string;
  agent_id?: string | null;
  tags?: string[];
  importance: number;
  event_time: Date;
}

export class BriefingGeneratorService {
  // Save briefing with deduplication
  async saveBriefingIfNew(scopeId: string, briefing: BriefingData): Promise<boolean> {
    try {
      await prisma.scope_briefings.create({
        data: {
          business_scope_id: scopeId,
          organization_id: briefing.organization_id,
          title: briefing.title,
          summary: briefing.summary,
          category: briefing.category,
          status: briefing.status,
          source_type: briefing.source_type,
          source_id: briefing.source_id,
          agent_id: briefing.agent_id,
          tags: briefing.tags || [],
          importance: briefing.importance,
          event_time: briefing.event_time,
        },
      });
      return true;
    } catch (error: any) {
      if (error.code === '23505') return false; // Already exists
      throw error;
    }
  }

  // Generate briefing from workflow execution
  async generateWorkflowBriefing(executionId: string): Promise<BriefingData | null> {
    const execution = await prisma.workflow_executions.findUnique({
      where: { id: executionId },
      include: {
        workflow: { select: { name: true, business_scope_id: true } },
        organization: { select: { id: true } },
      },
    });

    if (!execution) return null;

    const duration = execution.completed_at && execution.started_at
      ? Math.round((execution.completed_at.getTime() - execution.started_at.getTime()) / 1000)
      : null;

    const nodeCount = await prisma.node_executions.count({
      where: { execution_id: executionId },
    });

    const successfulNodes = await prisma.node_executions.count({
      where: { execution_id: executionId, status: 'completed' },
    });

    const summary = await this.generateWorkflowSummary({
      workflowName: execution.workflow.name,
      status: execution.status,
      duration,
      nodeCount,
      successfulNodes,
    });

    const status = execution.status === 'completed' ? 'completed' : 'flagged';

    return {
      organization_id: execution.organization_id,
      title: `${execution.workflow.name} ${status === 'completed' ? 'Completed' : 'Failed'}`,
      summary,
      category: this.inferCategory(execution.workflow.name),
      status,
      source_type: 'workflow_execution',
      source_id: executionId,
      importance: this.calculateImportance({ status, source_type: 'workflow_execution' }),
      event_time: execution.completed_at || execution.started_at,
    };
  }

  // Generate briefing from chat session
  async generateChatBriefing(sessionId: string): Promise<BriefingData | null> {
    const session = await prisma.chat_sessions.findUnique({
      where: { id: sessionId },
      include: {
        business_scope: { select: { id: true } },
      },
    });

    if (!session || !session.business_scope_id) return null;

    const messages = await prisma.chat_messages.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'asc' },
      take: 50,
    });

    if (messages.length < 3) return null; // Too short to extract insights

    const insights = await this.extractChatInsights(messages);
    if (!insights) return null;

    return {
      organization_id: session.organization_id,
      title: insights.title,
      summary: insights.summary,
      category: insights.category || 'Communications',
      status: 'completed',
      source_type: 'chat_session',
      source_id: sessionId,
      agent_id: session.agent_id,
      tags: insights.tags,
      importance: insights.importance || 6,
      event_time: session.updated_at,
    };
  }

  // Generate briefing from document
  async generateDocumentBriefing(documentId: string): Promise<BriefingData | null> {
    const doc = await prisma.documents.findUnique({
      where: { id: documentId },
    });

    if (!doc || doc.status !== 'completed') return null;

    return {
      organization_id: doc.organization_id,
      title: `Document Processed: ${doc.title}`,
      summary: `Successfully processed ${doc.file_type?.toUpperCase() || 'document'} file "${doc.title}". Content is now available for RAG queries and agent knowledge.`,
      category: doc.category || 'Knowledge',
      status: 'completed',
      source_type: 'document',
      source_id: documentId,
      tags: [doc.file_type || 'document', 'knowledge'],
      importance: 5,
      event_time: doc.updated_at,
    };
  }

  // Generate briefing from scope memory
  async generateMemoryBriefing(memoryId: string): Promise<BriefingData | null> {
    const memory = await prisma.scope_memories.findUnique({
      where: { id: memoryId },
    });

    if (!memory) return null;

    return {
      organization_id: memory.organization_id,
      title: `Key Fact Recorded: ${memory.title}`,
      summary: memory.content,
      category: 'Knowledge',
      status: 'completed',
      source_type: 'scope_memory',
      source_id: memoryId,
      tags: memory.tags,
      importance: memory.is_pinned ? 8 : 6,
      event_time: memory.created_at,
    };
  }

  // Get unprocessed workflow executions
  async getUnprocessedWorkflowExecutions(scopeId: string): Promise<string[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recent = await prisma.workflow_executions.findMany({
      where: {
        workflow: { business_scope_id: scopeId },
        status: { in: ['completed', 'failed'] },
        completed_at: { gte: fiveMinAgo },
      },
      select: { id: true },
    });

    if (recent.length === 0) return [];

    const processed = await prisma.scope_briefings.findMany({
      where: {
        business_scope_id: scopeId,
        source_type: 'workflow_execution',
        source_id: { in: recent.map(e => e.id) },
      },
      select: { source_id: true },
    });

    const processedSet = new Set(processed.map(p => p.source_id));
    return recent.filter(e => !processedSet.has(e.id)).map(e => e.id);
  }

  // Get unprocessed chat sessions
  async getUnprocessedChatSessions(scopeId: string): Promise<string[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recent = await prisma.chat_sessions.findMany({
      where: {
        business_scope_id: scopeId,
        status: 'idle',
        updated_at: { gte: fiveMinAgo },
      },
      select: { id: true },
    });

    if (recent.length === 0) return [];

    const processed = await prisma.scope_briefings.findMany({
      where: {
        business_scope_id: scopeId,
        source_type: 'chat_session',
        source_id: { in: recent.map(s => s.id) },
      },
      select: { source_id: true },
    });

    const processedSet = new Set(processed.map(p => p.source_id));
    return recent.filter(s => !processedSet.has(s.id)).map(s => s.id);
  }

  // Get unprocessed documents
  async getUnprocessedDocuments(scopeId: string): Promise<string[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const scope = await prisma.business_scopes.findUnique({
      where: { id: scopeId },
      select: { organization_id: true },
    });

    if (!scope) return [];

    const recent = await prisma.documents.findMany({
      where: {
        organization_id: scope.organization_id,
        status: 'completed',
        updated_at: { gte: fiveMinAgo },
      },
      select: { id: true },
    });

    if (recent.length === 0) return [];

    const processed = await prisma.scope_briefings.findMany({
      where: {
        business_scope_id: scopeId,
        source_type: 'document',
        source_id: { in: recent.map(d => d.id) },
      },
      select: { source_id: true },
    });

    const processedSet = new Set(processed.map(p => p.source_id));
    return recent.filter(d => !processedSet.has(d.id)).map(d => d.id);
  }

  // Get unprocessed scope memories
  async getUnprocessedMemories(scopeId: string): Promise<string[]> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recent = await prisma.scope_memories.findMany({
      where: {
        business_scope_id: scopeId,
        created_at: { gte: fiveMinAgo },
      },
      select: { id: true },
    });

    if (recent.length === 0) return [];

    const processed = await prisma.scope_briefings.findMany({
      where: {
        business_scope_id: scopeId,
        source_type: 'scope_memory',
        source_id: { in: recent.map(m => m.id) },
      },
      select: { source_id: true },
    });

    const processedSet = new Set(processed.map(p => p.source_id));
    return recent.filter(m => !processedSet.has(m.id)).map(m => m.id);
  }

  // Generate workflow summary using AI
  private async generateWorkflowSummary(context: {
    workflowName: string;
    status: string;
    duration: number | null;
    nodeCount: number;
    successfulNodes: number;
  }): Promise<string> {
    const prompt = `Summarize this workflow execution in 2-3 sentences for a business briefing:

Workflow: ${context.workflowName}
Status: ${context.status}
${context.duration ? `Duration: ${context.duration}s` : ''}
Nodes executed: ${context.successfulNodes}/${context.nodeCount}

Write a concise summary explaining what was accomplished. Focus on business value, not technical details.`;

    try {
      const response = await this.invokeHaiku(prompt, 200);
      return response.trim();
    } catch (error) {
      // Fallback to template
      return `Workflow "${context.workflowName}" ${context.status}. Executed ${context.successfulNodes} of ${context.nodeCount} steps${context.duration ? ` in ${context.duration}s` : ''}.`;
    }
  }

  // Extract insights from chat messages
  private async extractChatInsights(messages: any[]): Promise<{
    title: string;
    summary: string;
    category: string;
    tags: string[];
    importance: number;
  } | null> {
    const conversation = messages
      .slice(-20) // Last 20 messages
      .map(m => `${m.type}: ${m.content.substring(0, 500)}`)
      .join('\n\n');

    const prompt = `Analyze this conversation and extract ONE key insight worth highlighting in a business briefing.

Conversation:
${conversation}

Extract the most important insight that is:
- An actionable decision made
- An important fact discovered
- A problem identified
- A recommendation given

Return JSON with:
{
  "title": "concise title < 60 chars",
  "summary": "2-3 sentences explaining the insight",
  "category": "one of: Reporting, Compliance, Analytics, Communications, Operations",
  "tags": ["2-3", "keywords"],
  "importance": 1-10
}

If no significant insight, return null.`;

    try {
      const response = await this.invokeHaiku(prompt, 300);
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      return null;
    }
  }

  // Call Bedrock Claude Haiku 4.5 directly
  private async invokeHaiku(prompt: string, maxTokens: number): Promise<string> {
    const command = new InvokeModelCommand({
      modelId: HAIKU_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const response = await bedrockClient.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    return body.content?.[0]?.text || '';
  }

  // Infer category from title/context
  private inferCategory(title: string): string {
    const lower = title.toLowerCase();
    const keywords: Record<string, string[]> = {
      Reporting: ['report', 'summary', 'dashboard', 'metrics'],
      Compliance: ['error', 'violation', 'audit', 'policy'],
      Analytics: ['forecast', 'trend', 'analysis', 'insight'],
      Operations: ['deploy', 'provision', 'scale', 'monitor', 'workflow'],
      Communications: ['message', 'notification', 'alert', 'email'],
    };

    for (const [category, words] of Object.entries(keywords)) {
      if (words.some(word => lower.includes(word))) return category;
    }

    return 'Operations';
  }

  // Calculate importance score
  private calculateImportance(briefing: { status: string; source_type: string }): number {
    let score = 5;

    if (briefing.status === 'escalated') score += 3;
    if (briefing.status === 'flagged') score += 2;
    if (briefing.status === 'in-progress') score += 1;

    if (briefing.source_type === 'workflow_execution') score += 1;

    return Math.max(1, Math.min(10, score));
  }

  // Archive old briefings
  async archiveOldBriefings(scopeId: string, daysOld: number = 7): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await prisma.scope_briefings.updateMany({
      where: {
        business_scope_id: scopeId,
        event_time: { lt: cutoff },
        is_archived: false,
      },
      data: { is_archived: true },
    });

    return result.count;
  }
}

export const briefingGeneratorService = new BriefingGeneratorService();
