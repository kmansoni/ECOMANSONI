import { useCallback, useMemo, useState } from "react";
import type { Theme, ThemeTokens } from "./types";

export function useTheme(initial: Theme = "dark") {
  const [theme, setTheme] = useState<Theme>(initial);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}

export function useThemeTokens(theme: Theme): ThemeTokens {
  const isDark = theme === "dark";
  return useMemo(
    () => ({
      isDark,
      textPrimary: isDark ? "text-white" : "text-slate-900",
      textSecondary: isDark ? "text-white/70" : "text-slate-700",
      textMuted: isDark ? "text-white/55" : "text-slate-500",
      textFaint: isDark ? "text-white/40" : "text-slate-400",
      glassCard: isDark
        ? "bg-[linear-gradient(140deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] border-white/20"
        : "bg-[linear-gradient(140deg,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] border-white/80 backdrop-blur-2xl",
      glassCardShadow: isDark
        ? "shadow-[0_30px_80px_-20px_rgba(10,8,40,0.6)]"
        : "shadow-[0_30px_80px_-20px_rgba(79,70,229,0.25)]",
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
    }),
    [isDark],
  );
}
