import { FILTERS } from "./photoFiltersModel";

interface PhotoFiltersPanelProps {
  imageUrl: string;
  selected: number;
  intensity: number;
  onSelectFilter: (idx: number) => void;
  onChangeIntensity: (value: number) => void;
}

export function PhotoFiltersPanel({ selected, intensity, onSelectFilter, onChangeIntensity }: PhotoFiltersPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {FILTERS.map((filter, idx) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => onSelectFilter(idx)}
            className={
              idx === selected
                ? "rounded-md border border-white bg-white/20 px-2 py-1 text-xs text-white"
                : "rounded-md border border-white/20 bg-black/20 px-2 py-1 text-xs text-white/80"
            }
          >
            {filter.name}
          </button>
        ))}
      </div>

      <label className="block text-xs text-white/80">
        Intensity
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={intensity}
          onChange={(e) => onChangeIntensity(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </label>
    </div>
  );
}
