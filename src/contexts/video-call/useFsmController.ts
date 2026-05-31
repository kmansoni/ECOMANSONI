/**
 * FSM Controller Hook — manages call state machine.
 *
 * Responsibility:
 *  - FSM transitions
 *  - State synchronization between ref and state
 *  - State guards
 */

import { useCallback, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import {
  transition,
  isCallActive,
  isCallConnected,
  isCallConnecting,
  isCallRinging,
  isCallTerminal,
  fromLegacyStatus,
  type CallState,
  type CallEvent,
} from "@/calls-v2/callStateMachine";

interface UseFsmControllerOptions {
  initialState?: CallState;
}

export function useFsmController(options: UseFsmControllerOptions = {}) {
  const [callState, setCallState] = useState<CallState>(options.initialState ?? "idle");
  const callStateRef = useRef<CallState>(options.initialState ?? "idle");

  /**
   * Dispatch FSM event. Updates both state and ref.
   */
  const dispatch = useCallback((event: CallEvent): CallState => {
    const prev = callStateRef.current;
    const next = transition(prev, event);

    if (next === null) {
      logger.warn("[FSM] Invalid transition", { prev, event });
      return prev;
    }

    callStateRef.current = next;
    setCallState(next);
    logger.info("[FSM] Transition", { prev, event, next });

    return next;
  }, []);

  /**
   * Force sync state (for recovery scenarios).
   */
  const sync = useCallback((next: CallState, reason: string) => {
    const prev = callStateRef.current;
    if (prev === next) return;

    callStateRef.current = next;
    setCallState(next);
    logger.warn("[FSM] Forced sync", { prev, next, reason });
  }, []);

  /**
   * Create state from legacy status (for migration).
   */
  const fromLegacy = useCallback((status: string, connectionState: string): CallState => {
    return fromLegacyStatus(status, connectionState);
  }, []);

  /**
   * Map legacy status to current state for recovery.
   */
  const mapLegacyForRecovery = useCallback((status: string, connectionState: string): CallState => {
    if (status === "idle") return "idle";
    if (status === "ended") return "ended";
    if (status === "calling") return "outgoing_ringing";
    if (status === "ringing") return "incoming_ringing";

    if (status === "connected") {
      if (connectionState === "connected") return "in_call";
      if (connectionState === "failed") return "failed";
      return "transport_connecting";
    }

    return "idle";
  }, []);

  return {
    callState,
    callStateRef,
    dispatch,
    sync,
    fromLegacy,
    mapLegacyForRecovery,

    // Guards
    isActive: () => isCallActive(callState),
    isConnected: () => isCallConnected(callState),
    isConnecting: () => isCallConnecting(callState),
    isRinging: () => isCallRinging(callState),
    isTerminal: () => isCallTerminal(callState),
  };
}