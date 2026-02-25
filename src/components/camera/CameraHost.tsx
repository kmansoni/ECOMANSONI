import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export type CaptureMode = "story" | "reel";

export type CaptureProfile = {
  mode: CaptureMode;
  maxDurationMs: number;
  showTimeline: boolean;
  targetVideoBitsPerSecond: number;
};

export interface CameraHostHandle {
  capturePhoto: () => Promise<void>;
  recordVideo: () => Promise<void>;
  isRecording: () => boolean;
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

interface CameraHostProps {
  isActive: boolean;
  mode: CaptureMode;
  className?: string;
  videoClassName?: string;
  onReadyChange?: (ready: boolean) => void;
  onRecordingChange?: (recording: boolean) => void;
  onPhotoCaptured?: (file: File, previewUrl: string) => void;
  onVideoRecorded?: (file: File, previewUrl: string) => void;
  onError?: (error: unknown) => void;
  onDebugChange?: (snapshot: CameraDebugSnapshot) => void;
  children?: React.ReactNode;
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "environment",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: true,
};

const buildProfile = (mode: CaptureMode): CaptureProfile => {
  if (mode === "reel") {
    return {
      mode,
      maxDurationMs: 90_000,
      showTimeline: true,
      targetVideoBitsPerSecond: 4_000_000,
    };
  }

  return {
    mode,
    maxDurationMs: 15_000,
    showTimeline: false,
    targetVideoBitsPerSecond: 2_500_000,
  };
};

const pickSupportedMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
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
    className,
    videoClassName,
    onReadyChange,
    onRecordingChange,
    onPhotoCaptured,
    onVideoRecorded,
    onError,
    onDebugChange,
    children,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const recorderTimerRef = useRef<number | null>(null);

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
  });

  const profile = useMemo(() => buildProfile(mode), [mode]);
  const profileRef = useRef<CaptureProfile>(profile);
  const onErrorRef = useRef<CameraHostProps["onError"]>(onError);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

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
      const stream = await navigator.mediaDevices.getUserMedia(DEFAULT_CONSTRAINTS);
      streamRef.current = stream;
      await attachVideo();
      setReady(true);

      const videoTrack = stream.getVideoTracks()[0] ?? null;
      if (videoTrack) {
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
    if (video && video.srcObject) {
      const globalDebug = getCameraDebugGlobal();
      if (globalDebug) {
        globalDebug.detachCount += 1;
      }
      video.pause();
      video.srcObject = null;
    }

    const stream = streamRef.current;
    streamRef.current = null;
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
            videoBitsPerSecond: profileRef.current.targetVideoBitsPerSecond,
          }
        : {
            videoBitsPerSecond: profileRef.current.targetVideoBitsPerSecond,
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

  useImperativeHandle(
    ref,
    () => ({
      capturePhoto,
      recordVideo,
      isRecording: () => recording,
    }),
    [capturePhoto, recordVideo, recording],
  );

  return (
    <div className={className}>
      <video ref={videoRef} autoPlay playsInline muted className={videoClassName} />
      <canvas ref={canvasRef} className="hidden" />
      {children}
    </div>
  );
});

export default CameraHost;