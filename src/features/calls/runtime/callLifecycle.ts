/**
 * Call Lifecycle — FSM event handlers and transition logic.
 *
 * This file contains the business logic for each state transition.
 * Use with CallSession.dispatch() to execute transitions.
 */

// Re-export CallEvent for convenience
export type { CallEvent } from "@/calls-v2/callStateMachine";

import type { CallState, CallEvent } from "@/calls-v2/callStateMachine";
import type { VideoCall } from "@/calls-v2/types";

/**
 * Pre-transition guard checks.
 * Returns null if transition is allowed, error message otherwise.
 */
export function canTransition(current: CallState, event: CallEvent): string | null {
  // Can always end call
  if (event === "CALL_END") return null;

  // Can always reset from terminal states
  if ((current === "ended" || current === "failed") && event === "RESET") return null;

  // Call initiation
  if (current === "idle" && (event === "CALLER_INITIATE" || event === "INCOMING_OFFER")) {
    return null;
  }

  // Callee accept (both from idle and incoming_ringing)
  if (event === "CALLEE_ACCEPT" && (current === "idle" || current === "incoming_ringing")) {
    return null;
  }

  // Bootstrap flow
  if (current === "outgoing_ringing" && (event === "BOOTSTRAP_START" || event === "CALLEE_ANSWERED")) {
    return null;
  }

  if (current === "incoming_ringing" && event === "CALLEE_ACCEPT") {
    return null;
  }

  // Bootstrap completion
  if (current === "bootstrapping" && event === "BOOTSTRAP_OK") {
    return null;
  }

  // Media flow
  if (current === "signaling_ready" && (event === "SIGNALING_READY" || event === "MEDIA_ACQUIRED")) {
    return null;
  }

  if (current === "media_acquiring" && event === "MEDIA_ACQUIRED") {
    return null;
  }

  if (current === "transport_connecting" && (event === "TRANSPORT_CONNECTED" || event === "PROMOTE_IN_CALL")) {
    return null;
  }

  if (current === "media_ready" && (event === "REMOTE_MEDIA_READY" || event === "PROMOTE_IN_CALL")) {
    return null;
  }

  // Call in progress
  if (current === "in_call" && event === "CONNECTION_LOST") {
    return null;
  }

  if (current === "reconnecting" && event === "CONNECTION_RESTORED") {
    return null;
  }

  // Error from any non-terminal state
  if (event === "ERROR" && !isTerminalState(current)) {
    return null;
  }

  // Cleanup
  if (current === "ending" && event === "CLEANUP_DONE") {
    return null;
  }

  // In-call end
  if (current === "in_call" && event === "CALL_END") {
    return null;
  }

  // Ringing end
  if ((current === "outgoing_ringing" || current === "incoming_ringing") && event === "CALL_END") {
    return null;
  }

  return `Invalid transition: ${current} + ${event}`;
}

function isTerminalState(state: CallState): boolean {
  return state === "ended" || state === "failed";
}

/**
 * Context for lifecycle handlers.
 */
export interface LifecycleContext {
  call: VideoCall | null;
  callId: string | null;
  roomId: string | null;
  role: "caller" | "callee" | null;
}

/**
 * Lifecycle event payload — data needed to execute transition.
 */
export interface LifecycleEvent {
  event: CallEvent;
  context: LifecycleContext;
  metadata?: {
    reason?: string;
    error?: string;
    timestamp?: number;
  };
}

/**
 * Handler result — outcome of processing a lifecycle event.
 */
export interface LifecycleResult {
  allowed: boolean;
  error?: string;
  sideEffects?: LifecycleSideEffect[];
}

/**
 * Side effects that should execute after successful transition.
 */
export type LifecycleSideEffect =
  | { type: "LOG"; message: string }
  | { type: "WS_SEND"; action: string; payload: unknown }
  | { type: "DB_UPDATE"; table: string; id: string; values: Record<string, unknown> }
  | { type: "CLEANUP"; resources: string[] };

/**
 * Process lifecycle event and return allowed status + side effects.
 */
export function processLifecycleEvent(event: LifecycleEvent): LifecycleResult {
  const { event: evt, context } = event;

  // Check guard
  const guardError = canTransition(context.call?.call_state as CallState ?? "idle", evt);
  if (guardError) {
    return { allowed: false, error: guardError };
  }

  // Collect side effects based on event
  const sideEffects: LifecycleSideEffect[] = [];

  switch (evt) {
    case "CALLER_INITIATE":
      sideEffects.push({ type: "LOG", message: `Initiating outgoing call to ${context.callId}` });
      sideEffects.push({ type: "WS_SEND", action: "call.invite", payload: { callId: context.callId } });
      break;

    case "CALLEE_ACCEPT":
      sideEffects.push({ type: "LOG", message: `Accepting call ${context.callId}` });
      sideEffects.push({ type: "WS_SEND", action: "call.accept", payload: { callId: context.callId } });
      sideEffects.push({ type: "DB_UPDATE", table: "video_calls", id: context.callId ?? "", values: { status: "active" } });
      break;

    case "CALL_END":
      sideEffects.push({ type: "LOG", message: `Ending call ${context.callId}` });
      sideEffects.push({ type: "WS_SEND", action: "call.hangup", payload: { callId: context.callId } });
      sideEffects.push({ type: "DB_UPDATE", table: "video_calls", id: context.callId ?? "", values: { status: "ended", ended_at: new Date().toISOString() } });
      break;

    case "ERROR":
      sideEffects.push({ type: "LOG", message: `Call error: ${event.metadata?.error}` });
      sideEffects.push({ type: "CLEANUP", resources: ["sfu", "ws", "media"] });
      break;

    case "CLEANUP_DONE":
      sideEffects.push({ type: "DB_UPDATE", table: "video_calls", id: context.callId ?? "", values: { status: "ended", ended_at: new Date().toISOString() } });
      break;
  }

  return { allowed: true, sideEffects };
}

/**
 * Transition labels for logging.
 */
export const EVENT_LABELS: Record<CallEvent, string> = {
  CALLER_INITIATE: "Начало вызова",
  CALLEE_ACCEPT: "Принятие вызова",
  INCOMING_OFFER: "Входящий вызов",
  CALLEE_ANSWERED: "Вызов принят",
  BOOTSTRAP_START: "Начало подключения",
  BOOTSTRAP_OK: "Сервер подключен",
  SIGNALING_READY: "Сигналинг готов",
  MEDIA_ACQUIRED: "Медиа получено",
  TRANSPORT_CONNECTED: "Транспорт подключен",
  REMOTE_MEDIA_READY: "Удалённый медиа готов",
  PROMOTE_IN_CALL: "Переход в звонок",
  CONNECTION_LOST: "Соединение потеряно",
  CONNECTION_RESTORED: "Соединение восстановлено",
  CALL_END: "Завершение вызова",
  CLEANUP_DONE: "Очистка завершена",
  ERROR: "Ошибка",
  RESET: "Сброс",
};