/**
 * VideoCallUIContext
 *
 * Provides only the UI-lock flag isCallUiActive.
 *
 * Re-render scope: Only consumers of THIS context re-render when the UI-lock
 * state changes (activated before getUserMedia, released on call end/error).
 * Signaling and media changes do NOT trigger re-renders here.
 *
 * Usage note: This context exists to prevent UI flash when the browser
 * shows a permissions dialog (status temporarily reverts to "idle" during
 * the prompt). Consumers that render the call UI overlay should subscribe
 * to this context to stay visible through permission prompts.
 */

import { createContext, useContext } from "react";
import type { VideoCallUIContextType } from "./types";

export const VideoCallUIContext =
  createContext<VideoCallUIContextType | null>(null);

/**
 * Hook for UI-lock consumers (GlobalCallOverlay, etc.).
 *
 * Optimized re-render: will NOT re-render on signaling or media state changes.
 *
 * Usage:
 *   const { isCallUiActive } = useVideoCallUI();
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useVideoCallUI(): VideoCallUIContextType {
  const ctx = useContext(VideoCallUIContext);
  if (!ctx) {
    throw new Error(
      "useVideoCallUI must be used within VideoCallProvider"
    );
  }
  return ctx;
}
