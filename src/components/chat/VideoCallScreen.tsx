import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { logger } from "@/lib/logger";
import {
  ChevronLeft,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  RefreshCw,
  Monitor,
  Waves,
  Sparkles,
} from "lucide-react";
import type { VideoCall, VideoCallStatus } from "@/contexts/VideoCallContext";
import type { CalleeProfile } from "@/contexts/video-call/types";
import type { CallState } from "@/calls-v2/callStateMachine";
import { isCallConnected, isCallRinging } from "@/calls-v2/callStateMachine";
import { useAuth } from "@/hooks/useAuth";
import { GlassControlButton } from "@/components/ui/glass/GlassControlButton";
import { CallStatusIndicator } from "@/components/ui/glass/CallStatusIndicator";
import { CallBackground } from "@/components/ui/glass/CallBackground";
import { GlassAvatarRing } from "@/components/ui/glass/GlassAvatarRing";

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
}: VideoCallScreenProps) {
  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const audioOutRef = useRef<HTMLAudioElement>(null);
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isRemoteAudioOn, setIsRemoteAudioOn] = useState(true);
  const [isSelfMain, setIsSelfMain] = useState(true);

  useEffect(() => {
    const audioEl = audioOutRef.current;
    if (!audioEl) return;
    if (isRemoteAudioOn) {
      audioEl.muted = false;
    } else {
      audioEl.muted = true;
    }
  }, [isRemoteAudioOn]);

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

  const getStatusText = (): string => {
    if (callState === "failed") return "Ошибка соединения";
    if (isConnected) return formatDuration(callDuration);
    switch (callState) {
      case "outgoing_ringing": return "Вызов";
      case "incoming_ringing": return "Звонок";
      case "bootstrapping":
      case "signaling_ready":
      case "media_acquiring":
      case "transport_connecting":
      case "media_ready":
        return "Настраиваем аудио и видео";
      default: return "Соединение";
    }
  };

  const showRetryButton = callState === "failed";
  const showWaitingUI = !showRetryButton && !isConnected;
  const hasRemoteScreen = isConnected && remoteScreenStream && remoteScreenStream.getVideoTracks().length > 0;
  const hasSecondaryControls = !!(onToggleScreenShare || onToggleNoiseSuppression || onToggleBackgroundBlur);

  if (isVideoCall && localStream && !isVideoOff) {
    return (
      <div
        className="fixed inset-0 bg-black z-[300] flex flex-col"
        data-call-state={callState}
        data-call-connected={isConnected ? "true" : "false"}
        data-connection-state={connectionState}
      >
        <RingtonePlayer play={shouldPlayRingtone} />
        <audio ref={audioOutRef} autoPlay playsInline style={{ display: "none" }} />

        {hasRemoteVideo ? (
          <div className="absolute inset-0 w-full h-full">
            {isSelfMain ? (
              <video
                ref={localVideoRef}
                autoPlay playsInline muted
                className="w-full h-full object-cover scale-x-[-1] transition-all duration-500 cursor-pointer"
                style={{ opacity: isVideoOff ? 0.15 : 1, filter: isVideoOff ? "blur(2px) grayscale(0.7)" : "none", transition: "opacity 0.4s, filter 0.4s" }}
                onClick={() => setIsSelfMain(false)}
                title="Поменять местами"
              />
            ) : (
              <video
                ref={remoteVideoRef}
                autoPlay playsInline
                className="w-full h-full object-cover transition-all duration-500 cursor-pointer"
                onClick={() => setIsSelfMain(true)}
                title="Поменять местами"
              />
            )}
            <div className="absolute top-20 right-4 w-28 h-40 z-10 transition-all duration-500">
              {isSelfMain ? (
                <video
                  ref={pipVideoRef}
                  autoPlay playsInline
                  className="w-full h-full object-cover rounded-2xl border-2 border-white/30 shadow-lg transition-all duration-500 cursor-pointer"
                  onClick={() => setIsSelfMain(true)}
                  title="Поменять местами"
                />
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay playsInline muted
                  className="w-full h-full object-cover rounded-2xl border-2 border-white/30 scale-x-[-1] shadow-lg transition-all duration-500 cursor-pointer"
                  style={{ opacity: isVideoOff ? 0.15 : 1, filter: isVideoOff ? "blur(2px) grayscale(0.7)" : "none", transition: "opacity 0.4s, filter 0.4s" }}
                  onClick={() => setIsSelfMain(false)}
                  title="Поменять местами"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full">
            <video
              ref={localVideoRef}
              autoPlay playsInline muted
              className="w-full h-full object-cover scale-x-[-1] transition-opacity duration-400"
              style={{ opacity: isVideoOff ? 0.15 : 1, filter: isVideoOff ? "blur(2px) grayscale(0.7)" : "none", transition: "opacity 0.4s, filter 0.4s" }}
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 transition-all duration-400">
                <VideoOff className="w-16 h-16 text-white/80 animate-fade-in" />
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {showWaitingUI && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: "easeIn" }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none"
            >
              <div className="absolute inset-0 bg-black/40" />
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
                <div className="flex items-center gap-3">
                  <CallStatusIndicator callState={callState} />
                  {!showRetryButton && (
                    <span className="flex ml-0.5">
                      <span className="animate-bounce text-white/80" style={{ animationDelay: "0ms", animationDuration: "1s" }}>.</span>
                      <span className="animate-bounce text-white/80" style={{ animationDelay: "200ms", animationDuration: "1s" }}>.</span>
                      <span className="animate-bounce text-white/80" style={{ animationDelay: "400ms", animationDuration: "1s" }}>.</span>
                    </span>
                  )}
                </div>
                {showRetryButton && (
                  <button
                    onClick={onRetry}
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-xl text-white pointer-events-auto"
                    style={{
                      background: "linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
                      border: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Повторить</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute top-0 left-0 right-0 p-4 pt-12 safe-area-top z-20 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex items-center justify-between">
            <button onClick={onEnd} className="flex items-center text-white">
              <ChevronLeft className="w-6 h-6" />
              <span className="text-lg">Назад</span>
            </button>
            {isConnected && (
              <span className="text-white/90 text-base font-medium">{formatDuration(callDuration)}</span>
            )}
          </div>
        </div>

        <VideoCallControls
          isRemoteAudioOn={isRemoteAudioOn}
          onToggleRemoteAudio={() => setIsRemoteAudioOn(!isRemoteAudioOn)}
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
          hasSecondaryControls={hasSecondaryControls}
          hasRemoteScreen={!!hasRemoteScreen}
          remoteScreenRef={remoteScreenRef}
          remoteScreenStream={remoteScreenStream}
        />
      </div>
    );
  }

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
            <CallStatusIndicator callState={callState} />
            <span className="text-white/60 text-sm">{getStatusText()}{showWaitingUI && !showRetryButton && "..."}</span>
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
          isRemoteAudioOn={isRemoteAudioOn}
          onToggleRemoteAudio={() => setIsRemoteAudioOn(!isRemoteAudioOn)}
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
          hasSecondaryControls={hasSecondaryControls}
          variant="audio"
        />
      </div>
    </div>
  );
}

interface VideoCallControlsProps {
  isRemoteAudioOn: boolean;
  onToggleRemoteAudio: () => void;
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
  hasSecondaryControls: boolean;
  variant?: "video" | "audio";
  hasRemoteScreen?: boolean;
  remoteScreenRef?: React.RefObject<HTMLVideoElement>;
  remoteScreenStream?: MediaStream | null;
}

function VideoCallControls({
  isRemoteAudioOn, onToggleRemoteAudio,
  isVideoOff, onToggleVideo,
  isMuted, onToggleMute,
  onEnd,
  isConnected,
  isScreenSharing, onToggleScreenShare,
  noiseSuppressionEnabled, onToggleNoiseSuppression,
  backgroundBlurEnabled, onToggleBackgroundBlur,
  hasSecondaryControls,
  variant = "video",
  hasRemoteScreen = false,
  remoteScreenRef,
  remoteScreenStream,
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
      {isConnected && hasSecondaryControls && (
        <div className="flex items-center justify-center gap-6 mb-4">
          {onToggleScreenShare && (
            <GlassControlButton icon={<Monitor className="w-5 h-5" />} label="Экран" isActive={!isScreenSharing} onClick={onToggleScreenShare} />
          )}
          {onToggleNoiseSuppression && (
            <GlassControlButton icon={<Waves className="w-5 h-5" />} label="Шум" isActive={!noiseSuppressionEnabled} onClick={onToggleNoiseSuppression} />
          )}
          {onToggleBackgroundBlur && (
            <GlassControlButton icon={<Sparkles className="w-5 h-5" />} label="Фон" isActive={!backgroundBlurEnabled} onClick={onToggleBackgroundBlur} />
          )}
        </div>
      )}
      <div className="flex items-center justify-around">
        <GlassControlButton
          icon={isRemoteAudioOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          label={isRemoteAudioOn ? "Звук собеседника включен" : "Звук собеседника выключен"}
          isActive={isRemoteAudioOn}
          onClick={onToggleRemoteAudio}
        />
        <GlassControlButton
          icon={isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          label="Видео"
          isActive={!isVideoOff}
          onClick={onToggleVideo}
        />
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
