/**
 * Schedule Service
 * Manages cron-based workflow scheduling.
 */

import { prisma } from '../config/database.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import cronParser from 'cron-parser';
import { workflowExecutorV2, type WorkflowV2Plan } from './workflow-executor-v2.js';

/**
 * Build a WorkflowV2Plan from stored workflow data, matching the execute-v2 route.
 */
function buildV2Plan(
  workflow: { name: string; nodes: any; connections: any },
  variables: any[],
): WorkflowV2Plan {
  const nodes = (workflow.nodes || []) as Array<{
    id: string; title?: string; label?: string; type: string; prompt?: string;
    dependentTasks?: string[]; agentId?: string;
    metadata?: Record<string, unknown>;
  }>;

  return {
    title: workflow.name,
    nodes: nodes.map(n => ({
      id: n.id,
      title: n.title || n.label || n.id,
      type: (n.type as 'agent' | 'action' | 'condition' | 'document' | 'codeArtifact') || 'agent',
      prompt: n.prompt || (n.metadata?.prompt as string) || n.title || n.label || n.id,
      dependentTasks: n.dependentTasks || (n.metadata?.dependentTasks as string[]),
      agentId: n.agentId || (n.metadata?.agentId as string),
    })),
    edges: ((workflow.connections || []) as Array<{ source?: string; target?: string; from?: string; to?: string }>).map(c => ({
      source: c.source || c.from || '',
      target: c.target || c.to || '',
    })),
    variables: (variables || []).map((v: any) => ({
      variableId: v.variableId || v.variable_id || '',
      name: v.name || '',
      value: Array.isArray(v.value) ? v.value.join(', ') : (v.value || ''),
      description: v.description || '',
    })),
  };
}

export interface ScheduleConfig {
  id: string;
  organizationId: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  variables: any[];
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  runCount: number;
  failureCount: number;
  maxRetries: number;
  createdAt: Date;
}

export interface ScheduleExecutionRecord {
  id: string;
  scheduleId: string;
  executionId: string | null;
  scheduledAt: Date;
  triggeredAt: Date | null;
  completedAt: Date | null;
  status: string;
  triggerType: 'cron' | 'manual';
  errorMessage: string | null;
  retryCount: number;
  logs: any[];
}

class ScheduleService {
  /**
   * Validate cron expression
   */
  validateCronExpression(cronExpression: string, timezone?: string): Date {
    try {
      const interval = cronParser.parseExpression(cronExpression, {
        tz: timezone || 'UTC',
      });
      return interval.next().toDate();
    } catch (error) {
      throw new Error('Invalid cron expression');
    }
  }

  /**
   * Create a schedule for a workflow
   */
  async createSchedule(
    organizationId: string,
    workflowId: string,
    options: {
      name: string;
      cronExpression: string;
      timezone?: string;
      variables?: any[];
      isEnabled?: boolean;
      maxRetries?: number;
      createdBy?: string;
    }
  ): Promise<ScheduleConfig> {
    // Verify workflow exists
    const workflow = await workflowRepository.findById(workflowId, organizationId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Validate cron expression and calculate next run
    const nextRunAt = options.isEnabled 
      ? this.validateCronExpression(options.cronExpression, options.timezone)
      : null;

    const schedule = await prisma.workflow_schedules.create({
      data: {
        organization_id: organizationId,
        workflow_id: workflowId,
        name: options.name,
        cron_expression: options.cronExpression,
        timezone: options.timezone || 'UTC',
        variables: options.variables || [],
        is_enabled: options.isEnabled || false,
        next_run_at: nextRunAt,
        max_retries: options.maxRetries || 3,
        created_by: options.createdBy,
      },
    });

    // If enabled, create the first scheduled record
    if (options.isEnabled && nextRunAt) {
      await this.createScheduledRecord(schedule.id, organizationId, nextRunAt);
    }

    return this.mapToScheduleConfig(schedule);
  }

  /**
   * Update a schedule
   */
  async updateSchedule(
    scheduleId: string,
    organizationId: string,
    updates: {
      name?: string;
      cronExpression?: string;
      timezone?: string;
      variables?: any[];
      isEnabled?: boolean;
      maxRetries?: number;
    }
  ): Promise<ScheduleConfig> {
    const schedule = await prisma.workflow_schedules.findFirst({
      where: { id: scheduleId, organization_id: organizationId, deleted_at: null },
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    // Calculate new next run time if cron or enabled status changed
    let nextRunAt = schedule.next_run_at;
    const newCron = updates.cronExpression || schedule.cron_expression;
    const newTimezone = updates.timezone || schedule.timezone;
    const newEnabled = updates.isEnabled !== undefined ? updates.isEnabled : schedule.is_enabled;

    if (newEnabled) {
      nextRunAt = this.validateCronExpression(newCron, newTimezone);
    } else {
      nextRunAt = null;
    }

    const updated = await prisma.workflow_schedules.update({
      where: { id: scheduleId },
      data: {
        name: updates.name,
        cron_expression: updates.cronExpression,
        timezone: updates.timezone,
        variables: updates.variables,
        is_enabled: updates.isEnabled,
        max_retries: updates.maxRetries,
        next_run_at: nextRunAt,
      },
    });

    // Update or create scheduled record
    if (newEnabled && nextRunAt) {
      await this.createOrUpdateScheduledRecord(scheduleId, organizationId, nextRunAt);
    } else {
      await this.deleteScheduledRecords(scheduleId, organizationId);
    }

    return this.mapToScheduleConfig(updated);
  }

  /**
   * Delete a schedule (soft delete)
   */
  async deleteSchedule(scheduleId: string, organizationId: string): Promise<void> {
    const schedule = await prisma.workflow_schedules.findFirst({
      where: { id: scheduleId, organization_id: organizationId, deleted_at: null },
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    await prisma.workflow_schedules.update({
      where: { id: scheduleId },
      data: {
        deleted_at: new Date(),
        is_enabled: false,
        next_run_at: null,
      },
    });

    // Delete pending scheduled records
    await this.deleteScheduledRecords(scheduleId, organizationId);
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(scheduleId: string, organizationId: string): Promise<ScheduleConfig | null> {
    const schedule = await prisma.workflow_schedules.findFirst({
      where: { id: scheduleId, organization_id: organizationId, deleted_at: null },
    });

    return schedule ? this.mapToScheduleConfig(schedule) : null;
  }

  /**
   * List schedules for a workflow
   */
  async listSchedules(workflowId: string, organizationId: string): Promise<ScheduleConfig[]> {
    const schedules = await prisma.workflow_schedules.findMany({
      where: {
        workflow_id: workflowId,
        organization_id: organizationId,
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    return schedules.map(this.mapToScheduleConfig);
  }

  /**
   * Manually trigger a schedule
   */
  async triggerSchedule(
    scheduleId: string,
    organizationId: string
  ): Promise<{ executionId: string; triggeredAt: Date }> {
    const schedule = await prisma.workflow_schedules.findFirst({
      where: { id: scheduleId, organization_id: organizationId, deleted_at: null },
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const workflow = await workflowRepository.findById(schedule.workflow_id, organizationId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const triggeredAt = new Date();

    // Create execution record
    const record = await prisma.schedule_execution_records.create({
      data: {
        schedule_id: scheduleId,
        organization_id: organizationId,
        scheduled_at: triggeredAt,
        triggered_at: triggeredAt,
        status: 'running',
        trigger_type: 'manual',
      },
    });

    // Build V2 plan (same as the manual Run button's execute-v2 route)
    const plan = buildV2Plan(workflow, schedule.variables as any[]);
    const scopeId = (workflow as any).business_scope_id;

    if (!scopeId) {
      await prisma.schedule_execution_records.update({
        where: { id: record.id },
        data: { status: 'failed', error_message: 'Workflow has no business scope', completed_at: new Date() },
      });
      throw new Error('Workflow has no business scope assigned');
    }

    // Execute asynchronously using V2 executor (same agentic path as manual Run)
    this.runV2Execution(plan, organizationId, scopeId, record.id, scheduleId)
      .catch(err => console.error(`[SCHEDULE] V2 execution error for schedule ${scheduleId}:`, err));

    // Update schedule stats
    await prisma.workflow_schedules.update({
      where: { id: scheduleId },
      data: {
        last_run_at: triggeredAt,
        run_count: { increment: 1 },
      },
    });

    return { executionId: record.id, triggeredAt };
  }

  /**
   * Run V2 execution and update the schedule record on completion/failure.
   */
  private async runV2Execution(
    plan: WorkflowV2Plan,
    organizationId: string,
    scopeId: string,
    recordId: string,
    scheduleId: string,
  ): Promise<void> {
    console.log(`[SCHEDULE] Starting V2 execution for schedule=${scheduleId} record=${recordId} scope=${scopeId}`);
    console.log(`[SCHEDULE] Plan: title="${plan.title}" nodes=${plan.nodes.length} edges=${plan.edges.length}`);

    const logs: Array<{ type: string; content?: string; taskId?: string; taskTitle?: string; timestamp: string }> = [];
    const addLog = (entry: typeof logs[0]) => {
      logs.push(entry);
      // Persist logs periodically (every 5 events) to allow live viewing
      if (logs.length % 5 === 0) {
        prisma.schedule_execution_records.update({
          where: { id: recordId },
          data: { logs: logs as any },
        }).catch(() => {});
      }
    };

    try {
      const generator = workflowExecutorV2.execute(
        plan,
        organizationId,
        scopeId,
        'system',
      );

      let lastError: string | null = null;

      for await (const event of generator) {
        const timestamp = new Date().toISOString();

        if (event.type === 'error') {
          lastError = event.message || 'Unknown error';
          addLog({ type: 'error', content: lastError, timestamp });
          console.error(`[SCHEDULE] Event error for ${scheduleId}: ${event.message}`);
        } else if (event.type === 'step_start') {
          addLog({ type: 'step_start', taskId: event.taskId, taskTitle: event.taskTitle, timestamp });
          console.log(`[SCHEDULE] step_start: task=${event.taskId} title="${event.taskTitle || ''}"`);
        } else if (event.type === 'step_complete') {
          addLog({ type: 'step_complete', taskId: event.taskId, taskTitle: event.taskTitle, timestamp });
          console.log(`[SCHEDULE] step_complete: task=${event.taskId} title="${event.taskTitle || ''}"`);
        } else if (event.type === 'step_failed') {
          addLog({ type: 'step_failed', taskId: event.taskId, taskTitle: event.taskTitle, content: event.message, timestamp });
          console.log(`[SCHEDULE] step_failed: task=${event.taskId} title="${event.taskTitle || ''}"`);
        } else if (event.type === 'done') {
          addLog({ type: 'done', timestamp });
          console.log(`[SCHEDULE] Execution done for schedule=${scheduleId}`);
        } else if (event.type === 'log') {
          const content = typeof event.content === 'string' ? event.content : JSON.stringify(event.content);
          addLog({ type: 'log', content: content?.slice(0, 2000), timestamp });
        }
      }

      console.log(`[SCHEDULE] Generator drained for schedule=${scheduleId}, total events=${logs.length}`);

      if (lastError) {
        await prisma.schedule_execution_records.update({
          where: { id: recordId },
          data: { status: 'failed', error_message: lastError, completed_at: new Date(), logs: logs as any },
        });
        await prisma.workflow_schedules.update({
          where: { id: scheduleId },
          data: { failure_count: { increment: 1 } },
        });
      } else {
        await prisma.schedule_execution_records.update({
          where: { id: recordId },
          data: { status: 'completed', completed_at: new Date(), logs: logs as any },
        });
      }
    } catch (error: any) {
      console.error(`[SCHEDULE] V2 execution threw for schedule=${scheduleId}:`, error.message, error.stack);
      logs.push({ type: 'error', content: error.message || 'V2 execution failed', timestamp: new Date().toISOString() });

      await prisma.schedule_execution_records.update({
        where: { id: recordId },
        data: {
          status: 'failed',
          error_message: error.message || 'V2 execution failed',
          completed_at: new Date(),
          logs: logs as any,
        },
      });

      await prisma.workflow_schedules.update({
        where: { id: scheduleId },
        data: { failure_count: { increment: 1 } },
      });
    }
  }

  /**
   * Get execution records for a schedule
   */
  async getExecutionRecords(
    scheduleId: string,
    organizationId: string,
    pagination: { page: number; limit: number }
  ): Promise<{ records: ScheduleExecutionRecord[]; total: number }> {
    const schedule = await prisma.workflow_schedules.findFirst({
      where: { id: scheduleId, organization_id: organizationId, deleted_at: null },
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const [records, total] = await Promise.all([
      prisma.schedule_execution_records.findMany({
        where: { schedule_id: scheduleId },
        orderBy: { scheduled_at: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.schedule_execution_records.count({
        where: { schedule_id: scheduleId },
      }),
    ]);

    return {
      records: records.map(this.mapToExecutionRecord),
      total,
    };
  }

  /**
   * Process due schedules (called by cron job)
   */
  async processDueSchedules(): Promise<number> {
    const now = new Date();

    // Find all enabled schedules that are due
    const dueSchedules = await prisma.workflow_schedules.findMany({
      where: {
        is_enabled: true,
        deleted_at: null,
        next_run_at: { lte: now },
      },
    });

    let processedCount = 0;

    for (const schedule of dueSchedules) {
      try {
        // Skip if there's already a running execution for this schedule
        const runningExecution = await prisma.schedule_execution_records.findFirst({
          where: { schedule_id: schedule.id, status: 'running' },
        });
        if (runningExecution) {
          console.log(`[SCHEDULE_PROCESSOR] Skipping schedule ${schedule.id} — already has a running execution`);
          continue;
        }

        await this.executeSchedule(schedule);
        processedCount++;
      } catch (error: any) {
        console.error(`[SCHEDULE_ERROR] scheduleId=${schedule.id} error=${error.message}`);
        
        // Update failure count
        await prisma.workflow_schedules.update({
          where: { id: schedule.id },
          data: { failure_count: { increment: 1 } },
        });
      }
    }

    return processedCount;
  }

  /**
   * Execute a schedule
   */
  private async executeSchedule(schedule: any): Promise<void> {
    const workflow = await workflowRepository.findById(
      schedule.workflow_id,
      schedule.organization_id
    );

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const triggeredAt = new Date();

    // Calculate next run time BEFORE execution starts, so the next tick won't re-trigger
    const nextRunAt = this.validateCronExpression(
      schedule.cron_expression,
      schedule.timezone
    );

    // Update next_run_at immediately to prevent duplicate triggers
    await prisma.workflow_schedules.update({
      where: { id: schedule.id },
      data: {
        next_run_at: nextRunAt,
        last_run_at: triggeredAt,
      },
    });

    // Reuse existing 'scheduled' record if one exists, otherwise create new
    const existingRecord = await prisma.schedule_execution_records.findFirst({
      where: { schedule_id: schedule.id, status: 'scheduled' },
    });

    let record;
    if (existingRecord) {
      record = await prisma.schedule_execution_records.update({
        where: { id: existingRecord.id },
        data: {
          triggered_at: triggeredAt,
          status: 'running',
          trigger_type: 'cron',
        },
      });
    } else {
      record = await prisma.schedule_execution_records.create({
        data: {
          schedule_id: schedule.id,
          organization_id: schedule.organization_id,
          scheduled_at: schedule.next_run_at,
          triggered_at: triggeredAt,
          status: 'running',
          trigger_type: 'cron',
        },
      });
    }

    // Next 'scheduled' placeholder is created only after execution completes (see below)

    const scopeId = (workflow as any).business_scope_id;
    if (!scopeId) {
      await prisma.schedule_execution_records.update({
        where: { id: record.id },
        data: { status: 'failed', error_message: 'Workflow has no business scope', completed_at: new Date() },
      });
      throw new Error('Workflow has no business scope assigned');
    }

    try {
      // Build V2 plan (same as the manual Run button)
      const plan = buildV2Plan(workflow, schedule.variables as any[]);

      // Execute using runV2Execution (same as manual trigger — collects logs)
      await this.runV2Execution(plan, schedule.organization_id, scopeId, record.id, schedule.id);

      // runV2Execution handles status updates and failure_count internally.
      // We just need to update run_count and create the next scheduled placeholder.
      await prisma.workflow_schedules.update({
        where: { id: schedule.id },
        data: { run_count: { increment: 1 } },
      });
    } finally {
      // Always create next scheduled placeholder, whether execution succeeded or failed
      await this.createScheduledRecord(schedule.id, schedule.organization_id, nextRunAt);
    }
  }

  /**
   * Create a scheduled record for future execution
   */
  private async createScheduledRecord(
    scheduleId: string,
    organizationId: string,
    scheduledAt: Date
  ): Promise<void> {
    await prisma.schedule_execution_records.create({
      data: {
        schedule_id: scheduleId,
        organization_id: organizationId,
        scheduled_at: scheduledAt,
        status: 'scheduled',
      },
    });
  }

  /**
   * Create or update scheduled record
   */
  private async createOrUpdateScheduledRecord(
    scheduleId: string,
    organizationId: string,
    scheduledAt: Date
  ): Promise<void> {
    const existing = await prisma.schedule_execution_records.findFirst({
      where: {
        schedule_id: scheduleId,
        status: 'scheduled',
      },
    });

    if (existing) {
      await prisma.schedule_execution_records.update({
        where: { id: existing.id },
        data: { scheduled_at: scheduledAt },
      });
    } else {
      await this.createScheduledRecord(scheduleId, organizationId, scheduledAt);
    }
  }

  /**
   * Delete pending scheduled records
   */
  private async deleteScheduledRecords(scheduleId: string, organizationId?: string): Promise<void> {
    const where: Record<string, unknown> = {
      schedule_id: scheduleId,
      status: 'scheduled',
    };
    if (organizationId) where.organization_id = organizationId;
    await prisma.schedule_execution_records.deleteMany({ where });
  }

  private mapToScheduleConfig(schedule: any): ScheduleConfig {
    return {
      id: schedule.id,
      organizationId: schedule.organization_id,
      workflowId: schedule.workflow_id,
      name: schedule.name,
      cronExpression: schedule.cron_expression,
      timezone: schedule.timezone,
      isEnabled: schedule.is_enabled,
      variables: schedule.variables as any[],
      nextRunAt: schedule.next_run_at,
      lastRunAt: schedule.last_run_at,
      runCount: schedule.run_count,
      failureCount: schedule.failure_count,
      maxRetries: schedule.max_retries,
      createdAt: schedule.created_at,
    };
  }

  private mapToExecutionRecord(record: any): ScheduleExecutionRecord {
    return {
      id: record.id,
      scheduleId: record.schedule_id,
      executionId: record.execution_id,
      scheduledAt: record.scheduled_at,
      triggeredAt: record.triggered_at,
      completedAt: record.completed_at,
      status: record.status,
      triggerType: record.trigger_type || 'cron',
      errorMessage: record.error_message,
      retryCount: record.retry_count,
      logs: record.logs || [],
    };
  }
}

export const scheduleService = new ScheduleService();
