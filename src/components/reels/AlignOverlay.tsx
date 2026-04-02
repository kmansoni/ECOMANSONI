/**
 * AlignOverlay — полупрозрачное наложение предыдущего кадра для Reels.
 * Canvas с предыдущим кадром + slider opacity + кнопка вкл/выкл.
 */

import { useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crosshair, Eye, EyeOff } from "lucide-react";
import { useReelsAlign } from "@/hooks/useReelsAlign";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

interface AlignOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function AlignOverlay({ videoRef }: AlignOverlayProps) {
  const {
    previousFrame,
    captureFrame,
    overlayOpacity,
    setOverlayOpacity,
    isAligning,
    startAlign,
    stopAlign,
  } = useReelsAlign();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Отрисовка предыдущего кадра на canvas
  useEffect(() => {
    if (!isAligning || !previousFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = previousFrame.width;
    canvas.height = previousFrame.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(previousFrame, 0, 0);
  }, [isAligning, previousFrame]);

  const handleCapture = useCallback(() => {
    if (videoRef.current) {
      void captureFrame(videoRef.current);
    }
  }, [videoRef, captureFrame]);

  const handleToggle = useCallback(() => {
    if (isAligning) {
      stopAlign();
    } else {
      startAlign();
    }
  }, [isAligning, startAlign, stopAlign]);

  return (
    <div className="relative w-full h-full">
      {/* Overlay canvas */}
      <AnimatePresence>
        {isAligning && previousFrame && (
          <motion.canvas
            key="align-canvas"
            ref={canvasRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: overlayOpacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
            style={{ opacity: overlayOpacity }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="absolute bottom-20 left-0 right-0 z-20 px-4">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md rounded-xl p-3">
          {/* Capture */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCapture}
            className="shrink-0 min-h-[44px] min-w-[44px] text-white hover:bg-white/20"
            aria-label="Захватить кадр для выравнивания"
          >
            <Crosshair className="w-5 h-5" />
          </Button>

          {/* Toggle */}
          <Button
            variant={isAligning ? "default" : "ghost"}
            size="sm"
            onClick={handleToggle}
            disabled={!previousFrame}
            className="shrink-0 min-h-[44px] min-w-[44px]"
            aria-label={isAligning ? "Выключить выравнивание" : "Включить выравнивание"}
          >
            {isAligning ? (
              <Eye className="w-5 h-5" />
            ) : (
              <EyeOff className="w-5 h-5" />
            )}
          </Button>

          {/* Opacity slider */}
          {isAligning && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex-1 flex items-center gap-2"
            >
              <Slider
                value={[overlayOpacity]}
                onValueChange={([v]) => setOverlayOpacity(v)}
                min={0.1}
                max={0.8}
                step={0.05}
                className="flex-1"
                aria-label="Прозрачность наложения"
              />
              <span className="text-xs text-white/60 w-8 text-right">
                {Math.round(overlayOpacity * 100)}%
              </span>
            </motion.div>
          )}
        </div>

        {/* Status */}
        {!previousFrame && (
          <p className="text-xs text-white/40 text-center mt-2">
            Нажмите ⊕ для захвата кадра
          </p>
        )}
      </div>
    </div>
  );
}
