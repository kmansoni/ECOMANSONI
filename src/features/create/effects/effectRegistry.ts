import { createContext, useContext } from "react";

export interface EffectDefinition {
  id: string;
  label: string;
  category: "color" | "distortion" | "filter" | "artistic";
  description?: string;
  capabilities?: {
    gpu?: boolean;
    livePreview?: boolean;
    adjustable?: boolean;
  };
  defaultParams?: Record<string, unknown>;
}

const EFFECT_REGISTRY: EffectDefinition[] = [
  {
    id: "none",
    label: "Original",
    category: "filter",
    description: "No effect applied",
  },
  {
    id: "grayscale",
    label: "Black & White",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "sepia",
    label: "Sepia",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "vintage",
    label: "Vintage",
    category: "artistic",
    capabilities: { livePreview: true },
  },
  {
    id: "noir",
    label: "Noir",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "dramatic",
    label: "Dramatic",
    category: "filter",
    capabilities: { livePreview: true, adjustable: true },
  },
  {
    id: "vivid",
    label: "Vivid",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "golden",
    label: "Golden",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "cool",
    label: "Cool",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "warm",
    label: "Warm",
    category: "color",
    capabilities: { livePreview: true },
  },
  {
    id: "blur",
    label: "Blur",
    category: "filter",
    capabilities: { livePreview: true, adjustable: true },
  },
  {
    id: "pixelate",
    label: "Pixelate",
    category: "artistic",
    capabilities: { livePreview: true, adjustable: true },
  },
  {
    id: "warp",
    label: "Warp",
    category: "distortion",
    capabilities: { gpu: true, livePreview: true, adjustable: true },
  },
];

export function useEffectRegistry() {
  return {
    effects: EFFECT_REGISTRY,
    getById: (id: string) => EFFECT_REGISTRY.find((e) => e.id === id),
    getByCategory: (category: EffectDefinition["category"]) =>
      EFFECT_REGISTRY.filter((e) => e.category === category),
  };
}

export const EffectRegistryContext = createContext({
  effects: EFFECT_REGISTRY,
  getById: (id: string) => EFFECT_REGISTRY.find((e) => e.id === id),
  getByCategory: (category: EffectDefinition["category"]) =>
    EFFECT_REGISTRY.filter((e) => e.category === category),
});

export function useEffectRegistryContext() {
  return useContext(EffectRegistryContext);
}