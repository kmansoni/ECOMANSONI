/**
 * Call Actions Hook — start, answer, end, decline calls.
 *
 * Responsibility:
 *  - User-initiated call actions
 *  - Orchestrates bootstrap, signaling, media
 *  - Uses callbacks for notifications (NOT direct toast)
 */

import { useCallback } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { isCallConnecting } from "@/calls-v2/callStateMachine";
import { callNotifications } from "./notificationService";
import type { VideoCall, VideoCallStatus } from "@/hooks/useVideoCallSfu";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { CallState } from "@/calls-v2/callStateMachine";
import type { CalleeProfile } from "./types";

interface CallEngine {
  startVideoCall: (calleeId: string, conversationId: string | null, callType: "video" | "audio") => Promise<VideoCall | null>;
  answerVideoCall: (call: VideoCall) => Promise<void>;
  endVideoCall: (status: string) => Promise<void>;
}

interface LegacyEngine {
  startVideoCall: (calleeId: string, conversationId: string | null, callType: "video" | "audio") => Promise<VideoCall | null>;
  answerVideoCall: (call: VideoCall) => Promise<void>;
  endVideoCall: (status: string) => Promise<void>;
}

interface CallActionsDeps {
  user: { id: string } | null;
  legacyEngineActive: boolean;

  // Refs
  callsWsRef: { current: CallsWsClient | null };
  callsWsCallIdRef: { current: string | null };
  callStateRef: { current: CallState };
  activeCallsV2BootstrapCallIdRef: { current: string | null };
  unansweredCallTimerRef: { current: number | null };
  lastCallsBootstrapErrorRef: { current: Error | null };
  startCallInFlightRef: { current: boolean };
  answerCallInFlightRef: { current: boolean };
  endCallInFlightRef: { current: boolean };

  // Callbacks
  setIsCallUiActive: (v: boolean) => void;
  setPendingIncomingCall: (v: VideoCall | null) => void;
  setPendingCalleeProfile: (v: CalleeProfile | null) => void;

  // Actions
  engine: CallEngine;
  legacyEngine: LegacyEngine;
  bootstrapCallsV2RoomWithRetry: (
    call: VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null },
    role: "caller" | "callee"
  ) => Promise<boolean>;
  ensureCallsV2Connected: () => Promise<CallsWsClient | null>;
  closeCallsV2: () => void;

  // State
  incomingCall: VideoCall | null;
  pendingIncomingCall: VideoCall | null;
  currentCall: VideoCall | null;
  legacyCurrentCall: VideoCall | null;
  status: VideoCallStatus;
  connectionState: string;

  // FSM
  dispatchFsm: (event: import("@/calls-v2/callStateMachine").CallEvent) => CallState;
}

function isExpectedBootstrapFailure(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return (
    msg.includes("calls_v2_room_bootstrap_failed") ||
    msg.includes("ws connection error") ||
    msg.includes("websocket") ||
    msg.includes("network") ||
    msg.includes("timed out")
  );
}

export function useCallActions(deps: CallActionsDeps) {
  const {
    user,
    legacyEngineActive,
    callsWsRef,
    callsWsCallIdRef,
    callStateRef,
    activeCallsV2BootstrapCallIdRef,
    unansweredCallTimerRef,
    lastCallsBootstrapErrorRef,
    startCallInFlightRef,
    answerCallInFlightRef,
    endCallInFlightRef,
    setIsCallUiActive,
    setPendingIncomingCall,
    setPendingCalleeProfile,
    engine,
    legacyEngine,
    bootstrapCallsV2RoomWithRetry,
    ensureCallsV2Connected,
    closeCallsV2,
    incomingCall,
    pendingIncomingCall,
    currentCall,
    legacyCurrentCall,
    dispatchFsm,
  } = deps;

  // ─── Decline ────────────────────────────────────────────────────────────────

  const declineCall = useCallback(async () => {
    dispatchFsm("CALL_END");
    const call = incomingCall ?? pendingIncomingCall;
    if (!call) return;

    const ws = callsWsRef.current;
    if (ws && call.caller_id) {
      void ws.callDecline({ to: call.caller_id, callId: call.id })
        .catch((e) => logger.warn("[CallActions] decline failed", e));
    }

    await supabase
      .from("video_calls")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", call.id);

    setPendingIncomingCall(null);
    setIsCallUiActive(false);
  }, [incomingCall, pendingIncomingCall, callsWsRef, dispatchFsm, setIsCallUiActive, setPendingIncomingCall]);

  // ─── Answer ─────────────────────────────────────────────────────────────────

  const answerCall = useCallback(async (call: VideoCall) => {
    if (answerCallInFlightRef.current) {
      logger.warn("[CallActions] answerCall: in flight");
      return;
    }
    answerCallInFlightRef.current = true;

    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }

    if (!legacyEngineActive) {
      const configIssue = (await import("./videoCallProvider.helpers")).getCallsConfigIssue();
      if (configIssue) {
        callNotifications.callNotAvailable(configIssue);
        answerCallInFlightRef.current = false;
        return;
      }
    }

    setIsCallUiActive(true);
    setPendingIncomingCall(null);

    const ws = callsWsRef.current;
    if (ws && call.caller_id) {
      void ws.callAccept({ to: call.caller_id, callId: call.id })
        .catch((e) => logger.warn("[CallActions] callAccept failed", e));
    }

    try {
      if (legacyEngineActive) {
        await legacyEngine.answerVideoCall(call);
        dispatchFsm("CALLEE_ACCEPT");
        return;
      }

      await engine.answerVideoCall(call);
      activeCallsV2BootstrapCallIdRef.current = call.id;
      dispatchFsm("CALLEE_ACCEPT");

      // Fetch room hints
      let resolvedCall = call;
      try {
        const { data: fresh } = await supabase
          .from("video_calls")
          .select("id, calls_v2_room_id, calls_v2_join_token")
          .eq("id", call.id)
          .maybeSingle();
        if (fresh) {
          resolvedCall = { ...call, ...fresh };
        }
      } catch (e) {
        logger.warn("[CallActions] room hints refresh failed", e);
      }

      // Retry for room hints
      if (!("calls_v2_room_id" in resolvedCall) || !resolvedCall.calls_v2_room_id) {
        for (let attempt = 1; attempt <= 4; attempt++) {
          if (activeCallsV2BootstrapCallIdRef.current !== call.id) return;
          await new Promise<void>((r) => window.setTimeout(r, 1200 * attempt));
          if (activeCallsV2BootstrapCallIdRef.current !== call.id) return;
          try {
            const { data: hints } = await supabase
              .from("video_calls")
              .select("id, calls_v2_room_id, calls_v2_join_token")
              .eq("id", call.id)
              .maybeSingle();
            if (hints?.calls_v2_room_id) {
              resolvedCall = { ...call, ...hints };
              break;
            }
          } catch {}
        }
      }

      const ok = await bootstrapCallsV2RoomWithRetry(resolvedCall, "callee");
      if (ok && isCallConnecting(callStateRef.current)) dispatchFsm("BOOTSTRAP_OK");
      if (!ok) {
        if (!("calls_v2_room_id" in resolvedCall) || !resolvedCall.calls_v2_room_id) {
          logger.error("[CallActions] No SFU room hints");
        }
        await engine.endVideoCall("ended");
        closeCallsV2();
        setIsCallUiActive(false);
        callNotifications.sfusBootstrapFailed(
          lastCallsBootstrapErrorRef.current?.message ?? "Bootstrap failed"
        );
      }
    } catch (err) {
      dispatchFsm("ERROR");
      if (!isExpectedBootstrapFailure(err)) {
        logger.error("[CallActions] answerCall error", err);
      }
      if ((err as Error)?.name === "NotAllowedError") {
        callNotifications.mediaPermissionDenied("video");
      } else {
        callNotifications.callAnswerFailed("Ошибка сети или сервиса звонков");
      }
      setIsCallUiActive(false);
    } finally {
      answerCallInFlightRef.current = false;
    }
  }, [
    answerCallInFlightRef, unansweredCallTimerRef, legacyEngineActive,
    callsWsRef, callStateRef, activeCallsV2BootstrapCallIdRef,
    lastCallsBootstrapErrorRef, engine, legacyEngine,
    bootstrapCallsV2RoomWithRetry, closeCallsV2,
    dispatchFsm, setIsCallUiActive, setPendingIncomingCall,
  ]);

  // ─── End ───────────────────────────────────────────────────────────────────────

  const endCall = useCallback(async () => {
    if (endCallInFlightRef.current) {
      logger.warn("[CallActions] endCall: in flight");
      return;
    }
    endCallInFlightRef.current = true;

    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }

    try {
      dispatchFsm("CALL_END");
      const call = currentCall ?? legacyCurrentCall;
      const ws = callsWsRef.current;

      if (ws && call) {
        const peerId = call.caller_id === user?.id ? call.callee_id : call.caller_id;
        void ws.callHangup({ to: peerId, callId: call.id })
          .catch((e) => logger.warn("[CallActions] hangup failed", e));
      }

      if (legacyEngineActive) {
        if (legacyCurrentCall) await legacyEngine.endVideoCall("ended");
        else if (incomingCall || pendingIncomingCall) await declineCall();
      } else {
        if (currentCall) await engine.endVideoCall("ended");
        else if (incomingCall || pendingIncomingCall) await declineCall();
        closeCallsV2();
      }

      setIsCallUiActive(false);
    } finally {
      endCallInFlightRef.current = false;
    }
  }, [
    endCallInFlightRef, unansweredCallTimerRef, legacyEngineActive,
    callsWsRef, currentCall, legacyCurrentCall,
    incomingCall, pendingIncomingCall, user?.id,
    engine, legacyEngine, declineCall, closeCallsV2,
    dispatchFsm, setIsCallUiActive,
  ]);

  // ─── Start ────────────────────────────────────────────────────────────────────

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio",
    calleeProfile?: CalleeProfile
  ) => {
    if (!user) return null;

    if (startCallInFlightRef.current) {
      logger.warn("[CallActions] startCall: in flight");
      return null;
    }
    startCallInFlightRef.current = true;

    if (!legacyEngineActive) {
      const configIssue = (await import("./videoCallProvider.helpers")).getCallsConfigIssue();
      if (configIssue) {
        callNotifications.callNotAvailable(configIssue);
        startCallInFlightRef.current = false;
        return null;
      }
    }

    if (calleeProfile) setPendingCalleeProfile(calleeProfile);
    setIsCallUiActive(true);

    try {
      if (legacyEngineActive) {
        const result = await legacyEngine.startVideoCall(calleeId, conversationId, callType);
        if (result) {
          dispatchFsm("CALLER_INITIATE");
          return result;
        }
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        callNotifications.networkError();
        return null;
      }

      const result = await engine.startVideoCall(calleeId, conversationId, callType);
      if (!result) {
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        callNotifications.callFailed("Проверьте сеть и попробуйте снова");
        return null;
      }

      dispatchFsm("CALLER_INITIATE");
      activeCallsV2BootstrapCallIdRef.current = result.id;

      // Unanswered timeout
      if (unansweredCallTimerRef.current) window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = window.setTimeout(() => {
        unansweredCallTimerRef.current = null;
        const s = callStateRef.current;
        if (s === "outgoing_ringing" || s === "bootstrapping") {
          logger.info("[CallActions] Unanswered timeout");
          void engine.endVideoCall("ended").then(() => closeCallsV2());
          setPendingCalleeProfile(null);
          setIsCallUiActive(false);
          dispatchFsm("CALL_END");
          callNotifications.noAnswer();
        }
      }, 60_000);

       // Dispatch BOOTSTRAP_START asynchronously to allow UI to show outgoing_ringing state
       setTimeout(() => {
         dispatchFsm("BOOTSTRAP_START");
       }, 0);
       const ok = await bootstrapCallsV2RoomWithRetry(result, "caller");
      if (ok && callStateRef.current === "bootstrapping") dispatchFsm("BOOTSTRAP_OK");

      if (!ok) {
        if (activeCallsV2BootstrapCallIdRef.current !== result.id) return null;
        dispatchFsm("ERROR");
        logger.error("[CallActions] SFU bootstrap failed");
        await engine.endVideoCall("ended");
        closeCallsV2();
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        callNotifications.sfusBootstrapFailed(
          lastCallsBootstrapErrorRef.current?.message ?? "Bootstrap failed"
        );
        return null;
      }

      // Send invite
      const ws = callsWsRef.current ?? await ensureCallsV2Connected();
      const callResult = result as VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null };
      if (ws) {
        void ws.callInvite({
          to: calleeId,
          callId: result.id,
          callType,
          conversationId: conversationId ?? undefined,
          callsV2RoomId: callResult.calls_v2_room_id ?? null,
          callsV2JoinToken: callResult.calls_v2_join_token ?? null,
        }).catch((e) => logger.warn("[CallActions] callInvite failed", e));
      }

      return result;
    } catch (err) {
      dispatchFsm("ERROR");
      if (!isExpectedBootstrapFailure(err)) {
        logger.error("[CallActions] startCall error", err);
      }
      setPendingCalleeProfile(null);
      setIsCallUiActive(false);
      if ((err as Error)?.name === "NotAllowedError") {
        callNotifications.mediaPermissionDenied(callType);
      } else {
        callNotifications.networkError();
      }
      return null;
    } finally {
      startCallInFlightRef.current = false;
    }
  }, [
    user, legacyEngineActive, startCallInFlightRef, callsWsRef, callStateRef,
    activeCallsV2BootstrapCallIdRef, unansweredCallTimerRef, lastCallsBootstrapErrorRef,
    engine, legacyEngine, bootstrapCallsV2RoomWithRetry,
    ensureCallsV2Connected, closeCallsV2,
    dispatchFsm, setIsCallUiActive, setPendingCalleeProfile,
  ]);

  // ─── Retry ─────────────────────────────────────────────────────────────────

  const retryConnection = useCallback(async (
    legacyRetry: () => Promise<void>,
    retry: () => Promise<void>
  ) => {
    if (legacyEngineActive) {
      await legacyRetry();
      return;
    }
    const configIssue = (await import("./videoCallProvider.helpers")).getCallsConfigIssue();
    if (configIssue) {
      callNotifications.error({ title: "Повторное подключение недоступно", description: configIssue });
      return;
    }
    await retry();
  }, [legacyEngineActive]);

  return { startCall, answerCall, declineCall, endCall, retryConnection };
}