-- Premium подписка (аналог Telegram Premium)

CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'business')),
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN DEFAULT true,
  payment_method TEXT CHECK (payment_method IS NULL OR char_length(payment_method) <= 100),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_premium_subscriptions_user ON premium_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_premium_subscriptions_expires ON premium_subscriptions(expires_at);

ALTER TABLE premium_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "premium_sub_select_own"
  ON premium_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "premium_sub_insert_own"
  ON premium_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "premium_sub_update_own"
  ON premium_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "premium_sub_delete_own"
  ON premium_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Справочник фич Premium
CREATE TABLE IF NOT EXISTS premium_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 2 AND 50),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  min_plan TEXT NOT NULL CHECK (min_plan IN ('basic', 'pro', 'business'))
);

ALTER TABLE premium_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "premium_features_select_all"
  ON premium_features FOR SELECT
  USING (true);

INSERT INTO premium_features (slug, name, description, min_plan) VALUES
  ('no_ads', 'Без рекламы', 'Убирает всю рекламу в приложении', 'basic'),
  ('custom_emoji', 'Кастомные эмодзи', 'Создавайте свои паки эмодзи', 'basic'),
  ('4k_upload', '4K загрузка', 'Загрузка фото и видео в 4K', 'basic'),
  ('ai_unlimited', 'AI без лимитов', 'Безлимитная генерация AI контента', 'pro'),
  ('analytics_plus', 'Продвинутая аналитика', 'Детальная статистика', 'pro'),
  ('priority_support', 'Приоритетная поддержка', 'Ответ в течение 1 часа', 'pro'),
  ('api_access', 'API доступ', 'Программный доступ к платформе', 'business'),
  ('team_members', 'Команда', 'До 10 аккаунтов в команде', 'business'),
  ('white_label', 'White Label', 'Брендирование магазина', 'business')
ON CONFLICT (slug) DO NOTHING;
