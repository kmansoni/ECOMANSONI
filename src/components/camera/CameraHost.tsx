import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export type CaptureMode = "story" | "reel";

export type CaptureProfile = {
  mode: CaptureMode;
  maxDurationMs: number;
  showTimeline: boolean;
  targetVideoBitsPerSecond: number;
};

// Профессиональные настройки камеры
export type ExposureMode = "auto" | "manual" | "shutter-priority" | "aperture-priority";
export type WhiteBalanceMode = "auto" | "sunny" | "cloudy" | "tungsten" | "fluorescent" | "shade" | "custom";
export type GridOverlay = "none" | "rule-of-thirds" | "golden-ratio" | "diagonal" | "square";
export type FocusMode = "auto" | "continuous" | "manual" | "lock";

export interface ProCameraSettings {
  exposureMode: ExposureMode;
  iso: number;
  shutterSpeed: number; // ms
  whiteBalanceMode: WhiteBalanceMode;
  whiteBalanceKelvin: number;
  exposureCompensation: number; // -3 to +3
  focusMode: FocusMode;
  focusDistance: number; // 0 to 1 (near to far)
  exposureLock: boolean;
  focusLock: boolean;
  whiteBalanceLock: boolean;
  hdrMode: boolean;
  nightMode: boolean;
  stabilizationMode: "off" | "standard" | "cinematic";
  gridOverlay: GridOverlay;
  showHistogram: boolean;
  showFocusPeaking: boolean;
  showZebraStripes: boolean;
  zebraThreshold: number; // 0-255
  showLevel: boolean;
  touchAELock: boolean; // Touch AE/AF lock
  touchAFPoint: { x: number; y: number } | null;
}

export interface CameraHostHandle {
  capturePhoto: () => Promise<void>;
  recordVideo: () => Promise<void>;
  stopRecording: () => void;
  isRecording: () => boolean;
  supportsTorch: () => boolean;
  setTorchEnabled: (enabled: boolean) => Promise<boolean>;
  setZoomLevel: (level: number) => Promise<boolean>;
  setProSettings: (settings: Partial<ProCameraSettings>) => Promise<boolean>;
  getProSettings: () => ProCameraSettings;
  supportsProSettings: () => boolean;
  triggerTouchAEAF: (x: number, y: number) => Promise<void>;
  resetProSettings: () => void;
  getHistogram: () => Uint32Array | null;
}

export interface CameraDebugSnapshot {
  getUserMediaCalls: number;
  startCount: number;
  stopCount: number;
  streamId: string | null;
  videoTrackId: string | null;
  isReady: boolean;
  isRecording: boolean;
  mode: CaptureMode;
  lastStopReason: string | null;
  lastEventAt: number;
  supportsTorch: boolean;
  supportsZoom: boolean;
}

interface CameraDebugGlobal {
  getUserMediaCalls: number;
  lastVideoTrackId?: string;
  trackEndedCount: number;
  attachCount: number;
  detachCount: number;
  videoMountCount: number;
  videoUnmountCount: number;
}

declare global {
  interface Window {
    __cameraDebug?: CameraDebugGlobal;
    __mansoniCameraDebug?: CameraDebugSnapshot;
  }
}

export type FacingMode = "user" | "environment";

interface CameraHostProps {
  isActive: boolean;
  mode: CaptureMode;
  facingMode?: FacingMode;
  targetVideoBitsPerSecond?: number;
  previewZoom?: number;
  maxRecordingMs?: number;
  className?: string;
  videoClassName?: string;
  videoStyle?: React.CSSProperties;
  initialProSettings?: Partial<ProCameraSettings>;
  onReadyChange?: (ready: boolean) => void;
  onRecordingChange?: (recording: boolean) => void;
  onPhotoCaptured?: (file: File, previewUrl: string) => void;
  onVideoRecorded?: (file: File, previewUrl: string) => void;
  onError?: (error: unknown) => void;
  onDebugChange?: (snapshot: CameraDebugSnapshot) => void;
  onProSettingsChange?: (settings: ProCameraSettings) => void;
  onHistogramUpdate?: (histogram: Uint32Array) => void;
  children?: React.ReactNode;
}

const buildConstraints = (facingMode: FacingMode = "environment"): MediaStreamConstraints => ({
  video: {
    facingMode: { ideal: facingMode },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: true,
});

const buildProfile = (mode: CaptureMode, customMaxDurationMs?: number): CaptureProfile => {
  if (mode === "reel") {
    return {
      mode,
      maxDurationMs: customMaxDurationMs ?? 900_000, // до 15 мин
      showTimeline: true,
      targetVideoBitsPerSecond: 4_000_000,
    };
  }

  return {
    mode,
    maxDurationMs: customMaxDurationMs ?? 15_000,
    showTimeline: false,
    targetVideoBitsPerSecond: 2_500_000,
  };
};

const pickSupportedMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((candidate) => {
    try {
      return MediaRecorder.isTypeSupported(candidate);
    } catch {
      return false;
    }
  });
};

// Pro video modes
export type VideoMode = "normal" | "slowmo" | "timelapse" | "cinematic";

export interface VideoModeConfig {
  mode: VideoMode;
  frameRate: number;
  slowMoFactor?: number; // e.g., 4 for 4x slow-mo
  timelapseInterval?: number; // ms between frames
  targetBitrate: number;
  hdr: boolean;
}

// ML-based enhancement presets (approximations without real ML)
export type EnhancementPreset = "none" | "auto" | "portrait" | "food" | "landscape" | "night" | "hdr";

export interface EnhancementSettings {
  preset: EnhancementPreset;
  intensity: number; // 0-100
  skinSmoothing: number; // 0-100
  faceRetouch: boolean;
  backgroundBlur: number; // 0-100
  vignetteIntensity: number; // 0-100
  clarity: number; // 0-100
}

// Canvas-based filters (GPU-accelerated via CSS filters + Canvas)
export type FilterKey = "none" | "vivid" | "mono" | "cool" | "warm" | "fade" | "vintage" | "dramatic" | "blackout" | "glow";

export interface FilterSettings {
  filter: FilterKey;
  intensity: number; // 0-100
  customCSSFilter?: string;
}

const getCameraDebugGlobal = (): CameraDebugGlobal | null => {
  if (typeof window === "undefined") return null;
  if (!window.__cameraDebug) {
    window.__cameraDebug = {
      getUserMediaCalls: 0,
      lastVideoTrackId: undefined,
      trackEndedCount: 0,
      attachCount: 0,
      detachCount: 0,
      videoMountCount: 0,
      videoUnmountCount: 0,
    };
  }
  return window.__cameraDebug;
};

export const CameraHost = forwardRef<CameraHostHandle, CameraHostProps>(function CameraHost(
  {
    isActive,
    mode,
    facingMode = "environment",
    targetVideoBitsPerSecond,
    maxRecordingMs,
    className,
    videoClassName,
    videoStyle,
    initialProSettings,
    onReadyChange,
    onRecordingChange,
    onPhotoCaptured,
    onVideoRecorded,
    onError,
    onDebugChange,
    onProSettingsChange,
    onHistogramUpdate,
    children,
  },
  ref,
) {
  const facingModeRef = useRef<FacingMode>(facingMode);
  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  // Pro settings state
  const defaultProSettings: ProCameraSettings = {
    exposureMode: "auto",
    iso: 100,
    shutterSpeed: 1 / 125,
    whiteBalanceMode: "auto",
    whiteBalanceKelvin: 5500,
    exposureCompensation: 0,
    focusMode: "continuous",
    focusDistance: 0,
    exposureLock: false,
    focusLock: false,
    whiteBalanceLock: false,
    hdrMode: false,
    nightMode: false,
    stabilizationMode: "standard",
    gridOverlay: "none",
    showHistogram: false,
    showFocusPeaking: false,
    showZebraStripes: false,
    zebraThreshold: 200,
    showLevel: false,
    touchAELock: false,
    touchAFPoint: null,
  };

  const proSettingsRef = useRef<ProCameraSettings>(initialProSettings ? { ...defaultProSettings, ...initialProSettings } : defaultProSettings);
  const [proSettingsState, setProSettingsState] = useState<ProCameraSettings>(proSettingsRef.current);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const recorderTimerRef = useRef<number | null>(null);
  const torchSupportedRef = useRef(false);
  const zoomSupportedRef = useRef(false);
  const zoomRangeRef = useRef<{ min: number; max: number }>({ min: 1, max: 1 });
  const histogramRef = useRef<Uint32Array | null>(null);
  const histogramAnimationRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const readyRef = useRef(false);
  const recordingRef = useRef(false);

  const metricsRef = useRef<CameraDebugSnapshot>({
    getUserMediaCalls: 0,
    startCount: 0,
    stopCount: 0,
    streamId: null,
    videoTrackId: null,
    isReady: false,
    isRecording: false,
    mode,
    lastStopReason: null,
    lastEventAt: Date.now(),
    supportsTorch: false,
    supportsZoom: false,
  });

  const profile = useMemo(() => buildProfile(mode, maxRecordingMs), [mode, maxRecordingMs]);
  const profileRef = useRef<CaptureProfile>(profile);
  const onErrorRef = useRef<CameraHostProps["onError"]>(onError);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const bitrateOverrideRef = useRef<number | undefined>(targetVideoBitsPerSecond);
  useEffect(() => {
    bitrateOverrideRef.current = targetVideoBitsPerSecond;
  }, [targetVideoBitsPerSecond]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onReadyChange?.(ready);
    readyRef.current = ready;
  }, [onReadyChange, ready]);

  useEffect(() => {
    onRecordingChange?.(recording);
    recordingRef.current = recording;
  }, [onRecordingChange, recording]);

  const emitDebug = useCallback(
    (patch: Partial<CameraDebugSnapshot>) => {
      const next: CameraDebugSnapshot = {
        ...metricsRef.current,
        ...patch,
        mode: profileRef.current.mode,
        isReady: readyRef.current,
        isRecording: recordingRef.current,
        lastEventAt: Date.now(),
      };

      metricsRef.current = next;
      onDebugChange?.(next);

      if (typeof window !== "undefined") {
        window.__mansoniCameraDebug = next;
      }
    },
    [onDebugChange],
  );

  useEffect(() => {
    const globalDebug = getCameraDebugGlobal();
    if (globalDebug) {
      globalDebug.videoMountCount += 1;
    }

    return () => {
      const debug = getCameraDebugGlobal();
      if (debug) {
        debug.videoUnmountCount += 1;
      }
    };
  }, []);

  useEffect(() => {
    emitDebug({ mode });
  }, [emitDebug, mode]);

  const attachVideo = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      const globalDebug = getCameraDebugGlobal();
      if (globalDebug) {
        globalDebug.attachCount += 1;
      }
      video.srcObject = stream;
    }

    video.playsInline = true;
    video.muted = true;
    try {
      await video.play();
    } catch {
      return;
    }
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) {
      await attachVideo();
      setReady(true);
      emitDebug({ isReady: true });
      return;
    }

    if (startingRef.current) {
      await startingRef.current;
      return;
    }

    startingRef.current = (async () => {
      const globalDebug = getCameraDebugGlobal();
      if (globalDebug) {
        globalDebug.getUserMediaCalls += 1;
      }

      emitDebug({
        getUserMediaCalls: metricsRef.current.getUserMediaCalls + 1,
      });
      const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(facingModeRef.current));
      streamRef.current = stream;
      await attachVideo();
      setReady(true);

      const videoTrack = stream.getVideoTracks()[0] ?? null;
      if (videoTrack) {
        try {
          const caps = (videoTrack as any).getCapabilities?.();
          torchSupportedRef.current = Boolean(caps?.torch);
          if (caps?.zoom) {
            zoomSupportedRef.current = true;
            zoomRangeRef.current = { min: caps.zoom.min ?? 1, max: caps.zoom.max ?? 1 };
          } else {
            zoomSupportedRef.current = false;
          }
        } catch {
          torchSupportedRef.current = false;
          zoomSupportedRef.current = false;
        }

        const debug = getCameraDebugGlobal();
        if (debug) {
          debug.lastVideoTrackId = videoTrack.id;
        }
        videoTrack.addEventListener("ended", () => {
          const endedDebug = getCameraDebugGlobal();
          if (endedDebug) {
            endedDebug.trackEndedCount += 1;
          }
        });
      }

      emitDebug({
        startCount: metricsRef.current.startCount + 1,
        streamId: stream.id ?? null,
        videoTrackId: videoTrack?.id ?? null,
        isReady: true,
        lastStopReason: null,
      });
    })();

    try {
      await startingRef.current;
    } finally {
      startingRef.current = null;
    }
  }, [attachVideo, emitDebug]);

  const stop = useCallback((reason: string = "manual") => {
    if (recorderTimerRef.current) {
      window.clearTimeout(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }

    recorderRef.current = null;
    recorderChunksRef.current = [];
    setRecording(false);

    const video = videoRef.current;
    if (video) {
      const globalDebug = getCameraDebugGlobal();
      if (globalDebug) {
        globalDebug.detachCount += 1;
      }
      video.pause();
      video.srcObject = null;
      // Fix A: сброс src сбрасывает буфер последнего кадра на hardware overlay.
      // Без этого последний кадр «застревает» на 1-3 фрейма на mobile браузерах.
      video.src = '';
      video.load();
    }

    const stream = streamRef.current;
    streamRef.current = null;
    torchSupportedRef.current = false;
    zoomSupportedRef.current = false;
    zoomRangeRef.current = { min: 1, max: 1 };
    setReady(false);

    emitDebug({
      stopCount: metricsRef.current.stopCount + 1,
      streamId: null,
      videoTrackId: null,
      isReady: false,
      lastStopReason: reason,
    });

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }, [emitDebug]);

  useEffect(() => {
    if (!isActive) return undefined;

    start().catch((error) => {
      onErrorRef.current?.(error);
    });

    return () => {
      stop("inactive-unmount");
    };
  }, [isActive, start, stop]);

  useEffect(() => {
    if (!isActive) return;
    attachVideo();
  }, [attachVideo, isActive]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);

    await new Promise<void>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve();
            return;
          }

          const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
          const previewUrl = URL.createObjectURL(blob);
          onPhotoCaptured?.(file, previewUrl);
          resolve();
        },
        "image/jpeg",
        0.95,
      );
    });
  }, [onPhotoCaptured]);

  const recordVideo = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    if (recorderRef.current && recorderRef.current.state === "recording") {
      return;
    }

    const mimeType = pickSupportedMime();
    const recorder = new MediaRecorder(
      stream,
      mimeType
        ? {
            mimeType,
            videoBitsPerSecond: bitrateOverrideRef.current ?? profileRef.current.targetVideoBitsPerSecond,
          }
        : {
            videoBitsPerSecond: bitrateOverrideRef.current ?? profileRef.current.targetVideoBitsPerSecond,
          },
    );

    recorderChunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recorderChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = recorderChunksRef.current;
      recorderChunksRef.current = [];
      recorderRef.current = null;
      setRecording(false);
      emitDebug({ isRecording: false });

      if (chunks.length === 0) return;

      const finalMimeType = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks, { type: finalMimeType });
      const file = new File([blob], `video-${Date.now()}.webm`, { type: finalMimeType });
      const previewUrl = URL.createObjectURL(blob);
      onVideoRecorded?.(file, previewUrl);
    };

    recorder.start(200);
    setRecording(true);
    emitDebug({ isRecording: true });

    if (recorderTimerRef.current) {
      window.clearTimeout(recorderTimerRef.current);
    }

    recorderTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      recorderTimerRef.current = null;
    }, profileRef.current.maxDurationMs);
  }, [emitDebug, onVideoRecorded]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  // Extended video recording with mode support
  const recordVideoEx = useCallback(async (videoMode: VideoModeConfig): Promise<void> => {
    const stream = streamRef.current;
    if (!stream) return;

    if (recorderRef.current && recorderRef.current.state === "recording") {
      return;
    }

    // For timelapse, we need to capture frames and compose later
    if (videoMode.mode === "timelapse") {
      await startTimelapseRecording(videoMode);
      return;
    }

    const mimeType = videoMode.hdr
      ? "video/webm;codecs=vp9" // VP9 supports HDR
      : pickSupportedMime();

    const recorder = new MediaRecorder(
      stream,
      mimeType
        ? {
            mimeType,
            videoBitsPerSecond: videoMode.targetBitrate,
          }
        : {
            videoBitsPerSecond: videoMode.targetBitrate,
          },
    );

    recorderChunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recorderChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = recorderChunksRef.current;
      recorderChunksRef.current = [];
      recorderRef.current = null;
      setRecording(false);
      emitDebug({ isRecording: false });

      if (chunks.length === 0) return;

      const finalMimeType = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunks, { type: finalMimeType });
      const file = new File([blob], `video-${videoMode.mode}-${Date.now()}.webm`, { type: finalMimeType });
      const previewUrl = URL.createObjectURL(blob);
      onVideoRecorded?.(file, previewUrl);
    };

    recorder.start(200);
    setRecording(true);
    emitDebug({ isRecording: true });

    if (recorderTimerRef.current) {
      window.clearTimeout(recorderTimerRef.current);
    }

    // Slow-mo and cinematic have different max durations
    const maxDuration = videoMode.mode === "slowmo" ? 30000 : // 30s max for slow-mo
                       videoMode.mode === "cinematic" ? 60000 : // 60s cinematic
                       profileRef.current.maxDurationMs;

    recorderTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      recorderTimerRef.current = null;
    }, maxDuration);
  }, [emitDebug, onVideoRecorded]);

  // Timelapse recording using canvas capture
  const startTimelapseRecording = useCallback(async (config: VideoModeConfig): Promise<void> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const interval = config.timelapseInterval || 500; // ms between frames
    const fps = 30;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    let frameCount = 0;
    const frames: ImageData[] = [];

    const captureFrame = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };

    // Capture at interval
    const captureInterval = setInterval(captureFrame, interval);
    setRecording(true);
    emitDebug({ isRecording: true });

    // Stop after max duration or if stopRecording called
    recorderTimerRef.current = window.setTimeout(async () => {
      clearInterval(captureInterval);
      setRecording(false);
      emitDebug({ isRecording: false });

      if (frames.length === 0) return;

      // Compose video from frames using canvas + MediaRecorder
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = canvas.width;
      outputCanvas.height = canvas.height;
      const outCtx = outputCanvas.getContext("2d");
      if (!outCtx) return;

      const outputStream = outputCanvas.captureStream(fps);
      // Add audio if available
      const audioTrack = streamRef.current?.getAudioTracks()[0];
      if (audioTrack) outputStream.addTrack(audioTrack);

      const recorder = new MediaRecorder(outputStream, {
        mimeType: pickSupportedMime() || "video/webm",
        videoBitsPerSecond: config.targetBitrate,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const file = new File([blob], `video-timelapse-${Date.now()}.webm`, { type: "video/webm" });
        const previewUrl = URL.createObjectURL(blob);
        onVideoRecorded?.(file, previewUrl);
      };

      recorder.start();

      // Play back frames
      let frameIdx = 0;
      const playFrame = () => {
        if (frameIdx >= frames.length) {
          recorder.stop();
          return;
        }
        outCtx.putImageData(frames[frameIdx++], 0, 0);
        setTimeout(playFrame, 1000 / fps);
      };
      playFrame();
    }, 60000); // Max 1 minute of real-time = ~2s timelapse at 500ms interval
  }, [onVideoRecorded, emitDebug]);

  const supportsTorch = useCallback(() => {
    return torchSupportedRef.current;
  }, []);

  const supportsProSettings = useCallback(() => {
    return true; // Always supported via software processing
  }, []);

  const setProSettings = useCallback(async (settings: Partial<ProCameraSettings>): Promise<boolean> => {
    const stream = streamRef.current;
    const videoTrack = stream?.getVideoTracks()[0];

    const newSettings = { ...proSettingsRef.current, ...settings };
    proSettingsRef.current = newSettings;
    setProSettingsState(newSettings);
    onProSettingsChange?.(newSettings);

    // Apply hardware constraints if available
    if (videoTrack) {
      try {
        const caps = (videoTrack as any).getCapabilities?.() || {};
        const advanced: Array<Record<string, unknown>> = [];

        // Exposure mode
        if (settings.exposureMode && caps.exposureMode) {
          (caps as any).exposureMode = settings.exposureMode;
        }

        // Manual exposure
        if (settings.exposureMode === "manual" || settings.exposureMode === "shutter-priority") {
          if (settings.iso !== undefined && caps.iso) {
            const isoRange = caps.iso as any;
            advanced.push({
              iso: Math.max(isoRange.min || 50, Math.min(isoRange.max || 3200, settings.iso))
            });
          }
          if (settings.shutterSpeed !== undefined && caps.exposureTime) {
            const expRange = caps.exposureTime as any;
            advanced.push({
              exposureTime: Math.max(expRange.min || 0.001, Math.min(expRange.max || 0.1, settings.shutterSpeed / 1000))
            });
          }
        }

        // White balance
        if (settings.whiteBalanceMode && caps.whiteBalanceMode) {
          (caps as any).whiteBalanceMode = settings.whiteBalanceMode;
        }
        if ((settings.whiteBalanceMode === "custom" || settings.whiteBalanceMode === "auto") && settings.whiteBalanceKelvin) {
          advanced.push({
            colorTemperature: settings.whiteBalanceKelvin
          });
        }

        // Focus
        if (settings.focusMode && caps.focusMode) {
          (caps as any).focusMode = settings.focusMode;
        }
        if (settings.focusMode === "manual" && settings.focusDistance !== undefined && caps.focusDistance) {
          advanced.push({
            focusDistance: settings.focusDistance
          });
        }

        // Exposure/focus lock
        if (settings.exposureLock && caps.exposureMode) {
          (caps as any).exposureMode = "manual";
        }

        if (advanced.length > 0) {
          await (videoTrack as any).applyConstraints({ advanced });
        }

        return true;
      } catch {
        return true; // Continue with software simulation even if hardware doesn't support
      }
    }
    return true;
  }, [onProSettingsChange]);

  const getProSettings = useCallback((): ProCameraSettings => {
    return proSettingsRef.current;
  }, []);

  const triggerTouchAEAF = useCallback(async (x: number, y: number): Promise<void> => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    // Normalize to 0-1 range
    const rect = video.getBoundingClientRect();
    const normalizedX = (x - rect.left) / rect.width;
    const normalizedY = (y - rect.top) / rect.height;

    setProSettingsState({
      ...proSettingsRef.current,
      touchAELock: true,
      touchAFPoint: { x: normalizedX, y: normalizedY }
    });

    // Try hardware touch AF/AE
    try {
      await (videoTrack as any).applyConstraints({
        advanced: [{
          pointsOfInterest: [{ x: normalizedX, y: normalizedY }]
        }]
      });
    } catch {
      // Fallback: software simulation handled by UI overlay
    }
  }, [setProSettings]);

  const resetProSettings = useCallback(() => {
    const defaults = defaultProSettings;
    proSettingsRef.current = defaults;
    setProSettingsState(defaults);
    onProSettingsChange?.(defaults);
  }, [onProSettingsChange]);

  // Histogram computation
  const computeHistogram = useCallback((): Uint32Array | null => {
    const video = videoRef.current;
    const canvas = histogramCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const histogram = new Uint32Array(256 * 4); // R, G, B, Luminance

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      histogram[r]++;           // R channel
      histogram[256 + g]++;     // G channel
      histogram[512 + b]++;     // B channel
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      histogram[768 + lum]++;    // Luminance
    }

    histogramRef.current = histogram;
    return histogram;
  }, []);

  // Render overlays (grid, level, etc.)
  const renderOverlay = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const settings = proSettingsRef.current;

    // Grid overlay
    if (settings.gridOverlay !== "none") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;

      if (settings.gridOverlay === "rule-of-thirds") {
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(width / 3, 0); ctx.lineTo(width / 3, height);
        ctx.moveTo(2 * width / 3, 0); ctx.lineTo(2 * width / 3, height);
        // Horizontal lines
        ctx.moveTo(0, height / 3); ctx.lineTo(width, height / 3);
        ctx.moveTo(0, 2 * height / 3); ctx.lineTo(width, 2 * height / 3);
        ctx.stroke();
      } else if (settings.gridOverlay === "golden-ratio") {
        const phi = 1.618;
        ctx.beginPath();
        ctx.moveTo(width / phi, 0); ctx.lineTo(width / phi, height);
        ctx.moveTo(width - width / phi, 0); ctx.lineTo(width - width / phi, height);
        ctx.moveTo(0, height / phi); ctx.lineTo(width, height / phi);
        ctx.moveTo(0, height - height / phi); ctx.lineTo(width, height - height / phi);
        ctx.stroke();
      } else if (settings.gridOverlay === "diagonal") {
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(width, height);
        ctx.moveTo(width, 0); ctx.lineTo(0, height);
        ctx.stroke();
      } else if (settings.gridOverlay === "square") {
        const size = Math.min(width, height) * 0.8;
        const x = (width - size) / 2;
        const y = (height - size) / 2;
        ctx.strokeRect(x, y, size, size);
      }
    }

    // Level indicator (device orientation simulation)
    if (settings.showLevel) {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.1;

      ctx.strokeStyle = "rgba(0, 255, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Touch AF point
    if (settings.touchAFPoint) {
      const px = settings.touchAFPoint.x * width;
      const py = settings.touchAFPoint.y * height;

      ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 30, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(px - 40, py); ctx.lineTo(px - 20, py);
      ctx.moveTo(px + 20, py); ctx.lineTo(px + 40, py);
      ctx.moveTo(px, py - 40); ctx.lineTo(px, py - 20);
      ctx.moveTo(px, py + 20); ctx.lineTo(px, py + 40);
      ctx.stroke();
    }
  }, []);

  // Start histogram animation loop
  useEffect(() => {
    const settings = proSettingsRef.current;
    if (!settings.showHistogram && !settings.showFocusPeaking && !settings.showZebraStripes) {
      if (histogramAnimationRef.current) {
        cancelAnimationFrame(histogramAnimationRef.current);
        histogramAnimationRef.current = null;
      }
      return;
    }

    const animate = () => {
      if (proSettingsRef.current.showHistogram) {
        const hist = computeHistogram();
        if (hist) onHistogramUpdate?.(hist);
      }
      histogramAnimationRef.current = requestAnimationFrame(animate);
    };

    histogramAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (histogramAnimationRef.current) {
        cancelAnimationFrame(histogramAnimationRef.current);
      }
    };
  }, [computeHistogram, onHistogramUpdate]);

  const setTorchEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    const stream = streamRef.current;
    if (!stream) return false;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return false;

    try {
      const caps = (videoTrack as any).getCapabilities?.();
      if (!caps?.torch) return false;
      await (videoTrack as any).applyConstraints({ advanced: [{ torch: enabled }] });
      return true;
    } catch {
      return false;
    }
  }, []);

  const setZoomLevel = useCallback(async (level: number): Promise<boolean> => {
    const stream = streamRef.current;
    if (!stream) return false;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return false;

    try {
      const caps = (videoTrack as any).getCapabilities?.();
      if (!caps?.zoom) return false;

      const { min = 1, max = 1 } = caps.zoom;
      const clampedLevel = Math.max(min, Math.min(max, level));

      await (videoTrack as any).applyConstraints({
        advanced: [{ zoom: clampedLevel }]
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      capturePhoto,
      recordVideo,
      stopRecording,
      isRecording: () => recording,
      supportsTorch,
      setTorchEnabled,
      setZoomLevel,
      setProSettings,
      getProSettings,
      supportsProSettings,
      triggerTouchAEAF,
      resetProSettings,
      getHistogram: () => histogramRef.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capturePhoto, recordVideo, stopRecording, recording, supportsTorch, setTorchEnabled, setZoomLevel, setProSettings, getProSettings, supportsProSettings, triggerTouchAEAF, resetProSettings],
  );

  return (
    <div className={className}>
      <video ref={videoRef} playsInline muted className={videoClassName} style={videoStyle} />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={histogramCanvasRef} className="hidden" />
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      {children}
    </div>
  );
});

export default CameraHost;