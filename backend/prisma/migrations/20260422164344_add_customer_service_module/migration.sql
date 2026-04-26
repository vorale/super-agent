-- CreateTable
CREATE TABLE "support_conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID,
    "channel_type" VARCHAR(20) NOT NULL DEFAULT 'web_widget',
    "channel_id" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "assigned_agent_id" UUID,
    "customer_id" UUID,
    "ai_confidence" DOUBLE PRECISION,
    "sentiment_score" DOUBLE PRECISION,
    "first_response_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "external_id" VARCHAR(255),
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "avatar_url" TEXT,
    "source_channel" VARCHAR(20),
    "tags" JSONB NOT NULL DEFAULT '[]',
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_articles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" VARCHAR(100),
    "tags" JSONB NOT NULL DEFAULT '[]',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'published',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "routing_strategy" VARCHAR(20) NOT NULL DEFAULT 'round_robin',
    "max_concurrent" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_group_members" (
    "id" UUID NOT NULL,
    "agent_group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_load" INTEGER NOT NULL DEFAULT 0,
    "max_load" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "business_scope_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "agent_group_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csat_surveys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "customer_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "channel_type" VARCHAR(20),
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csat_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_metrics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_conversations_organization_id_idx" ON "support_conversations"("organization_id");

-- CreateIndex
CREATE INDEX "support_conversations_session_id_idx" ON "support_conversations"("session_id");

-- CreateIndex
CREATE INDEX "support_conversations_channel_type_idx" ON "support_conversations"("channel_type");

-- CreateIndex
CREATE INDEX "support_conversations_status_idx" ON "support_conversations"("status");

-- CreateIndex
CREATE INDEX "support_conversations_priority_idx" ON "support_conversations"("priority");

-- CreateIndex
CREATE INDEX "support_conversations_assigned_agent_id_idx" ON "support_conversations"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "support_conversations_customer_id_idx" ON "support_conversations"("customer_id");

-- CreateIndex
CREATE INDEX "support_conversations_created_at_idx" ON "support_conversations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "support_conversations_organization_id_status_idx" ON "support_conversations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "support_conversations_organization_id_channel_type_idx" ON "support_conversations"("organization_id", "channel_type");

-- CreateIndex
CREATE INDEX "customer_profiles_organization_id_idx" ON "customer_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "customer_profiles_email_idx" ON "customer_profiles"("email");

-- CreateIndex
CREATE INDEX "customer_profiles_source_channel_idx" ON "customer_profiles"("source_channel");

-- CreateIndex
CREATE INDEX "customer_profiles_created_at_idx" ON "customer_profiles"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_organization_id_external_id_key" ON "customer_profiles"("organization_id", "external_id");

-- CreateIndex
CREATE INDEX "faq_articles_organization_id_idx" ON "faq_articles"("organization_id");

-- CreateIndex
CREATE INDEX "faq_articles_business_scope_id_idx" ON "faq_articles"("business_scope_id");

-- CreateIndex
CREATE INDEX "faq_articles_category_idx" ON "faq_articles"("category");

-- CreateIndex
CREATE INDEX "faq_articles_status_idx" ON "faq_articles"("status");

-- CreateIndex
CREATE INDEX "faq_articles_sort_order_idx" ON "faq_articles"("sort_order");

-- CreateIndex
CREATE INDEX "faq_articles_view_count_idx" ON "faq_articles"("view_count" DESC);

-- CreateIndex
CREATE INDEX "faq_articles_organization_id_status_idx" ON "faq_articles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "agent_groups_organization_id_idx" ON "agent_groups"("organization_id");

-- CreateIndex
CREATE INDEX "agent_groups_business_scope_id_idx" ON "agent_groups"("business_scope_id");

-- CreateIndex
CREATE INDEX "agent_groups_is_active_idx" ON "agent_groups"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "agent_groups_organization_id_name_key" ON "agent_groups"("organization_id", "name");

-- CreateIndex
CREATE INDEX "agent_group_members_agent_group_id_idx" ON "agent_group_members"("agent_group_id");

-- CreateIndex
CREATE INDEX "agent_group_members_user_id_idx" ON "agent_group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_group_members_agent_group_id_user_id_key" ON "agent_group_members"("agent_group_id", "user_id");

-- CreateIndex
CREATE INDEX "escalation_rules_organization_id_idx" ON "escalation_rules"("organization_id");

-- CreateIndex
CREATE INDEX "escalation_rules_business_scope_id_idx" ON "escalation_rules"("business_scope_id");

-- CreateIndex
CREATE INDEX "escalation_rules_is_active_idx" ON "escalation_rules"("is_active");

-- CreateIndex
CREATE INDEX "escalation_rules_priority_idx" ON "escalation_rules"("priority");

-- CreateIndex
CREATE INDEX "csat_surveys_organization_id_idx" ON "csat_surveys"("organization_id");

-- CreateIndex
CREATE INDEX "csat_surveys_conversation_id_idx" ON "csat_surveys"("conversation_id");

-- CreateIndex
CREATE INDEX "csat_surveys_customer_id_idx" ON "csat_surveys"("customer_id");

-- CreateIndex
CREATE INDEX "csat_surveys_submitted_at_idx" ON "csat_surveys"("submitted_at" DESC);

-- CreateIndex
CREATE INDEX "support_metrics_daily_organization_id_idx" ON "support_metrics_daily"("organization_id");

-- CreateIndex
CREATE INDEX "support_metrics_daily_date_idx" ON "support_metrics_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "support_metrics_daily_organization_id_date_business_scope_i_key" ON "support_metrics_daily"("organization_id", "date", "business_scope_id");

-- CreateIndex
CREATE INDEX "response_templates_organization_id_idx" ON "response_templates"("organization_id");

-- CreateIndex
CREATE INDEX "response_templates_business_scope_id_idx" ON "response_templates"("business_scope_id");

-- CreateIndex
CREATE INDEX "response_templates_category_idx" ON "response_templates"("category");

-- CreateIndex
CREATE INDEX "response_templates_is_active_idx" ON "response_templates"("is_active");

-- CreateIndex
CREATE INDEX "business_hours_organization_id_idx" ON "business_hours"("organization_id");

-- CreateIndex
CREATE INDEX "business_hours_is_active_idx" ON "business_hours"("is_active");

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_articles" ADD CONSTRAINT "faq_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_groups" ADD CONSTRAINT "agent_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_group_members" ADD CONSTRAINT "agent_group_members_agent_group_id_fkey" FOREIGN KEY ("agent_group_id") REFERENCES "agent_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_agent_group_id_fkey" FOREIGN KEY ("agent_group_id") REFERENCES "agent_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_metrics_daily" ADD CONSTRAINT "support_metrics_daily_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
