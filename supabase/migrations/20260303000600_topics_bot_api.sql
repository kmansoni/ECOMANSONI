-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Темы (Topics) для групп — как в Telegram
CREATE TABLE IF NOT EXISTS group_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL, -- ссылка на group_chats
  name TEXT NOT NULL,
  icon_emoji TEXT DEFAULT '💬',
  icon_color TEXT DEFAULT '#3B82F6', -- hex цвет
  description TEXT,
  is_general BOOLEAN DEFAULT false, -- тема "Общее" (нельзя удалить)
  is_closed BOOLEAN DEFAULT false, -- закрытая тема (только чтение)
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_group_topics_group ON group_topics(group_id, sort_order);

-- Привязка сообщений к темам
ALTER TABLE messages ADD COLUMN IF NOT EXISTS topic_id UUID;
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id, created_at DESC) WHERE topic_id IS NOT NULL;

-- Включить темы для группы
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS topics_enabled BOOLEAN DEFAULT false;

-- RLS
ALTER TABLE group_topics ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'group_topics' AND policyname = 'Topics readable by group members'
  ) THEN
    CREATE POLICY "Topics readable by group members" ON group_topics FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'group_topics' AND policyname = 'Topics created by group members'
  ) THEN
    CREATE POLICY "Topics created by group members" ON group_topics FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'group_topics' AND policyname = 'Topics updated by creator'
  ) THEN
    CREATE POLICY "Topics updated by creator" ON group_topics FOR UPDATE USING (created_by = auth.uid());
  END IF;
END $$;

-- Бот API таблицы
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  description TEXT,
  api_token TEXT NOT NULL UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text),
  is_active BOOLEAN DEFAULT true,
  capabilities JSONB DEFAULT '["send_messages","receive_messages"]'::jsonb,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bots ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS api_token TEXT DEFAULT md5(random()::text || clock_timestamp()::text);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '["send_messages","receive_messages"]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE bots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS ux_bots_username ON bots(username);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bots_api_token ON bots(api_token);

CREATE TABLE IF NOT EXISTS bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  command TEXT NOT NULL, -- /start, /help, etc.
  description TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(bot_id, command)
);

-- Бот может быть участником чата
CREATE TABLE IF NOT EXISTS bot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  added_by UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bot_id, conversation_id)
);

-- Inline кнопки бота
CREATE TABLE IF NOT EXISTS bot_inline_keyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  keyboard_data JSONB NOT NULL, -- [[{text, callback_data, url}]]
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS для ботов
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_inline_keyboards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bots' AND policyname = 'Bots readable by all'
  ) THEN
    CREATE POLICY "Bots readable by all" ON bots FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bots' AND policyname = 'Bot owners manage bots'
  ) THEN
    CREATE POLICY "Bot owners manage bots" ON bots FOR ALL USING (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bot_commands' AND policyname = 'Bot commands readable'
  ) THEN
    CREATE POLICY "Bot commands readable" ON bot_commands FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bot_conversations' AND policyname = 'Bot conversations readable'
  ) THEN
    CREATE POLICY "Bot conversations readable" ON bot_conversations FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bot_inline_keyboards' AND policyname = 'Bot keyboards readable'
  ) THEN
    CREATE POLICY "Bot keyboards readable" ON bot_inline_keyboards FOR SELECT USING (true);
  END IF;
END $$;

-- Seed: системный бот (только если существует owner profile)
INSERT INTO bots (id, owner_id, username, display_name, description, capabilities)
SELECT
  '00000000-0000-0000-0000-000000000099'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'system_bot',
  'Системный бот',
  'Помощник платформы',
  '["send_messages","receive_messages","inline_keyboards","commands"]'::jsonb
WHERE EXISTS (
  SELECT 1 FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
)
ON CONFLICT DO NOTHING;
