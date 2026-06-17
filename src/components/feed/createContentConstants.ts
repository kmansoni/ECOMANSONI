import type { LucideIcon } from 'lucide-react';
import { Image, Camera, Film, Radio } from 'lucide-react';
import type { ContentType } from '@/hooks/useMediaEditor';

export type TabType = 'publications' | 'stories' | 'reels' | 'live';

export const TABS: Array<{ id: TabType; label: string; icon: LucideIcon; contentType: ContentType }> = [
  { id: 'publications', label: 'Публикация', icon: Image, contentType: 'post' },
  { id: 'stories', label: 'История', icon: Camera, contentType: 'story' },
  { id: 'reels', label: 'Видео Reels', icon: Film, contentType: 'reel' },
  { id: 'live', label: 'Прямой эфир', icon: Radio, contentType: 'live' },
];

export const BASE_ZOOM_LEVELS = [0.5, 1, 2, 3, 5, 8, 15] as const;

export const ZOOM_LEVELS_LABELS: Record<number, string> = {
  0.5: '0.5x', 1: '1x', 2: '2x', 3: '3x', 5: '5x', 8: '8x', 15: '15x',
};

export const RECORDING_DURATIONS = [
  { label: '30с', ms: 30_000 },
  { label: '1м', ms: 60_000 },
  { label: '3м', ms: 180_000 },
  { label: '10м', ms: 600_000 },
  { label: '15м', ms: 900_000 },
] as const;

export const REEL_EFFECT_PRESETS = [
  { id: 'none', label: 'Без эффекта' },
  { id: 'cinematic', label: 'Кино' },
  { id: 'vintage', label: 'Винтаж' },
  { id: 'vivid', label: 'Яркий' },
] as const;

export const TEXT_STORY_BACKGROUNDS = [
  { id: 'gradient-aurora', label: 'Аврора', className: 'from-slate-950 via-violet-700 to-cyan-500' },
  { id: 'sunset', label: 'Закат', className: 'from-red-950 via-orange-500 to-yellow-300' },
  { id: 'forest', label: 'Лес', className: 'from-emerald-950 via-green-600 to-lime-300' },
  { id: 'graphite', label: 'Графит', className: 'from-slate-950 via-slate-600 to-gray-900' },
] as const;

export const TEXT_STORY_FONTS = [
  { id: 'classic', label: 'Classic', className: 'font-sans' },
  { id: 'serif', label: 'Serif', className: 'font-serif' },
  { id: 'mono', label: 'Mono', className: 'font-mono' },
] as const;
