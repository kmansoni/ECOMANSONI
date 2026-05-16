/**
 * MainButton — React UI-компонент для Bottom App Bar.
 *
 * Визуальная обёртка над <button>, стилизованная как
 * Telegram Main Button (шadcn/ui + Tailwind, CSS-изоляция через .mini-app).
 */

import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

interface MainButtonProps {
  text?: string;
  color?: string;
  textColor?: string;
  hasShineEffect?: boolean;
  isActive?: boolean;
  isVisible?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Обновляет CSS-переменные на <html> для подстройки темы Telegram
 * (вызывается из useMiniApp, но может быть вызван и вручную).
 */
export function applyThemeVars(theme: Record<string, string> = {}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const map: Record<string, string> = {
    bg_color: '--color-bg',
    button_color: '--color-primary',
    button_text_color: '--color-primary-foreground',
    hint_color: '--color-muted-foreground',
    link_color: '--color-link',
    secondary_bg_color: '--color-secondary',
    header_bg_color: '--color-header-bg',
    accent_text_color: '--color-accent',
    section_bg_color: '--color-section-bg',
    section_header_text_color: '--color-section-header',
    subtitle_text_color: '--color-subtitle',
    destructive_text_color: '--color-destructive',
  };
  Object.entries(map).forEach(([key, cssVar]) => {
    const val = theme[key];
    if (val) root.style.setProperty(cssVar, val);
  });
}

export function MainButton({
  text = '',
  color,
  textColor,
  hasShineEffect = false,
  isActive = true,
  isVisible = true,
  isLoading = false,
  onClick,
  disabled,
  className,
}: MainButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const style: React.CSSProperties = {};
  if (color) style.backgroundColor = color;
  if (textColor) style.color = textColor;

  const buttonClassName = useMemo(
    () =>
      cn(
        'fixed bottom-4 left-1/2 z-[99999] -translate-x-1/2',
        'flex items-center justify-center gap-2',
        'h-12 min-w-[120px] max-w-[390px] px-8',
        'rounded-full text-base font-semibold',
        'transition-all duration-200',
        'active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        hasShineEffect && 'bg-gradient-to-r from-primary via-primary/80 to-primary',
        !color && 'bg-primary text-primary-foreground',
        !hasShineEffect && !color && 'shadow-lg shadow-primary/25',
        className,
      ),
    [className, color, hasShineEffect],
  );

  if (!isVisible) return null;

  return (
    <button
      type="button"
      ref={ref}
      onClick={isActive && !disabled ? onClick : undefined}
      disabled={disabled || !isActive || isLoading}
      className={buttonClassName}
      style={style}
      aria-label={text || 'Main Button'}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      <span className="truncate">{text}</span>

      {/* Shine overlay */}
      {hasShineEffect && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity"
          style={{
            background:
              'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)',
          }}
        />
      )}
    </button>
  );
}

/**
 * React-хук для программного управления MainButton.
 * Возвращает объект, совместимый с API Telegram Mini App.
 */
export function useMainButtonAPI() {
  const [params, setParams] = useState<MainButtonProps>({
    text: '',
    isActive: true,
    isVisible: true,
  });

  const show = () =>
    setParams((p) => ({ ...p, isVisible: true }));
  const hide = () =>
    setParams((p) => ({ ...p, isVisible: false }));
  const setText = (text: string) =>
    setParams((p) => ({ ...p, text }));
  const setParams_ = (p: Partial<MainButtonProps>) =>
    setParams((prev) => ({ ...prev, ...p }));
  const onClick = (cb: () => void) =>
    setParams((p) => ({ ...p, onClick: cb }));
  const offClick = () =>
    setParams((p) => ({ ...p, onClick: undefined }));

  const El = params.isVisible ? (
    <MainButton {...params} onClick={params.onClick} />
  ) : null;

  return {
    show,
    hide,
    setText,
    setParams: setParams_,
    onClick,
    offClick,
    Component: El,
  };
}