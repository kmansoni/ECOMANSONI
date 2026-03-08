-- =============================================================================
-- ECOMANSONI Livestream Platform — Stream Keys (RTMP / WHIP авторизация)
-- Миграция: 20260308000002_livestream_stream_keys.sql
-- Назначение: Секретные ключи стримера для OBS/Streamlabs RTMP-ingest
--
-- Архитектурные решения:
--   - key_value хранится как TEXT (НЕ хэш) — LiveKit/Nimble проверяют по plain value
--     через Edge Function. В production значение должно генерироваться на сервере
--     через crypto.randomBytes(32).toString('base64url') (256 бит энтропии).
--   - RLS: пользователь видит только свои ключи. key_value НЕ должен раскрываться
--     публично — политика SELECT ограничена owner.
--   - Partial index на (key_value) WHERE is_active = true ускоряет ingest-авторизацию
--     без сканирования деактивированных ключей.
--   - ON DELETE CASCADE при удалении профиля — zero-leak гарантия.
--
-- Именование колонок намеренно согласовано с gateway API (key_value, label):
--   - key_value: секретное значение RTMP-ключа (256-bit base64url)
--   - label:     пользовательское название ключа (OBS Home, Mobile и т.д.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.live_stream_keys (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_value      TEXT        NOT NULL UNIQUE,
  label          TEXT        NOT NULL DEFAULT 'Default',
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ -- NULL = бессрочно
);

-- ---------------------------------------------------------------------------
-- Документирование колонок
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  public.live_stream_keys              IS 'RTMP/WHIP stream keys for OBS/Streamlabs ingest authorization';
COMMENT ON COLUMN public.live_stream_keys.id           IS 'UUID PK — первичный ключ записи';
COMMENT ON COLUMN public.live_stream_keys.user_id      IS 'UUID владельца ключа (auth.users)';
COMMENT ON COLUMN public.live_stream_keys.key_value    IS 'Уникальный секретный ключ стримера для RTMP/WHIP-ingest (256-bit base64url, показывается один раз)';
COMMENT ON COLUMN public.live_stream_keys.label        IS 'Пользовательское название ключа (например "OBS Home", "Mobile")';
COMMENT ON COLUMN public.live_stream_keys.is_active    IS 'false = ключ отозван, не принимается ingest-сервером';
COMMENT ON COLUMN public.live_stream_keys.last_used_at IS 'Время последнего использования ключа — для аудита и TTL-cleanup';
COMMENT ON COLUMN public.live_stream_keys.created_at   IS 'Время создания ключа';
COMMENT ON COLUMN public.live_stream_keys.expires_at   IS 'Опциональное истечение ключа; NULL = бессрочно';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Получение всех ключей пользователя (список в UI)
CREATE INDEX IF NOT EXISTS idx_live_stream_keys_user_id
  ON public.live_stream_keys (user_id);

-- Hot-path: ingest-сервер ищет по key_value только среди активных ключей.
-- Partial index исключает деактивированные (не сканируются вообще).
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_stream_keys_active_key
  ON public.live_stream_keys (key_value)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.live_stream_keys ENABLE ROW LEVEL SECURITY;

-- Владелец видит только свои ключи
CREATE POLICY "live_stream_keys_select_owner"
  ON public.live_stream_keys
  FOR SELECT
  USING (auth.uid() = user_id);

-- Только владелец может создавать записи от своего имени
CREATE POLICY "live_stream_keys_insert_owner"
  ON public.live_stream_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Только владелец может обновлять свои ключи (например, name, is_active)
CREATE POLICY "live_stream_keys_update_owner"
  ON public.live_stream_keys
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Только владелец может удалять (предпочтительно is_active=false, но DELETE разрешён)
CREATE POLICY "live_stream_keys_delete_owner"
  ON public.live_stream_keys
  FOR DELETE
  USING (auth.uid() = user_id);
