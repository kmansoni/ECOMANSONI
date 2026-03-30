/**
 * CallState Finite State Machine.
 *
 * Single source of truth for call lifecycle state.
 * Replaces the dual (status + connectionState) model.
 *
 * Design:
 * - Each state has an explicit list of valid transitions.
 * - `transition()` returns new state on valid input, throws on invalid.
 * - CALL_ENGINE_MODE gates whether legacy P2P fallback is allowed.
 */

// ─── Call engine mode ──────────────────────────────────────────────────────────
export type CallEngineMode = "sfu_only" | "compatibility";

const CALL_ENGINE_MODE_RAW = String(
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_CALL_ENGINE_MODE) ?? ""
).trim().toLowerCase();

/**
 * Production default: sfu_only.
 * "compatibility" allows legacy P2P fallback for callee when caller has no SFU room hints.
 */
export const CALL_ENGINE_MODE: CallEngineMode =
  CALL_ENGINE_MODE_RAW === "compatibility" ? "compatibility" : "sfu_only";

// ─── Call states ───────────────────────────────────────────────────────────────
export type CallState =
  | "idle"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "bootstrapping"
  | "signaling_ready"
  | "media_acquiring"
  | "transport_connecting"
  | "media_ready"
  | "in_call"
  | "reconnecting"
  | "ending"
  | "ended"
  | "failed";

// ─── Transition events ────────────────────────────────────────────────────────
export type CallEvent =
  | "CALLER_INITIATE"        // idle → outgoing_ringing
  | "CALLEE_ACCEPT"          // idle | incoming_ringing → bootstrapping
  | "INCOMING_OFFER"         // idle → incoming_ringing
  | "CALLEE_ANSWERED"        // outgoing_ringing → bootstrapping
  | "BOOTSTRAP_START"        // outgoing_ringing → bootstrapping (caller auto)
  | "BOOTSTRAP_OK"           // bootstrapping → signaling_ready
  | "SIGNALING_READY"        // signaling_ready → media_acquiring
  | "MEDIA_ACQUIRED"         // media_acquiring → transport_connecting
  | "TRANSPORT_CONNECTED"    // transport_connecting → media_ready
  | "REMOTE_MEDIA_READY"     // media_ready → in_call
  | "PROMOTE_IN_CALL"        // transport_connecting | media_ready → in_call (fallback timer)
  | "CONNECTION_LOST"        // in_call → reconnecting
  | "CONNECTION_RESTORED"    // reconnecting → in_call
  | "CALL_END"               // any active → ending
  | "CLEANUP_DONE"           // ending → ended
  | "ERROR"                  // any → failed
  | "RESET";                 // ended | failed → idle

// ─── Transition map ───────────────────────────────────────────────────────────
const TRANSITIONS: Record<CallState, Partial<Record<CallEvent, CallState>>> = {
  idle: {
    CALLER_INITIATE: "outgoing_ringing",
    INCOMING_OFFER: "incoming_ringing",
    CALLEE_ACCEPT: "bootstrapping",
  },
  outgoing_ringing: {
    CALLEE_ANSWERED: "bootstrapping",
    BOOTSTRAP_START: "bootstrapping",
    CALL_END: "ending",
    ERROR: "failed",
  },
  incoming_ringing: {
    CALLEE_ACCEPT: "bootstrapping",
    CALL_END: "ending",
    ERROR: "failed",
  },
  bootstrapping: {
    BOOTSTRAP_OK: "signaling_ready",
    CALL_END: "ending",
    ERROR: "failed",
  },
  signaling_ready: {
    SIGNALING_READY: "media_acquiring",
    MEDIA_ACQUIRED: "transport_connecting",
    CALL_END: "ending",
    ERROR: "failed",
  },
  media_acquiring: {
    MEDIA_ACQUIRED: "transport_connecting",
    CALL_END: "ending",
    ERROR: "failed",
  },
  transport_connecting: {
    TRANSPORT_CONNECTED: "media_ready",
    PROMOTE_IN_CALL: "in_call",
    CALL_END: "ending",
    ERROR: "failed",
  },
  media_ready: {
    REMOTE_MEDIA_READY: "in_call",
    PROMOTE_IN_CALL: "in_call",
    CALL_END: "ending",
    ERROR: "failed",
  },
  in_call: {
    CONNECTION_LOST: "reconnecting",
    CALL_END: "ending",
    ERROR: "failed",
  },
  reconnecting: {
    CONNECTION_RESTORED: "in_call",
    CALL_END: "ending",
    ERROR: "failed",
  },
  ending: {
    CLEANUP_DONE: "ended",
    ERROR: "failed",
  },
  ended: {
    RESET: "idle",
  },
  failed: {
    RESET: "idle",
    CALL_END: "ending",
  },
};

// ─── Transition function ──────────────────────────────────────────────────────

/**
 * Pure transition function. Returns the next state or `null` if the transition
 * is not defined (caller decides whether to throw or ignore).
 */
export function transition(current: CallState, event: CallEvent): CallState | null {
  return TRANSITIONS[current]?.[event] ?? null;
}

/**
 * Asserts transition is valid. Throws if not.
 * Use this in production paths where an invalid transition is a bug.
 */
export function assertTransition(current: CallState, event: CallEvent): CallState {
  const next = transition(current, event);
  if (next === null) {
    throw new Error(
      `[CallFSM] Invalid transition: ${current} + ${event}. ` +
      `Valid events: [${Object.keys(TRANSITIONS[current] || {}).join(", ")}]`
    );
  }
  return next;
}

// ─── State classification helpers ─────────────────────────────────────────────

/** States where a call is "active" (not idle, ended, or failed). */
const ACTIVE_STATES = new Set<CallState>([
  "outgoing_ringing",
  "incoming_ringing",
  "bootstrapping",
  "signaling_ready",
  "media_acquiring",
  "transport_connecting",
  "media_ready",
  "in_call",
  "reconnecting",
  "ending",
]);

export function isCallActive(state: CallState): boolean {
  return ACTIVE_STATES.has(state);
}

export function isCallConnected(state: CallState): boolean {
  return state === "in_call";
}

export function isCallConnecting(state: CallState): boolean {
  return state === "bootstrapping"
    || state === "signaling_ready"
    || state === "media_acquiring"
    || state === "transport_connecting"
    || state === "media_ready";
}

export function isCallRinging(state: CallState): boolean {
  return state === "outgoing_ringing" || state === "incoming_ringing";
}

export function isCallTerminal(state: CallState): boolean {
  return state === "ended" || state === "failed";
}

// ─── Legacy status bridge (temporary) ─────────────────────────────────────────
/**
 * Maps legacy VideoCallStatus + connectionState into CallState.
 * Used during migration — will be removed once all consumers use CallState directly.
 */
export function fromLegacyStatus(
  status: string,
  connectionState: string
): CallState {
  if (status === "idle") return "idle";
  if (status === "ended") return "ended";
  if (status === "calling") return "outgoing_ringing";
  if (status === "ringing") return "incoming_ringing";

  // status === "connected" — disambiguate by connectionState
  if (status === "connected") {
    if (connectionState === "connected") return "in_call";
    if (connectionState === "failed") return "failed";
    // "unknown" | "connecting" → still connecting
    return "transport_connecting";
  }

  // Unknown combination
  return "idle";
}
