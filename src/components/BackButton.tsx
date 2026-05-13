/**
 * BackButton — React UI-компонент для Bottom App Bar.
 *
 * Кнопка «Назад» в стиле Telegram (шadcn/ui + Tailwind).
 */

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  isVisible?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function BackButton({
  isVisible = false,
  isActive = true,
  onClick,
  className,
}: BackButtonProps) {
  if (!isVisible) return null;

  return (
    <button
      onClick={isActive ? onClick : undefined}
      disabled={!isActive}
      className={cn(
        'fixed bottom-4 left-4 z-[99999]',
        'flex items-center justify-center',
        'w-10 h-10',
        'rounded-full',
        'bg-secondary/80 backdrop-blur-sm',
        'border border-border/40',
        'text-muted-foreground',
        'transition-all duration-200',
        'hover:bg-accent hover:text-accent-foreground',
        'active:scale-[0.95]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'shadow-md',
        className,
      )}
      aria-label="Назад"
    >
      <ChevronLeft className="w-5 h-5" />
    </button>
  );
}

/**
 * React-хук для программного управления BackButton.
 */
export function useBackButtonAPI() {
  const handlerRef = useRef<(() => void) | undefined>(undefined);
  const [visible, setVisible] = useState(false);

  const show = () => setVisible(true);
  const hide = () => setVisible(false);
  const onClick = (cb?: () => void) => {
    handlerRef.current = cb;
  };
  const offClick = () => {
    handlerRef.current = undefined;
  };

  const handleClick = useCallback(() => {
    handlerRef.current?.();
  }, []);

  const El = visible ? (
    <BackButton
      isVisible={true}
      isActive={!!handlerRef.current}
      onClick={handleClick}
    />
  ) : null;

  return {
    show,
    hide,
    onClick,
    offClick,
    Component: El,
  };
}