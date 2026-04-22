ALTER TABLE IF EXISTS public.music_albums
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.music_playlists
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE IF EXISTS public.music_playlist_tracks
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE IF EXISTS public.music_play_history
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE IF EXISTS public.music_likes
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE IF EXISTS public.music_subscriptions
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE IF EXISTS public.music_downloads
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Users can manage own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can view own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can insert own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can update own playlists" ON public.music_playlists;
DROP POLICY IF EXISTS "Users can delete own playlists" ON public.music_playlists;

CREATE POLICY "Users can view own playlists" ON public.music_playlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own playlists" ON public.music_playlists
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can update own playlists" ON public.music_playlists
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists" ON public.music_playlists
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can view playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can insert playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can update playlist tracks" ON public.music_playlist_tracks;
DROP POLICY IF EXISTS "Users can delete playlist tracks" ON public.music_playlist_tracks;

CREATE POLICY "Users can view playlist tracks" ON public.music_playlist_tracks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND (music_playlists.is_public = true OR music_playlists.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert playlist tracks" ON public.music_playlist_tracks
  FOR INSERT WITH CHECK (
    auth.uid() = coalesce(user_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update playlist tracks" ON public.music_playlist_tracks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = coalesce(user_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete playlist tracks" ON public.music_playlist_tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.music_playlists
      WHERE music_playlists.id = music_playlist_tracks.playlist_id
        AND music_playlists.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage own history" ON public.music_play_history;
DROP POLICY IF EXISTS "Users can view own history" ON public.music_play_history;
DROP POLICY IF EXISTS "Users can insert own history" ON public.music_play_history;

CREATE POLICY "Users can view own history" ON public.music_play_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history" ON public.music_play_history
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

DROP POLICY IF EXISTS "Users can manage own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can view own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can insert own likes" ON public.music_likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON public.music_likes;

CREATE POLICY "Users can view own likes" ON public.music_likes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own likes" ON public.music_likes
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can delete own likes" ON public.music_likes
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.music_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.music_subscriptions;

CREATE POLICY "Users can view own subscriptions" ON public.music_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own downloads" ON public.music_downloads;
DROP POLICY IF EXISTS "Users can view own downloads" ON public.music_downloads;
DROP POLICY IF EXISTS "Users can insert own downloads" ON public.music_downloads;
DROP POLICY IF EXISTS "Users can delete own downloads" ON public.music_downloads;

CREATE POLICY "Users can view own downloads" ON public.music_downloads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own downloads" ON public.music_downloads
  FOR INSERT WITH CHECK (auth.uid() = coalesce(user_id, auth.uid()));

CREATE POLICY "Users can delete own downloads" ON public.music_downloads
  FOR DELETE USING (auth.uid() = user_id);

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
  SET play_count = play_count + 1
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
    al.cover_url,
    ((coalesce(t.play_count, 0) * 0.35) + (coalesce(t.popularity, 0) * 0.65)) / 100.0 AS score
  FROM public.music_tracks t
  JOIN public.music_artists a ON a.id = t.artist_id
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
    SELECT
      id,
      row_number() OVER (ORDER BY position, added_at, id) AS new_position
    FROM public.music_playlist_tracks
    WHERE playlist_id = p_playlist_id
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
  WHERE id = p_playlist_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_track_play(uuid, uuid, int, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_music_recommendations(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_playlist_tracks(uuid) TO authenticated, service_role;