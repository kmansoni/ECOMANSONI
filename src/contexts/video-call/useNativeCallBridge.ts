import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { onNativeCallAction } from "@/lib/native/callBridge";
import type { VideoCall } from "@/hooks/useVideoCallSfu";
import type { CallsWsClient } from "@/calls-v2/wsClient";
import type { CallEvent } from "@/calls-v2/callStateMachine";
import type { MutableRefObject } from "react";

interface Params {
  pendingIncomingCall: VideoCall | null;
  incomingCall: VideoCall | null;
  currentCall: VideoCall | null;
  callsWsRef: MutableRefObject<CallsWsClient | null>;
  status: string;
  connectionState: string;
  answerCall: (call: VideoCall) => Promise<void>;
  declineCall: () => Promise<void>;
  dispatchFsm: (event: CallEvent) => void;
  releaseMediaWithoutDbUpdate: () => void;
  closeCallsV2: () => void;
  setIsCallUiActive: (v: boolean) => void;
  setPendingIncomingCall: (v: VideoCall | null) => void;
  setPendingCalleeProfile: (v: null) => void;
}

export function useNativeCallBridge({
  pendingIncomingCall,
  incomingCall,
  currentCall,
  callsWsRef,
  status,
  connectionState,
  answerCall,
  declineCall,
  dispatchFsm,
  releaseMediaWithoutDbUpdate,
  closeCallsV2,
  setIsCallUiActive,
  setPendingIncomingCall,
  setPendingCalleeProfile,
}: Params) {
  useEffect(() => {
    return onNativeCallAction(async (action) => {
      const { type: actionType, callId } = action;
      const incomingLike = pendingIncomingCall ?? incomingCall;
      const matchesIncoming = incomingLike?.id === callId;
      const matchesCurrent = currentCall?.id === callId;

      if ((actionType === "accept" || actionType === "answer") && incomingLike && matchesIncoming) {
        try {
          await answerCall(incomingLike);
        } catch (err) {
          logger.error("[useNativeCallBridge] answerCall failed", err);
        }
        return;
      }

      if ((actionType === "decline" || actionType === "reject") && matchesIncoming) {
        try {
          await declineCall();
        } catch (err) {
          logger.error("[useNativeCallBridge] declineCall failed", err);
        }
        return;
      }

      if ((actionType === "end" || actionType === "disconnect") && matchesCurrent) {
        logger.warn("[useNativeCallBridge] native end/disconnect — local fail-closed teardown", {
          callId,
          actionType,
          status,
          connectionState,
        });
        dispatchFsm("CALL_END");
        releaseMediaWithoutDbUpdate();
        closeCallsV2();
        dispatchFsm("CLEANUP_DONE");
        dispatchFsm("RESET");
        setPendingIncomingCall(null);
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
      }
    });
  }, [
    pendingIncomingCall,
    incomingCall,
    currentCall,
    callsWsRef,
    status,
    connectionState,
    answerCall,
    declineCall,
    dispatchFsm,
    releaseMediaWithoutDbUpdate,
    closeCallsV2,
    setIsCallUiActive,
    setPendingIncomingCall,
    setPendingCalleeProfile,
  ]);
}
