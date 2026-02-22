import { createContext, useContext, ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { useVideoCall, type VideoCall, type VideoCallStatus } from "@/hooks/useVideoCall";
import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { onNativeCallAction } from "@/lib/native/callBridge";

interface VideoCallContextType {
  // State
  status: VideoCallStatus;
  currentCall: VideoCall | null;
  incomingCall: VideoCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  connectionState: string;
  isCallUiActive: boolean; // UI-lock flag to persist through permission prompts
  
  // Actions
  startCall: (calleeId: string, conversationId: string | null, callType: "video" | "audio") => Promise<VideoCall | null>;
  answerCall: (call: VideoCall) => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  retryConnection: () => Promise<void>;
}

const VideoCallContext = createContext<VideoCallContextType | null>(null);

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pendingIncomingCall, setPendingIncomingCall] = useState<VideoCall | null>(null);
  
  // UI-lock: keeps call UI visible even during transient status changes (permission prompts, etc.)
  const [isCallUiActive, setIsCallUiActive] = useState(false);
  const isCallUiActiveRef = useRef(false);
  
  // Sync ref with state for callbacks
  useEffect(() => {
    isCallUiActiveRef.current = isCallUiActive;
  }, [isCallUiActive]);

  const {
    status,
    currentCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    startCall: startVideoCall,
    answerCall: answerVideoCall,
    endCall: endVideoCall,
    toggleMute,
    toggleVideo,
    retryWithFreshCredentials,
  } = useVideoCall({
    onCallEnded: (call) => {
      console.log("[VideoCallContext] Call ended:", call.id.slice(0, 8));
      setPendingIncomingCall(null);
      setIsCallUiActive(false); // Release UI-lock on call end
    },
  });

  const { incomingCall: detectedIncomingCall, clearIncomingCall } = useIncomingCalls({
    onIncomingCall: (call) => {
      // Don't show incoming call if we're already in a call or UI-lock is active
      if (status !== "idle" || isCallUiActiveRef.current) {
        console.log("[VideoCallContext] Already in call or UI active, ignoring incoming");
        return;
      }
      console.log("[VideoCallContext] Setting pending incoming call:", call.id.slice(0, 8));
      setPendingIncomingCall(call);
    },
  });

  // Sync incoming call state - prioritize pendingIncomingCall to avoid flicker
  // Only show incoming call when we're truly idle AND UI-lock is not active
  const incomingCall = (status === "idle" && !isCallUiActive) ? pendingIncomingCall : null;
  
  // Debug logging
  console.log("[VideoCallContext] State:", { 
    status, 
    hasCurrentCall: !!currentCall, 
    hasPendingIncoming: !!pendingIncomingCall,
    hasDetectedIncoming: !!detectedIncomingCall,
    isCallUiActive,
  });

  const answerCall = useCallback(async (call: VideoCall) => {
    console.log("[VideoCallContext] answerCall: Activating UI-lock BEFORE getUserMedia");
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia
    setPendingIncomingCall(null);
    clearIncomingCall();
    
    try {
      await answerVideoCall(call);
    } catch (err) {
      console.error("[VideoCallContext] answerCall error:", err);
      setIsCallUiActive(false); // Release UI-lock on error
    }
  }, [answerVideoCall, clearIncomingCall]);

  const declineCall = useCallback(async () => {
    if (incomingCall || pendingIncomingCall) {
      const callToDecline = incomingCall || pendingIncomingCall;
      if (!callToDecline) return;
      
      // We don't use the hook's endCall since we haven't answered yet
      // Just update the DB directly
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase
        .from("video_calls")
        .update({
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callToDecline.id);
      
      setPendingIncomingCall(null);
      clearIncomingCall();
      setIsCallUiActive(false); // Release UI-lock
    }
  }, [incomingCall, pendingIncomingCall, clearIncomingCall]);

  const endCall = useCallback(async () => {
    console.log("[VideoCallContext] endCall called");
    if (currentCall) {
      await endVideoCall("ended");
    } else if (incomingCall || pendingIncomingCall) {
      await declineCall();
    }
    setIsCallUiActive(false); // Release UI-lock
  }, [currentCall, incomingCall, pendingIncomingCall, endVideoCall, declineCall]);

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio"
  ) => {
    if (!user) return null;
    
    console.log("[VideoCallContext] startCall: Activating UI-lock BEFORE startVideoCall");
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia (happens inside startVideoCall)
    
    try {
      const result = await startVideoCall(calleeId, conversationId, callType);
      if (!result) {
        console.log("[VideoCallContext] startCall returned null, releasing UI-lock");
        setIsCallUiActive(false); // Release UI-lock if call failed
        // Show permission error toast
        toast.error(
          callType === "video" 
            ? "Нет доступа к камере или микрофону" 
            : "Нет доступа к микрофону",
          {
            description: "Разрешите доступ в настройках браузера",
            duration: 5000,
          }
        );
      }
      return result;
    } catch (err) {
      console.error("[VideoCallContext] startCall error:", err);
      setIsCallUiActive(false); // Release UI-lock on error
      toast.error("Ошибка при начале звонка", {
        description: "Попробуйте ещё раз",
        duration: 4000,
      });
      return null;
    }
  }, [user, startVideoCall]);

  const retryConnection = useCallback(async () => {
    await retryWithFreshCredentials();
  }, [retryWithFreshCredentials]);

  const value: VideoCallContextType = {
    status,
    currentCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    isCallUiActive,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    retryConnection,
  };

  useEffect(() => {
    return onNativeCallAction(async (action) => {
      const actionType = action.type;
      const incomingLike = pendingIncomingCall ?? incomingCall;
      const matchesIncoming = incomingLike?.id === action.callId;
      const matchesCurrent = currentCall?.id === action.callId;

      if ((actionType === "accept" || actionType === "answer") && incomingLike && matchesIncoming) {
        await answerCall(incomingLike);
        return;
      }

      if ((actionType === "decline" || actionType === "reject") && matchesIncoming) {
        await declineCall();
        return;
      }

      if ((actionType === "end" || actionType === "disconnect") && matchesCurrent) {
        await endCall();
      }
    });
  }, [pendingIncomingCall, incomingCall, currentCall, answerCall, declineCall, endCall]);

  return (
    <VideoCallContext.Provider value={value}>
      {children}
    </VideoCallContext.Provider>
  );
}

export function useVideoCallContext() {
  const context = useContext(VideoCallContext);
  if (!context) {
    throw new Error("useVideoCallContext must be used within VideoCallProvider");
  }
  return context;
}

// Re-export types
export type { VideoCall, VideoCallStatus };
