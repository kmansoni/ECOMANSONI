-- Per-message read receipts для групповых чатов
-- Позволяет отслеживать кто именно прочитал каждое сообщение в группе

CREATE TABLE IF NOT EXISTS group_message_reads (
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gmr_message ON group_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_gmr_user ON group_message_reads(user_id);

ALTER TABLE group_message_reads ENABLE ROW LEVEL SECURITY;

-- Все авторизованные пользователи могут видеть статусы прочтения
-- (RLS фильтрация по участникам группы делается на уровне запроса)
CREATE POLICY "gmr_select" ON group_message_reads
  FOR SELECT USING (true);

-- Пользователь может записывать только свои прочтения
CREATE POLICY "gmr_insert" ON group_message_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Запрет на обновление — read receipt не меняется
CREATE POLICY "gmr_update" ON group_message_reads
  FOR UPDATE USING (false);
