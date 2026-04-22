import type { Track } from '../store/useMusicStore';

const AUDIO_CACHE_NAME = 'mansoni-music-audio-v1';
const cacheKey = (trackId: string) => `https://music-cache.local/${trackId}`;

async function getAudioCache(): Promise<Cache | null> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return null;
  }

  return caches.open(AUDIO_CACHE_NAME);
}

export async function listCachedTrackIds(): Promise<string[]> {
  const cache = await getAudioCache();
  if (!cache) {
    return [];
  }

  const keys = await cache.keys();
  return keys
    .map((request) => request.url.replace('https://music-cache.local/', ''))
    .filter(Boolean);
}

export async function isTrackCached(trackId: string): Promise<boolean> {
  const cache = await getAudioCache();
  if (!cache) {
    return false;
  }

  const response = await cache.match(cacheKey(trackId));
  return Boolean(response);
}

export async function getCachedTrackObjectUrl(trackId: string): Promise<string | null> {
  const cache = await getAudioCache();
  if (!cache) {
    return null;
  }

  const response = await cache.match(cacheKey(trackId));
  if (!response) {
    return null;
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function cacheTrackAudio(track: Track): Promise<boolean> {
  if (!track.audioUrl) {
    return false;
  }

  const cache = await getAudioCache();
  if (!cache) {
    return false;
  }

  const response = await fetch(track.audioUrl, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Failed to cache audio: ${response.status}`);
  }

  await cache.put(cacheKey(track.id), response.clone());
  return true;
}

export async function removeCachedTrack(trackId: string): Promise<void> {
  const cache = await getAudioCache();
  if (!cache) {
    return;
  }

  await cache.delete(cacheKey(trackId));
}