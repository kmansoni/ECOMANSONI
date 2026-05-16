import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Custom theme provider that replaces next-themes.
 * next-themes had a bug where matchMedia listener fired on resize,
 * causing theme to reset unexpectedly.
 *
 * This implementation:
 *   - Reads/writes localStorage key "theme"
 *   - Applies class to <html> immediately on state change
 *   - Does NOT use matchMedia — user selection is the single source of truth
 *   - Supports values: "light" | "dark"
 */

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme | ((prev: Theme) => Theme)) => void;
  resolvedTheme: Theme;
  themes: Theme[];
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "theme";
const DEFAULT_THEME: Theme = "dark";

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // localStorage unavailable (private mode, etc.)
  }
  return DEFAULT_THEME;
}

function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // silently ignore localStorage errors
  }
}

function applyThemeToDOM(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

/**
 * ThemeProvider — must wrap <App />, ideally after the synchronous
 * bootstrap in main.tsx already applied the initial class.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialise from localStorage (or default) on first mount.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Keep DOM in sync whenever React state changes.
  useEffect(() => {
    applyThemeToDOM(theme);
    writeStoredTheme(theme);
  }, [theme]);

  // Listen for cross-tab changes via "storage" event.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      if (next === "light" || next === "dark") {
        setThemeState(next);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setTheme = useCallback(
    (next: Theme | ((prev: Theme) => Theme)) => {
      setThemeState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        applyThemeToDOM(resolved);
        writeStoredTheme(resolved);
        return resolved;
      });
    },
    []
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme: theme,
      themes: ["light", "dark"],
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * useTheme — drop-in replacement for next-themes' hook.
 * Returns an object compatible with the expected shape in the codebase.
 */
export function useTheme(): {
  theme: Theme | undefined;
  resolvedTheme: Theme | undefined;
  setTheme: (theme: Theme) => void;
  themes: Theme[];
} {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return {
    theme: ctx.theme,
    resolvedTheme: ctx.resolvedTheme,
    setTheme: ctx.setTheme,
    themes: ctx.themes,
  };
}

export type { Theme };
