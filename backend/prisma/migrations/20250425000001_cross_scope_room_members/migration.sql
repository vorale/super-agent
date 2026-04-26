-- Add source_scope_id to chat_room_members for cross-scope group chat
ALTER TABLE "chat_room_members" ADD COLUMN "source_scope_id" UUID;

-- Foreign key to business_scopes
ALTER TABLE "chat_room_members"
  ADD CONSTRAINT "chat_room_members_source_scope_id_fkey"
  FOREIGN KEY ("source_scope_id") REFERENCES "business_scopes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for scope-based queries
CREATE INDEX "chat_room_members_source_scope_id_idx" ON "chat_room_members"("source_scope_id");
