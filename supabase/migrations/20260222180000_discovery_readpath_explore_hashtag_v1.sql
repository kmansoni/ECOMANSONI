-- ============================================================================
-- Discovery read-path v1: Explore page + Hashtag page + Trending hashtags
--
-- Goals (Phase 1):
-- - Provide server-side contracts for Explore/Hashtag discovery.
-- - Reuse existing hashtag/trending system (20260220231000_step2_hashtags_trending_system.sql).
-- - Add minimal moderation gating for hashtags (normal/restricted/hidden).
-- - Add short TTL caching for Explore payload.
--
-- Non-goals:
-- - No breaking changes to existing tables/RPC.
-- - No rewrite of get_reels_feed_v2.
-- ============================================================================

-- 1) Hashtag moderation status (additive)
ALTER TABLE public.hashtags
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hashtags_status_check'
      AND conrelid = 'public.hashtags'::regclass
  ) THEN
    ALTER TABLE public.hashtags
      ADD CONSTRAINT hashtags_status_check
      CHECK (status IN ('normal','restricted','hidden'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_hashtags_status
  ON public.hashtags(status, is_trending, velocity_score DESC);

-- 2) Audit table for status changes (append-only)
CREATE TABLE IF NOT EXISTS public.hashtag_status_changes (
  change_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_id UUID NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','moderator')),
  actor_id UUID,
  reason_codes TEXT[] NOT NULL,
  surface_policy JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hashtag_status_changes_hashtag
  ON public.hashtag_status_changes(hashtag_id, decided_at DESC);

-- 3) Explore cache entries
CREATE TABLE IF NOT EXISTS public.explore_cache_entries (
  cache_key TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'fresh' CHECK (status IN ('fresh','stale','invalidated')),
  payload JSONB NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_explore_cache_entries_expiry
  ON public.explore_cache_entries(expires_at);

-- 4) Trending hashtags RPC (public)
CREATE OR REPLACE FUNCTION public.get_trending_hashtags_v1(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  hashtag TEXT,
  normalized_tag TEXT,
  reels_count INTEGER,
  usage_last_24h INTEGER,
  velocity_score NUMERIC,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.tag AS hashtag,
    h.normalized_tag,
    COALESCE(h.reels_count, 0) AS reels_count,
    COALESCE(h.usage_last_24h, 0) AS usage_last_24h,
    COALESCE(h.velocity_score, 0.0) AS velocity_score,
    h.status
  FROM public.hashtags h
  WHERE h.status = 'normal'
    AND h.is_trending = true
  ORDER BY h.velocity_score DESC NULLS LAST, h.usage_last_24h DESC, h.usage_count DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.get_trending_hashtags_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_hashtags_v1(INTEGER) TO anon, authenticated;

-- 5) Explore page RPC (returns JSONB payload matching docs/contracts explore-page.v1)
CREATE OR REPLACE FUNCTION public.get_explore_page_v1(
  p_segment_id TEXT DEFAULT 'seg_default',
  p_locale TEXT DEFAULT 'ru-RU',
  p_country TEXT DEFAULT NULL,
  p_allow_stale BOOLEAN DEFAULT true,
  p_force_refresh BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_cache_key TEXT;
  v_cached public.explore_cache_entries%ROWTYPE;
  v_ttl_seconds INTEGER := 120;
  v_payload JSONB;
  v_trending JSONB := '[]'::JSONB;
  v_hashtags JSONB := '[]'::JSONB;
  v_creators JSONB := '[]'::JSONB;
  v_categories JSONB := '[]'::JSONB;
  v_recommended JSONB := '[]'::JSONB;
BEGIN
  v_cache_key := 'explore:' || COALESCE(p_segment_id, 'seg_default') || ':' || COALESCE(p_country, 'xx') || ':' || lower(COALESCE(p_locale, 'xx'));

  IF NOT COALESCE(p_force_refresh, false) THEN
    SELECT *
    INTO v_cached
    FROM public.explore_cache_entries
    WHERE cache_key = v_cache_key;

    IF FOUND THEN
      IF v_cached.status = 'fresh' AND v_cached.expires_at > v_now THEN
        RETURN v_cached.payload;
      END IF;

      IF COALESCE(p_allow_stale, true) AND v_cached.payload IS NOT NULL THEN
        -- stale is allowed: return cached payload while async refresh can be done by callers later
        RETURN v_cached.payload;
      END IF;
    END IF;
  END IF;

  -- Section: trending_now (use trending hashtags as trend items)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'trend_id', CONCAT('trend_hashtag_', h.normalized_tag),
      'type', 'hashtag',
      'subject_id', CONCAT('hashtag:', h.normalized_tag),
      'score', LEAST(1.0, GREATEST(0.0, COALESCE(h.velocity_score, 0.0) / 100.0)),
      'window', '24h',
      'generated_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'flags', CASE WHEN COALESCE(h.velocity_score, 0.0) > 0 THEN ARRAY['rank.trust_weighted'] ELSE ARRAY[]::TEXT[] END
    )
  ), '[]'::JSONB)
  INTO v_trending
  FROM (
    SELECT * FROM public.hashtags
    WHERE status = 'normal' AND is_trending = true
    ORDER BY velocity_score DESC NULLS LAST, usage_last_24h DESC
    LIMIT 10
  ) h;

  -- Section: hashtags (refs)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'hashtag', h.normalized_tag,
      'status', h.status,
      'post_count_approx', COALESCE(h.usage_count, 0)
    )
  ), '[]'::JSONB)
  INTO v_hashtags
  FROM (
    SELECT *
    FROM public.hashtags
    WHERE status = 'normal'
    ORDER BY usage_count DESC
    LIMIT 20
  ) h;

  -- Section: fresh_creators (profiles are optional; keep minimal)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='created_at') THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      )
    ), '[]'::JSONB)
    INTO v_creators
    FROM (
      SELECT user_id, display_name, avatar_url
      FROM public.profiles
      ORDER BY created_at DESC
      LIMIT 12
    ) p;
  END IF;

  -- Section: recommended_reels (reuse get_reels_feed_v2)
  BEGIN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'reel_id', r.id::TEXT,
        'author_id', r.author_id::TEXT,
        'thumbnail_url', r.thumbnail_url,
        'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    ), '[]'::JSONB)
    INTO v_recommended
    FROM (
      SELECT *
      FROM public.get_reels_feed_v2(
        20,
        0,
        CONCAT('anon-', v_cache_key),
        0.20,
        30,
        6,
        'v2'
      )
    ) r;
  EXCEPTION WHEN others THEN
    v_recommended := '[]'::JSONB;
  END;

  v_payload := jsonb_build_object(
    'generated_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'sections', jsonb_build_array(
      jsonb_build_object('type','trending_now','title','Trending now','items', v_trending),
      jsonb_build_object('type','hashtags','title','Hashtags','items', v_hashtags),
      jsonb_build_object('type','fresh_creators','title','Fresh creators','items', v_creators),
      jsonb_build_object('type','categories','title','Categories','items', v_categories),
      jsonb_build_object('type','recommended_reels','title', null,'items', v_recommended)
    )
  );

  INSERT INTO public.explore_cache_entries (
    cache_key, segment_id, generated_at, expires_at, status, payload, reason_codes, updated_at
  ) VALUES (
    v_cache_key,
    COALESCE(p_segment_id, 'seg_default'),
    v_now,
    v_now + make_interval(secs => v_ttl_seconds),
    'fresh',
    v_payload,
    ARRAY['feed.page_ok']::TEXT[],
    v_now
  )
  ON CONFLICT (cache_key)
  DO UPDATE SET
    segment_id = EXCLUDED.segment_id,
    generated_at = EXCLUDED.generated_at,
    expires_at = EXCLUDED.expires_at,
    status = EXCLUDED.status,
    payload = EXCLUDED.payload,
    reason_codes = EXCLUDED.reason_codes,
    updated_at = EXCLUDED.updated_at;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_explore_page_v1(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_page_v1(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO anon, authenticated;

-- 6) Hashtag page RPC (returns JSONB payload matching docs/contracts hashtag-page.v1)
CREATE OR REPLACE FUNCTION public.get_hashtag_page_v1(
  p_hashtag TEXT,
  p_section TEXT DEFAULT 'top',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_norm TEXT;
  v_row public.hashtags%ROWTYPE;
  v_status TEXT := 'normal';
  v_items JSONB := '[]'::JSONB;
  v_related JSONB := '[]'::JSONB;
  v_sections JSONB := '[]'::JSONB;
BEGIN
  v_norm := lower(regexp_replace(COALESCE(p_hashtag,''), '^#', ''));
  v_norm := regexp_replace(v_norm, '[^а-яА-ЯёЁa-zA-Z0-9_]+', '', 'g');

  SELECT * INTO v_row
  FROM public.hashtags
  WHERE normalized_tag = v_norm
  LIMIT 1;

  IF FOUND THEN
    v_status := v_row.status;
  ELSE
    v_status := 'normal';
  END IF;

  -- Related tags: top usage, excluding current
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'hashtag', h.normalized_tag,
      'status', h.status,
      'post_count_approx', COALESCE(h.usage_count, 0)
    )
  ), '[]'::JSONB)
  INTO v_related
  FROM (
    SELECT *
    FROM public.hashtags
    WHERE status = 'normal'
      AND normalized_tag <> v_norm
    ORDER BY usage_count DESC
    LIMIT 12
  ) h;

  -- For restricted/hidden tags: suppress reels lists
  IF v_status = 'normal' THEN
    IF COALESCE(p_section,'top') IN ('top','recent','trending') THEN
      IF p_section = 'recent' THEN
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'reel_id', r.id::TEXT,
            'author_id', r.author_id::TEXT,
            'thumbnail_url', r.thumbnail_url,
            'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        ), '[]'::JSONB)
        INTO v_items
        FROM (
          SELECT r.id, r.author_id, r.thumbnail_url, r.created_at
          FROM public.reels r
          JOIN public.reel_hashtags rh ON rh.reel_id = r.id
          JOIN public.hashtags h ON h.id = rh.hashtag_id
          WHERE h.normalized_tag = v_norm
            AND r.moderation_status IS DISTINCT FROM 'blocked'
          ORDER BY r.created_at DESC
          LIMIT GREATEST(1, LEAST(p_limit, 50))
          OFFSET GREATEST(0, COALESCE(p_offset, 0))
        ) r;
      ELSE
        -- top/trending: order by views/likes
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'reel_id', r.id::TEXT,
            'author_id', r.author_id::TEXT,
            'thumbnail_url', r.thumbnail_url,
            'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        ), '[]'::JSONB)
        INTO v_items
        FROM (
          SELECT r.id, r.author_id, r.thumbnail_url, r.created_at
          FROM public.reels r
          JOIN public.reel_hashtags rh ON rh.reel_id = r.id
          JOIN public.hashtags h ON h.id = rh.hashtag_id
          WHERE h.normalized_tag = v_norm
            AND r.moderation_status IS DISTINCT FROM 'blocked'
          ORDER BY COALESCE(r.views_count, 0) DESC, COALESCE(r.likes_count, 0) DESC
          LIMIT GREATEST(1, LEAST(p_limit, 50))
          OFFSET GREATEST(0, COALESCE(p_offset, 0))
        ) r;
      END IF;
    END IF;
  END IF;

  v_sections := jsonb_build_array(
    jsonb_build_object('type', COALESCE(p_section,'top'), 'items', v_items),
    jsonb_build_object('type', 'related_tags', 'items', v_related)
  );

  RETURN jsonb_build_object(
    'hashtag', v_norm,
    'generated_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'status', v_status,
    'sections', v_sections
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_hashtag_page_v1(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hashtag_page_v1(TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
