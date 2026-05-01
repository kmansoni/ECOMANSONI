import { type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AuroraBackground } from "./AuroraBackground";
import { useGlassTheme, useGlassTokens, type GlassTheme } from "./glassTokens";

interface GlassPageShellProps {
  children: (ctx: { tokens: ReturnType<typeof useGlassTokens>; theme: GlassTheme }) => ReactNode;
  /** Скрыть переключатель темы (например, на экране звонка). */
  hideThemeToggle?: boolean;
  /** Если задано, шелл займёт всю высоту вьюпорта — иначе min-h. */
  fullHeight?: boolean;
  /** Дополнительный класс на корневой контейнер. */
  className?: string;
  /** Стартовая тема ("dark" по умолчанию, как в AuthPage). */
  initialTheme?: GlassTheme;
}

/**
 * Универсальный page-shell в стиле AuthPage:
 *  - aurora-фон,
 *  - переключатель Moon/Sun сверху-справа,
 *  - брендовый шрифт Manrope,
 *  - safe-area top padding,
 *  - render-prop отдаёт tokens наружу.
 */
export function GlassPageShell({
  children,
  hideThemeToggle = false,
  fullHeight = false,
  className,
  initialTheme = "dark",
}: GlassPageShellProps) {
  const { theme, toggle } = useGlassTheme(initialTheme);
  const tokens = useGlassTokens(theme);

  return (
    <div
      className={cn(
        "relative w-full overflow-x-hidden font-[Manrope,system-ui,sans-serif]",
        fullHeight ? "h-[100dvh] overflow-y-auto" : "min-h-[100dvh]",
        tokens.textPrimary,
        theme === "dark" ? "dark" : "",
        className,
      )}
      style={{
        colorScheme: theme,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <AuroraBackground theme={theme} />

      {!hideThemeToggle && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Переключить тему"
          className={cn(
            "fixed z-30 right-3 top-3 sm:right-5 sm:top-5",
            "flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-xl transition-colors",
            tokens.iconBtn,
          )}
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="block"
            >
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
      )}

      <div className="relative z-10">{children({ tokens, theme })}</div>
    </div>
  );
}
