/**
 * VideoCallMediaContext
 *
 * Provides media state only: local/remote streams, mute/video toggles.
 *
 * Re-render scope: Only consumers of THIS context re-render when media state
 * changes (e.g., new track arrives, mute toggled). Signaling state changes
 * (status, currentCall, incomingCall) do NOT trigger re-renders here.
 *
 * Security: MediaStream objects are references only — tracks are managed inside
 * the SFU media manager and exposed read-only to UI consumers.
 */

import { createContext, useContext } from "react";
import type { VideoCallMediaContextType } from "./types";

export const VideoCallMediaContext =
  createContext<VideoCallMediaContextType | null>(null);

/**
 * Hook for media-only consumers (VideoCallScreen, etc.).
 *
 * Optimized re-render: will NOT re-render on signaling or UI-lock changes.
 *
 * Usage:
 *   const { localStream, remoteStream, isMuted, toggleMute } = useVideoCallMedia();
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useVideoCallMedia(): VideoCallMediaContextType {
  const ctx = useContext(VideoCallMediaContext);
  if (!ctx) {
    throw new Error(
      "useVideoCallMedia must be used within VideoCallProvider"
    );
  }
  return ctx;
}
