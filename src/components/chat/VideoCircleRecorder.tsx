import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Pause, Play, Camera, Zap, ZapOff } from "lucide-react";

interface VideoCircleRecorderProps {
  onRecord: (videoBlob: Blob, duration: number) => void;
  onCancel: () => void;
  autoRecord?: boolean; // If true, auto-send on release (hold-to-record mode)
}

export function VideoCircleRecorder({ onRecord, onCancel, autoRecord = true }: VideoCircleRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [flashEnabled, setFlashEnabled] = useState(false);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeRef = useRef(0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const centiseconds = Math.floor((Date.now() % 1000) / 10);
    return `${mins}:${secs.toString().padStart(2, "0")},${centiseconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    recordingTimeRef.current = recordingTime;
  }, [recordingTime]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // Stop existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);

      // Apply flash/torch if enabled and available
      if (flashEnabled && facingMode === "environment") {
        const videoTrack = stream.getVideoTracks()[0];
        try {
          await (videoTrack as any).applyConstraints({
            advanced: [{ torch: true }],
          });
        } catch {
          console.log("Torch not supported");
        }
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setHasPermission(false);
    }
  }, [facingMode, flashEnabled]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      onRecord(blob, recordingTimeRef.current);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingTime(0);
  }, [onRecord]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    stopCamera();
  }, [stopCamera]);

  const handleCancel = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      // Don't call onstop handler
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopCamera();
    onCancel();
  }, [onCancel, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [startCamera, stopCamera, facingMode]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingInterval.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 60) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    }
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [isRecording, isPaused, stopRecording]);

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

  const toggleFlash = async () => {
    setFlashEnabled(prev => !prev);
    
    if (streamRef.current && facingMode === "environment") {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      try {
        await (videoTrack as any).applyConstraints({
          advanced: [{ torch: !flashEnabled }]
        });
      } catch (e) {
        console.log("Torch not supported");
      }
    }
  };

  // Auto-start recording when camera is ready
  useEffect(() => {
    if (hasPermission && !isRecording) {
      startRecording();
    }
  }, [hasPermission, isRecording, startRecording]);

  // Auto-send on release (hold-to-record mode)
  useEffect(() => {
    if (!autoRecord) return;
    
    const handleGlobalRelease = () => {
      // Only auto-send if recording for at least 1 second
      if (isRecording && recordingTime >= 1) {
        stopRecording();
      } else if (isRecording && recordingTime < 1) {
        // Too short - cancel
        handleCancel();
      }
    };
    
    // Use a small delay to avoid immediate trigger
    const timeoutId = setTimeout(() => {
      window.addEventListener('touchend', handleGlobalRelease, { once: true });
      window.addEventListener('mouseup', handleGlobalRelease, { once: true });
    }, 300);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('touchend', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
    };
  }, [autoRecord, isRecording, recordingTime, handleCancel, stopRecording]);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-gradient-to-br from-purple-900/90 via-slate-900/95 to-blue-900/90 backdrop-blur-xl">
      {/* Header with close button */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 safe-area-top">
        <button
          onClick={handleCancel}
          className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white font-medium"
        >
          Закрыть
        </button>
        <span className="text-white/60 text-sm">Видео-кружок</span>
        <div className="w-20" />
      </div>

      {/* Video preview - large circle in center */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/30 to-blue-500/30 blur-xl scale-110" />
          
          {/* Video circle */}
          <div className="relative w-72 h-72 rounded-full overflow-hidden border-[3px] border-white/20 shadow-2xl flex items-center justify-center bg-black/50">
            {hasPermission ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              />
            ) : (
              <div className="text-center px-6">
                <Camera className="w-12 h-12 text-white/40 mx-auto mb-3" />
                <p className="text-white/70 text-sm">
                  Разрешите доступ к камере
                </p>
                <button
                  onClick={startCamera}
                  className="mt-4 px-6 py-2 rounded-full bg-blue-500 text-white font-medium text-sm"
                >
                  Запросить доступ
                </button>
              </div>
            )}
          </div>

          {/* Progress ring when recording */}
          {isRecording && (
            <svg className="absolute inset-[-6px] w-[calc(100%+12px)] h-[calc(100%+12px)] -rotate-90">
              <circle
                cx="50%"
                cy="50%"
                r="calc(50% - 3px)"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="3"
              />
              <circle
                cx="50%"
                cy="50%"
                r="calc(50% - 3px)"
                fill="none"
                stroke="url(#progressGradient)"
                strokeWidth="3"
                strokeDasharray={`${(recordingTime / 60) * 100}% 100%`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          )}
        </div>
      </div>

      {/* Right side controls - Timer/1x */}
      {isRecording && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          <button className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 text-xs font-medium">
            1x
          </button>
          <button 
            onClick={togglePause}
            className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center"
          >
            {isPaused ? (
              <Play className="w-5 h-5 text-white" fill="white" />
            ) : (
              <Pause className="w-5 h-5 text-white" fill="white" />
            )}
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <div className="pb-8 px-4 safe-area-bottom">
        {/* Camera controls row */}
        {hasPermission && (
          <div className="flex items-center justify-between mb-4">
            {/* Left: Camera switch & Flash */}
            <div className="flex items-center gap-2">
              <button 
                onClick={switchCamera}
                className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <button 
                onClick={toggleFlash}
                className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center"
              >
                {flashEnabled ? (
                  <Zap className="w-5 h-5 text-yellow-400" fill="currentColor" />
                ) : (
                  <ZapOff className="w-5 h-5 text-white/60" />
                )}
              </button>
            </div>

            {/* Right: Empty space for balance */}
            <div className="w-24" />
          </div>
        )}

        {/* Bottom row: Timer, Cancel, Send */}
        <div className="flex items-center justify-between">
          {/* Recording indicator & time */}
          <div className="flex items-center gap-2 min-w-[100px]">
            {isRecording && (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white font-medium text-sm tabular-nums">
                  {formatTime(recordingTime)}
                </span>
              </>
            )}
          </div>

          {/* Cancel button */}
          <button
            onClick={handleCancel}
            className="text-blue-400 font-medium text-base"
          >
            Отмена
          </button>

          {/* Send button */}
          <button
            onClick={stopRecording}
            disabled={!isRecording || recordingTime < 1}
            className="w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all"
          >
            <ArrowUp className="w-6 h-6 text-white" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
