import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";

export interface EffectItem {
  id: string;
  label: string;
  icon?: string;
  category?: string;
}

const DEFAULT_EFFECTS: EffectItem[] = [
  { id: "none", label: "Original", category: "basic" },
  { id: "grayscale", label: "B&W", category: "color" },
  { id: "sepia", label: "Sepia", category: "color" },
  { id: "vintage", label: "Vintage", category: "color" },
  { id: "noir", label: "Noir", category: "color" },
  { id: "dramatic", label: "Dramatic", category: "color" },
  { id: "vivid", label: "Vivid", category: "color" },
  { id: "golden", label: "Golden", category: "color" },
  { id: "cool", label: "Cool", category: "color" },
  { id: "warm", label: "Warm", category: "color" },
];

interface EffectCarouselProps {
  effects?: EffectItem[];
  activeEffectId: string | null;
  onEffectSelect: (effectId: string | null) => void;
  onPreviewFrame?: (effectId: string) => void;
}

export function EffectCarousel({
  effects = DEFAULT_EFFECTS,
  activeEffectId,
  onEffectSelect,
  onPreviewFrame,
}: EffectCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  useEffect(() => {
    checkScrollPosition();
  }, []);

  const checkScrollPosition = () => {
    const container = containerRef.current;
    if (!container) return;

    setShowLeftArrow(container.scrollLeft > 0);
    setShowRightArrow(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  };

  const scrollBy = (delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    
    container.scrollBy({ left: delta, behavior: "smooth" });
    setTimeout(checkScrollPosition, 300);
  };

  const handleEffectClick = (effectId: string) => {
    onEffectSelect(effectId === "none" ? null : effectId);
    if (onPreviewFrame) onPreviewFrame(effectId);
  };

  return (
    <div className="relative w-full bg-background/80 backdrop-blur-sm border-t">
      {showLeftArrow && (
        <button
          onClick={() => scrollBy(-200)}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1 bg-background/80 rounded-full"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      <div
        ref={containerRef}
        className="flex gap-2 overflow-x-auto px-8 py-3 scrollbar-hide"
        onScroll={checkScrollPosition}
      >
        {effects.map((effect) => (
          <button
            key={effect.id}
            onClick={() => handleEffectClick(effect.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg border transition-all ${
              activeEffectId === effect.id || (effect.id === "none" && !activeEffectId)
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            <span className="text-sm whitespace-nowrap">{effect.label}</span>
          </button>
        ))}
      </div>

      {showRightArrow && (
        <button
          onClick={() => scrollBy(200)}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1 bg-background/80 rounded-full"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}