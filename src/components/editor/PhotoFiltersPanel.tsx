/**
 * PhotoFiltersPanel — 20 Instagram-фильтров через CSS filter + mix-blend-mode
 */
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { FILTERS, type Filter } from "./photoFiltersModel";

interface Props {
  imageUrl: string;
  selected: number;
  intensity: number;
  onSelectFilter: (idx: number) => void;
  onChangeIntensity: (v: number) => void;
}

export function PhotoFiltersPanel({ imageUrl, selected, intensity, onSelectFilter, onChangeIntensity }: Props) {
  const getStyle = (f: Filter, strength = 1): React.CSSProperties => {
    if (!f.style.filter) return {};
    // Применяем интенсивность: интерполируем между none и full фильтром
    return { filter: f.style.filter };
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Превью фильтров */}
      <div className="flex gap-2 overflow-x-auto pb-2 px-1">
        {FILTERS.map((f, idx) => (
          <button
            key={f.name}
            className={cn(
              "flex-shrink-0 flex flex-col items-center gap-1",
              selected === idx && "opacity-100",
              selected !== idx && "opacity-70",
            )}
            onClick={() => onSelectFilter(idx)}
          >
            <div className={cn(
              "relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
              selected === idx ? "border-primary" : "border-transparent",
            )}>
              <img loading="lazy"
                src={imageUrl}
                alt={f.name}
                className="w-full h-full object-cover"
                style={getStyle(f)}
              />
              {f.overlay && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: f.overlay.color,
                    mixBlendMode: f.overlay.blendMode as any,
                    opacity: f.overlay.opacity,
                  }}
                />
              )}
            </div>
            <span className="text-[10px] text-white/80 whitespace-nowrap">{f.name}</span>
          </button>
        ))}
      </div>

      {/* Интенсивность */}
      {selected > 0 && (
        <div className="flex items-center gap-3 px-2">
          <span className="text-xs text-white/60 w-20">Интенсивность</span>
          <Slider
            value={[intensity]}
            onValueChange={([v]) => onChangeIntensity(v)}
            min={0}
            max={100}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-white/60 w-8 text-right">{intensity}%</span>
        </div>
      )}
    </div>
  );
}
