/**
 * @file src/hooks/useReelPlayback.ts
 * @description Хук для управления состоянием воспроизведения Reel:
 * сохранение позиции, resume playback, watch count, speed rate.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import type { ReelPlaybackState, PlaybackSpeed } from '@/types/reels/premium';

// Скорости воспроизведения (по умолчанию 1x)
export const SPEED_PRESETS: PlaybackSpeed[] = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function getStorageKey(userId: string, reelId: string): string {
  return `reel_playback:${userId}:${reelId}`;
}

/**
 * Хук для управления воспроизведением Reel.
 */
export function useReelPlayback(reelId: string) {
  const { user } = useAuth();
  const [playbackState, setPlaybackState] = useState<ReelPlaybackState | null>(null);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1.0);
  const [loading, setLoading] = useState(false);
  const speedRef = useRef<PlaybackSpeed>(1.0);
  const lastSyncRef = useRef<number>(0);

  // Sync speed with ref
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // ---------------------------------------------------------------------------
  // Load playback state
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!user || !reelId) return;

    const load = async () => {
      setLoading(true);
      try {
        // Сначала проверяем локальное хранилище (быстрый доступ)
        const localKey = getStorageKey(user.id, reelId);
        const localData = localStorage.getItem(localKey);
        if (localData) {
          try {
            const parsed = JSON.parse(localData) as ReelPlaybackState;
            setPlaybackState(parsed);
          } catch {
            // ignore parse errors
          }
        }

        // Загружаем с сервера (обновлённые данные)
        const { data, error } = await supabase.rpc('get_reel_playback', {
          p_reel_id: reelId,
        });

        if (!error && data && data.length > 0) {
          const serverState = data[0] as ReelPlaybackState;
          setPlaybackState(serverState);

          // Sync to localStorage
          localStorage.setItem(localKey, JSON.stringify(serverState));
        }
      } catch (err) {
        logger.warn('[useReelPlayback] Failed to load playback state', {
          error: err,
          reelId,
          userId: user?.id,
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [reelId, user?.id]);

  // ---------------------------------------------------------------------------
  // Save playback position (debounced, every 5 seconds)
  // ---------------------------------------------------------------------------

  const savePlaybackPosition = useCallback(
    async (position: number, completed: boolean = false) => {
      if (!user || !reelId) return;

      const now = Date.now();
      // Throttle: don't save more often than every 5 seconds
      if (now - lastSyncRef.current < 5000 && !completed) return;
      lastSyncRef.current = now;

      const state: ReelPlaybackState = {
        reel_id: reelId,
        user_id: user.id,
        last_position_sec: position,
        completed,
        watch_count: (playbackState?.watch_count ?? 0) + (completed ? 0 : 1),
        last_watched_at: new Date().toISOString(),
      };

      // Optimistic: update local state
      setPlaybackState(state);

      // Save to localStorage
      localStorage.setItem(getStorageKey(user.id, reelId), JSON.stringify(state));

      // Save to server
      try {
        await supabase.rpc('save_reel_playback', {
          p_reel_id: reelId,
          p_position: position,
          p_completed: completed,
        });
      } catch (err) {
        logger.warn('[useReelPlayback] Failed to save playback position', {
          error: err,
          reelId,
          position,
          userId: user?.id,
        });
      }
    },
    [user, reelId, playbackState],
  );

  // ---------------------------------------------------------------------------
  // Speed control
  // ---------------------------------------------------------------------------

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_PRESETS.indexOf(prev);
      const nextIdx = (idx + 1) % SPEED_PRESETS.length;
      return SPEED_PRESETS[nextIdx];
    });
  }, []);

  const setPlaybackSpeed = useCallback((newSpeed: PlaybackSpeed) => {
    setSpeed(newSpeed);
  }, []);

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  const resetPlayback = useCallback(() => {
    setPlaybackState(null);
    setSpeed(1.0);
    speedRef.current = 1.0;
  }, []);

  return {
    playbackState,
    speed,
    speedRef,
    loading,
    savePlaybackPosition,
    cycleSpeed,
    setPlaybackSpeed,
    resetPlayback,
    isCompleted: playbackState?.completed ?? false,
    lastPosition: playbackState?.last_position_sec ?? 0,
  };
}

export default useReelPlayback;