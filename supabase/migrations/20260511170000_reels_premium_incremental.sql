-- =============================================================================
-- REELS PREMIUM FEATURES - Incremental migration
-- Adds missing tables from reels_premium_features
-- Safe to run multiple times (IF NOT EXISTS)
-- =============================================================================

-- 1. Reel Reactions (emoji reactions on reels)
CREATE TABLE IF NOT EXISTS public.reel_reactions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id     UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  emoji       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reel_reactions_reel_id ON public.reel_reactions (reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_reactions_user_id ON public.reel_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_reel_reactions_reel_emoji ON public.reel_reactions (reel_id, emoji);

ALTER TABLE public.reel_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reactions_select ON public.reel_reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.reel_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY reactions_delete ON public.reel_reactions FOR DELETE USING (user_id = auth.uid());

-- 2. Reel Effects / Filters
CREATE TABLE IF NOT EXISTS public.reel_effects (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id       UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  effect_type   TEXT        NOT NULL,
  effect_name   TEXT        NOT NULL,
  effect_config JSONB       DEFAULT '{}',
  position      INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_effects_reel_id ON public.reel_effects (reel_id);

-- 3. Playback State (resume playback, watch history)
CREATE TABLE IF NOT EXISTS public.reel_playback_state (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL,
  reel_id           UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  last_position_sec FLOAT       DEFAULT 0,
  watch_count       INTEGER     DEFAULT 0,
  completed         BOOLEAN     DEFAULT false,
  last_watched_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_playback_state_user ON public.reel_playback_state (user_id, reel_id);

ALTER TABLE public.reel_playback_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY playback_state_select ON public.reel_playback_state FOR SELECT USING (user_id = auth.uid());
CREATE POLICY playback_state_insert ON public.reel_playback_state FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY playback_state_update ON public.reel_playback_state FOR UPDATE USING (user_id = auth.uid());

-- 4. Reel Mentions
CREATE TABLE IF NOT EXISTS public.reel_mentions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id           UUID        NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  mentioned_user_id UUID       NOT NULL,
  position          INTEGER     DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_mentions_mentioned ON public.reel_mentions (mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_reel_mentions_reel ON public.reel_mentions (reel_id);

ALTER TABLE public.reel_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_mentions_select ON public.reel_mentions FOR SELECT USING (true);
CREATE POLICY reel_mentions_insert ON public.reel_mentions FOR INSERT WITH CHECK (true);

-- 5. Reel Playlists
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

-- 6. RPC functions
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
  DELETE FROM public.reel_reactions
  WHERE reel_id = p_reel_id AND user_id = auth.uid() AND emoji = p_emoji;
  IF NOT FOUND THEN
    INSERT INTO public.reel_reactions (reel_id, user_id, emoji)
    VALUES (p_reel_id, auth.uid(), p_emoji);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_reaction(UUID, TEXT) TO authenticated, anon;

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

CREATE OR REPLACE FUNCTION public.get_reel_playback(p_reel_id UUID)
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
