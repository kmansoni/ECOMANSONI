-- ============================================================================
-- CONSOLIDATED REELS BOOTSTRAP MIGRATION
-- Ensures all reels tables, columns, indexes, and the feed RPC exist.
-- Fully idempotent: safe to run on a fresh DB or an existing one.
-- ============================================================================

-- ── 1. Core reels table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reels (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id      UUID        NOT NULL,
  video_url      TEXT        NOT NULL,
  thumbnail_url  TEXT,
  description    TEXT,
  music_title    TEXT,
  likes_count    INTEGER     DEFAULT 0,
  comments_count INTEGER     DEFAULT 0,
  views_count    INTEGER     DEFAULT 0,
  saves_count    INTEGER     DEFAULT 0,
  reposts_count  INTEGER     DEFAULT 0,
  shares_count   INTEGER     DEFAULT 0,
  duration_seconds FLOAT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Add columns that may be missing on older deployments
DO $$ BEGIN
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS saves_count    INTEGER DEFAULT 0;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS reposts_count  INTEGER DEFAULT 0;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS shares_count   INTEGER DEFAULT 0;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS duration_seconds FLOAT;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'clean';
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS is_nsfw             BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS is_graphic_violence BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS is_political_extremism BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS moderation_notes TEXT;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS moderated_at   TIMESTAMPTZ;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS moderated_by   UUID;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS remix_of       UUID;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS audio_id       UUID;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS speed          FLOAT DEFAULT 1.0;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS captions       JSONB;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS allow_remix    BOOLEAN DEFAULT true;
  ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 2. Engagement tables ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reel_likes (
  id       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id  UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reel_saves (
  id       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id  UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reel_reposts (
  id       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id  UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reel_shares (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id     UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id     UUID,
  target_type TEXT,
  target_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reel_comments (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id    UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL,
  parent_id  UUID        REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  likes_count INTEGER    DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reel_views (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id    UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id    UUID,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Impressions & feedback ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reel_impressions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id           UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id           UUID,
  session_id        TEXT,
  position          INTEGER,
  source            TEXT,
  algorithm_version TEXT,
  score             NUMERIC,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_reel_feedback (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id    UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id    UUID,
  session_id TEXT,
  feedback   TEXT        NOT NULL CHECK (feedback IN ('interested', 'not_interested')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

-- ── 4. ML foundation tables ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_reel_interactions (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL,
  reel_id          UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  watch_duration   FLOAT       DEFAULT 0,
  completion_rate  FLOAT       DEFAULT 0,
  rewatched        BOOLEAN     DEFAULT false,
  skipped_quickly  BOOLEAN     DEFAULT false,
  hidden           BOOLEAN     DEFAULT false,
  reported         BOOLEAN     DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_author_affinity (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL,
  author_id        UUID        NOT NULL,
  affinity_score   NUMERIC     DEFAULT 0,
  views_count      INTEGER     DEFAULT 0,
  likes_count      INTEGER     DEFAULT 0,
  saves_count      INTEGER     DEFAULT 0,
  shares_count     INTEGER     DEFAULT 0,
  comments_count   INTEGER     DEFAULT 0,
  avg_completion_rate FLOAT    DEFAULT 0,
  avg_watch_duration  FLOAT    DEFAULT 0,
  rewatch_count    INTEGER     DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, author_id)
);

-- ── 5. Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reels_author_id ON public.reels (author_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON public.reels (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_moderation_feed ON public.reels (moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_likes_reel_id ON public.reel_likes (reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_user_id ON public.reel_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_reel_saves_reel_id ON public.reel_saves (reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_saves_user_id ON public.reel_saves (user_id);
CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_id ON public.reel_comments (reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_impressions_user ON public.reel_impressions (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reel_impressions_reel ON public.reel_impressions (reel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user ON public.user_reel_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_reel ON public.user_reel_interactions (reel_id);
CREATE INDEX IF NOT EXISTS idx_user_affinity_user ON public.user_author_affinity (user_id);

-- ── 6. RLS policies ────────────────────────────────────────────────────────
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reel_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reel_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_author_affinity ENABLE ROW LEVEL SECURITY;

-- Read-access policies (everyone can read reels, likes, etc.)
DO $$ BEGIN
  CREATE POLICY reels_select_all ON public.reels FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_likes_select_all ON public.reel_likes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_saves_select_all ON public.reel_saves FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_reposts_select_all ON public.reel_reposts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_shares_select_all ON public.reel_shares FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_comments_select_all ON public.reel_comments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_views_select_all ON public.reel_views FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_impressions_select_all ON public.reel_impressions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_reel_feedback_select_all ON public.user_reel_feedback FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_reel_interactions_select_all ON public.user_reel_interactions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_author_affinity_select_all ON public.user_author_affinity FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Write-access policies (authenticated users)
DO $$ BEGIN
  CREATE POLICY reels_insert_auth ON public.reels FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_likes_insert_auth ON public.reel_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_likes_delete_auth ON public.reel_likes FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_saves_insert_auth ON public.reel_saves FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_saves_delete_auth ON public.reel_saves FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_reposts_insert_auth ON public.reel_reposts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_reposts_delete_auth ON public.reel_reposts FOR DELETE TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_shares_insert_auth ON public.reel_shares FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_comments_insert_auth ON public.reel_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_comments_delete_auth ON public.reel_comments FOR DELETE TO authenticated USING (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_views_insert_all ON public.reel_views FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reel_impressions_insert_all ON public.reel_impressions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_reel_feedback_insert_all ON public.user_reel_feedback FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_reel_interactions_insert_all ON public.user_reel_interactions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_author_affinity_insert_all ON public.user_author_affinity FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_author_affinity_update_all ON public.user_author_affinity FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. Enable realtime ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM realtime.subscription WHERE entity = 'public.reels' LIMIT 1
  ) THEN
    -- Best-effort: publication may not exist in all environments
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reels;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 8. Main feed RPC: get_reels_feed_v2 ────────────────────────────────────
-- Deterministic recent-reels feed. Handles missing optional columns gracefully.
-- No dependencies on trending/affinity tables — those are nice-to-have ML layers.
DROP FUNCTION IF EXISTS public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.get_reels_feed_v2(
  p_limit            INTEGER DEFAULT 50,
  p_offset           INTEGER DEFAULT 0,
  p_session_id       TEXT    DEFAULT NULL,
  p_exploration_ratio NUMERIC DEFAULT 0.20,
  p_recency_days     INTEGER DEFAULT 30,
  p_freq_cap_hours   INTEGER DEFAULT 6,
  p_algorithm_version TEXT   DEFAULT 'v2'
)
RETURNS TABLE (
  id                    UUID,
  author_id             UUID,
  video_url             TEXT,
  thumbnail_url         TEXT,
  description           TEXT,
  music_title           TEXT,
  likes_count           INTEGER,
  comments_count        INTEGER,
  views_count           INTEGER,
  saves_count           INTEGER,
  reposts_count         INTEGER,
  shares_count          INTEGER,
  created_at            TIMESTAMPTZ,
  final_score           NUMERIC,
  recommendation_reason TEXT,
  request_id            UUID,
  feed_position         INTEGER,
  algorithm_version     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_request_id UUID := gen_random_uuid();
  v_has_moderation BOOLEAN;
BEGIN
  -- Allow anon access with session_id
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    -- Still allow the call — just return public reels without personalization
    NULL;
  END IF;

  -- Check if moderation columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reels' AND column_name = 'moderation_status'
  ) INTO v_has_moderation;

  IF v_has_moderation THEN
    RETURN QUERY
    SELECT
      r.id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      COALESCE(r.likes_count, 0)::INTEGER,
      COALESCE(r.comments_count, 0)::INTEGER,
      COALESCE(r.views_count, 0)::INTEGER,
      COALESCE(r.saves_count, 0)::INTEGER,
      COALESCE(r.reposts_count, 0)::INTEGER,
      COALESCE(r.shares_count, 0)::INTEGER,
      r.created_at,
      -- Score: blend recency + engagement
      (
        EXTRACT(EPOCH FROM r.created_at) / 1000000.0 +
        COALESCE(r.likes_count, 0) * 1.0 +
        COALESCE(r.comments_count, 0) * 3.0 +
        COALESCE(r.saves_count, 0) * 4.0 +
        COALESCE(r.shares_count, 0) * 5.0
      )::NUMERIC AS final_score,
      'Recent'::TEXT AS recommendation_reason,
      v_request_id,
      (GREATEST(p_offset, 0) + ROW_NUMBER() OVER (ORDER BY r.created_at DESC) - 1)::INTEGER AS feed_position,
      COALESCE(p_algorithm_version, 'v2')::TEXT
    FROM public.reels r
    WHERE r.moderation_status != 'blocked'
      AND r.is_nsfw = false
      AND r.is_graphic_violence = false
      AND r.is_political_extremism = false
    ORDER BY r.created_at DESC
    OFFSET GREATEST(p_offset, 0)
    LIMIT GREATEST(p_limit, 1);
  ELSE
    -- No moderation columns — return all reels
    RETURN QUERY
    SELECT
      r.id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      COALESCE(r.likes_count, 0)::INTEGER,
      COALESCE(r.comments_count, 0)::INTEGER,
      COALESCE(r.views_count, 0)::INTEGER,
      COALESCE(r.saves_count, 0)::INTEGER,
      COALESCE(r.reposts_count, 0)::INTEGER,
      COALESCE(r.shares_count, 0)::INTEGER,
      r.created_at,
      (
        EXTRACT(EPOCH FROM r.created_at) / 1000000.0 +
        COALESCE(r.likes_count, 0) * 1.0 +
        COALESCE(r.comments_count, 0) * 3.0 +
        COALESCE(r.saves_count, 0) * 4.0 +
        COALESCE(r.shares_count, 0) * 5.0
      )::NUMERIC AS final_score,
      'Recent'::TEXT AS recommendation_reason,
      v_request_id,
      (GREATEST(p_offset, 0) + ROW_NUMBER() OVER (ORDER BY r.created_at DESC) - 1)::INTEGER AS feed_position,
      COALESCE(p_algorithm_version, 'v2')::TEXT
    FROM public.reels r
    ORDER BY r.created_at DESC
    OFFSET GREATEST(p_offset, 0)
    LIMIT GREATEST(p_limit, 1);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v2(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated, anon;

-- ── 9. Helper RPCs ─────────────────────────────────────────────────────────

-- Record view (throttled)
CREATE OR REPLACE FUNCTION public.record_reel_view(p_reel_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reel_views (reel_id, user_id)
  VALUES (p_reel_id, auth.uid());
  UPDATE public.reels SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_reel_id;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_view(UUID) TO authenticated, anon;

-- Record impression
CREATE OR REPLACE FUNCTION public.record_reel_impression_v2(
  p_reel_id UUID,
  p_position INTEGER DEFAULT 0,
  p_source TEXT DEFAULT 'feed',
  p_algorithm_version TEXT DEFAULT 'v2',
  p_score NUMERIC DEFAULT 0,
  p_request_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reel_impressions (reel_id, user_id, session_id, position, source, algorithm_version, score)
  VALUES (p_reel_id, auth.uid(), p_session_id, p_position, p_source, p_algorithm_version, p_score);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_impression_v2(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID, TEXT) TO authenticated, anon;

-- Stub RPCs that the client calls (safe no-ops if tables don't exist)
CREATE OR REPLACE FUNCTION public.record_reel_viewed(p_reel_id UUID, p_session_id TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.record_reel_view(p_reel_id); EXCEPTION WHEN OTHERS THEN NULL; END; $$;
GRANT EXECUTE ON FUNCTION public.record_reel_viewed(UUID, TEXT) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.record_reel_watched(p_reel_id UUID, p_duration FLOAT DEFAULT 0, p_completion FLOAT DEFAULT 0, p_session_id TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
  INSERT INTO public.user_reel_interactions (reel_id, user_id, watch_duration, completion_rate)
  VALUES (p_reel_id, auth.uid(), p_duration, p_completion);
EXCEPTION WHEN OTHERS THEN NULL; END; $$;
GRANT EXECUTE ON FUNCTION public.record_reel_watched(UUID, FLOAT, FLOAT, TEXT) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.record_reel_skip(p_reel_id UUID, p_session_id TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
  INSERT INTO public.user_reel_interactions (reel_id, user_id, skipped_quickly)
  VALUES (p_reel_id, auth.uid(), true);
EXCEPTION WHEN OTHERS THEN NULL; END; $$;
GRANT EXECUTE ON FUNCTION public.record_reel_skip(UUID, TEXT) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_reel_feedback(p_reel_id UUID, p_feedback TEXT, p_session_id TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
  INSERT INTO public.user_reel_feedback (reel_id, user_id, session_id, feedback)
  VALUES (p_reel_id, auth.uid(), p_session_id, p_feedback)
  ON CONFLICT (reel_id, user_id) DO UPDATE SET feedback = EXCLUDED.feedback;
EXCEPTION WHEN OTHERS THEN NULL; END; $$;
GRANT EXECUTE ON FUNCTION public.set_reel_feedback(UUID, TEXT, TEXT) TO authenticated, anon;

-- ── 10. Storage bucket ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('reels-media', 'reels-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── Done ────────────────────────────────────────────────────────────────────
