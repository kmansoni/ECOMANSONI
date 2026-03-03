import React, { useEffect, useRef } from 'react';

interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  /** Автофокус на первый элемент при активации */
  autoFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * FocusTrap — ловушка фокуса для модальных окон и Sheet-компонентов.
 * При active=true фокус циклически перемещается внутри контейнера.
 */
export function FocusTrap({ children, active = true, className, autoFocus = true }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    if (autoFocus) {
      const els = getFocusable();
      els[0]?.focus();
    }

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [active, autoFocus]);

  const getFocusable = (): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!active || e.key !== 'Tab') return;

    const els = getFocusable();
    if (els.length === 0) {
      e.preventDefault();
      return;
    }

    const first = els[0];
    const last = els[els.length - 1];
    const current = document.activeElement as HTMLElement;

    if (e.shiftKey) {
      if (current === first || !containerRef.current?.contains(current)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (current === last || !containerRef.current?.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {children}
    </div>
  );
}
