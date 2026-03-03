-- Уведомления пользователя
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- like, comment, follow, mention, story_reaction, live, dm, system
  title TEXT,
  body TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT, -- post, reel, story, comment, profile
  target_id UUID,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;

-- Push-токены устройств
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL, -- web, ios, android
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- Настройки уведомлений
CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  likes BOOLEAN DEFAULT true,
  comments BOOLEAN DEFAULT true,
  follows BOOLEAN DEFAULT true,
  mentions BOOLEAN DEFAULT true,
  story_reactions BOOLEAN DEFAULT true,
  live_notifications BOOLEAN DEFAULT true,
  dm_notifications BOOLEAN DEFAULT true,
  pause_all BOOLEAN DEFAULT false,
  pause_until TIMESTAMPTZ
);

-- Жалобы на контент
CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- post, reel, story, comment, message, profile
  content_id UUID NOT NULL,
  reason TEXT NOT NULL, -- spam, harassment, hate_speech, nudity, violence, misinformation, other
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, reviewed, action_taken, dismissed
  moderator_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  action TEXT, -- warning, remove, ban_temp, ban_perm
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status, created_at DESC);

-- Модерация — автоматические флаги
CREATE TABLE IF NOT EXISTS public.content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  flag_type TEXT NOT NULL, -- nsfw, spam, hate, violence, copyright
  confidence FLOAT DEFAULT 0, -- 0.0-1.0
  source TEXT DEFAULT 'ai', -- ai, user_report, system
  status TEXT DEFAULT 'pending', -- pending, confirmed, false_positive
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flags_pending ON content_flags(status, confidence DESC) WHERE status = 'pending';

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users manage push tokens" ON push_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage notification settings" ON notification_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users create reports" ON content_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users read own reports" ON content_reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "System manages flags" ON content_flags FOR SELECT USING (true);
