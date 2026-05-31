/**
 * Call Session — operational state management for a single call.
 *
 * Owns:
 * - FSM state (callState)
 * - Session metadata (callId, roomId, participants)
 * - Snapshot emission for UI subscription
 *
 * Does NOT own:
 * - UI state (isCallUiActive, toasts)
 * - Server-side durable state (DB records)
 */

import type { CallState, CallEvent } from "@/calls-v2/callStateMachine";
import { transition, isCallActive, isCallConnecting, isCallConnected, isCallRinging, isCallTerminal } from "@/calls-v2/callStateMachine";
import type { VideoCall, ConnectionState } from "@/calls-v2/types";
import type { CallSnapshot, CallPhase, SignalingState, MediaState, CryptoState } from "../domain/call.types";

type SnapshotListener = (snapshot: CallSnapshot) => void;

/**
 * Maps internal CallState to UI-friendly CallPhase.
 */
function callStateToPhase(state: CallState): CallPhase {
  if (state === "idle") return "idle";
  if (state === "ended") return "ended";
  if (state === "failed") return "failed";
  if (state === "reconnecting") return "reconnecting";
  if (state === "in_call") return "connected";
  if (state === "outgoing_ringing" || state === "incoming_ringing") return "ringing";
  return "connecting";
}

/**
 * Maps ConnectionState to SignalingState.
 */
function connectionStateToSignaling(state: ConnectionState): SignalingState {
  const map: Record<ConnectionState, SignalingState> = {
    connected: "connected",
    connecting: "connecting",
    disconnected: "disconnected",
    reconnecting: "reconnecting",
    authenticated: "connected",
    failed: "failed",
  };
  return map[state] ?? "disconnected";
}

/**
 * Call Session — manages single call lifecycle.
 *
 * Usage:
 * ```ts
 * const session = new CallSession();
 * session.onSnapshot(snapshot => setUI(snapshot));
 *
 * session.dispatch("CALLER_INITIATE");
 * session.setCall(call);
 * ```
 */
export class CallSession {
  private _callState: CallState = "idle";
  private _connectionState: ConnectionState = "disconnected";
  private _currentCall: VideoCall | null = null;
  private _mediaState: MediaState = "idle";
  private _cryptoState: CryptoState = "disabled";
  private _error: CallSnapshot["error"] = undefined;

  private _listeners = new Set<SnapshotListener>();

  // ─── State accessors ───────────────────────────────────────────────────────

  get callState(): CallState {
    return this._callState;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get currentCall(): VideoCall | null {
    return this._currentCall;
  }

  get isActive(): boolean {
    return isCallActive(this._callState);
  }

  get isConnecting(): boolean {
    return isCallConnecting(this._callState);
  }

  get isConnected(): boolean {
    return isCallConnected(this._callState);
  }

  get isRinging(): boolean {
    return isCallRinging(this._callState);
  }

  get isTerminal(): boolean {
    return isCallTerminal(this._callState);
  }

  // ─── Snapshot ───────────────────────────────────────────────────────────────

  /**
   * Get current immutable snapshot for UI consumption.
   */
  getSnapshot(): CallSnapshot {
    return {
      phase: callStateToPhase(this._callState),
      signaling: connectionStateToSignaling(this._connectionState),
      media: this._mediaState,
      crypto: this._cryptoState,
      error: this._error,
    };
  }

  /**
   * Subscribe to snapshot changes. Returns unsubscribe function.
   */
  onSnapshot(listener: SnapshotListener): () => void {
    this._listeners.add(listener);
    // Emit current state immediately
    listener(this.getSnapshot());
    return () => this._listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this._listeners.forEach((l) => l(snapshot));
  }

  // ─── FSM dispatch ──────────────────────────────────────────────────────────

  /**
   * Dispatch FSM event. Returns new state or null if invalid.
   */
  dispatch(event: CallEvent): CallState | null {
    const next = transition(this._callState, event);
    if (next === null) {
      console.warn(`[CallSession] Invalid transition: ${this._callState} + ${event}`);
      return null;
    }

    const prev = this._callState;
    this._callState = next;
    this.emit();

    console.info(`[CallSession] FSM: ${prev} + ${event} → ${next}`);
    return next;
  }

  // ─── Setters ───────────────────────────────────────────────────────────────

  setCall(call: VideoCall): void {
    this._currentCall = call;
    this.emit();
  }

  setConnectionState(state: ConnectionState): void {
    this._connectionState = state;
    this.emit();
  }

  setMediaState(state: MediaState): void {
    this._mediaState = state;
    this.emit();
  }

  setCryptoState(state: CryptoState): void {
    this._cryptoState = state;
    this.emit();
  }

  setError(error: CallSnapshot["error"]): void {
    this._error = error;
    this.emit();
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Reset session to idle state. Call after call ends.
   */
  reset(): void {
    this._callState = "idle";
    this._connectionState = "disconnected";
    this._currentCall = null;
    this._mediaState = "idle";
    this._cryptoState = "disabled";
    this._error = undefined;
    this.emit();
  }

  /**
   * Destroy session. Remove all listeners.
   */
  destroy(): void {
    this._listeners.clear();
  }
}

// ─── Session Registry ──────────────────────────────────────────────────────────

/**
 * Registry for active call sessions.
 * Ensures single session per (userId, callId) pair.
 */
export class CallSessionRegistry {
  private _sessions = new Map<string, CallSession>();

  private key(userId: string, callId: string): string {
    return `${userId}:${callId}`;
  }

  getOrCreate(userId: string, callId: string): CallSession {
    const k = this.key(userId, callId);
    let session = this._sessions.get(k);
    if (!session) {
      session = new CallSession();
      this._sessions.set(k, session);
    }
    return session;
  }

  get(userId: string, callId: string): CallSession | undefined {
    return this._sessions.get(this.key(userId, callId));
  }

  remove(userId: string, callId: string): void {
    const session = this.get(userId, callId);
    if (session) {
      session.destroy();
      this._sessions.delete(this.key(userId, callId));
    }
  }

  clear(): void {
    this._sessions.forEach((s) => s.destroy());
    this._sessions.clear();
  }
}

// Singleton for app-wide access
export const callSessionRegistry = new CallSessionRegistry();