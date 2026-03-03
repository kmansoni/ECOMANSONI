-- Баланс звёзд пользователя
CREATE TABLE IF NOT EXISTS user_stars (
  user_id UUID PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Каталог подарков
CREATE TABLE IF NOT EXISTS gift_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT,
  price_stars INTEGER NOT NULL,
  animation_url TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  rarity TEXT NOT NULL DEFAULT 'common',
  is_available BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Транзакции звёзд
CREATE TABLE IF NOT EXISTS star_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  related_gift_id UUID REFERENCES gift_catalog(id),
  related_user_id UUID,
  related_message_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Отправленные подарки
CREATE TABLE IF NOT EXISTS sent_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id UUID NOT NULL REFERENCES gift_catalog(id),
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_id UUID,
  message_text TEXT,
  stars_spent INTEGER NOT NULL,
  is_opened BOOLEAN DEFAULT false,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Добавить поле для подарков в messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_id UUID;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_star_transactions_user ON star_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_gifts_recipient ON sent_gifts(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_gifts_sender ON sent_gifts(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_catalog_category ON gift_catalog(category, sort_order);

-- RLS
ALTER TABLE user_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own stars" ON user_stars FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Gift catalog readable by all" ON gift_catalog FOR SELECT USING (true);
CREATE POLICY "Users read own transactions" ON star_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users read own gifts" ON sent_gifts FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Функция отправки подарка
CREATE OR REPLACE FUNCTION send_gift_v1(
  p_sender_id UUID,
  p_recipient_id UUID,
  p_gift_id UUID,
  p_conversation_id UUID,
  p_message_text TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_gift gift_catalog%ROWTYPE;
  v_sender_balance INTEGER;
  v_sent_gift_id UUID;
  v_tx_sender_id UUID;
  v_tx_recipient_id UUID;
BEGIN
  SELECT * INTO v_gift FROM gift_catalog WHERE id = p_gift_id AND is_available = true;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'gift_not_found');
  END IF;

  SELECT balance INTO v_sender_balance FROM user_stars WHERE user_id = p_sender_id FOR UPDATE;
  IF v_sender_balance IS NULL OR v_sender_balance < v_gift.price_stars THEN
    RETURN json_build_object('ok', false, 'error', 'insufficient_stars', 'need', v_gift.price_stars, 'have', COALESCE(v_sender_balance, 0));
  END IF;

  UPDATE user_stars SET balance = balance - v_gift.price_stars, total_spent = total_spent + v_gift.price_stars, updated_at = now() WHERE user_id = p_sender_id;

  INSERT INTO user_stars (user_id, balance, total_earned) VALUES (p_recipient_id, v_gift.price_stars / 2, v_gift.price_stars / 2)
  ON CONFLICT (user_id) DO UPDATE SET balance = user_stars.balance + v_gift.price_stars / 2, total_earned = user_stars.total_earned + v_gift.price_stars / 2, updated_at = now();

  INSERT INTO sent_gifts (gift_id, sender_id, recipient_id, conversation_id, message_text, stars_spent)
  VALUES (p_gift_id, p_sender_id, p_recipient_id, p_conversation_id, p_message_text, v_gift.price_stars)
  RETURNING id INTO v_sent_gift_id;

  INSERT INTO star_transactions (user_id, amount, type, related_gift_id, related_user_id, description)
  VALUES (p_sender_id, -v_gift.price_stars, 'gift_sent', p_gift_id, p_recipient_id, 'Подарок: ' || v_gift.name)
  RETURNING id INTO v_tx_sender_id;

  INSERT INTO star_transactions (user_id, amount, type, related_gift_id, related_user_id, description)
  VALUES (p_recipient_id, v_gift.price_stars / 2, 'gift_received', p_gift_id, p_sender_id, 'Получен подарок: ' || v_gift.name)
  RETURNING id INTO v_tx_recipient_id;

  RETURN json_build_object(
    'ok', true,
    'sent_gift_id', v_sent_gift_id,
    'gift_name', v_gift.name,
    'gift_emoji', v_gift.emoji,
    'stars_spent', v_gift.price_stars
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed каталог подарков
INSERT INTO gift_catalog (name, emoji, description, price_stars, category, rarity, sort_order) VALUES
  ('Роза', '🌹', 'Красивая роза для особенного человека', 10, 'general', 'common', 1),
  ('Подарок', '🎁', 'Праздничная коробка с сюрпризом', 25, 'general', 'common', 2),
  ('Торт', '🎂', 'Праздничный торт со свечами', 50, 'general', 'common', 3),
  ('Мишка', '🧸', 'Плюшевый медвежонок', 75, 'general', 'rare', 4),
  ('Единорог', '🦄', 'Волшебный единорог', 100, 'premium', 'rare', 5),
  ('Бриллиант', '💎', 'Сверкающий бриллиант', 200, 'premium', 'epic', 6),
  ('Корона', '👑', 'Золотая корона', 500, 'premium', 'epic', 7),
  ('Трофей', '🏆', 'Золотой трофей победителя', 1000, 'premium', 'legendary', 8),
  ('Ракета', '🚀', 'К звёздам!', 150, 'general', 'rare', 9),
  ('Сердце', '❤️', 'От всего сердца', 15, 'general', 'common', 10),
  ('Звезда', '⭐', 'Сияющая звезда', 30, 'general', 'common', 11),
  ('Огонь', '🔥', 'Горячий подарок', 40, 'general', 'common', 12)
ON CONFLICT DO NOTHING;
