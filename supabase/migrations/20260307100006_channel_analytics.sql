-- =============================================================================
-- Channel Analytics — daily aggregates + per-post stats
-- =============================================================================
-- RLS: только владелец/admin канала видит свою аналитику
-- Индексы: покрывают lookups по (channel_id, date) и (channel_id)
-- Idempotency: UNIQUE(channel_id, date) / UNIQUE(post_id) → ON CONFLICT DO UPDATE
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. channel_analytics_daily
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_analytics_daily (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id            uuid        NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  date                  date        NOT NULL,
  subscribers_count     integer     NOT NULL DEFAULT 0,
  subscribers_gained    integer     NOT NULL DEFAULT 0,
  subscribers_lost      integer     NOT NULL DEFAULT 0,
  views_count           integer     NOT NULL DEFAULT 0,
  shares_count          integer     NOT NULL DEFAULT 0,
  reactions_count       integer     NOT NULL DEFAULT 0,
  comments_count        integer     NOT NULL DEFAULT 0,
  reach_count           integer     NOT NULL DEFAULT 0,
  avg_view_time_seconds integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_analytics_daily UNIQUE (channel_id, date)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_channel_analytics_daily_channel_date
  ON public.channel_analytics_daily (channel_id, date DESC);

-- ---------------------------------------------------------------------------
-- 2. channel_post_stats
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_post_stats (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid        NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  channel_id     uuid        NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  views          integer     NOT NULL DEFAULT 0,
  forwards       integer     NOT NULL DEFAULT 0,
  reactions      jsonb       NOT NULL DEFAULT '{}',
  comments_count integer     NOT NULL DEFAULT 0,
  reach          integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_post_stats UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_post_stats_channel
  ON public.channel_post_stats (channel_id, views DESC);

-- ---------------------------------------------------------------------------
-- 3. post_view_log — дедупликация просмотров (один просмотр на user×post)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_post_view_log (
  user_id    uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id    uuid  NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_post_view_log_post
  ON public.channel_post_view_log (post_id);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.channel_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_post_stats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_post_view_log    ENABLE ROW LEVEL SECURITY;

-- Вспомогательная функция: is_channel_admin(channel_id)
-- Returns true если текущий пользователь — владелец или admin канала
CREATE OR REPLACE FUNCTION public.is_channel_admin(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = p_channel_id
      AND (
        c.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id = p_channel_id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('admin', 'owner')
        )
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_channel_admin(uuid) TO authenticated;

-- channel_analytics_daily: только admin/owner читает
DROP POLICY IF EXISTS "channel_analytics_daily_select" ON public.channel_analytics_daily;
CREATE POLICY "channel_analytics_daily_select"
  ON public.channel_analytics_daily FOR SELECT
  USING (public.is_channel_admin(channel_id));

DROP POLICY IF EXISTS "channel_analytics_daily_insert" ON public.channel_analytics_daily;
CREATE POLICY "channel_analytics_daily_insert"
  ON public.channel_analytics_daily FOR INSERT
  WITH CHECK (public.is_channel_admin(channel_id));

DROP POLICY IF EXISTS "channel_analytics_daily_update" ON public.channel_analytics_daily;
CREATE POLICY "channel_analytics_daily_update"
  ON public.channel_analytics_daily FOR UPDATE
  USING (public.is_channel_admin(channel_id));

-- channel_post_stats: только admin/owner читает
DROP POLICY IF EXISTS "channel_post_stats_select" ON public.channel_post_stats;
CREATE POLICY "channel_post_stats_select"
  ON public.channel_post_stats FOR SELECT
  USING (public.is_channel_admin(channel_id));

DROP POLICY IF EXISTS "channel_post_stats_insert" ON public.channel_post_stats;
CREATE POLICY "channel_post_stats_insert"
  ON public.channel_post_stats FOR INSERT
  WITH CHECK (public.is_channel_admin(channel_id));

DROP POLICY IF EXISTS "channel_post_stats_update" ON public.channel_post_stats;
CREATE POLICY "channel_post_stats_update"
  ON public.channel_post_stats FOR UPDATE
  USING (public.is_channel_admin(channel_id));

-- view_log: каждый может вставить свою запись, читать — только свою
DROP POLICY IF EXISTS "channel_post_view_log_insert" ON public.channel_post_view_log;
CREATE POLICY "channel_post_view_log_insert"
  ON public.channel_post_view_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_post_view_log_select" ON public.channel_post_view_log;
CREATE POLICY "channel_post_view_log_select"
  ON public.channel_post_view_log FOR SELECT
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Function: record_post_view (idempotent — ON CONFLICT DO NOTHING)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_post_view(
  p_post_id    uuid,
  p_channel_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_new_view boolean := false;
  v_rows integer := 0;
BEGIN
  -- 1. Записать уникальный просмотр (idempotent)
  INSERT INTO public.channel_post_view_log (user_id, post_id)
  VALUES (auth.uid(), p_post_id)
  ON CONFLICT (user_id, post_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_is_new_view := v_rows > 0;

  IF v_is_new_view THEN
    -- 2. Увеличить счётчик views и reach в post_stats
    INSERT INTO public.channel_post_stats (post_id, channel_id, views, reach)
    VALUES (p_post_id, p_channel_id, 1, 1)
    ON CONFLICT (post_id) DO UPDATE
      SET views = channel_post_stats.views + 1,
          reach = channel_post_stats.reach + 1;

    -- 3. Увеличить daily views и reach
    INSERT INTO public.channel_analytics_daily
      (channel_id, date, views_count, reach_count)
    VALUES
      (p_channel_id, CURRENT_DATE, 1, 1)
    ON CONFLICT (channel_id, date) DO UPDATE
      SET views_count = channel_analytics_daily.views_count + 1,
          reach_count = channel_analytics_daily.reach_count + 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_post_view(uuid, uuid) TO authenticated;
