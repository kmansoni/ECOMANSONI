/**
 * Timeline.tsx — Контейнер таймлайна.
 * Scroll sync, zoom (Ctrl+scroll), drop zone, контекстное меню.
 */

import React, { useCallback, useRef, useMemo } from 'react';
import { Plus, Scissors, Copy, Trash2, Layers } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { TimelineTrackHeader } from './TimelineTrackHeader';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineControls } from './TimelineControls';

const HEADER_WIDTH = 180;

export const Timeline = React.memo(function Timeline() {
  const tracks = useEditorStore((s) => s.tracks);
  const getProjectDuration = useEditorStore((s) => s.getProjectDuration);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const scrollLeft = useTimelineStore((s) => s.scrollLeft);
  const setScroll = useTimelineStore((s) => s.setScroll);
  const scrollTop = useTimelineStore((s) => s.scrollTop);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const clearSelection = useTimelineStore((s) => s.clearSelection);

  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);

  const projectDuration = getProjectDuration();
  const pxPerMs = zoomLevel / 1000;
  const totalWidth = Math.max(2000, (projectDuration + 5000) * pxPerMs);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.sort_order - b.sort_order),
    [tracks],
  );

  // Sync scroll between ruler and tracks
  const handleTracksScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScroll(target.scrollLeft, target.scrollTop);
      // Sync ruler
      if (rulerContainerRef.current) {
        rulerContainerRef.current.scrollLeft = target.scrollLeft;
      }
    },
    [setScroll],
  );

  // Ctrl+Scroll for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        if (delta > 0) {
          useTimelineStore.getState().zoomIn();
        } else {
          useTimelineStore.getState().zoomOut();
        }
      }
    },
    [],
  );

  // Click on empty area to deselect
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  // Context menu actions
  const handleAddTrack = useCallback(() => {
    const newTrack = {
      id: `temp_track_${Date.now()}`,
      project_id: '',
      type: 'video' as const,
      name: `Дорожка ${tracks.length + 1}`,
      sort_order: tracks.length,
      is_locked: false,
      is_visible: true,
      volume: 1,
      opacity: 1,
      blend_mode: 'normal' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      clips: [],
    };
    useEditorStore.getState().addTrackLocal(newTrack);
  }, [tracks.length]);

  const handleDeleteSelected = useCallback(() => {
    const selected = Array.from(selectedClipIds);
    for (const clipId of selected) {
      useEditorStore.getState().removeClipLocal(clipId);
    }
    clearSelection();
  }, [selectedClipIds, clearSelection]);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-col bg-[#0a0a1a] h-full select-none"
        onWheel={handleWheel}
        role="region"
        aria-label="Таймлайн"
      >
        {/* Timeline Controls */}
        <TimelineControls />

        {/* Ruler + Tracks container */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Track headers (left, fixed width) */}
          <div
            className="flex-shrink-0 flex flex-col border-r border-slate-800"
            style={{ width: HEADER_WIDTH }}
          >
            {/* Ruler spacer */}
            <div className="h-7 bg-[#1a1a2e] border-b border-slate-800" />

            {/* Track headers */}
            <div className="flex-1 overflow-hidden">
              <div style={{ marginTop: -scrollTop }}>
                {sortedTracks.map((track) => (
                  <TimelineTrackHeader
                    key={track.id}
                    trackId={track.id}
                    name={track.name}
                    type={track.type}
                    isLocked={track.is_locked}
                    isVisible={track.is_visible}
                    volume={track.volume}
                    isSelected={selectedTrackId === track.id}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Ruler + Tracks (scrollable area) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Ruler row */}
            <div
              ref={rulerContainerRef}
              className="overflow-hidden flex-shrink-0"
              style={{ height: 28 }}
            >
              <TimelineRuler width={totalWidth} scrollLeft={scrollLeft} />
            </div>

            {/* Tracks + Playhead */}
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  ref={tracksContainerRef}
                  className="flex-1 overflow-auto relative"
                  onScroll={handleTracksScroll}
                  onClick={handleBackgroundClick}
                >
                  <div className="relative" style={{ width: totalWidth, minHeight: '100%' }}>
                    {sortedTracks.map((track) => (
                      <TimelineTrack
                        key={track.id}
                        track={track}
                        totalWidth={totalWidth}
                      />
                    ))}

                    {/* Empty state */}
                    {sortedTracks.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-slate-600">
                          <Layers className="h-10 w-10 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Перетащите медиа сюда или добавьте дорожку</p>
                        </div>
                      </div>
                    )}

                    {/* Playhead */}
                    <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none">
                      <TimelinePlayhead containerWidth={totalWidth} />
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>

              <ContextMenuContent className="bg-[#1f2937] border-slate-700 min-w-[180px]">
                <ContextMenuItem
                  className="text-xs gap-2 cursor-pointer hover:bg-slate-700"
                  onClick={handleAddTrack}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Добавить дорожку
                </ContextMenuItem>
                <ContextMenuSeparator className="bg-slate-700" />
                <ContextMenuItem
                  className="text-xs gap-2 cursor-pointer hover:bg-slate-700"
                  disabled={selectedClipIds.size === 0}
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Разрезать (B)
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-xs gap-2 cursor-pointer hover:bg-slate-700"
                  disabled={selectedClipIds.size === 0}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Дублировать (Ctrl+D)
                </ContextMenuItem>
                <ContextMenuSeparator className="bg-slate-700" />
                <ContextMenuItem
                  className="text-xs gap-2 cursor-pointer hover:bg-slate-700 text-red-400"
                  disabled={selectedClipIds.size === 0}
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Удалить (Del)
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});
