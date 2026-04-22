/**
 * Domain-split VideoCall context types.
 *
 * Architecture:
 *  - VideoCallSignalingContextType  — WebRTC/call lifecycle: status, currentCall, incomingCall,
 *                                     connectionState, and all call-lifecycle actions.
 *  - VideoCallMediaContextType      — Media state: local/remote streams, mute/video toggles.
 *  - VideoCallUIContextType         — UI-lock flag that persists through permission prompts.
 *  - VideoCallContextType           — Backward-compatible merged type (all three combined).
 *
 * Security note: Types are pure interfaces with no runtime side-effects.
 * No credential or key material is ever present in context values — those live in refs
 * inside VideoCallProvider and are never exposed to consumers.
 */

export type { VideoCall, VideoCallStatus } from "@/hooks/useVideoCallSfu";
import type { VideoCall, VideoCallStatus } from "@/hooks/useVideoCallSfu";
export type { CallState } from "@/calls-v2/callStateMachine";
import type { CallState } from "@/calls-v2/callStateMachine";

// ─── Signaling domain ──────────────────────────────────────────────────────────

/** Minimal profile info shown on the call screen before the call record is loaded from DB. */
export interface CalleeProfile {
  display_name: string;
  avatar_url?: string | null;
}

export interface VideoCallSignalingContextType {
  /** Current call lifecycle state machine position. */
  status: VideoCallStatus;
  /** FSM-derived call state — primary source of truth for call phase. */
  callState: CallState;
  /** Active call object (caller or callee, after negotiation). */
  currentCall: VideoCall | null;
  /** Pending incoming call waiting to be accepted or declined. */
  incomingCall: VideoCall | null;
  /** RTCPeerConnection / SFU transport connection state string. */
  connectionState: string;
  /**
   * Profile of the callee set immediately when startCall is invoked.
   * Used to display the correct name/avatar BEFORE the call record is loaded from DB.
   */
  pendingCalleeProfile: CalleeProfile | null;

  /**
   * Initiate an outbound call.
   * Activates UI-lock BEFORE getUserMedia to prevent UI flash during permission prompts.
   * Returns the created VideoCall on success, null on error (error already toasted).
   */
  startCall: (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio",
    calleeProfile?: CalleeProfile
  ) => Promise<VideoCall | null>;

  /**
   * Accept an incoming call.
   * Activates UI-lock BEFORE getUserMedia.
   */
  answerCall: (call: VideoCall) => Promise<void>;

  /** Decline the current incoming call (updates DB to "declined"). */
  declineCall: () => Promise<void>;

  /** End the active call or decline the pending incoming call. */
  endCall: () => Promise<void>;

  /** Force ICE restart / new TURN credential fetch without ending the call. */
  retryConnection: () => Promise<void>;
}

// ─── Media domain ──────────────────────────────────────────────────────────────
export interface VideoCallMediaContextType {
  /** Local camera/mic MediaStream. Null when no call is active. */
  localStream: MediaStream | null;
  /** Remote peer MediaStream assembled from SFU consumers. Null when no remote tracks. */
  remoteStream: MediaStream | null;
  /** Dedicated remote screen-share stream derived from extra remote video tracks. */
  remoteScreenStream: MediaStream | null;
  /** Whether local audio track is muted. */
  isMuted: boolean;
  /** Whether local video track is disabled. */
  isVideoOff: boolean;
  /** Whether local screen sharing is active. */
  isScreenSharing: boolean;
  /** Local screen-share preview stream. */
  screenStream: MediaStream | null;
  /** Whether noise suppression is enabled. */
  noiseSuppressionEnabled: boolean;
  /** Whether background blur is enabled. */
  backgroundBlurEnabled: boolean;
  /** Toggle microphone mute state. */
  toggleMute: () => void;
  /** Toggle camera on/off state. */
  toggleVideo: () => void;
  /** Toggle local screen sharing. */
  toggleScreenShare: () => Promise<void>;
  /** Toggle noise suppression. */
  toggleNoiseSuppression: () => Promise<void>;
  /** Toggle background blur. */
  toggleBackgroundBlur: () => Promise<void>;
}

// ─── UI domain ─────────────────────────────────────────────────────────────────
export interface VideoCallUIContextType {
  /**
   * UI-lock flag: true while a call is active or in setup phase (including during
   * browser permission prompts). Keeps call UI visible through transient status gaps.
   */
  isCallUiActive: boolean;
}

// ─── Backward-compatible merged type ──────────────────────────────────────────
/**
 * Full merged interface — identical to the original VideoCallContextType.
 * Used by useVideoCallContext() for backward compatibility.
 */
export type VideoCallContextType =
  VideoCallSignalingContextType &
  VideoCallMediaContextType &
  VideoCallUIContextType;
