-- Таблица значков достижений
CREATE TABLE IF NOT EXISTS achievement_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_emoji TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('content', 'social', 'commerce', 'engagement', 'milestone')),
  criteria JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Таблица выданных значков пользователям
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES achievement_badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- RLS
ALTER TABLE achievement_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badges visible to all" ON achievement_badges FOR SELECT USING (true);
CREATE POLICY "User badges visible" ON user_badges FOR SELECT USING (true);
CREATE POLICY "System grants badges" ON user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Seed начальных значков
INSERT INTO achievement_badges (slug, name, description, icon_emoji, category, criteria) VALUES
  ('first_post', 'Первый пост', 'Опубликуй первый пост', '📝', 'content', '{"type":"posts_count","threshold":1}'),
  ('posts_10', 'Контент-мейкер', '10 постов опубликовано', '📸', 'content', '{"type":"posts_count","threshold":10}'),
  ('posts_100', 'Блогер', '100 постов опубликовано', '🌟', 'content', '{"type":"posts_count","threshold":100}'),
  ('reels_10', 'Режиссёр', '10 Reels создано', '🎬', 'content', '{"type":"reels_count","threshold":10}'),
  ('followers_100', 'Популярный', '100 подписчиков', '👥', 'social', '{"type":"followers_count","threshold":100}'),
  ('followers_1k', 'Инфлюенсер', '1000 подписчиков', '⭐', 'social', '{"type":"followers_count","threshold":1000}'),
  ('followers_10k', 'Знаменитость', '10000 подписчиков', '💎', 'social', '{"type":"followers_count","threshold":10000}'),
  ('likes_1k', 'Любимчик', '1000 лайков получено', '❤️', 'engagement', '{"type":"total_likes","threshold":1000}'),
  ('first_sale', 'Продавец', 'Первая продажа в магазине', '🛍️', 'commerce', '{"type":"sales_count","threshold":1}'),
  ('story_streak_7', 'Дневник', '7 дней подряд с историей', '📖', 'milestone', '{"type":"story_streak","threshold":7}'),
  ('verified', 'Верифицирован', 'Аккаунт верифицирован', '✅', 'milestone', '{"type":"manual","threshold":0}'),
  ('early_adopter', 'Ранний пользователь', 'Один из первых 1000 пользователей', '🚀', 'milestone', '{"type":"user_number","threshold":1000}')
ON CONFLICT (slug) DO NOTHING;
