-- Add settings JSONB column to business_scopes for scope-level configuration
-- (e.g. modelId for LiteLLM model selection)
ALTER TABLE "business_scopes" ADD COLUMN "settings" JSONB;
