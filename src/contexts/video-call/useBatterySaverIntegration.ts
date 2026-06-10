/**
 * Battery saver integration for calls.
 *
 * This module provides hooks to integrate battery monitoring with call quality.
 *
 * Usage in VideoCallProvider or useVideoCallSfu:
 *
 *   import { useBatterySaver } from "@/hooks/useBatterySaver";
 *
 *   const { getVideoQualitySettings, battery } = useBatterySaver({
 *     lowQuality: "audio-only",
 *     onActivate: () => toast.info("Экономия батареи: видео отключено"),
 *   });
 *
 * Full integration requires:
 * 1. Pass settings to acquireLocalMedia in useVideoCallSfu.ts
 * 2. Update video constraints based on quality settings
 * 3. Show UI indicator when battery saver is active
 */

// Re-export the hook for easy importing
export { useBatterySaver, isLowPowerModeActive } from "@/hooks/useBatterySaver";
export type { VideoQualitySettings, BatteryStatus } from "@/hooks/useBatterySaver";