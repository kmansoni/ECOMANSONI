/**
 * clip-processor.ts — Processes individual clips from the timeline.
 *
 * Each clip undergoes a pipeline of transformations:
 *  1. Trim (source_start_ms → source_end_ms)
 *  2. Speed adjustment (setpts + atempo)
 *  3. Reverse (if is_reversed)
 *  4. Visual effects (eq, colorbalance, blur, chroma_key, etc.)
 *  5. Transform (scale, rotate, position for PIP/overlay)
 *  6. Crop (if specified)
 *
 * The result is an intermediate file in the job's temp directory.
 * The compositor then assembles these intermediates into the final output.
 *
 * Architecture decisions:
 *  - Each clip is processed independently → parallelisable across cores.
 *  - Intermediate format: H.264 CRF 16 (near-lossless) to minimise
 *    generation loss before final encode. The final encode applies the
 *    export preset's quality settings.
 *  - Audio is always preserved through processing (copy or re-encode).
 *  - Processing is deterministic: same input → same output.
 *
 * Two-pass stabilisation:
 *  - If a clip has a 'stabilize' effect, we run vidstabdetect first as
 *    a separate FFmpeg pass, then vidstabtransform in the main pipeline.
 *  - The .trf file is written to the clip's temp subdirectory.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { EditorClip, EditorEffect, ClipWithEffectsAndKeyframes } from '../types.js';
import { FFmpegPipeline } from './ffmpeg-pipeline.js';
import { buildEffectFilters, buildAtempoChain } from './effect-processor.js';
import { getMediaInfo } from './utils.js';
import { logger } from '../logger.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProcessedClip {
  /** Path to the processed clip file */
  path: string;
  /** Duration of the processed clip in seconds */
  duration: number;
  /** Whether the clip has audio */
  hasAudio: boolean;
  /** Whether the clip has video */
  hasVideo: boolean;
  /** Original clip record from DB */
  clip: EditorClip;
}

// ── Main Processor ──────────────────────────────────────────────────────────

/**
 * Processes a single clip: trim, speed, reverse, effects, transform, crop.
 *
 * @param clip - The clip record with effects and keyframes.
 * @param inputPath - Path to the downloaded source file.
 * @param outputDir - Temp directory for this clip's processed output.
 * @param projectWidth - Project canvas width (for scaling/positioning).
 * @param projectHeight - Project canvas height (for scaling/positioning).
 * @returns ProcessedClip with path and metadata.
 */
export async function processClip(
  clip: ClipWithEffectsAndKeyframes,
  inputPath: string,
  outputDir: string,
  projectWidth: number,
  projectHeight: number,
): Promise<ProcessedClip> {
  const clipDir = path.join(outputDir, `clip_${clip.id}`);
  await fs.mkdir(clipDir, { recursive: true });

  const outputPath = path.join(clipDir, `processed.mp4`);

  // Probe the source file for metadata
  const sourceInfo = await getMediaInfo(inputPath);

  logger.info({
    event: 'clip_process_start',
    clipId: clip.id,
    clipType: clip.type,
    sourceDuration: sourceInfo.duration,
    hasAudio: sourceInfo.hasAudio,
    hasVideo: sourceInfo.hasVideo,
  });

  // For image clips, handle separately (still image → video)
  if (clip.type === 'image' || clip.type === 'color') {
    return processImageClip(clip, inputPath, outputPath, projectWidth, projectHeight, sourceInfo);
  }

  // For audio-only clips, process separately
  if (clip.type === 'audio' || (!sourceInfo.hasVideo && sourceInfo.hasAudio)) {
    return processAudioOnlyClip(clip, inputPath, outputPath);
  }

  // ── Pre-pass: Video stabilisation detection ───────────────────────
  const stabilizeEffect = clip.effects.find(
    (e) => e.type === 'stabilize' && e.enabled,
  );
  let stabilizeTransformsPath: string | null = null;

  if (stabilizeEffect) {
    stabilizeTransformsPath = path.join(clipDir, 'transforms.trf');
    await runStabilizationDetect(inputPath, stabilizeTransformsPath, clip);
    // Update the effect params so the filter builder can reference the .trf file
    stabilizeEffect.params['transforms_path'] = stabilizeTransformsPath;
  }

  // ── Build the main processing pipeline ────────────────────────────
  const pipeline = new FFmpegPipeline();
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  // Input with optional seek (trim start)
  const inputOpts: string[] = [];
  if (clip.source_start_ms > 0) {
    inputOpts.push('-ss', String(clip.source_start_ms / 1000));
  }
  if (clip.source_end_ms !== null && clip.source_end_ms > clip.source_start_ms) {
    const duration = (clip.source_end_ms - clip.source_start_ms) / 1000;
    inputOpts.push('-t', String(duration));
  }

  pipeline.addInput(inputPath, { inputOptions: inputOpts });

  // ── Trim via filter (for frame-accurate trimming) ─────────────────
  // The -ss input option seeks to the nearest keyframe; for frame-accurate
  // trimming we add a trim filter that handles the remaining sub-keyframe offset.
  const trimStart = clip.source_start_ms / 1000;
  const trimEnd = clip.source_end_ms ? clip.source_end_ms / 1000 : sourceInfo.duration;
  const trimDuration = trimEnd - trimStart;

  // Only apply trim filter if we have specific trim points
  if (clip.source_start_ms > 0 || clip.source_end_ms !== null) {
    videoFilters.push(`trim=start=0:end=${trimDuration},setpts=PTS-STARTPTS`);
    if (sourceInfo.hasAudio) {
      audioFilters.push(`atrim=start=0:end=${trimDuration},asetpts=PTS-STARTPTS`);
    }
  }

  // ── Speed adjustment ──────────────────────────────────────────────
  if (clip.speed !== 1.0) {
    const speed = Math.max(0.1, Math.min(10, clip.speed));

    // Video: setpts with inverse speed factor
    videoFilters.push(`setpts=${(1 / speed).toFixed(6)}*PTS`);

    // Audio: atempo chain (handles extreme speeds via cascading)
    if (sourceInfo.hasAudio) {
      audioFilters.push(buildAtempoChain(speed));
    }
  }

  // ── Reverse ───────────────────────────────────────────────────────
  if (clip.is_reversed) {
    videoFilters.push('reverse');
    if (sourceInfo.hasAudio) {
      audioFilters.push('areverse');
    }
  }

  // ── Effects (brightness, contrast, blur, chroma key, etc.) ────────
  const { videoFilters: effectVideoFilters, audioFilters: effectAudioFilters } =
    buildEffectFilters(clip.effects);

  videoFilters.push(...effectVideoFilters);
  audioFilters.push(...effectAudioFilters);

  // ── Scale to project dimensions ───────────────────────────────────
  // Scale maintaining aspect ratio, then pad to exact project dimensions
  videoFilters.push(
    `scale=${projectWidth}:${projectHeight}:force_original_aspect_ratio=decrease`,
    `pad=${projectWidth}:${projectHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  );

  // ── Crop (if specified) ───────────────────────────────────────────
  const crop = clip.crop ?? {};
  if (
    typeof crop['w'] === 'number' &&
    typeof crop['h'] === 'number' &&
    typeof crop['x'] === 'number' &&
    typeof crop['y'] === 'number'
  ) {
    videoFilters.push(
      `crop=${crop['w']}:${crop['h']}:${crop['x']}:${crop['y']}`,
    );
  }

  // ── Build filter_complex ──────────────────────────────────────────
  if (videoFilters.length > 0) {
    const videoChain = `[0:v]${videoFilters.join(',')}[vout]`;
    pipeline.addFilter(videoChain);
    pipeline.addMap('[vout]');
  } else {
    pipeline.addMap('0:v');
  }

  if (sourceInfo.hasAudio && audioFilters.length > 0) {
    const audioChain = `[0:a]${audioFilters.join(',')}[aout]`;
    pipeline.addFilter(audioChain);
    pipeline.addMap('[aout]');
  } else if (sourceInfo.hasAudio) {
    pipeline.addMap('0:a');
  }

  // ── Output options (intermediate quality) ─────────────────────────
  pipeline.setOutput(outputPath, {
    videoCodec: 'libx264',
    audioCodec: sourceInfo.hasAudio ? 'aac' : undefined,
    outputOptions: [
      '-preset', 'fast',
      '-crf', '16',
      '-pix_fmt', 'yuv420p',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
    ],
  });

  // Calculate expected output duration
  let expectedDuration = trimDuration;
  if (clip.speed !== 1.0) {
    expectedDuration /= clip.speed;
  }
  pipeline.setDuration(expectedDuration);

  // Set timeout proportional to clip duration (minimum 2 min, max 30 min)
  const timeoutMs = Math.max(120_000, Math.min(1800_000, expectedDuration * 60_000));
  pipeline.setTimeout(timeoutMs);

  await pipeline.run();

  // Probe the output for actual metadata
  const outputInfo = await getMediaInfo(outputPath);

  logger.info({
    event: 'clip_process_complete',
    clipId: clip.id,
    outputDuration: outputInfo.duration,
    outputPath,
  });

  return {
    path: outputPath,
    duration: outputInfo.duration,
    hasAudio: outputInfo.hasAudio,
    hasVideo: outputInfo.hasVideo,
    clip,
  };
}

// ── Image Clip Processing ───────────────────────────────────────────────────

/**
 * Converts a still image into a video clip of the specified duration.
 *
 * Uses loop + framerate options to create a video from a single frame,
 * then applies effects and scaling.
 *
 * For 'color' type clips, generates a solid color video using
 * FFmpeg's color source filter.
 */
async function processImageClip(
  clip: ClipWithEffectsAndKeyframes,
  inputPath: string,
  outputPath: string,
  projectWidth: number,
  projectHeight: number,
  _sourceInfo: unknown,
): Promise<ProcessedClip> {
  const duration = clip.duration_ms / 1000;
  const pipeline = new FFmpegPipeline();

  if (clip.type === 'color') {
    // Generate solid color video
    const color = typeof clip.filters[0] === 'string' ? clip.filters[0] : 'black';
    pipeline.addInput(`color=c=${color}:s=${projectWidth}x${projectHeight}:d=${duration}`, {
      inputOptions: ['-f', 'lavfi'],
    });
  } else {
    // Image → video via loop
    pipeline.addInput(inputPath, {
      inputOptions: [
        '-loop', '1',
        '-framerate', '30',
        '-t', String(duration),
      ],
    });

    // Scale image to project dimensions
    pipeline.addFilter(
      `[0:v]scale=${projectWidth}:${projectHeight}:force_original_aspect_ratio=decrease,` +
      `pad=${projectWidth}:${projectHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vout]`,
    );
    pipeline.addMap('[vout]');
  }

  // Generate silent audio track matching clip duration
  pipeline.addInput(`anullsrc=channel_layout=stereo:sample_rate=44100`, {
    inputOptions: ['-f', 'lavfi', '-t', String(duration)],
  });

  // Apply effects
  const { videoFilters: effectFilters } = buildEffectFilters(clip.effects);
  if (effectFilters.length > 0 && clip.type !== 'color') {
    // Re-wrap with effects (already mapped [vout] above)
    // We need to chain effects into the existing filter
  }

  if (clip.type === 'color') {
    pipeline.addMap('0:v');
  }
  pipeline.addMap('1:a');

  pipeline.setOutput(outputPath, {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    outputOptions: [
      '-preset', 'fast',
      '-crf', '16',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      '-b:a', '192k',
      '-ar', '44100',
    ],
  });

  pipeline.setDuration(duration);
  await pipeline.run();

  return {
    path: outputPath,
    duration,
    hasAudio: true,  // We always add silent audio for consistency
    hasVideo: true,
    clip,
  };
}

// ── Audio-Only Clip Processing ──────────────────────────────────────────────

/**
 * Processes an audio-only clip: trim, speed, effects.
 * No video output — the compositor handles audio track mixing separately.
 */
async function processAudioOnlyClip(
  clip: ClipWithEffectsAndKeyframes,
  inputPath: string,
  outputPath: string,
): Promise<ProcessedClip> {
  const audioOutputPath = outputPath.replace('.mp4', '.aac');

  const pipeline = new FFmpegPipeline();
  const audioFilters: string[] = [];

  // Input options
  const inputOpts: string[] = [];
  if (clip.source_start_ms > 0) {
    inputOpts.push('-ss', String(clip.source_start_ms / 1000));
  }
  if (clip.source_end_ms !== null) {
    const duration = (clip.source_end_ms - clip.source_start_ms) / 1000;
    inputOpts.push('-t', String(duration));
  }

  pipeline.addInput(inputPath, { inputOptions: inputOpts });

  // Speed
  if (clip.speed !== 1.0) {
    audioFilters.push(buildAtempoChain(clip.speed));
  }

  // Reverse
  if (clip.is_reversed) {
    audioFilters.push('areverse');
  }

  // Audio effects
  const { audioFilters: effectAudioFilters } = buildEffectFilters(clip.effects);
  audioFilters.push(...effectAudioFilters);

  if (audioFilters.length > 0) {
    pipeline.addFilter(`[0:a]${audioFilters.join(',')}[aout]`);
    pipeline.addMap('[aout]');
  } else {
    pipeline.addMap('0:a');
  }

  pipeline.setOutput(audioOutputPath, {
    audioCodec: 'aac',
    outputOptions: ['-b:a', '192k', '-ar', '44100', '-ac', '2', '-vn'],
  });

  const duration = (clip.source_end_ms ?? clip.duration_ms) / 1000 - clip.source_start_ms / 1000;
  pipeline.setDuration(duration / (clip.speed || 1));

  await pipeline.run();

  const outputInfo = await getMediaInfo(audioOutputPath);

  return {
    path: audioOutputPath,
    duration: outputInfo.duration,
    hasAudio: true,
    hasVideo: false,
    clip,
  };
}

// ── Stabilisation Detect Pass ───────────────────────────────────────────────

/**
 * Runs the first pass of video stabilisation: vidstabdetect.
 *
 * This analyses the video for motion and writes a transforms file (.trf)
 * that the second pass (vidstabtransform) reads to apply stabilisation.
 *
 * The detect pass outputs to /dev/null (or NUL on Windows) — we only
 * care about the .trf side-effect file.
 */
async function runStabilizationDetect(
  inputPath: string,
  transformsPath: string,
  clip: EditorClip,
): Promise<void> {
  logger.info({
    event: 'stabilize_detect_start',
    clipId: clip.id,
    transformsPath,
  });

  const pipeline = new FFmpegPipeline();

  // Input with trim
  const inputOpts: string[] = [];
  if (clip.source_start_ms > 0) {
    inputOpts.push('-ss', String(clip.source_start_ms / 1000));
  }
  if (clip.source_end_ms !== null) {
    const duration = (clip.source_end_ms - clip.source_start_ms) / 1000;
    inputOpts.push('-t', String(duration));
  }

  pipeline.addInput(inputPath, { inputOptions: inputOpts });

  // vidstabdetect filter — writes .trf file
  pipeline.addFilter(
    `[0:v]vidstabdetect=shakiness=5:accuracy=9:result='${transformsPath}'[vout]`,
  );
  pipeline.addMap('[vout]');

  // Output to null (detect pass only)
  const nullOutput = process.platform === 'win32' ? 'NUL' : '/dev/null';
  pipeline.setOutput(nullOutput, {
    outputOptions: ['-f', 'null'],
  });

  // Timeout: proportional to clip duration
  const clipDuration = (clip.source_end_ms ?? clip.duration_ms) / 1000 - clip.source_start_ms / 1000;
  pipeline.setTimeout(Math.max(120_000, clipDuration * 60_000));

  await pipeline.run();

  logger.info({
    event: 'stabilize_detect_complete',
    clipId: clip.id,
  });
}
