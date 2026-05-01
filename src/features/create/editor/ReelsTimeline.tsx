import { useState, useRef, useCallback } from "react";
import { Trash2, Plus, Scissors, GripVertical } from "lucide-react";

export interface ReelSegment {
  id: string;
  url?: string;
  duration: number;
  startTime?: number;
  endTime?: number;
}

interface ReelsTimelineProps {
  segments: ReelSegment[];
  totalDuration: number;
  currentTime: number;
  isPlaying: boolean;
  onSegmentAdd?: () => void;
  onSegmentRemove?: (id: string) => void;
  onSegmentTrim?: (id: string, start: number, end: number) => void;
  onTimeUpdate?: (time: number) => void;
}

const PIXELS_PER_SECOND = 100;

export function ReelsTimeline({
  segments,
  totalDuration,
  currentTime,
  isPlaying,
  onSegmentAdd,
  onSegmentRemove,
  onSegmentTrim,
  onTimeUpdate,
}: ReelsTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingSegment, setDraggingSegment] = useState<string | null>(null);
  const [resizingSegment, setResizingSegment] = useState<{
    id: string;
    edge: "left" | "right";
  } | null>(null);

  const totalWidth = totalDuration * PIXELS_PER_SECOND;
  const currentPosition = currentTime * PIXELS_PER_SECOND;

  const handlePointerDown = (e: React.PointerEvent, segmentId: string, edge?: "left" | "right") => {
    if (edge) {
      setResizingSegment({ id: segmentId, edge });
    } else {
      setDraggingSegment(segmentId);
    }
  };

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const time = x / PIXELS_PER_SECOND;

    if (resizingSegment) {
      const segment = segments.find((s) => s.id === resizingSegment.id);
      if (!segment) return;

      if (resizingSegment.edge === "left") {
        onSegmentTrim?.(resizingSegment.id, Math.max(0, time), segment.endTime ?? segment.duration);
      } else {
        onSegmentTrim?.(resizingSegment.id, segment.startTime ?? 0, Math.min(totalDuration, time));
      }
    }
  }, [resizingSegment, segments, onSegmentTrim, totalDuration]);

  const handlePointerUp = useCallback(() => {
    setDraggingSegment(null);
    setResizingSegment(null);
  }, []);

  // Global pointer events for resizing
  useState(() => {
    if (resizingSegment) {
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    }
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  });

  return (
    <div className="w-full bg-background border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Segments</h3>
        <button
          onClick={onSegmentAdd}
          className="flex items-center gap-1 px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div ref={containerRef} className="relative h-16 overflow-x-auto">
        <div className="relative h-12" style={{ width: totalWidth }}>
          {segments.map((segment) => {
            const start = segment.startTime ?? 0;
            const end = segment.endTime ?? segment.duration;
            const left = start * PIXELS_PER_SECOND;
            const width = (end - start) * PIXELS_PER_SECOND;

            return (
              <div
                key={segment.id}
                className="absolute top-0 h-full bg-primary/20 border-2 border-primary rounded"
                style={{ left, width }}
              >
                <div className="flex items-center justify-between h-full px-2">
                  <span className="text-xs font-medium truncate">
                    {segment.id}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSegmentRemove?.(segment.id);
                      }}
                      className="p-1 hover:bg-destructive/20 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div
                  className="absolute left-0 top-0 w-2 h-full bg-primary/50 cursor-w-resize"
                  onPointerDown={(e) => handlePointerDown(e, segment.id, "left")}
                />
                <div
                  className="absolute right-0 top-0 w-2 h-full bg-primary/50 cursor-e-resize"
                  onPointerDown={(e) => handlePointerDown(e, segment.id, "right")}
                />
              </div>
            );
          })}

          <div
            className="absolute top-0 w-0.5 h-full bg-red-500 pointer-events-none"
            style={{ left: currentPosition }}
          />
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Total: {totalDuration.toFixed(1)}s | {segments.length} segments
      </div>
    </div>
  );
}