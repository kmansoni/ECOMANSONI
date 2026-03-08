-- =============================================================================
-- ECOMANSONI Livestream Platform — Расширение таблицы live_sessions
-- Миграция: 20260308000003_livestream_sessions_extend.sql
-- Назначение: Добавление колонок для LiveKit-интеграции, аналитики, контентных
--             меток и геоограничений в существующую таблицу live_sessions.
--
-- Архитектурные решения:
--   - live_sessions.id является BIGSERIAL — это BIGINT FK для дочерних таблиц.
--   - scheduled_at уже добавлен в 20260303212000 — пропускаем (IF NOT EXISTS).
--   - replay_url уже добавлен в 20260303212000 — пропускаем.
--   - category уже есть в исходной схеме (CHECK constraint) — колонка НЕ добавляется повторно.
--   - tags как TEXT[] + GIN index для эффективного поиска @> и && операторами.
--   - ingest_protocol CHECK гарантирует только допустимые значения протокола.
--   - livekit_room_name покрыт уникальным индексом (comms layer идентификатор).
-- =============================================================================

-- livekit_room_name: уникальный идентификатор комнаты в LiveKit SFU
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
COMMENT ON COLUMN public.live_sessions.livekit_room_name
  IS 'Имя комнаты в LiveKit SFU (уникально в рамках проекта)';

-- livekit_room_sid: SID комнаты, возвращаемый LiveKit API при создании
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS livekit_room_sid TEXT;
COMMENT ON COLUMN public.live_sessions.livekit_room_sid
  IS 'SID комнаты LiveKit — внутренний идентификатор для сигналинга и записи';

-- stream_key_id: связь с ключом стримера (RTMP/WHIP ingest авторизация)
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS stream_key_id UUID REFERENCES public.live_stream_keys(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.live_sessions.stream_key_id
  IS 'FK на live_stream_keys — ключ, использованный для создания этой сессии';

-- scheduled_at: уже добавлен миграцией 20260303212000, однако применяем IF NOT EXISTS
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
COMMENT ON COLUMN public.live_sessions.scheduled_at
  IS 'Запланированное время начала эфира (для scheduled streams)';

-- actual_start_at: фактическое время начала вещания (отличается от started_at — это транскодер)
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMPTZ;
COMMENT ON COLUMN public.live_sessions.actual_start_at
  IS 'Фактический момент начала видеопотока (когда первый байт принят ingest-сервером)';

-- actual_end_at: фактическое окончание потока
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS actual_end_at TIMESTAMPTZ;
COMMENT ON COLUMN public.live_sessions.actual_end_at
  IS 'Фактический момент завершения видеопотока';

-- max_viewers: пик одновременных зрителей (обновляется триггером)
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS max_viewers INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.live_sessions.max_viewers
  IS 'Максимальное одновременное число зрителей за всё время эфира';

-- total_viewers: суммарное (уникальные) количество зрителей
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS total_viewers INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.live_sessions.total_viewers
  IS 'Суммарное количество уникальных зрителей';

-- avg_watch_duration_sec: средняя длительность просмотра в секундах
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS avg_watch_duration_sec INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.live_sessions.avg_watch_duration_sec
  IS 'Средняя длительность просмотра одним зрителем в секундах';

-- replay_url: уже добавлен миграцией 20260303212000
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS replay_url TEXT;
COMMENT ON COLUMN public.live_sessions.replay_url
  IS 'URL HLS/DASH манифеста VOD-записи (CDN endpoint)';

-- replay_thumbnail_url: превью-кадр записи
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS replay_thumbnail_url TEXT;
COMMENT ON COLUMN public.live_sessions.replay_thumbnail_url
  IS 'URL thumbnail-кадра для карточки VOD-записи';

-- is_replay_available: флаг готовности VOD
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS is_replay_available BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.live_sessions.is_replay_available
  IS 'true = запись обработана и доступна для воспроизведения';

-- is_mature_content: флаг контента 18+
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS is_mature_content BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.live_sessions.is_mature_content
  IS 'Флаг контента 18+ — влияет на видимость в дискавери для неверифицированных пользователей';

-- language: язык вещания (BCP-47 код)
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ru';
COMMENT ON COLUMN public.live_sessions.language
  IS 'BCP-47 код языка вещания (ru, en, kk, …)';

-- tags: массив тегов для дискавери
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.live_sessions.tags
  IS 'Массив тегов стрима для поиска и фильтрации (GIN-индекс)';

-- geo_restrictions: массив ISO 3166-1 alpha-2 кодов стран с ограничением доступа
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS geo_restrictions TEXT[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.live_sessions.geo_restrictions
  IS 'ISO 3166-1 alpha-2 коды стран, для которых стрим заблокирован (пустой = без ограничений)';

-- ingest_protocol: протокол intake видеопотока
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS ingest_protocol TEXT NOT NULL DEFAULT 'whip';
COMMENT ON COLUMN public.live_sessions.ingest_protocol
  IS 'Протокол ingest: whip (browser WebRTC) или rtmp (OBS/Streamlabs)';

-- CHECK constraint на ingest_protocol
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_sessions_ingest_protocol_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions
      ADD CONSTRAINT live_sessions_ingest_protocol_check
      CHECK (ingest_protocol IN ('whip', 'rtmp'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Дискавери: активные стримы, сортированные по расписанию
CREATE INDEX IF NOT EXISTS idx_live_sessions_status_scheduled
  ON public.live_sessions (status, scheduled_at)
  WHERE status IN ('preparing', 'live');

-- Reverse-lookup LiveKit room → session (O(1) сигналинг)
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_livekit_room_name
  ON public.live_sessions (livekit_room_name)
  WHERE livekit_room_name IS NOT NULL;

-- GIN-индекс для @> / && -операторов по тегам
CREATE INDEX IF NOT EXISTS idx_live_sessions_tags_gin
  ON public.live_sessions USING GIN (tags);
