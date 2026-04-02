-- Broadcast Channels: каналы-рассылки в Direct (аналог Instagram Broadcast Channels)
-- Creator создаёт канал, подписчики видят сообщения read-only, могут реагировать.

-- ── Таблица каналов ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT DEFAULT '' NOT NULL,
  avatar_url TEXT,
  is_public BOOLEAN DEFAULT true NOT NULL,
  member_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcast_channels_creator ON broadcast_channels(creator_id);

ALTER TABLE broadcast_channels ENABLE ROW LEVEL SECURITY;

-- Публичные каналы видны всем для поиска
CREATE POLICY "bc_public_select" ON broadcast_channels
  FOR SELECT USING (is_public = true OR creator_id = auth.uid());

-- Создатель управляет своим каналом
CREATE POLICY "bc_creator_insert" ON broadcast_channels
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "bc_creator_update" ON broadcast_channels
  FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "bc_creator_delete" ON broadcast_channels
  FOR DELETE USING (auth.uid() = creator_id);

-- ── Подписчики канала ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES broadcast_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bc_members_channel ON broadcast_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_bc_members_user ON broadcast_channel_members(user_id);

ALTER TABLE broadcast_channel_members ENABLE ROW LEVEL SECURITY;

-- Подписчик видит свои подписки; создатель канала видит всех подписчиков
CREATE POLICY "bcm_select" ON broadcast_channel_members
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM broadcast_channels bc WHERE bc.id = channel_id AND bc.creator_id = auth.uid())
  );

CREATE POLICY "bcm_insert" ON broadcast_channel_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bcm_delete" ON broadcast_channel_members
  FOR DELETE USING (auth.uid() = user_id);

-- ── Сообщения канала ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES broadcast_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4096),
  media_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bc_messages_channel ON broadcast_channel_messages(channel_id, created_at DESC);

ALTER TABLE broadcast_channel_messages ENABLE ROW LEVEL SECURITY;

-- Подписчики и создатель могут читать сообщения
CREATE POLICY "bcmsg_select" ON broadcast_channel_messages
  FOR SELECT USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM broadcast_channel_members
      WHERE channel_id = broadcast_channel_messages.channel_id AND user_id = auth.uid()
    )
  );

-- Только создатель канала может отправлять сообщения
CREATE POLICY "bcmsg_insert" ON broadcast_channel_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM broadcast_channels WHERE id = channel_id AND creator_id = auth.uid())
  );

-- Создатель может удалять сообщения
CREATE POLICY "bcmsg_delete" ON broadcast_channel_messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM broadcast_channels WHERE id = channel_id AND creator_id = auth.uid())
  );

-- ── Trigger: автообновление member_count ─────────────────────────────
CREATE OR REPLACE FUNCTION update_broadcast_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE broadcast_channels SET member_count = member_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE broadcast_channels SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_member_count ON broadcast_channel_members;
CREATE TRIGGER trg_broadcast_member_count
  AFTER INSERT OR DELETE ON broadcast_channel_members
  FOR EACH ROW EXECUTE FUNCTION update_broadcast_member_count();
