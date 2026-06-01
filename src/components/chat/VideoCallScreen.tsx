import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { logger } from "@/lib/logger";
import {
  ChevronLeft,
  Volume2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  RefreshCw,
  Monitor,
  Waves,
  Sparkles,
  FlipHorizontal,
  SwitchCamera,
  Lock,
  LockOpen,
} from "lucide-react";
import type { VideoCall, VideoCallStatus } from "@/contexts/VideoCallContext";
import type { CalleeProfile } from "@/contexts/video-call/types";
import type { CallState } from "@/calls-v2/callStateMachine";
import {
  isCallConnected,
  isCallRinging,
  isCallConnecting,
} from "@/calls-v2/callStateMachine";
import { getCallUiStatusText } from "@/calls-v2/callStateMachine";
import { useAuth } from "@/hooks/useAuth";
import { GlassControlButton } from "@/components/ui/glass/GlassControlButton";
import { CallStatusIndicator } from "@/components/ui/glass/CallStatusIndicator";
import { CallQualityBadge } from "@/components/chat/CallQualityBadge";
import { CallBackground } from "@/components/ui/glass/CallBackground";
import { GlassAvatarRing } from "@/components/ui/glass/GlassAvatarRing";
import MaskOverlay, { MASKS, type MaskId } from "@/components/mask/MaskOverlay";



type AudioOutputMode = "earpiece" | "speaker";

const SPEAKER_DEVICE_HINT = /(speaker|hands.?free|loud|динам|громк)/i;
const EARPIECE_DEVICE_HINT = /(earpiece|receiver|handset|телефон|разговор)/i;

function RingtonePlayer({ play }: { play: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audioRef.current) return;
    if (play) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [play]);
  return <audio ref={audioRef} src="/ringtone.mp3" loop style={{ display: "none" }} />;
}

async function pickAudioOutputDeviceId(mode: AudioOutputMode): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((device) => device.kind === "audiooutput");
  if (outputs.length === 0) return null;

  const preferredHint = mode === "speaker" ? SPEAKER_DEVICE_HINT : EARPIECE_DEVICE_HINT;
  const preferred = outputs.find((device) => preferredHint.test(device.label));
  if (preferred) return preferred.deviceId;

  const defaultOutput = outputs.find((device) => device.deviceId === "default");
  if (defaultOutput) return defaultOutput.deviceId;

  return outputs[0]?.deviceId ?? null;
}

async function applyAudioOutputMode(audioEl: HTMLAudioElement, mode: AudioOutputMode): Promise<void> {
  const maybeNativePlugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const routePlugin = (maybeNativePlugins?.CallAudioRoute ?? maybeNativePlugins?.AudioRoute ?? maybeNativePlugins?.InCallManager) as
    | { setAudioRoute?: (args: { route: AudioOutputMode }) => Promise<void> }
    | { setSpeakerphoneOn?: (args: { enabled: boolean }) => Promise<void> }
    | undefined;

  if (routePlugin && "setAudioRoute" in routePlugin && typeof routePlugin.setAudioRoute === "function") {
    await routePlugin.setAudioRoute({ route: mode });
    return;
  }

  if (routePlugin && "setSpeakerphoneOn" in routePlugin && typeof routePlugin.setSpeakerphoneOn === "function") {
    await routePlugin.setSpeakerphoneOn({ enabled: mode === "speaker" });
    return;
  }

  const sinkEl = audioEl as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
  if (typeof sinkEl.setSinkId !== "function") return;

  const deviceId = await pickAudioOutputDeviceId(mode);
  if (deviceId) {
    await sinkEl.setSinkId(deviceId);
  }
}

interface VideoCallScreenProps {
  call: VideoCall | null;
  pendingCalleeProfile?: CalleeProfile | null;
  status: VideoCallStatus;
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  connectionState: string;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onRetry: () => void;
  isScreenSharing?: boolean;
  remoteScreenStream?: MediaStream | null;
  onToggleScreenShare?: () => void;
  noiseSuppressionEnabled?: boolean;
  onToggleNoiseSuppression?: () => void;
  backgroundBlurEnabled?: boolean;
  onToggleBackgroundBlur?: () => void;
  isE2eeActive?: boolean;
}

export function VideoCallScreen({
  call,
  pendingCalleeProfile,
  status,
  callState,
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  connectionState,
  onEnd,
  onToggleMute,
  onToggleVideo,
  onRetry,
  isScreenSharing = false,
  remoteScreenStream = null,
  onToggleScreenShare,
  noiseSuppressionEnabled = false,
  onToggleNoiseSuppression,
  backgroundBlurEnabled = false,
  onToggleBackgroundBlur,
  isE2eeActive = false,
}: VideoCallScreenProps) {
  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null); // kept for stream attachment
  const audioOutRef = useRef<HTMLAudioElement>(null);
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [audioOutputMode, setAudioOutputMode] = useState<AudioOutputMode>("earpiece");
  const [isSelfMain, setIsSelfMain] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true);
  const [maskId, setMaskId] = useState<MaskId>("none");
  const [showMaskPicker, setShowMaskPicker] = useState(false);

  useEffect(() => {
    const audioEl = audioOutRef.current;
    if (!audioEl) return;
    applyAudioOutputMode(audioEl, audioOutputMode).catch((error) => {
      logger.debug("video-call-screen: failed to apply audio output mode", {
        mode: audioOutputMode,
        error,
      });
    });
  }, [audioOutputMode]);

  const shouldPlayRingtone = isCallRinging(callState);
  const isInitiator = call ? call.caller_id === user?.id : false;
  const otherProfile = call ? (isInitiator ? call.callee_profile : call.caller_profile) : null;
  const otherName = otherProfile?.display_name || pendingCalleeProfile?.display_name || "Собеседник";
  const otherAvatar = otherProfile?.avatar_url ?? pendingCalleeProfile?.avatar_url;
  const isVideoCall = call ? call.call_type === "video" : false;
  const isConnected = isCallConnected(callState);
  const hasRemoteAudio = remoteStream && remoteStream.getAudioTracks().length > 0;

  useEffect(() => {
    const audioElement = audioOutRef.current;
    if (!audioElement) return;
    if (remoteStream && hasRemoteAudio) {
      logger.debug("video-call-screen: attaching remote audio", {
        hasRemoteAudio,
        audioTracks: remoteStream.getAudioTracks().map(t => `${t.kind}:${t.readyState}`).join(", "),
        totalTracks: remoteStream.getTracks().length,
      });
      audioElement.srcObject = remoteStream;
      audioElement.play().catch(() => {
        logger.debug("video-call-screen: remote audio autoplay blocked");
      });
      return;
    }
    audioElement.pause();
    audioElement.srcObject = null;
  }, [remoteStream, hasRemoteAudio]);

  const hasRemoteVideo = isConnected && remoteStream && remoteStream.getVideoTracks().length > 0;

  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream) {
      logger.debug("video-call-screen: attaching local stream", { hasRemoteVideo });
      el.srcObject = localStream;
      el.play().catch(() => { logger.debug("video-call-screen: local video autoplay blocked"); });
      return;
    }
    if (el) el.srcObject = null;
  }, [localStream, hasRemoteVideo]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && remoteStream) {
      logger.debug("video-call-screen: attaching remote stream", {
        tracks: remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(", "),
      });
      el.srcObject = remoteStream;
      el.play().catch(() => { logger.debug("video-call-screen: remote video autoplay blocked"); });
      return;
    }
    if (el) el.srcObject = null;
  }, [remoteStream, hasRemoteVideo]);

  useEffect(() => {
    const el = remoteScreenRef.current;
    if (el && remoteScreenStream) {
      el.srcObject = remoteScreenStream;
      el.play().catch(() => { logger.debug("video-call-screen: remote screen autoplay blocked"); });
      return;
    }
    if (el) el.srcObject = null;
  }, [remoteScreenStream]);

  useEffect(() => {
    const el = pipVideoRef.current;
    if (el && remoteStream && hasRemoteVideo) {
      el.srcObject = remoteStream;
      el.play().catch(() => { logger.debug("video-call-screen: pip video autoplay blocked"); });
      return;
    }
    if (el) el.srcObject = null;
  }, [remoteStream, hasRemoteVideo]);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const showRetryButton = callState === "failed";
  const showWaitingUI = !showRetryButton && !isConnected;
  const hasRemoteScreen = isConnected && remoteScreenStream && remoteScreenStream.getVideoTracks().length > 0;

  // Определяем фазу ключевого обмена по состоянию FSM
  const getKeyExchangePhase = (): "none" | "identity" | "handshake" | "key_derivation" | "media_setup" | "done" => {
    if (!isCallConnecting(callState)) return "none";
    switch (callState) {
      case "bootstrapping": return "identity";
      case "signaling_ready": return "handshake";
      case "media_acquiring": return "key_derivation";
      case "transport_connecting": return "media_setup";
      case "media_ready": return "done";
      default: return "none";
    }
  };
  const keyExchangePhase = getKeyExchangePhase();

  const handleToggleAudioOutput = () => {
    setAudioOutputMode((prev) => (prev === "earpiece" ? "speaker" : "earpiece"));
  };

  const getCallStatusWithDetail = (): string => {
    const statusText = getCallUiStatusText(callState);
    if (showRetryButton) return statusText;
    if (!showWaitingUI) return statusText;
    switch (callState) {
      case "bootstrapping": return `${statusText} — Идентификация`;
      case "signaling_ready": return `${statusText} — Сигналинг`;
      case "media_acquiring": return `${statusText} — Доступ к медиа`;
      case "transport_connecting": return `${statusText} — Транспорт`;
      case "media_ready": return `${statusText} — Шифрование`;
      default: return statusText;
    }
  };

  // Skeleton placeholder для video во время подключения
  const VideoSkeleton = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-32 h-32 rounded-full bg-zinc-700/50 animate-pulse" />
        <div className="w-48 h-3 rounded-full bg-zinc-700/40 animate-pulse" />
        <div className="flex gap-2 mt-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-cyan-400/60 animate-bounce"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );

  // ─── Video call screen ───────────────────────────────────────────────────
  if (isVideoCall && !isVideoOff && localStream) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black z-[300] flex flex-col"
        data-call-state={callState}
        data-call-connected={isConnected ? "true" : "false"}
        data-connection-state={connectionState}
      >
        <RingtonePlayer play={shouldPlayRingtone} />
        <audio ref={audioOutRef} autoPlay playsInline style={{ display: "none" }} />

        <AnimatePresence mode="wait">
          {!hasRemoteVideo && showWaitingUI ? (
            <VideoSkeleton />
          ) : hasRemoteVideo ? (
            <motion.div
              key="remote-video"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 w-full h-full"
            >
              {/* Main video */}
              <video
                ref={localVideoRef}
                autoPlay playsInline muted
                className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
                style={{
                  transform: isMirrored ? 'scaleX(-1)' : 'none',
                  opacity: isSelfMain ? (isVideoOff ? 0.15 : 1) : 0,
                  pointerEvents: isSelfMain ? 'auto' : 'none',
                  zIndex: isSelfMain ? 1 : 0,
                }}
                onClick={() => setIsMirrored(m => !m)}
              />
              <video
                ref={remoteVideoRef}
                autoPlay playsInline
                className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
                style={{
                  opacity: isSelfMain ? 0 : 1,
                  pointerEvents: isSelfMain ? 'none' : 'auto',
                  zIndex: isSelfMain ? 0 : 1,
                }}
                onClick={() => setIsMirrored(m => !m)}
              />
              {isSelfMain && <MaskOverlay videoRef={localVideoRef} maskId={maskId} />}

              {/* PiP */}
              <div
                className="absolute top-20 right-4 w-28 h-40 z-10 cursor-pointer overflow-hidden rounded-2xl border-2 border-white/30 shadow-lg transition-transform hover:scale-105 active:scale-95"
                onClick={() => setIsSelfMain(s => !s)}
              >
                <div
                  className="w-full h-full"
                  style={{
                    transform: isSelfMain ? 'none' : (isMirrored ? 'scaleX(-1)' : 'none'),
                    opacity: isSelfMain ? 1 : (isVideoOff ? 0.15 : 1),
                  }}
                >
                  <PipVideo
                    srcRef={isSelfMain ? remoteVideoRef : localVideoRef}
                    mirrored={!isSelfMain && isMirrored}
                    dimmed={!isSelfMain && isVideoOff}
                  />
                </div>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 rounded-full px-2 py-0.5 text-[9px] text-white/70 flex items-center gap-1">
                  <SwitchCamera className="w-2.5 h-2.5" />
                  Сменить
                </div>
              </div>

              {/* Mask picker overlay */}
              {showMaskPicker && (
                <div className="absolute top-20 left-4 z-20 flex flex-col gap-2 bg-black/60 backdrop-blur-md rounded-2xl p-3">
                  {MASKS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setMaskId(m.id); setShowMaskPicker(false); }}
                      className={`px-3 py-1.5 rounded-xl text-sm text-white transition-all ${maskId === m.id ? 'bg-cyan-500/60' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Waiting overlay — всегда поверх видео при подключении */}
        <AnimatePresence>
          {showWaitingUI && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none"
            >
              {/* Градиентный фон только над avatar — не перекрываем всё видео */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center">
                <GlassAvatarRing
                  name={otherName}
                  seed={call?.id ?? otherName}
                  avatarUrl={otherAvatar}
                  size="lg"
                  isRinging={isCallRinging(callState)}
                  callState={callState}
                />
                <h3 className="text-2xl font-semibold text-white mt-6 mb-2 drop-shadow-lg">{otherName}</h3>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <CallStatusIndicator
                      callState={callState}
                      keyExchangePhase={keyExchangePhase}
                      showDetail
                    />
                    <span className="text-white/90 font-medium text-base">{getCallUiStatusText(callState)}</span>
                  </div>
                  {/* Animated ellipsis */}
                  {!showRetryButton && (
                    <span className="flex gap-0.5 ml-1">
                      {[0, 1, 2].map(i => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-white/80"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                        />
                      ))}
                    </span>
                  )}
                </div>
                {showRetryButton && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={onRetry}
                    className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-xl text-white pointer-events-auto"
                    style={{
                      background: "linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
                      border: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Повторить</span>
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top bar — всегда виден */}
        <div className="absolute top-0 left-0 right-0 p-4 pt-12 safe-area-top z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={onEnd}
              className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
              <span className="text-lg font-medium">Назад</span>
            </button>
            {isConnected && (
              <span className="text-white/90 text-base font-medium tabular-nums">{formatDuration(callDuration)}</span>
            )}
          </div>
        </div>

        <VideoCallControls
          audioOutputMode={audioOutputMode}
          onToggleAudioOutput={handleToggleAudioOutput}
          isVideoOff={isVideoOff}
          onToggleVideo={onToggleVideo}
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onEnd={onEnd}
          isConnected={isConnected}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={onToggleScreenShare}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          onToggleNoiseSuppression={onToggleNoiseSuppression}
          backgroundBlurEnabled={backgroundBlurEnabled}
          onToggleBackgroundBlur={onToggleBackgroundBlur}
          hasRemoteScreen={!!hasRemoteScreen}
          remoteScreenRef={remoteScreenRef}
          remoteScreenStream={remoteScreenStream}
          isMirrored={isMirrored}
          onToggleMirror={() => setIsMirrored(m => !m)}
          maskActive={maskId !== 'none'}
          onToggleMask={() => setShowMaskPicker(p => !p)}
        />
      </motion.div>
    );
  }

  // ─── Audio call screen (or video with camera off) ──────────────────────
  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col"
      data-call-state={callState}
      data-call-connected={isConnected ? "true" : "false"}
      data-connection-state={connectionState}
    >
      <RingtonePlayer play={shouldPlayRingtone} />
      <CallBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <div className="p-4 pt-12 safe-area-top">
          <button onClick={onEnd} className="flex items-center text-white/80 hover:text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
            <span className="text-lg">Назад</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center -mt-16">
          <div className="flex items-center gap-3 mb-3">
            <CallStatusIndicator
              callState={callState}
              keyExchangePhase={keyExchangePhase}
              showDetail
            />
            <span className="text-white/60 text-sm">{getCallStatusWithDetail()}{showWaitingUI && !showRetryButton && "..."}</span>
            {isConnected && (
              <span className="flex items-center gap-1 text-xs text-white/70">
                {isE2eeActive ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                <span>{isE2eeActive ? "Шифрование" : "Без шифрования"}</span>
              </span>
            )}
            {isConnected && isE2eeActive && (
              <CallQualityBadge rtt={50} packetLoss={0.5} />
            )}
          </div>

          <h2 className="text-4xl font-semibold text-white mb-10">{otherName}</h2>

          <GlassAvatarRing
            name={otherName}
            seed={call?.id ?? otherName}
            avatarUrl={otherAvatar}
            size="xl"
            isRinging={showWaitingUI}
            callState={callState}
          />

          {showRetryButton && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-white/50 text-sm text-center max-w-[280px]">
                Проверьте интернет или настройки firewall
              </p>
              <button
                onClick={onRetry}
                className="flex items-center gap-2 px-6 py-3 rounded-full backdrop-blur-xl text-white transition-all hover:scale-105"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}
              >
                <RefreshCw className="w-5 h-5" />
                <span>Повторить</span>
              </button>
            </div>
          )}
        </div>

        <audio ref={audioOutRef} autoPlay playsInline style={{ display: "none" }} />

        <VideoCallControls
          audioOutputMode={audioOutputMode}
          onToggleAudioOutput={handleToggleAudioOutput}
          isVideoOff={isVideoOff}
          onToggleVideo={onToggleVideo}
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          onEnd={onEnd}
          isConnected={isConnected}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={onToggleScreenShare}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          onToggleNoiseSuppression={onToggleNoiseSuppression}
          backgroundBlurEnabled={backgroundBlurEnabled}
          onToggleBackgroundBlur={onToggleBackgroundBlur}
          variant="audio"
        />
      </div>
    </div>
  );
}

interface VideoCallControlsProps {
  audioOutputMode: AudioOutputMode;
  onToggleAudioOutput: () => void;
  isVideoOff: boolean;
  onToggleVideo: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  isConnected: boolean;
  isScreenSharing: boolean;
  onToggleScreenShare?: () => void;
  noiseSuppressionEnabled: boolean;
  onToggleNoiseSuppression?: () => void;
  backgroundBlurEnabled: boolean;
  onToggleBackgroundBlur?: () => void;
  variant?: "video" | "audio";
  hasRemoteScreen?: boolean;
  remoteScreenRef?: React.RefObject<HTMLVideoElement>;
  remoteScreenStream?: MediaStream | null;
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  maskActive?: boolean;
  onToggleMask?: () => void;
}

function VideoCallControls({
  audioOutputMode, onToggleAudioOutput,
  isVideoOff, onToggleVideo,
  isMuted, onToggleMute,
  onEnd,
  isConnected,
  isScreenSharing, onToggleScreenShare,
  noiseSuppressionEnabled, onToggleNoiseSuppression,
  backgroundBlurEnabled, onToggleBackgroundBlur,
  variant = "video",
  hasRemoteScreen = false,
  remoteScreenRef,
  remoteScreenStream,
  isMirrored = true,
  onToggleMirror,
  maskActive = false,
  onToggleMask,
}: VideoCallControlsProps) {
  const isAudio = variant === "audio";
  const wrapperClass = isAudio
    ? "p-6 pb-10 safe-area-bottom"
    : "absolute bottom-0 left-0 right-0 p-6 pb-10 safe-area-bottom z-20 bg-gradient-to-t from-black/50 to-transparent";

  return (
    <div className={wrapperClass}>
      {isScreenSharing && (
        <div className="flex justify-center mb-3">
          <span className="px-4 py-1.5 rounded-full text-xs font-medium text-white bg-blue-600/80 backdrop-blur-sm">
            <Monitor className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
            Вы демонстрируете экран
          </span>
        </div>
      )}
      {hasRemoteScreen && remoteScreenRef && remoteScreenStream && (
        <div className="absolute inset-0 bottom-36 z-[1]">
          <video
            ref={remoteScreenRef}
            autoPlay playsInline
            className="w-full h-full object-contain bg-black/90"
          />
        </div>
      )}
      <div className="flex items-center justify-around">
        <GlassControlButton
          icon={audioOutputMode === "speaker" ? <Volume2 className="w-6 h-6" /> : <Waves className="w-6 h-6" />}
          label={audioOutputMode === "speaker" ? "Динамик" : "Пищалка"}
          isActive={audioOutputMode === "speaker"}
          onClick={onToggleAudioOutput}
          hideLabel
        />
        <GlassControlButton
          icon={isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          label="Видео"
          isActive={!isVideoOff}
          onClick={onToggleVideo}
        />
        {!isAudio && onToggleMirror && (
          <GlassControlButton
            icon={<FlipHorizontal className="w-6 h-6" />}
            label="Зеркало"
            isActive={isMirrored}
            onClick={onToggleMirror}
            hideLabel
          />
        )}
        {!isAudio && onToggleMask && (
          <GlassControlButton
            icon={<Sparkles className="w-6 h-6" />}
            label="Маска"
            isActive={maskActive}
            onClick={onToggleMask}
            hideLabel
          />
        )}
        {!isAudio && onToggleScreenShare && (
          <GlassControlButton
            icon={<Monitor className="w-6 h-6" />}
            label={isScreenSharing ? "Стоп" : "Экран"}
            isActive={isScreenSharing}
            onClick={onToggleScreenShare}
            hideLabel
          />
        )}
        <GlassControlButton
          icon={isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          label="Звук"
          isActive={!isMuted}
          onClick={onToggleMute}
        />
        <GlassControlButton
          icon={<X className="w-6 h-6" />}
          label="Отбой"
          variant="danger"
          onClick={onEnd}
        />
      </div>
    </div>
  );
}

// Renders a video stream into a canvas to avoid ref conflicts when the same
// stream needs to appear in both main view and PiP simultaneously.
function PipVideo({ srcRef, mirrored, dimmed }: {
  srcRef: React.RefObject<HTMLVideoElement>;
  mirrored: boolean;
  dimmed: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const video = srcRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.save();
        if (mirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.globalAlpha = dimmed ? 0.15 : 1;
        ctx.drawImage(video, 0, 0);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [srcRef, mirrored, dimmed]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}
