/**
 * Video call contexts — public API.
 *
 * This module re-exports everything needed by consumers of the video call system.
 *
 * ─── Specialized hooks (preferred for new code) ───────────────────────────────
 *
 *   useVideoCallSignaling()  — signaling state + call-lifecycle actions.
 *                              Re-renders only on status/call/connectionState changes.
 *
 *   useVideoCallMedia()      — streams + mute/video toggles.
 *                              Re-renders only on media state changes.
 *
 *   useVideoCallUI()         — isCallUiActive flag.
 *                              Re-renders only on UI-lock changes.
 *
 * ─── Backward-compatible hook ─────────────────────────────────────────────────
 *
 *   useVideoCallContext()    — merged view of all three contexts.
 *                              Equivalent to the old useVideoCallContext from VideoCallContext.tsx.
 *                              Re-renders on ANY context change — use specialized hooks for
 *                              performance-critical components.
 *
 * ─── Provider ─────────────────────────────────────────────────────────────────
 *
 *   VideoCallProvider        — wrap your app tree once; provides all three contexts.
 *
 * ─── Types ────────────────────────────────────────────────────────────────────
 *
 *   VideoCall, VideoCallStatus
 *   VideoCallSignalingContextType
 *   VideoCallMediaContextType
 *   VideoCallUIContextType
 *   VideoCallContextType (backward-compatible merged type)
 */

// Types
export type {
  VideoCall,
  VideoCallStatus,
  VideoCallSignalingContextType,
  VideoCallMediaContextType,
  VideoCallUIContextType,
  VideoCallContextType,
} from "./types";

// Contexts (for advanced consumers that need the raw context object)
export { VideoCallSignalingContext } from "./VideoCallSignalingContext";
export { VideoCallMediaContext } from "./VideoCallMediaContext";
export { VideoCallUIContext } from "./VideoCallUIContext";

// Specialized hooks
export { useVideoCallSignaling } from "./VideoCallSignalingContext";
export { useVideoCallMedia } from "./VideoCallMediaContext";
export { useVideoCallUI } from "./VideoCallUIContext";

// Composite provider
export { VideoCallProvider } from "./VideoCallProvider";

// ─── Backward-compatible merged hook ──────────────────────────────────────────
import { useVideoCallSignaling } from "./VideoCallSignalingContext";
import { useVideoCallMedia } from "./VideoCallMediaContext";
import { useVideoCallUI } from "./VideoCallUIContext";
import type { VideoCallContextType } from "./types";

/**
 * useVideoCallContext — backward-compatible hook.
 *
 * Returns the full merged VideoCallContextType identical to the original API.
 * All existing consumers continue to work without any changes.
 *
 * Performance note: This hook subscribes to ALL three contexts, so it will
 * re-render on any change. For components that only use a subset, prefer
 * the specialized hooks.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useVideoCallContext(): VideoCallContextType {
  const signaling = useVideoCallSignaling();
  const media = useVideoCallMedia();
  const ui = useVideoCallUI();

  // Return a merged object. Since all three hooks are called unconditionally,
  // React's rules of hooks are not violated. The object is reconstructed on
  // each render of the consumer (which is fine — consumers re-render anyway
  // when any of the three contexts update).
  return {
    // Signaling
    status: signaling.status,
    currentCall: signaling.currentCall,
    incomingCall: signaling.incomingCall,
    connectionState: signaling.connectionState,
    startCall: signaling.startCall,
    answerCall: signaling.answerCall,
    declineCall: signaling.declineCall,
    endCall: signaling.endCall,
    retryConnection: signaling.retryConnection,
    // Media
    localStream: media.localStream,
    remoteStream: media.remoteStream,
    isMuted: media.isMuted,
    isVideoOff: media.isVideoOff,
    toggleMute: media.toggleMute,
    toggleVideo: media.toggleVideo,
    // UI
    isCallUiActive: ui.isCallUiActive,
  };
}
