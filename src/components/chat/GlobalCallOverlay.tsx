import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { VideoCallScreen } from "./VideoCallScreen";
import { IncomingVideoCallSheet } from "./IncomingVideoCallSheet";
import { logger } from "@/lib/logger";

/**
 * Global overlay for video calls - renders call UI on top of everything.
 * Uses React Portal to render directly to document.body for iOS/Telegram WebView stability.
 */
export function GlobalCallOverlay() {
  const {
    status,
    currentCall,
    incomingCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleNoiseSuppression,
    toggleBackgroundBlur,
    retryConnection,
    isE2eeActive,
    isCallUiActive,
  } = useVideoCallContext();

  logger.debug("[GlobalCallOverlay] Render", {
    status,
    hasCurrentCall: !!currentCall,
    hasIncomingCall: !!incomingCall,
    isCallUiActive: !!isCallUiActive,
  });

  const showActiveCall = isCallUiActive || status !== "idle";
  const showIncomingSheet = !!incomingCall && status === "idle" && !isCallUiActive;

  if (!showActiveCall && !showIncomingSheet) return null;

  const renderCallScreen = () => (
    <VideoCallScreen
      call={currentCall}
      pendingCalleeProfile={undefined}
      status={status}
      callState={callState}
      localStream={null}
      remoteStream={null}
      isMuted={false}
      isVideoOff={false}
      connectionState=""
      onEnd={endCall}
      onToggleMute={toggleMute}
      onToggleVideo={toggleVideo}
      onRetry={retryConnection}
      isScreenSharing={false}
      remoteScreenStream={null}
      onToggleScreenShare={toggleScreenShare}
      noiseSuppressionEnabled={false}
      onToggleNoiseSuppression={toggleNoiseSuppression}
      backgroundBlurEnabled={false}
      onToggleBackgroundBlur={toggleBackgroundBlur}
      isE2eeActive={isE2eeActive}
    />
  );

  const renderIncomingSheet = () => {
    if (!incomingCall) return null;
    return (
      <IncomingVideoCallSheet
        call={incomingCall}
        onAccept={() => answerCall(incomingCall)}
        onDecline={declineCall}
      />
    );
  };

  const portalTarget = typeof document !== "undefined" ? document.body : undefined;
  const transitionConfig = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: "easeInOut" as const },
  };

  const content = (
    <AnimatePresence mode="wait">
      {showActiveCall ? (
        <motion.div key="active-call" {...transitionConfig}>
          {renderCallScreen()}
        </motion.div>
      ) : showIncomingSheet ? (
        <motion.div key="incoming-call" {...transitionConfig}>
          {renderIncomingSheet()}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (portalTarget) {
    return createPortal(content, portalTarget);
  }
  return content;
}
