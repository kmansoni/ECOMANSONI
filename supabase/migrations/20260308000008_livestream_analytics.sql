-- =============================================================================
-- ECOMANSONI Livestream Platform — Аналитика сессий
-- Миграция: 20260308000008_livestream_analytics.sql
-- Назначение: Агрегированная аналитика по завершённым и активным эфирам
--
-- Архитектурные решения:
--   - UNIQUE session_id: одна запись на одну сессию (1:1 с live_sessions).
--     ON CONFLICT DO UPDATE применяется при пересчёте аналитики.
--   - viewer_retention_curve JSONB: временной ряд [{minute, viewers}, ...].
--     Хранится как JSONB (не отдельная таблица) — запросов типа «retention на минуте N»
--     нет в hot path; десериализация на app-level достаточно эффективна.
--   - top_chatters JSONB: [{user_id, message_count}, ...] — top-10.
--   - device_breakdown / geo_breakdown JSONB: % разбивка.
--   - computed_at: время последнего пересчёта (для staleness check).
--   - RLS: только хост сессии и admins (через app-level service-role) читают аналитику.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_session_analytics (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                 BIGINT      NOT NULL UNIQUE REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  peak_viewers               INTEGER     NOT NULL DEFAULT 0,
  total_unique_viewers       INTEGER     NOT NULL DEFAULT 0,
  total_chat_messages        INTEGER     NOT NULL DEFAULT 0,
  total_reactions            INTEGER     NOT NULL DEFAULT 0,
  total_donations_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_donations_count      INTEGER     NOT NULL DEFAULT 0,
  total_gifts_count          INTEGER     NOT NULL DEFAULT 0,
  avg_watch_duration_sec     INTEGER     NOT NULL DEFAULT 0,
  viewer_retention_curve     JSONB       NOT NULL DEFAULT '[]',
  chat_activity_curve        JSONB       NOT NULL DEFAULT '[]',
  top_chatters               JSONB       NOT NULL DEFAULT '[]',
  device_breakdown           JSONB       NOT NULL DEFAULT '{}',
  geo_breakdown              JSONB       NOT NULL DEFAULT '{}',
  new_followers_during_stream INTEGER    NOT NULL DEFAULT 0,
  shares_count               INTEGER     NOT NULL DEFAULT 0,
  computed_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_session_analytics                          IS '1:1 агрегированная аналитика livestream-сессии';
COMMENT ON COLUMN public.live_session_analytics.id                       IS 'UUID PK';
COMMENT ON COLUMN public.live_session_analytics.session_id               IS 'FK → live_sessions.id (UNIQUE, 1:1)';
COMMENT ON COLUMN public.live_session_analytics.peak_viewers             IS 'Максимальное число одновременных зрителей';
COMMENT ON COLUMN public.live_session_analytics.total_unique_viewers     IS 'Уникальные зрители за весь эфир';
COMMENT ON COLUMN public.live_session_analytics.total_chat_messages      IS 'Общее количество сообщений в чате';
COMMENT ON COLUMN public.live_session_analytics.total_reactions          IS 'Суммарные реакции (hearts, emoji)';
COMMENT ON COLUMN public.live_session_analytics.total_donations_amount   IS 'Сумма всех донатов в базовой валюте';
COMMENT ON COLUMN public.live_session_analytics.total_donations_count    IS 'Количество донатов';
COMMENT ON COLUMN public.live_session_analytics.total_gifts_count        IS 'Количество виртуальных подарков';
COMMENT ON COLUMN public.live_session_analytics.avg_watch_duration_sec   IS 'Средняя длительность просмотра в секундах';
COMMENT ON COLUMN public.live_session_analytics.viewer_retention_curve   IS 'JSON: [{minute: N, viewers: M}, ...] — кривая удержания';
COMMENT ON COLUMN public.live_session_analytics.chat_activity_curve      IS 'JSON: [{minute: N, messages: M}, ...] — активность чата';
COMMENT ON COLUMN public.live_session_analytics.top_chatters             IS 'JSON: [{user_id, username, message_count}, ...] top-10';
COMMENT ON COLUMN public.live_session_analytics.device_breakdown         IS 'JSON: {mobile: %, desktop: %, tablet: %} — разбивка по устройствам';
COMMENT ON COLUMN public.live_session_analytics.geo_breakdown            IS 'JSON: {RU: %, KZ: %, ...} — geo-разбивка ISO 3166-1 alpha-2';
COMMENT ON COLUMN public.live_session_analytics.new_followers_during_stream IS 'Подписки, полученные за время эфира';
COMMENT ON COLUMN public.live_session_analytics.shares_count             IS 'Количество расшариваний эфира';
COMMENT ON COLUMN public.live_session_analytics.computed_at              IS 'Время последнего пересчёта аналитики';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Быстрый lookup по session_id (покрывает UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_live_session_analytics_session_id
  ON public.live_session_analytics (session_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_session_analytics ENABLE ROW LEVEL SECURITY;

-- Хост видит аналитику своей сессии
CREATE POLICY "live_session_analytics_select_host"
  ON public.live_session_analytics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id
        AND ls.creator_id = auth.uid()
    )
  );

-- Только service_role (Edge Functions) может INSERT/UPDATE аналитику
-- (в Supabase service_role обходит RLS — явная политика не требуется,
--  но для defense-in-depth запрещаем прямой INSERT от клиентов)
CREATE POLICY "live_session_analytics_no_direct_insert"
  ON public.live_session_analytics
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "live_session_analytics_no_direct_update"
  ON public.live_session_analytics
  FOR UPDATE
  USING (false);
