ALTER TABLE IF EXISTS public.music_tracks
  ADD COLUMN IF NOT EXISTS artist_id uuid,
  ADD COLUMN IF NOT EXISTS album_id uuid,
  ADD COLUMN IF NOT EXISTS spotify_id text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS duration_ms int,
  ADD COLUMN IF NOT EXISTS track_number int,
  ADD COLUMN IF NOT EXISTS disc_number int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS explicit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS isrc text,
  ADD COLUMN IF NOT EXISTS popularity int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS play_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waveform_data jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.music_playlists
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS is_collaborative boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tracks_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follower_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.music_playlist_tracks
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();

CREATE TABLE IF NOT EXISTS public.music_artists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  spotify_id text UNIQUE,
  external_url text,
  image_url text,
  genres text[] DEFAULT '{}',
  followers_count int DEFAULT 0,
  popularity int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.music_albums (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist_id uuid REFERENCES public.music_artists(id) ON DELETE CASCADE,
  spotify_id text UNIQUE,
  external_url text,
  cover_url text,
  release_date date,
  album_type text CHECK (album_type IN ('album', 'single', 'compilation', 'ep')),
  total_tracks int DEFAULT 0,
  label text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.music_play_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  played_at timestamptz DEFAULT now(),
  duration_ms int,
  completed boolean DEFAULT false,
  device text,
  ip_address inet,
  user_agent text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.music_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE(user_id, track_id)
);

CREATE TABLE IF NOT EXISTS public.music_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  status text CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.music_downloads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  downloaded_at timestamptz DEFAULT now(),
  file_path text,
  expires_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE(user_id, track_id)
);

INSERT INTO public.music_artists (name)
SELECT DISTINCT trim(music_tracks.artist)
FROM public.music_tracks
WHERE coalesce(trim(music_tracks.artist), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.music_artists artist WHERE lower(artist.name) = lower(trim(music_tracks.artist))
  );

UPDATE public.music_tracks
SET artist_id = artist.id
FROM public.music_artists artist
WHERE music_tracks.artist_id IS NULL
  AND coalesce(trim(music_tracks.artist), '') <> ''
  AND lower(artist.name) = lower(trim(music_tracks.artist));

INSERT INTO public.music_albums (title, artist_id, cover_url)
SELECT DISTINCT trim(music_tracks.album), music_tracks.artist_id, music_tracks.cover_url
FROM public.music_tracks
WHERE coalesce(trim(music_tracks.album), '') <> ''
  AND music_tracks.artist_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.music_albums album
    WHERE lower(album.title) = lower(trim(music_tracks.album))
      AND album.artist_id IS NOT DISTINCT FROM music_tracks.artist_id
  );

UPDATE public.music_tracks
SET album_id = album.id
FROM public.music_albums album
WHERE music_tracks.album_id IS NULL
  AND music_tracks.artist_id IS NOT NULL
  AND coalesce(trim(music_tracks.album), '') <> ''
  AND lower(album.title) = lower(trim(music_tracks.album))
  AND album.artist_id IS NOT DISTINCT FROM music_tracks.artist_id;

UPDATE public.music_tracks
SET
  audio_url = coalesce(nullif(music_tracks.audio_url, ''), music_tracks.preview_url, ''),
  duration_ms = coalesce(music_tracks.duration_ms, music_tracks.duration_seconds * 1000, 0),
  popularity = coalesce(music_tracks.popularity, least(greatest(coalesce(music_tracks.usage_count, 0), 0), 100)),
  play_count = coalesce(music_tracks.play_count, coalesce(music_tracks.usage_count, 0)),
  explicit = coalesce(music_tracks.explicit, false),
  waveform_data = coalesce(music_tracks.waveform_data, '{}'::jsonb),
  disc_number = coalesce(music_tracks.disc_number, 1);

UPDATE public.music_playlists
SET
  user_id = coalesce(music_playlists.user_id, music_playlists.created_by),
  updated_at = coalesce(music_playlists.updated_at, music_playlists.created_at, now());

WITH normalized AS (
  SELECT playlist_track.id, row_number() OVER (
    PARTITION BY playlist_track.playlist_id ORDER BY coalesce(playlist_track.position, 2147483647), playlist_track.added_at, playlist_track.id
  ) AS new_position
  FROM public.music_playlist_tracks playlist_track
)
UPDATE public.music_playlist_tracks playlist_track
SET position = normalized.new_position
FROM normalized
WHERE playlist_track.id = normalized.id
  AND playlist_track.position IS DISTINCT FROM normalized.new_position;

UPDATE public.music_playlist_tracks playlist_track
SET user_id = coalesce(playlist_track.user_id, playlist.user_id, playlist.created_by)
FROM public.music_playlists playlist
WHERE playlist.id = playlist_track.playlist_id
  AND playlist_track.user_id IS NULL;

UPDATE public.music_playlists playlist
SET tracks_count = counts.track_count,
    updated_at = now()
FROM (
  SELECT playlist_id, count(*)::int AS track_count
  FROM public.music_playlist_tracks
  GROUP BY playlist_id
) counts
WHERE counts.playlist_id = playlist.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_tracks_artist_id_fkey'
  ) THEN
    ALTER TABLE public.music_tracks
      ADD CONSTRAINT music_tracks_artist_id_fkey
      FOREIGN KEY (artist_id) REFERENCES public.music_artists(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_tracks_album_id_fkey'
  ) THEN
    ALTER TABLE public.music_tracks
      ADD CONSTRAINT music_tracks_album_id_fkey
      FOREIGN KEY (album_id) REFERENCES public.music_albums(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_playlists_user_id_fkey'
  ) THEN
    ALTER TABLE public.music_playlists
      ADD CONSTRAINT music_playlists_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_playlist_tracks_user_id_fkey'
  ) THEN
    ALTER TABLE public.music_playlist_tracks
      ADD CONSTRAINT music_playlist_tracks_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_playlist_tracks_playlist_position_key'
  ) THEN
    ALTER TABLE public.music_playlist_tracks
      ADD CONSTRAINT music_playlist_tracks_playlist_position_key UNIQUE (playlist_id, position);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'music_playlist_tracks_playlist_track_key'
  ) THEN
    ALTER TABLE public.music_playlist_tracks
      ADD CONSTRAINT music_playlist_tracks_playlist_track_key UNIQUE (playlist_id, track_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_music_tracks_artist ON public.music_tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_album ON public.music_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_spotify ON public.music_tracks(spotify_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_popularity ON public.music_tracks(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_music_playlists_user ON public.music_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_music_playlists_public ON public.music_playlists(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_playlist ON public.music_playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_track ON public.music_playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_music_play_history_user ON public.music_play_history(user_id);
CREATE INDEX IF NOT EXISTS idx_music_play_history_track ON public.music_play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_music_play_history_played ON public.music_play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_music_likes_user ON public.music_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_music_likes_track ON public.music_likes(track_id);
CREATE INDEX IF NOT EXISTS idx_music_subscriptions_user ON public.music_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_music_subscriptions_stripe ON public.music_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_music_downloads_user ON public.music_downloads(user_id);

ALTER TABLE public.music_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_play_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for artists" ON public.music_artists;
DROP POLICY IF EXISTS "Public read access for albums" ON public.music_albums;
DROP POLICY IF EXISTS "Public read access for tracks" ON public.music_tracks;
DROP POLICY IF EXISTS "Public read access for public playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can manage own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can view own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can insert own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can update own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can delete own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can manage playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can view playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can insert playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can update playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can delete playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can manage own history" ON public.music_play_history;
DROP POLICY IF EXISTS "Users can view own history" ON public.music_play_history;
DROP POLICY IF EXISTS "Users can insert own history" ON public.music_play_history;
DROP POLICY IF EXISTS "Users can manage own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can view own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can insert own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.music_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.music_subscriptions;
DROP POLICY IF EXISTS "Users can manage own downloads" ON public.music_downloads;
DROP POLICY IF EXISTS "Users can view own downloads" ON public.music_downloads;
DROP POLICY IF EXISTS "Users can insert own downloads" ON public.music_downloads;
DROP POLICY IF EXISTS "Users can delete own downloads" ON public.music_downloads;

CREATE POLICY "Public read access for artists" ON public.music_artists
  FOR SELECT USING (true);

CREATE POLICY "Public read access for albums" ON public.music_albums
  FOR SELECT USING (true);

CREATE POLICY "Public read access for tracks" ON public.music_tracks
  FOR SELECT USING (true);

CREATE POLICY "Public read access for public playlists" ON public.music_playlists
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view own playlists" ON public.music_playlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own playlists" ON public.music_playlists
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can update own playlists" ON public.music_playlists
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists" ON public.music_playlists
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view playlist tracks" ON public.music_playlist_tracks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND (music_playlists.is_public = true OR music_playlists.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert playlist tracks" ON public.music_playlist_tracks
  FOR INSERT WITH CHECK (
    auth.uid() = coalesce(user_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update playlist tracks" ON public.music_playlist_tracks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = coalesce(user_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete playlist tracks" ON public.music_playlist_tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own history" ON public.music_play_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history" ON public.music_play_history
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can view own likes" ON public.music_likes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own likes" ON public.music_likes
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can delete own likes" ON public.music_likes
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own subscriptions" ON public.music_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own downloads" ON public.music_downloads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own downloads" ON public.music_downloads
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can delete own downloads" ON public.music_downloads
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_music_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_music_artists_updated_at ON public.music_artists;
CREATE TRIGGER trg_music_artists_updated_at
  BEFORE UPDATE ON public.music_artists
  FOR EACH ROW EXECUTE FUNCTION public.handle_music_updated_at();

DROP TRIGGER IF EXISTS trg_music_albums_updated_at ON public.music_albums;
CREATE TRIGGER trg_music_albums_updated_at
  BEFORE UPDATE ON public.music_albums
  FOR EACH ROW EXECUTE FUNCTION public.handle_music_updated_at();

DROP TRIGGER IF EXISTS trg_music_playlists_updated_at ON public.music_playlists;
CREATE TRIGGER trg_music_playlists_updated_at
  BEFORE UPDATE ON public.music_playlists
  FOR EACH ROW EXECUTE FUNCTION public.handle_music_updated_at();

CREATE OR REPLACE FUNCTION public.record_track_play(
  p_user_id uuid DEFAULT auth.uid(),
  p_track_id uuid DEFAULT NULL,
  p_duration_ms int DEFAULT NULL,
  p_device text DEFAULT 'mobile',
  p_completed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_track_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.music_play_history (
    user_id,
    track_id,
    played_at,
    duration_ms,
    completed,
    device
  ) VALUES (
    p_user_id,
    p_track_id,
    now(),
    p_duration_ms,
    p_completed,
    p_device
  );

  UPDATE public.music_tracks
  SET play_count = coalesce(play_count, 0) + 1
  WHERE id = p_track_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_music_recommendations(
  p_user_id uuid,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  track_id uuid,
  title text,
  artist_name text,
  cover_url text,
  score float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS track_id,
    t.title,
    a.name AS artist_name,
    coalesce(al.cover_url, t.cover_url) AS cover_url,
    ((coalesce(t.play_count, 0) * 0.35) + (coalesce(t.popularity, 0) * 0.65)) / 100.0 AS score
  FROM public.music_tracks t
  LEFT JOIN public.music_artists a ON a.id = t.artist_id
  LEFT JOIN public.music_albums al ON al.id = t.album_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.music_play_history history
    WHERE history.user_id = p_user_id
      AND history.track_id = t.id
      AND history.played_at > now() - interval '30 days'
  )
  ORDER BY coalesce(t.play_count, 0) DESC, coalesce(t.popularity, 0) DESC, t.created_at DESC
  LIMIT greatest(coalesce(p_limit, 20), 1);
$$;

CREATE OR REPLACE FUNCTION public.reorder_playlist_tracks(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ordered AS (
    SELECT mpt.id, row_number() OVER (ORDER BY position, added_at, mpt.id) AS new_position
    FROM public.music_playlist_tracks mpt
    WHERE mpt.playlist_id = p_playlist_id
  )
  UPDATE public.music_playlist_tracks playlist_track
  SET position = ordered.new_position
  FROM ordered
  WHERE ordered.id = playlist_track.id;

  UPDATE public.music_playlists
  SET tracks_count = (
    SELECT count(*)::int
    FROM public.music_playlist_tracks
    WHERE playlist_id = p_playlist_id
  )
  WHERE music_playlists.id = p_playlist_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_track_play(uuid, uuid, int, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_music_recommendations(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_playlist_tracks(uuid) TO authenticated, service_role;