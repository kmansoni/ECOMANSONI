/**
 * VideoCallDemoPage — Demo page for video call functionality.
 *
 * Demonstrates:
 * - Starting a call (simulated for demo purposes)
 * - Answering a call (simulated for demo purposes)
 * - Video/Audio controls
 * - Screen sharing
 * - Proper UI-lock behavior
 *
 * Note: Uses VideoCallProvider and GlobalCallOverlay from parent App.tsx.
 * The GlobalCallOverlay renders the call screen on top of all pages.
 */
import { useState } from "react";
import { useVideoCallContext } from "@/contexts/VideoCallContext";
import { GlassPrimaryButton } from "@/components/ui/glass/GlassPrimaryButton";
import { GlassCard } from "@/components/ui/glass/GlassCard";
import { GlassToggle } from "@/components/ui/glass/GlassToggle";
import { Phone } from "lucide-react";
import { useGlassTheme, useGlassTokens } from "@/components/ui/glass/glassTokens";

/**
 * Demo controls component - shows available actions.
 */
function VideoCallDemoControls() {
  const { theme } = useGlassTheme();
  const tokens = useGlassTokens(theme);
  
  const {
    status,
    currentCall,
    isMuted,
    isVideoOff,
    isScreenSharing,
    noiseSuppressionEnabled,
    backgroundBlurEnabled,
    startCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleNoiseSuppression,
    toggleBackgroundBlur,
  } = useVideoCallContext();

  const [calleeId, setCalleeId] = useState("");
  const [callType, setCallType] = useState<"video" | "audio">("video");

  const handleStartCall = async () => {
    // For demo purposes, use a test user ID
    // In production, this would be the actual recipient's ID
    const demoCalleeId = calleeId.trim() || "demo-user-123";
    await startCall(demoCalleeId, null, callType);
  };

  const isActive = status !== "idle" || !!currentCall;

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {!isActive ? (
        <GlassCard className="p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white mb-4">Начать видеозвонок</h2>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-white/70 mb-2">ID получателя (необязательно)</label>
              <input
                type="text"
                value={calleeId}
                onChange={(e) => setCalleeId(e.target.value)}
                placeholder="Введите ID или оставьте пустым"
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 text-white/80">
                <input
                  type="radio"
                  checked={callType === "video"}
                  onChange={() => setCallType("video")}
                  className="text-blue-500"
                />
                Видеозвонок
              </label>
              <label className="flex items-center gap-2 text-white/80 mt-1">
                <input
                  type="radio"
                  checked={callType === "audio"}
                  onChange={() => setCallType("audio")}
                  className="text-blue-500"
                />
                Аудиозвонок
              </label>
            </div>
            
            <GlassPrimaryButton
              onClick={handleStartCall}
              className="w-full flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Позвонить {callType === "video" ? "видео" : "аудио"}
            </GlassPrimaryButton>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Управление звонком</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white/80">Микрофон</span>
              <GlassToggle
                checked={!isMuted}
                onChange={toggleMute}
                label={isMuted ? "Выкл" : "Вкл"}
                tokens={tokens}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-white/80">Камера</span>
              <GlassToggle
                checked={!isVideoOff}
                onChange={toggleVideo}
                label={isVideoOff ? "Выкл" : "Вкл"}
                tokens={tokens}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-white/80">Демонстрация экрана</span>
              <GlassToggle
                checked={isScreenSharing}
                onChange={toggleScreenShare}
                label={isScreenSharing ? "Активно" : "Неактивно"}
                disabled={status !== "connected"}
                tokens={tokens}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-white/80">Шумоподавление</span>
              <GlassToggle
                checked={noiseSuppressionEnabled}
                onChange={toggleNoiseSuppression}
                label={noiseSuppressionEnabled ? "Вкл" : "Выкл"}
                disabled={status !== "connected"}
                tokens={tokens}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-white/80">Размытие фона</span>
              <GlassToggle
                checked={backgroundBlurEnabled}
                onChange={toggleBackgroundBlur}
                label={backgroundBlurEnabled ? "Вкл" : "Выкл"}
                disabled={status !== "connected"}
                tokens={tokens}
              />
            </div>
            
            <button
              onClick={endCall}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/90 hover:bg-red-600 text-white font-medium transition-colors"
            >
              <Phone className="w-4 h-4 rotate-[135deg]" />
              Завершить звонок
            </button>
          </div>
        </GlassCard>
      )}
      
      <GlassCard className="p-4">
        <h3 className="text-white/60 text-sm font-medium mb-2">Состояние звонка</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-white/50">Статус:</span>
            <span className="text-white">{status}</span>
          </div>
          {currentCall && (
            <>
              <div className="flex justify-between">
                <span className="text-white/50">Тип:</span>
                <span className="text-white">{currentCall.call_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">ID звонка:</span>
                <span className="text-white font-mono">{currentCall.id.slice(0, 8)}...</span>
              </div>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

/**
 * Demo page for video call functionality.
 * 
 * The VideoCallProvider and GlobalCallOverlay are already provided by App.tsx,
 * so this page only needs to use the context and display controls.
 */
export function VideoCallDemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="p-4 border-b border-white/10">
        <h1 className="text-2xl font-bold text-white">Демо видеозвонка</h1>
        <p className="text-white/60 text-sm mt-1">
          Демонстрация функций видеозвонка: начало/приём звонка, управление аудио/видео, демонстрация экрана
        </p>
      </header>
      
      <VideoCallDemoControls />
    </div>
  );
}