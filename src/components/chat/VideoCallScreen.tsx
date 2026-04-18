import { useState, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";
// Simple ringtone player component
function RingtonePlayer({ play }: { play: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audioRef.current) return;
    if (play) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { /* autoplay blocked */ });
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [play]);
  return (
    <audio ref={audioRef} src="/ringtone.mp3" loop style={{ display: "none" }} />
  );
}
import {
  ChevronLeft,
  Volume2,
  Headphones,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  RefreshCw,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Monitor,
  Waves,
  Sparkles,
} from "lucide-react";
// Status icon and color for call states
function StatusIndicator({ callState }: { callState: CallState }) {
  let icon: React.ReactNode = null;
  let color = "text-blue-400";
  let label = "";
  switch (callState) {
    case "failed":
      icon = <AlertTriangle className="w-6 h-6 animate-shake" />;
      color = "text-red-500";
      label = "Ошибка";
      break;
    case "bootstrapping":
    case "signaling_ready":
    case "media_acquiring":
    case "transport_connecting":
    case "media_ready":
      icon = <Loader2 className="w-6 h-6 animate-spin" />;
      color = "text-blue-400";
      label = "Подключение";
      break;
    case "in_call":
      icon = <CheckCircle className="w-6 h-6" />;
      color = "text-green-400";
      label = "Соединение";
      break;
    case "outgoing_ringing":
      icon = <PhoneOutgoing className="w-6 h-6 animate-pulse" />;
      color = "text-blue-400";
      label = "Вызов";
      break;
    case "incoming_ringing":
      icon = <PhoneIncoming className="w-6 h-6 animate-pulse" />;
      color = "text-yellow-400";
      label = "Звонок";
      break;
    default:
      icon = <PhoneCall className="w-6 h-6" />;
      color = "text-gray-400";
      label = "Ожидание";
  }
  return (
    <span className={`flex items-center gap-2 ${color} transition-colors duration-500`}>
      {icon}
      <span className="font-medium text-base">{label}</span>
    </span>
  );
}
import type { VideoCall, VideoCallStatus } from "@/contexts/VideoCallContext";
import type { CalleeProfile } from "@/contexts/video-call/types";
import type { CallState } from "@/calls-v2/callStateMachine";
import { isCallConnected, isCallRinging } from "@/calls-v2/callStateMachine";
import { useAuth } from "@/hooks/useAuth";
import { GradientAvatar } from "@/components/ui/gradient-avatar";

function CallBackground() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
      <div
        className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-60"
        style={{
          background: "radial-gradient(circle, #0066CC 0%, transparent 70%)",
          animation: "float-orb-1 15s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-20 right-0 w-[450px] h-[450px] rounded-full blur-[100px] opacity-50"
        style={{
          background: "radial-gradient(circle, #00A3B4 0%, transparent 70%)",
          animation: "float-orb-2 18s ease-in-out infinite",
          animationDelay: "-5s",
        }}
      />
      <div
        className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full blur-[90px] opacity-55"
        style={{
          background: "radial-gradient(circle, #00C896 0%, transparent 70%)",
          animation: "float-orb-3 20s ease-in-out infinite",
          animationDelay: "-10s",
        }}
      />
      <div
        className="absolute bottom-1/3 -left-10 w-[350px] h-[350px] rounded-full blur-[80px] opacity-45"
        style={{
          background: "radial-gradient(circle, #4FD080 0%, transparent 70%)",
          animation: "float-orb-4 22s ease-in-out infinite",
          animationDelay: "-3s",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(at 30% 20%, hsla(200,100%,40%,0.25) 0px, transparent 50%),
                            radial-gradient(at 70% 10%, hsla(175,80%,45%,0.2) 0px, transparent 50%),
                            radial-gradient(at 10% 60%, hsla(160,70%,50%,0.2) 0px, transparent 50%),
                            radial-gradient(at 90% 70%, hsla(140,60%,50%,0.15) 0px, transparent 50%),
                            radial-gradient(at 50% 90%, hsla(185,90%,40%,0.2) 0px, transparent 50%)`,
          backgroundSize: "200% 200%",
          animation: "shimmer-gradient 8s ease-in-out infinite",
        }}
      />
    </div>
  );
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
  // Screen share
  isScreenSharing?: boolean;
  remoteScreenStream?: MediaStream | null;
  onToggleScreenShare?: () => void;
  // Noise suppression
  noiseSuppressionEnabled?: boolean;
  onToggleNoiseSuppression?: () => void;
  // Background blur
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
  const audioOutRef = useRef<HTMLAudioElement>(null);
  const remoteScreenRef = useRef<HTMLVideoElement>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isSelfMain, setIsSelfMain] = useState(true); // swap state
  // Try to use setSinkId if available
  useEffect(() => {
    if (audioOutRef.current && typeof audioOutRef.current.setSinkId === "function") {
      const sinkId = isSpeakerOn ? "default" : "communications";
      audioOutRef.current.setSinkId(sinkId).catch(() => { /* audio output not supported */ });
    }
  }, [isSpeakerOn]);

  // Play ringtone if outgoing or incoming ringing
  const shouldPlayRingtone = isCallRinging(callState);

  // Handle null call during state transitions
  const isInitiator = call ? call.caller_id === user?.id : true;
  const otherProfile = call ? (isInitiator ? call.callee_profile : call.caller_profile) : null;
  const otherName = otherProfile?.display_name || pendingCalleeProfile?.display_name || "Собеседник";
  const otherAvatar = otherProfile?.avatar_url ?? pendingCalleeProfile?.avatar_url;
  const isVideoCall = call ? call.call_type === "video" : true;
  const isConnected = isCallConnected(callState);

  // Determine if we have remote audio tracks
  const hasRemoteAudio = isConnected && remoteStream && remoteStream.getAudioTracks().length > 0;
  
  // Attach remote audio - always play remote audio when available (both video and audio calls)
  useEffect(() => {
    if (audioOutRef.current && remoteStream) {
      logger.debug('video-call-screen: attaching remote audio', {
        hasRemoteAudio,
        tracks: remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(", "),
      });
      audioOutRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, hasRemoteAudio]);

  // Determine if we have remote video to show
  const hasRemoteVideo = isConnected && remoteStream && remoteStream.getVideoTracks().length > 0;

  // Attach local stream - re-run when layout changes (hasRemoteVideo)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      logger.debug("video-call-screen: attaching local stream", { hasRemoteVideo });
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, hasRemoteVideo]);

  // Attach remote stream - re-run when layout changes or stream updates
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      logger.debug("video-call-screen: attaching remote stream", {
        tracks: remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(", "),
      });
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, hasRemoteVideo]);

  // Attach remote screen share stream
  useEffect(() => {
    if (remoteScreenRef.current && remoteScreenStream) {
      remoteScreenRef.current.srcObject = remoteScreenStream;
    }
  }, [remoteScreenStream]);

  // Call duration timer
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Новый статус: иконка + цвет + плавный переход
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

  // Video call - swap local/remote preview
  if (isVideoCall && localStream && !isVideoOff) {
    return (
      <div className="fixed inset-0 bg-black z-[300] flex flex-col">
        {/* Ringtone player */}
        <RingtonePlayer play={shouldPlayRingtone} />
        {/* Main video area */}

        {hasRemoteVideo ? (
          <div className="absolute inset-0 w-full h-full">
            {/* Main video: local or remote */}
            {isSelfMain ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1] transition-all duration-500 cursor-pointer"
                style={{ opacity: isVideoOff ? 0.15 : 1, filter: isVideoOff ? 'blur(2px) grayscale(0.7)' : 'none', transition: 'opacity 0.4s, filter 0.4s' }}
                onClick={() => setIsSelfMain(false)}
                title="Поменять местами"
              />
            ) : (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover transition-all duration-500 cursor-pointer"
                onClick={() => setIsSelfMain(true)}
                title="Поменять местами"
              />
            )}
            {/* PiP: второе видео */}
            <div className="absolute top-20 right-4 w-28 h-40 z-10 transition-all duration-500">
              {isSelfMain ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded-2xl border-2 border-white/30 shadow-lg transition-all duration-500 cursor-pointer"
                  onClick={() => setIsSelfMain(true)}
                  title="Поменять местами"
                />
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover rounded-2xl border-2 border-white/30 scale-x-[-1] shadow-lg transition-all duration-500 cursor-pointer"
                  style={{ opacity: isVideoOff ? 0.15 : 1, filter: isVideoOff ? 'blur(2px) grayscale(0.7)' : 'none', transition: 'opacity 0.4s, filter 0.4s' }}
                  onClick={() => setIsSelfMain(false)}
                  title="Поменять местами"
                />
              )}
            </div>
          </div>
        ) : (
          // Waiting: Local video full screen (mirror effect)
          <div className="absolute inset-0 w-full h-full">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1] transition-opacity duration-400"
              style={{ opacity: isVideoOff ? 0.15 : 1, filter: isVideoOff ? 'blur(2px) grayscale(0.7)' : 'none', transition: 'opacity 0.4s, filter 0.4s' }}
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 transition-all duration-400">
                <VideoOff className="w-16 h-16 text-white/80 animate-fade-in" />
              </div>
            )}
          </div>
        )}

        {/* Waiting overlay with avatar and status */}
        {showWaitingUI && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
            {/* Semi-transparent backdrop */}
            <div className="absolute inset-0 bg-black/40" />
            
            <div className="relative z-10 flex flex-col items-center">
              {/* Glass avatar circle */}
              <div className="relative">
                {/* Pulse animation ring */}
                <div
                  className="absolute -inset-3 rounded-full border-2 border-white/20 animate-ping"
                  style={{ animationDuration: "2s" }}
                />
                {/* Glass effect circle */}
                <div 
                  className="relative w-28 h-28 rounded-full overflow-hidden flex items-center justify-center backdrop-blur-xl"
                  style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1), 0 0 40px rgba(0,163,180,0.3)',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                >
                  <GradientAvatar
                    name={otherName}
                    seed={call?.id ?? otherName}
                    avatarUrl={otherAvatar}
                    size="lg"
                    className="w-full h-full text-4xl border-0"
                  />
                </div>
              </div>

              {/* Name and status */}
              <h3 className="text-2xl font-semibold text-white mt-6 mb-2 drop-shadow-lg">{otherName}</h3>
              <div className="flex items-center gap-3">
                <StatusIndicator callState={callState} />
                {!showRetryButton && (
                  <span className="flex ml-0.5">
                    <span className="animate-bounce text-white/80" style={{ animationDelay: "0ms", animationDuration: "1s" }}>.</span>
                    <span className="animate-bounce text-white/80" style={{ animationDelay: "200ms", animationDuration: "1s" }}>.</span>
                    <span className="animate-bounce text-white/80" style={{ animationDelay: "400ms", animationDuration: "1s" }}>.</span>
                  </span>
                )}
              </div>

              {/* Retry button */}
              {showRetryButton && (
                <button
                  onClick={onRetry}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full backdrop-blur-xl text-white pointer-events-auto"
                  style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                    border: '1px solid rgba(255,255,255,0.2)'
                  }}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Повторить</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top bar */}
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

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 safe-area-bottom z-20 bg-gradient-to-t from-black/50 to-transparent">
          {/* Screen sharing indicator */}
          {isScreenSharing && (
            <div className="flex justify-center mb-3">
              <span className="px-4 py-1.5 rounded-full text-xs font-medium text-white bg-blue-600/80 backdrop-blur-sm">
                <Monitor className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                Вы демонстрируете экран
              </span>
            </div>
          )}
          {/* Remote screen share */}
          {hasRemoteScreen && (
            <div className="absolute inset-0 bottom-36 z-[1]">
              <video
                ref={remoteScreenRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black/90"
              />
            </div>
          )}
          {/* Secondary controls */}
          {isConnected && hasSecondaryControls && (
            <div className="flex items-center justify-center gap-6 mb-4">
              {onToggleScreenShare && (
                <GlassControlButton
                  icon={<Monitor className="w-5 h-5" />}
                  label="Экран"
                  isActive={!isScreenSharing}
                  onClick={onToggleScreenShare}
                />
              )}
              {onToggleNoiseSuppression && (
                <GlassControlButton
                  icon={<Waves className="w-5 h-5" />}
                  label="Шум"
                  isActive={!noiseSuppressionEnabled}
                  onClick={onToggleNoiseSuppression}
                />
              )}
              {onToggleBackgroundBlur && (
                <GlassControlButton
                  icon={<Sparkles className="w-5 h-5" />}
                  label="Фон"
                  isActive={!backgroundBlurEnabled}
                  onClick={onToggleBackgroundBlur}
                />
              )}
            </div>
          )}
          <div className="flex items-center justify-around">
            <GlassControlButton
              icon={<Volume2 className="w-6 h-6" />}
              label="Динамик"
              isActive={isSpeakerOn}
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
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
              isEndButton
              onClick={onEnd}
            />
          </div>
        </div>
      </div>
    );
  }

  // Audio call or waiting state - with brand background
  return (
    <div className="fixed inset-0 z-[300] flex flex-col">
      {/* Ringtone player */}
      <RingtonePlayer play={shouldPlayRingtone} />
      {/* Brand animated background */}
      <CallBackground />
      
      {/* Content layer */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Top bar */}
        <div className="p-4 pt-12 safe-area-top">
          <button onClick={onEnd} className="flex items-center text-white/80 hover:text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
            <span className="text-lg">Назад</span>
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center -mt-16">
          {/* Status text above avatar + индикатор */}
          <div className="flex items-center gap-3 mb-3">
            <StatusIndicator callState={callState} />
            <span className="text-white/60 text-sm">{getStatusText()}{showWaitingUI && !showRetryButton && '...'}</span>
          </div>
          
          {/* Name */}
          <h2 className="text-4xl font-semibold text-white mb-10">{otherName}</h2>

          {/* Glass Avatar Circle */}
          <div className="relative">
            {/* Pulse animation for waiting state */}
            {showWaitingUI && (
              <div
                className="absolute -inset-4 rounded-full border border-white/10 animate-ping"
                style={{ animationDuration: "2.5s" }}
              />
            )}
            
            {/* Glass effect circle */}
            <div 
              className="relative w-48 h-48 rounded-full overflow-hidden flex items-center justify-center backdrop-blur-xl"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.1), 0 0 60px rgba(0,163,180,0.2)',
                border: '1px solid rgba(255,255,255,0.15)'
              }}
            >
              <GradientAvatar
                name={otherName}
                seed={call?.id ?? otherName}
                avatarUrl={otherAvatar}
                size="lg"
                className="w-full h-full text-6xl border-0"
              />
            </div>
          </div>

          {/* Retry button */}
          {showRetryButton && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="text-white/50 text-sm text-center max-w-[280px]">
                Проверьте интернет или настройки firewall
              </p>
              <button
                onClick={onRetry}
                className="flex items-center gap-2 px-6 py-3 rounded-full backdrop-blur-xl text-white transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                }}
              >
                <RefreshCw className="w-5 h-5" />
                <span>Повторить</span>
              </button>
            </div>
          )}
        </div>

        {/* Audio element for remote audio - always play when available */}
        {/* Аудиовыход с поддержкой setSinkId */}
        {hasRemoteAudio && (
          <audio ref={audioOutRef} autoPlay playsInline />
        )}

        {/* Bottom controls */}
        <div className="p-6 pb-10 safe-area-bottom">
          {/* Secondary controls */}
          {isConnected && hasSecondaryControls && (
            <div className="flex items-center justify-center gap-6 mb-4">
              {onToggleScreenShare && (
                <GlassControlButton
                  icon={<Monitor className="w-5 h-5" />}
                  label="Экран"
                  isActive={!isScreenSharing}
                  onClick={onToggleScreenShare}
                />
              )}
              {onToggleNoiseSuppression && (
                <GlassControlButton
                  icon={<Waves className="w-5 h-5" />}
                  label="Шум"
                  isActive={!noiseSuppressionEnabled}
                  onClick={onToggleNoiseSuppression}
                />
              )}
              {onToggleBackgroundBlur && (
                <GlassControlButton
                  icon={<Sparkles className="w-5 h-5" />}
                  label="Фон"
                  isActive={!backgroundBlurEnabled}
                  onClick={onToggleBackgroundBlur}
                />
              )}
            </div>
          )}
          <div className="flex items-center justify-around">
            <GlassControlButton
              icon={isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <Headphones className="w-6 h-6" />}
              label={isSpeakerOn ? "Динамик" : "Наушники"}
              isActive={isSpeakerOn}
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
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
              isEndButton
              onClick={onEnd}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface GlassControlButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  isEndButton?: boolean;
  onClick: () => void;
}

const GlassControlButton = ({
  icon,
  label,
  isActive = true,
  isEndButton = false,
  onClick,
}: GlassControlButtonProps) => (
  <div className="flex flex-col items-center gap-2">
    <button
      onClick={onClick}
      className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 backdrop-blur-xl"
      style={isEndButton ? {
        background: 'linear-gradient(145deg, #ef4444 0%, #dc2626 100%)',
        boxShadow: '0 4px 20px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
      } : {
        background: isActive 
          ? 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)'
          : 'linear-gradient(145deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)',
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.2)',
        color: isActive ? 'white' : '#1a1a1a'
      }}
    >
      <span className={isEndButton ? 'text-white' : isActive ? 'text-white' : 'text-gray-800'}>
        {icon}
      </span>
    </button>
    <span className="text-white/70 text-xs">{label}</span>
  </div>
);
