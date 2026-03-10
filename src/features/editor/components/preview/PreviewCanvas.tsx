/**
 * PreviewCanvas.tsx — Область предпросмотра видео.
 * Video + canvas overlay for text/stickers + aspect ratio maintained.
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { useUIStore } from '../../stores/ui-store';

export const PreviewCanvas = React.memo(function PreviewCanvas() {
  const project = useEditorStore((s) => s.project);
  const tracks = useEditorStore((s) => s.tracks);
  const currentTimeMs = useTimelineStore((s) => s.currentTimeMs);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const selectClip = useTimelineStore((s) => s.selectClip);
  const previewMode = useUIStore((s) => s.previewMode);
  const showSafeZones = useUIStore((s) => s.showSafeZones);
  const showGrid = useUIStore((s) => s.showGrid);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const projectWidth = project?.resolution_width ?? 1080;
  const projectHeight = project?.resolution_height ?? 1920;
  const aspectRatio = projectWidth / projectHeight;

  // Find active clips for current time
  const activeClips = useMemo(() => {
    const result: Array<{
      clipId: string;
      trackType: string;
      clip: typeof tracks[0]['clips'][0];
    }> = [];

    for (const track of tracks) {
      if (!track.is_visible) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.start_ms + clip.duration_ms;
        if (currentTimeMs >= clip.start_ms && currentTimeMs < clipEnd) {
          result.push({ clipId: clip.id, trackType: track.type, clip });
        }
      }
    }

    return result;
  }, [tracks, currentTimeMs]);

  // Get first active video clip
  const activeVideoClip = useMemo(
    () => activeClips.find((c) => c.trackType === 'video' && c.clip.source_url),
    [activeClips],
  );

  // Sync video with timeline
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoClip) return;

    const clip = activeVideoClip.clip;
    const clipLocalTimeMs = currentTimeMs - clip.start_ms + clip.source_start_ms;
    const targetTimeSec = clipLocalTimeMs / 1000;

    if (Math.abs(video.currentTime - targetTimeSec) > 0.1) {
      video.currentTime = targetTimeSec;
    }

    if (isPlaying && video.paused) {
      video.play().catch(() => { /* autoplay blocked */ });
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTimeMs, isPlaying, activeVideoClip]);

  // Draw overlay (text, stickers, safe zones)
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = projectWidth * dpr;
    canvas.height = projectHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, projectWidth, projectHeight);

    // Draw text overlays
    for (const { clip, trackType } of activeClips) {
      if (trackType === 'text' && clip.text_content && clip.text_style) {
        const style = clip.text_style;
        const x = clip.transform.x + projectWidth / 2;
        const y = clip.transform.y + projectHeight / 2;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((clip.transform.rotation * Math.PI) / 180);
        ctx.scale(clip.transform.scale, clip.transform.scale);

        // Shadow
        if (style.shadow) {
          ctx.shadowColor = style.shadow.color;
          ctx.shadowBlur = style.shadow.blur;
          ctx.shadowOffsetX = style.shadow.x;
          ctx.shadowOffsetY = style.shadow.y;
        }

        // Outline
        if (style.outline && style.outline.width > 0) {
          ctx.strokeStyle = style.outline.color;
          ctx.lineWidth = style.outline.width * 2;
          ctx.font = `${style.font_weight} ${style.font_size}px ${style.font_family}`;
          ctx.textAlign = style.alignment as CanvasTextAlign;
          ctx.textBaseline = 'middle';
          ctx.strokeText(clip.text_content, 0, 0);
        }

        // Fill
        ctx.fillStyle = style.color;
        ctx.font = `${style.font_weight} ${style.font_size}px ${style.font_family}`;
        ctx.textAlign = style.alignment as CanvasTextAlign;
        ctx.textBaseline = 'middle';
        ctx.fillText(clip.text_content, 0, 0);

        ctx.restore();
      }
    }

    // Draw safe zones
    if (showSafeZones) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      // Title safe (80%)
      const titleMarginX = projectWidth * 0.1;
      const titleMarginY = projectHeight * 0.1;
      ctx.strokeRect(titleMarginX, titleMarginY, projectWidth - titleMarginX * 2, projectHeight - titleMarginY * 2);

      // Action safe (90%)
      const actionMarginX = projectWidth * 0.05;
      const actionMarginY = projectHeight * 0.05;
      ctx.strokeRect(actionMarginX, actionMarginY, projectWidth - actionMarginX * 2, projectHeight - actionMarginY * 2);

      ctx.setLineDash([]);
    }

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.5;
      const gridSize = 40;

      for (let x = 0; x <= projectWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, projectHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= projectHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(projectWidth, y);
        ctx.stroke();
      }

      // Center crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(projectWidth / 2, 0);
      ctx.lineTo(projectWidth / 2, projectHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, projectHeight / 2);
      ctx.lineTo(projectWidth, projectHeight / 2);
      ctx.stroke();
    }
  }, [activeClips, projectWidth, projectHeight, showSafeZones, showGrid]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Check if clicked on any text/sticker overlay
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const scaleX = projectWidth / rect.width;
      const scaleY = projectHeight / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      for (const { clip, trackType, clipId } of activeClips) {
        if (trackType === 'text' || trackType === 'sticker') {
          const cx = clip.transform.x + projectWidth / 2;
          const cy = clip.transform.y + projectHeight / 2;
          const size = clip.text_style?.font_size ?? 48;
          const radius = size * clip.transform.scale;

          if (Math.abs(clickX - cx) < radius && Math.abs(clickY - cy) < radius) {
            selectClip(clipId, e.shiftKey);
            return;
          }
        }
      }
    },
    [activeClips, projectWidth, projectHeight, selectClip],
  );

  return (
    <div
      ref={containerRef}
      className="relative bg-black flex items-center justify-center overflow-hidden flex-1"
      onClick={handleCanvasClick}
      role="img"
      aria-label="Область предпросмотра видео"
    >
      <div
        className="relative"
        style={{
          aspectRatio: `${aspectRatio}`,
          maxWidth: previewMode === '100%' ? `${projectWidth}px` : '100%',
          maxHeight: previewMode === '100%' ? `${projectHeight}px` : '100%',
          width: previewMode === 'fill' ? '100%' : undefined,
          height: previewMode === 'fill' ? '100%' : undefined,
          objectFit: previewMode === 'fit' ? 'contain' : 'cover',
        }}
      >
        {/* Video layer */}
        {activeVideoClip?.clip.source_url && (
          <video
            ref={videoRef}
            src={activeVideoClip.clip.source_url}
            className="absolute inset-0 w-full h-full object-contain"
            muted
            playsInline
            aria-hidden="true"
          />
        )}

        {/* Empty state */}
        {!activeVideoClip && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <div className="text-center text-slate-600">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-sm">Нет видео для предпросмотра</p>
            </div>
          </div>
        )}

        {/* Canvas overlay */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ width: '100%', height: '100%' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
});
