-- CreateTable: agent_groups
CREATE TABLE "agent_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "routing_strategy" VARCHAR(20) NOT NULL DEFAULT 'round_robin',
    "max_concurrent" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "agent_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_group_members
CREATE TABLE "agent_group_members" (
    "id" UUID NOT NULL,
    "agent_group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_load" INTEGER NOT NULL DEFAULT 0,
    "max_load" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "agent_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: escalation_rules
CREATE TABLE "escalation_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "agent_group_id" UUID,

    CONSTRAINT "escalation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: csat_surveys
CREATE TABLE "csat_surveys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "customer_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "channel_type" VARCHAR(20),
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "csat_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable: support_metrics_daily
CREATE TABLE "support_metrics_daily" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "date" DATE NOT NULL,
    "total_conversations" INTEGER NOT NULL DEFAULT 0,
    "resolved_conversations" INTEGER NOT NULL DEFAULT 0,
    "ai_resolved" INTEGER NOT NULL DEFAULT 0,
    "human_resolved" INTEGER NOT NULL DEFAULT 0,
    "avg_first_response_sec" DOUBLE PRECISION,
    "avg_resolution_sec" DOUBLE PRECISION,
    "avg_csat_rating" DOUBLE PRECISION,
    "csat_count" INTEGER NOT NULL DEFAULT 0,
    "escalated_count" INTEGER NOT NULL DEFAULT 0,
    "handoff_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "support_metrics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable: response_templates
CREATE TABLE "response_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "category" VARCHAR(50),
    "shortcut" VARCHAR(20),
    "channel_types" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_hours
CREATE TABLE "business_hours" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Shanghai',
    "monday_start" VARCHAR(5),
    "monday_end" VARCHAR(5),
    "tuesday_start" VARCHAR(5),
    "tuesday_end" VARCHAR(5),
    "wednesday_start" VARCHAR(5),
    "wednesday_end" VARCHAR(5),
    "thursday_start" VARCHAR(5),
    "thursday_end" VARCHAR(5),
    "friday_start" VARCHAR(5),
    "friday_end" VARCHAR(5),
    "saturday_start" VARCHAR(5),
    "saturday_end" VARCHAR(5),
    "sunday_start" VARCHAR(5),
    "sunday_end" VARCHAR(5),
    "holiday_dates" JSONB NOT NULL DEFAULT '[]',
    "offline_message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: agent_groups
CREATE UNIQUE INDEX "agent_groups_organization_id_name_key" ON "agent_groups"("organization_id", "name");
CREATE INDEX "agent_groups_organization_id_idx" ON "agent_groups"("organization_id");
CREATE INDEX "agent_groups_business_scope_id_idx" ON "agent_groups"("business_scope_id");
CREATE INDEX "agent_groups_is_active_idx" ON "agent_groups"("is_active");

-- CreateIndex: agent_group_members
CREATE UNIQUE INDEX "agent_group_members_agent_group_id_user_id_key" ON "agent_group_members"("agent_group_id", "user_id");
CREATE INDEX "agent_group_members_agent_group_id_idx" ON "agent_group_members"("agent_group_id");
CREATE INDEX "agent_group_members_user_id_idx" ON "agent_group_members"("user_id");
CREATE INDEX "agent_group_members_is_active_idx" ON "agent_group_members"("is_active");

-- CreateIndex: escalation_rules
CREATE INDEX "escalation_rules_organization_id_idx" ON "escalation_rules"("organization_id");
CREATE INDEX "escalation_rules_business_scope_id_idx" ON "escalation_rules"("business_scope_id");
CREATE INDEX "escalation_rules_is_active_idx" ON "escalation_rules"("is_active");
CREATE INDEX "escalation_rules_priority_idx" ON "escalation_rules"("priority" DESC);

-- CreateIndex: csat_surveys
CREATE INDEX "csat_surveys_organization_id_idx" ON "csat_surveys"("organization_id");
CREATE INDEX "csat_surveys_conversation_id_idx" ON "csat_surveys"("conversation_id");
CREATE INDEX "csat_surveys_customer_id_idx" ON "csat_surveys"("customer_id");
CREATE INDEX "csat_surveys_rating_idx" ON "csat_surveys"("rating");
CREATE INDEX "csat_surveys_submitted_at_idx" ON "csat_surveys"("submitted_at" DESC);
CREATE INDEX "csat_surveys_organization_id_submitted_at_idx" ON "csat_surveys"("organization_id", "submitted_at");

-- CreateIndex: support_metrics_daily
CREATE UNIQUE INDEX "support_metrics_daily_organization_id_date_business_scope_id_key" ON "support_metrics_daily"("organization_id", "date", "business_scope_id");
CREATE INDEX "support_metrics_daily_organization_id_idx" ON "support_metrics_daily"("organization_id");
CREATE INDEX "support_metrics_daily_date_idx" ON "support_metrics_daily"("date" DESC);
CREATE INDEX "support_metrics_daily_business_scope_id_idx" ON "support_metrics_daily"("business_scope_id");

-- CreateIndex: response_templates
CREATE INDEX "response_templates_organization_id_idx" ON "response_templates"("organization_id");
CREATE INDEX "response_templates_business_scope_id_idx" ON "response_templates"("business_scope_id");
CREATE INDEX "response_templates_category_idx" ON "response_templates"("category");
CREATE INDEX "response_templates_is_active_idx" ON "response_templates"("is_active");
CREATE INDEX "response_templates_shortcut_idx" ON "response_templates"("shortcut");

-- CreateIndex: business_hours
CREATE INDEX "business_hours_organization_id_idx" ON "business_hours"("organization_id");
CREATE INDEX "business_hours_is_active_idx" ON "business_hours"("is_active");

-- AddForeignKey: agent_groups -> organizations
ALTER TABLE "agent_groups" ADD CONSTRAINT "agent_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: agent_groups -> business_scopes
ALTER TABLE "agent_groups" ADD CONSTRAINT "agent_groups_business_scope_id_fkey" FOREIGN KEY ("business_scope_id") REFERENCES "business_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: agent_group_members -> agent_groups
ALTER TABLE "agent_group_members" ADD CONSTRAINT "agent_group_members_agent_group_id_fkey" FOREIGN KEY ("agent_group_id") REFERENCES "agent_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: escalation_rules -> organizations
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: escalation_rules -> business_scopes
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_business_scope_id_fkey" FOREIGN KEY ("business_scope_id") REFERENCES "business_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: escalation_rules -> agent_groups
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_agent_group_id_fkey" FOREIGN KEY ("agent_group_id") REFERENCES "agent_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: csat_surveys -> organizations
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: csat_surveys -> support_conversations
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: support_metrics_daily -> organizations
ALTER TABLE "support_metrics_daily" ADD CONSTRAINT "support_metrics_daily_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: support_metrics_daily -> business_scopes
ALTER TABLE "support_metrics_daily" ADD CONSTRAINT "support_metrics_daily_business_scope_id_fkey" FOREIGN KEY ("business_scope_id") REFERENCES "business_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: response_templates -> organizations
ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: response_templates -> business_scopes
ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_business_scope_id_fkey" FOREIGN KEY ("business_scope_id") REFERENCES "business_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: business_hours -> organizations
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
