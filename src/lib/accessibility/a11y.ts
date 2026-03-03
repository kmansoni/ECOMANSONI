/**
 * Утилиты доступности (WCAG 2.1)
 */

let liveRegion: HTMLElement | null = null;
let idCounter = 0;

/** Объявить сообщение для screen reader через aria-live */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return;

  if (!liveRegion) {
    liveRegion = document.getElementById('a11y-live-region');
  }
  if (!liveRegion) return;

  liveRegion.setAttribute('aria-live', priority);
  // Очищаем и устанавливаем новое сообщение
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    if (liveRegion) liveRegion.textContent = message;
  });
}

/** Ловушка фокуса для модальных окон */
export function trapFocus(container: HTMLElement): () => void {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  function getFocusable() {
    return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown);
  // Установить фокус на первый элемент
  const first = getFocusable()[0];
  if (first) first.focus();

  return () => container.removeEventListener('keydown', handleKeyDown);
}

/** Восстановить фокус на предыдущем элементе после закрытия модала */
export function restoreFocus(prevElement: HTMLElement | null) {
  if (prevElement && typeof prevElement.focus === 'function') {
    prevElement.focus();
  }
}

/** Рассчитать относительную яркость цвета (sRGB) */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Распарсить hex-цвет в RGB */
function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Получить коэффициент контрастности между двумя цветами */
export function getContrastRatio(fg: string, bg: string): number {
  const fgRgb = parseHex(fg);
  const bgRgb = parseHex(bg);
  if (!fgRgb || !bgRgb) return 1;

  const l1 = getLuminance(...fgRgb);
  const l2 = getLuminance(...bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Проверить достаточность контрастности (WCAG AA: 4.5:1 для текста, AAA: 7:1) */
export function isContrastSufficient(fg: string, bg: string, level: 'AA' | 'AAA' = 'AA'): boolean {
  const ratio = getContrastRatio(fg, bg);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

/** Сгенерировать уникальный id для aria-labelledby */
export function generateId(prefix = 'a11y'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Обработка клавиатурной навигации в списке элементов
 * Возвращает новый индекс
 */
export function handleKeyboardNavigation(
  e: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number
): number {
  let newIndex = currentIndex;

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      e.preventDefault();
      newIndex = (currentIndex + 1) % items.length;
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      e.preventDefault();
      newIndex = (currentIndex - 1 + items.length) % items.length;
      break;
    case 'Home':
      e.preventDefault();
      newIndex = 0;
      break;
    case 'End':
      e.preventDefault();
      newIndex = items.length - 1;
      break;
  }

  if (newIndex !== currentIndex && items[newIndex]) {
    items[newIndex].focus();
  }

  return newIndex;
}

/** Пропустить к основному контенту */
export function skipToContent() {
  if (typeof document === 'undefined') return;
  const main = document.querySelector<HTMLElement>('main, [role="main"], #main-content');
  if (main) {
    main.tabIndex = -1;
    main.focus();
    main.scrollIntoView({ behavior: 'smooth' });
  }
}
