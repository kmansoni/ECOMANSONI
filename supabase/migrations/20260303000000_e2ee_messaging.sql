-- ============================================================
-- E2EE Messaging: таблицы ключей и поля для шифрования сообщений
-- ============================================================

-- Таблица групповых ключей шифрования (по версиям)
CREATE TABLE IF NOT EXISTS chat_encryption_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  key_version INTEGER NOT NULL DEFAULT 1,
  encrypted_key TEXT NOT NULL, -- ключ зашифрованный мастер-ключом создателя
  algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(conversation_id, key_version)
);

-- Ключи пользователей: групповой ключ, зашифрованный мастер-ключом каждого участника
CREATE TABLE IF NOT EXISTS user_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  key_version INTEGER NOT NULL,
  encrypted_group_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, conversation_id, key_version)
);

-- Добавить поля шифрования в таблицу messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_iv TEXT;

-- Добавить признак включённого шифрования в conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS encryption_enabled BOOLEAN DEFAULT false;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE chat_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Участники беседы могут читать ключи своей беседы
CREATE POLICY "Users can read keys for their conversations"
  ON chat_encryption_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = chat_encryption_keys.conversation_id
        AND user_id = auth.uid()
    )
  );

-- Создатель может вставлять новый ключ беседы
CREATE POLICY "Conversation creator can insert encryption keys"
  ON chat_encryption_keys
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = chat_encryption_keys.conversation_id
        AND user_id = auth.uid()
    )
  );

-- Пользователи видят только свои пользовательские ключи
CREATE POLICY "Users can read their own encryption keys"
  ON user_encryption_keys
  FOR SELECT
  USING (user_id = auth.uid());

-- Пользователи могут добавлять свои ключи
CREATE POLICY "Users can insert their own encryption keys"
  ON user_encryption_keys
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
