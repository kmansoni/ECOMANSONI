import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface HistogramData {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
}

interface ProHistogramProps {
  histogramData: Uint32Array | null;
  width?: number;
  height?: number;
  showRGB?: boolean;
  className?: string;
}

export function ProHistogram({
  histogramData,
  width = 200,
  height = 100,
  showRGB = false,
  className,
}: ProHistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !histogramData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, w, h);

    // Extract channels
    const red = new Array(256).fill(0);
    const green = new Array(256).fill(0);
    const blue = new Array(256).fill(0);
    const luminance = new Array(256).fill(0);

    const maxVal = Math.max(...Array.from(histogramData.slice(0, 256)),
                          ...Array.from(histogramData.slice(256, 512)),
                          ...Array.from(histogramData.slice(512, 768)));

    if (maxVal === 0) return;

    for (let i = 0; i < 256; i++) {
      red[i] = histogramData[i] / maxVal;
      green[i] = histogramData[256 + i] / maxVal;
      blue[i] = histogramData[512 + i] / maxVal;
      luminance[i] = histogramData[768 + i] / maxVal;
    }

    if (showRGB) {
      // Draw RGB channels with transparency
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      drawChannel(ctx, red, w, h);
      ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
      drawChannel(ctx, green, w, h);
      ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
      drawChannel(ctx, blue, w, h);
      ctx.globalAlpha = 1;
    } else {
      // Draw luminance
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      drawChannel(ctx, luminance, w, h);
    }
  }, [histogramData, showRGB]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={cn("rounded-lg border border-white/20", className)}
    />
  );
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  data: number[],
  w: number,
  h: number
) {
  ctx.beginPath();
  ctx.moveTo(0, h);

  for (let i = 0; i < data.length; i++) {
    const x = (i / 255) * w;
    const y = h - data[i] * h;
    if (i === 0) {
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

interface LevelIndicatorProps {
  tiltX?: number;
  tiltY?: number;
  className?: string;
}

export function LevelIndicator({ tiltX = 0, tiltY = 0, className }: LevelIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 10;

    ctx.clearRect(0, 0, w, h);

    // Outer circle
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner reference circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Level bubble (inverted from tilt for visual feedback)
    const bubbleX = cx - tiltX * radius * 0.5;
    const bubbleY = cy + tiltY * radius * 0.5;
    const clampedX = Math.max(radius * 0.3, Math.min(w - radius * 0.3, bubbleX));
    const clampedY = Math.max(radius * 0.3, Math.min(h - radius * 0.3, bubbleY));

    const isLevel = Math.abs(tiltX) < 0.05 && Math.abs(tiltY) < 0.05;
    ctx.fillStyle = isLevel ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 200, 0, 0.8)";
    ctx.beginPath();
    ctx.arc(clampedX, clampedY, 8, 0, Math.PI * 2);
    ctx.fill();
  }, [tiltX, tiltY]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={80}
      className={className}
    />
  );
}

interface ZebraStripesProps {
  width?: number;
  height?: number;
  threshold?: number; // 0-255, default 200
  className?: string;
}

export function ZebraStripesOverlay({
  width = 320,
  height = 240,
  threshold = 200,
  className,
}: ZebraStripesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoFrame, setVideoFrame] = useState<ImageData | null>(null);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas || video.readyState < 2) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Apply zebra stripes (diagonal pattern on overexposed areas)
    const stripeWidth = 8;
    let stripeIdx = 0;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);

        if (luminance >= threshold) {
          // Check if this pixel is on a zebra stripe
          const isStripe = ((x + y) % (stripeWidth * 2)) < stripeWidth;
          if (isStripe) {
            // Red diagonal stripes for overexposed
            data[i] = 255;
            data[i + 1] = Math.max(0, data[i + 1] - 50);
            data[i + 2] = Math.max(0, data[i + 2] - 50);
          }
        }
      }
      stripeIdx++;
    }

    ctx.putImageData(imageData, 0, canvas.height);
  }, [threshold]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={cn("absolute inset-0 w-full h-full pointer-events-none opacity-60", className)}
    />
  );
}
