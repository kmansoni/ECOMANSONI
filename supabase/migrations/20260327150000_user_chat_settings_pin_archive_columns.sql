-- Добавляем колонки pin/archive в user_chat_settings.
-- Они требуются хуками usePinnedChats и useArchivedChats.
-- Использование IF NOT EXISTS безопасно при повторном применении.

ALTER TABLE user_chat_settings
  ADD COLUMN IF NOT EXISTS is_pinned   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_order   INTEGER,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Индекс для быстрой выборки закреплённых чатов по пользователю
CREATE INDEX IF NOT EXISTS user_chat_settings_pinned_idx
  ON user_chat_settings (user_id, pin_order ASC)
  WHERE is_pinned = true;

-- Индекс для быстрой выборки архивированных чатов по пользователю
CREATE INDEX IF NOT EXISTS user_chat_settings_archived_idx
  ON user_chat_settings (user_id)
  WHERE is_archived = true;
