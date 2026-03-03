-- Голосовые сообщения
CREATE TABLE IF NOT EXISTS public.voice_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  audio_url TEXT NOT NULL,
  duration_seconds FLOAT NOT NULL DEFAULT 0,
  waveform FLOAT[] DEFAULT '{}',
  is_listened BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_messages_conv ON voice_messages(conversation_id, created_at DESC);

-- Vanish mode состояние
CREATE TABLE IF NOT EXISTS public.vanish_mode_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  activated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  activated_at TIMESTAMPTZ DEFAULT now(),
  deactivated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vanish_sessions_conv ON vanish_mode_sessions(conversation_id, is_active);

-- Реакции на сообщения
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(message_id, user_id)
);

-- Статус прочтения и дополнительные поля
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_vanish BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;

-- RLS
ALTER TABLE voice_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE vanish_mode_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read voice messages" ON voice_messages FOR SELECT USING (true);
CREATE POLICY "Users create voice messages" ON voice_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users manage vanish" ON vanish_mode_sessions FOR ALL USING (auth.uid() = activated_by);
CREATE POLICY "Users manage reactions" ON message_reactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads reactions" ON message_reactions FOR SELECT USING (true);
