-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Секретные чаты
CREATE TABLE IF NOT EXISTS secret_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE,
  initiator_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active, closed
  default_ttl_seconds INTEGER DEFAULT 30, -- таймер по умолчанию
  screenshot_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

ALTER TABLE secret_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own secret chats" ON secret_chats
  FOR SELECT USING (initiator_id = auth.uid() OR participant_id = auth.uid());
CREATE POLICY "Users create secret chats" ON secret_chats
  FOR INSERT WITH CHECK (initiator_id = auth.uid());
CREATE POLICY "Users update own secret chats" ON secret_chats
  FOR UPDATE USING (initiator_id = auth.uid() OR participant_id = auth.uid());

-- Пометка conversation как секретный
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT false;

-- Опросы
CREATE TABLE IF NOT EXISTS message_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID,
  conversation_id UUID NOT NULL,
  creator_id UUID NOT NULL,
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL DEFAULT 'regular', -- regular, quiz, multiple
  is_anonymous BOOLEAN DEFAULT false,
  allows_multiple BOOLEAN DEFAULT false,
  correct_option_index INTEGER, -- для quiz
  close_date TIMESTAMPTZ,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES message_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  voter_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES message_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, option_id, user_id)
);

-- Добавить poll_id к messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS poll_id UUID;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_secret_chats_participants ON secret_chats(initiator_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id, option_index);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id, user_id);

-- RLS для опросов
ALTER TABLE message_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Polls readable in conversations" ON message_polls FOR SELECT USING (true);
CREATE POLICY "Poll options readable" ON poll_options FOR SELECT USING (true);
CREATE POLICY "Users manage own votes" ON poll_votes FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users create polls" ON message_polls FOR INSERT WITH CHECK (creator_id = auth.uid());

-- Функция голосования (атомарная)
CREATE OR REPLACE FUNCTION vote_poll_v1(
  p_poll_id UUID,
  p_option_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_poll message_polls%ROWTYPE;
  v_existing poll_votes%ROWTYPE;
BEGIN
  SELECT * INTO v_poll FROM message_polls WHERE id = p_poll_id;
  IF NOT FOUND OR v_poll.is_closed THEN
    RETURN json_build_object('ok', false, 'error', 'poll_closed');
  END IF;

  -- Проверить существующий голос (если не multiple)
  IF NOT v_poll.allows_multiple THEN
    SELECT * INTO v_existing FROM poll_votes WHERE poll_id = p_poll_id AND user_id = p_user_id;
    IF FOUND THEN
      -- Убрать старый голос
      DELETE FROM poll_votes WHERE poll_id = p_poll_id AND user_id = p_user_id;
      UPDATE poll_options SET voter_count = GREATEST(voter_count - 1, 0) WHERE id = v_existing.option_id;
    END IF;
  END IF;

  -- Добавить голос
  INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (p_poll_id, p_option_id, p_user_id)
  ON CONFLICT (poll_id, option_id, user_id) DO NOTHING;
  
  UPDATE poll_options SET voter_count = voter_count + 1 WHERE id = p_option_id;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
