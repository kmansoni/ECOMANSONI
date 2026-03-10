/**
 * useScrollToBottom — chat scroll management hook.
 *
 * Provides:
 *   1. Auto-scroll to bottom when new messages arrive (only if user is near bottom).
 *   2. `isAtBottom` state — true when user is ≤ threshold px from bottom.
 *   3. `unreadCount` — number of messages added while user is scrolled up.
 *   4. `scrollToBottom(behavior)` — programmatic scroll.
 *   5. `containerRef` — attach to the scrollable container.
 *   6. `sentinelRef` — attach to an invisible element at the bottom of the list;
 *      IntersectionObserver watches it for zero-cost bottom detection.
 *
 * Usage:
 *   const { containerRef, sentinelRef, isAtBottom, unreadCount, scrollToBottom } =
 *     useScrollToBottom({ messageCount: messages.length });
 *
 *   <div ref={containerRef} style={{ overflowY: 'auto' }}>
 *     {messages.map(m => <Message key={m.id} {...m} />)}
 *     <div ref={sentinelRef} />
 *   </div>
 *   {!isAtBottom && (
 *     <button onClick={() => scrollToBottom('smooth')}>
 *       ↓ {unreadCount > 0 ? unreadCount : ''}
 *     </button>
 *   )}
 */

import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';

export interface UseScrollToBottomOptions {
  /** Current total message count. When it increases, hook considers auto-scrolling. */
  messageCount: number;
  /**
   * Pixels from bottom within which user is considered "at bottom".
   * Default: 80 (comfortable thumb zone).
   */
  threshold?: number;
  /**
   * Whether to auto-scroll when new messages arrive and user is at bottom.
   * Default: true.
   */
  autoScroll?: boolean;
}

export interface UseScrollToBottomResult {
  containerRef: React.RefObject<HTMLDivElement>;
  sentinelRef: React.RefObject<HTMLDivElement>;
  isAtBottom: boolean;
  unreadCount: number;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useScrollToBottom(
  options: UseScrollToBottomOptions,
): UseScrollToBottomResult {
  const { messageCount, threshold = 80, autoScroll = true } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevMessageCount = useRef(messageCount);
  const isAtBottomRef = useRef(true); // sync ref to avoid stale closure

  // ── IntersectionObserver watches sentinel element ──────────────────────────
  // This is zero-cost when sentinel is visible (no scroll listener needed).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const atBottom = entry.isIntersecting;
        setIsAtBottom(atBottom);
        isAtBottomRef.current = atBottom;
        if (atBottom) {
          setUnreadCount(0); // clear unread badge when user scrolls back down
        }
      },
      {
        root: containerRef.current,
        // rootMargin adds threshold: sentinel is "visible" when it's within
        // `threshold` px of the container's bottom edge.
        rootMargin: `0px 0px ${threshold}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [threshold]);

  // ── Auto-scroll + unread count on new messages ─────────────────────────────
  useLayoutEffect(() => {
    if (messageCount === prevMessageCount.current) return;

    const added = messageCount - prevMessageCount.current;
    prevMessageCount.current = messageCount;

    if (added <= 0) return; // messages deleted, not added

    if (isAtBottomRef.current && autoScroll) {
      // User is at bottom — scroll down immediately
      containerRef.current?.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'instant',
      });
    } else {
      // User is scrolled up — increment unread badge
      setUnreadCount((c) => c + added);
    }
  }, [messageCount, autoScroll]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    setUnreadCount(0);
  }, []);

  return { containerRef, sentinelRef, isAtBottom, unreadCount, scrollToBottom };
}
