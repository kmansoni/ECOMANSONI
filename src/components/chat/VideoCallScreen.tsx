import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  Volume2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  RefreshCw,
} from "lucide-react";
import type { VideoCall, VideoCallStatus } from "@/contexts/VideoCallContext";
import { useAuth } from "@/hooks/useAuth";

interface VideoCallScreenProps {
  call: VideoCall | null;
  status: VideoCallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  connectionState: string;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onRetry: () => void;
}

// Brand background component for call screen
function CallBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2035] to-[#071420]" />
      
      {/* Animated floating orbs */}
      <div 
        className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-60"
        style={{
          background: 'radial-gradient(circle, #0066CC 0%, transparent 70%)',
          animation: 'float-orb-1 15s ease-in-out infinite',
        }}
      />
      <div 
        className="absolute bottom-20 right-0 w-[450px] h-[450px] rounded-full blur-[100px] opacity-50"
        style={{
          background: 'radial-gradient(circle, #00A3B4 0%, transparent 70%)',
          animation: 'float-orb-2 18s ease-in-out infinite',
          animationDelay: '-5s',
        }}
      />
      <div 
        className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full blur-[90px] opacity-55"
        style={{
          background: 'radial-gradient(circle, #00C896 0%, transparent 70%)',
          animation: 'float-orb-3 20s ease-in-out infinite',
          animationDelay: '-10s',
        }}
      />
      <div 
        className="absolute bottom-1/3 -left-10 w-[350px] h-[350px] rounded-full blur-[80px] opacity-45"
        style={{
          background: 'radial-gradient(circle, #4FD080 0%, transparent 70%)',
          animation: 'float-orb-4 22s ease-in-out infinite',
          animationDelay: '-3s',
        }}
      />
    </div>
  );
}

export function VideoCallScreen({
  call,
  status,
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  connectionState,
  onEnd,
  onToggleMute,
  onToggleVideo,
  onRetry,
}: VideoCallScreenProps) {
  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  // Handle null call during state transitions
  const isInitiator = call ? call.caller_id === user?.id : true;
  const otherProfile = call ? (isInitiator ? call.callee_profile : call.caller_profile) : null;
  const otherName = otherProfile?.display_name || "Собеседник";
  const otherAvatar = otherProfile?.avatar_url;
  const isVideoCall = call ? call.call_type === "video" : true;
  const isConnected = status === "connected" && connectionState === "connected";

  // Determine if we have remote video to show
  const hasRemoteVideo = isConnected && remoteStream && remoteStream.getVideoTracks().length > 0;

  // Attach local stream - re-run when layout changes (hasRemoteVideo)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("[VideoCallScreen] Attaching local stream, hasRemoteVideo:", hasRemoteVideo);
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, hasRemoteVideo]);

  // Attach remote stream - re-run when layout changes or stream updates
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("[VideoCallScreen] Attaching remote stream, tracks:", remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(", "));
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, hasRemoteVideo]);

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

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return parts[0].charAt(0).toUpperCase() + parts[1].charAt(0).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const getStatusText = (): string => {
    if (connectionState === "failed") {
      return "Ошибка соединения";
    }

    if (isConnected) {
      return formatDuration(callDuration);
    }

    switch (status) {
      case "calling":
        return "Вызов";
      case "ringing":
        return "Звонок";
      default:
        break;
    }

    switch (connectionState) {
      case "connecting":
        return "Подключение";
      case "new":
        return "Инициализация";
      default:
        return "Соединение";
    }
  };

  const showWaitingUI = status !== "connected" || connectionState !== "connected";
  const showRetryButton = connectionState === "failed";

  // Video call - show local camera immediately, remote after connection
  if (isVideoCall && localStream && !isVideoOff) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col">
        {/* Main video area */}
        {hasRemoteVideo ? (
          // Connected: Remote video full screen
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          // Waiting: Local video full screen (mirror effect)
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
        )}

        {/* Local video PiP (small overlay) - only show when connected */}
        {hasRemoteVideo && localStream && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-20 right-4 w-28 h-40 object-cover rounded-2xl border-2 border-white/30 z-10 scale-x-[-1] shadow-lg"
          />
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
                  {otherAvatar ? (
                    <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl text-white/90 font-light">{getInitials(otherName)}</span>
                  )}
                </div>
              </div>

              {/* Name and status */}
              <h3 className="text-2xl font-semibold text-white mt-6 mb-2 drop-shadow-lg">{otherName}</h3>
              <div className="flex items-center">
                <span className="text-white/80 text-base drop-shadow-lg">{getStatusText()}</span>
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
    <div className="fixed inset-0 z-[100] flex flex-col">
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
          {/* Status text above avatar */}
          <p className="text-white/60 text-sm mb-3">{getStatusText()}{showWaitingUI && !showRetryButton && '...'}</p>
          
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
              {otherAvatar ? (
                <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-6xl text-white/80 font-light tracking-wider">{getInitials(otherName)}</span>
              )}
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

        {/* Audio element for audio calls */}
        {!isVideoCall && remoteStream && (
          <audio ref={remoteVideoRef as any} autoPlay playsInline />
        )}

        {/* Bottom controls */}
        <div className="p-6 pb-10 safe-area-bottom">
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
