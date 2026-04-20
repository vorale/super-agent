-- CreateTable: support_conversations
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: customer_profiles
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: faq_articles
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "faq_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: support_conversations
CREATE INDEX "support_conversations_organization_id_idx" ON "support_conversations"("organization_id");
CREATE INDEX "support_conversations_session_id_idx" ON "support_conversations"("session_id");
CREATE INDEX "support_conversations_channel_type_idx" ON "support_conversations"("channel_type");
CREATE INDEX "support_conversations_status_idx" ON "support_conversations"("status");
CREATE INDEX "support_conversations_priority_idx" ON "support_conversations"("priority");
CREATE INDEX "support_conversations_assigned_agent_id_idx" ON "support_conversations"("assigned_agent_id");
CREATE INDEX "support_conversations_customer_id_idx" ON "support_conversations"("customer_id");
CREATE INDEX "support_conversations_created_at_idx" ON "support_conversations"("created_at" DESC);
CREATE INDEX "support_conversations_organization_id_status_idx" ON "support_conversations"("organization_id", "status");
CREATE INDEX "support_conversations_organization_id_channel_type_idx" ON "support_conversations"("organization_id", "channel_type");

-- CreateIndex: customer_profiles
CREATE INDEX "customer_profiles_organization_id_idx" ON "customer_profiles"("organization_id");
CREATE INDEX "customer_profiles_email_idx" ON "customer_profiles"("email");
CREATE INDEX "customer_profiles_source_channel_idx" ON "customer_profiles"("source_channel");
CREATE INDEX "customer_profiles_created_at_idx" ON "customer_profiles"("created_at" DESC);
CREATE UNIQUE INDEX "customer_profiles_organization_id_external_id_key" ON "customer_profiles"("organization_id", "external_id");

-- CreateIndex: faq_articles
CREATE INDEX "faq_articles_organization_id_idx" ON "faq_articles"("organization_id");
CREATE INDEX "faq_articles_business_scope_id_idx" ON "faq_articles"("business_scope_id");
CREATE INDEX "faq_articles_category_idx" ON "faq_articles"("category");
CREATE INDEX "faq_articles_status_idx" ON "faq_articles"("status");
CREATE INDEX "faq_articles_sort_order_idx" ON "faq_articles"("sort_order");
CREATE INDEX "faq_articles_view_count_idx" ON "faq_articles"("view_count" DESC);
CREATE INDEX "faq_articles_organization_id_status_idx" ON "faq_articles"("organization_id", "status");

-- AddForeignKey: support_conversations -> organizations
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: support_conversations -> chat_sessions
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: support_conversations -> customer_profiles
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: customer_profiles -> organizations
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: faq_articles -> organizations
ALTER TABLE "faq_articles" ADD CONSTRAINT "faq_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: faq_articles -> business_scopes
ALTER TABLE "faq_articles" ADD CONSTRAINT "faq_articles_business_scope_id_fkey" FOREIGN KEY ("business_scope_id") REFERENCES "business_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
