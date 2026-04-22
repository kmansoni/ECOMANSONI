import { useState, useEffect, useCallback } from 'react';
import { DEMO_PLAYLISTS, DEMO_TRACKS } from './demoMusicData';
import { listCachedTrackIds } from './offlineAudioCache';
import { getAuthToken, getSupabaseClient } from './supabase';
import type { Track, Playlist } from '../store/useMusicStore';

interface Artist {
  id: string;
  name: string;
  image_url?: string;
  genres?: string[];
  followers_count?: number;
}

interface Album {
  id: string;
  title: string;
  cover_url?: string;
  artist_id?: string;
  release_date?: string;
  album_type?: string;
}

interface TrackDB {
  id: string;
  title: string;
  duration_ms: number;
  preview_url?: string;
  audio_url: string;
  explicit?: boolean;
  popularity?: number;
  play_count?: number;
  artist?: Artist | Artist[] | null;
  album?: Album | Album[] | null;
}

interface PlaylistDB {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  cover_url?: string;
  is_public: boolean;
  tracks_count: number;
  created_at: string;
  updated_at: string;
}

interface LikeDB {
  id: string;
  track_id: string;
  created_at: string;
  music_tracks?: TrackDB | TrackDB[] | null;
}

interface PlaylistTrackRow {
  playlist_id: string;
  position: number;
  music_tracks?: TrackDB | TrackDB[] | null;
}

function pickOne<T>(value?: T | T[] | null): T | undefined {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}

// Map DB track to UI track
function mapTrackToUI(trackDB: TrackDB): Track {
  const artist = pickOne(trackDB.artist);
  const album = pickOne(trackDB.album);

  return {
    id: trackDB.id,
    title: trackDB.title,
    artist: artist?.name || 'Unknown Artist',
    album: album?.title || 'Unknown Album',
    duration: Math.floor((trackDB.duration_ms || 0) / 1000),
    coverUrl: album?.cover_url || 'https://picsum.photos/seed/default/300/300',
    audioUrl: trackDB.preview_url || trackDB.audio_url || '',
  };
}

export function useMusicData() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);

  // Fetch popular tracks
  const fetchTracks = useCallback(async (limit = 20) => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('music_tracks')
        .select(`
          id, title, duration_ms, preview_url, audio_url, explicit, popularity, play_count,
          artist:music_artists(id, name, image_url),
          album:music_albums(id, title, cover_url)
        `)
        .order('play_count', { ascending: false })
        .order('popularity', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      if (data && data.length > 0) {
        const mappedTracks = (data as TrackDB[]).map(mapTrackToUI);
        setTracks(mappedTracks);
        setIsDemo(false);
        return mappedTracks;
      }
    } catch (err) {
      console.warn('Using demo tracks (Supabase not connected):', err);
      setIsDemo(true);
    }

    const fallback = DEMO_TRACKS.slice(0, limit);
    setTracks(fallback);
    return fallback;
  }, []);

  // Fetch user's playlists
  const fetchUserPlaylists = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const isAuthed = Boolean(getAuthToken());
      let query = supabase.from('music_playlists').select('*').order('updated_at', { ascending: false }).limit(20);

      if (!isAuthed) {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      if (data && data.length > 0) {
        const playlistIds = data.map((playlist) => playlist.id);
        const { data: playlistTracks, error: playlistTracksError } = await supabase
          .from('music_playlist_tracks')
          .select(`
            playlist_id,
            position,
            music_tracks(
              id, title, duration_ms, preview_url, audio_url, explicit, popularity, play_count,
              artist:music_artists(id, name, image_url),
              album:music_albums(id, title, cover_url)
            )
          `)
          .in('playlist_id', playlistIds)
          .order('position', { ascending: true });

        if (playlistTracksError) throw playlistTracksError;

        const tracksByPlaylist = new Map<string, Track[]>();
        for (const row of (playlistTracks || []) as PlaylistTrackRow[]) {
          const trackRow = pickOne(row.music_tracks);
          if (!trackRow) {
            continue;
          }

          const bucket = tracksByPlaylist.get(row.playlist_id) || [];
          bucket.push(mapTrackToUI(trackRow));
          tracksByPlaylist.set(row.playlist_id, bucket);
        }

        const mappedPlaylists: Playlist[] = data.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          coverUrl: p.cover_url || 'https://picsum.photos/seed/playlist/300/300',
          tracks: tracksByPlaylist.get(p.id) || [],
        }));
        setPlaylists(mappedPlaylists);
        setIsDemo(false);
        return mappedPlaylists;
      }
    } catch (err) {
      console.warn('Using demo playlists:', err);
      setIsDemo(true);
    }

    setPlaylists(DEMO_PLAYLISTS);
    return DEMO_PLAYLISTS;
  }, []);

  // Fetch liked tracks
  const fetchLikedTracks = useCallback(async () => {
    try {
      if (!getAuthToken()) {
        setLikedTracks([]);
        return [];
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('music_likes')
        .select(`
          id, created_at,
          music_tracks(
            id, title, duration_ms, preview_url, audio_url,
            artist:music_artists(id, name),
            album:music_albums(id, title, cover_url)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      if (data && data.length > 0) {
        const mappedTracks = data
          .filter((d) => d.music_tracks)
          .map((d) => mapTrackToUI(pickOne(d.music_tracks as TrackDB | TrackDB[] | null)!));
        setLikedTracks(mappedTracks);
        setIsDemo(false);
        return mappedTracks;
      }
    } catch (err) {
      console.warn('Using demo likes:', err);
      setIsDemo(true);
    }

    setLikedTracks([]);
    return [];
  }, []);

  const fetchDownloadedTracks = useCallback(async () => {
    const cachedTrackIds = await listCachedTrackIds();

    try {
      if (!getAuthToken()) {
        setDownloadedTrackIds(cachedTrackIds);
        return cachedTrackIds;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('music_downloads').select('track_id').limit(200);

      if (error) throw error;

      const remoteTrackIds = (data || []).map((item) => item.track_id);
      const merged = Array.from(new Set([...remoteTrackIds, ...cachedTrackIds]));
      setDownloadedTrackIds(merged);
      return merged;
    } catch (err) {
      console.warn('Download sync fallback to local cache:', err);
      setDownloadedTrackIds(cachedTrackIds);
      return cachedTrackIds;
    }
  }, []);

  // Search tracks
  const searchTracks = useCallback(async (query: string): Promise<Track[]> => {
    if (!query.trim()) return [];

    try {
      const supabase = getSupabaseClient();
      const normalizedQuery = query.trim();
      const [tracksResult, artistsResult] = await Promise.all([
        supabase
          .from('music_tracks')
          .select(`
            id, title, duration_ms, preview_url, audio_url,
            artist:music_artists(id, name),
            album:music_albums(id, title, cover_url)
          `)
          .ilike('title', `%${normalizedQuery}%`)
          .limit(20),
        supabase
          .from('music_artists')
          .select('id')
          .ilike('name', `%${normalizedQuery}%`)
          .limit(10),
      ]);

      if (tracksResult.error) throw tracksResult.error;
      if (artistsResult.error) throw artistsResult.error;

      const artistIds = (artistsResult.data || []).map((artist) => artist.id);
      let artistTracks: TrackDB[] = [];

      if (artistIds.length > 0) {
        const { data: artistTrackRows, error: artistTracksError } = await supabase
          .from('music_tracks')
          .select(`
            id, title, duration_ms, preview_url, audio_url,
            artist:music_artists(id, name),
            album:music_albums(id, title, cover_url)
          `)
          .in('artist_id', artistIds)
          .limit(20);

        if (artistTracksError) throw artistTracksError;
        artistTracks = (artistTrackRows || []) as TrackDB[];
      }

      const uniqueTracks = new Map<string, Track>();
      for (const track of ([...(tracksResult.data || []), ...artistTracks] as TrackDB[])) {
        uniqueTracks.set(track.id, mapTrackToUI(track));
      }

      if (uniqueTracks.size > 0) {
        return Array.from(uniqueTracks.values());
      }
    } catch (err) {
      console.warn('Search failed:', err);
    }
    
    // Fallback to demo search
    const lowerQuery = query.toLowerCase();
    return DEMO_TRACKS.filter(
      (t) =>
        t.title.toLowerCase().includes(lowerQuery) ||
        t.artist.toLowerCase().includes(lowerQuery) ||
        t.album.toLowerCase().includes(lowerQuery)
    );
  }, []);

  // Initial load
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);
      
      try {
        await Promise.all([
          fetchTracks(20),
          fetchUserPlaylists(),
          fetchLikedTracks(),
          fetchDownloadedTracks(),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load music data');
      } finally {
        setLoading(false);
      }
    }
    
    loadAll();
  }, [fetchTracks, fetchUserPlaylists, fetchLikedTracks]);

  // Add track to liked
  const likeTrack = useCallback(async (trackId: string) => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('music_likes')
        .insert({ track_id: trackId });

      if (error && error.code !== '23505') {
        throw error;
      }

      const likedTrack = tracks.find((track) => track.id === trackId);
      if (likedTrack && !likedTracks.some((track) => track.id === trackId)) {
        setLikedTracks([likedTrack, ...likedTracks]);
      }
    } catch (err) {
      console.warn('Like failed:', err);
    }
  }, [likedTracks, tracks]);

  // Remove track from liked
  const unlikeTrack = useCallback(async (trackId: string) => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('music_likes')
        .delete()
        .eq('track_id', trackId);

      if (error) throw error;

      setLikedTracks(likedTracks.filter((track) => track.id !== trackId));
    } catch (err) {
      console.warn('Unlike failed:', err);
    }
  }, [likedTracks]);

  return {
    tracks,
    playlists: isDemo ? DEMO_PLAYLISTS : playlists,
    likedTracks,
    downloadedTrackIds,
    loading,
    error,
    isDemo,
    fetchTracks,
    fetchUserPlaylists,
    fetchLikedTracks,
    fetchDownloadedTracks,
    searchTracks,
    likeTrack,
    unlikeTrack,
  };
}