/**
 * constants.ts — Дефолтные значения, пресеты и конфигурация видеоредактора.
 */

import type {
  AspectRatio,
  TextStyle,
  ClipTransform,
  EffectType,
  BlendMode,
} from './types';

// ── Aspect Ratios ─────────────────────────────────────────────────────────

export interface AspectRatioPreset {
  value: AspectRatio;
  label: string;
  width: number;
  height: number;
}

export const DEFAULT_ASPECT_RATIOS: AspectRatioPreset[] = [
  { value: '9:16', label: 'Вертикальное (9:16)', width: 1080, height: 1920 },
  { value: '16:9', label: 'Горизонтальное (16:9)', width: 1920, height: 1080 },
  { value: '1:1', label: 'Квадрат (1:1)', width: 1080, height: 1080 },
  { value: '4:5', label: 'Портрет (4:5)', width: 1080, height: 1350 },
  { value: '21:9', label: 'Ультраширокое (21:9)', width: 2560, height: 1080 },
];

// ── FPS ───────────────────────────────────────────────────────────────────

export const DEFAULT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const;
export const DEFAULT_FPS = 30;

// ── Clip / Timeline constraints ───────────────────────────────────────────

export const MIN_CLIP_DURATION_MS = 100;
export const MAX_CLIP_DURATION_MS = 600_000; // 10 минут
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 10;
export const DEFAULT_VOLUME = 1;
export const DEFAULT_OPACITY = 1;

// ── Zoom levels ───────────────────────────────────────────────────────────

/** Пикселей на секунду — определяет масштаб шкалы таймлайна */
export const ZOOM_LEVELS = [10, 25, 50, 75, 100, 150, 200, 300, 500] as const;
export const DEFAULT_ZOOM_LEVEL = 100;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

// ── Snap ──────────────────────────────────────────────────────────────────

export const DEFAULT_SNAP_THRESHOLD_MS = 100;

// ── Default transforms ────────────────────────────────────────────────────

export const DEFAULT_CLIP_TRANSFORM: Readonly<ClipTransform> = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  anchor_x: 0.5,
  anchor_y: 0.5,
};

// ── Default text style ────────────────────────────────────────────────────

export const DEFAULT_TEXT_STYLE: Readonly<TextStyle> = {
  font_family: 'Inter',
  font_size: 48,
  font_weight: 600,
  color: '#FFFFFF',
  background_color: undefined,
  alignment: 'center',
  line_height: 1.2,
  letter_spacing: 0,
  shadow: { x: 2, y: 2, blur: 4, color: 'rgba(0,0,0,0.5)' },
  outline: { width: 0, color: '#000000' },
};

// ── Transition types ──────────────────────────────────────────────────────

export const TRANSITION_TYPES = [
  // Basic
  'fade',
  'dissolve',
  'crossfade',
  // Wipe directions
  'wipe_left',
  'wipe_right',
  'wipe_up',
  'wipe_down',
  'wipe_diagonal_tl',
  'wipe_diagonal_tr',
  'wipe_diagonal_bl',
  'wipe_diagonal_br',
  // Slide directions
  'slide_left',
  'slide_right',
  'slide_up',
  'slide_down',
  // Push
  'push_left',
  'push_right',
  'push_up',
  'push_down',
  // Reveal
  'circle_reveal',
  'diamond_reveal',
  'star_reveal',
  'heart_reveal',
  'rect_reveal',
  'iris_reveal',
  // 3D
  'cube_left',
  'cube_right',
  'cube_up',
  'cube_down',
  'flip_horizontal',
  'flip_vertical',
  'fold',
  'page_turn',
  // Zoom
  'zoom_in',
  'zoom_out',
  'zoom_rotate',
  // Glitch / Digital
  'glitch',
  'rgb_split',
  'pixelate',
  'static_noise',
  // Blur
  'blur',
  'radial_blur',
  'motion_blur',
  // Light
  'flash',
  'light_leak',
  // Custom
  'morph',
] as const;

export type TransitionType = (typeof TRANSITION_TYPES)[number];

// ── Effect types ──────────────────────────────────────────────────────────

export const EFFECT_TYPES: readonly EffectType[] = [
  'filter',
  'color_adjust',
  'blur',
  'chroma_key',
  'voice_effect',
  'noise_reduce',
  'speed_ramp',
  'stabilize',
  'ai_enhance',
] as const;

// ── Blend modes ───────────────────────────────────────────────────────────

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
] as const;

// ── Export presets ─────────────────────────────────────────────────────────

export interface ExportPreset {
  id: string;
  label: string;
  format: 'mp4' | 'webm' | 'mov' | 'gif';
  codec: string;
  resolution: string;
  fps: number;
  bitrate: string;
}

export const EXPORT_PRESETS: readonly ExportPreset[] = [
  {
    id: 'social-1080p',
    label: 'Соц.сети (1080p)',
    format: 'mp4',
    codec: 'h264',
    resolution: '1080p',
    fps: 30,
    bitrate: '8M',
  },
  {
    id: 'social-720p',
    label: 'Соц.сети (720p)',
    format: 'mp4',
    codec: 'h264',
    resolution: '720p',
    fps: 30,
    bitrate: '5M',
  },
  {
    id: 'hd-1080p',
    label: 'HD (1080p)',
    format: 'mp4',
    codec: 'h264',
    resolution: '1080p',
    fps: 30,
    bitrate: '12M',
  },
  {
    id: 'hd-4k',
    label: '4K Ultra HD',
    format: 'mp4',
    codec: 'h265',
    resolution: '4k',
    fps: 30,
    bitrate: '30M',
  },
  {
    id: 'web-webm',
    label: 'Web (WebM)',
    format: 'webm',
    codec: 'vp9',
    resolution: '1080p',
    fps: 30,
    bitrate: '6M',
  },
  {
    id: 'gif-480p',
    label: 'GIF (480p)',
    format: 'gif',
    codec: 'gif',
    resolution: '480p',
    fps: 15,
    bitrate: '0',
  },
  {
    id: 'prores',
    label: 'ProRes (Монтаж)',
    format: 'mov',
    codec: 'prores',
    resolution: '1080p',
    fps: 30,
    bitrate: '50M',
  },
] as const;

// ── Playback rates ────────────────────────────────────────────────────────

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

// ── Auto-save ─────────────────────────────────────────────────────────────

export const AUTO_SAVE_DEBOUNCE_MS = 2000;

// ── History ───────────────────────────────────────────────────────────────

export const MAX_UNDO_STACK_SIZE = 100;

// ── Timeline panel ────────────────────────────────────────────────────────

export const DEFAULT_BOTTOM_PANEL_HEIGHT = 300;
export const MIN_BOTTOM_PANEL_HEIGHT = 150;
export const MAX_BOTTOM_PANEL_HEIGHT = 600;

// ── Navigation seek ───────────────────────────────────────────────────────

export const SEEK_STEP_MS = 100; // Шаг при навигации стрелками
export const SEEK_STEP_LARGE_MS = 1000; // Шаг при Shift+стрелки

// ── Keyboard shortcuts ────────────────────────────────────────────────────

export interface KeyboardShortcut {
  key: string;
  modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  label: string;
  action: string;
}

export const KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcut> = {
  togglePlayback: {
    key: ' ',
    modifiers: [],
    label: 'Пробел',
    action: 'Воспроизведение / Пауза',
  },
  undo: {
    key: 'z',
    modifiers: ['ctrl'],
    label: 'Ctrl+Z',
    action: 'Отменить',
  },
  redo: {
    key: 'z',
    modifiers: ['ctrl', 'shift'],
    label: 'Ctrl+Shift+Z',
    action: 'Повторить',
  },
  delete: {
    key: 'Delete',
    modifiers: [],
    label: 'Delete',
    action: 'Удалить выбранные',
  },
  copy: {
    key: 'c',
    modifiers: ['ctrl'],
    label: 'Ctrl+C',
    action: 'Копировать',
  },
  paste: {
    key: 'v',
    modifiers: ['ctrl'],
    label: 'Ctrl+V',
    action: 'Вставить',
  },
  duplicate: {
    key: 'd',
    modifiers: ['ctrl'],
    label: 'Ctrl+D',
    action: 'Дублировать',
  },
  save: {
    key: 's',
    modifiers: ['ctrl'],
    label: 'Ctrl+S',
    action: 'Сохранить',
  },
  split: {
    key: 'b',
    modifiers: [],
    label: 'B',
    action: 'Разрезать клип',
  },
  zoomIn: {
    key: '=',
    modifiers: [],
    label: '+',
    action: 'Увеличить масштаб',
  },
  zoomOut: {
    key: '-',
    modifiers: [],
    label: '-',
    action: 'Уменьшить масштаб',
  },
  zoomToFit: {
    key: '0',
    modifiers: ['ctrl'],
    label: 'Ctrl+0',
    action: 'Уместить в экран',
  },
  deselectAll: {
    key: 'Escape',
    modifiers: [],
    label: 'Escape',
    action: 'Снять выделение',
  },
  seekLeft: {
    key: 'ArrowLeft',
    modifiers: [],
    label: '←',
    action: 'Назад',
  },
  seekRight: {
    key: 'ArrowRight',
    modifiers: [],
    label: '→',
    action: 'Вперёд',
  },
  seekLeftLarge: {
    key: 'ArrowLeft',
    modifiers: ['shift'],
    label: 'Shift+←',
    action: 'Назад (1 сек)',
  },
  seekRightLarge: {
    key: 'ArrowRight',
    modifiers: ['shift'],
    label: 'Shift+→',
    action: 'Вперёд (1 сек)',
  },
  selectAll: {
    key: 'a',
    modifiers: ['ctrl'],
    label: 'Ctrl+A',
    action: 'Выделить все',
  },
} as const;
