/**
 * AdjustmentsPanel — ручные настройки изображения через CSS filter
 */
import { Slider } from "@/components/ui/slider";
import { DEFAULT_ADJUSTMENTS, type Adjustments } from "./adjustmentsModel";

const PARAMS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: "brightness", label: "Яркость", min: -100, max: 100 },
  { key: "contrast", label: "Контраст", min: -100, max: 100 },
  { key: "saturation", label: "Насыщенность", min: -100, max: 100 },
  { key: "warmth", label: "Теплота", min: -100, max: 100 },
  { key: "shadows", label: "Тени", min: -100, max: 100 },
  { key: "highlights", label: "Светлые участки", min: -100, max: 100 },
  { key: "vignette", label: "Виньетка", min: 0, max: 100 },
  { key: "sharpness", label: "Резкость", min: 0, max: 100 },
  { key: "grain", label: "Зернистость", min: 0, max: 100 },
];

interface Props {
  adjustments: Adjustments;
  onChange: (adj: Adjustments) => void;
}

export function AdjustmentsPanel({ adjustments, onChange }: Props) {
  const handleChange = (key: keyof Adjustments, value: number) => {
    onChange({ ...adjustments, [key]: value });
  };

  const reset = () => onChange(DEFAULT_ADJUSTMENTS);

  const hasChanges = Object.entries(adjustments).some(([, v]) => v !== 0);

  return (
    <div className="flex flex-col gap-3 px-2">
      {PARAMS.map(({ key, label, min, max }) => (
        <div key={key} className="flex items-center gap-3">
          <span className="text-xs text-white/70 w-32 flex-shrink-0">{label}</span>
          <Slider
            value={[adjustments[key]]}
            onValueChange={([v]) => handleChange(key, v)}
            min={min}
            max={max}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-white/60 w-8 text-right">
            {adjustments[key] > 0 ? "+" : ""}{adjustments[key]}
          </span>
        </div>
      ))}
      {hasChanges && (
        <button
          onClick={reset}
          className="self-end text-xs text-primary underline mt-1"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
