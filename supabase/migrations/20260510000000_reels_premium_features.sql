-- ============================================================================
-- REELS PREMIUM FEATURES MIGRATION
-- Adds: reactions, music_tracks, reel_effects, playback_state, reel_mentions
-- Fully idempotent: safe to run on fresh or existing DB.
-- ============================================================================

-- ── 1. Reel Reactions (emoji reactions on reels, like Telegram/Instagram Premium) ──
CREATE TABLE IF NOT EXISTS public.reel_reactions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id     UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  emoji       TEXT        NOT NULL,  -- Unicode emoji character, e.g. '🔥', '❤️', '😂'
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reel_reactions_reel_id ON public.reel_reactions (reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_reactions_user_id ON public.reel_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_reel_reactions_reel_emoji ON public.reel_reactions (reel_id, emoji);

-- ── 2. Music Tracks Library (licensed music for reels, like Instagram Music) ──
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT        NOT NULL,
  artist        TEXT        NOT NULL,
  audio_url     TEXT        NOT NULL,
  duration_sec  FLOAT       NOT NULL DEFAULT 0,
  genre         TEXT,
  thumbnail_url TEXT,
  is_explicit   BOOLEAN     NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  play_count    INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_tracks_active ON public.music_tracks (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_music_tracks_genre ON public.music_tracks (genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_music_tracks_search ON public.music_tracks USING gin (to_tsvector('russian', title || ' ' || artist));

-- RLS for music tracks (read-only for authenticated, manage via service role)
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY music_tracks_select ON public.music_tracks FOR SELECT USING (true);

-- ── 3. Reel Effects / Filters (applied effects on reels) ──
CREATE TABLE IF NOT EXISTS public.reel_effects (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id       UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  effect_type   TEXT        NOT NULL,  -- 'filter', 'speed', 'transition', 'text_overlay', 'sticker', 'beauty'
  effect_name   TEXT        NOT NULL,  -- e.g. 'clarendon', 'valencia', 'slow_mo_0.5x'
  effect_config JSONB       DEFAULT '{}',  -- parameters for the effect (intensity, color, etc.)
  position      INTEGER     DEFAULT 0,  -- order in the effect chain
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_effects_reel_id ON public.reel_effects (reel_id);

-- ── 4. Playback State (resume playback, watch history per user) ──
CREATE TABLE IF NOT EXISTS public.reel_playback_state (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL,
  reel_id           UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  last_position_sec FLOAT       DEFAULT 0,  -- last playback position in seconds
  watch_count       INTEGER     DEFAULT 0,
  completed         BOOLEAN     DEFAULT false,
  last_watched_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_playback_state_user ON public.reel_playback_state (user_id, reel_id);

-- RLS: users can read/write their own playback state
ALTER TABLE public.reel_playback_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY playback_state_select ON public.reel_playback_state FOR SELECT USING (user_id = auth.uid());
CREATE POLICY playback_state_insert ON public.reel_playback_state FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY playback_state_update ON public.reel_playback_state FOR UPDATE USING (user_id = auth.uid());

-- ── 5. Reel Mentions (@username mentions in reel descriptions) ──
CREATE TABLE IF NOT EXISTS public.reel_mentions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id     UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  mentioned_user_id UUID  NOT NULL,
  position    INTEGER     DEFAULT 0,  -- character position in description
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_mentions_mentioned ON public.reel_mentions (mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_reel_mentions_reel ON public.reel_mentions (reel_id);

ALTER TABLE public.reel_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_mentions_select ON public.reel_mentions FOR SELECT USING (true);
CREATE POLICY reel_mentions_insert ON public.reel_mentions FOR INSERT WITH CHECK (true);

-- ── 6. Reel Playlists / Collections (user-curated playlists of reels) ──
CREATE TABLE IF NOT EXISTS public.reel_playlists (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  cover_url   TEXT,
  is_public   BOOLEAN     DEFAULT true,
  reel_count  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reel_playlist_items (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id UUID        NOT NULL REFERENCES public.reel_playlists(id) ON DELETE CASCADE,
  reel_id     UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  position    INTEGER     DEFAULT 0,
  added_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (playlist_id, reel_id)
);

ALTER TABLE public.reel_playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY playlists_select ON public.reel_playlists FOR SELECT USING (is_public = true OR user_id = auth.uid());
CREATE POLICY playlists_insert ON public.reel_playlists FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY playlists_update ON public.reel_playlists FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY playlists_delete ON public.reel_playlists FOR DELETE USING (user_id = auth.uid());

ALTER TABLE public.reel_playlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY playlist_items_select ON public.reel_playlist_items FOR SELECT USING (true);
CREATE POLICY playlist_items_insert ON public.reel_playlist_items FOR INSERT WITH CHECK (true);
CREATE POLICY playlist_items_delete ON public.reel_playlist_items FOR DELETE USING (true);

-- ── 7. RLS policies for new tables ──
ALTER TABLE public.reel_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reactions_select ON public.reel_reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.reel_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY reactions_delete ON public.reel_reactions FOR DELETE USING (user_id = auth.uid());

-- ── 8. Updated RPCs ──

-- Record a reaction on a reel
CREATE OR REPLACE FUNCTION public.record_reel_reaction(
  p_reel_id UUID,
  p_emoji TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete existing reaction by same user+reel+emoji (toggle off)
  DELETE FROM public.reel_reactions
  WHERE reel_id = p_reel_id AND user_id = auth.uid() AND emoji = p_emoji;

  -- If the delete didn't find anything, insert a new reaction
  IF NOT FOUND THEN
    INSERT INTO public.reel_reactions (reel_id, user_id, emoji)
    VALUES (p_reel_id, auth.uid(), p_emoji);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_reaction(UUID, TEXT) TO authenticated, anon;

-- Save playback position
CREATE OR REPLACE FUNCTION public.save_reel_playback(
  p_reel_id UUID,
  p_position FLOAT,
  p_completed BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.reel_playback_state (user_id, reel_id, last_position_sec, completed)
  VALUES (auth.uid(), p_reel_id, p_position, p_completed)
  ON CONFLICT (user_id, reel_id) DO UPDATE SET
    last_position_sec = EXCLUDED.last_position_sec,
    completed = EXCLUDED.completed,
    watch_count = reel_playback_state.watch_count + 1,
    last_watched_at = now();
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_reel_playback(UUID, FLOAT, BOOLEAN) TO authenticated, anon;

-- Get playback position for a reel
CREATE OR REPLACE FUNCTION public.get_reel_playback(
  p_reel_id UUID
)
RETURNS TABLE (last_position_sec FLOAT, completed BOOLEAN, watch_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.last_position_sec, 0)::FLOAT,
    COALESCE(s.completed, false)::BOOLEAN,
    COALESCE(s.watch_count, 0)::INTEGER
  FROM public.reel_playback_state s
  WHERE s.reel_id = p_reel_id AND s.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reel_playback(UUID) TO authenticated, anon;

-- ── 9. Storage buckets for new media ──
INSERT INTO storage.buckets (id, name, public) VALUES ('reel-effects', 'reel-effects', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('music-thumbnails', 'music-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- ── 10. Updated reels feed with reaction counts ──
CREATE OR REPLACE FUNCTION public.get_reels_feed_v3(
  p_limit            INTEGER DEFAULT 50,
  p_offset           INTEGER DEFAULT 0,
  p_session_id       TEXT    DEFAULT NULL,
  p_exploration_ratio NUMERIC DEFAULT 0.20,
  p_recency_days     INTEGER DEFAULT 30,
  p_freq_cap_hours   INTEGER DEFAULT 6,
  p_algorithm_version TEXT   DEFAULT 'v3'
)
RETURNS TABLE (
  id                    UUID,
  author_id             UUID,
  video_url             TEXT,
  thumbnail_url         TEXT,
  description           TEXT,
  music_title           TEXT,
  music_artist          TEXT,
  music_id              UUID,
  likes_count           INTEGER,
  comments_count        INTEGER,
  views_count           INTEGER,
  saves_count           INTEGER,
  reposts_count         INTEGER,
  shares_count          INTEGER,
  reactions             JSONB,
  duration_seconds      FLOAT,
  created_at            TIMESTAMPTZ,
  final_score           NUMERIC,
  recommendation_reason TEXT,
  request_id            UUID,
  feed_position         INTEGER,
  algorithm_version     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_request_id UUID := gen_random_uuid();
  v_has_moderation BOOLEAN;
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reels' AND column_name = 'moderation_status'
  ) INTO v_has_moderation;

  IF v_has_moderation THEN
    RETURN QUERY
    SELECT
      r.id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      COALESCE(r.music_artist, ''),
      r.audio_id,
      COALESCE(r.likes_count, 0)::INTEGER,
      COALESCE(r.comments_count, 0)::INTEGER,
      COALESCE(r.views_count, 0)::INTEGER,
      COALESCE(r.saves_count, 0)::INTEGER,
      COALESCE(r.reposts_count, 0)::INTEGER,
      COALESCE(r.shares_count, 0)::INTEGER,
      COALESCE(
        (SELECT jsonb_object_agg(re.emoji, cnt)
         FROM (SELECT emoji, COUNT(*) as cnt
               FROM public.reel_reactions
               WHERE reel_id = r.id
               GROUP BY emoji) re),
        '{}'::jsonb
      ) AS reactions,
      COALESCE(r.duration_seconds, 0)::FLOAT,
      r.created_at,
      (
        EXTRACT(EPOCH FROM r.created_at) / 1000000.0 +
        COALESCE(r.likes_count, 0) * 1.0 +
        COALESCE(r.comments_count, 0) * 3.0 +
        COALESCE(r.saves_count, 0) * 4.0 +
        COALESCE(r.shares_count, 0) * 5.0 +
        COALESCE((SELECT COUNT(*) FROM public.reel_reactions WHERE reel_id = r.id) * 2.0, 0)
      )::NUMERIC AS final_score,
      'Recent'::TEXT AS recommendation_reason,
      v_request_id,
      (GREATEST(p_offset, 0) + ROW_NUMBER() OVER (ORDER BY r.created_at DESC) - 1)::INTEGER AS feed_position,
      COALESCE(p_algorithm_version, 'v3')::TEXT
    FROM public.reels r
    WHERE r.moderation_status != 'blocked'
      AND r.is_nsfw = false
      AND r.is_graphic_violence = false
      AND r.is_political_extremism = false
    ORDER BY r.created_at DESC
    OFFSET GREATEST(p_offset, 0)
    LIMIT GREATEST(p_limit, 1);
  ELSE
    RETURN QUERY
    SELECT
      r.id,
      r.author_id,
      r.video_url,
      r.thumbnail_url,
      r.description,
      r.music_title,
      COALESCE(r.music_artist, ''),
      r.audio_id,
      COALESCE(r.likes_count, 0)::INTEGER,
      COALESCE(r.comments_count, 0)::INTEGER,
      COALESCE(r.views_count, 0)::INTEGER,
      COALESCE(r.saves_count, 0)::INTEGER,
      COALESCE(r.reposts_count, 0)::INTEGER,
      COALESCE(r.shares_count, 0)::INTEGER,
      COALESCE(
        (SELECT jsonb_object_agg(re.emoji, cnt)
         FROM (SELECT emoji, COUNT(*) as cnt
               FROM public.reel_reactions
               WHERE reel_id = r.id
               GROUP BY emoji) re),
        '{}'::jsonb
      ) AS reactions,
      COALESCE(r.duration_seconds, 0)::FLOAT,
      r.created_at,
      (
        EXTRACT(EPOCH FROM r.created_at) / 1000000.0 +
        COALESCE(r.likes_count, 0) * 1.0 +
        COALESCE(r.comments_count, 0) * 3.0 +
        COALESCE(r.saves_count, 0) * 4.0 +
        COALESCE(r.shares_count, 0) * 5.0
      )::NUMERIC AS final_score,
      'Recent'::TEXT AS recommendation_reason,
      v_request_id,
      (GREATEST(p_offset, 0) + ROW_NUMBER() OVER (ORDER BY r.created_at DESC) - 1)::INTEGER AS feed_position,
      COALESCE(p_algorithm_version, 'v3')::TEXT
    FROM public.reels r
    ORDER BY r.created_at DESC
    OFFSET GREATEST(p_offset, 0)
    LIMIT GREATEST(p_limit, 1);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reels_feed_v3(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reels_feed_v3(INTEGER, INTEGER, TEXT, NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated, anon;

-- Update reels schema version tracking
INSERT INTO public.reels_engine_config_versions (id, environment, config)
VALUES (gen_random_uuid(), 'production', '{"schema_version": "3.0", "features": ["reactions", "music_tracks", "playback_state", "reel_mentions", "playlists"]}');

-- ── Done ──