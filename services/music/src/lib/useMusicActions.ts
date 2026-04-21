import { useCallback } from 'react';
import { cacheTrackAudio, removeCachedTrack } from './offlineAudioCache';
import { getAuthToken, getSupabaseClient } from './supabase';
import { useMusicStore, type Track } from '../store/useMusicStore';

export function useMusicActions() {
  const likedTrackIds = useMusicStore((state) => state.likedTrackIds);
  const downloadedTrackIds = useMusicStore((state) => state.downloadedTrackIds);
  const setLikedTrackIds = useMusicStore((state) => state.setLikedTrackIds);
  const setDownloadedTrackIds = useMusicStore((state) => state.setDownloadedTrackIds);

  const likeTrack = useCallback(async (trackId: string) => {
    const supabase = getSupabaseClient();
    const isAuthed = Boolean(getAuthToken());

    if (isAuthed) {
      const { error } = await supabase.from('music_likes').insert({ track_id: trackId });
      if (error && error.code !== '23505') {
        throw error;
      }
    }

    if (!likedTrackIds.includes(trackId)) {
      setLikedTrackIds([...likedTrackIds, trackId]);
    }
  }, [likedTrackIds, setLikedTrackIds]);

  const unlikeTrack = useCallback(async (trackId: string) => {
    const supabase = getSupabaseClient();
    const isAuthed = Boolean(getAuthToken());

    if (isAuthed) {
      const { error } = await supabase.from('music_likes').delete().eq('track_id', trackId);
      if (error) {
        throw error;
      }
    }

    setLikedTrackIds(likedTrackIds.filter((id) => id !== trackId));
  }, [likedTrackIds, setLikedTrackIds]);

  const toggleLike = useCallback(async (trackId: string) => {
    if (likedTrackIds.includes(trackId)) {
      await unlikeTrack(trackId);
      return false;
    }

    await likeTrack(trackId);
    return true;
  }, [likeTrack, likedTrackIds, unlikeTrack]);

  const downloadTrack = useCallback(async (track: Track) => {
    await cacheTrackAudio(track);

    const supabase = getSupabaseClient();
    const isAuthed = Boolean(getAuthToken());

    if (isAuthed) {
      const { error } = await supabase.from('music_downloads').upsert({
        track_id: track.id,
        file_path: `cache:${track.id}`,
      });
      if (error) {
        throw error;
      }
    }

    if (!downloadedTrackIds.includes(track.id)) {
      setDownloadedTrackIds([...downloadedTrackIds, track.id]);
    }
  }, [downloadedTrackIds, setDownloadedTrackIds]);

  const removeDownload = useCallback(async (trackId: string) => {
    await removeCachedTrack(trackId);

    const supabase = getSupabaseClient();
    const isAuthed = Boolean(getAuthToken());

    if (isAuthed) {
      const { error } = await supabase.from('music_downloads').delete().eq('track_id', trackId);
      if (error) {
        throw error;
      }
    }

    setDownloadedTrackIds(downloadedTrackIds.filter((id) => id !== trackId));
  }, [downloadedTrackIds, setDownloadedTrackIds]);

  const toggleDownload = useCallback(async (track: Track) => {
    if (downloadedTrackIds.includes(track.id)) {
      await removeDownload(track.id);
      return false;
    }

    await downloadTrack(track);
    return true;
  }, [downloadTrack, downloadedTrackIds, removeDownload]);

  return {
    likeTrack,
    unlikeTrack,
    toggleLike,
    downloadTrack,
    removeDownload,
    toggleDownload,
  };
}