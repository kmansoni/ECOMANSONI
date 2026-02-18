import { useState, useEffect, useRef, useCallback } from "react";

interface PullDownExpandState {
  expandProgress: number;
  isExpanded: boolean;
  isDragging: boolean;
}

interface UsePullDownExpandOptions {
  threshold?: number;
  collapseScrollThreshold?: number;
}

export function usePullDownExpand(
  containerRef: React.RefObject<HTMLElement>,
  options: UsePullDownExpandOptions = {}
): PullDownExpandState & { toggleExpanded: () => void } {
  const { threshold = 80, collapseScrollThreshold = 10 } = options;
  
  const [state, setState] = useState<PullDownExpandState>({
    expandProgress: 0,
    isExpanded: false,
    isDragging: false,
  });

  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);
  const wasAtTop = useRef(false);
  const rafId = useRef<number | null>(null);
  const lastProgress = useRef(0);

  const toggleExpanded = useCallback(() => {
    setState(prev => ({
      ...prev,
      isExpanded: !prev.isExpanded,
      expandProgress: prev.isExpanded ? 0 : 1,
    }));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      const isAtTop = container.scrollTop <= 0;
      wasAtTop.current = isAtTop;
      
      if (isAtTop && !state.isExpanded) {
        startY.current = e.touches[0].clientY;
        currentY.current = startY.current;
        isDragging.current = true;
        setState(prev => ({ ...prev, isDragging: true }));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || !wasAtTop.current) return;
      
      currentY.current = e.touches[0].clientY;
      const deltaY = currentY.current - startY.current;
      
      // Only handle downward swipes when not expanded
      if (deltaY > 0 && !state.isExpanded) {
        // Prevent default scroll
        e.preventDefault();
        
        if (rafId.current) cancelAnimationFrame(rafId.current);
        
        rafId.current = requestAnimationFrame(() => {
          const rawProgress = Math.min(deltaY / threshold, 1);
          // Round to 0.02 steps for smoother updates
          const progress = Math.round(rawProgress * 50) / 50;
          
          // Only update if changed significantly
          if (Math.abs(progress - lastProgress.current) >= 0.02) {
            lastProgress.current = progress;
            setState(prev => ({ ...prev, expandProgress: progress }));
          }
        });
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging.current) return;
      
      const deltaY = currentY.current - startY.current;
      const progress = deltaY / threshold;
      
      isDragging.current = false;
      lastProgress.current = 0;
      
      // If pulled past 50%, expand fully
      if (progress > 0.5 && !state.isExpanded) {
        setState({
          expandProgress: 1,
          isExpanded: true,
          isDragging: false,
        });
      } else if (!state.isExpanded) {
        // Snap back to collapsed
        setState({
          expandProgress: 0,
          isExpanded: false,
          isDragging: false,
        });
      } else {
        setState(prev => ({ ...prev, isDragging: false }));
      }
      
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };

    const handleScroll = () => {
      // Collapse when scrolling down
      if (container.scrollTop > collapseScrollThreshold && state.isExpanded) {
        setState({
          expandProgress: 0,
          isExpanded: false,
          isDragging: false,
        });
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('scroll', handleScroll);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [containerRef, threshold, collapseScrollThreshold, state.isExpanded]);

  return { ...state, toggleExpanded };
}
