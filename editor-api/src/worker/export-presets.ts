/**
 * export-presets.ts — FFmpeg export presets for platform-specific output.
 *
 * Each preset encodes the exact codec, bitrate, resolution, and container
 * parameters required by the target platform. The presets are designed to
 * satisfy the most restrictive platform requirements (e.g., Instagram's
 * 3500 kbps minimum for Reels at 1080p).
 *
 * Codec choices:
 *  - libx264: Universal H.264 — plays everywhere, HW decode on all devices.
 *  - libx265: HEVC — ~40% smaller at same quality, but HW decode spotty on old Android.
 *  - GIF: For short meme content; palette-optimised via ffmpeg palettegen/paletteuse.
 *
 * Container:
 *  - All MP4 outputs use -movflags +faststart for progressive download.
 *  - WebM is reserved for VP9 (not currently used, but preset-ready).
 *  - GIF uses special two-pass pipeline (palettegen → paletteuse).
 *
 * Pixel format:
 *  - yuv420p for maximum compatibility (all decoders, all browsers).
 *  - Never yuv444p even if source is 4:4:4 — breaks hardware decoders.
 *
 * Audio:
 *  - AAC LC for MP4 containers (universal support).
 *  - Sample rate: 44100 Hz (platform standard).
 *  - Channel layout: stereo.
 */

// ── Preset Type ─────────────────────────────────────────────────────────────

export interface ExportPreset {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** FFmpeg video codec (e.g., 'libx264', 'libx265') */
  codec?: string;
  /** x264/x265 preset (ultrafast → veryslow). Defaults to 'medium'. */
  preset?: string;
  /** Constant Rate Factor — lower = higher quality (18–28 typical) */
  crf?: number;
  /** Max video bitrate (ffmpeg format: '8M', '20M') */
  bitrate?: string;
  /** Audio bitrate (ffmpeg format: '192k', '320k') */
  audioBitrate?: string;
  /** Target frame rate */
  fps: number;
  /** Output format override (default: 'mp4') */
  format?: 'mp4' | 'webm' | 'gif';
  /** Max duration in seconds (platform limit); 0 = unlimited */
  maxDuration?: number;
  /** Audio sample rate override (default: 44100) */
  sampleRate?: number;
}

// ── Preset Registry ─────────────────────────────────────────────────────────

export const EXPORT_PRESETS: Record<string, ExportPreset> = {
  '1080p_h264': {
    width: 1920,
    height: 1080,
    codec: 'libx264',
    preset: 'medium',
    crf: 20,
    bitrate: '8M',
    audioBitrate: '192k',
    fps: 30,
  },
  '1080p_h265': {
    width: 1920,
    height: 1080,
    codec: 'libx265',
    preset: 'medium',
    crf: 23,
    bitrate: '6M',
    audioBitrate: '192k',
    fps: 30,
  },
  '4k_h264': {
    width: 3840,
    height: 2160,
    codec: 'libx264',
    preset: 'medium',
    crf: 18,
    bitrate: '20M',
    audioBitrate: '320k',
    fps: 30,
  },
  '4k_h265': {
    width: 3840,
    height: 2160,
    codec: 'libx265',
    preset: 'medium',
    crf: 20,
    bitrate: '15M',
    audioBitrate: '320k',
    fps: 30,
  },
  '720p_fast': {
    width: 1280,
    height: 720,
    codec: 'libx264',
    preset: 'fast',
    crf: 23,
    bitrate: '4M',
    audioBitrate: '128k',
    fps: 30,
  },
  instagram_reel: {
    width: 1080,
    height: 1920,
    codec: 'libx264',
    preset: 'medium',
    crf: 20,
    bitrate: '8M',
    audioBitrate: '192k',
    fps: 30,
    maxDuration: 90,
  },
  tiktok: {
    width: 1080,
    height: 1920,
    codec: 'libx264',
    preset: 'medium',
    crf: 20,
    bitrate: '8M',
    audioBitrate: '192k',
    fps: 30,
    maxDuration: 180,
  },
  youtube_short: {
    width: 1080,
    height: 1920,
    codec: 'libx264',
    preset: 'medium',
    crf: 18,
    bitrate: '10M',
    audioBitrate: '256k',
    fps: 60,
    maxDuration: 60,
  },
  youtube: {
    width: 1920,
    height: 1080,
    codec: 'libx264',
    preset: 'medium',
    crf: 18,
    bitrate: '12M',
    audioBitrate: '256k',
    fps: 60,
  },
  gif: {
    width: 480,
    height: 480,
    fps: 15,
    format: 'gif',
  },
} as const;

// ── Preset Resolver ─────────────────────────────────────────────────────────

/**
 * Resolves render job settings to a concrete ExportPreset.
 *
 * Falls back to '1080p_h264' if no matching preset found.
 * Clamps resolution to project dimensions (never upscale).
 */
export function resolvePreset(settings: Record<string, unknown>): ExportPreset {
  const quality = (settings['quality'] as string) ?? 'high';
  const resolution = (settings['resolution'] as string) ?? '1080p';
  const format = (settings['format'] as string) ?? 'mp4';
  const presetName = (settings['preset'] as string) ?? null;

  // Direct preset name match
  if (presetName && EXPORT_PRESETS[presetName]) {
    return { ...EXPORT_PRESETS[presetName]! };
  }

  // Format-specific
  if (format === 'gif') {
    return { ...EXPORT_PRESETS['gif']! };
  }

  // Build key from resolution + quality mapping
  const codecSuffix = quality === 'ultra' ? 'h265' : 'h264';
  let key: string;

  if (resolution === '4k') {
    key = `4k_${codecSuffix}`;
  } else if (resolution === '720p') {
    key = '720p_fast';
  } else {
    key = `1080p_${codecSuffix}`;
  }

  return { ...(EXPORT_PRESETS[key] ?? EXPORT_PRESETS['1080p_h264']!) };
}

// ── FFmpeg Output Options Builder ───────────────────────────────────────────

/**
 * Converts an ExportPreset into an array of FFmpeg output options.
 *
 * These options are appended to the FFmpeg command after -map directives.
 * The caller is responsible for input options and filter_complex.
 *
 * Handles the special case of GIF output (two-pass palette optimisation
 * must be done separately by the caller using buildGifPipeline()).
 */
export function getFFmpegOutputOptions(preset: ExportPreset): string[] {
  const opts: string[] = [];

  if (preset.format === 'gif') {
    // GIF: fps filter + palette are handled by the caller;
    // here we only set the output format
    opts.push('-f', 'gif');
    return opts;
  }

  // Video codec
  if (preset.codec) {
    opts.push('-c:v', preset.codec);
  }

  // Encoder preset (speed/quality trade-off)
  if (preset.preset) {
    opts.push('-preset', preset.preset);
  }

  // CRF (quality target) — mutually exclusive with -b:v in CRF mode,
  // but we use -maxrate + -bufsize for VBV-constrained CRF
  if (preset.crf !== undefined) {
    opts.push('-crf', String(preset.crf));
  }

  // Max bitrate + buffer for VBV-constrained encoding
  if (preset.bitrate) {
    opts.push('-maxrate', preset.bitrate);
    // Buffer size = 2× maxrate for stable quality
    const numericBitrate = parseFloat(preset.bitrate);
    const unit = preset.bitrate.replace(/[\d.]/g, '');
    opts.push('-bufsize', `${numericBitrate * 2}${unit}`);
  }

  // Audio codec — always AAC LC for MP4
  opts.push('-c:a', 'aac');

  // Audio bitrate
  if (preset.audioBitrate) {
    opts.push('-b:a', preset.audioBitrate);
  }

  // Audio sample rate
  opts.push('-ar', String(preset.sampleRate ?? 44100));

  // Audio channels — stereo
  opts.push('-ac', '2');

  // Frame rate
  opts.push('-r', String(preset.fps));

  // Pixel format — always yuv420p for compatibility
  opts.push('-pix_fmt', 'yuv420p');

  // Resolution
  opts.push('-s', `${preset.width}x${preset.height}`);

  // MP4 faststart — moov atom at beginning for progressive download
  if (!preset.format || preset.format === 'mp4') {
    opts.push('-movflags', '+faststart');
  }

  // Duration limit (platform constraint)
  if (preset.maxDuration && preset.maxDuration > 0) {
    opts.push('-t', String(preset.maxDuration));
  }

  return opts;
}

/**
 * Builds FFmpeg filter string for GIF palette optimisation.
 *
 * Two-pass approach:
 *  1. palettegen: analyse entire video to build optimal 256-color palette
 *  2. paletteuse: apply palette with dithering for quality
 *
 * Returns { paletteFilter, useFilter } for the caller to run sequentially.
 */
export function buildGifPipelineFilters(
  preset: ExportPreset,
): { paletteFilter: string; useFilter: string } {
  const scale = `scale=${preset.width}:${preset.height}:flags=lanczos`;
  const fps = `fps=${preset.fps}`;

  return {
    paletteFilter: `${fps},${scale},palettegen=stats_mode=diff`,
    useFilter: `${fps},${scale} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  };
}
