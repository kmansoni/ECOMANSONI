import type { Adjustments } from "./adjustmentsModel";

interface AdjustmentsPanelProps {
  adjustments: Adjustments;
  onChange: (value: Adjustments) => void;
}

const RANGES: Array<{ key: keyof Adjustments; label: string; min: number; max: number }> = [
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "warmth", label: "Warmth", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "vignette", label: "Vignette", min: 0, max: 100 },
  { key: "sharpness", label: "Sharpness", min: 0, max: 100 },
  { key: "grain", label: "Grain", min: 0, max: 100 },
];

export function AdjustmentsPanel({ adjustments, onChange }: AdjustmentsPanelProps) {
  return (
    <div className="space-y-2">
      {RANGES.map((row) => (
        <label key={row.key} className="block text-xs text-white/80">
          {row.label}: {adjustments[row.key]}
          <input
            type="range"
            min={row.min}
            max={row.max}
            step={1}
            value={adjustments[row.key]}
            onChange={(e) => onChange({ ...adjustments, [row.key]: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>
      ))}
    </div>
  );
}
