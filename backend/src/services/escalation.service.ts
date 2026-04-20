/**
 * Escalation Service
 *
 * Evaluates escalation rules against conversation context
 * and triggers actions (handoff, priority change, notifications).
 */

import { prisma } from '../config/database.js';

interface EscalationContext {
  organizationId: string;
  conversationId: string;
  businessScopeId?: string;
  aiConfidence?: number;
  sentimentScore?: number;
  messageCount?: number;
  waitTimeSeconds?: number;
  keywords?: string[];
  customerTags?: string[];
  status?: string;
}

interface EscalationCondition {
  type: 'ai_confidence' | 'sentiment_score' | 'message_count' | 'wait_time' | 'keywords' | 'customer_tag' | 'status';
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'contains' | 'not_contains';
  value: number | string | string[];
}

interface EscalationAction {
  type: 'set_priority' | 'notify' | 'transfer_to_group' | 'create_ticket' | 'add_tag';
  value?: string;
  params?: Record<string, unknown>;
}

interface TriggeredRule {
  ruleId: string;
  ruleName: string;
  actions: EscalationAction[];
}

export class EscalationService {

  /**
   * Evaluate all active escalation rules against the context.
   * Returns triggered rules sorted by priority.
   */
  async evaluate(context: EscalationContext): Promise<TriggeredRule[]> {
    const rules = await prisma.escalation_rules.findMany({
      where: {
        organization_id: context.organizationId,
        is_active: true,
        ...(context.businessScopeId
          ? { OR: [{ business_scope_id: context.businessScopeId }, { business_scope_id: null }] }
          : {}),
      },
      orderBy: { priority: 'desc' },
    });

    const triggered: TriggeredRule[] = [];

    for (const rule of rules) {
      const conditions = ((rule.conditions as any)?.rules || []) as EscalationCondition[];
      const logic = ((rule.conditions as any)?.logic || 'and') as string;

      const results = conditions.map((cond) => this.evaluateCondition(cond, context));

      const passed = logic === 'or'
        ? results.some(Boolean)
        : results.every(Boolean);

      if (passed) {
        const actions = (rule.actions as any) as EscalationAction[];
        triggered.push({
          ruleId: rule.id,
          ruleName: rule.name,
          actions,
        });
      }
    }

    return triggered;
  }

  private evaluateCondition(cond: EscalationCondition, ctx: EscalationContext): boolean {
    const ctxValue = this.getContextValue(cond.type, ctx);
    if (ctxValue === undefined) return false;

    switch (cond.operator) {
      case 'lt': return typeof ctxValue === 'number' && ctxValue < (cond.value as number);
      case 'lte': return typeof ctxValue === 'number' && ctxValue <= (cond.value as number);
      case 'gt': return typeof ctxValue === 'number' && ctxValue > (cond.value as number);
      case 'gte': return typeof ctxValue === 'number' && ctxValue >= (cond.value as number);
      case 'eq': return ctxValue === cond.value;
      case 'contains': {
        if (Array.isArray(cond.value)) return cond.value.some(v => String(ctxValue).includes(v));
        return String(ctxValue).includes(String(cond.value));
      }
      case 'not_contains': {
        if (Array.isArray(cond.value)) return !cond.value.some(v => String(ctxValue).includes(v));
        return !String(ctxValue).includes(String(cond.value));
      }
      default: return false;
    }
  }

  private getContextValue(type: string, ctx: EscalationContext): number | string | undefined {
    switch (type) {
      case 'ai_confidence': return ctx.aiConfidence;
      case 'sentiment_score': return ctx.sentimentScore;
      case 'message_count': return ctx.messageCount;
      case 'wait_time': return ctx.waitTimeSeconds;
      case 'status': return ctx.status;
      case 'keywords': return ctx.keywords?.join(' ');
      case 'customer_tag': return ctx.customerTags?.join(' ');
      default: return undefined;
    }
  }

  /**
   * Create an escalation rule.
   */
  async createRule(data: {
    organizationId: string;
    businessScopeId?: string;
    name: string;
    description?: string;
    conditions: { logic?: string; rules: EscalationCondition[] };
    actions: EscalationAction[];
    priority?: number;
    createdById?: string;
  }) {
    return prisma.escalation_rules.create({
      data: {
        organization_id: data.organizationId,
        business_scope_id: data.businessScopeId ?? null,
        name: data.name,
        description: data.description,
        conditions: data.conditions as any,
        actions: data.actions as any,
        priority: data.priority ?? 0,
        created_by: data.createdById ?? null,
      },
    });
  }

  /**
   * List escalation rules for an organization.
   */
  async listRules(organizationId: string) {
    return prisma.escalation_rules.findMany({
      where: { organization_id: organizationId },
      orderBy: { priority: 'desc' },
      include: { agent_group: { select: { id: true, name: true } } },
    });
  }

  /**
   * Update an escalation rule.
   */
  async updateRule(id: string, organizationId: string, updates: Record<string, unknown>) {
    await prisma.escalation_rules.update({ where: { id, organization_id: organizationId }, data: updates as any });
    return prisma.escalation_rules.findUnique({ where: { id } });
  }

  /**
   * Delete an escalation rule.
   */
  async deleteRule(id: string, organizationId: string) {
    return prisma.escalation_rules.delete({ where: { id, organization_id: organizationId } });
  }
}

export const escalationService = new EscalationService();
