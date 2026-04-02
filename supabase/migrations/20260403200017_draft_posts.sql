-- ============================================================================
-- Draft Posts — черновики и отложенная публикация
-- ============================================================================

-- Добавляем поля для черновиков/отложенных постов
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Индекс для черновиков пользователя
CREATE INDEX IF NOT EXISTS idx_posts_is_draft
  ON posts(author_id)
  WHERE is_draft = true;
