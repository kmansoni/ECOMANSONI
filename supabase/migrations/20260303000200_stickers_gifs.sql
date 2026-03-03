-- Стикерпаки
CREATE TABLE IF NOT EXISTS sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  author_id UUID,
  is_official BOOLEAN DEFAULT false,
  is_animated BOOLEAN DEFAULT false,
  sticker_count INTEGER DEFAULT 0,
  install_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS author_id UUID;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS is_animated BOOLEAN DEFAULT false;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS sticker_count INTEGER DEFAULT 0;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS install_count INTEGER DEFAULT 0;
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE sticker_packs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE sticker_packs
SET name = COALESCE(name, title, id::text)
WHERE name IS NULL;

UPDATE sticker_packs
SET title = COALESCE(title, name, id::text)
WHERE title IS NULL;

ALTER TABLE sticker_packs ALTER COLUMN name SET NOT NULL;
ALTER TABLE sticker_packs ALTER COLUMN title SET NOT NULL;

-- Стикеры
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  emoji TEXT, -- ассоциированный emoji
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'webp', -- webp, lottie, tgs
  width INTEGER DEFAULT 512,
  height INTEGER DEFAULT 512,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Установленные пользователем стикерпаки
CREATE TABLE IF NOT EXISTS user_sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pack_id UUID NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  installed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pack_id)
);

-- Недавно использованные стикеры
CREATE TABLE IF NOT EXISTS user_recent_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT now(),
  use_count INTEGER DEFAULT 1,
  UNIQUE(user_id, sticker_id)
);

-- Избранные GIF
CREATE TABLE IF NOT EXISTS user_saved_gifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gif_url TEXT NOT NULL,
  preview_url TEXT,
  width INTEGER,
  height INTEGER,
  source TEXT DEFAULT 'tenor', -- tenor, giphy
  saved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, gif_url)
);

-- Добавить media_type варианты
-- messages.media_type уже TEXT, добавим поддержку 'sticker' и 'gif'
-- messages.sticker_id UUID — ссылка на стикер
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sticker_id UUID;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(pack_id, position);
CREATE INDEX IF NOT EXISTS idx_user_sticker_packs ON user_sticker_packs(user_id, position);
CREATE INDEX IF NOT EXISTS idx_user_recent_stickers ON user_recent_stickers(user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_saved_gifs ON user_saved_gifs(user_id, saved_at DESC);

-- RLS
ALTER TABLE sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recent_stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_saved_gifs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sticker_packs' AND policyname = 'Sticker packs readable by all'
  ) THEN
    CREATE POLICY "Sticker packs readable by all" ON sticker_packs FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stickers' AND policyname = 'Stickers readable by all'
  ) THEN
    CREATE POLICY "Stickers readable by all" ON stickers FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_sticker_packs' AND policyname = 'Users manage own sticker packs'
  ) THEN
    CREATE POLICY "Users manage own sticker packs" ON user_sticker_packs FOR ALL USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_recent_stickers' AND policyname = 'Users manage own recent stickers'
  ) THEN
    CREATE POLICY "Users manage own recent stickers" ON user_recent_stickers FOR ALL USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_saved_gifs' AND policyname = 'Users manage own saved gifs'
  ) THEN
    CREATE POLICY "Users manage own saved gifs" ON user_saved_gifs FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Seed: несколько встроенных стикерпаков
INSERT INTO sticker_packs (id, name, title, is_official, is_animated, sticker_count) VALUES
  ('00000000-0000-0000-0000-000000000001', 'classic_emotions', 'Классические эмоции', true, false, 20),
  ('00000000-0000-0000-0000-000000000002', 'cute_cats', 'Милые котики', true, true, 16),
  ('00000000-0000-0000-0000-000000000003', 'work_life', 'Рабочие будни', true, false, 12)
ON CONFLICT DO NOTHING;
