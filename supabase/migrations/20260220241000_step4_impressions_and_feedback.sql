-- ============================================================================
-- STEP 4: Impressions + Explicit Feedback ("Interested" / "Not interested")
-- Purpose:
--   - Cold-start learning loop (200-1000 impressions) and frequency capping
--   - Explicit user feedback separate from implicit interactions
-- Supabase-first: tables + RLS + RPC
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) reel_impressions: what we showed to the user (feed exposure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reel_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,

  request_id UUID,
  position INTEGER,
  source TEXT DEFAULT 'reels',
  algorithm_version TEXT,
  score NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_impressions_user_time
  ON public.reel_impressions(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_impressions_session_time
  ON public.reel_impressions(session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_impressions_reel_time
  ON public.reel_impressions(reel_id, created_at DESC);

ALTER TABLE public.reel_impressions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users insert own impressions"
      ON public.reel_impressions
      FOR INSERT
      WITH CHECK (
        (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR
        (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Users view own impressions"
      ON public.reel_impressions
      FOR SELECT
      USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

GRANT SELECT, INSERT ON public.reel_impressions TO authenticated;
GRANT INSERT ON public.reel_impressions TO anon;

-- ============================================================================
-- 2) user_reel_feedback: explicit feedback separate from implicit interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_reel_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,

  feedback TEXT NOT NULL CHECK (feedback IN ('interested', 'not_interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One feedback per (user,reel) OR (session,reel)
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_reel_feedback_user_reel
  ON public.user_reel_feedback(user_id, reel_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_reel_feedback_session_reel
  ON public.user_reel_feedback(session_id, reel_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reel_feedback_user_time
  ON public.user_reel_feedback(user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reel_feedback_reel_time
  ON public.user_reel_feedback(reel_id, updated_at DESC);

ALTER TABLE public.user_reel_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users upsert own feedback"
      ON public.user_reel_feedback
      FOR ALL
      USING (
        (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR
        (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
      )
      WITH CHECK (
        (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR
        (auth.uid() IS NULL AND user_id IS NULL AND session_id IS NOT NULL)
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Users view own feedback"
      ON public.user_reel_feedback
      FOR SELECT
      USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reel_feedback TO authenticated;
GRANT INSERT, UPDATE ON public.user_reel_feedback TO anon;

-- ============================================================================
-- 3) RPC: record impression (writes user_id from auth.uid when available)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_reel_impression(
  p_reel_id UUID,
  p_session_id TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_position INTEGER DEFAULT NULL,
  p_source TEXT DEFAULT 'reels',
  p_algorithm_version TEXT DEFAULT NULL,
  p_score NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'record_reel_impression requires auth or session_id';
  END IF;

  INSERT INTO public.reel_impressions(
    user_id,
    session_id,
    reel_id,
    request_id,
    position,
    source,
    algorithm_version,
    score
  )
  VALUES (
    v_user_id,
    CASE WHEN v_user_id IS NULL THEN p_session_id ELSE NULL END,
    p_reel_id,
    p_request_id,
    p_position,
    p_source,
    p_algorithm_version,
    p_score
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_impression(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_impression(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) TO anon;

-- ============================================================================
-- 4) RPC: set explicit feedback (upsert)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_reel_feedback(
  p_reel_id UUID,
  p_feedback TEXT,
  p_session_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF p_feedback NOT IN ('interested', 'not_interested') THEN
    RAISE EXCEPTION 'Invalid feedback: %', p_feedback;
  END IF;

  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'set_reel_feedback requires auth or session_id';
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.user_reel_feedback(user_id, reel_id, feedback)
    VALUES (v_user_id, p_reel_id, p_feedback)
    ON CONFLICT (user_id, reel_id) WHERE user_id IS NOT NULL
    DO UPDATE SET feedback = EXCLUDED.feedback, updated_at = now();
  ELSE
    INSERT INTO public.user_reel_feedback(user_id, session_id, reel_id, feedback)
    VALUES (NULL, p_session_id, p_reel_id, p_feedback)
    ON CONFLICT (session_id, reel_id) WHERE user_id IS NULL
    DO UPDATE SET feedback = EXCLUDED.feedback, updated_at = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_reel_feedback(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reel_feedback(UUID, TEXT, TEXT) TO anon;
