import { useCallback, useEffect, useRef, useState } from "react";

const FRAME_COUNT = 15;
const CAPTURE_FPS = 10;
const PLAYBACK_FPS = 24;
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1280;

export interface BoomerangComposerProps {
  stream: MediaStream | null;
  onCapture: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
}

type State = "idle" | "countdown" | "capturing" | "processing" | "preview";

export function BoomerangComposer({ stream, onCapture, onCancel }: BoomerangComposerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageData[]>([]);
  const rafRef = useRef<number>(0);
  const unmountedRef = useRef(false);
  
  const [state, setState] = useState<State>("idle");
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  const startCapture = useCallback(async () => {
    setState("capturing");
    framesRef.current = [];
    const interval = 1000 / CAPTURE_FPS;
    let captured = 0;

    const captureNext = () => {
      if (captured >= FRAME_COUNT) {
        processBoomerang();
        return;
      }
      const frame = captureFrame();
      if (frame) {
        framesRef.current.push(frame);
        captured++;
        setProgress(Math.round((captured / FRAME_COUNT) * 100));
      }
      setTimeout(captureNext, interval);
    };

    captureNext();
  }, [captureFrame]);

  const processBoomerang = useCallback(async () => {
    setState("processing");
    const frames = framesRef.current;
    if (frames.length === 0) {
      setState("idle");
      return;
    }

    const boomerangFrames = [
      ...frames,
      ...[...frames].reverse().slice(1, -1),
    ];

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    try {
      const captureStream = canvas.captureStream(PLAYBACK_FPS);
      const recorder = new MediaRecorder(captureStream, {
        mimeType: "video/webm;codecs=vp8",
        videoBitsPerSecond: 2_000_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.start();

      let frameIdx = 0;
      const frameInterval = 1000 / PLAYBACK_FPS;

      const renderFrame = () => {
        if (unmountedRef.current || frameIdx >= boomerangFrames.length) {
          recorder.stop();
          return;
        }
        ctx.putImageData(boomerangFrames[frameIdx], 0, 0);
        frameIdx++;
        setTimeout(renderFrame, frameInterval);
      };

      renderFrame();

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState("preview");
        animatePreview(boomerangFrames);
      };
    } catch {
      canvas.toBlob((blob) => {
        if (!blob) { setState("idle"); return; }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState("preview");
      }, "image/jpeg", 0.9);
    }
  }, []);

  const animatePreview = useCallback((frames: ImageData[]) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let idx = 0;
    let forward = true;

    const tick = () => {
      ctx.putImageData(frames[idx], 0, 0);
      if (forward) {
        idx++;
        if (idx >= frames.length) { forward = false; idx = frames.length - 2; }
      } else {
        idx--;
        if (idx < 0) { forward = true; idx = 1; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleStart = useCallback(() => {
    setState("countdown");
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(timer);
        startCapture();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [startCapture]);

  const handleConfirm = useCallback(() => {
    if (!previewUrl) return;
    fetch(previewUrl)
      .then((r) => r.blob())
      .then((blob) => onCapture(blob, previewUrl));
  }, [previewUrl, onCapture]);

  const handleRetry = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    framesRef.current = [];
    setProgress(0);
    setState("idle");
  }, [previewUrl]);

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" />

      {state !== "preview" && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {state === "preview" && (
        <canvas
          ref={previewCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-between p-4 z-10">
        {state === "countdown" && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-white text-8xl font-bold">{countdown}</span>
          </div>
        )}

        {state === "capturing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-white text-sm">Capturing...</span>
          </div>
        )}

        <div className="flex gap-4 w-full">
          {state === "idle" && (
            <>
              <button onClick={onCancel} className="flex-1 px-4 py-2 border border-white/30 text-white rounded">Cancel</button>
              <button onClick={handleStart} className="flex-1 px-4 py-2 bg-yellow-400 text-black rounded">Boomerang</button>
            </>
          )}

          {state === "preview" && (
            <>
              <button onClick={handleRetry} className="flex-1 px-4 py-2 border border-white/30 text-white rounded">Retry</button>
              <button onClick={handleConfirm} className="flex-1 px-4 py-2 bg-white text-black rounded">Use</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}