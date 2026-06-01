/**
 * Call domain types — pure interfaces, no runtime dependencies.
 * This file is the single source of truth for call data structures.
 */

// Re-export core types from calls-v2 (single source of truth)
export type {
  VideoCall,
  VideoCallStatus,
} from "@/calls-v2/types";

export type {
  CallState,
  CallEvent,
  CallEngineMode,
} from "@/calls-v2/callStateMachine";

// ─── Domain types ────────────────────────────────────────────────────────────

/** Minimal profile info shown on call screen before the call record loads from DB. */
export interface CalleeProfile {
  userId: string;
  display_name: string;
  avatar_url?: string | null;
}

/** Call snapshot — immutable read-only representation of current state. */
export interface CallSnapshot {
  phase: CallPhase;
  signaling: SignalingState;
  media: MediaState;
  crypto: CryptoState;
  error?: CallError;
}

/** Call lifecycle phases. */
export type CallPhase =
  | "idle"
  | "ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

/** Signaling connection state. */
export type SignalingState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

/** Media acquisition and transport state. */
export type MediaState =
  | "idle"
  | "acquiring"
  | "publishing"
  | "receiving"
  | "failed";

/** E2EE negotiation state. */
export type CryptoState =
  | "disabled"
  | "negotiating"
  | "active"
  | "failed";

/** Call error with classification. */
export interface CallError {
  code: CallErrorCode;
  message: string;
  retryable: boolean;
}

export type CallErrorCode =
  | "MEDIA_PERMISSION_DENIED"
  | "MEDIA_NOT_SUPPORTED"
  | "NETWORK_ERROR"
  | "WS_CONNECTION_FAILED"
  | "SFU_BOOTSTRAP_FAILED"
  | "MEDIA_BOOTSTRAP_FAILED"
  | "E2EE_KEY_EXCHANGE_FAILED"
  | "ROOM_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "UNKNOWN";

/** Call type variants. */
export type CallType = "audio" | "video";

/** Call role in the session. */
export type CallRole = "caller" | "callee";

/** Call direction. */
export type CallDirection = "outgoing" | "incoming";

// ─── State ownership annotations ──────────────────────────────────────────────

/**
 * State ownership model:
 * - Server: call_id, room_id, participants, created_at, ended_at (durable)
 * - Runtime: signaling state, media state, crypto epoch (operational)
 * - React: UI flags, pending call queue, panels (presentation)
 */