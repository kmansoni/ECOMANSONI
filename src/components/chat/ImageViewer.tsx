import { useEffect, useRef, useCallback, useState } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SWIPE_DOWN_CLOSE_THRESHOLD = 100; // px — dismiss when not zoomed

export function ImageViewer({ src, alt = "Image", onClose }: ImageViewerProps) {
  // Transform state
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  // Swipe-down-to-close (only when scale === 1)
  const [dismissY, setDismissY] = useState(0);
  const [dismissOpacity, setDismissOpacity] = useState(1);

  // Refs for gesture tracking (avoid stale closures)
  const gestureRef = useRef({
    // Pinch
    isPinching: false,
    initialDistance: 0,
    initialScale: 1,
    // Pan
    isPanning: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    // Swipe-down dismiss
    isDismissing: false,
    dismissStartY: 0,
    // Current transform (mirrors state for RAF)
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const imgRef = useRef<HTMLImageElement>(null);

  // Keyboard handler
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Clamp pan so image doesn't go out of bounds
  const clampTranslate = useCallback((tx: number, ty: number, sc: number) => {
    const img = imgRef.current;
    if (!img) return { tx, ty };
    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth || rect.width;
    const naturalH = img.naturalHeight || rect.height;
    const displayW = Math.min(naturalW, window.innerWidth * 0.96);
    const displayH = Math.min(naturalH, window.innerHeight * 0.86);
    const maxTx = Math.max(0, (displayW * sc - displayW) / 2);
    const maxTy = Math.max(0, (displayH * sc - displayH) / 2);
    return {
      tx: Math.max(-maxTx, Math.min(maxTx, tx)),
      ty: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  }, []);

  // Touch event handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (e.touches.length === 2) {
      // Pinch start
      e.preventDefault();
      g.isPinching = true;
      g.isPanning = false;
      g.isDismissing = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      g.initialDistance = Math.hypot(dx, dy);
      g.initialScale = g.scale;
    } else if (e.touches.length === 1) {
      g.isPinching = false;
      g.lastX = e.touches[0].clientX;
      g.lastY = e.touches[0].clientY;
      g.startX = e.touches[0].clientX;
      g.startY = e.touches[0].clientY;

      if (g.scale <= 1) {
        // Potential swipe-down-to-close
        g.isDismissing = true;
        g.dismissStartY = e.touches[0].clientY;
      } else {
        g.isPanning = true;
        g.isDismissing = false;
      }
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (e.touches.length === 2 && g.isPinching) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, g.initialScale * (dist / g.initialDistance)));
      g.scale = newScale;
      if (newScale <= MIN_SCALE) {
        g.translateX = 0;
        g.translateY = 0;
      }
      setScale(newScale);
      setTranslateX(g.translateX);
      setTranslateY(g.translateY);
    } else if (e.touches.length === 1) {
      if (g.isDismissing && g.scale <= 1) {
        const dy = e.touches[0].clientY - g.dismissStartY;
        if (dy > 0) {
          const d = dy * 0.6; // resistance
          setDismissY(d);
          setDismissOpacity(Math.max(0.3, 1 - d / 300));
          return;
        } else {
          // Upward — cancel dismiss, start pan
          g.isDismissing = false;
          g.isPanning = true;
        }
      }

      if (g.isPanning && g.scale > 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - g.lastX;
        const dy = e.touches[0].clientY - g.lastY;
        g.lastX = e.touches[0].clientX;
        g.lastY = e.touches[0].clientY;
        const newTx = g.translateX + dx;
        const newTy = g.translateY + dy;
        const clamped = clampTranslate(newTx, newTy, g.scale);
        g.translateX = clamped.tx;
        g.translateY = clamped.ty;
        setTranslateX(clamped.tx);
        setTranslateY(clamped.ty);
      }
    }
  }, [clampTranslate]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (g.isDismissing) {
      if (dismissY >= SWIPE_DOWN_CLOSE_THRESHOLD) {
        onClose();
        return;
      }
      // Snap back
      setDismissY(0);
      setDismissOpacity(1);
      g.isDismissing = false;
    }

    if (g.isPinching && e.touches.length < 2) {
      g.isPinching = false;
      // Snap to MIN_SCALE if below
      if (g.scale < MIN_SCALE) {
        g.scale = MIN_SCALE;
        g.translateX = 0;
        g.translateY = 0;
        setScale(MIN_SCALE);
        setTranslateX(0);
        setTranslateY(0);
      }
    }

    if (e.touches.length === 0) {
      g.isPanning = false;
      g.isDismissing = false;
    }
  }, [dismissY, onClose]);

  // Double-tap to zoom/reset
  const lastTapRef = useRef(0);
  const onDoubleOrSingleTap = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_MS = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // Double tap
      const g = gestureRef.current;
      if (g.scale > 1) {
        // Reset
        g.scale = 1;
        g.translateX = 0;
        g.translateY = 0;
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
      } else {
        // Zoom to 2.5x at tap point
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const tapX = e.clientX - rect.left - rect.width / 2;
        const tapY = e.clientY - rect.top - rect.height / 2;
        const newScale = 2.5;
        const clamped = clampTranslate(-tapX * (newScale - 1), -tapY * (newScale - 1), newScale);
        g.scale = newScale;
        g.translateX = clamped.tx;
        g.translateY = clamped.ty;
        setScale(newScale);
        setTranslateX(clamped.tx);
        setTranslateY(clamped.ty);
      }
    } else if (e.target === e.currentTarget && gestureRef.current.scale <= 1) {
      // Single tap on backdrop when not zoomed → close
      onClose();
    }
    lastTapRef.current = now;
  }, [clampTranslate, onClose]);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = src;
    link.download = `image_${Date.now()}.jpg`;
    link.click();
  };

  return (
    <div
      className="fixed inset-0 bg-black z-[80] flex items-center justify-center overflow-hidden"
      style={{ opacity: dismissOpacity }}
    >
      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10 pointer-events-none">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20 pointer-events-auto"
        >
          <X className="w-6 h-6" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          className="text-white hover:bg-white/20 pointer-events-auto"
        >
          <Download className="w-5 h-5" />
        </Button>
      </div>

      {/* Image container — handles all gestures */}
      <div
        className="w-full h-full flex items-center justify-center"
        onClick={onDoubleOrSingleTap}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: "none" }}
      >
        <img loading="lazy"
          ref={imgRef}
          src={src}
          alt={alt}
          className="max-h-[calc(100vh-5rem)] max-w-[96vw] w-auto h-auto object-contain select-none"
          style={{
            transform: `translateY(${dismissY}px) translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transition: (dismissY === 0 && !gestureRef.current.isPinching && !gestureRef.current.isPanning)
              ? "transform 0.2s cubic-bezier(0.4,0,0.2,1)"
              : "none",
            cursor: scale > 1 ? "grab" : "zoom-in",
            willChange: "transform",
          }}
          draggable={false}
        />
      </div>

      {/* Scale indicator — shown only when zoomed */}
      {scale > 1.05 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}
