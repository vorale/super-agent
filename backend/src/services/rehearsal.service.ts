/**
 * Rehearsal Service
 *
 * Phase 2 — Dry-Run static analysis approach.
 * Evaluates agent configurations against accumulated scope memories (gaps, lessons)
 * and generates evolution proposals. No tool execution, zero side effects.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { createBedrockClient } from './bedrock-client.js';
import { scopeMemoryRepository } from '../repositories/scope-memory.repository.js';
import {
  businessScopeService,
} from './businessScope.service.js';

const REHEARSAL_MODEL_ID = 'us.amazon.nova-2-lite-v1:0';
const bedrockClient: BedrockRuntimeClient = createBedrockClient({ region: config.aws.region });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposedChange {
  target: 'system_prompt' | 'skill' | 'tool_config' | 'new_agent';
  agent_id?: string;
  description: string;
  before?: string;
  after: string;
  rationale: string;
}

interface EvaluationResult {
  score: number;
  summary: string;
  details: Array<{ memory_id: string; can_handle: boolean; analysis: string }>;
}

interface RehearsalOutput {
  evaluation: EvaluationResult;
  proposed_changes: ProposedChange[];
}

export interface RehearsalSessionRecord {
  id: string;
  organization_id: string;
  business_scope_id: string;
  agent_id: string | null;
  rehearsal_type: string;
  trigger_memory_ids: string[];
  agent_config_snapshot: unknown;
  scenario: unknown;
  evaluation: unknown;
  status: string;
  created_at: Date;
  completed_at: Date | null;
}

export interface ProposalRecord {
  id: string;
  organization_id: string;
  business_scope_id: string;
  rehearsal_session_id: string | null;
  trigger_memory_ids: string[];
  proposal_type: string;
  proposed_changes: unknown;
  evaluation_score: number | null;
  evaluation_summary: string | null;
  status: string;
  reviewed_by: string | null;
  review_note: string | null;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// System prompt for the "coach" agent
// ---------------------------------------------------------------------------

const COACH_SYSTEM_PROMPT = `You are an AI Agent quality evaluator. Your task is to analyze an agent's configuration and assess whether it can handle problems discovered in past conversations.

You will receive:
1. The target agent's full configuration (system prompt, skills, tools)
2. A list of memories (gaps, lessons) extracted from real conversations

Your job:
1. For each memory, judge whether the current agent configuration can handle the described scenario
2. If not, propose specific, actionable changes
3. Be conservative — only propose changes when there is a clear deficiency

Output ONLY valid JSON (no markdown fences):
{
  "evaluation": {
    "score": <1-10 integer>,
    "summary": "<one paragraph overall assessment>",
    "details": [
      { "memory_id": "<id>", "can_handle": <true|false>, "analysis": "<brief explanation>" }
    ]
  },
  "proposed_changes": [
    {
      "target": "system_prompt | skill | tool_config | new_agent",
      "agent_id": "<optional, target agent id>",
      "description": "<what to change>",
      "before": "<current content if applicable>",
      "after": "<proposed content>",
      "rationale": "<why this change is needed>"
    }
  ]
}

Rules:
- If the agent configuration is adequate, return score >= 7 and empty proposed_changes.
- proposed_changes should be minimal and high-impact.
- Write in the same language as the memories.
- Maximum 5 proposed changes.`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RehearsalService {
  /**
   * Run a rehearsal for a scope. Loads agent configs + memories,
   * calls the coach LLM, and persists the results.
   */
  async runRehearsal(
    organizationId: string,
    scopeId: string,
    options: { agentId?: string; rehearsalType?: string; memoryIds?: string[] } = {},
  ): Promise<RehearsalSessionRecord> {
    // 1. Load scope + agents
    const scope = await prisma.business_scopes.findFirst({
      where: { id: scopeId, organization_id: organizationId },
    });
    if (!scope) throw new Error(`Scope ${scopeId} not found`);

    const agentsWithSkills = await businessScopeService.getScopeAgentsWithSkills(scopeId, organizationId);

    // 2. Load trigger memories
    let memories;
    if (options.memoryIds && options.memoryIds.length > 0) {
      // Manual trigger with specific memories
      const all = await scopeMemoryRepository.findByScope(organizationId, scopeId, { limit: 200 });
      memories = all.filter(m => options.memoryIds!.includes(m.id));
    } else {
      // Auto trigger — load recent gaps and lessons
      const all = await scopeMemoryRepository.findByScope(organizationId, scopeId, { limit: 200 });
      memories = all.filter(m => m.category === 'gap' || m.category === 'lesson');
    }

    if (memories.length === 0) {
      throw new Error('No actionable memories found for rehearsal');
    }

    // 3. Build agent config snapshot
    const targetAgent = options.agentId
      ? agentsWithSkills.find(a => a.id === options.agentId)
      : agentsWithSkills[0]; // Default to first agent

    const configSnapshot = {
      scope: { name: scope.name, description: scope.description, system_prompt: scope.system_prompt },
      agents: agentsWithSkills.map(a => ({
        id: a.id,
        name: a.name,
        display_name: a.display_name,
        role: a.role,
        system_prompt: a.system_prompt,
        skills: a.skills.map((s: { name: string; description: string | null }) => ({
          name: s.name,
          description: s.description,
        })),
        tools: a.tools,
      })),
    };

    const scenario = {
      target_agent: targetAgent ? { id: targetAgent.id, name: targetAgent.name } : null,
      memory_count: memories.length,
      categories: [...new Set(memories.map(m => m.category))],
    };

    // 4. Create rehearsal session record
    const session = await prisma.rehearsal_sessions.create({
      data: {
        organization_id: organizationId,
        business_scope_id: scopeId,
        agent_id: targetAgent?.id ?? null,
        rehearsal_type: options.rehearsalType ?? 'memory_triggered',
        trigger_memory_ids: memories.map(m => m.id),
        agent_config_snapshot: configSnapshot,
        scenario,
        status: 'running',
      },
    });

    // 5. Call coach LLM
    try {
      const output = await this.callCoach(configSnapshot, memories);

      // 6. Update session with evaluation
      const updated = await prisma.rehearsal_sessions.update({
        where: { id: session.id },
        data: {
          evaluation: output.evaluation as object,
          status: 'completed',
          completed_at: new Date(),
        },
      });

      // 7. Create proposal if there are changes
      if (output.proposed_changes.length > 0) {
        await prisma.scope_evolution_proposals.create({
          data: {
            organization_id: organizationId,
            business_scope_id: scopeId,
            rehearsal_session_id: session.id,
            trigger_memory_ids: memories.map(m => m.id),
            proposal_type: this.inferProposalType(output.proposed_changes),
            proposed_changes: output.proposed_changes as object[],
            evaluation_score: output.evaluation.score,
            evaluation_summary: output.evaluation.summary,
            status: 'pending',
          },
        });
      }

      return updated as unknown as RehearsalSessionRecord;
    } catch (err) {
      // Mark session as failed
      await prisma.rehearsal_sessions.update({
        where: { id: session.id },
        data: { status: 'failed', completed_at: new Date() },
      });
      throw err;
    }
  }

  // ---- Query methods ----

  async listRehearsals(
    organizationId: string,
    scopeId: string,
    limit = 20,
  ): Promise<RehearsalSessionRecord[]> {
    return prisma.rehearsal_sessions.findMany({
      where: { organization_id: organizationId, business_scope_id: scopeId },
      orderBy: { created_at: 'desc' },
      take: limit,
    }) as unknown as RehearsalSessionRecord[];
  }

  async getRehearsalById(
    id: string,
    organizationId: string,
  ): Promise<RehearsalSessionRecord | null> {
    return prisma.rehearsal_sessions.findFirst({
      where: { id, organization_id: organizationId },
    }) as unknown as RehearsalSessionRecord | null;
  }

  async listProposals(
    organizationId: string,
    scopeId: string,
    status?: string,
    limit = 20,
  ): Promise<ProposalRecord[]> {
    return prisma.scope_evolution_proposals.findMany({
      where: {
        organization_id: organizationId,
        business_scope_id: scopeId,
        ...(status ? { status } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    }) as unknown as ProposalRecord[];
  }

  async getProposalById(
    id: string,
    organizationId: string,
  ): Promise<ProposalRecord | null> {
    return prisma.scope_evolution_proposals.findFirst({
      where: { id, organization_id: organizationId },
    }) as unknown as ProposalRecord | null;
  }

  // ---- Apply / Reject proposals ----

  /**
   * Apply a pending proposal — execute the proposed changes against agent configs.
   */
  async applyProposal(
    proposalId: string,
    organizationId: string,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<ProposalRecord> {
    const proposal = await prisma.scope_evolution_proposals.findFirst({
      where: { id: proposalId, organization_id: organizationId },
    });
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'pending') throw new Error('Proposal is not pending');

    const changes = proposal.proposed_changes as ProposedChange[];
    const applied: string[] = [];

    for (const change of changes) {
      try {
        if (change.target === 'system_prompt' && change.agent_id) {
          await prisma.agents.update({
            where: { id: change.agent_id },
            data: { system_prompt: change.after },
          });
          applied.push('Updated system_prompt for agent ' + change.agent_id);
        } else if (change.target === 'skill') {
          const { skillService } = await import('./skill.service.js');
          const name = change.description.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase().slice(0, 50);
          await skillService.createSkill(organizationId, {
            name,
            display_name: change.description.slice(0, 100),
            description: change.rationale,
            metadata: { body: change.after, source: 'evolution_proposal', proposalId },
          });
          applied.push('Created skill: ' + name);
        } else if (change.target === 'new_agent') {
          const { agentService } = await import('./agent.service.js');
          const name = change.description.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase().slice(0, 50);
          await agentService.createAgent({
            name,
            display_name: change.description.slice(0, 100),
            role: change.rationale.slice(0, 200),
            system_prompt: change.after,
            tools: [],
            business_scope_id: proposal.business_scope_id,
            origin: 'evolution',
            is_shared: false,
          }, organizationId);
          applied.push('Created agent: ' + name);
        } else {
          applied.push('Noted: ' + change.description);
        }
      } catch (err) {
        applied.push('Failed: ' + (err instanceof Error ? err.message : 'unknown'));
      }
    }

    return prisma.scope_evolution_proposals.update({
      where: { id: proposalId },
      data: {
        status: 'approved',
        reviewed_by: reviewedBy,
        review_note: reviewNote || applied.join('; '),
        applied_at: new Date(),
      },
    }) as unknown as Promise<ProposalRecord>;
  }

  /**
   * Reject a pending proposal.
   */
  async rejectProposal(
    proposalId: string,
    organizationId: string,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<ProposalRecord> {
    const proposal = await prisma.scope_evolution_proposals.findFirst({
      where: { id: proposalId, organization_id: organizationId },
    });
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'pending') throw new Error('Proposal is not pending');

    return prisma.scope_evolution_proposals.update({
      where: { id: proposalId },
      data: {
        status: 'rejected',
        reviewed_by: reviewedBy,
        review_note: reviewNote || 'Rejected by reviewer',
      },
    }) as unknown as Promise<ProposalRecord>;
  }

  // ---- Private helpers ----

  private async callCoach(
    configSnapshot: object,
    memories: Array<{ id: string; title: string; content: string; category: string; tags: string[] }>,
  ): Promise<RehearsalOutput> {
    const memoriesText = memories
      .map(m => `[${m.id}] (${m.category}) ${m.title}\n${m.content}`)
      .join('\n\n');

    const userMessage = [
      '## Target Agent Configuration\n',
      JSON.stringify(configSnapshot, null, 2),
      '\n\n## Memories from Past Conversations\n',
      memoriesText,
    ].join('');

    // Cap at 12K chars
    const capped = userMessage.length > 12000
      ? userMessage.slice(0, 12000) + '\n[...truncated]'
      : userMessage;

    const command = new InvokeModelCommand({
      modelId: REHEARSAL_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [{ role: 'user', content: [{ text: capped }] }],
        system: [{ text: COACH_SYSTEM_PROMPT }],
        inferenceConfig: { max_new_tokens: 2048, temperature: 0.3 },
      }),
    });

    const response = await bedrockClient.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    const text: string = body?.output?.message?.content?.[0]?.text ?? '{}';

    return this.parseCoachResponse(text);
  }

  private parseCoachResponse(text: string): RehearsalOutput {
    let json = text.trim();
    const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) json = fenceMatch[1]!.trim();

    const parsed = JSON.parse(json);

    // Validate structure
    const evaluation: EvaluationResult = {
      score: typeof parsed.evaluation?.score === 'number' ? parsed.evaluation.score : 5,
      summary: parsed.evaluation?.summary ?? 'No summary provided',
      details: Array.isArray(parsed.evaluation?.details) ? parsed.evaluation.details : [],
    };

    const proposed_changes: ProposedChange[] = Array.isArray(parsed.proposed_changes)
      ? parsed.proposed_changes
          .filter((c: unknown) => typeof c === 'object' && c !== null && typeof (c as ProposedChange).target === 'string')
          .slice(0, 5)
      : [];

    return { evaluation, proposed_changes };
  }

  private inferProposalType(changes: ProposedChange[]): string {
    const targets = new Set(changes.map(c => c.target));
    if (targets.has('new_agent')) return 'new_agent';
    if (targets.has('skill')) return 'new_skill';
    if (targets.has('system_prompt')) return 'prompt_tuning';
    return 'tool_config';
  }
}

export const rehearsalService = new RehearsalService();
