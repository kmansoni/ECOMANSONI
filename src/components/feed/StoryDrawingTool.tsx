import { useRef, useEffect, useState } from "react";
import { X, Check, Undo2, Eraser, Pen } from "lucide-react";

type BrushMode = "pen" | "marker" | "neon" | "eraser";

interface StoryDrawingToolProps {
  width: number;
  height: number;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

const COLORS = [
  "#ffffff", "#ff0000", "#ff9500", "#ffcc00", "#4cd964",
  "#5ac8fa", "#007aff", "#5856d6", "#ff2d55", "#000000",
];

export function StoryDrawingTool({ width, height, onSave, onClose }: StoryDrawingToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<BrushMode>("pen");
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState(4);
  const [history, setHistory] = useState<ImageData[]>([]);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
  }, [width, height]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    setHistory((prev) => [...prev.slice(-20), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    saveHistory();
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);

    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (mode === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = size * 4;
    } else if (mode === "neon") {
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.globalAlpha = 0.9;
    } else if (mode === "marker") {
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = size * 3;
      ctx.globalAlpha = 0.4;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.globalAlpha = 1;
    }

    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory((h) => h.slice(0, -1));
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top controls */}
      <div className="flex items-center justify-between px-4 py-3 z-10">
        <button onClick={onClose} className="text-white">
          <X className="w-6 h-6" />
        </button>
        <div className="flex gap-3">
          {(["pen", "marker", "neon", "eraser"] as BrushMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs ${mode === m ? "bg-white text-black" : "bg-zinc-800 text-white"}`}
            >
              {m === "pen" ? "Перо" : m === "marker" ? "Маркер" : m === "neon" ? "Неон" : "Ластик"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={undo} className="text-white">
            <Undo2 className="w-5 h-5" />
          </button>
          <button onClick={handleSave} className="text-white">
            <Check className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", touchAction: "none" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>

      {/* Bottom: color + size */}
      <div className="px-4 pb-8 space-y-3">
        <input
          type="range"
          min={1}
          max={20}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-full accent-white"
        />
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full flex-shrink-0 border-2 ${color === c ? "border-white scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
