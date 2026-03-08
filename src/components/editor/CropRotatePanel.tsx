/**
 * CropRotatePanel — обрезка (свободная, 1:1, 4:5, 16:9) + поворот + отражение
 * Использует Canvas API для применения трансформаций
 */
import React, { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { FlipHorizontal, FlipVertical, RotateCcw } from "lucide-react";
import { type AspectRatio } from "./cropRotateModel";

const RATIOS: { label: string; value: AspectRatio; ratio?: number }[] = [
  { label: "Свободно", value: "free" },
  { label: "1:1", value: "1:1", ratio: 1 },
  { label: "4:5", value: "4:5", ratio: 4 / 5 },
  { label: "16:9", value: "16:9", ratio: 16 / 9 },
];

interface Props {
  imageUrl: string;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  aspectRatio: AspectRatio;
  onRotationChange: (deg: number) => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
}

export function CropRotatePanel({
  imageUrl,
  rotation,
  flipH,
  flipV,
  aspectRatio,
  onRotationChange,
  onFlipH,
  onFlipV,
  onAspectRatioChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -W / 2, -H / 2, W, H);
      ctx.restore();
    };
    img.src = imageUrl;
  }, [imageUrl, rotation, flipH, flipV]);

  useEffect(() => { draw(); }, [draw]);

  const getRatioStyle = (): React.CSSProperties => {
    const found = RATIOS.find((r) => r.value === aspectRatio);
    if (!found || !found.ratio) return {};
    return {};
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Canvas предпросмотр */}
      <div className="relative rounded-xl overflow-hidden bg-black flex items-center justify-center"
        style={{ aspectRatio: RATIOS.find(r => r.value === aspectRatio)?.ratio ?? "auto" }}>
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          className="w-full h-full object-contain"
        />
      </div>

      {/* Соотношения сторон */}
      <div className="flex gap-2 justify-center flex-wrap">
        {RATIOS.map((r) => (
          <button
            key={r.value}
            onClick={() => onAspectRatioChange(r.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
              aspectRatio === r.value
                ? "bg-primary text-white border-primary"
                : "bg-transparent text-white/70 border-white/20 hover:border-white/50",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Поворот */}
      <div className="flex items-center gap-3 px-2">
        <span className="text-xs text-white/60 w-16">Поворот</span>
        <Slider
          value={[rotation]}
          onValueChange={([v]) => onRotationChange(v)}
          min={-180}
          max={180}
          step={1}
          className="flex-1"
        />
        <span className="text-xs text-white/60 w-10 text-right">{rotation}°</span>
      </div>

      {/* Кнопки отражения */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={onFlipH}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-all",
            flipH ? "bg-primary/20 border-primary text-primary" : "border-white/20 text-white/70",
          )}
        >
          <FlipHorizontal className="w-4 h-4" />
          По горизонтали
        </button>
        <button
          onClick={onFlipV}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm transition-all",
            flipV ? "bg-primary/20 border-primary text-primary" : "border-white/20 text-white/70",
          )}
        >
          <FlipVertical className="w-4 h-4" />
          По вертикали
        </button>
        <button
          onClick={() => onRotationChange(0)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-white/70 text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Сброс
        </button>
      </div>
    </div>
  );
}
