/**
 * text-renderer.ts — Builds FFmpeg drawtext filter strings for text overlays.
 *
 * Each EditorClip of type 'text' has text_content and text_style that define
 * the visual appearance. This module converts those into FFmpeg drawtext
 * filter parameters.
 *
 * Security:
 *  - User text is escaped via escapeFFmpegText() to prevent filter injection.
 *  - Font file paths are validated against a whitelist directory.
 *  - Only safe characters are allowed in color strings.
 *
 * Unicode support:
 *  - Cyrillic, CJK, emoji, and RTL text are handled natively by libfreetype
 *    (used by FFmpeg drawtext) as long as the font file contains the glyphs.
 *  - The default font (Inter) supports Latin + Cyrillic.
 *
 * Timing:
 *  - enable='between(t,start,end)' controls when the text is visible.
 *  - Timing is relative to the composited timeline, not the source clip.
 *
 * Positioning:
 *  - x/y are relative to the output canvas dimensions.
 *  - Alignment keywords (center, left, right) are converted to FFmpeg expressions.
 */

import type { EditorClip } from '../types.js';
import { escapeFFmpegText } from './utils.js';
import { logger } from '../logger.js';

// Default font directory — mounted in Docker container
const DEFAULT_FONT_DIR = process.env['FONT_DIR'] ?? '/usr/share/fonts/truetype';
const DEFAULT_FONT = 'Inter-Bold.ttf';

// ── Text Style Interface ────────────────────────────────────────────────────

interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: string;
  fontFile?: string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
  backgroundPadding?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowColor?: string;
  lineSpacing?: number;
  letterSpacing?: number;
  opacity?: number;
}

// ── Main Builder ────────────────────────────────────────────────────────────

/**
 * Builds an FFmpeg drawtext filter string for a text clip.
 *
 * @param clip - EditorClip of type 'text' with text_content and text_style.
 * @param projectWidth - Output canvas width in pixels.
 * @param projectHeight - Output canvas height in pixels.
 * @returns FFmpeg filter string, e.g. "drawtext=text='Hello':fontfile=..."
 *          Returns null if clip has no text content.
 */
export function buildTextOverlay(
  clip: EditorClip,
  projectWidth: number,
  projectHeight: number,
): string | null {
  if (!clip.text_content || clip.type !== 'text') {
    return null;
  }

  const style = (clip.text_style ?? {}) as TextStyle;
  const escapedText = escapeFFmpegText(clip.text_content);
  const params: string[] = [];

  // ── Text content ──────────────────────────────────────────────────
  params.push(`text='${escapedText}'`);

  // ── Font ──────────────────────────────────────────────────────────
  const fontFile = resolveFontPath(style.fontFile ?? style.fontFamily);
  params.push(`fontfile='${fontFile}'`);

  // Font size — clamped to sane range
  const fontSize = clampInt(style.fontSize ?? 48, 8, 500);
  params.push(`fontsize=${fontSize}`);

  // Font color with optional alpha
  const fontColor = validateColor(style.fontColor ?? 'white');
  params.push(`fontcolor=${fontColor}`);

  // ── Positioning ───────────────────────────────────────────────────
  const transform = clip.transform ?? {};
  const posX = typeof transform['x'] === 'number' ? transform['x'] as number : null;
  const posY = typeof transform['y'] === 'number' ? transform['y'] as number : null;

  // Horizontal position
  if (posX !== null) {
    // posX is a pixel offset from the project coordinate system
    params.push(`x=${Math.round(posX)}`);
  } else {
    // Use alignment-based positioning
    const align = style.align ?? 'center';
    params.push(`x=${buildXExpression(align)}`);
  }

  // Vertical position
  if (posY !== null) {
    params.push(`y=${Math.round(posY)}`);
  } else {
    const vAlign = style.verticalAlign ?? 'middle';
    params.push(`y=${buildYExpression(vAlign)}`);
  }

  // ── Timing ────────────────────────────────────────────────────────
  // Enable between clip start and end on the timeline
  const startSec = clip.start_ms / 1000;
  const endSec = (clip.start_ms + clip.duration_ms) / 1000;
  params.push(`enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})'`);

  // ── Border / Outline ──────────────────────────────────────────────
  const borderWidth = clampInt(style.borderWidth ?? 0, 0, 20);
  if (borderWidth > 0) {
    params.push(`borderw=${borderWidth}`);
    const borderColor = validateColor(style.borderColor ?? 'black');
    params.push(`bordercolor=${borderColor}`);
  }

  // ── Shadow ────────────────────────────────────────────────────────
  const shadowX = clampInt(style.shadowX ?? 0, -50, 50);
  const shadowY = clampInt(style.shadowY ?? 0, -50, 50);
  if (shadowX !== 0 || shadowY !== 0) {
    params.push(`shadowx=${shadowX}`);
    params.push(`shadowy=${shadowY}`);
    const shadowColor = validateColor(style.shadowColor ?? 'black@0.5');
    params.push(`shadowcolor=${shadowColor}`);
  }

  // ── Background Box ────────────────────────────────────────────────
  if (style.backgroundColor) {
    params.push('box=1');
    const boxColor = validateColor(style.backgroundColor);
    params.push(`boxcolor=${boxColor}`);
    const boxPadding = clampInt(style.backgroundPadding ?? 5, 0, 50);
    params.push(`boxborderw=${boxPadding}`);
  }

  // ── Line Spacing ──────────────────────────────────────────────────
  if (style.lineSpacing && style.lineSpacing !== 0) {
    params.push(`line_spacing=${clampInt(style.lineSpacing, -20, 50)}`);
  }

  return `drawtext=${params.join(':')}`;
}

/**
 * Builds drawtext filters for multiple text clips, chained together.
 * Returns a combined filter string with proper stream labeling.
 *
 * Example output for 2 text clips:
 *   [in]drawtext=...[txt0];[txt0]drawtext=...[out]
 *
 * @param clips - Array of text clips
 * @param projectWidth - Output width
 * @param projectHeight - Output height
 * @param inputLabel - Input stream label (e.g., 'vcomp')
 * @param outputLabel - Output stream label (e.g., 'vtxt')
 * @returns Filter chain string, or null if no text clips
 */
export function buildTextOverlayChain(
  clips: EditorClip[],
  projectWidth: number,
  projectHeight: number,
  inputLabel: string,
  outputLabel: string,
): string | null {
  const textClips = clips.filter((c) => c.type === 'text' && c.text_content);

  if (textClips.length === 0) return null;

  // Sort by start time for deterministic rendering order
  const sorted = [...textClips].sort((a, b) => a.start_ms - b.start_ms);

  const filters: string[] = [];
  let prevLabel = inputLabel;

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i]!;
    const isLast = i === sorted.length - 1;
    const currentLabel = isLast ? outputLabel : `txt${i}`;

    const drawtext = buildTextOverlay(clip, projectWidth, projectHeight);
    if (!drawtext) continue;

    filters.push(`[${prevLabel}]${drawtext}[${currentLabel}]`);
    prevLabel = currentLabel;
  }

  if (filters.length === 0) return null;

  return filters.join(';\n');
}

// ── Font Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a font name or path to an absolute font file path.
 *
 * Security:
 *  - Font paths are restricted to DEFAULT_FONT_DIR.
 *  - Path traversal attempts (../) are blocked.
 *  - Falls back to DEFAULT_FONT if resolution fails.
 */
function resolveFontPath(fontInput?: string): string {
  if (!fontInput) {
    return `${DEFAULT_FONT_DIR}/${DEFAULT_FONT}`;
  }

  // Block path traversal
  if (fontInput.includes('..') || fontInput.startsWith('/')) {
    logger.warn({ event: 'font_path_traversal_blocked', fontInput });
    return `${DEFAULT_FONT_DIR}/${DEFAULT_FONT}`;
  }

  // If it looks like a filename, resolve relative to font dir
  if (/^[\w\-. ]+\.(ttf|otf|woff2?)$/i.test(fontInput)) {
    return `${DEFAULT_FONT_DIR}/${fontInput}`;
  }

  // Font family name → map to a known font file
  const fontMap: Record<string, string> = {
    'inter': 'Inter-Bold.ttf',
    'inter-bold': 'Inter-Bold.ttf',
    'inter-regular': 'Inter-Regular.ttf',
    'arial': 'Arial.ttf',
    'roboto': 'Roboto-Bold.ttf',
    'roboto-bold': 'Roboto-Bold.ttf',
    'montserrat': 'Montserrat-Bold.ttf',
    'montserrat-bold': 'Montserrat-Bold.ttf',
    'opensans': 'OpenSans-Bold.ttf',
    'open-sans': 'OpenSans-Bold.ttf',
    'playfair': 'PlayfairDisplay-Bold.ttf',
    'bebas': 'BebasNeue-Regular.ttf',
    'impact': 'Impact.ttf',
    'courier': 'CourierNew.ttf',
  };

  const normalised = fontInput.toLowerCase().replace(/\s+/g, '-');
  const resolved = fontMap[normalised];

  if (resolved) {
    return `${DEFAULT_FONT_DIR}/${resolved}`;
  }

  logger.warn({ event: 'unknown_font_family', fontInput, fallback: DEFAULT_FONT });
  return `${DEFAULT_FONT_DIR}/${DEFAULT_FONT}`;
}

// ── Positioning Expressions ─────────────────────────────────────────────────

/**
 * Builds FFmpeg expression for horizontal text position.
 *
 * In FFmpeg drawtext:
 *  - w = video width, tw = text width
 *  - (w-tw)/2 = centered
 *  - 20 = left margin
 *  - w-tw-20 = right aligned with margin
 */
function buildXExpression(align: string): string {
  switch (align) {
    case 'left':
      return '20';
    case 'right':
      return '(w-tw-20)';
    case 'center':
    default:
      return '(w-tw)/2';
  }
}

/**
 * Builds FFmpeg expression for vertical text position.
 *
 * In FFmpeg drawtext:
 *  - h = video height, th = text height
 *  - (h-th)/2 = middle
 *  - 20 = top margin
 *  - h-th-20 = bottom with margin
 */
function buildYExpression(vAlign: string): string {
  switch (vAlign) {
    case 'top':
      return '20';
    case 'bottom':
      return '(h-th-20)';
    case 'middle':
    default:
      return '(h-th)/2';
  }
}

// ── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validates a color string for FFmpeg.
 * Accepts: 'white', 'black', '#FF0000', 'red@0.5' (with alpha), '0xRRGGBB'
 *
 * Security: Only allows alphanumeric, #, @, and dot characters.
 */
function validateColor(input: string): string {
  const trimmed = input.trim();

  // Allow named colors, hex, and alpha notation
  if (/^[\w#@.]+$/.test(trimmed)) {
    return trimmed;
  }

  logger.warn({ event: 'invalid_color_value', input });
  return 'white';
}

function clampInt(value: number | undefined, min: number, max: number): number {
  const v = value ?? min;
  return Math.max(min, Math.min(max, Math.round(v)));
}
