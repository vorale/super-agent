-- IM Sticky Session: route all non-threaded IM messages to a single persistent session per binding.

-- 1. Add source column to chat_sessions to distinguish IM-created sessions from web UI sessions.
ALTER TABLE "chat_sessions" ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'web';

-- 2. Add sticky_session_id to im_channel_bindings — the "main" session for non-threaded messages.
ALTER TABLE "im_channel_bindings" ADD COLUMN "sticky_session_id" UUID;

-- FK: sticky_session_id → chat_sessions(id), SET NULL on delete so binding survives session deletion.
ALTER TABLE "im_channel_bindings"
  ADD CONSTRAINT "im_channel_bindings_sticky_session_id_fkey"
  FOREIGN KEY ("sticky_session_id") REFERENCES "chat_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for quick lookup
CREATE INDEX "im_channel_bindings_sticky_session_id_idx" ON "im_channel_bindings"("sticky_session_id");
CREATE INDEX "chat_sessions_source_idx" ON "chat_sessions"("source");
