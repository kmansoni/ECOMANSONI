import React, { useRef, useEffect, useCallback, useState } from 'react';

interface DrawingCanvasProps {
  width: number;
  height: number;
  brushColor: string;
  brushSize: number;
  isActive: boolean;
  onDrawingChange: (dataUrl: string) => void;
  existingDataUrl?: string | null;
}

interface Point {
  x: number;
  y: number;
}

const BRUSH_COLORS = [
  '#FF3B30', // красный
  '#007AFF', // синий
  '#34C759', // зелёный
  '#FFD60A', // жёлтый
  '#FFFFFF', // белый
  '#000000', // чёрный
];

const BRUSH_SIZES = [2, 4, 8, 16];

export const DrawingCanvas: React.FC<DrawingCanvasProps & {
  selectedColor: string;
  selectedSize: number;
  onColorChange: (c: string) => void;
  onSizeChange: (s: number) => void;
  isEraser?: boolean;
}> = ({
  width,
  height,
  brushColor,
  brushSize,
  isActive,
  onDrawingChange,
  existingDataUrl,
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
  isEraser = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (existingDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = existingDataUrl;
    }
  }, [existingDataUrl, width, height]);

  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [width, height]);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isActive) return;
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPoint(e);
  }, [isActive, getPoint]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || !isActive || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const current = getPoint(e);
    const last = lastPoint.current!;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);

    // Quadratic bezier для плавных линий
    const midX = (last.x + current.x) / 2;
    const midY = (last.y + current.y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, midX, midY);

    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
    }

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.closePath();

    lastPoint.current = current;
  }, [isActive, getPoint, brushColor, brushSize, isEraser]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing.current || !canvasRef.current) return;
    isDrawing.current = false;
    lastPoint.current = null;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) ctx.globalCompositeOperation = 'source-over';
    onDrawingChange(canvasRef.current.toDataURL('image/png'));
  }, [onDrawingChange]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: 'none', cursor: isActive ? 'crosshair' : 'default' }}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
    />
  );
};

export const DrawingToolbar: React.FC<{
  selectedColor: string;
  selectedSize: number;
  isEraser: boolean;
  onColorChange: (c: string) => void;
  onSizeChange: (s: number) => void;
  onEraserToggle: () => void;
}> = ({ selectedColor, selectedSize, isEraser, onColorChange, onSizeChange, onEraserToggle }) => {
  const [customColor, setCustomColor] = useState(selectedColor);

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* Цвета */}
      <div className="flex items-center gap-2">
        {BRUSH_COLORS.map(color => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            className="rounded-full border-2 transition-transform"
            style={{
              width: 28,
              height: 28,
              backgroundColor: color,
              borderColor: selectedColor === color && !isEraser ? '#fff' : 'transparent',
              transform: selectedColor === color && !isEraser ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
        {/* Custom color */}
        <label className="relative cursor-pointer">
          <div
            className="w-7 h-7 rounded-full border-2 border-dashed border-white/60 flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: customColor }}
          >
            <span className="text-xs">+</span>
          </div>
          <input
            type="color"
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            value={customColor}
            onChange={e => { setCustomColor(e.target.value); onColorChange(e.target.value); }}
          />
        </label>

        {/* Ластик */}
        <button
          onClick={onEraserToggle}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
            isEraser ? 'border-white bg-white/20' : 'border-white/40 bg-transparent'
          }`}
        >
          <span className="text-sm">⌫</span>
        </button>
      </div>

      {/* Размер кисти */}
      <div className="flex items-center gap-3">
        {BRUSH_SIZES.map(size => (
          <button
            key={size}
            onClick={() => onSizeChange(size)}
            className="flex items-center justify-center transition-transform"
            style={{ transform: selectedSize === size ? 'scale(1.2)' : 'scale(1)' }}
          >
            <div
              className="rounded-full bg-white transition-all"
              style={{
                width: size + 4,
                height: size + 4,
                opacity: selectedSize === size ? 1 : 0.5,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default DrawingCanvas;
