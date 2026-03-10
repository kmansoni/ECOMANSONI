/**
 * VideoCallSignalingContext
 *
 * Provides call lifecycle state: status, currentCall, incomingCall, connectionState,
 * and all call-lifecycle actions (startCall, answerCall, declineCall, endCall, retryConnection).
 *
 * Re-render scope: Only consumers of THIS context re-render when signaling state changes.
 * Media state (streams, mute) changes do NOT trigger re-renders here.
 *
 * Security: No key material or credentials ever appear in context values.
 */

import { createContext, useContext } from "react";
import type { VideoCallSignalingContextType } from "./types";

export const VideoCallSignalingContext =
  createContext<VideoCallSignalingContextType | null>(null);

/**
 * Hook for signaling-only consumers.
 *
 * Optimized re-render: components that only need startCall/answerCall/etc.
 * will NOT re-render when media streams or UI-lock state change.
 *
 * Usage:
 *   const { startCall, status, currentCall } = useVideoCallSignaling();
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useVideoCallSignaling(): VideoCallSignalingContextType {
  const ctx = useContext(VideoCallSignalingContext);
  if (!ctx) {
    throw new Error(
      "useVideoCallSignaling must be used within VideoCallProvider"
    );
  }
  return ctx;
}
