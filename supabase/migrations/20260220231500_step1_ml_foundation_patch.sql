-- ============================================================================
-- PATCH: ЭТАП 1 (ML foundation) — привести схему к нужному виду,
-- даже если таблицы были созданы ранее другими миграциями.
-- Цель: гарантировать наличие ключевых колонок/индексов/политик.
-- ============================================================================

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) user_reel_interactions: расширяем до полного набора сигналов
-- ============================================================================

ALTER TABLE public.user_reel_interactions
  ADD COLUMN IF NOT EXISTS reel_duration_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_rate NUMERIC(5,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS rewatch_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_at_second INTEGER,
  ADD COLUMN IF NOT EXISTS report_reason TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Normalize completion_rate if older schema stored 0..1
DO $$
BEGIN
  -- If completion_rate looks like fraction values, convert them to 0..100 once.
  -- Heuristic: if max completion_rate <= 1.0 then multiply by 100.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_reel_interactions' AND column_name='completion_rate'
  ) THEN
    IF (
      SELECT COALESCE(MAX(completion_rate), 0) <= 1.0
      FROM public.user_reel_interactions
    ) THEN
      UPDATE public.user_reel_interactions
      SET completion_rate = completion_rate * 100.0
      WHERE completion_rate IS NOT NULL;
    END IF;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- table might not exist in some environments
    NULL;
END $$;

-- Ensure negative-signal columns exist
ALTER TABLE public.user_reel_interactions
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reported BOOLEAN DEFAULT false;

-- Indices (idempotent)
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_time
  ON public.user_reel_interactions(user_id, last_interaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_reel
  ON public.user_reel_interactions(reel_id, last_interaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_completion
  ON public.user_reel_interactions(completion_rate DESC)
  WHERE viewed = true;

CREATE INDEX IF NOT EXISTS idx_user_interactions_rewatched
  ON public.user_reel_interactions(user_id)
  WHERE rewatched = true;

CREATE INDEX IF NOT EXISTS idx_interactions_user_completion
  ON public.user_reel_interactions(user_id, completion_rate DESC, last_interaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_negative
  ON public.user_reel_interactions(user_id, reel_id)
  WHERE hidden = true OR reported = true;

-- RLS policies (safe create)
ALTER TABLE public.user_reel_interactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users view own interactions"
      ON public.user_reel_interactions
      FOR SELECT
      USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Users manage own interactions"
      ON public.user_reel_interactions
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================================
-- 2) user_author_affinity: расширяем под продвинутую аналитику
-- ============================================================================

ALTER TABLE public.user_author_affinity
  ADD COLUMN IF NOT EXISTS total_interactions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positive_interactions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_interactions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_completion_rate NUMERIC(5,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS avg_watch_duration NUMERIC(8,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS rewatch_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_interaction_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_score_decay_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_author_affinity_score
  ON public.user_author_affinity(user_id, affinity_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_author_affinity_last_interaction
  ON public.user_author_affinity(user_id, last_interaction_at DESC);

ALTER TABLE public.user_author_affinity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users view own affinity"
      ON public.user_author_affinity
      FOR SELECT
      USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

GRANT SELECT ON public.user_author_affinity TO authenticated;

-- ============================================================================
-- 3) user_session_context: создаём если отсутствует
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_session_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  session_started_at TIMESTAMPTZ DEFAULT now(),
  session_ended_at TIMESTAMPTZ,
  session_duration_seconds INTEGER,
  reels_viewed_count INTEGER DEFAULT 0,
  reels_liked_count INTEGER DEFAULT 0,
  reels_skipped_count INTEGER DEFAULT 0,
  reels_completed_count INTEGER DEFAULT 0,
  skip_streak INTEGER DEFAULT 0,
  avg_completion_rate NUMERIC(5,2) DEFAULT 0.0,
  device_type TEXT,
  platform TEXT,
  time_of_day TEXT,
  session_preferred_topics TEXT[],
  session_preferred_authors UUID[],
  session_avoided_topics TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_context_user
  ON public.user_session_context(user_id, session_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_context_active
  ON public.user_session_context(user_id)
  WHERE session_ended_at IS NULL;

ALTER TABLE public.user_session_context ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users view own sessions"
      ON public.user_session_context
      FOR SELECT
      USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Users manage own sessions"
      ON public.user_session_context
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.user_session_context TO authenticated;

-- ============================================================================
-- 4) Ensure record_reel_interaction exists with full signals
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_reel_interaction(
  p_user_id UUID,
  p_reel_id UUID,
  p_watch_duration_seconds INTEGER DEFAULT 0,
  p_reel_duration_seconds INTEGER DEFAULT 0,
  p_liked BOOLEAN DEFAULT false,
  p_saved BOOLEAN DEFAULT false,
  p_shared BOOLEAN DEFAULT false,
  p_commented BOOLEAN DEFAULT false,
  p_skipped_at_second INTEGER DEFAULT NULL,
  p_hidden BOOLEAN DEFAULT false,
  p_reported BOOLEAN DEFAULT false,
  p_report_reason TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completion_rate NUMERIC;
  v_skipped_quickly BOOLEAN := false;
  v_rewatched BOOLEAN := false;
BEGIN
  IF p_reel_duration_seconds > 0 THEN
    v_completion_rate := (p_watch_duration_seconds::NUMERIC / p_reel_duration_seconds::NUMERIC) * 100.0;
  ELSE
    v_completion_rate := 0.0;
  END IF;

  IF p_skipped_at_second IS NOT NULL AND p_skipped_at_second < 2 THEN
    v_skipped_quickly := true;
  END IF;

  IF v_completion_rate > 100 THEN
    v_rewatched := true;
  END IF;

  INSERT INTO public.user_reel_interactions (
    user_id,
    reel_id,
    viewed,
    watch_duration_seconds,
    reel_duration_seconds,
    completion_rate,
    liked,
    saved,
    shared,
    commented,
    skipped_quickly,
    skipped_at_second,
    hidden,
    reported,
    report_reason,
    rewatched,
    rewatch_count,
    session_id,
    first_view_at,
    last_interaction_at
  )
  VALUES (
    p_user_id,
    p_reel_id,
    true,
    p_watch_duration_seconds,
    p_reel_duration_seconds,
    v_completion_rate,
    p_liked,
    p_saved,
    p_shared,
    p_commented,
    v_skipped_quickly,
    p_skipped_at_second,
    p_hidden,
    p_reported,
    p_report_reason,
    v_rewatched,
    CASE WHEN v_rewatched THEN 1 ELSE 0 END,
    p_session_id,
    now(),
    now()
  )
  ON CONFLICT (user_id, reel_id) DO UPDATE SET
    viewed = true,
    watch_duration_seconds = GREATEST(public.user_reel_interactions.watch_duration_seconds, EXCLUDED.watch_duration_seconds),
    reel_duration_seconds = GREATEST(public.user_reel_interactions.reel_duration_seconds, EXCLUDED.reel_duration_seconds),
    completion_rate = GREATEST(public.user_reel_interactions.completion_rate, EXCLUDED.completion_rate),
    liked = public.user_reel_interactions.liked OR EXCLUDED.liked,
    saved = public.user_reel_interactions.saved OR EXCLUDED.saved,
    shared = public.user_reel_interactions.shared OR EXCLUDED.shared,
    commented = public.user_reel_interactions.commented OR EXCLUDED.commented,
    hidden = public.user_reel_interactions.hidden OR EXCLUDED.hidden,
    reported = public.user_reel_interactions.reported OR EXCLUDED.reported,
    report_reason = COALESCE(public.user_reel_interactions.report_reason, EXCLUDED.report_reason),
    rewatched = public.user_reel_interactions.rewatched OR EXCLUDED.rewatched,
    rewatch_count = public.user_reel_interactions.rewatch_count + CASE WHEN EXCLUDED.rewatched THEN 1 ELSE 0 END,
    skipped_quickly = public.user_reel_interactions.skipped_quickly OR EXCLUDED.skipped_quickly,
    skipped_at_second = COALESCE(EXCLUDED.skipped_at_second, public.user_reel_interactions.skipped_at_second),
    session_id = COALESCE(EXCLUDED.session_id, public.user_reel_interactions.session_id),
    last_interaction_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_reel_interaction(
  uuid,
  uuid,
  integer,
  integer,
  boolean,
  boolean,
  boolean,
  boolean,
  integer,
  boolean,
  boolean,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_reel_interaction(
  uuid,
  uuid,
  integer,
  integer,
  boolean,
  boolean,
  boolean,
  boolean,
  integer,
  boolean,
  boolean,
  text,
  text
) TO authenticated;
