-- ============================================================================
-- ЭТАП 3: AUDIO TRENDING + DISCOVERY (Supabase-first)
-- Цели:
--  - Превратить reels.music_title (свободный текст) в нормализованный audio layer
--  - Считать тренды по аудио (как Instagram/TikTok) + давать boost
--  - Дать RPC для клиента: trending audios, audio boost score
--  - Подготовить функции для scheduled jobs (cron через Supabase)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) Audio tracks catalog
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audio_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,

  usage_count INTEGER NOT NULL DEFAULT 0,
  reels_count INTEGER NOT NULL DEFAULT 0,

  usage_last_24h INTEGER NOT NULL DEFAULT 0,
  growth_rate_24h NUMERIC NOT NULL DEFAULT 0.0,
  velocity_score NUMERIC NOT NULL DEFAULT 0.0,

  avg_completion_rate NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  avg_saves_per_reel NUMERIC NOT NULL DEFAULT 0.0,
  total_views INTEGER NOT NULL DEFAULT 0,

  is_trending BOOLEAN NOT NULL DEFAULT false,
  trend_level TEXT,
  peaked_at TIMESTAMPTZ,

  first_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_trending
  ON public.audio_tracks(is_trending, velocity_score DESC)
  WHERE is_trending = true;

CREATE INDEX IF NOT EXISTS idx_audio_tracks_usage
  ON public.audio_tracks(usage_count DESC);

COMMENT ON TABLE public.audio_tracks IS 'Нормализованный слой аудио/звуков для рекомендаций и трендов';

-- ============================================================================
-- 2) Link reels -> audio_track (1 reel = 0..1 audio)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reel_audio_tracks (
  reel_id UUID PRIMARY KEY REFERENCES public.reels(id) ON DELETE CASCADE,
  audio_track_id UUID NOT NULL REFERENCES public.audio_tracks(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_audio_tracks_track
  ON public.reel_audio_tracks(audio_track_id, created_at DESC);

COMMENT ON TABLE public.reel_audio_tracks IS 'Связь Reel -> audio_track (для trending audio и boosts)';

-- ============================================================================
-- 3) Normalize function for music_title
-- ============================================================================
CREATE OR REPLACE FUNCTION public.normalize_audio_key(p_title TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  v := lower(btrim(coalesce(p_title, '')));
  v := regexp_replace(v, '^\s*["''`]+|["''`]+\s*$', '', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := regexp_replace(v, '\s*[-–—]+\s*', ' - ', 'g');
  v := btrim(v);
  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.normalize_audio_key IS 'Нормализация music_title в ключ аудио (lower + trim + collapse spaces)';

-- ============================================================================
-- 4) Upsert audio track + link reel
-- ============================================================================
CREATE OR REPLACE FUNCTION public.upsert_reel_audio_link(p_reel_id UUID, p_music_title TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_track_id UUID;
  v_existing UUID;
BEGIN
  v_key := public.normalize_audio_key(p_music_title);

  -- If empty title: remove link if exists.
  IF v_key IS NULL OR length(v_key) = 0 THEN
    SELECT audio_track_id INTO v_existing FROM public.reel_audio_tracks WHERE reel_id = p_reel_id;
    IF v_existing IS NOT NULL THEN
      DELETE FROM public.reel_audio_tracks WHERE reel_id = p_reel_id;
      UPDATE public.audio_tracks
      SET
        usage_count = GREATEST(0, usage_count - 1),
        reels_count = GREATEST(0, reels_count - 1),
        last_used_at = now()
      WHERE id = v_existing;
    END IF;
    RETURN;
  END IF;

  -- If link already points to a track with same key, do nothing.
  SELECT rat.audio_track_id INTO v_existing
  FROM public.reel_audio_tracks rat
  WHERE rat.reel_id = p_reel_id;

  IF v_existing IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.audio_tracks at WHERE at.id = v_existing AND at.normalized_key = v_key) THEN
      RETURN;
    END IF;
    -- Link changed: decrement old track counters
    UPDATE public.audio_tracks
    SET
      usage_count = GREATEST(0, usage_count - 1),
      reels_count = GREATEST(0, reels_count - 1),
      last_used_at = now()
    WHERE id = v_existing;

    DELETE FROM public.reel_audio_tracks WHERE reel_id = p_reel_id;
  END IF;

  -- Upsert track
  INSERT INTO public.audio_tracks(title, normalized_key, usage_count, reels_count, first_used_at, last_used_at)
  VALUES (p_music_title, v_key, 1, 1, now(), now())
  ON CONFLICT (normalized_key) DO UPDATE SET
    title = EXCLUDED.title,
    usage_count = public.audio_tracks.usage_count + 1,
    reels_count = public.audio_tracks.reels_count + 1,
    last_used_at = now()
  RETURNING id INTO v_track_id;

  INSERT INTO public.reel_audio_tracks(reel_id, audio_track_id)
  VALUES (p_reel_id, v_track_id)
  ON CONFLICT (reel_id) DO UPDATE SET
    audio_track_id = EXCLUDED.audio_track_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_reel_audio_link IS 'Создаёт/обновляет связь Reel->audio_track и counters';

-- Auto-link trigger from reels.music_title
CREATE OR REPLACE FUNCTION public.auto_link_reel_audio_from_reels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.upsert_reel_audio_link(NEW.id, NEW.music_title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_reel_audio ON public.reels;
CREATE TRIGGER trg_auto_link_reel_audio
AFTER INSERT OR UPDATE OF music_title ON public.reels
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_reel_audio_from_reels();

-- ============================================================================
-- 5) Trending calculation for audios (cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_audio_trending()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Compute usage windows
  WITH usage_24h AS (
    SELECT rat.audio_track_id, COUNT(*)::INT AS uses_24h
    FROM public.reel_audio_tracks rat
    JOIN public.reels r ON r.id = rat.reel_id
    WHERE r.created_at >= now() - INTERVAL '24 hours'
    GROUP BY rat.audio_track_id
  ),
  usage_prev_24h AS (
    SELECT rat.audio_track_id, COUNT(*)::INT AS uses_prev_24h
    FROM public.reel_audio_tracks rat
    JOIN public.reels r ON r.id = rat.reel_id
    WHERE r.created_at >= now() - INTERVAL '48 hours'
      AND r.created_at < now() - INTERVAL '24 hours'
    GROUP BY rat.audio_track_id
  ),
  completion AS (
    SELECT rat.audio_track_id,
           AVG(uri.completion_rate)::NUMERIC(5,2) AS avg_completion
    FROM public.reel_audio_tracks rat
    JOIN public.user_reel_interactions uri ON uri.reel_id = rat.reel_id
    WHERE uri.viewed = true
      AND uri.last_interaction_at >= now() - INTERVAL '7 days'
    GROUP BY rat.audio_track_id
  ),
  saves AS (
    SELECT rat.audio_track_id,
           AVG(COALESCE(r.saves_count, 0))::NUMERIC AS avg_saves
    FROM public.reel_audio_tracks rat
    JOIN public.reels r ON r.id = rat.reel_id
    WHERE r.created_at >= now() - INTERVAL '30 days'
    GROUP BY rat.audio_track_id
  ),
  views AS (
    SELECT rat.audio_track_id,
           SUM(COALESCE(r.views_count, 0))::INT AS total_views
    FROM public.reel_audio_tracks rat
    JOIN public.reels r ON r.id = rat.reel_id
    GROUP BY rat.audio_track_id
  ),
  scored AS (
    SELECT
      at.id AS audio_track_id,
      COALESCE(u.uses_24h, 0) AS uses_24h,
      COALESCE(p.uses_prev_24h, 0) AS uses_prev_24h,
      CASE
        WHEN COALESCE(p.uses_prev_24h, 0) > 0 THEN ((COALESCE(u.uses_24h, 0)::NUMERIC - p.uses_prev_24h::NUMERIC) / p.uses_prev_24h::NUMERIC) * 100.0
        WHEN COALESCE(u.uses_24h, 0) > 0 THEN 100.0
        ELSE 0.0
      END AS growth_rate_24h,
      (COALESCE(u.uses_24h, 0)::NUMERIC / 24.0) AS velocity_score,
      COALESCE(c.avg_completion, 0.0)::NUMERIC(5,2) AS avg_completion,
      COALESCE(s.avg_saves, 0.0) AS avg_saves,
      COALESCE(v.total_views, 0) AS total_views,
      CASE
        WHEN COALESCE(u.uses_24h, 0) >= 1000 AND (
          CASE WHEN COALESCE(p.uses_prev_24h, 0) > 0 THEN ((COALESCE(u.uses_24h, 0)::NUMERIC - p.uses_prev_24h::NUMERIC) / p.uses_prev_24h::NUMERIC) * 100.0 ELSE 100.0 END
        ) > 200 THEN 'mega'
        WHEN COALESCE(u.uses_24h, 0) >= 500 AND (
          CASE WHEN COALESCE(p.uses_prev_24h, 0) > 0 THEN ((COALESCE(u.uses_24h, 0)::NUMERIC - p.uses_prev_24h::NUMERIC) / p.uses_prev_24h::NUMERIC) * 100.0 ELSE 100.0 END
        ) > 100 THEN 'hot'
        WHEN COALESCE(u.uses_24h, 0) >= 100 AND (
          CASE WHEN COALESCE(p.uses_prev_24h, 0) > 0 THEN ((COALESCE(u.uses_24h, 0)::NUMERIC - p.uses_prev_24h::NUMERIC) / p.uses_prev_24h::NUMERIC) * 100.0 ELSE 100.0 END
        ) > 50 THEN 'rising'
        WHEN COALESCE(u.uses_24h, 0) >= 50 THEN 'stable'
        ELSE 'declining'
      END AS trend_level
    FROM public.audio_tracks at
    LEFT JOIN usage_24h u ON u.audio_track_id = at.id
    LEFT JOIN usage_prev_24h p ON p.audio_track_id = at.id
    LEFT JOIN completion c ON c.audio_track_id = at.id
    LEFT JOIN saves s ON s.audio_track_id = at.id
    LEFT JOIN views v ON v.audio_track_id = at.id
  )
  UPDATE public.audio_tracks at
  SET
    usage_last_24h = scored.uses_24h,
    growth_rate_24h = scored.growth_rate_24h,
    velocity_score = scored.velocity_score,
    avg_completion_rate = scored.avg_completion,
    avg_saves_per_reel = scored.avg_saves,
    total_views = scored.total_views,
    is_trending = (scored.trend_level IN ('mega','hot','rising')),
    trend_level = scored.trend_level,
    peaked_at = CASE
      WHEN scored.trend_level = 'mega' AND (at.peaked_at IS NULL OR scored.uses_24h > at.usage_last_24h) THEN now()
      ELSE at.peaked_at
    END,
    last_calculated_at = now()
  FROM scored
  WHERE at.id = scored.audio_track_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_audio_trending IS 'Пересчёт трендов аудио. Запускать по cron (каждый час) через Supabase scheduled jobs.';

-- ============================================================================
-- 6) RPC: trending audios for UI
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_trending_audio_tracks(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  audio_track_id UUID,
  title TEXT,
  usage_count INTEGER,
  usage_24h INTEGER,
  growth_rate_24h NUMERIC,
  trend_level TEXT,
  avg_completion_rate NUMERIC,
  velocity_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    at.id,
    at.title,
    at.usage_count,
    at.usage_last_24h,
    at.growth_rate_24h,
    at.trend_level,
    at.avg_completion_rate,
    at.velocity_score
  FROM public.audio_tracks at
  WHERE at.is_trending = true
  ORDER BY at.velocity_score DESC, at.growth_rate_24h DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 7) Boost score for reel based on trending audio
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_audio_boost_score(p_reel_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level TEXT;
  v_score NUMERIC := 0.0;
BEGIN
  SELECT at.trend_level
  INTO v_level
  FROM public.reel_audio_tracks rat
  JOIN public.audio_tracks at ON at.id = rat.audio_track_id
  WHERE rat.reel_id = p_reel_id
  LIMIT 1;

  IF v_level IS NULL THEN
    RETURN 0.0;
  END IF;

  v_score := CASE v_level
    WHEN 'mega' THEN 100.0
    WHEN 'hot' THEN 60.0
    WHEN 'rising' THEN 30.0
    WHEN 'stable' THEN 10.0
    ELSE 0.0
  END;

  RETURN LEAST(v_score, 200.0);
END;
$$;

-- ============================================================================
-- 8) RLS + permissions
-- ============================================================================
ALTER TABLE public.audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_audio_tracks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "Public read audio_tracks"
      ON public.audio_tracks
      FOR SELECT
      USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE POLICY "Public read reel_audio_tracks"
      ON public.reel_audio_tracks
      FOR SELECT
      USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

GRANT SELECT ON public.audio_tracks TO authenticated, anon;
GRANT SELECT ON public.reel_audio_tracks TO authenticated, anon;

REVOKE ALL ON FUNCTION public.get_trending_audio_tracks FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_audio_tracks TO authenticated, anon;

REVOKE ALL ON FUNCTION public.get_audio_boost_score FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audio_boost_score TO authenticated, anon;

-- cron functions: only service_role
REVOKE ALL ON FUNCTION public.calculate_audio_trending FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_audio_trending TO service_role;

COMMENT ON SCHEMA public IS 'Reels audio discovery: audio_tracks + reel_audio_tracks + trending calculation + boosts';
