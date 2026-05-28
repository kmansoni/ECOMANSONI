export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
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
