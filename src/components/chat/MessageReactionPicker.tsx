/**
 * MessageReactionPicker — Instagram/Telegram-style emoji reaction picker.
 *
 * Usage:
 *   Triggered by long-press on a message bubble.
 *   Renders a floating row of 6 quick-reaction emojis + optional "more" button.
 *   Positioned above the message bubble, clamped to viewport edges.
 *
 * Architecture:
 *   - Pure presentational component; all state lives in the parent.
 *   - Uses createPortal to render above all other content (z-50).
 *   - Entrance animation via CSS keyframes (no framer-motion dependency).
 *   - Dismisses on outside click or Escape key.
 *   - Accessible: role="dialog", aria-label, keyboard navigation.
 *
 * Long-press detection:
 *   Use the useLongPress hook (below) on the message bubble element.
 *   It fires onLongPress after 500ms and cancels on touchmove/mouseup.
 */

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;
export type QuickReaction = (typeof QUICK_REACTIONS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageReactionPickerProps {
  /** Anchor element — the message bubble that was long-pressed */
  anchorEl: HTMLElement;
  /** Currently selected emoji for this message (null = none) */
  selectedEmoji: string | null;
  /** Called when user taps an emoji */
  onSelect: (emoji: string) => void;
  /** Called when picker should close without selection */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageReactionPicker({
  anchorEl,
  selectedEmoji,
  onSelect,
  onClose,
}: MessageReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  // Position the picker above the anchor element, clamped to viewport
  const getPosition = useCallback((): { top: number; left: number } => {
    const rect = anchorEl.getBoundingClientRect();
    const pickerWidth = 280; // approximate
    const pickerHeight = 56;
    const margin = 8;

    let left = rect.left + rect.width / 2 - pickerWidth / 2;
    let top = rect.top - pickerHeight - margin;

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - pickerWidth - margin));
    top = Math.max(margin, top);

    return { top, left };
  }, [anchorEl]);

  // Dismiss on outside click
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [onClose]);

  // Dismiss on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const { top, left } = getPosition();

  return createPortal(
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Выберите реакцию"
      aria-modal="true"
      className="fixed z-[9999] flex items-center gap-1 px-3 py-2 rounded-full shadow-2xl"
      style={{
        top,
        left,
        background: "rgba(30, 30, 30, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.12)",
        animation: "reactionPickerIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      }}
    >
      <style>{`
        @keyframes reactionPickerIn {
          from { opacity: 0; transform: scale(0.7) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .reaction-btn {
          font-size: 1.5rem;
          line-height: 1;
          padding: 4px;
          border-radius: 50%;
          transition: transform 0.12s ease, background 0.12s ease;
          cursor: pointer;
          background: transparent;
          border: none;
          outline: none;
          position: relative;
        }
        .reaction-btn:hover,
        .reaction-btn:focus-visible {
          transform: scale(1.35) translateY(-4px);
          background: rgba(255,255,255,0.1);
        }
        .reaction-btn[aria-pressed="true"] {
          background: rgba(255,255,255,0.15);
        }
        .reaction-btn[aria-pressed="true"]::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.5);
        }
      `}</style>

      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-btn"
          aria-label={`Реакция ${emoji}`}
          aria-pressed={selectedEmoji === emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// useLongPress — detects long-press on touch and mouse
// ---------------------------------------------------------------------------

export interface UseLongPressOptions {
  /** Delay in ms before long-press fires (default: 500) */
  delay?: number;
  /** Called when long-press threshold is reached */
  onLongPress: () => void;
  /** Called on normal tap (< delay ms) */
  onTap?: () => void;
}

export function useLongPress({ delay = 500, onLongPress, onTap }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback(
    (x: number, y: number) => {
      firedRef.current = false;
      startPosRef.current = { x, y };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress],
  );

  const cancel = useCallback(
    (x?: number, y?: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // If moved more than 10px, don't fire tap
      if (x !== undefined && y !== undefined && startPosRef.current) {
        const dx = Math.abs(x - startPosRef.current.x);
        const dy = Math.abs(y - startPosRef.current.y);
        if (dx > 10 || dy > 10) {
          firedRef.current = true; // suppress tap
        }
      }
      if (!firedRef.current) {
        onTap?.();
      }
      firedRef.current = false;
      startPosRef.current = null;
    },
    [onTap],
  );

  return {
    onTouchStart: (e: React.TouchEvent) => {
      start(e.touches[0].clientX, e.touches[0].clientY);
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (timerRef.current) {
        const dx = Math.abs(e.touches[0].clientX - (startPosRef.current?.x ?? 0));
        const dy = Math.abs(e.touches[0].clientY - (startPosRef.current?.y ?? 0));
        if (dx > 10 || dy > 10) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
          firedRef.current = true;
        }
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      cancel(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    },
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      start(e.clientX, e.clientY);
    },
    onMouseUp: (e: React.MouseEvent) => {
      cancel(e.clientX, e.clientY);
    },
    onMouseLeave: () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        firedRef.current = true;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// MessageReactionBubbles — renders reaction counts below a message
// ---------------------------------------------------------------------------

export interface MessageReactionBubblesProps {
  reactions: Array<{ emoji: string; count: number; hasReacted: boolean }>;
  onReactionClick: (emoji: string) => void;
}

export function MessageReactionBubbles({
  reactions,
  onReactionClick,
}: MessageReactionBubblesProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map(({ emoji, count, hasReacted }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReactionClick(emoji)}
          className={[
            "flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium",
            "transition-colors duration-100 select-none",
            hasReacted
              ? "bg-blue-500/20 border border-blue-400/40 text-blue-300"
              : "bg-white/10 border border-white/10 text-white/70 hover:bg-white/15",
          ].join(" ")}
          aria-label={`${emoji} ${count}${hasReacted ? " (ваша реакция)" : ""}`}
          aria-pressed={hasReacted}
        >
          <span>{emoji}</span>
          {count > 1 && <span>{count}</span>}
        </button>
      ))}
    </div>
  );
}
