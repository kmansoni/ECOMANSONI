-- Migration: Add unique constraint for bot sessions to prevent duplicates
-- and add periodic cleanup cron for orphaned sessions

-- Unique constraint: one active session per (bot, user, conversation) combination
-- If a session already exists, we reuse it instead of creating a new one.
-- The getOrCreateSession function handles this with ON CONFLICT.

-- Add partial unique index for active sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_sessions_unique_active
ON bot_sessions (bot_id, user_id, conversation_id)
WHERE expires_at IS NULL;

-- Also add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_bot_sessions_expires
ON bot_sessions (expires_at)
WHERE expires_at IS NOT NULL;

-- Periodic cron function for orphaned session cleanup (runs every hour)
-- This is the belt-and-suspenders approach alongside the lazy cleanup in routeEvent.
CREATE OR REPLACE FUNCTION cron_cleanup_orphaned_sessions()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM cleanup_orphaned_sessions();
END;
$$ LANGUAGE plpgsql;

-- Register the cron job (Deno cron format: second minute hour day month weekday)
-- SELECT cron.schedule('cleanup-orphaned-sessions', '0 * * * *', $$SELECT cron_cleanup_orphaned_sessions()$$);

COMMENT ON INDEX idx_bot_sessions_unique_active IS 'Prevents duplicate active sessions for the same bot+user+conversation';