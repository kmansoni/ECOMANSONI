import React, { useEffect, useRef, useCallback } from 'react';

interface KeyboardNavigationProps {
  children: React.ReactNode;
  /** Поддержка навигации стрелками по дочерним элементам */
  arrowNavigation?: boolean;
  /** Вызывается при нажатии Escape */
  onEscape?: () => void;
  /** CSS-селектор для focusable элементов */
  focusableSelector?: string;
  className?: string;
  role?: string;
  'aria-label'?: string;
}

const DEFAULT_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function KeyboardNavigation({
  children,
  arrowNavigation = false,
  onEscape,
  focusableSelector = DEFAULT_FOCUSABLE,
  className,
  role,
  'aria-label': ariaLabel,
}: KeyboardNavigationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(focusableSelector));
  }, [focusableSelector]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }

    if (!arrowNavigation) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const els = getFocusableElements();
      const idx = els.indexOf(document.activeElement as HTMLElement);
      const next = els[(idx + 1) % els.length];
      next?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const els = getFocusableElements();
      const idx = els.indexOf(document.activeElement as HTMLElement);
      const prev = els[(idx - 1 + els.length) % els.length];
      prev?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      getFocusableElements()[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const els = getFocusableElements();
      els[els.length - 1]?.focus();
    }
  }, [arrowNavigation, getFocusableElements, onEscape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={containerRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
