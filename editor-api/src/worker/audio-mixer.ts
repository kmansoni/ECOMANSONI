/**
 * audio-mixer.ts — Mixes multiple audio tracks into a single stereo audio file.
 *
 * Architecture:
 *  - Each audio track from the timeline is trimmed, volume-adjusted, and
 *    positioned in time using adelay.
 *  - All tracks are mixed using amix with duration=longest.
 *  - Loudness normalisation (EBU R128) is applied as the final step.
 *  - Fade in/out transitions are applied per-track before mixing.
 *
 * Timing model:
 *  - Each clip has start_ms (position on timeline) and duration_ms.
 *  - adelay offsets the clip to the correct position.
 *  - The mix output duration matches the video duration.
 *
 * Loudness normalisation:
 *  - Target: -14 LUFS (Spotify/YouTube standard)
 *  - True peak: -2 dBTP (headroom for lossy encoding)
 *  - LRA: 11 LU (dynamic range)
 *  - Uses FFmpeg loudnorm filter (two-pass measured internally).
 *
 * Edge cases:
 *  - Zero audio tracks → generate silent audio file matching video duration.
 *  - Single audio track → skip amix (unnecessary overhead).
 *  - Clips extending beyond video duration → trimmed to video duration.
 */

import path from 'node:path';
import { FFmpegPipeline } from './ffmpeg-pipeline.js';
import type { ProcessedClip } from './clip-processor.js';
import type { EditorTrack } from '../types.js';
import { logger } from '../logger.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProcessedAudioTrack {
  /** Track record from DB */
  track: EditorTrack;
  /** Processed audio clips belonging to this track */
  clips: ProcessedClip[];
}

// ── Main Mixer ──────────────────────────────────────────────────────────────

/**
 * Mixes all audio tracks into a single stereo audio file.
 *
 * @param audioTracks - Array of audio tracks with their processed clips.
 * @param videoDuration - Total video duration in seconds (audio is trimmed to match).
 * @param outputPath - Path for the mixed audio output file.
 * @returns Path to the mixed audio file.
 */
export async function mixAudio(
  audioTracks: ProcessedAudioTrack[],
  videoDuration: number,
  outputPath: string,
): Promise<string> {
  // Flatten all audio clips from all tracks
  const allAudioClips = collectAudioClips(audioTracks, videoDuration);

  if (allAudioClips.length === 0) {
    logger.info({ event: 'audio_mix_generate_silence', duration: videoDuration });
    return generateSilentAudio(videoDuration, outputPath);
  }

  if (allAudioClips.length === 1) {
    const clip = allAudioClips[0]!;
    logger.info({ event: 'audio_mix_single_track', clipId: clip.processed.clip.id });
    return processSingleAudioClip(clip, videoDuration, outputPath);
  }

  logger.info({
    event: 'audio_mix_start',
    trackCount: audioTracks.length,
    clipCount: allAudioClips.length,
    videoDuration,
  });

  // Build the multi-track mixing pipeline
  const pipeline = new FFmpegPipeline();
  const filterParts: string[] = [];
  const mixInputLabels: string[] = [];

  // Add each audio clip as a separate input
  for (let i = 0; i < allAudioClips.length; i++) {
    const { processed, track, timelineStartSec, timelineEndSec } = allAudioClips[i]!;
    const clipDuration = Math.min(
      processed.duration,
      timelineEndSec - timelineStartSec,
    );

    pipeline.addInput(processed.path);

    const label = `a${i}`;
    const filters: string[] = [];

    // Trim to the portion we need
    filters.push(`atrim=start=0:end=${clipDuration.toFixed(3)}`);
    filters.push('asetpts=PTS-STARTPTS');

    // Volume adjustment from track + clip levels
    const trackVolume = Math.max(0, Math.min(2, track.volume));
    const clipVolume = Math.max(0, Math.min(2, processed.clip.volume));
    const combinedVolume = trackVolume * clipVolume;
    if (combinedVolume !== 1.0) {
      filters.push(`volume=${combinedVolume.toFixed(3)}`);
    }

    // Fade in/out from clip transitions
    const fadeIn = parseFadeDuration(processed.clip.transition_in);
    const fadeOut = parseFadeDuration(processed.clip.transition_out);

    if (fadeIn > 0) {
      filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
    }
    if (fadeOut > 0) {
      const fadeOutStart = Math.max(0, clipDuration - fadeOut);
      filters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`);
    }

    // adelay to position clip on the timeline (milliseconds)
    const delayMs = Math.round(timelineStartSec * 1000);
    if (delayMs > 0) {
      filters.push(`adelay=${delayMs}|${delayMs}`);
    }

    // Ensure consistent format before mixing
    filters.push('aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo');

    filterParts.push(`[${i}:a]${filters.join(',')}[${label}]`);
    mixInputLabels.push(`[${label}]`);
  }

  // amix all streams
  const mixInputStr = mixInputLabels.join('');
  filterParts.push(
    `${mixInputStr}amix=inputs=${allAudioClips.length}:duration=longest:dropout_transition=0:normalize=0[mixed]`,
  );

  // Trim to video duration
  filterParts.push(
    `[mixed]atrim=start=0:end=${videoDuration.toFixed(3)},asetpts=PTS-STARTPTS[trimmed]`,
  );

  // Loudness normalisation (EBU R128)
  // Target: -14 LUFS, True Peak: -2 dBTP, LRA: 11 LU
  filterParts.push(
    `[trimmed]loudnorm=I=-14:TP=-2:LRA=11:print_format=summary[aout]`,
  );

  pipeline.addFilters(filterParts);
  pipeline.addMap('[aout]');

  pipeline.setOutput(outputPath, {
    audioCodec: 'aac',
    outputOptions: [
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-vn',                 // No video in audio output
    ],
  });

  pipeline.setDuration(videoDuration);

  // Timeout: generous for complex mixing (proportional to clip count × duration)
  const timeoutMs = Math.max(
    120_000,
    allAudioClips.length * videoDuration * 10_000,
  );
  pipeline.setTimeout(Math.min(timeoutMs, 1800_000));

  await pipeline.run();

  logger.info({
    event: 'audio_mix_complete',
    clipCount: allAudioClips.length,
    outputPath,
  });

  return outputPath;
}

// ── Silent Audio Generator ──────────────────────────────────────────────────

/**
 * Generates a silent stereo audio file of the specified duration.
 * Used when no audio tracks are present (pure video export).
 */
async function generateSilentAudio(
  durationSec: number,
  outputPath: string,
): Promise<string> {
  const pipeline = new FFmpegPipeline();

  pipeline.addInput(`anullsrc=channel_layout=stereo:sample_rate=44100`, {
    inputOptions: ['-f', 'lavfi', '-t', String(durationSec.toFixed(3))],
  });

  pipeline.addMap('0:a');

  pipeline.setOutput(outputPath, {
    audioCodec: 'aac',
    outputOptions: [
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-vn',
    ],
  });

  pipeline.setDuration(durationSec);
  await pipeline.run();

  return outputPath;
}

// ── Single Clip Processing ──────────────────────────────────────────────────

/**
 * Processes a single audio clip with volume, fade, and loudness normalisation.
 * Optimised path: no amix needed for single clip.
 */
async function processSingleAudioClip(
  clipInfo: AudioClipInfo,
  videoDuration: number,
  outputPath: string,
): Promise<string> {
  const { processed, track, timelineStartSec, timelineEndSec } = clipInfo;
  const clipDuration = Math.min(
    processed.duration,
    timelineEndSec - timelineStartSec,
  );

  const pipeline = new FFmpegPipeline();
  pipeline.addInput(processed.path);

  const filters: string[] = [];

  // Trim
  filters.push(`atrim=start=0:end=${clipDuration.toFixed(3)}`);
  filters.push('asetpts=PTS-STARTPTS');

  // Volume
  const volume = Math.max(0, Math.min(2, track.volume * processed.clip.volume));
  if (volume !== 1.0) {
    filters.push(`volume=${volume.toFixed(3)}`);
  }

  // Fades
  const fadeIn = parseFadeDuration(processed.clip.transition_in);
  const fadeOut = parseFadeDuration(processed.clip.transition_out);
  if (fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  }
  if (fadeOut > 0) {
    const fadeOutStart = Math.max(0, clipDuration - fadeOut);
    filters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  }

  // Delay if clip doesn't start at t=0
  const delayMs = Math.round(timelineStartSec * 1000);
  if (delayMs > 0) {
    filters.push(`adelay=${delayMs}|${delayMs}`);
  }

  // Pad/trim to exact video duration
  filters.push('aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo');
  // Note: apad extends audio to minimum duration, atrim then caps it
  filters.push(`apad=whole_dur=${videoDuration.toFixed(3)}`);
  filters.push(`atrim=start=0:end=${videoDuration.toFixed(3)}`);

  // Loudness normalisation
  filters.push('loudnorm=I=-14:TP=-2:LRA=11:print_format=summary');

  pipeline.addFilter(`[0:a]${filters.join(',')}[aout]`);
  pipeline.addMap('[aout]');

  pipeline.setOutput(outputPath, {
    audioCodec: 'aac',
    outputOptions: ['-b:a', '192k', '-ar', '44100', '-ac', '2', '-vn'],
  });

  pipeline.setDuration(videoDuration);
  await pipeline.run();

  return outputPath;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface AudioClipInfo {
  processed: ProcessedClip;
  track: EditorTrack;
  timelineStartSec: number;
  timelineEndSec: number;
}

/**
 * Collects and flattens all audio clips from all tracks, calculating
 * their absolute timeline positions.
 */
function collectAudioClips(
  audioTracks: ProcessedAudioTrack[],
  videoDuration: number,
): AudioClipInfo[] {
  const result: AudioClipInfo[] = [];

  for (const at of audioTracks) {
    for (const pc of at.clips) {
      if (!pc.hasAudio) continue;

      const timelineStartSec = pc.clip.start_ms / 1000;
      const timelineEndSec = Math.min(
        (pc.clip.start_ms + pc.clip.duration_ms) / 1000,
        videoDuration,
      );

      // Skip clips that are entirely beyond video duration
      if (timelineStartSec >= videoDuration) continue;

      result.push({
        processed: pc,
        track: at.track,
        timelineStartSec,
        timelineEndSec,
      });
    }
  }

  // Sort by timeline position for deterministic processing
  result.sort((a, b) => a.timelineStartSec - b.timelineStartSec);

  return result;
}

/**
 * Extracts fade duration from a transition_in or transition_out object.
 * Returns duration in seconds.
 */
function parseFadeDuration(transition: Record<string, unknown> | null): number {
  if (!transition) return 0;

  const duration = transition['duration'];
  if (typeof duration === 'number' && duration > 0) {
    return duration / 1000; // Convert ms to seconds
  }

  const durationSec = transition['duration_sec'];
  if (typeof durationSec === 'number' && durationSec > 0) {
    return durationSec;
  }

  return 0;
}
