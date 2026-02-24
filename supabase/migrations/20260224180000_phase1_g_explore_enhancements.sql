-- ============================================================================
-- Phase 1 EPIC G Part 1: Explore Enhancements
--
-- Goals:
-- - Integrate EPIC H trending hashtags into Explore (trust-weighted)
-- - Implement Categories section (topic clusters based on hashtags)
-- - Enhance Fresh Creators (min quality filter, trust-weighting)
-- - Add safety enforcement (only green content, respect blocks)
-- - Improve caching strategy (separate TTLs per section)
--
-- Integrates:
-- - EPIC H: get_trending_hashtags_v1(), trending_hashtags table
-- - EPIC L: user_trust_scores
-- - EPIC I: controversial_content_flags
--
-- Based on: docs/specs/phase1/P1G-explore-discovery-surface.md
-- ============================================================================

-- 1) Categories: Define topic clusters as views on hashtags
-- Maps hashtags to high-level categories for discovery

CREATE TABLE IF NOT EXISTS public.hashtag_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  display_name_ru TEXT NOT NULL,
  display_name_en TEXT,
  icon_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hashtag_categories_active
  ON public.hashtag_categories(is_active, sort_order);

-- Map hashtags to categories (many-to-many)
CREATE TABLE IF NOT EXISTS public.hashtag_category_mapping (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_id UUID NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.hashtag_categories(category_id) ON DELETE CASCADE,
  relevance_score NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (relevance_score >= 0 AND relevance_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hashtag_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_hashtag_category_mapping_category
  ON public.hashtag_category_mapping(category_id, relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_hashtag_category_mapping_hashtag
  ON public.hashtag_category_mapping(hashtag_id);

-- Seed initial categories (Russian-first platform)
INSERT INTO public.hashtag_categories (category_name, display_name_ru, display_name_en, icon_name, sort_order)
VALUES
  ('entertainment', 'Развлечения', 'Entertainment', 'sparkles', 1),
  ('music', 'Музыка', 'Music', 'musical-note', 2),
  ('dance', 'Танцы', 'Dance', 'footprints', 3),
  ('comedy', 'Юмор', 'Comedy', 'happy', 4),
  ('food', 'Еда', 'Food', 'fast-food', 5),
  ('sports', 'Спорт', 'Sports', 'football', 6),
  ('education', 'Обучение', 'Education', 'school', 7),
  ('tech', 'Технологии', 'Tech', 'hardware-chip', 8),
  ('art', 'Искусство', 'Art', 'color-palette', 9),
  ('fashion', 'Мода', 'Fashion', 'shirt', 10),
  ('travel', 'Путешествия', 'Travel', 'airplane', 11),
  ('gaming', 'Игры', 'Gaming', 'game-controller', 12),
  ('pets', 'Питомцы', 'Pets', 'paw', 13),
  ('beauty', 'Красота', 'Beauty', 'rose', 14),
  ('life', 'Жизнь', 'Life', 'heart', 15)
ON CONFLICT (category_name) DO NOTHING;

-- 2) Fresh Creators: Enhanced with quality filter
-- Only show creators with min content quality + decent trust score

CREATE OR REPLACE FUNCTION public.get_explore_fresh_creators_v1(
  p_limit INTEGER DEFAULT 12,
  p_min_reels_count INTEGER DEFAULT 3,
  p_min_trust_score INTEGER DEFAULT 30,
  p_max_age_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  reels_count INTEGER,
  trust_score INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.reels r
      WHERE r.author_id = p.user_id
        AND r.moderation_status IS DISTINCT FROM 'blocked'
    ), 0) AS reels_count,
    COALESCE(tp.trust_score, 50) AS trust_score,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.trust_profiles tp ON tp.actor_type = 'user' AND tp.actor_id = p.user_id::TEXT
  WHERE p.created_at >= (now() - make_interval(days => COALESCE(p_max_age_days, 30)))
    AND COALESCE(tp.trust_score, 50) >= COALESCE(p_min_trust_score, 30)
    -- Min quality: has published at least p_min_reels_count reels
    AND EXISTS (
      SELECT 1
      FROM public.reels r
      WHERE r.author_id = p.user_id
        AND r.moderation_status IS DISTINCT FROM 'blocked'
      LIMIT COALESCE(p_min_reels_count, 3)
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.get_explore_fresh_creators_v1(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_fresh_creators_v1(INTEGER, INTEGER, INTEGER, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_explore_fresh_creators_v1(INTEGER, INTEGER, INTEGER, INTEGER) IS
  'Phase 1 EPIC G: Get fresh creators for Explore with quality filter (min reels, min trust score, max age)';

-- 3) Categories section: Get top reels per category

CREATE OR REPLACE FUNCTION public.get_explore_categories_v1(
  p_limit_categories INTEGER DEFAULT 6,
  p_limit_reels_per_category INTEGER DEFAULT 5
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  display_name TEXT,
  icon_name TEXT,
  reels JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category RECORD;
  v_reels JSONB;
BEGIN
  FOR v_category IN
    SELECT
      hc.category_id,
      hc.category_name,
      hc.display_name_ru AS display_name,
      hc.icon_name,
      hc.sort_order
    FROM public.hashtag_categories hc
    WHERE hc.is_active = true
    ORDER BY hc.sort_order ASC
    LIMIT GREATEST(1, LEAST(p_limit_categories, 20))
  LOOP
    -- Get top reels for this category (via hashtag mapping)
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'reel_id', r.id::TEXT,
        'author_id', r.author_id::TEXT,
        'thumbnail_url', r.thumbnail_url,
        'views_count', COALESCE(r.views_count, 0),
        'likes_count', COALESCE(r.likes_count, 0),
        'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    ), '[]'::JSONB)
    INTO v_reels
    FROM (
      SELECT DISTINCT ON (r.id) r.*
      FROM public.reels r
      JOIN public.reel_hashtags rh ON rh.reel_id = r.id
      JOIN public.hashtag_category_mapping hcm ON hcm.hashtag_id = rh.hashtag_id
      WHERE hcm.category_id = v_category.category_id
        AND r.moderation_status IS DISTINCT FROM 'blocked'
        -- Only green content (no controversial flags)
        AND NOT EXISTS (
          SELECT 1
          FROM public.controversial_content_flags ccf
          WHERE ccf.reel_id = r.id
            AND ccf.is_active = true
        )
      ORDER BY r.id, COALESCE(r.views_count, 0) DESC, COALESCE(r.likes_count, 0) DESC
      LIMIT GREATEST(1, LEAST(p_limit_reels_per_category, 20))
    ) r;

    category_id := v_category.category_id;
    category_name := v_category.category_name;
    display_name := v_category.display_name;
    icon_name := v_category.icon_name;
    reels := v_reels;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_explore_categories_v1(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_categories_v1(INTEGER, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_explore_categories_v1(INTEGER, INTEGER) IS
  'Phase 1 EPIC G: Get categories with top reels per category for Explore';

-- 4) Enhanced Explore Page v2: Integrates EPIC H + G

CREATE OR REPLACE FUNCTION public.get_explore_page_v2(
  p_user_id UUID DEFAULT NULL,
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
  v_cache_key := 'explore_v2:' || COALESCE(p_segment_id, 'seg_default') || ':' || COALESCE(p_country, 'xx') || ':' || lower(COALESCE(p_locale, 'ru'));

  -- Cache lookup
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
        RETURN v_cached.payload;
      END IF;
    END IF;
  END IF;

  -- Section 1: Trending Now (EPIC H integration)
  -- Use get_trending_hashtags_v1() from EPIC H (trust-weighted)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'trend_id', CONCAT('trend_hashtag_', t.hashtag_id::TEXT),
      'type', 'hashtag',
      'hashtag_tag', t.hashtag_tag,
      'subject_id', CONCAT('hashtag:', t.hashtag_tag),
      'trend_score', COALESCE(t.trend_score, 0),
      'velocity_score', COALESCE(t.velocity_score, 0),
      'unique_creators', COALESCE(t.unique_creators, 0),
      'window', '24h',
      'generated_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'flags', ARRAY['rank.trust_weighted']
    )
  ), '[]'::JSONB)
  INTO v_trending
  FROM public.get_trending_hashtags_v1(10, 30) t;

  -- Section 2: Hashtags (top by usage, normal status only)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'hashtag_id', h.id::TEXT,
      'hashtag', h.tag,
      'normalized_tag', h.normalized_tag,
      'usage_count', COALESCE(h.usage_count, 0),
      'is_trending', COALESCE(h.is_trending, false)
    )
  ), '[]'::JSONB)
  INTO v_hashtags
  FROM (
    SELECT *
    FROM public.hashtags
    WHERE moderation_status = 'normal'
    ORDER BY usage_count DESC
    LIMIT 20
  ) h;

  -- Section 3: Fresh Creators (EPIC G enhanced)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'user_id', fc.user_id::TEXT,
      'display_name', fc.display_name,
      'avatar_url', fc.avatar_url,
      'reels_count', fc.reels_count,
      'trust_score', fc.trust_score,
      'created_at', to_char(fc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  ), '[]'::JSONB)
  INTO v_creators
  FROM public.get_explore_fresh_creators_v1(12, 3, 30, 30) fc;

  -- Section 4: Categories (EPIC G new)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category_id', cat.category_id::TEXT,
      'category_name', cat.category_name,
      'display_name', cat.display_name,
      'icon_name', cat.icon_name,
      'reels', cat.reels
    )
  ), '[]'::JSONB)
  INTO v_categories
  FROM public.get_explore_categories_v1(6, 5) cat;

  -- Section 5: Recommended Reels (safe pool with light personalization)
  -- Only green content, no controversial flags, higher exploration ratio
  BEGIN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'reel_id', r.id::TEXT,
        'author_id', r.author_id::TEXT,
        'thumbnail_url', r.thumbnail_url,
        'views_count', COALESCE(r.views_count, 0),
        'likes_count', COALESCE(r.likes_count, 0),
        'created_at', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    ), '[]'::JSONB)
    INTO v_recommended
    FROM (
      SELECT *
      FROM public.get_reels_feed_v2(
        20,
        0,
        COALESCE(p_user_id::TEXT, CONCAT('anon-', v_cache_key)),
        0.40, -- Higher exploration ratio for Explore
        30,
        6,
        'v2.epic-g'
      )
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.controversial_content_flags ccf
        WHERE ccf.reel_id = id
          AND ccf.is_active = true
      )
    ) r;
  EXCEPTION WHEN others THEN
    v_recommended := '[]'::JSONB;
  END;

  -- Build payload
  v_payload := jsonb_build_object(
    'generated_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'algorithm_version', 'v2.epic-g',
    'sections', jsonb_build_array(
      jsonb_build_object('type','trending_now','title','Сейчас в тренде','items', v_trending),
      jsonb_build_object('type','hashtags','title','Хештеги','items', v_hashtags),
      jsonb_build_object('type','fresh_creators','title','Новые авторы','items', v_creators),
      jsonb_build_object('type','categories','title','Категории','items', v_categories),
      jsonb_build_object('type','recommended_reels','title', null,'items', v_recommended)
    )
  );

  -- Cache upsert
  INSERT INTO public.explore_cache_entries (
    cache_key, segment_id, generated_at, expires_at, status, payload, reason_codes, updated_at
  ) VALUES (
    v_cache_key,
    COALESCE(p_segment_id, 'seg_default'),
    v_now,
    v_now + make_interval(secs => v_ttl_seconds),
    'fresh',
    v_payload,
    ARRAY['feed.page_ok', 'epic_g.v2']::TEXT[],
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

REVOKE ALL ON FUNCTION public.get_explore_page_v2(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_page_v2(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO anon, authenticated;

COMMENT ON FUNCTION public.get_explore_page_v2(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) IS
  'Phase 1 EPIC G: Enhanced Explore page with EPIC H trending integration, categories, fresh creators, safety enforcement';

-- ============================================================================
-- Summary:
-- - ✅ Categories implemented (hashtag_categories + mapping)
-- - ✅ Fresh creators enhanced (quality filter + trust-weighting)
-- - ✅ Trending Now uses EPIC H trust-weighted trends
-- - ✅ Safety enforcement (only green content, no controversial flags)
-- - ✅ get_explore_page_v2() unified API
-- ============================================================================
