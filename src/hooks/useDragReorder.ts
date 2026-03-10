/**
 * useDragReorder — drag-to-reorder list items hook.
 *
 * Activates with long press (500ms) + drag. Mirrors Telegram's chat folder
 * reordering and pinned chat reordering behaviour.
 *
 * Architecture:
 *   - Uses pointer events (works for both touch and mouse).
 *   - Long-press threshold: 400ms (fires haptic feedback).
 *   - During drag: returns `activeIndex` and `overIndex` so the caller can
 *     render a visual "drop target" indicator.
 *   - On drop: calls `onReorder(fromIndex, toIndex)` once.
 *   - No DOM mutation — purely declarative; the caller manages the array.
 *
 * Usage:
 *   const items = ['Chat A', 'Chat B', 'Chat C'];
 *   const { getItemProps, activeIndex, overIndex } = useDragReorder({
 *     count: items.length,
 *     onReorder: (from, to) => setItems(reorder(items, from, to)),
 *   });
 *
 *   {items.map((item, i) => (
 *     <div
 *       key={item}
 *       {...getItemProps(i)}
 *       style={{ opacity: activeIndex === i ? 0.4 : 1 }}
 *     >
 *       {item}
 *       {overIndex === i && <div className="drop-indicator" />}
 *     </div>
 *   ))}
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface UseDragReorderOptions {
  /** Total number of items */
  count: number;
  /** Called when drag ends with a new position */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Long press delay in ms. Default: 400 */
  longPressDelay?: number;
  /** Whether reordering is enabled */
  enabled?: boolean;
}

export interface UseDragReorderResult {
  /** Returns props to spread on each list item */
  getItemProps: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: { userSelect: 'none'; touchAction: 'none' };
  };
  /** Index of the item currently being dragged */
  activeIndex: number | null;
  /** Index of the current drop target */
  overIndex: number | null;
}

export function useDragReorder({
  count,
  onReorder,
  longPressDelay = 400,
  enabled = true,
}: UseDragReorderOptions): UseDragReorderResult {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragFromIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const itemRectsRef = useRef<DOMRect[]>([]);
  const containerRef = useRef<Element | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const cancelDrag = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isDraggingRef.current = false;
    dragFromIndexRef.current = null;
    setActiveIndex(null);
    setOverIndex(null);
  }, []);

  const getItemProps = useCallback(
    (index: number) => {
      const onPointerDown = (e: React.PointerEvent) => {
        if (!enabled) return;

        const el = e.currentTarget as HTMLElement;
        containerRef.current = el.parentElement;

        // Snapshot all item rects at drag start for hit-testing during move
        const parent = el.parentElement;
        if (parent) {
          const children = Array.from(parent.children);
          itemRectsRef.current = children.map((c) => c.getBoundingClientRect());
        }

        longPressTimerRef.current = setTimeout(() => {
          // Long press fired → begin drag
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([10, 5, 10]); // double pulse haptic
          }
          isDraggingRef.current = true;
          dragFromIndexRef.current = index;
          setActiveIndex(index);
          el.setPointerCapture(e.pointerId);
        }, longPressDelay);

        const onPointerMove = (ev: PointerEvent) => {
          if (!isDraggingRef.current) return;

          // Find which item the pointer is over
          const rects = itemRectsRef.current;
          for (let i = 0; i < rects.length; i++) {
            const r = rects[i]!;
            if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
              setOverIndex(i);
              break;
            }
          }
        };

        const onPointerUp = () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }

          if (isDraggingRef.current) {
            const from = dragFromIndexRef.current;
            setOverIndex((to) => {
              if (from !== null && to !== null && from !== to) {
                onReorder(from, to);
              }
              return null;
            });
          }

          isDraggingRef.current = false;
          dragFromIndexRef.current = null;
          setActiveIndex(null);

          el.removeEventListener('pointermove', onPointerMove);
          el.removeEventListener('pointerup', onPointerUp);
          el.removeEventListener('pointercancel', onPointerUp);
        };

        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        el.addEventListener('pointercancel', onPointerUp);
      };

      return {
        onPointerDown,
        style: { userSelect: 'none' as const, touchAction: 'none' as const },
      };
    },
    [enabled, longPressDelay, onReorder, count], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { getItemProps, activeIndex, overIndex };
}

/**
 * Utility: reorder array by moving item from `from` to `to` index.
 * Pure function — returns new array without mutating the original.
 */
export function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [removed] = result.splice(from, 1);
  if (removed !== undefined) {
    result.splice(to, 0, removed);
  }
  return result;
}
