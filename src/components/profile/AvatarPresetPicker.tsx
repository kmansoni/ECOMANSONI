import { useMemo, useState } from "react";
import {
  avatarCategoryLabels,
  avatarGenderLabels,
  avatarPresets,
  type AvatarCategory,
  type AvatarGender,
  type AvatarMotion,
} from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

interface AvatarPresetPickerProps {
  selectedUrl: string;
  onSelect: (url: string) => void;
}

const categoryOrder: AvatarCategory[] = ["animals", "soldiers", "rulers", "kings", "sultans"];

export function AvatarPresetPicker({ selectedUrl, onSelect }: AvatarPresetPickerProps) {
  const [category, setCategory] = useState<AvatarCategory>("animals");
  const [gender, setGender] = useState<AvatarGender>("male");
  const [motion, setMotion] = useState<AvatarMotion | "all">("all");

  const items = useMemo(() => {
    return avatarPresets.filter((p) => {
      if (p.category !== category) return false;
      if (p.gender !== gender) return false;
      if (motion !== "all" && p.motion !== motion) return false;
      return true;
    });
  }, [category, gender, motion]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Категория</p>
        <div className="flex flex-wrap gap-2">
          {categoryOrder.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs border transition-colors",
                category === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted",
              )}
            >
              {avatarCategoryLabels[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(avatarGenderLabels) as AvatarGender[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGender(g)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs border transition-colors",
              gender === g
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted",
            )}
          >
            {avatarGenderLabels[g]}
          </button>
        ))}

        {(["all", "static", "animated"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotion(m)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs border transition-colors",
              motion === m
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted",
            )}
          >
            {m === "all" ? "Все" : m === "animated" ? "Анимированные" : "Статичные"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.avatarUrl)}
            className={cn(
              "relative rounded-xl border p-1 bg-background hover:bg-muted transition-colors",
              selectedUrl === item.avatarUrl ? "border-primary ring-2 ring-primary/30" : "border-border",
            )}
            title={`${item.name}${item.motion === "animated" ? " (анимированный)" : ""}`}
          >
            <img
              src={item.avatarUrl}
              alt={item.name}
              className="w-full aspect-square rounded-lg object-cover"
            />
            {item.motion === "animated" ? (
              <span className="absolute top-1 right-1 rounded bg-black/70 text-white text-[10px] px-1">GIF</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
