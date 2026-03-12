-- ============================================================
-- Migration: Instagram Parity Features
-- Date: 2026-03-11
-- Features:
--   1. story_highlights — закреплённые коллекции историй
--   2. profile_links — до 5 ссылок в профиле
--   3. pinned_posts — закреплённые посты на профиле
--   4. profile_notes — заметки (Instagram Notes)
--   5. reel_templates — шаблоны Reels
--   6. video_messages — видеосообщения (кружки) в чате
--   7. live_collab_sessions — совместные Live
--   8. live_badges — монетизация Live
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Story Highlights
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_highlights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 15),
  cover_url   TEXT,
  story_ids   UUID[] NOT NULL DEFAULT '{}',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_highlights_user_id ON story_highlights(user_id, position);

ALTER TABLE story_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_highlights_select_public" ON story_highlights
  FOR SELECT USING (true);

CREATE POLICY "story_highlights_insert_owner" ON story_highlights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "story_highlights_update_owner" ON story_highlights
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "story_highlights_delete_owner" ON story_highlights
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Profile Links (до 5 ссылок)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL CHECK (char_length(url) <= 2048),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 30),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Максимум 5 ссылок на пользователя (enforce via trigger)
CREATE OR REPLACE FUNCTION check_profile_links_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM profile_links WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 profile links allowed per user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_links_limit ON profile_links;
CREATE TRIGGER trg_profile_links_limit
  BEFORE INSERT ON profile_links
  FOR EACH ROW EXECUTE FUNCTION check_profile_links_limit();

CREATE INDEX IF NOT EXISTS idx_profile_links_user_id ON profile_links(user_id, position);

ALTER TABLE profile_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_links_select_public" ON profile_links
  FOR SELECT USING (true);

CREATE POLICY "profile_links_insert_owner" ON profile_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_links_update_owner" ON profile_links
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "profile_links_delete_owner" ON profile_links
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Pinned Posts (до 3 закреплённых постов)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pinned_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id     UUID NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  pinned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE OR REPLACE FUNCTION check_pinned_posts_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM pinned_posts WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 pinned posts allowed per user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pinned_posts_limit ON pinned_posts;
CREATE TRIGGER trg_pinned_posts_limit
  BEFORE INSERT ON pinned_posts
  FOR EACH ROW EXECUTE FUNCTION check_pinned_posts_limit();

CREATE INDEX IF NOT EXISTS idx_pinned_posts_user_id ON pinned_posts(user_id, position);

ALTER TABLE pinned_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinned_posts_select_public" ON pinned_posts
  FOR SELECT USING (true);

CREATE POLICY "pinned_posts_insert_owner" ON pinned_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pinned_posts_delete_owner" ON pinned_posts
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Profile Notes (Instagram Notes — короткие заметки)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 60),
  audience    TEXT NOT NULL DEFAULT 'followers' CHECK (audience IN ('followers', 'close_friends')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)  -- одна активная заметка на пользователя
);

CREATE INDEX IF NOT EXISTS idx_profile_notes_user_id ON profile_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_notes_expires ON profile_notes(expires_at);

ALTER TABLE profile_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_notes_select_public" ON profile_notes
  FOR SELECT USING (expires_at > now());

CREATE POLICY "profile_notes_insert_owner" ON profile_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_notes_update_owner" ON profile_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "profile_notes_delete_owner" ON profile_notes
  FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 5. Reel Templates
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  preview_url     TEXT,
  audio_url       TEXT,
  audio_title     TEXT,
  duration_ms     INTEGER NOT NULL DEFAULT 15000 CHECK (duration_ms > 0),
  clip_count      INTEGER NOT NULL DEFAULT 1 CHECK (clip_count BETWEEN 1 AND 20),
  use_count       INTEGER NOT NULL DEFAULT 0,
  is_public       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_templates_public ON reel_templates(is_public, use_count DESC);
CREATE INDEX IF NOT EXISTS idx_reel_templates_creator ON reel_templates(creator_id);

ALTER TABLE reel_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reel_templates_select_public" ON reel_templates
  FOR SELECT USING (is_public = true OR auth.uid() = creator_id);

CREATE POLICY "reel_templates_insert_owner" ON reel_templates
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "reel_templates_delete_owner" ON reel_templates
  FOR DELETE USING (auth.uid() = creator_id);

-- ─────────────────────────────────────────────────────────────
-- 6. Video Messages (кружки в чате)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL,  -- FK к messages
  conversation_id UUID NOT NULL,
  sender_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_url       TEXT NOT NULL,
  thumbnail_url   TEXT,
  duration_ms     INTEGER NOT NULL CHECK (duration_ms > 0 AND duration_ms <= 60000),
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  viewed_by       UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_messages_conversation ON video_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_messages_sender ON video_messages(sender_id);

ALTER TABLE video_messages ENABLE ROW LEVEL SECURITY;

-- Только участники разговора видят видеосообщения
CREATE POLICY "video_messages_select_participant" ON video_messages
  FOR SELECT USING (
    auth.uid() = sender_id OR
    EXISTS (
      SELECT 1 FROM conversation_members
      WHERE conversation_id = video_messages.conversation_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "video_messages_insert_sender" ON video_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "video_messages_update_viewed" ON video_messages
  FOR UPDATE USING (
    auth.uid() = ANY(
      SELECT user_id FROM conversation_members
      WHERE conversation_id = video_messages.conversation_id
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 7. Live Collab Sessions (совместные Live)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_collab_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  live_session_id UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'declined')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_collab_host ON live_collab_sessions(host_id, status);
CREATE INDEX IF NOT EXISTS idx_live_collab_guest ON live_collab_sessions(guest_id, status);

ALTER TABLE live_collab_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_collab_select_participant" ON live_collab_sessions
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = guest_id);

CREATE POLICY "live_collab_insert_host" ON live_collab_sessions
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "live_collab_update_participant" ON live_collab_sessions
  FOR UPDATE USING (auth.uid() = host_id OR auth.uid() = guest_id);

-- ─────────────────────────────────────────────────────────────
-- 8. Live Badges (монетизация Live)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_badges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id UUID NOT NULL,
  sender_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_level     INTEGER NOT NULL CHECK (badge_level BETWEEN 1 AND 3),
  amount_stars    INTEGER NOT NULL CHECK (amount_stars > 0),
  message         TEXT CHECK (char_length(message) <= 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Уровни бейджей: 1=$0.99 (1 star), 2=$1.99 (2 stars), 3=$4.99 (5 stars)
COMMENT ON COLUMN live_badges.badge_level IS '1=1star($0.99), 2=2stars($1.99), 3=5stars($4.99)';

CREATE INDEX IF NOT EXISTS idx_live_badges_session ON live_badges(live_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_badges_recipient ON live_badges(recipient_id, created_at DESC);

ALTER TABLE live_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_badges_select_public" ON live_badges
  FOR SELECT USING (true);

CREATE POLICY "live_badges_insert_sender" ON live_badges
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- ─────────────────────────────────────────────────────────────
-- 9. Reel Remixes (ремикс Reels)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reel_remixes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_reel_id UUID NOT NULL,
  remix_reel_id   UUID NOT NULL,
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (original_reel_id, remix_reel_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_remixes_original ON reel_remixes(original_reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_remixes_creator ON reel_remixes(creator_id);

ALTER TABLE reel_remixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reel_remixes_select_public" ON reel_remixes
  FOR SELECT USING (true);

CREATE POLICY "reel_remixes_insert_creator" ON reel_remixes
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- ─────────────────────────────────────────────────────────────
-- 10. Paid Subscriptions (платные подписки на авторов)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscriber_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id         UUID,
  price_monthly   NUMERIC(10,2) NOT NULL CHECK (price_monthly >= 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'paused')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  UNIQUE (creator_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_subs_creator ON creator_subscriptions(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_subs_subscriber ON creator_subscriptions(subscriber_id, status);

ALTER TABLE creator_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_subs_select_participant" ON creator_subscriptions
  FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = subscriber_id);

CREATE POLICY "creator_subs_insert_subscriber" ON creator_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = subscriber_id);

CREATE POLICY "creator_subs_update_participant" ON creator_subscriptions
  FOR UPDATE USING (auth.uid() = creator_id OR auth.uid() = subscriber_id);
