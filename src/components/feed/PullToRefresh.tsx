import { useState, useRef, ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const scrollContainerRef = useScrollContainer();
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);

  const threshold = 80;
  const maxPull = 120;

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollContainer = scrollContainerRef?.current;
    // Only allow pull when scroll is at the top
    if (scrollContainer && scrollContainer.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0) {
      const resistance = 0.4;
      const distance = Math.min(diff * resistance, maxPull);
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = async () => {
    if (!pulling) return;
    
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(60);
      
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    
    setPulling(false);
  };

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center",
          "transition-opacity duration-200",
          pullDistance > 0 || refreshing ? "opacity-100" : "opacity-0"
        )}
        style={{ top: Math.max(pullDistance - 50, 8) }}
      >
        <div
          className={cn(
            "w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center",
            "shadow-lg backdrop-blur-sm border border-primary/20"
          )}
        >
          <RefreshCw
            className={cn(
              "w-5 h-5 text-primary transition-transform",
              refreshing && "animate-spin"
            )}
            style={{ transform: refreshing ? undefined : `rotate(${rotation}deg)` }}
          />
        </div>
      </div>

      {/* Content - no transform wrapper needed */}
      {children}
    </div>
  );
}
