/**
 * transition-engine.ts — FFmpeg xfade transition builder for video clip transitions.
 *
 * FFmpeg xfade filter supports 40+ transition types. This module:
 *  1. Validates transition type against the known set.
 *  2. Calculates offset (start time of transition in the concat timeline).
 *  3. Builds filter_complex strings for both video (xfade) and audio (acrossfade).
 *  4. Executes the transition pipeline producing a single output file.
 *
 * Architecture:
 *  - Transitions are applied pair-wise: clip[n] → clip[n+1].
 *  - For N clips with transitions between each, the compositor calls
 *    buildTransition() iteratively, reducing the chain.
 *  - Audio crossfade is always applied alongside video xfade to avoid
 *    audible pops at transition boundaries.
 *
 * Timing model:
 *  - offset = duration of first clip - transition duration
 *  - The first clip plays for `offset` seconds before the transition begins.
 *  - During transition, both clips overlap for `duration` seconds.
 *  - Total output = clip1_duration + clip2_duration - transition_duration.
 *
 * Edge cases:
 *  - If transition duration ≥ first clip duration → clamped to clip_duration - 0.1s
 *  - If transition duration < 0.1s → no transition applied (hard cut)
 *  - If either clip has no audio → audio crossfade is skipped
 */

import path from 'node:path';
import { FFmpegPipeline } from './ffmpeg-pipeline.js';
import { getMediaInfo, type MediaInfo } from './utils.js';
import { logger } from '../logger.js';

// ── Supported Transitions ───────────────────────────────────────────────────

/**
 * Complete set of FFmpeg xfade transitions.
 * Validated at build time — unsupported types fall back to 'fade'.
 */
export const SUPPORTED_TRANSITIONS = new Set([
  'fade',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'circlecrop',
  'rectcrop',
  'distance',
  'fadeblack',
  'fadewhite',
  'radial',
  'smoothleft',
  'smoothright',
  'smoothup',
  'smoothdown',
  'circleopen',
  'circleclose',
  'vertopen',
  'vertclose',
  'horzopen',
  'horzclose',
  'dissolve',
  'pixelize',
  'diagtl',
  'diagtr',
  'diagbl',
  'diagbr',
  'hlslice',
  'hrslice',
  'vuslice',
  'vdslice',
  'coverleft',
  'coverright',
  'coverup',
  'coverdown',
  'revealleft',
  'revealright',
  'revealup',
  'revealdown',
  'zoomin',
] as const);

export type TransitionType = typeof SUPPORTED_TRANSITIONS extends Set<infer T> ? T : string;

// ── Transition Config ───────────────────────────────────────────────────────

export interface TransitionConfig {
  /** Transition type (FFmpeg xfade name) */
  type: string;
  /** Transition duration in seconds */
  duration: number;
}

// ── Main Builder ────────────────────────────────────────────────────────────

/**
 * Applies a video transition between two clips using FFmpeg xfade filter.
 *
 * @param prevClipPath - Path to the first (outgoing) clip.
 * @param nextClipPath - Path to the second (incoming) clip.
 * @param transition - Transition configuration (type + duration).
 * @param outputPath - Path for the output file.
 * @returns Promise resolving to the output path on success.
 *
 * The function:
 *  1. Probes both clips for duration and audio info.
 *  2. Validates transition type and clamps duration.
 *  3. Builds xfade + acrossfade filter_complex.
 *  4. Executes the pipeline with progress tracking.
 */
export async function buildTransition(
  prevClipPath: string,
  nextClipPath: string,
  transition: TransitionConfig,
  outputPath: string,
): Promise<string> {
  // 1. Probe both clips
  const [prevInfo, nextInfo] = await Promise.all([
    getMediaInfo(prevClipPath),
    getMediaInfo(nextClipPath),
  ]);

  // 2. Validate and clamp transition
  const transitionType = validateTransitionType(transition.type);
  const transitionDuration = clampTransitionDuration(
    transition.duration,
    prevInfo.duration,
    nextInfo.duration,
  );

  // If transition is too short, just return a hard cut (concat)
  if (transitionDuration < 0.1) {
    logger.info({
      event: 'transition_skip_too_short',
      duration: transitionDuration,
      prevClip: path.basename(prevClipPath),
      nextClip: path.basename(nextClipPath),
    });
    return buildHardCut(prevClipPath, nextClipPath, outputPath, prevInfo, nextInfo);
  }

  // 3. Calculate offset
  const offset = Math.max(0, prevInfo.duration - transitionDuration);

  // 4. Build filter_complex
  const pipeline = new FFmpegPipeline();
  pipeline.addInput(prevClipPath);
  pipeline.addInput(nextClipPath);

  // Video xfade
  pipeline.addFilter(
    `[0:v][1:v]xfade=transition=${transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[vout]`,
  );

  // Audio crossfade (only if both clips have audio)
  if (prevInfo.hasAudio && nextInfo.hasAudio) {
    pipeline.addFilter(
      `[0:a][1:a]acrossfade=d=${transitionDuration.toFixed(3)}:c1=tri:c2=tri[aout]`,
    );
    pipeline.addMap('[vout]');
    pipeline.addMap('[aout]');
  } else if (prevInfo.hasAudio) {
    // Only first clip has audio — pad with silence for second clip's duration
    pipeline.addMap('[vout]');
    pipeline.addMap('0:a');
  } else if (nextInfo.hasAudio) {
    // Only second clip has audio
    pipeline.addMap('[vout]');
    pipeline.addMap('1:a');
  } else {
    // No audio at all
    pipeline.addMap('[vout]');
  }

  const expectedDuration = prevInfo.duration + nextInfo.duration - transitionDuration;
  pipeline.setDuration(expectedDuration);

  pipeline.setOutput(outputPath, {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    outputOptions: [
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-b:a', '192k',
    ],
  });

  logger.info({
    event: 'transition_apply',
    type: transitionType,
    duration: transitionDuration,
    offset,
    prevClip: path.basename(prevClipPath),
    nextClip: path.basename(nextClipPath),
  });

  await pipeline.run();

  return outputPath;
}

// ── Chain Transition Builder ────────────────────────────────────────────────

/**
 * Builds xfade filter_complex segments for multiple clips in a chain.
 *
 * This is used by the compositor to create a single filter_complex that
 * applies transitions sequentially without intermediate files.
 *
 * For N clips with transitions, the filter graph looks like:
 *   [0:v][1:v]xfade=...[xf0]; [xf0][2:v]xfade=...[xf1]; ...
 *
 * Returns:
 *  - videoFilters: array of filter strings
 *  - audioFilters: array of audio crossfade strings
 *  - outputVideoLabel: label of the final video stream
 *  - outputAudioLabel: label of the final audio stream
 *  - totalDuration: expected total duration after all transitions
 */
export function buildTransitionChain(
  clipDurations: number[],
  transitions: (TransitionConfig | null)[],
): {
  videoFilters: string[];
  audioFilters: string[];
  outputVideoLabel: string;
  outputAudioLabel: string;
  totalDuration: number;
} {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  if (clipDurations.length === 0) {
    return {
      videoFilters: [],
      audioFilters: [],
      outputVideoLabel: '',
      outputAudioLabel: '',
      totalDuration: 0,
    };
  }

  if (clipDurations.length === 1) {
    return {
      videoFilters: [],
      audioFilters: [],
      outputVideoLabel: '[0:v]',
      outputAudioLabel: '[0:a]',
      totalDuration: clipDurations[0]!,
    };
  }

  let cumulativeOffset = 0;
  let prevVideoLabel = '0:v';
  let prevAudioLabel = '0:a';
  let totalDuration = clipDurations[0]!;

  for (let i = 1; i < clipDurations.length; i++) {
    const transConfig = transitions[i - 1] ?? null;
    const prevDuration = i === 1 ? clipDurations[0]! : totalDuration;
    const nextDuration = clipDurations[i]!;

    const isLast = i === clipDurations.length - 1;
    const videoOutLabel = isLast ? 'vxf' : `xf${i - 1}`;
    const audioOutLabel = isLast ? 'axf' : `axf${i - 1}`;

    if (transConfig && transConfig.duration >= 0.1) {
      const transType = validateTransitionType(transConfig.type);
      const transDuration = clampTransitionDuration(
        transConfig.duration,
        prevDuration,
        nextDuration,
      );

      const offset = totalDuration - transDuration;

      // Video xfade
      videoFilters.push(
        `[${prevVideoLabel}][${i}:v]xfade=transition=${transType}:duration=${transDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${videoOutLabel}]`,
      );

      // Audio crossfade
      audioFilters.push(
        `[${prevAudioLabel}][${i}:a]acrossfade=d=${transDuration.toFixed(3)}:c1=tri:c2=tri[${audioOutLabel}]`,
      );

      totalDuration = totalDuration + nextDuration - transDuration;
    } else {
      // No transition — concat
      videoFilters.push(
        `[${prevVideoLabel}][${i}:v]concat=n=2:v=1:a=0[${videoOutLabel}]`,
      );
      audioFilters.push(
        `[${prevAudioLabel}][${i}:a]concat=n=2:v=0:a=1[${audioOutLabel}]`,
      );

      totalDuration = totalDuration + nextDuration;
    }

    prevVideoLabel = videoOutLabel;
    prevAudioLabel = audioOutLabel;
  }

  return {
    videoFilters,
    audioFilters,
    outputVideoLabel: `[${prevVideoLabel}]`,
    outputAudioLabel: `[${prevAudioLabel}]`,
    totalDuration,
  };
}

// ── Hard Cut (Concat) ───────────────────────────────────────────────────────

/**
 * Simple concatenation of two clips without any transition effect.
 * Used as fallback when transition duration is too short.
 */
async function buildHardCut(
  prevClipPath: string,
  nextClipPath: string,
  outputPath: string,
  prevInfo: MediaInfo,
  nextInfo: MediaInfo,
): Promise<string> {
  const pipeline = new FFmpegPipeline();
  pipeline.addInput(prevClipPath);
  pipeline.addInput(nextClipPath);

  const hasAudio = prevInfo.hasAudio || nextInfo.hasAudio;

  if (hasAudio) {
    pipeline.addFilter('[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[vout][aout]');
    pipeline.addMap('[vout]');
    pipeline.addMap('[aout]');
  } else {
    pipeline.addFilter('[0:v][1:v]concat=n=2:v=1:a=0[vout]');
    pipeline.addMap('[vout]');
  }

  pipeline.setDuration(prevInfo.duration + nextInfo.duration);
  pipeline.setOutput(outputPath, {
    videoCodec: 'libx264',
    audioCodec: hasAudio ? 'aac' : undefined,
    outputOptions: ['-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p'],
  });

  await pipeline.run();
  return outputPath;
}

// ── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validates transition type against the supported set.
 * Returns 'fade' as fallback for unknown types.
 */
function validateTransitionType(type: string): string {
  const normalised = type.toLowerCase().trim();
  if (SUPPORTED_TRANSITIONS.has(normalised as TransitionType)) {
    return normalised;
  }
  logger.warn({ event: 'unknown_transition_type', type, fallback: 'fade' });
  return 'fade';
}

/**
 * Clamps transition duration to valid range:
 *  - Minimum: 0.1s (anything shorter is meaningless)
 *  - Maximum: min(prevDuration, nextDuration) - 0.1s
 *    (must leave at least 0.1s of each clip visible)
 */
function clampTransitionDuration(
  duration: number,
  prevDuration: number,
  nextDuration: number,
): number {
  const maxAllowed = Math.min(prevDuration, nextDuration) - 0.1;
  return Math.max(0, Math.min(duration, maxAllowed));
}
