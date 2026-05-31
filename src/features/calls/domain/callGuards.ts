/**
 * Call guards — pure boolean functions for state classification.
 * These are safe to use in both runtime and UI layers.
 */

export {
  isCallActive,
  isCallConnected,
  isCallConnecting,
  isCallRinging,
  isCallTerminal,
} from "@/calls-v2/callStateMachine";

import type { CallState } from "@/calls-v2/callStateMachine";

/** States where UI should show a call UI (not idle/ended/failed). */
export function shouldShowCallUI(state: CallState): boolean {
  return (
    state === "outgoing_ringing" ||
    state === "incoming_ringing" ||
    state === "bootstrapping" ||
    state === "signaling_ready" ||
    state === "media_acquiring" ||
    state === "transport_connecting" ||
    state === "media_ready" ||
    state === "in_call" ||
    state === "reconnecting" ||
    state === "ending"
  );
}

/** States that allow starting a new call (idle only). */
export function canStartCall(state: CallState): boolean {
  return state === "idle";
}

/** States that allow answering an incoming call. */
export function canAnswerCall(state: CallState): boolean {
  return state === "incoming_ringing";
}

/** States that allow ending the call. */
export function canEndCall(state: CallState): boolean {
  return (
    state === "outgoing_ringing" ||
    state === "incoming_ringing" ||
    state === "bootstrapping" ||
    state === "signaling_ready" ||
    state === "media_acquiring" ||
    state === "transport_connecting" ||
    state === "media_ready" ||
    state === "in_call" ||
    state === "reconnecting"
  );
}

/** States where media tracks should be active. */
export function shouldHaveActiveMedia(state: CallState): boolean {
  return (
    state === "media_acquiring" ||
    state === "transport_connecting" ||
    state === "media_ready" ||
    state === "in_call" ||
    state === "reconnecting"
  );
}

/** States where E2EE should be negotiated. */
export function shouldNegotiateE2EE(state: CallState): boolean {
  return (
    state === "signaling_ready" ||
    state === "media_acquiring" ||
    state === "transport_connecting" ||
    state === "media_ready" ||
    state === "in_call"
  );
}

/** Human-readable label for call state. */
export function getCallStateLabel(state: CallState): string {
  const labels: Record<CallState, string> = {
    idle: "Готов",
    outgoing_ringing: "Вызов...",
    incoming_ringing: "Входящий",
    bootstrapping: "Подключение",
    signaling_ready: "Сервер",
    media_acquiring: "Камера",
    transport_connecting: "Транспорт",
    media_ready: "Медиа",
    in_call: "В разговоре",
    reconnecting: "Переподключение",
    ending: "Завершение",
    ended: "Завершён",
    failed: "Ошибка",
  };
  return labels[state];
}