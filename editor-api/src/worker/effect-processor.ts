/**
 * effect-processor.ts — Builds FFmpeg filter strings from EditorEffect records.
 *
 * Each effect type maps to a specific FFmpeg filter with precise parameter
 * extraction from the effect's `params` JSON. Unknown effect types are
 * logged and skipped (no crash on unrecognised effects — forward compat).
 *
 * Filter categories:
 *  - Video filters: eq, colorbalance, boxblur, chromakey, hqdn3d, unsharp, vidstab
 *  - Audio filters: asetrate+aresample, aecho, afftfilt, anlmdn
 *
 * Security:
 *  - All numeric params are clamped to safe ranges.
 *  - String params (e.g., chroma key color) are validated as hex.
 *  - No shell expansion — all values are interpolated into FFmpeg filter strings,
 *    not shell commands (fluent-ffmpeg uses execFile).
 */

import type { EditorEffect } from '../types.js';
import { logger } from '../logger.js';

// ── Effect Filter Builders ──────────────────────────────────────────────────

/**
 * Builds an array of FFmpeg filter strings from an array of EditorEffect records.
 *
 * Returns two arrays:
 *  - videoFilters: to be applied to the video stream
 *  - audioFilters: to be applied to the audio stream
 *
 * Effects are processed in sort_order. Disabled effects are skipped.
 */
export function buildEffectFilters(effects: EditorEffect[]): {
  videoFilters: string[];
  audioFilters: string[];
} {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  const sortedEffects = [...effects]
    .filter((e) => e.enabled)
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const effect of sortedEffects) {
    try {
      const result = buildSingleEffect(effect);
      if (result.video) videoFilters.push(result.video);
      if (result.audio) audioFilters.push(result.audio);
    } catch (err) {
      logger.warn({
        event: 'effect_build_failed',
        effectId: effect.id,
        effectType: effect.type,
        err: (err as Error).message,
      });
      // Skip failed effects — don't crash the entire render
    }
  }

  return { videoFilters, audioFilters };
}

// ── Single Effect Builder ───────────────────────────────────────────────────

interface EffectResult {
  video: string | null;
  audio: string | null;
}

function buildSingleEffect(effect: EditorEffect): EffectResult {
  const p = effect.params;

  switch (effect.type) {
    case 'filter':
      return buildFilterEffect(p);

    case 'color_adjust':
      return buildColorAdjustEffect(p);

    case 'blur':
      return buildBlurEffect(p);

    case 'chroma_key':
      return buildChromaKeyEffect(p);

    case 'voice_effect':
      return buildVoiceEffect(p);

    case 'noise_reduce':
      return buildNoiseReduceEffect(p);

    case 'stabilize':
      return buildStabilizeEffect(p);

    case 'ai_enhance':
      return buildAiEnhanceEffect(p);

    case 'vignette':
      return buildVignetteEffect(p);

    case 'lut':
      return buildLutEffect(p);

    default:
      logger.warn({
        event: 'unknown_effect_type',
        effectType: effect.type,
        effectId: effect.id,
      });
      return { video: null, audio: null };
  }
}

// ── Brightness / Contrast / Saturation ──────────────────────────────────────

/**
 * FFmpeg eq filter for basic color adjustments.
 *
 * Parameters:
 *  - brightness: -1.0 to 1.0 (default 0)
 *  - contrast: 0.0 to 3.0 (default 1.0)
 *  - saturation: 0.0 to 3.0 (default 1.0)
 *  - gamma: 0.1 to 10.0 (default 1.0)
 *
 * FFmpeg: eq=brightness=0.1:contrast=1.2:saturation=1.3
 */
function buildFilterEffect(params: Record<string, unknown>): EffectResult {
  const brightness = clamp(num(params['brightness'], 0), -1, 1);
  const contrast = clamp(num(params['contrast'], 1), 0, 3);
  const saturation = clamp(num(params['saturation'], 1), 0, 3);
  const gamma = clamp(num(params['gamma'], 1), 0.1, 10);

  const parts: string[] = [];
  if (brightness !== 0) parts.push(`brightness=${brightness}`);
  if (contrast !== 1) parts.push(`contrast=${contrast}`);
  if (saturation !== 1) parts.push(`saturation=${saturation}`);
  if (gamma !== 1) parts.push(`gamma=${gamma}`);

  if (parts.length === 0) return { video: null, audio: null };

  return { video: `eq=${parts.join(':')}`, audio: null };
}

// ── Color Balance ───────────────────────────────────────────────────────────

/**
 * FFmpeg colorbalance filter for color temperature / tint adjustments.
 *
 * Parameters:
 *  - rs, gs, bs: shadow R/G/B (-1.0 to 1.0)
 *  - rm, gm, bm: midtone R/G/B (-1.0 to 1.0)
 *  - rh, gh, bh: highlight R/G/B (-1.0 to 1.0)
 *
 * FFmpeg: colorbalance=rs=0.1:gs=0:bs=-0.1:rm=0.1:gm=0:bm=-0.1
 */
function buildColorAdjustEffect(params: Record<string, unknown>): EffectResult {
  const rs = clamp(num(params['rs'], 0), -1, 1);
  const gs = clamp(num(params['gs'], 0), -1, 1);
  const bs = clamp(num(params['bs'], 0), -1, 1);
  const rm = clamp(num(params['rm'], 0), -1, 1);
  const gm = clamp(num(params['gm'], 0), -1, 1);
  const bm = clamp(num(params['bm'], 0), -1, 1);
  const rh = clamp(num(params['rh'], 0), -1, 1);
  const gh = clamp(num(params['gh'], 0), -1, 1);
  const bh = clamp(num(params['bh'], 0), -1, 1);

  const parts: string[] = [];
  if (rs !== 0) parts.push(`rs=${rs}`);
  if (gs !== 0) parts.push(`gs=${gs}`);
  if (bs !== 0) parts.push(`bs=${bs}`);
  if (rm !== 0) parts.push(`rm=${rm}`);
  if (gm !== 0) parts.push(`gm=${gm}`);
  if (bm !== 0) parts.push(`bm=${bm}`);
  if (rh !== 0) parts.push(`rh=${rh}`);
  if (gh !== 0) parts.push(`gh=${gh}`);
  if (bh !== 0) parts.push(`bh=${bh}`);

  if (parts.length === 0) return { video: null, audio: null };

  return { video: `colorbalance=${parts.join(':')}`, audio: null };
}

// ── Blur ────────────────────────────────────────────────────────────────────

/**
 * FFmpeg boxblur filter.
 *
 * Parameters:
 *  - radius: 1 to 100 (default 10)
 *  - power: 1 to 10 (default 2, number of passes)
 *
 * FFmpeg: boxblur=10:2
 */
function buildBlurEffect(params: Record<string, unknown>): EffectResult {
  const radius = clamp(Math.round(num(params['radius'], 10)), 1, 100);
  const power = clamp(Math.round(num(params['power'], 2)), 1, 10);

  return { video: `boxblur=${radius}:${power}`, audio: null };
}

// ── Chroma Key ──────────────────────────────────────────────────────────────

/**
 * FFmpeg chromakey filter for green/blue screen removal.
 *
 * Parameters:
 *  - color: hex color string (default '0x00FF00' for green)
 *  - similarity: 0.01 to 1.0 (default 0.3)
 *  - blend: 0.0 to 1.0 (default 0.1)
 *
 * FFmpeg: chromakey=color=0x00FF00:similarity=0.3:blend=0.1
 */
function buildChromaKeyEffect(params: Record<string, unknown>): EffectResult {
  const color = validateHexColor(str(params['color'], '0x00FF00'));
  const similarity = clamp(num(params['similarity'], 0.3), 0.01, 1);
  const blend = clamp(num(params['blend'], 0.1), 0, 1);

  return {
    video: `chromakey=color=${color}:similarity=${similarity}:blend=${blend}`,
    audio: null,
  };
}

// ── Voice Effects ───────────────────────────────────────────────────────────

/**
 * Audio effects for voice modification.
 *
 * Supported sub-types (params.subtype):
 *  - 'pitch': Pitch shift via asetrate + aresample
 *  - 'echo': Echo effect via aecho
 *  - 'reverb': Reverb approximation via aecho with long delay
 *  - 'robot': Vocoder-like effect via afftfilt
 *
 * Pitch shifting algorithm:
 *  asetrate changes the sample rate (stretches/compresses pitch),
 *  then aresample restores the original rate (fixing playback speed).
 *  Tempo correction is applied via atempo to maintain duration.
 *
 * Example (pitch up 1.5×):
 *   asetrate=44100*1.5,aresample=44100,atempo=0.667
 */
function buildVoiceEffect(params: Record<string, unknown>): EffectResult {
  const subtype = str(params['subtype'], 'pitch');
  const sampleRate = clamp(Math.round(num(params['sample_rate'], 44100)), 8000, 96000);

  switch (subtype) {
    case 'pitch': {
      const factor = clamp(num(params['factor'], 1.0), 0.5, 2.0);
      // After pitch shift, duration changes by 1/factor, so we need
      // atempo correction to maintain the original duration
      const tempoCorrection = 1 / factor;
      const tempoFilters = buildAtempoChain(tempoCorrection);
      return {
        video: null,
        audio: `asetrate=${sampleRate}*${factor},aresample=${sampleRate},${tempoFilters}`,
      };
    }

    case 'echo': {
      const inGain = clamp(num(params['in_gain'], 0.8), 0, 1);
      const outGain = clamp(num(params['out_gain'], 0.88), 0, 1);
      const delay = clamp(Math.round(num(params['delay'], 60)), 1, 5000);
      const decay = clamp(num(params['decay'], 0.4), 0, 1);
      return {
        video: null,
        audio: `aecho=${inGain}:${outGain}:${delay}:${decay}`,
      };
    }

    case 'reverb': {
      const inGain = clamp(num(params['in_gain'], 0.8), 0, 1);
      const outGain = clamp(num(params['out_gain'], 0.9), 0, 1);
      const delay = clamp(Math.round(num(params['delay'], 1000)), 100, 5000);
      const decay = clamp(num(params['decay'], 0.3), 0, 1);
      return {
        video: null,
        audio: `aecho=${inGain}:${outGain}:${delay}:${decay}`,
      };
    }

    case 'robot': {
      return {
        video: null,
        audio: `afftfilt=real='hypot(re,im)*cos(0)':imag='hypot(re,im)*sin(0)':win_size=512:overlap=0.75`,
      };
    }

    default:
      logger.warn({ event: 'unknown_voice_effect_subtype', subtype });
      return { video: null, audio: null };
  }
}

// ── Noise Reduction ─────────────────────────────────────────────────────────

/**
 * Noise reduction for audio and video.
 *
 * Parameters:
 *  - target: 'audio' | 'video' | 'both' (default 'both')
 *
 * Audio: anlmdn (non-local means denoising)
 *   anlmdn=s=7:p=0.002:r=0.002
 *
 * Video: hqdn3d (high-quality 3D denoiser)
 *   hqdn3d=4:3:6:4.5
 */
function buildNoiseReduceEffect(params: Record<string, unknown>): EffectResult {
  const target = str(params['target'], 'both');
  const videoStrength = clamp(num(params['video_strength'], 4), 0, 20);
  const audioStrength = clamp(num(params['audio_strength'], 7), 0, 40);

  let video: string | null = null;
  let audio: string | null = null;

  if (target === 'video' || target === 'both') {
    // hqdn3d params: luma_spatial:chroma_spatial:luma_tmp:chroma_tmp
    const ls = videoStrength;
    const cs = Math.round(ls * 0.75 * 10) / 10;
    const lt = Math.round(ls * 1.5 * 10) / 10;
    const ct = Math.round(ls * 1.125 * 10) / 10;
    video = `hqdn3d=${ls}:${cs}:${lt}:${ct}`;
  }

  if (target === 'audio' || target === 'both') {
    // anlmdn params: s=strength, p=patch, r=research
    const s = audioStrength;
    const p = 0.002;
    const r = 0.002;
    audio = `anlmdn=s=${s}:p=${p}:r=${r}`;
  }

  return { video, audio };
}

// ── Video Stabilisation ─────────────────────────────────────────────────────

/**
 * Two-pass video stabilisation via vidstab.
 *
 * This is a special case: it requires TWO FFmpeg invocations:
 *  1. vidstabdetect — analyse and write transforms file
 *  2. vidstabtransform — apply transforms
 *
 * Since the pipeline builder creates single-pass pipelines, we return
 * only the vidstabtransform filter. The caller (clip-processor) must
 * run vidstabdetect as a separate preliminary pass.
 *
 * Parameters:
 *  - smoothing: 1 to 100 (default 10)
 *  - transforms_path: path to .trf file from detect pass
 */
function buildStabilizeEffect(params: Record<string, unknown>): EffectResult {
  const smoothing = clamp(Math.round(num(params['smoothing'], 10)), 1, 100);
  const transformsPath = str(params['transforms_path'], 'transforms.trf');

  return {
    video: `vidstabtransform=input='${transformsPath}':smoothing=${smoothing}:interpol=linear`,
    audio: null,
  };
}

// ── AI Enhance (Sharpen) ────────────────────────────────────────────────────

/**
 * Sharpening via FFmpeg unsharp filter.
 *
 * Parameters:
 *  - luma_amount: -2.0 to 5.0 (default 1.0)
 *  - chroma_amount: -2.0 to 5.0 (default 0.0)
 *
 * FFmpeg: unsharp=5:5:1.0:5:5:0.0
 *   Format: lx:ly:la:cx:cy:ca
 *   lx/ly = luma matrix size (3 or 5)
 *   la = luma amount (negative = blur)
 *   cx/cy = chroma matrix size
 *   ca = chroma amount
 */
function buildAiEnhanceEffect(params: Record<string, unknown>): EffectResult {
  const lumaAmount = clamp(num(params['luma_amount'], 1.0), -2, 5);
  const chromaAmount = clamp(num(params['chroma_amount'], 0.0), -2, 5);
  const matrixSize = clamp(Math.round(num(params['matrix_size'], 5)), 3, 7);

  // Matrix size must be odd
  const ms = matrixSize % 2 === 0 ? matrixSize + 1 : matrixSize;

  return {
    video: `unsharp=${ms}:${ms}:${lumaAmount}:${ms}:${ms}:${chromaAmount}`,
    audio: null,
  };
}

// ── Vignette ────────────────────────────────────────────────────────────────

/**
 * FFmpeg vignette filter.
 *
 * Parameters:
 *  - angle: vignette angle in radians (default PI/4 ≈ 0.785)
 *
 * FFmpeg: vignette=PI/4
 */
function buildVignetteEffect(params: Record<string, unknown>): EffectResult {
  const angle = clamp(num(params['angle'], Math.PI / 4), 0, Math.PI / 2);

  return { video: `vignette=${angle}`, audio: null };
}

// ── LUT (3D Color Lookup Table) ─────────────────────────────────────────────

/**
 * FFmpeg lut3d filter for applying color grading presets.
 *
 * Parameters:
 *  - lut_path: path to .cube or .3dl file
 *
 * Security: lut_path is validated to only contain safe characters
 * and must end with .cube or .3dl extension.
 */
function buildLutEffect(params: Record<string, unknown>): EffectResult {
  const lutPath = str(params['lut_path'], '');
  if (!lutPath) return { video: null, audio: null };

  // Validate path: only alphanumeric, dash, underscore, dot, slash
  if (!/^[\w\-./]+\.(cube|3dl)$/i.test(lutPath)) {
    logger.warn({ event: 'invalid_lut_path', lutPath });
    return { video: null, audio: null };
  }

  return { video: `lut3d=${lutPath}`, audio: null };
}

// ── atempo Chain Builder ────────────────────────────────────────────────────

/**
 * Builds a chain of atempo filters for speed values outside the 0.5-2.0 range.
 *
 * FFmpeg atempo only supports 0.5 to 100.0 per instance, but for extreme
 * speed changes we chain multiple instances:
 *  - speed 4.0 → atempo=2.0,atempo=2.0
 *  - speed 0.25 → atempo=0.5,atempo=0.5
 */
export function buildAtempoChain(speed: number): string {
  if (speed <= 0) throw new Error('atempo speed must be positive');

  const filters: string[] = [];
  let remaining = speed;

  if (remaining >= 0.5 && remaining <= 100) {
    return `atempo=${remaining}`;
  }

  // Handle very slow speeds (< 0.5)
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }

  // Handle very fast speeds (> 100)
  while (remaining > 100) {
    filters.push('atempo=100.0');
    remaining /= 100;
  }

  // Add the remaining fractional adjustment
  if (remaining !== 1) {
    filters.push(`atempo=${Math.round(remaining * 1000) / 1000}`);
  }

  return filters.join(',');
}

// ── Utility Helpers ─────────────────────────────────────────────────────────

function num(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}

function str(value: unknown, defaultValue: string): string {
  if (typeof value === 'string') return value;
  return defaultValue;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validates and normalises a hex color string for FFmpeg.
 * Accepts: '#00FF00', '0x00FF00', '00FF00'
 * Returns: '0x00FF00' (FFmpeg format)
 */
function validateHexColor(input: string): string {
  let hex = input.trim();

  // Strip leading # or 0x
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);

  // Validate hex characters only
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    logger.warn({ event: 'invalid_hex_color', input });
    return '0x00FF00'; // Default to green
  }

  return `0x${hex.toUpperCase()}`;
}
