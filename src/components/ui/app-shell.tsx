/**
 * app-shell.tsx — канонические UI-примитивы для миграции страниц под
 * эталон дизайна входа (src/pages/AuthPage.tsx).
 *
 * Используют уже существующие глобальные классы из src/index.css:
 *   .glass-window, .glass-input, .glass-popover,
 *   .glass-primary-btn, .glass-secondary-btn
 *
 * Scope: визуальный слой. Никакой бизнес-логики, никаких хуков состояния.
 * Все компоненты полностью контролируемы родителем.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  AppPageShell                                                       */
/*  Фуллскрин-контейнер с safe-area и auth-эталонной aurora-подсветкой.*/
/* ------------------------------------------------------------------ */

export interface AppPageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Центрировать ли контент по вертикали (для auth/лендинг экранов). */
  centered?: boolean;
  /** Добавить декоративные auth-аура пятна на фон. */
  aurora?: boolean;
}

export const AppPageShell = React.forwardRef<HTMLDivElement, AppPageShellProps>(
  ({ className, children, centered = false, aurora = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative min-h-[100dvh] w-full overflow-x-hidden",
          centered && "flex items-center justify-center",
          className,
        )}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          ...(props.style ?? {}),
        }}
        {...props}
      >
        {aurora ? <AuroraBackdrop /> : null}
        <div className="relative z-10 w-full">{children}</div>
      </div>
    );
  },
);
AppPageShell.displayName = "AppPageShell";

/* ------------------------------------------------------------------ */
/*  AuroraBackdrop                                                     */
/*  Декоративные пятна в стиле AuthPage. Reduced-motion безопасны.     */
/* ------------------------------------------------------------------ */

function AuroraBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute -top-24 left-[12%] h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl dark:bg-fuchsia-500/20" />
      <div className="absolute top-1/3 right-[8%] h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/20" />
      <div className="absolute bottom-[-6rem] left-1/3 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-500/20" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AppGlassCard                                                       */
/*  Основная стеклянная карточка. Соответствует auth-эталону.          */
/* ------------------------------------------------------------------ */

export interface AppGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const AppGlassCard = React.forwardRef<HTMLDivElement, AppGlassCardProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Эталонная геометрия: radius + padding как у AuthPage.
          "glass-window relative rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-7 lg:p-8 backdrop-blur-2xl overflow-hidden",
          className,
        )}
        {...props}
      >
        {/* Декоративные внутренние линии как у auth-карточки */}
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]">
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <div className="absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
        </div>
        <div className="relative">{children}</div>
      </div>
    );
  },
);
AppGlassCard.displayName = "AppGlassCard";

/* ------------------------------------------------------------------ */
/*  AppGlassInput                                                      */
/*  Input в стиле auth-эталона на базе .glass-input.                   */
/* ------------------------------------------------------------------ */

export interface AppGlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const AppGlassInput = React.forwardRef<HTMLInputElement, AppGlassInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "glass-input w-full h-12 rounded-2xl px-4 text-[15px] outline-none transition-all",
          className,
        )}
        {...props}
      />
    );
  },
);
AppGlassInput.displayName = "AppGlassInput";

/* ------------------------------------------------------------------ */
/*  AppPrimaryButton / AppSecondaryButton                              */
/*  Кнопки в стиле auth-эталона.                                       */
/* ------------------------------------------------------------------ */

type ButtonBase = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const AppPrimaryButton = React.forwardRef<HTMLButtonElement, ButtonBase>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "glass-primary-btn relative h-12 sm:h-14 w-full rounded-2xl px-5 font-semibold",
          "flex items-center justify-center gap-2",
          "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
AppPrimaryButton.displayName = "AppPrimaryButton";

export const AppSecondaryButton = React.forwardRef<HTMLButtonElement, ButtonBase>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "glass-secondary-btn relative h-12 w-full rounded-2xl px-5 font-medium",
          "flex items-center justify-center gap-2 backdrop-blur-xl",
          "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
AppSecondaryButton.displayName = "AppSecondaryButton";
