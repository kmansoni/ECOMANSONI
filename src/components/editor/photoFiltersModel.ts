import type React from "react";

export interface Filter {
  name: string;
  style: React.CSSProperties;
  overlay?: { color: string; blendMode: string; opacity: number };
}

export const FILTERS: Filter[] = [
  { name: "Оригинал", style: {} },
  { name: "Clarendon", style: { filter: "contrast(1.2) saturate(1.35)" }, overlay: { color: "#7ec8e3", blendMode: "screen", opacity: 0.1 } },
  { name: "Gingham", style: { filter: "brightness(1.05) hue-rotate(-10deg) contrast(0.9)" } },
  { name: "Moon", style: { filter: "grayscale(1) contrast(1.1) brightness(1.1)" } },
  { name: "Lark", style: { filter: "contrast(0.9) brightness(1.1) saturate(0.85)" }, overlay: { color: "#f5f0e1", blendMode: "lighten", opacity: 0.12 } },
  { name: "Reyes", style: { filter: "sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)" } },
  { name: "Juno", style: { filter: "saturate(1.4) contrast(1.1) brightness(1.02)" }, overlay: { color: "#f5a623", blendMode: "multiply", opacity: 0.07 } },
  { name: "Slumber", style: { filter: "saturate(0.66) brightness(1.05)" }, overlay: { color: "#45244d", blendMode: "lighten", opacity: 0.15 } },
  { name: "Crema", style: { filter: "sepia(0.15) contrast(0.9) brightness(1.1) saturate(0.85)" } },
  { name: "Ludwig", style: { filter: "contrast(1.05) brightness(1.05) saturate(0.9)" }, overlay: { color: "#e8d5b7", blendMode: "screen", opacity: 0.1 } },
  { name: "Aden", style: { filter: "hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)" } },
  { name: "Perpetua", style: { filter: "contrast(1.1) brightness(1.25) saturate(1.05)" }, overlay: { color: "#005b9a", blendMode: "screen", opacity: 0.08 } },
  { name: "Amaro", style: { filter: "hue-rotate(-10deg) contrast(0.9) brightness(1.1) saturate(1.5)" } },
  { name: "Mayfair", style: { filter: "contrast(1.1) saturate(1.1) brightness(1.05)" }, overlay: { color: "#f69176", blendMode: "screen", opacity: 0.05 } },
  { name: "Rise", style: { filter: "brightness(1.05) sepia(0.2) contrast(0.9) saturate(0.9)" }, overlay: { color: "#f4e4cf", blendMode: "screen", opacity: 0.15 } },
  { name: "Hudson", style: { filter: "contrast(0.9) brightness(1.2) saturate(1.1)" }, overlay: { color: "#a6b1ff", blendMode: "multiply", opacity: 0.1 } },
  { name: "Valencia", style: { filter: "contrast(1.08) brightness(1.08) sepia(0.15)" } },
  { name: "X-Pro II", style: { filter: "contrast(1.45) brightness(1.3) saturate(1.4) sepia(0.3)" } },
  { name: "Sierra", style: { filter: "contrast(0.8) saturate(1.8)" }, overlay: { color: "#e8c1f4", blendMode: "screen", opacity: 0.1 } },
  { name: "Willow", style: { filter: "grayscale(0.5) contrast(0.95) brightness(0.9)" } },
  { name: "Lo-Fi", style: { filter: "saturate(1.4) contrast(1.5)" } },
];
