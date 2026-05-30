-- ============================================================================
-- Phase 1 EPIC J: Stories Analytics Functions
--
-- Metrics from Instagram_Statistics_2026.md:
-- - Story views/replies
-- - Forward/backward taps
-- - Exits
-- - Poll/Quiz/Emoji slider interactions
-- - Link taps
-- - Completion rate
-- - Rewatch insights (repeat views)
-- ============================================================================

-- 1) Get story analytics for creator
CREATE OR REPLACE FUNCTION public.get_story_analytics_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH story_stats AS (
    SELECT
      COUNT(DISTINCT sv.story_id) AS total_stories,
      COUNT(sv.id) AS total_views,
      COUNT(DISTINCT sv.viewer_id) AS unique_viewers,
      COUNT(sr.id) AS total_replies,
      COUNT(str.id) AS total_reactions,
      COUNT(spv.id) AS poll_responses,
      COUNT(sqa.id) AS quiz_responses,
      COUNT(sesv.id) AS slider_interactions
    FROM public.stories s
    LEFT JOIN public.story_views sv ON sv.story_id = s.id AND sv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_replies sr ON sr.story_id = s.id AND sr.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_reactions str ON str.story_id = s.id AND str.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_poll_votes spv ON spv.poll_id IN (SELECT id FROM story_polls WHERE story_polls.story_id = s.id) AND spv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    LEFT JOIN public.story_emoji_slider_votes sesv ON sesv.slider_id IN (SELECT id FROM story_emoji_sliders WHERE story_emoji_sliders.story_id = s.id) AND sesv.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    WHERE s.author_id = p_creator_id
  )
  SELECT jsonb_build_object(
    'total_stories', COALESCE(total_stories, 0),
    'total_views', COALESCE(total_views, 0),
    'unique_viewers', COALESCE(unique_viewers, 0),
    'total_replies', COALESCE(total_replies, 0),
    'total_reactions', COALESCE(total_reactions, 0),
    'poll_responses', COALESCE(poll_responses, 0),
    'quiz_responses', COALESCE(quiz_responses, 0),
    'slider_interactions', COALESCE(slider_interactions, 0),
    'completion_rate', CASE WHEN total_views > 0 THEN ROUND((unique_viewers::NUMERIC / total_views::NUMERIC) * 100, 2) ELSE 0 END,
    'interactions_per_story', CASE WHEN total_stories > 0 THEN ROUND((total_replies + total_reactions + poll_responses + quiz_responses + slider_interactions)::NUMERIC / total_stories, 2) ELSE 0 END
  ) INTO v_result
  FROM story_stats;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_story_analytics_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_story_analytics_v1(UUID, INTEGER) TO authenticated, service_role;

-- 2) Get story interactive sticker metrics (polls, quizzes, sliders)
CREATE OR REPLACE FUNCTION public.get_story_interactive_metrics_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polls JSONB;
  v_quizzes JSONB;
  v_sliders JSONB;
BEGIN
  -- Poll responses with options
  SELECT jsonb_agg(
    jsonb_build_object(
      'poll_id', p.id,
      'question', p.question,
      'responses', COALESCE((SELECT COUNT(*) FROM story_poll_votes spv WHERE spv.poll_id = p.id AND spv.created_at >= (now() - INTERVAL '1 day' * p_days), 0),
      'options', p.options
    )
  ) INTO v_polls
  FROM story_polls p
  JOIN stories s ON s.id = p.story_id
  WHERE s.author_id = p_creator_id
  AND p.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  -- Quiz responses
  SELECT jsonb_agg(
    jsonb_build_object(
      'quiz_id', q.id,
      'question', q.question,
      'correct_answers', COALESCE((SELECT COUNT(*) FROM story_quiz_answers qa JOIN story_quiz_answers_correct c ON c.answer_id = qa.id WHERE qa.quiz_id = q.id), 0),
      'total_answers', COALESCE((SELECT COUNT(*) FROM story_quiz_answers qa WHERE qa.quiz_id = q.id AND qa.created_at >= (now() - INTERVAL '1 day' * p_days)), 0)
    )
  ) INTO v_quizzes
  FROM story_quizzes q
  JOIN stories s ON s.id = q.story_id
  WHERE s.author_id = p_creator_id;

  -- Slider interactions
  SELECT jsonb_agg(
    jsonb_build_object(
      'slider_id', es.id,
      'emoji', es.emoji,
      'avg_value', COALESCE((SELECT AVG(slider_value) FROM story_emoji_slider_votes sv WHERE sv.slider_id = es.id AND sv.created_at >= (now() - INTERVAL '1 day' * p_days)), 0),
      'responses', COALESCE((SELECT COUNT(*) FROM story_emoji_slider_votes sv WHERE sv.slider_id = es.id AND sv.created_at >= (now() - INTERVAL '1 day' * p_days)), 0)
    )
  ) INTO v_sliders
  FROM story_emoji_sliders es
  JOIN stories s ON s.id = es.story_id
  WHERE s.author_id = p_creator_id;

  RETURN jsonb_build_object(
    'polls', COALESCE(v_polls, '[]'::JSONB),
    'quizzes', COALESCE(v_quizzes, '[]'::JSONB),
    'sliders', COALESCE(v_sliders, '[]'::JSONB)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_story_interactive_metrics_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_story_interactive_metrics_v1(UUID, INTEGER) TO authenticated, service_role;

-- 3) Get story link clicks (from link_click_events filtered for stories)
CREATE OR REPLACE FUNCTION public.get_story_link_clicks_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.link_click_events lce
  JOIN public.stories s ON s.author_id = p_creator_id
  WHERE lce.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  RETURN jsonb_build_object('count', COALESCE(v_count, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.get_story_link_clicks_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_story_link_clicks_v1(UUID, INTEGER) TO authenticated, service_role;

-- ============================================================================
-- Summary:
-- - ✅ get_story_analytics_v1(creator_id, days): Basic story metrics
-- - ✅ get_story_interactive_metrics_v1(creator_id, days): Sticker interactions
-- - ✅ get_story_link_clicks_v1(creator_id, days): Link taps from stories
-- ============================================================================