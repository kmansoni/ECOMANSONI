-- Disappearing Messages Feature
-- B-076

-- Добавить поля к messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS disappear_in_seconds INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS disappear_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS disappeared BOOLEAN DEFAULT false;

-- Добавить настройку по-умолчанию на разговор
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS default_disappear_timer INTEGER; -- null = off

-- Функция для обработки исчезающих сообщений
CREATE OR REPLACE FUNCTION process_disappearing_messages()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE messages 
  SET disappeared = true, content = '[сообщение удалено]', media_url = NULL
  WHERE disappear_at IS NOT NULL 
    AND disappear_at <= now() 
    AND disappeared = false;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Индекс для быстрого поиска истекших сообщений
CREATE INDEX IF NOT EXISTS idx_messages_disappear_at 
  ON messages (disappear_at) 
  WHERE disappear_at IS NOT NULL AND disappeared = false;
