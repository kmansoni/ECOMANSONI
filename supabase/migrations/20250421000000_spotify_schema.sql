-- Migration: Spotify-like music service schema
-- Created: 2025-04-21
-- Description: Creates tables for music streaming service (tracks, playlists, artists, etc.)

-- ==================== ARTISTS ====================
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

-- ==================== ALBUMS ====================
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

-- ==================== TRACKS ====================
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist_id uuid REFERENCES public.music_artists(id) ON DELETE CASCADE,
  album_id uuid REFERENCES public.music_albums(id) ON DELETE SET NULL,
  spotify_id text UNIQUE,
  external_url text,
  preview_url text,
  audio_url text NOT NULL,
  duration_ms int NOT NULL,
  track_number int,
  disc_number int DEFAULT 1,
  explicit boolean DEFAULT false,
  isrc text,
  popularity int DEFAULT 0,
  play_count int DEFAULT 0,
  waveform_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_music_tracks_artist ON public.music_tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_album ON public.music_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_spotify ON public.music_tracks(spotify_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_popularity ON public.music_tracks(popularity DESC);

-- ==================== PLAYLISTS ====================
CREATE TABLE IF NOT EXISTS public.music_playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_url text,
  is_public boolean DEFAULT false,
  is_collaborative boolean DEFAULT false,
  tracks_count int DEFAULT 0,
  follower_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_music_playlists_user ON public.music_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_music_playlists_public ON public.music_playlists(is_public) WHERE is_public = true;

-- ==================== PLAYLIST TRACKS ====================
CREATE TABLE IF NOT EXISTS public.music_playlist_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid REFERENCES public.music_playlists(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE, -- кто добавил
  position int NOT NULL,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE(playlist_id, position),
  UNIQUE(playlist_id, track_id) -- один трек один раз в плейлисте
);

CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_playlist ON public.music_playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_music_playlist_tracks_track ON public.music_playlist_tracks(track_id);

-- ==================== PLAY HISTORY ====================
CREATE TABLE IF NOT EXISTS public.music_play_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  played_at timestamptz DEFAULT now(),
  duration_ms int, -- сколько прослушал (из середины)
  completed boolean DEFAULT false, -- прослушал ли до конца
  device text, -- 'mobile', 'web', 'desktop'
  ip_address inet,
  user_agent text,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_music_play_history_user ON public.music_play_history(user_id);
CREATE INDEX IF NOT EXISTS idx_music_play_history_track ON public.music_play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_music_play_history_played ON public.music_play_history(played_at DESC);

-- ==================== LIKES ====================
CREATE TABLE IF NOT EXISTS public.music_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE(user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_music_likes_user ON public.music_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_music_likes_track ON public.music_likes(track_id);

-- ==================== SUBSCRIPTIONS (Stripe) ====================
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

CREATE INDEX IF NOT EXISTS idx_music_subscriptions_user ON public.music_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_music_subscriptions_stripe ON public.music_subscriptions(stripe_customer_id);

-- ==================== DOWNLOADS (оффлайн) ====================
CREATE TABLE IF NOT EXISTS public.music_downloads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.music_tracks(id) ON DELETE CASCADE,
  downloaded_at timestamptz DEFAULT now(),
  file_path text, -- путь в Storage
  expires_at timestamptz, -- оффлайн файлы могут иметь срок
  PRIMARY KEY (id),
  UNIQUE(user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_music_downloads_user ON public.music_downloads(user_id);

-- ==================== RLS POLICIES ====================
-- Включаем RLS на все таблицы
ALTER TABLE public.music_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_play_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_downloads ENABLE ROW LEVEL SECURITY;

-- Artists: PUBLIC read only
CREATE POLICY "Public read access for artists" ON public.music_artists
  FOR SELECT USING (true);

-- Albums: PUBLIC read only
CREATE POLICY "Public read access for albums" ON public.music_albums
  FOR SELECT USING (true);

-- Tracks: PUBLIC read only (просмотр треков)
CREATE POLICY "Public read access for tracks" ON public.music_tracks
  FOR SELECT USING (true);

-- Playlists: owner или public
CREATE POLICY "Public read access for public playlists" ON public.music_playlists
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view own playlists" ON public.music_playlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own playlists" ON public.music_playlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists" ON public.music_playlists
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists" ON public.music_playlists
  FOR DELETE USING (auth.uid() = user_id);

-- Playlist tracks: доступ через плейлист
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
    auth.uid() = user_id AND
    EXISTS (
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
    auth.uid() = user_id AND
    EXISTS (
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

-- Play history: пользователь только свои
CREATE POLICY "Users can view own history" ON public.music_play_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history" ON public.music_play_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Likes: пользователь только свои
CREATE POLICY "Users can view own likes" ON public.music_likes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own likes" ON public.music_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes" ON public.music_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Subscriptions: пользователь только свои
CREATE POLICY "Users can view own subscriptions" ON public.music_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Downloads: пользователь только свои
CREATE POLICY "Users can view own downloads" ON public.music_downloads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own downloads" ON public.music_downloads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own downloads" ON public.music_downloads
  FOR DELETE USING (auth.uid() = user_id);

-- ==================== STORAGE ====================
-- Создаём bucket для аудиофайлов
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'music',
  'music',
  false,
  52428800, -- 50 MB max file size
  '{audio/mpeg,audio/wav,audio/ogg,audio/mp4}'
) ON CONFLICT (id) DO NOTHING;

-- Storage policies
-- PUBLIC может читать аудио (прослушивание)
CREATE POLICY "Public read access for audio files" ON storage.objects
  FOR SELECT USING (bucket_id = 'music' AND auth.role() = 'authenticated');

-- Service role может загружать (админ)
CREATE POLICY "Service can upload audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'music' AND
    auth.role() = 'service_role' AND
    (LOWER(RIGHT(name, 4)) IN ('.mp3', '.wav', '.ogg', '.m4a'))
  );

-- ==================== FUNCTIONS ====================
-- Функция: добавить прослушивание
CREATE OR REPLACE FUNCTION public.record_track_play(
  p_user_id uuid DEFAULT auth.uid(),
  p_track_id uuid,
  p_duration_ms int DEFAULT NULL,
  p_device text DEFAULT 'mobile',
  p_completed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.music_play_history (
    user_id, track_id, played_at, duration_ms, completed, device
  ) VALUES (
    p_user_id, p_track_id, now(), p_duration_ms, p_completed, p_device
  );

  -- Увеличиваем счётчик прослушиваний трека
  UPDATE public.music_tracks
  SET play_count = play_count + 1
  WHERE id = p_track_id;
END;
$$;

-- Функция: получить рекомендации для пользователя
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
AS $$
  -- Простые рекомендации: популярные треки, которые пользователь ещё не слушал
  SELECT
    t.id,
    t.title,
    a.name as artist_name,
    al.cover_url,
    (t.popularity / 100.0) as score
  FROM public.music_tracks t
  JOIN public.music_artists a ON t.artist_id = a.id
  LEFT JOIN public.music_albums al ON al.id = t.album_id
  WHERE t.id NOT IN (
    SELECT track_id
    FROM public.music_play_history
    WHERE user_id = p_user_id
    AND played_at > (now() - interval '30 days')
  )
  ORDER BY t.popularity DESC, RANDOM()
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.reorder_playlist_tracks(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ==================== TRIGGERS ====================
-- Авто-обновление updated_at
CREATE OR REPLACE FUNCTION public.handle_music_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER music_artists_updated
  BEFORE UPDATE ON public.music_artists
  FOR EACH ROW EXECUTE FUNCTION public.handle_music_updated_at();

CREATE TRIGGER music_albums_updated
  BEFORE UPDATE ON public.music_albums
  FOR EACH ROW EXECUTE FUNCTION public.handle_music_updated_at();

CREATE TRIGGER music_playlists_updated
  BEFORE UPDATE ON public.music_playlists
  FOR EACH ROW EXECUTE FUNCTION public.handle_music_updated_at();

-- ==================== COMMENTS ====================
COMMENT ON TABLE public.music_artists IS 'Artists in the music streaming service';
COMMENT ON TABLE public.music_albums IS 'Albums in the music streaming service';
COMMENT ON TABLE public.music_tracks IS 'Audio tracks available for streaming';
COMMENT ON TABLE public.music_playlists IS 'User-created playlists';
COMMENT ON TABLE public.music_play_history IS 'History of track plays by users';
COMMENT ON TABLE public.music_likes IS 'Liked tracks by users';
COMMENT ON TABLE public.music_subscriptions IS 'Music subscription plans (Stripe)';
COMMENT ON TABLE public.music_downloads IS 'Offline downloads for premium users';
