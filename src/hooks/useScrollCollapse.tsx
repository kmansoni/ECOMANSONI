import { useState, useEffect, useRef, useCallback } from "react";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";

export function useScrollCollapse(threshold: number = 50) {
  const containerRef = useScrollContainer();
  const [collapseProgress, setCollapseProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const rafId = useRef<number | null>(null);
  const lastScrollY = useRef(0);
  const lastProgress = useRef(0);

  const updateScroll = useCallback(() => {
    const currentScrollY = lastScrollY.current;
    
    // Calculate progress with rounding to 2 decimal places
    // This prevents unnecessary re-renders for tiny changes
    const rawProgress = Math.min(currentScrollY / threshold, 1);
    const roundedProgress = Math.round(rawProgress * 50) / 50; // 0.02 steps
    
    // Only update state if progress changed significantly
    if (Math.abs(roundedProgress - lastProgress.current) >= 0.02) {
      lastProgress.current = roundedProgress;
      setCollapseProgress(roundedProgress);
    }
    
    setScrollY(currentScrollY);
    rafId.current = null;
  }, [threshold]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const handleScroll = () => {
      lastScrollY.current = container.scrollTop;
      
      // Use requestAnimationFrame to throttle updates to 60 FPS
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(updateScroll);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Get initial state
    
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [containerRef, updateScroll]);

  const isCollapsed = collapseProgress > 0.5;

  return { isCollapsed, collapseProgress, scrollY };
}
