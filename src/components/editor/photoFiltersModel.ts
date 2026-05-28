export interface PhotoFilterOverlay {
  color: string;
  opacity: number;
  blendMode: string;
}

export interface PhotoFilter {
  id: string;
  name: string;
  style: {
    filter?: string;
  };
  overlay?: PhotoFilterOverlay;
}

export const FILTERS: PhotoFilter[] = [
  { id: "original", name: "Original", style: {} },
  { id: "vivid", name: "Vivid", style: { filter: "saturate(1.25) contrast(1.08)" } },
  { id: "warm", name: "Warm", style: { filter: "sepia(0.18) saturate(1.15)" } },
  { id: "cool", name: "Cool", style: { filter: "hue-rotate(8deg) contrast(1.05)" } },
  { id: "mono", name: "Mono", style: { filter: "grayscale(1) contrast(1.05)" } },
  {
    id: "sunset",
    name: "Sunset",
    style: { filter: "saturate(1.2) contrast(1.05)" },
    overlay: { color: "#ff7a59", opacity: 0.12, blendMode: "soft-light" },
  },
  {
    id: "ocean",
    name: "Ocean",
    style: { filter: "saturate(1.05) hue-rotate(6deg)" },
    overlay: { color: "#3da9fc", opacity: 0.12, blendMode: "screen" },
  },
  { id: "lift", name: "Lift", style: { filter: "brightness(1.08) contrast(0.98)" } },
  { id: "drama", name: "Drama", style: { filter: "contrast(1.18) saturate(0.92)" } },
  { id: "fade", name: "Fade", style: { filter: "brightness(1.06) contrast(0.9)" } },
];
