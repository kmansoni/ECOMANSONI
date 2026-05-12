/**
 * @file src/components/reels/ReelGlassTokens.ts
 * @description Liquid-glass токены для Reels — единый стиль с AuthPage.
 * Включает: glassCard, glow, ripple, progress, overlay токены.
 */
import { useMemo } from 'react';
import type { GlassTheme } from '@/components/ui/glass/glassTokens';

/** Расширенные токены для Reels */
export type ReelGlassTokens = {
  /** Фон Reels (чёрный с aurora) */
  reelBackground: string;
  /** Glass-карточка sidebar */
  glassCard: string;
  /** Glass-card shadow */
  glassCardShadow: string;
  /** Glass-soft для вторичных элементов */
  glassSoft: string;
  /** Glass-input для полей ввода */
  glassInput: string;
  /** Glass-overlay для gradient overlays */
  glassOverlay: string;
  /** Glow для активных элементов */
  glowActive: string;
  /** Glow для brand акцентов */
  glowBrand: string;
  /** Ripple эффект */
  rippleColor: string;
  /** Progress bar */
  progressBar: string;
  /** Progress buffer */
  progressBuffer: string;
  /** Pill surface */
  pillSurface: string;
  /** Pill active */
  pillActive: string;
  /** Icon button */
  iconBtn: string;
  /** Icon button active */
  iconBtnActive: string;
  /** Bottom sheet */
  bottomSheet: string;
  /** Bottom sheet backdrop */
  bottomSheetBackdrop: string;
  /** Follow button */
  followBtn: string;
  /** Verified badge */
  verifiedBadge: string;
  /** Counter text */
  counterText: string;
  /** Gradient overlay */
  gradientOverlay: string;
  /** Author avatar ring */
  avatarRing: string;
  /** Close button */
  closeBtn: string;
  /** Share option */
  shareOption: string;
  /** Comment item */
  commentItem: string;
  /** Reaction emoji */
  reactionEmoji: string;
  /** Tab indicator */
  tabIndicator: string;
  /** Tab text */
  tabText: string;
  /** Tab text active */
  tabTextActive: string;
  /** Stories bar */
  storiesBar: string;
  /** Story avatar ring */
  storyRing: string;
  /** Story avatar ring seen */
  storyRingSeen: string;
  /** Loading skeleton */
  skeleton: string;
  /** Error state */
  errorState: string;
  /** Empty state */
  emptyState: string;
  /** Aurora orb colors */
  auroraColors: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  /** Is dark mode */
  isDark: boolean;
};

const AURORA_COLORS_DARK = {
  primary: 'rgba(0, 180, 216, 0.15)',
  secondary: 'rgba(0, 200, 150, 0.12)',
  tertiary: 'rgba(180, 0, 216, 0.10)',
};

const AURORA_COLORS_LIGHT = {
  primary: 'rgba(0, 180, 216, 0.08)',
  secondary: 'rgba(0, 200, 150, 0.06)',
  tertiary: 'rgba(180, 0, 216, 0.05)',
};

export function useReelGlassTokens(theme: GlassTheme = 'dark'): ReelGlassTokens {
  const isDark = theme === 'dark';

  return useMemo<ReelGlassTokens>(() => ({
    isDark,

    /** Reels background — тёмный с subtle aurora */
    reelBackground: isDark
      ? 'bg-[#050508]'
      : 'bg-gradient-to-b from-slate-100 to-white',

    /** Glass card — основной контейнер */
    glassCard: isDark
      ? 'bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] border-white/15 backdrop-blur-2xl'
      : 'bg-[linear-gradient(145deg,rgba(255,255,255,0.85),rgba(255,255,255,0.65))] border-white/60 backdrop-blur-2xl',

    /** Glass card shadow */
    glassCardShadow: isDark
      ? 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]'
      : 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]',

    /** Glass soft — вторичные элементы */
    glassSoft: isDark
      ? 'bg-white/[0.04] border-white/10 backdrop-blur-xl'
      : 'bg-white/60 border-white/40 backdrop-blur-xl',

    /** Glass input — поля ввода */
    glassInput: isDark
      ? 'bg-white/[0.06] border-white/15 text-white placeholder:text-white/40'
      : 'bg-white/80 border-white/50 text-slate-900 placeholder:text-slate-400',

    /** Glass overlay — gradient от края */
    glassOverlay: isDark
      ? 'bg-gradient-to-t from-black/70 via-black/20 to-transparent'
      : 'bg-gradient-to-t from-black/60 via-black/10 to-transparent',

    /** Glow active — при взаимодействии */
    glowActive: isDark
      ? 'shadow-[0_0_20px_rgba(255,255,255,0.25)]'
      : 'shadow-[0_0_20px_rgba(0,180,216,0.3)]',

    /** Glow brand — accent цвета */
    glowBrand: isDark
      ? 'shadow-[0_8px_32px_-8px_rgba(0,180,216,0.4)]'
      : 'shadow-[0_8px_32px_-8px_rgba(0,180,216,0.25)]',

    /** Ripple color */
    rippleColor: isDark
      ? 'rgba(255,255,255,0.15)'
      : 'rgba(0,180,216,0.2)',

    /** Progress bar */
    progressBar: isDark
      ? 'bg-white/90'
      : 'bg-teal-500',

    /** Progress buffer */
    progressBuffer: isDark
      ? 'bg-white/30'
      : 'bg-teal-300/50',

    /** Pill surface */
    pillSurface: isDark
      ? 'bg-white/[0.06] border-white/15 hover:bg-white/[0.12] active:bg-white/[0.18]'
      : 'bg-white/70 border-white/40 hover:bg-white active:bg-white/90',

    /** Pill active */
    pillActive: isDark
      ? 'bg-white/[0.14] border-white/40 shadow-[0_10px_40px_-10px_rgba(0,180,216,0.5)]'
      : 'bg-white border-teal-500/40 shadow-[0_10px_40px_-10px_rgba(0,180,216,0.35)]',

    /** Icon button base */
    iconBtn: isDark
      ? 'bg-white/[0.06] border-white/15 text-white hover:bg-white/[0.14] active:bg-white/[0.20]'
      : 'bg-white/70 border-white/40 text-slate-800 hover:bg-white active:bg-white/90',

    /** Icon button active */
    iconBtnActive: isDark
      ? 'bg-white/[0.18] border-white/30 shadow-[0_8px_24px_-4px_rgba(0,180,216,0.4)]'
      : 'bg-white border-teal-500/40 shadow-[0_8px_24px_-4px_rgba(0,180,216,0.2)]',

    /** Bottom sheet */
    bottomSheet: isDark
      ? 'bg-[linear-gradient(180deg,rgba(30,30,35,0.98),rgba(20,20,25,0.99))] border-t border-white/10 backdrop-blur-3xl'
      : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,252,0.99))] border-t border-slate-200/50 backdrop-blur-3xl',

    /** Bottom sheet backdrop */
    bottomSheetBackdrop: isDark
      ? 'bg-black/50'
      : 'bg-slate-900/30',

    /** Follow button */
    followBtn: isDark
      ? 'bg-gradient-to-r from-cyan-500/80 to-teal-500/80 border-0 text-white font-semibold shadow-[0_8px_24px_-8px_rgba(0,180,216,0.5)] hover:from-cyan-500 hover:to-teal-500 active:scale-95'
      : 'bg-gradient-to-r from-teal-500 to-emerald-500 border-0 text-white font-semibold shadow-[0_8px_24px_-8px_rgba(0,180,216,0.35)] hover:from-teal-400 hover:to-emerald-400 active:scale-95',

    /** Verified badge */
    verifiedBadge: 'text-blue-400',

    /** Counter text */
    counterText: isDark
      ? 'text-white text-[11px] font-medium drop-shadow-lg'
      : 'text-slate-800 text-[11px] font-semibold drop-shadow-sm',

    /** Gradient overlay (bottom) */
    gradientOverlay: isDark
      ? 'bg-gradient-to-t from-black/80 via-black/30 to-transparent'
      : 'bg-gradient-to-t from-black/70 via-black/20 to-transparent',

    /** Author avatar ring */
    avatarRing: isDark
      ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-black/30'
      : 'ring-2 ring-teal-400/60 ring-offset-2 ring-offset-white/50',

    /** Close button */
    closeBtn: isDark
      ? 'bg-white/[0.08] hover:bg-white/[0.16] text-white/80 hover:text-white border border-white/10'
      : 'bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/50 backdrop-blur-xl',

    /** Share option */
    shareOption: isDark
      ? 'hover:bg-white/[0.08] active:scale-[0.98]'
      : 'hover:bg-slate-100/80 active:scale-[0.98]',

    /** Comment item */
    commentItem: isDark
      ? 'border-b border-white/[0.06]'
      : 'border-b border-slate-100/80',

    /** Reaction emoji */
    reactionEmoji: isDark
      ? 'hover:bg-white/[0.12] active:scale-90'
      : 'hover:bg-slate-100/80 active:scale-90',

    /** Tab indicator */
    tabIndicator: isDark
      ? 'bg-gradient-to-r from-cyan-400 to-teal-400 shadow-[0_4px_20px_-4px_rgba(0,180,216,0.6)]'
      : 'bg-gradient-to-r from-teal-500 to-emerald-500 shadow-[0_4px_20px_-4px_rgba(0,180,216,0.4)]',

    /** Tab text */
    tabText: isDark
      ? 'text-white/50'
      : 'text-slate-500',

    /** Tab text active */
    tabTextActive: isDark
      ? 'text-white'
      : 'text-slate-900',

    /** Stories bar */
    storiesBar: isDark
      ? 'bg-gradient-to-b from-black/80 to-transparent'
      : 'bg-gradient-to-b from-white/90 to-transparent backdrop-blur-xl',

    /** Story avatar ring */
    storyRing: isDark
      ? 'ring-2 ring-cyan-400/70'
      : 'ring-2 ring-teal-500/70',

    /** Story avatar ring seen */
    storyRingSeen: isDark
      ? 'ring-2 ring-slate-600/50'
      : 'ring-2 ring-slate-300/60',

    /** Loading skeleton */
    skeleton: isDark
      ? 'bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 animate-shimmer'
      : 'bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-shimmer',

    /** Error state */
    errorState: 'text-zinc-400',

    /** Empty state */
    emptyState: 'text-zinc-500',

    /** Aurora orb colors */
    auroraColors: isDark ? AURORA_COLORS_DARK : AURORA_COLORS_LIGHT,
  }), [isDark]);
}

/** Spring bounce config для анимаций */
export const REEL_SPRING_BOUNCE = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 15,
};

/** Spring smooth config */
export const REEL_SPRING_SMOOTH = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 25,
};

/** Transition durations */
export const REEL_TRANSITION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
};
