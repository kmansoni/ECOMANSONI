-- =============================================================================
-- ECOMANSONI Livestream Platform — Расширение таблицы live_chat_messages
-- Миграция: 20260308000005_livestream_chat_extend.sql
-- Назначение: Типизация сообщений, pining, threading (reply_to), metadata
--
-- Архитектурные решения:
--   - live_chat_messages.id = BIGSERIAL → reply_to_id = BIGINT.
--   - type CHECK constraint: system — служебные события (join/leave/gift),
--     pinned — закреплённые хостом, gift — визуальные «подарки», question — Q&A.
--   - is_pinned + pinned_by + pinned_at: атомарный pin через одну транзакцию.
--   - reply_to_id SELF-FK с ON DELETE SET NULL — тред не ломается при удалении.
--   - metadata JSONB: произвольные данные (gift_id, sticker_id, reaction_type…).
--   - Partial index на (session_id) WHERE is_pinned = true — O(1) для запроса
--     закреплённого сообщения (не более 1 одновременно на сессию, контроль app-level).
-- =============================================================================

-- type: тип сообщения (DEFAULT 'text' — обратная совместимость с существующими строками)
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text';
COMMENT ON COLUMN public.live_chat_messages.type
  IS 'Тип сообщения: text|system|pinned|gift|question';

-- CHECK constraint на type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_chat_messages_type_check'
      AND conrelid = 'public.live_chat_messages'::regclass
  ) THEN
    ALTER TABLE public.live_chat_messages
      ADD CONSTRAINT live_chat_messages_type_check
      CHECK (type IN ('text', 'system', 'pinned', 'gift', 'question'));
  END IF;
END;
$$;

-- is_pinned: флаг закреплённости
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.live_chat_messages.is_pinned
  IS 'true = сообщение закреплено хостом поверх чата';

-- pinned_by: пользователь, закрепивший сообщение
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.live_chat_messages.pinned_by
  IS 'FK → auth.users.id — кто закрепил сообщение';

-- pinned_at: время закрепления
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
COMMENT ON COLUMN public.live_chat_messages.pinned_at
  IS 'Время закрепления сообщения (NULL = не закреплено)';

-- reply_to_id: ссылка на родительское сообщение (threading)
-- BIGINT т.к. live_chat_messages.id = BIGSERIAL
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES public.live_chat_messages(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.live_chat_messages.reply_to_id
  IS 'FK → live_chat_messages.id — родительское сообщение (тред); NULL = корневое';

-- metadata: произвольный JSON (gift_id, sticker_id, reaction, emoji_burst)
ALTER TABLE public.live_chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.live_chat_messages.metadata
  IS 'JSONB-метаданные: {gift_id, sticker_id, reaction_type, system_event}';

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------

-- Запрос закреплённого сообщения — partial index, почти нулевая стоимость
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_pinned
  ON public.live_chat_messages (session_id)
  WHERE is_pinned = true;

-- GIN-индекс на metadata для поиска по gift_id, sticker_id и т.д.
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_metadata_gin
  ON public.live_chat_messages USING GIN (metadata);
