-- =============================================================================
-- Migration: fix_ranked_feed_v2_order_by
-- Purpose:   Исправить ORDER BY в get_ranked_feed_v2 — использовать final_score
--            для ВСЕХ режимов, т.к. final_score уже корректно вычислен:
--            - smart: ML-weighted score
--            - chronological/following: recency_decay
--            Старый ORDER BY использовал CASE...NULL + fallback на created_at,
--            что работало, но было избыточным и неоптимальным.
-- =============================================================================

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
      AND (
        p_cursor_created_at IS NULL
        OR p.created_at < p_cursor_created_at
        OR (p.created_at = p_cursor_created_at AND p.id < p_cursor_id)
      )
      AND (
        p_mode != 'following'
        OR p.author_id IN (
          SELECT f.following_id
          FROM followers f
          WHERE f.follower_id = p_user_id
        )
      )
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT v_page_size * 3
  ),

  -- ── 2. Affinity scores ────────────────────────────────────────────────────
  affinity AS (
    SELECT ua.author_id, LEAST(ua.affinity_score, 1.0) AS score
    FROM user_author_affinity ua
    WHERE ua.user_id = p_user_id
  ),

  -- ── 3. User interests ─────────────────────────────────────────────────────
  interests AS (
    SELECT ui.interest_tag, LEAST(ui.weight, 1.0) AS weight
    FROM user_interests ui
    WHERE ui.user_id = p_user_id
  ),

  -- ── 4. Post tags ──────────────────────────────────────────────────────────
  post_tags AS (
    SELECT pct.post_id, SUM(COALESCE(i.weight, 0)) AS relevance
    FROM post_content_tags pct
    LEFT JOIN interests i ON i.interest_tag = pct.tag
    WHERE pct.post_id IN (SELECT c.id FROM candidates c)
    GROUP BY pct.post_id
  ),

  -- ── 5. Liked / saved by current user ─────────────────────────────────────
  user_likes AS (
    SELECT pl.post_id FROM post_likes pl WHERE pl.user_id = p_user_id
      AND pl.post_id IN (SELECT c.id FROM candidates c)
  ),
  user_saves AS (
    SELECT sp.post_id FROM saved_posts sp WHERE sp.user_id = p_user_id
      AND sp.post_id IN (SELECT c.id FROM candidates c)
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
  post_media_agg AS (
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
    WHERE pm.post_id IN (SELECT c.id FROM candidates c)
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
      (
        (c.likes_count + c.comments_count * 2 + c.saves_count * 3 + c.shares_count * 4)::float8
        / c.views_count::float8
      ) AS engagement_rate,
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
      COALESCE(pma.media, '[]'::jsonb)                 AS media
    FROM candidates c
    LEFT JOIN affinity a         ON a.author_id = c.author_id
    LEFT JOIN post_tags pt       ON pt.post_id  = c.id
    LEFT JOIN user_likes ul      ON ul.post_id  = c.id
    LEFT JOIN user_saves us      ON us.post_id  = c.id
    LEFT JOIN author_profiles ap ON ap.user_id  = c.author_id
    LEFT JOIN post_media_agg pma ON pma.post_id = c.id
  ),

  -- ── 9. Final score + diversity ───────────────────────────────────────────
  ranked AS (
    SELECT
      s.*,
      CASE
        WHEN p_mode = 'smart' THEN
          s.engagement_rate  * 0.35
          + s.recency_decay  * 0.30
          + s.affinity_score * 0.20
          + s.content_relevance * 0.10
          + CASE
              WHEN LAG(s.author_id, 1) OVER (ORDER BY s.recency_decay DESC) = s.author_id
                OR LAG(s.author_id, 2) OVER (ORDER BY s.recency_decay DESC) = s.author_id
                OR LAG(s.author_id, 3) OVER (ORDER BY s.recency_decay DESC) = s.author_id
              THEN -0.05
              ELSE 0.05
            END
        ELSE
          s.recency_decay
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
  ORDER BY r.final_score DESC NULLS LAST, r.created_at DESC, r.id DESC
  LIMIT v_page_size;
END;
$$;

REVOKE ALL ON FUNCTION get_ranked_feed_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ranked_feed_v2 TO authenticated;
