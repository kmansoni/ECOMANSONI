/**
 * SettingsButton — React UI-компонент для Bottom App Bar.
 *
 * Кнопка настроек в стиле Telegram (шadcn/ui + Tailwind).
 */

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Settings } from 'lucide-react';

interface SettingsButtonProps {
  isVisible?: boolean;
  text?: string;
  color?: string;
  textColor?: string;
  onClick?: () => void;
  className?: string;
}

export function SettingsButton({
  isVisible = false,
  text,
  color,
  textColor,
  onClick,
  className,
}: SettingsButtonProps) {
  if (!isVisible) return null;

  const style: React.CSSProperties = {};
  if (color) style.backgroundColor = color;
  if (textColor) style.color = textColor;

  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed bottom-4 right-4 z-[99999]',
        'flex items-center justify-center gap-1.5',
        'min-w-[40px] h-10 px-3',
        'rounded-full',
        'bg-secondary/80 backdrop-blur-sm',
        'border border-border/40',
        'text-sm font-medium text-muted-foreground',
        'transition-all duration-200',
        'hover:bg-accent hover:text-accent-foreground',
        'active:scale-[0.95]',
        'shadow-md',
        className,
      )}
      style={style}
      aria-label="Настройки"
    >
      <Settings className="w-4 h-4" />
      {text && <span className="truncate">{text}</span>}
    </button>
  );
}

/**
 * React-хук для программного управления SettingsButton.
 */
export function useSettingsButtonAPI() {
  const handlerRef = useRef<(() => void) | undefined>(undefined);
  const [params, setParams] = useState({
    isVisible: false,
    text: '',
    color: undefined as string | undefined,
    textColor: undefined as string | undefined,
  });

  const show = () =>
    setParams((p) => ({ ...p, isVisible: true }));
  const hide = () =>
    setParams((p) => ({ ...p, isVisible: false }));
  const setParams_ = (p: Partial<typeof params>) =>
    setParams((prev) => ({ ...prev, ...p }));
  const onClick = (cb?: () => void) => {
    handlerRef.current = cb;
  };

  const El = params.isVisible ? (
    <SettingsButton
      {...params}
      onClick={handlerRef.current}
    />
  ) : null;

  return {
    show,
    hide,
    setParams: setParams_,
    onClick,
    Component: El,
  };
}