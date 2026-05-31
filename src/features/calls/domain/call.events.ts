/**
 * Call domain events — immutable event types for state machine transitions.
 * Part of the clean domain layer with no external dependencies.
 */

// Re-export CallEvent from FSM
export type { CallEvent } from "@/calls-v2/callStateMachine";

/**
 * Domain events that flow through the system.
 * Used for event sourcing / telemetry.
 */
export type DomainEvent =
  | { type: "CALLER_INITIATE"; payload: { calleeId: string; callType: "audio" | "video" } }
  | { type: "CALLEE_ACCEPT"; payload: { callId: string } }
  | { type: "INCOMING_OFFER"; payload: { callId: string; callerId: string } }
  | { type: "BOOTSTRAP_OK"; payload: { roomId: string } }
  | { type: "MEDIA_ACQUIRED"; payload: { hasVideo: boolean; hasAudio: boolean } }
  | { type: "TRANSPORT_CONNECTED"; payload: { direction: "send" | "recv" } }
  | { type: "REMOTE_MEDIA_READY"; payload: { peerCount: number } }
  | { type: "CONNECTION_LOST"; payload: { reason: string } }
  | { type: "CONNECTION_RESTORED"; payload: {} }
  | { type: "CALL_END"; payload: { reason: "user" | "remote" | "timeout" | "error" } }
  | { type: "ERROR"; payload: { code: string; message: string } }
  | { type: "E2EE_ACTIVATED"; payload: { epoch: number } }
  | { type: "E2EE_FAILED"; payload: { reason: string } };

/** Event metadata for logging/tracing. */
export interface EventMetadata {
  timestamp: number;
  callId?: string;
  roomId?: string;
  deviceId?: string;
  traceId?: string;
}