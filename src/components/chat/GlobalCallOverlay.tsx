import { createPortal } from "react-dom";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { VideoCallScreen } from "./VideoCallScreen";
import { IncomingVideoCallSheet } from "./IncomingVideoCallSheet";

/**
 * Global overlay for video calls - renders call UI on top of everything.
 * Uses React Portal to render directly to document.body for iOS/Telegram WebView stability.
 * The isCallUiActive flag ensures UI persists through permission prompts and transient state changes.
 */
export function GlobalCallOverlay() {
  const {
    status,
    currentCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    isCallUiActive,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    retryConnection,
  } = useVideoCallContext();

  console.log("[GlobalCallOverlay] Render:", { 
    status, 
    hasCurrentCall: !!currentCall, 
    hasIncomingCall: !!incomingCall,
    isCallUiActive,
  });

  // Show active call screen if:
  // 1. isCallUiActive is true (UI-lock active - persists through permission prompts)
  // 2. OR status is not idle (actual call in progress)
  // This prevents the modal from closing during iOS/Telegram permission prompts
  if (isCallUiActive || status !== "idle") {
    console.log("[GlobalCallOverlay] Showing call screen, isCallUiActive:", isCallUiActive, "status:", status);
    
    const callScreen = (
      <VideoCallScreen
        call={currentCall}
        status={status}
        localStream={localStream}
        remoteStream={remoteStream}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        connectionState={connectionState}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onRetry={retryConnection}
      />
    );

    // Render via Portal to document.body for iOS WebView stability
    // This bypasses any parent transforms/overflow that might cause fixed positioning issues
    if (typeof document !== "undefined") {
      return createPortal(callScreen, document.body);
    }
    return callScreen;
  }

  // Show incoming call sheet for unanswered incoming calls
  // Only when UI-lock is NOT active (to prevent flicker between screens)
  if (incomingCall && status === "idle" && !isCallUiActive) {
    console.log("[GlobalCallOverlay] Showing incoming call sheet");
    
    const incomingSheet = (
      <IncomingVideoCallSheet
        call={incomingCall}
        onAccept={() => answerCall(incomingCall)}
        onDecline={declineCall}
      />
    );

    // Render via Portal to document.body for iOS WebView stability
    if (typeof document !== "undefined") {
      return createPortal(incomingSheet, document.body);
    }
    return incomingSheet;
  }

  return null;
}
