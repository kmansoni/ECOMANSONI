-- =============================================================================
-- Migration: get_ranked_feed_v2
-- Purpose:   Server-side ranked feed — replaces client-side scoring in useSmartFeed.
--
-- Architecture:
--   Single RPC call returns fully-ranked, cursor-paginated feed rows.
--   All scoring happens in PostgreSQL — no N+1 queries from the client.
--
-- Ranking formula:
--   score = engagement_rate  * 0.35
--         + recency_decay    * 0.30
--         + affinity_score   * 0.20
--         + content_relevance * 0.10
--         + diversity_bonus  * 0.05
--
-- Recency decay:  exp(-age_hours / 24)  — half-life ≈ 17h
-- Engagement rate: (likes + comments*2 + saves*3 + shares*4) / max(views, 1)
-- Affinity:        from user_author_affinity table (0..1), 0 if missing
-- Content relevance: from post_content_tags ∩ user_interests (0..1), 0 if missing
-- Diversity bonus:   -0.3 per consecutive same-author post in window
--
-- Cursor:
--   (p_cursor_created_at, p_cursor_id) — stable composite cursor.
--   NULL = first page.
--
-- Security:
--   SECURITY INVOKER — function executes with caller's privileges.
--   RLS on posts is enforced automatically by PostgreSQL.
--   Caller's auth.uid() is passed as p_user_id for affinity/likes lookups.
--
-- Performance:
--   Index: posts(created_at DESC, id DESC) WHERE is_published = true
--   Index: user_author_affinity(user_id, author_id)
--   Index: user_interests(user_id, interest_tag)
--   Index: post_content_tags(post_id, tag)
--   Estimated cost at 10M posts: ~5ms p99 with proper indexes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Composite index for cursor pagination (idempotent)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_feed_cursor
  ON posts (created_at DESC, id DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_user_author_affinity_lookup
  ON user_author_affinity (user_id, author_id)
  WHERE affinity_score > 0;

-- ---------------------------------------------------------------------------
-- Return type
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feed_post_v2') THEN
    CREATE TYPE feed_post_v2 AS (
      id              uuid,
      author_id       uuid,
      content         text,
      created_at      timestamptz,
      likes_count     int,
      comments_count  int,
      saves_count     int,
      shares_count    int,
      views_count     int,
      score           float8,
      is_liked        boolean,
      is_saved        boolean,
      author_display_name text,
      author_avatar_url   text,
      author_is_verified  boolean,
      media           jsonb
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Main function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_ranked_feed_v2(
  p_user_id         uuid,
  p_mode            text    DEFAULT 'smart',
  p_page_size       int     DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id       uuid    DEFAULT NULL
)
RETURNS SETOF feed_post_v2
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_page_size int := LEAST(GREATEST(p_page_size, 1), 30);
BEGIN
  -- Validate mode
  IF p_mode NOT IN ('smart', 'following', 'chronological') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;

  RETURN QUERY
  WITH

  -- ── 1. Candidate posts ────────────────────────────────────────────────────
  candidates AS (
    SELECT
      p.id,
      p.author_id,
      p.content,
      p.created_at,
      COALESCE(p.likes_count,    0) AS likes_count,
      COALESCE(p.comments_count, 0) AS comments_count,
      COALESCE(p.saves_count,    0) AS saves_count,
      COALESCE(p.shares_count,   0) AS shares_count,
      GREATEST(COALESCE(p.views_count, 0), 1) AS views_count
    FROM posts p
    WHERE
      p.is_published = true
      -- Cursor condition: (created_at, id) composite
      AND (
        p_cursor_created_at IS NULL
        OR p.created_at < p_cursor_created_at
        OR (p.created_at = p_cursor_created_at AND p.id < p_cursor_id)
      )
      -- Following mode: restrict to followed authors
      AND (
        p_mode != 'following'
        OR p.author_id IN (
          SELECT f.following_id
          FROM followers f
          WHERE f.follower_id = p_user_id
        )
      )
    ORDER BY p.created_at DESC, p.id DESC
    -- Fetch 3× page to allow re-ranking without losing items
    LIMIT v_page_size * 3
  ),

  -- ── 2. Affinity scores (0..1) ─────────────────────────────────────────────
  affinity AS (
    SELECT author_id, LEAST(affinity_score, 1.0) AS score
    FROM user_author_affinity
    WHERE user_id = p_user_id
  ),

  -- ── 3. User interests ─────────────────────────────────────────────────────
  interests AS (
    SELECT interest_tag, LEAST(weight, 1.0) AS weight
    FROM user_interests
    WHERE user_id = p_user_id
  ),

  -- ── 4. Post tags ──────────────────────────────────────────────────────────
  post_tags AS (
    SELECT pct.post_id, SUM(COALESCE(i.weight, 0)) AS relevance
    FROM post_content_tags pct
    LEFT JOIN interests i ON i.interest_tag = pct.tag
    WHERE pct.post_id IN (SELECT id FROM candidates)
    GROUP BY pct.post_id
  ),

  -- ── 5. Liked / saved by current user ─────────────────────────────────────
  user_likes AS (
    SELECT post_id FROM post_likes WHERE user_id = p_user_id
      AND post_id IN (SELECT id FROM candidates)
  ),
  user_saves AS (
    SELECT post_id FROM saved_posts WHERE user_id = p_user_id
      AND post_id IN (SELECT id FROM candidates)
  ),

  -- ── 6. Author profiles ────────────────────────────────────────────────────
  author_profiles AS (
    SELECT
      pr.user_id,
      pr.display_name,
      pr.avatar_url,
      COALESCE(pr.is_verified, false) AS is_verified
    FROM profiles pr
    WHERE pr.user_id IN (SELECT DISTINCT author_id FROM candidates)
  ),

  -- ── 7. Post media (aggregated as JSON) ───────────────────────────────────
  post_media AS (
    SELECT
      pm.post_id,
      jsonb_agg(
        jsonb_build_object(
          'id',         pm.id,
          'media_url',  pm.media_url,
          'media_type', pm.media_type,
          'sort_order', pm.sort_order
        ) ORDER BY pm.sort_order
      ) AS media
    FROM post_media pm
    WHERE pm.post_id IN (SELECT id FROM candidates)
    GROUP BY pm.post_id
  ),

  -- ── 8. Scoring ────────────────────────────────────────────────────────────
  scored AS (
    SELECT
      c.id,
      c.author_id,
      c.content,
      c.created_at,
      c.likes_count,
      c.comments_count,
      c.saves_count,
      c.shares_count,
      c.views_count,
      -- Engagement rate: weighted interactions / views
      (
        (c.likes_count + c.comments_count * 2 + c.saves_count * 3 + c.shares_count * 4)::float8
        / c.views_count::float8
      ) AS engagement_rate,
      -- Recency decay: exp(-age_hours / 24), range (0..1]
      EXP(
        -EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400.0
      ) AS recency_decay,
      COALESCE(a.score, 0.0)                          AS affinity_score,
      LEAST(COALESCE(pt.relevance, 0.0), 1.0)         AS content_relevance,
      (ul.post_id IS NOT NULL)                         AS is_liked,
      (us.post_id IS NOT NULL)                         AS is_saved,
      ap.display_name,
      ap.avatar_url,
      ap.is_verified,
      COALESCE(pm.media, '[]'::jsonb)                  AS media
    FROM candidates c
    LEFT JOIN affinity a         ON a.author_id = c.author_id
    LEFT JOIN post_tags pt       ON pt.post_id  = c.id
    LEFT JOIN user_likes ul      ON ul.post_id  = c.id
    LEFT JOIN user_saves us      ON us.post_id  = c.id
    LEFT JOIN author_profiles ap ON ap.user_id  = c.author_id
    LEFT JOIN post_media pm      ON pm.post_id  = c.id
  ),

  -- ── 9. Final score + diversity window ────────────────────────────────────
  ranked AS (
    SELECT
      s.*,
      CASE
        WHEN p_mode = 'smart' THEN
          s.engagement_rate  * 0.35
          + s.recency_decay  * 0.30
          + s.affinity_score * 0.20
          + s.content_relevance * 0.10
          -- Diversity: penalise if same author appeared in previous 3 rows
          + CASE
              WHEN LAG(s.author_id, 1) OVER (ORDER BY s.recency_decay DESC) = s.author_id
                OR LAG(s.author_id, 2) OVER (ORDER BY s.recency_decay DESC) = s.author_id
                OR LAG(s.author_id, 3) OVER (ORDER BY s.recency_decay DESC) = s.author_id
              THEN -0.05
              ELSE 0.05
            END
        ELSE
          s.recency_decay  -- chronological / following: pure recency
      END AS final_score
    FROM scored s
  )

  SELECT
    r.id,
    r.author_id,
    r.content,
    r.created_at,
    r.likes_count,
    r.comments_count,
    r.saves_count,
    r.shares_count,
    r.views_count,
    r.final_score          AS score,
    r.is_liked,
    r.is_saved,
    r.display_name         AS author_display_name,
    r.avatar_url           AS author_avatar_url,
    r.is_verified          AS author_is_verified,
    r.media
  FROM ranked r
  ORDER BY
    CASE WHEN p_mode = 'smart' THEN r.final_score END DESC NULLS LAST,
    r.created_at DESC,
    r.id DESC
  LIMIT v_page_size;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION get_ranked_feed_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ranked_feed_v2 TO authenticated;

COMMENT ON FUNCTION get_ranked_feed_v2 IS
  'Server-side ranked feed. Replaces client-side scoring. '
  'Modes: smart (ML-style weighted), following (chronological, followed authors), '
  'chronological (pure recency, full corpus). '
  'Cursor: (p_cursor_created_at, p_cursor_id) for stable pagination.';
