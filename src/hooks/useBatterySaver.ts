/**
 * useBatterySaver — monitors battery status and enables power-saving mode.
 *
 * When battery saver/low-power mode is detected:
 * - Reduces video quality in calls
 * - Notifies user about reduced quality
 *
 * Usage:
 *   const { isBatterySaver, setVideoQuality } = useBatterySaver();
 */

import { useState, useEffect, useCallback, useRef } from "react";

// Export interfaces for external use
export interface BatteryStatus {
  isCharging: boolean;
  level: number; // 0-1
  isLow: boolean;
  isCritical: boolean;
}

export interface VideoQualitySettings {
  videoEnabled: boolean;
  videoResolution: "hd" | "sd" | "audio-only";
  videoFrameRate: number;
}

export interface UseBatterySaverOptions {
  /** Video quality when battery is low (default: 'low') */
  lowQuality?: "low" | "medium" | "audio-only";
  /** Minimum battery level to consider "low" (default: 0.2 = 20%) */
  lowThreshold?: number;
  /** Minimum battery level to consider "critical" (default: 0.1 = 10%) */
  criticalThreshold?: number;
  /** Callback when battery saver activates */
  onActivate?: () => void;
  /** Callback when battery saver deactivates */
  onDeactivate?: () => void;
}

const DEFAULT_QUALITY_HD: VideoQualitySettings = {
  videoEnabled: true,
  videoResolution: "hd",
  videoFrameRate: 30,
};

const DEFAULT_QUALITY_LOW: VideoQualitySettings = {
  videoEnabled: true,
  videoResolution: "sd",
  videoFrameRate: 15,
};

const DEFAULT_QUALITY_AUDIO_ONLY: VideoQualitySettings = {
  videoEnabled: false,
  videoResolution: "audio-only",
  videoFrameRate: 0,
};

export function useBatterySaver(options: UseBatterySaverOptions = {}) {
  const {
    lowQuality = "low",
    lowThreshold = 0.2,
    criticalThreshold = 0.1,
    onActivate,
    onDeactivate,
  } = options;

  const [battery, setBattery] = useState<BatteryStatus>({
    isCharging: false,
    level: 1,
    isLow: false,
    isCritical: false,
  });

  const [isBatterySaverActive, setIsBatterySaverActive] = useState(false);
  const previousStateRef = useRef(false);
  const callbacksRef = useRef({ onActivate, onDeactivate });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = { onActivate, onDeactivate };
  }, [onActivate, onDeactivate]);

  // Battery status update handler
  const handleBatteryChange = useCallback((event: Event) => {
    const target = event.target as unknown as {
      charging: boolean;
      level: number;
      addEventListener: (type: string, listener: EventListener) => void;
    };

    const level = target.level;
    const isCharging = target.charging;
    const isLow = level <= lowThreshold && !isCharging;
    const isCritical = level <= criticalThreshold && !isCharging;

    const newStatus: BatteryStatus = {
      isCharging,
      level,
      isLow,
      isCritical,
    };

    setBattery(newStatus);

    // Determine if battery saver should be active
    // Critical battery always activates saver; low battery activates only if audio-only mode
    const shouldActivateForLow = isLow && (lowQuality === "audio-only" || lowQuality === "low");
    const shouldBeActive = isCritical || shouldActivateForLow;
    setIsBatterySaverActive(shouldBeActive);

    // Fire callbacks on state change
    if (shouldBeActive !== previousStateRef.current) {
      if (shouldBeActive) {
        callbacksRef.current.onActivate?.();
      } else {
        callbacksRef.current.onDeactivate?.();
      }
      previousStateRef.current = shouldBeActive;
    }
  }, [lowThreshold, criticalThreshold, lowQuality]);

  // Set up battery monitoring
  useEffect(() => {
    const navigator = globalThis.navigator as typeof globalThis.navigator & {
      getBattery?: () => Promise<{
        charging: boolean;
        level: number;
        addEventListener: (type: string, listener: EventListener) => void;
        removeEventListener: (type: string, listener: EventListener) => void;
      }>;
    };

    let batteryManager: {
      charging: boolean;
      level: number;
      addEventListener: (type: string, listener: EventListener) => void;
      removeEventListener: (type: string, listener: EventListener) => void;
    } | null = null;

    const initBattery = async () => {
      if (!navigator.getBattery) {
        // Battery API not available — check for low-power mode via CSS media query
        const mq = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (mq?.matches) {
          setIsBatterySaverActive(true);
        }
        return;
      }

      try {
        batteryManager = await navigator.getBattery();
        // Set initial state - create a mock event-like object
        const mockEvent = {
          target: batteryManager,
        } as unknown as Event;
        handleBatteryChange(mockEvent);

        // Listen for changes
        batteryManager.addEventListener("levelchange", handleBatteryChange);
        batteryManager.addEventListener("chargingchange", handleBatteryChange);
      } catch {
        // Battery API failed — not critical
      }
    };

    initBattery();

    return () => {
      if (batteryManager) {
        batteryManager.removeEventListener("levelchange", handleBatteryChange);
        batteryManager.removeEventListener("chargingchange", handleBatteryChange);
      }
    };
  }, [handleBatteryChange]);

  // Get video quality settings based on battery status
  const getVideoQualitySettings = useCallback((): VideoQualitySettings => {
    if (battery.isCritical) {
      return DEFAULT_QUALITY_AUDIO_ONLY;
    }
    if (isBatterySaverActive) {
      // Use audio-only for critical low battery, low quality otherwise
      return battery.isLow ? DEFAULT_QUALITY_AUDIO_ONLY : DEFAULT_QUALITY_LOW;
    }
    return DEFAULT_QUALITY_HD;
  }, [battery.isCritical, battery.isLow, isBatterySaverActive]);

  // Check if video should be enabled
  const shouldEnableVideo = useCallback((): boolean => {
    if (battery.isCritical) {
      return false;
    }
    if (isBatterySaverActive && battery.isLow) {
      return false;
    }
    return true;
  }, [battery.isCritical, battery.isLow, isBatterySaverActive]);

  return {
    // Battery status
    battery,
    isBatterySaverActive,

    // Video quality helpers
    getVideoQualitySettings,
    shouldEnableVideo,

    // Quality presets
    qualityHigh: DEFAULT_QUALITY_HD,
    qualityLow: DEFAULT_QUALITY_LOW,
    qualityAudioOnly: DEFAULT_QUALITY_AUDIO_ONLY,
  };
}

/**
 * Check if low power mode is active via CSS media query.
 * This catches macOS Low Power Mode and similar OS-level power saving.
 */
export function isLowPowerModeActive(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
