-- ============================================================================
-- STEP 9: Performance indexes for feed / analytics
--
-- Adds missing indexes used by get_reels_feed_v2 and creator insights.
-- Safe/idempotent.
-- ============================================================================

-- reel_impressions lookups by viewer and time
CREATE INDEX IF NOT EXISTS idx_reel_impressions_user_reel_time
  ON public.reel_impressions(user_id, reel_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_impressions_session_reel_time
  ON public.reel_impressions(session_id, reel_id, created_at DESC)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reel_impressions_created_at
  ON public.reel_impressions(created_at DESC);

-- user_reel_feedback viewer lookups
CREATE INDEX IF NOT EXISTS idx_user_reel_feedback_user_reel
  ON public.user_reel_feedback(user_id, reel_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reel_feedback_session_reel
  ON public.user_reel_feedback(session_id, reel_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL;

-- user_reel_interactions used in creator insights + global completion query
CREATE INDEX IF NOT EXISTS idx_user_reel_interactions_reel_completion
  ON public.user_reel_interactions(reel_id, completion_rate DESC)
  WHERE completion_rate > 0;

CREATE INDEX IF NOT EXISTS idx_user_reel_interactions_reel_last
  ON public.user_reel_interactions(reel_id, last_interaction_at DESC);

-- reels recency filter
CREATE INDEX IF NOT EXISTS idx_reels_created_at_id
  ON public.reels(created_at DESC, id);
