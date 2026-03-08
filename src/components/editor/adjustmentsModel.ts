import React from "react";

export interface Adjustments {
  brightness: number; // -100..+100
  contrast: number;
  saturation: number;
  warmth: number; // hue shift approximation
  shadows: number;
  highlights: number;
  vignette: number;
  sharpness: number;
  grain: number;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  shadows: 0,
  highlights: 0,
  vignette: 0,
  sharpness: 0,
  grain: 0,
};

export function adjustmentsToFilter(adj: Adjustments): React.CSSProperties {
  const brightness = 1 + adj.brightness / 100;
  const contrast = 1 + adj.contrast / 100;
  const saturate = 1 + adj.saturation / 100;
  const hueRotate = adj.warmth * 0.5;
  const shadowAdj = 1 + adj.shadows / 200;
  const highlightAdj = 1 + adj.highlights / 200;
  const totalBrightness = brightness * shadowAdj * highlightAdj;

  return {
    filter: [
      `brightness(${totalBrightness.toFixed(2)})`,
      `contrast(${contrast.toFixed(2)})`,
      `saturate(${saturate.toFixed(2)})`,
      adj.warmth !== 0 ? `hue-rotate(${hueRotate.toFixed(0)}deg)` : "",
      adj.sharpness > 0 ? `drop-shadow(0 0 ${(adj.sharpness / 100).toFixed(2)}px rgba(0,0,0,0.5))` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
