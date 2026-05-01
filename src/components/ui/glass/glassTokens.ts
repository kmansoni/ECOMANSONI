/**
 * Дизайн-токены liquid-glass / aurora — эталон взят из src/pages/auth/theme.ts.
 * Используются всеми "v2"-разделами (feed, reels, chats, profile, calls), чтобы
 * новый UI выглядел в едином стиле с экраном входа/регистрации.
 */
import { useCallback, useMemo, useState } from "react";

export type GlassTheme = "dark" | "light";

export type GlassTokens = {
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  glassCard: string;
  glassCardShadow: string;
  glassCardSoft: string;
  glassInput: string;
  pillSurface: string;
  pillActive: string;
  inputSurface: string;
  inputFocusRing: string;
  divider: string;
  iconBtn: string;
  progressDotActive: string;
  progressDotIdle: string;
  badgeChip: string;
  radiusLg: string;
  radiusFull: string;
  spaceLg: string;
  glassPrimaryGradient: string;
  glowBrand: string;
};

export const BRAND_GRADIENT = "linear-gradient(135deg,#0096c7 0%,#00b4d8 40%,#00c896 100%)";
export const BRAND_TEXT_GRADIENT = "linear-gradient(135deg,#00b4d8 0%,#00c896 50%,#4fd080 100%)";
export const BRAND_HALO_DARK =
  "bg-gradient-to-br from-cyan-500/20 via-teal-500/15 to-emerald-400/20";
export const BRAND_HALO_LIGHT =
  "bg-gradient-to-br from-cyan-300/30 via-teal-300/25 to-emerald-200/30";

export function useGlassTheme(initial: GlassTheme = "dark") {
  const [theme, setTheme] = useState<GlassTheme>(initial);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, setTheme, toggle };
}

export function useGlassTokens(theme: GlassTheme): GlassTokens {
  const isDark = theme === "dark";
  return useMemo(
    () => ({
      isDark,
      textPrimary: isDark ? "text-white" : "text-slate-900",
      textSecondary: isDark ? "text-slate-400" : "text-slate-500",
      textMuted: isDark ? "text-slate-500" : "text-slate-400",
      textFaint: isDark ? "text-white/40" : "text-slate-400",
      glassCard: isDark
        ? "bg-[linear-gradient(140deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] border-white/20"
        : "bg-[linear-gradient(140deg,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] border-white/80 backdrop-blur-2xl",
      glassCardShadow: isDark
        ? "shadow-[0_30px_80px_-20px_rgba(10,8,40,0.6)]"
        : "shadow-[0_30px_80px_-20px_rgba(79,70,229,0.25)]",
      glassCardSoft: isDark
        ? "bg-white/[0.05] border-white/10"
        : "bg-white/70 border-slate-900/[0.06]",
      pillSurface: isDark
        ? "bg-white/[0.06] border-white/15 hover:bg-white/[0.12]"
        : "bg-white/70 border-slate-900/10 hover:bg-white",
      pillActive: isDark
        ? "bg-white/[0.14] border-white/40 shadow-[0_10px_40px_-10px_rgba(0,180,216,0.5)]"
        : "bg-white border-teal-500/40 shadow-[0_10px_40px_-10px_rgba(0,180,216,0.35)]",
      inputSurface: isDark
        ? "bg-white/[0.06] border-white/15"
        : "bg-white/85 border-slate-900/10",
      inputFocusRing: isDark
        ? "shadow-[0_0_0_3px_rgba(0,180,216,0.3)] border-white/40"
        : "shadow-[0_0_0_3px_rgba(0,180,216,0.2)] border-teal-500/50",
      divider: isDark ? "bg-white/15" : "bg-slate-900/10",
      iconBtn: isDark
        ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
        : "border-slate-900/10 bg-white/70 text-slate-800 hover:bg-white",
      progressDotActive: isDark ? "bg-white" : "bg-teal-600",
      progressDotIdle: isDark ? "bg-white/25" : "bg-slate-900/15",
      badgeChip: isDark
        ? "border-white/15 text-white/50"
        : "border-slate-900/10 text-slate-500 bg-white/60",
      glassInput: isDark
        ? "bg-white/[0.06] border-white/15"
        : "bg-white/85 border-slate-900/10",
      radiusLg: "rounded-2xl",
      radiusFull: "rounded-full",
      spaceLg: "gap-8",
      glassPrimaryGradient: BRAND_GRADIENT,
      glowBrand: isDark
        ? "shadow-[0_12px_40px_-8px_rgba(0,180,216,0.45)]"
        : "shadow-[0_12px_40px_-8px_rgba(0,180,216,0.25)]",
    }),
    [isDark],
  );
}
