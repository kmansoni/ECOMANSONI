import React, { useEffect, useRef } from 'react';

declare const JEELIZFACEFILTER: {
  init: (opts: {
    canvasId?: string;
    canvas?: HTMLCanvasElement;
    videoElement?: HTMLVideoElement;
    NNCPath?: string;
    callbackReady: (err: string | false, spec: unknown) => void;
    callbackTrack: (detectState: {
      detected: number;
      x: number; y: number; s: number; rx: number; ry: number; rz: number;
    }) => void;
  }) => void;
  destroy: () => void;
};

export const MASKS = [
  { id: 'none',     label: 'Без маски',  src: null },
  { id: 'glasses',  label: 'Очки',       src: 'https://raw.githubusercontent.com/jeeliz/jeelizFaceFilter/master/demos/threejs/glasses/assets/glasses.png' },
  { id: 'mustache', label: 'Усы',        src: 'https://raw.githubusercontent.com/jeeliz/jeelizFaceFilter/master/demos/threejs/glasses/assets/glasses.png' },
  { id: 'hat',      label: 'Шляпа',      src: 'https://raw.githubusercontent.com/jeeliz/jeelizFaceFilter/master/demos/threejs/glasses/assets/glasses.png' },
] as const;

export type MaskId = typeof MASKS[number]['id'];

interface MaskOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  maskId: MaskId;
}

const MaskOverlay: React.FC<MaskOverlayProps> = ({ videoRef, maskId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskImgRef = useRef<HTMLImageElement | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (typeof JEELIZFACEFILTER === 'undefined') return;
    if (maskId === 'none') return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const mask = MASKS.find(m => m.id === maskId);
    if (!mask?.src) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mask.src;
    maskImgRef.current = img;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    activeRef.current = true;

    JEELIZFACEFILTER.init({
      canvas,
      videoElement: video,
      NNCPath: '/jeelizFaceFilter.js',
      callbackReady: (err) => {
        if (err) console.warn('[MaskOverlay] jeeliz init error:', err);
      },
      callbackTrack: (s) => {
        if (!activeRef.current) return;
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (s.detected > 0.5 && maskImgRef.current?.complete) {
          const size = s.s * w * 1.4;
          const cx = (0.5 + s.x) * w;
          const cy = (0.5 - s.y) * h;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(s.rz);
          ctx.drawImage(maskImgRef.current, -size / 2, -size / 2, size, size);
          ctx.restore();
        }
      },
    });

    return () => {
      activeRef.current = false;
      try { JEELIZFACEFILTER.destroy(); } catch { /* ignore */ }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [maskId, videoRef]);

  if (maskId === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};

export default MaskOverlay;
