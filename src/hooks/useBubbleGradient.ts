import { useState, useCallback, useMemo } from "react";

const LS_KEY = "bubble_gradient_v1";

export type BubbleGradientPreset =
  | "default"
  | "ocean"
  | "sunset"
  | "aurora"
  | "fire"
  | "lavender"
  | "midnight"
  | "emerald";

export const GRADIENT_PRESETS: Record<BubbleGradientPreset, string> = {
  default: "bg-[#2b5278]",
  ocean: "bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400",
  sunset: "bg-gradient-to-br from-orange-500 via-pink-500 to-rose-500",
  aurora: "bg-gradient-to-br from-green-500 via-blue-500 to-purple-500",
  fire: "bg-gradient-to-br from-red-500 via-orange-500 to-yellow-400",
  lavender: "bg-gradient-to-br from-purple-500 via-violet-500 to-pink-400",
  midnight: "bg-gradient-to-br from-indigo-800 via-blue-700 to-purple-600",
  emerald: "bg-gradient-to-br from-emerald-600 via-green-500 to-teal-400",
};

export const GRADIENT_LABELS: Record<BubbleGradientPreset, string> = {
  default: "Стандартный",
  ocean: "Океан",
  sunset: "Закат",
  aurora: "Сияние",
  fire: "Огонь",
  lavender: "Лаванда",
  midnight: "Полночь",
  emerald: "Изумруд",
};

function loadPreset(): BubbleGradientPreset {
  try {
    const val = localStorage.getItem(LS_KEY) as BubbleGradientPreset;
    if (val && val in GRADIENT_PRESETS) return val;
  } catch {}
  return "default";
}

export function useBubbleGradient() {
  const [preset, setPresetState] = useState<BubbleGradientPreset>(loadPreset);

  const setPreset = useCallback((p: BubbleGradientPreset) => {
    setPresetState(p);
    try { localStorage.setItem(LS_KEY, p); } catch {}
  }, []);

  const bubbleClass = useMemo(() => GRADIENT_PRESETS[preset], [preset]);

  return { preset, setPreset, bubbleClass, presets: GRADIENT_PRESETS, labels: GRADIENT_LABELS };
}
