-- ============================================================================
-- ЭТАП 1: БАЗОВЫЕ ТАБЛИЦЫ ДЛЯ ML-СИСТЕМЫ РЕКОМЕНДАЦИЙ
-- Фундамент для персонализации: interactions, affinity, session tracking
-- ============================================================================

-- ============================================================================
-- 1. Детальная история взаимодействий с Reels
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_reel_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE,
  
  -- Основные взаимодействия
  viewed BOOLEAN DEFAULT false,
  liked BOOLEAN DEFAULT false,
  saved BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  commented BOOLEAN DEFAULT false,
  
  -- Метрики просмотра (ключевые для TikTok-подхода)
  watch_duration_seconds INTEGER DEFAULT 0,
  reel_duration_seconds INTEGER DEFAULT 0,
  completion_rate NUMERIC(5,2) DEFAULT 0.0, -- 0.00 to 100.00 (можем иметь >100% при rewatch)
  
  -- Re-watch detection (15% веса в алгоритме)
  rewatched BOOLEAN DEFAULT false,
  rewatch_count INTEGER DEFAULT 0,
  
  -- Негативные сигналы
  skipped_quickly BOOLEAN DEFAULT false, -- < 2 секунды
  skipped_at_second INTEGER, -- На какой секунде скипнули
  hidden BOOLEAN DEFAULT false, -- "Не показывать такое"
  reported BOOLEAN DEFAULT false,
  report_reason TEXT,
  
  -- Временные метки
  first_view_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Session tracking
  session_id TEXT, -- Для анонимных пользователей
  
  UNIQUE(user_id, reel_id)
);

-- Индексы/политики/функции нормализуются idempotent-патчем
-- 20260220231500_step1_ml_foundation_patch.sql (чтобы миграция не падала при
-- частично созданной схеме из других миграций).

COMMENT ON TABLE public.user_reel_interactions IS 
  'Детальная история взаимодействий: completion rate, re-watch, skips - основа ML персонализации';

-- ============================================================================
-- 2. User-Author Affinity Score (долгосрочные предпочтения)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_author_affinity (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Основной score (накапливается со временем)
  affinity_score NUMERIC DEFAULT 0.0,
  
  -- Статистика взаимодействий
  total_interactions INTEGER DEFAULT 0,
  positive_interactions INTEGER DEFAULT 0, -- likes, saves, shares, comments
  negative_interactions INTEGER DEFAULT 0, -- skips, hides
  
  -- Детальная статистика
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  
  -- Качественные метрики
  avg_completion_rate NUMERIC(5,2) DEFAULT 0.0,
  avg_watch_duration NUMERIC(8,2) DEFAULT 0.0,
  rewatch_count INTEGER DEFAULT 0,
  
  -- Временной контекст
  first_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Decay tracking (для снижения веса старых данных)
  last_score_decay_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id, author_id),
  CHECK (user_id != author_id) -- Не храним self-affinity
);

COMMENT ON TABLE public.user_author_affinity IS 
  'Долгосрочная аффинити пользователя к авторам: 10% веса в итоговом скоринге';

-- ============================================================================
-- 3. Session Context (для real-time адаптации)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_session_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  
  -- Временные рамки сессии
  session_started_at TIMESTAMPTZ DEFAULT NOW(),
  session_ended_at TIMESTAMPTZ,
  session_duration_seconds INTEGER,
  
  -- Активность в сессии
  reels_viewed_count INTEGER DEFAULT 0,
  reels_liked_count INTEGER DEFAULT 0,
  reels_skipped_count INTEGER DEFAULT 0,
  reels_completed_count INTEGER DEFAULT 0, -- Completion rate > 80%
  
  -- Паттерны поведения
  skip_streak INTEGER DEFAULT 0, -- Подряд скипов (для emergency pivot)
  avg_completion_rate NUMERIC(5,2) DEFAULT 0.0,
  
  -- Контекстные данные
  device_type TEXT, -- mobile, tablet, desktop
  platform TEXT, -- ios, android, web
  time_of_day TEXT, -- morning, afternoon, evening, night
  
  -- Preference shifts (что нравится в ЭТУ сессию)
  session_preferred_topics TEXT[],
  session_preferred_authors UUID[],
  session_avoided_topics TEXT[],
  
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_context_user 
  ON public.user_session_context(user_id, session_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_context_session_id 
  ON public.user_session_context(session_id);
CREATE INDEX IF NOT EXISTS idx_session_context_active 
  ON public.user_session_context(user_id) WHERE session_ended_at IS NULL;

COMMENT ON TABLE public.user_session_context IS 
  'Контекст текущей сессии для real-time адаптации (5% веса)';

-- NOTE: Функции/триггеры/RLS/индексы создаются и нормализуются в
-- 20260220231500_step1_ml_foundation_patch.sql (idempotent).
