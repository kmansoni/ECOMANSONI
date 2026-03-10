/**
 * VideoCallContext — backward-compatible re-export shim.
 *
 * This file now delegates entirely to the decomposed sub-module at
 * `src/contexts/video-call/`. All original exports are preserved for
 * full backward compatibility:
 *
 *   - VideoCallProvider      → composite provider (3 contexts in one component)
 *   - useVideoCallContext()  → merged hook returning all fields (backward compat)
 *   - VideoCall              → type re-export
 *   - VideoCallStatus        → type re-export
 *
 * New specialized hooks (preferred for performance-critical consumers):
 *   - useVideoCallSignaling() — signaling-only, re-renders only on call state changes
 *   - useVideoCallMedia()     — media-only, re-renders only on stream/mute changes
 *   - useVideoCallUI()        — UI-lock only, re-renders only on isCallUiActive changes
 *
 * Migration path:
 *   Components that import `useVideoCallContext` and destructure only a subset of fields
 *   can be migrated to the specialized hooks at any time without breaking changes.
 *   The original import path continues to work unchanged.
 */

export {
  // Provider
  VideoCallProvider,
  // Backward-compatible merged hook
  useVideoCallContext,
  // Specialized hooks
  useVideoCallSignaling,
  useVideoCallMedia,
  useVideoCallUI,
  // Raw context objects (for advanced consumers)
  VideoCallSignalingContext,
  VideoCallMediaContext,
  VideoCallUIContext,
} from "./video-call/index";

export type {
  VideoCall,
  VideoCallStatus,
  VideoCallContextType,
  VideoCallSignalingContextType,
  VideoCallMediaContextType,
  VideoCallUIContextType,
} from "./video-call/index";
