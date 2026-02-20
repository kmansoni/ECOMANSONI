-- ============================================================================
-- ЭТАП 2: СИСТЕМА ХЕШТЕГОВ И АВТОМАТИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ТРЕНДОВ
-- Hashtag tracking, trending detection, topic clustering
-- ============================================================================

-- ============================================================================
-- 1. Таблица хештегов
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT UNIQUE NOT NULL,
  normalized_tag TEXT NOT NULL, -- Lowercase, без #
  
  -- Статистика использования
  usage_count INTEGER DEFAULT 0,
  reels_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  
  -- Trending метрики
  usage_last_24h INTEGER DEFAULT 0,
  usage_last_7d INTEGER DEFAULT 0,
  usage_last_30d INTEGER DEFAULT 0,
  
  -- Рост и velocity
  growth_rate_24h NUMERIC DEFAULT 0.0, -- Процент роста за сутки
  growth_rate_7d NUMERIC DEFAULT 0.0,
  velocity_score NUMERIC DEFAULT 0.0, -- Uses per hour
  
  -- Engagement метрики
  avg_completion_rate NUMERIC(5,2) DEFAULT 0.0,
  avg_likes_per_reel NUMERIC DEFAULT 0.0,
  avg_saves_per_reel NUMERIC DEFAULT 0.0,
  total_views INTEGER DEFAULT 0,
  
  -- Trend status
  is_trending BOOLEAN DEFAULT false,
  trend_level TEXT, -- 'mega', 'hot', 'rising', 'stable', 'declining'
  peaked_at TIMESTAMPTZ,
  
  -- Категоризация
  category TEXT, -- 'music', 'dance', 'comedy', 'education', etc
  language TEXT DEFAULT 'ru',
  
  -- Временные метки
  first_used_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_hashtags_normalized ON public.hashtags(normalized_tag);
CREATE INDEX idx_hashtags_trending ON public.hashtags(is_trending, velocity_score DESC) WHERE is_trending = true;
CREATE INDEX idx_hashtags_growth ON public.hashtags(growth_rate_24h DESC);
CREATE INDEX idx_hashtags_category ON public.hashtags(category, is_trending);
CREATE INDEX idx_hashtags_usage ON public.hashtags(usage_count DESC);

COMMENT ON TABLE public.hashtags IS 
  'Система хештегов с автоматическим trending detection и velocity tracking';

-- ============================================================================
-- 2. Связь Reels с хештегами (Many-to-Many)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reel_hashtags (
  reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE,
  hashtag_id UUID REFERENCES public.hashtags(id) ON DELETE CASCADE,
  
  position INTEGER, -- Позиция хештега в описании (первый важнее)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (reel_id, hashtag_id)
);

CREATE INDEX idx_reel_hashtags_reel ON public.reel_hashtags(reel_id);
CREATE INDEX idx_reel_hashtags_hashtag ON public.reel_hashtags(hashtag_id, created_at DESC);

COMMENT ON TABLE public.reel_hashtags IS 
  'Связь Reels с хештегами для discovery и trending boost';

-- ============================================================================
-- 3. Trending Topics (автоматически определённые темы БЕЗ хештегов)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trending_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL,
  
  -- Ключевые слова темы (автоматически извлечённые)
  keywords TEXT[],
  related_hashtags UUID[], -- Связанные хештеги
  
  -- Trending метрики
  reels_count_24h INTEGER DEFAULT 0,
  total_views_24h INTEGER DEFAULT 0,
  total_engagement_24h INTEGER DEFAULT 0,
  
  -- Growth tracking
  growth_velocity NUMERIC DEFAULT 0.0,
  peak_hour TIMESTAMPTZ,
  
  -- ML confidence
  detection_confidence NUMERIC(3,2) DEFAULT 0.0, -- 0.0 to 1.0
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  trend_started_at TIMESTAMPTZ DEFAULT NOW(),
  trend_ended_at TIMESTAMPTZ,
  
  -- Метаданные
  detected_by TEXT DEFAULT 'auto', -- 'auto', 'manual', 'ml'
  category TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trending_topics_active ON public.trending_topics(is_active, growth_velocity DESC) WHERE is_active = true;
CREATE INDEX idx_trending_topics_keywords ON public.trending_topics USING GIN(keywords);
CREATE INDEX idx_trending_topics_created ON public.trending_topics(created_at DESC);

COMMENT ON TABLE public.trending_topics IS 
  'Автоматически определённые трендовые темы (через NLP, независимо от хештегов)';

-- ============================================================================
-- 4. Связь Reels с Trending Topics
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reel_trending_topics (
  reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.trending_topics(id) ON DELETE CASCADE,
  
  relevance_score NUMERIC(3,2) DEFAULT 0.0, -- Насколько Reel релевантен топику
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (reel_id, topic_id)
);

CREATE INDEX idx_reel_topics_reel ON public.reel_trending_topics(reel_id);
CREATE INDEX idx_reel_topics_topic ON public.reel_trending_topics(topic_id, relevance_score DESC);

-- ============================================================================
-- 5. Функция: Извлечение хештегов из текста
-- ============================================================================
CREATE OR REPLACE FUNCTION public.extract_hashtags(p_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_hashtags TEXT[];
BEGIN
  -- Извлекаем все слова начинающиеся с #
  SELECT array_agg(DISTINCT lower(regexp_replace(match, '^#', '')))
  INTO v_hashtags
  FROM regexp_matches(p_text, '#[а-яА-ЯёЁa-zA-Z0-9_]+', 'g') AS match;
  
  RETURN COALESCE(v_hashtags, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extract_hashtags IS 
  'Извлекает все хештеги из текста (поддержка русского и английского)';

-- ============================================================================
-- 6. Функция: Автоматическое связывание Reel с хештегами
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_link_reel_hashtags()
RETURNS TRIGGER AS $$
DECLARE
  v_hashtags TEXT[];
  v_tag TEXT;
  v_hashtag_id UUID;
  v_position INTEGER := 1;
BEGIN
  -- Извлекаем хештеги из description
  v_hashtags := extract_hashtags(COALESCE(NEW.description, ''));
  
  -- Обрабатываем каждый хештег
  FOREACH v_tag IN ARRAY v_hashtags
  LOOP
    -- Upsert хештег
    INSERT INTO hashtags (tag, normalized_tag, usage_count, reels_count, first_used_at, last_used_at)
    VALUES ('#' || v_tag, v_tag, 1, 1, NOW(), NOW())
    ON CONFLICT (normalized_tag) DO UPDATE SET
      usage_count = hashtags.usage_count + 1,
      reels_count = hashtags.reels_count + 1,
      last_used_at = NOW()
    RETURNING id INTO v_hashtag_id;
    
    -- Связываем Reel с хештегом
    INSERT INTO reel_hashtags (reel_id, hashtag_id, position)
    VALUES (NEW.id, v_hashtag_id, v_position)
    ON CONFLICT DO NOTHING;
    
    v_position := v_position + 1;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер на создание/обновление Reel
DROP TRIGGER IF EXISTS trg_auto_link_hashtags ON reels;
CREATE TRIGGER trg_auto_link_hashtags
  AFTER INSERT OR UPDATE OF description ON reels
  FOR EACH ROW EXECUTE FUNCTION auto_link_reel_hashtags();

-- ============================================================================
-- 7. Функция: Расчёт trending score для хештега
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_hashtag_trending()
RETURNS VOID AS $$
DECLARE
  v_hashtag RECORD;
  v_usage_24h INTEGER;
  v_usage_prev_24h INTEGER;
  v_growth_rate NUMERIC;
  v_velocity NUMERIC;
  v_trend_level TEXT;
BEGIN
  FOR v_hashtag IN SELECT * FROM hashtags
  LOOP
    -- Подсчёт использования за последние 24 часа
    SELECT COUNT(*)
    INTO v_usage_24h
    FROM reel_hashtags rh
    JOIN reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag.id
      AND r.created_at >= NOW() - INTERVAL '24 hours';
    
    -- Подсчёт использования за предыдущие 24 часа (для growth rate)
    SELECT COUNT(*)
    INTO v_usage_prev_24h
    FROM reel_hashtags rh
    JOIN reels r ON r.id = rh.reel_id
    WHERE rh.hashtag_id = v_hashtag.id
      AND r.created_at >= NOW() - INTERVAL '48 hours'
      AND r.created_at < NOW() - INTERVAL '24 hours';
    
    -- Расчёт growth rate
    IF v_usage_prev_24h > 0 THEN
      v_growth_rate := ((v_usage_24h::NUMERIC - v_usage_prev_24h::NUMERIC) / v_usage_prev_24h::NUMERIC) * 100.0;
    ELSE
      v_growth_rate := CASE WHEN v_usage_24h > 0 THEN 100.0 ELSE 0.0 END;
    END IF;
    
    -- Velocity (uses per hour)
    v_velocity := v_usage_24h::NUMERIC / 24.0;
    
    -- Определение trend level
    IF v_usage_24h >= 1000 AND v_growth_rate > 200 THEN
      v_trend_level := 'mega';
    ELSIF v_usage_24h >= 500 AND v_growth_rate > 100 THEN
      v_trend_level := 'hot';
    ELSIF v_usage_24h >= 100 AND v_growth_rate > 50 THEN
      v_trend_level := 'rising';
    ELSIF v_usage_24h >= 50 THEN
      v_trend_level := 'stable';
    ELSE
      v_trend_level := 'declining';
    END IF;
    
    -- Обновление хештега
    UPDATE hashtags SET
      usage_last_24h = v_usage_24h,
      growth_rate_24h = v_growth_rate,
      velocity_score = v_velocity,
      is_trending = (v_trend_level IN ('mega', 'hot', 'rising')),
      trend_level = v_trend_level,
      peaked_at = CASE 
        WHEN v_trend_level = 'mega' AND (peaked_at IS NULL OR v_usage_24h > usage_last_24h) 
        THEN NOW() 
        ELSE peaked_at 
      END,
      last_calculated_at = NOW()
    WHERE id = v_hashtag.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_hashtag_trending IS 
  'Периодический расчёт trending status для всех хештегов (запускать каждый час через cron)';

-- ============================================================================
-- 8. Функция: Автоопределение трендовых тем (NLP-based)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.detect_trending_topics()
RETURNS VOID AS $$
DECLARE
  v_topic RECORD;
  v_keywords TEXT[];
  v_reels_count INTEGER;
BEGIN
  -- Извлекаем часто встречающиеся слова из недавних популярных Reels
  WITH recent_popular_reels AS (
    SELECT 
      r.id,
      r.description,
      r.views_count,
      r.likes_count
    FROM reels r
    WHERE r.created_at >= NOW() - INTERVAL '24 hours'
      AND r.views_count > 100 -- Минимальный порог
    ORDER BY (r.views_count + r.likes_count * 10) DESC
    LIMIT 500
  ),
  word_frequency AS (
    SELECT 
      lower(word) AS word,
      COUNT(*) AS frequency,
      SUM(views_count) AS total_views,
      AVG(likes_count) AS avg_likes
    FROM recent_popular_reels,
    LATERAL unnest(string_to_array(
      regexp_replace(description, '[^а-яА-ЯёЁa-zA-Z0-9\s]', ' ', 'g'),
      ' '
    )) AS word
    WHERE length(word) > 3 -- Игнорим короткие слова
      AND word NOT IN ('this', 'that', 'with', 'from', 'have', 'будет', 'было', 'есть', 'для', 'или') -- Стоп-слова
    GROUP BY lower(word)
    HAVING COUNT(*) >= 10 -- Минимум 10 упоминаний
    ORDER BY frequency DESC
    LIMIT 20
  )
  -- Создаём или обновляем trending topics
  INSERT INTO trending_topics (
    topic_name,
    keywords,
    reels_count_24h,
    total_views_24h,
    growth_velocity,
    detection_confidence,
    detected_by
  )
  SELECT 
    wf.word AS topic_name,
    ARRAY[wf.word] AS keywords,
    wf.frequency::INTEGER,
    wf.total_views::INTEGER,
    (wf.frequency::NUMERIC / 24.0) AS growth_velocity,
    LEAST(1.0, wf.frequency::NUMERIC / 100.0) AS detection_confidence,
    'auto'
  FROM word_frequency wf
  ON CONFLICT (topic_name) DO UPDATE SET
    reels_count_24h = EXCLUDED.reels_count_24h,
    total_views_24h = EXCLUDED.total_views_24h,
    growth_velocity = EXCLUDED.growth_velocity,
    detection_confidence = EXCLUDED.detection_confidence,
    is_active = true,
    updated_at = NOW();
    
  -- Деактивируем старые топики
  UPDATE trending_topics 
  SET 
    is_active = false,
    trend_ended_at = NOW()
  WHERE updated_at < NOW() - INTERVAL '48 hours'
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION detect_trending_topics IS 
  'Автоматическое определение трендовых тем через NLP (частотный анализ слов). Запуск каждые 2-4 часа.';

-- ============================================================================
-- 9. Функция: Получить trending хештеги
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_trending_hashtags(
  p_limit INTEGER DEFAULT 20,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  hashtag_id UUID,
  tag TEXT,
  usage_count INTEGER,
  usage_24h INTEGER,
  growth_rate NUMERIC,
  trend_level TEXT,
  avg_completion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id,
    h.tag,
    h.usage_count,
    h.usage_last_24h,
    h.growth_rate_24h,
    h.trend_level,
    h.avg_completion_rate
  FROM hashtags h
  WHERE h.is_trending = true
    AND (p_category IS NULL OR h.category = p_category)
  ORDER BY h.velocity_score DESC, h.growth_rate_24h DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- 10. Функция: Hashtag Boost для Reels
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_hashtag_boost_score(p_reel_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_boost_score NUMERIC := 0.0;
  v_hashtag RECORD;
BEGIN
  -- Суммируем boost от всех trending хештегов
  FOR v_hashtag IN 
    SELECT h.*
    FROM reel_hashtags rh
    JOIN hashtags h ON h.id = rh.hashtag_id
    WHERE rh.reel_id = p_reel_id
      AND h.is_trending = true
  LOOP
    -- Boost зависит от trend level
    v_boost_score := v_boost_score + CASE v_hashtag.trend_level
      WHEN 'mega' THEN 100.0
      WHEN 'hot' THEN 60.0
      WHEN 'rising' THEN 30.0
      WHEN 'stable' THEN 10.0
      ELSE 0.0
    END;
  END LOOP;
  
  -- Cap максимум (чтобы не было abuse)
  RETURN LEAST(v_boost_score, 200.0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_hashtag_boost_score IS 
  'Рассчитывает boost score для Reel на основе trending хештегов: mega=100, hot=60, rising=30';

-- ============================================================================
-- 11. Permissions
-- ============================================================================
GRANT SELECT ON public.hashtags TO authenticated, anon;
GRANT SELECT ON public.reel_hashtags TO authenticated, anon;
GRANT SELECT ON public.trending_topics TO authenticated, anon;
GRANT SELECT ON public.reel_trending_topics TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.extract_hashtags TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_hashtags TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_hashtag_boost_score TO authenticated, anon;

-- Admin functions (для cron jobs)
GRANT EXECUTE ON FUNCTION public.calculate_hashtag_trending TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_trending_topics TO service_role;

-- RLS (публичное чтение)
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read hashtags" ON public.hashtags FOR SELECT USING (true);
CREATE POLICY "Public read reel_hashtags" ON public.reel_hashtags FOR SELECT USING (true);
CREATE POLICY "Public read trending_topics" ON public.trending_topics FOR SELECT USING (true);

COMMENT ON SCHEMA public IS 
  'Hashtag System: auto-extraction, trending detection (mega/hot/rising), NLP topic clustering';
