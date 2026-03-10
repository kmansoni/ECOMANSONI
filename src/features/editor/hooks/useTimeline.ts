/**
 * useTimeline.ts — Playback контроль (play/pause/seek) через requestAnimationFrame.
 *
 * При isPlaying === true запускает RAF-loop, который обновляет currentTimeMs
 * на основе реального delta-time. При достижении конца проекта — автопауза.
 */

import { useEffect, useRef } from 'react';
import { useTimelineStore } from '../stores/timeline-store';
import { useEditorStore } from '../stores/editor-store';

export function useTimeline() {
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const playbackRate = useTimelineStore((s) => s.playbackRate);
  const currentTimeMs = useTimelineStore((s) => s.currentTimeMs);
  const pause = useTimelineStore((s) => s.pause);
  const seek = useTimelineStore((s) => s.seek);
  const getProjectDuration = useEditorStore((s) => s.getProjectDuration);

  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    lastTimestampRef.current = performance.now();

    const animate = (timestamp: number) => {
      const delta = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;

      const currentTime = useTimelineStore.getState().currentTimeMs;
      const rate = useTimelineStore.getState().playbackRate;
      const newTime = currentTime + delta * rate;
      const maxTime = getProjectDuration();

      if (maxTime > 0 && newTime >= maxTime) {
        pause();
        seek(maxTime);
        rafRef.current = null;
        return;
      }

      seek(newTime);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, playbackRate, pause, seek, getProjectDuration]);

  const projectDuration = getProjectDuration();

  return {
    isPlaying,
    currentTimeMs,
    playbackRate,
    projectDuration,
    play: useTimelineStore.getState().play,
    pause,
    togglePlayback: useTimelineStore.getState().togglePlayback,
    seek,
    setPlaybackRate: useTimelineStore.getState().setPlaybackRate,
  };
}
