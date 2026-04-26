/**
 * Escalation Service
 * Matches escalation rules against conversation state and executes actions.
 */

import { prisma } from '../config/database.js';
import { supportRepository } from '../repositories/support.repository.js';

export interface EscalationAction {
  type: string;
  groupId?: string;
  priority?: string;
}

export class EscalationService {
  /**
   * Evaluate all active escalation rules for a conversation and execute matching actions.
   */
  async evaluateAndEscalate(conversationId: string, organizationId: string): Promise<{
    escalated: boolean;
    matchedRules: string[];
    actionsExecuted: EscalationAction[];
  }> {
    const conversation = await supportRepository.findById(conversationId, organizationId);
    if (!conversation) return { escalated: false, matchedRules: [], actionsExecuted: [] };

    const rules = await prisma.escalation_rules.findMany({
      where: { organization_id: organizationId, is_active: true },
      orderBy: { priority: 'desc' },
    });

    const matchedRules: string[] = [];
    const actionsExecuted: EscalationAction[] = [];

    for (const rule of rules) {
      const conditions = rule.conditions as Record<string, unknown>;
      if (this.matchesConditions(conversation, conditions)) {
        matchedRules.push(rule.name);
        const actions = rule.actions as Record<string, unknown>;
        const action = await this.executeAction(conversationId, organizationId, actions, rule.agent_group_id);
        if (action) actionsExecuted.push(action);
        break; // Only execute the highest-priority matching rule
      }
    }

    return {
      escalated: matchedRules.length > 0,
      matchedRules,
      actionsExecuted,
    };
  }

  private matchesConditions(
    conversation: { status: string; ai_confidence: number | null; sentiment_score: number | null; created_at: Date; first_response_at: Date | null },
    conditions: Record<string, unknown>,
  ): boolean {
    const type = conditions.type as string | undefined;

    switch (type) {
      case 'wait_time': {
        const threshold = (conditions.threshold as number) ?? 300; // seconds
        const waitSec = (Date.now() - new Date(conversation.created_at).getTime()) / 1000;
        return waitSec > threshold && !conversation.first_response_at;
      }
      case 'low_confidence': {
        const threshold = (conditions.threshold as number) ?? 0.3;
        return conversation.ai_confidence !== null && conversation.ai_confidence < threshold;
      }
      case 'negative_sentiment': {
        const threshold = (conditions.threshold as number) ?? -0.5;
        return conversation.sentiment_score !== null && conversation.sentiment_score < threshold;
      }
      case 'status': {
        const targetStatus = conditions.status as string;
        return conversation.status === targetStatus;
      }
      default:
        return false;
    }
  }

  private async executeAction(
    conversationId: string,
    organizationId: string,
    actions: Record<string, unknown>,
    ruleGroupId: string | null,
  ): Promise<EscalationAction | null> {
    const actionType = actions.type as string | undefined;

    switch (actionType) {
      case 'assign_group': {
        const groupId = (actions.groupId as string) ?? ruleGroupId;
        if (!groupId) return null;

        // Find least-busy member in the group
        const members = await prisma.agent_group_members.findMany({
          where: { agent_group_id: groupId, is_active: true },
          orderBy: { current_load: 'asc' },
          take: 1,
        });

        if (members.length > 0) {
          const member = members[0]!;
          if (member.current_load < member.max_load) {
            await supportRepository.update(conversationId, organizationId, {
              assigned_agent_id: member.user_id,
              status: 'open',
            });
            // Increment load
            await prisma.agent_group_members.update({
              where: { id: member.id },
              data: { current_load: { increment: 1 } },
            });
            return { type: 'assign_group', groupId };
          }
        }
        return null;
      }
      case 'set_priority': {
        const priority = actions.priority as string;
        if (priority) {
          await supportRepository.update(conversationId, organizationId, { priority });
          return { type: 'set_priority', priority };
        }
        return null;
      }
      case 'handoff': {
        await supportRepository.update(conversationId, organizationId, { status: 'pending_agent' });
        return { type: 'handoff' };
      }
      default:
        return null;
    }
  }
}

export const escalationService = new EscalationService();
