import { useRef } from "react";
import {
  Car, Shield, ShieldCheck, Stethoscope, Plane,
  Building2, Home, Heart, Activity, Wrench, Bus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsuranceCategory } from "@/types/insurance";
import { CATEGORY_CONFIG } from "@/lib/insurance/constants";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Car,
  Shield,
  ShieldCheck,
  Stethoscope,
  Plane,
  Building2,
  Home,
  Heart,
  Activity,
  Wrench,
  Bus,
};

const ALL_CATEGORIES: InsuranceCategory[] = [
  "osago",
  "kasko",
  "mini_kasko",
  "dms",
  "travel",
  "property",
  "mortgage",
  "life",
  "health",
  "auto",
  "osgop",
];

interface InsuranceCategoryTabsProps {
  selected?: InsuranceCategory | "all";
  onChange?: (category: InsuranceCategory | "all") => void;
  showAll?: boolean;
  categories?: InsuranceCategory[];
  className?: string;
}

/**
 * Табы-фильтры по категориям страхования с горизонтальным скроллом
 */
export function InsuranceCategoryTabs({
  selected,
  onChange,
  showAll = true,
  categories = ALL_CATEGORIES,
  className,
}: InsuranceCategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn("relative", className)}
    >
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {showAll && (
          <button
            type="button"
            onClick={() => onChange?.("all")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap",
              selected === "all" || selected === undefined
                ? "bg-violet-600 text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70",
            )}
          >
            <Shield className="w-4 h-4" />
            Все
          </button>
        )}

        {categories.map((category) => {
          const config = CATEGORY_CONFIG[category];
          const IconComponent = ICON_MAP[config?.icon ?? "Shield"] ?? Shield;
          const isSelected = selected === category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange?.(category)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap",
                isSelected
                  ? "bg-violet-600 text-white"
                  : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70",
              )}
            >
              <IconComponent
                className={cn(
                  "w-4 h-4",
                  isSelected ? "opacity-100" : "opacity-60",
                )}
              />
              {config?.label ?? category}
            </button>
          );
        })}
      </div>

      {/* Fade на краях для индикации скролла */}
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
    </div>
  );
}
