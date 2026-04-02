-- Кастомные эмодзи паки (аналог Telegram custom emoji packs)

CREATE TABLE IF NOT EXISTS emoji_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 50),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  is_public BOOLEAN DEFAULT true,
  install_count INTEGER DEFAULT 0 CHECK (install_count >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emoji_packs_creator ON emoji_packs(creator_id);
CREATE INDEX IF NOT EXISTS idx_emoji_packs_public ON emoji_packs(is_public) WHERE is_public = true;

ALTER TABLE emoji_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emoji_packs_select_public_or_own"
  ON emoji_packs FOR SELECT
  USING (is_public = true OR creator_id = auth.uid());

CREATE POLICY "emoji_packs_insert_own"
  ON emoji_packs FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "emoji_packs_update_own"
  ON emoji_packs FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "emoji_packs_delete_own"
  ON emoji_packs FOR DELETE
  USING (auth.uid() = creator_id);

-- Кастомные эмодзи внутри пака
CREATE TABLE IF NOT EXISTS custom_emojis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES emoji_packs(id) ON DELETE CASCADE,
  shortcode TEXT NOT NULL CHECK (char_length(shortcode) BETWEEN 2 AND 30),
  image_url TEXT NOT NULL CHECK (char_length(image_url) > 0),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(pack_id, shortcode)
);

CREATE INDEX IF NOT EXISTS idx_custom_emojis_pack ON custom_emojis(pack_id);

ALTER TABLE custom_emojis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_emojis_select_from_visible_packs"
  ON custom_emojis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM emoji_packs
      WHERE emoji_packs.id = custom_emojis.pack_id
        AND (emoji_packs.is_public = true OR emoji_packs.creator_id = auth.uid())
    )
  );

CREATE POLICY "custom_emojis_insert_own_pack"
  ON custom_emojis FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM emoji_packs
      WHERE emoji_packs.id = custom_emojis.pack_id
        AND emoji_packs.creator_id = auth.uid()
    )
  );

CREATE POLICY "custom_emojis_update_own_pack"
  ON custom_emojis FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM emoji_packs
      WHERE emoji_packs.id = custom_emojis.pack_id
        AND emoji_packs.creator_id = auth.uid()
    )
  );

CREATE POLICY "custom_emojis_delete_own_pack"
  ON custom_emojis FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM emoji_packs
      WHERE emoji_packs.id = custom_emojis.pack_id
        AND emoji_packs.creator_id = auth.uid()
    )
  );

-- Установленные юзером паки
CREATE TABLE IF NOT EXISTS user_emoji_packs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES emoji_packs(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, pack_id)
);

ALTER TABLE user_emoji_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_emoji_packs_select_own"
  ON user_emoji_packs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_emoji_packs_insert_own"
  ON user_emoji_packs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_emoji_packs_delete_own"
  ON user_emoji_packs FOR DELETE
  USING (auth.uid() = user_id);
