-- ============================================================
-- Migration: Live Shopping + Drag-to-reorder media
-- Date: 2026-03-11
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Live Shopping Pins
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_shopping_pins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id UUID NOT NULL,
  product_id      UUID NOT NULL,
  host_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  unpinned_at     TIMESTAMPTZ,
  UNIQUE (live_session_id)  -- один активный товар за раз
);

CREATE INDEX IF NOT EXISTS idx_live_shopping_session ON live_shopping_pins(live_session_id, is_active);

ALTER TABLE live_shopping_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_shopping_select_public" ON live_shopping_pins
  FOR SELECT USING (true);

CREATE POLICY "live_shopping_insert_host" ON live_shopping_pins
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "live_shopping_update_host" ON live_shopping_pins
  FOR UPDATE USING (auth.uid() = host_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Post Media Order (drag-to-reorder карусели)
-- ─────────────────────────────────────────────────────────────
-- Добавляем поле position к media_attachments если таблица существует
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'post_media'
  ) THEN
    ALTER TABLE post_media ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_post_media_position ON post_media(post_id, position);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Story Archive Settings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_story_settings (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  archive_enabled     BOOLEAN NOT NULL DEFAULT true,
  show_activity       BOOLEAN NOT NULL DEFAULT true,
  allow_resharing     BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_story_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_settings_select_owner" ON user_story_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "story_settings_upsert_owner" ON user_story_settings
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Reel Captions (субтитры)
-- ─────────────────────────────────────────────────────────────
-- Добавляем поле captions к reels если таблица существует
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'reels'
  ) THEN
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS captions JSONB;
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS captions_enabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES reel_templates(id) ON DELETE SET NULL;
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS remix_of UUID;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Profile Verification Requests
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('creator', 'business', 'public_figure', 'brand')),
  full_name       TEXT NOT NULL,
  known_as        TEXT,
  country         TEXT NOT NULL,
  category_detail TEXT,
  document_url    TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)  -- одна активная заявка
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status, created_at);

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verification_select_owner" ON verification_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "verification_insert_owner" ON verification_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 6. Content Preferences (скрытые слова, фильтры)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_filters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('hidden_word', 'hidden_hashtag', 'muted_account', 'restricted_account')),
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, filter_type, value)
);

CREATE INDEX IF NOT EXISTS idx_content_filters_user ON content_filters(user_id, filter_type);

ALTER TABLE content_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_filters_owner" ON content_filters
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Slow Motion Video Metadata
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'reels'
  ) THEN
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS slow_motion_factor INTEGER CHECK (slow_motion_factor IN (2, 4));
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_time_lapse BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE reels ADD COLUMN IF NOT EXISTS original_fps INTEGER;
  END IF;
END $$;
