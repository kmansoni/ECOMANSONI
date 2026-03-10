/**
 * TimelineTrack.tsx — Отдельная дорожка с клипами.
 * Высота зависит от типа. Клипы расположены по start_ms / duration_ms.
 */

import React, { useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useTimelineStore } from '../../stores/timeline-store';
import { TimelineClip } from './TimelineClip';
import type { TrackWithClips, TrackType } from '../../types';

interface TimelineTrackProps {
  track: TrackWithClips;
  totalWidth: number;
}

const TRACK_HEIGHTS: Record<TrackType, number> = {
  video: 60,
  audio: 40,
  text: 36,
  sticker: 36,
  effect: 36,
};

const TRACK_BG_COLORS: Record<TrackType, string> = {
  video: '#0f0f23',
  audio: '#0a1a0f',
  text: '#1a1a0a',
  sticker: '#1a0f1a',
  effect: '#140f1a',
};

export const TimelineTrack = React.memo(function TimelineTrack({
  track,
  totalWidth,
}: TimelineTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const pxPerMs = zoomLevel / 1000;

  const isTrackSelected = selectedTrackId === track.id;
  const trackHeight = TRACK_HEIGHTS[track.type] ?? 48;
  const bgColor = TRACK_BG_COLORS[track.type] ?? '#0f0f23';

  const sortedClips = useMemo(
    () => [...track.clips].sort((a, b) => a.start_ms - b.start_ms),
    [track.clips],
  );

  return (
    <div
      ref={trackRef}
      className={cn(
        'relative border-b border-slate-800/40',
        isTrackSelected && 'bg-[#1a1a3e]',
        track.is_locked && 'opacity-60 pointer-events-none',
        !track.is_visible && 'opacity-40',
      )}
      style={{
        height: `${trackHeight}px`,
        width: `${totalWidth}px`,
        backgroundColor: isTrackSelected ? '#1a1a3e' : bgColor,
      }}
      role="row"
      aria-label={`Дорожка ${track.name}`}
    >
      {sortedClips.map((clip) => (
        <TimelineClip
          key={clip.id}
          clip={clip}
          trackType={track.type}
          pxPerMs={pxPerMs}
          trackRef={trackRef as React.RefObject<HTMLDivElement>}
          isSelected={selectedClipIds.has(clip.id)}
        />
      ))}
    </div>
  );
});
