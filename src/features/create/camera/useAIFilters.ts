import { useCallback, useMemo, useRef, useState } from "react";
import type { EnhancementPreset, FilterKey } from "@/components/camera/CameraHost";

export interface AIFilterConfig {
  filter: FilterKey;
  intensity: number;
  cssFilter: string;
}

export interface EnhancementConfig {
  preset: EnhancementPreset;
  intensity: number;
  skinSmoothing: number;
  faceRetouch: boolean;
  backgroundBlur: number;
}

// Instagram 2025/2026 filter presets
export const INSTAGRAM_FILTERS: Record<string, { name: string; cssFilter: string; ai?: boolean }> = {
  none: { name: "Normal", cssFilter: "none" },
  vivid: { name: "Vivid", cssFilter: "saturate(1.35) contrast(1.15) brightness(1.05)" },
  vivid_warm: { name: "Warm Vivid", cssFilter: "saturate(1.4) contrast(1.1) sepia(0.2)" },
  vivid_cool: { name: "Cool Vivid", cssFilter: "saturate(1.3) contrast(1.12) hue-rotate(-8deg) brightness(1.03)" },
  dramatic: { name: "Dramatic", cssFilter: "contrast(1.35) saturate(0.9) brightness(0.95)" },
  dramatic_cool: { name: "Dramatic Cool", cssFilter: "contrast(1.4) saturate(0.85) hue-rotate(15deg) brightness(0.92)" },
  fade: { name: "Fade", cssFilter: "contrast(0.9) saturate(0.85) brightness(1.1)" },
  fade_warm: { name: "Fade Warm", cssFilter: "contrast(0.88) saturate(0.8) sepia(0.15) brightness(1.12)" },
  blackout: { name: "Blackout", cssFilter: "contrast(1.5) saturate(0.3) brightness(0.85)" },
  blackout_cool: { name: "Night Mode", cssFilter: "contrast(1.25) saturate(0.6) hue-rotate(20deg) brightness(0.75)" },
  glow: { name: "Glow", cssFilter: "brightness(1.15) contrast(1.05) saturate(1.2) blur(0.3px)" },
  soft_glow: { name: "Soft", cssFilter: "brightness(1.08) contrast(0.95) saturate(0.95) blur(0.5px)" },
  warm_glow: { name: "Warm Glow", cssFilter: "brightness(1.1) contrast(1.02) saturate(1.15) sepia(0.12)" },
  portrait: { name: "Portrait", cssFilter: "brightness(1.05) contrast(1.02) saturate(0.95) hue-rotate(-5deg)" },
  studio: { name: "Studio", cssFilter: "contrast(1.08) brightness(1.05) saturate(0.98)" },
  studio_cool: { name: "Studio Cool", cssFilter: "contrast(1.1) brightness(1.02) saturate(0.95) hue-rotate(8deg)" },
  matte: { name: "Matte", cssFilter: "contrast(0.95) saturate(0.9) brightness(1.05) gamma(1.1)" },
  classic: { name: "Classic", cssFilter: "sepia(0.25) contrast(1.05) saturate(0.9)" },
  vintage: { name: "Vintage", cssFilter: "sepia(0.35) contrast(1.1) saturate(0.85) hue-rotate(-10deg)" },
  modern: { name: "Modern", cssFilter: "contrast(1.05) saturate(1.1) brightness(1.02)" },
  cinematic: { name: "Cinematic", cssFilter: "contrast(1.2) saturate(0.85) hue-rotate(-5deg) brightness(0.95)" },
  teal_orange: { name: "Teal & Orange", cssFilter: "contrast(1.15) saturate(1.1) hue-rotate(-10deg) sepia(0.1)" },
  vintage_cool: { name: "Retro Cool", cssFilter: "contrast(1.08) saturate(0.8) hue-rotate(8deg) brightness(0.95)" },
  golden: { name: "Golden Hour", cssFilter: "sepia(0.3) saturate(1.2) brightness(1.08) contrast(1.05)" },
  nordic: { name: "Nordic", cssFilter: "contrast(1.05) saturate(0.9) brightness(1.08) hue-rotate(5deg)" },
  film: { name: "Film", cssFilter: "contrast(1.12) saturate(0.9) brightness(0.98) gamma(1.05)" },
  street: { name: "Street", cssFilter: "contrast(1.18) saturate(0.95) brightness(0.97)" },
  urban: { name: "Urban", cssFilter: "contrast(1.22) saturate(0.88) hue-rotate(-3deg)" },
  beach: { name: "Beach", cssFilter: "brightness(1.12) contrast(1.05) saturate(1.15) hue-rotate(-5deg)" },
  forest: { name: "Forest", cssFilter: "contrast(1.08) saturate(1.2) hue-rotate(10deg) brightness(0.98)" },
  sunset: { name: "Sunset", cssFilter: "contrast(1.12) saturate(1.3) sepia(0.25) hue-rotate(-8deg)" },
  dawn: { name: "Dawn", cssFilter: "contrast(0.95) saturate(0.85) sepia(0.2) brightness(1.1)" },
};

// Scene-based presets for AI auto mode
export const SCENE_PRESETS: Record<EnhancementPreset, AIFilterConfig> = {
  none: { filter: "none", intensity: 100, cssFilter: "none" },
  auto: { filter: "vivid", intensity: 80, cssFilter: "saturate(1.25) contrast(1.1)" },
  portrait: { filter: "warm", intensity: 90, cssFilter: "brightness(1.05) contrast(1.02) saturate(0.95)" },
  food: { filter: "warm", intensity: 95, cssFilter: "saturate(1.4) contrast(1.1) brightness(1.05) sepia(0.1)" },
  landscape: { filter: "vivid", intensity: 100, cssFilter: "saturate(1.3) contrast(1.15) brightness(1.02)" },
  night: { filter: "glow", intensity: 85, cssFilter: "brightness(1.2) contrast(1.1) saturate(1.1)" },
  hdr: { filter: "dramatic", intensity: 90, cssFilter: "contrast(1.3) saturate(1.1) brightness(1.02)" },
};

export interface UseAIFiltersReturn {
  currentFilter: FilterKey;
  filterIntensity: number;
  cssFilter: string;
  filters: typeof INSTAGRAM_FILTERS;
  scenePresets: typeof SCENE_PRESETS;
  setFilter: (filter: FilterKey) => void;
  setIntensity: (intensity: number) => void;
  applyPreset: (preset: EnhancementPreset) => void;
  computeCSSFilter: (filter: FilterKey, intensity: number) => string;
}

export function useAIFilters(): UseAIFiltersReturn {
  const [currentFilter, setCurrentFilter] = useState<FilterKey>("none");
  const [filterIntensity, setFilterIntensity] = useState<number>(100);

  const computeCSSFilter = useCallback((filter: FilterKey, intensity: number): string => {
    const baseFilter = INSTAGRAM_FILTERS[filter]?.cssFilter || "none";
    if (intensity >= 100) return baseFilter;
    if (intensity <= 0 || baseFilter === "none") return "none";

    // Interpolate between none and the filter
    // We'll use CSS custom properties for interpolation
    const normalizedIntensity = intensity / 100;

    // For simplicity, we'll adjust brightness/contrast as a proxy
    // Real implementation would need fragment shader for proper interpolation
    if (filter === "none") return "none";

    const adjustments = {
      saturate: (v: number) => 1 + (v - 1) * normalizedIntensity,
      contrast: (v: number) => 1 + (v - 1) * normalizedIntensity,
      brightness: (v: number) => 1 + (v - 1) * normalizedIntensity,
      sepia: (v: number) => v * normalizedIntensity,
      hueRotate: (v: number) => v * normalizedIntensity,
      blur: (v: number) => v * normalizedIntensity,
      grayscale: (v: number) => v * normalizedIntensity,
    };

    // Parse and adjust filter values
    let result = baseFilter;
    Object.entries(adjustments).forEach(([name, fn]) => {
      const regex = new RegExp(`${name}\\(([^)]+)\\)`, "g");
      result = result.replace(regex, (match, value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return match;
        const adjusted = fn(num);
        return `${name}(${adjusted.toFixed(2)})`;
      });
    });

    return result;
  }, []);

  const cssFilter = useMemo(
    () => computeCSSFilter(currentFilter, filterIntensity),
    [currentFilter, filterIntensity, computeCSSFilter]
  );

  const setFilter = useCallback((filter: FilterKey) => {
    setCurrentFilter(filter);
    if (filter === "none") {
      setFilterIntensity(0);
    } else if (filterIntensity === 0) {
      setFilterIntensity(100);
    }
  }, [filterIntensity]);

  const setIntensity = useCallback((intensity: number) => {
    setFilterIntensity(Math.max(0, Math.min(100, intensity)));
  }, []);

  const applyPreset = useCallback((preset: EnhancementPreset) => {
    const config = SCENE_PRESETS[preset];
    if (config) {
      setCurrentFilter(config.filter);
      setFilterIntensity(config.intensity);
    }
  }, []);

  return {
    currentFilter,
    filterIntensity,
    cssFilter,
    filters: INSTAGRAM_FILTERS,
    scenePresets: SCENE_PRESETS,
    setFilter,
    setIntensity,
    applyPreset,
    computeCSSFilter,
  };
}

// Enhancement processing hook (canvas-based)
export function useEnhancementProcessor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const initCanvas = useCallback((width: number, height: number) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    ctxRef.current = canvasRef.current.getContext("2d", { willReadFrequently: true });
    return ctxRef.current;
  }, []);

  const processImage = useCallback((
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    config: EnhancementConfig
  ): ImageData | null => {
    const ctx = ctxRef.current || initCanvas(source instanceof HTMLVideoElement ? source.videoWidth : 640, source instanceof HTMLVideoElement ? source.videoHeight : 480);
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;

    // Apply enhancements based on preset
    if (config.preset !== "none") {
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Basic adjustments
        const intensity = config.intensity / 100;

        // Contrast adjustment
        const contrastFactor = 1 + (config.preset === "hdr" ? 0.3 : config.preset === "night" ? 0.15 : 0.1) * intensity;
        r = Math.min(255, Math.max(0, ((r / 255 - 0.5) * contrastFactor + 0.5) * 255));
        g = Math.min(255, Math.max(0, ((g / 255 - 0.5) * contrastFactor + 0.5) * 255));
        b = Math.min(255, Math.max(0, ((b / 255 - 0.5) * contrastFactor + 0.5) * 255));

        // Saturation adjustment
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const satFactor = 1 + (config.preset === "portrait" ? -0.1 : config.preset === "night" ? 0.2 : 0.15) * intensity;
        r = Math.min(255, Math.max(0, gray + (r - gray) * satFactor));
        g = Math.min(255, Math.max(0, gray + (g - gray) * satFactor));
        b = Math.min(255, Math.max(0, gray + (b - gray) * satFactor));

        // Brightness adjustment
        const brightnessFactor = 1 + (config.preset === "night" ? 0.25 : config.preset === "portrait" ? 0.05 : 0) * intensity;
        r = Math.min(255, Math.max(0, r * brightnessFactor));
        g = Math.min(255, Math.max(0, g * brightnessFactor));
        b = Math.min(255, Math.max(0, b * brightnessFactor));

        // Skin smoothing (simple blur simulation for skin tones)
        if (config.skinSmoothing > 0) {
          const isSkin = r > 95 && g > 40 && b > 20 && r > b && Math.abs(r - g) > 15 && r > b;
          if (isSkin) {
            const smoothFactor = config.skinSmoothing / 100 * 0.3;
            r = Math.round(r * (1 - smoothFactor) + (r + g + b) / 3 * smoothFactor);
            g = Math.round(g * (1 - smoothFactor) + (r + g + b) / 3 * smoothFactor);
            b = Math.round(b * (1 - smoothFactor) + (r + g + b) / 3 * smoothFactor);
          }
        }

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return imageData;
  }, [initCanvas]);

  const getProcessedBlob = useCallback(async (
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    config: EnhancementConfig,
    format: "image/jpeg" | "image/png" = "image/jpeg",
    quality: number = 0.92
  ): Promise<Blob | null> => {
    processImage(source, config);
    if (!canvasRef.current) return null;

    return new Promise((resolve) => {
      canvasRef.current!.toBlob(
        (blob) => resolve(blob),
        format,
        quality
      );
    });
  }, [processImage]);

  return {
    initCanvas,
    processImage,
    getProcessedBlob,
    canvas: canvasRef.current,
  };
}
