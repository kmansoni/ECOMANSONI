import { useState, useEffect, useCallback } from 'react';
import { dbLoose } from '@/lib/supabase';

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  cover_url: string | null;
  audio_url: string;
  genre: string | null;
  is_trending: boolean;
  use_count: number;
  created_at: string;
}

export interface StoryMusic {
  id: string;
  story_id: string;
  track_id: string;
  start_time: number;
  duration: number;
  track?: MusicTrack;
}

export function useMusic() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [trending, setTrending] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dbLoose
        .from('music_tracks')
        .select('*')
        .order('use_count', { ascending: false })
        .limit(50),
      dbLoose
        .from('music_tracks')
        .select('*')
        .eq('is_trending', true)
        .order('use_count', { ascending: false })
        .limit(20),
    ]).then(([allRes, trendRes]) => {
      setTracks((allRes.data ?? []) as MusicTrack[]);
      setTrending((trendRes.data ?? []) as MusicTrack[]);
    }).finally(() => setLoading(false));
  }, []);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      return tracks;
    }
    const { data } = await dbLoose
      .from('music_tracks')
      .select('*')
      .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
      .limit(30);
    return (data ?? []) as MusicTrack[];
  }, [tracks]);

  const addToStory = useCallback(
    async (storyId: string, trackId: string, startTime: number, duration: number) => {
      const { data, error } = await dbLoose
        .from('story_music')
        .upsert(
          { story_id: storyId, track_id: trackId, start_time: startTime, duration },
          { onConflict: 'story_id' }
        )
        .select('*, track:music_tracks(*)')
        .single();
      if (error) throw error;
      return data as StoryMusic;
    },
    []
  );

  const getStoryMusic = useCallback(async (storyId: string) => {
    const { data } = await dbLoose
      .from('story_music')
      .select('*, track:music_tracks(*)')
      .eq('story_id', storyId)
      .maybeSingle();
    return data as StoryMusic | null;
  }, []);

  return { tracks, trending, loading, search, addToStory, getStoryMusic };
}
