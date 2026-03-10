/**
 * compositor.ts — Final compositing of all processed tracks into a single video.
 *
 * Architecture:
 *  The compositor implements a multi-track video compositing pipeline:
 *
 *  1. **Primary video track** (sort_order = 0):
 *     - All clips are concatenated with transitions via xfade.
 *     - This forms the "base canvas" of the output video.
 *
 *  2. **Secondary video tracks** (sort_order > 0, type = 'video'):
 *     - Overlaid on top of the primary track using the overlay filter.
 *     - Supports PIP (picture-in-picture) positioning via clip transform.
 *     - Timed with enable='between(t,start,end)'.
 *
 *  3. **Text tracks** (type = 'text'):
 *     - Rendered as drawtext overlays on the composited video.
 *     - Applied after all video overlay layers.
 *
 *  4. **Sticker tracks** (type = 'sticker'):
 *     - Overlaid as image overlays with timing.
 *
 *  5. **Audio mixing**:
 *     - Audio from video tracks + dedicated audio tracks are mixed via audio-mixer.
 *     - Mixed audio is combined with the composited video in the final mux step.
 *
 * Rendering strategy:
 *  - For simple projects (1 video track, no overlays):
 *    Use a single FFmpeg pass with concat + text → efficient.
 *  - For complex projects (multiple video tracks, PIP):
 *    Multi-pass: concat primary → overlay secondary → add text → mux audio.
 *    Intermediate files are H.264 CRF 16 (near-lossless) to minimise gen loss.
 *
 * The final output is produced by the render-worker which applies
 * the export preset encoding settings.
 */

import path from 'node:path';
import { FFmpegPipeline } from './ffmpeg-pipeline.js';
import { buildTransitionChain, type TransitionConfig } from './transition-engine.js';
import { buildTextOverlayChain } from './text-renderer.js';
import type { ProcessedClip } from './clip-processor.js';
import type { EditorTrack, EditorClip, EditorProject } from '../types.js';
import { logger } from '../logger.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProcessedTrack {
  track: EditorTrack;
  clips: ProcessedClip[];
}

// ── Main Compositor ─────────────────────────────────────────────────────────

/**
 * Composites all processed tracks into a single video file (without final audio).
 *
 * @param tracks - All processed tracks sorted by sort_order.
 * @param project - Project metadata (dimensions, fps, duration).
 * @param outputPath - Path for the composited video output.
 * @param onProgress - Progress callback (0-100).
 * @returns Path to the composited video file.
 */
export async function compositeTimeline(
  tracks: ProcessedTrack[],
  project: EditorProject,
  outputPath: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const videoTracks = tracks
    .filter((t) => t.track.type === 'video' && t.track.is_visible)
    .sort((a, b) => a.track.sort_order - b.track.sort_order);

  const textTracks = tracks
    .filter((t) => t.track.type === 'text' && t.track.is_visible);

  const stickerTracks = tracks
    .filter((t) => t.track.type === 'sticker' && t.track.is_visible);

  if (videoTracks.length === 0) {
    throw new Error('No video tracks to composite');
  }

  logger.info({
    event: 'composite_start',
    videoTrackCount: videoTracks.length,
    textTrackCount: textTracks.length,
    stickerTrackCount: stickerTracks.length,
    projectDuration: project.duration_ms,
  });

  // ── Step 1: Composite primary video track (concat with transitions) ───
  const primaryTrack = videoTracks[0]!;
  const primaryClips = primaryTrack.clips
    .filter((c) => c.hasVideo)
    .sort((a, b) => a.clip.sort_order - b.clip.sort_order);

  if (primaryClips.length === 0) {
    throw new Error('Primary video track has no video clips');
  }

  // Calculate transition configs from clip transition_in/transition_out
  const transitions = extractTransitions(primaryClips);
  const clipDurations = primaryClips.map((c) => c.duration);

  // For simple case: single clip, no overlays, just copy
  if (
    primaryClips.length === 1 &&
    videoTracks.length === 1 &&
    textTracks.length === 0 &&
    stickerTracks.length === 0
  ) {
    logger.info({ event: 'composite_simple_copy' });
    await simpleCopy(primaryClips[0]!.path, outputPath, project);
    onProgress(100);
    return;
  }

  // Build the compositing pipeline
  const pipeline = new FFmpegPipeline();
  const allFilters: string[] = [];

  // Add all primary track clips as inputs
  for (const clip of primaryClips) {
    pipeline.addInput(clip.path);
  }

  // Input index offset for secondary tracks
  let inputIndex = primaryClips.length;

  // ── Concat/transition primary video clips ─────────────────────────
  let videoLabel: string;
  let audioLabel: string;

  if (primaryClips.length === 1) {
    videoLabel = '0:v';
    audioLabel = '0:a';
  } else {
    const chain = buildTransitionChain(clipDurations, transitions);
    allFilters.push(...chain.videoFilters);
    allFilters.push(...chain.audioFilters);
    videoLabel = chain.outputVideoLabel.replace(/\[|\]/g, '');
    audioLabel = chain.outputAudioLabel.replace(/\[|\]/g, '');
  }

  onProgress(20);

  // ── Step 2: Overlay secondary video tracks (PIP) ──────────────────
  for (let t = 1; t < videoTracks.length; t++) {
    const secondaryTrack = videoTracks[t]!;
    const secondaryClips = secondaryTrack.clips
      .filter((c) => c.hasVideo)
      .sort((a, b) => a.clip.sort_order - b.clip.sort_order);

    for (const scl of secondaryClips) {
      pipeline.addInput(scl.path);
      const overlayIdx = inputIndex++;

      // Calculate PIP position from clip transform
      const transform = scl.clip.transform ?? {};
      const x = typeof transform['x'] === 'number' ? Math.round(transform['x'] as number) : 0;
      const y = typeof transform['y'] === 'number' ? Math.round(transform['y'] as number) : 0;
      const scale = typeof transform['scale'] === 'number' ? (transform['scale'] as number) : 1;

      // Timeline timing
      const startSec = scl.clip.start_ms / 1000;
      const endSec = (scl.clip.start_ms + scl.clip.duration_ms) / 1000;

      const newVideoLabel = `vovr${t}_${overlayIdx}`;

      // Scale the overlay clip
      const pipWidth = Math.round(project.resolution_width * scale);
      const pipHeight = Math.round(project.resolution_height * scale);

      allFilters.push(
        `[${overlayIdx}:v]scale=${pipWidth}:${pipHeight}[pip${overlayIdx}]`,
      );

      // Overlay with timing
      allFilters.push(
        `[${videoLabel}][pip${overlayIdx}]overlay=${x}:${y}:enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})'[${newVideoLabel}]`,
      );

      videoLabel = newVideoLabel;
    }
  }

  onProgress(40);

  // ── Step 3: Overlay sticker tracks ────────────────────────────────
  for (const stickerTrack of stickerTracks) {
    for (const scl of stickerTrack.clips) {
      if (!scl.hasVideo) continue;

      pipeline.addInput(scl.path);
      const stickerIdx = inputIndex++;

      const transform = scl.clip.transform ?? {};
      const x = typeof transform['x'] === 'number' ? Math.round(transform['x'] as number) : 0;
      const y = typeof transform['y'] === 'number' ? Math.round(transform['y'] as number) : 0;

      const startSec = scl.clip.start_ms / 1000;
      const endSec = (scl.clip.start_ms + scl.clip.duration_ms) / 1000;

      const newLabel = `vstk${stickerIdx}`;

      allFilters.push(
        `[${videoLabel}][${stickerIdx}:v]overlay=${x}:${y}:enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})'[${newLabel}]`,
      );

      videoLabel = newLabel;
    }
  }

  onProgress(50);

  // ── Step 4: Add text overlays ─────────────────────────────────────
  const allTextClips = textTracks.flatMap((t) =>
    t.clips.map((c) => c.clip),
  );

  if (allTextClips.length > 0) {
    const textFilterChain = buildTextOverlayChain(
      allTextClips,
      project.resolution_width,
      project.resolution_height,
      videoLabel,
      'vtxt',
    );

    if (textFilterChain) {
      allFilters.push(textFilterChain);
      videoLabel = 'vtxt';
    }
  }

  onProgress(60);

  // ── Final pipeline assembly ───────────────────────────────────────
  pipeline.addFilters(allFilters);
  pipeline.addMap(`[${videoLabel}]`);

  // Map audio from primary track (audio mixing is done separately)
  if (primaryClips.some((c) => c.hasAudio)) {
    pipeline.addMap(`[${audioLabel}]`);
  }

  // Intermediate encoding (will be re-encoded in final step with export preset)
  pipeline.setOutput(outputPath, {
    videoCodec: 'libx264',
    audioCodec: primaryClips.some((c) => c.hasAudio) ? 'aac' : undefined,
    outputOptions: [
      '-preset', 'fast',
      '-crf', '16',
      '-pix_fmt', 'yuv420p',
      '-b:a', '192k',
      '-ar', '44100',
    ],
  });

  const totalDuration = project.duration_ms / 1000;
  pipeline.setDuration(totalDuration);

  // Timeout: proportional to complexity
  const complexity = primaryClips.length + allTextClips.length + inputIndex;
  const timeoutMs = Math.max(180_000, Math.min(3600_000, totalDuration * complexity * 5_000));
  pipeline.setTimeout(timeoutMs);

  // Run with progress callback
  await pipeline.run((percent) => {
    // Map pipeline progress (0-100) to compositing phase (60-90)
    const mappedProgress = 60 + Math.round(percent * 0.3);
    onProgress(mappedProgress);
  });

  onProgress(90);

  logger.info({
    event: 'composite_complete',
    outputPath,
    inputCount: inputIndex,
    filterCount: allFilters.length,
  });
}

// ── Simple Copy (Single Clip) ───────────────────────────────────────────────

/**
 * For the simplest case: single video clip, no overlays, no text.
 * Just re-encodes to ensure consistent intermediate format.
 */
async function simpleCopy(
  inputPath: string,
  outputPath: string,
  project: EditorProject,
): Promise<void> {
  const pipeline = new FFmpegPipeline();
  pipeline.addInput(inputPath);

  // Scale to project dimensions (in case clip was processed at different size)
  pipeline.addFilter(
    `[0:v]scale=${project.resolution_width}:${project.resolution_height}:force_original_aspect_ratio=decrease,` +
    `pad=${project.resolution_width}:${project.resolution_height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vout]`,
  );

  pipeline.addMap('[vout]');
  pipeline.addMap('0:a');

  pipeline.setOutput(outputPath, {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    outputOptions: [
      '-preset', 'fast',
      '-crf', '16',
      '-pix_fmt', 'yuv420p',
      '-b:a', '192k',
    ],
  });

  pipeline.setDuration(project.duration_ms / 1000);
  await pipeline.run();
}

// ── Transition Extraction ───────────────────────────────────────────────────

/**
 * Extracts transition configs from clip transition_in/transition_out metadata.
 *
 * For N clips, returns N-1 transitions. Each transition comes from:
 *  - clip[N].transition_in (preferred), or
 *  - clip[N-1].transition_out (fallback)
 */
function extractTransitions(clips: ProcessedClip[]): (TransitionConfig | null)[] {
  const transitions: (TransitionConfig | null)[] = [];

  for (let i = 1; i < clips.length; i++) {
    const currentIn = clips[i]!.clip.transition_in;
    const prevOut = clips[i - 1]!.clip.transition_out;

    const transConfig = currentIn ?? prevOut;
    if (transConfig && typeof transConfig['type'] === 'string') {
      const duration = typeof transConfig['duration'] === 'number'
        ? transConfig['duration'] / 1000  // Convert ms to seconds
        : typeof transConfig['duration_sec'] === 'number'
          ? transConfig['duration_sec']
          : 0.5;  // Default 0.5s transition

      transitions.push({
        type: transConfig['type'] as string,
        duration,
      });
    } else {
      transitions.push(null); // No transition = hard cut
    }
  }

  return transitions;
}
