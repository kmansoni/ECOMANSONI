import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { VideoCallScreen } from "./VideoCallScreen";
import { IncomingVideoCallSheet } from "./IncomingVideoCallSheet";
import { logger } from "@/lib/logger";

/**
 * Global overlay for video calls - renders call UI on top of everything.
 * Uses React Portal to render directly to document.body for iOS/Telegram WebView stability.
 * The isCallUiActive flag ensures UI persists through permission prompts and transient state changes.
 *
 * Transitions:
 *   - Call UI and Incoming Sheet NEVER visible simultaneously (AnimatePresence mode="wait")
 *   - Incoming sheet exits before call screen enters, preventing z-index flicker
 */
export function GlobalCallOverlay() {
  const {
    status,
    callState,
    currentCall,
    incomingCall,
    localStream,
    remoteStream,
    remoteScreenStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    noiseSuppressionEnabled,
    backgroundBlurEnabled,
    connectionState,
    isCallUiActive,
    pendingCalleeProfile,
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
  } = useVideoCallContext();

  logger.debug("[GlobalCallOverlay] Render", {
    status,
    hasCurrentCall: !!currentCall,
    hasIncomingCall: !!incomingCall,
    isCallUiActive: !!isCallUiActive,
  });

  // Determine which UI mode we're in:
  // 1. ACTIVE CALL: UI-lock is true OR status is not idle (call in progress)
  // 2. INCOMING ONLY: incoming call exists, status is idle, UI-lock is NOT active
  // These are MUTUALLY EXCLUSIVE — AnimatePresence ensures clean transitions
  const showActiveCall = isCallUiActive || status !== "idle";
  const showIncomingSheet = incomingCall && status === "idle" && !isCallUiActive;

  if (!showActiveCall && !showIncomingSheet) {
    return null;
  }

  const renderCallScreen = () => (
    <VideoCallScreen
      call={currentCall}
      pendingCalleeProfile={pendingCalleeProfile}
      status={status}
      callState={callState}
      localStream={localStream}
      remoteStream={remoteStream}
      remoteScreenStream={remoteScreenStream}
      isMuted={isMuted}
      isVideoOff={isVideoOff}
      connectionState={connectionState}
      onEnd={endCall}
      onToggleMute={toggleMute}
      onToggleVideo={toggleVideo}
      onRetry={retryConnection}
      isScreenSharing={isScreenSharing}
      onToggleScreenShare={toggleScreenShare}
      noiseSuppressionEnabled={noiseSuppressionEnabled}
      onToggleNoiseSuppression={toggleNoiseSuppression}
      backgroundBlurEnabled={backgroundBlurEnabled}
      onToggleBackgroundBlur={toggleBackgroundBlur}
      isE2eeActive={isE2eeActive}
    />
  );

  const renderIncomingSheet = () => (
    <IncomingVideoCallSheet
      call={incomingCall}
      onAccept={() => answerCall(incomingCall)}
      onDecline={declineCall}
    />
  );

  // Render via Portal to document.body for iOS WebView stability
  const portalTarget = typeof document !== "undefined" ? document.body : undefined;

  const transitionConfig = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: "easeInOut" },
  };

  if (portalTarget) {
    return createPortal(
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
      </AnimatePresence>,
      portalTarget
    );
  }

  // SSR fallback — no portal available
  return (
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
}
