-- Настройки чата для каждого пользователя
CREATE TABLE IF NOT EXISTS user_chat_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  -- Уведомления
  notifications_enabled BOOLEAN DEFAULT true,
  notification_sound TEXT DEFAULT 'default',
  notification_vibration BOOLEAN DEFAULT true,
  muted_until TIMESTAMPTZ,
  -- Визуальные
  chat_wallpaper TEXT DEFAULT 'default',
  font_size TEXT DEFAULT 'medium',
  bubble_style TEXT DEFAULT 'modern',
  -- Поведение
  auto_download_media BOOLEAN DEFAULT true,
  send_by_enter BOOLEAN DEFAULT true,
  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, conversation_id)
);

-- Глобальные настройки чатов
CREATE TABLE IF NOT EXISTS user_global_chat_settings (
  user_id UUID PRIMARY KEY,
  -- Звуки
  message_sound TEXT DEFAULT 'default',
  group_sound TEXT DEFAULT 'default',
  channel_sound TEXT DEFAULT 'default',
  -- Уведомления
  show_preview BOOLEAN DEFAULT true,
  in_app_sounds BOOLEAN DEFAULT true,
  in_app_vibrate BOOLEAN DEFAULT true,
  -- Внешний вид
  default_wallpaper TEXT DEFAULT 'default',
  chat_text_size INTEGER DEFAULT 16,
  bubble_corners TEXT DEFAULT 'rounded',
  -- Жесты
  swipe_to_reply BOOLEAN DEFAULT true,
  double_tap_reaction TEXT DEFAULT '❤️',
  -- Медиа
  auto_download_wifi BOOLEAN DEFAULT true,
  auto_download_mobile BOOLEAN DEFAULT false,
  auto_play_gifs BOOLEAN DEFAULT true,
  auto_play_videos BOOLEAN DEFAULT false,
  -- Приватность
  read_receipts_enabled BOOLEAN DEFAULT true,
  typing_indicator_enabled BOOLEAN DEFAULT true,
  link_preview_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE user_chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_global_chat_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chat settings" ON user_chat_settings FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users manage own global settings" ON user_global_chat_settings FOR ALL USING (user_id = auth.uid());
