-- Таблица аудита модерации каналов
-- Логирует все действия модератора/admin/owner: kick, ban, role_change, pin, delete_message
CREATE TABLE IF NOT EXISTS channel_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'member_kicked',
    'member_banned',
    'member_unbanned',
    'role_changed',
    'message_deleted',
    'message_pinned',
    'message_unpinned',
    'channel_updated',
    'invite_created'
  )),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chan_mod_log_channel ON channel_moderation_log(channel_id, created_at DESC);
CREATE INDEX idx_chan_mod_log_actor ON channel_moderation_log(actor_id);

ALTER TABLE channel_moderation_log ENABLE ROW LEVEL SECURITY;

-- Только owner и admin канала могут читать лог модерации
DO $$ BEGIN
  CREATE POLICY "channel_mod_log_select" ON channel_moderation_log
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = channel_moderation_log.channel_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Вставка: только authenticated (проверка прав делается на уровне приложения)
DO $$ BEGIN
  CREATE POLICY "channel_mod_log_insert" ON channel_moderation_log
    FOR INSERT WITH CHECK (
      actor_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = channel_moderation_log.channel_id
          AND cm.user_id = auth.uid()
          AND cm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
