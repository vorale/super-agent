-- Add workspace tracking and execution logs to workflow_executions
ALTER TABLE "workflow_executions" ADD COLUMN "workspace_session_id" VARCHAR(255);
ALTER TABLE "workflow_executions" ADD COLUMN "workspace_scope_id" UUID;
ALTER TABLE "workflow_executions" ADD COLUMN "logs" JSONB NOT NULL DEFAULT '[]';
