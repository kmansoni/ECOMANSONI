-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: emergency_signals
-- Source concept: crisis-mesh-messenger / EmergencySignal model (Dart → SQL)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Table stores emergency SOS broadcast signals.
--
-- Security model (Zero-Trust):
--   INSERT: any authenticated user can create their own signal
--   SELECT: any authenticated user can read all active signals
--   UPDATE: only signal owner can UPDATE (to resolve)
--   DELETE: disallowed — use resolved_at for audit trail
--
-- Rate limiting:
--   - max 1 active unresolved signal per user enforced by partial unique index
--   - signals expire 24h after creation via scheduled cleanup function
--
-- Hop metadata mirrors Crisis Mesh Messenger concept:
--   hop_count  = number of relay nodes the signal traversed (0 = direct)
--   route_path = ordered list of device/node ids that relayed the signal
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE emergency_level AS ENUM (
    'critical',   -- Life-threatening
    'high',       -- Urgent help needed
    'medium',     -- Need assistance
    'low'         -- Check-in / safe
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE emergency_signal_type AS ENUM (
    'sos',
    'medical',
    'trapped',
    'danger',
    'safe',
    'need_water',
    'need_food',
    'need_shelter',
    'need_medication',
    'found_survivor'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.emergency_signals (
  id            UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID                   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name   TEXT                   NOT NULL CHECK (char_length(sender_name) BETWEEN 1 AND 100),
  type          emergency_signal_type  NOT NULL,
  level         emergency_level        NOT NULL,
  message       TEXT                   NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
  latitude      DOUBLE PRECISION       CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  longitude     DOUBLE PRECISION       CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  hop_count     SMALLINT               NOT NULL DEFAULT 0 CHECK (hop_count >= 0 AND hop_count <= 50),
  route_path    TEXT[]                 NOT NULL DEFAULT '{}',
  is_active     BOOLEAN                NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ            NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID                   REFERENCES auth.users(id),

  -- Consistency: resolved_at must be set when is_active=false
  CONSTRAINT resolved_state_consistent CHECK (
    (is_active = TRUE  AND resolved_at IS NULL AND resolved_by IS NULL) OR
    (is_active = FALSE AND resolved_at IS NOT NULL)
  )
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary query patterns:
--   1. Fetch all active signals (realtime + initial load)
CREATE INDEX IF NOT EXISTS idx_emergency_signals_active
  ON public.emergency_signals (is_active, created_at DESC)
  WHERE is_active = TRUE;

--   2. User's own active signal lookup
CREATE INDEX IF NOT EXISTS idx_emergency_signals_user_active
  ON public.emergency_signals (user_id, created_at DESC)
  WHERE is_active = TRUE;

-- Partial unique index: enforce max 1 active signal per user
-- (prevents duplicate SOS spam)
CREATE UNIQUE INDEX IF NOT EXISTS uq_emergency_signals_user_active
  ON public.emergency_signals (user_id)
  WHERE is_active = TRUE;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.emergency_signals ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see all active signals
CREATE POLICY "emergency_signals_select"
  ON public.emergency_signals
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Authenticated users can insert their own signals
-- user_id is forced to auth.uid() — client cannot spoof
CREATE POLICY "emergency_signals_insert"
  ON public.emergency_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only the owner can update (resolve) their own signal
CREATE POLICY "emergency_signals_update_own"
  ON public.emergency_signals
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE — audit trail preserved
-- Admins with service_role bypass RLS and can do maintenance deletes

-- ── Auto-expire function ──────────────────────────────────────────────────────
-- Called by pg_cron or Supabase edge function scheduler every hour.
-- Signals older than 24h are automatically resolved to keep the table clean.

CREATE OR REPLACE FUNCTION public.expire_old_emergency_signals()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INT;
BEGIN
  UPDATE public.emergency_signals
  SET
    is_active   = FALSE,
    resolved_at = now(),
    resolved_by = NULL   -- NULL = system-expired
  WHERE
    is_active  = TRUE
    AND created_at < now() - INTERVAL '24 hours';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- Grant execute to service role only (called by scheduler)
REVOKE ALL ON FUNCTION public.expire_old_emergency_signals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_old_emergency_signals() TO service_role;

-- ── Realtime publication ──────────────────────────────────────────────────────
-- Enable Supabase Realtime for this table so useEmergencySignals hook
-- receives live updates via postgres_changes subscription.

ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_signals;

COMMIT;
