-- ============================================================================
-- REELS ENGINE: Journal Contract v1.0 (P1)
--
-- Adds formal, testable fields for:
--  - status semantics (rejected vs suppressed vs rate_limited)
--  - reason_code + decision_source
--  - pipeline suppression snapshot BEFORE decision
-- ============================================================================

ALTER TABLE public.reels_engine_action_journal
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS decision_source TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_is_suppressed_before BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pipeline_suppressed_at_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pipeline_suppressed_until_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pipeline_suppression_reason_before TEXT;

CREATE INDEX IF NOT EXISTS idx_reels_engine_action_journal_reason_code
  ON public.reels_engine_action_journal(environment, reason_code, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_reels_engine_action_journal_decision_source
  ON public.reels_engine_action_journal(environment, decision_source, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_reels_engine_action_journal_pipeline_before
  ON public.reels_engine_action_journal(environment, segment_key, pipeline_is_suppressed_before, decided_at DESC);
