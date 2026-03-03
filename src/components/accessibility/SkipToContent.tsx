import { skipToContent } from '@/lib/accessibility/a11y';

/**
 * Ссылка "Перейти к основному контенту" — видна только по Tab-фокусу (WCAG 2.4.1)
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      onClick={(e) => {
        e.preventDefault();
        skipToContent();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          skipToContent();
        }
      }}
      className="
        fixed top-2 left-2 z-[9999]
        px-4 py-2 rounded-lg
        bg-primary text-primary-foreground
        text-sm font-medium
        shadow-lg
        -translate-y-16 focus:translate-y-0
        transition-transform duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
      "
    >
      Перейти к основному контенту
    </a>
  );
}
