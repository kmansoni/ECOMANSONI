/**
 * SignalingViewModel — signaling lifecycle, FSM, call actions, WS management.
 *
 * Ownership:
 *  - Call FSM (callState)
 *  - Incoming call detection
 *  - Pending callee profile
 *  - UI-lock (isCallUiActive)
 *  - 60s unanswered timeout
 *  - Config validation
 *  - Sentry call context
 *
 * NOT owned here (wired via deps):
 *  - useVideoCallSfu.onCallEnded → calls closeCallsV2() + dispatchFsm("RESET")
 *    (handled inside this VM for simplicity; closeCallsV2/cleanup injected)
 *  - useVideoCallSfu.onRetryMediaBootstrap → handled by MediaViewModel
 *  - useVideoCallSfu.onLocalTrackReplaced → handled by MediaViewModel
 *
 * Exposes: signaling context value + imperative refs/callbacks for Provider
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { setCallContext } from "@/lib/callContext";
import { useVideoCallSfu, type VideoCall } from "@/hooks/useVideoCallSfu";
import { useVideoCall } from "@/hooks/useVideoCall";
import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { useAuth } from "@/hooks/useAuth";
import { CallsWsClient } from "@/calls-v2/wsClient";
import { supabase } from "@/integrations/supabase/client";
import {
  transition as fsmTransition,
  isCallConnecting,
  fromLegacyStatus,
  type CallState,
  type CallEvent,
} from "@/calls-v2/callStateMachine";
import type { VideoCallSignalingContextType, CalleeProfile } from "./types";
import {
  getCallsConfigIssue,
  getCallsConfigToastDescription,
  getCallsBootstrapToastPayload,
  isMediaErrorForCall,
  hasE2eeSupport,
  REQUIRE_SFRAME,
} from "./videoCallProvider.helpers";

interface SignalingViewModelDeps {
  legacyEngineActive: boolean;
  ensureCallsV2Connected: () => Promise<CallsWsClient | null>;
  bootstrapCallsV2Room: (
    call: VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null },
    role: "caller" | "callee",
  ) => Promise<boolean>;
  closeCallsV2: () => void;
  callsWsRef: React.MutableRefObject<CallsWsClient | null>;
  unansweredCallTimerRef: React.MutableRefObject<number | null>;
  activeCallsV2BootstrapCallIdRef: React.MutableRefObject<string | null>;
  lastCallsBootstrapErrorRef: React.MutableRefObject<Error | null>;
  onBootstrapOk: () => void;
}

export function useSignalingViewModel(deps: SignalingViewModelDeps) {
  const {
    legacyEngineActive,
    ensureCallsV2Connected,
    bootstrapCallsV2Room,
    closeCallsV2,
    callsWsRef,
    unansweredCallTimerRef,
    activeCallsV2BootstrapCallIdRef,
    lastCallsBootstrapErrorRef,
    onBootstrapOk,
  } = deps;

  const { user } = useAuth();

  // ─── FSM ──────────────────────────────────────────────────────────────
  const [callState, setCallState] = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");

  const dispatchFsm = useCallback((event: CallEvent): CallState => {
    const prev = callStateRef.current;
    const next = fsmTransition(prev, event);
    if (next === null) {
      logger.warn("[SignalingVM] invalid transition", { prev, event });
      return prev;
    }
    callStateRef.current = next;
    setCallState(next);
    logger.info("[SignalingVM] transition", { prev, event, next });
    return next;
  }, []);

  const syncCallState = useCallback((next: CallState, reason: string) => {
    const prev = callStateRef.current;
    if (prev === next) return;
    callStateRef.current = next;
    setCallState(next);
    logger.warn("[SignalingVM] forced sync", { prev, next, reason });
  }, []);

  // ─── Incoming call state ────────────────────────────────────────────
  const [pendingIncomingCall, setPendingIncomingCall] = useState<VideoCall | null>(null);
  const [pendingCalleeProfile, setPendingCalleeProfile] = useState<CalleeProfile | null>(null);
  const [isCallUiActive, setIsCallUiActive] = useState(false);

  // ─── SFU engine — AFTER useState/useCallback so activeStatus can reference them ─
  const {
    status,
    currentCall,
    startCall: startVideoCall,
    answerCall: answerVideoCall,
    endCall: endVideoCall,
    retryWithFreshCredentials,
    releaseMediaWithoutDbUpdate,
  } = useVideoCallSfu({
    onCallEnded: (call) => {
      logger.info("[SignalingVM] Call ended:", call.id.slice(0, 8));
      activeCallsV2BootstrapCallIdRef.current = null;
      closeCallsV2();
      setPendingIncomingCall(null);
      setPendingCalleeProfile(null);
      setIsCallUiActive(false);
      dispatchFsm("CLEANUP_DONE");
      dispatchFsm("RESET");
    },
    onRetryMediaBootstrap: async () => {
      // handled by MediaViewModel — no-op here
    },
    onLocalTrackReplaced: async () => {
      // handled by MediaViewModel — no-op here
    },
  });

  // ─── Legacy P2P engine ─────────────────────────────────────────────
  const {
    status: legacyStatus,
    currentCall: legacyCurrentCall,
    connectionState: legacyConnectionState,
    endCall: legacyEndVideoCall,
    retryWithFreshCredentials: legacyRetryWithFreshCredentials,
  } = useVideoCall({
    onCallEnded: () => {
      setPendingIncomingCall(null);
      setPendingCalleeProfile(null);
      setIsCallUiActive(false);
      dispatchFsm("CLEANUP_DONE");
      dispatchFsm("RESET");
    },
  });

  // ─── Derived state (AFTER hook calls) ─────────────────────────────
  const activeStatus = legacyEngineActive ? legacyStatus : status;
  const activeCurrentCall = legacyEngineActive ? legacyCurrentCall : currentCall;
  const incomingCall = (activeStatus === "idle" && !isCallUiActive) ? pendingIncomingCall : null;
  const connectionState = legacyEngineActive ? legacyConnectionState : undefined;
  const connectionStateForContext = connectionState ?? "";

  // ─── Incoming detection ─────────────────────────────────────────────
  const { incomingCall: detectedIncomingCall, clearIncomingCall } = useIncomingCalls({
    onIncomingCall: (call) => {
      if (activeStatus !== "idle" || isCallUiActive) {
        logger.info("[SignalingVM] Already in call or UI locked, ignoring incoming");
        return;
      }
      logger.info("[SignalingVM] Incoming call:", call.id.slice(0, 8));
      dispatchFsm("INCOMING_OFFER");
      setPendingIncomingCall(call);
    },
  });

  // ─── FSM drift detection ─────────────────────────────────────────────
  useEffect(() => {
    if (legacyEngineActive) return;
    if (callState === "idle" || callState === "ended") return;
    const expected = fromLegacyStatus(status, "");
    if (expected !== callState) {
      logger.warn("[SignalingVM:drift]", { expected, actual: callState, status });
      if (callState === "failed" && expected !== "failed" && expected !== "idle" && expected !== "ended") {
        syncCallState(expected, "legacy_status_drift_recovery");
      }
    }
  }, [status, legacyEngineActive, callState, syncCallState]);

  // ─── Guards ─────────────────────────────────────────────────────────
  const isExpectedCallsBootstrapFailure = useCallback((error: unknown): boolean => {
    const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
    return (
      message.includes("calls_v2_room_bootstrap_failed") ||
      message.includes("ws connection error") ||
      message.includes("websocket") ||
      message.includes("network") ||
      message.includes("timed out")
    );
  }, []);

  const checkConfigBlock = useCallback((): boolean => {
    if (legacyEngineActive) return false;
    const issue = getCallsConfigIssue();
    if (issue) {
      logger.error("[SignalingVM] Config blocked:", issue);
      toast.error("Звонок недоступен", {
        description: getCallsConfigToastDescription(issue),
        duration: 6000,
      });
      return true;
    }
    if (REQUIRE_SFRAME && !hasE2eeSupport()) {
      logger.error("[SignalingVM] Browser lacks Insertable Streams API");
      toast.error("Браузер не поддерживает защищённые звонки", {
        description: "Для зашифрованных звонков требуется Chrome 86+, Edge 86+ или Firefox 117+.",
        duration: 8000,
      });
      return true;
    }
    return false;
  }, [legacyEngineActive]);

  // ─── startCall ────────────────────────────────────────────────────────
  const startCallInFlightRef = useRef(false);

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio",
    calleeProfile?: CalleeProfile,
    bootstrapCallsV2RoomWithRetry?: (
      call: VideoCall,
      role: "caller" | "callee",
    ) => Promise<boolean>,
  ) => {
    if (!user) return null;

    if (startCallInFlightRef.current) {
      logger.warn("[SignalingVM] startCall ignored: already in flight");
      return null;
    }
    startCallInFlightRef.current = true;

    if (checkConfigBlock()) {
      startCallInFlightRef.current = false;
      return null;
    }

    if (calleeProfile) setPendingCalleeProfile(calleeProfile);
    setIsCallUiActive(true);

    try {
      const result = await startVideoCall(calleeId, conversationId, callType);
      if (!result) {
        logger.error("[SignalingVM] startVideoCall returned null");
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        toast.error("Не удалось начать звонок", {
          description: "Проверьте сеть и попробуйте снова",
          duration: 5000,
        });
        startCallInFlightRef.current = false;
        return null;
      }

      dispatchFsm("CALLER_INITIATE");
      activeCallsV2BootstrapCallIdRef.current = result.id;
      setCallContext({ callId: result.id, engine: "sfu", callType });

      // 60s unanswered timeout
      if (unansweredCallTimerRef.current) window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = window.setTimeout(() => {
        unansweredCallTimerRef.current = null;
        if (callStateRef.current === "outgoing_ringing" || callStateRef.current === "bootstrapping") {
          logger.info("[SignalingVM] Unanswered call timeout");
          void endVideoCall("ended").then(() => closeCallsV2());
          setPendingCalleeProfile(null);
          setIsCallUiActive(false);
          dispatchFsm("CALL_END");
          toast.info("Нет ответа", { duration: 3000 });
        }
      }, 60_000);

      dispatchFsm("BOOTSTRAP_START");

      const roomBootstrapOk = bootstrapCallsV2RoomWithRetry
        ? await bootstrapCallsV2RoomWithRetry(result, "caller")
        : await bootstrapCallsV2Room(result, "caller");

      if (roomBootstrapOk && callStateRef.current === "bootstrapping") {
        dispatchFsm("BOOTSTRAP_OK");
        onBootstrapOk();
      }

      if (!roomBootstrapOk) {
        if (activeCallsV2BootstrapCallIdRef.current !== result.id) {
          startCallInFlightRef.current = false;
          return null;
        }

        dispatchFsm("ERROR");
        logger.error("[SignalingVM] SFU bootstrap failed for caller — fail-closed, no P2P fallback");
        releaseMediaWithoutDbUpdate();
        await endVideoCall("ended");
        closeCallsV2();
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        const toastPayload = getCallsBootstrapToastPayload(lastCallsBootstrapErrorRef.current);
        toast.error(toastPayload.title, { description: toastPayload.description, duration: 5000 });
        startCallInFlightRef.current = false;
        return null;
      }

      // Deliver call.invite after bootstrap
      const ws = callsWsRef.current ?? await ensureCallsV2Connected();
      if (ws) {
        void ws.callInvite({
          to: calleeId,
          callId: result.id,
          callType,
          conversationId: conversationId ?? undefined,
          callsV2RoomId: (result as VideoCall & { calls_v2_room_id?: string | null }).calls_v2_room_id ?? null,
          callsV2JoinToken: (result as VideoCall & { calls_v2_join_token?: string | null }).calls_v2_join_token ?? null,
        }).catch((e) => logger.warn("[SignalingVM] callInvite WS failed", e));
      }

      startCallInFlightRef.current = false;
      return result;
    } catch (err) {
      dispatchFsm("ERROR");
      if (isExpectedCallsBootstrapFailure(err)) {
        logger.warn("[SignalingVM] startCall failed", err);
      } else {
        logger.error("[SignalingVM] startCall error:", err);
      }
      setPendingCalleeProfile(null);
      setIsCallUiActive(false);
      const payload = isMediaErrorForCall(err)
        ? { title: "Нет доступа к камере/микрофону", description: "Проверьте разрешения браузера" }
        : { title: "Не удалось начать звонок", description: "Ошибка сети или сервиса звонков. Попробуйте ещё раз" };
      toast.error(payload.title, { description: payload.description, duration: 5000 });
      startCallInFlightRef.current = false;
      return null;
    }
  }, [
    user, checkConfigBlock, startVideoCall, closeCallsV2, ensureCallsV2Connected,
    dispatchFsm, lastCallsBootstrapErrorRef, releaseMediaWithoutDbUpdate,
    onBootstrapOk,
  ]);

  // ─── answerCall ────────────────────────────────────────────────────
  const answerCallInFlightRef = useRef(false);

  const answerCall = useCallback(async (
    call: VideoCall,
    bootstrapCallsV2RoomWithRetry?: (
      call: VideoCall,
      role: "caller" | "callee",
    ) => Promise<boolean>,
  ) => {
    if (answerCallInFlightRef.current) {
      logger.warn("[SignalingVM] answerCall ignored: already in flight");
      return;
    }
    answerCallInFlightRef.current = true;

    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }

    if (!legacyEngineActive && checkConfigBlock()) {
      answerCallInFlightRef.current = false;
      return;
    }

    setIsCallUiActive(true);
    setPendingIncomingCall(null);
    clearIncomingCall();

    const wsForAccept = callsWsRef.current;
    if (wsForAccept && call?.caller_id) {
      void wsForAccept.callAccept({ to: call.caller_id, callId: call.id })
        .catch((e) => logger.warn("[SignalingVM] callAccept WS failed", e));
    }

    try {
      if (legacyEngineActive) {
        await legacyEndVideoCall("ended");
        dispatchFsm("CALLEE_ACCEPT");
        answerCallInFlightRef.current = false;
        return;
      }

      await answerVideoCall(call);
      activeCallsV2BootstrapCallIdRef.current = call.id;
      dispatchFsm("CALLEE_ACCEPT");
      setCallContext({ callId: call.id, engine: "sfu", callType: call.call_type as "audio" | "video" | undefined });

      // Refresh room hints from DB
      let resolvedCall = call;
      try {
        const { data: freshCall } = await supabase
          .from("video_calls")
          .select("id, calls_v2_room_id, calls_v2_join_token")
          .eq("id", call.id)
          .maybeSingle();
        if (freshCall) {
          resolvedCall = {
            ...resolvedCall,
            calls_v2_room_id: freshCall.calls_v2_room_id ?? null,
            calls_v2_join_token: freshCall.calls_v2_join_token ?? null,
          } as VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null };
        }
      } catch {
        // non-fatal — proceed with original call
      }

      // Retry fetching room hints with backoff (caller may persist slightly later)
      if (!(resolvedCall as any).calls_v2_room_id) {
        for (let attempt = 1; attempt <= 4 && !(resolvedCall as any).calls_v2_room_id; attempt++) {
          if (activeCallsV2BootstrapCallIdRef.current !== call.id) {
            logger.info("[SignalingVM] answerCall delayed room-hints retry aborted: stale call");
            answerCallInFlightRef.current = false;
            return;
          }
          await new Promise<void>((resolve) => { window.setTimeout(resolve, 1200 * attempt); });
          if (activeCallsV2BootstrapCallIdRef.current !== call.id) {
            logger.info("[SignalingVM] answerCall delayed room-hints fetch skipped: stale call");
            answerCallInFlightRef.current = false;
            return;
          }
          try {
            const { data: delayedHints } = await supabase
              .from("video_calls")
              .select("id, calls_v2_room_id, calls_v2_join_token")
              .eq("id", call.id)
              .maybeSingle();
            if (delayedHints?.calls_v2_room_id) {
              resolvedCall = {
                ...resolvedCall,
                calls_v2_room_id: delayedHints.calls_v2_room_id,
                calls_v2_join_token: delayedHints.calls_v2_join_token ?? null,
              } as any;
              logger.info("[SignalingVM] answerCall room-hints resolved after retry", { attempt });
            }
          } catch {
            // non-fatal
          }
        }
      }

      const roomBootstrapOk = bootstrapCallsV2RoomWithRetry
        ? await bootstrapCallsV2RoomWithRetry(resolvedCall, "callee")
        : await bootstrapCallsV2Room(resolvedCall, "callee");

      if (roomBootstrapOk && isCallConnecting(callStateRef.current)) {
        dispatchFsm("BOOTSTRAP_OK");
        onBootstrapOk();
      }

      if (!roomBootstrapOk) {
        if (activeCallsV2BootstrapCallIdRef.current !== call.id) {
          answerCallInFlightRef.current = false;
          return;
        }
        await endVideoCall("ended");
        closeCallsV2();
        setIsCallUiActive(false);
        const toastPayload = getCallsBootstrapToastPayload(lastCallsBootstrapErrorRef.current);
        toast.error(toastPayload.title, { description: toastPayload.description, duration: 5000 });
        answerCallInFlightRef.current = false;
        return;
      }
    } catch (err) {
      dispatchFsm("ERROR");
      if (isExpectedCallsBootstrapFailure(err)) {
        logger.warn("[SignalingVM] answerCall failed", err);
      } else {
        logger.error("[SignalingVM] answerCall error:", err);
      }
      if (isMediaErrorForCall(err)) {
        toast.error("Нет доступа к камере/микрофону", {
          description: "Проверьте разрешения браузера",
          duration: 5000,
        });
      } else {
        toast.error("Не удалось принять звонок", {
          description: "Ошибка сети или сервиса звонков. Попробуйте ещё раз",
          duration: 5000,
        });
      }
      setIsCallUiActive(false);
    } finally {
      answerCallInFlightRef.current = false;
    }
  }, [
    legacyEngineActive, checkConfigBlock, clearIncomingCall, answerVideoCall, endVideoCall,
    closeCallsV2, isCallConnecting, dispatchFsm, lastCallsBootstrapErrorRef, onBootstrapOk,
  ]);

  // ─── declineCall ────────────────────────────────────────────────────
  const declineCall = useCallback(async () => {
    dispatchFsm("CALL_END");
    const callToDecline = incomingCall || pendingIncomingCall;
    if (!callToDecline) return;

    const wsForDecline = callsWsRef.current;
    if (wsForDecline && callToDecline.caller_id) {
      void wsForDecline.callDecline({ to: callToDecline.caller_id, callId: callToDecline.id })
        .catch((e) => logger.warn("[SignalingVM] callDecline WS failed", e));
    }

    const { error } = await supabase
      .from("video_calls")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", callToDecline.id);
    if (error) logger.error("[SignalingVM] declineCall update failed", error);

    setPendingIncomingCall(null);
    clearIncomingCall();
    setIsCallUiActive(false);
  }, [incomingCall, pendingIncomingCall, clearIncomingCall, dispatchFsm]);

  // ─── endCall ──────────────────────────────────────────────────────
  const endCallInFlightRef = useRef(false);

  const endCall = useCallback(async () => {
    if (endCallInFlightRef.current) {
      logger.warn("[SignalingVM] endCall ignored: already in flight");
      return;
    }
    endCallInFlightRef.current = true;

    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }

    logger.info("[SignalingVM] endCall called");
    dispatchFsm("CALL_END");

    const callForHangup = activeCurrentCall ?? legacyCurrentCall;
    const wsForHangup = callsWsRef.current;
    if (wsForHangup && callForHangup) {
      const peerId = callForHangup.caller_id === user?.id
        ? callForHangup.callee_id ?? ""
        : callForHangup.caller_id ?? "";
      void wsForHangup.callHangup({ to: peerId, callId: callForHangup.id })
        .catch((e) => logger.warn("[SignalingVM] callHangup WS failed", e));
    }

    if (legacyEngineActive) {
      if (legacyCurrentCall) {
        await legacyEndVideoCall();
      } else if (incomingCall || pendingIncomingCall) {
        await declineCall();
      }
    } else {
      if (activeCurrentCall) {
        await endVideoCall("ended");
      } else if (incomingCall || pendingIncomingCall) {
        await declineCall();
      }
    }

    setIsCallUiActive(false);
    endCallInFlightRef.current = false;
  }, [
    user, legacyEngineActive, activeCurrentCall, legacyCurrentCall,
    incomingCall, pendingIncomingCall, declineCall, dispatchFsm,
  ]);

  // ─── retryConnection ──────────────────────────────────────────────
  const retryConnection = useCallback(async () => {
    if (legacyEngineActive) {
      await legacyRetryWithFreshCredentials();
      return;
    }
    const issue = getCallsConfigIssue();
    if (issue) {
      toast.error("Повторное подключение недоступно", {
        description: getCallsConfigToastDescription(issue),
        duration: 6000,
      });
      return;
    }
    if (callStateRef.current === "failed") {
      const mapped = fromLegacyStatus(status, "");
      const recoveredState: CallState =
        mapped === "failed" || mapped === "idle" || mapped === "ended"
          ? "transport_connecting"
          : mapped;
      syncCallState(recoveredState, "manual_retry");
    }
    await retryWithFreshCredentials();
  }, [legacyEngineActive, status, syncCallState, retryWithFreshCredentials, legacyRetryWithFreshCredentials]);

  // ─── Context value ─────────────────────────────────────────────────
  const signalingValue = useMemo<VideoCallSignalingContextType>(() => ({
    status: activeStatus,
    callState,
    currentCall: activeCurrentCall,
    incomingCall,
    connectionState: connectionStateForContext,
    pendingCalleeProfile,
    startCall,
    answerCall,
    declineCall,
    endCall,
    retryConnection,
  }), [
    activeStatus,
    callState,
    activeCurrentCall,
    incomingCall,
    connectionStateForContext,
    pendingCalleeProfile,
    startCall,
    answerCall,
    declineCall,
    endCall,
    retryConnection,
  ]);

  return {
    signalingValue,
    // Imperative refs for Provider
    callStateRef,
    dispatchFsm,
    syncCallState,
    // State setters / getters for Provider
    pendingIncomingCall,
    setPendingIncomingCall,
    pendingCalleeProfile,
    setPendingCalleeProfile,
    isCallUiActive,
    setIsCallUiActive,
    activeCallsV2BootstrapCallIdRef,
    unansweredCallTimerRef,
    // SFU engine callbacks exposed for MediaViewModel
    endVideoCall,
    releaseMediaWithoutDbUpdate,
  };
}
