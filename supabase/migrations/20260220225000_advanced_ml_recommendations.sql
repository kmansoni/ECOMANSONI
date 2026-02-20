-- ============================================================================
-- SUPER ADVANCED ML-BASED RECOMMENDATIONS SYSTEM FOR REELS
-- Includes: Collaborative Filtering, Content-Based, Session Analysis,
--           Virality Detection, Multi-Armed Bandit, Graph-Based
-- ============================================================================

-- ============================================================================
-- 1. User Interaction History (для collaborative filtering)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_reel_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE,
  
  -- Типы взаимодействий
  viewed BOOLEAN DEFAULT false,
  liked BOOLEAN DEFAULT false,
  saved BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  commented BOOLEAN DEFAULT false,
  
  -- Метрики просмотра
  watch_duration_seconds INTEGER DEFAULT 0,
  completion_rate NUMERIC(3,2) DEFAULT 0.0, -- 0.0 to 1.0
  rewatched BOOLEAN DEFAULT false,
  
  -- Негативные сигналы
  skipped_quickly BOOLEAN DEFAULT false, -- < 2 сек
  hidden BOOLEAN DEFAULT false,
  reported BOOLEAN DEFAULT false,
  
  -- Временные метки
  first_view_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_user_interactions_user 
  ON public.user_reel_interactions(user_id, last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_reel 
  ON public.user_reel_interactions(reel_id);

COMMENT ON TABLE public.user_reel_interactions IS 
  'Детальная история взаимодействий пользователя с Reels для ML';

-- ============================================================================
-- 2. Author Affinity Scores (предпочтения авторов)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_author_affinity (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  affinity_score NUMERIC DEFAULT 0.0, -- Суммарный score
  interactions_count INTEGER DEFAULT 0,
  positive_interactions INTEGER DEFAULT 0, -- likes, saves, shares
  negative_interactions INTEGER DEFAULT 0, -- skips, hides
  avg_completion_rate NUMERIC(3,2) DEFAULT 0.0,
  
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_user_author_affinity_score 
  ON public.user_author_affinity(user_id, affinity_score DESC);

COMMENT ON TABLE public.user_author_affinity IS 
  'Аффинити пользователя к авторам (learned preferences)';

-- ============================================================================
-- 3. Content Features (для content-based filtering)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reel_content_features (
  reel_id UUID PRIMARY KEY REFERENCES public.reels(id) ON DELETE CASCADE,
  
  -- Текстовые features
  description_tokens TEXT[], -- Ключевые слова из description
  sentiment_score NUMERIC(3,2) DEFAULT 0.0, -- -1.0 (negative) to 1.0 (positive)
  
  -- Музыкальные features
  music_genre TEXT,
  music_mood TEXT, -- energetic, calm, sad, happy
  
  -- Визуальные features (опционально, для будущего)
  dominant_colors TEXT[],
  has_faces BOOLEAN DEFAULT false,
  
  -- Метаданные
  duration_seconds INTEGER,
  video_quality TEXT, -- HD, 4K, etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reel_features_music ON public.reel_content_features(music_genre);
CREATE INDEX IF NOT EXISTS idx_reel_features_tokens ON public.reel_content_features USING GIN(description_tokens);

COMMENT ON TABLE public.reel_content_features IS 
  'Извлечённые фичи контента для content-based recommendations';

-- ============================================================================
-- 4. Virality Signals (ранние сигналы популярности)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reel_virality_metrics (
  reel_id UUID PRIMARY KEY REFERENCES public.reels(id) ON DELETE CASCADE,
  
  -- Early engagement (первые часы)
  first_hour_views INTEGER DEFAULT 0,
  first_hour_likes INTEGER DEFAULT 0,
  first_hour_shares INTEGER DEFAULT 0,
  
  -- Velocity metrics
  engagement_velocity NUMERIC DEFAULT 0.0, -- interactions per hour
  viral_coefficient NUMERIC DEFAULT 0.0, -- shares / views ratio
  
  -- Prediction
  predicted_viral_score NUMERIC DEFAULT 0.0, -- 0-100
  is_trending BOOLEAN DEFAULT false,
  
  last_calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_virality_trending 
  ON public.reel_virality_metrics(is_trending, predicted_viral_score DESC);

COMMENT ON TABLE public.reel_virality_metrics IS 
  'Метрики virality для раннего обнаружения популярного контента';

-- ============================================================================
-- 5. User Similarity Graph (для collaborative filtering)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_similarity_scores (
  user_id_a UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id_b UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  similarity_score NUMERIC(3,2) DEFAULT 0.0, -- 0.0 to 1.0 (cosine similarity)
  common_likes_count INTEGER DEFAULT 0,
  common_authors_count INTEGER DEFAULT 0,
  
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id_a, user_id_b),
  CHECK (user_id_a < user_id_b) -- Avoid duplicates (symmetric)
);

CREATE INDEX IF NOT EXISTS idx_user_similarity_scores 
  ON public.user_similarity_scores(user_id_a, similarity_score DESC);

COMMENT ON TABLE public.user_similarity_scores IS 
  'Similarity scores между пользователями (collaborative filtering)';

-- ============================================================================
-- 6. Функция: Update Author Affinity (триггер на взаимодействия)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_author_affinity()
RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
  v_affinity_delta NUMERIC := 0.0;
BEGIN
  -- Получаем автора Reel
  SELECT author_id INTO v_author_id FROM reels WHERE id = NEW.reel_id;
  
  IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;
  
  -- Рассчитываем изменение affinity
  IF NEW.liked THEN v_affinity_delta := v_affinity_delta + 5.0; END IF;
  IF NEW.saved THEN v_affinity_delta := v_affinity_delta + 10.0; END IF;
  IF NEW.shared THEN v_affinity_delta := v_affinity_delta + 8.0; END IF;
  IF NEW.commented THEN v_affinity_delta := v_affinity_delta + 7.0; END IF;
  
  -- Учитываем completion rate
  v_affinity_delta := v_affinity_delta + (NEW.completion_rate * 5.0);
  
  -- Негативные сигналы
  IF NEW.skipped_quickly THEN v_affinity_delta := v_affinity_delta - 3.0; END IF;
  IF NEW.hidden THEN v_affinity_delta := v_affinity_delta - 20.0; END IF;
  
  -- Обновляем affinity
  INSERT INTO user_author_affinity (user_id, author_id, affinity_score, interactions_count, positive_interactions, negative_interactions)
  VALUES (
    NEW.user_id, 
    v_author_id, 
    v_affinity_delta,
    1,
    CASE WHEN v_affinity_delta > 0 THEN 1 ELSE 0 END,
    CASE WHEN v_affinity_delta < 0 THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, author_id) DO UPDATE SET
    affinity_score = user_author_affinity.affinity_score + v_affinity_delta,
    interactions_count = user_author_affinity.interactions_count + 1,
    positive_interactions = user_author_affinity.positive_interactions + CASE WHEN v_affinity_delta > 0 THEN 1 ELSE 0 END,
    negative_interactions = user_author_affinity.negative_interactions + CASE WHEN v_affinity_delta < 0 THEN 1 ELSE 0 END,
    last_updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_author_affinity ON user_reel_interactions;
CREATE TRIGGER trg_update_author_affinity
  AFTER INSERT OR UPDATE ON user_reel_interactions
  FOR EACH ROW EXECUTE FUNCTION update_author_affinity();

-- ============================================================================
-- 7. Функция: Calculate Engagement Score (продвинутая версия)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_advanced_engagement_score(
  p_likes_count INTEGER,
  p_comments_count INTEGER,
  p_views_count INTEGER,
  p_saves_count INTEGER DEFAULT 0,
  p_shares_count INTEGER DEFAULT 0,
  p_reposts_count INTEGER DEFAULT 0,
  p_avg_completion_rate NUMERIC DEFAULT 0.0
)
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    COALESCE(p_likes_count, 0) * 2.0 +
    COALESCE(p_comments_count, 0) * 3.5 +
    COALESCE(p_saves_count, 0) * 6.0 +
    COALESCE(p_shares_count, 0) * 5.0 +
    COALESCE(p_reposts_count, 0) * 4.5 +
    COALESCE(p_views_count, 0) * 0.15 +
    COALESCE(p_avg_completion_rate, 0) * 50.0 -- Completion rate очень важна!
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 8. Функция: Calculate Virality Score
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_virality_score(
  p_reel_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_age_hours NUMERIC;
  v_views INTEGER;
  v_likes INTEGER;
  v_shares INTEGER;
  v_velocity NUMERIC;
  v_viral_coefficient NUMERIC;
BEGIN
  SELECT 
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0,
    views_count,
    likes_count,
    shares_count
  INTO v_age_hours, v_views, v_likes, v_shares
  FROM reels WHERE id = p_reel_id;
  
  -- Velocity = interactions per hour
  v_velocity := (COALESCE(v_likes, 0) + COALESCE(v_shares, 0) * 2) / GREATEST(v_age_hours, 0.1);
  
  -- Viral coefficient = shares / views
  v_viral_coefficient := CASE 
    WHEN v_views > 0 THEN COALESCE(v_shares, 0)::NUMERIC / v_views 
    ELSE 0 
  END;
  
  -- Virality score (0-100)
  RETURN LEAST(100.0, (
    v_velocity * 5.0 +
    v_viral_coefficient * 200.0 +
    CASE WHEN v_age_hours < 1 THEN 20.0 ELSE 0.0 END -- Fresh boost
  ));
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 9. ГЛАВНАЯ ФУНКЦИЯ: ML-Based Personalized Feed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ml_personalized_reels_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_exploration_ratio NUMERIC DEFAULT 0.2 -- 20% exploration
)
RETURNS TABLE (
  reel_id UUID,
  author_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  music_title TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  saves_count INTEGER,
  reposts_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ,
  
  -- ML Scores
  personalization_score NUMERIC,
  engagement_score NUMERIC,
  recency_score NUMERIC,
  virality_score NUMERIC,
  diversity_score NUMERIC,
  final_score NUMERIC,
  
  recommendation_reason TEXT -- Для дебага
) AS $$
DECLARE
  v_exploitation_limit INTEGER;
  v_exploration_limit INTEGER;
BEGIN
  v_exploitation_limit := FLOOR(p_limit * (1 - p_exploration_ratio));
  v_exploration_limit := p_limit - v_exploitation_limit;
  
  RETURN QUERY
  WITH user_affinities AS (
    -- Предпочтения пользователя к авторам
    SELECT author_id, affinity_score 
    FROM user_author_affinity 
    WHERE user_id = p_user_id
  ),
  user_following AS (
    -- Подписки пользователя
    SELECT following_id FROM followers WHERE follower_id = p_user_id
  ),
  viewed_reels AS (
    -- Уже просмотренные (исключаем)
    SELECT reel_id FROM user_reel_interactions 
    WHERE user_id = p_user_id AND viewed = true
  ),
  similar_users AS (
    -- Похожие пользователи (collaborative filtering)
    SELECT user_id_b AS similar_user_id, similarity_score
    FROM user_similarity_scores
    WHERE user_id_a = p_user_id
    ORDER BY similarity_score DESC
    LIMIT 10
  ),
  collaborative_likes AS (
    -- Что лайкали похожие пользователи
    SELECT DISTINCT uri.reel_id, AVG(su.similarity_score) AS collab_score
    FROM user_reel_interactions uri
    JOIN similar_users su ON uri.user_id = su.similar_user_id
    WHERE uri.liked = true
    GROUP BY uri.reel_id
  ),
  scored_reels AS (
    SELECT 
      r.id AS reel_id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      r.likes_count,
      r.comments_count,
      r.views_count,
      r.saves_count,
      r.reposts_count,
      r.shares_count,
      r.created_at,
      
      -- 1. PERSONALIZATION SCORE (40% weight)
      (
        -- Author affinity
        COALESCE((SELECT affinity_score FROM user_affinities WHERE author_id = r.author_id), 0) * 2.0
        +
        -- Following boost
        CASE WHEN EXISTS (SELECT 1 FROM user_following WHERE following_id = r.author_id) 
          THEN 100.0 ELSE 0.0 END
        +
        -- Collaborative filtering
        COALESCE((SELECT collab_score FROM collaborative_likes WHERE reel_id = r.id), 0) * 50.0
      ) * 0.4 AS personalization_score,
      
      -- 2. ENGAGEMENT SCORE (25% weight)
      (
        calculate_advanced_engagement_score(
          r.likes_count, 
          r.comments_count, 
          r.views_count, 
          r.saves_count, 
          r.shares_count,
          r.reposts_count,
          -- Completion rate (если есть данные)
          COALESCE((
            SELECT AVG(completion_rate) 
            FROM user_reel_interactions 
            WHERE reel_id = r.id AND completion_rate > 0
          ), 0.5)
        ) / 10.0
      ) * 0.25 AS engagement_score,
      
      -- 3. RECENCY SCORE (15% weight)
      (
        100.0 * EXP(-EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 86400.0) -- Decay per day
      ) * 0.15 AS recency_score,
      
      -- 4. VIRALITY SCORE (15% weight)
      (
        COALESCE(calculate_virality_score(r.id), 0)
      ) * 0.15 AS virality_score,
      
      -- 5. DIVERSITY SCORE (5% weight) - авторы, которых редко показываем
      (
        CASE 
          WHEN NOT EXISTS (
            SELECT 1 FROM user_reel_interactions uri2 
            WHERE uri2.user_id = p_user_id 
              AND uri2.reel_id IN (
                SELECT id FROM reels WHERE author_id = r.author_id LIMIT 3
              )
          ) THEN 20.0
          ELSE 5.0
        END
      ) * 0.05 AS diversity_score,
      
      -- Причина рекомендации (для debugging)
      CASE 
        WHEN EXISTS (SELECT 1 FROM user_following WHERE following_id = r.author_id) 
          THEN 'Following'
        WHEN COALESCE((SELECT affinity_score FROM user_affinities WHERE author_id = r.author_id), 0) > 20
          THEN 'High Affinity'
        WHEN EXISTS (SELECT 1 FROM collaborative_likes WHERE reel_id = r.id)
          THEN 'Similar Users Liked'
        WHEN calculate_virality_score(r.id) > 50
          THEN 'Trending'
        ELSE 'Discovery'
      END AS recommendation_reason
      
    FROM reels r
    WHERE r.author_id != p_user_id  -- Не показываем свой контент
      AND r.id NOT IN (SELECT reel_id FROM viewed_reels)  -- Не показываем просмотренное
      AND r.created_at >= NOW() - INTERVAL '30 days'  -- Только за последний месяц
  ),
  exploitation_reels AS (
    -- 80% = проверенные рекомендации (высокий score)
    SELECT 
      sr.*,
      (sr.personalization_score + sr.engagement_score + sr.recency_score + sr.virality_score + sr.diversity_score) AS final_score
    FROM scored_reels sr
    ORDER BY (personalization_score + engagement_score + recency_score + virality_score + diversity_score) DESC
    LIMIT v_exploitation_limit
  ),
  exploration_reels AS (
    -- 20% = исследование (случайные с минимальным quality bar)
    SELECT 
      sr.*,
      (sr.personalization_score + sr.engagement_score + sr.recency_score + sr.virality_score + sr.diversity_score) AS final_score
    FROM scored_reels sr
    WHERE sr.engagement_score > 1.0  -- Минимальный quality threshold
      AND sr.reel_id NOT IN (SELECT reel_id FROM exploitation_reels)
    ORDER BY RANDOM()
    LIMIT v_exploration_limit
  )
  -- Объединяем exploitation + exploration
  SELECT * FROM exploitation_reels
  UNION ALL
  SELECT * FROM exploration_reels
  ORDER BY final_score DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_ml_personalized_reels_feed IS 
  'ML-based персонализированная лента с коллаборативной фильтрацией, virality detection, multi-armed bandit';

-- ============================================================================
-- 10. Функция: Simple Trending Feed (для не авторизованных)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_trending_reels_simple(
  p_hours_window INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  reel_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  likes_count INTEGER,
  views_count INTEGER,
  trending_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.video_url,
    r.thumbnail_url,
    r.likes_count,
    r.views_count,
    (
      (r.likes_count * 10.0) +
      (r.comments_count * 15.0) +
      (r.shares_count * 20.0) +
      (r.views_count * 0.5) -
      (EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600.0 * 2.0)  -- Time penalty
    ) AS trending_score
  FROM reels r
  WHERE r.created_at >= NOW() - (p_hours_window || ' hours')::INTERVAL
  ORDER BY trending_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 11. Функция: Update User Similarity (периодический расчёт)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_user_similarities(
  p_user_id UUID,
  p_top_n INTEGER DEFAULT 20
)
RETURNS VOID AS $$
DECLARE
  v_other_user UUID;
  v_similarity NUMERIC;
  v_common_likes INTEGER;
BEGIN
  -- Находим пользователей с похожими лайками
  FOR v_other_user IN 
    SELECT DISTINCT uri.user_id
    FROM user_reel_interactions uri
    WHERE uri.liked = true
      AND uri.user_id != p_user_id
      AND EXISTS (
        SELECT 1 FROM user_reel_interactions uri2
        WHERE uri2.user_id = p_user_id
          AND uri2.reel_id = uri.reel_id
          AND uri2.liked = true
      )
    LIMIT 100
  LOOP
    -- Cosine similarity на основе общих лайков
    WITH user_a_likes AS (
      SELECT reel_id FROM user_reel_interactions 
      WHERE user_id = p_user_id AND liked = true
    ),
    user_b_likes AS (
      SELECT reel_id FROM user_reel_interactions 
      WHERE user_id = v_other_user AND liked = true
    ),
    common AS (
      SELECT COUNT(*) AS cnt FROM user_a_likes 
      INTERSECT 
      SELECT reel_id FROM user_b_likes
    )
    SELECT 
      c.cnt,
      c.cnt::NUMERIC / SQRT(
        (SELECT COUNT(*) FROM user_a_likes) * (SELECT COUNT(*) FROM user_b_likes)
      )
    INTO v_common_likes, v_similarity
    FROM common c;
    
    IF v_similarity > 0.1 THEN  -- Threshold
      INSERT INTO user_similarity_scores (user_id_a, user_id_b, similarity_score, common_likes_count)
      VALUES (
        LEAST(p_user_id, v_other_user),
        GREATEST(p_user_id, v_other_user),
        v_similarity,
        v_common_likes
      )
      ON CONFLICT (user_id_a, user_id_b) DO UPDATE SET
        similarity_score = v_similarity,
        common_likes_count = v_common_likes,
        calculated_at = NOW();
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 12. Helper: Record Interaction (клиент вызывает это)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_reel_interaction(
  p_user_id UUID,
  p_reel_id UUID,
  p_watched BOOLEAN DEFAULT true,
  p_watch_duration_seconds INTEGER DEFAULT 0,
  p_completion_rate NUMERIC DEFAULT 0.0,
  p_liked BOOLEAN DEFAULT false,
  p_saved BOOLEAN DEFAULT false,
  p_shared BOOLEAN DEFAULT false,
  p_skipped_quickly BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_reel_interactions (
    user_id, reel_id, viewed, watch_duration_seconds, completion_rate,
    liked, saved, shared, skipped_quickly, last_interaction_at
  )
  VALUES (
    p_user_id, p_reel_id, p_watched, p_watch_duration_seconds, p_completion_rate,
    p_liked, p_saved, p_shared, p_skipped_quickly, NOW()
  )
  ON CONFLICT (user_id, reel_id) DO UPDATE SET
    viewed = EXCLUDED.viewed OR user_reel_interactions.viewed,
    watch_duration_seconds = GREATEST(EXCLUDED.watch_duration_seconds, user_reel_interactions.watch_duration_seconds),
    completion_rate = GREATEST(EXCLUDED.completion_rate, user_reel_interactions.completion_rate),
    liked = EXCLUDED.liked OR user_reel_interactions.liked,
    saved = EXCLUDED.saved OR user_reel_interactions.saved,
    shared = EXCLUDED.shared OR user_reel_interactions.shared,
    commented = EXCLUDED.commented OR user_reel_interactions.commented,
    skipped_quickly = EXCLUDED.skipped_quickly OR user_reel_interactions.skipped_quickly,
    last_interaction_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 13. Permissions
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON public.user_reel_interactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_author_affinity TO authenticated;
GRANT SELECT ON public.reel_content_features TO authenticated;
GRANT SELECT ON public.reel_virality_metrics TO authenticated;
GRANT SELECT ON public.user_similarity_scores TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_ml_personalized_reels_feed TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_reels_simple TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_interaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_user_similarities TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_advanced_engagement_score TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_virality_score TO authenticated;

-- RLS Policies
ALTER TABLE public.user_reel_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_author_affinity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own interactions"
  ON public.user_reel_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own interactions"
  ON public.user_reel_interactions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users view own affinity"
  ON public.user_author_affinity FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- 14. Индексы для производительности
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_reels_created_at_id 
  ON public.reels(created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_reels_author_created 
  ON public.reels(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_engagement 
  ON public.reels((likes_count + comments_count * 2 + saves_count * 3) DESC);

COMMENT ON SCHEMA public IS 
  'Super Advanced ML-based Recommendations System for Reels - Feb 2026';
