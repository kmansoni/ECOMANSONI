-- Расширение запланированных сообщений (v2 — доп. индексы и поля)
-- Основная таблица scheduled_messages уже существует в проекте.
-- Эта миграция — additive: добавляем недостающие индексы.

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conversation
  ON scheduled_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_time
  ON scheduled_messages(scheduled_for)
  WHERE status = 'scheduled';
