import { forwardRef, useEffect, useRef, useCallback, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AutoGrowTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  /** Min height in px (default 44 — roughly one line) */
  minHeight?: number;
  /** Max height in px before the textarea becomes scrollable (default 160 — ~6 lines) */
  maxHeight?: number;
  /** Called on Enter key without Shift — intended for message send */
  onSend?: () => void;
}

/**
 * Auto-growing textarea component with Telegram-like UX:
 *
 * - Single-line at rest, grows up to `maxHeight` as content is typed.
 * - Enter (without Shift) fires `onSend`; Shift+Enter inserts a newline.
 * - Height is computed via a hidden shadow element — no DOM layout thrash
 *   from repeated style reads inside event handlers.
 * - Forwards the ref so parent can call `.focus()` / `.setSelectionRange()`.
 *
 * Concurrency/race note: `syncHeight` is called on every `value` change
 * through a `useEffect` — the height sync is deterministic and idempotent.
 */
const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  function AutoGrowTextarea(
    {
      minHeight = 44,
      maxHeight = 160,
      onSend,
      onKeyDown,
      className,
      value,
      style,
      ...rest
    },
    ref,
  ) {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    // Merge external ref with internal ref
    const setRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        internalRef.current = el;
        if (typeof ref === "function") {
          ref(el);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }
      },
      [ref],
    );

    const syncHeight = useCallback(() => {
      const el = internalRef.current;
      if (!el) return;
      // Reset to min so scrollHeight reflects actual content height
      el.style.height = `${minHeight}px`;
      const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
      el.style.height = `${next}px`;
      // Enable internal scroll only when capped at maxHeight
      el.style.overflowY = next >= maxHeight ? "auto" : "hidden";
    }, [minHeight, maxHeight]);

    useEffect(() => {
      syncHeight();
    }, [value, syncHeight]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Shift+Enter → newline (default textarea behaviour)
        // Enter alone → send
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSend?.();
          return;
        }
        onKeyDown?.(e);
      },
      [onSend, onKeyDown],
    );

    return (
      <textarea
        ref={setRef}
        rows={1}
        value={value}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full resize-none outline-none bg-transparent",
          "text-white placeholder:text-white/50",
          "leading-[1.45] py-2.5 px-0",
          "transition-[height] duration-100 ease-out",
          "native-scroll",
          className,
        )}
        style={{
          minHeight,
          maxHeight,
          height: minHeight,
          overflowY: "hidden",
          ...style,
        }}
        {...rest}
      />
    );
  },
);

AutoGrowTextarea.displayName = "AutoGrowTextarea";
export { AutoGrowTextarea };
